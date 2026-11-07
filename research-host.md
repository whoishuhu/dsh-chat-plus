# dsh-chat-plus Host 侧机制调研

DSH 版本：0.2.2-rc.1。路径前缀 `DSH = C:\Users\009\AppData\Local\Programs\DeepSeek Harness\resources\app.asar\dsh\node_modules\@deepseek-ai\`。

---

## 1. surface replace：被遮蔽节点能否恢复？多版本切换方案

### 结论

- **不能恢复可见。** replace 的 `startSeq`/`endSeq` 必须是**当前 surface 中的节点**；被遮蔽的 seq 已从 `state.nodes` 中移除，再引用会抛错 `start seq N not found in surface`。replace 是"连续一段当前节点 → 1 个新节点"（splice），没有 un-shadow 操作。
- **`assistant/message` 不能当替换节点。** replace 要求 `sourceEventSeqs` 必须包含每个被遮蔽节点，而 `assistant/message` 禁止携带 `sourceEventSeqs`，所以任何 `assistant/message` + replace 都会失败。能作替换节点的只有 `user/message`、`developer/message`、`system/message`（覆盖 node 0 时有限制）以及 `tool/result`（只能 1:1 改写一个 tool/result 的 content）。
- **最安全的"隐藏"节点**是**空内容的 `developer/message`**：它投影为 `null`（不产生模型消息），而且允许携带 `sourceEventSeqs`。空 `user/message` 仍然会进入模型；空 `assistant/message` 虽然会被丢弃，但不能用于 replace。
- **"重新 append 原事件副本"恢复旧版本**：只能 `append` 到 surface **末尾**，不能插回原位置。对"最后一轮"来说，末尾就是原位置，所以技术上可行。但有以下风险：
  - `assistant/message` 必须内嵌 stream。Session 只校验它是无损 JSON，并且 `validateSessionEventData` 明确"不校验内嵌 provider stream"（surface.js:112-113），因此插件可以把原事件的 `data`（含 `stream`、`message`）原样复制。
  - 不过 `message.id` 会与原事件重复。还要考虑 turn/step 编号、tool-call 与 tool/result 的配对，以及 Chat UI 的显示：UI 把 append-origin 事件当作人类可见的转录（见 `isAppendSurfaceEvent` 的注释），所以副本会**再显示一遍**。
  - `tool/result` 以 append 方式写入：surface 层没有"必须在运行回合内"的检查（surface.js 的 plan 只校验 seq、marker 和来源）。Session/agent-loop 层是否有额外约束，见第 2 题。
  - 结论：可以做，但属于"伪造历史"，结构很脆弱，**不推荐作为主方案**。

### 依据（`DSH\dsh-session\lib\types\surface.js`）

- L85-87：`user/message` 直接返回 `event.data`，空内容的用户消息也会产生消息。
- L91-96：`system/developer/assistant` 的 `content.length === 0` 时返回 `null`。
- L190-199：replace op 只能恰好是 `{op,startSeq,endSeq}` 三个键。
- L231-234：`assistant/message embeds its source stream and cannot carry sourceEventSeqs`。
- L259-262：`sourceEventSeqs must include every shadowed surface node`。
- L301-304：`startSeq`/`endSeq` 必须小于当前事件的 seq。
- L310-327：`replacementRange` 用 `state.nodes.indexOf(...)` 定位，找不到就抛 `not found in surface`。
- L350-375：`tool/result` 的 replace 只能 1:1，并且只能改 `content`。
- L382-391：surface 的 node 0 若为 `system/message`，只能被覆盖恰好该节点的 `system/message` 替换。
- L436：`state.nodes.splice(startIdx, endIdx-startIdx+1, plan.seq)`，确认是"一段 → 一个节点"。
- L43-52：注释说明 replacement 副本只对模型可见，人类转录使用 append-origin 事件。

`SurfaceIntent` 类型（inspect `sessions`）：

```ts
type SurfaceIntent<T> = { surfaceOp: SurfaceOp } &
  (T extends 'assistant/message' ? { sourceEventSeqs?: never } : { sourceEventSeqs?: SessionSeq[] })
