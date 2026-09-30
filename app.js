"use strict";

const API = "https://vuaywrqnbtubsekefxcv.supabase.co/functions/v1/app-api";

/* ================= Telegram ================= */

const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
const params = new URLSearchParams(location.search);
// Demo data only on explicit ?mock=1; opened outside Telegram, the app shows an error instead of fake numbers.
const MOCK = params.get("mock") === "1";
const IN_TG = !!(tg && tg.platform && tg.platform !== "unknown");
const supports = (v) => IN_TG && typeof tg.isVersionAtLeast === "function" && tg.isVersionAtLeast(v);

function applyTheme() {
  const root = document.documentElement;
  const tp = (tg && tg.themeParams) || {};
  const keys = ["bg_color", "text_color", "hint_color", "button_color", "button_text_color", "secondary_bg_color", "section_bg_color"];
  let any = false;
  for (const k of keys) {
    if (tp[k]) { root.style.setProperty("--tg-" + k, tp[k]); any = true; }
    else root.style.removeProperty("--tg-" + k);
  }
  if (any && tg.colorScheme) root.dataset.theme = tg.colorScheme;
  else delete root.dataset.theme;
}

function haptic(kind) {
  if (!supports("6.1") || !tg.HapticFeedback) return;
  try {
    if (kind === "success" || kind === "error" || kind === "warning") tg.HapticFeedback.notificationOccurred(kind);
    else if (kind === "select") tg.HapticFeedback.selectionChanged();
    else tg.HapticFeedback.impactOccurred(kind || "light");
  } catch (_) {}
}

function confirmAsk(message) {
  return new Promise((resolve) => {
    if (supports("6.2")) {
      try { tg.showConfirm(message, (ok) => resolve(!!ok)); } catch (_) { resolve(false); }
      return;
    }
    resolve(window.confirm(message));
  });
}

let backHandler = null;
function setBack(fn) {
  backHandler = fn;
  if (!supports("6.1")) return;
  if (fn) tg.BackButton.show(); else tg.BackButton.hide();
}

if (tg) {
  try { tg.ready(); tg.expand(); } catch (_) {}
  if (supports("6.1")) {
    try { tg.setHeaderColor("secondary_bg_color"); tg.setBackgroundColor("secondary_bg_color"); } catch (_) {}
    tg.BackButton.onClick(() => backHandler && backHandler());
  }
  if (supports("7.7")) { try { tg.disableVerticalSwipes(); } catch (_) {} }
  tg.onEvent && tg.onEvent("themeChanged", () => { applyTheme(); if (state.tab === "trends") renderTrends(); });
}
applyTheme();

/* ================= formatting ================= */

const THIN = " ";
function fmt(n, digits = 0) {
  if (n == null || Number.isNaN(n)) return "–";
  const s = Math.abs(n).toFixed(digits);
  let [i, f] = s.split(".");
  i = i.replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
  const neg = n < 0 && Number(s) !== 0;
  return (neg ? "−" : "") + i + (f ? "," + f : "");
}
function fmtSigned(n, digits = 0) {
  if (n == null || Number.isNaN(n)) return "–";
  const r = Number(Math.abs(n).toFixed(digits));
  return (n > 0 && r !== 0 ? "+" : "") + fmt(n, digits);
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function parseISO(d) { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd)); }
function toISO(dt) { return dt.toISOString().slice(0, 10); }
function addDays(iso, n) { const d = parseISO(iso); d.setUTCDate(d.getUTCDate() + n); return toISO(d); }
function localToday() { const d = new Date(); return toISO(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))); }
const fmtLong = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
const fmtWeekday = new Intl.DateTimeFormat("ru-RU", { weekday: "long", timeZone: "UTC" });
const fmtShort = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
function dayTitle(iso, isToday) {
  if (isToday) return "Сегодня";
  if (iso === addDays(localToday(), -1)) return "Вчера";
  const w = fmtWeekday.format(parseISO(iso));
  return w.charAt(0).toUpperCase() + w.slice(1);
}
function shortDate(iso) { return fmtShort.format(parseISO(iso)).replace(".", ""); }
function ddmm(iso) { return iso.slice(8, 10) + "." + iso.slice(5, 7); }

const MEAL_LABEL = { breakfast: "Завтрак", lunch: "Обед", dinner: "Ужин", snack: "Перекус" };
const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack"];

/* ================= API ================= */

class ApiError extends Error {}

async function call(op, extra = {}) {
  if (MOCK) return Mock.handle(op, extra);
  if (!tg || !tg.initData) throw new ApiError("Открой приложение кнопкой в боте Telegram");
  let res;
  try {
    res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Telegram-Init-Data": tg.initData },
      body: JSON.stringify({ op, ...extra }),
    });
  } catch (_) {
    throw new ApiError("Нет соединения");
  }
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) throw new ApiError((data && (data.error || data.message)) || "Ошибка сервера " + res.status);
  if (!data) throw new ApiError("Пустой ответ сервера");
  return data;
}

/* ================= Mock backend ================= */

