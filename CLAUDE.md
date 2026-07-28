# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install            # install deps (CI uses `npm ci --legacy-peer-deps`)
npm run dev            # watch main + renderer AND launch Electron (concurrently + wait-on) — one command, no separate start needed
npm start              # start Electron only (against an existing build / dev server)
npm run build          # compile main (tsc) + renderer (vite)
npm run build:main     # compile src/main → dist/main via tsconfig.main.json
npm run build:renderer # bundle src/renderer → dist/renderer via vite
npm run electron:build:linux # build + package .deb + AppImage  → release/
npm run electron:build:win   # build + package NSIS installer   → release/
npm run electron:build:all   # both platforms in one run
npm run electron:build:dir   # build unpackaged app dir (no installer)
```

There is no lint/typecheck script; `tsc -p tsconfig.main.json` typechecks the main process as a side effect of `build:main`, while the renderer is only typechecked by an explicit `npx tsc -p tsconfig.json` (Vite does not typecheck).

Tests (Vitest):

```bash
npm test               # run all tests once (verbose)
npm run test:watch     # watch mode
npm run test:coverage  # v8 coverage (scoped to src/main/serialize.ts + src/renderer/utils/**)
npx vitest run src/renderer/__tests__/buildFilter.test.ts  # single file
npx vitest run -t "substring of test name"                 # single test by name
```

Test setup in `vitest.config.ts`: tests live in `src/**/__tests__/*.test.{ts,tsx}`. two `test.projects` split the run — **renderer** (`src/renderer/**/__tests__/**`, `jsdom`, loads `src/test/setup.ts` for the jest-dom matchers) and **main** (everything else under `src/`, `node`). Both `extends: true`, so the `@` alias and `globals` come from the root config; `coverage` is root-only. The old `environmentMatchGlobs` did the same job but is a no-op on Vitest 4 — add a project, not a glob. The text coverage reporter hides files at 100%, so a fully covered file simply won't appear in the table. `@` alias works in tests. Automated coverage is deliberately narrow (`serialize.ts`, `utils/**`); UI behaviour is covered by the manual test plan in `PIANO_TEST.md` (written in Italian, runs against a Docker MongoDB).

Releases: `.github/workflows/release.yml` builds Linux + Windows installers on any `v*` tag push (or manual dispatch) and uploads `release/*.{deb,AppImage,exe}` as artifacts.

## Architecture

Electron app with two separate TypeScript compilation targets:

**Main process** (`src/main/`, compiled via `tsconfig.main.json` → CommonJS):
- `main.ts` — Electron entry, BrowserWindow setup, **all** IPC handlers, and the `Map<connectionId, MongoClient>` that holds live connections
- `serialize.ts` — `serializeDoc()`: BSON → JSON-safe (ObjectId → `{$oid}`, other BSON types → string, Date → ISO, Buffer → hex; guards circular refs + depth 50). Unit-tested.
- `preload.ts` — `contextBridge` exposes `window.electron.invoke(channel, ...args)` and `window.electron.on(channel, cb)`
- `updater.ts` + `version.ts` — update checking (see **Updates** below). `version.ts` is the semver-ish comparison, kept electron-free so it stays unit-testable.

**Renderer process** (`src/renderer/`, bundled via Vite → ESM). React 18, no router, no state library — `App.tsx` is the single source of truth for connections, folders, databases, collections, tabs, theme and modal visibility, and passes everything down as props. Notable pieces beyond the obvious per-view components:
- `components/MainContent.tsx` — tab bar + view routing. Keeps per-tab result buffers (`queryResults`, `aggregationResults`, `statsMap`) keyed by `tabId`, plus a `mountedViews` map so a view that was ever opened for a tab stays mounted (this is what makes filters/results survive tab switching). All four maps are garbage-collected in an effect when tabs close — extend that effect when adding a new per-tab buffer.
- `components/Icon.tsx` — the entire icon set: one `IconName` union + SVG path table, all strokes use `currentColor`. Add icons here, never inline SVG in components.
- `utils/iconColors.ts` — icon color model: per-connection override → `ColorMode` (`mono`/`connection`/`custom`) → default. Settings live in `localStorage`.
- `utils/uriImport.ts` + `components/ImportConnectionsModal.tsx` — Studio 3T `.uri` export import: `3t.group` → nested folder path, `3t.defaultColor` → hex, `3t.*` and empty params stripped from the stored URI. The persistence side (folder reuse/creation, then connection save) lives in `handleImportConnections` in `App.tsx`. Unit-tested.
- `utils/updates.ts` + `components/UpdateModal.tsx` — update policy and dialog (see **Updates** below). Unit-tested.
- `utils/dom.ts` — `isTypingTarget()`, the guard every window-level key handler needs (see **Global shortcuts**). Unit-tested.
- `utils/buildFilter.ts` — type-aware query-filter model: `FieldType`/`Operator` enums, `OPERATORS_BY_TYPE`, builds a Mongo filter from UI conditions. Unit-tested.
- `dialog.ts` + `components/DialogModal.tsx` — `showConfirm`/`showInput`/`showAlert` are module-level functions that `DialogModal` registers itself into on mount (`registerDialogs`), falling back to `window.confirm`/`prompt` if it is not mounted. Use these, never `window.confirm` directly. (Main also exposes native `show-confirm`/`show-input` IPC, but the renderer no longer calls them.)

**IPC boundary**: renderer calls `window.electron.invoke(channel, ...args)`, main handles via `ipcMain.handle(channel, handler)`. All MongoDB access lives exclusively in the main process; the renderer never imports `mongodb` and never imports `electron` either — there are only ~9 `electron.invoke` call sites across the renderer. Channel groups: documents, collections (create/drop/rename/duplicate/clear/stats), databases (list/drop/clear), indexes (get/create/drop/stats), `run-query`/`run-aggregation`, connections + folders (CRUD + reorder), users/roles, import/export, dialogs.

**BSON round-trip**: the boundary is symmetric and both directions must be preserved when adding handlers — everything returned to the renderer goes through `serializeDoc()`, and every filter/document/pipeline coming *from* the renderer goes through `fromExtJSON()` in `main.ts` (revives `{$oid}` → `ObjectId`, `{$date}` → `Date`). `update-document`/`delete-document` instead take a plain `docId` string and try `new ObjectId(docId)` with a raw-string fallback, so non-ObjectId `_id`s keep working.

**Persistence** splits in two:
- `electron-store` → `~/.config/BoxyNoSql/connections.json`: connections **and** folders (both carry `order`, `color`; folders nest via `parentId`).
- `localStorage` (renderer-only UI prefs): `theme`, `sidebarWidth`, `queryEditorHeight`, `connManagerWidth`, `iconSettings`, `updateCheckOnStartup`, `updateSkippedVersion`.
- Live `MongoClient`s are in-memory only; nothing reconnects on restart. Tab state is in-memory too — "persistent" there means across tab switches, not across app restarts.

**Updates**: `App.tsx` fires `update:check` 3s after mount (unless `updateCheckOnStartup` is `false`); About has a manual "Check for updates" that also clears `updateSkippedVersion`. Main answers on the one-way `update:status` channel, plus `update:download` / `update:install` / `update:open-download`. Two backends, picked by `canAutoInstall()` in `updater.ts`: **electron-updater** where it can replace the running build (Windows NSIS, Linux AppImage — both read the `latest-*.yml` the release workflow publishes), and the plain **GitHub releases API** everywhere else (a `.deb` install, unpackaged dev), which only notifies and opens the download page. `.deb` is deliberately excluded from self-update — it would need `pkexec dpkg -i`. All policy (show or stay silent, skipped versions) lives in `utils/updates.ts` in the renderer; main just reports what it found.

**Theming**: `src/renderer/index.css` is the only stylesheet (~1000 lines). `:root` defines CSS custom properties for the dark theme; `body.theme-light` / `.theme-hc` / `.theme-solarized` override them. `App.tsx` sets `document.body.className = theme-${theme}`. Components style via inline styles referencing `var(--…)`, so **never hardcode a color** — add a variable to all four theme blocks instead.

**Global shortcuts** (registered in `App.tsx`, suppressed while a modal is open or while typing in an input): `Ctrl/Cmd+M` connection manager, `Ctrl/Cmd+,` settings, `Ctrl/Cmd+W` close active tab, `Ctrl/Cmd+1-9` switch tab, `F5`/`Ctrl+R` refresh the tree. Query editor adds `Ctrl+Enter` (run) and `Ctrl+Space` (completions). `DocumentsView` registers a second window-level handler (`Ctrl+D` add, `Ctrl+A` select all, `Ctrl+C`/`Ctrl+V` bulk copy/paste, `Del` bulk delete, `Ctrl+J` edit, `F3` view).

Every one of those handlers must bail out via `utils/dom.ts` → `isTypingTarget(e.target)` first: they are on `window`, so without that guard `Ctrl+V` and `Delete` fire while the user is typing in a filter box or a JSON editor — that is how "Delete deletes the document instead of the character" happens.

**Clipboard**: keyboard cut/copy/paste in text fields needs *no* code — Blink handles it even though the app menu is null (verified: adding a `before-input-event` handler that calls `webContents.paste()` makes it paste **twice**). The mouse side does need code: Electron has no built-in context menu, so `enableEditContextMenu()` in `main.ts` pops a native undo/cut/copy/paste menu, but only when `params.isEditable` — elsewhere the renderer draws its own `ContextMenu` and the two would stack.

**Tree refresh**: nothing polls MongoDB, so a collection another client creates or drops is invisible until refreshed. `handleRefreshTree` in `App.tsx` (Refresh button in the sidebar toolbar, `F5`, `Ctrl+R`) re-lists the databases, re-lists the collections of every *expanded* database, and evicts vanished databases from `databases`/`expandedDbs`/`collections`; `handleRefreshDb` (database context menu) does one database.

**Dev vs prod loading**: with `NODE_ENV=development` Electron loads `http://localhost:5173` (Vite dev server) and opens DevTools; otherwise it loads `dist/renderer/index.html`. `npm run dev` does all of it.

## Key constraints

- `run-query` uses `new Function('db', ...)` to eval user input — intentional for a local desktop tool. It only stays safe because the code never leaves the user's machine; do not expose this handler over a network transport without rethinking it.
- `tsconfig.json` covers only `src/renderer` (noEmit, bundler moduleResolution, `strict` + `noUnusedLocals`/`noUnusedParameters`). `tsconfig.main.json` covers only `src/main` (CommonJS emit). Keep them separate.
- `@` alias resolves to `src/renderer` in Vite and Vitest; not available in the main process.
- Connection URIs pass through `sanitizeUri()`, which strips Studio 3T-specific `3t.*` query params so pasted URIs from that tool still connect.
- The app menu is disabled (`Menu.setApplicationMenu(null)`) and the window uses `autoHideMenuBar` — all UI affordances must be in-app.
- Monaco is bundled by `vite-plugin-monaco-editor` with a `customDistPath` override; the workers land in `dist/renderer/monacoeditorwork`. Changing `build.outDir` means revisiting that.
