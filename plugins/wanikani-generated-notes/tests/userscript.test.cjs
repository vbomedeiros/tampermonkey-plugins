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
<section class="subject-section--meaning"><h2>Meaning</h2></section></body>`;
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

test('review requires an answer AND matching frame; hides immediately on next question, even for the same subject', async t => {
    const app = setup({ path: '/subjects/review', saved: linked(), html: '<turbo-frame id="subject-info" src="/subjects/7235/subject_info"><section class="subject-section--meaning">Meaning</section></turbo-frame>' });
    t.after(() => app.dom.window.close());
    const subject = { id: 7235, type: 'Vocabulary', characters: '後悔' };
    const frame = app.w.document.getElementById('subject-info');
    const frameLoad = () => frame.dispatchEvent(new app.w.Event('turbo:frame-load', { bubbles: true }));
    app.emit('willShowNextQuestion', { subject, questionType: 'meaning' });
    frameLoad(); await tick(); assert.equal(app.panel(), null);
    app.emit('didAnswerQuestion', { subjectWithStats: { subject }, questionType: 'meaning' });
    await tick(); assert.equal(app.panel(), null);
    frame.setAttribute('src', '/subjects/999/subject_info'); frameLoad(); await tick(); assert.equal(app.panel(), null);
    frame.setAttribute('src', '/subjects/7235/subject_info'); frameLoad(); await tick(); assert.ok(app.panel());
    app.emit('willShowNextQuestion', { subject, questionType: 'reading' });
    assert.equal(app.panel(), null);
    frameLoad(); await tick(); assert.equal(app.panel(), null);
    app.emit('didAnswerQuestion', { subjectWithStats: { subject }, questionType: 'reading' });
    frameLoad(); await tick(); assert.ok(app.panel());
    app.emit('willShowNextQuestion', { subject: { id: 1, type: 'Kanji', characters: '後' } });
    app.emit('didAnswerQuestion', { subjectWithStats: { subject: { id: 1, type: 'Kanji', characters: '後' } } });
    frameLoad(); await tick(); assert.equal(app.panel(), null);
});
