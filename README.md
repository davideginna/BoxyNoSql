# BoxyNoSql

Desktop NoSQL GUI client. Explore connections, databases, collections and documents.

## Features

- ✅ Connection management (saved in `~/.config/BoxyNoSql/connections.json`)
- ✅ Folder organization with drag & drop, color coding
- ✅ Database/collection tree view with search, plus a command palette (`Ctrl+P`) over connections, databases, collections and actions
- ✅ Document viewer (tree + table), multi-select, bulk copy/paste/delete and bulk field edit (set/rename/unset across the selection)
- ✅ Paginated document browsing with configurable limit
- ✅ Server-side sort (click a column, shift-click for a second key) and per-collection field visibility
- ✅ Query history per collection (filters, queries, pipelines) with named saved queries, kept across restarts
- ✅ Pinned collections, restored last session, connection health with auto-reconnect
- ✅ Shortcut cheat sheet (F1), guided welcome screen, connection clone, CSV/TSV import
- ✅ Document view/edit with JSON syntax highlighting, shell-style `ObjectId(...)` / `ISODate(...)`
- ✅ Query terminal with Monaco editor: autocompletion (Ctrl+Space), Mongo method/operator/field suggestions, Ctrl+Enter to run, resizable split
- ✅ Aggregation pipeline builder with a Monaco editor per stage, completions, stage templates and a document counter per stage
- ✅ Explain plan on the current filter, query or pipeline: index used or collection scan, documents and keys examined, stage timings, a verdict when far more is read than returned, and the raw output one click away
- ✅ Index management (create/drop) with usage stats
- ✅ Collection stats and a schema explorer (sampled field list with types, presence and example values)
- ✅ Copy a collection or a whole database across connections, with a confirmation naming both ends and an automatic refresh of the target
- ✅ Import from JSON / NDJSON at three levels (document, collection, full database)
- ✅ Export to JSON / NDJSON / CSV through a native save dialog: the current filtered+sorted view, the whole collection, or a query/aggregation result
- ✅ User/role management per database
- ✅ Per-tab persistent state: switching between collections/views keeps filters and results
- ✅ Large pages without the freeze: both document views are windowed, so only the rows near the viewport are in the DOM and a limit of a few thousand scrolls instead of locking up
- ✅ Read-only connections: a per-connection flag that refuses every write in the main process, not just in the UI
- ✅ Typed confirmation on drop/clear: retype the name, with the document count shown up front
- ✅ Four themes: dark 🌙 / light ☀️ / high-contrast ⚡ / solarized 🌊

## Screenshots

| | |
|---|---|
| **Documents — tree view** ![Documents tree view](assets/screenshots/documents-tree.png) | **Documents — table view** ![Documents table view](assets/screenshots/documents-table.png) |
| **Query terminal** ![Query terminal](assets/screenshots/query-terminal.png) | **Aggregation pipeline builder** ![Aggregation pipeline builder](assets/screenshots/aggregation.png) |
| **Connection manager** ![Connection manager](assets/screenshots/connections.png) | **Connection string breakdown** ![Connection string breakdown](assets/screenshots/connection-breakdown.png) |

*(Dark theme shown; light, high-contrast and solarized are also available. Sample data, no real servers or data pictured.)*

## Roadmap

- [ ] **Search reaching collections whose database was never expanded.** The sidebar's search box (`Sidebar.tsx` `db-search-input`) already matches collection names, not just database names (`matchingCols`, auto-expands a db that only matched through a collection) — but it filters `collections[connId][db]`, which `App.tsx`'s `handleExpandDb` only populates lazily, on that db's first manual expand. Typing a collection name today only finds it if its parent db happens to already be expanded; an unexpanded db's collections are invisible to search. `CommandPalette` has the same gap, for the same reason (`collections[connId]` is its source too, per its own comment: it "deliberately does not list databases it has not fetched, or the palette would hit every server on each keystroke").

  Design (not yet implemented):
  - No server-side "search collections across databases" primitive exists in MongoDB — reaching an unfetched db's collections always means calling `get-collections` for it, same IPC `handleExpandAll` already batches for one connection's "Expand all" button.
  - Stay explicit, matching the app's existing stance (schema sampling, palette's own db-listing) of never firing background requests just because a keystroke happened: don't fetch-as-you-type. Instead, when a search term matches no already-loaded database or collection name, show a hint under the (empty) results — e.g. "12 databases not expanded — search there too?" — with a button that does the one-time batched `get-collections` fetch (mirrors `handleExpandAll`'s `Promise.all` over the not-yet-loaded databases of that connection) and merges into the existing `collections` state.
  - Once merged, the existing `matchingCols`/`filteredDbs` filtering in `Sidebar.tsx` needs no changes — it already searches whatever's in `collections[connId]`. `CommandPalette`'s item list (built in `App.tsx`) benefits the same way for free, since both read the same state.
  - Debounce the button's appearance (only offer it after the user pauses typing, not on every keystroke) so a fast typist doesn't see it flash on intermediate substrings.
  - Cap or explicitly warn for connections with a very large database count before firing that many `get-collections` calls at once — no cap exists on `handleExpandAll` today either, but that's a user-initiated "Expand all" click, not a per-keystroke-adjacent action; worth deciding a threshold (e.g. warn past ~30 databases) rather than copying that precedent blindly.
  - Files to touch: `App.tsx` (new handler alongside `handleExpandDb`/`handleExpandAll`), `Sidebar.tsx` (the hint + button, no filtering-logic changes), possibly `utils/palette.ts` only if the hint should also surface from `Ctrl+P`.

Everything else that was on it has shipped — see the Features list above and `CHANGELOG.md`.

## Install

```bash
npm install
```

## Development

```bash
npm run dev    # start Vite + tsc watchers
npm start      # open Electron (after dev server is up)
npm run check  # typecheck main + renderer, lint, then run the tests
```

### Keyboard

`Esc` cancels the innermost thing open, everywhere. `Alt+Enter` runs the current filter, query or pipeline (`Ctrl+Enter` also works in the editors). `F1` lists every other shortcut.

## Build

```bash
npm run electron:build:linux   # .deb + AppImage
npm run electron:build:win     # NSIS installer
npm run electron:build:all     # both
```

Installers are written to `release/`.

**Windows users:** see [INSTALL_WINDOWS.md](INSTALL_WINDOWS.md) for install, build and troubleshooting steps.

**Linux/Ubuntu users:** see [INSTALL_LINUX.md](INSTALL_LINUX.md) — `.deb` vs AppImage, auto-update (AppImage only), pinning the AppImage to the dock, and troubleshooting.

## Usage

1. Open the app
2. Click `🔌 +` to add a connection (or right-click the sidebar)
3. Enter name and connection string (e.g. `mongodb://localhost:27017`)
4. Double-click connection to connect
5. Click a collection to open it

## Mongo test docker

```bash
docker run -d --name mongodb-dev -p 27017:27017 -e MONGO_INITDB_ROOT_USERNAME=admin -e MONGO_INITDB_ROOT_PASSWORD=secret mongo:7

docker exec -it mongodb-dev mongosh -u admin -p secret --authenticationDatabase admin
```

## License

MIT — see [LICENSE](LICENSE)
