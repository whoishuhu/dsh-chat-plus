# dsh-chat-plus：Client 调研（第二轮，DSH 0.2.2-rc.1）

依据为 `%TEMP%\dsh-asar-research\<包>\lib\client.js` 源码（下文简称 `ui-chat` = `dsh-client-ui-chat/lib/client.js`，`renderer` = `dsh-client-ui-renderer/lib/client.js`，`web` = `dsh-web-frontend/dist/assets/index-BgUyXZcc.js`，web 文件按字符 offset 引用）。Client inspect（`Slots.listSubTree`）10s 超时（页面没连上），结论全部来自源码。

---

## 1. 覆盖 `conversation.chat.node` 的 `user` / `steering`

### 1.1 官方组件原文（ui-chat）

`MessageIconActions`（L5955–6006）：
```js
function MessageIconActions({ text, time, clock, onBranch, branchUnavailable = false, className, extraActions, usageAction, t }) {
	const day = useCalendarDay();
	const reasonId = (0, react.useId)();
	const { copied, onCopy } = (0, _deepseek_ai_dsh_client_ui_primitives.useClipboardCopy)(text);
	const clockEl = time === void 0 ? null : jsx("span", {
		className: clock === "start" ? css.timeStart : css.timeEnd,
		children: formatMessageClock(time, t, day)
	});
	return jsxs("div", {
		className: className === void 0 ? css.actions : `${css.actions} ${className}`,
		"data-clock": clock,
		children: [
			clock === "start" ? clockEl : null,
			jsx(Tooltip, { label: copied ? t("copied") : t("copy"), side: "bottom",
				children: jsx("button", { type: "button", className: css.action,
					"aria-label": copied ? t("copied") : t("copy"), onClick: onCopy,
					children: copied ? jsx(IconCheckOutlineRegular, {}) : jsx(IconCopyOutlineRegular, {}) }) }),
			extraActions,
			onBranch !== void 0 && jsx(Tooltip, { /* 分支按钮，略 */ }),
			onBranch !== void 0 && branchUnavailable && jsx("span", { id: reasonId, className: css.visuallyHidden, children: t("message.branchUnavailable") }),
			clock === "end" ? jsxs("span", { className: css.endInfo, children: [usageAction, clockEl] }) : usageAction
		]
	});
}
```
（`jsx/jsxs` = `react_jsx_runtime.jsx/jsxs`，`css` = `MessageIconActions_module_css_default`；为便于阅读省略了 `(0, ...)` 前缀，逻辑没有改动。）

`UserStyleBubble`（L6157–6197）：
```js
function UserStyleBubble({ node, renderSlotChain, content, loadImage, renderFactorySlot, actions, pending = false, echo = false, batchStart = false, referenceLabels, skillNames, previewAttachments, facts: inputFacts = EMPTY_TEXT_FACTS, interactive = false }) {
	const parts = useMemo(() => contentParts(content), [content]);
	const prepared = useMemo(() => ({
		text: parts.text,
		attachments: previewAttachments ?? parts.attachments,
		extraBlocks: parts.rest,
		...referenceLabels === void 0 ? {} : { referenceLabels }
	}), [parts, previewAttachments, referenceLabels]);
	const facts = useMemo(() => ({
		...inputFacts,
		...referenceLabels === void 0 ? {} : { sessionLabels: referenceLabels },
		...skillNames === void 0 ? {} : { skillNames }
	}), [inputFacts, referenceLabels, skillNames]);
	return jsxs("div", {
		className: MessageItem_module_css_default.userRow,
		"data-pending-steering": pending || void 0,
		"data-submission-echo": echo || void 0,
		"data-chat-steering-batch": batchStart ? "start" : void 0,
		children: [
			renderSlotChain("conversation.chat.user.before", { source: node.data.source, kind: node.kind }, { fallback: null }),
			renderFactorySlot("conversation.chat.user.content", { content: prepared, loadImage, facts, interactive }),
			actions?.(prepared.text)
		]
	});
}
```

`contentParts`（L6010–6032）：
```js
function contentParts(content) {
	const texts = []; const attachments = []; const rest = [];
	for (const block of content) {
		const b = block;
		if (b.type === "text" && typeof b.text === "string") texts.push(b.text);
		else if (b.type === "image" && b.attachment !== void 0) attachments.push({ type: "image", image: { attachment: b.attachment } });
		else if (b.type === "file" && b.attachment !== void 0) attachments.push({ type: "file", file: b.attachment });
		else rest.push(block);
	}
	return { text: texts.join(""), attachments, rest };
}
```

