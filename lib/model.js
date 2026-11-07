// Pure, synchronous fold of one Session log into dsh-chat-plus state.
// Shared by the Host plugin (projection unit) and the unit tests.
//
// The log is the only source of truth. Every operation the plugin performs is a
// logged `developer/message` whose `message.source` is a marker:
//   { kind: 'dsh-chat-plus', v: 1, op: 'hide'|'regen'|'switch'|'rollback', ... }
// The marker is either an empty-content surface replacement (it shadows the
// selected nodes from the model) or an empty append (display-only change).

export const MARKER_KIND = 'dsh-chat-plus'
export const STATE_VERSION = 1

const SURFACE = new Set(['system/message', 'developer/message', 'user/message', 'assistant/message', 'tool/result'])
const KIND = { 'user/message': 'u', 'assistant/message': 'a', 'tool/result': 't', 'system/message': 's', 'developer/message': 'd' }

export function initialState() {
  return { v: STATE_VERSION, cur: null, pendingCopy: null, pendingRegen: null, turns: {}, hidden: {}, groups: {} }
}

/** The marker carried by one event, or undefined. */
export function markerOf(event) {
  if (event.type !== 'developer/message') return undefined
  const source = event.data?.message?.source
  return source !== null && typeof source === 'object' && source.kind === MARKER_KIND ? source : undefined
}

function isReplace(event) {
  return event.surfaceOp !== null && typeof event.surfaceOp === 'object' && event.surfaceOp.op === 'replace'
}

function groupIdOf(state, turn) {
  for (const [id, group] of Object.entries(state.groups)) if (group.turns.includes(turn)) return id
  return undefined
}

function withTurn(state, turn, change) {
  const key = String(turn)
  const prev = state.turns[key] ?? { p: null, n: [], o: null, m: null, t: 0, tools: false, end: false }
  return { ...state, turns: { ...state.turns, [key]: change(prev) } }
}

function hideTurns(state, turns, scope) {
  const hidden = { ...state.hidden }
  for (const turn of turns) {
    const key = String(turn)
    if (scope === 'all' || hidden[key] !== 'all') hidden[key] = scope
  }
  return { ...state, hidden }
}

function dropGroups(state, predicate) {
  const groups = {}
  let changed = false
  for (const [id, group] of Object.entries(state.groups)) {
    if (predicate(group)) changed = true
    else groups[id] = group
  }
  return changed ? { ...state, groups } : state
}

/** Remove shadowed seqs from every turn's model-visible node list. */
function shadow(state, seqs) {
  if (seqs.length === 0) return state
  const gone = new Set(seqs)
  let turns
  for (const [key, record] of Object.entries(state.turns)) {
    if (!record.n.some(([seq]) => gone.has(seq))) continue
    turns ??= { ...state.turns }
    turns[key] = { ...record, n: record.n.filter(([seq]) => !gone.has(seq)) }
  }
  return turns === undefined ? state : { ...state, turns }
}

function applyMarker(state, marker) {
  switch (marker.op) {
    case 'hide': {
      const turn = marker.turn
      const id = groupIdOf(state, turn)
      if (marker.scope === 'reply') {
        // The kept prompt leaves its version family: other versions disappear with it.
        if (id === undefined) return hideTurns(state, [turn], 'reply')
        const others = state.groups[id].turns.filter(other => other !== turn)
        const next = hideTurns(hideTurns(state, others, 'all'), [turn], 'reply')
        return dropGroups(next, group => group === state.groups[id])
      }
      const turns = id === undefined ? [turn] : state.groups[id].turns
      const next = hideTurns(state, turns, 'all')
      return id === undefined ? next : dropGroups(next, group => group === state.groups[id])
    }
    case 'rollback': {
      const id = groupIdOf(state, marker.turn)
      const from = id === undefined ? marker.turn : Math.min(...state.groups[id].turns)
      const turns = Object.keys(state.turns).map(Number).filter(turn => turn >= from)
      return dropGroups(hideTurns(state, turns, 'all'), group => group.turns.some(turn => turn >= from))
    }
    case 'regen': {
      const id = groupIdOf(state, marker.turn) ?? marker.group
      const group = state.groups[id] ?? { turns: [marker.turn], active: marker.turn }
      return { ...state, pendingRegen: id, groups: { ...state.groups, [id]: group } }
    }
    case 'switch': {
      const group = state.groups[marker.group]
      if (group === undefined || !group.turns.includes(marker.to)) return state
      const turns = marker.drop === true ? group.turns.filter(turn => turn !== marker.from) : group.turns
      let next = {
        ...state,
        pendingCopy: marker.count > 0 ? { turn: marker.to, left: marker.count } : null,
        groups: { ...state.groups, [marker.group]: { turns, active: marker.to } },
      }
      if (marker.drop === true) next = hideTurns(next, [marker.from], 'all')
      // A switch re-attributes copies to `to`; its original nodes are already shadowed.
      return withTurn(next, marker.to, record => ({ ...record, n: [] }))
    }
    default:
      return state
  }
}

