# DSH 0.2.2-rc.1 Host 端调研（二）

## 速览

1. **投影**：`const h = await ctx.sessionProjections.register({ key, stateSchema, stateVersion, init(header, inheritedEventCount), apply(state, event), wire?: { viewSchema, view, summary? } })`。schema 只需要提供 `.parse`；key 在运行时不校验，纯 JS 可以用任意 key，建议加前缀。Host 端用 `h.stateOf(session)` 读取。Client 端在 session 作用域 slot 的 prop 中用 `useProjection(key[, selector])` 读取，值尚未到达时为 `undefined`；也可以用 `ctx.sessions.binding(id)?.session.projections.faceOf(key)`。
2. **读事件**：`await ctx.sessionQuery.readEvent({ sessionId, seq, before: 0, after: 0 }) → { target: SessionEvent, events, session, ... }`。live 优先，刚 append 的事件也能读到；每次调用都会 clone 整份 live 日志。
3. **存储**：`defineDomain({ name: /^[a-z][a-z0-9_]*$/, version, tables: { t: domainTable(zodSchema) }, global?, layout? })`，`await ctx.storageDomain.open(spec)`。`table.get` 是同步的；`put/delete/update/deleteMany` 是 Promise。数据落在 `~/.dsh/storages/<name>.json`（per-record 布局为 `<name>/<table>/<key>.json`）。
4. **永久删除**：一个会话对应一个目录 `~/.dsh/sessions/<proj>/<id>/session.v4.jsonl.zstd`，`stat().location.path` 指向这个文件。要清理的还有投影缓存 `storages/session_projcache/sessions/<id>.json`（通过 domain 删除），以及 `workspace.json` 里的 archived、pinned、sessionIds。sqlite 索引在内存中，不用管。官方没有删除或释放 API：archive 之后会话仍在内存，只能用内部的 `store` + `detachEntered`（先 agents 后 sessions）；不 detach 就会出现幽灵行。删除时必须删整个目录，不能只删文件。顺序见 4e。
5. **子代理与归档**：`listDescendants` 返回扁平的前序数组 `{kind:'child', id, mode, label, parentId, depth, activity, hasChildren}` 或 diagnostic，不包含 fork。读归档用 `ctx.workspaceRegistry.archivedSessionIds`（同步 getter，没有 isArchived）。`unarchiveSession` 对不存在的会话是静默的幂等操作。

源码根目录：`%TEMP%\dsh-asar-research\<包名>\lib\...`（下文简写为 `<pkg>/lib/...`）。

## 1. `ctx.sessionProjections.register(definition)`

### 1.1 ProjectionDefinition 字段（运行时实际读取的字段）

`dsh-session-projection/lib/index.js:115-129`（`acquire`）把定义擦除为：

```js
const erased = {
  key: definition.key,
  stateSchema: definition.stateSchema,          // 需有 .parse(v)；restore/viewCheckpoint 时 parse 持久化行
  init: (header, inheritedEventCount) => definition.init(header, inheritedEventCount),
  apply: (state, event) => definition.apply(state, event),   // 同步；无关事件必须返回同一引用
  wire: wire === void 0 ? void 0 : {
    viewSchema: wire.viewSchema,                 // 需有 .parse(v)；每次发布前 parse(view(state))
    view: (state) => wire.view(state),           // 同步；Object.is 比较原始 view 决定是否发布
    summary: wire.summary !== false              // 默认 true：会进入会话列表行摘要
  },
  stateVersion: definition.stateVersion          // 非负安全整数，否则 throw（:129）
};
```

