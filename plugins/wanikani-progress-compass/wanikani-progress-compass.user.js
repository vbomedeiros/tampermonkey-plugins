// ==UserScript==
// @name         WaniKani Progress Compass
// @namespace    https://github.com/vbomedeiros/tampermonkey-plugins
// @version      1.0.3
// @description  Self-regulating dashboard: adaptive kanji quota keeps the vocab pipeline flowing, with level-up progress always front and center.
// @author       Victor Medeiros
// @match        https://www.wanikani.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=wanikani.com
// @grant        none
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/vbomedeiros/tampermonkey-plugins/main/plugins/wanikani-progress-compass/wanikani-progress-compass.user.js
// @downloadURL  https://raw.githubusercontent.com/vbomedeiros/tampermonkey-plugins/main/plugins/wanikani-progress-compass/wanikani-progress-compass.user.js
// ==/UserScript==

;(function () {
    'use strict';

    const SCRIPT_ID = 'wkpc';
    const BANNER_ID = 'wkpc-banner';
    const STYLE_ID  = 'wkpc-styles';

    const DEFAULTS = {
        vocab_daily_goal:   9,
        apprentice_ceiling: 110,
        kanji_min:          0,
        kanji_max:          5,
    };

    // SRS hours remaining to reach Guru from each Apprentice stage
    const TO_GURU_MS = {
        1: (4 + 8 + 23 + 47) * 3600000, // 82h
        2: (    8 + 23 + 47) * 3600000, // 78h
        3: (        23 + 47) * 3600000, // 70h
        4: (             47) * 3600000, // 47h
    };

    const STATE_BG = {
        BLOCKED:       'linear-gradient(135deg, #922b21, #cb4335)',
        SURGE:         'linear-gradient(135deg, #6c3483, #a93226)',
        KANJI_URGENT:  'linear-gradient(135deg, #154360, #1f618d)',
        NORMAL:        'linear-gradient(135deg, #1a2980, #1f618d)',
        KANJI_DONE:    'linear-gradient(135deg, #512e8b, #8e44ad)',
        ALL_CLEAR:     'linear-gradient(135deg, #1e7e4c, #229954)',
        RADICALS_ONLY: 'linear-gradient(135deg, #1a5276, #2471a3)',
    };

    // ── WKOF guard ────────────────────────────────────────────────────────

    if (!window.wkof) {
        alert('WaniKani Progress Compass requires WaniKani Open Framework.\n' +
              'You will now be forwarded to installation instructions.');
        window.location.href = 'https://community.wanikani.com/t/instructions-installing-wanikani-open-framework/28549';
        return;
    }

    let SETTINGS_CONFIG = null;
    let cachedNextReview = null;

    // ── Helpers ───────────────────────────────────────────────────────────

    function todayStr() {
        const p = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
        return p.find(x => x.type === 'year').value + '-' +
               p.find(x => x.type === 'month').value + '-' +
               p.find(x => x.type === 'day').value;
    }

    function fmtDuration(ms) {
        if (ms <= 0) return 'now';
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        if (h === 0) return `${m}m`;
        if (m === 0) return `${h}h`;
        return `${h}h ${m}m`;
    }

    function fmtTime(date) {
        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }

    function fmtETA(eta, now) {
        const diff = eta - now;
        if (diff <= 0) return 'now';
        const h  = Math.floor(diff / 3600000);
        const d  = Math.floor(h / 24);
        const rh = h % 24;
        if (d === 0) return `~${h}h`;
        return rh ? `~${d}d ${rh}h` : `~${d}d`;
    }

    // ── State Computation ─────────────────────────────────────────────────

    function computeState(items, userData, settings) {
        const level = userData.level;
        const now   = new Date();
        const today = todayStr();

        const levelKanji    = items.filter(i => i.object === 'kanji'     && i.data.level === level && i.assignments && !i.hidden);
        const levelRadicals = items.filter(i => i.object === 'radical'   && i.data.level === level && i.assignments && !i.hidden);
        const allVocab      = items.filter(i => i.object === 'vocabulary'                           && i.assignments && !i.hidden);

        // Level-up progress (need to Guru 90% of current-level kanji)
        const guruPlus   = levelKanji.filter(i => i.assignments.srs_stage >= 5);
        const guruPct    = levelKanji.length ? guruPlus.length / levelKanji.length : 0;
        const neededMore = Math.max(0, Math.ceil(levelKanji.length * 0.9) - guruPlus.length);

        // Apprentice count across all levels
        const apprentice = items.filter(i => i.assignments && i.assignments.srs_stage >= 1 && i.assignments.srs_stage <= 4).length;

        // Today's lesson activity
        const kanjiToday = levelKanji.filter(i => i.assignments.started_at?.startsWith(today)).length;
        const vocabToday = allVocab.filter(i => i.assignments.started_at?.startsWith(today)).length;

        // Lesson queues (unlocked, not yet started)
        const vocabQ   = allVocab.filter(i => i.assignments.srs_stage === 0);
        const kanjiQ   = levelKanji.filter(i => i.assignments.srs_stage === 0);
        const radicalQ = levelRadicals.filter(i => i.assignments.srs_stage === 0);

        // Vocab pipeline: days of supply = (current queue + expected unlocks from near-Guru kanji) / daily goal
        // Each kanji that Gurus unlocks ~3 vocab lessons on average
        const vGoal        = settings.vocab_daily_goal;
        const nearGuru     = levelKanji.filter(i => i.assignments.srs_stage === 3 || i.assignments.srs_stage === 4);
        const totalSupply  = (vocabQ.length + nearGuru.length * 3) / Math.max(1, vGoal);

        // Kanji breakdown by SRS stage (for ETA detail display)
        const kanjiByStage = {};
        for (const k of levelKanji.filter(i => i.assignments.srs_stage < 5)) {
            const st = k.assignments.srs_stage || 0;
            kanjiByStage[st] = (kanjiByStage[st] || 0) + 1;
        }

        // Adaptive kanji quota based on pipeline health
        const quota = adaptiveQuota(totalSupply, settings);
        const kLeft = Math.max(0, quota - kanjiToday);
        const vLeft = Math.max(0, vGoal - vocabToday);

        // Level-up surge detection: vocab queue jumped on a level-up
        const storedLevel   = parseInt(localStorage.getItem('wkpc_level') || '0');
        const justLeveled   = storedLevel > 0 && level > storedLevel;
        if (level !== storedLevel) localStorage.setItem('wkpc_level', String(level));
        const isSurge = justLeveled && vocabQ.length > 20;

        // Next kanji/radical review time
        const nextReview = [...levelKanji, ...levelRadicals]
            .filter(i => i.assignments.srs_stage >= 1 && i.assignments.srs_stage <= 4 && i.assignments.available_at)
            .map(i => new Date(i.assignments.available_at))
            .filter(t => t > now)
            .sort((a, b) => a - b)[0] || null;

        // Level-up ETA
        const eta = computeLevelUpETA(levelKanji, quota, now);

        // Which banner state applies?
        const banner = pickBannerState({
            apprentice, ceiling: settings.apprentice_ceiling,
            isSurge, kLeft, kanjiQLen: kanjiQ.length,
            totalSupply, quota, vLeft,
            vocabQLen: vocabQ.length, radicalQLen: radicalQ.length,
        });

        return {
            banner, level,
            guruCount: guruPlus.length, totalKanji: levelKanji.length, guruPct, neededMore,
            apprentice, ceiling: settings.apprentice_ceiling,
            kanjiToday, quota, kLeft, kanjiQLen: kanjiQ.length,
            vocabToday, vGoal, vLeft, vocabQLen: vocabQ.length,
            radicalQLen: radicalQ.length,
            totalSupply, nextReview, eta, isSurge,
            nearGuruCount: nearGuru.length,
            kanjiMax: settings.kanji_max,
            kanjiByStage,
        };
    }

    function adaptiveQuota(totalSupply, s) {
        let base;
        if      (totalSupply > 7) base = 0;
        else if (totalSupply > 4) base = 2;
        else if (totalSupply > 1) base = 3;
        else                      base = s.kanji_max; // queue running dry — max out
        return Math.max(s.kanji_min, Math.min(s.kanji_max, base));
    }

    function pickBannerState({ apprentice, ceiling, isSurge, kLeft, kanjiQLen, totalSupply, quota, vLeft, vocabQLen, radicalQLen }) {
        if (apprentice >= ceiling)                              return 'BLOCKED';
        if (isSurge)                                           return 'SURGE';
        if (kanjiQLen > 0 && kLeft > 0 && totalSupply < 1)    return 'KANJI_URGENT';
        if (kanjiQLen > 0 && kLeft > 0)                       return 'NORMAL';
        if (kLeft === 0 && vLeft > 0 && vocabQLen > 0)        return 'KANJI_DONE';
        if (kanjiQLen === 0 && vocabQLen === 0 && radicalQLen > 0) return 'RADICALS_ONLY';
        return 'ALL_CLEAR';
    }

    function computeLevelUpETA(levelKanji, kanjiPerDay, now) {
        const total    = levelKanji.length;
        const guruCnt  = levelKanji.filter(i => i.assignments?.srs_stage >= 5).length;
        const needed   = Math.ceil(total * 0.9) - guruCnt;
        if (needed <= 0) return { available: true };

        const etgs = [];
        let unstarted = 0;

        for (const k of levelKanji.filter(i => !i.assignments || i.assignments.srs_stage < 5)) {
            const stage = k.assignments?.srs_stage;
            const avail = k.assignments?.available_at;
            if (!stage || !avail) { unstarted++; continue; }
            etgs.push(new Date(new Date(avail).getTime() + (TO_GURU_MS[stage] || 0)));
        }

        // Unstarted kanji: model as starting at rate of kanjiPerDay from today
        const batch = Math.max(1, kanjiPerDay);
        for (let i = 0; i < unstarted; i++) {
            const delay = Math.floor(i / batch) * 86400000;
            etgs.push(new Date(now.getTime() + delay + TO_GURU_MS[1]));
        }

        etgs.sort((a, b) => a - b);
        return { available: false, eta: etgs[needed - 1] || null };
    }

    // ── CSS ───────────────────────────────────────────────────────────────

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = `
        .wkpc-wrap { width:100%; margin:12px 0 16px; }
        .wkpc { border-radius:12px; color:#fff; box-shadow:0 4px 18px rgba(0,0,0,.3);
            font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
            padding:16px 20px; }
        .wkpc-row { padding-bottom:14px; margin-bottom:14px;
            border-bottom:1px solid rgba(255,255,255,.15); }
        .wkpc-row:last-child { padding-bottom:0; margin-bottom:0; border-bottom:none; }
        /* progress bars */
        .wkpc-bar { height:13px; border-radius:7px; background:rgba(255,255,255,.2); overflow:hidden; }
        .wkpc-bar--sm { height:8px; border-radius:4px; }
        .wkpc-fill { height:100%; border-radius:inherit; transition:width .5s ease; }
        .wkpc-fill--gold   { background:#f4d03f; }
        .wkpc-fill--amber  { background:#f39c12; }
        .wkpc-fill--green  { background:#2ecc71; }
        .wkpc-fill--orange { background:#e67e22; }
        .wkpc-fill--red    { background:#e74c3c; }
        /* row 1 — level progress */
        .wkpc-lv-hdr { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px; }
        .wkpc-lv-title { font-size:15px; font-weight:700; }
        .wkpc-lv-pct   { font-size:13px; opacity:.85; }
        .wkpc-eta { font-size:12px; opacity:.85; margin-top:5px; }
        /* row 2 — today's plan */
        .wkpc-pills { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px; }
        .wkpc-pill { display:inline-flex; align-items:center; gap:.4rem; padding:4px 11px;
            border-radius:999px; font-size:12px; font-weight:700;
            background:rgba(0,0,0,.22); border:1px solid rgba(255,255,255,.2); }
        .wkpc-pill--done  { border-color:rgba(46,204,113,.9); }
        .wkpc-pill--warn  { border-color:rgba(243,156,18,.9); }
        .wkpc-pill--alert { border-color:rgba(231,76,60,.9); }
        .wkpc-pipe-hdr { display:flex; justify-content:space-between;
            font-size:12px; opacity:.8; margin-bottom:4px; }
        .wkpc-pipe-why { font-size:12px; opacity:.75; font-style:italic; margin-top:5px; }
        /* row 3 — action */
        .wkpc-action { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
        .wkpc-msg { font-size:17px; font-weight:800; letter-spacing:.1px; }
        .wkpc-sub { font-size:13px; opacity:.88; margin-top:3px; }
        .wkpc-btns { display:flex; gap:7px; flex-shrink:0; margin-top:2px; }
        .wkpc-btn { display:inline-flex; align-items:center; justify-content:center;
            width:32px; height:32px; border-radius:8px;
            background:rgba(255,255,255,.15); border:1px solid rgba(255,255,255,.25);
            color:#fff; font-size:15px; cursor:pointer; user-select:none; }
        .wkpc-btn:hover { background:rgba(255,255,255,.28); }
        .wkpc-countdown { font-size:12px; margin-top:8px; opacity:.85; }
        .wkpc-countdown--now    { color:#ff7675; font-weight:700; opacity:1; }
        .wkpc-countdown--urgent { color:#fdcb6e; font-weight:700; opacity:1; }
        .wkpc-detail { font-size:11px; opacity:.6; margin-top:4px;
            font-family:ui-monospace,'SF Mono',Menlo,monospace; letter-spacing:-.1px; }
        .wkpc-zone-bar { display:flex; height:18px; border-radius:4px; overflow:hidden; margin-top:6px; }
        .wkpc-zone { display:flex; align-items:center; justify-content:center;
            font-size:10px; font-weight:700; overflow:hidden; white-space:nowrap; }
        .wkpc-zone--urgent  { background:rgba(230,126,34,.85); }
        .wkpc-zone--normal  { background:rgba(39,174,96,.85); }
        .wkpc-zone--healthy { background:rgba(241,196,15,.75); }
        .wkpc-zone--full    { background:rgba(231,76,60,.8); }
        .wkpc-zone-axis { position:relative; height:18px; margin-top:3px; }
        .wkpc-zone-tick { position:absolute; font-size:10px; opacity:.55; }
        .wkpc-zone-now  { position:absolute; font-size:11px; font-weight:700; white-space:nowrap; }
        `;
        document.head.appendChild(el);
    }

    // ── Banner DOM ────────────────────────────────────────────────────────

    function buildShell() {
        const wrap = document.createElement('div');
        wrap.id = BANNER_ID;
        wrap.className = 'wkpc-wrap';
        wrap.innerHTML = `
        <div class="wkpc">
            <div class="wkpc-row">
                <div class="wkpc-lv-hdr">
                    <span class="wkpc-lv-title" id="wkpc-lv-title">Loading…</span>
                    <span class="wkpc-lv-pct"   id="wkpc-lv-pct"></span>
                </div>
                <div class="wkpc-bar">
                    <div class="wkpc-fill wkpc-fill--gold" id="wkpc-guru-bar" style="width:0%"></div>
                </div>
                <div class="wkpc-eta" id="wkpc-eta"></div>
                <div class="wkpc-detail" id="wkpc-eta-detail"></div>
            </div>
            <div class="wkpc-row">
                <div class="wkpc-pills" id="wkpc-pills"></div>
                <div class="wkpc-pipe-hdr">
                    <span>Vocab pipeline supply</span>
                    <span id="wkpc-supply"></span>
                </div>
                <div class="wkpc-bar wkpc-bar--sm">
                    <div class="wkpc-fill wkpc-fill--green" id="wkpc-pipe-bar" style="width:0%"></div>
                </div>
                <div class="wkpc-pipe-why" id="wkpc-pipe-why"></div>
                <div id="wkpc-zone-ruler"></div>
            </div>
            <div class="wkpc-row">
                <div class="wkpc-action">
                    <div>
                        <div class="wkpc-msg" id="wkpc-msg">Loading…</div>
                        <div class="wkpc-sub" id="wkpc-sub"></div>
                    </div>
                    <div class="wkpc-btns">
                        <div class="wkpc-btn" id="wkpc-refresh"  title="Refresh data">↺</div>
                        <div class="wkpc-btn" id="wkpc-settings" title="Settings">⚙</div>
                    </div>
                </div>
                <div class="wkpc-countdown" id="wkpc-countdown"></div>
            </div>
        </div>`;
        return wrap;
    }

    function renderBanner(wrap, s) {
        cachedNextReview = s.nextReview;
        wrap.querySelector('.wkpc').style.background = STATE_BG[s.banner] || STATE_BG.NORMAL;

        // Row 1 — kanji Guru progress
        const pct = s.totalKanji ? Math.round(s.guruPct * 100) : 0;
        wrap.querySelector('#wkpc-lv-title').textContent =
            `Level ${s.level} kanji: ${s.guruCount}/${s.totalKanji} at Guru+`;
        wrap.querySelector('#wkpc-lv-pct').textContent =
            s.guruPct >= 0.9 ? '✓ Ready to level up!' : `${pct}% — need 90%`;

        const guruBar = wrap.querySelector('#wkpc-guru-bar');
        guruBar.style.width = `${Math.min(100, pct)}%`;
        guruBar.className = 'wkpc-fill ' +
            (pct >= 90 ? 'wkpc-fill--green' : pct >= 50 ? 'wkpc-fill--amber' : 'wkpc-fill--gold');

        const etaEl = wrap.querySelector('#wkpc-eta');
        if (s.guruPct >= 0.9) {
            etaEl.textContent = 'Level up available — do your reviews!';
        } else if (s.eta?.eta) {
            etaEl.textContent =
                `ETA to level up: ${fmtETA(s.eta.eta, new Date())} (${s.neededMore} more kanji need to reach Guru)`;
        } else if (s.kanjiQLen > 0 && s.guruCount === 0) {
            etaEl.textContent = 'Start kanji lessons to begin the level-up clock';
        } else {
            etaEl.textContent = '';
        }
        wrap.querySelector('#wkpc-eta-detail').textContent = etaDetail(s);

        // Row 2 — today's plan pills
        const kCls = s.kLeft === 0      ? 'wkpc-pill--done'  :
                     s.kanjiToday > 0   ? 'wkpc-pill--warn'  : '';
        const vCls = s.vLeft === 0      ? 'wkpc-pill--done'  :
                     s.vocabToday > 0   ? 'wkpc-pill--warn'  : '';
        const aCls = s.apprentice >= s.ceiling             ? 'wkpc-pill--alert' :
                     s.apprentice >= s.ceiling * 0.9       ? 'wkpc-pill--warn'  : '';

        let pills =
            `<span class="wkpc-pill ${kCls}">漢字 ${s.kanjiToday}/${s.quota}${s.kLeft === 0 ? ' ✓' : ''}</span>` +
            `<span class="wkpc-pill ${vCls}">語彙 ${s.vocabToday}/${s.vGoal}${s.vLeft === 0 ? ' ✓' : ''}</span>` +
            `<span class="wkpc-pill ${aCls}">Apprentice ${s.apprentice}/${s.ceiling}</span>`;
        if (s.radicalQLen > 0)
            pills += `<span class="wkpc-pill">Radicals ${s.radicalQLen}</span>`;
        wrap.querySelector('#wkpc-pills').innerHTML = pills;

        // Vocab pipeline bar (0–7 day scale)
        const supplyPct = Math.min(100, (s.totalSupply / 7) * 100);
        const pipeBar = wrap.querySelector('#wkpc-pipe-bar');
        pipeBar.style.width = `${supplyPct}%`;
        pipeBar.className = 'wkpc-fill ' +
            (s.totalSupply < 1 ? 'wkpc-fill--orange' : s.totalSupply > 7 ? 'wkpc-fill--red' : 'wkpc-fill--green');
        const zoneLabel = s.totalSupply > 7 ? '> 7 days' :
                          s.totalSupply > 4 ? '4–7 days' :
                          s.totalSupply > 1 ? '1–4 days' : '< 1 day';
        wrap.querySelector('#wkpc-supply').textContent = `${s.totalSupply.toFixed(1)} days (${zoneLabel})`;
        wrap.querySelector('#wkpc-pipe-why').textContent = pipelineWhy(s);
        wrap.querySelector('#wkpc-zone-ruler').innerHTML = buildZoneRuler(s);

        // Row 3 — action message
        const { msg, sub } = actionText(s);
        wrap.querySelector('#wkpc-msg').textContent = msg;
        wrap.querySelector('#wkpc-sub').textContent = sub;
        renderCountdown(wrap, s.nextReview);
    }

    function renderCountdown(wrap, nextReview) {
        const el = wrap.querySelector('#wkpc-countdown');
        if (!el) return;
        if (!nextReview) {
            el.textContent = 'No upcoming kanji/radical reviews';
            el.className = 'wkpc-countdown';
            return;
        }
        const diff = nextReview - new Date();
        if (diff <= 0) {
            el.textContent = '⚡ Kanji/radical reviews available NOW';
            el.className = 'wkpc-countdown wkpc-countdown--now';
        } else {
            el.textContent = `Next kanji/radical review: in ${fmtDuration(diff)} (${fmtTime(nextReview)})`;
            el.className = 'wkpc-countdown ' + (diff < 4 * 3600000 ? 'wkpc-countdown--urgent' : '');
        }
    }

    function pipelineWhy(s) {
        if (s.totalSupply > 7) return `Pipeline full — skipping kanji today to let vocab clear`;
        if (s.totalSupply > 4) return `Pipeline healthy — ${s.quota} kanji/day keeps flow steady`;
        if (s.totalSupply > 1) return `Normal pace — ${s.quota} kanji/day`;
        return `Queue running dry — doing up to ${s.quota} kanji to keep vocab flowing`;
    }

    function etaDetail(s) {
        if (!s.kanjiByStage) return '';
        const parts = [];
        if (s.kanjiByStage[0] > 0) parts.push(`${s.kanjiByStage[0]} not started`);
        [1, 2, 3, 4].forEach(st => {
            if (s.kanjiByStage[st] > 0) parts.push(`${s.kanjiByStage[st]} App${st}`);
        });
        return parts.join(' · ');
    }

    function buildZoneRuler(s) {
        const supply = s.totalSupply;
        const scale = Math.max(7, supply);
        const pct = v => (v / scale * 100).toFixed(1);

        const zones = [
            { cls: 'urgent',  w: 1 / scale * 100,         label: `${s.kanjiMax}/day` },
            { cls: 'normal',  w: 3 / scale * 100,          label: '3/day' },
            { cls: 'healthy', w: 3 / scale * 100,          label: '2/day' },
            ...(supply > 7 ? [{ cls: 'full', w: (supply - 7) / scale * 100, label: '0/day' }] : []),
        ];
        const barHtml = zones.map(z =>
            `<div class="wkpc-zone wkpc-zone--${z.cls}" style="width:${z.w.toFixed(1)}%">${z.label}</div>`
        ).join('');

        const markerPct = supply / scale * 100;
        const markerStyle = markerPct > 90
            ? 'right:0'
            : `left:${markerPct.toFixed(1)}%;transform:translateX(-50%)`;

        const axisHtml =
            `<span class="wkpc-zone-tick" style="left:0">0</span>` +
            `<span class="wkpc-zone-tick" style="left:${pct(1)}%;transform:translateX(-50%)">1d</span>` +
            `<span class="wkpc-zone-tick" style="left:${pct(4)}%;transform:translateX(-50%)">4d</span>` +
            (supply > 7 ? `<span class="wkpc-zone-tick" style="left:${pct(7)}%;transform:translateX(-50%)">7d</span>` : '') +
            `<span class="wkpc-zone-now" style="${markerStyle}">▲ ${supply.toFixed(1)}d</span>`;

        return `<div class="wkpc-zone-bar">${barHtml}</div><div class="wkpc-zone-axis">${axisHtml}</div>`;
    }

    function actionText(s) {
        switch (s.banner) {
            case 'BLOCKED':
                return { msg: `Reviews only — apprentice at ${s.apprentice}/${s.ceiling}`,
                         sub: 'Clear reviews before taking new lessons.' };
            case 'SURGE':
                return { msg: 'Level-up surge! Focus on vocab first',
                         sub: `${s.vocabQLen} lessons pending (~${Math.ceil(s.vocabQLen / s.vGoal)} days to clear).` };
            case 'KANJI_URGENT':
                return { msg: `Do ${s.kLeft} kanji now — vocab queue running dry`,
                         sub: 'Then continue with vocab lessons.' };
            case 'NORMAL': {
                const parts = [];
                if (s.kLeft > 0 && s.kanjiQLen > 0) parts.push(`${s.kLeft} kanji`);
                if (s.vLeft > 0 && s.vocabQLen > 0) parts.push(`${s.vLeft} vocab`);
                return { msg: parts.length ? `Do ${parts.join(' + ')} now` : 'Great progress today!',
                         sub: '' };
            }
            case 'KANJI_DONE':
                return { msg: `Kanji done ✓ — do ${s.vLeft} more vocab`,
                         sub: `${s.vocabQLen} in queue.` };
            case 'ALL_CLEAR':
                return { msg: 'All done for now!',
                         sub: 'Come back when reviews are ready.' };
            case 'RADICALS_ONLY':
                return { msg: `Do ${s.radicalQLen} radical lessons`,
                         sub: 'Unlocks kanji sooner.' };
            default:
                return { msg: 'Check your lessons', sub: '' };
        }
    }

    // ── Data Fetch ────────────────────────────────────────────────────────

    async function fetchAndRender(wrap) {
        const msgEl = wrap.querySelector('#wkpc-msg');
        if (msgEl) msgEl.textContent = 'Loading…';
        try {
            const [userResp, items] = await Promise.all([
                wkof.Apiv2.fetch_endpoint('user'),
                wkof.ItemData.get_items({
                    wk_items: {
                        options: { assignments: true },
                        filters: { item_type: 'kan,voc,rad' },
                    },
                }),
            ]);
            const settings = wkof.settings[SCRIPT_ID] || DEFAULTS;
            renderBanner(wrap, computeState(items, userResp.data, settings));
        } catch (err) {
            console.error('[WKPC]', err);
            if (msgEl) msgEl.textContent = 'Error loading data — click ↺ to retry';
        }
    }

    // ── Injection ─────────────────────────────────────────────────────────

    function inject() {
        const path = location.pathname;
        if (path !== '/' && !path.startsWith('/dashboard')) return false;
        if (document.getElementById(BANNER_ID)) return true;

        const dashboard = document.querySelector('.dashboard') || document.querySelector('main');
        if (!dashboard || !dashboard.parentElement) return false;

        injectStyles();
        const wrap = buildShell();
        dashboard.parentElement.insertBefore(wrap, dashboard);

        wrap.querySelector('#wkpc-refresh').addEventListener('click', () => fetchAndRender(wrap));
        wrap.querySelector('#wkpc-settings').addEventListener('click', () => {
            if (SETTINGS_CONFIG) new wkof.Settings(SETTINGS_CONFIG).open();
        });

        // Update countdown text every 60s without re-fetching
        setInterval(() => renderCountdown(wrap, cachedNextReview), 60000);

        fetchAndRender(wrap);
        return true;
    }

    function tryInject() {
        const path = location.pathname;
        if (path !== '/' && !path.startsWith('/dashboard')) return;
        if (inject()) return;
        const obs = new MutationObserver(() => { if (inject()) obs.disconnect(); });
        obs.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => obs.disconnect(), 5000);
    }

    // ── WKOF Init ─────────────────────────────────────────────────────────

    wkof.include('ItemData, Apiv2, Settings');
    wkof.ready('ItemData, Apiv2, Settings').then(() => {
        SETTINGS_CONFIG = {
            script_id: SCRIPT_ID,
            title: 'WaniKani Progress Compass',
            on_save: () => { wkof.Settings.save(SCRIPT_ID); location.reload(); },
            content: {
                pacing: {
                    type: 'group',
                    label: 'Pacing',
                    content: {
                        vocab_daily_goal: {
                            type: 'number', label: 'Vocab lessons per day',
                            default: DEFAULTS.vocab_daily_goal, min: 1, step: 1,
                            hover_tip: 'Target number of vocab lessons to do each day.',
                        },
                        apprentice_ceiling: {
                            type: 'number', label: 'Apprentice ceiling (blocks all lessons)',
                            default: DEFAULTS.apprentice_ceiling, min: 50, step: 5,
                            hover_tip: 'When total apprentice items reach this, no new lessons until reviews bring it down.',
                        },
                        kanji_min: {
                            type: 'number', label: 'Min kanji/day (pipeline floor)',
                            default: DEFAULTS.kanji_min, min: 0, step: 1,
                            hover_tip: 'Minimum kanji lessons per day even when the vocab pipeline is full. Set to 0 to allow skipping kanji entirely.',
                        },
                        kanji_max: {
                            type: 'number', label: 'Max kanji/day (pipeline ceiling)',
                            default: DEFAULTS.kanji_max, min: 1, step: 1,
                            hover_tip: 'Maximum kanji lessons per day when the vocab queue is running dry.',
                        },
                    },
                },
            },
        };

        wkof.Settings.load(SCRIPT_ID, DEFAULTS).then(() => {
            document.addEventListener('turbo:load', tryInject);
            tryInject();
        });
    }).catch(err => console.error('[WKPC] WKOF init failed:', err));

})();
