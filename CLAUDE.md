# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run check          # typecheck main + renderer, then the whole test suite — run this before calling a change done
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

`npm run check` chains `typecheck:main` (`tsc -p tsconfig.main.json --noEmit`), `typecheck:renderer` (`tsc -p tsconfig.json`) and `vitest run`. There is still no linter; `tsc -p tsconfig.main.json` typechecks the main process as a side effect of `build:main`, while the renderer is only typechecked by an explicit `npx tsc -p tsconfig.json` (Vite does not typecheck).

Tests (Vitest):

```bash
npm test               # run all tests once (verbose)
npm run test:watch     # watch mode
npm run test:coverage  # v8 coverage (scoped to src/main/serialize.ts + src/renderer/utils/**)
npx vitest run src/renderer/__tests__/buildFilter.test.ts  # single file
npx vitest run -t "substring of test name"                 # single test by name
```

Test setup in `vitest.config.ts`: tests live in `src/**/__tests__/*.test.{ts,tsx}`. two `test.projects` split the run — **renderer** (`src/renderer/**/__tests__/**`, `jsdom`, loads `src/test/setup.ts` for the jest-dom matchers) and **main** (everything else under `src/`, `node`). Both `extends: true`, so the `@` alias and `globals` come from the root config; `coverage` is root-only. The old `environmentMatchGlobs` did the same job but is a no-op on Vitest 4 — add a project, not a glob. The text coverage reporter hides files at 100%, so a fully covered file simply won't appear in the table. `@` alias works in tests. Automated coverage is deliberately narrow (`serialize.ts`, `exportFormat.ts`, `version.ts`, `utils/**`); UI behaviour is covered by the manual test plan in `PIANO_TEST.md` (written in Italian, runs against a Docker MongoDB).

Releases: `.github/workflows/release.yml` builds Linux + Windows installers on any `v*` tag push (or manual dispatch) and uploads `release/*.{deb,AppImage,exe}` as artifacts.

## Architecture

Electron app with two separate TypeScript compilation targets:

**Main process** (`src/main/`, compiled via `tsconfig.main.json` → CommonJS):
- `main.ts` — Electron entry, BrowserWindow setup, **all** IPC handlers, and the `Map<connectionId, MongoClient>` that holds live connections
- `serialize.ts` — `serializeDoc()`: BSON → JSON-safe (ObjectId → `{$oid}`, other BSON types → string, Date → ISO, Buffer → hex; guards circular refs + depth 50). Unit-tested.
- `preload.ts` — `contextBridge` exposes `window.electron.invoke(channel, ...args)` and `window.electron.on(channel, cb)`
- `readOnlyGuard.ts` — read-only connections. `assertWritable(connectionId)` runs first in every write handler (18 of them plus the two copy targets), and `run-query` — which evals user code against a live `Db` — gets `guardHandle()`, a Proxy whose write methods throw and whose `.collection()` hands back another guarded handle. The renderer disables the matching buttons, but that is cosmetic: the guarantee is here, where a hand-made `invoke` cannot get around it. Unit-tested.
- `exportFormat.ts` — export serialization: CSV escaping, key union, default file name, and `createChunkWriter()` (one call per document, so JSON/NDJSON/CSV are all written incrementally). Electron-free and unit-tested; `main.ts` owns the save dialog and the write stream.
- `updater.ts` + `version.ts` — update checking (see **Updates** below). `version.ts` is the semver-ish comparison, kept electron-free so it stays unit-testable.

