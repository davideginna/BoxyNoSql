# WIP — stato al 2026-07-29

Tutto **non committato**, working tree sporco. `npm test` = 9 file / 139 test verdi.

## Fatto

- **Roadmap** in `README.md` (18 voci, 3 gruppi).
- **Niente chiusura al click fuori** su ConnectionManager / Connection / FolderEdit / ImportConnections.
- **Connection string**: bottone Copy + breakdown in campi (user, password, host+port, replica set, ecc.), sbloccabili con "Edit fields", che da lì diventano la fonte di verità. Nuovo `src/renderer/utils/mongoUri.ts`.
- **Breakdown a sub-tab** Server / Auth / Options + 15 opzioni con campo proprio, booleani a tre stati (unset ≠ false), residuo raw in "Other options". Errore di validazione visibile anche da un tab non attivo.
- **Numeri di riga** nell'editor documenti (edit + add), switch in header, gutter come elemento fratello della textarea → strutturalmente non selezionabile né copiabile. Pref in `localStorage.docLineNumbers`.
- **Contrasto tab**: la regola catch-all `button:not(...)` in `index.css` (specificità ~0,18,1) catturava `.tab`; aggiunto `:not(.tab)` e `:not(.conn-subtab)`. Ora ≥5:1 su tutti e quattro i temi, hc ≥11.7:1.
- **Appearance**: paragrafo intro appiccicato a "Database icon" → nuova classe `.modal-intro` (il reset globale `* { margin: 0 }` azzerava il margine).

## Da fare — dialog di errore (richiesta: copia log + lista codici + sezione espandibile)

Esplorazione già fatta, niente codice scritto ancora.

**Punti di aggancio:**
- `src/renderer/dialog.ts` — `ConfirmOpts { title, message, danger, confirmText, hideCancel, detail }`. `showAlert` = confirm con `hideCancel`.
- `src/renderer/components/DialogModal.tsx` — `detail` oggi è un `<p>` mono sempre visibile, non collassabile, non copiabile.
- Chiamanti errore: `App.tsx:187`, `:200`, `:277`, `:386`, `:495`; `ConnectionManagerModal.tsx:85`.
- Versione app: IPC `get-app-info` (`main.ts:190`), già usata da `AboutModal.tsx:31`.

**Piano:**

1. **`src/main/main.ts` — bloccante, va fatto per primo.** Oggi i catch fanno `return { success: false, error: e.message }` (`main.ts:316`, `:338`). `e.message` **butta via i codici**: `code`, `codeName`, `errno`, `syscall`, `name`, stack. Senza questo la "lista di codici" non ha dati da mostrare. Serve un serializzatore errori nel main (accanto a `serialize.ts`) e cambiare i return in `{ success: false, error: serializeError(e) }` in **tutti** gli handler, non solo i due. Attenzione: è un cambio di forma al confine IPC — i chiamanti nel renderer che fanno `result.error` come stringa vanno aggiornati.
2. **`src/renderer/utils/errorReport.ts`** (nuovo, unit-testabile come gli altri utils): normalizza un errore in `{ codes: string[], report: string }`. `codes` = chip corti (`MongoServerError`, `code 13`, `Unauthorized`, `ECONNREFUSED`). `report` = blocco markdown pronto per una issue: versione app, piattaforma, `navigator.userAgent`, timestamp, titolo, messaggio, codici, stack.
3. **`dialog.ts`**: aggiungere `error?: unknown` a `ConfirmOpts`.
4. **`DialogModal.tsx`**: riga di chip con i codici; sezione "Error log" collassabile (default chiusa) con il testo in mono, scrollabile e selezionabile; bottone "Copy report" nel footer. **Ctrl+C**: se c'è una selezione di testo lascia fare al browser, solo se non c'è copia tutto il report — altrimenti rubi il copia normale.
5. **Chiamanti**: passare l'errore catturato a `showAlert`.
6. **Test**: `errorReport.test.ts` (estrazione codici da MongoServerError / errore di rete / stringa nuda / `null`) + test componente su DialogModal (chip presenti, sezione espande, copy scrive nella clipboard) sul modello di `ConnectionModal.test.tsx`.

**Regole da rispettare** (`CLAUDE.md`): mai colori hardcoded, icone solo da `Icon.tsx`, il renderer non importa `electron`. La regola catch-all dei bottoni in `index.css` colpirà ogni `<button>` nuovo: dargli `.secondary`/`.icon-btn` o aggiungerlo alla catena `:not()`.

## Verifiche

`npx tsc -p tsconfig.json` → unico errore accettabile, **pre-esistente**:
`src/renderer/components/Sidebar.tsx(3,21): Cannot find module '../../assets/img/logo.svg?url'` (manca un `vite-env.d.ts` nel repo).

`npm test` e `npm run build` devono restare verdi.

## Nota

`@testing-library/dom` aggiunto come devDependency: `@testing-library/react` c'era ma il peer no (CI usa `--legacy-peer-deps`), qualsiasi test di componente crashava. `package.json` + `package-lock.json` modificati.