- 字段名是 `init`（不是 `initial`）。签名 `init(header, inheritedEventCount)`；新会话 seq===0 时在 `session/created` 里调用（`:67-78`）。
- 没有 `wire` = Host-only 投影，不会发给 Client。
- 同 key 再注册：`stateVersion` 或 `wire.summary` 不一致则拒绝（`:143-144`），一致则引用计数共享 cell。
- **key 没有任何运行时命名校验**（registry 只是 `Map<key, registration>`，`:132-140`）。TS 层面的 `SessionProjectionMap` 声明合并只影响类型，纯 JS 插件可以注册任意字符串 key。建议加插件前缀避免冲突，例如 `chatPlus.recycle`；不要和官方 key 重名（`title`、`goal`、`todos`、`inbox`、`plan`、`subagent`、`sessionStats`、`tokenUsage`、`turnOutline`、`imageLimits`、`contextPressure`、`contextBreakdown`、`sessionListMetadata`、`permissions`、`userQuestions`、`actionCards`……），否则会共享或拒绝。
- schema：官方用 zod（`import { z as z$1 } from "zod"`），运行时只调用 `.parse()`。纯 JS 插件可以用 `@deepseek-ai/schemastery`（`z.object(...)` 也有 `.parse`），也可以手写 `{ parse: v => v }`（这样会失去校验）。值必须可 JSON 序列化：它会被持久化到 projection-cache，也会经过 wire 发出。
- 规则（README.zh.md:54）：`apply` 必须同步；带状态的事件要携带变更后的完整状态，不要携带增量；对象或数组 view 要复用引用，避免无谓发布。

### 1.2 官方完整例子（带 wire）

`dsh-api-session-controller/lib/index.js:2694-2720`：

```js
this.listMetadata = await this.ctx.sessionProjections.register({
  key: "sessionListMetadata",
  stateSchema: sessionListMetadataSchema,
  init: () => ({ blank: true, lastPromptAt: null }),
  apply: applySessionListMetadata,
  wire: { viewSchema: sessionListMetadataSchema, view: (state) => state },
  stateVersion: 1
});
await this.ctx.sessionProjections.register({
  key: "imageLimits",
  stateSchema: z$1.null(),
  init: () => null,
  apply: (state) => state,
  wire: { viewSchema: imageLimitsSchema, view: () => this.ctx.attachments.imageLimits, summary: false },
  stateVersion: 1
});
```

`dsh-agent-loop/lib/index.js:21-62`（inbox，按事件类型折叠）：

```js
const inboxProjectionDefinition = {
  key: "inbox",
  stateSchema: inboxProjectionSchema,
  init: () => ({ "next-turn": [], "next-step": [] }),
  apply(state, event) {
    if (event.type !== "agent/inbox/spliced") return state;   // 无关事件返回同一引用
    const splice = event.data;
    ... return { "next-turn": next, "next-step": state["next-step"] };
  },
  wire: { viewSchema: inboxProjectionSchema, view: (state) => state },
  stateVersion: 1
};
// 注册：dsh-agent-loop/lib/index.js:1343
this.inboxProjectionHandle = await ctx.sessionProjections.register(inboxProjectionDefinition);
```

### 1.3 Host 端读取当前值

`register()` 返回一个可 await 的 thenable，await 后得到 handle（`index.js:156-164`）：

```js
const handle = {
  async dispose() { await dispose(); },
  stateOf: (session) => this.cellFor(registration, session).state,   // 同步读取 state（不是 view）
  readerFor: (session) => () => handle.stateOf(session)
};
```

- 推荐写法：`const h = await ctx.sessionProjections.register(def); h.stateOf(session)`。参数是 Session 对象（例如 `ctx.agents.get(id)?.session`，以实际服务为准），不是 id。
- 读 wire 视图（一致切面）：`ctx.sessionProjections.snapshot(session, keys?) → { asOfSeq, values }`（`:232-246`），只计算选中的 key。
- 订阅：`onChanged(listener)` 每个单元变化调用一次；`onEventChanged(listener)` 每个事件调用一次（`:193-220`）。两者都返回 disposer。
- 已弃用：`stateOf(session, key)`（会 warn）、`cachedSnapshot(session, keys)`。
- 插件卸载时，fiber 会自动释放注册；也可以手动 `await h.dispose()`。
- 依赖：插件 `inject` 要包含 `sessionProjections`；如果是可选依赖，用 `ctx.inject(['sessionProjections'], ...)`。

### 1.4 Client 端读取 wire 值

**数据链路**：Host `snapshot`/`onChanged` → 会话控制流 → Client `ProjectionValueStore`（`dsh-api-session-controller/lib/types/client/sessions/projection-store.js`）。

