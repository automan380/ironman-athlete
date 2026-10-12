/* Athlete app. Reads the published plan (RLS-scoped to the signed-in athlete), shows it with the
 * same detail as the coach's day view, and logs sessions back to Supabase — offline-first.
 * The app NEVER moves or recomputes anything: it records what the athlete did (incl. "done on a
 * different day"); the coach bridge applies any move. Vanilla JS, no build step.
 * UI is English by default; a gear menu switches theme (auto/light/dark) and language (en/it). */
(function () {
  "use strict";

  const APP_VERSION = "2.0.0";          // shown in the settings menu; keep in step with CHANGELOG.md
  const CFG = window.IRONMAN_CONFIG || {};
  // "Remember me on this device": when on, the session lives in localStorage and survives app
  // restarts; when off, it lives in sessionStorage and is gone once the app is closed. The backend
  // is chosen live per read/write from the saved flag, so the login checkbox takes effect for the
  // session it creates. Every access is guarded for private mode.
  function rememberOn() { try { return localStorage.getItem("remember") !== "0"; } catch (e) { return true; } }
  const authStorage = {
    getItem(k) { try { return (rememberOn() ? localStorage : sessionStorage).getItem(k); } catch (e) { return null; } },
    setItem(k, v) { try { (rememberOn() ? localStorage : sessionStorage).setItem(k, v); } catch (e) { /* private mode */ } },
    removeItem(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  const SB = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, detectSessionInUrl: false, autoRefreshToken: true, storage: authStorage },
  });

  // ---------- i18n ----------
  const STR = {
    en: {
      brand: "Training", signout: "Sign out", back: "Back", settings: "Settings",
      theme: "Theme", theme_auto: "Auto", theme_light: "Light", theme_dark: "Dark", language: "Language",
      account: "Account", signed_in_as: "Signed in as", sync_now: "Sync now", syncing: "Syncing…",
      change_pw: "Change password", new_pw_ph: "New password", save_pw: "Save password",
      pw_saved: "Password updated.", pw_short: "Use at least 6 characters.",
      totals: "Totals", t_plan: "plan", t_done: "done", t_total: "Total",
      sync_updated: "up to date", sync_offline: "offline", sync_offline_q: "offline · {n} queued", sync_send: "{n} to send…",
      login_title: "Your training",
      login_sub: "Sign in with your email and password. Your coach sets up your login.",
      email: "Email", email_ph: "you@example.com",
      password: "Password", password_ph: "Your password", remember: "Remember me on this device",
      signin: "Sign in", signing_in: "Signing in…",
      enter_email: "Enter your email.", enter_password: "Enter your password.",
      bad_login: "Wrong email or password, or your coach hasn't set up your login yet.",
      first_login_hint: "First time? Sign in with the temporary password your coach gave you, then change it in Settings.",
      error: "Error: ",
      no_plan: "No plan available yet.",
      no_plan_sub: "If your coach just published, try again shortly (the first load needs a connection).",
      not_conn_title: "Not connected yet",
      not_conn_sub: "You're signed in as {email}, but this email isn't connected to an athlete yet. Ask your coach to connect it, then reopen the app.",
      week_n: "Week {n}", today: "Today", recovery: "recovery", rest: "Rest",
      test_prefix: "Test: ", badge_test: "test", badge_key: "key",
      target: "Target", no_numeric: "No numeric target", use_talk: "Use the talk test:", talk: "talk test:",
      detail: "Detail", nutrition: "Nutrition",
      water_only: "Water only — under an hour the book skips in-session carbohydrate.",
      during: "During", carb_h: "{g} g carb/h", during_note: "{kcal} kcal/h · {total} g total",
      fluids: "Fluids", fluids_v: "{ml} ml/h", sodium: "Sodium", sodium_v: "{mg} mg/h",
      before: "Before", before_2h: "2 h before", before_10m: "up to 10 min before",
      after: "After", within30: "within 30 min",
      multi: "Above 60 g/h you need a glucose + fructose mix: a single sugar cannot be absorbed fast enough.",
      warm_up: "Warm-up", how: "How to do it", measures: "What it measures",
      test_coach: "Record the test result with your coach.",
      log_edit: "Edit log", log_new: "Log the session", done_on: "Done on", planned: " (planned)",
      required: "·required", save_done: "Save as done", save: "Save", mark_skip: "Mark skipped",
      logged: "Logged", skipped: "Skipped", queued: "queued", done_on_s: "done {day}",
      r_duration: "Duration", r_distance: "Distance", r_avghr: "Avg HR", r_power: "Power",
      r_felt: "Felt", r_carb: "Carbs", r_gut: "Gut", r_note: "Note", no_reason: "no reason given",
      moved_note: "Done on another day: the session will move once your coach syncs.",
    },
    it: {
      brand: "Allenamenti", signout: "Esci", back: "Indietro", settings: "Impostazioni",
      theme: "Tema", theme_auto: "Auto", theme_light: "Chiaro", theme_dark: "Scuro", language: "Lingua",
      account: "Account", signed_in_as: "Connesso come", sync_now: "Sincronizza ora", syncing: "Sincronizzo…",
      change_pw: "Cambia password", new_pw_ph: "Nuova password", save_pw: "Salva password",
      pw_saved: "Password aggiornata.", pw_short: "Usa almeno 6 caratteri.",
      totals: "Totali", t_plan: "prev.", t_done: "fatto", t_total: "Totale",
      sync_updated: "aggiornato", sync_offline: "offline", sync_offline_q: "offline · {n} in coda", sync_send: "{n} da inviare…",
      login_title: "I tuoi allenamenti",
      login_sub: "Accedi con email e password. L'accesso te lo crea il coach.",
      email: "Email", email_ph: "tu@esempio.com",
      password: "Password", password_ph: "La tua password", remember: "Ricordami su questo dispositivo",
      signin: "Accedi", signing_in: "Accesso…",
      enter_email: "Scrivi la tua email.", enter_password: "Scrivi la password.",
      bad_login: "Email o password errate, oppure il coach non ha ancora creato il tuo accesso.",
      first_login_hint: "Primo accesso? Entra con la password temporanea che ti ha dato il coach, poi cambiala nelle Impostazioni.",
      error: "Errore: ",
      no_plan: "Nessun piano ancora disponibile.",
      no_plan_sub: "Se il coach ha appena pubblicato, riprova tra poco (serve la rete la prima volta).",
      not_conn_title: "Non ancora collegato",
      not_conn_sub: "Hai effettuato l'accesso come {email}, ma questa email non è ancora collegata a un atleta. Chiedi al coach di collegarla, poi riapri l'app.",
      week_n: "Settimana {n}", today: "Oggi", recovery: "recupero", rest: "Riposo",
      test_prefix: "Test: ", badge_test: "test", badge_key: "chiave",
      target: "Target", no_numeric: "Nessun target numerico", use_talk: "Usa il talk test:", talk: "talk test:",
      detail: "Dettaglio", nutrition: "Nutrizione",
      water_only: "Solo acqua — sotto l'ora il libro non prevede carboidrati in sessione.",
      during: "Durante", carb_h: "{g} g carbo/h", during_note: "{kcal} kcal/h · {total} g totali",
      fluids: "Liquidi", fluids_v: "{ml} ml/h", sodium: "Sodio", sodium_v: "{mg} mg/h",
      before: "Prima", before_2h: "2 h prima", before_10m: "fino a 10 min prima",
      after: "Dopo", within30: "entro 30 min",
      multi: "Sopra i 60 g/h serve un mix glucosio + fruttosio: uno zucchero solo non si assorbe abbastanza in fretta.",
      warm_up: "Riscaldamento", how: "Come si fa", measures: "Cosa misura",
      test_coach: "Registra il risultato del test con il coach.",
      log_edit: "Modifica il log", log_new: "Registra la sessione", done_on: "Fatto il giorno", planned: " (previsto)",
      required: "·richiesto", save_done: "Salva come fatto", save: "Salva", mark_skip: "Segna saltato",
      logged: "Registrato", skipped: "Saltato", queued: "in coda", done_on_s: "fatto {day}",
      r_duration: "Durata", r_distance: "Distanza", r_avghr: "FC media", r_power: "Potenza",
      r_felt: "Sensazione", r_carb: "Carboidrati", r_gut: "Stomaco", r_note: "Nota", no_reason: "nessun motivo indicato",
      moved_note: "Fatto un altro giorno: la sessione si sposterà quando il coach sincronizza.",
    },
  };
  const FELT = {
    en: { easy: "easier than planned", as_planned: "about as planned", hard: "harder than planned", cut_short: "had to cut it short" },
    it: { easy: "più facile del previsto", as_planned: "circa come previsto", hard: "più dura del previsto", cut_short: "ho dovuto accorciare" },
  };
  const CAL = {
    en: { WD: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
          WD_FULL: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
          MO: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] },
    it: { WD: ["lun", "mar", "mer", "gio", "ven", "sab", "dom"],
          WD_FULL: ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"],
          MO: ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"] },
  };
  function T(key, vars) {
    let s = (STR[S.lang] && STR[S.lang][key]) || STR.en[key] || key;
    if (vars) for (const k in vars) s = s.replace("{" + k + "}", vars[k]);
    return s;
  }
  function feltLabel(v) { return (FELT[S.lang] && FELT[S.lang][v]) || v; }
  function cal() { return CAL[S.lang] || CAL.en; }

  // ---------- tiny helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const app = $("#app");
  const topbar = $("#topbar");
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  function hhmm(min) {
    min = Math.round(min || 0);
    const h = Math.floor(min / 60), m = min % 60;
    return h ? `${h}:${String(m).padStart(2, "0")}` : `${m} min`;
  }

  // ---------- dates (locale-aware, Monday-first), ISO strings, no timezone drift ----------
  function parseD(iso) { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); }
  function fmtISO(dt) {
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  }
  function todayISO() { return fmtISO(new Date()); }
  function wdIdx(dt) { return (dt.getDay() + 6) % 7; }          // Monday = 0
  function shortDay(iso) { const d = parseD(iso), c = cal(); return `${c.WD[wdIdx(d)]} ${d.getDate()} ${c.MO[d.getMonth()]}`; }
  function longDay(iso) { const d = parseD(iso), c = cal(); return `${c.WD_FULL[wdIdx(d)]} ${d.getDate()} ${c.MO[d.getMonth()]}`; }
  function addDays(iso, n) { const d = parseD(iso); d.setDate(d.getDate() + n); return fmtISO(d); }
  function cap(s) { return s.replace(/^./, (c) => c.toUpperCase()); }

  // ---------- IndexedDB (plan cache + outbound queue) ----------
  let _dbp;
  function db() {
    return _dbp || (_dbp = new Promise((res, rej) => {
      const r = indexedDB.open("ironman-athlete", 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains("cache")) d.createObjectStore("cache");
        if (!d.objectStoreNames.contains("outbox")) d.createObjectStore("outbox", { keyPath: "key" });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
  }
  function store(name, mode) { return db().then((d) => d.transaction(name, mode).objectStore(name)); }
  async function idbGet(name, key) { const o = await store(name); return new Promise((res) => { const q = o.get(key); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); }); }
  async function idbSet(name, key, val) { const o = await store(name, "readwrite"); return new Promise((res) => { o.put(val, key); o.transaction.oncomplete = () => res(); o.transaction.onerror = () => res(); }); }
  async function idbPut(name, val) { const o = await store(name, "readwrite"); return new Promise((res) => { o.put(val); o.transaction.oncomplete = () => res(); o.transaction.onerror = () => res(); }); }
  async function idbAll(name) { const o = await store(name); return new Promise((res) => { const q = o.getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); }); }
  async function idbDel(name, key) { const o = await store(name, "readwrite"); return new Promise((res) => { o.delete(key); o.transaction.oncomplete = () => res(); o.transaction.onerror = () => res(); }); }
  async function idbClear(name) { const o = await store(name, "readwrite"); return new Promise((res) => { o.clear(); o.transaction.oncomplete = () => res(); o.transaction.onerror = () => res(); }); }

  async function doSignOut() {
    try { await idbClear("cache"); await idbClear("outbox"); } catch (e) { /* ignore */ }
    try { await SB.auth.signOut(); } catch (e) { /* ignore */ }
    location.reload();
  }

  function deviceId() {
    let id = null;
    try { id = localStorage.getItem("device_id"); if (!id) { id = (crypto.randomUUID && crypto.randomUUID()) || ("dev-" + Date.now()); localStorage.setItem("device_id", id); } }
    catch (e) { id = "dev-" + Date.now(); }
    return id;
  }
  function savePref(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  function loadPrefs() {
    try { S.lang = localStorage.getItem("lang") || "en"; } catch (e) { S.lang = "en"; }
    try { S.theme = localStorage.getItem("theme") || "auto"; } catch (e) { S.theme = "auto"; }
  }

  // ---------- state ----------
  const S = {
    lang: "en", theme: "auto",
    athleteId: null, displayName: "", email: "", meta: null, prefs: {},
    weeks: [], sessions: [], tests: [], zones: {},
    logs: {}, outbox: {},
    fieldSpec: {}, weekIdx: null, view: "week", current: null,
  };
  const lkey = (s) => `${s.on_date}|${s.session_key}`;

  // ================= theme / language / settings =================
  function applyTheme() {
    const r = document.documentElement;
    if (S.theme === "auto") r.removeAttribute("data-theme");
    else r.setAttribute("data-theme", S.theme);
  }
  function applyLang() {
    document.documentElement.lang = S.lang;
    document.title = T("brand");
    const b = $("#brand"); if (b) b.setAttribute("aria-label", T("brand"));
    const w = $(".wordmark"); if (w) w.textContent = T("brand");
    const g = $("#gear"); if (g) g.setAttribute("aria-label", T("settings"));
    const bk = $("#back"); if (bk) bk.setAttribute("aria-label", T("back"));
    setSync();
  }
  function renderSettings() {
    const p = $("#settingspanel");
    const seg = (set, opts) => `<div class="segmented" data-set="${set}">` +
      opts.map(([v, lbl]) => `<button data-v="${v}" class="${S[set] === v ? "active" : ""}">${esc(lbl)}</button>`).join("") + `</div>`;
    p.innerHTML =
      `<div class="setgroup"><div class="setlabel">${T("theme")}</div>${seg("theme", [["auto", T("theme_auto")], ["light", T("theme_light")], ["dark", T("theme_dark")]])}</div>` +
      `<div class="setgroup"><div class="setlabel">${T("language")}</div>${seg("lang", [["en", "English"], ["it", "Italiano"]])}</div>` +
      `<div class="setgroup"><div class="setlabel">${T("account")}</div>` +
        (S.email ? `<div class="small muted">${T("signed_in_as")}: ${esc(S.email)}</div>` : ``) +
        `<button id="syncnow" class="ghost">${T("sync_now")}</button>` +
        `<div id="syncmsg" class="msg" hidden></div>` +
        `<button id="changepw" class="ghost">${T("change_pw")}</button>` +
        `<div id="pwbox" hidden>` +
          `<input id="newpw" type="password" autocomplete="new-password" placeholder="${T("new_pw_ph")}">` +
          `<button id="savepw" class="primary">${T("save_pw")}</button>` +
          `<div id="pwmsg" class="msg" hidden></div>` +
        `</div>` +
      `</div>` +
      `<button id="panelsignout" class="ghost">${T("signout")}</button>` +
      `<div class="setversion">v${APP_VERSION}</div>`;
    p.querySelectorAll(".segmented").forEach((sg) => sg.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        const set = sg.getAttribute("data-set"), v = b.getAttribute("data-v");
        S[set] = v; savePref(set, v);
        if (set === "theme") applyTheme(); else { applyLang(); repaint(); }
        renderSettings();
      })));
    $("#syncnow").addEventListener("click", syncNow);
    $("#changepw").addEventListener("click", () => { const box = $("#pwbox"); box.hidden = !box.hidden; if (!box.hidden) $("#newpw").focus(); });
    $("#savepw").addEventListener("click", changePassword);
    $("#panelsignout").addEventListener("click", doSignOut);
  }

  async function syncNow() {
    const btn = $("#syncnow"), m = $("#syncmsg");
    if (!navigator.onLine) { m.hidden = false; m.className = "msg err"; m.textContent = T("sync_offline"); return; }
    btn.disabled = true; const t = btn.textContent; btn.textContent = T("syncing");
    try {
      await flushOutbox();
      await refresh();
      repaint(); setSync();
      m.hidden = false; m.className = "msg info"; m.textContent = T("sync_updated");
    } catch (e) {
      m.hidden = false; m.className = "msg err"; m.textContent = T("error") + ((e && e.message) || e);
    } finally { btn.disabled = false; btn.textContent = t; }
  }

  async function changePassword() {
    const inp = $("#newpw"), m = $("#pwmsg"), btn = $("#savepw");
    const pw = (inp.value || "");
    if (pw.length < 6) { m.hidden = false; m.className = "msg err"; m.textContent = T("pw_short"); return; }
    btn.disabled = true;
    try {
      const { error } = await SB.auth.updateUser({ password: pw });
      if (error) throw error;
      inp.value = ""; m.hidden = false; m.className = "msg info"; m.textContent = T("pw_saved");
    } catch (e) {
      m.hidden = false; m.className = "msg err"; m.textContent = T("error") + ((e && e.message) || e);
    } finally { btn.disabled = false; }
  }

  // ================= auth / boot =================
  async function boot() {
    loadPrefs(); applyTheme(); applyLang();
    registerSW();
    $("#back").addEventListener("click", () => { S.view = "week"; S.current = null; renderWeek(); });
    $("#gear").addEventListener("click", (e) => {
      e.stopPropagation();
      const p = $("#settingspanel");
      if (p.hidden) { renderSettings(); p.hidden = false; } else p.hidden = true;
    });
    document.addEventListener("click", (e) => {
      const p = $("#settingspanel");
      if (!p.hidden && !p.contains(e.target) && e.target.id !== "gear") p.hidden = true;
    });
    window.addEventListener("online", () => { setSync(); flushOutbox().then(repaint); });
    window.addEventListener("offline", setSync);
    // Supabase runs this callback while holding the auth lock; calling any SB.* inside it deadlocks.
    // Defer to the next tick, out of the lock, before (re-)routing.
    SB.auth.onAuthStateChange(() => { setTimeout(route, 0); });
    await route();
  }

  let _routing = false, _pending = false;
  async function route() {
    if (_routing) { _pending = true; return; }
    _routing = true;
    try { await _route(); } finally { _routing = false; if (_pending) { _pending = false; route(); } }
  }

  async function _route() {
    const { data } = await SB.auth.getSession();
    const session = data && data.session;
    if (!session) {
      // No session. If "remember me" is on and we're offline, show the plan we already cached
      // instead of blocking on a login the athlete cannot complete without a connection.
      if (!navigator.onLine && rememberOn()) {
        await loadAthlete();                       // offline branch reads the cached athlete
        if (S.athleteId) {
          await loadCache();
          if (S.weeks.length) {
            topbar.hidden = false;
            if (S.weekIdx == null) S.weekIdx = currentWeekIdx();
            renderWeek(); setSync(); return;
          }
        }
      }
      showLogin(); return;
    }
    S.email = (session.user && session.user.email) || "";
    topbar.hidden = false;
    if (!S.athleteId) await loadAthlete();
    if (!S.athleteId && navigator.onLine) {   // signed in, but this email is linked to no athlete
      renderNotConnected(data.session.user && data.session.user.email);
      return;
    }
    if (!S.weeks.length) await loadCache();
    if (S.weekIdx == null) S.weekIdx = currentWeekIdx();
    renderWeek();
    if (navigator.onLine) {
      try { await refresh(); if (S.weekIdx == null) S.weekIdx = currentWeekIdx(); repaint(); } catch (e) { console.warn("refresh failed", e); }
      flushOutbox().then(repaint);
    }
    setSync();
  }

  function repaint() { if (S.view === "session" && S.current) renderSession(S.current); else renderWeek(); }

  // ================= data =================
  async function loadAthlete() {
    // Online, trust the server: who this email belongs to now. Clear a stale cached athlete so a
    // different person signing in on the same device never inherits the previous one's id.
    if (navigator.onLine) {
      const { data } = await SB.from("athlete_account").select("athlete_id, display_name").maybeSingle();
      if (data) { S.athleteId = data.athlete_id; S.displayName = data.display_name || ""; await idbSet("cache", "athlete", data); }
      else { S.athleteId = null; S.displayName = ""; await idbDel("cache", "athlete"); }
      return;
    }
    const cached = await idbGet("cache", "athlete");
    if (cached) { S.athleteId = cached.athlete_id; S.displayName = cached.display_name || ""; }
  }
  async function loadCache() {
    const p = await idbGet("cache", "plan");
    if (p) applyPlan(p);
    const logs = await idbGet("cache", "logs"); if (logs) S.logs = logs;
    await loadOutbox();
  }
  function applyPlan(p) {
    S.meta = p.meta || null;
    S.prefs = (S.meta && S.meta.prefs) || {};
    S.weeks = (p.weeks || []).slice().sort((a, b) => (a.monday < b.monday ? -1 : 1));
    S.sessions = p.sessions || [];
    S.tests = p.tests || [];
    S.zones = p.zones || {};
    S.fieldSpec = {}; ((S.meta && S.meta.field_spec) || []).forEach((f) => { S.fieldSpec[f.name] = f; });
  }
  async function refresh() {
    const [meta, weeks, sessions, tests, zones, logs] = await Promise.all([
      SB.from("plan_meta").select("*").maybeSingle(),
      SB.from("plan_week").select("*").order("monday"),
      SB.from("plan_session").select("*").order("on_date"),
      SB.from("plan_test").select("*").order("on_date"),
      SB.from("zone_sheet").select("*"),
      SB.from("log").select("*"),
    ]);
    const zmap = {}; (zones.data || []).forEach((z) => { zmap[z.key] = z; });
    const p = { meta: meta.data, weeks: weeks.data || [], sessions: sessions.data || [], tests: tests.data || [], zones: zmap };
    applyPlan(p);
    S.logs = {}; (logs.data || []).forEach((r) => { S.logs[`${r.on_date}|${r.session_key}`] = r; });
    await idbSet("cache", "plan", p);
    await idbSet("cache", "logs", S.logs);
    await loadOutbox();
  }
  async function loadOutbox() { S.outbox = {}; (await idbAll("outbox")).forEach((it) => { S.outbox[it.key] = it; }); }

  // ================= login =================
  function showLogin() {
    topbar.hidden = true; $("#settingspanel").hidden = true;
    app.innerHTML = `
      <div class="login">
        <h1>${T("login_title")}</h1>
        <p class="muted small">${T("login_sub")}</p>
        <div class="card">
          <div class="field">
            <label for="email">${T("email")}</label>
            <input id="email" type="email" inputmode="email" autocomplete="email" placeholder="${T("email_ph")}">
          </div>
          <div class="field">
            <label for="password">${T("password")}</label>
            <input id="password" type="password" autocomplete="current-password" placeholder="${T("password_ph")}">
          </div>
          <label class="check"><input id="remember" type="checkbox" ${rememberOn() ? "checked" : ""}> ${T("remember")}</label>
          <button id="signin" class="primary" type="button">${T("signin")}</button>
          <div id="loginmsg" class="msg err" hidden></div>
          <p class="note">${T("first_login_hint")}</p>
        </div>
        <div class="segmented" data-set="lang" style="max-width:16rem">
          <button data-v="en" class="${S.lang === "en" ? "active" : ""}">English</button>
          <button data-v="it" class="${S.lang === "it" ? "active" : ""}">Italiano</button>
        </div>
      </div>`;
    app.querySelectorAll('[data-set="lang"] button').forEach((b) => b.addEventListener("click", () => {
      S.lang = b.getAttribute("data-v"); savePref("lang", S.lang); applyLang(); showLogin();
    }));
    const msg = $("#loginmsg");
    const showErr = (txt) => { msg.hidden = false; msg.className = "msg err"; msg.textContent = txt; };
    async function doSignIn() {
      const email = $("#email").value.trim().toLowerCase();
      const password = $("#password").value;
      if (!email) return showErr(T("enter_email"));
      if (!password) return showErr(T("enter_password"));
      // Save the remember choice BEFORE signing in, so the new session lands in the right store.
      savePref("remember", $("#remember").checked ? "1" : "0");
      const btn = $("#signin"); btn.disabled = true; const t = btn.textContent; btn.textContent = T("signing_in");
      try {
        const { error } = await SB.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // onAuthStateChange re-routes us into the app.
      } catch (e) {
        const m = ((e && e.message) || "").toLowerCase();
        showErr(m.includes("invalid") || m.includes("credential") ? T("bad_login") : T("error") + ((e && e.message) || e));
        btn.disabled = false; btn.textContent = t;
      }
    }
    $("#signin").addEventListener("click", doSignIn);
    $("#password").addEventListener("keydown", (e) => { if (e.key === "Enter") doSignIn(); });
  }

  function renderNotConnected(email) {
    S.view = "week"; S.current = null; $("#back").hidden = true;
    app.innerHTML = `<div class="card" style="margin-top:2rem">
      <h1>${T("not_conn_title")}</h1>
      <p class="muted">${T("not_conn_sub", { email: esc(email || "") })}</p>
      <button id="nc_out" class="ghost">${T("signout")}</button>
    </div>`;
    const b = $("#nc_out"); if (b) b.addEventListener("click", doSignOut);
  }

  // ================= week view =================
  function currentWeekIdx() {
    const t = todayISO();
    let i = S.weeks.findIndex((w) => w.monday <= t && t <= w.sunday);
    if (i < 0) i = S.weeks.findIndex((w) => w.monday > t);
    return i < 0 ? Math.max(0, S.weeks.length - 1) : i;
  }
  function sessionsOn(iso) {
    return S.sessions.filter((s) => s.on_date === iso).sort((a, b) =>
      a.sport === b.sport ? (a.ordinal || 0) - (b.ordinal || 0) : a.sport < b.sport ? -1 : 1);
  }
  function testsOn(iso) { return S.tests.filter((t) => t.on_date === iso); }

  function logState(s) {
    const k = lkey(s);
    const pend = S.outbox[k];
    const rec = (pend && pend.record) || S.logs[k];
    if (!rec) return null;
    const c = rec.payload && rec.payload.completed;
    const done = c === "1" || c === 1 || c === "yes" || c === true;
    return { rec, done, pending: !!pend, doneOn: rec.done_on };
  }

  // Planned vs done minutes per sport for a week — same logic as the coach calendar's Totals column:
  // planned = sum of session minutes by sport; done = sum of logged minutes of COMPLETED sessions,
  // counted against the planned (date, session_key) so a "done on another day" log stays in its week.
  const SPORT_ORDER = ["swim", "bike", "run", "strength"];
  function weekTotals(monday) {
    const planned = {}, done = {};
    for (let i = 0; i < 7; i++) {
      sessionsOn(addDays(monday, i)).forEach((s) => {
        planned[s.sport] = (planned[s.sport] || 0) + (s.minutes || 0);
        const st = logState(s);
        if (st && st.done) done[s.sport] = (done[s.sport] || 0) + (Number((st.rec.payload || {}).minutes) || 0);
      });
    }
    const extra = Object.keys(Object.assign({}, planned, done)).filter((s) => SPORT_ORDER.indexOf(s) < 0);
    const rows = [];
    SPORT_ORDER.concat(extra).forEach((sport) => {
      const pl = planned[sport] || 0, dn = done[sport] || 0;
      if (pl || dn) rows.push({ sport, planned: pl, done: dn });
    });
    return rows;
  }

  function renderWeek() {
    S.view = "week"; S.current = null; $("#back").hidden = true;
    if (!S.weeks.length) {
      app.innerHTML = `<div class="card"><p>${T("no_plan")}</p><p class="muted small">${T("no_plan_sub")}</p></div>`;
      return;
    }
    const c = cal();
    const w = S.weeks[S.weekIdx];
    const t = todayISO();
    let html = `
      <div class="weekhead">
        <button class="navbtn" id="prev" ${S.weekIdx <= 0 ? "disabled" : ""} aria-label="‹">‹</button>
        <h2>${T("week_n", { n: w.week_index })}</h2>
        <button class="navbtn" id="today">${T("today")}</button>
        <button class="navbtn" id="next" ${S.weekIdx >= S.weeks.length - 1 ? "disabled" : ""} aria-label="›">›</button>
      </div>
      <div class="weekmeta">${esc(w.period || "")}${w.is_recovery ? ` · <span class="badge recovery">${T("recovery")}</span>` : ""}${w.hours_shown != null ? " · " + w.hours_shown + " h" : ""} · ${shortDay(w.monday)} – ${shortDay(w.sunday)}</div>`;

    for (let i = 0; i < 7; i++) {
      const iso = addDays(w.monday, i);
      const d = parseD(iso);
      const sess = sessionsOn(iso);
      const tsts = testsOn(iso);
      html += `<div class="day ${iso === t ? "today" : ""}"><div class="dayhead">${cap(c.WD_FULL[i])} <span class="dd">${d.getDate()} ${c.MO[d.getMonth()]}</span></div>`;
      if (!sess.length && !tsts.length) {
        html += `<div class="rest">${T("rest")}</div>`;
      } else {
        tsts.forEach((ts) => {
          html += `<div class="sess" data-test="${esc(iso)}|${esc(ts.protocol)}"><div class="body"><div class="t">${T("test_prefix")}${esc(ts.name || ts.protocol)} <span class="badge test">${T("badge_test")}</span></div><div class="sub">${esc(ts.sport || "")}</div></div></div>`;
        });
        sess.forEach((s) => {
          const st = logState(s);
          let chip = "";
          if (st) chip = st.pending ? `<span class="chip pend">${T("queued")}</span>`
            : st.done ? `<span class="chip done">${T("logged")}</span>` : `<span class="chip skip">${T("skipped")}</span>`;
          const zone = s.zone && s.zone !== "-" ? ` · Z${esc(s.zone)}` : "";
          html += `<button class="sess" data-key="${esc(iso)}|${esc(s.session_key)}">
            <div class="body"><div class="t">${esc(s.title)}${s.is_bt ? ` <span class="badge bt">${T("badge_key")}</span>` : ""}</div>
            <div class="sub">${hhmm(s.minutes)} · ${esc(s.sport)}${zone}</div></div>
            ${chip}<span class="chevron">›</span></button>`;
        });
      }
      html += `</div>`;
    }

    const trows = weekTotals(w.monday);
    if (trows.length) {
      let tp = 0, td = 0;
      const body = trows.map((r) => {
        tp += r.planned; td += r.done;
        return `<tr class="${esc(r.sport)}"><td><span class="sport"><span class="dot"></span>${cap(esc(r.sport))}</span></td>` +
               `<td class="num">${hhmm(r.planned)}</td><td class="num">${r.done ? hhmm(r.done) : "—"}</td></tr>`;
      }).join("");
      html += `<div class="weektotals"><div class="tothead">${T("totals")}</div>` +
        `<table class="tot"><thead><tr><th></th><th class="num">${T("t_plan")}</th><th class="num">${T("t_done")}</th></tr></thead>` +
        `<tbody>${body}</tbody>` +
        `<tbody><tr class="sum"><td>${T("t_total")}</td><td class="num">${hhmm(tp)}</td><td class="num">${hhmm(td)}</td></tr></tbody></table></div>`;
    }

    app.innerHTML = html;
    $("#prev").addEventListener("click", () => { if (S.weekIdx > 0) { S.weekIdx--; renderWeek(); scrollTop(); } });
    $("#next").addEventListener("click", () => { if (S.weekIdx < S.weeks.length - 1) { S.weekIdx++; renderWeek(); scrollTop(); } });
    $("#today").addEventListener("click", () => { S.weekIdx = currentWeekIdx(); renderWeek(); scrollTop(); });
    app.querySelectorAll("[data-key]").forEach((b) => b.addEventListener("click", () => {
      const [iso, key] = b.getAttribute("data-key").split("|");
      const s = S.sessions.find((x) => x.on_date === iso && x.session_key === key);
      if (s) renderSession(s);
    }));
    app.querySelectorAll("[data-test]").forEach((b) => b.addEventListener("click", () => {
      const [iso, proto] = b.getAttribute("data-test").split("|");
      const ts = S.tests.find((x) => x.on_date === iso && x.protocol === proto);
      if (ts) renderTest(ts);
    }));
  }
  function scrollTop() { window.scrollTo(0, 0); }

  // ================= session detail =================
  function targetHtml(t) {
    if (!t) return "";
    let s = `<div class="sectiontitle">${T("target")}</div><div class="target">`;
    if (t.range) {
      s += `<strong>${esc(t.range)}</strong>${t.unit ? " " + esc(t.unit) : ""}`;
      if (t.talk) s += ` · ${T("talk")} ${esc(t.talk)}`;
      if (t.rpe) s += ` · RPE ${esc(t.rpe[0])}–${esc(t.rpe[1])}`;
    } else {
      s += `${T("no_numeric")}${t.why ? " (" + esc(t.why) + ")" : ""}. ${T("use_talk")} <em>${esc(t.talk || "")}</em>`;
    }
    return s + `</div>`;
  }
  function fuelHtml(f, sport, minutes) {
    if (!f || sport === "strength") return "";
    if (f.water_only) return `<div class="sectiontitle">${T("nutrition")}</div><p class="note">${T("water_only")}</p>`;
    const r = (x) => Math.round(x || 0);
    const rows = [];
    rows.push(`<tr><th>${T("during")}</th><td>${T("carb_h", { g: r(f.during_carb_g_h) })} <span class="note">(${T("during_note", { kcal: r(f.during_kcal_h), total: r(f.total_carb_g) })})</span></td></tr>`);
    rows.push(`<tr><th>${T("fluids")}</th><td>${T("fluids_v", { ml: r(f.fluid_ml_h) })}</td></tr>`);
    rows.push(`<tr><th>${T("sodium")}</th><td>${T("sodium_v", { mg: r(f.sodium_mg_h) })}</td></tr>`);
    if (f.pre_kcal) rows.push(`<tr><th>${T("before")}</th><td>${r(f.pre_kcal[0])}–${r(f.pre_kcal[1])} kcal <span class="note">${minutes >= 60 ? T("before_2h") : T("before_10m")}</span></td></tr>`);
    rows.push(`<tr><th>${T("after")}</th><td>${r(f.post_kcal)} kcal <span class="note">${T("within30")}</span></td></tr>`);
    let extra = "";
    if (f.needs_multi_transportable) extra += `<p class="note">${T("multi")}</p>`;
    if (f.notes && f.notes.length) extra += `<ul class="lines note">${f.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`;
    return `<div class="sectiontitle">${T("nutrition")}</div><table class="fuel"><tbody>${rows.join("")}</tbody></table>${extra}`;
  }
  function renderSession(s) {
    S.view = "session"; S.current = s; $("#back").hidden = false;
    const zone = s.zone && s.zone !== "-" ? ` · Z${esc(s.zone)}` : "";
    let html = `<div class="detail">
      <div class="muted small">${longDay(s.on_date)}</div>
      <h1>${esc(s.title)}${s.is_bt ? ` <span class="badge bt">${T("badge_key")}</span>` : ""}${s.is_test ? ` <span class="badge test">${T("badge_test")}</span>` : ""}</h1>
      <div class="kv">${hhmm(s.minutes)} · ${esc(s.sport)}${zone}</div>`;
    html += targetHtml(s.target);
    if (s.detail && s.detail.length) html += `<div class="sectiontitle">${T("detail")}</div><ul class="lines">${s.detail.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
    html += fuelHtml(s.fuel, s.sport, s.minutes);
    if (s.provenance) html += `<p class="note">${esc(s.provenance)}</p>`;
    html += logSectionHtml(s);
    html += `</div>`;
    app.innerHTML = html;
    scrollTop();
    wireLogForm(s);
  }
  function renderTest(ts) {
    S.view = "session"; S.current = null; $("#back").hidden = false;
    let html = `<div class="detail">
      <div class="muted small">${longDay(ts.on_date)}</div>
      <h1>${T("test_prefix")}${esc(ts.name || ts.protocol)}</h1>
      <div class="kv">${esc(ts.sport || "")}</div>`;
    if (ts.reason) html += `<p class="note">${esc(ts.reason)}</p>`;
    if (ts.warm_up) html += `<div class="sectiontitle">${T("warm_up")}</div><p>${esc(ts.warm_up)}</p>`;
    if (ts.instructions && ts.instructions.length) html += `<div class="sectiontitle">${T("how")}</div><ul class="lines">${ts.instructions.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
    if (ts.yields) html += `<div class="sectiontitle">${T("measures")}</div><p>${esc(ts.yields)}</p>`;
    if (ts.provenance) html += `<p class="note">${esc(ts.provenance)}</p>`;
    html += `<p class="note">${T("test_coach")}</p></div>`;
    app.innerHTML = html;
    scrollTop();
  }

  // ================= logging =================
  function unitOptions(sport) {
    return sport === "swim" ? [["m", "m"], ["yd", "yd"]] : [["km", "km"], ["mi", "mi"]];
  }
  function defaultUnit(sport) {
    const metric = (S.meta && S.meta.units) !== "imperial";
    if (sport === "swim") return metric ? "m" : "yd";
    return metric ? "km" : "mi";
  }

  function logSectionHtml(s) {
    const st = logState(s);
    let box = "";
    if (st) {
      const p = st.rec.payload || {};
      const rows = [];
      if (st.done) {
        if (p.minutes) rows.push(`<tr><th>${T("r_duration")}</th><td>${hhmm(p.minutes)}</td></tr>`);
        if (p.distance) rows.push(`<tr><th>${T("r_distance")}</th><td>${esc(p.distance)} ${esc(p.distance_unit || "")}</td></tr>`);
        if (p.avg_hr) rows.push(`<tr><th>${T("r_avghr")}</th><td>${esc(p.avg_hr)} bpm</td></tr>`);
        if (p.avg_power) rows.push(`<tr><th>${T("r_power")}</th><td>${esc(p.avg_power)} W</td></tr>`);
        if (p.rpe) rows.push(`<tr><th>RPE</th><td>${esc(p.rpe)}/10</td></tr>`);
        if (p.felt) rows.push(`<tr><th>${T("r_felt")}</th><td>${esc(feltLabel(p.felt))}</td></tr>`);
        if (p.carb_g) rows.push(`<tr><th>${T("r_carb")}</th><td>${esc(p.carb_g)} g</td></tr>`);
        if (p.gi_symptoms) rows.push(`<tr><th>${T("r_gut")}</th><td>${esc(p.gi_symptoms)}</td></tr>`);
        if (p.note) rows.push(`<tr><th>${T("r_note")}</th><td>${esc(p.note)}</td></tr>`);
      } else {
        rows.push(`<tr><th>${T("skipped")}</th><td>${esc(p.skip_reason || T("no_reason"))}</td></tr>`);
      }
      const moved = st.doneOn ? ` · ${T("done_on_s", { day: shortDay(st.doneOn) })}` : "";
      box = `<div class="loggedbox"><strong>${st.done ? T("logged") : T("skipped")}${moved}</strong>${st.pending ? ` <span class="chip pend">${T("queued")}</span>` : ""}
             <table><tbody>${rows.join("")}</tbody></table>
             ${st.doneOn ? `<p class="note">${T("moved_note")}</p>` : ""}</div>`;
    }
    const fields = (s.log_fields || []).filter((n) => n !== "completed" && n !== "distance_unit");
    const pre = (st && st.rec.payload) || {};
    const weekMonday = weekMondayOf(s.on_date);
    let doneOpts = "";
    const chosen = (st && st.doneOn) || s.on_date;
    for (let i = 0; i < 7; i++) { const iso = addDays(weekMonday, i); doneOpts += `<option value="${iso}" ${iso === chosen ? "selected" : ""}>${shortDay(iso)}${iso === s.on_date ? T("planned") : ""}</option>`; }
    let inputs = `<div class="field"><label for="f_done_on">${T("done_on")}</label><select id="f_done_on" name="done_on">${doneOpts}</select></div>`;
    fields.forEach((name) => {
      const f = S.fieldSpec[name];
      if (!f) return;
      const val = pre[name] != null ? pre[name] : (name === "minutes" && !st ? s.minutes : "");
      inputs += fieldHtml(f, s, val);
    });
    return `
      <div class="sectiontitle">${st ? T("log_edit") : T("log_new")}</div>
      <form id="logform">${inputs}
        <div class="actions">
          <button type="button" class="primary" data-act="done">${st && st.done ? T("save") : T("save_done")}</button>
          <button type="button" class="ghost" data-act="skip">${T("mark_skip")}</button>
        </div>
      </form>
      ${box}`;
  }

  function fieldHtml(f, s, val) {
    const req = f.compulsory ? ` <span class="req">${T("required")}</span>` : "";
    const help = f.help ? `<div class="help">${esc(f.help)}</div>` : "";
    const lab = `<label for="f_${f.name}">${esc(f.label)}${req}</label>`;
    let control;
    if (f.name === "distance") {
      const opts = unitOptions(s.sport).map(([v, l]) => `<option value="${v}" ${v === defaultUnit(s.sport) ? "selected" : ""}>${l}</option>`).join("");
      control = `<div class="row2"><input id="f_distance" name="distance" type="number" inputmode="decimal" step="any" min="0" value="${esc(val)}">
                 <select class="unit" name="distance_unit" aria-label="unit">${opts}</select></div>`;
    } else if (f.kind === "choice") {
      const opts = (f.options || []).map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(val) ? "selected" : ""}>${esc(l)}</option>`).join("");
      control = `<select id="f_${f.name}" name="${f.name}"><option value=""></option>${opts}</select>`;
    } else if (f.kind === "text") {
      control = `<input id="f_${f.name}" name="${f.name}" type="text" value="${esc(val)}">`;
    } else {
      const step = f.kind === "float" ? "any" : "1";
      control = `<input id="f_${f.name}" name="${f.name}" type="number" inputmode="${f.kind === "float" ? "decimal" : "numeric"}" step="${step}"${f.lo != null ? ` min="${f.lo}"` : ""}${f.hi != null ? ` max="${f.hi}"` : ""} value="${esc(val)}">`;
    }
    return `<div class="field">${lab}${control}${help}</div>`;
  }

  function weekMondayOf(iso) {
    const w = S.weeks.find((x) => x.monday <= iso && iso <= x.sunday);
    if (w) return w.monday;
    const d = parseD(iso); return addDays(iso, -wdIdx(d));
  }
  function wireLogForm(s) {
    const form = $("#logform");
    if (!form) return;
    form.querySelectorAll("[data-act]").forEach((btn) => btn.addEventListener("click", () => saveLog(s, btn.getAttribute("data-act") === "done")));
  }
  async function saveLog(s, completed) {
    const form = $("#logform");
    const payload = { completed: completed ? "1" : "0", sport: s.sport };
    (s.log_fields || []).forEach((name) => {
      if (name === "completed") return;
      const inp = form.elements[name];
      if (!inp) return;
      const v = (inp.value || "").trim();
      if (v !== "") payload[name] = v;
    });
    if (!completed) { const sr = form.elements["skip_reason"]; if (sr && sr.value.trim()) payload.skip_reason = sr.value.trim(); }
    const chosen = form.elements["done_on"] ? form.elements["done_on"].value : s.on_date;
    const k = lkey(s);
    const prevRev = (S.outbox[k] && S.outbox[k].record.client_rev) || (S.logs[k] && S.logs[k].client_rev) || 0;
    const record = {
      athlete_id: S.athleteId, on_date: s.on_date, session_key: s.session_key,
      done_on: chosen === s.on_date ? null : chosen,
      payload, device_id: deviceId(), client_rev: prevRev + 1,
      client_updated_at: new Date().toISOString(), snapshot_checksum: (S.meta && S.meta.checksum) || null,
    };
    await idbPut("outbox", { key: k, record });
    S.outbox[k] = { key: k, record };
    renderSession(s);
    flushOutbox().then(() => { if (S.current === s) renderSession(s); setSync(); });
  }
  async function flushOutbox() {
    if (!navigator.onLine) return;
    const items = await idbAll("outbox");
    for (const it of items) {
      try {
        const { error } = await SB.from("log").upsert(it.record, { onConflict: "athlete_id,on_date,session_key" });
        if (error) throw error;
        await idbDel("outbox", it.key);
        delete S.outbox[it.key];
        S.logs[it.key] = Object.assign({}, it.record);
      } catch (e) { console.warn("flush failed for", it.key, e); break; }
    }
    await idbSet("cache", "logs", S.logs);
  }

  // ================= chrome =================
  function setSync() {
    const el = $("#sync");
    if (!el) return;
    const n = Object.keys(S.outbox).length;
    if (!navigator.onLine) el.textContent = n ? T("sync_offline_q", { n }) : T("sync_offline");
    else el.textContent = n ? T("sync_send", { n }) : T("sync_updated");
  }
  function registerSW() {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW registration failed", e));
  }

  boot();
})();
