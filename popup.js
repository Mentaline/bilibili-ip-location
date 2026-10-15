(() => {
  'use strict'

  const profileStatus = document.querySelector('#profile-status')
  const authorizeView = document.querySelector('#authorize-view')
  const authorizedView = document.querySelector('#authorized-view')
  const qrView = document.querySelector('#qr-view')
  const qrCode = document.querySelector('#qr-code')
  const qrMessage = document.querySelector('#qr-message')
  const errorMessage = document.querySelector('#error-message')
  const authorizeButton = document.querySelector('#authorize-button')
  const refreshButton = document.querySelector('#refresh-button')
  const clearButton = document.querySelector('#clear-button')

  let pollTimer = 0
  let pollInFlight = false
  let currentAuthCode = ''

  function send(type, extra = {}) {
    return chrome.runtime.sendMessage({
      source: 'bili-ip-location',
      type,
      ...extra,
    })
  }

  function stopPolling() {
    if (pollTimer) window.clearInterval(pollTimer)
    pollTimer = 0
  }

  function showError(message = '') {
    errorMessage.textContent = message
    errorMessage.hidden = !message
  }

  function setAuthorized(authorized) {
    profileStatus.textContent = authorized ? '已启用' : '需扫码'
    profileStatus.dataset.state = authorized ? 'ready' : 'required'
    authorizeView.hidden = authorized
    authorizedView.hidden = !authorized
    if (authorized) qrView.hidden = true
  }

  function renderQr(url) {
    const code = qrcode(0, 'M')
    code.addData(url)
    code.make()
    qrCode.innerHTML = code.createSvgTag({ scalable: true, margin: 2 })
  }

  function pollMessage(code, message) {
    if (code === 86090) return '已扫码，请在手机端确认'
    if (code === 86039) return '请用手机哔哩哔哩“扫一扫”'
    if (code === 86038) return '二维码已过期，正在刷新…'
    return message || '等待手机确认…'
  }

  async function pollOnce() {
    if (!currentAuthCode || pollInFlight) return
    pollInFlight = true

    try {
      const result = await send('auth:poll', { authCode: currentAuthCode })
      if (result?.ok) {
        stopPolling()
        currentAuthCode = ''
        showError('')
        setAuthorized(true)
        return
      }

      qrMessage.textContent = pollMessage(result?.code, result?.message)
      if (result?.code === 86038) await startAuthorization()
      else if (![-1, 86039, 86090].includes(result?.code)) showError(result?.message)
    } catch {
      showError('网络请求失败，请稍后重试。')
    } finally {
      pollInFlight = false
    }
  }

  async function startAuthorization() {
    stopPolling()
    showError('')
    authorizeView.hidden = true
    authorizeButton.disabled = true
    refreshButton.disabled = true
    qrMessage.textContent = '正在生成二维码…'
    qrView.hidden = false

    try {
      const result = await send('auth:start')
      if (!result?.ok) throw new Error(result?.message || '无法生成二维码')

      currentAuthCode = result.authCode
      renderQr(result.url)
      qrMessage.textContent = '请用手机哔哩哔哩“扫一扫”'
      pollTimer = window.setInterval(pollOnce, 2500)
    } catch (error) {
      authorizeView.hidden = false
      qrView.hidden = true
      showError(error instanceof Error ? error.message : '无法生成二维码')
    } finally {
      authorizeButton.disabled = false
      refreshButton.disabled = false
    }
  }

  async function clearAuthorization() {
    clearButton.disabled = true
    try {
      await send('auth:clear')
      setAuthorized(false)
      showError('')
    } catch {
      showError('清除失败，请重新打开扩展后再试。')
    } finally {
      clearButton.disabled = false
    }
  }

  async function initialize() {
    try {
      const status = await send('auth:status')
      setAuthorized(Boolean(status?.authorized))
    } catch {
      profileStatus.textContent = '状态读取失败'
      profileStatus.dataset.state = 'required'
      authorizeView.hidden = false
      showError('扩展后台未响应，请在扩展管理页重新加载。')
    }
  }

  authorizeButton.addEventListener('click', startAuthorization)
  refreshButton.addEventListener('click', startAuthorization)
  clearButton.addEventListener('click', clearAuthorization)
  window.addEventListener('unload', stopPolling)
  initialize()
})()