const Mock = (() => {
  let seed = 20260928;
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let idc = 1;
  const uid = (p) => p + "-" + (idc++).toString(36) + "-" + Math.floor(rnd() * 1e6).toString(36);

  // per 100 g: kcal, protein, carbs, fat
  const FOOD = {
    "овсянка": [379, 13, 67, 7], "молоко 2,5%": [52, 2.9, 4.7, 2.5], "банан": [89, 1.1, 23, 0.3],
    "куриная грудка": [165, 31, 0, 3.6], "рис отварной": [130, 2.7, 28, 0.3], "огурцы": [15, 0.7, 3.6, 0.1],
    "греческий йогурт 2%": [73, 10, 3.6, 2], "протеиновый батончик": [350, 33, 35, 9], "яйца": [155, 13, 1.1, 11],
    "творог 5%": [121, 17, 1.8, 5], "лосось": [208, 20, 0, 13], "картофель отварной": [86, 1.7, 20, 0.1],
    "гречка отварная": [110, 4.2, 21, 1.1], "хлеб цельнозерновой": [247, 13, 41, 3.4], "яблоко": [52, 0.3, 14, 0.2],
    "кофе с молоком": [40, 2, 3, 2], "овощной салат": [40, 1, 5, 2], "индейка": [135, 29, 0, 2], "паста": [158, 5.8, 31, 0.9],
  };
  const ALIASES = [
    [/кур/i, "куриная грудка"], [/рис/i, "рис отварной"], [/греч/i, "гречка отварная"], [/яйц/i, "яйца"],
    [/творог/i, "творог 5%"], [/йогурт/i, "греческий йогурт 2%"], [/банан/i, "банан"], [/яблок/i, "яблоко"],
    [/овсян/i, "овсянка"], [/лосос|сёмг|семг/i, "лосось"], [/индейк/i, "индейка"], [/паст|макарон/i, "паста"],
    [/батончик/i, "протеиновый батончик"], [/картош|картоф/i, "картофель отварной"], [/хлеб/i, "хлеб цельнозерновой"],
  ];

  const item = (name, grams, units = null, unit_name = null, per = null) =>
    ({ id: uid("i"), name, grams, units, unit_name, per: per || FOOD[name], editable: true });
  const meal = (type, time, items) => ({ id: uid("m"), meal_type: type, time, items });
  const r = (a, b) => a + rnd() * (b - a);
  const g10 = (a, b) => Math.round(r(a, b) / 10) * 10;

  const today = localToday();
  const db = { targets: { calorie_target: 1900, protein_target: 160, weight_target: 78.0, fat_target: 70, carbs_target: null }, days: {} };
  const mset = { timezone: "Europe/Paris", day_starts_at_hour: 4, health: { connected: true, last_upload_at: today + "T19:53:00Z" } };
  const settingsOut = () => ({ timezone: mset.timezone, day_starts_at_hour: mset.day_starts_at_hour, calorie_target: db.targets.calorie_target, protein_target: db.targets.protein_target, weight_target: db.targets.weight_target, fat_target: db.targets.fat_target, carbs_target: db.targets.carbs_target, health: { ...mset.health } });
  function setSettings(p) {
    const bad = (msg) => { throw new ApiError(msg); };
    const num = (v) => typeof v === "number" && Number.isFinite(v);
    if ("timezone" in p) { try { new Intl.DateTimeFormat("en", { timeZone: p.timezone }); } catch (_) { bad("Неизвестный часовой пояс"); } }
    if ("day_starts_at_hour" in p && !(Number.isInteger(p.day_starts_at_hour) && p.day_starts_at_hour >= 0 && p.day_starts_at_hour <= 12)) bad("Начало дня: от 0 до 12 часов");
    if ("calorie_target" in p && p.calorie_target !== null && !(num(p.calorie_target) && p.calorie_target >= 800 && p.calorie_target <= 6000)) bad("Калории: от 800 до 6000");
    if ("protein_target" in p && p.protein_target !== null && !(num(p.protein_target) && p.protein_target >= 20 && p.protein_target <= 400)) bad("Белок: от 20 до 400 г");
    for (const k of ["fat_target", "carbs_target"]) if (p[k] === "") p[k] = null;
    if ("fat_target" in p && p.fat_target !== null && !(num(p.fat_target) && p.fat_target >= 10 && p.fat_target <= 400)) bad("Жиры: от 10 до 400 г");
    if ("carbs_target" in p && p.carbs_target !== null && !(num(p.carbs_target) && p.carbs_target >= 20 && p.carbs_target <= 800)) bad("Углеводы: от 20 до 800 г");
    if ("weight_target" in p && p.weight_target !== null && !(num(p.weight_target) && p.weight_target >= 30 && p.weight_target <= 300)) bad("Целевой вес: от 30 до 300 кг");
    if ("timezone" in p) mset.timezone = p.timezone;
    if ("day_starts_at_hour" in p) mset.day_starts_at_hour = p.day_starts_at_hour;
    for (const k of ["calorie_target", "protein_target", "fat_target", "carbs_target"]) if (k in p) db.targets[k] = p[k] == null ? null : Math.round(p[k]);
    if ("weight_target" in p) db.targets.weight_target = p.weight_target == null ? null : Math.round(p.weight_target * 10) / 10;
    return settingsOut();
  }
  const unlogged = new Set([4, 11, 12, 19, 25]);
  const noHealth = new Set([6, 12, 19, 23]);

  function pastMeals() {
    const b = rnd() < 0.5
      ? [item("овсянка", g10(50, 80)), item("молоко 2,5%", 200), item("банан", 120, 1, "шт")]
      : [item("яйца", 110, 2, "шт"), item("хлеб цельнозерновой", g10(40, 70)), item("кофе с молоком", 250)];
    const l = [item(rnd() < 0.6 ? "куриная грудка" : "индейка", g10(150, 250)), item(rnd() < 0.5 ? "рис отварной" : "гречка отварная", g10(120, 220)), item("овощной салат", g10(100, 200))];
    const d = rnd() < 0.5
      ? [item("лосось", g10(120, 200)), item("картофель отварной", g10(150, 250))]
      : [item("паста", g10(150, 260)), item("куриная грудка", g10(100, 160))];
    const out = [meal("breakfast", "08:" + String(Math.floor(r(10, 50))).padStart(2, "0"), b), meal("lunch", "13:" + String(Math.floor(r(0, 50))).padStart(2, "0"), l), meal("dinner", "19:" + String(Math.floor(r(0, 50))).padStart(2, "0"), d)];
    if (rnd() < 0.6) out.push(meal("snack", "16:30", [rnd() < 0.5 ? item("греческий йогурт 2%", 170) : item("творог 5%", 180)]));
    return out;
  }

  for (let ago = 29; ago >= 1; ago--) {
    const date = addDays(today, -ago);
    const logged = !unlogged.has(ago);
    const trained = logged && rnd() < 0.4;
    const day = {
      meals: logged ? pastMeals() : [],
      activities: trained ? [{ id: uid("a"), description: rnd() < 0.6 ? "силовая тренировка" : "бег", duration_min: Math.round(r(40, 90) / 5) * 5, kcal: Math.round(r(280, 560)) }] : [],
      health: noHealth.has(ago) ? null : { steps: Math.round(r(4200, 13500)), active_kcal: Math.round(r(280, 760)), basal_kcal: Math.round(r(1760, 1820)), updated_at: date + "T22:50:00Z" },
      weight: null,
    };
    if (rnd() > 0.22) {
      const t = (29 - ago) / 29;
      day.weight = Math.round((83.5 - 1.4 * t + (rnd() - 0.5) * 0.7) * 10) / 10;
    }
    db.days[date] = day;
  }
  db.days[today] = {
    meals: [
      meal("breakfast", "08:20", [item("овсянка", 60), item("молоко 2,5%", 200), item("банан", 120, 1, "шт")]),
      meal("lunch", "13:10", [item("куриная грудка", 200), item("рис отварной", 150), item("огурцы", 150)]),
      meal("snack", "16:40", [item("греческий йогурт 2%", 170), item("протеиновый батончик", 60, 1, "шт")]),
    ],
    activities: [{ id: uid("a"), description: "силовая тренировка", duration_min: 90, kcal: 520 }],
    health: { steps: 8400, active_kcal: 610, basal_kcal: 1780, updated_at: today + "T18:02:00Z" },
    weight: 82.1,
  };

  const undoStack = [];
  const snapshot = (label, date) => undoStack.push({ label, date, state: JSON.parse(JSON.stringify(db)) });
  const ensure = (date) => db.days[date] || (db.days[date] = { meals: [], activities: [], health: null, weight: null });

  function itemOut(it) {
    const f = it.grams / 100;
    return {
      id: it.id, name: it.name, grams: it.grams, units: it.units, unit_name: it.unit_name,
      kcal: Math.round(it.per[0] * f), protein: Math.round(it.per[1] * f), carbs: Math.round(it.per[2] * f), fat: Math.round(it.per[3] * f),
      editable: it.editable,
    };
  }

  function buildDay(date) {
    const d = ensure(date);
    const meals = d.meals.map((m) => {
      const items = m.items.map(itemOut);
      return { id: m.id, meal_type: m.meal_type, time: m.time, kcal: items.reduce((s, i) => s + i.kcal, 0), protein: items.reduce((s, i) => s + i.protein, 0), items };
    });
    const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    meals.forEach((m) => m.items.forEach((i) => { totals.kcal += i.kcal; totals.protein += i.protein; totals.carbs += i.carbs; totals.fat += i.fat; }));
    const isToday = date === today;
    let balance = null;
    if (d.health) {
      const basal = isToday ? 1850 : d.health.basal_kcal;
      const workouts = d.activities.reduce((s, a) => s + a.kcal, 0);
      const burned = basal + d.health.active_kcal + workouts;
      balance = { eaten: totals.kcal, basal, active: d.health.active_kcal, workouts, burned, net: totals.kcal - burned, basal_is_estimate: isToday };
    }
    return {
      date, is_today: isToday, targets: { ...db.targets }, totals,
      meals, activities: d.activities.map((a) => ({ ...a })), health: d.health ? { ...d.health } : null, balance,
    };
  }

  function findItem(id) {
    for (const [date, d] of Object.entries(db.days)) for (const m of d.meals) { const it = m.items.find((i) => i.id === id); if (it) return { date, d, m, it }; }
    return null;
  }

  function history(n) {
    const days = [], weights = [];
    const dates = [];
    for (let k = n - 1; k >= 0; k--) dates.push(addDays(today, -k));
    for (const date of dates) {
      const d = buildDay(date);
      const logged = d.meals.length > 0;
      days.push({ date, kcal: logged ? d.totals.kcal : 0, protein: logged ? d.totals.protein : 0, burned: d.balance ? d.balance.burned : null, logged });
    }
    const wd = dates.map((date) => ({ date, kg: ensure(date).weight })).filter((w) => w.kg != null);
    wd.forEach((w, i) => {
      const from = addDays(w.date, -6);
      const win = wd.slice(0, i + 1).filter((x) => x.date >= from);
      weights.push({ date: w.date, kg: w.kg, avg7: Math.round((win.reduce((s, x) => s + x.kg, 0) / win.length) * 100) / 100 });
    });
    const last7 = days.slice(-7);
    const lg = last7.filter((d) => d.logged);
    const avg = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);
    const netDays = lg.filter((d) => d.burned != null && d.date !== today);
    const latest = weights[weights.length - 1] || null;
    const avgAt = (date) => { const w = [...weights].reverse().find((x) => x.date <= date); return w ? w.avg7 : null; };
    const a7 = latest ? latest.avg7 : null;
    const a7ago = avgAt(addDays(today, -7));
    const first = weights[0];
    const change30 = latest && first ? Math.round((latest.avg7 - first.avg7) * 10) / 10 : null;
    return {
      days, weights,
      stats: {
        avg_kcal7: lg.length ? Math.round(avg(lg.map((d) => d.kcal))) : null,
        avg_protein7: lg.length ? Math.round(avg(lg.map((d) => d.protein))) : null,
        logged7: lg.length,
        avg_net7: netDays.length ? Math.round(avg(netDays.map((d) => d.kcal - d.burned))) : null,
        weight: {
          latest: latest ? { date: latest.date, kg: latest.kg } : null,
          avg7: a7,
          change7: a7 != null && a7ago != null ? Math.round((a7 - a7ago) * 10) / 10 : null,
          change30,
          per_week: change30 != null ? Math.round((change30 / (29 / 7)) * 100) / 100 : null,
          ...goalStats(a7 != null ? a7 : latest ? latest.kg : null, change30 != null ? change30 / (29 / 7) : null),
        },
      },
    };
  }

  function goalStats(current, perWeek) {
    let target = db.targets.weight_target;
    const force = params.get("goal"); // mock-only: none | away | flat | reached
    if (force === "none") target = null;
    const empty = { target, to_goal: null, eta_weeks: null, eta_date: null, direction: null };
    if (target == null || current == null) return empty;
    if (force === "away") perWeek = Math.abs(perWeek || 0.3);
    if (force === "flat") perWeek = 0;
    if (force === "reached") current = target;
    const to_goal = Math.round((target - current) * 10) / 10;
    if (Math.abs(to_goal) < 0.2) return { ...empty, to_goal, direction: "reached" };
    if (perWeek == null || Math.abs(perWeek) < 0.05) return { ...empty, to_goal, direction: "flat" };
    if (Math.sign(perWeek) !== Math.sign(to_goal)) return { ...empty, to_goal, direction: "away" };
    const eta_weeks = Math.ceil(Math.abs(to_goal / perWeek));
    return { target, to_goal, eta_weeks, eta_date: addDays(today, eta_weeks * 7), direction: "toward" };
  }

  function log(text, date) {
    const target = date || today;
    const t = text.trim();
    const wm = t.match(/^(\d{2,3}(?:[.,]\d{1,2})?)\s*(кг)?$/i);
    if (wm) {
      snapshot("вес", target);
      const kg = parseFloat(wm[1].replace(",", "."));
      ensure(target).weight = kg;
      return { reply: `Вес ${fmt(kg, 1)} кг записан.`, day: buildDay(target) };
    }
    const mins = t.match(/(\d+)\s*мин/i);
    if (mins && /(бег|ходьб|прогул|трениров|велос|плав|зал|йог|футбол|теннис)/i.test(t)) {
      snapshot("активность", target);
      const min = +mins[1];
      const desc = t.replace(mins[0], "").replace(/\s+/g, " ").trim() || "активность";
      const kcal = Math.round(min * (/бег/i.test(t) ? 10 : 7));
      ensure(target).activities.push({ id: uid("a"), description: desc, duration_min: min, kcal });
      return { reply: `Записал: ${desc}, ${min} мин, примерно ${fmt(kcal)} ккал.`, day: buildDay(target) };
    }
    const gm = t.match(/(\d+)\s*(грамм[а-яё]*|гр|г|мл)(?![а-яё])/i);
    const grams = gm ? +gm[1] : 150;
    let raw = (gm ? t.replace(gm[0], "") : t).replace(/\s+/g, " ").trim();
    const hit = ALIASES.find(([re]) => re.test(raw));
    const name = hit ? hit[1] : (raw || "блюдо").toLowerCase();
    const per = hit ? FOOD[hit[1]] : [150, 8, 18, 5];
    snapshot("еда", target);
    const d = ensure(target);
    const h = new Date().getHours();
    const type = target !== today ? "snack" : h < 11 ? "breakfast" : h < 16 ? "lunch" : h < 21 ? "dinner" : "snack";
    const now = new Date();
    const hm = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    let m = d.meals.find((x) => x.meal_type === type);
    if (!m) { m = meal(type, hm, []); d.meals.push(m); }
    const it = item(name, grams, null, null, per);
    m.items.push(it);
    const o = itemOut(it);
    return { reply: `${MEAL_LABEL[type]}: ${name}, ${grams} г. ${fmt(o.kcal)} ккал, белок ${o.protein} г.`, day: buildDay(target) };
  }

  const delay = (ms) => new Promise((res) => setTimeout(res, ms));
  let failOnce = params.get("fail") === "1";

  async function handle(op, p) {
    await delay(op === "log" ? 700 : 220 + rnd() * 200);
    if (failOnce) { failOnce = false; throw new ApiError("Сервер не ответил (mock)"); }
    switch (op) {
      case "day": return buildDay(p.date || today);
      case "history": return history(p.days || 30);
      case "set_item_quantity": {
        const f = findItem(p.item_id); if (!f) throw new ApiError("Позиция не найдена");
        snapshot(`${f.it.name}: ${f.it.grams} г`, f.date);
        if (f.it.units && f.it.grams) f.it.units = Math.round((f.it.units * p.grams / f.it.grams) * 10) / 10;
        f.it.grams = p.grams;
        return buildDay(f.date);
      }
      case "delete_item": {
        const f = findItem(p.item_id); if (!f) throw new ApiError("Позиция не найдена");
        snapshot(`удаление «${f.it.name}»`, f.date);
        f.m.items = f.m.items.filter((i) => i !== f.it);
        if (!f.m.items.length) f.d.meals = f.d.meals.filter((m) => m !== f.m);
        return buildDay(f.date);
      }
      case "delete_meal": {
        for (const [date, d] of Object.entries(db.days)) {
          const m = d.meals.find((x) => x.id === p.meal_id);
          if (m) { snapshot(`удаление «${MEAL_LABEL[m.meal_type].toLowerCase()}»`, date); d.meals = d.meals.filter((x) => x !== m); return buildDay(date); }
        }
        throw new ApiError("Приём пищи не найден");
      }
      case "delete_activity": {
        for (const [date, d] of Object.entries(db.days)) {
          const a = d.activities.find((x) => x.id === p.activity_id);
          if (a) { snapshot(`удаление «${a.description}»`, date); d.activities = d.activities.filter((x) => x !== a); return buildDay(date); }
        }
        throw new ApiError("Активность не найдена");
      }
      case "set_activity": {
        for (const [date, d] of Object.entries(db.days)) {
          const a = d.activities.find((x) => x.id === p.activity_id);
          if (a) {
            if (p.kcal != null && (p.kcal < 0 || p.kcal > 5000)) throw new ApiError("Калории: от 0 до 5000");
            snapshot(`правка «${a.description}»`, date);
            if (p.kcal != null) a.kcal = p.kcal;
            if (p.duration_min != null) a.duration_min = p.duration_min;
            return buildDay(date);
          }
        }
        throw new ApiError("Активность не найдена");
      }
      case "undo": {
        const s = undoStack.pop();
        if (!s) return { message: "Нечего отменять.", day: buildDay(today) };
        db.targets = s.state.targets; db.days = s.state.days;
        return { message: `Отменил: ${s.label}.`, day: buildDay(s.date) };
      }
      case "log": return log(p.text || "", p.date);
      case "set_targets": {
        snapshot("цели", today);
        if (p.calorie_target != null) db.targets.calorie_target = p.calorie_target;
        if (p.protein_target != null) db.targets.protein_target = p.protein_target;
        return buildDay(today);
      }
      case "settings": return settingsOut();
      case "request_shortcut": return { message: "Запрос принят. Шорткат придёт в чат в течение дня-двух." };
      case "set_settings": { const { op: _o, ...rest } = p; return setSettings(rest); }
      default: throw new ApiError("Неизвестная операция " + op);
    }
  }
  return { handle };
})();

