// dsh-chat-plus Host half: log-derived projection, in-session operations, recycle bin.
import { randomUUID } from 'node:crypto'
import { rm, stat as fsStat } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import { apply as foldEvent, initialState, view, STATE_VERSION, MARKER_KIND, hiddenMap } from './lib/model.js'
import { planDelete, planRegen, planRollback, planSwitch, PlanError } from './lib/plan.js'

export const name = 'dsh-chat-plus'
export const inject = ['sessionController', 'sessions', 'sessionProjections', 'connection', 'workspaceRegistry', 'storageDomain', 'sessionQuery', 'sessionPersistence', 'attachments']

const PROJECTION_KEY = 'chatPlus'
const OP_PATH = '/api/chatplus.op'
const anySchema = { parse: value => value, safeParse: value => ({ success: true, data: value }) }
const stateSchema = {
  parse: value => (value !== null && typeof value === 'object' && value.v === STATE_VERSION && typeof value.turns === 'object' ? value : initialState()),
}

class OpError extends Error {
  constructor(code, message, status = 409) { super(message); this.code = code; this.status = status }
}

const textOf = content => (Array.isArray(content) ? content : []).filter(b => b?.type === 'text').map(b => b.text).join('')
const attachmentsOf = content => (Array.isArray(content) ? content : []).filter(b => b?.type === 'image' || b?.type === 'file')

