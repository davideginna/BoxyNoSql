# Changelog

## [1.6.1] - 2026-09-03

### Added
- **See what changed after an update.** The first launch after an auto-update shows a "what's new" popup scoped to the versions since you last opened it; a "Changelog" button in About opens the full history on demand. Reads `CHANGELOG.md` itself — this file — so there's nothing else to keep in sync

### Fixed
- **The AppImage build wouldn't start on Ubuntu 24.04+** (`FATAL: sandbox/linux/suid/client/setuid_sandbox_host.cc`). The SUID sandbox helper ships inside the squashfs and remounts at a fresh `/tmp/.mount_XXXXXX` path on every launch, so — unlike the `.deb`, whose postinst fixes its ownership once at install time — it can never be corrected; Chromium aborts rather than run unsandboxed, and Ubuntu 24.04's AppArmor also blocks the unprivileged-userns fallback outright. The sandbox is now disabled specifically on the AppImage build (detected via `process.env.APPIMAGE`, including on the app's own self-relaunch after an update) — the `.deb` and Windows builds are unaffected

## [1.6.0] - 2026-09-03

### Added
- **Fold/collapse in the add/edit document JSON editor.** The hand-rolled textarea+`<pre>` editor is now Monaco, same as the query terminal and aggregation stage bodies, so a document with nested objects can be collapsed instead of scrolled past. Ctrl+F still opens the modal's own find bar (remapped from Monaco's default find widget) and Ctrl+Enter/Alt+Enter still save
- **Remove a connection from the welcome screen's recents** without touching the connection itself — right-click a card, or the now-always-visible ✕ (0.6 opacity, full on hover/focus). The recents list has no history log of its own (it is derived live from each connection's `lastConnectedAt`), so this records the timestamp that was on screen when dismissed; a later real connect bumps `lastConnectedAt` past that mark and the card comes back on its own

### Fixed
- **`ObjectId("…")`/`ISODate("…")` red-squiggled as invalid JSON** in both the new document editor and the aggregation stage editor. Both share one process-wide `jsonDefaults` diagnostics setting; it validated strict JSON, which the app's own shell-style extended dialect is not. The app already shows its own dialect-aware validity status next to the editor, so Monaco's diagnostics were only ever redundant or wrong — turned off in both places together, so one editor mounting can't silently re-enable it for the other
- **Folding never worked in any Monaco editor in the app**, document or stage body: `folding`/`showFoldingControls` were silent no-ops because Monaco's minimal `editor.api` entry point doesn't register the folding contribution without an explicit import

## [1.5.1] - 2026-08-09

### Fixed
- **Smaller installers, and local builds no longer pack the previous one inside themselves.** `build.files` was `dist/**/*`, and a local `dist/` still held the output of a 1.0.0 build from when electron-builder wrote there — a whole `linux-unpacked` tree and a 297 MB `.deb` — so every *local* build swept them into its own `app.asar` (AppImage 837 MB, `app.asar` 1.2 GB). CI was never affected: it builds from a clean checkout. The file list is explicit now (`dist/main`, `dist/renderer`, `package.json`), which also stops a stale build directory from ever being packaged again, and `node_modules/monaco-editor` is excluded since Vite already bundles Monaco and its workers into `dist/renderer`. That last part is what shrinks the *published* artifacts: AppImage 143.6 MB → 126.4 MB, `.deb` 112 MB → 98 MB (≈12%); a local build now matches CI at 126 MB instead of 837 MB

## [1.5.0] - 2026-08-09

