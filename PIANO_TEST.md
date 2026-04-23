# Piano di Test BoxyNoSql

Test manuale completo contro MongoDB locale via Docker. Copre ogni feature (connessioni, db, collection, documenti, query, aggregate, indici, stats, utenti/ruoli, folder, colori, temi, UX).

## 1. Setup ambiente

### 1.1 Docker: MongoDB senza auth (per i test base)

```bash
docker run -d --name boxy-mongo -p 27017:27017 mongo:7
```

### 1.2 Docker: MongoDB con auth (per i test utenti/ruoli)

```bash
docker stop boxy-mongo && docker rm boxy-mongo
docker run -d --name boxy-mongo-auth -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=root \
  -e MONGO_INITDB_ROOT_PASSWORD=rootpw \
  mongo:7
```

URI: `mongodb://root:rootpw@localhost:27017/?authSource=admin`

### 1.3 Seed dataset (usare `mongosh`)

```bash
docker exec -i boxy-mongo mongosh <<'EOF'
use testdb
db.users.insertMany([
  { name: "Alice", age: 30, active: true,  email: "a@x.it",  tags: ["admin","eu"],  created: new Date("2024-01-15"), score: 95.5 },
  { name: "Bob",   age: 25, active: false, email: null,      tags: ["user"],        created: new Date("2024-03-22"), score: 80 },
  { name: "Carol", age: 42, active: true,  email: "c@y.it",  tags: ["admin","us"],  created: new Date("2023-11-01"), score: 72 },
  { name: "Dave",  age: 19, active: true,                    tags: [],              created: new Date("2025-02-11"), score: 50 },
])
db.orders.insertMany([
  { userId: "Alice", total: 120.5, items: 3, status: "paid" },
  { userId: "Bob",   total: 45.0,  items: 1, status: "pending" },
  { userId: "Alice", total: 200.0, items: 5, status: "paid" },
])
db.big.insertMany(Array.from({length: 250}, (_,i) => ({ i, name: `n${i}`, grp: i % 5 })))
use otherdb
db.notes.insertOne({ text: "hello" })
EOF
```

Build and run:

```bash
npm install
npm run build
npm start
# oppure per sviluppo:
npm run dev
```

---

## 2. Test: Connessioni

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 2.1 | Avvio app prima volta | Sidebar vuota, placeholder "Select a collection…" |
| 2.2 | `🔌 +` → Name "Local", URI `mongodb://localhost:27017` → **Test Connection** | Log scorre, mostra "✓ Connected". Save attivo |
| 2.3 | URI errato `mongodb://xxxxx:27017` + Test | Log mostra `✕ connect ECONNREFUSED` o timeout. Save ancora possibile ma connect fallisce |
| 2.4 | Save → voce compare in sidebar. Double-click | Si collega, borderLeft colorato, DB tree appare |
| 2.5 | Click su ▶ accanto a connessione disconnessa | Connette |
| 2.6 | Click su ⏸ | Disconnette, tree scompare, tab di quella connessione si chiudono |
| 2.7 | Right-click connessione → Edit | Modal si apre precompilato |
| 2.8 | Right-click connessione → Delete | Prompt conferma. Se confermato → rimossa |
| 2.9 | ColorPicker (pallino) → scegli colore | Pallino aggiornato, border-left e tab della connessione usano quel colore |
| 2.10 | Test con URI contenente `?3t.optionName=xxx` | Sanitizzazione rimuove param 3t.* prima di connettersi |
| 2.11 | Paste URI da "Export" (con commento `// MyName` sopra) | Nome pre-popolato dal commento |
| 2.12 | Riavvio app | Connessioni persistite, stato "disconnesso" (non auto-riconnesso) |

---

## 3. Test: Folder (cartelle)

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 3.1 | `📁` nel header | Prompt nome, crea folder root |
| 3.2 | Right-click folder → New subfolder | Sub-folder creato dentro |
| 3.3 | Drag connessione → drop su folder | Connessione sparisce da root, appare dentro folder |
| 3.4 | Drag folder A → drop su folder B | A diventa figlio di B (ciclo prevenuto: drop su discendente = no-op) |
| 3.5 | Drag folder → area root | Torna a root |
| 3.6 | Folder ↑/↓ | Riordina fra fratelli |
| 3.7 | Right-click folder → Rename → Enter | Nome aggiornato |
| 3.8 | Delete folder con connessioni dentro | Conferma → folder rimosso, connessioni tornano a root |
| 3.9 | Cambio colore folder | Pallino aggiornato |
| 3.10 | Riavvio app | Folders e struttura persistiti |

---

## 4. Test: Database

