# Sureshot Delivery

**Your Trust. Delivered Fast.** — a multi-vendor marketplace with its **own delivery fleet**: customer website + Android app, seller panel, delivery-partner (rider) app, admin panel and API, all from one codebase.

Production build and server instructions: [PRODUCTION.md](PRODUCTION.md).

## What's in it

| Who | Where | What they can do |
|---|---|---|
| **Customers** | `/` (website) and the Android app | 15 departments on the home page, a separate **Grocery** section (`/grocery`), a separate **store search** (`/stores` — find any shop by name, then browse only its products at `/store/:slug`), product search, bag, coupons, cash-on-delivery checkout, order tracking |
| **Sellers** | `/seller` | Dashboard (sales, payout due, rating), add/edit products with photos, variants (size/colour/weight), prices and stock, submit for approval, pack new orders, see which rider is collecting, edit store profile |
| **Delivery partners** | `/rider` (best in the app) | Go online/offline, see assigned jobs with pickup + drop addresses, call store/customer, directions, mark picked up, mark delivered with COD-cash confirmation, history and today's cash |
| **Sureshot team** | `/login` → admin | Everything in the admin panel plus **Delivery → Dispatch** (assign each parcel to a rider, watch it to the door) and **Delivery partners** (add riders, activate/deactivate, live jobs, COD collected today) |

**Departments:** Grocery, Electronics, Mobiles, Watches, Sunglasses, Men’s Fashion, Women’s Fashion, Bags & Footwear, Shoes, Jewellery, Car & Bike Accessories, Pet Store, Beauty, Kitchen Accessories, Toys — defined in [backend/db/catalog-structure.js](backend/db/catalog-structure.js). Admins can add or hide categories under Catalog → Categories.

**Delivery flow:** customer orders → seller packs (`/seller/orders`) → admin assigns a rider (`/delivery`) → rider picks up and delivers (`/rider`) → order and COD payment settle automatically. Third-party couriers (Shiprocket/Delhivery/Blue Dart) remain available per shipment (`delivery_mode = courier`).

**Customer contact number:** not provided yet. Set it in [web/src/store/brand.ts](web/src/store/brand.ts) (`number = '91XXXXXXXXXX'`) and Call/WhatsApp links appear in the header, footer, home page and Help page automatically.

| | URL |
|---|---|
| Storefront | http://localhost:5473 |
| Seller panel | http://localhost:5473/seller |
| Rider panel | http://localhost:5473/rider |
| Admin panel | http://localhost:5473/login |
| API | http://localhost:4300/api/v1 |
| API docs (Swagger) | http://localhost:4300/api/v1/docs |

Ports are deliberately different from the other local projects (RozShop 4000/5173, MUDIT SHOPING 4100/5273, Varnixo 4200/5373).

## Requirements

- Windows 10/11, **no Docker needed**
- Node.js **20+** (tested on 24.11)
- PostgreSQL **14+** (tested on 16)
- Optional: Redis and Elasticsearch (the API falls back to an in-process rate limiter and database search)
- For the Android app: Android Studio (JDK 21 + Android SDK 36)

## First-time setup

```powershell
cd "D:\SURESHOT App"
npm run install:all

# Creates backend/.env (random secrets + demo passwords), the sureshot_app role and the
# sureshot_dev database. The superuser password is used once and never saved.
$env:PG_ADMIN_USER = "postgres"
$env:PG_ADMIN_PASSWORD = "<your PostgreSQL superuser password>"
npm run setup                           # demo:setup + migrate + seed
Remove-Item Env:PG_ADMIN_PASSWORD

npm run dev                             # API (4300) + web (5473) in the background
```

`npm run stop` stops both. Logs: `.runtime/api.log`, `.runtime/web.log`.

> **This machine:** the main PostgreSQL password isn’t known to the setup, so development uses a private PostgreSQL in `.runtime/pgdata` on **port 5599** (`backend/.env` has `DB_PORT=5599`; superuser password in `.runtime/pg-superuser.txt`, git-ignored). After a reboot start it first:
> `& "C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe" -D .runtime\pgdata -o "-p 5599 -c listen_addresses=localhost" -l .runtime\postgres.log start`

## Demo logins

`npm run setup` writes them to **`DEMO_CREDENTIALS.local.md`** (git-ignored; passwords are random per machine).