/* ================= state ================= */

const state = {
  tab: "today",
  date: null,           // null = today
  day: null,
  dayLoading: false,
  dayError: null,
  animate: true,
  history: null,
  historyLoading: false,
  historyError: null,
  hover: { kcal: null, weight: null },
};
let dayToken = 0, histToken = 0, pendingDate = null;

const $ = (s, el = document) => el.querySelector(s);
const elToday = $("#today");
const elTrends = $("#trends");

async function loadDay(date, { animate = true } = {}) {
  const token = ++dayToken;
  pendingDate = date;
  state.dayLoading = true; state.dayError = null; state.animate = animate;
  renderToday();
  try {
    const d = await call("day", date ? { date } : {});
    if (token !== dayToken) return;
    state.day = d; state.date = d.is_today ? null : d.date;
  } catch (e) {
    if (token !== dayToken) return;
    state.dayError = e.message || "Ошибка";
    state.failedDate = date;
  }
  pendingDate = null;
  state.dayLoading = false;
  renderToday();
  syncQuickWhen();
}

async function loadHistory() {
  const token = ++histToken;
  state.historyLoading = true; state.historyError = null;
  renderTrends();
  try { const h = await call("history", { days: 30 }); if (token !== histToken) return; state.history = h; }
  catch (e) { if (token !== histToken) return; state.historyError = e.message || "Ошибка"; }
  state.historyLoading = false;
  renderTrends();
}

function applyDay(d) {
  if (!d || !d.date) return;
  dayToken++; pendingDate = null; state.dayLoading = false; state.dayError = null;
  const viewing = state.day ? state.day.date : null;
  state.history = null;
  if (!viewing || d.date === viewing) {
    state.day = d; state.date = d.is_today ? null : d.date; state.animate = false;
    renderToday();
  } else if (d.targets && state.day) {
    // mutation touched another day (e.g. undo, set_targets): show that day
    state.day = d; state.date = d.is_today ? null : d.date; state.animate = true;
    renderToday();
  }
  syncQuickWhen();
  if (state.tab === "trends") loadHistory();
}

/* ================= icons ================= */

const ICON = {
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/></svg>',
};

/* ================= Today ================= */

function ruler(value, target, { thin = false, cls = "", tickStep = 250, grow = false } = {}) {
  const max = target ? Math.max(target * 1.1, value) : Math.max(value, 1) * 1.1;
  const pct = (v) => Math.max(0, Math.min(100, (v / max) * 100));
  const base = target ? Math.min(value, target) : value;
  const over = target && value > target ? value - target : 0;
  const tick = (tickStep / max) * 100;
  return `<div class="ruler ${thin ? "thin" : ""} ${cls}" style="--tick:${tick}%">
    <div class="track">
      <div class="fill" style="width:${pct(base)}%${grow ? ";animation:grow .8s var(--ease) both" : ""}"></div>
      ${over ? `<div class="fill overpart" style="left:${pct(target)}%;width:${pct(over)}%"></div>` : ""}
      ${thin ? "" : '<div class="ticks"></div>'}
    </div>
    ${target ? `<div class="mark" style="left:${pct(target)}%"></div>` : ""}
  </div>`;
}

function skeletonToday() {
  return `
  <div class="daynav"><div style="width:44px"></div><div class="label"><div class="sk" style="width:120px;height:20px;margin:0 auto 6px"></div><div class="sk" style="width:80px;height:12px;margin:0 auto"></div></div><div style="width:44px"></div></div>
  <div class="card"><div class="sk" style="width:60%;height:48px"></div><div class="sk" style="width:40%;height:14px;margin-top:10px"></div><div class="sk" style="height:14px;margin-top:18px;border-radius:7px"></div>
  <div class="sk" style="height:40px;margin-top:22px"></div></div>
  <div class="card"><div class="sk" style="width:30%;height:14px"></div><div class="sk" style="height:36px;margin-top:12px"></div><div class="sk" style="height:24px;margin-top:12px"></div></div>
  <div class="card"><div class="sk" style="width:40%;height:16px"></div><div class="sk" style="height:18px;margin-top:14px"></div><div class="sk" style="height:18px;margin-top:12px"></div></div>`;
}

function errorBlock(msg, action) {
  return `<div class="error"><div>Не загрузилось<small>${esc(msg)}</small></div><button data-action="${action}">Повторить</button></div>`;
}

