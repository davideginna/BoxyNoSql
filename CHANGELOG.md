# Changelog

## [Unreleased]

### Added
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
