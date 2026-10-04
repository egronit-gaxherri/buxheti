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

## Instalimi në iPhone nga Mac-u (pa publikim)

Aplikacioni shërbehet me HTTPS nga Mac-u në WiFi. Pas instalimit punon offline edhe kur Mac-u është i fikur;
Mac-u duhet vetëm për instalimin dhe për përditësime.

Një herë në Mac:
```bash
brew install mkcert
mkdir -p certs && mkcert -cert-file certs/iphone.pem -key-file certs/iphone-key.pem "$(scutil --get LocalHostName).local" localhost 127.0.0.1
```
Nis serverin (edhe për çdo përditësim):
```bash
npm run iphone        # https://<emri-i-mac-ut>.local:5443
```
Në iPhone, një herë: instalo dhe beso certifikatën rrënjë të mkcert (`$(mkcert -CAROOT)/rootCA.pem` — **kurrë**
`rootCA-key.pem`), hap adresën në Safari → Share → Add to Home Screen. Përdore vetëm nga ikona: të dhënat
e ikonës janë të ndara nga ato të Safari-t. Emri i Mac-ut (`.local`) nuk duhet ndryshuar, se ndryshon adresa
dhe aplikacioni nis bosh — mbaj backup.

## Instalimi në iPhone me publikim

Service worker-i (offline) dhe Face ID kërkojnë **HTTPS**. Një adresë `http://192.168.x.x` në WiFi
hapet në iPhone, por pa offline dhe pa Face ID.

1. `npm run build` dhe publiko dosjen `dist/` në çdo host statik me HTTPS
   (Netlify, Vercel, Cloudflare Pages, GitHub Pages).
2. Hape adresën në **Safari** në iPhone → butoni Share → **Add to Home Screen**.
3. Hape nga ikona: aplikacioni del në ekran të plotë dhe punon edhe pa internet.

## Sinkronizimi me familjen (Supabase)

Opsional. Buxheti **Shtëpi** ndahet me familjarët: secili shton shpenzime nga telefoni i vet dhe të gjithë
shohin të njëjtën mbetje. **Personal, borxhet, limitet dhe fotot e faturave nuk largohen kurrë nga telefoni.**

- Konfigurimi: kopjo `.env.example` te `.env.local` (URL + publishable key i projektit) dhe ndërto sërish.
  Pa këto, aplikacioni punon plotësisht offline dhe ekrani "Familja" thjesht e tregon këtë.
- Skema e serverit: `supabase/migrations/` (aplikuar te projekti `buxheti`, eu-central-1).
- Në aplikacion: **Më shumë → Familja & sinkronizimi** → "Krijo familjen" në telefonin e parë,
  pastaj "Bashkohu me kod" në të tjerët.

Si funksionon:
- Pa llogari/email. Çdo pajisje merr një **token sekret** kur krijon familjen ose bashkohet me kodin e ftesës;
  serveri ruan vetëm hash-in SHA-256. Tabelat janë të mbyllura me RLS — qasja vetëm përmes funksioneve
  `create_household`, `join_household`, `household_info`, `rotate_join_code`, `remove_member`, `sync_push`,
  `sync_pull`, që e verifikojnë tokenin.
- **Offline-first**: çdo ndryshim ruhet lokalisht menjëherë; sinkronizimi bëhet në sfond (pas ndryshimit,
  kur hapet aplikacioni, kur kthehet interneti, çdo 30 s kur është i hapur).
- Motori (`src/sync/`) krahason çdo rekord të përbashkët me hash-in e sinkronizimit të fundit, ngarkon
  ndryshimet (fshirjet si "gurë varri") dhe shkarkon ato të të tjerëve. Konflikt: fiton i fundit që ngarkon.
- Kur bashkohesh, "Shtëpi", kategoritë dhe personat me të njëjtin emër lidhen me ato të familjes,
  bashkë me shpenzimet e tyre.
- Te të tjerët, rroga jote shfaqet vetëm me pjesën që shkon në Shtëpi, me emrin tënd.
- Kur largohet anëtari i fundit, familja dhe të dhënat e saj fshihen nga serveri.
- Test kundër serverit të vërtetë: `SUPABASE_E2E=1 npx vitest run src/sync/e2e.test.ts`.

## Arkitektura

- **Paratë në cent (integer)**; formatimi `225,30 €` bëhet vetëm në UI.
- **Bilanci nuk ruhet kurrë** — llogaritet nga ngjarjet:
  `bartja + ndarjet e të hyrave + transferime brenda − jashtë − shpenzime + korrigjime`.
- `src/lib/` — logjikë e pastër, pa React, e testuar (parseri i shënimeve, ndarja, parashikimi,
  limitet, qëllimet, vëzhgimet automatike, CSV, PDF, PIN, backup).
- `src/db/` — skema Dexie, veprimet (çdo shkrim me shumë tabela është në transaksion), query-t.
- `src/components/` — UI.

| Tabela | Përmbajtja |
|---|---|
| `budgets`, `categories` | zarfet (Shtëpi, Personal…) dhe kategoritë me fjalë kyçe |
| `people` | personat që japin para (Edi, mami…) |
| `incomes`, `incomeSplits` | të hyrat (kush i dha) dhe ndarja e tyre mes buxheteve |
| `expenses` | shpenzimet (me shënim dhe foto fature opsionale) |
| `transfers`, `adjustments` | transferimet mes buxheteve; korrigjimet e bilancit dhe lëvizjet e borxheve |
| `recurring`, `limits` | shpenzimet e përsëritura, limitet mujore për kategori |
| `months` | mbyllja e muajit dhe bartja |
| `descriptions` | historiku për sugjerime dhe mësimin e kategorisë |
| `debts` | borxhet (kush i ka borxh kujt, afati) me pagesat e tyre |
| `goals` | qëllimet e kursimit, kontributet dhe kursimi automatik mujor |
| `settings` | PIN (hash PBKDF2), Face ID, data e backup-it, identiteti në familje |
| `syncState` | hash-i i çdo rekordi të përbashkët në sinkronizimin e fundit |

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
- Ndryshimet nga familja vijnë brenda ~30 s (ose menjëherë me "Sinkronizo tani"); s'ka njoftime push.
- Bartja e muajit sinkronizohet, por mbyllja e muajit (shiriti "i mbyllur") është për çdo telefon veç.
