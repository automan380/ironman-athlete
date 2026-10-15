/* Athlete app. Reads the published plan (RLS-scoped to the signed-in athlete), shows it with the
 * same detail as the coach's day view, and logs sessions back to Supabase — offline-first.
 * The app NEVER moves or recomputes anything: it records what the athlete did (incl. "done on a
 * different day"); the coach bridge applies any move. Vanilla JS, no build step.
 * UI is English by default; a gear menu switches theme (auto/light/dark) and language (en/it). */
(function () {
  "use strict";

  const APP_VERSION = "2.7.0";          // shown in the settings menu; keep in step with CHANGELOG.md
  let pendingReload = false;            // set when the athlete taps "update"; drives the one reload below
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
  // The vendored Supabase library must have loaded before this runs (index.html loads it first). If a
  // precache gap ever serves something else in its place, fail with a readable message instead of a
  // silent white page -- createClient would otherwise throw at module load and nothing would render.
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    try {
      document.getElementById("app").innerHTML =
        '<div class="boot err">Couldn\'t load a required file. Reconnect once and reopen the app.</div>';
    } catch (e) { /* ignore */ }
    return;
  }
  const SB = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, detectSessionInUrl: false, autoRefreshToken: true, storage: authStorage },
  });

  // ---------- i18n ----------
  const STR = {
    en: {
      brand: "Ironman Planner", signout: "Sign out", back: "Back", settings: "Settings", menu: "Menu",
      nav_quest: "Questionnaires", nav_plan: "Plan", nav_zones: "Zones", nav_moving: "Moving workouts", nav_account: "Account", nav_settings: "Settings",
      no_zones: "No test results yet — your zones will appear here once your coach records a test.",
      threshold: "threshold", quest_soon: "You'll fill in your questionnaires here — coming soon.",
      m_hr: "Heart rate", m_power: "Power", m_pace: "Pace",
      quest_loading: "Loading your questionnaire…",
      quest_intro: "Fill this in so your coach can build your plan. You can stop and come back — your answers are saved on this device.",
      quest_review: "Review your answers", review_btn: "Review", send_to_coach: "Send to coach",
      back_edit: "Back to edit", edit_answers: "Edit answers", sending: "Sending…",
      quest_sent: "Sent. Your coach will build your plan — it'll appear under Plan.",
      quest_done: "You've completed your questionnaire. Your coach built your plan — see Plan.",
      quest_offline_fill: "You're offline — your answers are saved. Connect to send them.",
      quest_answer: "Please answer: {q}", coach_only: "For your coach — not used to build the plan",
      yes: "Yes", no: "No", unanswered: "—",
      nav_inbox: "Notifications", notifications: "Notifications", no_messages: "No notifications yet.",
      write_coach: "Message your coach", msg_kind: "About", kind_bug: "A bug / problem", kind_plan: "My training plan",
      msg_send: "Send", msg_sent: "Sent to your coach.", msg_offline: "You're offline — connect to send.",
      select_all: "Select all", deselect: "Deselect", del_selected: "Delete", del_offline: "You're offline — connect to delete.",
      msg_placeholder: "Write your message…",
      n_message: "Message from your coach", n_plan: "Plan updated", n_zones: "Zones updated", n_app: "App updated",
      n_app_available: "Update available", app_available: "A new version of the app is ready — tap to update.",
      app_update_now: "Update now",
      app_updated: "App updated to v{v}.",
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
      test_cta: "Enter your test result",
      test_log_opt: "Log the session (minutes, how it felt)",
      test_from_session: "This is a test — enter your result (the numbers your coach needs)",
      test_enter: "Enter your result", test_submit: "Send to coach", test_update: "Update result",
      test_submitting: "Sending…",
      test_sent: "Sent. Your coach will review and approve it — your zones update once they do.",
      test_pending: "Already sent, waiting for your coach. You can correct it and send again.",
      test_offline: "You're offline — connect to send your result.",
      test_queued: "Saved on your phone — it'll be sent to your coach when you're back online.",
      test_bad_time: "Enter a time as mm:ss, e.g. 19:20.",
      test_need: "Fill in {field}.", test_conditions: "Conditions (optional)",
      test_indoor: "Done indoors / on a trainer", mmss: "mm:ss",
      log_edit: "Edit log", log_new: "Log the session", done_on: "Done on", planned: " (planned)",
      required: "·required", save_done: "Save as done", save: "Save", mark_skip: "Mark skipped",
      logged: "Logged", skipped: "Skipped", queued: "queued", done_on_s: "done {day}",
      r_duration: "Duration", r_distance: "Distance", r_avghr: "Avg HR", r_power: "Power",
      r_felt: "Felt", r_carb: "Carbs", r_gut: "Gut", r_note: "Note", no_reason: "no reason given",
      moved_note: "Done on another day: the session will move once your coach syncs.",
    },
    it: {
      brand: "Ironman Planner", signout: "Esci", back: "Indietro", settings: "Impostazioni", menu: "Menu",
      nav_quest: "Questionari", nav_plan: "Piano", nav_zones: "Zone", nav_moving: "Spostare gli allenamenti", nav_account: "Account", nav_settings: "Impostazioni",
      no_zones: "Nessun test ancora — le tue zone compariranno qui dopo che il coach registra un test.",
      threshold: "soglia", quest_soon: "Qui compilerai i tuoi questionari — disponibile a breve.",
      m_hr: "Frequenza cardiaca", m_power: "Potenza", m_pace: "Passo",
      quest_loading: "Carico il tuo questionario…",
      quest_intro: "Compila così il coach può costruire il tuo piano. Puoi fermarti e riprendere — le risposte restano salvate su questo dispositivo.",
      quest_review: "Rivedi le risposte", review_btn: "Rivedi", send_to_coach: "Invia al coach",
      back_edit: "Torna a modificare", edit_answers: "Modifica le risposte", sending: "Invio…",
      quest_sent: "Inviato. Il coach costruirà il tuo piano — comparirà in Piano.",
      quest_done: "Hai completato il questionario. Il coach ha costruito il tuo piano — vedi Piano.",
      quest_offline_fill: "Sei offline — le risposte sono salvate. Collegati per inviarle.",
      quest_answer: "Rispondi a: {q}", coach_only: "Per il coach — non usato per costruire il piano",
      yes: "Sì", no: "No", unanswered: "—",
      nav_inbox: "Notifiche", notifications: "Notifiche", no_messages: "Nessuna notifica.",
      write_coach: "Scrivi al coach", msg_kind: "Riguardo", kind_bug: "Un bug / problema", kind_plan: "Il mio piano",
      msg_send: "Invia", msg_sent: "Inviato al coach.", msg_offline: "Sei offline — collegati per inviare.",
      select_all: "Seleziona tutti", deselect: "Deseleziona", del_selected: "Cancella", del_offline: "Sei offline — collegati per cancellare.",
      msg_placeholder: "Scrivi il tuo messaggio…",
      n_message: "Messaggio dal coach", n_plan: "Piano aggiornato", n_zones: "Zone aggiornate", n_app: "App aggiornata",
      n_app_available: "Aggiornamento disponibile", app_available: "È pronta una nuova versione dell'app — tocca per aggiornare.",
      app_update_now: "Aggiorna ora",
      app_updated: "App aggiornata alla v{v}.",
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
      test_cta: "Inserisci il risultato del test",
      test_log_opt: "Registra la sessione (minuti, com'è andata)",
      test_from_session: "Questo è un test — inserisci il risultato (i numeri che servono al coach)",
      test_enter: "Inserisci il risultato", test_submit: "Invia al coach", test_update: "Aggiorna il risultato",
      test_submitting: "Invio…",
      test_sent: "Inviato. Il coach lo esaminerà e approverà — le zone si aggiornano quando lo fa.",
      test_pending: "Già inviato, in attesa del coach. Puoi correggerlo e inviarlo di nuovo.",
      test_offline: "Sei offline — collegati per inviare il risultato.",
      test_queued: "Salvato sul telefono — verrà inviato al coach al ritorno della rete.",
      test_bad_time: "Inserisci un tempo come mm:ss, es. 19:20.",
      test_need: "Compila: {field}.", test_conditions: "Condizioni (facoltativo)",
      test_indoor: "Fatto al chiuso / sui rulli", mmss: "mm:ss",
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
    fieldSpec: {}, weekIdx: null, section: "plan", view: "week", current: null,
    questionSpec: null, intakeResponse: null, intakeDraft: {}, intakeStep: "form", navChosen: false,
    messages: [], appNotice: null, swWaiting: null, submissions: {},
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
    const mb = $("#menu"); if (mb) mb.setAttribute("aria-label", T("menu"));
    const bk = $("#back"); if (bk) bk.setAttribute("aria-label", T("back"));
    const dr = $("#drawer"); if (dr && !dr.hidden) renderDrawer();
    setSync();
  }
  // ---------- side menu (drawer) + section navigation ----------
  const NAV = [["questionnaires", "nav_quest"], ["plan", "nav_plan"], ["zones", "nav_zones"],
               ["moving", "nav_moving"], ["account", "nav_account"], ["settings", "nav_settings"]];
  function renderDrawer() {
    const d = $("#drawer");
    d.innerHTML = NAV.map(([k, lbl]) =>
      `<button class="drawitem ${S.section === k ? "active" : ""}" data-sec="${k}">${esc(T(lbl))}</button>`).join("");
    d.querySelectorAll("[data-sec]").forEach((b) =>
      b.addEventListener("click", () => go(b.getAttribute("data-sec"))));
  }
  function openDrawer() { renderDrawer(); $("#drawer").hidden = false; $("#backdrop").hidden = false; }
  function closeDrawer() { const d = $("#drawer"); if (d) d.hidden = true; const bd = $("#backdrop"); if (bd) bd.hidden = true; }
  function go(section) { S.navChosen = true; S.section = section; S.current = null; closeDrawer(); renderSection(); scrollTop(); }

  function renderSection() {
    if (S.section === "plan") { if (S.current) renderSession(S.current); else renderWeek(); return; }
    $("#back").hidden = true;
    if (S.section === "zones") renderZones();
    else if (S.section === "moving") renderMoving();
    else if (S.section === "account") renderAccount();
    else if (S.section === "settings") renderSettingsPage();
    else if (S.section === "questionnaires") renderQuestionnaires();
    else if (S.section === "inbox") renderInbox();
    else renderWeek();
  }

  // ---------- Zones page ----------
  function mmss(sec) { sec = Math.round(sec || 0); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; }
  function metricLabel(m) {
    if (!m) return "";
    if (m.endsWith("_hr")) return T("m_hr");
    if (m === "bike_power") return T("m_power");
    if (m.endsWith("_pace")) return T("m_pace");
    return "";
  }
  function fmtThreshold(m, v) {
    if (v == null) return "";
    return (m === "run_pace" || m === "swim_pace") ? mmss(v) : String(Math.round(v));
  }
  function renderZones() {
    const list = Object.values(S.zones || {});
    if (!list.length) { app.innerHTML = `<h2 class="pagetitle">${T("nav_zones")}</h2><div class="card"><p class="muted">${T("no_zones")}</p></div>`; return; }
    let html = `<h2 class="pagetitle">${T("nav_zones")}</h2>`;
    list.forEach((z) => {
      const ml = metricLabel(z.metric);
      html += `<div class="zonecard"><div class="zonehead">${cap(esc(z.sport))}${ml ? " · " + esc(ml) : ""}` +
        ` <span class="note">${T("threshold")} ${esc(fmtThreshold(z.metric, z.threshold))}${z.unit ? " " + esc(z.unit) : ""}</span></div>` +
        `<table class="ztable">` +
        (z.zones || []).map((zz) =>
          `<tr class="z"><td class="zn">Z${esc(zz.name)}</td><td>${esc(zz.label)}</td><td class="num">${esc(zz.range)}</td></tr>`).join("") +
        `</table></div>`;
    });
    app.innerHTML = html;
  }

  // ---------- Moving workouts page (Training around the roster) ----------
  function renderMoving() {
    app.innerHTML = `
    <h2 class="pagetitle">${T("nav_moving")}</h2>
    <div class="doc">

      <div class="card lead">
        <p><strong>Who this is for.</strong> Pilots and cabin crew training for an Ironman. Your
        working month is built by somebody else, it changes at short notice, and it moves you
        through five time zones in a week. Everything below is written for that.</p>
        <p><strong>The one sentence that matters.</strong> The plan is a shape, not a timetable.
        The roster comes first and the plan bends around it — as long as you know which parts bend
        and which do not.</p>
        <p class="note">Where these rules come from: they are your coach's, from ten years of
        training for Ironman while flying the line. Where a rule comes from one of the two books
        the plan is built on, or a number the app works out for you, it says so.</p>
      </div>

      <div class="card">
        <h3>Rule number one: a missed session is gone</h3>
        <p><strong>If you miss a session, do not try to make it up the following week.</strong>
        Let it go. Cross it off, tell me, and do next week exactly as it is written.</p>
        <p>This is the rule that gets broken most, and the one that does the most damage. The week
        ahead already has its own work in it, built on the assumption that last week happened.
        Putting a missed long run on top of it gives you a week harder than anything in the plan —
        at the exact moment you are tired, behind and feeling guilty. That is how a missed session
        turns into an injury, and an injury into a month.</p>
        <p>Missing one session costs you almost nothing — Ironman fitness is built over months, not
        weeks. Two sessions crammed into one week costs you a great deal.
        <strong>Never trade a cheap loss for an expensive one.</strong></p>
        <p>If you have missed a lot — a whole week, or most of one — do not try to fix it yourself.
        Tell me and I will rebuild the plan from where you actually are.</p>
      </div>

      <div class="card">
        <h3>Start with the roster, not with the plan</h3>
        <ul>
          <li><strong>Lay the month out side by side.</strong> Put your roster next to the plan and
          mark every day with what is actually possible. Do the whole month in one sitting — ten
          minutes once beats a decision every morning.</li>
          <li><strong>Know what each layover gives you.</strong> Keep your own list and add to it.
          Mine started like this:</li>
        </ul>
        <table class="movetable">
          <tr><th>Layover</th><th>Pool</th><th>Bike</th><th>Run</th><th>Gym</th></tr>
          <tr><td>SFO</td><td class="y">✓</td><td class="y">✓</td><td class="y">✓</td><td class="y">✓</td></tr>
          <tr><td>LAX</td><td class="y">✓</td><td class="y">✓</td><td class="y">✓</td><td class="y">✓</td></tr>
          <tr><td>JNB</td><td class="y">✓</td><td class="n">—</td><td class="y">✓</td><td class="y">✓</td></tr>
          <tr><td>MIA</td><td class="n">—</td><td class="y">✓</td><td class="y">✓</td><td class="y">✓</td></tr>
        </table>
        <p class="note">A hotel with no pool is not a problem if you know before you pack. It is a
        problem if you find out at midnight with a swim on the plan.</p>
        <ul>
          <li><strong>Place the long sessions first.</strong> Put the long ride, the long run and
          the brick on the days you know you are home and clear, then fill everything else around
          them. They are the hardest to fit and the ones you cannot lose.</li>
          <li><strong>A standby day is a day you may lose.</strong> If you train on it, train early.</li>
          <li><strong>Tell me when the roster changes shape</strong>, not after the week has gone.
          Which days you can train on is one of the answers your plan is built from — if a month is
          hopeless I can rebuild the plan around different days.</li>
        </ul>
      </div>

      <div class="card">
        <h3>Which sessions can move, and which cannot</h3>
        <ul>
          <li><strong>"Hard" means four things</strong>, and they are the words printed on the
          session: <strong>Long ride</strong>, <strong>Long run</strong>,
          <strong>Endurance brick</strong> (a ride straight into a run), and anything starting with
          <strong>TEST:</strong>. Everything else is easy, however it feels on the day.</li>
          <li><strong>Never skip the long ride, the long run or the brick.</strong> They are the
          plan. The brick is the only session that teaches your legs to run off the bike — riding
          one day and running the next is not the same thing.</li>
          <li><strong>Easy sessions are fillers, and fillers are what you drop.</strong> Miss one
          and you lose almost nothing. Miss a long run and you lose weeks.</li>
          <li><strong>Leave a day between hard sessions</strong> — an easy session in between, or
          nothing at all.</li>
          <li><strong>Doubling up to buy a day off is fine</strong>, on two conditions: only
          <strong>one hard session</strong> in that day, and the hard sessions either side are still
          a day apart. So this works:</li>
        </ul>
        <ul class="weekex">
          <li><span class="d">Mon</span> Hard bike</li>
          <li><span class="d">Tue</span> Easy run</li>
          <li><span class="d">Wed</span> Hard swim + easy run</li>
          <li><span class="d">Thu</span> Easy bike</li>
          <li><span class="d">Fri</span> Off</li>
          <li><span class="d">Sat</span> Easy bike</li>
          <li><span class="d">Sun</span> Long run</li>
        </ul>
        <ul>
          <li><strong>When you stack two sessions, keep race order</strong>: swim, then bike, then
          run. It is what your body will be asked to do on the day, and the order that hurts least.</li>
          <li><strong>The commute counts.</strong> Run or ride to the pool, swim, then run or ride
          home — that is your easy run or ride done, with no extra time spent.</li>
          <li><strong>If you are short of time, do not trim the long ones.</strong> A three-hour
          ride done in two is a different session, and the week is balanced around those minutes.
          Tell me and I will move it. Easy sessions are the opposite: do what fits.</li>
        </ul>
      </div>

      <div class="card">
        <h3>Flying days, landing days, layovers</h3>
        <ul>
          <li><strong>The day you fly, train in the morning if you can — and keep it easy.</strong>
          An easy session before you go sets up the whole duty. Never a hard one: you are about to
          spend hours sitting still and dry.</li>
          <li><strong>Landing day is off.</strong> If you genuinely feel good, an easy or gym
          session is fine. Never a hard one, and never because the plan says so.</li>
          <li><strong>Short layover: stay on UK time.</strong> Train before lunch or dinner, eat,
          then rest before the flight — in that order.</li>
          <li><strong>Long layover, big time difference:</strong> get outside into daylight as
          early as you can, and put the session in local daylight hours. Do not train in the small
          hours of your own body clock — everything is heavier and that is when people get hurt.</li>
          <li><strong>After a night flight, write the day off in advance.</strong> Put the plan's
          rest day there when you lay out the month, rather than deciding at 07:00 that you are too
          tired. You already knew.</li>
          <li><strong>Pack so a delayed bag cannot cost you a session.</strong> Shoes, shorts,
          goggles and trunks weigh nothing and live in the cabin bag.</li>
          <li><strong>Hotel pools are short and odd.</strong> Count minutes, not lengths — your
          swims are built in minutes anyway.</li>
          <li><strong>Hotel gym bikes lie about power.</strong> Ride to time and feel, ignore the
          console. Treadmills are fine; a slight incline feels closer to the road.</li>
        </ul>
      </div>

      <div class="card">
        <h3>Eating and drinking around it</h3>
        <ul>
          <li><strong>You land dehydrated.</strong> A waking heart rate about <strong>7.5% above
          your usual</strong> is what dehydration looks like, and the app tells you when yours is.
          Drink before you decide anything about the day's training.</li>
          <li><strong>Drink through the flight</strong>, before you are thirsty, and keep drinking
          downroute. Tomorrow's session is decided by what you drank today.</li>
          <li><strong>Eat properly after a session</strong>, especially downroute. Something with
          protein and carbohydrate within the hour.</li>
          <li><strong>Training is not a ticket to the buffet.</strong> It is the most common way a
          season's work turns into no change on the scales at all.</li>
          <li><strong>Practise the fuelling printed on your long sessions.</strong> Those carb,
          fluid and sodium targets are the ones you will use on race day — find out your stomach
          disagrees now, not in August.</li>
          <li><strong>Alcohol on a layover costs you tomorrow's session, not tonight.</strong>
          Decide with tomorrow in mind.</li>
        </ul>
      </div>

      <div class="card">
        <h3>Tired, ill or hurt</h3>
        <ul>
          <li><strong>Take your waking heart rate before you get up</strong>, and put it in the
          app. The cheapest measurement there is, and the one that catches a bad week early.</li>
        </ul>
        <blockquote>Note that if you are dehydrated, your heart rate may go up by 7.5 percent. It is
        also likely to rise if you are stressed or emotional, perhaps by 10–20 percent. … A higher
        than usual resting heart rate can be a sign of illness; if your rate is high, decide whether
        to rest or lower the intensity or duration of training until your heart rate returns to
        normal.<cite>The Triathlon Training Book</cite></blockquote>
        <ul>
          <li><strong>Sleep beats a session, every time.</strong> A session on four hours' sleep
          costs you the next two days — and you still did not get the session.</li>
          <li><strong>Two bad nights in a row: keep the volume, drop the intensity.</strong> Do the
          easy work, move the hard session.</li>
          <li><strong>Ill: nothing below the neck.</strong> A head cold with no fever — easy is
          usually fine. A chest, a fever, aching all over — no training, and no making it up. This
          is judgement, and it should be cautious.</li>
          <li><strong>Hurt: pain that changes how you move means stop.</strong> A niggle that fades
          in the first ten minutes and leaves your stride alone is usually fine. Anything that makes
          you limp or shorten a stride is not.</li>
          <li><strong>If one sport hurts, keep the volume in the others.</strong> A sore shin does
          not stop you riding or swimming.</li>
          <li><strong>Tell me early.</strong> Every message I have had started with "it is probably
          nothing". Send it anyway. A week off now is cheaper than six weeks off later.</li>
          <li><strong>Take the easy week.</strong> When the plan gives you a recovery week, take all
          of it. The training does not make you fitter; recovering from it does.</li>
        </ul>
      </div>

      <div class="card">
        <h3>The gym</h3>
        <ul>
          <li><strong>Optional, and not counted in the week's hours.</strong> Genuinely worth doing
          — it keeps you in one piece — but it never comes before a session on the plan.</li>
          <li><strong>Do it at the end of the day's other sessions</strong>, if you have the time
          and energy. Swim, bike and run first; gym if there is anything left.</li>
          <li><strong>A hotel gym is enough.</strong> Dumbbells, a mat and your own body weight
          cover everything the plan asks for.</li>
        </ul>
      </div>

      <div class="card">
        <h3>Log what you actually did</h3>
        <ul>
          <li><strong>Log the sessions you did and the ones you missed</strong>, with a word about
          why. The missed ones are the useful data: three skipped swims in a month tells me
          something three good ones do not.</li>
          <li><strong>Put the plan in your phone.</strong> The app gives you a calendar feed (the
          <code>.ics</code> link) that keeps itself up to date, so the week travels with you.</li>
        </ul>
      </div>

      <div class="card shortcard">
        <h3>The short version</h3>
        <p class="note">Keep this with your roster.</p>
        <ul>
          <li>A missed session is gone. Never make it up next week.</li>
          <li>Roster first. Plan second.</li>
          <li>Long ride, long run, brick: never skipped.</li>
          <li>Easy sessions are fillers — drop those first.</li>
          <li>One day between hard sessions.</li>
          <li>Two sessions in a day is fine; two hard ones is not.</li>
          <li>Race order when you stack them: swim, bike, run.</li>
          <li>Fly-out day: easy session in the morning.</li>
          <li>Landing day: off.</li>
          <li>Downroute: train, eat, rest, in that order.</li>
          <li>Drink more than you think, eat less than you want.</li>
          <li>Waking heart rate up 10%: rest or go easy.</li>
          <li>Sleep beats a session.</li>
          <li>Hurt changes how you move: stop, and tell me.</li>
          <li>Gym last, and only if there is energy left.</li>
        </ul>
      </div>

    </div>`;
  }

  // ---------- Account page ----------
  function renderAccount() {
    app.innerHTML = `<h2 class="pagetitle">${T("nav_account")}</h2>
      <div class="card">
        <div class="field"><label>${T("email")}</label><div class="readonly">${esc(S.email || "")}</div></div>
        <button id="changepw" class="ghost">${T("change_pw")}</button>
        <div id="pwbox" hidden>
          <input id="newpw" type="password" autocomplete="new-password" placeholder="${T("new_pw_ph")}">
          <button id="savepw" class="primary">${T("save_pw")}</button>
          <div id="pwmsg" class="msg" hidden></div>
        </div>
        <button id="panelsignout" class="ghost">${T("signout")}</button>
      </div>`;
    $("#changepw").addEventListener("click", () => { const b = $("#pwbox"); b.hidden = !b.hidden; if (!b.hidden) $("#newpw").focus(); });
    $("#savepw").addEventListener("click", changePassword);
    $("#panelsignout").addEventListener("click", doSignOut);
  }

  // ---------- Settings page ----------
  function renderSettingsPage() {
    const seg = (set, opts) => `<div class="segmented" data-set="${set}">` +
      opts.map(([v, lbl]) => `<button data-v="${v}" class="${S[set] === v ? "active" : ""}">${esc(lbl)}</button>`).join("") + `</div>`;
    app.innerHTML = `<h2 class="pagetitle">${T("nav_settings")}</h2>
      <div class="card">
        <div class="setgroup"><div class="setlabel">${T("theme")}</div>${seg("theme", [["auto", T("theme_auto")], ["light", T("theme_light")], ["dark", T("theme_dark")]])}</div>
        <div class="setgroup"><div class="setlabel">${T("language")}</div>${seg("lang", [["en", "English"], ["it", "Italiano"]])}</div>
        <button id="syncnow" class="ghost">${T("sync_now")}</button>
        <div id="syncmsg" class="msg" hidden></div>
        <div class="setversion">v${APP_VERSION}</div>
      </div>`;
    app.querySelectorAll(".segmented").forEach((sg) => sg.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        const set = sg.getAttribute("data-set"), v = b.getAttribute("data-v");
        S[set] = v; savePref(set, v);
        if (set === "theme") applyTheme(); else applyLang();
        renderSettingsPage();
      })));
    $("#syncnow").addEventListener("click", syncNow);
  }

  // ---------- Questionnaires page (initial intake) ----------
  const DAY_IDX = ["0", "1", "2", "3", "4", "5", "6"];
  function intakeInputHtml(q) {
    const v = S.intakeDraft[q.name], id = "qf_" + q.name;
    if (q.kind === "days") {
      const sel = String(v || "").split(",").filter(Boolean), wd = cal().WD;
      return `<div class="daysrow">` + DAY_IDX.map((d, i) =>
        `<label class="daybox"><input type="checkbox" name="qd_${esc(q.name)}" value="${d}" ${sel.indexOf(d) >= 0 ? "checked" : ""}> ${esc(wd[i])}</label>`).join("") + `</div>`;
    }
    if (q.kind === "yesno") {
      return `<select id="${id}" name="${id}">` +
        [["", "—"], ["yes", T("yes")], ["no", T("no")]].map(([ov, ol]) =>
          `<option value="${ov}" ${String(v || "") === ov ? "selected" : ""}>${esc(ol)}</option>`).join("") + `</select>`;
    }
    if (q.kind === "choice") {
      const opts = (q.options || []).map(([ov, ol]) =>
        `<option value="${esc(ov)}" ${String(v || "") === String(ov) ? "selected" : ""}>${esc(ol)}</option>`).join("");
      return `<select id="${id}" name="${id}"><option value=""></option>${opts}</select>`;
    }
    if (q.kind === "date") return `<input id="${id}" name="${id}" type="date" value="${esc(v || "")}">`;
    if (q.kind === "number") {
      const inp = `<input id="${id}" name="${id}" type="number" inputmode="decimal" step="any" value="${esc(v || "")}">`;
      return q.unit ? `<div class="row2">${inp}<span class="unitlabel">${esc(q.unit)}</span></div>` : inp;
    }
    if ((q.lines || 1) > 1) return `<textarea id="${id}" name="${id}" rows="${q.lines}">${esc(v || "")}</textarea>`;
    return `<input id="${id}" name="${id}" type="text" value="${esc(v || "")}">`;
  }

  function saveIntakeDraftFromDom() {
    const d = {};
    (S.questionSpec || []).forEach((sec) => sec.questions.forEach((q) => {
      if (q.kind === "days") {
        d[q.name] = [...app.querySelectorAll(`[name="qd_${q.name}"]:checked`)].map((c) => c.value).join(",");
      } else {
        const el = document.getElementById("qf_" + q.name);
        if (el) d[q.name] = el.value;
      }
    }));
    S.intakeDraft = d; idbSet("cache", "intake_draft", d);
  }
  function firstUnanswered() {
    for (const sec of (S.questionSpec || [])) for (const q of sec.questions) {
      if (q.optional) continue;
      const v = S.intakeDraft[q.name];
      if (q.kind === "yesno") { if (v !== "yes" && v !== "no") return q.prompt; }
      else if (!String(v == null ? "" : v).trim()) return q.prompt;
    }
    return null;
  }
  function buildIntakePayload() {
    const out = {};
    (S.questionSpec || []).forEach((sec) => sec.questions.forEach((q) => {
      const v = S.intakeDraft[q.name];
      if (q.kind === "days") { if (v && String(v).trim()) out["available_days"] = String(v).trim(); return; }
      if (q.kind === "yesno") { if (v === "yes") out[q.name] = "1"; return; }   // omit if "no" (coach reads it as a checkbox)
      if (v == null || String(v).trim() === "") return;
      out[q.name] = String(v).trim();
    }));
    return out;
  }
  function seedDraftFromResponse() {
    if (Object.keys(S.intakeDraft || {}).length) return;
    const p = S.intakeResponse || {}, d = {};
    (S.questionSpec || []).forEach((sec) => sec.questions.forEach((q) => {
      if (q.kind === "days") d[q.name] = p["available_days"] || "";
      else if (q.kind === "yesno") d[q.name] = p[q.name] ? "yes" : "no";
      else d[q.name] = (p[q.name] != null) ? String(p[q.name]) : "";
    }));
    S.intakeDraft = d;
  }
  function answerDisplay(q, src, fromDraft) {
    if (q.kind === "days") {
      const raw = fromDraft ? src[q.name] : src["available_days"], wd = cal().WD;
      return String(raw || "").split(",").filter(Boolean).map((i) => wd[+i]).join(", ");
    }
    if (q.kind === "yesno") return (fromDraft ? src[q.name] === "yes" : !!src[q.name]) ? T("yes")
      : (fromDraft && src[q.name] !== "no") ? "" : T("no");
    const v = src[q.name];
    if (q.kind === "choice") { const o = (q.options || []).find((o) => String(o[0]) === String(v)); return o ? o[1] : (v || ""); }
    return v == null ? "" : String(v);
  }
  function readonlyAnswersHtml(fromDraft) {
    const spec = S.questionSpec; if (!spec) return "";
    const src = fromDraft ? S.intakeDraft : (S.intakeResponse || {});
    return spec.map((sec) => {
      const rows = sec.questions.map((q) =>
        `<tr><th>${esc(q.prompt)}</th><td>${esc(answerDisplay(q, src, fromDraft) || T("unanswered"))}</td></tr>`).join("");
      return `<div class="card"><div class="sectiontitle">${esc(sec.title)}</div><table class="answers"><tbody>${rows}</tbody></table></div>`;
    }).join("");
  }

  async function sendIntake() {
    const m = $("#qmsg");
    if (!navigator.onLine) { m.hidden = false; m.className = "msg err"; m.textContent = T("quest_offline_fill"); return; }
    const btn = $("#qsend"); btn.disabled = true; const t = btn.textContent; btn.textContent = T("sending");
    const payload = buildIntakePayload();
    const rec = { athlete_id: S.athleteId, payload, device_id: deviceId(), client_updated_at: new Date().toISOString() };
    try {
      const { error } = await SB.from("intake_response").upsert(rec, { onConflict: "athlete_id" });
      if (error) throw error;
      S.intakeResponse = payload; S.intakeStep = "form"; S.intakeDraft = {};
      try { await idbDel("cache", "intake_draft"); } catch (e) { /* ignore */ }
      renderQuestionnaires(); scrollTop();
    } catch (e) {
      m.hidden = false; m.className = "msg err"; m.textContent = T("error") + ((e && e.message) || e);
      btn.disabled = false; btn.textContent = t;
    }
  }

  function renderIntakeReview() {
    app.innerHTML = `<h2 class="pagetitle">${T("quest_review")}</h2>` + readonlyAnswersHtml(true) +
      `<div id="qmsg" class="msg err" hidden></div>` +
      `<div class="actions"><button id="qsend" class="primary">${T("send_to_coach")}</button>` +
      `<button id="qback" class="ghost">${T("back_edit")}</button></div>`;
    $("#qback").addEventListener("click", () => { S.intakeStep = S.intakeResponse ? "edit" : "form"; renderQuestionnaires(); });
    $("#qsend").addEventListener("click", sendIntake);
  }

  function renderQuestionnaires() {
    const title = `<h2 class="pagetitle">${T("nav_quest")}</h2>`;
    if (S.weeks.length) { app.innerHTML = title + `<div class="card"><p class="muted">${T("quest_done")}</p></div>` + readonlyAnswersHtml(false); return; }
    if (!S.questionSpec) { app.innerHTML = title + `<div class="card"><p class="muted">${T(navigator.onLine ? "quest_loading" : "quest_offline_fill")}</p></div>`; return; }
    if (S.intakeResponse && S.intakeStep !== "edit") {
      app.innerHTML = title + `<div class="card"><p>${T("quest_sent")}</p><button id="editq" class="ghost">${T("edit_answers")}</button></div>` + readonlyAnswersHtml(false);
      const b = $("#editq"); if (b) b.addEventListener("click", () => { seedDraftFromResponse(); S.intakeStep = "edit"; renderQuestionnaires(); });
      return;
    }
    if (S.intakeStep === "review") { renderIntakeReview(); return; }
    let html = title + `<p class="muted small">${T("quest_intro")}</p>`;
    S.questionSpec.forEach((sec) => {
      html += `<div class="card"><div class="sectiontitle">${esc(sec.title)}</div>`;
      if (sec.blurb) html += `<p class="note">${esc(sec.blurb)}</p>`;
      sec.questions.forEach((q) => {
        const req = q.optional ? "" : ` <span class="req">*</span>`;
        const unit = (q.unit && q.kind !== "number") ? ` <span class="muted">(${esc(q.unit)})</span>` : "";
        const help = q.help ? `<div class="help">${esc(q.help)}</div>` : "";
        const coach = !q.drives ? `<div class="help"><em>${T("coach_only")}</em></div>` : "";
        html += `<div class="field"><label>${esc(q.prompt)}${unit}${req}</label>${intakeInputHtml(q)}${help}${coach}</div>`;
      });
      html += `</div>`;
    });
    html += `<div id="qmsg" class="msg err" hidden></div><div class="actions"><button id="qreview" class="primary">${T("review_btn")}</button></div>`;
    app.innerHTML = html;
    app.querySelectorAll("input,select,textarea").forEach((el) => el.addEventListener("change", saveIntakeDraftFromDom));
    $("#qreview").addEventListener("click", () => {
      saveIntakeDraftFromDom();
      const missing = firstUnanswered(), m = $("#qmsg");
      if (missing) { m.hidden = false; m.className = "msg err"; m.textContent = T("quest_answer", { q: missing }); scrollTop(); return; }
      S.intakeStep = "review"; renderQuestionnaires(); scrollTop();
    });
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

  // ================= notifications / messages =================
  function unreadCount() {
    return (S.messages || []).filter((m) => !m.read_at).length + (S.appNotice && S.appNotice.unread ? 1 : 0);
  }
  function setBell() {
    const bell = $("#bell"), badge = $("#bellbadge");
    if (!bell || !badge) return;
    const n = unreadCount();
    if (n > 0) { badge.textContent = n > 9 ? "9+" : String(n); badge.hidden = false; bell.classList.add("lit"); }
    else { badge.hidden = true; bell.classList.remove("lit"); }
  }
  function checkAppUpdate() {
    let seen = null, viaTap = false;
    try { seen = localStorage.getItem("app_seen_version"); } catch (e) { /* private mode */ }
    try { viaTap = sessionStorage.getItem("updating_via_tap") === "1"; sessionStorage.removeItem("updating_via_tap"); } catch (e) { /* ignore */ }
    // Confirm an update only when it happened on its own (a full relaunch swapped in the new worker).
    // A tap-to-update already told the athlete, so skip the "updated" notice in that case.
    if (seen && seen !== APP_VERSION && !viaTap) { S.appNotice = { body: T("app_updated", { v: APP_VERSION }), unread: true }; setBell(); }
    try { localStorage.setItem("app_seen_version", APP_VERSION); } catch (e) { /* ignore */ }
  }
  // A newer app version finished downloading in the background (the service worker is now waiting):
  // light the bell with a "tap to update" notice, instead of silently swapping in a launch later.
  function onUpdateReady(reg) {
    S.swWaiting = (reg && reg.waiting) || null;
    S.appNotice = { body: T("app_available"), unread: true, action: "update" };
    setBell();
    if (S.section === "inbox") renderInbox();
  }
  function applyUpdate() {
    try { sessionStorage.setItem("updating_via_tap", "1"); } catch (e) { /* ignore */ }
    pendingReload = true;                                   // the controllerchange handler reloads us
    if (S.swWaiting) S.swWaiting.postMessage("SKIP_WAITING");
    else location.reload();                                 // fallback: no waiting worker reference
  }
  async function pollMessages() {
    if (!navigator.onLine || !S.athleteId) return;
    touchLastSeen();
    try {
      const { data } = await SB.from("message").select("id,kind,body,created_at,read_at")
        .eq("direction", "out").order("created_at", { ascending: false });
      if (data) { S.messages = data; setBell(); }
    } catch (e) { /* ignore */ }
  }
  // A light heartbeat so the coach's roster can show a live presence dot. Fire-and-forget: it stamps
  // only last_seen (a SECURITY DEFINER function), never anything the athlete types, and a failure is
  // silent. Gated on being online and signed in, like every other write.
  function touchLastSeen() {
    if (!navigator.onLine || !S.athleteId) return;
    try { SB.rpc("touch_last_seen").then(() => {}, () => {}); } catch (e) { /* ignore */ }
  }
  async function markMessagesRead() {
    if (S.appNotice) S.appNotice.unread = false;
    const unread = (S.messages || []).filter((m) => !m.read_at);
    if (unread.length) {
      const now = new Date().toISOString();
      unread.forEach((m) => { m.read_at = now; });     // optimistic
      if (navigator.onLine) {
        try { await SB.from("message").update({ read_at: now }).eq("direction", "out").is("read_at", null); }
        catch (e) { /* will re-light on next refresh */ }
      }
    }
    setBell();
  }
  async function sendCoachMessage() {
    const body = ($("#msgbody").value || "").trim(), kind = $("#msgkind").value || "plan", m = $("#msgmsg");
    if (!body) return;
    if (!navigator.onLine) { m.hidden = false; m.className = "msg err"; m.textContent = T("msg_offline"); return; }
    const btn = $("#msgsend"); btn.disabled = true; const t = btn.textContent; btn.textContent = T("sending");
    try {
      const { error } = await SB.from("message").insert({ athlete_id: S.athleteId, direction: "in", kind, body, device_id: deviceId() });
      if (error) throw error;
      $("#msgbody").value = ""; m.hidden = false; m.className = "msg info"; m.textContent = T("msg_sent");
    } catch (e) {
      m.hidden = false; m.className = "msg err"; m.textContent = T("error") + ((e && e.message) || e);
    } finally { btn.disabled = false; btn.textContent = t; }
  }
  function noticeLabel(kind) {
    return kind === "plan_update" ? T("n_plan") : kind === "zones_update" ? T("n_zones")
      : kind === "app_available" ? T("n_app_available") : kind === "app" ? T("n_app") : T("n_message");
  }
  function renderInbox() {
    $("#back").hidden = true;
    markMessagesRead();
    let html = `<h2 class="pagetitle">${T("notifications")}</h2>`;
    html += `<div class="card"><div class="sectiontitle">${T("write_coach")}</div>
      <div class="field"><label for="msgkind">${T("msg_kind")}</label>
        <select id="msgkind"><option value="plan">${T("kind_plan")}</option><option value="bug">${T("kind_bug")}</option></select></div>
      <div class="field"><textarea id="msgbody" rows="3" placeholder="${T("msg_placeholder")}"></textarea></div>
      <button id="msgsend" class="primary">${T("msg_send")}</button>
      <div id="msgmsg" class="msg" hidden></div></div>`;
    const items = [];
    if (S.appNotice) items.push({ kind: S.appNotice.action === "update" ? "app_available" : "app", body: S.appNotice.body, created_at: null });
    (S.messages || []).forEach((m) => items.push(m));
    if (!items.length) html += `<div class="card"><p class="muted">${T("no_messages")}</p></div>`;
    else {
      if ((S.messages || []).length) html +=
        `<div class="inboxbar"><button id="selall" class="ghost">${T("select_all")}</button>` +
        `<button id="selnone" class="ghost">${T("deselect")}</button>` +
        `<button id="delsel" class="ghost danger">${T("del_selected")}</button></div>` +
        `<div id="delmsg" class="msg" hidden></div>`;
      html += items.map((m) => {
        const when = m.created_at ? ` <span class="muted small">${shortDay(m.created_at.slice(0, 10))}</span>` : "";
        const cb = m.id ? `<input type="checkbox" class="msgsel" value="${esc(m.id)}"> ` : "";
        const act = m.kind === "app_available" ? `<button id="updnow" class="primary">${T("app_update_now")}</button>` : "";
        return `<div class="card"><div class="sectiontitle">${cb}${noticeLabel(m.kind)}${when}</div><p>${esc(m.body || "")}</p>${act}</div>`;
      }).join("");
    }
    app.innerHTML = html;
    $("#msgsend").addEventListener("click", sendCoachMessage);
    const upd = $("#updnow"); if (upd) upd.addEventListener("click", applyUpdate);
    const selall = $("#selall");
    if (selall) {
      selall.addEventListener("click", () => app.querySelectorAll(".msgsel").forEach((c) => { c.checked = true; }));
      $("#selnone").addEventListener("click", () => app.querySelectorAll(".msgsel").forEach((c) => { c.checked = false; }));
      $("#delsel").addEventListener("click", deleteSelectedMessages);
    }
  }
  async function deleteSelectedMessages() {
    const ids = [...app.querySelectorAll(".msgsel:checked")].map((c) => c.value), m = $("#delmsg");
    if (!ids.length) return;
    if (!navigator.onLine) { m.hidden = false; m.className = "msg err"; m.textContent = T("del_offline"); return; }
    try {
      const { error } = await SB.from("message").delete().in("id", ids);
      if (error) throw error;
      S.messages = (S.messages || []).filter((x) => ids.indexOf(x.id) < 0);
      renderInbox(); setBell();
    } catch (e) {
      m.hidden = false; m.className = "msg err"; m.textContent = T("error") + ((e && e.message) || e);
    }
  }

  // ================= auth / boot =================
  async function boot() {
    loadPrefs(); applyTheme(); applyLang();
    registerSW();
    checkAppUpdate();
    $("#back").addEventListener("click", () => { S.current = null; renderSection(); });
    $("#menu").addEventListener("click", (e) => {
      e.stopPropagation();
      const d = $("#drawer");
      if (d.hidden) openDrawer(); else closeDrawer();
    });
    $("#backdrop").addEventListener("click", closeDrawer);
    $("#bell").addEventListener("click", () => go("inbox"));
    window.addEventListener("online", () => { setSync(); flushOutbox().then(repaint); pollMessages(); });
    window.addEventListener("offline", setSync);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) pollMessages(); });
    setInterval(pollMessages, 60000);
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

  // Paint the plan already saved on this device, with NO network call, and return whether it showed
  // one. This makes boot cache-first: the athlete sees their plan instantly, even while a stalled
  // token refresh runs below (gotrue retries an expired token for up to ~30s) and even when truly
  // offline. Reads the athlete from the cache directly -- loadAthlete() would go to the network when
  // navigator.onLine, which we must not do before we know the session.
  async function renderCachedPlan() {
    if (!rememberOn()) return false;                     // remember-me off -> nothing persisted
    if (!S.athleteId) {
      const cached = await idbGet("cache", "athlete");
      if (cached) { S.athleteId = cached.athlete_id; S.displayName = cached.display_name || ""; }
    }
    if (!S.athleteId) return false;
    if (!S.weeks.length) await loadCache();
    if (!S.weeks.length) return false;
    topbar.hidden = false;
    if (S.weekIdx == null) S.weekIdx = currentWeekIdx();
    gateSection();
    renderSection(); setSync(); setBell();
    return true;
  }

  async function _route() {
    // 1) Optimistic paint from the device cache, BEFORE any network-dependent auth call.
    const painted = await renderCachedPlan();

    // 2) Resolve the session. Offline with an expired access token, getSession() refreshes and gotrue
    //    retries the network for up to ~30s before returning {session:null}; that stall now holds the
    //    route mutex but is invisible, because the cached plan is already on screen. This getSession is
    //    NOT inside onAuthStateChange, so there is no auth-lock deadlock.
    const { data } = await SB.auth.getSession();
    const session = data && data.session;

    // 3) No usable session. A stalled/failed refresh counts the same as offline: keep the cached plan
    //    if we painted one; only show the real login when there is genuinely nothing to show.
    if (!session) {
      if (painted) { setSync(); setBell(); return; }
      showLogin(); return;
    }

    // 4) Signed in.
    S.email = (session.user && session.user.email) || "";
    topbar.hidden = false;
    // Online, ALWAYS re-verify who this email belongs to now (loadAthlete clears a stale cached
    // athlete so a different person never inherits the previous one's id). Offline, keep the cached id.
    if (navigator.onLine) await loadAthlete();
    else if (!S.athleteId) await loadAthlete();
    if (!S.athleteId && navigator.onLine) {   // signed in, but this email is linked to no athlete
      renderNotConnected(data.session.user && data.session.user.email);
      return;
    }
    if (!S.weeks.length) await loadCache();
    if (S.weekIdx == null) S.weekIdx = currentWeekIdx();
    gateSection();
    if (!painted) renderSection();                       // cache already painted it -> no double render

    // 5) Online: freshen in the background, exactly as before.
    if (navigator.onLine) {
      touchLastSeen();                                    // stamp presence on open, don't wait for the poll
      try { await refresh(); if (S.weekIdx == null) S.weekIdx = currentWeekIdx(); gateSection(); renderSection(); } catch (e) { console.warn("refresh failed", e); }
      flushOutbox().then(repaint);
    }
    setSync(); setBell();
  }

  // The home follows whether a plan exists — questionnaire when there's none, Plan once there is —
  // until the athlete picks a section from the menu, after which their choice is respected.
  function gateSection() { if (!S.navChosen) S.section = S.weeks.length ? "plan" : "questionnaires"; }

  // Re-render only the data-driven sections after a sync, so a background refresh never clobbers a
  // form the athlete is filling in (Account password, Settings).
  function repaint() { if (S.section === "plan" || S.section === "zones") renderSection(); }

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
    const draft = await idbGet("cache", "intake_draft"); if (draft) S.intakeDraft = draft;
    await loadOutbox();
  }
  function applyPlan(p) {
    S.meta = p.meta || null;
    S.prefs = (S.meta && S.meta.prefs) || {};
    S.weeks = (p.weeks || []).slice().sort((a, b) => (a.monday < b.monday ? -1 : 1));
    S.sessions = p.sessions || [];
    S.tests = p.tests || [];
    S.zones = p.zones || {};
    S.questionSpec = p.questionSpec || S.questionSpec || null;
    S.intakeResponse = ("intake" in p) ? p.intake : S.intakeResponse;
    S.submissions = p.submissions || {};
    S.fieldSpec = {}; ((S.meta && S.meta.field_spec) || []).forEach((f) => { S.fieldSpec[f.name] = f; });
  }
  async function refresh() {
    const [meta, weeks, sessions, tests, zones, logs, qspec, intake, messages, subs] = await Promise.all([
      SB.from("plan_meta").select("*").maybeSingle(),
      SB.from("plan_week").select("*").order("monday"),
      SB.from("plan_session").select("*").order("on_date"),
      SB.from("plan_test").select("*").order("on_date"),
      SB.from("zone_sheet").select("*"),
      SB.from("log").select("*"),
      SB.from("question_spec").select("spec").maybeSingle(),
      SB.from("intake_response").select("payload").maybeSingle(),
      SB.from("message").select("id,kind,body,created_at,read_at").eq("direction", "out").order("created_at", { ascending: false }),
      SB.from("test_submission").select("protocol,on_date,fields,conditions,indoor,ingested_at"),
    ]);
    const zmap = {}; (zones.data || []).forEach((z) => { zmap[z.key] = z; });
    const smap = {}; (subs.data || []).forEach((r) => { smap[`${r.protocol}|${r.on_date}`] = r; });
    const p = { meta: meta.data, weeks: weeks.data || [], sessions: sessions.data || [], tests: tests.data || [],
                zones: zmap, questionSpec: (qspec.data && qspec.data.spec) || null,
                intake: (intake.data && intake.data.payload) || null, submissions: smap };
    S.messages = messages.data || [];
    applyPlan(p);
    S.logs = {}; (logs.data || []).forEach((r) => { S.logs[`${r.on_date}|${r.session_key}`] = r; });
    await idbSet("cache", "plan", p);
    await idbSet("cache", "logs", S.logs);
    await loadOutbox();
  }
  async function loadOutbox() {
    S.outbox = {};
    (await idbAll("outbox")).forEach((it) => {
      S.outbox[it.key] = it;
      // A test result queued offline isn't in the published plan snapshot, so reflect it into the
      // submissions map here -- that is what renderTest reads to show it as "waiting to send".
      if (it.table === "test_submission") {
        const r = it.record;
        S.submissions[`${r.protocol}|${r.on_date}`] =
          { protocol: r.protocol, on_date: r.on_date, fields: r.fields, conditions: r.conditions, indoor: r.indoor, ingested_at: null, _queued: true };
      }
    });
  }

  // ================= login =================
  function showLogin() {
    topbar.hidden = true; closeDrawer();
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
        // The test's OWN result entry (e.g. the 400 m and 200 m times) is the primary action on a
        // test day: a prominent button at the top that opens the result form.
        tsts.forEach((ts) => {
          html += `<button class="sess testcta" data-test="${esc(iso)}|${esc(ts.protocol)}">
            <div class="body"><div class="t">${T("test_prefix")}${esc(ts.name || ts.protocol)} <span class="badge test">${T("badge_test")}</span></div>
            <div class="sub">${T("test_cta")} · ${esc(ts.sport || "")}</div></div>
            <span class="chevron">›</span></button>`;
        });
        // A scheduled test is ALSO a loggable "TEST: …" session. When its result entry is shown
        // above, demote that session to a quiet "log how it went" link so the result stays the
        // obvious thing to tap; keep it a normal tile if there is no matching test to record.
        const demoted = [];
        sess.forEach((s) => {
          const isTestSess = (s.is_test || /^TEST\b/i.test(s.title || "")) && tsts.some((x) => x.sport === s.sport);
          if (isTestSess) { demoted.push(s); return; }
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
        demoted.forEach((s) => {
          const st = logState(s);
          const chipTxt = st ? (st.pending ? T("queued") : st.done ? T("logged") : T("skipped")) : "";
          html += `<button class="sess testlog" data-key="${esc(iso)}|${esc(s.session_key)}">
            <div class="body"><div class="sub">${T("test_log_opt")}${chipTxt ? " · " + esc(chipTxt) : ""}</div></div>
            <span class="chevron">›</span></button>`;
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
    // A "TEST: …" session carries its own result form (e.g. the 400 m and 200 m times) as a
    // separate test. Surface it as the lead action so the athlete enters the measurement the coach
    // needs, not just a generic minutes/RPE log.
    const testFor = s.is_test ? S.tests.find((x) => x.on_date === s.on_date && x.sport === s.sport) : null;
    let html = `<div class="detail">
      <div class="muted small">${longDay(s.on_date)}</div>
      <h1>${esc(s.title)}${s.is_bt ? ` <span class="badge bt">${T("badge_key")}</span>` : ""}${s.is_test ? ` <span class="badge test">${T("badge_test")}</span>` : ""}</h1>
      <div class="kv">${hhmm(s.minutes)} · ${esc(s.sport)}${zone}</div>`;
    if (testFor) html += `<button type="button" id="gototest" class="gototest">${T("test_from_session")} ›</button>`;
    html += targetHtml(s.target);
    if (s.detail && s.detail.length) html += `<div class="sectiontitle">${T("detail")}</div><ul class="lines">${s.detail.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
    html += fuelHtml(s.fuel, s.sport, s.minutes);
    if (s.provenance) html += `<p class="note">${esc(s.provenance)}</p>`;
    html += logSectionHtml(s);
    html += `</div>`;
    app.innerHTML = html;
    const gt = $("#gototest");
    if (gt && testFor) gt.addEventListener("click", () => renderTest(testFor));
    scrollTop();
    wireLogForm(s);
  }
  // One input for a test's declared field, driven by the spec the coach published (single source of
  // truth: the webapp's testing.PROTOCOLS). `prev` prefills a result already submitted but not yet
  // approved, so the athlete can correct it.
  function testFieldHtml(f, prev) {
    const val = (prev && prev[f.name] != null) ? prev[f.name] : "";
    const req = f.required ? ` <span class="req">${T("required")}</span>` : "";
    const help = f.help ? `<div class="help">${esc(f.help)}</div>` : "";
    const lab = `<label for="tf_${esc(f.name)}">${esc(f.label)}${req}</label>`;
    let control;
    if (f.kind === "time") {
      // Full keyboard (no inputmode) so iOS exposes the ":" key for mm:ss; the digits-only "numeric"
      // keypad hid it. The submit-time regex still enforces the mm:ss / h:mm:ss shape.
      control = `<input id="tf_${esc(f.name)}" name="${esc(f.name)}" type="text"
                 autocapitalize="off" autocorrect="off" spellcheck="false"
                 placeholder="${esc(f.placeholder || T("mmss"))}" value="${esc(val)}">`;
    } else if (f.unit_kind) {
      const swim = f.unit_kind === "short";
      const opts = (swim ? [["m", "m"], ["yd", "yd"]] : [["km", "km"], ["mi", "mi"]]);
      const defU = (S.meta && S.meta.units) === "imperial" ? (swim ? "yd" : "mi") : (swim ? "m" : "km");
      const curU = (prev && prev[f.name + "_unit"]) || defU;
      const sel = opts.map(([v, l]) => `<option value="${v}" ${v === curU ? "selected" : ""}>${l}</option>`).join("");
      control = `<div class="row2"><input id="tf_${esc(f.name)}" name="${esc(f.name)}" type="number"
                 inputmode="decimal" step="any" min="0" value="${esc(val)}">
                 <select class="unit" name="${esc(f.name)}_unit" aria-label="unit">${sel}</select></div>`;
    } else {
      const u = f.kind === "hr" ? "bpm" : (f.kind === "power" ? "W" : "");
      const input = `<input id="tf_${esc(f.name)}" name="${esc(f.name)}" type="number" inputmode="numeric"
                     step="1" min="0" value="${esc(val)}">`;
      control = u ? `<div class="row2">${input}<span class="unitlabel">${u}</span></div>` : input;
    }
    return `<div class="field">${lab}${control}${help}</div>`;
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

    const fields = Array.isArray(ts.fields) ? ts.fields : null;
    if (fields && fields.length) {
      const sub = S.submissions[`${ts.protocol}|${ts.on_date}`];
      const prev = sub && sub.fields;
      html += `<div class="sectiontitle">${T("test_enter")}</div>`;
      if (sub) html += `<p class="note">${T(sub._queued ? "test_queued" : "test_pending")}</p>`;
      html += `<form id="testform">`;
      fields.forEach((f) => { html += testFieldHtml(f, prev); });
      html += `<div class="field"><label for="tf_conditions">${T("test_conditions")}</label>
               <input id="tf_conditions" name="conditions" type="text" value="${esc((sub && sub.conditions) || "")}"></div>`;
      html += `<label class="check"><input type="checkbox" id="tf_indoor" ${sub && sub.indoor ? "checked" : ""}> ${T("test_indoor")}</label>`;
      html += `<div class="actions"><button type="button" id="testsend" class="primary">${sub ? T("test_update") : T("test_submit")}</button></div>`;
      html += `<div id="testmsg" class="msg" hidden></div></form>`;
    } else {
      html += `<p class="note">${T("test_coach")}</p>`;
    }
    html += `</div>`;
    app.innerHTML = html;
    const btn = $("#testsend");
    if (btn) btn.addEventListener("click", () => submitTest(ts));
    scrollTop();
  }

  async function submitTest(ts) {
    const form = $("#testform"), m = $("#testmsg");
    const fields = {};
    for (const f of ts.fields) {
      const inp = form.elements[f.name];
      const v = (inp && inp.value || "").trim();
      if (v === "") {
        if (f.required) { m.hidden = false; m.className = "msg err"; m.textContent = T("test_need", { field: f.label }); return; }
        continue;
      }
      if (f.kind === "time" && !/^\d{1,2}(:\d{1,2}){1,2}$/.test(v)) {
        m.hidden = false; m.className = "msg err"; m.textContent = T("test_bad_time"); return;
      }
      fields[f.name] = v;
      if (f.unit_kind) { const u = form.elements[f.name + "_unit"]; if (u) fields[f.name + "_unit"] = u.value; }
    }
    const conditions = (form.elements["conditions"] && form.elements["conditions"].value || "").trim();
    const indoor = !!($("#tf_indoor") && $("#tf_indoor").checked);
    if (!S.athleteId) {
      m.hidden = false; m.className = "msg err"; m.textContent = T("test_offline"); return;
    }
    const k = "test|" + ts.protocol + "|" + ts.on_date;
    const row = {
      athlete_id: S.athleteId, protocol: ts.protocol, on_date: ts.on_date,
      fields, conditions, indoor, device_id: deviceId(),
      client_updated_at: new Date().toISOString(),
      ingested_at: null,            // (re)submitting makes the coach pull it again
    };
    // Queue it exactly like a session log: written to IndexedDB first, shown as sent optimistically,
    // then flushed now (a no-op offline; upserts when back online). The flush is idempotent on
    // (athlete_id, protocol, on_date), so a mobile-Safari false "network error" on a write that
    // actually committed just re-upserts the identical row next time -- no scary error, no lost result,
    // which is why the old online-only read-back is gone.
    const item = { key: k, table: "test_submission", onConflict: "athlete_id,protocol,on_date", record: row };
    await idbPut("outbox", item);
    S.outbox[k] = item;
    S.submissions[`${ts.protocol}|${ts.on_date}`] =
      { protocol: ts.protocol, on_date: ts.on_date, fields, conditions, indoor, ingested_at: null, _queued: true };
    m.hidden = false; m.className = "msg info"; m.textContent = navigator.onLine ? T("test_sent") : T("test_queued");
    const btn = $("#testsend"); if (btn) btn.textContent = T("test_update");
    flushOutbox().then(setSync);
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

  // Static units shown beside the numeric log fields that carry one.
  const UNIT_SUFFIX = { mass_before: "kg", mass_after: "kg", fluid_ml: "ml", carb_g: "g" };
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
      const input = `<input id="f_${f.name}" name="${f.name}" type="number" inputmode="${f.kind === "float" ? "decimal" : "numeric"}" step="${step}"${f.lo != null ? ` min="${f.lo}"` : ""}${f.hi != null ? ` max="${f.hi}"` : ""} value="${esc(val)}">`;
      const u = UNIT_SUFFIX[f.name];
      control = u ? `<div class="row2">${input}<span class="unitlabel">${u}</span></div>` : input;
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
    // The outbox carries the destination table so the same queue flushes both logs and test results.
    const item = { key: k, table: "log", onConflict: "athlete_id,on_date,session_key", record };
    await idbPut("outbox", item);
    S.outbox[k] = item;
    renderSession(s);
    flushOutbox().then(() => { if (S.current === s) renderSession(s); setSync(); });
  }
  async function flushOutbox() {
    if (!navigator.onLine) return;
    const items = await idbAll("outbox");
    for (const it of items) {
      try {
        const table = it.table || "log";                 // older queued items (no table) are logs
        const onConflict = it.onConflict || "athlete_id,on_date,session_key";
        const { error } = await SB.from(table).upsert(it.record, { onConflict });
        if (error) throw error;
        await idbDel("outbox", it.key);
        delete S.outbox[it.key];
        if (table === "test_submission") {
          const r = it.record;
          S.submissions[`${r.protocol}|${r.on_date}`] =
            { protocol: r.protocol, on_date: r.on_date, fields: r.fields, conditions: r.conditions, indoor: r.indoor, ingested_at: null };
        } else {
          S.logs[it.key] = Object.assign({}, it.record);
        }
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
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("sw.js").then((reg) => {
      if (reg.waiting && navigator.serviceWorker.controller) onUpdateReady(reg);   // one already waiting
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          // "installed" while a controller already runs = an UPDATE (not the first install) is ready.
          if (nw.state === "installed" && navigator.serviceWorker.controller) onUpdateReady(reg);
        });
      });
      reg.update().catch(() => {});                                        // check promptly on boot…
      document.addEventListener("visibilitychange", () => {               // …and whenever reopened
        if (!document.hidden) reg.update().catch(() => {});
      });
    }).catch((e) => console.warn("SW registration failed", e));
    // After the waiting worker takes over (our SKIP_WAITING), reload once into the new code.
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (pendingReload) location.reload(); });
  }

  boot();
})();