### Added
- **Several connections open at once** — `databases`, `expandedDbs` and `collections` are per connection, so the sidebar shows one database tree per connected server instead of swapping between them
- **Cross-connection copy** of a collection or a whole database (data + indexes), streamed through the main process in batches, so source and target can be different servers
- **Connection health and auto-reconnect** — a connection-loss-shaped error retries `connect-db` once and replays the call before giving up, and the sidebar shows "Reconnecting…" / "Connection lost"
- **Pinned collections** — the ones you actually work on stay above the tree, per connection
- **Reopen the last session** — the tabs that were open at exit come back, reconnecting whichever connections they need
- **Sort and field visibility in the document list** — click a column header to sort (ascending → descending → off, shift-click for a second key), or use the toolbar "Fields" popover, which is also the only sort UI in tree view. Hidden fields are remembered per collection. Both are applied server-side: sorting only the current page would order 20 documents out of the whole collection. Opening a document for edit/view re-reads it whole, so saving with fields hidden cannot drop them
- **Query history and saved queries** (`utils/queryHistory.ts` + `QueryHistoryMenu`) — every filter, query and pipeline you run is kept per collection, re-running an identical one bumps it instead of duplicating, and the good ones can be named and reused across restarts. Shared by the documents filter, the query terminal and the aggregation builder
- **Export what you are looking at** — JSON / NDJSON / CSV through a native save dialog: the current filtered and sorted view (with only the visible fields), the whole collection, or a query/aggregation result. Documents stream from the cursor straight to the file, so a 50k-document export never becomes 50k objects in the renderer; CSV takes a second pass to build a header covering every field
- **Typed confirmation on destructive actions** — drop and clear ask you to retype the database or collection name and show how many documents are about to go (counts come from collection metadata, so the dialog opens instantly even on a 50k collection)
- **A real editor for aggregation stages** — Monaco per stage with completions for stage and expression operators and for the collection's own fields (`field` and `$field`), stage templates, reorder, per-stage JSON errors, and **a document counter per stage** after each run (`$out`/`$merge` and everything after them are not re-run just to be counted)
- **Read-only connections** — a per-connection flag that refuses every write in the main process, not just in the UI: 18 write handlers check it, and the query terminal gets a proxied `db` whose write methods throw. Copying *from* a read-only connection is allowed, copying *to* one is not
- **Toasts** — non-blocking status messages. Copying a database or collection now says what went on the clipboard and from which connection
- **Node tooltips in the sidebar** — a connection shows its folder path inline, and every connection/database/collection carries a tooltip with connection, folder, server and path, so two connections holding a `testdb` are no longer indistinguishable. The server line shows `user@host`, never the password
- **Bulk field edit** — set, rename or unset a field across the selected documents, with the update document shown before it runs
- **Schema explorer** — a Schema tab that samples the collection and lists every field with its types, how many of the sampled documents have it and a few example values
- **Command palette (`Ctrl+P`)** — fuzzy jump to any connection, database, collection or action without walking the tree
- **Explain plan** — an Explain button in the documents, query and aggregation views runs `explain('executionStats')` on whatever is currently in them and shows the winning plan stage by stage, the index it used (or the collection scan it did not avoid), documents and index keys examined, timings, and a verdict when far more is read than returned — the raw output is one click below, and copyable. The documents view explains the same filter, sort and projection the list itself runs, so the answer is about the query you are actually looking at. Explaining is a read and works on read-only connections; a query-terminal explain evals against the read-only proxy whatever the connection's flag, so an `insertOne` left in the editor cannot run, and a `$out`/`$merge` pipeline is refused instead of being half-executed
- **Large pages without the freeze** — both document views are windowed (`utils/virtualList.ts` + `components/VirtualRows.tsx`): only the rows near the viewport are in the DOM, with fillers standing in for the rest so the scrollbar still spans the page. A 5000-document page went from ~30k DOM nodes (table) / ~70k (tree) to a couple of hundred. Row heights are measured rather than assumed, because a tree row grows when its document is expanded and a fixed-height virtualizer would misplace everything under it; pages of 200 rows or fewer are left exactly as they were. Selection is unaffected — it was always keyed by the index into the page, not by what is mounted, so select-all, shift-ranges, the bulk bar count and bulk copy/delete still cover documents that are nowhere in the DOM
- `npm run check` — typecheck main + renderer and run the tests in one command
- **Lint** — ESLint 9 (flat config, `typescript-eslint` + `eslint-plugin-react-hooks`) covering both `src/main` and `src/renderer`, wired into `npm run check` via a new `npm run lint`

### Changed
- **Escape cancels everywhere.** Handlers now form a stack, so a confirmation opened on top of a modal takes one Escape and closes only itself, and a modal that is busy writing swallows the key instead of letting it through. Escape also closes the document editor (through the same "discard changes?" path as its Cancel button), the add/view modals, the query preview and the popovers
- **`Alt+Enter` runs** in the documents, query and aggregation views — including from inside a Monaco editor and from inside a filter field. `Ctrl+Enter` still works in the editors
- **Copy/paste of a database or collection asks first**, naming both ends (`From:` / `To:`), and afterwards refreshes the whole target connection — refreshing only the target database left a copied database invisible until a manual refresh

