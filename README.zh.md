# dsh-chat-plus：对话增强

**语言：** 简体中文 · [English](README.md) · [日本語](README.ja.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

**项目入口：** [项目宣传页](https://whoishuhu.github.io/dsh-chat-plus/) · [功能架构](ARCHITECTURE.md) · [发布页](https://github.com/whoishuhu/dsh-chat-plus/releases/latest)

![dsh-chat-plus icon](icon.svg)

`dsh-chat-plus` 是 DeepSeek Harness 的会话操作增强插件，目标是把 WorkBuddy 风格的「原会话内重新生成与多版本切换」带回 DSH，同时提供消息编辑、回退、软删除和会话回收站。

## 为什么做这个插件

DSH 的会话日志是 append-only。插件利用 DSH 官方 surface replacement 机制，把不再选中的内容移出模型上下文；历史版本仍保留在日志中，切换时将目标版本重新追加到当前会话末尾。这样可以不创建侧边栏分叉会话，也不会改写 DSH 原始日志。

## 功能

### 同会话回复版本

- 最后一轮回复支持重新生成。
- 回复版本显示 `< 1/2 >`，可用左右按钮或键盘左右键切换。
- 显示当前版本模型名称和生成时间。
- 重新生成前提示工具可能再次执行，之前的副作用不会自动撤回。
- 切换版本后继续对话时，模型只看到当前选中的版本。

### 问题、回复与回退

- 用户问题和助手回复都提供选择框，可多选批量删除。
- 删除回复：移除该回复、思考和工具调用，保留问题。
- 删除问题：连同该问题的全部回复版本一起移除。
- 编辑历史问题：原问题回填官方输入框；非最后一轮会确认删除后续轮次。
- 回退：当前节点及后续轮次软删除，原问题回填输入框；附件尽力恢复为草稿附件。
- 图片和普通文件附件通过 DSH 官方附件服务恢复，不改写原附件对象。

### 会话回收站

- 会话菜单中在「归档会话」下方增加「删除会话」。
- 运行中的会话会显示状态，并提供停止并删除或取消。
- 工作区底部提供回收站入口。
- 支持还原、单条永久删除和清空回收站。
- 子代理会话随父会话归档、还原和永久删除。

## 名称说明

- **项目名**：`dsh-chat-plus`
- **GitHub 仓库**：`whoishuhu/dsh-chat-plus`
- **DSH 插件 ID / bundle 名**：`dsh-chat-plus`
- **显示名**：`对话增强 / Chat plus`
- **npm 包名**：manifest 中的包名也是 `dsh-chat-plus`，但尚未发布到 npm；npm registry 的同名包已被其他项目占用，因此目前通过 GitHub 仓库、DSH 插件索引或本地 bundle 安装。

## 架构

详细说明见 [ARCHITECTURE.md](ARCHITECTURE.md)。插件由 Host projection、Host operation route 和 Client slots 三部分组成，不修改 DSH 核心源码。

## 重要边界

- 消息删除是软删除：模型上下文和聊天显示会隐藏内容，但 append-only 原始日志不会改写。
- 版本切换会向日志追加选中版本副本，因此日志可能增长。
- 工具重新生成可能再次执行文件操作、命令或其他外部副作用。
- 回收站永久删除不可恢复，会删除会话日志、投影缓存和子代理会话。
- 用户消息渲染器由插件接管，以提供操作条；DSH UI 改版时可能需要更新插件。

## 开发

```powershell
node --check index.js
node --check client.js
node --test test/model.test.js test/plan.test.js
```

MIT licensed.
