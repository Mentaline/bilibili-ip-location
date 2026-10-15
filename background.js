importScripts('lib/md5.js')

const STORAGE_KEY = 'biliIpAuth'
const PROFILE_CACHE_TTL = 10 * 60 * 1000
const QR_HEADER_RULE_ID = 1

const LOGIN_CLIENT = Object.freeze({
  appkey: '783bbb7264451d82',
  appsec: '2653583c8873dea268ab9386918b1d65',
  build: '6720300',
})

const APP_CLIENT = Object.freeze({
  appkey: '1d8b6e7d45233436',
  appsec: '560c52ccd288fed045859ed18bffd973',
  build: '6720300',
})

const profileCache = new Map()
let qrHeaderRulePromise

function ensureQrRequestHeaders() {
  if (qrHeaderRulePromise) return qrHeaderRulePromise

  qrHeaderRulePromise = (async () => {
    const rules = await chrome.declarativeNetRequest.getSessionRules()
    if (rules.some((rule) => rule.id === QR_HEADER_RULE_ID)) return

    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [QR_HEADER_RULE_ID],
      addRules: [
        {
          id: QR_HEADER_RULE_ID,
          priority: 1,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              { header: 'Origin', operation: 'remove' },
              { header: 'Referer', operation: 'remove' },
            ],
          },
          condition: {
            regexFilter:
              '^https://passport\\.bilibili\\.com/x/passport-tv-login/qrcode/(auth_code|poll)$',
            initiatorDomains: [chrome.runtime.id],
            requestMethods: ['post'],
            resourceTypes: ['xmlhttprequest', 'other'],
          },
        },
      ],
    })
  })().catch((error) => {
    qrHeaderRulePromise = undefined
    throw error
  })

  return qrHeaderRulePromise
}

function unixSeconds() {
  return Math.floor(Date.now() / 1000).toString()
}

function signParams(values, secret) {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value))
    }
  }

  params.sort()
  params.set('sign', md5(params.toString() + secret))
  return params
}

function loginParams(extra = {}) {
  return signParams(
    {
      ...extra,
      appkey: LOGIN_CLIENT.appkey,
      build: LOGIN_CLIENT.build,
      c_locale: 'zh-Hans_CN',
      channel: 'website',
      local_id: '0',
      mobi_app: 'android',
      platform: 'android',
      s_locale: 'zh-Hans_CN',
      ts: unixSeconds(),
    },
    LOGIN_CLIENT.appsec,
  )
}

async function postForm(url, body) {
  await ensureQrRequestHeaders()
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body,
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return response.json()
}

async function startAuthorization() {
  const result = await postForm(
    'https://passport.bilibili.com/x/passport-tv-login/qrcode/auth_code',
    loginParams(),
  )

  if (result?.code !== 0 || !result?.data?.auth_code || !result?.data?.url) {
    return {
      ok: false,
      code: result?.code ?? -1,
      message: result?.message || '无法取得授权二维码',
    }
  }

  return {
    ok: true,
    authCode: result.data.auth_code,
    url: result.data.url,
  }
}

function calculateExpiry(expiresIn) {
  const parsed = Number(expiresIn)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0

  if (parsed > 1_000_000_000_000) return parsed
  if (parsed > 1_000_000_000) return parsed * 1000
  return Date.now() + parsed * 1000
}

function isAuthorizationExpired(auth) {
  const expiresAt = Number(auth?.expiresAt || 0)
  return expiresAt > 0 && expiresAt <= Date.now()
}

async function pollAuthorization(authCode) {
  if (typeof authCode !== 'string' || !/^[a-f0-9]{32}$/i.test(authCode)) {
    return { ok: false, code: -400, message: '授权码格式无效' }
  }

  const result = await postForm(
    'https://passport.bilibili.com/x/passport-tv-login/qrcode/poll',
    loginParams({ auth_code: authCode }),
  )

  if (result?.code !== 0) {
    return {
      ok: false,
      code: result?.code ?? -1,
      message: result?.message || '等待手机确认',
    }
  }

  const accessToken = result?.data?.access_token
  if (typeof accessToken !== 'string' || accessToken.length < 16) {
    return { ok: false, code: -1, message: '授权响应中没有有效令牌' }
  }

  const auth = {
    accessToken,
    expiresAt: calculateExpiry(result.data.expires_in),
    mid: String(result.data.mid || ''),
    authorizedAt: Date.now(),
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: auth })
  profileCache.clear()

  return {
    ok: true,
    mid: auth.mid,
    expiresAt: auth.expiresAt,
  }
}

