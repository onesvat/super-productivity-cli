# super-productivity-cli refactor plan (AI-agent-friendly CLI)

## 1) Current structure analysis (`sp.py`)

- Single-file CLI (~1091 lines) with endpoint/action dispatch in `main()`.
- Data model accessors:
  - tasks: `state.task.ids/entities`
  - projects: `state.project.entities`
  - counters: `state.simpleCounter.ids/entities`
  - today tag via `TODAY` tag in `state.tag.entities`.
- Sync model:
  - all valid commands run `sync_download()` first.
  - mutating commands run `save_data()` and then global `sync_upload()`.
- Current UX issues for agents:
  - `pick_task()` and `pick_counter()` do fuzzy search + interactive selection (`input()`), causing EOF errors non-interactively.
  - `task delete` / `counter delete` require interactive confirmation.
  - output is human-oriented text with ANSI formatting and symbols only.
  - no stable machine-readable output mode.

## 2) Required changes

### A. Output mode foundation
- Add global flags at root parser level:
  - `--json`
  - `--ndjson`
  - `--full`
- Enforce mutual exclusion for `--json` and `--ndjson`.
- Add serializers for essential vs full payloads:
  - task essential: `id,title,projectId,estimate,isDone,today`
  - project essential: `id,title`
  - counter essential: `id,title,type`
- Introduce unified emit helpers:
  - emit one object / list in text/json/ndjson modes
  - deterministic keys and no ANSI in machine modes

### B. Remove fuzzy/interactive selection (ID-only for operations)
- Keep fuzzy helpers for backward-compatible list/search internals only, but stop using them for mutating/view operations.
- Add strict ID lookup helpers:
  - `get_task_or_exit(data, task_id)`
  - `get_project_or_exit(data, project_id)`
  - `get_counter_or_exit(data, counter_id)`
- Change command arguments from `query` to `id` where needed:
  - `task view/edit/delete/done/today/log/estimate/plan/move`
  - `counter toggle/log/edit/delete`
  - `project view`

### C. Add missing commands from target behavior
- `task view <id> [--json] [--full]`
- `project view <id> [--json]`
- keep existing commands (`task plan`, `task move`, `counter add/edit/delete`) for backward compatibility.

### D. Non-interactive confirmations
- Replace interactive confirmation prompts in delete commands with:
  - `--yes` required for destructive delete
  - if absent: fail fast with clear error message (text/json mode aware)

### E. List filters and minimal output alignment
- `task list`:
  - support `--project <id>` (ID-based)
  - keep existing `--tomorrow/--date/--scheduled` as compatibility extensions.
  - default text output remains concise; in json modes emit essential objects unless `--full`.
- `project list` / `counter list` / `status`:
  - support parseable json/ndjson output.

### F. Help note for agents
- Add help epilog note:
  - use `--json` / `--ndjson`
  - default JSON is essential fields
  - `--full` for complete fields
  - ID-based operations for reliability

### G. Backward compatibility strategy
- Preserve storage format and sync behavior unchanged.
- Preserve existing command families and most flags.
- Make mutating/query-targeted operations ID-first and deterministic.
- Keep text output for humans by default.

## 3) Implementation sequence

1. Add output/context helpers + serialization functions.
2. Refactor parser to add global format flags and ID arguments.
3. Implement `task view` + `project view`.
4. Refactor all task/counter/project operations to strict ID lookup.
5. Replace deletes with `--yes` guard.
6. Wire json/ndjson output across list/view/status and mutating responses.
7. Run CLI help + representative command tests for `--json` and `--ndjson`.

## 4) Validation plan

- Parser sanity:
  - `python3 sp.py --help`
  - `python3 sp.py task --help`
- JSON/NDJSON behaviors:
  - `python3 sp.py --json task list`
  - `python3 sp.py --ndjson task list`
  - `python3 sp.py --json project list`
  - `python3 sp.py --json counter list`
  - `python3 sp.py --json status`
- ID operations (using IDs from list output):
  - `task view/edit/done/today/log/delete --yes`
  - `project view`
  - `counter toggle/log`

## 5) Implementation status

- Completed: Added global machine output flags (`--json`, `--ndjson`, `--full`) with parser support across root/endpoint/action command positions.
- Completed: Added machine output helpers (`emit`, `fail`) and entity serializers for task/project/counter with essential vs full payloads.
- Completed: Converted task/project/counter targeted operations to ID-based arguments.
- Completed: Added `task view <id>` and `project view <id>`.
- Completed: Replaced interactive delete prompts with `--yes` guard for task and counter deletes.
- Completed: Added JSON/NDJSON output paths for `status`, `task list/view`, `project list/view`, `counter list`, and mutating command responses.
- Completed: Suppressed sync status chatter in machine mode so output remains parseable JSON/NDJSON.
- Completed: Verified parser and runtime behavior with `python3 -m py_compile sp.py`, help output checks, and live JSON/NDJSON command runs.
