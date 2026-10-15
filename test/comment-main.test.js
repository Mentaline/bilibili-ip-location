import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'comment-main.js'), 'utf8')
const ACTION_BUTTON_TAG = 'bili-comment-action-buttons-renderer'

function load(context) {
  runInNewContext(source, context, { filename: 'comment-main.js' })
}

test('installer swallows a throw from a missing host API', () => {
  assert.doesNotThrow(() => load({ window: {} }))
})

test('patched comment update keeps the host result when rendering throws', async () => {
  class MutationObserver {
    observe() {}
    disconnect() {}
  }

  function Element() {}
  Element.prototype.attachShadow = function attachShadow() {
    return {}
  }

  const document = {
    querySelectorAll() {
      return []
    },
  }
  const defined = new Map()
  const window = {
    customElements: {
      define(name, constructor) {
        defined.set(name, constructor)
      },
      get(name) {
        return defined.get(name)
      },
    },
  }

  load({ window, document, Element, MutationObserver })
  await new Promise((resolve) => setImmediate(resolve))

  class ActionButtons {
    update() {
      return 'host-result'
    }
  }

  window.customElements.define(ACTION_BUTTON_TAG, ActionButtons)

  let shadowReads = 0
  const element = {}
  Object.defineProperty(element, 'shadowRoot', {
    get() {
      shadowReads += 1
      throw new Error('bilibili dom changed')
    },
  })

  assert.equal(ActionButtons.prototype.update.call(element), 'host-result')
  assert.equal(shadowReads, 1)
  assert.throws(() => {
    class BrokenHost {
      update() {
        throw new Error('host update failed')
      }
    }
    window.customElements.define(ACTION_BUTTON_TAG, BrokenHost)
    new BrokenHost().update()
  }, /host update failed/)
})
