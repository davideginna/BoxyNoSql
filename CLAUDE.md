# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install deps
npm run dev          # run both main + renderer in watch mode (needs Electron running separately)
npm start            # start Electron (after build or with dev server running)
npm run build        # compile main (tsc) + renderer (vite)
npm run build:main   # compile src/main → dist/main via tsconfig.main.json
npm run build:renderer # bundle src/renderer → dist/renderer via vite
npm run electron:build # full build + package as .deb for Linux
```

No test suite configured yet.

## Architecture

Electron app with two separate TypeScript compilation targets:

**Main process** (`src/main/`, compiled via `tsconfig.main.json` → CommonJS):
- `main.ts` — Electron entry, BrowserWindow setup, all IPC handlers, MongoDB client lifecycle
- `preload.ts` — exposes `window.electron.invoke(channel, ...args)` to renderer via `contextBridge`

**Renderer process** (`src/renderer/`, bundled via Vite → ESM):
- `App.tsx` — root state: connections, databases, collections, open tabs. All IPC calls go through `(window as any).electron.invoke(channel, ...args)`
- `components/Sidebar.tsx` — connection list + db/collection tree
- `components/MainContent.tsx` — tab bar + tab content routing; owns documents/query/aggregation/indexes/stats state
- `components/DocumentsView.tsx` — paginated document grid
- `components/QueryTerminal.tsx` — Monaco editor, runs arbitrary JS against `db` object via `run-query` IPC
- `components/AggregationBuilder.tsx` — visual pipeline builder
- `components/IndexesView.tsx` — index CRUD
- `components/StatsView.tsx` — collection stats display
- `components/ConnectionModal.tsx` — add/edit connection form

**IPC boundary**: renderer calls `window.electron.invoke(channel, ...args)`, main process handles via `ipcMain.handle(channel, handler)`. All MongoDB operations live exclusively in the main process; renderer never imports `mongodb`.

**Persistence**: `electron-store` saves connections to `~/.config/BoxyNoSql/connections.json`. Active `MongoClient` instances are kept in a `Map<connectionId, MongoClient>` in main process memory — not persisted across app restarts.

**Dev vs prod loading**: in `NODE_ENV=development`, Electron loads `http://localhost:5173` (Vite dev server). In production, loads `dist/renderer/index.html`. Run `npm run dev` to start both watchers, then `npm start` to open Electron.

## Key constraints

- `run-query` IPC uses `new Function('db', ...)` to eval user input — intentional for a local desktop tool, not a security issue in this context.
- `tsconfig.json` covers only `src/renderer` (noEmit, bundler moduleResolution). `tsconfig.main.json` covers only `src/main` (CommonJS emit). Keep them separate.
- `@` alias resolves to `src/renderer` in Vite (configured in `vite.config.ts`); not available in main process.
