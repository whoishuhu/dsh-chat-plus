# dsh-chat-plus：Client 扩展点调研（DSH 0.2.2-rc.1）

调研方法：Client inspect（Slots/Service）两次超时（页面未连接），改为用 Python 按 asar 格式把相关包解到 `%TEMP%\dsh-asar-research\` 读源码。注意：安装包**不含** `lib/types/**/*.d.ts`（package.json 声明了但文件不存在），类型只能从 `lib/client.js` 的 JSDoc 和 README 推断。下文行号均指该临时解包目录下的文件。标「未核实」的条目建议在页面连上后用 `Slots.listSubTree` 复核。

---

## 1. 用户消息气泡下方操作条（时间 + 复制）

结论：由 `@deepseek-ai/dsh-client-ui-chat` 渲染，**没有任何官方扩展点**能往这一行加按钮。

依据（`dsh-client-ui-chat/lib/client.js`）：
- `MessageIconActions`（L5955–6006）：渲染 时间（`clock==="start"` 在前）→ 复制 → `extraActions` → 分支 → usage。
- `UserStyleBubble`（L6157–6197）：子元素依次为 `renderSlotChain("conversation.chat.user.before", {source, kind})`、`renderFactorySlot("conversation.chat.user.content", {...})`、`actions?.(prepared.text)`。
- `UserMessageNodeView`（L6268–6288）的 `actions` 写死为 `MessageIconActions({ text, time: data.time, clock: "start", className, t })`，**不传 `extraActions`**。
- `extraActions` 唯一的调用方是 `TurnTailNodeView`（L9046–9061），即助手完成轮次的 footer。
- 注册（L9238–9252）：`conversation.chat.node` key `user` 声明了子 slot `conversation.chat.user.before`（chain, session）；key `steering` 复用同一组件并注入 `renderSlotChain: () => null`。
- README（ui-chat L46）："`UserStyleBubble` 和 source-specific wrappers 保留 user row、时间戳、copy 控件及其它 message actions"；content Factory "不是全局 user-content 覆盖入口"。

已有位置均不在操作条：`user.before` 在气泡**上方**；`user.content` 只是内容栈。

### Slot 覆盖机制（来自 slot 核心 `dsh-web-frontend/dist/assets/index-*.js` 约 offset 491400 处的 `register`）
- keyed slot：同 key、同 priority → 抛错 `already has an entry for key ... — register at a different priority to shadow it (lowest renders)`；不同 priority → 允许，按 priority 升序排序，`entriesOfSlot` 只取每个 key 的第一条，即 **priority 数值最小的那条渲染**。内置注册没写 priority，默认是 0。
- README（ui-chat L79）："a lower `priority` picks the replacement: a dynamic plugin receives one automatically, and a statically composed plugin passes it explicitly"。也就是说，动态插件重注册 `user` 会自动拿到更低的 priority 并覆盖内置渲染器（自动赋值的代码位置未核实）。
- 注册时如果 `children` 里的 slot 已被声明 → 抛错 `slot "..." is already declared`。所以替换的渲染器**不能**再声明 `conversation.chat.user.before`。
- `renderSlot` / `renderSlotChain` 只能渲染本 entry `children` 里声明的 slot（`dsh-client-ui-renderer/lib/client.js` L342–386），否则抛 `SlotOwnershipError`。

### (a) 替换 `user` 渲染器并包装原组件：技术上能做，但会有破损
- 拿原组件：`ctx.slots.entries("conversation.chat.node")` 返回包括被遮蔽项在内的全部注册，每条 entry 带 `.component`、`.options.key`、`.registrant`（核心里 `l={component:t,options:{...},...}`）。所以可以找到 `key==="user"` 且 registrant 为 ui-chat 的那条，取出 `UserMessageNodeView`。
- 问题一：原组件会**无条件**调用 `renderSlotChain(...)`（L6184）。插件这条 entry 无法声明该子 slot，框架也就不会给它绑定 `renderSlotChain`。包装时必须自己传 `renderSlotChain: () => null`（和 steering 的做法一样），代价是 `user.before` 这个位置失效（其它插件在这里的内容不再显示）。
- 问题二：包装只能把按钮放在整个 row 的外面（前或后），**进不了** `MessageIconActions` 那一行，因为 `actions` 是组件内部写死的。
- 问题三：`renderFactorySlot`、`loadImage`、`t`（locale 命名空间 `chat`）等 props 是框架按注册组合出来的。插件注册拿到的是自己的 locale；`loadImage` 来源未核实。依赖私有组件，升级时容易坏（违反 practices.md 中"不要加载其它 Harness Client 包"的精神）。

### (b) 其它做法
1. 自建 user 渲染器（推荐）：以更低 priority 覆盖 `conversation.chat.node`/`user`。组件内调用 `renderFactorySlot("conversation.chat.user.content", { content, loadImage, facts, interactive: true })` 复用官方内容栈，自己写 row 外壳和操作条（时间 + 复制 + 新按钮），样式照抄 `MessageIconActions.module.css`（L5931，类名换成插件前缀，只保留 `--dsw-alias-*` token）。需要核实 factory 能否在插件 entry 内调用：README L44 写的是 "Direct callers need a Session binding and supply their own row wrapper"，说明外部调用是被支持的。`steering` key 要同样处理，否则 steering 行没有新按钮。代价：放弃 `user.before`（同上），以及跟随官方 UI 的改动。
2. 不进操作条：用 `conversation.chat.user.before`（chain，需 `select`），owner props 只有 `{ source, kind }`，**没有 seq/messageId/text**，而且位置在气泡上方，基本不满足需求。
3. 文本选择交互 `ctx.uiConversation.interactions`（README L189）：只在用户选中文字/右键时出现，不是常驻按钮。
4. 不推荐：CSS/DOM 注入。

推荐：方案 1，自建渲染器 + 复用 `conversation.chat.user.content` Factory，并同时覆盖 `user` 和 `steering`。

---

## 2. `conversation.chat.assistant-actions`

- 声明：在 `turn-tail` 注册的 children 中，`{ kind: "list", scope: "session" }`（ui-chat L9337–9340），所以注册时必须带 `id`，可选 `order`、`priority`。
- 渲染（L9040–9041）：`renderSlot("conversation.chat.assistant-actions", { messageId })`，**owner props 只有 `messageId`**；`closing.finalNode.messageId` 为 undefined 时整个 slot 不渲染。
- 拿不到 seq、turn、是否最后一轮、sessionId。可替代来源：
  - sessionId：slot 是 session scope，注册时 `inject: (sessionId) => ({...})` 会拿到 sessionId（其它注册均如此，例如 L9282）。
  - turn/seq/是否最后一轮：组件内用 `useChat` 选择器（`snapshot.timeline.turnOrder.at(-1)`、`snapshot.nodes`、`locations.getTurn`，见第 7 节），按 messageId 反查 node。`useChat` 是否注入到此 list 入口未核实（TurnTailNodeView 自己能拿到 `useChat`）。
- 位置：`MessageIconActions` 中的 复制 → **assistant-actions** → 分支 → [usage, 时间]（`clock:"end"`，L5966–6003）。显隐：最后一轮且以回复结尾时常显，否则 hover 时显示（`data-actions-reveal`）。
- 参考实现：`dsh-client-ui-message-feedback/lib/client.js` L963 起的注册。

---

## 3. 会话 ⋯ 菜单：「删除会话」放到「归档」下方

结论：用**数据式菜单服务** `ctx.contextMenus.register`，不要用 legacy slot。

依据：
- 内置注册（`dsh-client-ui-workspace/lib/client.js` L4328–4396）：`ctx.contextMenus.register({ id:"session.<x>", target:"session", order, observe, resolve })`。order：pin 100、rename 200、fork 300、copy-id 450（separatorBefore）、archive **600**（`separatorBefore:true, afterContent:true`）。另外 open-in-app 为 500。
- 渲染（`dsh-client-ui-context-menu/lib/client.js` L1186–1205）：`items` 是 `!afterContent` 的项，`footer` 是 `afterContent` 的项，中间是 `contextMenu.content`（keyed，`entryKey: target.kind`），legacy 行就渲染在这里。所以 legacy 行（`sidebar.workspaces.session.menu.item`）**永远在 Archive 之上**。
- 排序：README "Contributions sort by `order`, then ID"。
- 菜单项字段（L1167–1183）：`id, label, icon?{key,src?}, commandId?, disabled?, danger?, separatorBefore?, afterContent?, children?(子菜单), run, failureLabel?`。
- target 值（workspace L5999–6008）：`{ kind:"session", value:{ sessionId, displayTitle } }`，`resolve(target, signal)` 收到的就是 `value`。

写法：
```js
// package.json dsh.client.inject 加入 "@deepseek-ai/dsh-client-ui-context-menu"；apply 中 inject "contextMenus"
ctx.effect(() => ctx.contextMenus.register({
  id: 'session.dsh-chat-plus-delete',
  target: 'session',
  order: 700,                       // > 600，并且同样设置 afterContent
  observe: () => [ctx.locale],      // 可加 workspaces.list 等来源
  resolve: ({ sessionId, displayTitle }) => [{
    id: 'delete',
    label: t('menu.delete'),
    icon: { key: 'dsh-chat-plus.delete' },   // 需用 contextMenu.icon keyed slot 注册图标
    danger: true,
    afterContent: true,             // 必须设置，否则会排到 content/Archive 之前
    run: () => openDeleteConfirm(sessionId, displayTitle),
  }],
}))
```
注意：
- ui-workspace README L246 写明 "No Session deletion — sessions can be archived but never deleted"。我在 remotes 中搜 `deleteSession|session/delete` 没有找到会话删除的 Remote（只命中 workspace 删除等）。**真正的删除需要插件自己的 Host 端实现**（这次只到搜索层面，没逐个确认）。
- legacy slot props：`sessionId, displayTitle, useMenuOpenState`（README L126）。

---

## 4. 侧边栏「回收站」入口

`dsh-client-ui-sidebar/lib/client.js` 中声明的位置（L749–768，全部 root scope）：

| slot | kind | 位置 | owner props |
|---|---|---|---|
| `sidebar.panellist` | list | 顶部全局面板行（新会话下方、工作区列表上方） | `{ size, active }`，并以 `{ only: id }` 逐行渲染图标；label 取自注册的 `options.label`，按 `order` 排序（L206–237、L690–697） |
| `sidebar.panellist.actions` | list | 「更多」菜单内的行 | `{ entries, onOpen, onPinnedChange, onDismiss }`（L279–284） |
| `sidebar.footer.action` | list | 底部，设置按钮旁，**在工作区列表下方** | `{ wide }`（L561） |

- 工作区列表是 `sidebar.workspaces`（single，L543），在 panellist 与 foot 之间。所以「工作区列表下方」只有 `sidebar.footer.action` 符合。
- 推荐：`sidebar.footer.action` 放入口按钮（参考 ui-cordis L1741）。如果希望像「插件」「定时」那样作为全局面板，就用 `sidebar.panellist`（参考 plugin-manager L7820、schedule L19387），但它在列表**上方**。
- 打开方式：
  - 全局面板：注册 `sidebar.panellist`（id = 面板 id）并配套 main 面板。点击由框架执行 `ctx.layout.selectPanel(id)`（L719–721）。main 面板的注册方式（main keyed slot）需参考 plugin-manager / schedule 的源码，本次未细读。
  - 弹窗：注册 `shell.overlay` list 项（workspace L6115–6127 用它挂 Rename/Archive 对话框），由插件自己的 store 控制开关。footer 按钮 + overlay 弹窗最简单。

---

## 5. Composer：`inputActions`

来源：`ctx.uiSession.provide({ props:["inputActions"] })` 是 session 级标准 prop（`dsh-client-ui-conversation/lib/client.js` L22775–22790），实现为 `SessionInputShell.actions`（L15368–15395）：

```ts
insertQuote(text: string): boolean                 // 仅 plain 阶段可用
captureInsertion(): { start, end, draftRev }       // 捕获当前光标/选区和修订号
insertText(text: string, span): boolean            // span.draftRev 过期或冻结时返回 false
setDraft(text: string | DraftSnapshot): void       // 整体替换草稿，光标移到末尾
persistDraft(): void
addAttachments(ids: string[]): boolean             // 只追加"已存在的草稿附件 id"
removeAttachment(id: string): void
pruneAttachments(ids: string[]): void
submit(): void                                     // 等价于 submit("queue")
```

附件 / 草稿图片：
- `addAttachments` **不接收 File**，只接收草稿附件 id。id 由 `conversation.createDrafts(sessionId, files: File[], uploadImages: boolean)`（L4852–4870）生成：图片走 `browserDraftAttachment(file)`（objectURL 预览 + 尺寸探测，`uploadImages` 为真时后台上传），其它文件是 `{kind:"file", id: randomUUID(), file}` 并立即上传。
- 官方 composer 用的是**非 inputActions** 的 `addFiles(files: File[], directories?: Set<File>) => string|null`（返回错误文案或 null，L23023–23066），它只注入给 composer 注册（`conversation.content` factory 的 inject），普通插件 slot 拿不到。
- 插件填图片的可行办法：自己构造 `new File([blob], 'x.png', {type:'image/png'})`，再获取 `concreteConversation(ctx)`（即 `ctx.uiConversation` 的实现，L22539）调用 `createDrafts`，最后 `inputActions.addAttachments(ids)`。`createDrafts` 是否属于公开 API **未核实**（README 只提到 `ctx.uiConversation` 的 registries/bindings/imageUrl）。备选：模拟粘贴/拖放事件（不推荐）。

---

## 6. 从 Client 发送 / 取消

`ctx.sessions`（`@deepseek-ai/dsh-api-session-controller` client，`lib/types/client/sessions/service.js`）：
- `binding(id)`（L412）：借用已 retain 的 binding，**不延长生命周期**，`binding.session` 即 Session。
- `retain(target, { source, signal })` / `using(target, options, op)`（L188–213）：主动持有并打开会话。
- `retainAgentScope(id)`（L373）。

Session（`sessions/session.js`）：
```ts
beginSubmission({ mode, text, attachments, onAccept?, onRetire? }): { requestId, abandon() }  // L151，本地回显
prompt(content: Array<{type:'text',text} | {type:'image',...} | {type:'file',receiptId}>,
       mode: 'queue' | 'steer', signal?: AbortSignal, requestId?: string): Promise<Result>   // L177