type SurfaceOp = 'append' | { op: 'replace'; startSeq: SessionSeq; endSeq: SessionSeq }
```

### 多版本切换：可选方案与取舍

| 方案 | 做法 | 优点 | 缺点 |
|---|---|---|---|
| **A. 候选存储在插件侧 + 末尾重放（推荐）** | 当前选中版本留在主会话 surface 中；未选中版本的原始事件（`assistant/message`、`tool/call`、`tool/result` 等完整 JSON）存进插件自己的存储（文件或 storage service），按 `sessionId + turn` 索引。切换版本时：用一个空 `developer/message` replace 掉当前最后一轮回复区段，然后 append 目标版本的副本（或者把它压平成一条纯文本 `assistant/message`）。 | 主会话始终是合法日志；卸载插件后会话仍能正常打开；模型只看到选中版本。 | 每切换一次就在日志里多一段历史（append-only）；UI 会把每次重放都显示成新内容，需要 Client 侧按插件元数据过滤或折叠；完整重放（含工具调用）时 id 重复。 |
| **A'. 压平为单条文本** | 切换时只写一条 `assistant/message`，内容为 `[{type:'text',text}]`，stream 用合成的单个 `text-chunks` 记录。 | 结构简单，没有 tool 配对问题。 | 丢失旧版本的工具调用细节（模型只看到最终文本）；同样受 replace 不能用 assistant 的限制，所以只能"先 replace 成空 developer，再 append assistant"，需要两个事件。 |
| **B. 候选版本 fork 到隐藏子会话** | 每次重新生成都 `sessions.fork(source, boundary)` 或 `sessionController.fork({sessionId, atSeq})`，在 fork 里运行，主会话只保存选中结果。 | 各版本都是完整、合法的会话。 | fork 出的会话会出现在会话列表中（`origin` 不是 subagent），需要隐藏；把结果"合并回"主会话仍要用方案 A 的重放；成本高。 |
| **C. `registerMessageProjection` 插件投影** | 声明 `@messageProjection` 事件，由投影改写消息。 | 原地改内容，不产生追加的历史。 | 需要新增事件类型（参见 practices.md：未知事件类型且没有 `ignorable` 时会话无法重新打开）；README 第 56 行写明 "Missing definitions reject append and restore; unloading a used definition also blocks cached reads"。**插件卸载后会话打不开或无法派生，不可接受。** 另外投影只能改已有节点的内容，不能新增或删除节点。 |

推荐：**A（软删除和切换都用"空 developer/message replace"，选中版本以副本 append 到末尾），候选数据保存在插件自己的存储中**。只有"最后一轮"才能做到位置上无损，这与需求一致（只对最后一轮重新生成）。

> **重要补充（Chat UI 行为，见第 3 题）**：Chat 只渲染 append-origin 事件，**不会隐藏被 replace 遮蔽的旧行**。所以"软删除""切换版本"在 UI 上的隐藏效果必须由 Client 半边自己实现。

---

## 3. 重新生成最后一轮

### 结论

- **方案 A（不加新用户消息直接再跑一轮）没有官方 API。** Agent 只能通过 `followup()`/`steer()` 唤醒（`inject()` 不会唤醒）。turn 开始后，如果 step 0 认领到的消息为空，就直接以 `completed` 结束，**不开 step、不调模型**（agent-loop `lib/index.js` L752-755）。没有 `resume()`/`continue()`/`regenerate()`。`agents.resume()` 只是从持久化中恢复 Agent，不会触发一轮。
  - 变通办法：`followup` 一条标记消息，再在 `agent/pre-step` 中改写。这样仍然会写入一条 user/message，属于 hack，不推荐。
- **推荐方案 B：** ① 用一个空的 `developer/message` replace 掉最后一轮从 `user/message` 到最后一个 surface 节点的整段；② 用原提问内容重新 `followup`。
  - Host 内部直接 `agent.followup(msg)` 即可。原 `user/message.content` 里的 `image`/`file` 块已经是落盘后的 `AttachmentRef`，可以直接复用，但需要一个新的 `id`。
  - `sessionController.prompt` 走的是 Client 上传回执（`PromptContentPart` + `fileUploads` receipt）流程，并按 `requestId` 去重，**不适合复用已落盘的附件**，更适合由 Client 发起"编辑后重发"。
- **Chat UI 显示**：输入消息 Definition 只匹配 `isAppendSurfaceEvent(event) && !isCompactionCheckpoint(event)` 的 `user/message`（`dsh-client-ui-chat/lib/client.js` L11955）。assistant/tool 行同样只认 `surfaceOp === 'append'`（L10201、L12503、L12778、L12879）。因此：
  - 替换节点（空 developer）不会显示；
  - **被遮蔽的旧 turn 仍然完整显示**，新一轮会作为新的 turn 出现在后面；
  - 隐藏旧 turn 和"版本切换器"都要由插件的 Client 半边完成。建议 Host 用 `ctx.sessionProjections` + `wire.view` 发布"隐藏的 turn/seq 集合与候选组"，Client 据此折叠或隐藏（具体 slot 见 Client 调研）。

### 关键签名（依据：`dsh-agent-loop/lib/index.js` L554-639，`ReactLoopAgent`）

```js
agent.status              // 'idle' | 'running'（maintenance 也算 idle）
agent.followup(message)   // 进 next-turn 并唤醒
agent.steer(message)      // 进 next-step 并唤醒
agent.inject(message)     // 进 next-step，不唤醒
agent.cancel(cause, { keepInbox }) // cause: {kind:'user'|'parent'|'disposed'} | {kind:'hook',reason}
agent.runMaintenance(async (signal) => ...) // 非 idle 时抛错；运行期间的唤醒会被锁存，结束后再执行
await agent.whenIdle()
```

`sessionController.prompt`（`dsh-api-session-controller/lib/index.js` L831-874、L4048-4061）：

```ts
prompt({ requestId, sessionId, mode: 'queue'|'steer', content: PromptContentPart[], clientTimeZone? }, signal)
// 内部：resolveAgent → attachments.admitPromptContent → createUserMessage({content, source:{kind:'user', rpcId, clientTimeZone?, principal?}})
//      → mode==='steer' ? agent.steer(msg) : agent.followup(msg)
```

`cancel`（L960-966）：`agent.cancel({kind:'user'}, {keepInbox:true})`，订阅代理会话会被拒绝。

`user/message` 只在 step 第一次尝试时写入（L860-866），位于 `step/start` 之后；runtime-context（`source.kind === 'runtime-context'`）同样是 `user/message`。

---

## 4. turn 结构与整轮遮蔽

### 一轮的事件顺序（依据：agent-loop L724-866）

`turn/start{turn}` → [`step/start{turn,step}` → `system/message`（可能有）→ `user/message`（提问 + runtime-context）→ `request/header`/`request/context`（需要时）→ `assistant/message{turn,step}` → `tool/call`（log-only）→ `tool/result{turn,step}` → `step/end`]×N → `turn/end{turn,reason}`

- 只有 surface 事件（system/developer/user/assistant/tool-result）能被 replace，也只需要 replace 它们。`turn/*`、`step/*`、`tool/call`、`request/*` 是 log-only 事件，不能也不需要覆盖。
- 遮蔽整轮：`startSeq` = 该轮第一个 surface 节点（通常是提问 `user/message`），`endSeq` = 该轮最后一个 surface 节点，二者都必须当前可见。整段包含成对的 tool-call/result，天然平衡。不要覆盖 node 0 的 system prompt。轮内追加的 system/message 可以被覆盖（session README L60）。
- **替换节点首选空 `developer/message`**：

```js
session.append('developer/message',
  { turn, step, message: { id: <新 MessageId>, role: 'developer', content: [] } }, // 无 tool-addition，所以不能带 headerSeq
  { surfaceOp: { op: 'replace', startSeq, endSeq }, sourceEventSeqs: [...被遮蔽的全部 surface seq] })
```

  - `assistant/message` **不能**作为替换节点（禁止 `sourceEventSeqs`）；
  - 空 `user/message` 会进入模型；
  - `tool/result` 只能 1:1 改写。
- compaction 的官方写法（服务描述，经 inspect `compaction`）：替换节点是 **`user/message`**，`source` 为 `compactCheckpointSource`（带 `CompactionId`），用 `compaction/start` → `compaction/summary` → replace `user/message` → `compaction/end` 包裹，并用 `toolPairingBalancedBefore/After` 检查边界。⚠️ compaction-basic 中写替换事件的具体代码行未能读到（工具审查服务 502/503 故障中断）。
- 待核实：`MessageBase` 的必填字段（应至少有 `id`；`createUserMessage` 来自 `@deepseek-ai/dsh-llm`）；替换节点的 turn/step 填原轮编号是否有校验。surface.js 未见校验。
- 副作用：replace 会使 `contentGeneration` +1，下一次请求开启新的 request series，KV cache 从被替换位置开始失效（session README L167；agent-loop L852）。

---

## 2. 从 Host 向未运行 / idle 会话 append（部分核实）

- `ctx.sessions.get(id)` 只返回**已加载**的 live Session；冷会话不在 store 中。
- **不要**用 `sessionPersistence.open(id,'write')` 直接写：它与 live 写者互斥（`SessionAlreadyOwnedError`），会绕过 surface 校验，也不会通知 UI。
- 推荐：`const r = await ctx.sessionController.resolveAgent(sessionId)`，它会解析并恢复冷会话，返回 `{agent}` 或 `{error: 'session/not-found'|'session/agent-busy'|'session/writer-held'|...}`（inspect）。然后在 `agent.status === 'idle'` 时用 `agent.runMaintenance(async signal => { agent.session.append(...) })` 写入，避免与运行中的轮次竞争。append 后可调用 `await ctx.sessions.flush(agent.session)`。
- `append` 签名：`append(type, data, opts)`，surface 事件必须带 `{surfaceOp}`；replace 必须带完整的 `sourceEventSeqs`；assistant 禁止带 `sourceEventSeqs`。
- UI 刷新：append 会派发 `session/event`，`sessionController.follow/observeEvent` 流实时推送到 Client（inspect 描述："gap-free durable event frames"），所以是实时的。但 Chat 不渲染替换节点，也不隐藏被遮蔽的节点（见第 3 题）。

---

## 5. 会话存储 / 回收站（部分核实）

- `sessionPersistence`（inspect）只有 `create/open/flush/stat/list`，**没有删除 API**。`stat(id)` 返回 `location?: {kind, path}`，可用来定位文件。
- `workspaceRegistry.archiveSession(sessionId, {stopActivity?})`：写入注册表全局的 archive 集合，同时取消置顶。不带 `stopActivity` 时，如果会话有活动则抛 `WorkspaceActiveSessionError`；带 `stopActivity` 时会通过 `workspace/session-stop` 停止会话（`agent.cancel({kind:'user'})`，不保留 inbox，见 dsh-agent `lib/index.js` L29-40）。archive 集合会被 `agent/pre-step` 门禁读取，阻止被归档会话再次被唤醒。`unarchiveSession` 恢复原位置。Client 侧对应 `workspaceController.archiveSession/unarchiveSession`（@Remote）。
- 子代理：`subagents.listDescendants(rootSessionId)` 返回先序、带 `parentId/depth` 的条目，不会加载 Agent。停止方式：`subagents.interrupt(id, {kind:'user', parentSessionId})` 或 `interruptByParent`。释放：`drainChildren(parent, ids)`。
- 普通会话停止：`sessionController.cancel({sessionId})`。`AgentHandle.dispose()` 只有创建者持有，插件无法卸载别人的 Agent。
- **推荐的回收站做法**：移入回收站 = `archiveSession(id, {stopActivity:true})`（根会话加所有后代）+ 在插件自己的存储表中记录 `{id, trashedAt, descendants}`；还原 = `unarchiveSession`；永久删除 = 确认没有 live Agent 后，按 `stat().location.path` 删除 jsonl。风险：projection cache、sqlite 查询索引、工作区注册表中会留下残留，需要进一步核实。**不建议**把会话文件移动到插件目录（list/索引会出现不一致）。
- ⚠️ 未完成：jsonl 目录结构、projection-cache 位置、`storages/workspace.json` 记录格式（工具故障）。

---

## 6. Host 向 Client 暴露接口（部分核实）

- `@Remote` 依赖 TS 装饰器和 typert 代码生成（各包附带生成的 `lib/typert.host.js`），**纯 JS 插件难以使用**。`typert.register(contribution)` 存在，但需要 schema，未核实。
- `webServer.register({kind:'exact'|'prefix', path, handler(req,res)})` 在纯 JS 中可用，但需要自行处理鉴权（`connection.admit/requestRejection` 可用于校验）⚠️，否则就是一个未鉴权的本地端点。
- **推荐**：遵循 skill `user-actions.md`，用 `ctx.commands.register(definition)` 注册命令，Client 通过 `ctx.remote.commands.execute(agent, line, attachments, signal)`（`commands.execute` 是 @Remote，见 inspect）调用。纯 JS 可行，且鉴权、Agent 解析都由框架负责。同一操作再注册一个 agent tool 供模型调用。