### Fixed
- **Window-level shortcuts fired in every open tab.** `MainContent` keeps every tab ever opened mounted, so `Ctrl+D`, `Delete` and the clipboard shortcuts were bound once per documents tab; views now bind them only while they are the tab on screen
- **An emptied Limit field fetched the whole collection.** `Number('')` is `0`, and `limit: 0` means "no limit" to MongoDB; the field now clamps to 1

## [1.4.2] - 2026-07-29

### Added
- **Keyboard shortcuts cheat sheet (F1)** — overlay listing every shortcut registered across the app, also reachable from a sidebar icon
- **Guided first run**: the welcome screen offers "Add a connection" and a one-click `mongodb://localhost:27017` quick connect when no connection is saved yet; once connections exist, it lists the last 10 used (with folder and color) for one-click reconnect when nothing is currently connected
- **CSV/TSV import** with a column-to-field mapping step (type auto-detected per column: string/number/boolean/date/ObjectId), from the database context menu (new collection) and the collection context menu (append), alongside the existing JSON/NDJSON import

### Changed
- Connection manager: "Duplicate" renamed to "Clone", now also available as a dedicated row icon (not just the context menu); added an X button to close the window

## [1.4.0] - 2026-07-29

### Added
- **Connection string breakdown**: the connection form now parses the URI into individual fields (scheme, hosts, replicaSet, directConnection, appName, compressors, auth, options) alongside the raw string, kept in sync both ways
- **Duplicate connection** — the connection manager's right-click menu gained a "Duplicate" action, cloning the connection with a `(copy)` suffix instead of requiring the URI to be re-entered by hand
- Line numbers in the query/aggregation Monaco editor

### Fixed
- Tab bar contrast in the active/inactive tab labels

## [1.3.0] - 2026-07-28

### Added
- **Update check on startup** (`src/main/updater.ts` + `utils/updates.ts` + `UpdateModal`): 3 s after launch the app asks GitHub whether a newer version exists and, if so, shows the version, the release notes and a download button — silently doing nothing when it is already current or offline. Two backends, picked by `canAutoInstall()`: **electron-updater** where it can replace the running build (Windows NSIS, Linux AppImage — both read the `latest-*.yml` the release workflow publishes), which downloads with a progress bar and installs on restart (or on the next quit); and the plain **GitHub releases API** everywhere else — a `.deb` install or an unpackaged dev run — which only notifies and opens the download page. `.deb` is deliberately excluded from self-updating: it would need `pkexec dpkg -i` and a password prompt
- About gained **Check for updates** (reports "you're up to date" and errors too, and reconsiders a skipped version) and a **Check on startup** toggle; "Skip this version" is remembered in `localStorage`
- **Tree refresh** — a collection another client creates or drops was invisible until you reconnected, since nothing polls MongoDB. The sidebar toolbar gained a Refresh button (`F5` / `Ctrl+R`) that re-lists the databases plus the collections of every *expanded* database and evicts databases that vanished; the database context menu gained "Refresh collections" for one database
- **Right-click menu in text fields**: Electron ships no default context menu, so cut/copy/paste with the mouse was simply unavailable. `enableEditContextMenu()` in `main.ts` pops a native undo/redo/cut/copy/paste/select-all menu, but only when `params.isEditable` — elsewhere the renderer draws its own menus and the two would stack

### Fixed
- **Global shortcuts stole keys from text fields.** `DocumentsView` binds its shortcuts on `window` and did not check where the event came from, so `Ctrl+V` (always) and `Ctrl+C` / `Delete` / `Backspace` (with documents selected) fired while you were typing — which is why `Delete` inside the Edit or Add-document editor tried to delete the *document* instead of a character, and why pasting text into a filter box did not work. Every window-level handler (`DocumentsView` and `App.tsx`) now bails out first via `isTypingTarget()` (`utils/dom.ts`), and `Escape` still closes the open editor from inside its textarea

### Changed
- `vitest.config.ts` moved to `test.projects` (**main** in `node`, **renderer** in `jsdom` with the jest-dom setup file). `environmentMatchGlobs` is a no-op on Vitest 4, so renderer tests had silently been running without a DOM