**Renderer process** (`src/renderer/`, bundled via Vite → ESM). React 18, no router, no state library — `App.tsx` is the single source of truth for connections, folders, databases, collections, tabs, theme and modal visibility, and passes everything down as props. Multiple connections can be connected and expanded at once: `databases`, `expandedDbs` and `collections` are `Record<connectionId, …>`, not single flat values — Sidebar renders one db-tree per connected connection. `App.tsx` wraps every IPC call in a central `inv()`: on a connection-loss-shaped error (`ECONNREFUSED`, `MongoServerSelectionError`, etc. — see `CONNECTION_ERROR_RE`) for a call whose first arg is a connectionId, it marks that connection `'reconnecting'` in `connectionHealth`, retries `connect-db` once, and replays the original call before giving up and marking it `'down'`. Notable pieces beyond the obvious per-view components:
- `components/MainContent.tsx` — tab bar + view routing. Keeps per-tab result buffers (`queryResults`, `aggregationResults`, `statsMap`) keyed by `tabId`, plus a `mountedViews` map so a view that was ever opened for a tab stays mounted (this is what makes filters/results survive tab switching). All four maps are garbage-collected in an effect when tabs close — extend that effect when adding a new per-tab buffer.
- `components/MonacoQueryEditor.tsx` — one editor for two jobs, picked by `language`: `javascript` for the query terminal (`db.` method completions, `$` operators) and `json` for an aggregation stage body (stage/expression operators, fields offered both bare and `$`-prefixed, JSON syntax validation, `lineNumbers={false}` for the small boxes). Completion providers are registered once per process, per language.
- `components/AggregationBuilder.tsx` — Monaco per stage, stage templates that only replace an untouched body, reorder/remove, per-stage JSON error, and a document counter per stage fed by the `aggregation-stage-counts` IPC (one `slice(0, i+1) + $count` aggregation per stage, so it runs on Run only, never while typing; `$out`/`$merge` and everything after them count `null`). Any edit clears the counters — they belong to the pipeline that ran.
- `components/Icon.tsx` — the entire icon set: one `IconName` union + SVG path table, all strokes use `currentColor`. Add icons here, never inline SVG in components.
- `utils/iconColors.ts` — icon color model: per-connection override → `ColorMode` (`mono`/`connection`/`custom`) → default. Settings live in `localStorage`.
- `utils/uriImport.ts` + `components/ImportConnectionsModal.tsx` — Studio 3T `.uri` export import: `3t.group` → nested folder path, `3t.defaultColor` → hex, `3t.*` and empty params stripped from the stored URI. The persistence side (folder reuse/creation, then connection save) lives in `handleImportConnections` in `App.tsx`. Unit-tested.
- `utils/updates.ts` + `components/UpdateModal.tsx` — update policy and dialog (see **Updates** below). Unit-tested.
- `utils/dom.ts` — `isTypingTarget()`, the guard every window-level key handler needs (see **Global shortcuts**). Unit-tested.
- `utils/buildFilter.ts` — type-aware query-filter model: `FieldType`/`Operator` enums, `OPERATORS_BY_TYPE`, builds a Mongo filter from UI conditions. Unit-tested.
- `toast.ts` + `components/ToastHost.tsx` — transient status messages, same registration trick as `dialog.ts` (`registerToasts` on mount, `showToast` from anywhere). Non-blocking by design: anything the user must acknowledge stays in `showAlert`. Used by copy/paste, which now says what went on the clipboard and from which connection.
- `utils/transfer.ts` — wording for copy/paste of a database or collection: `copiedMessage()` (the toast) and `pasteConfirm()` (the dialog shown *before* anything is written, naming both ends). Source and target can be different servers, which is the whole point of the feature and also how the wrong server gets written to. After a paste `App.tsx` calls `handleRefreshTree(targetConnId)` — refreshing just the one database would leave a copied database invisible. Unit-tested.
- `utils/keys.ts` — `isEscapeKey`/`isRunKey` plus `onEscape`/`onRunKey`. Escape handlers form a **stack**: only the innermost runs, so a confirmation opened on top of a modal takes one Escape and closes only itself; a modal that must swallow the key (busy writing) registers `SWALLOW_ESCAPE`. `isRunKey` is Alt+Enter (works everywhere, including inside Monaco) or Ctrl/Cmd+Enter. Neither is guarded by `isTypingTarget` — cancelling and running are exactly the cases where the focus is in a field. Unit-tested.
- `utils/schema.ts` + `components/SchemaView.tsx` — schema explorer. The sample comes from one `$sample` aggregation (a pipeline per field would be the alternative); `analyzeSchema()` then counts, per dotted path, how many sampled documents have it, with which types (`null` kept apart from missing — "present but empty" is what you look for) and a few distinct examples. Nesting stops at `maxDepth`, arrays and BSON wrappers are not walked into. Sampling is explicit, not on mount: opening the tab should not fire a pipeline. Unit-tested.
- `utils/palette.ts` + `components/CommandPalette.tsx` — `Ctrl+P`. Subsequence (not substring) matching with ranking: consecutive characters and word starts score higher, shorter texts win ties, so `usr` finds `users` and puts it above `users_audit`. `App.tsx` builds the item list — connections, the databases and collections the tree has already listed, and the menu actions; it deliberately does not list databases it has not fetched, or the palette would hit every server on each keystroke. Unit-tested.
- `utils/connectionPath.ts` — who a tree node belongs to, in words: `folderBreadcrumb`/`folderPathLabel` (shared with the welcome screen's recent cards), `serverLabel` (user + host(s), password never), `nodeTooltip` (multi-line `Connection/Folder/Server/Database/Collection`, blank lines dropped). The sidebar shows a database as a bare name, so two connections to a same-named db look identical — this is what its `title` tooltips say. Unit-tested.
- `utils/pinnedCollections.ts` — flat `{connectionId, db, col}[]` pin list, `localStorage['pinnedCollections']`. Sidebar shows each connection's pins in a `pinned-section` above its db tree. Unit-tested.
- `utils/docTable.ts` — document-list sort + projection model. `cycleSort` (plain click asc→desc→off and replaces the key list, shift-click appends/cycles/removes one key), `buildSort`, `buildProjection` (exclusion projection, `_id` never excludable — edit/delete/selection key off it), `knownFields` (docs ∪ hidden, or a hidden field could never be brought back since it is absent from every document that returns), plus per-collection persistence in `localStorage['hiddenFields']` keyed `connectionId|db|col`. Both go to `get-documents` and are applied server-side; changing either reloads from page 0. `DocumentsView` drives it from the table headers and from the toolbar "Fields" popover (the only sort UI available in tree mode). Unit-tested.
- `utils/session.ts` — `{tabs, activeTab}` snapshot, `localStorage['lastSession']`. On startup `App.tsx` reconnects every distinct `connectionId` referenced by the saved tabs (skipping any connection no longer in `connections`) before restoring the tabs themselves. Unit-tested.
- `utils/queryHistory.ts` + `components/QueryHistoryMenu.tsx` — one history list in `localStorage['queryHistory']` shared by all three runners; entries differ only by `kind` (`filter`/`query`/`aggregation`) and by an opaque `body` each view serializes itself (filter conditions, query text, pipeline stages as typed). Scope is `connectionId|db|col`. Re-running an identical body bumps it instead of duplicating; unnamed entries are capped at `HISTORY_LIMIT` per kind+scope, named ("saved") ones never trimmed. The `useQueryHistory` hook re-reads localStorage before every write — `MainContent` keeps a view mounted per tab, so two tabs on the same collection each hold their own copy. Unit-tested.
- `utils/destructive.ts` — typed-confirmation wording and matching: `matchesTyped()` (exact apart from surrounding whitespace — no case folding, or muscle memory gets through it) and `impactLine()` ("≈1,204 documents in 3 collections"). Counts come from the `get-drop-impact` IPC, which uses `estimatedDocumentCount()` per collection so opening the dialog never costs a full scan. Unit-tested.
- `dialog.ts` + `components/DialogModal.tsx` — `showConfirm`/`showInput`/`showAlert` are module-level functions that `DialogModal` registers itself into on mount (`registerDialogs`), falling back to `window.confirm`/`prompt` if it is not mounted. Use these, never `window.confirm` directly. `ConfirmOpts.requireTyped` + `impact` turn a confirm into a typed confirmation (the four drop/clear handlers in `App.tsx` use it); the confirm button stays `disabled` until the typed text matches. (Main also exposes native `show-confirm`/`show-input` IPC, but the renderer no longer calls them.)

**IPC boundary**: renderer calls `window.electron.invoke(channel, ...args)`, main handles via `ipcMain.handle(channel, handler)`. All MongoDB access lives exclusively in the main process; the renderer never imports `mongodb` and never imports `electron` either. Channel groups: documents, collections (create/drop/rename/duplicate/clear/stats), databases (list/drop/clear), indexes (get/create/drop/stats), `run-query`/`run-aggregation`, connections + folders (CRUD + reorder), users/roles, import/export (`export-documents` streams a cursor — same filter/sort/projection as the view — straight to the file the native save dialog picked, never through the renderer; `export-rows` writes an array the renderer already holds, i.e. a query or aggregation result), dialogs, `copy-collection`/`copy-database` (cross-connection copy — source and target can be different `MongoClient`s, even different servers, so documents stream through the main process in batches of 500 via `copyCollectionData()` rather than a server-side `$out`).

**BSON round-trip**: the boundary is symmetric and both directions must be preserved when adding handlers — everything returned to the renderer goes through `serializeDoc()`, and every filter/document/pipeline coming *from* the renderer goes through `fromExtJSON()` in `main.ts` (revives `{$oid}` → `ObjectId`, `{$date}` → `Date`). `update-document`/`delete-document` instead take a plain `docId` string and try `new ObjectId(docId)` with a raw-string fallback, so non-ObjectId `_id`s keep working.

**Persistence** splits in two:
- `electron-store` → `~/.config/BoxyNoSql/connections.json`: connections **and** folders (both carry `order`, `color`; folders nest via `parentId`).
- `localStorage` (renderer-only UI prefs): `theme`, `sidebarWidth`, `queryEditorHeight`, `connManagerWidth`, `iconSettings`, `updateCheckOnStartup`, `updateSkippedVersion`, `pinnedCollections`, `lastSession`, `hiddenFields`, `queryHistory`, `docLineNumbers`, `docEditorWrap`.
- Live `MongoClient`s are in-memory only and don't survive a restart on their own, but `utils/session.ts` + `App.tsx`'s startup effect reconnect whichever connections the last session's tabs needed, so a restart can look session-persistent even though the client underneath is fresh. Tab state itself is in-memory — "persistent" there means across tab switches within a run, restored-from-`lastSession` on the next one.

**Updates**: `App.tsx` fires `update:check` 3s after mount (unless `updateCheckOnStartup` is `false`); About has a manual "Check for updates" that also clears `updateSkippedVersion`. Main answers on the one-way `update:status` channel, plus `update:download` / `update:install` / `update:open-download`. Two backends, picked by `canAutoInstall()` in `updater.ts`: **electron-updater** where it can replace the running build (Windows NSIS, Linux AppImage — both read the `latest-*.yml` the release workflow publishes), and the plain **GitHub releases API** everywhere else (a `.deb` install, unpackaged dev), which only notifies and opens the download page. `.deb` is deliberately excluded from self-update — it would need `pkexec dpkg -i`. All policy (show or stay silent, skipped versions) lives in `utils/updates.ts` in the renderer; main just reports what it found.

**Theming**: `src/renderer/index.css` is the only stylesheet (~1000 lines). `:root` defines CSS custom properties for the dark theme; `body.theme-light` / `.theme-hc` / `.theme-solarized` override them. `App.tsx` sets `document.body.className = theme-${theme}`. Components style via inline styles referencing `var(--…)`, so **never hardcode a color** — add a variable to all four theme blocks instead.

**Views and the active tab**: `MainContent` keeps every tab ever opened mounted, so `DocumentsView`/`QueryTerminal`/`AggregationBuilder` take an `active` prop and bind their window-level shortcuts only when it is true — otherwise Alt+Enter or Ctrl+D would fire once per open tab.

**Global shortcuts** (registered in `App.tsx`, suppressed while a modal is open or while typing in an input): `Ctrl/Cmd+M` connection manager, `Ctrl/Cmd+,` settings, `Ctrl/Cmd+W` close active tab, `Ctrl/Cmd+1-9` switch tab, `F5`/`Ctrl+R` refresh the tree. `Alt+Enter` runs in the documents, query and aggregation views (Ctrl+Enter still works in Monaco), and `Escape` cancels everywhere through the shared stack in `utils/keys.ts`. Query editor adds `Ctrl+Space` (completions). `DocumentsView` registers a second window-level handler (`Ctrl+D` add, `Ctrl+A` select all, `Ctrl+C`/`Ctrl+V` bulk copy/paste, `Del` bulk delete, `Ctrl+J` edit, `F3` view).

Every one of those handlers must bail out via `utils/dom.ts` → `isTypingTarget(e.target)` first: they are on `window`, so without that guard `Ctrl+V` and `Delete` fire while the user is typing in a filter box or a JSON editor — that is how "Delete deletes the document instead of the character" happens.

**Clipboard**: keyboard cut/copy/paste in text fields needs *no* code — Blink handles it even though the app menu is null (verified: adding a `before-input-event` handler that calls `webContents.paste()` makes it paste **twice**). The mouse side does need code: Electron has no built-in context menu, so `enableEditContextMenu()` in `main.ts` pops a native undo/cut/copy/paste menu, but only when `params.isEditable` — elsewhere the renderer draws its own `ContextMenu` and the two would stack.

**Tree refresh**: nothing polls MongoDB, so a collection another client creates or drops is invisible until refreshed. `handleRefreshTree` in `App.tsx` (Refresh button in the sidebar toolbar, `F5`, `Ctrl+R`) takes an optional `connectionId` — omitted, it refreshes every connected connection; passed, just that one. For each connection it re-lists the databases, re-lists the collections of every *expanded* database, and evicts vanished databases from that connection's slice of `databases`/`expandedDbs`/`collections`; `handleRefreshDb(connId, db)` (database context menu) does one database of one connection.

**Dev vs prod loading**: with `NODE_ENV=development` Electron loads `http://localhost:5173` (Vite dev server) and opens DevTools; otherwise it loads `dist/renderer/index.html`. `npm run dev` does all of it.

## Key constraints

- `run-query` uses `new Function('db', ...)` to eval user input — intentional for a local desktop tool. It only stays safe because the code never leaves the user's machine; do not expose this handler over a network transport without rethinking it.
- `tsconfig.json` covers only `src/renderer` (noEmit, bundler moduleResolution, `strict` + `noUnusedLocals`/`noUnusedParameters`). `tsconfig.main.json` covers only `src/main` (CommonJS emit). Keep them separate.
- `@` alias resolves to `src/renderer` in Vite and Vitest; not available in the main process.
- Connection URIs pass through `sanitizeUri()`, which strips Studio 3T-specific `3t.*` query params so pasted URIs from that tool still connect.
- The app menu is disabled (`Menu.setApplicationMenu(null)`) and the window uses `autoHideMenuBar` — all UI affordances must be in-app.
- Monaco is bundled by `vite-plugin-monaco-editor` with a `customDistPath` override; the workers land in `dist/renderer/monacoeditorwork`. Changing `build.outDir` means revisiting that.
