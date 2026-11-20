(() => {

  // Text generation and utilities
  const WORDS = ("random whatever texts play together good last playground school assignment submit time class attendance " +
    "morning coffee window train station quiet street someone yellow paper light little river evening " +
    "letter phone message tomorrow yesterday summer winter garden table kitchen music slowly almost always never " +
    "maybe nothing everything people stranger friend mother brother sister city bridge corner market bread orange " +
    "blue green small large soft loud warm cold open closed under over between inside outside again often still " +
    "walk read write remember forget wait listen follow carry find keep leave return begin finish hold change " +
    "notebook pencil eraser desk chair hallway lunch recess bell homework weekend holiday picture story answer " +
    "question number circle line pattern rhythm hand finger key space mistake pause quick careful second minute").split(" ");
  const TARGET_LEN = 170, LS = "typed-circle-mine-v1", FONT = 'system-ui, -apple-system, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const MONO = '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), clamp01 = x => clamp(x, 0, 1), lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

  function makeText(){
    let s = "", first = true;
    while (true){
      let w = WORDS[Math.floor(Math.random() * WORDS.length)];
      if (first) w = w[0].toUpperCase() + w.slice(1);
      const piece = (first ? "" : " ") + w;
      if (s.length + piece.length + 1 > TARGET_LEN) break;
      s += piece; first = false;
      if (Math.random() < .1 && s.length < TARGET_LEN - 12) s += ",";
    }
    return s.replace(/,$/, "") + ".";
  }

  // events: [ms, 0 key | 1 space | 2 backspace], stored as "142k,300s,410b"
  const CODE = ["k", "s", "b"];
  const encode = ev => ev.map(([t, c]) => t + CODE[c]).join(",");
  function decode(str){
    if (typeof str !== "string" || str.length > 20000) return null;
    const out = [];
    for (const part of str.split(",")){ const m = /^(\d{1,7})([ksb])$/.exec(part); if (!m) return null; out.push([+m[1], CODE.indexOf(m[2])]); }
    return out.length ? out : null;
  }
  const validText = t => typeof t === "string" && t.length >= 10 && t.length <= 300 && /^[\x20-\x7E]+$/.test(t);
  const okStr = (s, re, max) => typeof s === "string" && s.length <= max && re.test(s);
  function replay(events){
    const times = [], errs = [], idx = [];
    events.forEach(([t, code], j) => {
      if (code === 2){ if (times.length){ times.pop(); idx.pop(); errs[times.length] = (errs[times.length] || 0) + 1; } }
      else { times.push(t); idx.push(j); if (errs[times.length - 1] === undefined) errs[times.length - 1] = 0; }
    });
    return { times, errs, idx };
  }
  const f = g => Math.pow(Math.min(Math.max(g, 25), 2500), .85);
  function markSize(m, base, u){
    if (m.e){ const n = Math.min(m.e, 5); return { w: (9 + 7 * (n - 1)) * u, h: base * Math.min(2.4, 1.35 + .28 * (n - 1)) }; }
    const s = Math.max(0, Math.min(1, (Math.log(Math.max(m.g, 1)) - Math.log(45)) / (Math.log(1100) - Math.log(45))));
    const h = base * (.22 + 1.08 * s) * (m.space ? .6 : 1), w = (.9 + 4.2 * s * s) * u;
    return { w, h };
  }
  function marks(events, text){
    const { times, errs } = replay(events), out = []; let x = 0;
    times.forEach((t, i) => { const g = i ? t - times[i - 1] : 200; if (i) x += f(g); out.push({ x, g, e: errs[i] || 0, space: text[i] === " " }); });
    return out;
  }

  // QWERTY geometry, for "next-key slip" typos and the keyboard map
  const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"], KPOS = {};
  ROWS.forEach((r, y) => [...r].forEach((ch, x) => KPOS[ch] = [x + y * .45, y]));
  const adjacent = (a, b) => { const p = KPOS[a.toLowerCase()], q = KPOS[b.toLowerCase()]; return !!(p && q) && Math.abs(p[1] - q[1]) <= 1 && Math.abs(p[0] - q[0]) <= 1.3; };
  const TYPO_NAMES = { a: "next-key slips", t: "letters swapped", c: "wrong case", s: "spacing", o: "other keys" };

  // every number we can read from one attempt (live panel)
  function computeStats(events, text, typos){
    const { times } = replay(events), dur = events.length ? events[events.length - 1][0] : 0;
    const keys = events.filter(e => e[1] !== 2).length, corrections = events.filter(e => e[1] === 2).length;
    const gaps = []; for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
    const avg = mean(gaps), sd = gaps.length ? Math.sqrt(mean(gaps.map(g => (g - avg) ** 2))) : 0;
    let li = 0; gaps.forEach((g, i) => { if (g > gaps[li]) li = i; });
    const wordAt = i => { let a = i, b = i; while (a > 0 && text[a - 1] !== " ") a--; while (b < text.length && text[b] !== " ") b++; return text.slice(a, b).replace(/[.,]/g, ""); };
    let slow = { w: "", ms: 0 };
    const re = /[^ ]+/g; let m;
    while ((m = re.exec(text)) && times.length >= m.index + m[0].length){
      const s0 = m.index ? times[m.index - 1] : times[0], s1 = times[m.index + m[0].length - 1], ms = s1 - s0;
      if (ms > slow.ms) slow = { w: m[0].replace(/[.,]/g, ""), ms };
    }
    return {
      dur, chars: times.length, keys, typos: typos ?? null, corrections,
      accuracy: keys ? Math.max(0, Math.round(100 * (1 - (typos ?? corrections) / keys))) : 100,
      cpm: dur ? Math.round(times.length / dur * 60000) : 0,
      wpm: dur ? Math.round(times.length / 5 / dur * 60000) : 0,
      avg: Math.round(avg), sd: Math.round(sd),
      longest: gaps.length ? gaps[li] : 0, longestWord: gaps.length ? wordAt(li + 1) : "",
      fastest: gaps.length ? Math.min(...gaps) : 0,
      pauses: gaps.filter(g => g > 500).length,
      slowWord: slow.w, slowMs: slow.ms,
    };
  }

  // the fingerprint features of one saved print
  function feats(p){
    if (p._f) return p._f;
    const evs = p.events, text = p.text, { times, errs, idx } = replay(evs), n = times.length;
    const gaps = [0]; for (let i = 1; i < n; i++) gaps.push(times[i] - times[i - 1]);
    const g1 = gaps.slice(1).filter(g => g < 3000), avg = mean(g1) || 200;
    const sd = g1.length ? Math.sqrt(mean(g1.map(g => (g - avg) ** 2))) : 0, cv = sd / avg;
    const sorted = g1.slice().sort((a, b) => a - b), med = sorted.length ? sorted[sorted.length >> 1] : 200;
    // hold time per character (null when the device doesn't report key releases)
    let dwArr = null;
    if (typeof p.dw === "string" && p.dw){
      const parts = p.dw.split("."), keyIdx = []; evs.forEach((e, j) => { if (e[1] !== 2) keyIdx.push(j); });
      dwArr = []; parts.forEach((s, k) => { if (k < keyIdx.length && /^\d{1,4}$/.test(s)) dwArr[keyIdx[k]] = +s; });
    }
    const dwc = idx.map(j => dwArr && dwArr[j] != null && dwArr[j] < 1500 ? dwArr[j] : null);
    const dws = dwc.filter(x => x != null), hold = dws.length >= 10 ? mean(dws) : null;
    const rolls = typeof p.ro === "string" && p.ro ? p.ro.split(".").map(Number).filter(x => x >= 0 && x < n) : [];
    let tys = typeof p.ty === "string" && p.ty ? p.ty.split(".").map(s => { const m = /^(\d+)([atcso])$/.exec(s); return m ? { i: +m[1], k: m[2] } : null; }).filter(Boolean) : [];
    if (!tys.length) errs.forEach((e, i) => { if (e) tys.push({ i, k: "o" }); });
    const typoN = typeof p.typos === "number" ? p.typos : tys.length;
    const kinds = {}; tys.forEach(t => kinds[t.k] = (kinds[t.k] || 0) + 1);
    const topKind = Object.keys(kinds).sort((a, b) => kinds[b] - kinds[a])[0] || null;
    const sl = p.sl | 0, sr = p.sr | 0, hand = sl + sr === 0 ? null : sl > sr * 1.5 ? "left" : sr > sl * 1.5 ? "right" : "both";
    const half = g1.length >> 1, a1 = mean(g1.slice(0, half)), a2 = mean(g1.slice(half)), drift = a1 ? a2 / a1 - 1 : 0;
    const pairs = {};
    for (let i = 1; i < n; i++){
      const a = text[i - 1], b = text[i];
      if (a && b && /^[a-z]$/i.test(a) && /^[a-z]$/i.test(b) && !errs[i] && !errs[i - 1] && gaps[i] < 2000){ const k = (a + b).toLowerCase(); (pairs[k] = pairs[k] || []).push(gaps[i]); }
    }
    const pavg = {}; for (const k in pairs) pavg[k] = mean(pairs[k]);
    const pk = Object.keys(pavg), pk2 = pk.filter(k => pairs[k].length > 1), use = pk2.length >= 3 ? pk2 : pk;
    const fastPair = use.length ? use.reduce((a, b) => pavg[a] <= pavg[b] ? a : b) : null, slowPair = use.length ? use.reduce((a, b) => pavg[a] >= pavg[b] ? a : b) : null;
    const dur = p.dur || (evs.length ? evs[evs.length - 1][0] : 0), wpm = p.wpm || (dur ? Math.round(n / 5 / dur * 60000) : 0);
    // three archetypes the system sorts everyone into, like the iD Commons tiers
    const type = wpm < 30 ? "careful" : cv < .62 ? "steady" : "bursty";
    const ng = gaps.map((g, i) => i ? clamp(Math.log(Math.max(g, 20) / med) / 1.1, -1, 1) : 0);
    const ngs = ng.map((_, i) => { let s = 0, c = 0; for (let k = -2; k <= 2; k++) if (ng[i + k] !== undefined){ s += ng[i + k]; c++; } return s / c; });
    return p._f = { n, gaps, avg, sd, cv, med, hold, dwc, rolls, tys, typoN, kinds, topKind, lag: typeof p.lg === "number" ? p.lg : null, hand, sl, sr,
      drift, pavg, fastPair, slowPair, dur, wpm, type, ngs, errs, typoRate: n ? typoN / n : 0, rollRate: n ? rolls.length / n : 0 };
  }

  // matching: how alike two prints are, 0–100
  function similarity(A, B){
    const a = feats(A), b = feats(B), d = [];
    d.push((Math.log(a.avg) - Math.log(b.avg)) / .3);
    d.push((a.cv - b.cv) / .25);
    if (a.hold != null && b.hold != null) d.push((a.hold - b.hold) / 25);
    d.push((a.rollRate - b.rollRate) / .08);
    d.push((a.typoRate - b.typoRate) / .05);
    d.push((a.drift - b.drift) / .3);
    const shared = Object.keys(a.pavg).filter(k => k in b.pavg);
    if (shared.length >= 4){
      const ra = shared.map(k => Math.log(a.pavg[k] / a.avg)), rb = shared.map(k => Math.log(b.pavg[k] / b.avg));
      d.push(mean(ra.map((x, i) => Math.abs(x - rb[i]))) / .25);
    }
    const dist = Math.sqrt(mean(d.map(x => x * x)));
    return Math.round(100 * Math.exp(-dist * dist / 2.2));
  }
  function closest(item, list, k = 3){
    return list.filter(p => p !== item && p.key !== item.key).map(p => ({ p, s: similarity(item, p) })).sort((x, y) => y.s - x.s).slice(0, k);
  }

  // drawing a fingerprint from the data
  function rng(seed){ let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hash(str){ let h = 2166136261; for (let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  // one round as a ring of marks: angle = time, a mark per letter (tall + wide = slow, short + thin = fast, blocks = typos)
  function drawRing(ctx, events, txt, cx, cy, r, band, color, u = 1){
    const ms = marks(events, txt); if (!ms.length) return;
    const span = Math.max(ms[ms.length - 1].x, 1);
    ctx.strokeStyle = color; ctx.lineCap = "butt";
    for (const m of ms){
      const a = -Math.PI / 2 + (m.x / span) * Math.PI * 2 * .985, sz = markSize(m, band, u * .8), bh = sz.h, c0 = Math.cos(a), s0 = Math.sin(a);
      ctx.lineWidth = sz.w;
      ctx.beginPath(); ctx.moveTo(cx + (r - bh / 2) * c0, cy + (r - bh / 2) * s0); ctx.lineTo(cx + (r + bh / 2) * c0, cy + (r + bh / 2) * s0); ctx.stroke();
    }
  }
  // one person's rounds up to this one, oldest inside, newest outside
  function stackFor(item){
    const l = collection().filter(q => q.who === item.who && q.at <= item.at && q.key !== item.key);   // every typeface lands on the same print
    l.push(item); return l.sort((a, b) => a.at - b.at);
  }
  const stackCache = new Map();
  function renderStack(item, W, ink = [18, 18, 18], focus = true){
    const list = stackFor(item), ck = [item.key, W, ink.join(","), list.length, focus].join("|");
    if (stackCache.has(ck)) return stackCache.get(ck);
    const cv = document.createElement("canvas"); cv.width = cv.height = W;
    const P = cv.getContext("2d"), c = W / 2, maxR = W * .47, n = list.length, inner = maxR * .1;
    const gap = Math.min(maxR * .3, (maxR - inner) / n), band = Math.min(maxR * .1, gap * .78), u = maxR / 490;
    list.forEach((p, i) => drawRing(P, p.events, p.text, c, c, maxR - (n - 1 - i + .5) * gap, band, `rgba(${ink.join(",")},${!focus || p.key === item.key ? 1 : .34})`, u));
    if (stackCache.size > 600) stackCache.delete(stackCache.keys().next().value);
    stackCache.set(ck, cv); return cv;
  }
  const pad4 = x => String(x).padStart(4, "0");
  const dateStr = t => { const d = new Date(t); return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}.${d.getFullYear()}`; };

  // typefaces to type in (the one you pick is saved with each round)
  const TYPEFACES = {
    helvetica: { name: "Helvetica", css: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
    bodoni: { name: "Bodoni", css: '"Bodoni Moda", "Bodoni 72", Didot, serif' },
    bytesized: { name: "Bytesized", css: '"Bytesized", monospace' },
    altesse: { name: "Altesse Std", css: '"Altesse Std", "Pinyon Script", cursive' },   // Altesse is an Adobe font: used if installed, otherwise a similar formal script
    comic: { name: "Comic Sans", css: '"Comic Sans MS", "Comic Sans", "Comic Neue", cursive' },
  };
  const tfCss = id => TYPEFACES[id] ? TYPEFACES[id].css : FONT;
  const tfName = id => TYPEFACES[id] ? TYPEFACES[id].name : "Default";
  const tfKey = p => (p && p.tf && TYPEFACES[p.tf]) ? p.tf : "system";
  const curTf = () => tfSel.value || "system";
  const tfSel = document.getElementById("tfSel");
  try { const v = localStorage.getItem(LS + "-tf"); if (v && TYPEFACES[v]) tfSel.value = v; } catch (e) {}
  const tfLoad = () => { if (tfSel._refresh) tfSel._refresh(); try { document.fonts.load(`400 24px ${tfCss(tfSel.value)}`, "Aa"); } catch (e) {} };
  tfSel.addEventListener("change", () => { try { localStorage.setItem(LS + "-tf", tfSel.value); } catch (e) {} tfLoad(); tfSel.blur(); reset(); });   // a new typeface is a new round
  // dropdowns: a dark panel listing each typeface in its own typeface
  function fancySelect(sel){
    const old = sel.closest(".tfwrap"), wrap = document.createElement("div"); wrap.className = "tfwrap fancy";
    old.replaceWith(wrap); sel.hidden = true; wrap.append(sel);
    const btn = document.createElement("button"), list = document.createElement("ul"), id = sel.id + "-list";
    btn.type = "button"; btn.className = "fbtn"; btn.setAttribute("aria-haspopup", "listbox"); btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-controls", id);
    list.id = id; list.className = "flist"; list.setAttribute("role", "listbox"); list.hidden = true; list.tabIndex = -1;
    const opts = [...sel.options].filter(o => o.value !== "" && o.value !== "all").map(o => {
      const li = document.createElement("li"); li.setAttribute("role", "option"); li.dataset.v = o.value; li.textContent = o.textContent;
      li.style.fontFamily = tfCss(o.value); if (o.value === "bytesized") li.style.fontSize = "17px";
      li.onclick = () => choose(o.value); li.onmousemove = () => setActive(li); list.append(li); return li;
    });
    wrap.append(btn, list);
    let active = null;
    const setActive = li => { opts.forEach(o => o.classList.toggle("act", o === li)); active = li; if (li) list.setAttribute("aria-activedescendant", li.id || (li.id = id + "-" + li.dataset.v)); };
    const refresh = () => {
      const o = sel.options[sel.selectedIndex], placeholder = !sel.value || sel.value === "all";
      btn.textContent = o ? o.textContent : ""; btn.classList.toggle("chosen", !placeholder);
      opts.forEach(li => li.setAttribute("aria-selected", String(li.dataset.v === sel.value)));
    };
    const open = () => { list.hidden = false; wrap.classList.add("open"); btn.setAttribute("aria-expanded", "true"); setActive(opts.find(li => li.dataset.v === sel.value) || opts[0]); list.focus(); };
    const close = (focusBtn) => { list.hidden = true; wrap.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); if (focusBtn) btn.focus(); };
    function choose(v){ close(); if (sel.value !== v){ sel.value = v; refresh(); sel.dispatchEvent(new Event("change")); } else refresh(); }
    btn.onclick = e => { e.stopPropagation(); list.hidden ? open() : close(true); };
    list.addEventListener("keydown", e => {
      const i = opts.indexOf(active);
      if (e.key === "ArrowDown"){ e.preventDefault(); setActive(opts[Math.min(opts.length - 1, i + 1)]); }
      else if (e.key === "ArrowUp"){ e.preventDefault(); setActive(opts[Math.max(0, i - 1)]); }
      else if (e.key === "Enter" || e.key === " "){ e.preventDefault(); if (active) choose(active.dataset.v); }
      else if (e.key === "Escape" || e.key === "Tab"){ e.preventDefault(); e.stopPropagation(); close(true); }
    });
    document.addEventListener("pointerdown", e => { if (!wrap.contains(e.target)) close(); });
    sel._refresh = refresh; sel._btn = btn; refresh();
    // load every typeface so the list shows them right away
    try { opts.forEach(li => document.fonts.load(`20px ${tfCss(li.dataset.v)}`, li.textContent)); } catch (e) {}
  }
  tfLoad();
  fancySelect(tfSel);
  function needTf(){ const b = tfSel._btn || tfSel; b.classList.remove("nudge"); void b.offsetWidth; b.classList.add("nudge"); }

  // state
  const cv = document.getElementById("stage"), c = cv.getContext("2d"), typer = document.getElementById("typer"), dataEl = document.getElementById("data");
  let W = 0, H = 0, DPR = 1, text = makeText(), ev = [], t0 = null, prev = "", done = false, focused = false, typos = 0;
  let dwell = [], rolls = [], tyList = [], lags = [], firstWrong = null, sl = 0, sr = 0, held = new Map(), lastDown = null, shiftLoc = 0;
  const trials = [];            // this visit's finished attempts
  let current = null;           // the attempt just finished
  let spin = 0, lastFrame = performance.now();
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const views = { col: document.getElementById("col"), arch: document.getElementById("arch") };
  const anyOpen0 = () => !views.col.hidden || !views.arch.hidden;
  const resultBar = document.getElementById("resultBar");
  let resultImg = null, resultNote = "";

  function resize(){ DPR = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); }
  addEventListener("resize", () => { resize(); resultImg = null; if (!views.col.hidden) buildPrint(); if (!views.arch.hidden) renderArchive(); });

  let morph = null;   // the line curling into a ring after Enter
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  // Transition from typing line to print
  function endMorph(){ if (!morph) return; morph = null; showResult(); }
  function drawMorph(cx, cy, R){
    const el = (performance.now() - morph.t0) / 1000, A = 1.6, B = .9, HOLD = .6;
    if (el > A + B + HOLD){ endMorph(); return; }
    const ta = ease(clamp01(el / A)), tb = ease(clamp01((el - A) / B));
    const list = morph.stack, n = list.length, maxR = R, inner = maxR * .1;
    const gap = Math.min(maxR * .3, (maxR - inner) / n), band = Math.min(maxR * .1, gap * .78), u = maxR / 490, Rt = maxR - .5 * gap;
    // earlier rounds fade in inside
    list.slice(0, -1).forEach((p, i) => drawRing(c, p.events, p.text, cx, cy, maxR - (n - 1 - i + .5) * gap, band, `rgba(255,255,255,${(.22 * ta).toFixed(3)})`, u));
    const ms = marks(morph.events, morph.text); if (!ms.length) return;
    const x0 = W * .04, x1 = W * .96, unit = (x1 - x0) / (morph.text.length * f(230)), span = Math.max(ms[ms.length - 1].x, 1);
    const k = Math.min(unit, (x1 - x0) / span), base = Math.max(30, Math.min(70, H * .07)), Lline = span * k;
    const L = lerp(Lline, Math.PI * 2 * Rt * .985, ta), cxm = lerp(x0 + Lline / 2, cx, ta), yl = lerp(cy, cy - Rt, ta);
    const bandNow = lerp(base, band, ta), uNow = lerp(1, u * .8, ta), rot = Math.PI * .985 * tb, cr = Math.cos(rot), sr_ = Math.sin(rot);
    // the straight line's baseline fades as it bends
    if (ta < 1){ c.strokeStyle = `rgba(255,255,255,${(.55 * (1 - ta)).toFixed(3)})`; c.lineWidth = 1; c.beginPath(); c.moveTo(x0, Math.round(cy) + .5); c.lineTo(x1, Math.round(cy) + .5); c.stroke(); }
    c.strokeStyle = "#fff"; c.lineCap = "butt";
    for (const m of ms){
      const fr = m.x / span, { w, h } = markSize(m, bandNow, uNow);
      let px, py, nx, ny;
      if (ta < 1e-4){ px = cxm + (fr - .5) * L; py = yl; nx = 0; ny = -1; }
      else {
        const rho = L / (Math.PI * 2 * .985 * ta), th = (fr - .5) * Math.PI * 2 * .985 * ta;
        nx = Math.sin(th); ny = -Math.cos(th); px = cxm + rho * nx; py = yl + rho + rho * ny;
      }
      if (tb > 0){ const dx = px - cx, dy = py - cy; px = cx + dx * cr - dy * sr_; py = cy + dx * sr_ + dy * cr; const qx = nx * cr - ny * sr_; ny = nx * sr_ + ny * cr; nx = qx; }
      c.lineWidth = w; c.beginPath(); c.moveTo(px - nx * h / 2, py - ny * h / 2); c.lineTo(px + nx * h / 2, py + ny * h / 2); c.stroke();
    }
  }
  // the result: your print (all your rounds, the new one outermost) and three numbers
  function renderRings(list, Wpx, colorOf){
    const cvs = document.createElement("canvas"); cvs.width = cvs.height = Wpx;
    const P = cvs.getContext("2d"), c0 = Wpx / 2, maxR = Wpx * .47, n = list.length, inner = maxR * .1;
    if (!n) return cvs;
    const gap = Math.min(maxR * .3, (maxR - inner) / n), band = Math.min(maxR * .1, gap * .78), u = maxR / 490;
    list.forEach((p, i) => drawRing(P, p.events, p.text, c0, c0, maxR - (n - 1 - i + .5) * gap, band, colorOf(p, i), u));
    return cvs;
  }
  function showResult(){
    resultImg = null; resultNote = ""; resultBar.hidden = false;
    saveBtn.disabled = !!(current && current.saved); saveBtn.textContent = current && current.saved ? "Added" : "Add to Collection";
  }
  function drawResult(cx, cy, R){
    const S = Math.round(2 * R / .94 * DPR);
    if (!resultImg || resultImg.width !== S){
      resultImg = renderRings(stackFor(current), S, p => p.key === current.key ? "#fff" : "rgba(255,255,255,.22)");
    }
    const sz = S / DPR; c.drawImage(resultImg, cx - sz / 2, cy - sz / 2, sz, sz);
    // numbers on top, starting on the View Collection line; the note sits under the print
    const cb = document.getElementById("colBtn").getBoundingClientRect(), ny = cb.height ? cb.top + cb.height / 2 : 38;
    const F = feats(current), y = Math.min(ny + 40, cy - R - 40), colW = Math.min(115, W / 4.2);
    [[String(F.wpm), "wpm"], [(F.dur / 1000).toFixed(1), "seconds"], [String(F.typoN), F.typoN === 1 ? "typo" : "typos"]].forEach(([v, l], i) => {
      const x = cx + (i - 1) * colW;
      c.textAlign = "center"; c.textBaseline = "alphabetic";
      c.fillStyle = "rgba(255,255,255,.92)"; c.font = `400 ${Math.round(Math.min(30, W / 14))}px ${FONT}`; c.fillText(v, x, y);
      c.fillStyle = "rgba(255,255,255,.42)"; c.font = `400 12px ${FONT}`; c.fillText(l, x, y + 20);
    });
    const n = stackFor(current).length;
    c.fillStyle = "rgba(255,255,255,.4)"; c.font = `400 12.5px ${FONT}`; c.textAlign = "center";
    c.font = `400 11.5px ${FONT}`;
    const noteY = Math.min(cy + R + 40, H - 100);
    c.fillText(resultNote || `${n} ${n === 1 ? "ring" : "rings"} in your print · press enter for a new text`, cx, noteY);
    // Next Round sits just under the note
    const ty = Math.round(noteY + 18) + "px"; if (resultBar.style.top !== ty){ resultBar.style.top = ty; resultBar.style.bottom = "auto"; }
  }

  // Typing canvas
  function draw(){
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.fillStyle = "#000"; c.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * .32, v = typer.value;
    if (done && !morph && current){ drawResult(cx, cy, R); return; }
    if (morph){
      const fade = 1 - clamp01((performance.now() - morph.t0) / 450);
      if (fade <= 0){ drawMorph(cx, cy, R); return; }
      c.globalAlpha = fade;
    }
    const TF = tfCss(tfSel.value);
    let size = 20; c.font = `400 ${size}px ${TF}`;
    size = size * (Math.PI * 2 * R * .965) / c.measureText(text).width;
    c.font = `400 ${size}px ${TF}`; c.textAlign = "center"; c.textBaseline = "alphabetic";
    const cur = Math.min(v.length, text.length - 1);
    let before = 0; for (let i = 0; i < cur; i++) before += c.measureText(text[i]).width;
    const target = -(before + c.measureText(text[cur]).width / 2) / R;
    const now = performance.now(), dt = Math.min(.1, (now - lastFrame) / 1000); lastFrame = now;
    spin += (target - spin) * (reduceMotion ? 1 : 1 - Math.exp(-dt * 9));
    let a = -Math.PI / 2 + spin;
    const blink = Math.floor(performance.now() / 530) % 2 === 0;
    // no typeface chosen yet: the text stays out of focus until one is picked
    const unset = !tfSel.value && !done && !morph;
    // blur that works in every browser (Safari ignores canvas filters): draw the letters far off-screen
    // and let only their soft shadow land back in place
    if (unset){ const K = cv.width + 200; c.setTransform(DPR, 0, 0, DPR, -K, 0); c.shadowOffsetX = K; c.shadowOffsetY = 0; c.shadowColor = "#fff"; c.shadowBlur = Math.max(10, size * .7) * DPR; }
    for (let i = 0; i < text.length; i++){
      const ch = text[i], wch = c.measureText(ch).width, mid = a + (wch / 2) / R;
      const got = v[i], ok = got !== undefined && got === ch, bad = got !== undefined && got !== ch;
      c.save(); c.translate(cx + R * Math.cos(mid), cy + R * Math.sin(mid)); c.rotate(mid + Math.PI / 2);
      c.fillStyle = ok ? "rgba(255,255,255,.92)" : "rgba(255,255,255,.34)";
      c.fillText(ch, 0, 0);
      const uw = Math.max(wch, size * .3), uh = Math.max(1.5, size * .07);
      if (bad){ c.fillStyle = "rgba(255,255,255,.9)"; c.fillRect(-uw / 2, size * .28, uw, uh); }
      if (!done && i === v.length && (blink || !focused)){ c.fillStyle = focused ? "rgba(255,255,255,.9)" : "rgba(255,255,255,.45)"; c.fillRect(-uw / 2, size * .28, uw, uh); }
      c.restore();
      a += wch / R;
    }
    if (unset){ c.setTransform(DPR, 0, 0, DPR, 0, 0); c.shadowColor = "transparent"; c.shadowBlur = 0; c.shadowOffsetX = 0; }
    c.globalAlpha = 1;
    if (morph){ drawMorph(cx, cy, R); return; }
    const x0 = W * .04, x1 = W * .96;
    c.strokeStyle = "rgba(255,255,255,.14)"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x0, Math.round(cy) + .5); c.lineTo(x1, Math.round(cy) + .5); c.stroke();
    const ms = marks(ev, text);
    if (ms.length){
      const unit = (x1 - x0) / (text.length * f(230)), span = ms[ms.length - 1].x;
      const k = Math.min(unit, (x1 - x0) / Math.max(span, 1)), base = Math.max(30, Math.min(70, H * .07));
      c.fillStyle = "rgba(255,255,255,.92)";
      for (const m of ms){ const { w: bw, h: bh } = markSize(m, base, 1); c.fillRect(Math.min(x0 + m.x * k, x1 - bw), cy - bh / 2, bw, bh); }
    }
    const note = !tfSel.value ? "choose a typeface to start" : v.length >= text.length ? "press enter to finish" : "";
    if (note){ c.fillStyle = "rgba(255,255,255,.4)"; c.font = `400 12.5px ${FONT}`; c.textAlign = "center"; c.fillText(note, cx, H - 70); }
  }
  const anyOpen = () => anyOpen0();
  function loop(){ if (!anyOpen()) { try { draw(); } catch (e){ console.error(e); morph = null; } } requestAnimationFrame(loop); }

  // the numbers, top left: everything you've typed so far
  const LSC = LS + "-counts";
  let counts = { started: 0, finished: 0 };
  try { const v = JSON.parse(localStorage.getItem(LSC) || "{}"); counts.started = +v.started || 0; counts.finished = +v.finished || 0; if (v.by && typeof v.by === "object") counts.by = v.by; } catch (e) {}
  const saveCounts = () => { try { localStorage.setItem(LSC, JSON.stringify(counts)); } catch (e) {} };
  let lastData = "";
  const hms = ms => { const t = Math.round(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s2 = t % 60; return [h, m, s2].map(x => String(x).padStart(2, "0")).join(":"); };
  function allRounds(){ const extra = trials.filter(t => t && !mine.some(m => m.key === t.key)); return [...mine, ...extra]; }
  function bump(field){
    counts[field]++; counts.by = counts.by || {}; const k = curTf(); counts.by[k] = counts.by[k] || { started: 0, finished: 0 }; counts.by[k][field]++; saveCounts();
  }
  // home page, bottom left: the round you're typing right now
  function renderData(){
    const st = computeStats(ev, text, typos), started = Math.max(counts.started, allRounds().length + (t0 !== null && !done ? 1 : 0)), round = t0 === null ? started + 1 : started;
    const rows = [["Round:", round], ["Typeface:", tfSel.value ? tfName(curTf()) : "–"], ["Time:", (st.dur / 1000).toFixed(2) + "s"], ["Characters:", `${st.chars} / ${text.length}`],
      ["Typos:", typos], ["Corrections:", st.corrections], ["Accuracy:", st.accuracy + "%"], ["Speed:", st.wpm + " wpm"],
      ["Average Gap:", st.avg + " ms"], ["Steadiness:", "± " + st.sd + " ms"], ["Longest Pause:", st.longest ? st.longest + " ms" : "–"]];
    const html = rows.map(r => `<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join("");
    if (html !== lastData){ dataEl.innerHTML = html; lastData = html; }
    renderTotals();
  }
  // collection page: everything you've typed, for one typeface or all of them
  const colTf = document.getElementById("colTf");
  fancySelect(colTf);
  const colRounds = () => allRounds().filter(p => colTf.value === "all" || tfKey(p) === colTf.value);
  function renderTotals(){
    const list = colRounds(), F = list.map(feats), n = list.length, all = colTf.value === "all";
    const c0 = all ? counts : ((counts.by || {})[colTf.value] || { started: 0, finished: 0 });
    const chars = F.reduce((a, f) => a + f.n, 0), ty = F.reduce((a, f) => a + f.typoN, 0), keys = chars + ty;
    const fin = Math.max(c0.finished, n), st = Math.max(c0.started, fin);
    const rows = [["Test Started:", st], ["Test Finished:", fin], ["Time Typing:", hms(F.reduce((a, f) => a + f.dur, 0))], ["Characters Typed:", chars], ["Typos:", ty],
      ["Accuracy:", n ? Math.round(100 * (1 - ty / Math.max(1, keys))) + "%" : "–"], ["Average Speed:", n ? Math.round(mean(F.map(f => f.wpm))) + " wpm" : "–"],
      ["Average Time:", n ? (mean(F.map(f => f.dur)) / 1000).toFixed(1) + "s" : "–"]];
    document.getElementById("colStats").innerHTML = rows.map(r => `<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join("");
    const first = allRounds().length ? Math.min(...allRounds().map(p => p.at)) : null;
    document.getElementById("colInfo").textContent = first ? "Since " + dateStr(first) : "No rounds yet";
  }
  function pushDoc(){ if (db && uid) return db.doc("patterns/" + uid).set({ items: mine.map(strip), at: Date.now(), started: counts.started, finished: counts.finished, by: counts.by || {} }); return Promise.resolve(); }

  // typing: input diffing for characters, key down/up for hold time, rollover and shift side
  typer.addEventListener("focus", () => focused = true);
  typer.addEventListener("blur", () => focused = false);
  cv.addEventListener("pointerdown", e => { e.preventDefault(); if (morph){ endMorph(); return; } typer.focus(); });
  addEventListener("keydown", e => {
    if (!views.arch.hidden){ if (e.key === "Escape") closeArch(); return; }
    if (!views.col.hidden){ if (e.key === "Escape"){ if (!histEl.hidden) closeHist(); else if (replayS) stopReplay(); else closeCol(); } return; }
    if (document.activeElement !== typer && !e.metaKey && !e.ctrlKey && e.key.length === 1) typer.focus();
    if (morph){ if (e.key === "Enter" || e.key === "Escape"){ e.preventDefault(); endMorph(); } return; }
    if (e.key === "Enter"){ e.preventDefault(); if (e.repeat) return; if (done) reset(); else if (typer.value.length >= 10) finish(); }
  });
  typer.addEventListener("keydown", e => {
    if (e.repeat) return;
    if (e.key === "Shift"){ shiftLoc = e.location; return; }
    if (e.key.length !== 1) return;
    const rec = { t: performance.now(), idx: null, roll: [...held.values()].some(r => r.idx !== null) };
    held.set(e.code || e.key, rec); lastDown = rec;
  });
  addEventListener("keyup", e => {
    if (e.key === "Shift"){ shiftLoc = 0; return; }
    const k = e.code || e.key, rec = held.get(k); if (!rec) return;
    held.delete(k);
    if (rec.idx !== null && rec.idx < dwell.length + 1) dwell[rec.idx] = Math.min(999, Math.round(performance.now() - rec.t));
  });
  typer.addEventListener("paste", e => e.preventDefault());
  typer.addEventListener("input", () => {
    if (done){ typer.value = prev; return; }
    if (!tfSel.value){ typer.value = prev; needTf(); return; }   // pick a typeface before playing
    const now = performance.now(), v = typer.value;
    if (t0 === null){ t0 = now; bump("started"); renderData(); }
    const t = Math.round(now - t0);
    let p = 0; while (p < prev.length && p < v.length && prev[p] === v[p]) p++;
    if (p < prev.length && firstWrong !== null){ lags.push(Math.max(0, prev.length - 1 - firstWrong)); if (p <= firstWrong) firstWrong = null; }
    for (let i = p; i < prev.length; i++) ev.push([t, 2]);
    for (let i = p; i < v.length; i++){
      const keyIdx = ev.filter(e => e[1] !== 2).length;
      ev.push([t, v[i] === " " ? 1 : 0]);
      dwell[keyIdx] = null;
      if (lastDown && lastDown.idx === null && now - lastDown.t < 400){ lastDown.idx = keyIdx; if (lastDown.roll) rolls.push(i); }
      if (/[A-Z!@#$%^&*()_+{}|:"<>?~]/.test(v[i])){ if (shiftLoc === 1) sl++; else if (shiftLoc === 2) sr++; }
      if (v[i] !== text[i]){
        typos++;
        if (firstWrong === null) firstWrong = i;
        const exp = text[i] || " ", got = v[i];
        const k = got.toLowerCase() === exp.toLowerCase() ? "c" : got === text[i + 1] ? "t" : (exp === " " || got === " ") ? "s" : adjacent(got, exp) ? "a" : "o";
        if (tyList.length < 60) tyList.push(i + k);
      }
    }
    prev = v;
    if (v.length > text.length + 10){ typer.value = prev = v.slice(0, text.length + 10); }
    renderData();
  });
  function finish(){
    done = true;
    const st = computeStats(ev, text, typos);
    current = {
      ev: encode(ev), text, at: Date.now(), tf: tfSel.value || "system", typos, dur: st.dur, corrections: st.corrections, wpm: st.wpm, accuracy: st.accuracy,
      no: 1000 + Math.floor(Math.random() * 9000),
      dw: dwell.slice(0, ev.filter(e => e[1] !== 2).length).map(x => x == null ? "" : String(x)).join("."),
      ro: rolls.slice(0, 80).join("."), ty: tyList.join("."), lg: lags.length ? Math.round(mean(lags) * 10) / 10 : undefined, sl, sr,
    };
    current = prep(current, true);
    trials.push(current);
    bump("finished");
    addToCollection();   // every finished round joins your print automatically
    saveBtn.disabled = false; saveBtn.textContent = "add to collection";
    typer.blur(); renderData();
    if (reduceMotion) showResult();
    else morph = { t0: performance.now(), events: ev.slice(), text, stack: stackFor(current) };
  }
  function reset(){
    morph = null; resultImg = null; resultBar.hidden = true;
    text = makeText(); ev = []; t0 = null; prev = ""; done = false; typos = 0; typer.value = "";
    dwell = []; rolls = []; tyList = []; lags = []; firstWrong = null; sl = sr = 0; held.clear(); lastDown = null;
    renderData(); typer.focus();
  }
  document.getElementById("newBtn").onclick = () => reset();
  document.getElementById("nextBtn").onclick = () => reset();
  setInterval(() => { if (!done && t0 !== null && !anyOpen()) renderData(); }, 250);

  // the collection
  let mine = [], others = [], db = null, uid = null, downloads = null;
  function prep(p, me){
    const events = decode(p.ev); if (!events || !validText(p.text)) return null;
    const q = { ev: p.ev, text: p.text, at: +p.at || 0, events, me: !!me, who: me ? "me" : p.who };
    for (const k of ["typos", "dur", "corrections", "wpm", "accuracy", "lg", "sl", "sr"]) if (typeof p[k] === "number" && isFinite(p[k])) q[k] = p[k];
    q.no = typeof p.no === "number" && p.no >= 0 && p.no < 10000 ? p.no : hash(p.text + p.at) % 9000 + 1000;
    if (okStr(p.dw, /^[\d.]*$/, 2400)) q.dw = p.dw;
    if (okStr(p.ro, /^[\d.]*$/, 600)) q.ro = p.ro;
    if (okStr(p.ty, /^[\d.atcso]*$/, 600)) q.ty = p.ty;
    if (okStr(p.tf, /^[a-z]{1,20}$/, 20)) q.tf = p.tf;
    q.key = q.who + "|" + q.at + "|" + q.no;
    if (p.saved) q.saved = true;
    return q;
  }
  const strip = p => { const o = {}; for (const k of ["ev", "text", "at", "typos", "dur", "corrections", "wpm", "accuracy", "no", "dw", "ro", "ty", "lg", "sl", "sr", "tf"]) if (p[k] !== undefined) o[k] = p[k]; return o; };
  try { const v = JSON.parse(localStorage.getItem(LS) || "[]"); if (Array.isArray(v)) mine = v.map(p => prep(p, true)).filter(Boolean); } catch (e) {}
  function fitDoc(list){ let l = list.slice(-120); while (l.length > 1 && JSON.stringify(l.map(strip)).length > 230000) l = l.slice(1); return l; }
  const saveLocal = () => { try { localStorage.setItem(LS, JSON.stringify(mine.map(strip))); } catch (e) {} };
  const saveBtn = document.getElementById("saveBtn");
  async function addToCollection(){
    const t = current; if (!t || t.saved) return;
    t.saved = true; saveBtn.disabled = true; saveBtn.textContent = "Added";
    mine.push(t); mine = fitDoc(mine); saveLocal();
    resultImg = null;
    renderData();
    if (db && uid){ try { await pushDoc(); } catch (e){ resultNote = "saved on this device · the shared collection couldn't be reached"; } }
    else resultNote = "saved on this device";
  }
  saveBtn.onclick = addToCollection;
  function collection(){ return [...others, ...mine].sort((a, b) => a.at - b.at); }

  // your print: every saved round as a ring that moves under the cursor
  const colEl = views.col, printCv = document.getElementById("printCv"), colHint = document.getElementById("colHint");
  const HINT = "move over your print · click a ring to replay how you typed it";
  let parts = [], ringsGeo = [], pops = [], replayS = null, pointer = null, hoverRing = -1, pc = { cx: 0, cy: 0, maxR: 0 }, colDpr = 1, lastT = 0;
  function buildPrint(){
    const list = mine.filter(p => colTf.value === "all" || tfKey(p) === colTf.value).sort((a, b) => a.at - b.at), n = list.length;
    colDpr = Math.min(2, devicePixelRatio || 1);
    printCv.width = Math.round(innerWidth * colDpr); printCv.height = Math.round(innerHeight * colDpr);
    const Wc = innerWidth, Hc = innerHeight, maxR = Math.min(Wc, Hc - 120) * .42, inner = maxR * .1;
    pc = { cx: Wc / 2, cy: Hc / 2, maxR };
    const gap = n ? Math.min(maxR * .3, (maxR - inner) / n) : 0, band = Math.min(maxR * .1, gap * .78), u = maxR / 490;
    parts = []; ringsGeo = [];
    list.forEach((p, k) => {
      const r = maxR - (n - 1 - k + .5) * gap, ms = marks(p.events, p.text), { times } = replay(p.events), span = Math.max(ms.length ? ms[ms.length - 1].x : 1, 1);
      const F = feats(p), ring = { r, item: p, k, first: parts.length, count: ms.length, times, dur: F.dur, wpm: F.wpm, typos: F.typoN };
      ms.forEach((m, j) => {
        const a = -Math.PI / 2 + (m.x / span) * Math.PI * 2 * .985, sz = markSize(m, band, u * .8);
        parts.push({ a, r, w: sz.w, h: sz.h, ch: p.text[j] || "", font: tfCss(p.tf), e: m.e, g: m.g, ring: k, ox: 0, oy: 0, vx: 0, vy: 0, cool: 0, flash: 0 });
      });
      ringsGeo.push(ring);
    });
    renderData();
    if (!replayS) colHint.textContent = n ? "" : colTf.value === "all" ? "Your print is empty. Finish a text and press Enter to add your first ring." : "No rounds in " + tfName(colTf.value) + " yet. Pick it on the typing page to start.";
  }
  function spawnPop(pt, ch, strength, ox = 0, oy = 0){
    if (!ch.trim() || pops.length > 160) return;
    const x = pc.cx + Math.cos(pt.a) * pt.r + pt.ox, y = pc.cy + Math.sin(pt.a) * pt.r + pt.oy;
    let dx = Math.cos(pt.a), dy = Math.sin(pt.a);
    if (ox || oy){ const l = Math.hypot(ox, oy) || 1; dx = dx * .4 + ox / l * .6; dy = dy * .4 + oy / l * .6; }
    // how the letter leaves mirrors how it was typed:
    // speed = how fast that key came after the one before it, opacity = right first time (full) or not (half),
    // size = how many times you went back to fix it
    const slow = clamp01((Math.log(Math.max(pt.g || 200, 1)) - Math.log(45)) / (Math.log(1100) - Math.log(45)));
    const sp = lerp(340, 40, slow) * (.85 + .3 * strength);
    pops.push({ x, y, vx: dx * sp, vy: dy * sp, ch, t: 0, life: 1.6, size: 15 + 11 * Math.min(pt.e, 5), font: pt.font || FONT, alpha: pt.e > 0 ? .5 : 1 });
  }
  function stepPrint(now){
    const dt = Math.min(.05, (now - (lastT || now)) / 1000); lastT = now;
    const P = printCv.getContext("2d"); P.setTransform(colDpr, 0, 0, colDpr, 0, 0);
    P.fillStyle = "#000"; P.fillRect(0, 0, innerWidth, innerHeight);
    const RAD = Math.max(70, pc.maxR * .22), still = reduceMotion;
    // which ring is under the cursor
    hoverRing = -1;
    if (pointer && ringsGeo.length){
      const d = Math.hypot(pointer.x - pc.cx, pointer.y - pc.cy), step = ringsGeo.length > 1 ? Math.abs(ringsGeo[1].r - ringsGeo[0].r) : 40;
      let bd = 1e9; ringsGeo.forEach((g, k) => { const dd = Math.abs(d - g.r); if (dd < bd){ bd = dd; hoverRing = k; } });
      if (bd > Math.max(14, step * .6)) hoverRing = -1;
    }
    // replay: the letters leave their marks, with a key sound, in the rhythm they were typed (real time)
    if (replayS){
      const g = ringsGeo[replayS.k], el = now - replayS.t0;
      if (!g) replayS = null;
      else {
        while (replayS.i < g.count && g.times[replayS.i] <= el){ const pt = parts[g.first + replayS.i]; pt.flash = 1; spawnPop(pt, pt.ch, .55); keySound(pt); replayS.i++; }
        if (replayS.i >= g.count) stopReplay();
      }
    }
    P.lineCap = "butt";
    for (const pt of parts){
      const bx = pc.cx + Math.cos(pt.a) * pt.r, by = pc.cy + Math.sin(pt.a) * pt.r;
      let tx = 0, ty = 0;
      // hovering no longer pushes marks or releases letters: only clicking a ring (replay) does
      // spring back to rest
      pt.vx += ((tx - pt.ox) * 90 - pt.vx * 12) * dt; pt.vy += ((ty - pt.oy) * 90 - pt.vy * 12) * dt;
      pt.ox += pt.vx * dt; pt.oy += pt.vy * dt; pt.cool -= dt; pt.flash = Math.max(0, pt.flash - dt * 1.6);
      const x = bx + pt.ox, y = by + pt.oy, nx = Math.cos(pt.a), ny = Math.sin(pt.a);
      const dim = replayS ? (pt.ring === replayS.k ? 1 : .15) : hoverRing >= 0 && pt.ring !== hoverRing ? .5 : .9;
      P.strokeStyle = `rgba(255,255,255,${Math.min(1, dim + pt.flash * .5).toFixed(3)})`; P.lineWidth = pt.w;
      P.beginPath(); P.moveTo(x - nx * pt.h / 2, y - ny * pt.h / 2); P.lineTo(x + nx * pt.h / 2, y + ny * pt.h / 2); P.stroke();
    }
    // the letters that jumped out
    P.textAlign = "center"; P.textBaseline = "middle";
    pops = pops.filter(q => (q.t += dt) < q.life);
    for (const q of pops){
      q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= Math.pow(.18, dt); q.vy *= Math.pow(.18, dt);
      const k = q.t / q.life, al = k < .15 ? k / .15 : 1 - Math.pow((k - .15) / .85, 2), sc = .6 + .6 * Math.min(1, q.t / .25);
      P.fillStyle = `rgba(255,255,255,${(al * q.alpha).toFixed(3)})`; P.font = `400 ${(q.size * sc).toFixed(1)}px ${q.font}`;
      P.fillText(q.ch, q.x, q.y);
    }
    // the hovered (or replaying) round's numbers
    const g = replayS ? ringsGeo[replayS.k] : hoverRing >= 0 ? ringsGeo[hoverRing] : null;
    if (g){
      P.fillStyle = "rgba(255,255,255,.7)"; P.font = `400 12.5px ${FONT}`; P.textAlign = "center"; P.textBaseline = "alphabetic";
      P.fillText(`${replayS ? "" : `round ${g.k + 1} · `}${g.wpm} wpm · ${(g.dur / 1000).toFixed(1)} s · ${g.typos} ${g.typos === 1 ? "typo" : "typos"} · ${tfName(g.item.tf) ? " · " + tfName(g.item.tf) : ""} · ${dateStr(g.item.at)}`, pc.cx, Math.min(innerHeight - 78, pc.cy + pc.maxR + 36));
    }
  }
  // sound: a soft synthesized key click for each letter in a replay
  let AC = null, noiseBuf = null, master = null;
  function audio(){
    try {
      if (!AC){
        AC = new (window.AudioContext || window.webkitAudioContext)();
        master = AC.createGain(); master.gain.value = .45; master.connect(AC.destination);
        noiseBuf = AC.createBuffer(1, Math.round(AC.sampleRate * .06), AC.sampleRate);
        const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
      }
      if (AC.state === "suspended") AC.resume();
    } catch (e) { AC = null; }
    return AC;
  }
  // the melody: each mark also plays a note. A short line (a quick key) is a high note, a long line (a pause) a low one,
  // all on a pentatonic scale so it stays musical; slower, wider marks ring longer; a typo block adds a clashing half-step
  const PENTA = [0, 2, 4, 7, 9];
  function playNote(ac, t, pt){
    if (pt.ch === " ") return;   // spaces stay as rests, like gaps between words
    const s = clamp01((Math.log(Math.max(pt.g || 200, 1)) - Math.log(45)) / (Math.log(1100) - Math.log(45)));
    const steps = PENTA.length * 3, idx = Math.round((1 - s) * (steps - 1));
    const semi = PENTA[idx % PENTA.length] + 12 * Math.floor(idx / PENTA.length), f = 196 * Math.pow(2, semi / 12);   // G3 up three octaves
    const dur = .22 + .7 * s + (pt.e ? .25 : 0), vol = .1 + .05 * s + (pt.e ? .04 : 0);
    const voice = (freq, type, v) => {
      const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .012); g.gain.exponentialRampToValueAtTime(.0008, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05);
    };
    voice(f, "triangle", vol); voice(f * 2, "sine", vol * .25);          // the note, with a soft overtone
    if (pt.e) voice(f * Math.pow(2, 1 / 12), "triangle", vol * .7);      // typo: a half-step above, slightly sour
    if (pt.e > 1) voice(f / 2, "sine", vol * .6);                         // fixed more than once: a low note underneath too
  }
  function keySound(pt){
    const ac = AC; if (!ac || ac.state !== "running") return;
    const t = ac.currentTime + .005, space = pt.ch === " ", typo = pt.e > 0, jit = .9 + Math.random() * .2;
    // the click: filtered noise (duller and louder where you made a typo, deeper on the space bar)
    const src = ac.createBufferSource(); src.buffer = noiseBuf;
    const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.4;
    bp.frequency.value = (space ? 1400 : typo ? 1200 : 3200) * jit;
    const g = ac.createGain(), v = (typo ? .55 : space ? .45 : .38) * jit;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .002); g.gain.exponentialRampToValueAtTime(.001, t + (typo ? .07 : .045));
    src.connect(bp); bp.connect(g); g.connect(master); src.start(t); src.stop(t + .08);
    // the body: a short low thud under the click
    const o = ac.createOscillator(), og = ac.createGain();
    o.type = "sine"; o.frequency.setValueAtTime((space ? 110 : typo ? 130 : 190) * jit, t); o.frequency.exponentialRampToValueAtTime(70, t + .05);
    og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(typo ? .35 : .18, t + .003); og.gain.exponentialRampToValueAtTime(.001, t + .06);
    o.connect(og); og.connect(master); o.start(t); o.stop(t + .07);
    playNote(ac, t, pt);
  }
  function colLoop(now){ if (colEl.hidden) return; try { stepPrint(now); } catch (e){ console.error(e); } requestAnimationFrame(colLoop); }
  printCv.addEventListener("pointermove", e => { pointer = { x: e.clientX, y: e.clientY }; printCv.style.cursor = hoverRing >= 0 ? "pointer" : "default"; });
  printCv.addEventListener("pointerleave", () => { pointer = null; });
  printCv.addEventListener("pointerdown", e => {
    pointer = { x: e.clientX, y: e.clientY }; stepPrint(performance.now());
    if (hoverRing < 0) return;
    replayS = { k: hoverRing, t0: performance.now(), i: 0 };
    document.getElementById("exitReplay").hidden = false;
    colHint.textContent = "";
    audio(); // start sound on this click, which browsers require
  });
  colTf.addEventListener("change", () => { stopReplay(); pops = []; buildPrint(); colTf.blur(); });
  function openCol(){ colTf.value = "all"; colTf._refresh(); colEl.hidden = false; typer.blur(); replayS = null; pops = []; lastT = 0; buildPrint(); requestAnimationFrame(colLoop); }
  function stopReplay(){ replayS = null; colHint.textContent = ""; document.getElementById("exitReplay").hidden = true; }
  document.getElementById("exitReplay").onclick = stopReplay;
  function closeCol(){ stopReplay(); if (typeof histEl !== "undefined") histEl.hidden = true; colEl.hidden = true; pointer = null; if (!done) typer.focus(); }
  document.getElementById("colBtn").onclick = openCol;
  document.getElementById("closeBtn").onclick = closeCol;
  document.getElementById("colStatsBtn").onclick = () => { closeCol(); openArch(); };
  function printImage(size, bg){
    const big = document.createElement("canvas"); big.width = big.height = size; const P = big.getContext("2d");
    P.fillStyle = bg; P.fillRect(0, 0, size, size);
    const list = mine.slice().sort((a, b) => a.at - b.at);
    P.drawImage(renderRings(list, Math.round(size * .86), () => "rgba(255,255,255,.95)"), size * .07, size * .05);
    P.fillStyle = "rgba(255,255,255,.6)"; P.font = `400 ${Math.round(size / 60)}px ${FONT}`; P.textAlign = "center";
    P.fillText(`${list.length} ${list.length === 1 ? "round" : "rounds"}${list.length ? " · " + dateStr(list[0].at) + " – " + dateStr(list[list.length - 1].at) : ""}`, size / 2, size * .955);
    return big;
  }
  async function offer(data, filename, onDone){
    if (!downloads){ onDone("Downloads aren't available in this view."); return; }
    const go = async blob => {
      try { await downloads.save({ filename, data: blob }); onDone("saved"); }
      catch (e){ onDone(e && e.code === "declined" ? "cancelled" : "failed"); }
    };
    if (typeof data === "string") go(data); else data.toBlob(go, "image/png");
  }
  const msg = (r, what) => r === "saved" ? `${what} saved.` : r === "cancelled" ? "Download cancelled." : r === "failed" ? `The ${what.toLowerCase()} couldn't be saved. Try again in a moment.` : r;
  const dlBtn = document.getElementById("dlBtn");
  dlBtn.onclick = () => { if (!mine.length) return; offer(printImage(3000, "#000"), "typed-my-print.png", r => colHint.textContent = msg(r, "Print")); };
  document.getElementById("dlPrintBtn").onclick = () => {
    if (!current) return;
    const big = document.createElement("canvas"); big.width = big.height = 2400; const P = big.getContext("2d");
    P.fillStyle = "#000"; P.fillRect(0, 0, 2400, 2400);
    P.drawImage(renderRings(stackFor(current), 2000, p => p.key === current.key ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.45)"), 200, 120);
    const F = feats(current); P.fillStyle = "rgba(255,255,255,.75)"; P.font = `400 40px ${FONT}`; P.textAlign = "center";
    P.fillText(`${F.wpm} wpm   ·   ${(F.dur / 1000).toFixed(1)} s   ·   ${F.typoN} ${F.typoN === 1 ? "typo" : "typos"}   ·   ${dateStr(current.at)}`, 1200, 2280);
    offer(big, `typed-print-${pad4(current.no)}.png`, r => { resultNote = msg(r, "Print").replace(/\.$/, "").toLowerCase(); });
  };
  // the stats page: averages across a person's rounds, not the rounds themselves
  const archEl = views.arch;
  let scope = "me";
  function openArch(){ archEl.hidden = false; typer.blur(); archEl.scrollTop = 0; renderArchive(); }
  function closeArch(){ archEl.hidden = true; typer.focus(); }
  document.getElementById("archBtn").onclick = openArch;
  document.getElementById("archBack").onclick = closeArch;

  const LIGHT = [232, 232, 226];

  function summarize(list){
    if (!list.length) return null;
    const F = list.map(feats), chars = F.reduce((a, f) => a + f.n, 0) || 1;
    const holds = F.filter(f => f.hold != null), lags = F.filter(f => f.lag != null);
    const kinds = {}; F.forEach(f => { for (const k in f.kinds) kinds[k] = (kinds[k] || 0) + f.kinds[k]; });
    const topKind = Object.keys(kinds).sort((a, b) => kinds[b] - kinds[a])[0];
    const types = {}; F.forEach(f => types[f.type] = (types[f.type] || 0) + 1);
    const pairs = {}; F.forEach(f => { for (const k in f.pavg){ (pairs[k] = pairs[k] || []).push(f.pavg[k]); } });
    const pk = Object.keys(pairs).filter(k => pairs[k].length >= Math.min(3, list.length)), pm = {}; pk.forEach(k => pm[k] = mean(pairs[k]));
    const sl = F.reduce((a, f) => a + f.sl, 0), sr = F.reduce((a, f) => a + f.sr, 0);
    return {
      n: list.length, people: new Set(list.map(p => p.who)).size, first: Math.min(...list.map(p => p.at)),
      wpm: mean(F.map(f => f.wpm)), best: Math.max(...F.map(f => f.wpm)), dur: mean(F.map(f => f.dur)) / 1000,
      typoPct: 100 * F.reduce((a, f) => a + f.typoN, 0) / chars,
      acc: mean(list.map((p, i) => p.accuracy ?? Math.max(0, 100 * (1 - F[i].typoRate)))),
      gap: mean(F.map(f => f.avg)), sd: mean(F.map(f => f.sd)),
      hold: holds.length ? mean(holds.map(f => f.hold)) : null,
      roll: 100 * F.reduce((a, f) => a + f.rolls.length, 0) / chars,
      lag: lags.length ? mean(lags.map(f => f.lag)) : null,
      pauses: mean(F.map(f => f.gaps.filter((g, i) => i && g > 500).length)),
      drift: mean(F.map(f => f.drift)), topKind, kinds, types, sl, sr,
      fastPair: pk.length ? pk.reduce((a, b) => pm[a] <= pm[b] ? a : b) : null, slowPair: pk.length ? pk.reduce((a, b) => pm[a] >= pm[b] ? a : b) : null, pm,
    };
  }
  function drawAllRings(cv, list){
    const P = cv.getContext("2d"), W = cv.width, c = W / 2, maxR = W * .47, n = list.length, inner = maxR * .1;
    P.clearRect(0, 0, W, W);
    if (!n){ P.strokeStyle = "rgba(255,255,255,.2)"; P.lineWidth = 1; P.beginPath(); P.arc(c, c, maxR * .6, 0, Math.PI * 2); P.stroke(); return; }
    const gap = Math.min(maxR * .3, (maxR - inner) / n), band = Math.min(maxR * .1, gap * .78), u = maxR / 490;
    list.forEach((p, i) => drawRing(P, p.events, p.text, c, c, maxR - (n - 1 - i + .5) * gap, band, `rgb(${LIGHT.join(",")})`, u));
  }
  // charts: one hue (white = you, grey = everyone), thin marks, recessive grid, hover tooltips
  const niceStep = (m, k) => { const st = Math.pow(10, Math.floor(Math.log10(Math.max(m, 1e-6) / k))); return [1, 2, 5, 10].map(x => x * st).find(x => m / x <= k) || st * 10; };
  function setupCanvas(cv){ const w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(2, devicePixelRatio || 1); cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); const P = cv.getContext("2d"); P.setTransform(dpr, 0, 0, dpr, 0, 0); P.clearRect(0, 0, w, h); return { P, w, h }; }
  function axes(P, w, h, ymax, unit, L = 46, B = 30, T = 12, Rm = 12){
    const pw = w - L - Rm, ph = h - T - B, st = niceStep(ymax, 4);
    P.font = `400 11px ${FONT}`; P.fillStyle = "rgba(255,255,255,.45)"; P.strokeStyle = "rgba(255,255,255,.1)"; P.lineWidth = 1; P.textAlign = "right"; P.textBaseline = "middle";
    for (let v = 0; v <= ymax + 1e-9; v += st){ const y = Math.round(T + ph - v / ymax * ph) + .5; P.beginPath(); P.moveTo(L, y); P.lineTo(L + pw, y); P.stroke(); P.fillText((st < 1 ? v.toFixed(1) : Math.round(v)) + unit, L - 8, y); }
    return { L, T, pw, ph, y: v => T + ph - v / ymax * ph };
  }
  const charts = {};
  function hoverable(id, pts, fmtTip){
    const cv = document.getElementById(id), tip = cv.parentElement.querySelector(".tip");
    charts[id] = { pts, fmtTip };
    if (cv._wired) return; cv._wired = true;
    cv.addEventListener("pointermove", e => {
      const { pts, fmtTip } = charts[id], r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      let best = null, bd = 1e9; for (const q of pts){ const d = q.box ? (x >= q.box[0] && x <= q.box[0] + q.box[2] ? Math.abs(y - (q.box[1] + q.box[3] / 2)) * .01 : 1e9) : Math.hypot(q.x - x, (q.y - y) * .3); if (d < bd){ bd = d; best = q; } }
      if (!best || (!best.box && bd > 40)){ tip.hidden = true; return; }
      tip.hidden = false; tip.style.left = best.x + "px"; tip.style.top = best.y + "px"; tip.textContent = fmtTip(best);
    });
    cv.addEventListener("pointerleave", () => tip.hidden = true);
  }
  function lineChart(id, vals, ref, unit, decimals, tipName){
    const { P, w, h } = setupCanvas(document.getElementById(id)), n = vals.length;
    const ymax = Math.max(1e-6, ...vals, ref ?? 0) * 1.18, ax = axes(P, w, h, ymax, unit === "%" ? "%" : "");
    const xAt = i => ax.L + (n <= 1 ? ax.pw / 2 : i / (n - 1) * ax.pw);
    P.fillStyle = "rgba(255,255,255,.45)"; P.textAlign = "center"; P.textBaseline = "top";
    const xs = n <= 1 ? [0] : [...new Set([0, n - 1, ...Array.from({ length: 5 }, (_, k) => Math.round(k * (n - 1) / 4))])];
    xs.forEach(i => P.fillText(String(i + 1), xAt(i), ax.T + ax.ph + 8));
    P.fillText("round", ax.L + ax.pw / 2, ax.T + ax.ph + 8 + (n > 1 ? 0 : 0) + 12);
    if (ref != null){
      const y = Math.round(ax.y(ref)) + .5; P.setLineDash([5, 4]); P.strokeStyle = "rgba(255,255,255,.5)"; P.lineWidth = 1.5; P.beginPath(); P.moveTo(ax.L, y); P.lineTo(ax.L + ax.pw, y); P.stroke(); P.setLineDash([]);
      P.fillStyle = "rgba(255,255,255,.6)"; P.textAlign = "right"; P.textBaseline = "bottom"; P.fillText(`everyone ${ref.toFixed(decimals)}${unit === "%" ? "%" : " " + unit}`, ax.L + ax.pw, y - 4);
    }
    P.strokeStyle = "#fff"; P.lineWidth = 2; P.lineJoin = "round"; P.beginPath(); vals.forEach((v, i) => i ? P.lineTo(xAt(i), ax.y(v)) : P.moveTo(xAt(i), ax.y(v))); P.stroke();
    const pts = vals.map((v, i) => ({ x: xAt(i), y: ax.y(v), v, i }));
    for (const q of pts){ P.fillStyle = "#fff"; P.beginPath(); P.arc(q.x, q.y, 4, 0, Math.PI * 2); P.fill(); P.strokeStyle = "#000"; P.lineWidth = 2; P.stroke(); }
    hoverable(id, pts, q => `round ${q.i + 1} · ${q.v.toFixed(decimals)}${unit === "%" ? "%" : " " + unit}`);
  }
  function histChart(id, allVals, myVals, unit, decimals){
    const { P, w, h } = setupCanvas(document.getElementById(id));
    const mx = Math.max(1e-6, ...allVals), bw = niceStep(mx, 8), nb = Math.max(1, Math.ceil((mx + 1e-9) / bw));
    const cnt = Array(nb).fill(0), mineC = Array(nb).fill(0), bin = v => Math.min(nb - 1, Math.floor(v / bw));
    allVals.forEach(v => cnt[bin(v)]++); myVals.forEach(v => mineC[bin(v)]++);
    const ymax = Math.max(1, ...cnt) * 1.15, ax = axes(P, w, h, ymax, "");
    const slot = ax.pw / nb, pts = [];
    P.fillStyle = "rgba(255,255,255,.45)"; P.textAlign = "center"; P.textBaseline = "top";
    for (let i = 0; i <= nb; i++) if (nb <= 10 || i % 2 === 0) P.fillText((i * bw).toFixed(bw < 1 ? 1 : 0) + (unit === "%" ? "%" : ""), ax.L + i * slot, ax.T + ax.ph + 8);
    P.fillText(unit === "%" ? "typo rate" : unit, ax.L + ax.pw / 2, ax.T + ax.ph + 20);
    for (let i = 0; i < nb; i++){
      if (!cnt[i]) continue;
      const x = ax.L + i * slot + 1, bwPx = Math.max(1, slot - 2), yTop = ax.y(cnt[i]), yMine = ax.y(mineC[i]), y0 = ax.y(0);
      P.fillStyle = "rgba(255,255,255,.4)"; P.fillRect(x, yTop, bwPx, y0 - yTop);
      if (mineC[i]){ P.fillStyle = "#fff"; P.fillRect(x, yMine, bwPx, y0 - yMine); if (mineC[i] < cnt[i]){ P.fillStyle = "#000"; P.fillRect(x, yMine - 2, bwPx, 2); } }
      pts.push({ x: x + bwPx / 2, y: yTop, box: [x, yTop, bwPx, y0 - yTop], lo: i * bw, hi: (i + 1) * bw, c: cnt[i], m: mineC[i] });
    }
    hoverable(id, pts, q => `${q.lo.toFixed(decimals)}–${q.hi.toFixed(decimals)}${unit === "%" ? "%" : " " + unit} · ${q.c} ${q.c === 1 ? "round" : "rounds"} (${q.m} yours)`);
  }
  function renderCharts(list, meL, all, S, Ev){
    const sec = document.getElementById("chartsSec"); sec.hidden = !list.length; if (!list.length) return;
    const typoP = p => 100 * feats(p).typoN / Math.max(1, feats(p).n);
    if (scope === "me"){
      const others = Ev && Ev.n > meL.length;
      document.getElementById("c1t").textContent = "Speed, round by round"; document.getElementById("c2t").textContent = "Typo rate, round by round";
      document.getElementById("c1n").textContent = "Words per minute in each of your rounds."; document.getElementById("c2n").textContent = "Typos as a share of letters typed, each round.";
      lineChart("c1", meL.map(p => feats(p).wpm), others ? Ev.wpm : null, "wpm", 0);
      lineChart("c2", meL.map(typoP), others ? Ev.typoPct : null, "%", 1);
      const lg = `<span><i style="background:#fff;height:2px;vertical-align:3px"></i>you</span>` + (others ? `<span><i class="dash"></i>everyone's average</span>` : "");
      document.getElementById("c1l").innerHTML = lg; document.getElementById("c2l").innerHTML = lg;
    } else {
      document.getElementById("c1t").textContent = "How fast everyone types"; document.getElementById("c2t").textContent = "How often everyone makes typos";
      document.getElementById("c1n").textContent = "Every round sorted by speed. Your rounds are the white part of each bar."; document.getElementById("c2n").textContent = "Every round sorted by typo rate. Your rounds are the white part of each bar.";
      histChart("c1", all.map(p => feats(p).wpm), meL.map(p => feats(p).wpm), "wpm", 0);
      histChart("c2", all.map(typoP), meL.map(typoP), "%", 1);
      const lg = `<span><i style="background:#fff"></i>your rounds</span><span><i style="background:rgba(255,255,255,.4)"></i>everyone else</span>`;
      document.getElementById("c1l").innerHTML = lg; document.getElementById("c2l").innerHTML = lg;
    }
  }
  function renderArchive(){
    const extra = trials.filter(t => t && !mine.some(m => m.key === t.key));   // finished this visit but not added yet still count
    const meL = [...mine, ...extra].sort((a, b) => a.at - b.at), all = meL, list = meL;
    const S = summarize(list), Me = summarize(meL), Ev = summarize(all), other = scope === "me" ? Ev : Me, otherName = scope === "me" ? "everyone" : "you";
    document.getElementById("statsTitle").textContent = scope === "me" ? "Your stats" : "Everyone's stats";
    document.getElementById("archInfo").textContent = !S ? (scope === "me" ? "No rounds saved yet. Finish a text and add it to the collection." : "No rounds saved yet.")
      : scope === "me" ? `Averages across your ${S.n} ${S.n === 1 ? "round" : "rounds"}, since ${dateStr(S.first)}${extra.length ? ` (${extra.length} from this visit not added to the collection yet)` : ""}` : `Averages across ${S.n} ${S.n === 1 ? "round" : "rounds"} from ${S.people} ${S.people === 1 ? "person" : "people"}`;
    drawAllRings(document.getElementById("ringsCv"), list);
    document.getElementById("ringsCap").textContent = S ? `${S.n} ${S.n === 1 ? "ring" : "rings"} · newest outside` : "no rings yet";
    const show = other && !(scope === "all" && !Me) && !(scope === "me" && Ev && Ev.n === (Me ? Me.n : 0));
    const T = [
      ["rounds played", s => s.n, 0, ""],
      ["average speed", s => s.wpm, 0, "wpm"],
      ["best speed", s => s.best, 0, "wpm"],
      ["accuracy", s => s.acc, 0, "%"],
    ];
    const fmt = (v, d) => v == null || !isFinite(v) ? "–" : v.toFixed(d);
    const bothMe = scope === "me" ? S : Me, bothEv = scope === "me" ? Ev : S;
    document.getElementById("tiles").innerHTML = T.map(([lab, fn, d, unit]) => {
      const v = S ? fn(S) : null, ov = show && other ? fn(other) : null, hasU = v != null && unit;
      const cmp = ov != null ? `<div class="cmp">${otherName}: ${esc(fmt(ov, d))}${unit ? " " + esc(unit) : ""}</div>` : "";
      let bars = "";
      const vm = bothMe ? fn(bothMe) : null, ve = bothEv ? fn(bothEv) : null;
      if (vm != null && ve != null && show){
        const mx = Math.max(vm, ve) * 1.1 || 1;
        bars = `<div class="mb"><span class="tr"><span class="b me" style="width:${(100 * vm / mx).toFixed(1)}%"></span></span><em>you</em></div>` +
               `<div class="mb"><span class="tr"><span class="b ev" style="width:${(100 * ve / mx).toFixed(1)}%"></span></span><em>everyone</em></div>`;
      }
      return `<div class="tile"><div class="lab">${esc(lab)}</div><div class="val">${esc(fmt(v, d))}${hasU ? `<small>${esc(unit)}</small>` : ""}</div>${cmp}${bars}</div>`;
    }).join("");
    renderCharts(list, meL, all, S, Ev);
    const typeLine = s => ["steady", "bursty", "careful"].filter(t => s.types[t]).map(t => `${t} ${s.types[t]}`).join(" · ");
    const H = !S ? [] : [
      ["rhythm type", Object.keys(S.types).length === 1 ? `${Object.keys(S.types)[0]} (${S.n === 1 ? "the only round" : "all " + S.n + " rounds"})` : `${Object.keys(S.types).sort((a, b) => S.types[b] - S.types[a])[0]} most often (${typeLine(S)})`],
      ["most common typo", S.topKind ? `${TYPO_NAMES[S.topKind]} (${S.kinds[S.topKind]} of ${Object.values(S.kinds).reduce((a, b) => a + b, 0)})` : "no typos yet"],
      ["shift hand", S.sl + S.sr ? (S.sl > S.sr * 1.5 ? "left" : S.sr > S.sl * 1.5 ? "right" : "both") + ` (${S.sl} left · ${S.sr} right)` : "shift not used"],
      ["over a round", Math.abs(S.drift) < .06 ? "stays steady from start to end" : S.drift < 0 ? `speeds up ${Math.round(-S.drift * 100)}% on average` : `slows down ${Math.round(S.drift * 100)}% on average`],
      ["fastest letter pair", S.fastPair ? `"${S.fastPair}", ${Math.round(S.pm[S.fastPair])} ms` : "not enough rounds yet"],
      ["slowest letter pair", S.slowPair ? `"${S.slowPair}", ${Math.round(S.pm[S.slowPair])} ms` : "not enough rounds yet"],
    ];
    document.getElementById("habits").innerHTML = H.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
    document.getElementById("habitsSec").hidden = !S;
  }

  // full history: every round as data, sorted by time and by typeface
  const histEl = document.getElementById("hist"), histTf = document.getElementById("histTf");
  const histRounds = () => allRounds().filter(p => histTf.value === "all" || tfKey(p) === histTf.value).sort((a, b) => a.at - b.at);
  function openHist(){ stopReplay(); histTf.value = "all"; histEl.hidden = false; histEl.scrollTop = 0; renderHist(); document.getElementById("histClose").focus(); }
  function closeHist(){ histEl.hidden = true; }
  document.getElementById("histBtn").onclick = openHist;
  document.getElementById("histClose").onclick = closeHist;
  histTf.addEventListener("change", () => { histTf.classList.toggle("chosen", histTf.value !== "all"); renderHist(); });
  addEventListener("resize", () => { if (!histEl.hidden) renderHist(); });
  const movAvg = (a, k) => a.map((_, i) => { const s = a.slice(Math.max(0, i - k + 1), i + 1); return mean(s); });
  // rounds over time: a dot per round, a running average, and (for speed) your best so far
  function timeChart(id, vals, o){
    const { P, w, h } = setupCanvas(document.getElementById(id)), n = vals.length;
    const ymax = o.max || Math.max(1e-6, ...vals) * 1.15, ax = axes(P, w, h, ymax, o.unit === "%" ? "%" : "", 46, 34);
    const xAt = i => ax.L + (n <= 1 ? ax.pw / 2 : i / (n - 1) * ax.pw);
    P.fillStyle = "rgba(255,255,255,.45)"; P.textAlign = "center"; P.textBaseline = "top"; P.font = `400 11px ${FONT}`;
    const ticks = n <= 1 ? [0] : [...new Set(Array.from({ length: 6 }, (_, k) => Math.round(k * (n - 1) / 5)))];
    ticks.forEach(i => P.fillText(String(i + 1), xAt(i), ax.T + ax.ph + 8));
    P.fillText("round", ax.L + ax.pw / 2, ax.T + ax.ph + 21);
    if (o.best && n){
      let b = 0; P.strokeStyle = "rgba(255,255,255,.3)"; P.lineWidth = 1.5; P.beginPath();
      vals.forEach((v, i) => { const nb = Math.max(b, v); if (!i) P.moveTo(xAt(i), ax.y(nb)); else { P.lineTo(xAt(i), ax.y(b)); P.lineTo(xAt(i), ax.y(nb)); } b = nb; });
      P.stroke();
    }
    for (let i = 0; i < n; i++){ P.fillStyle = "rgba(255,255,255,.38)"; P.beginPath(); P.arc(xAt(i), ax.y(vals[i]), 3.2, 0, Math.PI * 2); P.fill(); }
    if (n > 1){ const av = movAvg(vals, Math.min(10, Math.max(2, Math.round(n / 4)))); P.strokeStyle = "#fff"; P.lineWidth = 2; P.lineJoin = "round"; P.beginPath(); av.forEach((v, i) => i ? P.lineTo(xAt(i), ax.y(v)) : P.moveTo(xAt(i), ax.y(v))); P.stroke(); }
    hoverable(id, vals.map((v, i) => ({ x: xAt(i), y: ax.y(v), v, i })), q => `round ${q.i + 1} · ${o.fmt(q.v)}`);
  }
  // speed by typeface: one row per typeface, cells shaded by how many rounds landed in each 10 wpm band
  // speed by typeface: one row per typeface, cells shaded by how many rounds landed in each 10 wpm band
  function fontHeat(id, list){
    const cv = document.getElementById(id), keys = Object.keys(TYPEFACES), pitch = 84, rowH = 30, L = 120, Rm = 48, top = 6;
    cv.style.height = (top + (keys.length - 1) * pitch + rowH + 44) + "px";
    const { P, w } = setupCanvas(cv);
    const sp = list.map(p => feats(p).wpm), maxW = Math.max(100, Math.ceil(Math.max(0, ...sp) / 10) * 10), bins = maxW / 10, cw = (w - L - Rm) / bins;
    const grid = keys.map(k => { const c = Array(bins).fill(0), ws = list.filter(p => tfKey(p) === k).map(p => feats(p).wpm); ws.forEach(v => c[Math.min(bins - 1, Math.floor(v / 10))]++); return { k, c, ws }; });
    const mx = Math.max(1, ...grid.flatMap(g => g.c)), pts = [];
    P.textBaseline = "middle";
    grid.forEach((g, r) => {
      const y = top + r * pitch;
      P.fillStyle = "rgba(255,255,255,.92)"; P.textAlign = "left"; P.font = `400 12px ${FONT}`; P.fillText(tfName(g.k), 0, y + rowH / 2);
      for (let b = 0; b < bins; b++){
        const x = L + b * cw + 1, v = g.c[b];
        P.fillStyle = v ? `rgba(255,255,255,${(.14 + .8 * v / mx).toFixed(3)})` : "rgba(255,255,255,.045)"; P.fillRect(x, y, Math.max(1, cw - 2), rowH);
        if (v) pts.push({ x: x + cw / 2, y, box: [x, y, cw - 2, rowH], lab: `${tfName(g.k)} · ${b * 10}–${b * 10 + 10} wpm · ${v} ${v === 1 ? "round" : "rounds"}` });
      }
      P.font = `400 11px ${FONT}`;
      if (g.ws.length){
        const lo = Math.min(...g.ws), hi = Math.max(...g.ws);
        P.fillStyle = "rgba(255,255,255,.92)"; P.textAlign = "right"; P.fillText(String(lo), L + Math.floor(lo / 10) * cw - 5, y + rowH / 2);
        P.textAlign = "left"; P.fillText(String(hi), L + Math.min(bins, Math.floor(hi / 10) + 1) * cw + 5, y + rowH / 2);
      } else { P.fillStyle = "rgba(255,255,255,.35)"; P.textAlign = "left"; P.fillText("no rounds yet", L + 8, y + rowH / 2); }
    });
    const ay = top + (keys.length - 1) * pitch + rowH + 16;
    P.fillStyle = "rgba(255,255,255,.45)"; P.textAlign = "center"; P.font = `400 11px ${FONT}`;
    for (let b = 0; b <= bins; b += bins > 12 ? 2 : 1) P.fillText(String(b * 10), L + b * cw, ay);
    P.fillText("words per minute", L + (w - L - Rm) / 2, ay + 18);
    hoverable(id, pts, q => q.lab);
    document.getElementById("heatLegend").innerHTML = `<span>1 round</span><span class="ramp"></span><span>${mx} ${mx === 1 ? "round" : "rounds"}</span><span>numbers at each end: your slowest and fastest round</span>`;
  }
  // per-keystroke speed of one round, in wpm (a word = 5 keys)
  function keySpeeds(p){ const F = feats(p); return F.gaps.slice(1).filter(g => g > 15 && g < 3000).map(g => 12000 / g); }
  function renderHist(){
    const list = histRounds(), F = list.map(feats), n = list.length;
    document.getElementById("histEmpty").hidden = !!n; document.getElementById("hGridAll").hidden = !n;
    const name = (document.getElementById("whoName").textContent || "You").trim().split(/\s+/)[0];
    document.getElementById("hFirst").textContent = name.toUpperCase();
    document.getElementById("hSince").textContent = n ? "Since " + dateStr(list[0].at) : "";
    if (!n) return;
    const best = Math.max(...F.map(f => f.wpm)), chars = F.reduce((a, f) => a + f.n, 0), ty = F.reduce((a, f) => a + f.typoN, 0);
    document.getElementById("hCount").textContent = n;
    document.getElementById("hStats").innerHTML =
      `<div class="hs"><span>Best Speed</span><b>${best}<small>wpm</small></b></div>` +
      `<div class="hs"><span>Average Speed</span><b>${Math.round(mean(F.map(f => f.wpm)))}<small>wpm</small></b></div>` +
      `<div class="hs"><span>Accuracy</span><b>${Math.round(100 * (1 - ty / Math.max(1, chars + ty)))}%</b></div>` +
      `<div class="hs"><span>Time Played</span><b>${hms(F.reduce((a, f) => a + f.dur, 0))}</b></div>`;
    drawBars(list);
  }
  // like the Olympians age chart: one row per round, grouped by typeface, shaded by where its key speeds fall
  // one strip per typeface, all on the same axes: a dot per round, right = faster, up = more accurate; the ring is the typeface's average
  const roundAcc = p => typeof p.accuracy === "number" ? p.accuracy : Math.max(0, Math.round(100 * (1 - feats(p).typoRate)));
  // two bars per typeface on one 0–100 scale: speed (wpm) and accuracy (%)
  function drawBars(list){
    const el = document.getElementById("hBars");
    el.innerHTML = `<div class="hb-scale"><span></span><div><i style="left:0">0</i><i style="left:50%">50</i><i style="left:100%">100</i></div></div>` +
      Object.keys(TYPEFACES).map(k => {
        const ps = list.filter(p => tfKey(p) === k), sp = ps.length ? mean(ps.map(p => feats(p).wpm)) : null, ac = ps.length ? mean(ps.map(roundAcc)) : null;
        const bar = (v, unit) => `<div class="hb-row"><div class="hb-track">${v == null ? "" : `<div class="hb-fill" style="width:${clamp(v, 0, 100).toFixed(1)}%"></div>`}</div><b>${v == null ? "–" : Math.round(v) + unit}</b></div>`;
        return `<div class="hb${ps.length ? "" : " none"}"><span class="hb-name" style="font-family:${tfCss(k).replace(/"/g, "'")}">${tfName(k)}</span><div>${bar(sp, " wpm")}${bar(ac, "%")}</div></div>`;
      }).join("");
  }
  function drawViz(list){
    const cv = document.getElementById("hViz"), keys = Object.keys(TYPEFACES);
    const NAMEW = 170, top = 8, rowH = 78, gap = 26, R = 64;
    cv.style.height = (top + keys.length * (rowH + gap) + 26) + "px";
    const { P, w } = setupCanvas(cv), x0 = NAMEW + 28, x1 = w - R;
    const all = list.map(p => ({ p, k: tfKey(p), v: feats(p).wpm, a: roundAcc(p) }));
    const maxW = Math.max(60, Math.ceil(Math.max(0, ...all.map(d => d.v)) * 1.08 / 20) * 20);
    const loA = Math.min(90, Math.floor(Math.min(100, ...all.map(d => d.a)) / 5) * 5 - 5);
    const X = v => x0 + v / maxW * (x1 - x0), Y = (a, y) => y + rowH - (a - loA) / (100 - loA) * rowH;
    const pts = [];
    keys.forEach((k, r) => {
      const y = top + r * (rowH + gap), ds = all.filter(d => d.k === k);
      P.fillStyle = ds.length ? "#fff" : "rgba(255,255,255,.35)"; P.textAlign = "left"; P.textBaseline = "middle";
      P.font = `400 ${k === "bytesized" ? 22 : k === "altesse" ? 30 : 27}px ${tfCss(k)}`; P.fillText(tfName(k), 0, y + rowH / 2, NAMEW - 10);
      // the strip: hairlines at 100% and at the lowest accuracy, tiny labels on the left
      P.strokeStyle = "rgba(255,255,255,.12)"; P.lineWidth = 1;
      [y + .5, y + rowH + .5].forEach(yy => { P.beginPath(); P.moveTo(x0, Math.round(yy) + .5); P.lineTo(x1, Math.round(yy) + .5); P.stroke(); });
      P.font = `400 9px ${FONT}`; P.fillStyle = "rgba(255,255,255,.4)"; P.textAlign = "right";
      P.fillText("100%", x0 - 6, y); P.fillText(loA + "%", x0 - 6, y + rowH);
      if (!ds.length){ P.textAlign = "left"; P.font = `400 11px ${FONT}`; P.fillStyle = "rgba(255,255,255,.3)"; P.fillText("no rounds yet", x0 + 8, y + rowH / 2); return; }
      for (const d of ds){
        const px = X(d.v), py = Y(d.a, y);
        P.fillStyle = "rgba(255,255,255,.72)"; P.beginPath(); P.arc(px, py, 3.6, 0, Math.PI * 2); P.fill();
        pts.push({ x: px, y: py, lab: `${tfName(k)} · ${dateStr(d.p.at)} · ${d.v} wpm · ${d.a}% accuracy` });
      }
      const av = mean(ds.map(d => d.v)), aa = mean(ds.map(d => d.a)), ax = X(av), ay = Y(aa, y);
      P.strokeStyle = "rgba(255,255,255,.18)"; P.setLineDash([2, 3]);
      P.beginPath(); P.moveTo(ax, y); P.lineTo(ax, y + rowH); P.stroke(); P.setLineDash([]);
      P.strokeStyle = "#fff"; P.lineWidth = 1.4; P.beginPath(); P.arc(ax, ay, 8, 0, Math.PI * 2); P.stroke();
      P.fillStyle = "#fff"; P.font = `400 12px ${FONT}`; P.textAlign = "left"; P.textBaseline = "middle";
      P.fillText(`${Math.round(av)}`, x1 + 12, y + rowH / 2 - 8); P.fillStyle = "rgba(255,255,255,.55)"; P.font = `400 10px ${FONT}`;
      P.fillText(`wpm · ${Math.round(aa)}%`, x1 + 12, y + rowH / 2 + 8);
      pts.push({ x: ax, y: ay, lab: `${tfName(k)} average · ${Math.round(av)} wpm · ${Math.round(aa)}% accuracy · ${ds.length} ${ds.length === 1 ? "round" : "rounds"}` });
    });
    // shared speed axis under the strips
    const ay = top + keys.length * (rowH + gap) - gap + 18, st = niceStep(maxW, 6);
    P.font = `400 10px ${FONT}`; P.fillStyle = "rgba(255,255,255,.5)"; P.textAlign = "center"; P.textBaseline = "middle";
    for (let v = 0; v <= maxW; v += st) P.fillText(String(v), X(v), ay);
    P.textAlign = "right"; P.fillText("WPM", x0 - 20, ay);
    hoverable("hViz", pts, q => q.lab);
  }


  // Optional Claude account, storage, and downloads
  (async () => {
    if (!window.claude?.use){ dlBtn.hidden = true; return; }
    const [d, u, dl] = await Promise.all([claude.use("db"), claude.use("user"), claude.use("downloads")]);
    downloads = dl; if (!dl) dlBtn.hidden = true;
    uid = u ? await u.id() : null;
    if (u){ try { const me = await u.me(); if (me && me.name) document.getElementById("whoName").textContent = me.name;
      if (me && me.avatarUrl){ const im = document.getElementById("avatar"); im.src = me.avatarUrl; im.hidden = false; document.getElementById("avatarBlank").hidden = true; } } catch (e) {} }
    if (!d || !uid) return;
    db = d;
    db.collection("patterns").limit(1000).onSnapshot(snap => {
      const out = [];
      for (const doc of snap.docs){
        if (doc.id === uid){
          // your own saved rounds live here too: merge them in, so stats and rings work even when this browser has no local copy
          const dd = doc.data() || {}, own = dd.items;
          if (+dd.started > counts.started || +dd.finished > counts.finished){ counts.started = Math.max(counts.started, +dd.started || 0); counts.finished = Math.max(counts.finished, +dd.finished || 0); saveCounts(); }
          if (dd.by && typeof dd.by === "object"){ counts.by = counts.by || {}; for (const k in dd.by){ if (!/^[a-z]{1,20}$/.test(k)) continue; const a = counts.by[k] || { started: 0, finished: 0 }, b = dd.by[k] || {}; counts.by[k] = { started: Math.max(a.started, +b.started || 0), finished: Math.max(a.finished, +b.finished || 0) }; } saveCounts(); }
          if (Array.isArray(own)){
            const have = new Set(mine.map(p => p.key)); let added = false;
            for (const p of own) if (p && typeof p.ev === "string" && typeof p.at === "number"){ const q = prep(p, true); if (q && !have.has(q.key)){ q.saved = true; mine.push(q); have.add(q.key); added = true; } }
            if (added){ mine.sort((a, b) => a.at - b.at); saveLocal(); }
          }
          continue;
        }
      }
      renderData();
      if (!views.col.hidden) buildPrint();
      if (!views.arch.hidden) renderArchive();
    }, () => {});
})();


  // Startup
  resize(); renderData(); typer.focus();
  requestAnimationFrame(loop);
})();