`UserMessageNodeView`（L6268–6288）：
```js
const UserMessageNodeView = memo(function UserMessageNodeView({ node, renderFactorySlot, loadImage, renderSlotChain, t }) {
	const data = node.data;
	return jsx(UserStyleBubble, {
		node, renderSlotChain,
		content: data.content,
		interactive: true,
		renderFactorySlot, loadImage,
		batchStart: node.kind === "steering" && node.data.batchStart === true,
		...data.referenceLabels === void 0 ? {} : { referenceLabels: data.referenceLabels },
		...data.skillNames === void 0 ? {} : { skillNames: data.skillNames },
		actions: (text) => jsx(MessageIconActions, {
			text, time: data.time, clock: "start",
			className: MessageItem_module_css_default.actions,   // 该 key 在 css map 中不存在 → undefined，实际只有 _1KfHza_actions
			t
		})
	});
});
```
注意：`MessageItem_module_css_default`（L5062–5094）**没有** `actions` 这个 key，所以 `className` 实际是 `undefined`，操作条只有 `_1KfHza_actions` 这一个类。

### 1.2 时间格式化原文
`formatMessageClock`（L5895–5906）：
```js
function formatMessageClock(time, t, now = Date.now()) {
	const d = new Date(time);
	const n = new Date(now);
	const clock = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
	if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()) return clock;
	const params = { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
	return `${d.getFullYear() === n.getFullYear() ? t("clock.md", params) : t("clock.ymd", params)} ${clock}`;
}
```
`useCalendarDay`（L5913–5928）会在每个本地零点 setState 让组件刷新（`startOfLocalDay` L5825、`msUntilNextLocalMidnight` L5835：`next.setHours(24,0,0,0)`）。
locale：zh `"clock.md": "{m}月{d}日"`、`"clock.ymd": "{y}年{m}月{d}日"`（L6729–6730）；en 等为 `"{m}/{d}"`、`"{y}-{m}-{d}"`（L6927–6928）。插件的 `t` 是自己的命名空间，**需要在插件 locale 里自带这两个模板**（或直接写死中文格式）。

复制：`useClipboardCopy(text)` 来自 `@deepseek-ai/dsh-client-ui-primitives`，返回 `{ copied, onCopy }`。插件不能 import 它，需要自己实现：`navigator.clipboard.writeText(text)`，成功后 `setCopied(true)`，再用 `setTimeout` 约 1.5s 复位（primitives 源码在 web bundle 里，复位时长未核实）。图标 `IconCopyOutlineRegular/IconCheckOutlineRegular` 同样拿不到，自己内联 SVG。

### 1.3 CSS 原文

`MessageIconActions.module.css`（ui-chat L5931，注入为 `<style data-plugin-css="@deepseek-ai/dsh-client-ui-chat/MessageIconActions.module.css">`）：
```css
._1KfHza_actions{height:calc(28px + var(--dsh-content-font-delta,0px));align-items:center;gap:8px;display:flex}
._1KfHza_timeStart{font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-tertiary);white-space:nowrap;padding-right:12px}
._1KfHza_timeEnd{font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(24px + var(--dsh-content-font-delta,0px));color:inherit;white-space:nowrap}
._1KfHza_endInfo{min-width:0;color:var(--dsw-alias-label-tertiary);align-items:center;gap:8px;margin-left:8px;display:inline-flex}
@media (hover:hover){
 [data-actions-reveal=hover] ._1KfHza_actions,
 :is([data-chat-flow-kind=user],[data-chat-flow-kind=steering]):has(~:is([data-chat-flow-kind=user],[data-chat-flow-kind=steering])) ._1KfHza_actions{opacity:0;transition:opacity 80ms}
 [data-actions-reveal=hover]:hover ._1KfHza_actions,[data-actions-reveal=hover]:focus-within ._1KfHza_actions,
 :is([data-chat-flow-kind=user],[data-chat-flow-kind=steering]):has(~:is([data-chat-flow-kind=user],[data-chat-flow-kind=steering])):hover ._1KfHza_actions,
 :is([data-chat-flow-kind=user],[data-chat-flow-kind=steering]):has(~:is([data-chat-flow-kind=user],[data-chat-flow-kind=steering])):focus-within ._1KfHza_actions{opacity:1}
}
._1KfHza_action{width:calc(28px + var(--dsh-content-font-delta,0px));height:calc(28px + var(--dsh-content-font-delta,0px));border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;justify-content:center;align-items:center;padding:6px;display:inline-flex}
._1KfHza_action svg{width:calc(15px + var(--dsh-content-font-delta,0px));height:calc(15px + var(--dsh-content-font-delta,0px))}
._1KfHza_actions[data-clock=end] ._1KfHza_action svg{width:calc(17px + var(--dsh-content-font-delta,0px));height:calc(17px + var(--dsh-content-font-delta,0px))}
@media (hover:hover){._1KfHza_action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}}
._1KfHza_action[data-unavailable]{cursor:default;opacity:.4}
@media (hover:hover){._1KfHza_action[data-unavailable]:hover{color:var(--dsw-alias-label-tertiary);background:0 0}}
._1KfHza_visuallyHidden{clip:rect(0 0 0 0);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}
```
（hover 规则的含义：一条 user/steering 行后面如果还有另一条 user/steering 行，前面那条的操作条在 hover 时才显示；连续用户消息中只有最后一条常显。）

