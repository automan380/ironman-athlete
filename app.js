/* Athlete app. Reads the published plan (RLS-scoped to the signed-in athlete), shows it with the
 * same detail as the coach's day view, and logs sessions back to Supabase — offline-first.
 * The app NEVER moves or recomputes anything: it records what the athlete did (incl. "done on a
 * different day"); the coach bridge applies any move. Vanilla JS, no build step. */
(function () {
  "use strict";

  const CFG = window.IRONMAN_CONFIG || {};
  const SB = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, detectSessionInUrl: true, autoRefreshToken: true },
  });

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

  // ---------- dates (Italian, Monday-first), all ISO strings, no timezone drift ----------
  const WD = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
  const WD_FULL = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
  const MO = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
  function parseD(iso) { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); }
  function fmtISO(dt) {
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  }
  function todayISO() { return fmtISO(new Date()); }
  function wdIdx(dt) { return (dt.getDay() + 6) % 7; }          // Monday = 0
  function shortDay(iso) { const d = parseD(iso); return `${WD[wdIdx(d)]} ${d.getDate()} ${MO[d.getMonth()]}`; }
  function longDay(iso) { const d = parseD(iso); return `${WD_FULL[wdIdx(d)]} ${d.getDate()} ${MO[d.getMonth()]}`; }
  function addDays(iso, n) { const d = parseD(iso); d.setDate(d.getDate() + n); return fmtISO(d); }

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
  function tx(store, mode) { return db().then((d) => d.transaction(store, mode).objectStore(store)); }
  async function idbGet(store, key) { const o = await tx(store); return new Promise((res) => { const q = o.get(key); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); }); }
  async function idbSet(store, key, val) { const o = await tx(store, "readwrite"); return new Promise((res) => { o.put(val, key); o.transaction.oncomplete = () => res(); o.transaction.onerror = () => res(); }); }
  async function idbPut(store, val) { const o = await tx(store, "readwrite"); return new Promise((res) => { o.put(val); o.transaction.oncomplete = () => res(); o.transaction.onerror = () => res(); }); }
  async function idbAll(store) { const o = await tx(store); return new Promise((res) => { const q = o.getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); }); }
  async function idbDel(store, key) { const o = await tx(store, "readwrite"); return new Promise((res) => { o.delete(key); o.transaction.oncomplete = () => res(); o.transaction.onerror = () => res(); }); }

  function deviceId() {
    let id = null;
    try { id = localStorage.getItem("device_id"); if (!id) { id = (crypto.randomUUID && crypto.randomUUID()) || ("dev-" + Date.now()); localStorage.setItem("device_id", id); } }
    catch (e) { id = "dev-" + Date.now(); }
    return id;
  }

  // ---------- state ----------
  const S = {
    athleteId: null, displayName: "", meta: null, prefs: {},
    weeks: [], sessions: [], tests: [], zones: {},
    logs: {}, outbox: {},           // keyed by `${on_date}|${session_key}`
    fieldSpec: {}, weekIdx: null, view: "week", current: null,
  };
  const lkey = (s) => `${s.on_date}|${s.session_key}`;

  // ================= auth / boot =================
  async function boot() {
    registerSW();
    $("#signout").addEventListener("click", async () => { await SB.auth.signOut(); location.reload(); });
    $("#back").addEventListener("click", () => { S.view = "week"; S.current = null; renderWeek(); });
    window.addEventListener("online", () => { setSync(); flushOutbox().then(repaint); });
    window.addEventListener("offline", setSync);
    // Supabase runs this callback while holding the auth lock; calling any SB.* inside it deadlocks.
    // So defer to the next tick, out of the lock, before (re-)routing. See supabase-js docs.
    SB.auth.onAuthStateChange(() => { setTimeout(route, 0); });
    await route();
  }

  // Serialise route() so a second auth event (or online tick) can't run it concurrently.
  let _routing = false, _pending = false;
  async function route() {
    if (_routing) { _pending = true; return; }
    _routing = true;
    try { await _route(); } finally { _routing = false; if (_pending) { _pending = false; route(); } }
  }

  async function _route() {
    const { data } = await SB.auth.getSession();
    if (!data || !data.session) { showLogin(); return; }
    topbar.hidden = false;
    if (!S.athleteId) await loadAthlete();
    if (!S.weeks.length) await loadCache();      // fast paint from cache
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
    const cached = await idbGet("cache", "athlete");
    if (cached) { S.athleteId = cached.athlete_id; S.displayName = cached.display_name || ""; }
    if (navigator.onLine) {
      const { data } = await SB.from("athlete_account").select("athlete_id, display_name").maybeSingle();
      if (data) { S.athleteId = data.athlete_id; S.displayName = data.display_name || ""; await idbSet("cache", "athlete", data); }
    }
  }

  async function loadCache() {
    const p = await idbGet("cache", "plan");
    if (p) { applyPlan(p); }
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
    topbar.hidden = true;
    app.innerHTML = `
      <div class="login">
        <h1>I tuoi allenamenti</h1>
        <p class="muted small">Accedi con la tua email: ti arriva un link, lo apri e sei dentro. Niente password.</p>
        <div class="card">
          <div class="field">
            <label for="email">Email</label>
            <input id="email" type="email" inputmode="email" autocomplete="email" placeholder="tu@esempio.com">
          </div>
          <button id="send" class="primary" type="button">Inviami il link</button>
          <div id="loginmsg" class="msg info" hidden></div>
        </div>
      </div>`;
    const msg = $("#loginmsg");
    $("#send").addEventListener("click", async function () {
      const email = $("#email").value.trim().toLowerCase();
      if (!email) { msg.hidden = false; msg.className = "msg err"; msg.textContent = "Scrivi la tua email."; return; }
      this.disabled = true; const t = this.textContent; this.textContent = "Invio…";
      try {
        const redirect = location.origin + location.pathname;
        const { error } = await SB.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
        if (error) throw error;
        msg.hidden = false; msg.className = "msg info";
        msg.textContent = "Fatto. Controlla la posta (anche lo spam) e apri il link per entrare.";
      } catch (e) {
        msg.hidden = false; msg.className = "msg err"; msg.textContent = "Errore: " + (e.message || e);
      } finally { this.disabled = false; this.textContent = t; }
    });
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

  function renderWeek() {
    S.view = "week"; S.current = null; $("#back").hidden = true;
    if (!S.weeks.length) {
      app.innerHTML = `<div class="card"><p>Nessun piano ancora disponibile.</p>
        <p class="muted small">Se il coach ha appena pubblicato, riprova tra poco (serve la rete la prima volta).</p></div>`;
      return;
    }
    const w = S.weeks[S.weekIdx];
    const t = todayISO();
    let html = `
      <div class="weekhead">
        <button class="navbtn" id="prev" ${S.weekIdx <= 0 ? "disabled" : ""} aria-label="Settimana precedente">‹</button>
        <h2>Settimana ${w.week_index}</h2>
        <button class="navbtn" id="today">Oggi</button>
        <button class="navbtn" id="next" ${S.weekIdx >= S.weeks.length - 1 ? "disabled" : ""} aria-label="Settimana successiva">›</button>
      </div>
      <div class="weekmeta">${esc(w.period || "")}${w.is_recovery ? ' · <span class="badge recovery">recupero</span>' : ""}${w.hours_shown != null ? " · " + w.hours_shown + " h" : ""} · ${shortDay(w.monday)} – ${shortDay(w.sunday)}</div>`;

    for (let i = 0; i < 7; i++) {
      const iso = addDays(w.monday, i);
      const sess = sessionsOn(iso);
      const tsts = testsOn(iso);
      html += `<div class="day ${iso === t ? "today" : ""}"><div class="dayhead">${WD_FULL[i].replace(/^./, c => c.toUpperCase())} <span class="dd">${parseD(iso).getDate()} ${MO[parseD(iso).getMonth()]}</span></div>`;
      if (!sess.length && !tsts.length) {
        html += `<div class="rest">Riposo</div>`;
      } else {
        tsts.forEach((ts) => {
          html += `<div class="sess" data-test="${esc(iso)}|${esc(ts.protocol)}"><div class="body"><div class="t">Test: ${esc(ts.name || ts.protocol)} <span class="badge test">test</span></div><div class="sub">${esc(ts.sport || "")}</div></div></div>`;
        });
        sess.forEach((s) => {
          const st = logState(s);
          let chip = "";
          if (st) chip = st.pending ? `<span class="chip pend">in coda</span>`
            : st.done ? `<span class="chip done">fatto</span>` : `<span class="chip skip">saltato</span>`;
          const zone = s.zone && s.zone !== "-" ? ` · Z${esc(s.zone)}` : "";
          html += `<button class="sess" data-key="${esc(iso)}|${esc(s.session_key)}">
            <div class="body"><div class="t">${esc(s.title)}${s.is_bt ? ' <span class="badge bt">chiave</span>' : ""}</div>
            <div class="sub">${hhmm(s.minutes)} · ${esc(s.sport)}${zone}</div></div>
            ${chip}<span class="chevron">›</span></button>`;
        });
      }
      html += `</div>`;
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
    let s = `<div class="sectiontitle">Target</div><div class="target">`;
    if (t.range) {
      s += `<strong>${esc(t.range)}</strong>${t.unit ? " " + esc(t.unit) : ""}`;
      if (t.talk) s += ` · talk test: ${esc(t.talk)}`;
      if (t.rpe) s += ` · RPE ${esc(t.rpe[0])}–${esc(t.rpe[1])}`;
    } else {
      s += `Nessun target numerico${t.why ? " (" + esc(t.why) + ")" : ""}. Usa il talk test: <em>${esc(t.talk || "")}</em>`;
    }
    return s + `</div>`;
  }

  function fuelHtml(f, sport, minutes) {
    if (!f || sport === "strength") return "";
    if (f.water_only) {
      return `<div class="sectiontitle">Nutrizione</div><p class="note">Solo acqua — sotto l'ora il libro non prevede carboidrati in sessione.</p>`;
    }
    const r = (x) => Math.round(x || 0);
    const rows = [];
    rows.push(`<tr><th>Durante</th><td>${r(f.during_carb_g_h)} g carbo/h <span class="note">(${r(f.during_kcal_h)} kcal/h · ${r(f.total_carb_g)} g totali)</span></td></tr>`);
    rows.push(`<tr><th>Liquidi</th><td>${r(f.fluid_ml_h)} ml/h</td></tr>`);
    rows.push(`<tr><th>Sodio</th><td>${r(f.sodium_mg_h)} mg/h</td></tr>`);
    if (f.pre_kcal) rows.push(`<tr><th>Prima</th><td>${r(f.pre_kcal[0])}–${r(f.pre_kcal[1])} kcal <span class="note">${minutes >= 60 ? "2 h prima" : "fino a 10 min prima"}</span></td></tr>`);
    rows.push(`<tr><th>Dopo</th><td>${r(f.post_kcal)} kcal <span class="note">entro 30 min</span></td></tr>`);
    let extra = "";
    if (f.needs_multi_transportable) extra += `<p class="note">Sopra i 60 g/h serve un mix <strong>glucosio + fruttosio</strong>: uno zucchero solo non si assorbe abbastanza in fretta.</p>`;
    if (f.notes && f.notes.length) extra += `<ul class="lines note">${f.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`;
    return `<div class="sectiontitle">Nutrizione</div><table class="fuel"><tbody>${rows.join("")}</tbody></table>${extra}`;
  }

  function renderSession(s) {
    S.view = "session"; S.current = s; $("#back").hidden = false;
    const zone = s.zone && s.zone !== "-" ? ` · Z${esc(s.zone)}` : "";
    let html = `<div class="detail">
      <div class="muted small">${longDay(s.on_date)}</div>
      <h1>${esc(s.title)}${s.is_bt ? ' <span class="badge bt">chiave</span>' : ""}${s.is_test ? ' <span class="badge test">test</span>' : ""}</h1>
      <div class="kv">${hhmm(s.minutes)} · ${esc(s.sport)}${zone}</div>`;
    html += targetHtml(s.target);
    if (s.detail && s.detail.length) {
      html += `<div class="sectiontitle">Dettaglio</div><ul class="lines">${s.detail.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
    }
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
      <h1>Test: ${esc(ts.name || ts.protocol)}</h1>
      <div class="kv">${esc(ts.sport || "")}</div>`;
    if (ts.reason) html += `<p class="note">${esc(ts.reason)}</p>`;
    if (ts.warm_up) html += `<div class="sectiontitle">Riscaldamento</div><p>${esc(ts.warm_up)}</p>`;
    if (ts.instructions && ts.instructions.length) html += `<div class="sectiontitle">Come si fa</div><ul class="lines">${ts.instructions.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
    if (ts.yields) html += `<div class="sectiontitle">Cosa misura</div><p>${esc(ts.yields)}</p>`;
    if (ts.provenance) html += `<p class="note">${esc(ts.provenance)}</p>`;
    html += `<p class="note">Registra il risultato del test con il coach.</p></div>`;
    app.innerHTML = html;
    scrollTop();
  }

  // ================= logging =================
  const FELT_IT = { easy: "più facile del previsto", as_planned: "circa come previsto", hard: "più dura del previsto", cut_short: "ho dovuto accorciare" };
  function unitOptions(sport) {
    const kind = sport === "swim" ? "short" : "long";
    return kind === "short" ? [["m", "m"], ["yd", "yd"]] : [["km", "km"], ["mi", "mi"]];
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
        if (p.minutes) rows.push(`<tr><th>Durata</th><td>${hhmm(p.minutes)}</td></tr>`);
        if (p.distance) rows.push(`<tr><th>Distanza</th><td>${esc(p.distance)} ${esc(p.distance_unit || "")}</td></tr>`);
        if (p.avg_hr) rows.push(`<tr><th>FC media</th><td>${esc(p.avg_hr)} bpm</td></tr>`);
        if (p.avg_power) rows.push(`<tr><th>Potenza</th><td>${esc(p.avg_power)} W</td></tr>`);
        if (p.rpe) rows.push(`<tr><th>RPE</th><td>${esc(p.rpe)}/10</td></tr>`);
        if (p.felt) rows.push(`<tr><th>Sensazione</th><td>${esc(FELT_IT[p.felt] || p.felt)}</td></tr>`);
        if (p.carb_g) rows.push(`<tr><th>Carboidrati</th><td>${esc(p.carb_g)} g</td></tr>`);
        if (p.gi_symptoms) rows.push(`<tr><th>Stomaco</th><td>${esc(p.gi_symptoms)}</td></tr>`);
        if (p.note) rows.push(`<tr><th>Nota</th><td>${esc(p.note)}</td></tr>`);
      } else {
        rows.push(`<tr><th>Saltato</th><td>${esc(p.skip_reason || "nessun motivo indicato")}</td></tr>`);
      }
      const moved = st.doneOn ? ` · fatto ${shortDay(st.doneOn)}` : "";
      box = `<div class="loggedbox"><strong>${st.done ? "Registrato" : "Saltato"}${moved}</strong>${st.pending ? ' <span class="chip pend">in coda</span>' : ""}
             <table><tbody>${rows.join("")}</tbody></table>
             ${st.doneOn ? `<p class="note">Fatto un altro giorno: la sessione si sposterà quando il coach sincronizza.</p>` : ""}</div>`;
    }
    const fields = (s.log_fields || []).filter((n) => n !== "completed" && n !== "distance_unit");
    const pre = (st && st.rec.payload) || {};
    let inputs = "";
    const weekMonday = weekMondayOf(s.on_date);
    // "Done on" dropdown: the 7 days of this session's week; default = planned day.
    let doneOpts = "";
    for (let i = 0; i < 7; i++) { const iso = addDays(weekMonday, i); doneOpts += `<option value="${iso}" ${iso === (pre.__doneOn || (st && st.doneOn) || s.on_date) ? "selected" : ""}>${shortDay(iso)}${iso === s.on_date ? " (previsto)" : ""}</option>`; }
    inputs += `<div class="field"><label for="f_done_on">Fatto il giorno</label><select id="f_done_on" name="done_on">${doneOpts}</select></div>`;

    fields.forEach((name) => {
      const f = S.fieldSpec[name];
      if (!f) return;
      const val = pre[name] != null ? pre[name] : (name === "minutes" && !st ? s.minutes : "");
      inputs += fieldHtml(f, s, val);
    });

    return `
      <div class="sectiontitle">${st ? "Modifica il log" : "Registra la sessione"}</div>
      <form id="logform">${inputs}
        <div class="actions">
          <button type="button" class="primary" data-act="done">${st && st.done ? "Salva" : "Salva come fatto"}</button>
          <button type="button" class="ghost" data-act="skip">Segna saltato</button>
        </div>
      </form>
      ${box}`;
  }

  function fieldHtml(f, s, val) {
    const req = f.compulsory ? ' <span class="req">·richiesto</span>' : "";
    const help = f.help ? `<div class="help">${esc(f.help)}</div>` : "";
    const lab = `<label for="f_${f.name}">${esc(f.label)}${req}</label>`;
    let control;
    if (f.name === "distance") {
      const opts = unitOptions(s.sport).map(([v, l]) => `<option value="${v}" ${v === defaultUnit(s.sport) ? "selected" : ""}>${l}</option>`).join("");
      control = `<div class="row2"><input id="f_distance" name="distance" type="number" inputmode="decimal" step="any" min="0" value="${esc(val)}">
                 <select class="unit" name="distance_unit" aria-label="unità">${opts}</select></div>`;
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
    const d = parseD(iso); return addDays(iso, -wdIdx(d));     // fallback: Monday of that calendar week
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
    renderSession(s);                 // reflect immediately (optimistic)
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
      } catch (e) { console.warn("flush failed for", it.key, e); break; }   // keep the rest queued
    }
    await idbSet("cache", "logs", S.logs);
  }

  // ================= chrome =================
  function setSync() {
    const el = $("#sync");
    if (!el) return;
    const pending = Object.keys(S.outbox).length;
    if (!navigator.onLine) el.textContent = pending ? `offline · ${pending} in coda` : "offline";
    else el.textContent = pending ? `${pending} da inviare…` : "aggiornato";
  }

  function registerSW() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW registration failed", e));
    }
  }

  boot();
})();
