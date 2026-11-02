# Sureshot web

React + Vite app serving the customer storefront (`/`) and the admin panel (`/login`, `/dashboard`, …).
Dev server: http://localhost:5473 (proxies `/api` to the API on port 4300).

See the project README one level up for setup, demo logins and commands.

```powershell
npm ci
npm run dev      # or `npm run dev` from sureshot-App to start API + web together
npm run build
npm run lint
npm test
```
