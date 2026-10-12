# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentation status

All prose docs were rewritten in `2dc99cd` and are broadly accurate, **but they predate the
card / learn / test / spell exercises and Google TTS.** When a doc disagrees with the code,
the code wins.

| File | Status |
| --- | --- |
| `README.md` | Setup, local run, deploy: current. **Stale:** calls `write` the only working study mode; routes table lacks `card`/`learn`/`test`/`spell`. |
| `backend/README.md` | Project-specific and mostly current. **Stale:** no `src/tts/`, no `TtsAudio` model, env table lacks `TTS_VOICE_*`. |
| `frontend/PROJECT_OVERVIEW.md`, `COMPONENTS.md`, `QUICK_START.md` | Auth, API, theming: current. **Stale:** describe every mode except `write` as a stub; no TTS, `hooks/`, or `MobileTextField`. |
| `frontend/RESPONSIVE.md` | Current. |
| `docs/google-tts.md` | Current. The reference for TTS setup and behaviour. |

## Repository shape

Three independent npm projects plus Postgres. **There are no npm workspaces**: the root
`package.json` only orchestrates test runs via `npm --prefix`. Each project has its own
`package-lock.json` and needs its own `npm install`.

| Project | Stack | Port | Talks to |
| --- | --- | --- | --- |
| `frontend/` | Next.js 16 (App Router), React 19, Tailwind 4 + DaisyUI 5 | 3000 | backend |
| `backend/` | NestJS 11, Prisma 6, JWT/Passport | 3001 | Postgres, dictionary-service, Google Cloud TTS |
| `dictionary-service/` | NestJS 11 + cheerio; stateless, no DB, no auth | 4000 | Cambridge / Oxford (scraped HTML) |

`backend/` is the only service that touches Postgres. `dictionary-service/` is
internal-only (`expose`d, never published, even in dev compose) and serves just
`GET /health` and `GET /internal/lookup?word=&source=`.

Compose files: `docker-compose.yml` (dev), `docker-compose.production.yml` (prod, behind
nginx), and `docker-compose.tts.yml`, an optional **overlay** that mounts Google
credentials into the backend.

## Commands

### Root

```bash
npm test           # backend → dictionary-service → frontend, sequential
                   # (each also runnable alone: test:backend / test:dictionary / test:frontend)
npm run test:e2e   # frontend Playwright suite
```

### Backend (Jest, `.spec.ts` colocated under `src/`)

```bash
npm --prefix backend run start:dev
npm --prefix backend run build
npm --prefix backend run lint            # eslint --fix (rewrites files)
npm --prefix backend run test:cov
npm --prefix backend run test:e2e        # separate config: test/jest-e2e.json

npm --prefix backend test -- dictcards.service   # single file (path regex)
npm --prefix backend test -- -t "test name"       # single test
```

Swagger UI: `http://localhost:3001/api/docs` (JSON at `/api/docs-json`).

### dictionary-service (Jest)

Only `build`, `start`, `start:dev`, `start:prod`, and `test` exist. There is **no lint,
coverage, or e2e script, and no ESLint config.**

### Frontend (Vitest + jsdom for unit, Playwright for e2e)

```bash
npm --prefix frontend run dev
npm --prefix frontend run build                   # also the only type-check
npm --prefix frontend run test:watch

npm --prefix frontend test -- lib/api.spec.ts     # single file
npm --prefix frontend test -- -t "test name"      # single test

cd frontend && npx playwright test e2e/login.spec.ts --project=chromium
npm --prefix frontend run test:e2e:responsive     # layout suite, see below
```

- **`npm run lint` is broken.** It runs `next lint`, which Next 16 removed, and the frontend
  has no ESLint config. CI does not lint.
- `playwright.config.ts` (`e2e/`) starts `npm run dev` on :3000 itself and runs
  chromium/firefox/webkit.
- `playwright.responsive.config.ts` (`responsive/`) needs **no backend**. It starts a fixture
  API (`responsive/api.mjs`) on :3101 and Next on :3100 pointed at it, then runs 8 viewport
  projects (320px phone to 1440px desktop, two on WebKit). Stop any other `next dev` in this
  checkout first, because they share `.next/`. Neither the root scripts nor CI run it.