Dopo `connect` a `mongodb://localhost:27017`:

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 4.1 | Tree mostra `testdb`, `otherdb`, `admin`, `local`, `config` | ✓ |
| 4.2 | `↕ All` | Tutti i db si espandono, collection caricate |
| 4.3 | `↑ Collapse` | Tutti chiudono |
| 4.4 | `🗄 + DB` → nome "newdb" → collection iniziale "init" | `newdb` creato e aperto |
| 4.5 | Right-click db → Clear database → conferma | Tutte le collection svuotate (0 doc) ma esistenti |
| 4.6 | Right-click db → Drop database → conferma danger | Db sparisce |
| 4.7 | Search box "tes" | Solo `testdb` visibile |
| 4.8 | Click ✕ search | Tutti i db tornano |
| 4.9 | Click 👤 | UsersRolesModal si apre (sezione 9) |

---

## 5. Test: Collection

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 5.1 | Click ▸ `testdb` | Mostra `users`, `orders`, `big` |
| 5.2 | ➕ su db `testdb` → "newcol" | Creata, appare in lista |
| 5.3 | Right-click collection → Rename → "renamed" | Nome aggiornato |
| 5.4 | Right-click → Clear collection → conferma | Documenti = 0, collection esiste |
| 5.5 | Right-click → Drop collection → conferma | Sparisce |
| 5.6 | Click su `users` | Apre tab Documents |

---

## 6. Test: Documents — grid / paginazione / ricerca

Aprire `testdb.users`:

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 6.1 | Tree view mostra 4 docs | Ognuno `▸ <_id>` espandibile |
| 6.2 | Switch a Table view | 4 righe, colonne dai campi |
| 6.3 | Limit = 2 → Run | Mostra 2 docs, status "1–2 / 4" |
| 6.4 | Click › | Pagina 2, status "3–4 / 4" |
| 6.5 | Click « | Torna pag 1 |
| 6.6 | Apri `testdb.big` (250 doc), limit 20 | "1–20 / 250", naviga »» in fondo |
| 6.7 | Campo `name`, Equals, `Alice` → Run | Solo Alice |
| 6.8 | Ops + age > 20 con type number | 2 risultati (Alice, Carol) |
| 6.9 | `tags` array, `array_contains`, `admin` | Alice + Carol |
| 6.10 | `email`, `is_null` | Bob + Dave |
| 6.11 | `email`, `exists` | Alice + Bob + Carol |
| 6.12 | `name`, `starts_with`, `Ali` | Alice |
| 6.13 | `name`, `contains` con carattere speciale `.` o `*` | Nessun crash (regex escape) |
| 6.14 | Toggle `$or` | Logica cambia, query preview aggiornata |
| 6.15 | Drag chip campo in drop-zone | Aggiunge condizione pre-compilata con type + valore dal primo doc |
| 6.16 | Preview query → ⛶ expand | Modal mostra JSON completo, `📋 Copy` copia in clipboard |
| 6.17 | Reset | Pulisce conditions |

---

## 7. Test: Documents — CRUD + UX

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 7.1 | `➕ Add` → paste `{ "name":"Eve","age":31 }` → Ctrl+Enter | Inserito, lista aggiornata |
| 7.2 | Add con `[ {a:1},{a:2} ]` | Inserisce entrambi |
| 7.3 | Add con JSON malformato | Header mostra `✕ Unexpected…`, Save disabilitato |
| 7.4 | Double-click su riga doc | Edit modal si apre |
| 7.5 | Modifica campo age → 99 | Badge "● modified" appare, diff panel lista path + old→new |
| 7.6 | Ctrl+Enter | Salva, modal chiude, lista refresh |
| 7.7 | Edit → modifica → Esc → conferma "Close without saving?" | Annulla, doc non modificato |
| 7.8 | Edit → elimina un campo | Diff mostra "removed" |
| 7.9 | Edit doc con `_id: {"$oid":"..."}` e modifica anche `created` in `{"$date":"..."}` | **Verifica bug-fix #3:** dopo save, refresh. `created` resta Date in Mongo (verifica con `mongosh: db.users.findOne({name:"Eve"})` → `created` di tipo Date, non stringa) |
| 7.10 | F3 su selezione singola | View modal (read-only) |
| 7.11 | Ctrl+J su selezione | Edit modal |
| 7.12 | Right-click su doc → "Add field" | Edit con `newField: ""` |
| 7.13 | Right-click → Copy | Clipboard contiene JSON doc |
| 7.14 | Right-click → Export JSON | Scarica file `doc_<id>.json` |
| 7.15 | Right-click → Delete → conferma | Rimosso |
| 7.16 | Ctrl+click su 2 doc → Ctrl+C | Copia array JSON |
| 7.17 | Shift+click range | Tutti selezionati fra i due |
| 7.18 | Delete key con selezione multipla → conferma | Elimina tutti, contatore "N selected" |
| 7.19 | Ctrl+V con JSON valido in clipboard | Inserisce (rimuove `_id` automaticamente) |
| 7.20 | Ctrl+V con clipboard non-JSON | Banner errore rosso |
| 7.21 | Ctrl+A sulla checkbox header | Tutti selezionati |
| 7.22 | Ctrl+F in Edit modal | Find bar appare, match count, navigate ↑/↓ |
| 7.23 | Ctrl+F in View modal | Find highlights con `<mark>` |