用户行相关（`MessageItem.module.css`，ui-chat L5052 `css$14` 中的片段）：
```css
.LOmM4q_userRow{flex-direction:column;align-items:flex-end;gap:6px;display:flex}
.LOmM4q_userStack{min-width:0;max-width:min(calc(var(--dsh-chat-content-width,748px) * .702), 82%);flex-direction:column;align-items:flex-end;gap:8px;display:flex}
.LOmM4q_referenceSummary{color:var(--dsw-alias-label-tertiary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(18px + var(--dsh-content-font-delta-secondary,0px))}
.LOmM4q_attachmentRow{flex-wrap:wrap;justify-content:flex-end;gap:8px;max-width:100%;display:flex}
.LOmM4q_fileCard{border:.5px solid var(--dsw-alias-border-l2,#0000001f);border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-input-major,transparent);box-sizing:border-box;flex:0 0 240px;align-items:center;gap:10px;width:240px;min-height:64px;padding:8px 12px;display:inline-flex}
```
`userStack`、`attachmentRow`、`fileCard` 以及气泡本体都属于 `conversation.chat.user.content` Factory（`UserContent`，L9359 起）。**如果插件调用这个 Factory，就不必自己画气泡**，只需要画外层 `userRow` 和操作条。

### 1.4 props 从哪里来

渲染链：`ChatNodeSeat`（L4491–4603）调用
```js
renderSlot("conversation.chat.node", routedOwner, { entryKey: routedNode.kind, hookContext, fallback: ... })
// routedOwner = { ...groupPart?, cwd, openFile, inspectCall, forkAt, loadImage, turnProcess, node: routedNode }   (L4557–4579)
```
renderer 合成 props（renderer L784–797）：`{ ...kit, ...injected, ...slotInjected.props, ...contextual, ...ownerProps }`，owner 优先。
- **ownerProps**（ChatNodeSeat 给的）：`node, cwd, openFile, inspectCall, forkAt, loadImage, turnProcess, groupPart?`。**`loadImage` 来自 owner props**，源头是 `conversation.view` 注册的 inject：`loadImage: Object.assign((a) => ctx.uiConversation.imageUrl(sessionId, a), { peek: (a) => ctx.uiConversation.peekImageUrl(sessionId, a) })`（L15506），经 ChatView → ChatFlow → ChatNodeSeat 一路传下来。所以插件的 user 渲染器能直接拿到 `loadImage`。
- **kit**（renderer `standardKit` L736–767，每个 entry 都有）：标准 props（`ctx.uiSession.provide` 提供的 `useConversation/useInput/useChat?/inputActions…`，按 session scope 绑定）+ **`renderFactorySlot`（无条件提供，L740）**；注册时写了 `locale` 才有 `t`（L742–746，用的是**注册者自己的命名空间**）；声明了 `children` 才有 `renderSlot`，含 chain 子项才有 `renderSlotChain`（L753–755）。
- **slotInjected**：父声明 `conversation.chat.node` 时带 `inject: CHAT_NODE_INJECT`（L15259–15265）→ 子 entry 都能拿到 hooks `useTurnData(key)`、`useDisclosure`、`useGroupAction`（需要 hookContext，ChatNodeSeat 已传）。
- **injected**：各 entry 自己 `register({inject})` 的返回值。
- 父 flow 的 `nodeSources` keyedHooks（`chatNode/chatNodeBottom/...`，L15427–15436）是给 ChatFlow 自己的，不会传给 node entry。

user 节点 `node.data` 字段（从组件里的用法确认）：`content`（block 数组：`{type:'text',text}` / `{type:'image',attachment}` / `{type:'file',attachment}`）、`time`（epoch ms）、`source`、`referenceLabels?`、`skillNames?`；steering 另外有 `batchStart?`。`node` 本身还有 `kind`、`key`、`seq`、`location{kind,turn}`（见上一轮调研第 7 节）。

### 1.5 插件能不能调用 `conversation.chat.user.content` Factory
能。Factory 注册（L15383–15391）：
```js
ctx.slots.registerFactory({
	name: "conversation.chat.user.content",
	scope: "session",
	locale: NS,
	children: { "conversation.chat.user.images": { kind: "single", scope: "session" } }
}, UserContent);
```
`renderFactorySlot` 会无条件放进每个 entry 的 kit（renderer L740，`boundRenderFactorySlot(entry)` L322–334 只是创建 `<FactoryOutlet name caller …/>`，没有校验 caller 是否属于该 Factory）。session scope Factory 唯一的要求是渲染位置有 scope binding（renderer L985–986：`if (binding.key === void 0) throw "strict session factory ... rendered without a scope binding"`）。`conversation.chat.node` 本身是 session scope，所以插件 entry 内有 binding，README 说的 "Direct callers need a Session binding" 已经满足。输入 props：`{ content: { text, attachments, extraBlocks, referenceLabels? }, loadImage, facts, interactive, ellipsis? }`（UserContent L9359）。facts 的形状：`{ sessionLabels?: referenceLabels, skillNames? }`。