### Prisma

```bash
cd backend
npx prisma generate                    # required after ANY schema.prisma edit
npx prisma migrate dev --name <name>   # local
npx prisma migrate deploy              # CI / production
```

### Docker

- `docker compose up -d` starts the **whole** dev stack: postgres, backend,
  dictionary-service, frontend, pgadmin (:5050).
- The `backend` service declares `env_file: ./backend/.env`, and compose fails outright if
  that file is missing. It is gitignored with no example file; the template lives in
  `README.md`. Only root `.env.example` and `.env.production.example` are tracked.
- With TTS: `docker compose -f docker-compose.yml -f docker-compose.tts.yml up -d`, with
  `TTS_CREDENTIALS_FILE` set to an absolute path to a service-account JSON **outside the
  repo**. The overlay refuses to interpolate without it. Without the overlay, everything
  still runs and uncached TTS requests return 502.

## Architecture

### Auth: the token is stored twice

This is the single most confusing part of the codebase.

- The backend issues a JWT with a **60-minute** expiry (`backend/src/auth/auth.module.ts`).
  An unset `JWT_SECRET` silently falls back to a hard-coded dev secret.
- The frontend persists it in **two** places:
  - `localStorage.token` / `localStorage.user`, used by client-side fetches.
  - A **non-httpOnly, non-Secure `token` cookie** with `max-age=3600`. It is the only way
    Server Components can see the token, via `getServerAuthToken()` in
    `frontend/lib/server-auth.ts`.
- `persistAuthSession()` and `clearAuthSession()` in `frontend/lib/auth.ts` are the only
  functions that should ever write both.
- `syncAuthCookieFromStorage()` reconciles them **one way only**: localStorage is the source
  of truth, and the cookie is never copied back into it. `AuthSessionSync` (root layout)
  runs it **once on mount** and calls `router.refresh()` if the cookie changed.
- Server Components read the cookie and pass `{ token }` **explicitly** into `lib/api.ts`
  calls. Client callers omit it and fall back to localStorage inside the private
  `resolveAuthToken()`.

**Known-broken territory:** the cookie `max-age` and the JWT `exp` drift independently, so
sessions can go stale. A fix (`2e66121`, which introduced `frontend/lib/auth-token.ts`) was
reverted wholesale in `c1f22d8` and has not been re-attempted. Read `git show 2e66121`
before trying again.

Google OAuth is **hand-rolled** in `backend/src/auth/auth.controller.ts` (the code exchange
is a raw `fetch` in `auth.service.ts`); there is no passport-google strategy.
`/auth/google` builds the consent URL by hand. `/auth/google/callback` exchanges the code
and redirects to the frontend `/auth/callback` with `access_token`, `id`, `username`, and
`email` **in the query string**.

### API base-URL duality

`frontend/lib/api.ts` picks its base URL per environment:

- `INTERNAL_API_URL` when `typeof window === "undefined"` (Server Components → `http://backend:3001`)
- `NEXT_PUBLIC_API_URL` in the browser

`INTERNAL_API_URL` falls back to `NEXT_PUBLIC_API_URL`, which falls back to
`http://localhost:3001`. URLs the **browser** will load (`login()`, `register()`, the
Google auth URL, dictionary audio) always use the public URL via `getPublicApiUrl()`.

`NEXT_PUBLIC_API_URL` is baked in at Docker **build** time, so changing it requires an image
rebuild. CD refuses to publish the frontend unless it equals `https://$API_HOST`.

### Dictionary lookup path

Spans all three services:

1. `lookupDictionary()` (`frontend/lib/api.ts`) attaches `source` from localStorage
   `preferred-dictionary-source` (`cambridge` by default, or `oxford`). Failures throw
   `AudioRequestError(status)`.
2. Backend `GET /dictionary/lookup`, JWT-guarded.
3. `DictionaryService.lookup()` (`backend/src/dictionary/dictionary.service.ts`) checks the
   `DictionaryEntry` cache, unique on `(normalizedWord, dictionarySource)`. The TTL comes
   from `DICTIONARY_CACHE_TTL_DAYS` (default 30; a value ≤ 0 means entries never expire).
