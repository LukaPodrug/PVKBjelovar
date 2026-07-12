# Production Readiness Guide

This document is the checklist to take the Water Polo Club platform from local development to a live
production deployment. It covers the four deployable units and the manual steps you must perform on
external services.

## Deployment topology

| Unit | Path | Hosting | Depends on |
| --- | --- | --- | --- |
| API | `apps/api` | Render (Web Service) | Neon PostgreSQL, Contentful, email provider |
| Admin web | `apps/admin-web` | Netlify (static SPA) | API |
| Landing page | `apps/landing-page` | Netlify (static SPA) | API, Contentful |
| Mobile | `apps/mobile` | EAS Build → App Store / Play Store | API, Expo push service |

---

## 0. Already done in the repo

These production-enabling changes are committed:

- `db:migrate:deploy` script (root `package.json`) — apply migrations in prod without the
  destructive `migrate dev`.
- Netlify SPA fallback: `apps/admin-web/public/_redirects` and `apps/landing-page/public/_redirects`.
- Mobile EAS config: `apps/mobile/eas.json` (build profiles) and `app.json` now has iOS
  `bundleIdentifier` + Android `package` + the `expo-notifications` plugin.
- Mobile API URL is read from `EXPO_PUBLIC_API_URL` (per EAS profile); local dev still defaults to
  `http://127.0.0.1:4000/api`.
- `apps/api/.env.example` documents `FRONTEND_URLS` (multi-origin CORS) and `MAX_UPLOAD_SIZE_MB`.

## 1. Must-fix before go-live (not yet done — decide + implement)

- **Change the master admin password.** The seed creates `master.admin@adriaticwaves.test` /
  `Admin12345!` and other known passwords (`packages/database/src/seed.ts`). **Never run the seed
  against production.** Instead create a single real admin (see §3) and rotate that password.
- **API hardening middleware.** The API currently has no `helmet`, rate limiting, or request
  logging (`apps/api/src/app.ts`). Recommended before public exposure:
  - `helmet` for security headers.
  - `express-rate-limit` on `/api/auth/login` and `/api/signups` (brute-force / spam).
  - a request logger (`pino-http` or `morgan`).
- **Strong `JWT_SECRET`.** Generate a long random secret (`openssl rand -hex 32`); never reuse the
  example value. Rotating it invalidates all existing tokens.
- **EAS push credentials** (FCM v1 for Android, APNs for iOS) — see §6. Without these, push is not
  delivered even from a production build.

## 2. Neon (PostgreSQL)

1. Create a Neon project + database; copy the **pooled** connection string (Prisma works well with
   the pooled endpoint for the API; use the direct endpoint for migrations if you hit pooling
   issues).
2. Set `DATABASE_URL` on the API service (§3). Include `?sslmode=require`.
3. Apply schema: `npm run db:migrate:deploy` (run once from the Render deploy hook or locally with
   the prod `DATABASE_URL`). Do **not** run `db:migrate:dev` or `prisma migrate reset` against prod.
4. Enable Neon automatic backups / point-in-time restore.

## 3. API on Render

**Service type:** Web Service, Node.

- **Build command:**
  `npm install && npm run db:generate && npm run build --workspace apps/api`
  (`db:generate` produces the Prisma client; `build` compiles TS to `apps/api/dist`.)
- **Start command:** `npm run start --workspace apps/api` (runs `node dist/index.js`).
- **Health check path:** `/health` (already implemented in `apps/api/src/app.ts`).
- **Auto-migrate on deploy:** add `npm run db:migrate:deploy` as a Render *pre-deploy command* (or
  prepend it to the start command) so migrations apply on each release.

**Environment variables** (from `apps/api/src/config/env.ts`):

| Variable | Required | Notes |
| --- | --- | --- |
| `NODE_ENV` | yes | `production` |
| `PORT` | provided by Render | server binds to it automatically |
| `DATABASE_URL` | yes | Neon pooled URL, `sslmode=require` |
| `JWT_SECRET` | yes | long random string |
| `JWT_EXPIRES_IN` | no | default `7d` |
| `FRONTEND_URLS` | yes | comma-separated: admin-web + landing-page prod URLs (CORS allow-list) |
| `CONTENTFUL_MANAGEMENT_TOKEN` | for uploads | profile/logo image uploads |
| `CONTENTFUL_SPACE_ID` | for uploads | |
| `CONTENTFUL_ENVIRONMENT` | no | default `master` |
| `CONTENTFUL_LOCALE` | no | default `en-US` |
| `RESEND_API_KEY` **or** `SMTP_*` | for email | signup approval / credential emails |
| `MAIL_FROM` | for email | verified sender address |
| `MAX_UPLOAD_SIZE_MB` | no | default 8 |

**Daily membership-expiry reminder job.** The `≤7-day` reminder is a script, not part of the server.
Schedule it with a **Render Cron Job** (separate service, same repo/env):
- Command: `npm run notify:membership-expiry --workspace apps/api`
- Schedule: once daily (e.g. `0 6 * * *`).
It needs the same `DATABASE_URL`. (Practice-change and membership-renewed notifications fire inline
from the API and need no scheduler.)

