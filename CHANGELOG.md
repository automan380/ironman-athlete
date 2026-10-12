# Changelog

All notable changes to the athlete app. The version here matches `APP_VERSION` in `app.js`
(shown in the in-app settings menu). Dates are YYYY-MM-DD.

## 2.3.2 — 2026-10-12
- **"Update available" notification now arrives on time.** When a new version of the app has finished
  downloading in the background, the bell lights with **"A new version of the app is ready — tap to
  update"**; tapping it reloads straight into the new version (no more "sign out and back in"). Before,
  the notice only appeared a launch *after* you were already updated, so it was easy to miss.
- The app also checks for a new version as soon as you open or return to it.
- Service-worker cache bumped to `v10`.
- Note: this very update still lands the old way (reopen the app); from here on, every future update
  shows the tap-to-update prompt.

## 2.3.1 — 2026-10-12
- **Delete notifications**: in the bell list, tick messages (or Select all) and remove them with Delete. (You can clear notifications your coach sent; your messages to the coach stay with them.)
- Service-worker cache bumped to `v9`.

## 2.3.0 — 2026-10-12
- **Notifications bell** in the top bar: it lights with a count when you have unread messages. Tap it to see them; opening the list marks them read.
- **Messages from your coach** appear there, plus automatic notices when your **plan** or your **zones** were updated (sync and check), and a notice when the **app itself updates** (sign out and back in, and check the version in Settings).
- **Message your coach** from the same screen — choose whether it's about a **bug** or your **training plan**.
- The bell refreshes when you open the app, every minute while it's open, and when the connection returns.
- Service-worker cache bumped to `v8`.

## 2.2.0 — 2026-10-12
- **Fill in your questionnaire in the app.** A new athlete with no plan yet lands on **Questionnaires** and answers the intake questions (who you are, your week, current ability, targets, experience, equipment, health, the race) right on the phone. Fill it in over time — your answers are saved on the device — then **Review** and **Send to coach**. Your coach's app builds and publishes your plan automatically, and it appears under **Plan**.
- Once the plan is built, the questionnaire is shown read-only (your submitted answers).
- Service-worker cache bumped to `v7`.

## 2.1.0 — 2026-10-12
- **App renamed to "Ironman Planner"** in the top bar (was "Training"), matching the coach web app.
- **Side menu** (tap the ☰): **Questionnaires · Plan · Zones · Account · Settings**. The gear is gone.
- **Zones page**: your training zones for every discipline (swim / bike / run), with the range for each zone — the same zones the coach sees.
- **Account page**: your email (fixed), **change password**, and sign out.
- **Settings page**: theme, language, **Sync now**, and the app version.
- **Log units**: the entry fields now show their units — mass before/after in **kg**, fluid in **ml**, carbs in **g**.
- Service-worker cache bumped to `v6`.
- (Questionnaires is a placeholder for now — filling them in on the app comes next.)

## 2.0.0 — 2026-10-12
- **Login with email + password** instead of a magic link: sign in once and stay signed in, with **"Remember me on this device"**. No more waiting for a link on every open, and no broken email redirect on iPhone. Your coach sets up your login (a temporary password you then change under **Settings → Change password**).
- **Works offline after the first sign-in**: when "remember me" is on, the cached plan opens even with no connection.
- **Settings now show which email you're connected as**, a **"Sync now"** button (push your logs to the server), and **Change password**.
- **Weekly totals** at the bottom of each week: planned vs done minutes per discipline (swim / bike / run / strength), like the coach's calendar.
- **App icon** is now the Ironman Planner badge (home screen + top bar), matching the coach web app.
- Service-worker cache bumped to `v5`.

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
