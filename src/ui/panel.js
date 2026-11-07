// Kontrol paneli + bilimsel bilgi + performans göstergesi.
import { h, icon, ICONS } from './dom.js';
import { S } from './strings.js';
import { fixed, sig, sci, percent, signed } from './format.js';
import { PRESETS } from './presets.js';
import { computeInfo, INFO_ROWS, physicalUnits } from './info.js';
import { rMinFor, R_MAX_UI } from './camera.js';
import { REFERENCE_MASSES } from '../physics/units.js';

const DEG = Math.PI / 180;
const km = (x) => {
  if (!Number.isFinite(x)) return '—';
  const ax = Math.abs(x);
  return ax >= 1e7 || (ax < 1e-2 && ax > 0) ? `${sci(x, 2)} km` : `${sig(x, 4)} km`;
};

/** Log kaydırıcı eşlemesi: konum 0…1000 ↔ değer min…max. */
const logMap = (min, max) => ({
  min: 0,
  max: 1000,
  step: 1,
  fromValue: (v) => (1000 * Math.log(v / min)) / Math.log(max / min),
  toValue: (s) => min * Math.pow(max / min, s / 1000),
});

// ------------------------------------------------------------------ kontrol tanımları
// kind: range | toggle | seg. get(p) → kaydırıcı/anahtar değeri; patch(sv, p) → renderer yaması.
const SECTIONS = [
  {
    id: 'bh',
    controls: [
      {
        key: 'a', kind: 'range', badge: 'phys', min: 0, max: 0.998, step: 0.001,
        get: (p) => p.a, patch: (v) => ({ a: v }), fmt: (v) => fixed(v, 3),
      },
      {
        key: 'prograde', kind: 'seg', badge: 'phys',
        options: [['true', true], ['false', false]],
        get: (p) => p.prograde, patch: (v) => ({ prograde: v }),
      },
    ],
  },
  {
    id: 'camera',
    controls: [
      {
        key: 'thetaCam', kind: 'range', badge: 'view', min: 1, max: 179, step: 0.5,
        get: (p) => p.thetaCam / DEG, patch: (v) => ({ thetaCam: v * DEG }), fmt: (v) => `${fixed(v, 1)}°`,
      },
      {
        key: 'phiCam', kind: 'range', badge: 'view', min: 0, max: 360, step: 1,
        get: (p) => ((((p.phiCam / DEG) % 360) + 360) % 360), patch: (v) => ({ phiCam: v * DEG }), fmt: (v) => `${fixed(v, 0)}°`,
      },
      {
        key: 'rCam', kind: 'range', badge: 'view', dyn: (p) => logMap(rMinFor(p.a), R_MAX_UI), step: 1,
        get: (p, m) => m.fromValue(Math.min(R_MAX_UI, Math.max(rMinFor(p.a), p.rCam))),
        patch: (v, p, m) => ({ rCam: m.toValue(v) }),
        fmt: (v, p, ctx, m) => {
          const r = m.toValue(v);
          return ctx.units ? `${sig(r, 3)} M · ${km(r * ctx.units.lengthKm)}` : `${sig(r, 3)} M`;
        },
      },
      {
        key: 'fovY', kind: 'range', badge: 'view', min: 10, max: 90, step: 1,
        get: (p) => p.fovY, patch: (v) => ({ fovY: v }), fmt: (v) => `${fixed(v, 0)}°`,
      },
    ],
  },
  {
    id: 'disk',
    controls: [
      { key: 'disk', kind: 'toggle', badge: 'phys', get: (p) => p.disk, patch: (v) => ({ disk: v }) },
      {
        key: 'Tmax', kind: 'range', badge: 'phys', map: logMap(2000, 1e6), enabled: (p) => p.disk,
        get: (p, m) => m.fromValue(p.Tmax), patch: (v, p, m) => ({ Tmax: m.toValue(v) }),
        fmt: (v, p, ctx, m) => `${sig(m.toValue(v), 3)} K`,
      },
      {
        key: 'diskOut', kind: 'range', badge: 'phys', min: 10, max: 100, step: 1, enabled: (p) => p.disk,
        get: (p) => p.diskOut, patch: (v) => ({ diskOut: v }),
        fmt: (v, p, ctx) => (ctx.units ? `${fixed(v, 0)} M · ${km(v * ctx.units.lengthKm)}` : `${fixed(v, 0)} M`),
      },
      {
        key: 'diskEdgeFade', kind: 'range', badge: 'aest', min: 0, max: 0.5, step: 0.01, enabled: (p) => p.disk,
        get: (p) => p.diskEdgeFade, patch: (v) => ({ diskEdgeFade: v }), fmt: (v) => fixed(v, 2),
      },
      {
        key: 'fCol', kind: 'range', badge: 'phys', min: 1, max: 3, step: 0.05, enabled: (p) => p.disk,
        get: (p) => p.fCol, patch: (v) => ({ fCol: v }), fmt: (v) => fixed(v, 2),
      },
      {
        key: 'brightnessMode', kind: 'seg', badge: 'phys', enabled: (p) => p.disk,
        options: [['band', 'band'], ['bolometric', 'bolometric']],
        get: (p) => p.brightnessMode, patch: (v) => ({ brightnessMode: v }),
      },
    ],
  },
  {
    id: 'image',
    controls: [
      {
        key: 'exposure', kind: 'range', badge: 'view', min: -6, max: 6, step: 0.1,
        get: (p) => Math.log2(p.exposure), patch: (v) => ({ exposure: Math.pow(2, v) }),
        fmt: (v) => `${signed(v, 1)} EV`,
      },
      {
        key: 'tonemap', kind: 'seg', badge: 'aest',
        options: [['aces', 'aces'], ['agx', 'agx'], ['neutral', 'neutral'], ['none', 'none']],
        get: (p) => p.tonemap, patch: (v) => ({ tonemap: v }),
      },
      { key: 'bloom', kind: 'toggle', badge: 'aest', get: (p) => p.bloom, patch: (v) => ({ bloom: v }) },
      {
        key: 'bloomStrength', kind: 'range', badge: 'aest', min: 0, max: 2, step: 0.05, enabled: (p) => p.bloom,
        get: (p) => p.bloomStrength, patch: (v) => ({ bloomStrength: v }), fmt: (v) => fixed(v, 2),
      },
      { key: 'turbulence', kind: 'toggle', badge: 'aest', get: (p) => p.turbulence, patch: (v) => ({ turbulence: v }) },
      {
        key: 'turbulenceAmp', kind: 'range', badge: 'aest', min: 0, max: 1, step: 0.05, enabled: (p) => p.turbulence,
        get: (p) => p.turbulenceAmp, patch: (v) => ({ turbulenceAmp: v }), fmt: (v) => fixed(v, 2),
      },
      { key: 'stars', kind: 'toggle', badge: 'aest', get: (p) => p.stars, patch: (v) => ({ stars: v }) },
      {
        key: 'milkyWay', kind: 'range', badge: 'aest', min: 0, max: 2, step: 0.05,
        get: (p) => p.milkyWay, patch: (v) => ({ milkyWay: v }), fmt: (v) => fixed(v, 2),
      },
      { key: 'animate', kind: 'toggle', badge: 'aest', get: (p) => p.animate, patch: (v) => ({ animate: v }) },
      {
        key: 'timeScale', kind: 'range', badge: 'aest', min: 0, max: 200, step: 1, enabled: (p) => p.animate,
        get: (p) => p.timeScale, patch: (v) => ({ timeScale: v }),
        fmt: (v, p, ctx) => (ctx.units ? `${fixed(v, 0)} M/s · ${sig(v * ctx.units.timeS * 1e3, 3)} ms/s` : `${fixed(v, 0)} M/s`),
      },
    ],
  },
  {
    id: 'perf',
    controls: [
      {
        key: 'performance', kind: 'seg', badge: 'view',
        options: [['quality', 'quality'], ['balanced', 'balanced'], ['battery', 'battery']],
        get: (p) => p.performance, patch: (v) => ({ performance: v }),
      },
      {
        key: 'quality', kind: 'seg', badge: 'view',
        options: [['high', 'high'], ['mobile', 'mobile']],
        get: (p) => p.quality, patch: (v) => ({ quality: v }),
      },
      {
        key: 'resolutionScale', kind: 'range', badge: 'view', min: 0.25, max: 1, step: 0.05,
        get: (p) => p.resolutionScale, patch: (v) => ({ resolutionScale: v }), fmt: (v) => `%${fixed(v * 100, 0)}`,
      },
    ],
  },
];

