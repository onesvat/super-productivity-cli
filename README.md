# Super Productivity CLI

Command line interface for Super Productivity with native Dropbox sync support.

## Features

- **Native Dropbox API** - No rclone dependency, direct OAuth authentication
- **Encryption Support** - Decrypt sync files encrypted with AES-256-GCM + Argon2id
- **Compression Support** - Handle gzip-compressed sync files
- **Same App Key** - Uses the same Dropbox app as Super Productivity

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
# Login to Dropbox
sp login

# (Optional) Set encryption password if your sync is encrypted
sp encrypt-key "your-password"

# View today's status
sp status

# List tasks
sp task list

# Search tasks
sp task search "report"
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
| `sp task list` | List tasks |
| `sp task search <query>` | Search tasks by title |

**List options:**
- `-p, --project <name>` - Filter by project
- `-d, --done` - Show completed tasks
- `-t, --today` - Tasks due today or tagged TODAY
- `--past-due` - Only past-due incomplete tasks
- `--json` - Output as JSON

### Projects

| Command | Description |
|---------|-------------|
| `sp project list` | List all projects |

### Status

| Command | Description |
|---------|-------------|
| `sp status` | Show today's summary with time by project |
| `sp status --json` | Today's status as JSON |

## Encryption

If you've enabled encryption in Super Productivity's sync settings, set your encryption password:

```bash
sp encrypt-key "your-encryption-password"
```

The CLI uses the same encryption as the main app:
- **Algorithm**: AES-256-GCM
- **Key Derivation**: Argon2id (64MB memory, 3 iterations)
- **Format**: Same prefix-based format as Super Productivity

## File Format

The CLI handles Super Productivity's sync file (`/sync-data.json` on Dropbox):

```
pf_[C][E]<version>__<payload>
```

- `C` = gzip compressed
- `E` = AES-256-GCM encrypted
- `<version>` = model version number

Examples:
- `pf_2__` - Plain JSON, version 2
- `pf_C2__` - Compressed, version 2
- `pf_CE2__` - Compressed + Encrypted, version 2

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
# Clone and install
git clone https://github.com/onesvat/super-productivity-cli.git
cd super-productivity-cli
npm install

# Build
npm run build

# Run
node dist/index.js --help
```

## License

MIT