# dsh-chat-plus architecture

## Runtime layers

```text
DSH Session log (append-only)
        |
        +-- Host projection: chatPlus
        |     folds turns, hidden ranges, version families, model/time metadata
        |
        +-- Host operation route: /api/chatplus.op
        |     regen / switch / edit / rollback / delete / recycle-bin
        |
        +-- Client slots
              user + steering node replacement
              assistant-actions
              composer dock
              sidebar footer
              shell overlay
              session context menu
```

## Why versions stay in one session

DSH surface replacement hides nodes from the model but does not erase the raw log. A selected old version is appended back at the end with its original message data, so the model sees exactly one active version while the transcript projection hides inactive versions.

The projection is derived only from durable Session events. It stores no authoritative chat content in local storage. This keeps cold-session loading and restart behavior deterministic.

## Operations

- `regen`: replace the last turn, then follow up with the original user message.
- `switch`: replace the active version and append the selected version's original surface nodes.
- `delete`: replace a reply range or an entire turn with an empty developer node.
- `rollback`: replace the selected turn and all later visible surface nodes.
- `edit`: rollback from the selected turn, then follow up with edited content.
- `trash`: archive and stop the session, record it in the recycle-bin domain, and cascade to child subagents.

## UI ownership

The official DSH user-message renderer does not expose an action-row slot. The plugin therefore shadows the `user` and `steering` keyed Chat renderers at a lower priority and reuses the official `conversation.chat.user.content` Factory. This is the only intentionally version-sensitive integration point.

## Safety boundaries

- Message deletion is soft deletion. Raw append-only logs remain intact.
- Permanent session deletion validates the persistence path, stops activity, flushes, deletes the session directory, detaches live stores, clears projection cache, and removes workspace references.
- Attachments are content-addressed and are not deleted when a session is deleted, because they may be shared by other sessions.