---

## 8. Test: Query Terminal

Aprire tab Query su `testdb.users`:

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 8.1 | `db.collection("users").find({}).limit(100)` → Run | Tabella con 4+ righe |
| 8.2 | `db.collection("users").find({age:{$gt:25}})` | Alice + Carol |
| 8.3 | `db.collection("users").countDocuments()` | Valore numerico mostrato |
| 8.4 | Query che tira errore (sintassi) | Banner rosso "Error: …" |
| 8.5 | `db.collection("users").aggregate([{$match:{active:true}}])` | Risultato aggregato mostrato |
| 8.6 | Clear | Pulisce risultati |

---

## 9. Test: Aggregation Builder

Aprire tab Aggregation su `testdb.orders`:

| # | Stage | Risultato atteso |
|---|-------|------------------|
| 9.1 | `$match` = `{"status":"paid"}` → Run | 2 docs (Alice x2) |
| 9.2 | + Stage `$group` = `{"_id":"$userId","sum":{"$sum":"$total"}}` | 1 riga: Alice 320.5 |
| 9.3 | + Stage `$sort` = `{"sum":-1}` | Ordinato discendente |
| 9.4 | Rimuovi stage con × | Ricalcolo senza quello stage |
| 9.5 | Stage con JSON invalido | Banner errore "Unexpected token" |
| 9.6 | `$match` con `{"_id":{"$oid":"<valido>"}}` | **Verifica bug-fix:** pipeline round-trip funziona (oid convertito lato main) |

---

## 10. Test: Indexes

Aprire tab Indexes su `testdb.users`:

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 10.1 | Lista iniziale | Solo `_id_` |
| 10.2 | + Create Index → field `email` ASC + Unique → Create | Nuovo indice `email_1`, Unique ✓ |
| 10.3 | Create con più campi composto | Nome auto `f1_1_f2_-1` |
| 10.4 | Custom name "my_idx" | Creato con quel nome |
| 10.5 | Autocomplete campo | Suggerisce paths da sample (20 doc) |
| 10.6 | Crea indice `text` su `name` | Creato, key `{"name":"text"}` |
| 10.7 | `2dsphere` su un campo geo | Creato |
| 10.8 | `hashed` su `_id` | Creato |
| 10.9 | Sparse + field che manca in qualche doc | Creato |
| 10.10 | Ops used column | Dopo `find({email:"a@x.it"})` e Refresh → ops > 0 su `email_1` |
| 10.11 | Drop indice → conferma | Rimosso |
| 10.12 | Drop `_id_` | Tasto nascosto, non droppabile |
| 10.13 | Crea indice duplicato | Banner errore rosso "index already exists" |

---

## 11. Test: Stats

Apri tab Stats su `testdb.big` (dopo fix):

| # | Atteso |
|---|--------|
| 11.1 | Documents = 250 |
| 11.2 | Size, Storage Size, Total Index Size mostrati in MB con 2 decimali |
| 11.3 | Indexes = 1 (solo _id) |
| 11.4 | Sezione WiredTiger appare solo se `wiredTiger` presente |
| 11.5 | Se LSM/Cache mancano → "No WiredTiger stats available" (non crash). **Verifica bug-fix #2** |
| 11.6 | Collection vuota → valori 0 correttamente mostrati, non NaN |

---

## 12. Test: Users & Roles (serve auth — sezione 1.2)

Riconnetti con URI auth. Apri 👤 su `testdb`:

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 12.1 | Tab Users | Lista vuota o con `root@admin` se visibile |
| 12.2 | Crea user: username `tester`, password `pwpw`, role `readWrite` | Appare in tabella |
| 12.3 | Drop user → conferma | Rimosso |
| 12.4 | Password vuota → bottone ignora click | Non crea |
| 12.5 | Tab Roles | Mostra ruoli (built-in con Yes) |
| 12.6 | Crea role "myrole" inherits "read" | Aggiunto con Built-in = No |
| 12.7 | Drop role built-in | Bottone × nascosto |
| 12.8 | Drop role custom → conferma | Rimosso |
| 12.9 | Crea user con stessa username già esistente | Errore visibile |

---

