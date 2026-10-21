(() => {
  'use strict'

  const INSTALL_MARK = Symbol.for('bili-ip-location.installed')
  const PATCH_MARK = Symbol.for('bili-ip-location.patched')
  const ACTION_BUTTON_TAG = 'bili-comment-action-buttons-renderer'
  const COMMENT_TAG_SELECTOR = [
    'bili-comments',
    'bili-comment-thread-renderer',
    'bili-comment-renderer',
    'bili-comment-replies-renderer',
    'bili-comment-reply-renderer',
    ACTION_BUTTON_TAG,
  ].join(',')

  if (window[INSTALL_MARK]) return
  window[INSTALL_MARK] = true

  const observedRoots = new WeakSet()
  const pendingRoots = new Set()
  let scanScheduled = false

  function sanitizeLocation(value) {
    if (typeof value !== 'string') return ''
    return value.trim().slice(0, 80)
  }

  function getLocation(reply) {
    return sanitizeLocation(
      reply?.reply_control?.location ||
        reply?.data?.reply_control?.location ||
        reply?.__data?.reply_control?.location,
    )
  }

  function renderActionButtons(element) {
    const root = element?.shadowRoot
    if (!root) return

    const location = getLocation(element)
    const current = root.querySelector('[data-bili-ip-location="comment"]')

    if (!location) {
      current?.remove()
      return
    }

    const nativeLocation = root.querySelector('#location:not([data-bili-ip-location])')
    if (nativeLocation?.textContent?.trim()) {
      current?.remove()
      return
    }

    if (current) {
      if (current.textContent !== location) current.textContent = location
      return
    }

    const publishTime = root.querySelector('#pubdate')
    if (!publishTime) return

    const locationElement = document.createElement('div')
    locationElement.dataset.biliIpLocation = 'comment'
    locationElement.textContent = location
    locationElement.title = 'B站移动端提供的 IP 属地'
    locationElement.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'flex:none',
      'margin-right:12px',
      'color:#9499a0',
      'font-size:13px',
      'font-weight:400',
      'line-height:18px',
      'white-space:nowrap',
    ].join(';')

    publishTime.insertAdjacentElement('afterend', locationElement)
  }

  function patchActionButtonsConstructor(Constructor) {
    if (typeof Constructor !== 'function' || Constructor[PATCH_MARK]) return Constructor

    const originalUpdate = Constructor.prototype?.update
    if (typeof originalUpdate !== 'function') return Constructor

    Object.defineProperty(Constructor, PATCH_MARK, { value: true })
    Constructor.prototype.update = function (...args) {
      const result = Reflect.apply(originalUpdate, this, args)
      try {
        renderActionButtons(this)
      } catch {}
      return result
    }

    return Constructor
  }

  function hookCustomElements() {
    const registry = window.customElements
    if (!registry?.define || registry.define[PATCH_MARK]) return

    const originalDefine = registry.define
    const wrappedDefine = new Proxy(originalDefine, {
      apply(target, thisArg, args) {
        const [name, Constructor, ...rest] = args
        const PatchedConstructor =
          name === ACTION_BUTTON_TAG
            ? patchActionButtonsConstructor(Constructor)
            : Constructor

        return Reflect.apply(target, thisArg, [name, PatchedConstructor, ...rest])
      },
    })

    Object.defineProperty(wrappedDefine, PATCH_MARK, { value: true })
    registry.define = wrappedDefine

    const existing = registry.get(ACTION_BUTTON_TAG)
    if (existing) patchActionButtonsConstructor(existing)
  }

  function escapeHtml(value) {
    return value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[character],
    )
  }

  function injectLegacyHtml(html, reply) {
    const location = getLocation(reply)
    if (typeof html !== 'string' || !location || html.includes('data-bili-ip-location')) {
      return html
    }

    const safeLocation = escapeHtml(location)
    const locationHtml =
      '<span data-bili-ip-location="legacy" style="margin-left:10px;color:#9499a0">' +
      safeLocation +
      '</span>'

    if (/<span class="reply-time">/.test(html)) {
      return html.replace(/(<span class="reply-time">.*?<\/span>)/, `$1${locationHtml}`)
    }

    if (/<span class="time">/.test(html)) {
      return html.replace(/(<span class="time">.*?<\/span>)/, `$1${locationHtml}`)
    }

    return html
  }

  function patchLegacyConstructor(Constructor) {
    if (typeof Constructor !== 'function' || Constructor[PATCH_MARK]) return
    Object.defineProperty(Constructor, PATCH_MARK, { value: true })

    for (const methodName of ['_createListCon', '_createSubReplyItem']) {
      const original = Constructor.prototype?.[methodName]
      if (typeof original !== 'function' || original[PATCH_MARK]) continue

      const wrapped = function (...args) {
        return injectLegacyHtml(Reflect.apply(original, this, args), args[0])
      }
      Object.defineProperty(wrapped, PATCH_MARK, { value: true })
      Constructor.prototype[methodName] = wrapped
    }
  }

  function hookLegacyComments() {
    if (typeof window.bbComment === 'function') {
      patchLegacyConstructor(window.bbComment)
      return
    }

    const descriptor = Object.getOwnPropertyDescriptor(window, 'bbComment')
    if (descriptor && !descriptor.configurable) return

    let currentValue
    Object.defineProperty(window, 'bbComment', {
      configurable: true,
      enumerable: descriptor?.enumerable ?? true,
      get() {
        return currentValue
      },
      set(value) {
        currentValue = value
        patchLegacyConstructor(value)
      },
    })
  }

  function getVueReply(element) {
    const props =
      element?.__vue__?.vnode?.props ||
      element?.__vueParentComponent?.props ||
      element?.__vueParentComponent?.vnode?.props

    if (!props) return undefined
    return element.className.startsWith('sub') ? props.subReply : props.reply
  }

  function renderVueReply(element) {
    if (!(element instanceof HTMLElement)) return
    if (element.querySelector('[data-bili-ip-location="vue"]')) return

    const location = getLocation(getVueReply(element))
    if (!location) return

    const info = element.className.startsWith('sub')
      ? element.querySelector('.sub-reply-info')
      : element.querySelector('.reply-info')
    const time = info?.querySelector('.reply-time, .time') || info?.firstElementChild
    if (!time) return

    const locationElement = document.createElement('span')
    locationElement.dataset.biliIpLocation = 'vue'
    locationElement.textContent = location
    locationElement.style.cssText = 'margin-left:10px;color:#9499a0;white-space:nowrap'
    time.insertAdjacentElement('afterend', locationElement)
  }

  function observeRoot(root) {
    if (!root || observedRoots.has(root)) return
    observedRoots.add(root)

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) scheduleScan(node)
      }
    })

    observer.observe(root, { childList: true, subtree: true })
  }

  function scanRoot(root) {
    if (!root?.querySelectorAll) return

    const commentElements = []
    if (root instanceof Element && root.matches(COMMENT_TAG_SELECTOR)) {
      commentElements.push(root)
    }
    commentElements.push(...root.querySelectorAll(COMMENT_TAG_SELECTOR))

    for (const element of commentElements) {
      if (element.localName === ACTION_BUTTON_TAG) renderActionButtons(element)
      if (element.shadowRoot) {
        observeRoot(element.shadowRoot)
        scanRoot(element.shadowRoot)
      }
    }

    const vueReplies = []
    if (root instanceof Element && root.matches('.reply-item, .sub-reply-item')) {
      vueReplies.push(root)
    }
    vueReplies.push(...root.querySelectorAll('.reply-item, .sub-reply-item'))
    vueReplies.forEach(renderVueReply)
  }

  function scheduleScan(root) {
    if (!root) return
    pendingRoots.add(root)
    if (scanScheduled) return

    scanScheduled = true
    queueMicrotask(() => {
      scanScheduled = false
      const roots = [...pendingRoots]
      pendingRoots.clear()
      roots.forEach(scanRoot)
    })
  }

  function hookShadowRoots() {
    const originalAttachShadow = Element.prototype.attachShadow
    if (typeof originalAttachShadow !== 'function' || originalAttachShadow[PATCH_MARK]) return

    const wrapped = function (init) {
      const root = Reflect.apply(originalAttachShadow, this, [init])
      if (this.localName === 'bili-comments' || this.localName.startsWith('bili-comment')) {
        observeRoot(root)
        scheduleScan(root)
      }
      return root
    }

    Object.defineProperty(wrapped, PATCH_MARK, { value: true })
    Element.prototype.attachShadow = wrapped
  }

  try {
    hookCustomElements()
    hookLegacyComments()
    hookShadowRoots()
    observeRoot(document)
    scheduleScan(document)
  } catch {}
})()
