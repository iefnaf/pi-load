# pi-load: `/load` Command Plugin — Design Spec

**Date:** 2026-05-25  
**Status:** Approved

---

## Problem

pi's `/share` command exports a session as a secret GitHub Gist, producing two URLs:

- `https://pi.dev/session/#<gist_id>`
- `https://gist.github.com/<user>/<gist_id>`

Recipients of a shared URL have no way to load that session into their own pi instance to continue the conversation. This spec defines a `/load` command that fills this gap.

---

## Solution

A standalone pi extension (plugin) that registers a `/load` command. It accepts either URL format, downloads the Gist session HTML via the GitHub CLI, converts it to a temporary JSONL file, and uses `ctx.switchSession()` to replace the current session — the same mechanism as `/import`, but with a URL as the source.

---

## Architecture

The plugin is a standalone npm package (no modifications to pi-mono) that follows the same structure as `pi-usage`.

### File structure

```
pi-load/
├── extensions/
│   └── load/
│       ├── index.ts       Extension entry point — registers /load command
│       └── session.ts     Pure functions: URL parsing + HTML→JSONL conversion
├── package.json           pi plugin manifest with pi.extensions field
└── README.md
```

### `package.json` `pi` field

```json
{
  "pi": {
    "extensions": ["./extensions/load/index.ts"]
  }
}
```

---

## Components

### `session.ts` — Pure parsing functions

**`parseGistId(url: string): string | null`**

Extracts the Gist ID from either supported URL format:

| Input | Parsed Gist ID |
|-------|---------------|
| `https://pi.dev/session/#<id>` | `<id>` (fragment after `#`) |
| `https://gist.github.com/<user>/<id>` | `<id>` (last path segment) |
| Bare `<id>` (32-char hex) | `<id>` |
| Anything else | `null` |

**`extractSessionJsonl(html: string, currentCwd: string): string`**

Converts a pi session HTML export to a JSONL string importable by pi:

1. Locate `<script id="session-data" type="application/json">` in the HTML. Throw if not found (`Invalid session: no session data found`).
2. Base64-decode the content → parse as `SessionData` JSON (`{ header, entries, leafId, systemPrompt?, tools? }`).
3. **Replace `header.cwd` with `currentCwd`** — the sender's path won't exist on the recipient's machine; using the recipient's cwd avoids a `MissingSessionCwdError`.
4. Build an id→entry map. Verify that `leafId` exists in the map; throw `Invalid session: leafId not found` if not.
5. Walk the `parentId` chain from `leafId` toward the root to collect the active branch. The walk yields entries in leaf→root order; **reverse the list** to get root→leaf (chronological) order. All fields of each entry (id, parentId, type, role, content, etc.) are preserved as-is; only `parentId` values are re-assigned in step 6.
6. Re-linearize `parentId` values: set `parentId = null` for the first entry, then `parentId = previous entry's id` for each subsequent entry. This produces a clean linear chain suitable for `SessionManager.open()`.
7. **`systemPrompt` and `tools`** from `SessionData` are intentionally excluded from the JSONL output. These are runtime state (resolved at session start) that pi regenerates from the current extension/skill configuration; including them would incorrectly freeze the sender's tool set and system prompt onto the recipient's session.
8. Return `JSON.stringify(header)\n` + one `JSON.stringify(entry)\n` per branch entry.

Both functions are pure (no I/O) and can be unit-tested without pi.

---

### `index.ts` — Extension entry point

Registers the `/load` command against `ExtensionAPI`:

```
/load <url>
```

**Handler flow:**

```
1. parseGistId(args)
     → null: notify error "Usage: /load <pi.dev/session/#... or gist.github.com/user/...>"
     → gistId: continue

2. pi.exec("gh", ["auth", "status"])
     → exitCode != 0: notify error "GitHub CLI is not logged in. Run 'gh auth login' first."

3. ctx.ui.notify("Loading session…", "info")

4. pi.exec("gh", ["gist", "view", gistId, "--filename", "session.html"])
     → exitCode != 0: notify error with stderr message
     → stdout: HTML content

5. extractSessionJsonl(html, ctx.cwd)
     → throws: notify error with message, skip to cleanup

6. Write to os.tmpdir()/pi-load-<gistId>.jsonl
     → writeFileSync throws: notify error, skip to cleanup

7. ctx.switchSession(tmpPath)

8. Cleanup (always, in a finally block): unlink tmpPath (best-effort, ignore errors)
   This ensures no stale temp files remain regardless of whether the switch
   succeeded, was cancelled, or threw.
```

**No confirmation dialog** — matches user preference ("直接执行，不确认").

---

## Key Design Decisions

### Why replace cwd?

The shared session's `header.cwd` is the sender's local path. The recipient's machine won't have that path. Rather than surface a confusing `MissingSessionCwdError`, we substitute the recipient's current `ctx.cwd`. The session history is preserved; only the working directory reference is updated.

### Why use `gh` rather than direct HTTP?

- Shared sessions are created as **secret gists** (`gh gist create --public=false`).
- Secret gists are accessible to anyone with the URL, but the `gist.githubusercontent.com` raw URL requires knowing the owner's username — which is not present in the `pi.dev/session/#<id>` format.
- `gh gist view <id>` resolves ownership automatically and handles auth, matching the precedent set by `/share`.

### Why `switchSession` and not a custom import path?

`ctx.switchSession(path)` is the public extension API equivalent of the internal `importFromJsonl`. It handles all session lifecycle hooks (`session_before_switch`, `session_start`, teardown) and is already battle-tested by the `/import` command path.

### Why a temporary JSONL file?

`switchSession` takes a file path. Writing a temporary file is the simplest bridge between the downloaded HTML content and the existing session-switching machinery. The file is cleaned up immediately after a successful switch.

---

## Error Handling

| Condition | User-visible message |
|-----------|---------------------|
| URL doesn't match any known format | `Usage: /load <pi.dev/session/#... or gist.github.com/user/...>` |
| `gh` not installed | `GitHub CLI (gh) is not installed. Install it from https://cli.github.com/` |
| `gh` not logged in | `GitHub CLI is not logged in. Run 'gh auth login' first.` |
| Gist not found / access denied | stderr from `gh gist view` |
| HTML has no session-data script | `Invalid session: no session data found in the shared URL` |
| Session switch cancelled | No message (user-initiated cancel) |

---

## Out of Scope

- **Authentication**: No pi-level auth is added; `gh` handles Gist access.
- **Partial load / context injection**: The full session replaces the current one. Injecting history as a reference message is a separate feature.
- **Non-Gist URLs**: Only GitHub Gist sources are supported (matching what `/share` produces).
- **Tests for the command handler**: The handler depends on `pi.exec` and `ctx.switchSession`; unit tests cover only the pure `session.ts` functions.