## [1.2.0] - 2026-07-28

### Added
- `Alt+E` edits the focused connection in the manager (shown in its context menu and on the pencil's tooltip), alongside the existing `Enter` to connect/disconnect
- **Search in the connection manager**: contains-match on the connection name **and** on every host in its URI, so `mongo02` or `10.157` find a connection whose name says nothing about the machine. Folders holding a match are auto-expanded while searching (a hit inside a collapsed folder would read as no result) and the header shows `N of M`
- **TLS / certificate connections**: connections carry `tls`, `tlsCertificateKeyFile` (+ password), `tlsCAFile`, `tlsAllowInvalidCertificates` and `tlsServername` (SNI); the connection form is now tabbed (General / TLS / Appearance) and the TLS tab edits them, with a native file picker (`pick-certificate-file` IPC — the renderer cannot read a `File`'s path since Electron 32). Certificate paths are checked before connecting so a wrong path says which file is missing, and `test-connection` logs the TLS setup it is using. The `.uri` importer lifts `ssl`/`tls`, `3t.clientCertPath` and `3t.sniName` onto the connection
- **About dialog** (sidebar `?`): app version, build date (mtime of the shipped main bundle), author, license, repository, platform and Electron/Chromium/Node versions, from a new `get-app-info` IPC — plus the logo rebuilt as a spinning 3D box in the brand colours
- Connection errors now explain TLS failures: "self signed certificate in certificate chain" points at the CA file field and the accept-invalid checkbox

### Changed
- Connection-manager folders now start **collapsed** — with several imported groups an all-open tree buried the connections. Folders created afterwards (import, "New folder") still open by themselves
- **Unfiltered document totals use `estimatedDocumentCount()`** instead of `countDocuments({})`. The page itself was always paginated (`skip`+`limit`); the total was the slow part — a full scan re-run on every page change (200k docs locally: find 4 ms, `countDocuments({})` 48 ms, estimate 2 ms; the gap grows with collection size and latency). Filtered counts stay exact; approximate totals are shown as `≈N total`
- Monaco gets a real solarized theme (`boxy-solarized`) instead of falling back to `vs-dark` inside a teal UI
- `package.json`: `homepage` pointed at a repository that does not exist (`dginnasio/boxynosql`) → corrected to `davideginna/BoxyNoSql`; added the missing `"license": "MIT"`

### Fixed
- **Text colours ignored the theme in several places.** Hardcoded values outside the theme blocks — the whole context menu (`#222` background, `#ddd`/`#fff`/`#555` text), the JSON syntax highlighter (`.jk`/`.js`/`.jn`/`.jb`/`.jl`/`.jo` on the VS Code dark palette), `.tree-val-oid`, the layered JSON editor (`#cccccc`, white caret), diff colours, the find highlight, and every `color: #fff` on accent-filled buttons — now resolve through per-theme tokens (`--accent-text`, `--val-oid`, `--mark-bg`/`--mark-text` added to all four themes). Remaining inline styles in `QueryTerminal`, `AggregationBuilder` and `StatsView` moved to themed classes
- Active tab label was hardcoded white over a tint mixed with `--bg-primary`, which was unreadable in the light theme
- Clear-search buttons (`.db-search-clear`, sidebar and connection manager) rendered as filled accent buttons: the class was missing from the catch-all `button:not(...)` exclusion list, so the generic rule won
- **Clicking an already-open connection in the sidebar did nothing**, so its database tree could not be folded away — `handleSelectConnection` returned early when the id was already selected. A second click now collapses the tree (and a third re-expands it), with a chevron on the row showing the state. Collapse is tracked separately from selection: clearing `selectedConnection` would have broken the open tabs, which load their data through it
- **Theme switch buttons were invisible in three of the four themes.** `.sidebar-footer button` set `background: none; border: none` but no `color`, and buttons do not inherit `color` — so the icons fell back to the UA default (near-black), disappearing against the dark, high-contrast and solarized backgrounds. They now use `--text-secondary`, brighten to `--text-primary` on hover, and the selected theme is marked with the current theme's own `--accent` plus an accent-tinted background (the previous `--bg-hover` highlight was nearly invisible in hc and solarized)

## [1.1.0] - 2026-07-28

### Added
- **Import connections from a Studio 3T `.uri` export** (`utils/uriImport.ts` + `ImportConnectionsModal`): Import button in the connection manager parses the export file, maps `3t.group` to a (nested) folder path, `3t.defaultColor` to the connection color and `3t.connection.name` to the name, strips `3t.*` and empty query params from the stored URI, and shows a checklist preview that flags URIs already saved. Folders created during import are reused when they already exist and start expanded
- **Windows install guide** (`INSTALL_WINDOWS.md`): installer / build-from-source / CI-artifact paths, plus the `npm run dev` cmd.exe caveat
- **Cross-platform packaging**: Windows (`nsis`) electron-builder target + generated `build/icon.ico`; per-platform scripts (`electron:build:linux` / `:win` / `:all`); installers output to `release/` (no longer clobbers `dist/`)
- **GitHub Actions release workflow** (`.github/workflows/release.yml`): ubuntu + windows matrix, builds + uploads installers on `v*` tags
- **Connection manager overlay** (`ConnectionManagerModal`): all saved-connection and folder management (create/edit/delete, drag-drop, connect) moved into a dedicated modal; opened via sidebar **Manage** button or `Ctrl+M`. Sidebar now shows only connected databases
- Connection manager overlay is **resizable** (drag right edge); width persisted in `localStorage` across reopen and restart
- Per-connection host/replica-set display in the manager: lists each host (one per line) plus `SRV` and `rs:<name>` tags
- **Monochrome SVG icon set** (`Icon.tsx`) replacing every emoji across the whole app; `ContextMenu` gained `icon` + `shortcut` fields
- **Icon color customization**: Appearance settings modal (sidebar ⚙) sets database / collection icon color mode (mono / connection / custom) with a preset+hex+native color picker; per-connection overrides in the connection form. Defaults: database icon green, collection icon yellow; default connection color yellow
- **Folder edit modal** (`FolderEditModal`): change folder name + color, with an option to apply the color to all connections inside the folder
- **Copy** collection name and **Duplicate** collection (`duplicate-collection` IPC clones documents + non-`_id` indexes)
- **Keyboard shortcuts**: `Ctrl+M` manager, `Ctrl+,` appearance, `Ctrl+W` close tab, `Ctrl+1-9` switch tab; collection (focused) Enter open / F2 rename / Del drop / `Ctrl+D` duplicate / `Ctrl+C` copy name; Enter to connect/disconnect in the manager
- Connection-attempt feedback: inline "Connecting…" spinner in the sidebar while a connection is in flight
- `Esc` closes Connection / Users-Roles / Settings / Manager modals; modals with unsaved input prompt "Discard changes?" first
- Reusable inline `ColorEditor` (preset swatches + editable hex + native picker) and `ColorPickerPopup`
- **Import**: three-level JSON import
  - Documents into a collection (JSON array, single object, or NDJSON)
  - Collection into a database (creates collection, prompts for name)
  - Whole database from `{ colName: [docs], ... }` dump
  - Entry points: right-click collection / db / sidebar background; also `📥 Import` button in db-tree toolbar
- `import-collection` and `import-database` IPC handlers with `fromExtJSON` round-trip
- Per-tab state persistence: switching collections no longer loses query text, query-builder conditions, pagination, or results. Inactive tabs are hidden (`display:none`) instead of unmounted
- Per-view persistence within a tab: switching Documents ↔ Query ↔ Aggregation keeps each view mounted so filters/results survive
- Query editor: resizable splitter with mouse drag between editor and result panel, size persisted in `localStorage`
- Query editor: `Ctrl+Space` suggestions and `Ctrl+Enter` run, with fallback DOM listeners (Monaco `addCommand` alone loses `onRun` closure on re-renders)
- Query editor toolbar hint showing `[Ctrl+Space] suggestions · [Ctrl+Enter] run`
- Solarized theme (🌊) — fourth theme alongside Dark / Light / High-contrast
- JSON syntax highlighting in View/Edit document modals (keys, strings, numbers, bool, null, `ObjectId(...)`, `ISODate(...)`); layered `<pre>` + transparent `<textarea>` with scroll sync
- Shell-style `ObjectId("…")` / `ISODate("…")` display in Edit and View modals; `parseEditable` round-trips back to Extended JSON on save
- `Ctrl+A` in Documents view now selects all visible documents (not all app text); skipped when focus is on an input/textarea
- Monaco completion provider for Mongo: collection methods (`find`, `insertOne`, `aggregate`, …), cursor methods (`limit`, `sort`, …), operators (`$match`, `$set`, …), snippet placeholders, plus live field completion sampled from the current collection
- Query result table: union of keys from all rows (not just first), `ObjectId/ISODate` rendered in shell form, fallback `<pre>` for non-object results (counts, scalars)
- `PIANO_TEST.md` — complete manual test plan with Docker MongoDB setup (auth + no-auth), seed scripts, 18 sections covering every feature

### Fixed
- **Renderer build broken under Vite 8**: `vite-plugin-monaco-editor` required `esbuild` (no longer bundled by rolldown-based Vite) → added `esbuild` dev dependency
- Monaco worker bundles were written to a bogus nested path inside `src/` (plugin joined two absolute paths); fixed via `customDistPath`
- `linux.desktop` config rejected by electron-builder v26 (flat keys) → moved under `desktop.entry`
- **Context-menu actions inside the connection manager closed the whole manager.** `ContextMenu` renders inside the manager's `.modal-overlay`, whose `onClick` dismisses it, so every entry click bubbled up and unmounted the manager — taking the just-opened `FolderEditModal` with it (right-click folder → "Edit (name & color)" looked like a no-op; the pencil button worked because it sits inside `.modal`, which stops propagation). `ContextMenu` now stops click/mousedown propagation at its root, and the nested `FolderEditModal` / `ImportConnectionsModal` backdrops stop theirs, so dismissing one no longer closes the manager behind it
- Connection timeout lowered from 10s to 5s (`serverSelectionTimeoutMS` + `connectTimeoutMS` on `connect-db`); failures now show a styled, human-readable dialog (timeout / refused / auth / host-not-found) instead of a raw error string
- Switching between connected connections showed stale databases: `handleSelectConnection` now reloads the selected connection's database list
- **Production build broken**: `main.ts` loaded `../../renderer/index.html` but built layout is `dist/main/main.js` + `dist/renderer/index.html`, so packaged app showed a blank page. Path corrected to `../renderer/index.html`
- **Stats view crashed** with `TypeError: Cannot read 'size of all LSM objects'` when `wiredTiger.LSM` is absent (modern MongoDB without LSM). Added optional chaining and conditional sections; shows "No WiredTiger stats available" as a graceful fallback
- **Extended-JSON round-trip**: `insert-documents`, `update-document`, and `run-aggregation` now apply `fromExtJSON` so `{$oid}` / `{$date}` from the renderer are rehydrated to real `ObjectId` / `Date` in MongoDB (previously saved as plain objects, breaking queries)
- `show-input` IPC: replaced `ipcMain.once` with explicit listener + `settled` guard to prevent listener leaks and double-resolution when the dialog window is destroyed before the button is clicked; HTML-escape title to prevent injection
- `export-collection` CSV: escape commas/quotes/newlines per RFC-4180; union keys across all documents (was using only `Object.keys(docs[0])`)
- `MainContent.tsx`: `useEffect` without deps recomputed tab-overflow every render → now bound to `[tabs.length]`
- `DocumentsView.tsx`: removed dead `OPERATORS` const with wrong `$eq` values (never used after query-builder refactor)
- `JSON highlighter`: regex step corrupted output when quotes inside already-injected `class="jk"` attributes matched as strings; rewritten as single-pass tokenizer
- `QueryTerminal.tsx` layout: missing `flex: 1 + minHeight: 0 + overflow: hidden` on root caused Monaco (`automaticLayout: true`) to grow unbounded when results populated; editor now pinned to user-controlled height
- `Ctrl+Space` / `Ctrl+Enter` in Monaco captured stale `onRun` closure on first render; use refs for latest callbacks + DOM `keydown` fallback
- View-switcher tabs (📄 Documents / 🔍 Query / …) overflowed on hover: removed font-weight swap on active state, added fixed `line-height`, `box-sizing: border-box`, container `overflow: hidden`
- Double context menu on right-click on database nodes: missing `e.stopPropagation()` let the event bubble to `sidebar-scroll` and also open the background menu
- Sidebar tree chevrons were 9px wide and hard to click: now 18×18 px with hover background, `cursor: pointer`, `border-radius`

### Changed
- **Design tokens** in `index.css`: radius / type / spacing / motion scales plus `--font-ui` and `--font-mono`, and literal values across the stylesheet migrated onto them (69 of 71 `border-radius`, 83 of 86 `font-size`, all `Consolas` stacks, 43 of 56 `gap`). Values are unchanged — the point is that they are now editable from one place
- **Keyboard focus is visible**: one `:focus-visible` ring driven by `--focus-ring`, including on the inputs that previously did `outline: none`. Hover/selection transitions are centralized and disabled under `prefers-reduced-motion`
- **Collapsed documents show their content**: the tree view row now previews the first 4 non-`_id` fields with the same value colouring as the expanded tree, instead of showing only an ObjectId
- **Bulk action bar appears only with a selection** (every button in it was disabled otherwise); Paste moved next to Add in the toolbar, since it is the one action that works with nothing selected
- **Query builder panel starts closed** — it used ~20% of the width to show a placeholder; the toolbar Filter button opens it and shows the condition count
- **`DocumentsView` / `IndexesView` inline styles moved to classes** (39 → 2 and 32 → 0; the 2 left are data-driven type colours). Several of the originals hardcoded dark-theme hex values (`#888`, `#f48771`, `#2d1a1a`, `#3c3c3c`, `#6b2b2b`) that rendered wrong in the light / hc / solarized themes — those now use tokens. Destructive buttons use a shared `.danger` class instead of an inline `background` override
- Reverted emoji icons back to a unified monochrome SVG icon set (see `Icon.tsx`), now colorable by connection/theme
- Sidebar scope narrowed to connected databases only; saved-connection/folder management lives in the connection manager overlay
- Connection / folder color is shown via the colored icon in the overlay (color is edited in the connection or folder form, not via an inline swatch)
- Added Docker MongoDB snippet to `README.md`
- `StatsView.tsx`: safer rendering — `mb()` / `num()` helpers handle missing numeric fields instead of showing `NaN MB` or `undefined`

### Added
- Folder system: create, rename, delete, color-code, nest folders (drag & drop into each other)
- Folder reorder with ↑↓ buttons per level (root folders among themselves, subfolders among themselves)
- Color picker inline on connections and folders (dot → swatch popup)
- Right-click context menu on empty sidebar area → New folder / New connection
- Pagination for document view: configurable limit, prev/next/first/last buttons, `X–Y / total` counter in status bar
- App logo (`src/assets/img/logo.svg`) shown in sidebar header and as browser favicon
- Bulk action bar always visible (disabled when no selection, accent highlight when active)

### Fixed
- Build error: duplicate `root-drop-area` block in Sidebar.tsx left by previous AI edit
- `renderFolder` function missing (deleted by previous AI edit)
- `onMoveFolder` not destructured in Sidebar → drag & drop folders silently failed
- `Folder` interface missing `parentId` in both `main.ts` and `App.tsx`
- `handleAddFolder` ignored `parentId` argument (always created at root)
- `onClick={onAddFolder}` passed `MouseEvent` as `parentId` → IPC structured-clone error → folder never created
- `onReorderFolders` not destructured in Sidebar → ↑↓ buttons threw `ReferenceError`
- `run-query` IPC returned raw BSON / MongoDB cursor → `DataCloneError` or infinite recursion
- `run-aggregation` IPC returned raw BSON without serialization
- `serializeDoc` had no circular-reference guard → stack overflow on complex query results
- `get-documents` IPC had no `skip` parameter → pagination always showed page 1

### Changed
- SVG icon components (`DbIcon`, `ColIcon`, `FolderIcon`, `IconConnect`, `IconDisconnect`, `IconEdit`, `IconDelete`) replaced with emoji (🗄️ 📄 📁/📂 ▶ ⏸ ✏️ 🗑️)
- Removed all user-visible "MongoDB" references → BoxyNoSql branding throughout
- `package-lock.json` name corrected from `mongodb-ui` to `boxynosql`
- `get-documents` now returns `{ docs, total }` with `skip` support for pagination
- Status bar shows `X–Y / total` with pagination controls instead of bare document count
