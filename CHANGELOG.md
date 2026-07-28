# Changelog

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