### 1.6 priority（动态插件是否自动降低）
slot 核心 `register`（web offset ≈491600–493700）原文：
```js
const i=r.spec, n=e.priority??0, s=f=>`at priority ${n}${...} — register at a different priority to shadow it (lowest renders)`;
case"keyed":{ ... const f=r.entries.find(h=>h.options.key===e.key&&(h.options.priority??0)===n); if(f)throw new Error(`keyed slot "${e.name}" already has an entry for key "${e.key}" ...`) }
...
u.sort((f,h)=>(f.options.priority??0)-(h.options.priority??0))   // 数值小的排前面，同 key 只渲染第一条
```
官方 user/steering 注册（L9238–9252）没写 priority，即 **0**。核心本身**不会**自动赋值；README（ui-chat L79）说"a dynamic plugin receives one automatically"，但赋值代码我在 web bundle 里没找到（按约定时限跳过）。**结论：未找到具体实现，按 README，动态插件会自动获得更低的 priority。** 为了稳妥，建议显式传一个负数，例如 `priority: -100`：如果框架真的会自动赋值，显式值可能被覆盖，也可能和自动值冲突，所以要实测。万一报 `already has an entry for key "user" at priority …`，改成别的负数即可。

### 1.7 推荐写法
```js
// apply(ctx) 内；package.json 中声明 locale 命名空间（例如 'chatplus'）
const UserNode = React.memo(function UserNode({ node, renderFactorySlot, loadImage, t, sessionId }) {
	const data = node.data;
	const parts = React.useMemo(() => contentParts(data.content), [data.content]);   // 照抄 1.1 的 contentParts
	const prepared = React.useMemo(() => ({
		text: parts.text, attachments: parts.attachments, extraBlocks: parts.rest,
		...(data.referenceLabels ? { referenceLabels: data.referenceLabels } : {})
	}), [parts, data.referenceLabels]);
	const facts = React.useMemo(() => ({
		...(data.referenceLabels ? { sessionLabels: data.referenceLabels } : {}),
		...(data.skillNames ? { skillNames: data.skillNames } : {})
	}), [data.referenceLabels, data.skillNames]);
	return h('div', { className: 'chatplus-userRow', 'data-chatplus-session': sessionId,
			'data-chat-steering-batch': node.kind === 'steering' && data.batchStart ? 'start' : undefined }, [
		renderFactorySlot('conversation.chat.user.content', { content: prepared, loadImage, facts, interactive: true }),
		h(MyActions, { text: prepared.text, time: data.time, t, node }),
	]);
});
for (const key of ['user', 'steering']) {
	ctx.effect(() => ctx.slots.register({
		name: 'conversation.chat.node', key, priority: -100, locale: 'chatplus',
		inject: (sessionId) => ({ sessionId }),     // session scope 的 inject 能拿到 sessionId
	}, UserNode));
}
```
- 不要声明 `children: {'conversation.chat.user.before': …}`：该 slot 已经由官方 user entry 声明，再声明会抛 `slot "..." is already declared`。代价是 `user.before` 位置失效（官方只有 user 声明了它）。
- `ctx.slots.register` 是否需要像官方那样包在 `ctx.slots.inject("conversation.chat.node", () => …)` 里：官方用 inject 是因为父 slot 由 flow entry 声明，可能晚于自己注册。动态插件加载时父 slot 一般已经存在，用 `ctx.effect` 也行；但如果遇到 `slot "conversation.chat.node" is not declared`，就改用 `ctx.slots.inject(name, () => register(...))`（推荐直接用 inject，最稳）。

补充（与 1.7 相关）：session scope 的 entry **自带** 标准 prop `sessionId`、hook `useSession`、keyed hook `useProjection`（`dsh-client-ui-session/lib/client.js` L755–763 `BUILTIN_SOURCE`）。所以 1.7 中的 `inject: (sessionId) => ({ sessionId })` 可以省略，直接从 props 解构 `sessionId` 即可（写上也无害：inject 结果会覆盖 kit 中的同名字段，renderer L784–797）。

---

## 2. `conversation.chat.assistant-actions` 的 props

声明位置：turn-tail 注册的 children（ui-chat L9337–9340）：`"conversation.chat.assistant-actions": { kind: "list", scope: "session" }`，**没有 slot inject**（不同于 `conversation.chat.node` 的 `CHAT_NODE_INJECT`）。

渲染（ui-chat L9040–9041、L9055）：
```js
const messageId = closing.finalNode.messageId;
const assistantActions = messageId === void 0 ? null : renderSlot("conversation.chat.assistant-actions", { messageId });
... jsx(MessageIconActions, { ..., extraActions: assistantActions, ... })
```
所以 entry 组件收到的 props = renderer `standardKit` + 自己 `inject` 的返回值 + owner `{ messageId }`：
- owner props：只有 **`messageId`**。
- 标准（session scope）：`sessionId`、`useSession`、`useProjection`（ui-session L755–763），`useChat`（ui-chat L15328–15331 `ctx.uiSession.provide({ hooks:["chat"] })`），`useConversation`、`useInput`、`inputActions`（ui-conversation L22775–22790），另外还有其它插件 provide 的 hook，例如 `useAccess`（ui-session L1132）。
- 一定有：`renderFactorySlot`；注册时带 `locale` 才有 `t`。
- 没有：`node`、`turn`、`seq`、`loadImage`、`useTurnData`。需要 turn/seq 时，用 `useChat(s => ...)` 遍历 `s.timeline.turns`，找 `turn.data.get("turn-tail")?.closing?.finalNode.messageId === messageId`（官方 forkAt 就是这样反查的，ui-chat L15515）。

