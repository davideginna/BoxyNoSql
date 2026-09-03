# Security Policy

BoxyNoSql is a local desktop client (Electron) for browsing and managing MongoDB
servers. It has no server component and does not send your data anywhere; all
communication happens directly between your machine and the MongoDB server(s)
you connect it to.

## Supported versions

Only the latest published release is supported. Please update before reporting
an issue and confirm it still reproduces there.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for a security report.

Instead, use one of:

- [GitHub Security Advisories](https://github.com/davideginna/BoxyNoSql/security/advisories/new) (preferred)
- Email d.ginnasio@tdnet.it

Include what you'd expect in any report: affected version, a reproduction
(steps, sample connection string shape, sample document — no real credentials
or data, please), and the impact you think it has. I'll acknowledge within a
few days and aim to have a fix or a mitigation plan within two weeks for
anything confirmed.

## Design notes relevant to a report

A few things are deliberate rather than oversights — worth checking before
filing:

- **The query terminal runs arbitrary JavaScript against the connected
  database on purpose.** `db.collection(...).find(...)` and friends are
  evaluated with `new Function`, exactly like the `mongosh` shell it mirrors.
  This is safe *only* because the app is local-first: the code you type never
  leaves your machine, and it runs with your own OS user's privileges against
  a server you already hold credentials for. This is not a sandbox and isn't
  meant to be one — don't paste untrusted code from someone else into it,
  the same way you wouldn't paste it into a terminal.
- **A read-only connection is enforced in the main process**, not just by
  disabling buttons in the UI: every write IPC handler checks the flag first,
  and the query terminal gets a proxied `db` handle whose write methods throw.
  Explain always runs against that same guarded handle, regardless of the
  connection's flag, so a stray `insertOne` left in the editor can't run just
  because Explain was the button clicked. A bypass of either of these is a
  real bug and in scope.
- **Connection strings and credentials are stored locally**
  (`~/.config/BoxyNoSql/connections.json` via `electron-store`), unencrypted,
  the same way most desktop DB clients keep saved connections. A vulnerability
  that lets a *different, unprivileged* local user or process read that file
  through the app itself (rather than plain filesystem permissions) is in
  scope; the file existing on disk in plaintext is a known, accepted
  trade-off, not something to report on its own.
- The renderer process never talks to MongoDB directly — everything crosses
  the Electron IPC boundary into the main process first. A way to reach
  MongoDB, the filesystem, or another connection's credentials from the
  renderer without going through that boundary is in scope.

## Out of scope

- Anything that requires local code execution outside the app already (if an
  attacker can run arbitrary code as your user, they don't need a bug in
  BoxyNoSql).
- Denial of service against your own MongoDB server from the query terminal —
  see above, that's the intended feature.
- Issues in MongoDB itself, or in a MongoDB server you've connected to that
  you don't control.