function renderToday() {
  const d = state.day;
  if (!d) {
    elToday.innerHTML = state.dayError ? errorBlock(state.dayError, "retry-day") + skeletonToday() : skeletonToday();
    return;
  }
  const t = d.targets || {};
  const tot = d.totals || { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const a = state.animate;
  let i = 0;
  const rise = () => (a ? ` rise" style="animation-delay:${(i++) * 50}ms` : "");

  const kcalT = t.calorie_target;
  const left = kcalT ? kcalT - tot.kcal : null;
  const leftLine = kcalT == null
    ? `<button class="target-btn" data-action="targets">Задать цель</button>`
    : left >= 0 ? `осталось <b>${fmt(left)}</b> ккал` : `сверх цели <b class="over">+${fmt(-left)}</b> ккал`;

  const hero = `
  <div class="card hero${rise()}">
    <div class="big">
      <span class="eaten num">${fmt(tot.kcal)}</span>
      <span class="of">${kcalT != null ? `из <button class="target-btn num" data-action="targets" aria-label="Изменить цели">${fmt(kcalT)}</button>` : ""} ккал</span>
    </div>
    <div class="left">${leftLine}</div>
    ${ruler(tot.kcal, kcalT, { grow: a })}
    <div class="macros">
      <div class="macro p">
        <div class="k">Белок</div>
        <div class="v num">${fmt(tot.protein)}<small>${t.protein_target ? ` / <button class="target-btn" data-action="targets">${fmt(t.protein_target)}</button>` : ""} г</small></div>
        ${ruler(tot.protein, t.protein_target, { thin: true, cls: "protein", tickStep: 1e9 })}
      </div>
      ${minorMacro("Жиры", tot.fat, t.fat_target)}
      ${minorMacro("Углеводы", tot.carbs, t.carbs_target)}
    </div>
  </div>`;

  let balance = "";
  const b = d.balance, h = d.health;
  if (b) {
    const max = Math.max(b.eaten, b.burned, 1);
    const w = (v) => ((v || 0) / max) * 100;
    const netCls = b.net < 0 ? "deficit" : b.net > 0 ? "surplus" : "";
    balance = `
    <div class="card${rise()}">
      <div class="card-title"><span>Баланс</span>${h && h.steps != null ? `<span class="aside">${fmt(h.steps)} шагов</span>` : ""}</div>
      <div class="eq">
        <div class="term"><div class="k">Съедено</div><div class="v num">${fmt(b.eaten)}</div></div>
        <div class="op">−</div>
        <div class="term"><div class="k">Расход</div><div class="v num">${fmt(b.burned)}</div></div>
        <div class="op">=</div>
        <div class="term net ${netCls}"><div class="k">${b.net < 0 ? "Дефицит" : b.net > 0 ? "Профицит" : "Итог"}</div><div class="v num">${fmtSigned(b.net)}</div></div>
      </div>
      <div class="bars2" aria-hidden="true">
        <div class="row"><div class="seg-b" style="width:${w(b.eaten)}%;background:var(--accent)"></div></div>
        <div class="row">
          <div class="seg-b ${b.basal_is_estimate ? "estimate" : ""}" style="width:${w(b.basal)}%;background:var(--basal)"></div>
          ${b.active ? `<div class="seg-b" style="width:${w(b.active)}%;background:var(--active)"></div>` : ""}
          ${b.workouts ? `<div class="seg-b" style="width:${w(b.workouts)}%;background:var(--workout)"></div>` : ""}
        </div>
      </div>
      <div class="legend">
        <span><i style="background:var(--basal)"></i>базовый <b class="num">${fmt(b.basal)}</b>${b.basal_is_estimate ? '<span class="pill">прогноз</span>' : ""}</span>
        ${b.active ? `<span><i style="background:var(--active)"></i>активность <b class="num">${fmt(b.active)}</b></span>` : ""}
        ${b.workouts ? `<span><i style="background:var(--workout)"></i>тренировки <b class="num">${fmt(b.workouts)}</b></span>` : ""}
      </div>
    </div>`;
  } else if (h) {
    balance = `<div class="card${rise()}"><div class="card-title"><span>Активность</span></div>
      <div class="legend" style="margin-top:0"><span>шаги <b class="num">${fmt(h.steps)}</b></span><span>активные <b class="num">${fmt(h.active_kcal)}</b> ккал</span></div></div>`;
  }

  const meals = [...(d.meals || [])].sort((x, y) => MEAL_ORDER.indexOf(x.meal_type) - MEAL_ORDER.indexOf(y.meal_type) || String(x.time).localeCompare(String(y.time)));
  let mealsHtml = "";
  if (meals.length) {
    mealsHtml = `<div class="section-h"><h2>Еда</h2><span>${meals.length} ${plural(meals.length, "приём", "приёма", "приёмов")}</span></div>`;
    for (const m of meals) {
      mealsHtml += `
      <div class="swipe meal${rise()}" data-meal="${esc(m.id)}">
        <button class="swipe-del" data-action="del-meal" data-id="${esc(m.id)}" tabindex="-1">Удалить</button>
        <div class="swipe-body">
          <div class="meal-h" data-longpress="meal" data-id="${esc(m.id)}">
            <span class="name">${MEAL_LABEL[m.meal_type] || esc(m.meal_type)}</span>
            ${m.time ? `<span class="time num">${esc(m.time)}</span>` : ""}
            <span class="sum num"><b>${fmt(m.kcal)}</b> ккал · ${fmt(m.protein)} б</span>
          </div>
          ${(m.items || []).map(itemRow).join("")}
        </div>
      </div>`;
    }
  }

  const acts = d.activities || [];
  let actsHtml = "";
  if (acts.length) {
    actsHtml = `<div class="section-h"><h2>Тренировки</h2><span class="num">${fmt(acts.reduce((s, x) => s + (x.kcal || 0), 0))} ккал</span></div>
    <div class="card${rise()}" style="padding:4px 0">${acts.map((x) => `
      <div class="act" data-action="act" data-id="${esc(x.id)}" role="button" tabindex="0">
        <div class="dot">${ICON.bolt}</div>
        <div class="nm"><div>${esc(cap(x.description))}</div><small class="num">${x.duration_min ? fmt(x.duration_min) + " мин" : ""}</small></div>
        <div class="kc num">${fmt(x.kcal)}</div>
        <button class="x" data-action="del-act" data-id="${esc(x.id)}" aria-label="Удалить">${ICON.x}</button>
      </div>`).join("")}</div>`;
  }

  const empty = !meals.length && !acts.length
    ? `<div class="card empty${rise()}"><b>${d.is_today ? "Пока пусто" : "В этот день ничего не записано"}</b>Напиши внизу, что съел, или отправь боту в чат.</div>` : "";

  const upd = h && h.updated_at ? new Date(h.updated_at) : null;
  const foot = meals.length
    ? `<div class="footnote">Смахни приём влево или удерживай, чтобы удалить${upd ? ` · здоровье ${upd.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : ""}</div>` : "";

  elToday.innerHTML = `
    <div class="daynav">
      <button class="arrow" data-action="prev" aria-label="Предыдущий день">${ICON.left}</button>
      <div class="label"><b>${dayTitle(d.date, d.is_today)}</b><span>${fmtLong.format(parseISO(d.date))}${MOCK ? " · демо-данные" : ""}</span></div>
      <button class="arrow" data-action="next" aria-label="Следующий день" ${d.is_today ? "disabled" : ""}>${ICON.right}</button>
    </div>
    ${state.dayError ? errorBlock(state.dayError, "retry-day") : ""}
    <div style="transition:opacity .2s;${state.dayLoading ? "opacity:.45;pointer-events:none" : ""}">
      ${hero}${balance}${mealsHtml}${actsHtml}${empty}${foot}
    </div>`;
  state.animate = false;
}

function minorMacro(label, value, target) {
  return `<div class="macro"><div class="k">${label}</div><div class="v num">${fmt(value)}<small>${target ? ` / ${fmt(target)}` : ""} г</small></div>${target ? ruler(value || 0, target, { thin: true, cls: "minor", tickStep: 1e9 }) : ""}</div>`;
}

function itemRow(it) {
  const qty = it.units != null && it.unit_name
    ? `${fmt(it.units, it.units % 1 ? 1 : 0)} ${esc(it.unit_name)}${it.grams ? ` · ${fmt(it.grams)} г` : ""}`
    : it.grams != null ? `${fmt(it.grams)} г` : "";
  return `<button class="item" data-action="item" data-id="${esc(it.id)}">
    <div class="nm"><div>${esc(cap(it.name))}</div><small class="num">${qty}${qty ? " · " : ""}Б ${fmt(it.protein)}</small></div>
    <span class="kc num">${fmt(it.kcal)}</span>${ICON.chev}
  </button>`;
}

function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
function plural(n, a, b, c) { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; }

/* ================= Trends ================= */

function skeletonTrends() {
  return `<div class="card"><div class="sk" style="width:40%;height:14px"></div><div class="sk" style="width:50%;height:24px;margin-top:10px"></div><div class="sk" style="height:170px;margin-top:12px"></div></div>
  <div class="card"><div class="sk" style="width:40%;height:14px"></div><div class="sk" style="height:150px;margin-top:12px"></div></div>
  <div class="tiles">${'<div class="tile"><div class="sk" style="width:60%;height:12px"></div><div class="sk" style="width:50%;height:22px;margin-top:10px"></div></div>'.repeat(4)}</div>`;
}

function chartWidth() { return Math.max(260, Math.min(elTrends.clientWidth || 358, 520) - 32); }

function barPath(x, y, w, h, r) {
  if (h <= 0) return "";
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function kcalChart(hist, target) {
  const days = hist.days || [];
  const W = chartWidth(), H = 176, pr = 34, pt = 8, pb = 20;
  const iw = W - pr, ih = H - pt - pb, n = Math.max(days.length, 1);
  const maxV = Math.max(target || 0, ...days.map((d) => d.kcal || 0), ...days.map((d) => d.burned || 0), 1000);
  const top = Math.ceil((maxV * 1.06) / 500) * 500;
  const y = (v) => pt + ih - (v / top) * ih;
  const slot = iw / n, bw = Math.max(3, slot - 2.5);
  let s = `<svg class="chart" id="kcalChart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Калории за 30 дней">`;
  const step = top > 3000 ? 1000 : 500;
  for (let v = step; v < top; v += step) s += `<line class="grid" x1="0" x2="${iw}" y1="${y(v)}" y2="${y(v)}"/>` + (target && Math.abs(y(v) - y(target)) < 13 ? "" : `<text x="${W - 2}" y="${y(v) + 3.5}" text-anchor="end">${fmt(v)}</text>`);
  s += `<line class="grid" x1="0" x2="${iw}" y1="${y(0)}" y2="${y(0)}"/>`;
  s += `<rect class="hl" id="kcalHl" x="-99" y="${pt}" width="${slot}" height="${ih}" rx="3"/>`;
  days.forEach((d, i) => {
    const x = i * slot + (slot - bw) / 2;
    if (!d.logged) { s += `<rect class="unlogged" x="${x + 0.5}" y="${y(0) - 12}" width="${bw - 1}" height="11.5" rx="2"/>`; return; }
    s += `<path class="bar ${target && d.kcal > target ? "over" : ""}" d="${barPath(x, y(d.kcal), bw, y(0) - y(d.kcal), 2)}"/>`;
  });
  days.forEach((d, i) => {
    if (d.burned == null) return;
    const x = i * slot;
    s += `<line class="burn" x1="${x + 1.5}" x2="${x + slot - 1.5}" y1="${y(d.burned)}" y2="${y(d.burned)}"/>`;
  });
  if (target) s += `<line class="target" x1="0" x2="${iw}" y1="${y(target)}" y2="${y(target)}"/><text x="${W - 2}" y="${y(target) + 3.5}" text-anchor="end" style="fill:var(--text);font-weight:600">${fmt(target)}</text>`;
  if (days.length) {
    const lbl = [0, Math.floor(n / 2), n - 1];
    lbl.forEach((i, k) => s += `<text x="${Math.min(Math.max(i * slot + slot / 2, 12), iw - 14)}" y="${H - 5}" text-anchor="${k === 0 ? "start" : k === 2 ? "end" : "middle"}">${i === n - 1 && days[i].date === localToday() ? "сегодня" : ddmm(days[i].date)}</text>`);
  }
  s += `<rect id="kcalHit" x="0" y="0" width="${iw}" height="${H}" fill="transparent"/></svg>`;
  return { svg: s, slot, n };
}

function weightChart(hist) {
  const days = hist.days || [];
  const ws = hist.weights || [];
  const W = chartWidth(), H = 160, pr = 34, pt = 10, pb = 20;
  const iw = W - pr, ih = H - pt - pb;
  const dates = days.length ? days.map((d) => d.date) : ws.map((w) => w.date);
  const idx = new Map(dates.map((d, i) => [d, i]));
  const n = Math.max(dates.length, 1);
  const slot = iw / n;
  const pts = ws.filter((w) => w && w.kg != null && idx.has(w.date));
  if (!pts.length) return { svg: `<div class="empty" style="padding:24px 0">Взвешиваний пока нет. Напиши вес внизу, например «82.4».</div>`, pts, slot };
  const goal = hist.stats && hist.stats.weight && hist.stats.weight.target != null ? hist.stats.weight.target : null;
  const vals = []; pts.forEach((w) => { vals.push(w.kg); if (w.avg7 != null) vals.push(w.avg7); });
  if (goal != null) vals.push(goal);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = Math.max(0.3, (hi - lo) * 0.15);
  lo = Math.floor((lo - pad) * 2) / 2; hi = Math.ceil((hi + pad) * 2) / 2;
  const x = (d) => idx.get(d) * slot + slot / 2;
  const y = (v) => pt + ih - ((v - lo) / (hi - lo)) * ih;
  let s = `<svg class="chart" id="weightChart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Вес за 30 дней">
  <defs><linearGradient id="wgrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".16"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>`;
  const range = hi - lo, st = range > 4 ? 1 : 0.5;
  for (let v = lo + st; v < hi; v += st) s += `<line class="grid" x1="0" x2="${iw}" y1="${y(v)}" y2="${y(v)}"/>` + (goal != null && Math.abs(y(v) - y(goal)) < 12 ? "" : `<text x="${W - 2}" y="${y(v) + 3.5}" text-anchor="end">${fmt(v, 1)}</text>`);
  if (goal != null) s += `<line class="target" x1="0" x2="${W - 46}" y1="${y(goal)}" y2="${y(goal)}"/><text x="${W - 2}" y="${y(goal) + 3.5}" text-anchor="end" style="fill:var(--text);font-weight:600">цель ${fmt(goal, goal % 1 ? 1 : 0)}</text>`;
  const avgPts = pts.filter((w) => w.avg7 != null);
  if (avgPts.length > 1) {
    const line = avgPts.map((w, i) => `${i ? "L" : "M"}${x(w.date).toFixed(1)},${y(w.avg7).toFixed(1)}`).join("");
    s += `<path class="warea" d="${line}L${x(avgPts[avgPts.length - 1].date).toFixed(1)},${pt + ih}L${x(avgPts[0].date).toFixed(1)},${pt + ih}Z"/>`;
    s += `<path class="wline" d="${line}"/>`;
  }
  s += `<line class="cursor" id="wCursor" x1="-9" x2="-9" y1="${pt}" y2="${pt + ih}"/>`;
  pts.forEach((w) => s += `<circle class="wdot" data-d="${esc(w.date)}" cx="${x(w.date).toFixed(1)}" cy="${y(w.kg).toFixed(1)}" r="3"/>`);
  const lbl = [0, Math.floor(n / 2), n - 1];
  lbl.forEach((i, k) => s += `<text x="${Math.min(Math.max(i * slot + slot / 2, 12), iw - 14)}" y="${H - 5}" text-anchor="${k === 0 ? "start" : k === 2 ? "end" : "middle"}">${i === n - 1 && dates[i] === localToday() ? "сегодня" : ddmm(dates[i])}</text>`);
  s += `<rect id="wHit" x="0" y="0" width="${iw}" height="${H}" fill="transparent"/></svg>`;
  return { svg: s, pts, slot, dates };
}

function kcalReadout(hist, i) {
  const st = hist.stats || {};
  if (i == null) return `<div class="d">в среднем за 7 дней</div><div class="v num">${fmt(st.avg_kcal7)} <small>ккал</small></div>`;
  const d = hist.days && hist.days[i];
  if (!d) return "";
  if (!d.logged) return `<div class="d">${shortDate(d.date)}</div><div class="v"><small>не записано</small></div>`;
  return `<div class="d">${shortDate(d.date)}</div><div class="v num">${fmt(d.kcal)} <small>ккал · белок ${fmt(d.protein)} г${d.burned != null ? ` · расход ${fmt(d.burned)}` : ""}</small></div>`;
}
function weightReadout(hist, w) {
  const st = (hist.stats && hist.stats.weight) || {};
  if (!w) {
    const l = st.latest;
    return `<div class="d">${l ? "последнее, " + shortDate(l.date) : "нет данных"}</div><div class="v num">${l ? fmt(l.kg, 1) : "–"} <small>кг${st.avg7 != null ? ` · среднее 7 дн ${fmt(st.avg7, 1)}` : ""}</small></div>`;
  }
  return `<div class="d">${shortDate(w.date)}</div><div class="v num">${fmt(w.kg, 1)} <small>кг${w.avg7 != null ? ` · среднее ${fmt(w.avg7, 1)}` : ""}</small></div>`;
}

function goalTile(ws) {
  if (ws.target == null) {
    return `<button class="tile wide goal" data-action="settings"><div class="k">До цели</div><div class="v"><small>Цель не задана</small></div><div class="gsub link">Задать в настройках</div></button>`;
  }
  const dir = ws.direction;
  let sub = "", cls = "";
  if (dir === "toward") sub = [ws.eta_weeks != null ? `~${fmt(ws.eta_weeks)} нед` : "", ws.eta_date ? `к ${shortDate(ws.eta_date)}` : ""].filter(Boolean).join(" · ") || "идёшь к цели";
  else if (dir === "away") { sub = "вес идёт от цели"; cls = "bad"; }
  else if (dir === "flat") sub = "тренда пока нет";
  else if (dir === "reached") { sub = "цель достигнута"; cls = "good"; }
  const big = dir === "reached" ? fmt(ws.target, ws.target % 1 ? 1 : 0) : fmtSigned(ws.to_goal, 1);
  return `<div class="tile wide goal"><div class="k">До цели <span class="hint">· цель ${fmt(ws.target, ws.target % 1 ? 1 : 0)} кг</span></div>
    <div class="v num">${big} <small>кг</small></div>${sub ? `<div class="gsub ${cls}">${sub}</div>` : ""}</div>`;
}

function tile(k, v, unit = "", cls = "") { return `<div class="tile"><div class="k">${k}</div><div class="v num ${cls}">${v}${unit ? ` <small>${unit}</small>` : ""}</div></div>`; }
const trendCls = (v) => (v == null || Math.abs(v) < 0.05 ? "" : v < 0 ? "good" : "bad");

function renderTrends() {
  if (!state.history) {
    elTrends.innerHTML = state.historyError ? errorBlock(state.historyError, "retry-history") + skeletonTrends() : skeletonTrends();
    return;
  }
  const h = state.history;
  const target = state.day && state.day.targets ? state.day.targets.calorie_target : null;
  const st = h.stats || {};
  const ws = st.weight || {};
  const kc = kcalChart(h, target);
  const wc = weightChart(h);
  const hasBurn = (h.days || []).some((d) => d.burned != null);
  const hasUn = (h.days || []).some((d) => !d.logged);
  elTrends.innerHTML = `
  <div class="card rise">
    <div class="card-title"><span>Калории, 30 дней</span></div>
    <div class="readout" id="kcalRead">${kcalReadout(h, null)}</div>
    ${kc.svg}
    <div class="lg"><span><i class="sw"></i>съедено</span>${hasBurn ? '<span><i class="sw burn"></i>расход</span>' : ""}${target ? '<span><i class="sw tgt"></i>цель</span>' : ""}${hasUn ? '<span><i class="sw un"></i>не записано</span>' : ""}</div>
  </div>
  <div class="group-h">Питание, 7 дней</div>
  <div class="tiles rise" style="animation-delay:60ms">
    ${tile("Ккал в среднем", fmt(st.avg_kcal7))}
    ${tile("Белок в среднем", fmt(st.avg_protein7), "г")}
    ${tile("Дней записано", st.logged7 != null ? fmt(st.logged7) : "–", "из 7")}
    ${tile("Баланс в среднем", fmtSigned(st.avg_net7), "ккал", st.avg_net7 == null ? "" : st.avg_net7 < 0 ? "good" : "bad")}
  </div>
  <div class="card rise" style="animation-delay:100ms">
    <div class="card-title"><span>Вес</span></div>
    <div class="readout" id="wRead">${weightReadout(h, null)}</div>
    ${wc.svg}
    ${wc.pts.length ? '<div class="lg"><span><i class="sw dot"></i>взвешивание</span><span><i class="sw avg"></i>среднее за 7 дней</span>' + (ws.target != null ? '<span><i class="sw tgt"></i>цель</span>' : "") + '</div>' : ""}
  </div>
  <div class="tiles rise" style="animation-delay:140ms">
    ${goalTile(ws)}
    ${tile("Последний", ws.latest ? fmt(ws.latest.kg, 1) : "–", "кг")}
    ${tile("За 7 дней", fmtSigned(ws.change7, 1), "кг", trendCls(ws.change7))}
    ${tile("За 30 дней", fmtSigned(ws.change30, 1), "кг", trendCls(ws.change30))}
    ${tile("Темп", fmtSigned(ws.per_week, 2), "кг/нед", trendCls(ws.per_week))}
  </div>`;

  // scrubbing
  const kHit = $("#kcalHit"), kHl = $("#kcalHl"), kRead = $("#kcalRead");
  let lastK = -1;
  scrub(kHit, (xPos) => {
    const i = Math.max(0, Math.min(kc.n - 1, Math.floor(xPos / kc.slot)));
    if (i !== lastK) { lastK = i; haptic("select"); }
    kHl.setAttribute("x", i * kc.slot);
    kRead.innerHTML = kcalReadout(h, i);
  }, () => { lastK = -1; kHl.setAttribute("x", -99); kRead.innerHTML = kcalReadout(h, null); });

  const wHit = $("#wHit");
  if (wHit) {
    const wRead = $("#wRead"), cur = $("#wCursor");
    let lastW = null;
    scrub(wHit, (xPos) => {
      const i = Math.floor(xPos / wc.slot);
      let best = null, bd = 1e9;
      for (const w of wc.pts) { const di = Math.abs(wc.dates.indexOf(w.date) - i); if (di < bd) { bd = di; best = w; } }
      if (!best) return;
      if (best !== lastW) { lastW = best; haptic("select"); }
      const cx = (wc.dates.indexOf(best.date) + 0.5) * wc.slot;
      cur.setAttribute("x1", cx); cur.setAttribute("x2", cx);
      elTrends.querySelectorAll(".wdot.on").forEach((e) => e.classList.remove("on"));
      elTrends.querySelectorAll(".wdot").forEach((c) => { if (c.dataset.d === best.date) c.classList.add("on"); });
      wRead.innerHTML = weightReadout(h, best);
    }, () => {
      lastW = null; cur.setAttribute("x1", -9); cur.setAttribute("x2", -9);
      elTrends.querySelectorAll(".wdot.on").forEach((e) => e.classList.remove("on"));
      wRead.innerHTML = weightReadout(h, null);
    });
  }
}

function scrub(el, onMove, onEnd) {
  if (!el) return;
  const svg = el.ownerSVGElement;
  const pos = (e) => { const r = svg.getBoundingClientRect(); const vb = svg.viewBox.baseVal; return ((e.clientX - r.left) / r.width) * vb.width; };
  let active = false, sx = 0, sy = 0, decided = false, endT = null;
  el.addEventListener("pointerdown", (e) => {
    clearTimeout(endT);
    active = true; decided = e.pointerType === "mouse"; sx = e.clientX; sy = e.clientY;
    if (decided) onMove(pos(e));
  });
  el.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse") { onMove(pos(e)); return; }
    if (!active) return;
    if (!decided) {
      if (Math.abs(e.clientX - sx) > 6 && Math.abs(e.clientX - sx) > Math.abs(e.clientY - sy)) { decided = true; try { el.setPointerCapture(e.pointerId); } catch (_) {} }
      else if (Math.abs(e.clientY - sy) > 8) { active = false; return; }
      else return;
    }
    onMove(pos(e));
  });
  const end = (e) => {
    if (active && !decided && e.type === "pointerup") onMove(pos(e));
    active = false;
    if (e.pointerType === "mouse" && e.type !== "pointerleave") return;
    if (e.pointerType !== "mouse") { clearTimeout(endT); endT = setTimeout(onEnd, e.type === "pointerup" ? 1600 : 0); }
    else onEnd();
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  el.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") onEnd(); });
}

