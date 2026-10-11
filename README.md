# Ironman — app atleta (PWA)

App web installabile che mostra il piano di allenamento e registra le sessioni, **offline-first**.
Parla solo con Supabase usando la chiave pubblica (anon); non c'è nessun segreto qui dentro, quindi
il repository può essere **pubblico**.

## Com'è fatta
- `index.html`, `app.js`, `styles.css` — l'app (vanilla JS, nessun build).
- `sw.js` — service worker: apre offline (precache della shell + libreria).
- `manifest.webmanifest`, `icons/` — installabilità sul telefono.
- `config.js` — URL del progetto Supabase + chiave **anon** (pubblica).
- `vendor/supabase.js` — la libreria `@supabase/supabase-js` v2 (vendorizzata, per l'offline).

## Pubblicare gratis su GitHub Pages
1. Crea un account GitHub (se non ce l'hai) e un nuovo **repository pubblico**, es. `ironman-athlete`.
2. Carica questi file nella radice del repo. O dal sito (Add file → Upload files), oppure con Git:
   ```
   git init && git add . && git commit -m "Ironman athlete PWA"
   git branch -M main
   git remote add origin https://github.com/<utente>/ironman-athlete.git
   git push -u origin main
   ```
3. Nel repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch →
   Branch: `main` / `/ (root)` → Save**. Dopo ~1 minuto esce l'indirizzo
   `https://<utente>.github.io/ironman-athlete/`.

## Collegare il login (una volta)
Nel dashboard Supabase: **Authentication → URL Configuration**
- **Site URL**: `https://<utente>.github.io/ironman-athlete/`
- **Redirect URLs**: aggiungi lo stesso indirizzo.

Poi apri l'indirizzo sul telefono, entra con la tua email (arriva il link, lo apri) e **installa**
l'app (menu del browser → "Aggiungi a schermata Home").

## Sviluppo in locale
`python3 -m http.server 8765` dalla cartella, poi apri `http://localhost:8765/`. Per il login in
locale aggiungi `http://localhost:8765/` ai Redirect URLs di Supabase.