- `faceOf(key)` 返回身份稳定的 `{ getSnapshot, subscribe }`；**从未出现过的 key → `getSnapshot()` 返回 `undefined`**（注释 :11、:23-31、:153），可以在值到达前先订阅。
- `get(key)`、`values()`、`seqOf(key)`、`subscribeAny(listener)`。

**slot 组件 prop `useProjection`**：由 `dsh-client-ui-session/lib/client.js:755-764` 的 BUILTIN_SOURCE 提供，只在 session 作用域的 slot 中注入：

```js
const BUILTIN_SOURCE = {
  hooks: ["session"], keyedHooks: ["projection"], props: ["sessionId"],
  resolve: (binding) => ({
    hooks: { session: binding.session },
    keyedHooks: { projection: (key) => binding.session.projections.faceOf(key) },
    props: { sessionId: binding.sessionId }
  })
};
```

renderer 把 keyedHooks `projection` 变成 prop `useProjection`（`dsh-client-ui-renderer/lib/client.js:245-284`, `keyedObservableHook`），支持以下调用形式：

```js
useProjection(key)                       // → 当前值；未就绪/未注册时为 undefined
useProjection(key, selector, equal?)     // → selector(value)（value 可能为 undefined，selector 要处理）
```

内部实现是 `useSyncExternalStore` 风格的 observableHook（`source(key) ?? absentSource`；absentSource.getSnapshot 返回 `undefined`）。

官方用法：
- `dsh-client-ui-goal/lib/client.js:369-371`：`function GoalDock({ useProjection, ... }) { const projection = useProjection("goal"); const goal = projection === void 0 || projection === null ? projection : projection.goal;`
- `dsh-client-ui-conversation/lib/client.js:21776`：`useProjection("goal", (goal) => goal != null)`
- `:22347`：`todos: useProjection("todos") ?? []`

**非组件代码 / 非 session slot**：`ctx.sessions.binding(sessionId)?.session.projections.faceOf(key)?.getSnapshot()`（`dsh-client-ui-goal/lib/client.js:686`），订阅用 `.subscribe(listener)`。

**注意**：
- `undefined` = 能力缺席或尚未收到；`null` 是插件自己的 view 值。
- 会话列表（未打开的会话）只携带 summary key 的 cached 值（`applyCached`）；打开后由 sequenced 值覆盖。
- 纯 JS 的 Client 插件同样可以用任意字符串 key，只是没有类型提示。

## 2. Host 端按 seq 读取事件：`ctx.sessionQuery.readEvent`

精确签名（Inspect `sessionQuery`）：

```ts
readEvent(request: SessionEventReadRequest, signal?: AbortSignal): Promise<SessionEventWindow>
interface SessionEventReadRequest { sessionId: SessionId; seq: SessionSeq; before?: number; after?: number }
interface SessionEventWindow {
  session: SessionHeader; inheritedEventCount: SessionLogOffset;
  target: SessionEvent;            // { type, seq, time, data, ignorable?, surfaceOp?, sourceEventSeqs? }
  events: SessionEvent[];          // [startSeq..endSeq] 窗口（含 target）
  startSeq: SessionSeq; endSeq: SessionSeq;
}
```

实现：`dsh-session-query/lib/index.js:1210-1234`。

```js
async _readEvent(sessionId, seq, before, after, signal) {
  const loaded = await this._corpus.load(sessionId, signal);
  const target = loaded.events[seq];
  if (target === void 0 || target.seq !== seq) throw new SessionQueryError(`session "${sessionId}" has no event at seq ${seq}`, "SESSION_QUERY_EVENT_NOT_FOUND");
  ...
  return { session: structuredClone(loaded.header), inheritedEventCount, target: targetSnapshot, events, startSeq, endSeq };
}
```