无法实测：页面未连接，`Slots.listSubTree` 超时，以上 standardProps 列表来自源码推导。

message-feedback 注册原文（`dsh-client-ui-message-feedback/lib/client.js` L963–984）：
```js
ctx.slots.inject("conversation.chat.assistant-actions", () => ctx.slots.register({
	name: "conversation.chat.assistant-actions",
	id: "feedback",
	order: 10,
	locale: NS,
	inject: (sessionId) => {
		const { feedback, dialog } = surfaceFor(sessionId);
		return {
			hooks: { feedback },                         // → 组件 props.useFeedback
			ensure: () => feedback.ensure(),
			current: (messageId) => feedback.getSnapshot().items.get(messageId),
			retract: (messageId, rating) => feedback.retract(messageId, rating),
			openDialog: (messageId, rating) => { dialog.open({ kind: "message", messageId, rating }); }
		};
	}
}, MessageFeedbackActions));
```
组件签名（L172）：`function FeedbackRatingButtons({ messageId, ensure, current, retract, openDialog, useFeedback, t })`。`inject` 返回的 `hooks: { x: store }` 会变成 `useX(selector)` prop（store 需要 `getSnapshot/subscribe`）。该插件 `inject = ["slots","remote","remote.messageFeedback","remote.sessionFeedback","locale"]`（L919–925）。

推荐写法：
```js
ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register({
	name: 'conversation.chat.assistant-actions', id: 'chatplus-actions', order: 20, locale: 'chatplus',
}, function ChatplusAssistantActions({ messageId, sessionId, useChat, t }) {
	const turn = useChat(s => { for (const [k, v] of s.timeline.turns) if (v.data.get('turn-tail')?.closing?.finalNode.messageId === messageId) return k; });
	return h('button', { type: 'button', className: 'chatplus-action', 'aria-label': t('x') }, svgIcon);
}));
```
（`timeline.turns` 的 key/value 结构以 ui-chat L15515 为准：`[...turns.values()].find(turn => turn.end?.seq === seq)?.data.get("turn-tail")`，value 上有 `.turn`、`.end.seq`、`.data`，取轮次号时用 value 上的字段更稳妥。）

---

## 3. `useProjection`

来源：`dsh-client-ui-session/lib/client.js` L755–763：
```js
const BUILTIN_SOURCE = {
	hooks: ["session"],
	keyedHooks: ["projection"],
	props: ["sessionId"],
	resolve: (binding) => ({
		hooks: { session: binding.session },
		keyedHooks: { projection: (key) => binding.session.projections.faceOf(key) },
		props: { sessionId: binding.sessionId }
	})
};
```
renderer 把 keyed hook 包装成 `useProjection(key, selector?, equal?)`（renderer L270–287 `keyedObservableHook`：`observableHook(source(key) ?? absentSource)(selector ?? identity, equal)`）。所以：
- 参数 1：projection key（Host 端 `wire.view` 的投影名，例如 `"title"`、`"plan"`、`"goal"`、`"todos"`、`"inbox"`、`"contextPressure"`、`"contextBreakdown"`、`"imageLimits"`、`"workingDirectory"`）。
- 参数 2（可选）：selector，参数 3（可选）：equal。
- 返回 selector 的结果；没有 selector 就返回投影原值；投影不存在 / 尚未到达时返回 `undefined`。
- 只有 session / session-maybe scope 的 entry 才有这个 hook。

官方用例（`dsh-client-ui-conversation/lib/client.js`）：
```js
// L21757 InputBar({ ..., useProjection, ... })
const planActive = useProjection("plan", (plan) => plan !== void 0 && (plan.pending ? !plan.active : plan.active));   // L21775
const hasGoal = useProjection("goal", (goal) => goal != null);                                                       // L21776
// L22345 TodoDock({ useProjection, t })
todos: useProjection("todos") ?? [],                                                                                 // L22347
// L21525 ContextMeter({ useProjection, t })
const pressure = useProjection("contextPressure");                                                                   // L21526
```
非 React 环境下也可以直接读：`ctx.sessions.binding(sessionId).session.projections.faceOf(key)`，它是 `{getSnapshot, subscribe}`（ui-chat L15492 读 `workingDirectory` 就是这么写的）。

---

## 4. 会话菜单 `ctx.contextMenus.register`