async function getAuthorizationStatus() {
  const stored = await chrome.storage.local.get(STORAGE_KEY)
  const auth = stored[STORAGE_KEY]
  const expired = isAuthorizationExpired(auth)
  if (expired) {
    await chrome.storage.local.remove(STORAGE_KEY)
    profileCache.clear()
  }

  const authorized =
    !expired && typeof auth?.accessToken === 'string' && auth.accessToken.length >= 16

  return {
    ok: true,
    authorized,
    mid: authorized ? String(auth.mid || '') : '',
    expiresAt: authorized ? Number(auth.expiresAt || 0) : 0,
  }
}

async function clearAuthorization() {
  await chrome.storage.local.remove(STORAGE_KEY)
  profileCache.clear()
  return { ok: true }
}

function extractProfileLocation(payload) {
  const card = payload?.data?.card
  if (!card) return ''

  const tags = [
    ...(Array.isArray(card.space_tag) ? card.space_tag : []),
    ...(Array.isArray(card.space_tag_bottom) ? card.space_tag_bottom : []),
  ]

  const locationTag = tags.find((tag) => tag?.type === 'location')
  const title = locationTag?.title
  return typeof title === 'string' ? title.trim().slice(0, 80) : ''
}

async function fetchProfileLocation(mid) {
  const normalizedMid = String(mid || '')
  if (!/^\d{1,20}$/.test(normalizedMid)) {
    return { ok: false, status: 'invalid_mid' }
  }

  const stored = await chrome.storage.local.get(STORAGE_KEY)
  const auth = stored[STORAGE_KEY]
  if (typeof auth?.accessToken !== 'string' || auth.accessToken.length < 16) {
    return { ok: false, status: 'authorization_required' }
  }
  if (isAuthorizationExpired(auth)) {
    await chrome.storage.local.remove(STORAGE_KEY)
    profileCache.clear()
    return { ok: false, status: 'authorization_expired' }
  }

  const cached = profileCache.get(normalizedMid)
  if (cached && Date.now() - cached.cachedAt < PROFILE_CACHE_TTL) {
    return cached.value
  }

  const params = signParams(
    {
      access_key: auth.accessToken,
      appkey: APP_CLIENT.appkey,
      build: APP_CLIENT.build,
      mobi_app: 'android',
      platform: 'android',
      ts: unixSeconds(),
      vmid: normalizedMid,
    },
    APP_CLIENT.appsec,
  )

  const response = await fetch(`https://app.bilibili.com/x/v2/space?${params.toString()}`, {
    method: 'GET',
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
  })

  if (!response.ok) {
    return { ok: false, status: 'network_error', httpStatus: response.status }
  }

  const result = await response.json()
  if (result?.code !== 0) {
    if ([-101, -663].includes(result?.code)) {
      await chrome.storage.local.remove(STORAGE_KEY)
      profileCache.clear()
      return { ok: false, status: 'authorization_expired', code: result.code }
    }

    return {
      ok: false,
      status: 'api_error',
      code: result?.code ?? -1,
      message: result?.message || '',
    }
  }

  const location = extractProfileLocation(result)
  const value = location
    ? { ok: true, status: 'found', location }
    : { ok: true, status: 'not_available', location: '' }

  profileCache.set(normalizedMid, { cachedAt: Date.now(), value })
  return value
}

const handlers = {
  'auth:start': startAuthorization,
  'auth:poll': (message) => pollAuthorization(message.authCode),
  'auth:status': getAuthorizationStatus,
  'auth:clear': clearAuthorization,
  'profile:location': (message) => fetchProfileLocation(message.mid),
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.source !== 'bili-ip-location' || !handlers[message.type]) return false

  Promise.resolve(handlers[message.type](message))
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        ok: false,
        status: 'internal_error',
        message: error instanceof Error ? error.message : '未知错误',
      })
    })

  return true
})