- before/after 默认是 0，上限为配置项 `readWindowMax`（默认 50，`:1049`），越界时抛 `SESSION_QUERY_INVALID_WINDOW`。
- 错误码：会话不存在为 `SESSION_QUERY_SESSION_NOT_FOUND`，seq 不存在为 `SESSION_QUERY_EVENT_NOT_FOUND`（`err.code`）。
- **live 优先，刚 append 的事件可立即读到**：`corpus.load()`（`:128-157`）先读 `ctx.sessions.get(id)`；只要会话在内存里，就用 `snapshotLive(live)` 读内存日志（`:302-306`，内部调用 `session.snapshotEvents()` 并做 structuredClone），**完全不走持久化**。只有不在内存时才 list 并 inspect 持久化数据，而且 inspect 完成后会再次检查是否已 attach。
- 代价：每次调用都会 structuredClone 整个 live 日志（`snapshotLive` 克隆全部事件，之后再 slice）。长会话里高频调用开销较大。
- 官方用法：`dsh-client-ui-deliverables/lib/index.js:113-121` `ctx.sessionQuery.readEvent({ sessionId: id, seq, before: 0, after: 0 }, request.signal)`。
- 其它可选：`readSession(id)` 读完整日志；`listEvents(id)` 只返回轻量记录（不含 data）；`observeSession(id, {projectionMode:'none'})` 返回 lease（`events` 只读，不 clone，用完要 `[Symbol.dispose]()`）。高频读取时，可以用 observeSession 拿一次 lease，再按 `events[seq]` 读。
- 如果插件只关心自己写的事件，更好的办法是在 projection 的 `apply` 中折叠，或者监听 `ctx.on('session/event', (session, event) => ...)`。这样不需要回读。

## 3. `ctx.storageDomain.open(spec)`

### 3.1 DomainSpec（`dsh-storage-domain/lib/index.js:46-91`）

```js
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import { z } from "zod";            // 记录 schema 运行时只调用 .parse / .safeParse（global 会调用 safeParse(null)）
const spec = defineDomain({
  name: "chat_plus_recycle",        // 必须匹配 UNIT_NAME_RE = /^[a-z][a-z0-9_]*$/（dsh-storage/lib/index.js:80；不能用 '-'、大写或 '.'）
  version: 1,                       // 非负整数
  compatibleVersions: [],           // 可选：小于 version 的旧版本也可以读
  layout: "per-record",             // 可选，'single'(默认，一个 <name>.json) | 'per-record'(<name>/<table>/<key>.json)
  invalidRecords: "backup-and-skip",// 可选：坏记录移到旁边并跳过，不让整个 open 失败
  global: { schema: z.object({...}), initial: {...} },   // 可选单例；schema 不能接受 null
  tables: { items: domainTable(z.object({ ... })) }       // 表名同样受 UNIT_NAME_RE 约束
});
```

- `defineDomain` 只做校验，返回原对象（`:61-76`）。纯 JS 中也可以直接写对象字面量，但用 defineDomain 能更早报错。
- 需要 `zod`：dsh-session-clean-delete 在 package.json 中声明了 zod 依赖；也可以借宿主的 zod（以 import 能否解析为准）。schemastery 的 `.parse` 也能用，但官方注释写的是 zod。

### 3.2 读写 API（`index.js:111-323`）

```js
const domain = await ctx.storageDomain.open(spec);   // 同名第二次 open → DomainError('already-open')
const t = domain.table("items");
t.get(key)              // 同步，从内存读取；没有该记录时返回 undefined
t.entries() / t.keys()  // 同步迭代器
t.size                  // 同步
await t.put(key, value)           // 持久化之后才更新内存，然后发 domain/changed
await t.delete(key)               // → boolean（不存在时为 false）
await t.deleteMany(keys)          // → 删掉的数量
await t.update(key, fn)           // key 不存在时 DomainError('missing-key')
domain.global.get() / await domain.global.set(v)
await domain.close()              // 幂等；建议 ctx.effect(() => () => domain.close())
ctx.storageDomain.get(name)       // 诊断用：按名字拿已经打开的 domain（无类型）
```

- 写入在每个 domain 的单条写链上串行执行（`enqueue`，`:224-238`），先持久化、再改内存、再 emit `ctx.on('domain/changed', {domain, table, key, operation:'put'|'deleted', value?})`。
- per-record 布局下 key 必须匹配 `[a-zA-Z0-9_-]+`（storage-json README）。会话 id 满足这个要求。
- 插件重载后，前一次 open 若没有 close，会出现 `already-open`。clean-delete 的写法是 open 失败后退回 `ctx.storageDomain.get(name)`。

