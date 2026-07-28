# BoxyNoSql su Windows

Guida all'installazione e alla build su Windows.

**Requisiti:** Windows 10 (1809+) o Windows 11, 64-bit. Electron 42 non supporta più Windows 7/8/8.1.

---

## Opzione A — Installer già pronto (consigliata)

1. Scarica `BoxyNoSql Setup 1.0.0.exe` (vedi [Dove trovare l'installer](#dove-trovare-linstaller) più sotto).
2. Doppio click sul file.
3. **Windows SmartScreen mostrerà un avviso**: l'eseguibile non è firmato con un certificato code-signing. Clicca `Ulteriori informazioni` → `Esegui comunque`.
4. L'installer chiede la cartella di destinazione (default: `%LOCALAPPDATA%\Programs\BoxyNoSql`). Installa **per utente**, non richiede permessi di amministratore.
5. Al termine trovi BoxyNoSql nel menu Start.

### Dove trovare l'installer

L'exe viene prodotto dal workflow GitHub Actions `release.yml`, che gira su ogni tag `v*` o su avvio manuale.

Da riga di comando (serve la [GitHub CLI](https://cli.github.com/)):

```powershell
gh run list --workflow release.yml          # trova l'ultimo run
gh run download -n windows-installers -D .  # scarica l'exe nella cartella corrente
```

Oppure dal browser: repo → tab **Actions** → run più recente → sezione **Artifacts** → `windows-installers`.

> Nota: il workflow carica *artifact*, non crea una GitHub Release. Gli artifact scadono dopo 90 giorni e sono scaricabili solo da chi ha accesso al repo. Per un link di download pubblico serve creare una Release: `gh release create v1.0.0 .\BoxyNoSql*.exe`.

---

## Opzione B — Build da sorgente su Windows

### Prerequisiti

- [Node.js 22 LTS](https://nodejs.org/) (include npm)
- [Git per Windows](https://git-scm.com/download/win)

Nessun compilatore C++ necessario: il progetto non ha dipendenze native da compilare.

### Comandi

```powershell
git clone https://github.com/davideginna/BoxyNoSql.git
cd BoxyNoSql
npm ci --legacy-peer-deps
npm run electron:build:win
```

Il flag `--legacy-peer-deps` serve per un conflitto di peer dependency; è lo stesso usato dalla CI.

Output in `release\`:

| File | Cos'è |
|---|---|
| `BoxyNoSql Setup 1.0.0.exe` | installer NSIS |
| `win-unpacked\BoxyNoSql.exe` | app già scompattata, avviabile senza installare |

Per ottenere solo la versione portable, senza generare l'installer:

```powershell
npm run electron:build:dir
```

---

## Opzione C — Build in cloud, senza macchina Windows

Il workflow builda Linux e Windows in parallelo. Puoi lanciarlo da qualsiasi sistema:

```bash
git tag v1.0.0
git push origin v1.0.0     # oppure: gh workflow run release.yml
gh run watch
gh run download -n windows-installers -D ./win
```

Cross-compilare l'installer Windows da Linux in locale è possibile ma richiede Wine (`sudo apt install wine64`) ed è la via più fragile. Meglio A, B o C.

---

## Sviluppo su Windows

⚠️ **`npm run dev` non funziona in cmd.exe o PowerShell.** Lo script usa la sintassi POSIX per le variabili d'ambiente:

```
... && NODE_ENV=development electron .
```

che su cmd fallisce con `'NODE_ENV' non è riconosciuto come comando interno o esterno`.

Due soluzioni:

**1. Usare Git Bash** (installato con Git per Windows) — lo script funziona senza modifiche:

```bash
npm run dev
```

**2. Rendere lo script cross-platform** (fix permanente, da fare nel repo):

```powershell
npm i -D cross-env
```

e in `package.json` sostituire `NODE_ENV=development electron .` con `cross-env NODE_ENV=development electron .`.

In alternativa, avvio manuale in due terminali PowerShell:

```powershell
# terminale 1
npm run build:main
npm run dev:renderer

# terminale 2
$env:NODE_ENV="development"; npm start
```

---

## Dove finiscono i dati

Connessioni e cartelle sono salvate in:

```
%APPDATA%\BoxyNoSql\connections.json
```

(su Linux è `~/.config/BoxyNoSql/connections.json`). Preferenze di interfaccia — tema, larghezza sidebar, colori icone — stanno nel `localStorage` di Electron, dentro la stessa cartella.

Il file contiene le connection string **in chiaro, password incluse**. Trattalo come un file di credenziali: non condividerlo e non metterlo in un repo.

---

## Disinstallazione

Impostazioni → App → App installate → BoxyNoSql → Disinstalla.
In alternativa, `Uninstall BoxyNoSql.exe` nella cartella di installazione.

La disinstallazione **non** rimuove `%APPDATA%\BoxyNoSql`: cancellala a mano se vuoi eliminare anche le connessioni salvate.

---

## Problemi frequenti

| Sintomo | Causa / rimedio |
|---|---|
| SmartScreen blocca l'installer | Exe non firmato → `Ulteriori informazioni` → `Esegui comunque`. Per eliminare l'avviso serve un certificato code-signing EV. |
| L'antivirus mette l'exe in quarantena | Falso positivo comune sugli eseguibili Electron non firmati. Aggiungi un'esclusione o builda da sorgente (Opzione B). |
| `Connection refused` verso `localhost:27017` | MongoDB non è in ascolto. Se gira in Docker Desktop, verifica che la porta sia pubblicata (`-p 27017:27017`). |
| MongoDB gira in WSL2 e l'app non lo vede | Da Windows usa `localhost:27017` se WSL2 fa il forwarding, altrimenti l'IP di WSL (`wsl hostname -I`). |
| `npm ci` fallisce su peer dependency | Manca `--legacy-peer-deps`. |
| Finestra bianca all'avvio | Build del renderer mancante o incompleta: `npm run build` e riavvia. |
