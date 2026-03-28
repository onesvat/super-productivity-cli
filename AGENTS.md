# Super Productivity CLI - TypeScript Implementation

A CLI for Super Productivity with native Dropbox sync support.

## Project Structure

```
src/
├── index.ts              # CLI entry point
├── commands/
│   └── index.ts          # Command handlers (login, status, task, project)
└── lib/
    ├── config.ts         # Config file management (~/.config/super-productivity-cli/)
    ├── dropbox.ts        # Dropbox OAuth + API
    ├── encryption.ts     # AES-256-GCM + Argon2id (same as app)
    ├── compression.ts    # Gzip compression (Web Compression API)
    ├── sync-file.ts      # Prefix parsing (pf_C?E?N__)
    ├── sync-processor.ts # Decryption/decompression pipeline
    └── data-helpers.ts   # Task/project data extraction
```

## Key Features

- **Native Dropbox API**: No rclone dependency
- **PKCE OAuth**: Same authentication as Super Productivity app
- **Encryption**: AES-256-GCM with Argon2id key derivation (64MB, 3 iterations)
- **Compression**: Gzip support via Web Compression API
- **File Format**: `pf_[C][E]<version>__<payload>` prefix format

## Commands

```bash
sp login              # OAuth authentication
sp logout             # Clear tokens
sp encrypt-key <pwd>  # Set encryption password
sp status             # Today's summary
sp task list          # List tasks
sp task search <q>    # Search tasks
sp project list       # List projects
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