# Super Productivity CLI

A command-line interface for [Super Productivity](https://github.com/super-productivity/super-productivity) to view your tasks from the terminal.

> **Note:** This is an unofficial CLI and is not affiliated with the Super Productivity project.

## Overview

This CLI provides read-only access to your Super Productivity data stored in Dropbox. It allows you to quickly check your tasks, projects, and today's status without opening the main application.

**Why read-only?** Super Productivity uses a complex internal sync mechanism with operation logs, vector clocks, and conflict resolution. Supporting write operations would require replicating this entire sync infrastructure, which is beyond the scope of this CLI. For modifying tasks, please use the main [Super Productivity app](https://github.com/super-productivity/super-productivity).

## Features

- **Native Dropbox API** - Direct OAuth authentication, no rclone or external tools needed
- **Encryption Support** - Decrypt sync files encrypted with AES-256-GCM + Argon2id
- **Compression Support** - Handle gzip-compressed sync files
- **JSON Output** - All commands support `--json`, `--ndjson`, and `--full` for scripting

## Requirements

- Node.js 18+
- Super Productivity with Dropbox sync enabled

## Installation

```bash
# Run directly with npx (no installation required)
npx super-productivity-cli --help

# Or install globally
npm install -g super-productivity-cli
sp --help
```

## Quick Start

```bash
# Login to Dropbox (one-time setup)
sp login

# (Optional) Set encryption password if your sync is encrypted
sp encrypt-key "your-password"

# View today's summary
sp status

# List all tasks
sp task list

# List tasks due today
sp task list --today

# List overdue tasks
sp task list --past-due

# Search tasks
sp task search "report"

# List projects
sp project list

# View counters/habits
sp counter list

# View tags
sp tag list

# View notes
sp note list

# View state summary
sp state summary
```

## Commands

### Authentication

| Command | Description |
|---------|-------------|
| `sp login` | Authenticate with Dropbox via OAuth |
| `sp logout` | Clear stored tokens |
| `sp encrypt-key <password>` | Set encryption password |
| `sp encrypt-key --clear` | Remove encryption password |

### Tasks

| Command | Description |
|---------|-------------|
| `sp task list` | List all incomplete tasks |
| `sp task list --today` | Tasks due today or tagged TODAY |
| `sp task list --past-due` | Overdue incomplete tasks |
| `sp task list --done` | Show completed tasks |
| `sp task list --project "Work"` | Filter by project |
| `sp task search <query>` | Search tasks by title (supports `*` wildcard) |
| `sp task list --json` | Output as JSON |
| `sp task list --ndjson` | Output as newline-delimited JSON |
| `sp task list --full` | Include all task fields |

### Projects

| Command | Description |
|---------|-------------|
| `sp project list` | List all projects with task counts |
| `sp project list --json` | Output as JSON |

### Counters (Habits)

| Command | Description |
|---------|-------------|
| `sp counter list` | List all counters with today's values |
| `sp counter show <id>` | Show counter details |
| `sp counter list --json` | Output as JSON |
| `sp counter list --full` | Include count history |

### Tags

| Command | Description |
|---------|-------------|
| `sp tag list` | List all tags with task counts |
| `sp tag show <id>` | Show tag details |
| `sp tag list --json` | Output as JSON |

### Notes

| Command | Description |
|---------|-------------|
| `sp note list` | List all notes with preview |
| `sp note show <id>` | Show note details |
| `sp note list --json` | Output as JSON |
| `sp note list --full` | Include full content |

### Status

| Command | Description |
|---------|-------------|
| `sp status` | Today's summary with time spent by project |
| `sp status --json` | Today's status as JSON |

### State

| Command | Description |
|---------|-------------|
| `sp state summary` | Show entity counts (tasks, projects, counters, etc.) |
| `sp state summary --json` | Output as JSON |

## Output Formats

All list commands support multiple output formats:

### `--json` (Pretty JSON)

```bash
sp task list --json
```

```json
[
  { "id": "task-1", "title": "My Task", "projectId": "INBOX_PROJECT" }
]
```

### `--ndjson` (Newline-delimited JSON)

Useful for streaming and processing line-by-line:

```bash
sp counter list --ndjson
```

```json
{"id":"counter-1","title":"Reading","todayValue":5}
{"id":"counter-2","title":"Exercise","todayValue":0}
```

### `--full` (Complete entity data)

Include all fields (timestamps, history, etc.):

```bash
sp counter show counter-1 --json --full
```

```json
{
  "id": "counter-1",
  "title": "Reading",
  "countOnDay": { "2024-12-01": 5, "2024-11-30": 3 },
  "created": 1733000000000
}
```

## Encryption

If you've enabled encryption in Super Productivity's Dropbox sync settings, set your encryption password:

```bash
sp encrypt-key "your-encryption-password"
```

The CLI uses the same encryption as the main app:
- **Algorithm**: AES-256-GCM
- **Key Derivation**: Argon2id (64MB memory, 3 iterations)
- **Format**: Same prefix-based format as Super Productivity

## JSON Output Examples

```bash
# Get today's tasks as JSON
sp task list --today --json

# Parse with jq
sp status --json | jq '.tasks.plannedDay'

# Stream counters as NDJSON for processing
sp counter list --ndjson | while read line; do
  echo "Processing: $(echo $line | jq -r '.title')"
done

# Get full task data for export
sp task list --json --full > tasks-backup.json
```

## Configuration

Config stored at `~/.config/super-productivity-cli/config.json`:

```json
{
  "dropbox": {
    "accessToken": "...",
    "refreshToken": "...",
    "encryptKey": "optional-password"
  }
}
```

## Development

```bash
# Install dependencies
bun install

# Build
npm run build

# Run locally
npm run start -- --help

# Run tests
npm test

# Watch mode
npm run test:watch
```

## Related Projects

- [Super Productivity](https://github.com/super-productivity/super-productivity) - The main application (Desktop, Mobile, Web)

## License

MIT