4. On a miss it calls `${DICTIONARY_SERVICE_URL}/internal/lookup`, which scrapes **only the
   selected** source with cheerio.
5. `materializeAudioUrl()` rewrites upstream audio URLs into `DictionaryAudio` rows keyed by
   `sha256(sourceUrl).slice(0, 24)` and returns them to the client as `/dictionary/audio/:id`.

`GET /dictionary/audio/:id` is deliberately **not** JWT-guarded, because an `<audio>`
element cannot send an `Authorization` header. It proxies the upstream file through the
backend.

### Pronunciation and Google TTS

All playback goes through `PronunciationSession.play()` (`frontend/lib/pronunciation.ts`),
used via `usePronunciation()` (`frontend/hooks/usePronunciation.ts`). The fallback chain:

1. Dictionary audio (via `lookupDictionary()`) in the requested accent.
2. The other accent.
3. `POST /tts` via `synthesizeSpeech()`, always in the requested accent.

There is **no** browser `speechSynthesis` fallback. Only one clip plays app-wide; starting
a clip stops the active one. Autoplay blocks (`NotAllowedError`) and 401/403 errors are
shown to the user rather than skipped over.

| Mode | Steps | Used by |
| --- | --- | --- |
| `dictionary` | 1 → 2 → 3 | Card, Spell (autoplay) |
| `exact` | 1 → 3 | `PronunciationButton` (UK/US buttons on the module page) |
| `speech` | 3 only | Learn, Test |

Backend `backend/src/tts/` serves `POST /tts` with body `{ text, variant: "uk" | "us" }`:

- JWT-guarded. That works here because the frontend `fetch`es the audio with a bearer token
  and plays it from a Blob URL, unlike `/dictionary/audio/:id`.
- `TtsService` validates the body **by hand** (no DTO): trimmed text of 1–4000 UTF-8 bytes.
- Calls `@google-cloud/text-to-speech` with Application Default Credentials. Voices are
  `en-GB-` / `en-US-Chirp3-HD-Achernar`, overridable via `TTS_VOICE_UK` / `TTS_VOICE_US`.
- Audio is cached **forever** in `TtsAudio`, keyed by the sha256 of the whole request JSON
  (text, voice, and audio config), so changing a voice creates new rows. Concurrent
  identical requests are coalesced.
- Missing credentials do **not** fail boot. Uncached requests then return **502**, and a
  502 is never cached.
- Rate limit: 60 requests per user per minute, kept **in process memory**. It is checked
  before validation and before the cache, so cache hits count too.

TTS only supplies audio. It never fills in definitions.

### Study modes

`ModuleStudyModes.tsx` links five modes:

| Mode | What it does |
| --- | --- |
| `card` | Flip cards and rate «Знаю» / «Ещё изучаю». Keys: Space, ←, →, Backspace (undo). |
| `learn` | Rounds of 7, each term needs 3 correct answers. Multiple choice (≥ 4 terms), then written. |
| `test` | Configurable true/false, choice, matching, and written questions, scored at the end. |
| `write` | Shows the definition; you type the term. Wrong terms repeat next round. |
| `spell` | Plays the term; you type it. Rounds of 7, 2 correct each. A wrong answer shows a character diff and must be retyped. |

Every mode has the same shape:

- **Page** `app/module/[id]/<mode>/page.tsx`: an async Server Component. It calls
  `getServerAuthToken()` and redirects to `/login?redirect=/module/<id>/<mode>` if there is
  no token. Then `getModule(id, { token })`, with `notFound()` on null. Then it renders
  `<ModeExercise moduleId moduleTitle terms />`.
- **Logic** `lib/<mode>-exercise.ts`: pure functions over a state object that import only
  the `Term` type. An action returns a new state, or the same state when the action isn't
  allowed. Unit-test logic here.
- **UI** `components/<Mode>Exercise.tsx`: `"use client"`, using `useState` and
  `setState(s => fn(s))`.
