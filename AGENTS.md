# Agro Stock GPS — Agent Instructions

## Quick commands
- `npm run dev` — Express + Vite dev (port 3003)
- `npm run build` — Vite build + esbuild server bundle to `dist/`
- `npm run start` — `node dist/server.cjs` (production)
- `npm run lint` — `tsc --noEmit` (only type-check; no linter or formatter)

## Architecture
- **SPA + API in one server**: `server.ts` exports `createApp()` (Express app). Dev uses `tsx` + Vite middleware. Production uses `vite build` + `esbuild`-compiled server.
- **Vercel**: `api/index.ts` imports `createApp()` and wraps it as a serverless handler. SPA fallback via `vercel.json` rewrites.
- **Firebase**: Firestore (`firestore.rules`) + Auth (email/password). Schema in `firebase-blueprint.json`.
- **No tests, no CI, no monorepo tools.**

## Auth quirks
- Login uses **username** → mapped to `{username}@agrostockgps.com` virtual email (`AuthScreen.tsx`)
- Roles: `ADMINISTRADOR` or `TECNICO_CAMPO` (both casing variants exist in code)
- First admin auto-created on empty DB: user `admin` / password `adminpassword`
- Demo mode uses `localStorage` (prefix `agro_stock_gps_`) — no Firebase needed

## Firestore rules gotchas
- `movements` is **append-only** (no updates/deletes by rule)
- `updatedAt` must equal `request.time` — use `serverTimestamp()` on every Firestore write
- Techs can only update `status`, `currentMachine`, `updatedAt`, `updatedBy` on components

## Environment
- Copy `.env.example` to `.env.local` for local dev. Key vars: `GEMINI_API_KEY` (required), `SMTP_*` (optional, email alerts fall back to console log)
- `DISABLE_HMR=true` disables Vite HMR + file watching (for agent editing environments)
- `FIREBASE_SERVICE_ACCOUNT_KEY` optional — server falls back to projectId-only init

## PWA
- `public/sw.js` registered in `main.tsx` with `updateViaCache: 'none'` and auto-skip-waiting
- Strategy: **cache-first** for hashed Vite assets (`/assets/*`), **network-first** for everything else
- `sw.js` and `index.html` served with `no-store, no-cache` (in `server.ts` and `vercel.json`)
- Install prompt handled in `App.tsx` via `beforeinstallprompt` event
