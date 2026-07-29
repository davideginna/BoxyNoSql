# BoxyNoSql

Desktop NoSQL GUI client. Explore connections, databases, collections and documents.

## Features

- ✅ Connection management (saved in `~/.config/BoxyNoSql/connections.json`)
- ✅ Folder organization with drag & drop, color coding
- ✅ Database/collection tree view with search
- ✅ Document viewer (tree + table), multi-select, bulk copy/paste/delete
- ✅ Paginated document browsing with configurable limit
- ✅ Document view/edit with JSON syntax highlighting, shell-style `ObjectId(...)` / `ISODate(...)`
- ✅ Query terminal with Monaco editor: autocompletion (Ctrl+Space), Mongo method/operator/field suggestions, Ctrl+Enter to run, resizable split
- ✅ Aggregation pipeline builder
- ✅ Index management (create/drop) with usage stats
- ✅ Collection stats
- ✅ Import from JSON / NDJSON at three levels (document, collection, full database)
- ✅ Export JSON/CSV
- ✅ User/role management per database
- ✅ Per-tab persistent state: switching between collections/views keeps filters and results
- ✅ Four themes: dark 🌙 / light ☀️ / high-contrast ⚡ / solarized 🌊

## Roadmap

Planned, not shipped. 🔥 = high impact, low effort.

### Productivity

- 🔥 **Sort and project the document list** — click a column to sort and choose which fields to show, instead of always getting insertion order and every field
- 🔥 **Query history and saved queries** — every query, filter and pipeline you run kept per collection, with the good ones nameable and reusable across restarts
- 🔥 **A real editor for aggregation stages** — the Monaco editor, highlighting and completions the query terminal already has, plus the document count each stage returns
- ⬜ **Explain plan** — run `explain()` on the current query or pipeline and see index usage, documents examined and stage timings
- ⬜ **Command palette (Ctrl+P)** — jump to any database, collection or action by typing its name, without walking the tree
- ⬜ **Bulk field edit** — set, rename or unset a field on the whole selection instead of opening documents one at a time

### Data & safety

- 🔥 **Export what you are looking at** — export the current filter, query or aggregation result through a native save dialog, not only the entire collection
- 🔥 **Typed confirmation on destructive actions** — drop and clear ask you to type the name and show how many documents are about to go
- ⬜ **Read-only connections** — a per-connection flag that disables every write, so a production server is safe to browse
- ⬜ **Schema explorer** — sample a collection and list every field with its types, how many documents have it, and example values
- ⬜ **CSV import** — import CSV/TSV with a column-to-field mapping step, alongside the existing JSON and NDJSON
- ⬜ **One `npm run check` and tests beyond the utils** — typecheck main and renderer plus lint in a single command, with view-level tests, so refactors stop shipping silent regressions

### Comfort & discoverability

- 🔥 **Shortcut cheat sheet (F1)** — around twenty shortcuts already exist and nothing lists them; one searchable overlay does
- ⬜ **Reopen the last session** — reconnect the servers and restore the tabs that were open when the app closed
- ⬜ **Large collections without the freeze** — virtualized rows and streamed pages so a big result set scrolls instead of locking the UI
- ⬜ **Pinned collections** — keep the handful you actually work on at the top of the tree
- ⬜ **Connection health and auto-reconnect** — show when a server has dropped and reconnect on the next action instead of failing with "Not connected"
- ⬜ **Guided first run** — the empty welcome screen offers "add a connection" and a one-click `mongodb://localhost:27017`

## Install

```bash
npm install
```

## Development

```bash
npm run dev    # start Vite + tsc watchers
npm start      # open Electron (after dev server is up)
```

## Build

```bash
npm run electron:build:linux   # .deb + AppImage
npm run electron:build:win     # NSIS installer
npm run electron:build:all     # both
```

Installers are written to `release/`.

**Windows users:** see [INSTALL_WINDOWS.md](INSTALL_WINDOWS.md) for install, build and troubleshooting steps.

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
