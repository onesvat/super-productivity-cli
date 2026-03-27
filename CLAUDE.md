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
bun run src/index.ts --help   # Run CLI
bun dev                       # Run with auto-reload
bun run build                 # Build standalone binary
```

## Dependencies

- `commander` - CLI framework
- `hash-wasm` - Argon2id key derivation
- `@noble/ciphers` - AES-GCM encryption

---

# Bun Configuration

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```