/**
 * Fold one committed event. Returns the same reference for ignored events.
 * @param {ReturnType<typeof initialState>} state
 * @param {{type:string, seq:number, time:number, data:any, surfaceOp?:any, sourceEventSeqs?:number[]}} event
 */
export function apply(state, event) {
  switch (event.type) {
    case 'turn/start': {
      const turn = event.data?.turn
      if (typeof turn !== 'number') return state
      let next = { ...state, cur: turn }
      next = withTurn(next, turn, record => ({ ...record, t: event.time, end: false }))
      if (state.pendingRegen !== null) {
        const id = state.pendingRegen
        const group = next.groups[id]
        next = { ...next, pendingRegen: null }
        if (group !== undefined && !group.turns.includes(turn)) {
          next = { ...next, groups: { ...next.groups, [id]: { turns: [...group.turns, turn], active: turn } } }
        }
      }
      return next
    }
    case 'turn/end': {
      const turn = event.data?.turn ?? state.cur
      if (typeof turn !== 'number') return state
      const next = withTurn(state, turn, record => ({ ...record, end: true, o: record.o ?? record.n.map(([seq]) => seq) }))
      return { ...next, cur: state.cur === turn ? null : state.cur }
    }
    default:
      break
  }
  if (!SURFACE.has(event.type)) return state

  const marker = markerOf(event)
  let next = state
  if (isReplace(event)) next = shadow(next, Array.isArray(event.sourceEventSeqs) ? event.sourceEventSeqs : [])
  if (marker !== undefined) return applyMarker(next, marker)
  if (isReplace(event)) return next // compaction checkpoint or other replacement: no attribution

  // Attribute one appended model-visible node to a turn.
  let turn
  if (next.pendingCopy !== null) {
    turn = next.pendingCopy.turn
    const left = next.pendingCopy.left - 1
    next = { ...next, pendingCopy: left > 0 ? { turn, left } : null }
  } else {
    turn = next.cur
  }
  if (turn === null || turn === undefined) return next
  const kind = KIND[event.type]
  const record = next.turns[String(turn)]
  // A system prompt before the turn's prompt stays outside the turn (never hide node 0).
  if (kind === 's' && (record === undefined || record.p === null)) return next
  return withTurn(next, turn, prev => {
    const updated = { ...prev, n: [...prev.n, [event.seq, kind]] }
    if (kind === 'u' && prev.p === null && event.data?.source?.kind === 'user') updated.p = event.seq
    if (kind === 'a') {
      const source = event.data?.message?.source
      if (prev.m === null && typeof source?.model === 'string') updated.m = source.model
      if (event.data?.message?.content?.some?.(block => block?.type === 'tool-call')) updated.tools = true
    }
    if (kind === 't') updated.tools = true
    return updated
  })
}

/** Turn numbers in ascending order. */
export function turnNumbers(state) {
  return Object.keys(state.turns).map(Number).sort((a, b) => a - b)
}

/** Effective display hiding: explicit hides plus inactive group versions. */
export function hiddenMap(state) {
  const hidden = { ...state.hidden }
  for (const group of Object.values(state.groups)) {
    for (const turn of group.turns) if (turn !== group.active) hidden[String(turn)] = 'all'
  }
  return hidden
}

/** The latest ended turn that is still shown, or null. */
export function lastVisibleTurn(state) {
  const hidden = hiddenMap(state)
  const turns = turnNumbers(state).filter(turn => hidden[String(turn)] !== 'all')
  return turns.length === 0 ? null : turns.at(-1)
}

const views = new WeakMap()
/** Client-facing value; the same reference for the same state. */
export function view(state) {
  const cached = views.get(state)
  if (cached !== undefined) return cached
  const groups = Object.entries(state.groups)
    .filter(([, group]) => group.turns.length > 1)
    .map(([id, group]) => ({ id, turns: group.turns, active: group.active }))
  const last = lastVisibleTurn(state)
  const metaTurns = new Set(groups.flatMap(group => group.turns))
  if (last !== null) metaTurns.add(last)
  const meta = {}
  for (const turn of metaTurns) {
    const record = state.turns[String(turn)]
    if (record !== undefined) meta[String(turn)] = { model: record.m, time: record.t, tools: record.tools, end: record.end }
  }
  const value = { hidden: hiddenMap(state), groups, last, meta, running: state.cur !== null }
  views.set(state, value)
  return value
}