cancel(): Promise<Result>   // L278 → remote.session.cancel({ sessionId })，子代理走 interruptByParent
rename(title), command(line)  // L298, L313
```
底层 Remote：`ctx.remote.session.prompt({ requestId, sessionId, mode, content, clientTimeZone }, signal)`、`ctx.remote.session.cancel({ sessionId })`。建议走 Session 对象，不要直接调用 remote（Session 会维护 promptError、回显、blank 状态）。

官方发送路径参考 `conversation.sendSession(session, text, attachmentIds, mode, signal, accept)`（conversation L4765–4838），停止参考 `stop(sessionId)`（L22671 → `scopedConversation(...).cancel()`）。简单发纯文本可以直接 `session.prompt([{type:'text', text}], 'queue')`（conversation L4740 就是这样做的），但这样**没有本地回显**；需要回显就先 `beginSubmission`，再把 `requestId` 传给 prompt。权限：`useAccess("session/prompt")`、`useAccess("session/cancel")`。

---

## 7. Chat 数据：`useChat` / `useConversation` / `useProjection`

- `useConversation`、`useInput`：由 `ctx.uiSession.provide({ hooks:["conversation","input"] })` 提供（conversation L22775–22787），分别是 `uiConversation.binding(binding).snapshot` 和 `shell.state`（InputState：`draft, draftRev, phase('plain'|'adjudicating'|'submitting'|'sending'...), attachmentIds` 等）。
- `useChat(selector)`：Chat 快照（ui-chat L97–136，`EMPTY_CHAT_SNAPSHOT`）：
  ```ts
  {
    order: Key[],                                  // 根序列（node/group）
    nodes: { get(key), source(key), bottomSource(key), turnDataSource(turn, kind), processSource(key), values() },
    locations: { getTurn(turn): Key[], getStep(...): Key[] },
    navigation: { items() },
    timeline: { turnOrder: Turn[], turns: Map<Turn, ...> },
    legacy: {...}
  }
  ```
  node 字段（L9007–9026、L11220–11290 等）：`kind`（user/steering/context/command/assistant-step/tool-call/compaction/manual-compaction/model-retry/turn-error/turn-max-tokens/turn-tail/turn-process/turn-trigger/system-prompt/unknown）、`seq`、`anchorSeq`、`location{kind:'turn'|'step', turn}`、`visibility`（'visible' 或其它，即隐藏）、`data`（如 user 的 `content, time, source, referenceLabels, skillNames`；turn-tail 的 `closing{finalNode{seq,messageId}, blocks, time}, branchUnavailable, tokenUsage`）。
  - 判断最后一轮：`snapshot.timeline.turnOrder.at(-1) === turn`（L9022）。
  - shadowed：Chat node 上没有通用的 `shadowed` 布尔字段。压缩节点有 `shadowedItemCount / shadowedTokenCount`（来源于事件 `data.shadowedSeqs`，L11639–11656）。"被压缩遮蔽"需要从 compaction 节点的 `shadowedSeqs` 自行推导（未核实是否存在更直接的 API）。
  - README：`ChatNodeStore.turnDataSource` 可以按 Turn + kind 订阅，包括隐藏节点。
- `useProjection(name)`：读取 Host 端 `wire.view` 投影值（例如 `useProjection('title')`，session.js L290–305 的注释），由 Session 的 `ProjectionValueStore` 提供。
- 精确 TS 类型：安装包里没有 `.d.ts`，以上是依据 JS 推断的。

---

## 待页面连上后复核
`Slots.listSubTree` root=`conversation.chat.assistant-actions` / `conversation.chat.node` / `sidebar.footer.action`（catalog/ownerProps）；`Service.listService` 中 `uiConversation`、`sessions`、`contextMenus`、`layout` 的签名；动态插件自动 priority 的取值。

临时解包目录 `%TEMP%\dsh-asar-research` 可以删除。
