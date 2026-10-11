# Changelog

All notable changes to the athlete app. The version here matches `APP_VERSION` in `app.js`
(shown in the in-app settings menu). Dates are YYYY-MM-DD.

## 1.3.0 — 2026-10-11
- Clear **"Not connected yet"** screen when you sign in with an email that the coach hasn't linked to an athlete (instead of a blank "no plan"): it names the email and tells you to ask your coach. No one ever sees another athlete's data.
- When online, the app trusts the server for which athlete an email belongs to, and **signing out clears the cached plan** — so a different person signing in on the same device never sees the previous one's data.
- Service-worker cache bumped to `v4`.

## 1.2.0 — 2026-10-11
- **Ironman branding**: red / black / white palette matching the coach web app; app logo in the top bar (replacing the plain "Training" text).
- **App version** shown at the bottom of the settings menu, and this changelog.
- **Fixes**: the settings menu now closes again (tap the gear, or anywhere outside it); the small empty box that appeared under the gear on load is gone. Both were caused by the panel's `display` rule overriding the `hidden` attribute.
- Service-worker cache bumped to `v3` so installed apps pick up the new files.

## 1.1.0 — 2026-10-11
- UI is **English by default**, with a **settings gear** in the top bar to switch **theme** (auto / light / dark) and **language** (English / Italiano). Both choices are remembered on the device. Plan content stays as the coach published it.

## 1.0.0 — 2026-10-11
- First release: read the published plan with full detail (target, session notes, nutrition), **log sessions** with every field of the Excel log and a **"done on another day"** day picker, **offline-first** (reads and queued logs work without a connection), and **installable** to the home screen.