/* ================= toast ================= */

const toastEl = $("#toast");
let toastTimer = null;
function toast(msg, { error = false, ms } = {}) {
  toastEl.textContent = msg;
  toastEl.classList.toggle("err", error);
  toastEl.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("on"), ms || Math.min(7000, 2600 + msg.length * 40));
}
toastEl.addEventListener("click", () => toastEl.classList.remove("on"));

/* ================= sheets ================= */

let sheet = null;
function openSheet(html, onMount) {
  closeSheet(true);
  const root = $("#sheetRoot");
  const bd = document.createElement("div"); bd.className = "backdrop";
  const sh = document.createElement("div"); sh.className = "sheet"; sh.setAttribute("role", "dialog"); sh.setAttribute("aria-modal", "true");
  sh.innerHTML = `<div class="grab" aria-hidden="true"></div>${html}`;
  root.append(bd, sh);
  sheet = { bd, sh };
  requestAnimationFrame(() => requestAnimationFrame(() => { bd.classList.add("on"); sh.classList.add("on"); }));
  bd.addEventListener("click", () => closeSheet());
  setBack(() => closeSheet());
  dragToDismiss(sh);
  onMount && onMount(sh);
}
function closeSheet(instant) {
  if (!sheet) return;
  const { bd, sh } = sheet; sheet = null;
  setBack(settingsOpen ? closeSettings : null);
  if (document.activeElement && sh.contains(document.activeElement)) document.activeElement.blur();
  if (instant) { bd.remove(); sh.remove(); return; }
  bd.classList.remove("on"); sh.classList.remove("on"); sh.style.transform = "";
  setTimeout(() => { bd.remove(); sh.remove(); }, 450);
}
function dragToDismiss(sh) {
  const grab = sh.querySelector(".grab");
  let sy = null, dy = 0, t0 = 0;
  grab.addEventListener("pointerdown", (e) => { sy = e.clientY; dy = 0; t0 = performance.now(); sh.classList.add("dragging"); grab.setPointerCapture(e.pointerId); });
  grab.addEventListener("pointermove", (e) => {
    if (sy == null) return;
    dy = e.clientY - sy;
    const t = dy > 0 ? dy : -Math.pow(-dy, 0.7); // rubber band upward
    sh.style.transform = `translateY(${t}px)`;
  });
  const up = () => {
    if (sy == null) return;
    sh.classList.remove("dragging");
    const v = dy / Math.max(1, performance.now() - t0);
    if (dy > 110 || v > 0.6) closeSheet(); else sh.style.transform = "";
    sy = null;
  };
  grab.addEventListener("pointerup", up); grab.addEventListener("pointercancel", up);
}

