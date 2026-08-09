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
// 50k documenti: serve per export, drop con conteggi stimati, schema explorer
// e soprattutto per i test di virtualizzazione (sezione 6c)
for (let b = 0; b < 50; b++) {
  db.logs.insertMany(Array.from({length: 1000}, (_,i) => {
    const n = b * 1000 + i
    return { n, level: ["info","warn","error"][n % 3], msg: `log message ${n}`,
             at: new Date(Date.now() - n * 1000), meta: { host: `h${n % 7}`, pid: 1000 + (n % 50) } }
  }))
}
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

### 6b. Sort e visibilità campi

Aprire `testdb.users` (Table view salvo dove indicato):

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 6b.1 | Click header `age` | Freccia ↑ sull'header, docs ordinati crescente su tutta la collection (non solo la pagina) |
| 6b.2 | Click di nuovo su `age` | Freccia ↓, ordine decrescente |
| 6b.3 | Terzo click su `age` | Nessuna freccia, torna all'ordine naturale |
| 6b.4 | Click `name`, poi shift-click `age` | Due chip in toolbar `name ↑` e `age ↑`, header numerati 1 e 2, ordinamento a due chiavi |
| 6b.5 | Shift-click `name` due volte | `name` diventa ↓ poi sparisce, `age` resta |
| 6b.6 | Click su una chip in toolbar | Rimuove quella chiave di sort |
| 6b.7 | Su `testdb.big` andare a pag. 3, poi click su un header | Torna a pag. 1 (il risultato riordinato è un'altra pagina) |
| 6b.8 | Toolbar → Fields → togliere spunta a `email` | Colonna sparisce, bottone mostra "Fields (1 hidden)" |
| 6b.9 | Riaprire Fields | `email` ancora in lista, barrato e non spuntato — si può riattivare |
| 6b.10 | Checkbox di `_id` | Disabilitata (edit/delete la usano) |
| 6b.11 | Cambiare collection e tornare su `users` | `email` ancora nascosto (persistito per collection in `localStorage.hiddenFields`) |
| 6b.12 | Riavviare l'app, riaprire `users` | `email` ancora nascosto; sort invece azzerato |
| 6b.13 | Fields → frecce ↑/↓ su un campo in Tree view | Ordina anche senza header (unica UI di sort in tree) |
| 6b.14 | Fields → "Show all" / "Clear sort" | Ripristinano tutte le colonne / rimuovono ogni chiave |
| 6b.15 | Click fuori dal popover Fields, poi Esc | Si chiude in entrambi i casi |
| 6b.16b | Header ordinato | Mostra freccia **e** la parola ASC/DESC; tooltip dice "Sorted ascending (A→Z · 1→9 · oldest first)" e cosa farà il prossimo click |
| 6b.16c | Fields → bottoni ASC/DESC | Etichettati, quello attivo è pieno di accento; tooltip spiega il verso; riclick sulla stessa direzione toglie il sort |
| 6b.16d | Chip di sort in toolbar | Mostra `campo ↑ ASC`; tooltip con verso e "click to remove" |
| 6b.16 | Con `email` nascosto: doppio click su una riga → Edit | L'editor mostra il documento **intero**, `email` compresa (riletto per `_id`); salvando non si perde nulla. Idem F3/View e "Add field" |
| 6b.17 | Con `email` nascosto: Ctrl+C su una riga, poi Ctrl+V | La copia contiene solo i campi visibili — il paste crea documenti senza `email` (comportamento voluto: si copia ciò che si vede) |

### 6c. Collezioni grandi — virtualizzazione delle righe

Aprire `testdb.logs` (50k documenti). Solo le righe vicine al viewport stanno nel
DOM: sotto le 200 righe non cambia nulla, sopra parte il windowing.

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 6c.1 | Limit = 5000 → Run, Tree view | Carica in un attimo e resta reattivo; nessun freeze della finestra durante il render |
| 6c.2 | Scroll fino in fondo alla pagina (Tree) | Scorre fluido, la scrollbar copre tutte le 5000 righe (non "salta" né si accorcia) |
| 6c.3 | Con DevTools aperti (`npm run dev`), ispezionare `.tree-view-container` | Poche decine di `.doc-tree-row`, più uno o due `div.doc-spacer` alti migliaia di px al posto delle righe non renderizzate |
| 6c.4 | Switch a Table view, scroll su e giù | Header sticky sempre visibile; le colonne **non** cambiano larghezza mentre si scorre (layout fisso attivo sopra le 200 righe) |
| 6c.5 | Table view con molti campi → scroll orizzontale | Funziona come prima; le celle non vanno a capo |
| 6c.6 | Table view: ispezionare `tbody` | Poche decine di `tr`, più `tr.doc-spacer-row` in cima e in fondo |
| 6c.7 | Click su header `n` per ordinare, con limit 5000 | Riordina server-side e torna a pagina 1; la lista resta reattiva |
| 6c.8 | Tree view: espandere un documento, scorrere via e tornare indietro | Il documento è di nuovo chiuso (la riga è stata smontata) — atteso |
| 6c.9 | Tree view: toolbar "Expand all", poi scorrere in una zona mai vista | Anche le righe nuove arrivano già espanse (il tick viene riapplicato al mount) |
| 6c.10 | Svuotare il campo Limit | Torna a 1, non a 0 (`limit: 0` per MongoDB significa "nessun limite") |
| 6c.11 | Limit = 20 → Run | Nessuna differenza rispetto a prima: niente spacer, colonne di nuovo auto-dimensionate |

**Selezione mentre si è scrollati** (Table view, `testdb.logs`, limit 5000):

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 6c.12 | Checkbox nell'header | "5000 selected" nella barra bulk e nella status bar, anche se in pagina ci sono ~25 righe |
| 6c.13 | Ctrl+A | Idem: seleziona tutta la pagina, non solo le righe montate |
| 6c.14 | Click sulla riga 3, scroll di ~2000 righe, shift+click su una riga visibile | Selezionato tutto l'intervallo (il contatore lo dice), comprese le migliaia di righe mai renderizzate |
| 6c.15 | Con quella selezione: Ctrl+C, poi incollare in un editor | JSON con **tutti** i documenti dell'intervallo, in ordine di indice |
| 6c.16 | Deselect all, poi selezionare ~5 righe sparse con Ctrl+click scrollando | Le righe restano evidenziate tornando indietro; il contatore è corretto |
| 6c.17 | Selezione multipla → Delete (o tasto Del) | Chiede conferma con il numero giusto e cancella tutti i documenti scelti |
| 6c.18 | Tasto destro su una riga in mezzo alla lista scrollata | Menu contestuale sul documento giusto (View/Edit aprono quello, non il primo della pagina) |
| 6c.19 | Selezionare 1 riga scrollati, F3 e Ctrl+J | Aprono view/edit del documento selezionato |

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

## 7b. Test: Bulk field edit

Selezionare più documenti in `testdb.users`:

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 7b.1 | Nessuna selezione | Il bottone "Edit field" non c'è (la barra compare solo con selezione) |
| 7b.2 | Selezione + Edit field | Modale con Set/Rename/Unset e il conteggio dei documenti |
| 7b.3 | Set `city` = `Milano` (String) | Preview mostra `{"$set": {"city": "Milano"}}`; conferma e i documenti si aggiornano |
| 7b.4 | Set con tipo Number e valore non numerico | Errore nel modale, Apply disabilitato |
| 7b.5 | Set tipo Date `2026-08-09` | Il campo diventa una data vera (non stringa) |
| 7b.6 | Set tipo JSON `{"a":1}` | Sottodocumento |
| 7b.7 | Rename `city` → `town` | Preview `$rename`; i valori restano per documento |
| 7b.8 | Rename verso lo stesso nome | Errore, Apply disabilitato |
| 7b.9 | Unset `town` | Preview `$unset`, campo rimosso |
| 7b.10 | Campo `_id` in qualsiasi operazione | Rifiutato |
| 7b.11 | Dopo Apply | Toast con quanti documenti aggiornati e lista ricaricata |
| 7b.12 | Connessione read-only | Bottone disabilitato |

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

## 8b. Test: Query history e saved queries

Vale per tre posti: Filter di Documents, Query Terminal, Aggregation Builder. Fare almeno il giro completo su uno e uno spot-check sugli altri due.

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 8b.1 | Run di 3 query diverse → bottone History | Sezione "Recent" con 3 righe, la più recente in cima, con "just now" |
| 8b.2 | Rifare la stessa query e riaprire History | Nessun duplicato: la voce esistente risale in cima |
| 8b.3 | Query con errore di sintassi → History | C'è lo stesso (registrata prima della chiamata, così si può ripescare e correggere) |
| 8b.4 | Click su una voce | La query torna nell'editor / il filtro ripopola il builder e viene rieseguito |
| 8b.5 | Icona 📌 su una voce → dare un nome | Passa in sezione "Saved", bottone diventa "History (1★)" |
| 8b.6 | 📌 su una voce salvata | Riapre il dialog col nome corrente (rename) |
| 8b.7 | Freccia ↓ su una salvata | Torna in "Recent" |
| 8b.8 | Cestino su una salvata | Chiede conferma; su una non salvata elimina diretto |
| 8b.9 | "Save current" senza aver premuto Run | Crea la voce dall'editor corrente e chiede il nome |
| 8b.10 | Cambiare collection e aprire History | Lista vuota — la history è per collection |
| 8b.11 | Riavviare l'app | Recent e Saved ancora lì (`localStorage.queryHistory`) |
| 8b.12 | Fare più di 25 run diversi | Le più vecchie non salvate spariscono, le salvate restano |
| 8b.13 | Due tab sulla stessa collection, run in entrambi | Nessuno dei due azzera la history dell'altro (rilettura da storage prima di ogni scrittura) |
| 8b.14 | Click fuori dal popover / Esc | Si chiude |
| 8b.15 | Aggregation: pipeline con uno stage a JSON rotto → Run → poi ripescarla | Torna identica a com'era scritta, JSON rotto compreso |

---

## 8c. Test: Export

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 8c.1 | Documents → Export | Menu con due gruppi: "Current view" e "Whole collection", 3 formati ciascuno |
| 8c.2 | Filtro attivo + sort + un campo nascosto → Current view → JSON | Dialog nativo con nome tipo `users-filtered-<data>.json`; il file contiene **solo** i doc filtrati, nell'ordine del sort, senza il campo nascosto |
| 8c.3 | Stesso stato → Whole collection → JSON | Tutti i doc, ordine naturale, tutti i campi; nome file senza `-filtered` |
| 8c.4 | Annullare il dialog di salvataggio | Nessun file, nessun alert, nessun errore |
| 8c.5 | Export NDJSON | Una riga JSON per documento, niente parentesi quadre |
| 8c.6 | Export CSV su `users` (campi sparsi: `nickname` solo su alcuni) | Header con l'unione di tutti i campi; celle vuote dove il campo manca, righe non sfasate |
| 8c.7 | CSV con valori contenenti virgole/virgolette/newline | Celle quotate, virgolette raddoppiate; riapribile in un foglio di calcolo |
| 8c.8 | Export di `testdb.logs` (50k doc) in JSON | Completa senza freeze; il file è un array JSON valido (`jq . file > /dev/null`) |
| 8c.9 | Export di una collection vuota, JSON | File con `[]`, non file rotto |
| 8c.10 | Query Terminal senza risultati | Bottone Export disabilitato |
| 8c.11 | Query Terminal con risultati → Export CSV | Esporta le righe mostrate; nome `<collection>-query-<data>.csv` |
| 8c.12 | Aggregation con risultati → Export JSON | Nome `<collection>-aggregation-<data>.json`, contenuto = risultato della pipeline |
| 8c.13 | Alert a fine export | Mostra il numero di documenti e il percorso del file |
| 8c.14 | Export su un percorso non scrivibile (es. `/root/x.json`) | Banner d'errore in vista, niente crash |

---

## 8d. Test: Conferma digitata su drop/clear

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 8d.1 | Sidebar → collection `users` → Drop collection | Dialog con conteggio (`≈200 documents`) e campo "Type `users` to confirm"; bottone Drop disabilitato |
| 8d.2 | Digitare `user` | Ancora disabilitato |
| 8d.3 | Digitare `Users` (maiuscola) | Ancora disabilitato — il match è case-sensitive |
| 8d.4 | Digitare `users` | Drop si abilita; Invio dal campo esegue |
| 8d.5 | Esc dal campo / click fuori / Cancel | Chiude senza fare nulla |
| 8d.6 | Riaprire il dialog dopo una conferma riuscita | Campo vuoto, bottone di nuovo disabilitato |
| 8d.7 | Clear collection su `users` | Stesso flusso; il testo dice che la collection resta e il contenuto no |
| 8d.8 | Drop database `testdb` | Conteggio con collection: `≈50,700 documents in 3 collections`; va digitato `testdb` |
| 8d.9 | Clear database `testdb` | Stesso flusso |
| 8d.10 | Drop su `testdb.logs` (50k) | Il dialog si apre subito: i conteggi sono stimati da metadata, non da un full scan |
| 8d.11 | Staccare Mongo e provare un drop | Il dialog si apre lo stesso, senza riga di conteggio (il fallimento del conteggio non blocca la conferma) |
| 8d.12 | Azioni non distruttive (rename, duplicate) | Nessun campo da digitare |

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
| 9.7 | Editor di stage | È Monaco: colori, parentesi, Ctrl+Space suggerisce `$group`/`$sum`/…, Ctrl+Enter esegue |
| 9.8 | Ctrl+Space dentro una stringa | Suggerisce i campi della collection, sia `status` sia `$status` |
| 9.9 | Cambiare tipo stage con body ancora al template | Il body diventa il template del nuovo stage (`$limit` → `10`) |
| 9.10 | Cambiare tipo stage con body modificato | Il body resta intatto |
| 9.11 | JSON rotto in uno stage | Bordo rosso + messaggio sotto quello stage; Run rifiuta e dice quale stage |
| 9.12 | Frecce su/giù nell'header stage | Riordina; la prima non ha "su", l'ultima non ha "giù" |
| 9.13 | Run su `orders` con `$match`+`$group` | Ogni stage mostra i doc in uscita (es. 500 → 2) |
| 9.14 | Modificare uno stage dopo il Run | I contatori spariscono (appartengono alla pipeline eseguita) |
| 9.15 | Pipeline con `$out` | Lo stage `$out` e i successivi mostrano `—`, non vengono rieseguiti per contare |
| 9.16 | Cambiare tema con l'editor aperto | Gli editor degli stage seguono il tema |

---

## 9b. Test: Schema explorer

Aprire la tab Schema su `testdb.users`:

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 9b.1 | Aprire la tab | Non parte nessun campionamento da solo, messaggio che invita ad analizzare |
| 9b.2 | Analyze con sample 500 | Elenco campi con tipi, percentuale di presenza ed esempi |
| 9b.3 | Campo `nickname` (solo 1 doc su 4 nel seed) | Percentuale bassa e barra corta — si vede che è opzionale |
| 9b.4 | Campo `profile` | Compaiono anche `profile.level` e `profile.bio` |
| 9b.5 | Campo `tags` | Tipo `array`, non viene sceso dentro |
| 9b.6 | Collection con un campo di tipi misti | Due chip colorati con le percentuali |
| 9b.7 | Cambiare sample a 5000 su `logs` (50k) | Campiona di più, tempi accettabili |
| 9b.8 | Cambiare collection e tornare | La tabella si azzera, serve un nuovo Analyze |
| 9b.9 | Collection vuota | "No documents in the sample" |

---

## 9c. Test: Explain plan

Serve un dataset con e senza indici, altrimenti l'explain dice sempre la stessa cosa. Preparare:

```bash
docker exec -i boxy-mongo mongosh <<'EOF'
use testdb
db.users.createIndex({ email: 1 })
db.users.createIndex({ city: 1, age: 1 })
db.orders.createIndex({ status: 1, placedAt: 1 })
db.logs.createIndex({ seq: 1 })
EOF
```

`users` ≈200 doc, `orders` ≈500, `logs` ≈50k.

### Documents — explain del filtro corrente

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 9c.1 | `testdb.users`, nessun filtro → Explain | Si apre "Explain filter · testdb.users", verdetto giallo "Collection scan … Expected with no filter" |
| 9c.2 | Filtro `email = a@x.it` → Run → Explain | Verdetto verde, indice `email_1`, catena `FETCH → IXSCAN`, examined ≈ returned |
| 9c.3 | Filtro `city = Rome` (campo senza indice) su `logs` → Explain | Verdetto rosso "Collection scan", *documents examined* molto più grande di *returned* |
| 9c.4 | Filtro `city = Rome` + sort per `age` DESC → Explain | Compare uno stage `SORT` sopra l'`IXSCAN` di `city_1_age_1` |
| 9c.5 | Nascondere qualche campo (Fields) e rifare Explain | La proiezione arriva al server: nessun errore, eventualmente compare `PROJECTION_*` nel piano |
| 9c.6 | Confronto con la lista | Il namespace nell'header è la collection della tab; l'explain usa lo stesso filtro/sort/campi visibili della lista, non un altro |
| 9c.7 | Filtro che non trova nulla | *returned* 0 e verdetto che conta comunque i documenti letti |
| 9c.8 | Su connessione read-only | Explain funziona lo stesso (è una lettura) |

### Query Terminal — explain della query nell'editor

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 9c.9 | `db.collection("users").find({email:"a@x.it"})` → Explain | Indice `email_1`, verdetto verde |
| 9c.10 | `db.collection("logs").find({message:/errore/})` → Explain | Collection scan, tempi e documenti esaminati alti |
| 9c.11 | `db.collection("users").find({}).toArray()` → Explain | Errore chiaro: "Only a cursor can be explained… leave off .toArray()" |
| 9c.12 | `db.collection("users").findOne({})` → Explain | Stesso errore: non c'è un cursore da spiegare |
| 9c.13 | `db.collection("users").insertOne({x:1})` → Explain | Errore read-only, **e il documento NON viene inserito** (verificare con Run di `find({x:1})`) |
| 9c.14 | `db.collection("orders").aggregate([{$match:{status:"paid"}}])` → Explain | Piano dell'aggregazione, indice `status_1_placedAt_1` |
| 9c.15 | Query con sintassi rotta | Errore JS nel pannello, la modale non resta vuota |

### Aggregation Builder — explain della pipeline

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 9c.16 | `$match {"status":"paid"}` + `$group` → Explain | Catena `$cursor → FETCH → IXSCAN → $group`, `$cursor` rientrato rispetto agli stage |
| 9c.17 | Stesso caso | *returned* è quello dell'ultimo stage (pochi gruppi), *documents examined* quello del cursore (molti) |
| 9c.18 | `$match` su campo non indicizzato | Collection scan segnalato in rosso |
| 9c.19 | Pipeline con uno stage JSON invalido | Il bottone Explain è disabilitato, il tooltip dice quale stage |
| 9c.20 | Pipeline che termina con `$out` | Errore "Cannot explain a pipeline containing $out"; **verificare che la collection di destinazione non sia stata creata** |
| 9c.21 | Pipeline con `$merge` | Stesso rifiuto |

### Modale

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 9c.22 | Aprire la modale | Prima il verdetto, poi le 4 metriche, poi il piano; nessun numero fittizio dove il server non ha risposto (si vede `—`) |
| 9c.23 | "Raw explain output" | Si espande il JSON grezzo, scrollabile |
| 9c.24 | Copy | Toast di conferma, incollando si ottiene il JSON completo |
| 9c.25 | ESC / bottone Close / X | Chiudono solo la modale, non la tab |
| 9c.26 | Alt+Enter con la modale aperta | **Non** riesegue la query dietro |
| 9c.27 | Con la modale aperta, premere Canc o Ctrl+D nella tab Documents | Non succede nulla (le scorciatoie della vista sono sospese) |
| 9c.28 | Cambiare tema con la modale aperta | Verdetto, metriche e piano seguono il tema (verde/giallo/rosso leggibili in tutti e quattro) |
| 9c.29 | Mongo fermo (`docker stop boxy-mongo`) → Explain | Messaggio d'errore nella modale, nessun crash |

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

## 13b. Test: Identità dei nodi in sidebar

Servono **due connessioni verso server diversi con un db dallo stesso nome** (es. due container Mongo, entrambi con `testdb`).

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 13b.1 | Connessione dentro una cartella | Accanto al nome compare il path cartella (📁 `cochise / svil`), troncato con ellissi se stretto |
| 13b.2 | Hover sull'header connessione | Tooltip con `Connection:` / `Folder:` / `Server:` |
| 13b.3 | Server con credenziali nell'URI | Il tooltip mostra `admin@localhost:27017` — **mai** la password |
| 13b.4 | Hover su un database | Tooltip con connessione, cartella, server e `Database:` — i due `testdb` si distinguono |
| 13b.5 | Hover su una collection | Aggiunge `Collection:` |
| 13b.6 | Hover su una collection pinnata | Stesso tooltip completo |
| 13b.7 | Connessione alla radice (nessuna cartella) | Nessun path inline, tooltip senza riga `Folder:` |

---

## 13c. Test: ESC, Alt+Enter, copia/incolla e read-only

### ESC annulla ovunque

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 13c.1 | Esc su ogni modale (connessione, manager, cartella, settings, about, shortcut, utenti, import, CSV, update) | Si chiude |
| 13c.2 | Esc su un dialog di conferma aperto **sopra** un modale | Chiude solo la conferma, il modale resta |
| 13c.3 | Esc durante un import in corso | Non chiude niente (né il modale né quello che sta sotto) |
| 13c.4 | Esc sull'editor documento con modifiche | Chiede "Close without saving?" — stessa strada del bottone Cancel |
| 13c.5 | Esc con la barra Find aperta nell'editor | Chiude prima la Find, un secondo Esc chiude l'editor |
| 13c.6 | Esc su popover Fields / History / menu contestuale / modale Query preview | Si chiudono |

### Command palette (Ctrl+P)

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 13c.28 | Ctrl+P | Si apre con connessioni, db, collection già listate e le azioni |
| 13c.29 | Digitare `usr` | Trova `users` (match a sottosequenza), la migliore in cima |
| 13c.30 | Digitare `f5` | Trova "Refresh tree" per keyword, che non viene mostrata |
| 13c.31 | ↑/↓ | Sposta la selezione, gira in tondo agli estremi |
| 13c.32 | Invio / click | Esegue e chiude; su una collection apre la tab |
| 13c.33 | Ctrl+P mentre si scrive in un campo | Si apre lo stesso |
| 13c.34 | Esc | Chiude senza fare nulla |

### Alt+Enter esegue

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 13c.7 | Documents: Alt+Enter mentre scrivi in un campo del filtro | Esegue la query |
| 13c.8 | Query Terminal e Aggregation: Alt+Enter dentro Monaco e fuori | Esegue |
| 13c.9 | Due tab aperti, Alt+Enter | Esegue **solo** quello a schermo |
| 13c.10 | Invio semplice in un campo | Non esegue (resta il comportamento del campo) |

### Copia / incolla di db e collection

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 13c.11 | Ctrl+C su un database | Toast in basso: `Database "testdb" copied from "<connessione>"`, sparisce da solo |
| 13c.12 | Ctrl+C su una collection | Toast `Collection "testdb.users" copied from "<connessione>"` |
| 13c.13 | Click sul toast | Sparisce subito |
| 13c.14 | Incolla su un'altra connessione | **Prima** chiede conferma con sorgente e destinazione (`From:` / `To:`), poi copia |
| 13c.15 | Annullare quella conferma | Non scrive niente |
| 13c.16 | Incolla sulla stessa connessione | La conferma dice "same connection" |
| 13c.17 | Dopo l'incolla | L'albero della connessione di destinazione si aggiorna da solo: il db/collection nuovo si vede senza premere Refresh |
| 13c.18 | Incolla con nome già esistente | Chiede il nuovo nome come prima, e solo dopo copia |

### Connessioni read-only

| # | Azione | Risultato atteso |
|---|--------|------------------|
| 13c.19 | Spuntare "Read-only" su una connessione e salvare | Badge `RO` accanto al nome in sidebar |
| 13c.20 | Menu contestuale db/collection | Drop, Clear, Rename, Duplicate, Import e Paste disabilitati |
| 13c.21 | Documents | Add e Paste disabilitati con tooltip "This connection is read-only"; Export attivo |
| 13c.22 | Ctrl+D / Ctrl+V / Del in Documents | Non fanno nulla |
| 13c.23 | Query Terminal: `db.collection("users").insertOne({a:1})` | Errore: connessione read-only (bloccato lato main, non solo in UI) |
| 13c.24 | Query Terminal: `db.collection("users").find({})` | Funziona |
| 13c.25 | Copia **da** una connessione read-only verso una scrivibile | Consentito (leggere è permesso) |
| 13c.26 | Copia **verso** una connessione read-only | Rifiutata con errore |
| 13c.27 | Togliere la spunta e risalvare | Tutto torna scrivibile senza riavviare |

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

Coprono `serializeDoc`, `buildFilter`/`detectType`, gli util del renderer e diversi
componenti. La virtualizzazione della lista documenti è coperta su due livelli:
`virtualList.test.ts` per la matematica pura della finestra (quali indici sono
visibili, clamping ai due estremi, lista vuota) e `DocumentsView.test.tsx` per il
windowing vero — jsdom non ha layout, quindi i test montano un finto viewport;
senza di quello il virtualizzatore degrada a "renderizza tutto", che è ciò che
tiene in piedi gli altri test del file. Restano manuali le voci della 6c che
riguardano fluidità e resa visiva.

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
