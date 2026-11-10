import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('assistant metadata targets official end-info and does not render a duplicate clock', async () => {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(source, /\[data-clock="end"\]>span:last-child/)
  assert.match(source, /chatplus-model-slot/)
  assert.doesNotMatch(source, /nowClock\(meta\?\.time\)/)
  assert.match(source, /chatplus-version-group/)
  assert.match(source, /chatplus-assistant-controls/)
})

test('user content and action bar are right-aligned with checkbox before icons', async () => {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(source, /\.chatplus-user-row\{[^}]*align-items:flex-end/)
  assert.match(source, /\.chatplus-user-actions\{[^}]*justify-content:flex-end/)
  const userNode = source.slice(source.indexOf('function UserNode'), source.indexOf('function SessionDeleteOverlay'))
  assert.ok(userNode.indexOf('className: \'chatplus-user-actions\'') < userNode.indexOf('className: \'chatplus-select\''))
  assert.match(source, /className: 'chatplus-action-controls'/)
})