export async function apply(ctx) {
  // ---------- model-facing projection (wire view for the Client) ----------
  const projection = await ctx.sessionProjections.register({
    key: PROJECTION_KEY,
    stateSchema,
    stateVersion: STATE_VERSION,
    init: () => initialState(),
    apply: (state, event) => foldEvent(state, event),
    wire: { viewSchema: anySchema, view: state => view(state), summary: false },
  })
  ctx.effect(() => () => projection.dispose?.())

  // ---------- recycle bin storage ----------
  const binSpec = {
    name: 'chat_plus_recycle',
    version: 1,
    invalidRecords: 'backup-and-skip',
    tables: { items: { valueSchema: anySchema } },
  }
  const binReady = (async () => {
    try { return await ctx.storageDomain.open(binSpec) } catch (error) {
      const existing = ctx.storageDomain.get(binSpec.name)
      if (existing !== undefined) return existing
      throw error
    }
  })()
  ctx.effect(() => () => { binReady.then(domain => domain.close?.()).catch(() => {}) })
  const bin = async () => (await binReady).table('items')

  // ---------- per-session serialization ----------
  const chains = new Map()
  const serialized = (key, job) => {
    const previous = chains.get(key) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(job)
    const tracked = next.finally(() => { if (chains.get(key) === tracked) chains.delete(key) })
    chains.set(key, tracked)
    return next
  }

  async function liveAgent(sessionId) {
    const resolved = await ctx.sessionController.resolveAgent(sessionId)
    if (resolved.error !== undefined) throw new OpError(resolved.error.code ?? 'session-unavailable', resolved.error.message ?? 'session unavailable')
    const agent = resolved.agent
    if (agent?.session === undefined) throw new OpError('session-unavailable', 'session is not loaded')
    return agent
  }

  async function readState(sessionId) {
    const snapshot = await ctx.sessionQuery.readSession(sessionId)
    const events = snapshot.events
    const bySeq = new Map(events.map(event => [event.seq, event]))
    return { state: events.reduce(foldEvent, initialState()), bySeq }
  }

  /** Append one marker (replacement when seqs are given, else display-only). */
  function appendMarker(session, state, marker, seqs) {
    const turn = Math.max(1, Number(marker.turn ?? marker.to ?? state.cur ?? 1) || 1)
    const data = { turn, step: 1, message: { id: randomUUID(), role: 'developer', content: [], source: { kind: MARKER_KIND, v: 1, ...marker } } }
    const options = seqs.length === 0
      ? { surfaceOp: 'append' }
      : { surfaceOp: { op: 'replace', startSeq: seqs[0], endSeq: seqs.at(-1) }, sourceEventSeqs: [...seqs] }
    return session.append('developer/message', data, options)
  }

  /** Commit a plan inside agent maintenance; returns the folded state afterwards. */
  async function commit(agent, sessionId, build) {
    if (agent.status !== 'idle') throw new OpError('busy', 'wait for the current reply to finish')
    let result
    await agent.runMaintenance(async () => {
      const { state: initial, bySeq } = await readState(sessionId)
      let state = initial
      const session = agent.session
      const step = (plan) => {
        state = foldEvent(state, appendMarker(session, state, plan.marker, plan.seqs))
        for (const seq of plan.copySeqs ?? []) {
          const original = bySeq.get(seq)
          if (original === undefined) throw new OpError('missing-event', `event ${seq} cannot be read`)
          state = foldEvent(state, session.append(original.type, structuredClone(original.data), { surfaceOp: 'append' }))
        }
      }
      result = await build({ get state() { return state }, surface: () => [...session.surface.nodes], bySeq, step })
    })
    await ctx.sessions.flush(agent.session).catch(() => {})
    return result
  }

  // ---------- operations ----------
  const ops = {
    async regen({ sessionId, turn }) {
      const agent = await liveAgent(sessionId)
      let prompt
      const outcome = await commit(agent, sessionId, async ({ state, surface, bySeq, step }) => {
        const plan = planRegen(state, surface(), turn, `g-${randomUUID()}`)
        const event = bySeq.get(plan.promptSeq)
        if (event?.type !== 'user/message') throw new OpError('no-prompt', 'the original prompt cannot be read')
        step(plan)
        const { rpcId, ...source } = event.data.source ?? { kind: 'user' }
        prompt = { ...structuredClone(event.data), id: randomUUID(), source }
        return { tools: plan.tools }
      })
      agent.followup(prompt)
      return outcome
    },
    async switch({ sessionId, group, to }) {
      const agent = await liveAgent(sessionId)
      return commit(agent, sessionId, async ({ state, surface, step }) => {
        const plan = planSwitch(state, surface(), group, to)
        if (plan !== null) step(plan)
        return { switched: plan !== null }
      })
    },
    async delete({ sessionId, items }) {
      const list = Array.isArray(items) ? items : []
      if (list.length === 0) throw new OpError('bad-request', 'nothing to delete', 400)
      const agent = await liveAgent(sessionId)
      return commit(agent, sessionId, async (ctxOp) => {
        // Whole turns first (descending) so reply deletes never target removed turns.
        const ordered = [...list].sort((a, b) => (a.scope === b.scope ? b.turn - a.turn : a.scope === 'turn' ? -1 : 1))
        let done = 0
        for (const item of ordered) {
          if (hiddenMap(ctxOp.state)[String(item.turn)] === 'all') continue
          ctxOp.step(planDelete(ctxOp.state, ctxOp.surface(), Number(item.turn), item.scope === 'turn' ? 'turn' : 'reply'))
          done += 1
        }
        return { deleted: done }
      })
    },
    async rollback({ sessionId, turn }) {
      const agent = await liveAgent(sessionId)
      return commit(agent, sessionId, async ({ state, surface, bySeq, step }) => {
        const plan = planRollback(state, surface(), Number(turn))
        const prompt = bySeq.get(plan.promptSeq)
        step(plan)
        const content = prompt?.data?.content ?? []
        const attachments = attachmentsOf(content).map(block => ({ type: block.type, attachment: block.attachment }))
          .filter(item => item.type === 'image' || (item.type === 'file' && item.attachment?.bytes <= 25 * 1024 * 1024))
        return { text: textOf(content), attachments }
      })
    },
    async edit({ sessionId, turn, text, keep }) {
      if (typeof text !== 'string' || text.trim() === '') throw new OpError('bad-request', 'the edited question is empty', 400)
      const agent = await liveAgent(sessionId)
      let message
      await commit(agent, sessionId, async ({ state, surface, bySeq, step }) => {
        const plan = planRollback(state, surface(), Number(turn))
        const original = bySeq.get(plan.promptSeq)
        if (original?.type !== 'user/message') throw new OpError('no-prompt', 'the original prompt cannot be read')
        const originalAttachments = attachmentsOf(original.data.content)
        const kept = originalAttachments.filter((_, index) => Array.isArray(keep) && keep.includes(index))
        const admitted = await ctx.attachments.admitPromptContent(kept)
        step(plan)
        const { rpcId, ...source } = original.data.source ?? { kind: 'user' }
        message = { ...structuredClone(original.data), id: randomUUID(), source, content: [{ type: 'text', text }, ...admitted] }
      })
      agent.followup(message)
      return { sent: true }
    },
    async activity({ sessionId }) {
      const descendants = await descendantsOf(sessionId)
      const running = await isRunning(sessionId) || (await Promise.all(descendants.map(isRunning))).some(Boolean)
      return { running, descendants: descendants.length }
    },
    async attachment({ type, attachment }) {
      return attachmentCopy({ type, attachment })
    },
    async trash({ sessionId, title, stop }) {
      const reg = ctx.workspaceRegistry
      const table = await bin()
      const existing = table.get(sessionId)
      if (existing !== undefined) return { trashed: true, alreadyTrashed: true }
      const descendants = await descendantsOf(sessionId)
      const isBusy = await isRunning(sessionId) || descendants.some(id => ctx.get('agents')?.get?.(id)?.status === 'running')
      if (isBusy && stop !== true) throw new OpError('running', 'this session or one of its child sessions is still running')
      if (stop === true && isBusy) {
        try { await ctx.parallel('workspace/session-stop', { sessionId }) } catch { /* sessionController archive below also stops the root */ }
      }
      await reg.archiveSession(sessionId, { stopActivity: true })
      for (const id of descendants) {
        try { await reg.archiveSession(id, { stopActivity: true }) } catch { /* subagent registry may not expose an ordinary workspace row */ }
        try { await ctx.parallel('workspace/session-stop', { sessionId: id }) } catch { /* no provider */ }
      }
      await table.put(sessionId, { id: sessionId, title: String(title ?? '').slice(0, 200), trashedAt: Date.now(), descendants })
      return { trashed: true, descendants: descendants.length }
    },
    async childTrash({ sessionId, title, stop }) {
      return ops.trash({ sessionId, title, stop })
    },
    async list() {
      const table = await bin()
      const archived = new Set(ctx.workspaceRegistry.archivedSessionIds)
      const items = []
      for (const [key, value] of table.entries()) {
        if (!archived.has(key)) { await table.delete(key); continue }
        items.push(value)
      }
      items.sort((a, b) => b.trashedAt - a.trashedAt)
      return { items }
    },
    async restore({ sessionId }) {
      const table = await bin()
      const record = table.get(sessionId)
      if (record === undefined) throw new OpError('not-in-bin', 'this session is not in the recycle bin', 404)
      for (const id of [...(record.descendants ?? [])].reverse()) {
        try { await ctx.workspaceRegistry.unarchiveSession(id) } catch { /* missing child; leave parent recoverable */ }
      }
      await ctx.workspaceRegistry.unarchiveSession(sessionId)
      await table.delete(sessionId)
      return { restored: true }
    },
    async purge({ sessionId }) {
      return { purged: await purge(sessionId) }
    },
    async inspect({ sessionId }) {
      return { running: await isRunning(sessionId) }
    },
    async empty() {
      const table = await bin()
      let purged = 0
      for (const key of [...table.keys()]) purged += (await purge(key)) ? 1 : 0
      return { purged }
    },
  }

  async function isRunning(sessionId) {
    try {
      const activity = await ctx.waterfall('workspace/session-activity', { sessionId }, () => Promise.resolve([]))
      if (Array.isArray(activity) && activity.length > 0) return true
    } catch { /* no providers */ }
    const agent = ctx.get('agents')?.get?.(sessionId)
    return agent?.status === 'running'
  }
  async function attachmentCopy(ref) {
    if (ref?.type === 'image') {
      const stored = await ctx.attachments.readImage(ref.attachment)
      return { type: 'image', name: ref.attachment.name ?? 'image', mediaType: stored.ref.mediaType, data: Buffer.from(stored.data).toString('base64') }
    }
    if (ref?.type === 'file') {
      const chunks = []
      let size = 0
      for await (const chunk of ctx.attachments.readFileStream(ref.attachment)) {
        size += chunk.byteLength
        if (size > 25 * 1024 * 1024) throw new OpError('attachment-too-large', 'file exceeds 25 MiB', 413)
        chunks.push(Buffer.from(chunk))
      }
      return { type: 'file', name: ref.attachment.name ?? 'file', mediaType: 'application/octet-stream', data: Buffer.concat(chunks).toString('base64') }
    }
    throw new OpError('bad-request', 'unsupported attachment type', 400)
  }

  async function descendantsOf(sessionId) {
    const subagents = ctx.get('subagents')
    if (subagents === undefined) return []
    try {
      const list = await subagents.listDescendants(sessionId)
      return list.filter(entry => entry.kind === 'child' && entry.mode !== 'external').map(entry => entry.id)
    } catch { return [] }
  }

  async function purge(sessionId) {
    const table = await bin()
    const record = table.get(sessionId)
    if (record === undefined) throw new OpError('not-in-bin', 'only sessions in the recycle bin can be deleted permanently', 404)
    if (!ctx.workspaceRegistry.archivedSessionIds.includes(sessionId)) { await table.delete(sessionId); return false }
    const ids = [...new Set([...(await descendantsOf(sessionId)), ...(record.descendants ?? [])])].reverse()
    ids.push(sessionId)
    for (const id of ids) await purgeOne(id)
    await table.delete(sessionId)
    return true
  }

  async function purgeOne(id) {
    const reg = ctx.workspaceRegistry
    try { await reg.archiveSession(id, { stopActivity: true }) } catch { /* unknown or archived */ }
    try { await ctx.parallel('workspace/session-stop', { sessionId: id }) } catch { /* no providers */ }
    const live = ctx.sessions.get(id)
    if (live !== undefined) await ctx.sessions.flush(live).catch(() => {})
    const info = await ctx.sessionPersistence.stat(id).catch(() => undefined)
    const path = info?.location?.path
    if (typeof path === 'string') {
      const dir = dirname(path)
      if (basename(dir) !== id || basename(dirname(dirname(dir))) !== 'sessions') throw new OpError('unsafe-path', `refusing to delete unexpected path for ${id}`, 500)
      await rm(dir, { recursive: true, force: true })
      if (await fsStat(dir).then(() => true, () => false)) throw new OpError('delete-failed', `could not delete ${id}`, 500)
    }
    for (const service of [ctx.get('agents'), ctx.sessions]) {
      const entry = service?.store?.get?.(id)
      if (entry !== undefined && typeof service.detachEntered === 'function') {
        try { service.detachEntered(entry) } catch { /* best effort */ }
      }
    }
    await ctx.storageDomain.get('session_projcache')?.table('sessions').delete(id).catch(() => {})
    await reg.unarchiveSession(id).catch(() => {})
    await reg.unpinSession?.(id)?.catch?.(() => {})
    for (const workspace of reg.list()) {
      if (workspace.sessionIds?.includes?.(id)) await workspace.detachSession(id).catch(() => {})
    }
  }

  // ---------- authenticated route ----------
  ctx.effect(() => {
    const dispose = ctx.connection.fetch.register({
      path: OP_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        let body
        try { body = await request.json() } catch { return Response.json({ ok: false, code: 'bad-request', message: 'invalid JSON' }, { status: 400 }) }
        const op = ops[body?.op]
        if (op === undefined) return Response.json({ ok: false, code: 'bad-request', message: 'unknown operation' }, { status: 400 })
        const key = typeof body.sessionId === 'string' ? body.sessionId : '__bin__'
        try {
          const value = await serialized(key, () => op(body))
          return Response.json({ ok: true, value })
        } catch (error) {
          const known = error instanceof OpError || error instanceof PlanError
          const status = error instanceof OpError ? error.status : known ? 409 : 500
          if (!known) ctx.logger?.warn?.(`dsh-chat-plus: ${body.op} failed: ${error?.stack ?? error}`)
          return Response.json({ ok: false, code: error?.code ?? 'failed', message: String(error?.message ?? error) }, { status })
        }
      },
    })
    return () => { Promise.resolve(dispose()).catch(() => {}) }
  })
}