- **Progress** lives only in `sessionStorage` under `dictcards:<mode>:<moduleId>` as
  `{ version: 1, fingerprint, state }`. The fingerprint is built from the terms'
  `{ id, term, definition }`. A version or fingerprint mismatch, or a failed validation,
  discards the saved session. No progress reaches the backend.
- **Randomness:** every shuffle takes `random: () => number = Math.random`. Specs pass stubs
  such as `() => 0`.

**There are no shared helpers.** The Fisher–Yates shuffle, the fingerprint function,
`isRecord`, and `SpeakerIcon` are copied into each mode. Answer normalization **differs**:
`write` uses `trim().toLowerCase()`, while learn/spell/test also collapse inner whitespace.

To add a mode, add its link in `ModuleStudyModes.tsx` **and** extend the route regex in
`components/layout/MainLayout.tsx`. That regex applies the `study-shell` class, which hides
the header and drawer below 1280px.

### Module authorization

`moduleAccessWhere()` in `backend/src/dictcards/dictcards.service.ts` scopes every read
and write to:

```
userId = user.userId  OR  (userId IS NULL AND author = user.username)
```

The second branch is a legacy path for modules created before `Module.userId` existed. A
missing *or* foreign module throws **404, never 403**.

`update()` runs in a transaction. **Only when the PATCH includes `terms`**, it deletes and
recreates all of them, which has three consequences:
- Term IDs are not stable across saves.
- Order is stored in `Term.position`, set from the array index.
- `isFavorite` is **not** carried over, so it resets to `false`.

### Silent-failure convention

- `getModules()` returns `[]` on a missing token or a 401/403 and **throws** on other errors.
- `getModule()` returns `null` on a missing token **or any non-OK status**, 404 and 500
  alike. Pages turn that `null` into `notFound()`, so a backend 500 renders as a 404 page.

Check this before debugging "why is my list empty" or "why is this a 404".

### Backend bootstrap and config

- `backend/src/main.ts` sets no global route prefix and **no `ValidationPipe`**.
  `class-validator` is not installed, and DTOs carry only Swagger decorators, so request
  bodies are **not validated at runtime**.
- CORS allows only `FRONTEND_URL` (default `http://localhost:3000`).
- Swagger is mounted unconditionally, production included.
- Config is read straight from `process.env`. There is no `@nestjs/config`.

| Var | Default | Used for |
| --- | --- | --- |
| `DATABASE_URL` | none (required) | Prisma |
| `JWT_SECRET` | hard-coded dev value | JWT signing |
| `FRONTEND_URL` | `http://localhost:3000` | CORS and OAuth redirect target |
| `GOOGLE_CLIENT_ID` / `_SECRET` | none (OAuth returns 500 if unset) | Google OAuth |
| `GOOGLE_CALLBACK_URL` | `http://localhost:3001/auth/google/callback` | Google OAuth |
| `DICTIONARY_SERVICE_URL` | `http://localhost:4000` | reaching dictionary-service |
| `DICTIONARY_CACHE_TTL_DAYS` | `30` | dictionary cache TTL |
| `DICTIONARY_BACKEND_TIMEOUT_MS` | `9000` | backend → dictionary-service timeout |
| `TTS_VOICE_UK` / `TTS_VOICE_US` | `en-GB-` / `en-US-Chirp3-HD-Achernar` | TTS voices |
| `GOOGLE_APPLICATION_CREDENTIALS` | ADC lookup | TTS; set by the TTS overlay |

dictionary-service reads `PORT` (4000), `DICTIONARY_TIMEOUT_MS` (6000), and
`DICTIONARY_USER_AGENT`.

## Conventions

- **All user-facing UI text is Russian.** Keep new strings Russian. The one exception is the
  study-mode names, which appear as lowercase English (`card`, `learn`, `test`, `write`,
  `spell`) on buttons and exercise headers. Code comments are mixed Russian/English.