// ------------------------------------------------------------------ panel
/**
 * @param {object} ctx {renderer, set(patch), getMass(), setMass(v), onClose(), onResetAll()}
 */
export function createPanel(ctx) {
  const { renderer } = ctx;
  const refreshers = []; // her biri (p, state) ile çağrılır
  const idPrefix = 'ui';

  const badge = (kind) =>
    h('span', { class: `badge ${kind}`, title: S.badgeTip[kind] }, S.badge[kind]);

  // ---- kontrol oluşturucular
  function controlHead(def, outEl, forId) {
    const txt = S.controls[def.key];
    const tipId = `${idPrefix}-tip-${def.key}`;
    const tip = h('p.ctl-tip', { id: tipId, hidden: true }, txt.tip);
    const help = h(
      'button.ctl-help',
      {
        type: 'button', 'aria-label': `${txt.label}: ${S.panel.help}`, 'aria-expanded': 'false', 'aria-controls': tipId,
        onClick: (e) => {
          const open = tip.hidden;
          tip.hidden = !open;
          e.currentTarget.setAttribute('aria-expanded', String(open));
        },
      },
      '?'
    );
    const head = h(
      'div.ctl-head',
      null,
      forId ? h('label.ctl-label', { for: forId }, txt.label) : h('span.ctl-label', null, txt.label),
      badge(def.badge),
      outEl,
      help
    );
    return { head, tip };
  }

  function buildRange(def) {
    const id = `${idPrefix}-${def.key}`;
    const map = def.map;
    const input = h('input', { type: 'range', id, min: def.min ?? 0, max: def.max ?? 1000, step: def.step ?? 1, 'data-key': def.key });
    const out = h('output.ctl-val', { for: id });
    const { head, tip } = controlHead(def, out, id);
    const wrap = h('div.ctl', { 'data-ctl': def.key }, head, input, tip);
    let dynMap = map;
    let userT = 0;

    const text = (sv, p) => def.fmt(sv, p, { units: physicalUnits(ctx.getMass()) }, dynMap);
    const paint = () => {
      const lo = Number(input.min), hi = Number(input.max);
      input.style.setProperty('--pct', `${(100 * (Number(input.value) - lo)) / (hi - lo || 1)}%`);
    };
    input.addEventListener('input', () => {
      userT = performance.now();
      const p = renderer.getParams();
      const sv = Number(input.value);
      ctx.set(def.patch(sv, p, dynMap));
      out.textContent = text(sv, p);
      input.setAttribute('aria-valuetext', out.textContent);
      paint();
    });
    refreshers.push((p) => {
      if (def.dyn) {
        dynMap = def.dyn(p);
        input.min = dynMap.min; input.max = dynMap.max; input.step = dynMap.step;
      }
      const sv = def.get(p, dynMap);
      const busy = document.activeElement === input && performance.now() - userT < 600;
      if (!busy) {
        input.value = String(sv);
      }
      out.textContent = text(busy ? Number(input.value) : sv, p);
      input.setAttribute('aria-valuetext', out.textContent);
      input.disabled = def.enabled ? !def.enabled(p) : false;
      wrap.classList.toggle('disabled', input.disabled);
      paint();
    });
    return wrap;
  }

  function buildToggle(def) {
    const id = `${idPrefix}-${def.key}`;
    const txt = S.controls[def.key];
    const input = h('input', { type: 'checkbox', role: 'switch', id, 'data-key': def.key });
    const tipId = `${idPrefix}-tip-${def.key}`;
    const tip = h('p.ctl-tip', { id: tipId, hidden: true }, txt.tip);
    const help = h('button.ctl-help', {
      type: 'button', 'aria-label': `${txt.label}: ${S.panel.help}`, 'aria-expanded': 'false', 'aria-controls': tipId,
      onClick: (e) => {
        const open = tip.hidden;
        tip.hidden = !open;
        e.currentTarget.setAttribute('aria-expanded', String(open));
      },
    }, '?');
    const row = h(
      'div.ctl.ctl-toggle',
      { 'data-ctl': def.key },
      h('div.ctl-head', null,
        h('label.switch', { for: id }, input, h('span.track', null, h('span.knob')), h('span.ctl-label', null, txt.label)),
        badge(def.badge), help),
      tip
    );
    input.addEventListener('change', () => ctx.set(def.patch(input.checked, renderer.getParams())));
    refreshers.push((p) => { input.checked = !!def.get(p); });
    return row;
  }

  function buildSeg(def) {
    const txt = S.controls[def.key];
    const name = `${idPrefix}-${def.key}`;
    const tipId = `${idPrefix}-tip-${def.key}`;
    const tip = h('p.ctl-tip', { id: tipId, hidden: true }, txt.tip);
    const help = h('button.ctl-help', {
      type: 'button', 'aria-label': `${txt.label}: ${S.panel.help}`, 'aria-expanded': 'false', 'aria-controls': tipId,
      onClick: (e) => {
        const open = tip.hidden;
        tip.hidden = !open;
        e.currentTarget.setAttribute('aria-expanded', String(open));
      },
    }, '?');
    const inputs = def.options.map(([optKey, value]) => {
      const id = `${name}-${optKey}`;
      const input = h('input', { type: 'radio', name, id, value: optKey, 'data-key': def.key });
      input.addEventListener('change', () => { if (input.checked) ctx.set(def.patch(value, renderer.getParams())); });
      return { input, label: h('label', { for: id }, txt.options[optKey]), value };
    });
    const group = h('div.seg', null, ...inputs.flatMap(({ input, label }) => [input, label]));
    const fs = h(
      'fieldset.ctl.ctl-seg',
      { 'data-ctl': def.key, 'aria-describedby': tipId },
      h('legend', null, h('span.ctl-label', null, txt.label), badge(def.badge), help),
      group,
      tip
    );
    refreshers.push((p) => {
      const cur = def.get(p);
      for (const { input, value } of inputs) input.checked = value === cur;
      const dis = def.enabled ? !def.enabled(p) : false;
      fs.disabled = dis;
      fs.classList.toggle('disabled', dis);
    });
    return fs;
  }

  const build = (def) => (def.kind === 'range' ? buildRange(def) : def.kind === 'toggle' ? buildToggle(def) : buildSeg(def));

  function section(id, title, bodyNodes, { open = true, cls = '' } = {}) {
    const d = h('details', { class: `sec ${cls}`, 'data-sec': id }, h('summary', null, h('span.sec-title', null, title), icon(...ICONS.chevron)), h('div.sec-body', null, ...bodyNodes));
    d.open = open;
    return d;
  }

  // ---- hazır ayarlar
  const presetBtns = PRESETS.map((pr) =>
    h('button.btn.preset', { type: 'button', 'data-preset': pr.id, onClick: () => ctx.applyPreset(pr.patch) }, S.presets[pr.id])
  );

  // ---- bilgi bölümü
  const massInput = h('input', {
    type: 'number', id: `${idPrefix}-mass`, min: '0', step: 'any', inputmode: 'decimal',
    placeholder: S.info.massPlaceholder, 'aria-describedby': `${idPrefix}-mass-help`, autocomplete: 'off',
  });
  const massErr = h('p.mass-err', { hidden: true, role: 'alert' }, S.info.massInvalid);
  const unitsOut = h('p.units-out', { 'aria-live': 'polite' });
  const setMassFromInput = () => {
    const raw = massInput.value.trim();
    if (raw === '') { massInput.removeAttribute('aria-invalid'); massErr.hidden = true; ctx.setMass(null); return; }
    const v = Number(raw.replace(',', '.'));
    if (Number.isFinite(v) && v > 0) { massInput.removeAttribute('aria-invalid'); massErr.hidden = true; ctx.setMass(v); }
    else { massInput.setAttribute('aria-invalid', 'true'); massErr.hidden = false; ctx.setMass(null); }
  };
  massInput.addEventListener('input', setMassFromInput);
  const massPreset = (k, val) =>
    h('button.btn.chip', {
      type: 'button', title: S.info.massPresetTitle[k], 'data-mass': k,
      onClick: () => { massInput.value = String(val); setMassFromInput(); },
    }, S.info.massPresets[k]);

  const infoEls = {};
  const rowsNodes = INFO_ROWS.map((row, i) => {
    const t = S.info.rows[row.key];
    const detailId = `${idPrefix}-info-d-${row.key}`;
    const val = h('span.v', { 'data-value': '' });
    const unit = h('span.u');
    const kmEl = h('span.km');
    const detail = h('div.row-detail', { id: detailId, hidden: true }, h('p', null, t.desc), h('p.src', null, `Kaynak: ${t.src}`));
    const btn = h('button.row-label', {
      type: 'button', 'aria-expanded': 'false', 'aria-controls': detailId, title: t.desc,
      onClick: () => { const o = detail.hidden; detail.hidden = !o; btn.setAttribute('aria-expanded', String(o)); },
    }, h('span', null, t.label), icon(...ICONS.info));
    infoEls[row.key] = { val, unit, kmEl, row };
    return h('div.row', { 'data-info': row.key }, btn, h('span.row-val', null, h('span.vline', null, val, unit), kmEl), detail);
  });

  const infoSection = [
    h('p.note', null, S.info.intro),
    h('div.mass', null,
      h('label', { for: `${idPrefix}-mass` }, S.info.massLabel),
      h('div.mass-in', null, massInput, h('span.mass-unit', null, S.info.massUnit)),
      h('div.chips', null, massPreset('one', 10), massPreset('sgr', REFERENCE_MASSES.sgrAStar), massPreset('m87', REFERENCE_MASSES.m87Star)),
      h('p.note', { id: `${idPrefix}-mass-help` }, S.info.massHelp),
      massErr, unitsOut),
    h('div.rows', null, ...rowsNodes),
    h('p.note.small', null, S.info.shadowNote),
    h('p.note.small', null, S.info.shadowAngNote),
    h('p.note.small', null, S.info.docNote),
  ];

  let lastInfoKey = '';
  function refreshInfo(p) {
    const mass = ctx.getMass();
    const key = `${p.a}|${p.prograde}|${p.thetaCam.toFixed(5)}|${p.rCam.toFixed(4)}|${mass}`;
    if (key === lastInfoKey) return;
    lastInfoKey = key;
    const info = computeInfo(p);
    const u = physicalUnits(mass);
    unitsOut.textContent = u ? `${S.info.lengthUnit} = ${km(u.lengthKm)} · ${S.info.timeUnit} = ${sci(u.timeS, 3)} s` : '';
    for (const [k, { val, unit, kmEl, row }] of Object.entries(infoEls)) {
      const v = info[k];
      val.dataset.value = String(v);
      kmEl.textContent = '';
      if (!Number.isFinite(v)) { val.textContent = S.info.unavailable; unit.textContent = ''; continue; }
      if (row.kind === 'L') {
        val.textContent = sig(v, 4); unit.textContent = ` ${S.units.M}`;
        if (u) kmEl.textContent = `≈ ${km(v * u.lengthKm)}`;
      } else if (row.kind === 'A') {
        val.textContent = fixed((v * 180) / Math.PI, 2); unit.textContent = S.units.deg;
      } else if (row.kind === 'W') {
        val.textContent = sci(v, 3); unit.textContent = ` ${S.units.perM}`;
        if (u) kmEl.textContent = `≈ ${sci(v / u.timeS, 3)} ${S.units.rads}`;
      } else {
        val.textContent = percent(v, 2); unit.textContent = '';
      }
    }
  }

  // ---- performans göstergesi
  const statEls = {};
  const statRows = ['fps', 'trace', 'canvas', 'scale', 'accum', 'mode', 'hdr'].map((k) => {
    const dd = h('dd', { 'data-stat': k }, '—');
    statEls[k] = dd;
    return [h('dt', null, S.stats[k]), dd];
  });
  const statsBody = [h('dl.stats', null, ...statRows.flat())];
  let fpsLast = { t: performance.now(), f: renderer.getStats().frames };
  function refreshStats() {
    const st = renderer.getStats();
    const now = performance.now();
    const dt = (now - fpsLast.t) / 1000;
    const fps = dt > 0 ? (st.frames - fpsLast.f) / dt : 0;
    fpsLast = { t: now, f: st.frames };
    statEls.fps.textContent = `${fixed(fps, 0)} /s`;
    statEls.trace.textContent = `${st.traceWidth}×${st.traceHeight}`;
    statEls.canvas.textContent = `${st.width}×${st.height}`;
    statEls.scale.textContent = fixed(st.scale, 2);
    statEls.accum.textContent = String(st.accumCount);
    statEls.mode.textContent = st.interacting ? S.stats.interacting : st.animating ? S.stats.animating : S.stats.idle;
    statEls.hdr.textContent = st.hdr;
  }

  // ---- sayfaya dizilim
  const legend = h('div.legend', null, h('span.legend-t', null, S.panel.badgeLegend), badge('phys'), badge('aest'), badge('view'));
  const sections = SECTIONS.map((s) => section(s.id, S.sections[s.id], s.controls.map(build)));
  const presetSec = section('presets', S.sections.presets, [h('div.presets', null, ...presetBtns)]);
  const infoSec = section('info', S.sections.info, infoSection, { open: false, cls: 'sec-info' });
  const statsSec = section('stats', S.sections.stats, statsBody, { open: false, cls: 'sec-stats' });

  const closeBtn = h('button.icon-btn.panel-close', { type: 'button', 'aria-label': S.toolbar.panelClose, title: S.toolbar.panelClose, onClick: () => ctx.onClose() }, icon(...ICONS.close));
  const handle = h('div.sheet-handle', { 'aria-hidden': 'true' }, h('span'));
  const header = h('header.panel-head', null,
    handle,
    h('div.panel-titles', null, h('h1', null, S.appTitle), h('p', null, S.appSubtitle)),
    closeBtn);
  const footer = h('footer.panel-foot', null,
    h('button.btn.reset-all', { type: 'button', onClick: () => ctx.onResetAll() }, icon(...ICONS.reset), S.panel.resetAll));

  const el = h('aside#panel.panel', { 'aria-label': S.panel.label, 'data-no-camera-keys': '' },
    header,
    h('div.panel-scroll', { tabindex: '-1' }, legend, presetSec, ...sections, infoSec, statsSec, footer));

  let statsTimer = 0;
  function startStats() {
    stopStats();
    refreshStats();
    statsTimer = setInterval(() => { if (statsSec.open) refreshStats(); }, 500);
  }
  function stopStats() { if (statsTimer) clearInterval(statsTimer); statsTimer = 0; }
  statsSec.addEventListener('toggle', () => { if (statsSec.open) refreshStats(); });

  function refresh() {
    const p = renderer.getParams();
    for (const fn of refreshers) fn(p);
    refreshInfo(p);
  }

  return {
    el, closeBtn, header, refresh,
    startStats, stopStats,
    invalidateInfo: () => { lastInfoKey = ''; },
    setMassText: (v) => { massInput.value = v == null ? '' : String(v); },
  };
}