- 服务名：`contextMenus`，由 `dsh-client-ui-context-menu` 提供（`dsh-client-ui-context-menu/lib/client.js` L1371 `ctx.provide("contextMenus", contextMenus)`）。对象形状（L1330–1370）：`{ active, register(input), resolve(target), notify(message), close(), open(target, point) }`。
- 插件 `inject` 需要写 `"contextMenus"`（官方 workspace 直接用 `ctx.contextMenus`）。client package inject 依赖名：`"@deepseek-ai/dsh-client-ui-context-menu"`（`dsh-client-ui-workspace/package.json` 的 `dsh.client.inject` 中包含这一项）。
- 图标：`contextMenu.icon` 是 context-menu 在 `shell.overlay` entry 下声明的 keyed、root、inline 子 slot（L1405–1419），渲染时用 `renderSlot("contextMenu.icon", { icon: action.icon }, { entryKey: action.icon.key })`（L1176）。注册一个组件即可，组件 props 中带 `icon`（`{key, src?}`）。官方写法：
```js
// dsh-client-ui-sidebar-right/lib/client.js L5532–5535
ctx.effect(() => ctx.slots.inject("contextMenu.icon", () => ctx.slots.register({
	name: "contextMenu.icon",
	key: "sidebar.close"
}, IconCloseOutlineRegular)), "sidebar: menu icon");
// dsh-client-ui-workspace/lib/client.js L5940–5954（批量）
ctx.slots.inject("contextMenu.icon", function* () {
	for (const [key, Icon] of Object.entries({ "workspace.rename": IconEditOutlineRegular, "workspace.delete": IconTrashOutlineRegular, /* ... */ }))
		yield ctx.slots.register({ name: "contextMenu.icon", key }, Icon);
});
```
菜单项写 `icon: { key: "workspace.rename" }`（L5962）。插件的图标组件可以是 `({size}) => <svg width=14 height=14 .../>`：官方 primitives 图标会接收 `size`，菜单是否传入 `size` 未核实，建议在组件里设默认 14。
- run 里打开确认弹窗（官方模式）：`run` 只负责写入一个 snapshot store，弹窗作为 `shell.overlay` list entry 订阅这个 store 来渲染。workspace 的「归档确认」（L5817、L5859、L5874–5884、L6122–6127）：
```js
const archiveRequest = createSnapshotStore(null);           // 插件里自建 {getSnapshot, set, subscribe}
// 触发处
archiveRequest.set({ sessionId, displayTitle, activity });
// overlay entry
const archiveConfirmInjected = () => ({
	hooks: { archiveRequest },                               // → props.useArchiveRequest(selector)
	settleSessionArchive: () => { archiveRequest.set(null); },
	stopAndArchiveSession: async (sessionId) => { await uiWorkspace.archiveSession(sessionId, { stopActivity: true }); notify({ kind: "stoppedAndArchived", sessionId }); }
});
ctx.slots.register({ name: "shell.overlay", id: "workspace.session-archive", locale: NS, inject: archiveConfirmInjected }, SessionArchiveConfirmDialog);
```
插件拿不到 `createSnapshotStore`，自己写一个最小 store（`getSnapshot/subscribe/set`，listener 存 Set）即可，`hooks` 只要求 `getSnapshot` 和 `subscribe`。
- 菜单 `run` 回调执行时菜单已经关闭（`select` → `dismiss(false)` → `selected.select(id)`，L1424–1431），在 run 里同步 `store.set(...)` 就安全；Modal 会自己处理焦点（见第 5 节）。

---

## 5. `shell.overlay` 与官方 Modal

注册写法（list slot，必须有 `id`；root scope；props 只有 kit + 自己的 inject，没有 owner props）：
```js
// dsh-client-ui-workspace/lib/client.js L6115–6137
ctx.slots.inject("shell.overlay", function* () {
	yield ctx.slots.register({ name: "shell.overlay", id: "workspace.session-rename", locale: NS, inject: renameDialogInjected }, SessionRenameDialog);
	yield ctx.slots.register({ name: "shell.overlay", id: "workspace.session-archive", locale: NS, inject: archiveConfirmInjected }, SessionArchiveConfirmDialog);
	yield ctx.slots.register({ name: "shell.overlay", id: "workspace.row-toast", inject: rowToastInjected,
		children: { "workspace.toast": { kind: "keyed", scope: "root" } } }, RowActionToast);
});
```
组件约定：没有请求时 `return null`，有请求时渲染 Modal，并用 `key=sessionId`，让每次请求的内部状态独立（L4200–4209）。

官方确认弹窗（L4211–4264）：
```js
jsxs(Modal, {
	open: true, onClose: close, closeLabel: t("close"),
	title: t("archive.confirm.title"),
	description: t("archive.confirm.desc", { title: request.displayTitle }),
	footer: jsxs(Fragment, { children: [
		jsx(Button, { variant: "outline", disabled: archiving, onClick: close, children: t("cancel") }),
		jsx(Button, { variant: "outline", className: css.deleteAction, disabled: archiving, onClick: confirm, children: t("archive.confirm.action") })
	] }),
	children: [ /* 列表、role="status" 的进行中提示、role="alert" 的错误 */ ]
})
```

