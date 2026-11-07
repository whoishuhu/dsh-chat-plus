# 原型验证结论（2026-11-06，dsh-chat-plus-probe）

在真实会话里跑通，DSH 0.2.2-rc.1：

1. 隐藏最后一轮：在 agent idle 时 `agent.runMaintenance` 内 append 一个空 `developer/message`，`surfaceOp: {op:'replace', startSeq, endSeq}`，`sourceEventSeqs` = 区间内**全部当前可见节点**（含 runtime-context user/message）。之后 deriveMessages 只剩系统提示。
2. 重新生成：隐藏后 `agent.followup({...原提问 data, id: 新id})`，生成完整第 2 轮（含工具调用）。
3. 切回旧版本：隐藏第 2 轮 + 把第 1 轮可见节点（user/assistant/tool/result）**原样**（同 message id、原 turn/step、原 stream）`append`，被接受；deriveMessages 与原第 1 轮完全一致。
4. 在切回的版本上继续对话：模型正确引用旧版本回复。
5. fork（冷读持久化日志并做种子校验）后 deriveMessages 一致 → 持久化格式合法。

必须遵守的约束（踩过的坑）：
- replace 的 sourceEventSeqs 必须覆盖区间内每一个当前可见节点；用 `session.surface.nodes` 求区间。
- 替换节点 `developer/message` 的 `step` 必须 ≥ 1（step 0 在下一轮请求时报错）。
- message.source.kind 不能是 `'plugin'`（format v4 保留）；用 `'dsh-chat-plus'`。
- 写入错误不会在 append 时暴露，而是在下一轮请求组装时让整轮 error —— 所以每种写法都要实测一轮。
- Host 插件改代码后热更新不生效：要 remove_bundle + 改版本号 + install_bundle。
