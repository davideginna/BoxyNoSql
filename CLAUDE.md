# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install            # install deps
npm run dev            # watch main + renderer AND launch Electron (concurrently + wait-on) — one command, no separate start needed
npm start              # start Electron only (against an existing build / dev server)
npm run build          # compile main (tsc) + renderer (vite)
npm run build:main     # compile src/main → dist/main via tsconfig.main.json
npm run build:renderer # bundle src/renderer → dist/renderer via vite
npm run electron:build # full build + package as .deb for Linux
npm run electron:build:dir # build unpackaged app dir (no installer)
```

Tests (Vitest):

```bash
npm test               # run all tests once (verbose)
npm run test:watch     # watch mode
npm run test:coverage  # v8 coverage (scoped to src/main/serialize.ts + src/renderer/utils/**)
npx vitest run src/renderer/__tests__/buildFilter.test.ts  # single file
npx vitest run -t "substring of test name"                 # single test by name
```

Test setup in `vitest.config.ts`: tests live in `src/**/__tests__/*.test.{ts,tsx}`. `src/renderer/**` runs in `jsdom`, everything else in `node` (see `environmentMatchGlobs`). `@` alias works in tests.

## Architecture

Electron app with two separate TypeScript compilation targets:

**Main process** (`src/main/`, compiled via `tsconfig.main.json` → CommonJS):
- `main.ts` — Electron entry, BrowserWindow setup, all IPC handlers, MongoDB client lifecycle
- `serialize.ts` — `serializeDoc()` converts BSON/Mongo values into JSON-safe form before crossing IPC (ObjectId → `{$oid}`, Date → ISO, Buffer → hex; guards circular refs + max depth). All docs returned to renderer pass through this. Unit-tested.
- `preload.ts` — exposes `window.electron.invoke(channel, ...args)` to renderer via `contextBridge`

**Renderer process** (`src/renderer/`, bundled via Vite → ESM):
- `App.tsx` — root state: connections, databases, collections, open tabs. All IPC calls go through `(window as any).electron.invoke(channel, ...args)`
- `components/Sidebar.tsx` — connection list (groupable into folders) + db/collection tree
- `components/MainContent.tsx` — tab bar + tab content routing; owns documents/query/aggregation/indexes/stats state
- `components/DocumentsView.tsx` — paginated document grid
- `components/DocumentTree.tsx` — expandable tree view of a single document
- `components/QueryTerminal.tsx` / `components/MonacoQueryEditor.tsx` — Monaco editor, runs arbitrary JS against `db` object via `run-query` IPC
- `components/AggregationBuilder.tsx` — visual pipeline builder
- `components/IndexesView.tsx` — index CRUD
- `components/StatsView.tsx` — collection stats display
- `components/ConnectionModal.tsx` — add/edit connection form
- `components/UsersRolesModal.tsx` — DB users + roles management (list/create/drop users & roles)
- `components/ContextMenu.tsx` — right-click menus in the sidebar tree
- `components/DialogModal.tsx` + `dialog.ts` — in-app confirm/input dialogs (backed by `show-confirm` / `show-input` IPC), used instead of native dialogs
- `utils/buildFilter.ts` — type-aware query-filter model: `FieldType`/`Operator` enums, `OPERATORS_BY_TYPE`, builds a Mongo filter from UI conditions. Unit-tested.
- `utils/fileImport.ts` — parses JSON/CSV files for the import-collection/import-database flows

**IPC boundary**: renderer calls `window.electron.invoke(channel, ...args)`, main process handles via `ipcMain.handle(channel, handler)`. All MongoDB operations live exclusively in the main process; renderer never imports `mongodb`. Channel groups: documents (get/insert/update/delete), collections (create/drop/rename/clear/stats), databases (list/create-via-collection/drop/clear), indexes (get/create/drop/stats), query/aggregation (`run-query`, `run-aggregation`), connections + folders (CRUD + reorder), users/roles (list/create/drop), import/export, and dialogs (`show-confirm`/`show-input`).

**Persistence**: `electron-store` saves connections **and folders** to `~/.config/BoxyNoSql/connections.json`. Active `MongoClient` instances are kept in a `Map<connectionId, MongoClient>` in main process memory — not persisted across app restarts.

**Dev vs prod loading**: in `NODE_ENV=development`, Electron loads `http://localhost:5173` (Vite dev server). In production, loads `dist/renderer/index.html`. Run `npm run dev` to start both watchers, then `npm start` to open Electron.

## Key constraints

- `run-query` IPC uses `new Function('db', ...)` to eval user input — intentional for a local desktop tool, not a security issue in this context.
- `tsconfig.json` covers only `src/renderer` (noEmit, bundler moduleResolution). `tsconfig.main.json` covers only `src/main` (CommonJS emit). Keep them separate.
- `@` alias resolves to `src/renderer` in Vite (configured in `vite.config.ts`); not available in main process.
