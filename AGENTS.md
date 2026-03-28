# Super Productivity CLI - TypeScript Implementation

A CLI for Super Productivity with two backend modes: Dropbox (read-only) and Local REST API (read-write).

## Backend Modes

### API Mode (Default, Read-Write)
Connects to the Local REST API exposed by Super Productivity desktop app at `http://127.0.0.1:3876`.

```bash
sp task list                    # Auto-detects API if available
sp --api task create "New task" # Force API mode
sp task start <id>              # Start a task
sp task stop                    # Stop current task
```

### Dropbox Mode (Read-Only)
Downloads encrypted sync file from Dropbox. Requires `sp login` first.

```bash
sp --dropbox task list          # Force Dropbox mode
sp --dropbox status             # Today's summary
```

**Auto-detection**: If API is unavailable (timeout), falls back to Dropbox automatically.

**Env variable**: `SP_API_URL` - Set custom API URL (default: `http://127.0.0.1:3876`)

## Project Structure

```
src/
├── index.ts              # CLI entry point + backend selection
├── commands/
│   └── index.ts          # Command handlers
└── lib/
    ├── backend.ts        # Backend interface
    ├── api-client.ts     # HTTP client for Local REST API
    ├── api-backend.ts    # API implementation (full read-write)
    ├── dropbox-backend.ts # Dropbox implementation (read-only)
    ├── config.ts         # Config file management (~/.config/super-productivity-cli/)
    ├── dropbox.ts        # Dropbox OAuth + API
    ├── encryption.ts     # AES-256-GCM + Argon2id (same as app)
    ├── compression.ts    # Gzip compression (Web Compression API)
    ├── sync-file.ts      # Prefix parsing (pf_C?E?N__)
    ├── sync-processor.ts # Decryption/decompression pipeline
    └── data-helpers.ts   # Task/project data extraction
```

## Key Features

- **Dual Backend**: API (read-write) or Dropbox (read-only)
- **Auto-detection**: Falls back to Dropbox if API unavailable
- **Native Dropbox API**: No rclone dependency
- **PKCE OAuth**: Same authentication as Super Productivity app
- **Encryption**: AES-256-GCM with Argon2id key derivation (64MB, 3 iterations)
- **Compression**: Gzip support via Web Compression API
- **File Format**: `pf_[C][E]<version>__<payload>` prefix format

## Commands

```bash
# Authentication (Dropbox)
sp login              # OAuth authentication
sp logout             # Clear tokens
sp encrypt-key <pwd>  # Set encryption password

# Status
sp status             # Today's summary

# Tasks (Read - both modes)
sp task list          # List tasks
sp task search <q>    # Search tasks
sp task show <id>     # Show task details

# Tasks (Write - API mode only)
sp task create <title>            # Create task
sp task update <id> --title "..." # Update task
sp task delete <id>               # Delete task
sp task start <id>                # Start task
sp task stop                      # Stop current task
sp task archive <id>              # Archive task
sp task restore <id>              # Restore archived task

# Projects & Tags (Read - both modes)
sp project list       # List projects
sp tag list           # List tags
```

## Development

```bash
npm run build         # Build with tsc
npm run start         # Run compiled CLI
npm run dev           # Run with --watch
```

## Dependencies

- `commander` - CLI framework
- `hash-wasm` - Argon2id key derivation
- `@noble/ciphers` - AES-GCM encryption

---

# Runtime Configuration

This project uses Node.js for execution, Bun for package management.

- Use `bun install` for installing packages
- Use `npm run <script>` for running scripts (build, start, dev)
- Build output goes to `dist/` directory