const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');

const script = readFileSync(join(__dirname, '../wanikani-generated-notes.user.js'), 'utf8');
const SETTINGS = 'wk_generated_notes_settings_v1';
const KEY = 'wk_generated_notes_library_v1_Test';
const note = (id = 100, html = '<h3>Reading Breakdown</h3><p>Saved explanation</p>') => ({
    noteId: id, profile: 'Test', modelName: 'Japanese', fields: {
        Front: { value: '後悔' }, Kana: { value: 'こうかい' }, Back: { value: 'Regret' }, GeneratedNotes: { value: html },
    },
});
const itemHTML = `<!doctype html><head><meta name="subject_id" content="7235"></head><body>
<div class="page-header__prefix"><span class="subject-character__characters-text">後悔</span></div>
<section class="subject-section" data-name="meaning"><a class="wk-nav__anchor" id="meaning"></a><h2>Meaning</h2><section class="subject-section__content"></section></section>
<section class="subject-section" data-name="reading"><a class="wk-nav__anchor" id="reading"></a><h2>Reading</h2><section class="subject-section__content"></section></section></body>`;
const linked = () => ({ [SETTINGS]: { profile: 'Test', apiKey: '' }, [KEY]: { links: {
    7235: { noteId: 100, characters: '後悔', html: '<p>Offline explanation</p>', state: 'ready', checkedAt: 1 },
}, syncedAt: 1 } });
const tick = () => new Promise(resolve => setTimeout(resolve, 20));

function setup({ html = itemHTML, path = '/vocabulary/後悔', saved = {}, handler } = {}) {
    const dom = new JSDOM(html, { url: 'https://www.wanikani.com' + path, runScripts: 'outside-only' });
    const storage = structuredClone(saved);
    const calls = [];
    const w = dom.window;
    w.GM_getValue = (key, fallback) => structuredClone(storage[key] ?? fallback);
    w.GM_setValue = (key, value) => { storage[key] = structuredClone(value); };
    w.GM_addValueChangeListener = () => {};
    w.GM_xmlhttpRequest = options => {
        const body = JSON.parse(options.data);
        calls.push(body);
        Promise.resolve().then(async () => {
            try {
                const result = handler ? await handler(body) : body.action === 'getActiveProfile' ? 'Test' : body.action === 'findNotes' ? [100] : body.params.notes.map(id => note(id));
                options.onload({ status: 200, responseText: JSON.stringify({ result, error: null }) });
            } catch { options.onerror(); }
        });
    };
    w.eval(script);
    const click = async label => {
        const button = [...w.document.querySelectorAll('button')].find(el => el.textContent === label);
        assert.ok(button, `Button exists: ${label}`);
        button.click();
        await tick();
    };
    const emit = (name, detail) => w.dispatchEvent(new w.CustomEvent(name, { detail }));
    const panel = () => w.document.getElementById('wk-generated-notes');
    return { dom, w, storage, calls, click, emit, panel };
}

test('first visit automatically connects, searches Front, and displays notes without buttons', async t => {
    const app = setup(); t.after(() => app.dom.window.close());
    await tick();
    assert.match(app.panel().textContent, /Saved explanation/);
    assert.ok(app.panel().previousElementSibling.matches('.subject-section[data-name="reading"]'));
    assert.equal(app.storage[KEY].words['後悔'].state, 'ready');
    assert.ok(app.calls.some(c => c.action === 'findNotes' && c.params.query === '"Front:後悔"'));
    assert.ok(app.calls.every(c => ['getActiveProfile', 'findNotes', 'notesInfo'].includes(c.action)));
    assert.doesNotMatch(app.panel().textContent, /Link this note|Find Anki note/);
});

test('old cached prose is immediate and retained when Anki is offline', async t => {
    const app = setup({ saved: linked(), handler: () => { throw Error('offline'); } });
    t.after(() => app.dom.window.close());
    assert.match(app.panel().textContent, /Offline explanation/);
    await tick();
    assert.match(app.panel().textContent, /Anki is unavailable/);
    assert.match(app.panel().textContent, /Offline explanation/);
});

test('every visit searches again and discovers a replacement note ID automatically', async t => {
    const saved = linked();
    const app = setup({ saved, handler: body => body.action === 'getActiveProfile' ? 'Test'
        : body.action === 'findNotes' ? [200] : [note(200, '<p>Replacement explanation</p>')] });
    t.after(() => app.dom.window.close()); await tick();
    assert.match(app.panel().textContent, /Replacement explanation/);
    assert.deepEqual(app.calls.find(c => c.action === 'notesInfo').params.notes, [200]);
    const restarted = setup({ saved: app.storage }); t.after(() => restarted.dom.window.close());
    assert.match(restarted.panel().textContent, /Replacement explanation/);
    await tick();
    assert.ok(restarted.calls.some(c => c.action === 'findNotes'));
    assert.match(restarted.panel().textContent, /Saved explanation/);
});

