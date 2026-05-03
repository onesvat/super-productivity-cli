# Super Productivity CLI

A command-line interface for [Super Productivity](https://github.com/super-productivity/super-productivity) with full read-write support via Local REST API.

> **Note:** This is an unofficial CLI and is not affiliated with the Super Productivity project.

## Overview

This CLI supports two backend modes:

| Mode | Access | Requirements |
|------|--------|--------------|
| **Local REST API** | Read-Write | Super Productivity desktop app must be open |
| **Dropbox Sync** | Read-Only | Dropbox sync enabled in app (no app required) |

### Which Mode Should I Use?

| Feature | Local REST API | Dropbox Sync |
|---------|:--------------:|:------------:|
| **View tasks** | ✅ | ✅ |
| **Search tasks** | ✅ | ✅ |
| **View projects** | ✅ | ✅ |
| **View tags** | ✅ | ✅ |
| **View status** | ✅ | ✅ |
| **Create tasks** | ✅ | ❌ |
| **Update tasks** | ✅ | ❌ |
| **Delete tasks** | ✅ | ❌ |
| **Start/stop task** | ✅ | ❌ |
| **Archive/restore** | ✅ | ❌ |
| **Assign tags** | ✅ | ❌ |
| **Move to project** | ✅ | ❌ |
| **Set time estimate** | ✅ | ❌ |
| **Set due date** | ✅ | ❌ |
| **Create/manage subtasks** | ✅ | ❌ |
| **View counters** | ❌ | ✅ |
| **View notes** | ❌ | ✅ |
| **App must be open** | ✅ Yes | ❌ No |
| **Works offline** | ❌ No | ✅ Yes |

**Recommendation**: Use **Local REST API** for full functionality. Use **Dropbox Sync** when the app is closed or for read-only access.

**Auto-detection**: The CLI automatically detects if the Local REST API is available. If the API is unreachable, it falls back to Dropbox mode.

## Features

- **Dual Backend** - API (read-write) and Dropbox (read-only)
- **Auto-detection** - Falls back to Dropbox if API unavailable
- **Native Dropbox API** - Direct OAuth authentication, no rclone needed
- **Encryption Support** - Decrypt sync files with AES-256-GCM + Argon2id
- **JSON Output** - All commands support `--json`, `--ndjson`, and `--full`

## Requirements

- Node.js 18+
- Super Productivity desktop app (for Local REST API)
- OR Dropbox sync enabled (for read-only mode)

## Installation

```bash
# Run directly with npx (no installation required)
npx super-productivity-cli --help

# Or install globally
npm install -g super-productivity-cli
sp --help
```

## Quick Start

### Option 1: Local REST API (Recommended - Full Features)

> **Requirements**: Super Productivity desktop app must be running with Local REST API enabled.

1. Open Super Productivity desktop app
2. Enable API: **Settings → Misc → Enable local REST API**
3. The API runs at `http://127.0.0.1:3876`

```bash
# List tasks (auto-detects API)
sp task list

# Create a new task
sp task create "Buy groceries"

# Start tracking time
sp task start <task-id>

# Stop tracking
sp task stop

# Update task
sp task update <task-id> --title "New title" --tag TODAY

# Move to project
sp task update <task-id> -p <project-id>

# Archive task
sp task archive <task-id>
```

### Option 2: Dropbox Sync (Read-Only)

> **Requirements**: Dropbox sync enabled in Super Productivity. Works without the app open.

```bash
# Login to Dropbox (one-time setup)
sp login

# Set encryption password if your sync is encrypted
sp encrypt-key "your-password"

# Force Dropbox mode
sp --dropbox task list

# View counters/habits (only available in Dropbox mode)
sp --dropbox counter list

# View notes (only available in Dropbox mode)
sp --dropbox note list
```

## Backend Selection

```bash
# Auto-detect (API if available, else Dropbox)
sp task list

# Force API mode
sp --api task list

# Force API with custom URL
sp --api http://localhost:8080 task list

# Force Dropbox mode
sp --dropbox task list

# Set custom API URL via environment variable
export SP_API_URL=http://localhost:8080
sp task list
```

## Commands

### Authentication (Dropbox)

| Command | Description |
|---------|-------------|
| `sp login` | Authenticate with Dropbox via OAuth |
| `sp logout` | Clear stored tokens |
| `sp encrypt-key <password>` | Set encryption password |
| `sp encrypt-key --clear` | Remove encryption password |

### Tasks (Read - Both Modes)

| Command | Description |
|---------|-------------|
| `sp task list` | List all incomplete tasks |
| `sp task list --today` | Tasks due today or tagged TODAY |
| `sp task list --past-due` | Overdue incomplete tasks |
| `sp task list --include-subtasks` | Include subtasks in results |
| `sp task list --done` | Show completed tasks |
| `sp task list --archived` | Show archived tasks |
| `sp task list -p <id>` | Filter by project ID |
| `sp task list -t <id>` | Filter by tag ID |
| `sp task search <query>` | Search tasks by title |
| `sp task show <id>` | Show task details |

### Tasks (Write - API Mode Only)

| Command | Description |
|---------|-------------|
| `sp task create <title>` | Create a new task |
| `sp task update <id>` | Update task fields |
| `sp task delete <id>` | Delete a task |
| `sp task start <id>` | Start task (set as current) |
| `sp task stop` | Stop current task |
| `sp task archive <id>` | Archive a task |
| `sp task restore <id>` | Restore archived task |
| `sp task reorder [ids...]` | Reorder tasks for a day (default: today) |

### Task Update Options

```bash
sp task update <id> -t "New title"              # Change title
sp task update <id> -p <project-id>             # Move to project
sp task update <id> -e 2h                       # Set estimate (2 hours)
sp task update <id> --tag TODAY,Urgent          # Set tags (replaces existing)
sp task update <id> --add-tag TODAY             # Add tag (keeps existing)
sp task update <id> --remove-tag Urgent         # Remove tag
sp task update <id> --done                      # Mark as done
sp task update <id> --undone                    # Mark as not done
sp task update <id> --due 2026-05-03            # Set due date
sp task update <id> --due-with "2026-05-03T14:00:00"  # Set due date + time
sp task update <id> --clear-due                 # Remove due date
sp task update <id> --parent <parent-id>        # Convert to subtask
sp task update <id> --clear-parent              # Convert back to main task

# Reorder tasks for today
sp task reorder                                # Show current order with IDs
sp task reorder <id1> <id2> <id3> ...           # Set new order
sp task reorder --day 2026-05-04 <ids...>       # Reorder for specific day
```

### Projects & Tags

| Command | Description |
|---------|-------------|
| `sp project list` | List all projects |
| `sp project list -q "Work"` | Search projects |
| `sp tag list` | List all tags |
| `sp tag show <id>` | Show tag details |

### Status & State

| Command | Description |
|---------|-------------|
| `sp status` | Today's summary with time spent |
| `sp state summary` | Entity counts overview |

### Counters & Notes (Dropbox Only)

| Command | Description |
|---------|-------------|
| `sp counter list` | List all counters with today's values |
| `sp note list` | List all notes with preview |

## Output Formats

All list commands support multiple output formats:

```bash
# Pretty JSON
sp task list --json

# Newline-delimited JSON (for streaming/processing)
sp task list --ndjson

# Full entity data (all fields)
sp task list --json --full
```

## Examples

```bash
# Create task with project and estimate
sp task create "Review PR" -p Work -e 30m --tag Urgent

# Create task with due date
sp task create "Submit report" --due 2026-05-10 -e 2h

# Create subtask
sp task create "Write introduction" --parent abc123 -e 30m

# Start working on a task
sp task start abc123

# Move task to another project and add tag
sp task update abc123 -p "Side Project" --add-tag TODAY

# Set due date on existing task
sp task update abc123 --due 2026-05-03

# Get tasks as JSON for scripting
sp task list --today --json | jq '.[] | .title'

# List all tasks including subtasks
sp task list --include-subtasks

# Check current status
sp status
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

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SP_API_URL` | Local REST API URL | `http://127.0.0.1:3876` |

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run locally
npm run start -- --help

# Link for global use
npm link
```

## Related Projects

- [Super Productivity](https://github.com/super-productivity/super-productivity) - The main application

## License

MIT