Modal（primitives，在 web bundle 中压缩为 `wy`，offset ≈ 685900）DOM 原文：
```js
function wy({open,onClose,title,closeLabel,description,children,footer,className,contentClassName,onKeyDownCapture,headless=false,backdropBlur=true,shortcutModal}){
 const w=useRef(null); gy(w,open,onClose);
 return open ? createPortal(
  <div className={Fn.root} role="presentation" onKeyDownCapture={onKeyDownCapture}>
   <div className={Fn.mask} style={backdropBlur?undefined:{backdropFilter:"none"}} aria-hidden="true" onClick={onClose}/>
   <div ref={w} tabIndex={-1} data-shortcut-modal={shortcutModal} className={cx(Fn.dialog,className)} role="dialog" aria-modal="true" aria-label={title}>
    {headless ? children : <>
     <div className={cx(Fn.content,contentClassName)}>
      <div className={Fn.header}><h2 className={Fn.title}>{title}</h2>
       <button type="button" className={Fn.close} aria-label={closeLabel} onClick={onClose}><IconClose size={14}/></button></div>
      {description && <p className={Fn.description}>{description}</p>}
      {children!==undefined && <div className={Fn.body}>{children}</div>}
     </div>
     {footer!==undefined && <div className={Fn.footer}>{footer}</div>}
    </>}
   </div>
  </div>, document.body) : null;
}
```
类名映射（offset ≈ 503990）：`root:_root_14mp3_6, mask:_mask_14mp3_18, dialog:_dialog_14mp3_33, content:_content_14mp3_63, header:_header_14mp3_71, title:_title_14mp3_79, close:_close_14mp3_87, description:_description_14mp3_108, body:_body_14mp3_117, footer:_footer_14mp3_125`。确认弹窗变体 `_confirmation_cjd8z_1 / _modalAction_cjd8z_67 / _confirmAction_cjd8z_71`（`uR`：取消按钮用 `variant:"outline"`，确认按钮用 `variant:"primary"`）。

**CSS 规则原文没取到**：web 前端的 CSS 是独立的 `.css` 资源，解包目录 `dsh-web-frontend/dist/assets` 下只有 `.js`；访问 `http://127.0.0.1:53247/` 返回 401（需要 token）。获取办法：页面连上后，在 DevTools 执行
`[...document.styleSheets].flatMap(s=>{try{return [...s.cssRules]}catch{return []}}).map(r=>r.cssText).filter(t=>/_14mp3_|_cjd8z_/.test(t)).join('\n')`。
如果直接复用这些哈希类名（`className:"_dialog_14mp3_33"` 等），版本升级后哈希会变，**不推荐**。建议插件用自己的类名，参照 token 自己写样式：遮罩 `position:fixed;inset:0;background:var(--dsw-alias-bg-mask, rgba(0,0,0,.4))`（token 名未核实，可用 Theme.listTokens 查）、卡片 `background:var(--dsw-alias-bg-base);border-radius:var(--dsw-radius-lg)`。

Escape / 焦点（`gy`，就在 `wy` 之前）：
- 打开时：记录 `document.activeElement`，自动聚焦 `[data-modal-autofocus]` → 第一个可聚焦元素（`button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]`）→ dialog 本身。
- 在 document 上监听 keydown，只对栈顶 Modal 生效（有全局 modal 栈 `Ws`）。忽略 IME 组合输入和带 ctrl/alt/meta 的按键；`Escape`（不含 shift）时 `preventDefault` 并调用 `onClose`（`repeat` 时不重复触发）；`Tab` / `Shift+Tab` 在可聚焦元素之间循环（focus trap），菜单打开时不拦截。
- 关闭时：焦点回到打开前的元素（如果仍在 DOM 中），否则回到下一层 modal。
- 插件自己实现时，至少要做到：`role="dialog" aria-modal="true" aria-label`、Escape 关闭、打开时聚焦首个按钮、关闭时还原焦点、Tab 循环。用 `ReactDOM.createPortal` 挂到 `document.body`（需确认 Builtin 里有 `react-dom`）。shell.overlay 本身已经是全局层，不 portal 也可以，但要 `position:fixed`。

---

## 6. `sidebar.footer.action`

声明：`dsh-client-ui-sidebar/lib/client.js` L765（list，root scope）。渲染（L559–561）：
```js
jsx("div", { className: SidebarRoot_module_css_default.footerActions,   // wtg9ga_footerActions
	children: renderSlot("sidebar.footer.action", { wide }) })
```
owner props 只有 `{ wide }`：`true` 表示侧栏展开（显示文字），`false` 表示收起成图标栏（rail）。