test('profile mismatch preserves cached prose', async t => {
    const app = setup({ saved: linked(), handler: () => 'Other' }); t.after(() => app.dom.window.close());
    await tick();
    assert.match(app.panel().textContent, /different Anki profile/);
    assert.match(app.panel().textContent, /Offline explanation/);
});

test('missing exact matches clear stale prose after a successful lookup', async t => {
    const app = setup({ saved: linked(), handler: body => body.action === 'getActiveProfile' ? 'Test' : [] });
    t.after(() => app.dom.window.close()); await tick();
    assert.equal(app.storage[KEY].words['後悔'].state, 'missing');
    assert.doesNotMatch(app.panel().textContent, /Offline explanation/);
});

test('substring matches are excluded; unexpected duplicates never select arbitrary content', async t => {
    const app = setup({ handler: body => body.action === 'getActiveProfile' ? 'Test'
        : body.action === 'findNotes' ? [100, 101] : [note(), {...note(101), fields: {...note().fields, Front: {value: '後悔する'}}}] });
    t.after(() => app.dom.window.close()); await tick();
    assert.match(app.panel().textContent, /Saved explanation/);
    const duplicate = setup({ handler: body => body.action === 'getActiveProfile' ? 'Test'
        : body.action === 'findNotes' ? [100, 101] : [note(), note(101)] });
    t.after(() => duplicate.dom.window.close()); await tick();
    assert.match(duplicate.panel().textContent, /Resolve the duplicates/);
});

test('an incomplete response preserves the previous cache', async t => {
    const app = setup({ saved: linked(), handler: body => body.action === 'getActiveProfile' ? 'Test'
        : body.action === 'findNotes' ? [100] : [] });
    t.after(() => app.dom.window.close()); await tick();
    assert.match(app.panel().textContent, /Incomplete Anki response/);
    assert.match(app.panel().textContent, /Offline explanation/);
});

test('sanitization removes active markup and attributes while retaining semantic text', t => {
    const saved = linked();
    saved[KEY].links[7235].html = '<p onclick="evil()" style="position:fixed">Safe<strong> bold</strong><img src="https://evil.invalid/x"></p><script>evil()</script><svg onload="evil()">bad</svg>';
    const app = setup({ saved, handler: () => new Promise(() => {}) });
    t.after(() => app.dom.window.close());
    const content = app.w.document.querySelector('.wkgn-content');
    assert.equal(content.innerHTML, '<p>Safe<strong> bold</strong></p>');
});

test('Turbo navigation does not duplicate panels or publish a late search into the next subject', async t => {
    let resolveSearch;
    const app = setup({ saved: { [SETTINGS]: linked()[SETTINGS] }, handler: body => {
        if (body.action === 'getActiveProfile') return 'Test';
        if (body.action === 'findNotes') return body.params.query.includes('後悔') ? new Promise(resolve => { resolveSearch = resolve; }) : [];
        return body.params.notes.map(id => note(id));
    } });
    t.after(() => app.dom.window.close());
    await tick();
    app.w.document.dispatchEvent(new app.w.Event('turbo:before-cache'));
    app.w.history.pushState({}, '', '/vocabulary/学校');
    app.w.document.querySelector('meta').content = '1000';
    app.w.document.querySelector('.subject-character__characters-text').textContent = '学校';
    app.w.document.dispatchEvent(new app.w.Event('turbo:load'));
    await tick();
    resolveSearch([100]); await tick();
    assert.equal(app.w.document.querySelectorAll('#wk-generated-notes').length, 1);
    assert.equal(app.w.document.querySelectorAll('.wkgn-candidate').length, 0);
    assert.doesNotMatch(app.panel().textContent, /Saved explanation/);
});

test('lesson Meaning tab mounts once, disappears on Reading, and handles kana vocabulary', async t => {
    const app = setup({ path: '/subject-lessons/1-2/7235#meaning', html: `<div class="character-header--vocabulary"><span class="character-header__characters">後悔</span></div><div id="meaning"><div class="subject-slide__sections"><section>Meaning</section></div></div>` });
    t.after(() => app.dom.window.close());
    assert.ok(app.panel()); await tick();
    assert.equal(app.w.document.querySelectorAll('#wk-generated-notes').length, 1);
    app.w.location.hash = '#reading'; await tick();
    assert.equal(app.panel(), null);
    app.w.location.hash = '#meaning'; await tick();
    assert.ok(app.panel());
});

// Current subject_info_controller populates noteItemIdValue before replacing sections.
const reviewHTML = id => `<section class="subject-section" data-name="meaning"><h2>Meaning</h2><div data-controller="note" data-note-item-id-value="${id}"></div></section>
<section class="subject-section" data-name="reading"><h2>Reading</h2><div data-controller="note" data-note-item-id-value="${id}"></div></section>`;
const vocabulary = { id: 7235, type: 'Vocabulary', characters: '後悔' };
const answer = (app, subject = vocabulary) => app.emit('didAnswerQuestion', { subjectWithStats: { subject }, questionType: 'meaning' });