- **Theming:** four DaisyUI themes are defined in `frontend/app/globals.css`: `dark-classic`
  (the default, also hard-coded in the SSR HTML), `light-classic`, `light`, and `dark`.
  `ThemeSync` applies the theme as `data-theme` on `<html>`.
  - Components combine DaisyUI classes with 26 `--app-*` custom properties
    (`--app-panel`, `--app-border`, `--app-text-strong`, `--app-focus`, `--app-field-*`, …).
    Follow that pattern and do not introduce raw hex values.
  - `--app-header-height` is a layout value, not a colour. It is set per breakpoint and is
    `0` inside `.study-shell` and `.editor-shell`.
- **Mobile inputs:** use `MobileTextField` for long single-line editor fields (module title,
  term, definition). It renders an `<input>` at ≥ 640px and, below that, an auto-growing
  `<textarea>` that strips newlines. Exercise answer fields stay plain
  `<input autoCapitalize="none">`.
- **Tests:** frontend specs are `.spec.ts(x)` colocated beside the file under test.
  `frontend/test/setup.ts` clears localStorage, sessionStorage, the token cookie, and the
  theme attribute after every test. Backend and dictionary-service specs are `.spec.ts`
  colocated under `src/` (`rootDir: src`).

### Browser storage keys

| Key | Store | Written by |
| --- | --- | --- |
| `token`, `user` | localStorage | `persistAuthSession()` (together with the `token` cookie) |
| `preferred-theme` | localStorage | `frontend/lib/theme.ts` |
| `preferred-dictionary-source` | localStorage | settings page (`cambridge` \| `oxford`) |
| `preferred-pronunciation-variant` | localStorage | settings page (`uk` \| `us`, default `uk`) |
| `dictcards:<mode>:<moduleId>` | sessionStorage | exercise components |

## Known gaps

- **`POST /upload`** (`backend/src/uploads/uploads.controller.ts`) has **no auth guard**, no
  file-type or size validation, and returns 500 when no file is sent. Files land in
  `uploads/` under the backend's working directory and are served statically at `/uploads`
  via `ServeStaticModule`.
- **Swagger (`/api/docs`) is public in production.** nginx proxies all of `API_HOST` to the
  backend.
- **`scripts/deploy-production.sh` ignores the TTS overlay.** It passes only
  `-f docker-compose.production.yml`, so a scripted deploy recreates the backend **without**
  Google credentials. If TTS is in use, follow up with the two-file command in
  `docs/google-tts.md`.
- **`isFavorite` resets** on every module save that includes terms (see Module authorization).
- **No request-body validation** anywhere in the backend (see Backend bootstrap and config).
- Frontend `lint` is broken (see Commands).
- The TTS rate limit lives in process memory. It resets on restart and is not shared across
  replicas.
- `frontend/lib/mockData.ts` is **dead code**. Only its own spec file references it.

## CI/CD

`.github/workflows/ci.yml` runs on push, pull request, and manual dispatch:

1. Matrix job: backend / dictionary-service / frontend, each install → build → test. The
   backend job also runs `prisma generate` and validates that Prisma survives `--omit=dev`.
2. `frontend-e2e` (after the matrix): the Playwright `e2e/` suite. It uploads the HTML
   report as an artifact.
3. `production-config`: runs `compose config` against `.env.production.example`, renders
   `deploy/nginx/default.conf.template`, and asserts that **only** nginx publishes ports 80
   and 443.

CI does **not** lint, run the responsive suite, or validate `docker-compose.tts.yml`.

`.github/workflows/cd.yml` fires on successful CI on `main`/`master`, on `v*.*.*` tags, and
on manual dispatch. It pushes three images to GHCR tagged `sha-<sha>`, plus the git tag and
`latest` on the default branch. Two GitHub Actions **repository variables** are required:
`API_HOST` (bare DNS name) and `NEXT_PUBLIC_API_URL` (must equal `https://$API_HOST`).

Deploy with `./scripts/deploy-production.sh .env.production`. To check the env file and
compose config without deploying, append `--validate-only` after the env file. For the first-time TLS bootstrap, use
`./scripts/init-production-tls.sh .env.production`. To roll back, set `IMAGE_TAG` back to an
earlier `sha-*` and re-run the deploy script.