### 3.3 官方例子

`dsh-workspace/lib/index.js:255-268, 380`：

```js
const workspaceDomainSpec = defineDomain({
  name: "workspace", version: 2,
  global: { schema: workspaceDomainState, initial: { initialized: false, workspaceIds: [], archivedSessionIds: [], pinnedSessionIds: [] } },
  tables: { workspaces: domainTable(workspaceRecord) }
});
const domain = await this.ctx.storageDomain.open(workspaceDomainSpec);
```

`dsh-session-projection-cache/lib/index.js:90-99,151`：`name: "session_projcache", layout: "per-record"`，表名为 `sessions`。

社区例子（dsh-session-clean-delete lib/index.js）：`defineDomain({ name: "session_locks", version: 1, compatibleVersions: [], invalidRecords: "backup-and-skip", layout: "per-record", tables: { locks: domainTable(z.object({ lockedAt: z.number().int().nonnegative() })) } })`，写法 `table.put(id, {lockedAt: Date.now()})` / `table.delete(id)`。

### 3.4 落盘位置（storage-json 后端，根目录为 `C:\Users\009\.dsh\storages`）

- single：`<root>/<name>.json`，`dsh-storage-json/lib/index.js:183-184`。实际文件有 `storages\workspace.json`、`storages\schedule.json`。
- per-record：`<root>/<name>/<table>/<key>.json`，global 存为 `<root>/<name>/global.json`（`:290-328, 413, 564`）。实际文件为 `storages\session_projcache\sessions\<sessionId>.json`。
- 所以 `name:"chat_plus_recycle"` 的 single 布局会写到 `C:\Users\009\.dsh\storages\chat_plus_recycle.json`。（路由由 storage-domain 的 `backend/routes` 配置决定；本机 desktop profile 走 json 后端，以 storages 目录中的实际文件为准。）

## 4. 永久删除会话

### 4a. jsonl 持久化布局

- 路径函数（`dsh-session-persistence-jsonl/lib/index.js:907-944`）：`projectDir = <root>/<projectKey(cwd)>`（没有 cwd 时为 `_no-cwd`）；`sessionDir = <projectDir>/<encodeSegment(id)>`，**一个会话对应一个目录**；日志文件为 `<sessionDir>/session.v4.jsonl.zstd`（当前格式 v4；历史格式依次为 `session.jsonl.zstd`、`session.v1..v3.jsonl.zstd`，`compression:'none'` 时不带 `.zstd`）。
- 写锁（README.zh.md:168）：POSIX 是同目录下的 `session.lock`；**Windows 用命名内核信号量，磁盘上不留文件**。
- 本机实际情况（只读列出）：`C:\Users\009\.dsh\sessions\--C-Users-009-Documents-deepseek-harness-default-workspace--\<id>\session.v4.jsonl.zstd`，每个目录只有这一个文件。主会话 id 为 `session-<uuid>`，子代理为裸 uuid（例如 `262e045d-...`）。**子代理与父会话是同级目录，不嵌套。**
- `sessionPersistence.stat(id)`（`:2570-2600`）返回 `{ header, formatStatus?, revision, sizeBytes, location: { kind: "jsonl", path } }`。**`location.path` 指向日志文件，不是目录**，目录要取 `dirname(path)`。不存在时为 `undefined`；pending（未实体化）会话只有 `{header, revision}`。
- `sessionPersistence.locate(header)`（`:2450-2455`）：同步拼出当前格式文件路径，不访问磁盘。
- **官方没有删除 API**（README.zh.md:167：「不删除会话文件……seam 无删除接口」）。

### 4b. 投影缓存与 sqlite 索引

- projection-cache：domain `session_projcache`（per-record，表名 `sessions`），文件在 `C:\Users\009\.dsh\storages\session_projcache\sessions\<id>.json`（已核实）。**没有淘汰或清理接口**（README.zh.md:127），删掉日志后记录会留下。
  - 清理方式：`await ctx.storageDomain.get("session_projcache")?.table("sessions").delete(id)`，内存与磁盘会同步。直接 rm 文件会造成内存与磁盘不一致。
  - 会话还在内存时，turn/end 或释放时写检查点会把记录写回来（README:57「会话释放保存活会话的最终切面」）。**所以要在 detach live 之后再删缓存。**
