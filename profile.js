(() => {
  'use strict'

  const BADGE_SELECTOR = '[data-bili-ip-location="profile"]'
  const HEADER_SELECTORS = [
    '.upinfo__main .upinfo-detail__top',
    '.upinfo-detail__top',
    '.h-inner .h-basic > div',
    '.h-basic > div',
    '.h-basic',
  ]

  function getMid() {
    return location.pathname.match(/^\/(\d{1,20})(?:\/|$)/)?.[1] || ''
  }

  function normalizeLocation(value) {
    if (typeof value !== 'string') return ''
    const locationText = value.trim().slice(0, 80)
    if (!locationText) return ''
    return /IP\s*属地/.test(locationText) ? locationText : `IP属地：${locationText}`
  }

  function findHeader() {
    for (const selector of HEADER_SELECTORS) {
      const element = document.querySelector(selector)
      if (element instanceof HTMLElement) return element
    }
    return null
  }

  function insertBadge(text, state, mid) {
    const header = findHeader()
    if (!header) return false

    document.querySelectorAll(BADGE_SELECTOR).forEach((element) => element.remove())

    const badge = document.createElement('span')
    badge.dataset.biliIpLocation = 'profile'
    badge.dataset.state = state
    badge.dataset.mid = mid
    badge.textContent = text
    badge.title =
      state === 'authorization-required'
        ? '点击浏览器工具栏中的“B站 IP 属地”扩展图标，扫码启用个人主页属地'
        : 'B站移动端个人空间接口提供的 IP 属地'
    badge.setAttribute('aria-label', badge.title)
    header.appendChild(badge)
    return true
  }

  function waitAndInsert(text, state, mid) {
    if (insertBadge(text, state, mid)) return

    const observer = new MutationObserver(() => {
      if (insertBadge(text, state, mid)) observer.disconnect()
    })

    observer.observe(document.documentElement, { childList: true, subtree: true })
    setTimeout(() => observer.disconnect(), 20_000)
  }

  async function requestLocation(mid) {
    try {
      return await chrome.runtime.sendMessage({
        source: 'bili-ip-location',
        type: 'profile:location',
        mid,
      })
    } catch {
      return { ok: false, status: 'extension_unavailable' }
    }
  }

  async function main() {
    const mid = getMid()
    if (!mid) return

    const response = await requestLocation(mid)
    if (response?.ok && response.status === 'found') {
      const locationText = normalizeLocation(response.location)
      if (locationText) waitAndInsert(locationText, 'ready', mid)
      return
    }

    if (
      response?.status === 'authorization_required' ||
      response?.status === 'authorization_expired'
    ) {
      waitAndInsert('IP属地：需扫码启用', 'authorization-required', mid)
    }
  }

  main()
})()
