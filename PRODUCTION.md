# Production runtime

The built storefront, admin, API and Socket.IO share one Express server. `npm run start:background` starts a **local production-mode preview**, bound to loopback at http://127.0.0.1:5473. It uses the existing local database; this does not publish the shop or convert demo records into real orders.

## Local operation

```powershell
npm.cmd run build
npm.cmd --prefix backend run migrate
npm.cmd run start:background
npm.cmd run stop:production
```

Logs: `.runtime/production.log`. Process identity: `.runtime/production.json`. The stop command checks the running application's instance identifier before stopping it. For hosted operation, use `npm start` in a service manager (foreground). The local background launcher does not automatically restart after crashes or machine reboots.

## Public deployment

1. Provision a host, domain and TLS certificate. Run Node 20+ under a dedicated unprivileged service account with automatic restart and log rotation.
2. Install locked dependencies (`npm ci` in backend and web), build the web application, then retain backend runtime dependencies and `web/dist`.
3. Configure `backend/.env` from `.env.production.example`, with unique long JWT secrets, a 64-character hexadecimal encryption key and a dedicated PostgreSQL database. Preserve the encryption key across releases and backups.
4. Back up the database and verify restore procedures before running migrations. Do not seed or reset the production database (the seed and reset scripts refuse to run there); local demo accounts/data are not a launch configuration.
5. Run migrations, then bootstrap the platform once (see below), start the foreground process, and verify `/healthz` and `/readyz`. Route public HTTPS traffic to the loopback listener through a reverse proxy, including WebSocket upgrades. Set explicit origins and trust only the actual proxy. Keep PostgreSQL and backend listeners private.
6. Monitor readiness, application errors, database capacity, rate-limit table size and backups. Load-test the expected traffic before launch.

PostgreSQL shared rate limiting is selected by the launcher. Atomic database windows are shared across processes; database failures return 503 rather than bypassing limits. Redis remains optional for caching in this mode. `RATE_LIMIT_STORE=redis` instead requires a healthy Redis instance for readiness and API traffic.

Hashed frontend assets are cached for one year; route HTML and API responses are not cached. Unknown API, asset and dotfile requests never receive the SPA fallback. Swagger and metrics are not exposed in production. Startup rejects missing/weak JWT secrets and invalid encryption keys. Production OTP requests return an explicit unavailable response instead of logging codes.

## First-run bootstrap (required)

Migrations create empty tables only. Before anyone can sign in or register, the database needs its roles, permissions, currencies, GST slabs and checkout settings, plus a first administrator. On the server, with `backend/.env` configured:

```bash
npm --prefix backend run migrate
npm --prefix backend run bootstrap:production -- --email owner@yourdomain.in --name "Store Owner"
```

The password is prompted for without echo (12+ characters, upper/lower case and a digit). For unattended provisioning set `BOOTSTRAP_ADMIN_PASSWORD` for that one command and unset it afterwards. The command is idempotent: re-running never overwrites existing data, refuses an email that already exists, and with `--promote` grants super admin to an existing account without changing its password. No demo users, products or orders are created. Create further staff from the admin panel (Staff) so every account has its own login.

## Backup, restore and rollback

```bash
# Backup (daily, and always before a release that includes migrations). Uses the DB_* values from backend/.env;
# supply the password through PGPASSWORD or ~/.pgpass. Keep copies off the host.
pg_dump --format=custom --no-owner -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --file=sureshot-$(date +%F-%H%M).dump
# Restore into a new, EMPTY database, then point DB_NAME in backend/.env at it.
pg_restore --no-owner -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d sureshot_restored sureshot-YYYY-MM-DD-HHMM.dump
```

`ENCRYPTION_KEY` must be kept with the backups: vendor bank and KYC fields are encrypted with it and cannot be read without it. Test a restore before launch.

Rollback of a release: stop the service, check out the previous release tag, `npm ci` in backend and web, rebuild web, and start it again. If the bad release ran migrations, restore the pre-release backup rather than running `migrate:rollback` on live data. Down migrations can drop columns that already hold customer data.

## HTTPS is required

Serve the storefront and admin over HTTPS only. Browsers expose `crypto.randomUUID()` (used for checkout idempotency keys) only in secure contexts, so checkout fails on plain HTTP from a public hostname. `localhost` counts as secure for local testing.

## Remaining public-launch requirements

- Domain, host, TLS, service supervision and backup/restore configuration.
- Real catalogue media, business policies and production accounts/data.
- OTP/email/SMS delivery implementation and provider configuration. Password sign-in is available; OTP-based recovery is intentionally unavailable until delivery is implemented.
- S3 credentials for uploads; payment credentials and end-to-end gateway verification for online payment; courier credentials if automated booking is required. The current storefront supports COD.
- Deployment-specific security review, traffic/load testing and operational monitoring. Passing local tests is not a production certification.

Runtime guidance follows [Express production practices](https://expressjs.com/en/advanced/best-practice-performance/). The UUID upgrade remains on the CommonJS-compatible v11 line ([upstream documentation](https://github.com/uuidjs/uuid/blob/main/README.md)).

## Verification — 14 October 2026

- Production frontend build and all 100 unit tests passed (88 backend, 12 frontend), including production asset routing and shared limiter failure paths.
- Backend lint passed. Frontend lint has no errors and 21 existing Fast Refresh warnings.
- Production-only npm audits report zero known advisories for both backend and web after compatible patches and upgrades to Google Auth 10, UUID 11 and React Router 7.
- Development/test dependency advisories remain (Jest/nodemon and the frontend build/test tooling). Do not install development dependencies on the public runtime. The zero-advisory result applies only to production dependencies, not the entire development tree.
- PostgreSQL limiter integration: 20 concurrent requests produced unique sequential counts; expired windows reset correctly.
- Production HTTP checks: readiness 200; deep links 200; missing assets, dotfiles and metrics 404; unauthenticated admin API 401; CSP and no-sniff headers present; API and route HTML use no-store.
- Final production browser checks passed for storefront, customer flows and ten admin routes at desktop/mobile sizes, with no browser errors. Cart and wishlist test changes were restored; no purchase was submitted. Identity-checked stop/start passed and the local server was left running.
