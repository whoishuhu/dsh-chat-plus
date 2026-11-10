import { test } from 'node:test'
import assert from 'node:assert/strict'
import { railLabels, railSelectors } from '../lib/turn-rail.js'

test('turn rail selectors match official localized navigation labels', () => {
  const selectors = railSelectors(7)
  assert.equal(selectors.length, 8)
  assert.ok(selectors.includes('nav[aria-label="Turn navigation"] button[aria-label="Jump to turn 7"]'))
  assert.ok(selectors.includes('nav[aria-label="回合导航"] button[aria-label="跳转到第 7 轮"]'))
  assert.ok(selectors.includes('nav[aria-label="ターン ナビゲーション"] button[aria-label="ターン 7 へ移動"]'))
  assert.equal(railLabels.de(3).button, 'Zu Runde 3 springen')
})
