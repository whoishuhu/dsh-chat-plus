// Pure planning for dsh-chat-plus operations: given folded state and the live
// surface order, decide which contiguous surface range a marker replaces.
import { hiddenMap, lastVisibleTurn, turnNumbers } from './model.js'

export class PlanError extends Error {
  constructor(code, message) { super(message); this.code = code }
}

/**
 * Contiguous range of `seqs` within the live surface order.
 * @returns {{seqs:number[]}} shadowed seqs in surface order ([] = display-only).
 */
export function contiguous(surface, seqs) {
  if (seqs.length === 0) return { seqs: [] }
  const wanted = new Set(seqs)
  const idx = surface.map((seq, i) => (wanted.has(seq) ? i : -1)).filter(i => i >= 0)
  if (idx.length !== wanted.size) throw new PlanError('not-visible', 'part of the selection is no longer in the model context')
  const first = idx[0]
  const last = idx.at(-1)
  if (last - first + 1 !== idx.length) throw new PlanError('not-contiguous', 'the selection was compacted or interleaved and cannot be removed safely')
  return { seqs: surface.slice(first, last + 1) }
}

const turnSeqs = (state, turn, filter = () => true) =>
  (state.turns[String(turn)]?.n ?? []).filter(filter).map(([seq]) => seq)

function groupOf(state, turn) {
  for (const [id, group] of Object.entries(state.groups)) if (group.turns.includes(turn)) return { id, group }
  return undefined
}

function requireEnded(state, turn) {
  const record = state.turns[String(turn)]
  if (record === undefined) throw new PlanError('unknown-turn', `turn ${turn} is not in this session`)
  if (!record.end) throw new PlanError('turn-running', 'wait for the reply to finish')
  return record
}

/** Regenerate the last visible turn. */
export function planRegen(state, surface, turn, newGroupId) {
  requireEnded(state, turn)
  if (lastVisibleTurn(state) !== turn) throw new PlanError('not-last', 'only the latest turn can be regenerated')
  const record = state.turns[String(turn)]
  if (record.p === null) throw new PlanError('no-prompt', 'this turn has no user prompt to resend')
  const family = groupOf(state, turn)
  const { seqs } = contiguous(surface, turnSeqs(state, turn))
  return {
    marker: { op: 'regen', turn, group: family?.id ?? newGroupId },
    seqs,
    promptSeq: state.turns[String(family?.group.turns[0] ?? turn)].p ?? record.p,
    tools: record.tools,
  }
}

/** Switch the latest family to another version. */
export function planSwitch(state, surface, groupId, to) {
  const group = state.groups[groupId]
  if (group === undefined || !group.turns.includes(to)) throw new PlanError('unknown-version', 'this version no longer exists')
  if (group.active === to) return null
  if (lastVisibleTurn(state) !== group.active) throw new PlanError('not-last', 'versions can be switched only on the latest turn')
  requireEnded(state, group.active)
  const target = state.turns[String(to)]
  if (target?.o == null || target.o.length === 0) throw new PlanError('no-original', 'this version has no recorded content')
  const { seqs } = contiguous(surface, turnSeqs(state, group.active))
  return { marker: { op: 'switch', group: groupId, from: group.active, to, count: target.o.length }, seqs, copySeqs: target.o }
}

/** Delete one reply (keep its prompt) or one whole turn. */
export function planDelete(state, surface, turn, scope) {
  requireEnded(state, turn)
  const hidden = hiddenMap(state)
  if (hidden[String(turn)] === 'all') throw new PlanError('already-hidden', 'this message was already deleted')
  const family = groupOf(state, turn)

  if (scope === 'reply') {
    // Deleting the shown version of a multi-version latest turn switches to a neighbour.
    if (family !== undefined && family.group.turns.length > 1 && lastVisibleTurn(state) === turn) {
      const others = family.group.turns.filter(other => other !== turn)
      const at = family.group.turns.indexOf(turn)
      const to = others[Math.min(at, others.length - 1)]
      const plan = planSwitch(state, surface, family.id, to)
      return { ...plan, marker: { ...plan.marker, drop: true } }
    }
    const record = state.turns[String(turn)]
    const start = record.n.findIndex(([, kind]) => kind === 'a' || kind === 't')
    const reply = start < 0 ? [] : record.n.slice(start).map(([seq]) => seq)
    const { seqs } = contiguous(surface, reply)
    return { marker: { op: 'hide', scope: 'reply', turn }, seqs }
  }

  const turns = family === undefined ? [turn] : family.group.turns
  const { seqs } = contiguous(surface, turns.flatMap(other => turnSeqs(state, other)))
  return { marker: { op: 'hide', scope: 'turn', turn }, seqs }
}

/** Roll back to before `turn`: hide it and every later turn. */
export function planRollback(state, surface, turn) {
  requireEnded(state, turn)
  const family = groupOf(state, turn)
  const from = family === undefined ? turn : Math.min(...family.group.turns)
  const later = turnNumbers(state).filter(other => other >= from)
  for (const other of later) requireEnded(state, other)
  const all = later.flatMap(other => turnSeqs(state, other))
  if (all.length === 0) return { marker: { op: 'rollback', turn }, seqs: [], promptSeq: state.turns[String(from)].p }
  // Everything from the first kept node of `from` to the surface tail goes.
  const positions = all.map(seq => surface.indexOf(seq)).filter(i => i >= 0)
  const seqs = positions.length === 0 ? [] : surface.slice(Math.min(...positions))
  return { marker: { op: 'rollback', turn }, seqs, promptSeq: state.turns[String(from)].p }
}