- sqlite 索引：desktop profile 通过 `@deepseek-ai/dsh-experimental-session-search/cordis.patch.yml` 挂载，配置为 `path: ':memory:'`、`openAt: first-search`。它**完全在内存中，磁盘上没有文件**，每次搜索前都会和持久化快照对账，已删除的来源会被移除（sqlite README.zh.md:104）。**不需要清理。**
- 附件 `~/.dsh/attachments/v1/objects` 是内容寻址、跨会话共享的。所有方案都不回收它。

### 4c. live 会话的内存生命周期

- `archiveSession(id, {stopActivity:true})`（`dsh-workspace/lib/index.js:526-542`）的作用：写 `archivedSessionIds`、取消置顶、`parallel('workspace/session-stop', {sessionId})`，停掉 turn、子代理、job 和提醒。**它不会把 Session/Agent 移出内存**：`ctx.sessions.get(id)` / `ctx.agents.get(id)` 仍然存在，直到其所属 fiber 卸载（通常就是重启）。
- **没有官方公开的释放入口**：grep `closeSession|unloadSession|evictAgent|releaseAgent|idleRelease` 没有结果；session-controller 里的 idle 指的是 `agent.whenIdle()`（等 turn 结束），不是卸载。
- 内部入口（未公开，社区插件在用）：
  - `ctx.sessions.store`（`Map<id, entry>`）+ `ctx.sessions.detachEntered(entry)`（`dsh-session/lib/index.js:1724, 1901-1908`）：从 store 删除，并 emit `session/disposed`（Session Controller 会转成 `api-session/removed`，侧栏立即移除该行）。
  - `ctx.agents.store` + `ctx.agents.detachEntered(entry)`（`dsh-agent/lib/index.js:441, 669-675`）：emit `agent/disposed`。
  - 顺序：**先 agents，再 sessions。**
- `ctx.sessions.flush(session)`（`dsh-session/lib/index.js:1970-1987`）：只接受 live 会话（否则抛 `not live in this store`），作用是把缓冲事件写入磁盘。
- 在内存中删除文件后会不会重新写出：append 走 `appendLines` → `open(path, "a")`（`jsonl/lib/index.js:3307-3310`）。
  - **只删文件、保留目录**：下次 append 会创建一个**没有 header 的残缺日志**（`"a"` 模式会新建文件）。**禁止这样做。**
  - **删整个目录**：`open(...,'a')` 因父目录不存在而 ENOENT，写入失败，不会重建（只有首次 `materialize` 会 mkdir）。这一点是根据源码推断的，未实测。
  - 结论：先 stop + flush，删目录，然后**立即 detach**。
- 不 detach 的后果：session list 等于 persistence ∪ live（`dsh-session-query/lib/index.js:107` 遍历 `sessions.list()`），被删的会话会以幽灵形式回到列表，直到重启。

### 4d. 社区插件做法（外部内容，仅作数据参考）