官方注册（`dsh-client-ui-cordis/lib/client.js` L1741–1771）：
```js
ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
	name: "sidebar.footer.action",
	id: "cordis-panel",
	locale: NS,
	inject: () => ({
		hooks: { inventory, activeRuns: runner.activeRuns, runErrors: runner.lastRunError, loaded, renderFailures: runner.renderFailures },
		onApprove: (requestId, approveFutureVersions) => runner.approve(requestId, approveFutureVersions),
		/* onDecline, onRun, onStop, onRemove, onRefresh ... */
	})
}, CordisPanel));
```
按钮 DOM（L1060–1128）：
```js
jsxs("div", { className: wide ? css.layer : `${css.layer} ${css.rail}`, children: [
	/* open 时显示的浮层 section */,
	jsx("div", { className: css.footerButtons, children: jsxs("button", {
		type: "button", className: css.badge, "data-active": approvals > 0 || void 0,
		"aria-label": t("panel.plugins.aria"), "aria-expanded": open, onClick: () => setOpen(v => !v),
		children: [ jsx(IconCordisPluginOutlineRegular, { size: wide ? 16 : 18 }),
			wide && <><span className={css.badgeLabel}>{t("panel.trigger")}</span><span className={css.badgeCount}>{...}</span></> ]
	}) })
]})
```
CSS 原文（L633 `CordisPanel.module.css`，类名前缀 `Fu0XRq_`）：
```css
.Fu0XRq_layer{flex:none;align-items:center;width:100%;height:42px;margin:8px 0 0;display:flex;position:relative}
.Fu0XRq_footerButtons{align-items:center;width:100%;display:flex}
.Fu0XRq_badge{width:calc(100% + 4px);height:42px;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border:none;border-radius:12px;align-items:center;gap:8px;margin:0 -2px;padding:0 10px 0 8px;font-family:inherit;font-size:14px;display:inline-flex;overflow:hidden}
@media (hover:hover){.Fu0XRq_badge:hover{background:var(--dsw-alias-interactive-bg-hover)}}
.Fu0XRq_badge[data-active]{background:var(--dsw-alias-interactive-bg-hover)}
.Fu0XRq_badgeLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}
.Fu0XRq_badgeCount{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;flex:none;margin-left:auto;font-size:12px;line-height:16px}
.Fu0XRq_layer.Fu0XRq_rail{width:36px;height:36px;margin:0}
.Fu0XRq_rail .Fu0XRq_badge{corner-shape:round;border-radius:50%;justify-content:center;gap:0;width:36px;height:36px;padding:0}
.Fu0XRq_rail .Fu0XRq_footerButtons{flex-direction:column;gap:2px}
```
容器（sidebar CSS L116）：`.wtg9ga_settingsArea,.wtg9ga_footerActions{flex:none;width:100%;min-width:0}`、`.wtg9ga_footerActions{display:flex}`、`.wtg9ga_collapsed .wtg9ga_footerActions{justify-content:center;width:auto;display:flex}`。注意 footerActions 是 **flex 横排**：多个插件的按钮会并排，cordis 按钮宽度为 `calc(100%+4px)`。插件按钮如果也占满 100%，会和它挤在一行，所以 wide 时建议给自己的 layer 加 `flex:1 1 0`，或者只放图标按钮（36×36）。

---

## 8. Client 调 Host 插件路由（deliverables 写法）

`dsh-client-ui-deliverables/lib/client.js`：
```js
const PRESENT_OPEN_PATH = "/api/present.open";   // L274
const PRESENT_HOST_PATH = "/api/present.host";   // L276
// GET（L418–430）
const response = await fetch(PRESENT_HOST_ROUTE, { signal });
if (response.ok) { const value = await response.json(); ... }
// POST（L436–459）
const target = action === "reveal" ? `${url}&action=reveal` : application === void 0 ? url : `${url}&application=${encodeURIComponent(application)}`;
const response = await fetch(target, { method: "POST", signal: this.lifetime.signal });
if (!response.ok) phase = response.status === 422 ? "nativeUnavailable" : failure;
```
要点：**没有显式 headers、没有 `credentials`、没有 body**，参数都放在 query string 里，同源相对路径。认证依赖同源 cookie（fetch 默认 `credentials:"same-origin"`）；页面根路径对无凭据请求返回 401，说明 Host 有鉴权，同源请求会自动带上凭据（未实测）。如果要发 JSON body，用 `fetch('/api/chatplus.xxx', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(data) })`。Host 端 `ctx.connection.fetch.register` 的签名属于 host 侧，本轮没有查（可用 host `Service.listService {"service":"connection"}` 核实；host inspect 不依赖页面）。

补充（Host inspect `Service.listService {"service":"connection"}` 已核实）：
```ts
interface HostConnectionFetch { register(route: ConnectionFetchRoute): () => Promise<void> }
interface ConnectionFetchRoute {
  readonly path: string;                           // 精确路径，例如 '/api/chatplus.delete'
  readonly methods: readonly ('GET'|'HEAD'|'POST')[];
  readonly requestBody: 'buffered' | 'streaming';
  readonly fetch: (request: Request) => Promise<Response>;
}
```
Host 写法：`ctx.effect(() => ctx.connection.fetch.register({ path:'/api/chatplus.delete', methods:['POST'], requestBody:'buffered', fetch: async (req) => { const body = await req.json(); ...; return Response.json({ok:true}) } }))`（`inject: ['connection']`）。描述中写明 handler 只接收 "trusted, authenticated requests"（Connection 统一做 Host/Origin 校验和浏览器鉴权），插件路由不必自己再做鉴权。
