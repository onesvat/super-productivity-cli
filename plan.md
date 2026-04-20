# Feature Plan: Read-only Commands from sp-cli

This document outlines features to add to super-productivity-cli, sourced from the `packages/sp-cli` implementation in the super-productivity repository.

**Scope**: Only read-only commands. No write/mutation operations.

---

## 1. Counter Commands

Add `sp counter` command group for habit/counter tracking.

### `sp counter list`

List all counters (habits) with their current state.

```
Output (default):
🔢 Reading (abc123) 🟢 today=5
🔢 Exercise (def456) ⚪ today=0

Output (--json):
[
  { "id": "abc123", "title": "Reading", "isOn": true, "type": "CLICK", "todayValue": 5 },
  { "id": "def456", "title": "Exercise", "isOn": false, "type": "CLICK", "todayValue": 0 }
]
```

**Implementation**:

- Access `data.state.simpleCounter.entities`
- Filter by `data.state.simpleCounter.ids`
- Calculate `todayValue` from `countOnDay[todayDate]`

### `sp counter show <id>`

Show single counter details.

```
Output:
🔢 Reading
id: abc123
type: CLICK
isOn: yes
today: 5
```

---

## 2. Tag Commands

Add `sp tag` command group for tag management (read-only).

### `sp tag list`

List all tags with task counts.

```
Output:
🏷️ TODAY (TODAY) • 5 tasks
🏷️ Urgent (xyz789) • 3 tasks
🏷️ Work (work-tag) • 12 tasks
```

**Implementation**:

- Access `data.state.tag.entities`
- Count tasks via `tag.taskIds.length`

### `sp tag show <id>`

Show single tag details.

```
Output:
🏷️ TODAY
id: TODAY
tasks: 5
```

---

## 3. Note Commands

Add `sp note` command group for project/today notes.

### `sp note list`

List all notes with preview.

```
Output:
🗒️ note-abc123 • Meeting notes from yesterday...
🗒️ note-def456 • Project roadmap draft...
```

**Implementation**:

- Access `data.state.note.entities` (if exists)
- Show `content.slice(0, 80)` as preview

### `sp note show <id>`

Show single note details.

```
Output:
🗒️ note-abc123
project: proj-123
pinnedToday: no
preview: Meeting notes from yesterday...
```

---

## 4. State Summary Command

Add `sp state summary` for entity counts overview.

```
Output:
📊 State Summary
  tasks: 45
  projects: 3
  counters: 5
  tags: 8
  notes: 2
  plannerDays: 14
```

**Implementation**:

- Count `state.task.ids.length`
- Count `state.project.ids.length`
- Count `state.simpleCounter.ids.length`
- Count `state.tag.ids.length`
- Count `state.note.ids.length`
- Count `state.planner.days` keys

---

## 5. Output Format Options

Add two new output format flags alongside existing `--json`.

### `--ndjson`

Newline-delimited JSON for list outputs (machine-parseable).

```
Output:
{"id":"abc123","title":"Reading","isOn":true,"todayValue":5}
{"id":"def456","title":"Exercise","isOn":false,"todayValue":0}
```

**Use case**: Streaming output for AI/LLM agents, easier to parse line-by-line.

### `--full`

Output full entity payloads instead of summaries.

```
Output (--json --full):
{
  "id": "abc123",
  "title": "Reading",
  "isOn": true,
  "type": "CLICK",
  "countOnDay": { "2026-03-28": 5, "2026-03-27": 4 },
  "created": 1709500000000,
  "modified": 1709501234567,
  ...all fields...
}
```

**Use case**: When full entity data is needed (timestamps, all historical data, etc.).

---

## Implementation Order

1. **Phase 1**: Add `--ndjson` and `--full` flags to existing commands
2. **Phase 2**: Add `counter list` and `counter show`
3. **Phase 3**: Add `tag list` and `tag show`
4. **Phase 4**: Add `note list` and `note show`
5. **Phase 5**: Add `state summary`

---

## Data Structure Reference

Entities are stored in sync data as:

```typescript
interface SyncData {
  state: {
    task: { ids: string[]; entities: Record<string, Task> };
    project: { ids: string[]; entities: Record<string, Project> };
    tag: { ids: string[]; entities: Record<string, Tag> };
    simpleCounter?: { ids: string[]; entities: Record<string, Counter> };
    note?: { ids: string[]; entities: Record<string, Note> };
    planner?: { days?: Record<string, string[]> };
  };
}
```

---

## Files to Modify/Add

| File                      | Changes                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `src/lib/data-helpers.ts` | Add `getCounters`, `getCounterIds`, `getNotes`, `getNoteIds`, `getTags`, `getTagIds` helpers |
| `src/commands/index.ts`   | Add `counterCmd`, `tagCmd`, `noteCmd`, `stateCmd` exports and registrations                  |
| New: `src/lib/output.ts`  | Add `printMany`, `printOne` functions for --json/--ndjson/--full handling                    |

---

## Reference Implementation

See `packages/sp-cli/src/` in super-productivity repository:

- `commands/counter.ts` - counter list/show
- `commands/tag.ts` - tag list/show (lines 27-85, skip write commands)
- `commands/note.ts` - note list/show
- `commands/state.ts` - state summary
- `cli/output.ts` - output formatting utilities
- `sync/read-model.ts` - entity access helpers
