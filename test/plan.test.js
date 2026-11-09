import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply, initialState, MARKER_KIND } from '../lib/model.js'
import { planDelete, planRegen, planRollback, planSwitch, PlanError } from '../lib/plan.js'

// Simulated session that also maintains the live surface order like dsh-session.
function sim() {
  const events = []
  const surface = []
  let turn = 0
  const push = (type, data, surfaceOp = undefined, sourceEventSeqs = undefined) => {
    const e = { type, seq: events.length, time: events.length, data, ...(surfaceOp ? { surfaceOp } : {}), ...(sourceEventSeqs ? { sourceEventSeqs } : {}) }
    events.push(e)
    if (surfaceOp === 'append') surface.push(e.seq)
    else if (surfaceOp?.op === 'replace') {
      const a = surface.indexOf(surfaceOp.startSeq); const b = surface.indexOf(surfaceOp.endSeq)
      assert.ok(a >= 0 && b >= a, 'replace endpoints visible')
      const covered = surface.slice(a, b + 1)
      assert.deepEqual([...covered].sort(), [...sourceEventSeqs].sort(), 'sourceEventSeqs cover every shadowed node')
      surface.splice(a, b - a + 1, e.seq)
    }
    return e
  }
  const api = {
    events, surface,
    state: () => events.reduce(apply, initialState()),
    turn(tools = false) {
      turn += 1
      push('turn/start', { turn })
      push('user/message', { id: `u${turn}`, role: 'user', content: [{ type: 'text', text: 'q' }], source: { kind: 'user' } }, 'append')
      push('user/message', { id: `c${turn}`, role: 'user', content: [], source: { kind: 'runtime-context' } }, 'append')
      if (tools) {
        push('assistant/message', { turn, step: 1, message: { id: `x${turn}`, content: [{ type: 'tool-call' }], source: { model: 'm' } } }, 'append')
        push('tool/result', { turn, step: 1, message: { id: `t${turn}`, content: [] } }, 'append')
      }
      push('assistant/message', { turn, step: 2, message: { id: `a${turn}`, content: [{ type: 'text', text: 'r' }], source: { model: 'm' } } }, 'append')
      push('turn/end', { reason: { kind: 'completed' } })
    },
    commit(plan) {
      const marker = { turn: 1, step: 1, message: { id: `d${events.length}`, role: 'developer', content: [], source: { kind: MARKER_KIND, v: 1, ...plan.marker } } }
      if (plan.seqs.length === 0) push('developer/message', marker, 'append')
      else push('developer/message', marker, { op: 'replace', startSeq: plan.seqs[0], endSeq: plan.seqs.at(-1) }, plan.seqs)
      for (const seq of plan.copySeqs ?? []) push(events[seq].type, structuredClone(events[seq].data), 'append')
    },
  }
  return api
}

test('regen → switch → delete-reply round trip keeps surface valid', () => {
  const s = sim(); s.events.push({ type: 'system/message', seq: 0, time: 0, data: { message: { content: [] } }, surfaceOp: 'append' }); s.surface.push(0)
  s.turn(true)
  s.commit(planRegen(s.state(), s.surface, 1, 'g'))
  s.turn()
  assert.deepEqual(s.surface.length, 1 + 1 + 3) // system + regen marker + turn 2
  s.commit(planSwitch(s.state(), s.surface, 'g', 1))
  assert.equal(s.state().groups.g.active, 1)
  const del = planDelete(s.state(), s.surface, 1, 'reply')
  assert.equal(del.marker.op, 'switch')
  assert.equal(del.marker.drop, true)
  s.commit(del)
  const st = s.state()
  assert.deepEqual(st.groups.g.turns, [2])
  assert.equal(st.hidden['1'], 'all')
})

test('delete reply without tools keeps the prompt nodes visible', () => {
  const s = sim(); s.turn(); s.turn()
  const plan = planDelete(s.state(), s.surface, 1, 'reply')
  s.commit(plan)
  const st = s.state()
  assert.deepEqual(st.turns['1'].n.map(([, k]) => k), ['u', 'u'])
  assert.equal(st.hidden['1'], 'reply')
})

test('regen refuses a turn that is not the latest', () => {
  const s = sim(); s.turn(); s.turn()
  assert.throws(() => planRegen(s.state(), s.surface, 1, 'g'), e => e instanceof PlanError && e.code === 'not-last')
})

test('rollback removes the turn and the tail in one contiguous replacement', () => {
  const s = sim(); s.turn(); s.turn(true); s.turn()
  const plan = planRollback(s.state(), s.surface, 2)
  s.commit(plan)
  const st = s.state()
  assert.equal(st.hidden['2'], 'all')
  assert.equal(st.hidden['3'], 'all')
  assert.equal(st.hidden['1'], undefined)
  assert.equal(st.turns['1'].n.length, 3)
})

test('deleting an already-deleted turn is refused', () => {
  const s = sim(); s.turn(); s.turn()
  s.commit(planDelete(s.state(), s.surface, 1, 'turn'))
  assert.throws(() => planDelete(s.state(), s.surface, 1, 'turn'), e => e.code === 'already-hidden')
})
