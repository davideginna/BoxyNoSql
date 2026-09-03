# BoxyNoSql su Linux (Ubuntu)

Guida all'installazione, all'aggiornamento e alla build su Linux. Testata su Ubuntu (GNOME); le parti `.deb` valgono per qualunque distro Debian-based, l'AppImage funziona ovunque.

---

## Quale formato scegliere

| | `.deb` | AppImage |
|---|---|---|
| Installazione | `apt`/`dpkg`, richiede sudo | nessuna, si scarica e si lancia |
| Aggiornamento automatico | ❌ no — vedi sotto | ✅ sì, in-place, da dentro l'app |
| Voce nel menu app / dock | ✅ automatica | va creata a mano (una tantum, vedi sotto) |

**Scegli AppImage se vuoi che l'app si aggiorni da sola.** È una limitazione voluta: auto-installare un `.deb` richiederebbe eseguire `pkexec dpkg -i` con privilegi elevati ad ogni update, e non è implementato. Con `.deb` l'app segnala che c'è una versione nuova ma il tasto "Download" apre solo la pagina della release su GitHub.

---

## Opzione A — AppImage (consigliata)

1. Scarica l'ultimo `BoxyNoSql-*.AppImage` dalla [pagina delle release](https://github.com/davideginna/BoxyNoSql/releases/latest):

   ```bash
   mkdir -p ~/Applications
   curl -L -o ~/Applications/BoxyNoSql.AppImage \
     "$(gh release view --repo davideginna/BoxyNoSql --json assets \
        -q '.assets[] | select(.name | endswith(".AppImage")) | .url')"
   chmod +x ~/Applications/BoxyNoSql.AppImage
   ```

   Senza `gh` (GitHub CLI), scarica a mano il file `.AppImage` dal browser e mettilo in `~/Applications/`.

2. Avvia con doppio click o `~/Applications/BoxyNoSql.AppImage`.

3. **Integrazione nel menu app e nella dock** (facoltativa ma comoda — un AppImage da solo non compare cercando fra le "app installate"):

   ```bash
   # icona
   curl -L -o ~/.local/share/icons/boxynosql.png \
     https://raw.githubusercontent.com/davideginna/BoxyNoSql/main/build/icon.png

   # voce menu app
   cat > ~/.local/share/applications/boxynosql.desktop <<EOF
   [Desktop Entry]
   Type=Application
   Name=BoxyNoSql
   Comment=Desktop NoSQL GUI client
   Exec=$HOME/Applications/BoxyNoSql.AppImage --no-sandbox --disable-namespace-sandbox
   Icon=$HOME/.local/share/icons/boxynosql.png
   Terminal=false
   Categories=Development;Database;
   StartupWMClass=BoxyNoSql
   EOF
   chmod +x ~/.local/share/applications/boxynosql.desktop
   update-desktop-database ~/.local/share/applications/
   ```

   Poi cerca "BoxyNoSql" in Attività → tasto destro sull'icona → **Aggiungi ai preferiti** per pinnarla nella dock. Se non compare subito, riavvia GNOME Shell (`Alt+F2` → `r` → Invio, solo su Xorg) o rifai il login.

   L'`Exec=` punta a un percorso fisso (`BoxyNoSql.AppImage`, non `BoxyNoSql-1.6.0.AppImage`): l'auto-update sostituisce il file **in place**, stesso nome, quindi la voce di menu resta valida dopo ogni aggiornamento senza bisogno di rifare questo passaggio.

   I due flag in `Exec=` servono solo per l'avvio da Attività/ricerca di GNOME: quel percorso esegue l'app in uno scope systemd con un profilo AppArmor che nega `CAP_SYS_ADMIN`, il che rompe il sandbox namespace di Chromium e la fa fallire all'avvio. Avviata con doppio click o da terminale l'app non ha questo problema — il sandbox di Chromium funziona da solo — ma i flag qui non fanno danno in nessun caso.

### Aggiornamento (AppImage)

Automatico: l'app controlla da sola all'avvio, scarica e installa al riavvio successivo (o al click su "Installa" nel banner). Nessun comando manuale necessario.

---

## Opzione B — pacchetto `.deb`

```bash
curl -L -o boxynosql.deb \
  "$(gh release view --repo davideginna/BoxyNoSql --json assets \
     -q '.assets[] | select(.name | endswith("_amd64.deb")) | .url')"
sudo apt install ./boxynosql.deb
```

Compare da solo nel menu app (electron-builder genera il `.desktop` e l'icona). Nessun passaggio ulteriore.

### Aggiornamento (`.deb`)

**Non automatico.** Quando l'app segnala una nuova versione, o periodicamente a mano:

```bash
curl -L -o boxynosql.deb \
  "$(gh release view --repo davideginna/BoxyNoSql --json assets \
     -q '.assets[] | select(.name | endswith("_amd64.deb")) | .url')"
sudo apt install ./boxynosql.deb    # aggiorna in place, stessa procedura dell'installazione
```

Le connessioni salvate (`~/.config/BoxyNoSql/`) non vengono toccate da un aggiornamento del pacchetto.

### Passare da `.deb` ad AppImage

```bash
sudo apt remove boxynosql
```

Le connessioni salvate restano (non sono nel pacchetto). Poi segui l'Opzione A.

---

## Opzione C — build da sorgente

### Prerequisiti

- Node.js 22 LTS + npm
- Git

Nessuna dipendenza nativa da compilare.

### Comandi

```bash
git clone https://github.com/davideginna/BoxyNoSql.git
cd BoxyNoSql
npm ci --legacy-peer-deps
npm run electron:build:linux   # .deb + AppImage in release/
```

`--legacy-peer-deps` per un conflitto di peer dependency, stesso flag usato dalla CI.

Solo la versione scompattata, senza generare i pacchetti:

```bash
npm run electron:build:dir
```

---

## Dove finiscono i dati

```
~/.config/BoxyNoSql/connections.json
```

Preferenze di interfaccia (tema, larghezza sidebar, colori icone) stanno nel `localStorage` di Electron, dentro la stessa cartella.

Il file contiene le connection string **in chiaro, password incluse**. Trattalo come un file di credenziali: non condividerlo e non metterlo in un repo.

---

## Disinstallazione

**`.deb`:**

```bash
sudo apt remove boxynosql
```

**AppImage:**

```bash
rm ~/Applications/BoxyNoSql.AppImage
rm ~/.local/share/applications/boxynosql.desktop
rm ~/.local/share/icons/boxynosql.png
```

In nessuno dei due casi viene rimossa `~/.config/BoxyNoSql/`: cancellala a mano se vuoi eliminare anche le connessioni salvate.

---

## Problemi frequenti

| Sintomo | Causa / rimedio |
|---|---|
| L'AppImage non compare cercando fra le app installate | Un AppImage nudo non si integra col menu da solo — serve il `.desktop` (vedi Opzione A, passo 3). |
| Doppio click sull'AppImage non fa nulla | Manca il permesso di esecuzione: `chmod +x BoxyNoSql*.AppImage`. |
| `.deb`: "Download" nel banner update apre solo il browser | Comportamento voluto — vedi tabella in cima. Passa ad AppImage se vuoi l'update automatico. |
| `Connection refused` verso `localhost:27017` | MongoDB non è in ascolto. Se gira in Docker, verifica che la porta sia pubblicata (`-p 27017:27017`). |
| `npm ci` fallisce su peer dependency | Manca `--legacy-peer-deps`. |
| Finestra bianca all'avvio (build da sorgente) | Build del renderer mancante o incompleta: `npm run build` e riavvia. |