**Seed a real admin (once).** Instead of the demo seed, insert one admin via a one-off script or SQL
with a bcrypt/scrypt hash matching `apps/api/src/services/password.service.ts`, then log in and set a
new password.

## 4. Admin web on Netlify

- **Base directory:** repo root. **Build command:** `npm install && npm run build --workspace apps/admin-web`.
- **Publish directory:** `apps/admin-web/dist`.
- **Env:** `VITE_API_URL=https://<your-api-host>/api`.
- SPA routing is handled by `apps/admin-web/public/_redirects` (already added).
- Restrict access if desired (Netlify password / IP allow-list) since it is staff-only.

## 5. Landing page on Netlify

- **Build command:** `npm install && npm run build --workspace apps/landing-page`.
- **Publish directory:** `apps/landing-page/dist`.
- **Env:**
  - `VITE_API_URL=https://<your-api-host>/api`
  - `VITE_CONTENTFUL_SPACE_ID`, `VITE_CONTENTFUL_ACCESS_TOKEN` (Content **Delivery** token, read-only),
    `VITE_CONTENTFUL_ENVIRONMENT`, `VITE_CONTENTFUL_NEWS_CONTENT_TYPE`, `VITE_CONTENTFUL_NEWS_LIMIT`.
- Add both Netlify prod URLs to the API's `FRONTEND_URLS`.

## 6. Mobile on EAS (this is the "wire EAS build" part)

Prereqs: an [Expo account](https://expo.dev), Apple Developer account (iOS), Google Play Console
account (Android). Run all commands from `apps/mobile`.

1. **Install & log in:** `npm i -g eas-cli` then `eas login`.
2. **Link the project:** `eas init` — this creates the EAS project and writes
   `extra.eas.projectId` into `app.json`. (The push-token code in `App.tsx` already reads that
   projectId; until this runs, `getExpoPushTokenAsync` no-ops.)
3. **Set the production API URL:** edit `eas.json` and replace `REPLACE-WITH-YOUR-API-HOST` in the
   `preview` and `production` profiles with your Render API host.
4. **Push credentials** (required for real delivery):
   - Android: `eas credentials` → set up **FCM V1** (upload the service-account JSON from your
     Firebase project). Expo uses this to deliver to Android.
   - iOS: `eas credentials` → let EAS manage the **APNs key** (needs the Apple Developer account).
5. **Finalize identifiers** before the first store submission: `ios.bundleIdentifier` and
   `android.package` are currently `com.pvkmladostbjelovar.mobile` — change if you own a different
   domain (they cannot change after release).
6. **Build:**
   - Internal test: `eas build --profile preview --platform android` (APK you can sideload).
   - Store builds: `eas build --profile production --platform all`.
7. **Submit:** `eas submit --profile production --platform ios|android` (or upload manually).
8. **Verify push end-to-end** on a real device (not Expo Go): log in as a parent/player, confirm the
   device appears in `push_devices`, cancel a practice from admin, confirm the push arrives.

> Note: remote push never works in Expo Go — always test on a development or production build.

## 7. Security & privacy checklist

- [ ] Rotate `JWT_SECRET`; unique per environment.
- [ ] Add `helmet`, rate limiting on auth/signup, and request logging (see §1).
- [ ] HTTPS everywhere (Render + Netlify provide TLS; ensure `VITE_API_URL`/`EXPO_PUBLIC_API_URL`
      use `https://`).
- [ ] `FRONTEND_URLS` lists only the real prod origins (no wildcards).
- [ ] Contentful landing token is a **read-only Delivery** token; the management token lives only on
      the API.
- [ ] **GDPR:** the system stores minors' data and Croatian OIB. Confirm a lawful basis and consent
      capture (the signup form already collects `gdprConsent`), a retention/erasure policy, and that
      profile images in Contentful are covered. Restrict who can access the admin web.
- [ ] Secrets only in each host's env store — never commit `.env` (already git-ignored).
- [ ] Neon backups enabled; test a restore.

## 8. Observability & CI

- [ ] Error tracking (e.g. Sentry) on the API and both SPAs.
- [ ] Uptime monitor hitting `GET /health`.
- [ ] CI gate on PRs: `npm run typecheck` and `npm run lint` (turbo runs all workspaces). Add
      `npm run build` to catch build breaks.

## 9. Go-live sequence

1. Provision Neon; run `db:migrate:deploy` against prod.
2. Deploy API to Render with all env vars; confirm `GET /health`.
3. Create the real admin; delete/disable any demo accounts; **never seed prod**.
4. Deploy both Netlify sites; add their URLs to `FRONTEND_URLS`; smoke-test login + public signup.
5. Configure Contentful prod space + tokens; verify landing news + image uploads.
6. Configure email (Resend/SMTP); verify a signup approval email is delivered.
7. Schedule the Render cron for `notify:membership-expiry`.
8. `eas init` + credentials + `eas build --profile production`; test push on a device; submit to
   stores.
9. Add security middleware (§1) and monitoring (§8).