- **Admin** — `admin@demo.sureshot.com` → `/login`
- **Sellers** — `seller@` (Sureshot Mart, grocery), `techzone@`, `timeshades@`, `stylekart@`, `urbanstep@`, `rangoli@`, `autopro@`, `happypaws@`, `glow@`, `homechef@`, `toytown@demo.sureshot.com` → `/seller`
- **Delivery partners** — `ravi@`, `imran@`, `suresh@` (offline), `pooja@` (inactive) `@demo.sureshot.com` → `/rider`
- **Shoppers** — `aarav@`, `diya@`, `kabir@`, `ishita@`, `rahul@`, `sneha@`, `farhan@`, `neha@demo.sureshot.com`

## Demo data

Seeds (`backend/db/seeds`, demo databases only — every script refuses production, non-local hosts and database names without `sureshot`):

- 15 departments with subcategories; 11 approved stores with 67 products across all departments; 2 pending seller applications
- 4 delivery partners; the order book spread across them (delivered with COD recorded, on the way, assigned, waiting for a rider)
- 8 customers, 34 orders over ~45 days, reviews, coupons (`WELCOME10`, `SURESHOT100`, `GROCERY50`, scheduled `MEGASALE25`), banners, Delivery & Returns page, FAQs

Rebuild from scratch: `npm --prefix backend run demo:reset`.

Photos are illustrative Unsplash images chosen to match each product; replace them with real seller photos. The three car & bike accessory listings use lifestyle shots (a steering wheel, a rider in a helmet, an EV charger) rather than product packshots.

## Android app

The app **is the storefront** (customers, sellers and riders all use it), wrapped with [Capacitor](https://capacitorjs.com) — `web/capacitor.config.ts`, app id `com.sureshot.app`. Inside the app (`<html data-app>`, `web/src/lib/appMode.ts`) website-only chrome is hidden, the bottom tab bar (Home · Categories · Grocery · Stores · Account) is the navigation, sign-in survives app restarts, and the status bar matches the brand.

```powershell
cd web
copy .env.app.example .env.app       # VITE_API_BASE_URL — must be absolute
$env:SURESHOT_DEV_API = "1"          # only for a plain-http dev API (emulator: http://10.0.2.2:4300)
npm run app:apk                      # -> web/android-build/sureshot-debug.apk
npm run app:open                     # Android Studio: run on a phone/emulator, build signed releases
```

For the Play Store: point `VITE_API_BASE_URL` at the live **https** API, leave `SURESHOT_DEV_API` unset, and build a signed bundle in Android Studio. The production API must list `https://localhost` in `CORS_ORIGINS`. Icons and splash come from the client logo via `python scripts/make-brand.py`.

## Checks run — 2 November 2026

| Check | Result |
|---|---|
| Backend lint / unit tests | clean / 91 passed |
| Demo setup, 5 migrations, 4 seeds | on a fresh PostgreSQL 16 database |
| Commerce end-to-end suite (`npm --prefix backend run test:commerce`) | 22/22 |
| Stores + delivery API checks | 24/24 — store search by name and department, dispatch queue, assignment rules (no inactive riders, no reassign after pickup), rider can’t deliver before pickup or without collecting COD, riders can’t touch other riders’ jobs, customers/sellers blocked from fleet admin, rider passwords redacted from audit logs |
| Web type-check + build / lint / unit tests | pass / 0 errors / 12 passed |
| Browser (Playwright) | home (desktop + phone), store search, grocery, seller sign-in → dashboard, products, product form, orders; rider sign-in → jobs, history (as the Android app); admin dispatch, assign dialog, delivery partners — no console errors |
| Android | debug APK builds; not run on a device or emulator (none configured) |

Not re-run for Sureshot: the full MUDIT-era shopper/admin Playwright journeys, responsive sweep, production bootstrap, `npm audit`.

## Not included / needs external services

- Online payments (Razorpay/Stripe code exists, no keys) — cash on delivery works end to end.
- Image **uploads** need S3-compatible storage (`S3_*`); sellers currently paste photo URLs.
- Email/SMS providers (OTP codes print to the API log). Push notifications need Firebase.
- Live rider GPS tracking and automatic rider assignment are not built — dispatch is manual from the admin panel.
- Rider sign-up is by the Sureshot team (Admin → Delivery partners), not self-service.

## Project layout

```
backend/   Express + Knex + PostgreSQL API — modules/stores (store search), modules/delivery (fleet, dispatch, rider jobs)
web/       React + Vite — storefront (/), seller panel (/seller), rider panel (/rider), admin (/login, /dashboard…), Capacitor Android app (web/android)
assets/    Client logo (original) and generated brand marks
scripts/   dev launcher, stop, brand asset generator, APK builder
```
