# Buxheti

PWA për menaxhimin e rrogës dhe buxheteve — mobile-first, dark mode, gjithçka në shqip, punon offline
dhe instalohet në ekranin kryesor të iPhone. Të dhënat qëndrojnë vetëm në pajisje (IndexedDB).

Stack: Vite · React 19 · TypeScript · Tailwind v4 · Dexie (IndexedDB) · vite-plugin-pwa (Workbox).

## Komandat

```bash
npm install
npm run dev        # http://localhost:5180 (pa service worker)
npm test           # Vitest
npm run build      # dist/ + sw.js + manifest
npm run preview    # build-i i prodhimit në http://localhost:5181 (me service worker)
node scripts/gen-icons.mjs   # rigjeneron ikonat PNG
```

## Instalimi në iPhone

Service worker-i (offline) dhe Face ID kërkojnë **HTTPS**. Një adresë `http://192.168.x.x` në WiFi
hapet në iPhone, por pa offline dhe pa Face ID.

1. `npm run build` dhe publiko dosjen `dist/` në çdo host statik me HTTPS
   (Netlify, Vercel, Cloudflare Pages, GitHub Pages).
2. Hape adresën në **Safari** në iPhone → butoni Share → **Add to Home Screen**.
3. Hape nga ikona: aplikacioni del në ekran të plotë dhe punon edhe pa internet.

## Arkitektura

- **Paratë në cent (integer)**; formatimi `225,30 €` bëhet vetëm në UI.
- **Bilanci nuk ruhet kurrë** — llogaritet nga ngjarjet:
  `bartja + ndarjet e të hyrave + transferime brenda − jashtë − shpenzime + korrigjime`.
- `src/lib/` — logjikë e pastër, pa React, e testuar (parseri i shënimeve, ndarja, parashikimi,
  limitet, CSV, PDF, PIN, backup).
- `src/db/` — skema Dexie, veprimet (çdo shkrim me shumë tabela është në transaksion), query-t.
- `src/components/` — UI.

| Tabela | Përmbajtja |
|---|---|
| `budgets`, `categories` | zarfet (Shtëpi, Personal…) dhe kategoritë me fjalë kyçe |
| `incomes`, `incomeSplits` | të hyrat dhe ndarja e tyre mes buxheteve |
| `expenses` | shpenzimet (me shënim dhe foto fature opsionale) |
| `transfers`, `adjustments` | transferimet mes buxheteve, korrigjimet e bilancit |
| `recurring`, `limits` | shpenzimet e përsëritura, limitet mujore për kategori |
| `months` | mbyllja e muajit dhe bartja |
| `descriptions` | historiku për sugjerime dhe mësimin e kategorisë |
| `debts` | (skema gati, pa UI ende) |
| `settings` | PIN (hash PBKDF2), Face ID, data e backup-it |

## Siguria — çfarë mbron dhe çfarë jo

- PIN-i ruhet vetëm si hash PBKDF2-SHA256 (150 000 iteracione, kripë e rastësishme);
  pas 5 gabimeve bllokim 30 s, që dyfishohet (max 15 min).
- Face ID përdor WebAuthn (autentifikuesi i platformës, `userVerification: required`) dhe kontrollon
  flamurin UV. Pa server, është **portë lokale**: e mbron aplikacionin nga sytë e të tjerëve, por të
  dhënat në IndexedDB nuk enkriptohen veçmas.
- Backup-i JSON nuk përfshin PIN-in ose Face ID (janë të lidhura me pajisjen). Nëse harron PIN-in,
  e vetmja rrugëdalje është fshirja e të dhënave të faqes — mbaj backup.

## Kufizime të njohura

- Kur një muaj i mbyllur ndryshohet, bartja nuk përditësohet vetë: hape dhe mbylle sërish
  (aplikacioni e tregon këtë me një shirit në krye).
- Shpenzimet e përsëritura shtohen kur hapet aplikacioni (PWA-të në iOS nuk kanë punë në sfond).
- Detyrimet/borxhet dhe sinkronizimi me Supabase nuk janë ndërtuar ende.
