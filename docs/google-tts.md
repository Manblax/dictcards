# Google Cloud Text-to-Speech

The backend generates English MP3 audio on demand using `@google-cloud/text-to-speech`.
Cards and Spell try the preferred dictionary recording, then the other accent,
then Google in the preferred accent. Explicit UK/US buttons keep their requested
accent. Learn and Test send their existing spoken text directly to Google.
English is the only supported language in this version; UK remains the default.
Both accents use Chirp 3 HD Achernar with its default pace and pitch; the
request specifies only MP3 encoding in `audioConfig`.

## Dictionary definitions with Google audio

Definitions and pronunciation are handled independently. For example, if the
selected dictionary returns a definition for a term but neither UK nor US audio,
its definition remains available to select and save in the card editor. Cards
and Spell then use Google Achernar to pronounce the term in the preferred accent.
This works with either Cambridge or Oxford as the selected dictionary.

When dictionary audio is available, the existing recording priority still applies.
Google supplies audio only: it does not generate, replace, or automatically fill
definitions. A Google request failure also leaves dictionary definitions and
saved card text intact. Explicit UK/US buttons fall back to Google when their
requested accent is missing, even if the dictionary has the other accent.

## Google Cloud setup

1. Select or create a Google Cloud project, enable billing, and enable the
   **Cloud Text-to-Speech API** (`texttospeech.googleapis.com`).
2. Configure Application Default Credentials (ADC). These credentials are
   separate from the Google OAuth credentials used to sign in to Dictcards.
3. Set `TTS_VOICE_UK` and `TTS_VOICE_US` if overriding the defaults
   `en-GB-Chirp3-HD-Achernar` and `en-US-Chirp3-HD-Achernar`. Voice names must match their locale.

For a backend running directly on your workstation:

```sh
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

Ensure the ADC identity can use the selected project's services (including
`serviceusage.services.use`). See Google's [setup guide](https://docs.cloud.google.com/text-to-speech/docs/get-started)
and [authentication guide](https://docs.cloud.google.com/text-to-speech/docs/authentication).

For the existing Docker deployment, create a dedicated service account in that
project and store its credential JSON **outside this repository**. Set
`TTS_CREDENTIALS_FILE` to its absolute host path in the Compose environment file.
The optional TTS overlay mounts it read-only at `/run/secrets/tts_credentials`;
it never enters the image or frontend. Development can mount the local ADC JSON
instead, using the same variable.

```sh
# Development: existing command runs migrations before starting Nest.
docker compose -f docker-compose.yml -f docker-compose.tts.yml up -d

# Production: deploy freshly built images containing the new Prisma migration.
# backend-migrate completes before the backend starts.
docker compose --env-file .env.production -f docker-compose.production.yml -f docker-compose.tts.yml up -d
```

The base Compose files still work without Google credentials. Dictionary audio
continues to work; uncached Google requests report unavailable audio until ADC
is configured. Configure Google billing budgets and monitor Text-to-Speech API
usage in the Google Cloud console. This change does not create cloud resources
or enable billing automatically.

If `/tts` returns 502 with missing-credential errors, check that the backend was
started with `docker-compose.tts.yml` as shown above. Setting
`TTS_CREDENTIALS_FILE` in `.env` alone does not mount credentials when using only
the base Compose file. Recreate the backend with the overlay after configuring
credentials. Credential initialization failures are handled as HTTP errors;
the backend, dictionary lookups, and previously cached speech remain available.

## API and cache

`POST /tts` requires the existing bearer JWT and JSON
`{"text":"hello","variant":"uk"}` (or `"us"`). A successful request returns HTTP
200 with `Content-Type: audio/mpeg`. See `/api/docs` for the endpoint schema.

Text is trimmed, limited to 4,000 UTF-8 bytes, and passed as plain text, never
SSML. Status codes: 400 invalid input, 401 authentication required, 429 per-user
limit exceeded, 502 Google failure/timeout. The backend allows 60 requests per
user per fixed one-minute window, including cache hits. Limits and in-flight
request deduplication are process-local, matching the single-backend deployment.

Google calls have a 10-second deadline and no automatic retry. Successful MP3
bytes persist in PostgreSQL's `TtsAudio` table. The SHA-256 key includes trimmed
text, voice, locale, and audio configuration. A new voice setting
produces a distinct cache entry. Existing Neural2 audio remains in the cache
but is not used for Achernar requests; no database migration is needed. The cache has no automatic expiry in this
version; include its storage size in database monitoring and backups. A cache
entry can be deleted to force regeneration. There is no public cache URL.

The browser fetches TTS with its bearer token and owns short-lived Blob URLs,
revoking them on navigation/unmount. A browser autoplay denial prompts a click
and reuses the already generated audio. Playback failures never block studying.

## Verification

Run `npm test` at the repository root and build backend/frontend. Automated
Google calls are mocked. For a live check, sign in and use UK and US buttons for
a phrase absent from the dictionary, then replay it. In DevTools, verify
`POST /tts` returns playable MP3 audio and contains a bearer header. Also check
Learn/Test definition playback and Spell autoplay/replay. A second request for
the same text/voice should reuse the database cache without another Google call.

After changing voices and recreating the backend, refresh the app to clear any
audio already loaded in browser memory.