function findItemInDay(id) {
  for (const m of (state.day && state.day.meals) || []) for (const it of m.items || []) if (it.id === id) return { m, it };
  return null;
}

function openItemSheet(id) {
  const f = findItemInDay(id); if (!f) return;
  const { it, m } = f;
  const canEdit = it.editable !== false && it.grams != null && it.grams > 0;
  haptic("light");
  openSheet(`
    <h3>${esc(cap(it.name))}</h3>
    <div class="sub">${MEAL_LABEL[m.meal_type] || ""}${m.time ? ", " + esc(m.time) : ""}</div>
    ${canEdit ? `
    <div class="stepper">
      <button class="rb" data-step="-10" aria-label="Минус 10 г">−</button>
      <label class="qty"><input id="qtyIn" type="text" inputmode="numeric" pattern="[0-9]*" value="${esc(it.grams)}" aria-label="Граммы"><span>г</span></label>
      <button class="rb" data-step="10" aria-label="Плюс 10 г">+</button>
    </div>
    <div class="chips">${[-50, -10, 10, 50].map((v) => `<button class="chip num" data-step="${v}">${v > 0 ? "+" : "−"}${Math.abs(v)}</button>`).join("")}</div>` : `<div class="sub">Количество этой позиции меняется только в чате с ботом.</div>`}
    <div class="preview" id="pv"></div>
    ${canEdit ? `<button class="btn primary" id="saveQty">Сохранить</button>` : ""}
    <button class="btn ghost" id="delItem">Удалить позицию</button>
  `, (sh) => {
    const inp = sh.querySelector("#qtyIn");
    const pv = sh.querySelector("#pv");
    const save = sh.querySelector("#saveQty");
    const val = () => (inp ? parseInt(inp.value.replace(/\D/g, ""), 10) || 0 : it.grams);
    const paint = () => {
      const g = val();
      const k = it.grams ? g / it.grams : 1;
      pv.innerHTML = [["ккал", it.kcal], ["белок", it.protein], ["жиры", it.fat], ["углев.", it.carbs]]
        .map(([l, v]) => `<div><div class="v num">${fmt(Math.round((v || 0) * k))}</div><div class="k">${l}</div></div>`).join("");
      if (save) { save.disabled = g <= 0 || g === it.grams; save.textContent = g === it.grams ? "Без изменений" : `Сохранить ${fmt(g)} г`; }
    };
    paint();
    if (inp) {
      inp.addEventListener("input", () => { inp.value = inp.value.replace(/\D/g, "").slice(0, 4); paint(); });
      inp.addEventListener("focus", () => setTimeout(() => inp.select(), 0));
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save && !save.disabled && save.click(); } });
    }
    sh.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => {
      inp.value = Math.max(0, Math.min(9999, val() + Number(b.dataset.step)));
      haptic("select"); paint();
    }));
    save && save.addEventListener("click", async () => {
      const g = val(); if (g <= 0) return;
      save.disabled = true; save.textContent = "Сохраняю…";
      try { const d = await call("set_item_quantity", { item_id: it.id, grams: g }); haptic("success"); closeSheet(); applyDay(d); }
      catch (e) { haptic("error"); toast(e.message, { error: true }); paint(); }
    });
    const delBtn = sh.querySelector("#delItem");
    delBtn.addEventListener("click", async () => {
      if (delBtn.disabled) return;
      delBtn.disabled = true;
      if (!(await confirmAsk(`Удалить «${it.name}»?`))) { delBtn.disabled = false; return; }
      try { const d = await call("delete_item", { item_id: it.id }); haptic("success"); closeSheet(); applyDay(d); }
      catch (e) { haptic("error"); toast(e.message, { error: true }); delBtn.disabled = false; }
    });
  });
}

function openActivitySheet(id) {
  const a = ((state.day && state.day.activities) || []).find((x) => x.id === id);
  if (!a) return;
  haptic("light");
  const field = (idAttr, label, value, unit) => `
    <label class="qty wide"><span class="lbl">${label}</span><input id="${idAttr}" type="text" inputmode="numeric" pattern="[0-9]*" value="${value == null ? "" : esc(value)}" aria-label="${label}"><span>${unit}</span></label>`;
  openSheet(`
    <h3>${esc(cap(a.description))}</h3>
    <div class="sub">Сожжённые калории сверх покоя. Покой и шаги считаются отдельно.</div>
    <div class="fields">${field("actKcal", "Калории", a.kcal, "ккал")}${field("actMin", "Длительность", a.duration_min, "мин")}</div>
    <button class="btn primary" id="saveAct">Сохранить</button>
    <button class="btn ghost" id="delAct">Удалить тренировку</button>
  `, (sh) => {
    const kc = sh.querySelector("#actKcal"), mn = sh.querySelector("#actMin"), save = sh.querySelector("#saveAct");
    const num = (el) => { const v = el.value.replace(/\D/g, ""); return v === "" ? null : parseInt(v, 10); };
    const paint = () => {
      const k = num(kc), m = num(mn) ?? (a.duration_min ?? null); // an emptied duration keeps the old one
      const changed = k !== a.kcal || m !== (a.duration_min ?? null);
      save.disabled = !changed || k == null || k > 5000 || (m != null && (m < 1 || m > 1440));
      save.textContent = changed ? "Сохранить" : "Без изменений";
    };
    [kc, mn].forEach((el) => {
      el.addEventListener("input", () => { el.value = el.value.replace(/\D/g, "").slice(0, 4); paint(); });
      el.addEventListener("focus", () => setTimeout(() => el.select(), 0));
      el.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); !save.disabled && save.click(); } });
    });
    paint();
    save.addEventListener("click", async () => {
      save.disabled = true; save.textContent = "Сохраняю…";
      try {
        const d = await call("set_activity", { activity_id: a.id, kcal: num(kc), duration_min: num(mn), date: state.day && state.day.date });
        haptic("success"); closeSheet(); applyDay(d);
      } catch (e) { haptic("error"); toast(e.message, { error: true }); paint(); }
    });
    const del = sh.querySelector("#delAct");
    del.addEventListener("click", async () => {
      if (del.disabled) return;
      del.disabled = true;
      if (!(await confirmAsk(`Удалить «${a.description}»?`))) { del.disabled = false; return; }
      try { const d = await call("delete_activity", { activity_id: a.id, date: state.day && state.day.date }); haptic("success"); closeSheet(); applyDay(d); }
      catch (e) { haptic("error"); toast(e.message, { error: true }); del.disabled = false; }
    });
  });
}