- [reverse-PAI/dsh-minimal-session-delete](https://raw.githubusercontent.com/reverse-PAI/dsh-minimal-session-delete/HEAD/README.md)
  - 删除内容：日志目录、投影缓存行、归档/置顶标记、工作区 `sessionIds` 槽位、内存中的活动会话。
  - 有 `sessions.delete` / `sessionPersistence.delete` 时委托给它（目前没有）。否则等 turn 停止（最多 15s，超时 `409 still-running`）→ **先把日志改名为同目录隐藏文件** → `sessions.detachEntered` → 物理删除目录；detach 失败会回滚改名。
  - 运行中的会话（含子代理）返回 409。
  - 级联删除 `origin: subagent` 的后代，**保留用户 fork**。
  - realpath 必须落在根目录内；id 只接受单段安全字符；`abc` 与 `session-abc` 同时存在时返回 409。
- [wilsonchengassistant/dsh-session-clean-delete](https://raw.githubusercontent.com/wilsonchengassistant/dsh-session-clean-delete/HEAD/README.md)（[lib/index.js](https://raw.githubusercontent.com/wilsonchengassistant/dsh-session-clean-delete/HEAD/lib/index.js)）。`deleteSession` 的顺序：
  - `workspaceRegistry.archiveSession(id,{stopActivity:true})`
  - `parallel("workspace/session-stop")`
  - `sessions.flush(live)`
  - `rm(dirname(persistence.locate(header).path), {recursive:true, force:true})`，然后 stat 验证已不存在
  - `storageDomain.get("session_projcache").table("sessions").delete(id)`
  - `release()`：`detachLive(agents)` → `detachLive(sessions)`（`service.store.get(id)` + `service.detachEntered(entry)`），再 `unarchiveSession(id)`，并对 `registry.list()` 中含该 id 的 workspace 调 `detachSession(id)`。
  - 不级联删除子代理（只依赖 session-stop 停掉它们）。
  - 注：它在 release 之前删缓存，存在被检查点写回的窗口。
- [Lzcdebear/better-dsh-session-deletetool](https://raw.githubusercontent.com/Lzcdebear/better-dsh-session-deletetool/HEAD/README.md)
  - 删除内容：日志目录、Workspace 记录、归档/置顶、投影缓存记录。
  - 删除前查询 `workspace/session-activity`，用户确认后才 stop。
  - 按 `parentSession` 构建家族树，可以选择删除子代理和 fork。
  - 目录通过 `sessionPersistence.locate` 获得。
- [xqh-jason/dsh-sidebar-delete](https://raw.githubusercontent.com/xqh-jason/dsh-sidebar-delete/HEAD/README.md)
  - 删除内容：`sessions/<proj>/<id>/` 与 `storages/session_projcache/sessions/<id>.json`，并调用 `unarchiveSession` / `unpinSession` / `Workspace.detachSession`。
  - 有开着的 turn（含子会话）时拒绝，不做任何改动；闲置 agent 可以删。
  - **不 detach live**：只用 `api-session/removed` 移除侧栏行，并承认重载后可能出现幽灵行，重启后才干净。
  - 级联删除 fork 与 subagent。
  - 它指出：启动时 archived 集合**不会**自动修剪失效 id，必须在删除时主动清理。
- 共同点：都不动附件；都要手动清理 `archivedSessionIds` / `pinnedSessionIds` / `workspaces.*.sessionIds`，否则 `workspace.json` 会留下失效 id。

### 4e. 推荐的永久删除步骤（Host 端）

1. **确定范围**：`ctx.subagents.listDescendants(rootId)` 中取 `kind==='child' && mode!=='external'` 的 id，加上 rootId。建议只级联子代理，保留用户 fork；如果确实要级联 fork，用 `sessionQuery.filterSessions([{kind:'parent', values:[id]}])`。
2. **安全检查**：重新读 `ctx.workspaceRegistry.archivedSessionIds`，确认 rootId 确实在回收站（已归档）里。对每个 id 执行 `await ctx.waterfall('workspace/session-activity', {sessionId:id}, () => Promise.resolve([]))`；返回非空时拒绝，或者请用户确认后再 stop。
3. **逐个处理，先叶子后父会话**：
   1. `await ctx.workspaceRegistry.archiveSession(id, {stopActivity:true})`：关闸，并 stop 子代理、job 和提醒。已归档的 id 会直接返回、不会 stop，所以再补一次 `await ctx.parallel('workspace/session-stop', {sessionId:id})`。
   2. `const live = ctx.sessions.get(id); if (live) await ctx.sessions.flush(live)`
   3. `const st = await ctx.sessionPersistence.stat(id)`；路径取 `st?.location?.path ?? ctx.sessionPersistence.locate(header).path`，目录 `dir = dirname(path)`。要校验 `basename(dir)` 对应 id，且 `realpath(dir)` 在会话根目录之下。
   4. `await fs.rm(dir, {recursive:true, force:true})`，然后确认 `stat(id) === undefined` 且目录已不存在。
   5. 立即释放内存（内部 API，先判断存在性）：`for (const svc of [ctx.get('agents'), ctx.sessions]) { const e = svc?.store?.get?.(id); if (e && typeof svc.detachEntered === 'function') svc.detachEntered(e) }`
   6. 在 detach 之后删缓存：`await ctx.storageDomain.get('session_projcache')?.table('sessions').delete(id)`
   7. 清理注册表：`await ctx.workspaceRegistry.unarchiveSession(id)`、`await ctx.workspaceRegistry.unpinSession(id)`；对 `ctx.workspaceRegistry.list()` 中 `ws.sessionIds.includes(id)` 的项调用 `await ws.detachSession(id)`。
   8. 可选：用户自己的回收站 domain 记录也一并删除。
4. **降级**：如果 `store`/`detachEntered` 不存在，标记为「文件已删，重启后完全消失」，客户端隐藏该行。不要在 detach 失败后只留下目录或只删文件。
5. 项目目录 `--<cwd>--` 变空后可以保留（框架本身也会留下空目录）。

## 5. `listDescendants` 与 workspaceRegistry 归档集合

### 5a. `ctx.subagents.listDescendants(rootSessionId, signal?)`

实现在 `dsh-subagent/lib/index.js:2380-2446`。它通过 `sessionQuery.observeSession` 读取每个父会话的 `subagentCatalog` 投影（不加载 Agent），按前序 DFS 遍历并用 visited 去重。返回 `Promise<Array<Child | Diagnostic>>`：

```ts
{ kind: 'child', id, mode: 'one-shot' | 'continuable' | 'external', label?: string,
  parentId, depth /*从 1 开始*/, activity: 'running' | 'inactive', hasChildren: boolean }
{ kind: 'diagnostic', id, parentId, depth, reason: 'corrupt' | 'unavailable' | 'unsupported' }
```

- 字段来自 catalog schema（`:709-729`），去掉 `createdAt` 后加上 `parentId/depth/activity/hasChildren`（`:2429-2437`）。
- **`activity` 只表示 `sessions.get(id)` 是否存在**（是否在内存），不代表正在执行 turn。判断是否在运行要用 `workspace/session-activity`。
- `mode:'external'` 是外部执行（例如 codex），没有本地会话目录。
- 缺少 `sessionQuery`、sessions 或 `subagentCatalog` 投影时，抛 `SubagentError`，code 为 `SUBAGENT_CONTROL_*`；取消时 code 为 `CANCELLED`。
- **不包含用户 fork。** 如需 fork 树，用 `sessionQuery.traceSession(id)`，它返回 `{target, ancestors, descendants: SessionLineageNode[]}`。

### 5b. 读取 archived 集合

- `ctx.workspaceRegistry.archivedSessionIds`：getter，同步返回 `readonly SessionId[]`，按归档顺序（`dsh-workspace/lib/index.js:506-508`）。
- `pinnedSessionIds` 同上（`:568-570`）。
- **没有 `isArchived()`**，用 `archivedSessionIds.includes(id)`。
- 其他方法：`list()` / `get(id)` 返回 Workspace 实体（`id/path/title/sessionIds`，`attachSession/detachSession/insertSessionBefore/setTitle/status`）；`pinSession/unpinSession`。
- 数据保存在 domain `workspace` 的 global 中，文件为 `C:\Users\009\.dsh\storages\workspace.json`。**不要直接读写该文件**：内存才是权威，外部改动不会被进程感知，下次写入还会覆盖它。
- 变更通知：`ctx.on('domain/changed', c => c.domain === 'workspace' && c.table === '')`（global 写入时 table 为空字符串）。

### 5c. 对不存在的会话调用 `unarchiveSession`

`:553-562`：**不检查会话是否存在**。id 不在集合中时直接 resolve，不写入；在集合中则移除并持久化。注释原文：「an entry whose session is gone still resolves」。因此它可以安全清理失效 id。`unpinSession`、`Workspace.detachSession` 同样幂等，也不做存在性检查。相反，`archiveSession`/`pinSession` 对未知会话会抛 `WorkspaceUnknownSessionError`（`:529`）；`sessionKnown` 的判定是 live 或 persistence list 中存在。
