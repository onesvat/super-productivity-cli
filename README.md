# Super Productivity CLI (`sp.py`)

Read-only command line interface for Super Productivity data with `rclone` Dropbox sync.

## Requirements

- Python 3
- `rclone` configured with a remote named `dropbox`
- Super Productivity Dropbox sync enabled

## Setup

1. Install rclone: `curl https://rclone.org/install.sh | sudo bash`
2. Configure Dropbox: `rclone config` → New remote → Name it `dropbox` → Choose Dropbox → Follow auth flow
3. Enable Dropbox sync in Super Productivity app settings

## CLI Structure

```bash
$ sp --help
usage: sp [-h] [--json | --ndjson] [--full] {status,yesterday,task,project,counter} ...

Super Productivity CLI (Read-Only Mode)

positional arguments:
  {status,yesterday,task,project,counter}
    status              Show today's summary
    yesterday           Show yesterday's report
    task                Task commands (read-only)
    project             Project commands (read-only)
    counter             Counter commands (read-only)

options:
  -h, --help            show this help message and exit
  --json                Emit JSON output
  --ndjson              Emit NDJSON output
  --full                Include full entity payload in JSON/NDJSON output
```

## Commands

### Reports

| Command | Description |
|---------|-------------|
| `sp status` | Today's summary with tasks and time by project |
| `sp yesterday` | Yesterday's report with tasks and time |

### Tasks (Read-Only)

| Command | Description |
|---------|-------------|
| `sp task list [options]` | List tasks with filters |
| `sp task view <id>` | View task details |
| `sp task search <query>` | Search tasks by title |

**List filters:**
- `--project, -p <id>` - Filter by project
- `--done, -d` - Show completed tasks
- `--today, -t` - Only today's tasks
- `--tomorrow` - Only tomorrow's tasks
- `--date YYYY-MM-DD` - Filter by due date
- `--scheduled` - Only scheduled tasks

### Projects (Read-Only)

| Command | Description |
|---------|-------------|
| `sp project list` | List all projects |
| `sp project view <id>` | View project details |

### Counters (Read-Only)

| Command | Description |
|---------|-------------|
| `sp counter list` | List all counters |
| `sp counter search <query>` | Search counters by title |

## Output Flags

- `--json`: JSON output for scripts/AI agents
- `--ndjson`: One JSON object per line
- `--full`: Include full entity payload

Examples:
```bash
sp status --json
sp task list --today --json
sp task search "report" --ndjson
```

## Search

Search supports:
- Plain text: case-insensitive substring match
- Wildcard `*`: matches any characters

Examples:
```bash
sp task search "greek"
sp task search "open*"
sp counter search "coffee"
```

## Common Workflows

```bash
# Check today's status
sp status

# See yesterday's activity
sp yesterday

# Find tasks for a project
sp task list --project "Work"

# Search for a specific task
sp task search "report"

# View task details
sp task view <task-id>

# List all projects
sp project list

# Check counters
sp counter list
```

## AI/LLM Agent Note

- Use `--json` or `--ndjson` flags for parseable output
- Default JSON shows essential fields; use `--full` for all fields
- This is a read-only CLI - no mutations are supported