function openTargetsSheet() {
  const t = (state.day && state.day.targets) || {};
  haptic("light");
  openSheet(`
    <h3>Цели на день</h3>
    <div class="sub">Используются для прогресса и графиков.</div>
    <div class="form-row"><label for="tK">Калории</label><div class="in"><input id="tK" type="text" inputmode="numeric" value="${t.calorie_target != null ? esc(t.calorie_target) : ""}"><span>ккал</span></div></div>
    <div class="form-row"><label for="tP">Белок</label><div class="in"><input id="tP" type="text" inputmode="numeric" value="${t.protein_target != null ? esc(t.protein_target) : ""}"><span>г</span></div></div>
    <button class="btn primary" id="saveT">Сохранить</button>
  `, (sh) => {
    const k = sh.querySelector("#tK"), p = sh.querySelector("#tP"), b = sh.querySelector("#saveT");
    [k, p].forEach((x) => x.addEventListener("input", () => { x.value = x.value.replace(/\D/g, "").slice(0, 5); }));
    b.addEventListener("click", async () => {
      const body = {};
      const kv = parseInt(k.value, 10), pv = parseInt(p.value, 10);
      if (kv > 0 && kv !== t.calorie_target) body.calorie_target = kv;
      if (pv > 0 && pv !== t.protein_target) body.protein_target = pv;
      if (!Object.keys(body).length) { closeSheet(); return; }
      b.disabled = true; b.textContent = "Сохраняю…";
      try {
        const d = await call("set_targets", body);
        haptic("success"); closeSheet();
        if (state.day && d.date !== state.day.date) { state.day.targets = d.targets; renderToday(); state.history = null; if (state.tab === "trends") loadHistory(); }
        else applyDay(d);
      } catch (e) { haptic("error"); toast(e.message, { error: true }); b.disabled = false; b.textContent = "Сохранить"; }
    });
  });
}

/* ================= swipe-to-delete & long-press ================= */

const SW = 92;
function hideRev(b) { setTimeout(() => { if (!b.dataset.open && !b.classList.contains("dragging")) b.parentElement && b.parentElement.classList.remove("rev"); }, 420); }
let openSwipe = null, suppressClick = false;
function closeSwipe(except) {
  if (openSwipe && openSwipe !== except) { openSwipe.style.transform = ""; openSwipe.dataset.open = ""; hideRev(openSwipe); openSwipe = null; }
}
(function initSwipe() {
  let body = null, sx = 0, sy = 0, base = 0, mode = null, lpTimer = null, lpTarget = null;
  const clearLp = () => { clearTimeout(lpTimer); lpTimer = null; };
  elToday.addEventListener("pointerdown", (e) => {
    const b = e.target.closest(".swipe-body");
    if (!b) return;
    body = b; sx = e.clientX; sy = e.clientY; mode = null;
    base = b.dataset.open ? -SW : 0;
    lpTarget = e.target.closest("[data-longpress]");
    if (lpTarget) {
      lpTimer = setTimeout(async () => {
        lpTimer = null; suppressClick = true; body = null;
        haptic("heavy");
        await deleteMeal(lpTarget.dataset.id);
        setTimeout(() => (suppressClick = false), 50);
      }, 550);
    }
  });
  elToday.addEventListener("pointermove", (e) => {
    if (!body) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!mode) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) clearLp();
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) { mode = "h"; body.classList.add("dragging"); body.parentElement.classList.add("rev"); try { body.setPointerCapture(e.pointerId); } catch (_) {} closeSwipe(body); }
      else if (Math.abs(dy) > 10) { body = null; return; }
      else return;
    }
    let t = base + dx;
    if (t > 0) t = t * 0.2;
    if (t < -SW) t = -SW - Math.pow(-SW - t, 0.75);
    body.style.transform = `translateX(${t}px)`;
  });
  const up = (e) => {
    clearLp();
    if (!body) return;
    if (mode === "h") {
      const dx = e.type === "pointercancel" ? 0 : e.clientX - sx;
      const open = base + dx < -SW / 2;
      body.classList.remove("dragging");
      body.style.transform = open ? `translateX(${-SW}px)` : "";
      body.dataset.open = open ? "1" : "";
      if (open) { openSwipe = body; haptic("light"); } else { if (openSwipe === body) openSwipe = null; hideRev(body); }
      suppressClick = true; setTimeout(() => (suppressClick = false), 60);
    }
    body = null; mode = null;
  };
  elToday.addEventListener("pointerup", up);
  elToday.addEventListener("pointercancel", up);
  elToday.addEventListener("contextmenu", (e) => { if (e.target.closest("[data-longpress]")) e.preventDefault(); });
})();

async function deleteMeal(id) {
  if (busy.has(id)) return;
  busy.add(id);
  try { await deleteMealInner(id); } finally { busy.delete(id); }
}
async function deleteMealInner(id) {
  const m = ((state.day && state.day.meals) || []).find((x) => x.id === id);
  const label = m ? (MEAL_LABEL[m.meal_type] || "приём").toLowerCase() : "приём пищи";
  if (!(await confirmAsk(`Удалить ${label} целиком${m && m.items ? ` (${m.items.length} ${plural(m.items.length, "позиция", "позиции", "позиций")})` : ""}?`))) { closeSwipe(); return; }
  try { const d = await call("delete_meal", { meal_id: id }); haptic("success"); openSwipe = null; applyDay(d); }
  catch (e) { haptic("error"); toast(e.message, { error: true }); closeSwipe(); }
}

/* day swipe (outside of meal cards) */
(function initDaySwipe() {
  let sx = null, sy = 0, t0 = 0;
  elToday.addEventListener("touchstart", (e) => {
    if (e.target.closest(".swipe, .sheet, input")) { sx = null; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; t0 = Date.now();
  }, { passive: true });
  elToday.addEventListener("touchend", (e) => {
    if (sx == null || !state.day) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    sx = null;
    if (Math.abs(dx) < 70 || Math.abs(dy) > 45 || Date.now() - t0 > 600) return;
    if (dx > 0) go(-1); else if (!state.day.is_today) go(1);
  }, { passive: true });
})();

function go(delta) {
  if (!state.day) return;
  if (delta > 0 && state.day.is_today) return;
  haptic("select");
  closeSwipe();
  const from = pendingDate || state.day.date;
  if (delta > 0 && from === localToday()) return;
  const next = addDays(from, delta);
  loadDay(next === localToday() ? null : next);
}

/* ================= actions ================= */

document.addEventListener("click", async (e) => {
  if (suppressClick) { e.preventDefault(); e.stopPropagation(); return; }
  const inSwipe = e.target.closest(".swipe-body");
  if (openSwipe && inSwipe === openSwipe) { closeSwipe(); return; }
  const el = e.target.closest("[data-action]");
  if (openSwipe && (!el || el.dataset.action !== "del-meal")) closeSwipe();
  if (!el) return;
  const a = el.dataset.action;
  if (a === "tab") setTab(el.dataset.tab);
  else if (a === "prev") go(-1);
  else if (a === "next") go(1);
  else if (a === "retry-day") loadDay(state.failedDate !== undefined ? state.failedDate : state.date);
  else if (a === "retry-history") loadHistory();
  else if (a === "item") openItemSheet(el.dataset.id);
  else if (a === "act") openActivitySheet(el.dataset.id);
  else if (a === "targets") openTargetsSheet();
  else if (a === "settings") openSettings();
  else if (a === "settings-back") closeSettings();
  else if (a === "retry-settings") loadSettings();
  else if (a === "tz-auto") setTimezoneAuto();
  else if (a === "request-shortcut") {
    if (busy.has("shortcut")) return;
    busy.add("shortcut");
    try { const r = await call("request_shortcut"); haptic("success"); toast(r.message); }
    catch (err) { haptic("error"); toast(err.message, { error: true }); }
    finally { busy.delete("shortcut"); }
  }
  else if (a === "del-meal") deleteMeal(el.dataset.id);
  else if (a === "del-act") {
    if (busy.has(el.dataset.id)) return;
    busy.add(el.dataset.id);
    try { await deleteActivity(el); } finally { busy.delete(el.dataset.id); }
  } else if (a === "undo") undo(el);
});

const busy = new Set();
async function deleteActivity(el) {
  {
    const act = ((state.day && state.day.activities) || []).find((x) => x.id === el.dataset.id);
    if (!(await confirmAsk(`Удалить «${act ? act.description : "активность"}»?`))) return;
    try { const d = await call("delete_activity", { activity_id: el.dataset.id }); haptic("success"); applyDay(d); }
    catch (err) { haptic("error"); toast(err.message, { error: true }); }
  }
}

async function undo(btn) {
  btn.disabled = true; haptic("medium");
  try {
    const r = await call("undo");
    if (r && r.day) applyDay(r.day);
    toast((r && r.message) || "Отменено");
  } catch (e) { haptic("error"); toast(e.message, { error: true }); }
  btn.disabled = false;
}

function setTab(tab) {
  if (settingsOpen) closeSettings();
  if (state.tab === tab) return;
  state.tab = tab;
  haptic("select");
  $("#seg").dataset.tab = tab;
  document.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  elToday.hidden = tab !== "today";
  elTrends.hidden = tab !== "trends";
  window.scrollTo({ top: 0 });
  if (tab === "trends") { if (!state.history && !state.historyLoading) loadHistory(); else renderTrends(); }
  syncQuickWhen();
}

/* ================= quick log ================= */

const qForm = $("#quickForm"), qIn = $("#quickInput"), qSend = $("#quickSend"), qWhen = $("#quickWhen");
function syncQuickWhen() {
  const past = state.tab === "today" && state.day && !state.day.is_today;
  qWhen.hidden = !past;
  if (past) qWhen.textContent = shortDate(state.day.date);
}
qIn.addEventListener("input", () => { qSend.disabled = !qIn.value.trim(); });
qForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = qIn.value.trim();
  if (!text || qSend.classList.contains("busy") || state.dayLoading) return;
  const date = state.tab === "today" && state.day && !state.day.is_today ? state.day.date : undefined;
  qSend.classList.add("busy"); qSend.disabled = true; haptic("light");
  try {
    const r = await call("log", date ? { text, date } : { text });
    qIn.value = "";
    haptic("success");
    if (r && r.reply) toast(r.reply);
    if (r && r.day) applyDay(r.day);
  } catch (err) {
    haptic("error");
    toast(err.message + ". Текст сохранён, попробуй ещё раз.", { error: true });
  }
  qSend.classList.remove("busy");
  qSend.disabled = !qIn.value.trim();
});


/* ================= settings ================= */

