# BoxyNoSql

Desktop NoSQL GUI client. Explore connections, databases, collections and documents.

## Features

- ✅ Connection management (saved in `~/.config/BoxyNoSql/connections.json`)
- ✅ Folder organization with drag & drop, color coding
- ✅ Database/collection tree view with search
- ✅ Document viewer (tree + table), multi-select, bulk copy/paste/delete
- ✅ Paginated document browsing with configurable limit
- ✅ Query terminal with JS syntax
- ✅ Aggregation pipeline builder
- ✅ Index management (create/drop) with usage stats
- ✅ Collection stats
- ✅ Export JSON/CSV
- ✅ User/role management per database
- ✅ Dark / light / high-contrast themes

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
npm run electron:build
```

Generates `.deb` in `dist/` for Ubuntu/Debian.

## Usage

1. Open the app
2. Click `🔌 +` to add a connection (or right-click the sidebar)
3. Enter name and connection string (e.g. `mongodb://localhost:27017`)
4. Double-click connection to connect
5. Click a collection to open it

## License

MIT — see [LICENSE](LICENSE)
