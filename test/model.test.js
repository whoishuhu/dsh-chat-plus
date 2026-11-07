import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply, initialState, view, MARKER_KIND } from '../lib/model.js'

/** Minimal Session log builder mirroring the real event shapes. */
function log() {
  const events = []
  let turn = 0
  const push = (type, data, extra = {}) => { const e = { type, seq: events.length, time: 1000 + events.length, data, ...extra }; events.push(e); return e }
  const api = {
    events,
    system: () => push('system/message', { turn: 0, step: 1, message: { id: 's', role: 'system', content: [{ type: 'text', text: 'sys' }], source: { kind: 'system-prompt' } } }, { surfaceOp: 'append' }),
    turn(text, { tools = false, model = 'm1' } = {}) {
      turn += 1
      push('turn/start', { turn })
      const prompt = push('user/message', { id: `u${turn}`, role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } }, { surfaceOp: 'append' })
      push('user/message', { id: `c${turn}`, role: 'user', content: [{ type: 'text', text: 'ctx' }], source: { kind: 'runtime-context' } }, { surfaceOp: 'append' })
      if (tools) {
        push('assistant/message', { turn, step: 1, message: { id: `a${turn}x`, role: 'assistant', content: [{ type: 'tool-call', id: `k${turn}` }], source: { kind: 'model', model } }, stream: [] }, { surfaceOp: 'append' })
        push('tool/result', { turn, step: 1, message: { id: `t${turn}`, role: 'tool', content: [], source: { kind: 'tool' } } }, { surfaceOp: 'append' })
      }
      push('assistant/message', { turn, step: 2, message: { id: `a${turn}`, role: 'assistant', content: [{ type: 'text', text: `reply${turn}` }], source: { kind: 'model', model } }, stream: [] }, { surfaceOp: 'append' })
      push('turn/end', { reason: { kind: 'completed' } })
      return { turn, prompt }
    },
    marker(source, seqs) {
      const extra = seqs.length === 0
        ? { surfaceOp: 'append' }
        : { surfaceOp: { op: 'replace', startSeq: seqs[0], endSeq: seqs.at(-1) }, sourceEventSeqs: seqs }
      return push('developer/message', { turn: 1, step: 1, message: { id: `d${events.length}`, role: 'developer', content: [], source: { kind: MARKER_KIND, v: 1, ...source } } }, extra)
    },
    copy(ev) { return push(ev.type, structuredClone(ev.data), { surfaceOp: 'append' }) },
    fold() { return events.reduce(apply, initialState()) },
  }
  return api
}
const nodes = (state, turn) => state.turns[String(turn)].n.map(([seq]) => seq)

test('turn attribution keeps the system prompt outside the turn', () => {
  const l = log(); l.system(); l.turn('hi', { tools: true })
  const s = l.fold()
  assert.deepEqual(nodes(s, 1), [2, 3, 4, 5, 6])
  assert.equal(s.turns['1'].p, 2)
  assert.equal(s.turns['1'].tools, true)
  assert.equal(s.turns['1'].m, 'm1')
  assert.equal(view(s).last, 1)
})

test('regenerate creates a version family and switch re-attributes copies', () => {
  const l = log(); l.system(); l.turn('q', { tools: true })
  let s = l.fold()
  const v1 = nodes(s, 1)
  l.marker({ op: 'regen', turn: 1, group: 'g1' }, v1)
  l.turn('q', { model: 'm2' })
  s = l.fold()
  let v = view(s)
  assert.deepEqual(v.groups, [{ id: 'g1', turns: [1, 2], active: 2 }])
  assert.equal(v.hidden['1'], 'all')
  assert.equal(v.last, 2)
  assert.equal(v.meta['2'].model, 'm2')
  assert.deepEqual(nodes(s, 1), [])

  // switch back to v1: shadow turn 2, append copies of turn 1's original nodes
  const originals = s.turns['1'].o
  l.marker({ op: 'switch', group: 'g1', from: 2, to: 1, count: originals.length }, nodes(s, 2))
  for (const seq of originals) l.copy(l.events[seq])
  s = l.fold()
  v = view(s)
  assert.equal(v.groups[0].active, 1)
  assert.equal(v.hidden['2'], 'all')
  assert.equal(v.hidden['1'], undefined)
  assert.equal(v.last, 1)
  assert.equal(nodes(s, 1).length, originals.length)
  assert.deepEqual(nodes(s, 2), [])
  assert.deepEqual(s.turns['1'].o, originals, 'originals stay the first recording')
})