## 13. Test: Tabs / multi-tab

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 13.1 | Apri 3 collection diverse → 3 tab con titoli | ✓ |
| 13.2 | Switch fra tab | Stato mantenuto per ogni tab (query builder, pagine, risultati) |
| 13.3 | Middle-click tab | Chiude |
| 13.4 | Right-click tab → Close all / Close others | Funzionano |
| 13.5 | Apri 15+ tab | Scroll fino a MAX_ROWS=3 righe, poi banner "Max tab rows reached" |
| 13.6 | Switch View per tab: Documents → Query → Aggregation | Tipo cambia in-place per quella tab |
| 13.7 | Disconnect connessione | Tutti i tab di quella connessione chiudono |
| 13.8 | Close tab attiva | Attiva switcha all'ultima rimasta |

---

## 14. Test: Tema / UI

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 14.1 | Footer sidebar: 🌙 | Dark theme attivo |
| 14.2 | ☀️ | Light theme |
| 14.3 | ⚡ | High-contrast |
| 14.4 | Riavvio | Tema persistito (localStorage) |
| 14.5 | Resize sidebar (grip) | Larghezza cambia, clamp 160–600, persistita |
| 14.6 | Colore connessione | Tab, border-left connessione e tab usano color-mix |
| 14.7 | Colore folder | Pallino aggiornato |

---

## 15. Test: Persistenza

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 15.1 | Crea 3 connessioni + 2 folder → chiudi app → riapri | Tutto persiste |
| 15.2 | Controlla file `~/.config/BoxyNoSql/connections.json` | Contiene `connections` e `folders` arrays |
| 15.3 | localStorage: `theme`, `sidebarWidth` | Presenti |

---

## 16. Test: Produzione (packaged)

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 16.1 | `npm run electron:build:dir` → esegui `dist/linux-unpacked/boxynosql` | App si avvia, mostra UI (no pagina bianca). **Verifica bug-fix #1:** path `../renderer/index.html` |
| 16.2 | `npm run electron:build` → `.deb` in `dist` | Pacchetto generato |
| 16.3 | Installa `.deb` e lancia dal menu | Funziona |

---

## 17. Test: Edge cases / errori

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 17.1 | IPC prima di connect (es. apri tab con collection orfana via ricaricamento) | Errore "Not connected" gestito, non crash |
| 17.2 | Doc con `_id` string (non ObjectId) | Edit/Delete funzionano (fallback a `_id: docId` plain) |
| 17.3 | Doc con campo circolare (impossibile via UI ma via eval) | serializeDoc sostituisce con `[Circular]` |
| 17.4 | Doc con campo Buffer binario (inserito via mongosh) | Serializza in hex string |
| 17.5 | Doc molto grande (>1MB) | Grid funziona, forse lento su Edit textarea |
| 17.6 | 10k documenti (paginati) | Paginazione rapida, status corretto |
| 17.7 | Doc senza `_id` (impossibile in Mongo, skip) | — |
| 17.8 | Cambio collection con Edit aperto | Modal resta visibile (comportamento accettato); Esc per chiudere |
| 17.9 | Filtro con `$regex` invalido | Errore mostrato in banner doc |
| 17.10 | Connessione persa durante sessione (stop container) | Prossima query → errore, disconnect manuale ripulisce |

---

## 18. Unit test (già presenti)

```bash
npm test
```

Coprono: `serializeDoc` (12 tests), `buildFilter` + `detectType` (24 tests).

### Tests da aggiungere (raccomandato, non incluso)

- `fromExtJSON` unit tests (round-trip `{$oid}`, `{$date}`, nested)
- `sanitizeUri` removes `3t.*` query params
- `diffObjects` in DocumentsView (added/removed/changed)
- `parseConnectionExport` in ConnectionModal

---

## Bug-fix applicati in questa review

| # | File | Problema | Fix |
|---|------|----------|-----|
| 1 | `main.ts:65` | `../../renderer/index.html` path errato → prod build pagina bianca | `../renderer/index.html` |
| 2 | `StatsView.tsx` | Crash `TypeError: Cannot read 'size of all LSM objects'` quando `wiredTiger.LSM` undefined (MongoDB moderni) | Optional chaining + sezione condizionale |
| 3 | `main.ts insert-documents / update-document / run-aggregation` | Extended JSON (`{$oid}`, `{$date}`) da renderer NON ri-convertito → ObjectId/Date salvati come oggetti plain | `fromExtJSON` applicato |
| 4 | `DocumentsView.tsx` | Const `OPERATORS` dead-code con valori `$eq` errati | Rimosso |
| 5 | `MainContent.tsx` | `useEffect` senza dipendenze → check overflow a ogni render | Dep `[tabs.length]` |
| 6 | `main.ts show-input` | `ipcMain.once` + close race → listener leak / double-resolve | Flag `settled` + `removeListener` esplicito + escape title |
| 7 | `main.ts export-collection` | CSV non escapa virgole/virgolette; keys solo dal primo doc | Escape RFC-4180 + union di tutte le keys |

Tutti i 38 unit test esistenti continuano a passare.
