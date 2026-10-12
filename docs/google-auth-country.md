# Google and Yandex sign-in visibility by country

The login and registration pages show Yandex instead of Google when the visitor's
public IP address resolves to `RU`. The server decides before rendering either form.
Russian browser language alone does not hide Google. VPNs can change the detected
country; this is approximate IP location, not citizenship.

Only `X-Real-IP` is used. The production Nginx template overwrites it with
`$remote_addr`, and only Nginx publishes ports. Keep the frontend private behind
that proxy. If a CDN is introduced, review the client-IP trust configuration first;
the current setup expects visitors to connect directly to Nginx.

Missing, invalid, private, reserved, or unknown addresses show Google and hide Yandex. Database
initialization or lookup failures also show Google. No visitor IP is sent to a
geolocation service. The frontend does not persist the location or change the user
schema. Auth pages are rendered per request and must not be put behind a shared
HTML cache.

## Database setup and updates

The server uses `ip-location-api` with the `user` country dataset from
[ip-location-db](https://github.com/sapics/ip-location-db#country), published under
PDDL. No MaxMind account or key is required. The dataset supports IPv4 and IPv6.

For local development and before running authentication browser tests:

```bash
npm --prefix frontend run geoip:update
```

This downloads and verifies the country database. Run the command again for a
manual refresh, then restart the frontend to reload it in existing server
processes. The Docker build runs it automatically and fails if the initial data
cannot be prepared. The runtime image includes that initial database.

Data defaults to `frontend/.geoip/data` and downloads to `frontend/.geoip/tmp`
when run from the frontend directory (`/app/.geoip/data` and `/app/.geoip/tmp`
in Docker). Both directories must be writable. Override them with absolute
`GEOIP_DATA_DIR` and `GEOIP_TMP_DIR` paths if needed, using the same paths for
database preparation and server startup. The files are ignored by Git.

After the first public-IP lookup in a server process, background refresh runs
Wednesday and Saturday at 03:00 UTC. Failed downloads leave the loaded database
in service and produce a library warning. The container's writable layer holds
updates; a replacement container starts from the database packaged in its image.
Rebuild the image for a fresh initial snapshot. Page requests never bootstrap a
missing database: they show Google, log the initialization failure, and retry local
initialization after one minute.

## Existing Google accounts

Only the buttons are hidden. Direct sign-in remains available at
`https://<API_HOST>/auth/google` (locally `http://localhost:3001/auth/google`).
The OAuth callback and password flows are unchanged. Accounts created through
Google have a generated random password, so their owners can use the direct Google
link, an existing password, or Yandex with exactly the same email. Yandex links
that account automatically and preserves its cards. No password reset is added.
See [Yandex ID setup and account linking](yandex-auth.md).

## Verification

```bash
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix frontend run geoip:update
npm --prefix frontend run test:e2e -- e2e/login.spec.ts e2e/register.spec.ts e2e/auth-flows.spec.ts e2e/auth-country.spec.ts
docker build -t dictcards-frontend:geoip-check frontend
```

Browser tests set `X-Real-IP` directly because their Next.js server has no Nginx.
Production users cannot choose that header through the configured proxy.