test('continuing after a switch keeps the family and the next turn is last', () => {
  const l = log(); l.system(); l.turn('q')
  let s = l.fold()
  l.marker({ op: 'regen', turn: 1, group: 'g1' }, nodes(s, 1))
  l.turn('q')
  s = l.fold()
  l.turn('next')
  s = l.fold()
  const v = view(s)
  assert.equal(v.last, 3)
  assert.deepEqual(v.groups[0].turns, [1, 2])
})

test('delete reply hides the reply only and dissolves the family', () => {
  const l = log(); l.system(); l.turn('q', { tools: true })
  let s = l.fold()
  l.marker({ op: 'regen', turn: 1, group: 'g1' }, nodes(s, 1))
  l.turn('q')
  s = l.fold()
  const reply = s.turns['2'].n.filter(([, kind]) => kind === 'a' || kind === 't').map(([seq]) => seq)
  l.marker({ op: 'hide', scope: 'reply', turn: 2 }, reply)
  s = l.fold()
  const v = view(s)
  assert.equal(v.hidden['2'], 'reply')
  assert.equal(v.hidden['1'], 'all')
  assert.deepEqual(v.groups, [])
  assert.deepEqual(s.turns['2'].n.map(([, kind]) => kind), ['u', 'u'])
})

test('delete turn hides every version; display-only marker hides without shadowing', () => {
  const l = log(); l.system(); l.turn('a'); l.turn('b')
  let s = l.fold()
  l.marker({ op: 'hide', scope: 'turn', turn: 1 }, nodes(s, 1))
  l.marker({ op: 'hide', scope: 'turn', turn: 2 }, [])
  s = l.fold()
  const v = view(s)
  assert.equal(v.hidden['1'], 'all')
  assert.equal(v.hidden['2'], 'all')
  assert.equal(v.last, null)
  assert.deepEqual(nodes(s, 1), [])
  assert.equal(nodes(s, 2).length, 3, 'display-only marker does not shadow')
})

test('rollback hides the turn and everything after it, including families', () => {
  const l = log(); l.system(); l.turn('a'); l.turn('b')
  let s = l.fold()
  l.marker({ op: 'regen', turn: 2, group: 'g2' }, nodes(s, 2))
  l.turn('b')
  s = l.fold()
  l.marker({ op: 'rollback', turn: 3 }, [...nodes(s, 3)])
  s = l.fold()
  const v = view(s)
  assert.equal(v.hidden['1'], undefined)
  assert.equal(v.hidden['2'], 'all')
  assert.equal(v.hidden['3'], 'all')
  assert.deepEqual(v.groups, [])
  assert.equal(v.last, 1)
})

test('compaction replacement removes shadowed seqs without attribution', () => {
  const l = log(); l.system(); l.turn('a')
  const seqs = nodes(l.fold(), 1)
  l.events.push({ type: 'user/message', seq: l.events.length, time: 0, data: { id: 'ck', role: 'user', content: [], source: { kind: 'compaction' } }, surfaceOp: { op: 'replace', startSeq: seqs[0], endSeq: seqs.at(-1) }, sourceEventSeqs: seqs })
  const s = l.fold()
  assert.deepEqual(nodes(s, 1), [])
  assert.equal(view(s).hidden['1'], undefined, 'compaction is not a user deletion')
})

test('ignored events keep the same state reference', () => {
  const s = initialState()
  assert.equal(apply(s, { type: 'request/header', seq: 0, time: 0, data: {} }), s)
  assert.equal(view(s), view(s))
})
