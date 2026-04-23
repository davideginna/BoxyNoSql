# Changelog

## [Unreleased]

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
