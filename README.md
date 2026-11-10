# dsh-chat-plus: Chat plus

**Languages:** English · [简体中文](README.zh.md) · [日本語](README.ja.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

**Project:** [Architecture](ARCHITECTURE.md) · [Latest release](https://github.com/whoishuhu/dsh-chat-plus/releases/latest)

![dsh-chat-plus icon](icon.svg)

`dsh-chat-plus` is a DeepSeek Harness session-operations plugin. It brings WorkBuddy-style in-session regeneration and reply-version switching to DSH, with message editing, rollback, soft deletion, and a session recycle bin.

## Why it exists

DSH sessions use an append-only log. The plugin uses the official surface-replacement contract to remove inactive content from the model context while retaining the raw history. Switching a version appends the selected historical surface nodes back to the active session, avoiding sidebar fork sessions and core-source changes.

## Features

### In-session reply versions

- Regenerate the latest reply without creating a new sidebar session.
- Switch versions with `< 1/2 >` buttons or the left/right arrow keys.
- Show the active model name and generation time.
- Warn before regenerating a tool-using reply because tools may run again.
- Continue from the selected version with only that version visible to the model.

### Questions, replies, and rollback

- Select user questions and assistant replies for batch deletion.
- Delete a reply with its reasoning and tool calls while keeping the question.
- Delete a question together with all reply versions in that turn.
- Edit any historical question in the official composer; later turns require confirmation before removal.
- Roll back from a node and restore the original question to the composer.
- Restore image and ordinary file attachments through DSH's attachment service when possible.

### Session recycle bin

- Add Delete session after Archive session in the session menu.
- Running sessions show a stop-and-delete confirmation.
- Open the recycle bin from the workspace sidebar footer.
- Restore, permanently delete one session, or empty the bin.
- Cascade archive, restore, and permanent deletion to child subagent sessions.

## Names

- **Project**: `dsh-chat-plus`
- **GitHub repository**: `whoishuhu/dsh-chat-plus`
- **DSH plugin ID / bundle**: `dsh-chat-plus`
- **Display name**: `Chat plus` / `对话增强`
- **npm package name**: the manifest name is also `dsh-chat-plus`, but it is not published. That npm registry name is occupied by another project, so install through the GitHub repository, DSH plugin indexes, or a local bundle.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the Host projection, operation route, Client slots, version switching, and deletion model.

## Important boundaries

- Message deletion is soft deletion: the model context and chat view hide the content, while the append-only raw log remains unchanged.
- Version switching appends the selected version back into the log, so logs can grow.
- Regeneration may execute tools again; external side effects are not automatically undone.
- Permanent recycle-bin deletion is irreversible and removes session logs, projection-cache records, and child sessions.
- The plugin owns the user-message renderer to provide its action row; DSH UI changes may require an adapter update.

## Development

```powershell
node --check index.js
node --check client.js
node --test test/model.test.js test/plan.test.js
```

MIT licensed.