for (const renderBeforeAnswer of [false, true]) {
    test(`review mounts with matching rendered content ${renderBeforeAnswer ? 'before' : 'after'} answer, without a Turbo frame`, async t => {
        const app = setup({ path: '/subjects/review', saved: linked(), html: '<div data-controller="subject-info"></div>' });
        t.after(() => app.dom.window.close());
        const info = app.w.document.querySelector('[data-controller="subject-info"]');
        app.emit('willShowNextQuestion', { subject: vocabulary });
        if (renderBeforeAnswer) {
            info.innerHTML = reviewHTML(7235);
            await tick(); assert.equal(app.panel(), null);
        }
        answer(app);
        if (!renderBeforeAnswer) {
            await tick(); assert.equal(app.panel(), null);
            info.innerHTML = reviewHTML(7235);
        }
        await tick();
        assert.match(app.panel().textContent, /Saved explanation/);
        assert.ok(app.panel().previousElementSibling.matches('.subject-section[data-name="reading"]'));
        // Opening, closing, and re-rendering info must never duplicate the panel.
        info.hidden = true;
        info.hidden = false;
        info.innerHTML = reviewHTML(7235);
        await tick();
        assert.equal(info.querySelectorAll('#wk-generated-notes').length, 1);
        app.emit('willShowNextQuestion', { subject: vocabulary, questionType: 'reading' });
        assert.equal(app.panel(), null);
        info.innerHTML = reviewHTML(7235);
        await tick(); assert.equal(app.panel(), null);
        answer(app); await tick(); assert.ok(app.panel());
    });
}

test('review rejects stale and related-item content, and late Anki results from the previous item', async t => {
    let resolveNotes;
    const app = setup({ path: '/subjects/review', saved: linked(), html: '<div data-controller="subject-info"></div>', handler: body => {
        if (body.action === 'getActiveProfile') return 'Test';
        if (body.action === 'findNotes') return body.params.query.includes('後悔') ? [100] : [];
        return body.params.notes.length ? new Promise(resolve => { resolveNotes = resolve; }) : [];
    } });
    t.after(() => app.dom.window.close());
    const info = app.w.document.querySelector('[data-controller="subject-info"]');
    answer(app);
    info.innerHTML = reviewHTML(7235);
    await tick(); assert.ok(app.panel());
    const next = { id: 1000, subject_category: 'Vocabulary', characters: '学校' };
    app.emit('willShowNextQuestion', { subject: next });
    assert.equal(app.panel(), null);
    answer(app, next);
    await tick(); assert.equal(app.panel(), null); // Previous sections still present.
    info.innerHTML = reviewHTML(1000);
    await tick(); assert.ok(app.panel());
    resolveNotes([note()]); await tick();
    assert.doesNotMatch(app.panel().textContent, /Saved explanation|Offline explanation/);
    info.innerHTML = reviewHTML(7235); // Late renderer or related-item drilldown.
    await tick(); assert.equal(app.panel(), null);
    info.innerHTML = reviewHTML(1000);
    await tick(); assert.ok(app.panel());
    app.w.document.dispatchEvent(new app.w.Event('turbo:before-render'));
    await tick(); assert.equal(app.panel(), null);
});

test('review supports meaning-only kana vocabulary and never mounts for kanji', async t => {
    const app = setup({ path: '/subjects/review', html: '<div data-controller="subject-info"></div>' });
    t.after(() => app.dom.window.close());
    const info = app.w.document.querySelector('[data-controller="subject-info"]');
    info.innerHTML = reviewHTML(7235);
    info.querySelector('[data-name="reading"]').remove();
    answer(app, { ...vocabulary, type: 'KanaVocabulary' });
    await tick(); assert.ok(app.panel());
    assert.ok(app.panel().previousElementSibling.matches('[data-name="meaning"]'));
    const kanji = { id: 1, type: 'Kanji', characters: '後' };
    app.emit('willShowNextQuestion', { subject: kanji });
    answer(app, kanji);
    info.innerHTML = reviewHTML(1);
    await tick(); assert.equal(app.panel(), null);
});

test('direct page rejects old headers during navigation and restores cached markup only once', async t => {
    const app = setup(); t.after(() => app.dom.window.close());
    await tick();
    app.w.history.pushState({}, '', '/vocabulary/学校');
    app.w.document.dispatchEvent(new app.w.Event('turbo:load'));
    await tick(); assert.equal(app.panel(), null);
    app.w.history.back();
    await tick();
    assert.ok(app.panel());
    const cached = app.panel().cloneNode(true);
    app.w.document.dispatchEvent(new app.w.Event('turbo:before-cache'));
    app.w.document.querySelector('[data-name="reading"]').after(cached);
    app.w.document.dispatchEvent(new app.w.Event('turbo:load'));
    await tick();
    assert.equal(app.w.document.querySelectorAll('#wk-generated-notes').length, 1);
});
