# Changelog

## [Unreleased]

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
