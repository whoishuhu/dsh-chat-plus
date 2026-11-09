# dsh-chat-plus: Chat plus

`dsh-chat-plus` adds WorkBuddy-style in-session reply regeneration with version switching to DeepSeek Harness, plus message editing, rollback, soft deletion, and a session recycle bin.

## Features

### Reply versions

- Regenerate the latest turn without creating a new session.
- Keep multiple replies in the same conversation and switch with `< 1/2 >` or the left/right arrow keys.
- Show the model and generation time for the active version.
- Continue the conversation from the selected version.
- Warn when regeneration may execute tools again, without blocking the action.

### Message actions

- Edit, roll back, copy, or delete a user question from its action row.
- Edit any turn; later turns are soft-deleted and original attachments can be retained.
- Roll back from a node and put the original question back into the composer.
- Delete one reply with its reasoning and tool calls, or delete a complete question/reply turn.
- Select multiple messages and delete them in one operation.

### Session recycle bin

- Add Delete session after Archive session in the session menu.
- Stop active work before moving a session to the recycle bin.
- Open the recycle bin from the bottom of the workspace sidebar.
- Restore, permanently delete one session, or empty the bin.
- Cascade operations to child subagent sessions.

## Important boundaries

- Message deletion is soft deletion: the content leaves the model context and chat view, while the append-only raw log remains unchanged.
- Switching versions appends the selected version back into the log, so the log can grow; the result remains readable after a cold restart.
- Regeneration may execute tools again. External side effects are not automatically undone.
- Permanent recycle-bin deletion is irreversible and removes session logs, projection cache entries, and associated child sessions.
- The plugin owns the user-message bubble to provide its action row. DSH UI changes may require an adapter update.

## Development

```powershell
node --test test/model.test.js test/plan.test.js
node --check index.js
node --check client.js
```

MIT licensed. This plugin is not affiliated with DeepSeek or DeepSeek Harness.