const elSettings = $("#settings");
let settingsOpen = false;
const set = { data: null, loading: false, error: null, saved: {}, errors: {} };
const TZ = [
  "Europe/London", "Europe/Lisbon", "Europe/Paris", "Europe/Berlin", "Europe/Madrid", "Europe/Rome", "Europe/Amsterdam",
  "Europe/Warsaw", "Europe/Prague", "Europe/Helsinki", "Europe/Kyiv", "Europe/Istanbul", "Europe/Moscow",
  "Asia/Tbilisi", "Asia/Yerevan", "Asia/Dubai", "Asia/Almaty", "Asia/Tashkent", "Asia/Bangkok", "Asia/Singapore",
  "Asia/Tokyo", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Sao_Paulo",
];
const FIELDS = {
  calorie_target: { label: "Калории", unit: "ккал/день", hint: "от 800 до 6000", min: 800, max: 6000, dec: 0, clearable: false },
  protein_target: { label: "Белок", unit: "г/день", hint: "от 20 до 400 г", min: 20, max: 400, dec: 0, clearable: false },
  fat_target: { label: "Жиры", unit: "г/день", hint: "Необязательно", min: 10, max: 400, dec: 0, clearable: true },
  carbs_target: { label: "Углеводы", unit: "г/день", hint: "Необязательно", min: 20, max: 800, dec: 0, clearable: true },
  weight_target: { label: "Целевой вес", unit: "кг", hint: "необязательно, пусто = без цели", min: 30, max: 300, dec: 1, clearable: true },
};

function tzOffset(tz) {
  try {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(new Date());
    const n = (p.find((x) => x.type === "timeZoneName") || {}).value || "";
    return n.replace("GMT", "UTC") === "UTC" ? "UTC+0" : n.replace("GMT", "UTC");
  } catch (_) { return ""; }
}
function tzCity(tz) { return tz.split("/").pop().replace(/_/g, " "); }

function openSettings() {
  if (settingsOpen) return;
  settingsOpen = true;
  closeSwipe();
  haptic("light");
  set.saved = {}; set.errors = {};
  document.body.classList.add("sub");
  elToday.hidden = true; elTrends.hidden = true; elSettings.hidden = false;
  window.scrollTo({ top: 0 });
  setBack(closeSettings);
  renderSettings();
  loadSettings();
}
function closeSettings() {
  if (!settingsOpen) return;
  if (document.activeElement && elSettings.contains(document.activeElement)) document.activeElement.blur();
  settingsOpen = false;
  setBack(null);
  document.body.classList.remove("sub");
  elSettings.hidden = true;
  elToday.hidden = state.tab !== "today";
  elTrends.hidden = state.tab !== "trends";
  window.scrollTo({ top: 0 });
  if (state.tab === "trends") renderTrends();
}

async function loadSettings() {
  set.loading = true; set.error = null;
  renderSettings();
  try { set.data = await call("settings"); }
  catch (e) { set.error = e.message || "Ошибка"; }
  set.loading = false;
  renderSettings();
}

async function saveSettings(patch, key) {
  set.errors[key] = null; set.saved[key] = "saving";
  paintStatus(key);
  try {
    set.data = await call("set_settings", patch);
    set.saved[key] = "ok";
    haptic("success");
    // targets and the day boundary can change what Today/Trends show
    state.history = null;
    loadDay(state.day && !state.day.is_today ? state.day.date : null, { animate: false });
  } catch (e) {
    set.saved[key] = null; set.errors[key] = e.message || "Ошибка";
    haptic("error");
  }
  renderSettings();
}

function paintStatus(key) {
  const el = elSettings.querySelector(`[data-status="${key}"]`);
  if (!el) return;
  const err = set.errors[key], st = set.saved[key];
  el.className = "st" + (err ? " err" : st === "ok" ? " ok" : "");
  el.textContent = err || (st === "saving" ? "Сохраняю…" : st === "ok" ? "Сохранено" : "");
}

function renderSettings() {
  if (!settingsOpen) return;
  const inTgBack = supports("6.1");
  const head = `<div class="sub-h">${inTgBack ? "" : `<button class="back" data-action="settings-back" aria-label="Назад">${ICON.left}<span>Назад</span></button>`}<h1>Настройки</h1></div>`;
  const d = set.data;
  if (!d) {
    elSettings.innerHTML = head + (set.error ? errorBlockSettings(set.error) : "") +
      `<div class="card"><div class="sk" style="height:22px"></div><div class="sk" style="height:22px;margin-top:22px"></div><div class="sk" style="height:22px;margin-top:22px"></div></div><div class="card"><div class="sk" style="height:44px"></div></div>`;
    return;
  }
  const active = document.activeElement && document.activeElement.id;
  const fieldRow = (k) => {
    const f = FIELDS[k], v = d[k];
    return `<div class="srow">
      <div class="sl"><label for="f_${k}">${f.label}</label><small>${f.hint}</small><div class="st" data-status="${k}" aria-live="polite"></div></div>
      <div class="sin"><input id="f_${k}" data-field="${k}" type="text" inputmode="${f.dec ? "decimal" : "numeric"}" enterkeyhint="done" value="${v == null ? "" : esc(f.dec ? String(v).replace(".", ",") : v)}" placeholder="${f.clearable ? "нет" : ""}"><span>${f.unit}</span></div>
    </div>`;
  };
  const hours = Array.from({ length: 13 }, (_, h) => `<option value="${h}" ${h === d.day_starts_at_hour ? "selected" : ""}>${String(h).padStart(2, "0")}:00</option>`).join("");
  const zones = TZ.includes(d.timezone) || !d.timezone ? TZ : [d.timezone, ...TZ];
  const tzOpts = zones.map((z) => `<option value="${esc(z)}" ${z === d.timezone ? "selected" : ""}>${esc(tzCity(z))}, ${tzOffset(z)}</option>`).join("");
  const auto = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) { return null; } })();
  const h = d.health || {};
  const last = h.last_upload_at ? new Date(h.last_upload_at) : null;
  const lastTxt = last ? (toISO(new Date(Date.UTC(last.getFullYear(), last.getMonth(), last.getDate()))) === localToday()
      ? last.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
      : last.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })) : null;

  elSettings.innerHTML = head + `
    <div class="group-h">Цели</div>
    <div class="card list">${fieldRow("calorie_target")}${fieldRow("protein_target")}${fieldRow("fat_target")}${fieldRow("carbs_target")}${fieldRow("weight_target")}</div>

    <div class="group-h">Конец суток</div>
    <div class="card list">
      <div class="srow">
        <div class="sl"><label for="f_hour">Новый день начинается в</label><small>Всё, что записано до этого времени, попадёт во вчерашний день</small><div class="st" data-status="day_starts_at_hour" aria-live="polite"></div></div>
        <div class="sin"><div class="select"><select id="f_hour" data-setting="day_starts_at_hour">${hours}</select></div></div>
      </div>
    </div>

    <div class="group-h">Часовой пояс</div>
    <div class="card list">
      <div class="srow">
        <div class="sl"><label for="f_tz">Пояс</label><small>${esc(d.timezone || "не задан")}</small><div class="st" data-status="timezone" aria-live="polite"></div></div>
        <div class="sin"><div class="select"><select id="f_tz" data-setting="timezone" aria-label="Часовой пояс">${tzOpts}</select></div></div>
      </div>
      ${auto && auto !== d.timezone ? `<button class="srow linkrow" data-action="tz-auto">Определить автоматически<span class="hint">${esc(tzCity(auto))}</span></button>`
        : `<div class="srow linkrow muted">Совпадает с часовым поясом телефона</div>`}
    </div>

    <div class="group-h">Apple Здоровье</div>
    <div class="card list">
      <div class="srow">
        <div class="sl"><div class="health"><i class="${h.connected ? "on" : ""}"></i>${h.connected ? "Подключено" : "Не подключено"}</div>${h.connected && lastTxt ? `<small>Последняя отправка ${esc(lastTxt)}</small>` : ""}
        </div>
      </div>
      <button class="srow linkrow" data-action="request-shortcut">Прислать шорткат в чат<span class="hint">с личным ключом и инструкцией</span></button>
    </div>
    <div class="footnote">Шаги и расход берутся из Здоровья. Всё остальное пишется в чате с ботом.</div>`;

  Object.keys(set.saved).concat(Object.keys(set.errors)).forEach(paintStatus);
  if (active) { const el = document.getElementById(active); if (el) el.focus(); }

  elSettings.querySelectorAll("input[data-field]").forEach((inp) => {
    const k = inp.dataset.field, f = FIELDS[k];
    inp.addEventListener("input", () => {
      inp.value = f.dec ? inp.value.replace(/[^\d.,]/g, "").replace(/([.,].*)[.,]/, "$1").slice(0, 5) : inp.value.replace(/\D/g, "").slice(0, 4);
      if (set.errors[k] || set.saved[k]) { set.errors[k] = null; set.saved[k] = null; paintStatus(k); }
    });
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); inp.blur(); } });
    inp.addEventListener("blur", () => commitField(inp, k));
  });
  elSettings.querySelectorAll("select[data-setting]").forEach((sel) => {
    sel.addEventListener("change", () => {
      const k = sel.dataset.setting;
      haptic("select");
      saveSettings({ [k]: k === "day_starts_at_hour" ? Number(sel.value) : sel.value }, k);
    });
  });
}

function commitField(inp, k) {
  if (!settingsOpen || !set.data) return;
  const f = FIELDS[k], cur = set.data[k];
  const raw = inp.value.trim().replace(",", ".");
  if (raw === "") {
    if (f.clearable) { if (cur != null) saveSettings({ [k]: null }, k); return; }
    inp.value = cur == null ? "" : cur; return;
  }
  const v = f.dec ? Math.round(parseFloat(raw) * 10) / 10 : parseInt(raw, 10);
  if (!Number.isFinite(v)) { set.errors[k] = "Нужно число"; paintStatus(k); return; }
  if (v === cur) return;
  if (v < f.min || v > f.max) { set.errors[k] = `Допустимо от ${fmt(f.min)} до ${fmt(f.max)} ${f.unit.split("/")[0]}`; haptic("error"); paintStatus(k); return; }
  saveSettings({ [k]: v }, k);
}

function setTimezoneAuto() {
  let tz = null;
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) {}
  if (!tz) { toast("Не удалось определить часовой пояс", { error: true }); return; }
  saveSettings({ timezone: tz }, "timezone");
}

function errorBlockSettings(msg) {
  return `<div class="error"><div>Не загрузилось<small>${esc(msg)}</small></div><button data-action="retry-settings">Повторить</button></div>`;
}

/* ================= boot ================= */

let rT = null;
window.addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(() => { if (state.tab === "trends" && state.history) renderTrends(); }, 150); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (sheet) closeSheet(); else if (settingsOpen) closeSettings(); } });

const style = document.createElement("style");
style.textContent = "@keyframes grow { from { width: 0 } }";
document.head.append(style);

loadDay(null);
if (params.get("tab") === "trends") setTab("trends");
if (params.get("screen") === "settings") openSettings();
