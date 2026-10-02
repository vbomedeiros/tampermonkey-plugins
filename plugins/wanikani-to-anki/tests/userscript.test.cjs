const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { JSDOM } = require('jsdom');
const source = readFileSync(require('node:path').join(__dirname, '../wanikani-to-anki.user.js'), 'utf8');
const subjects = [
  { id: 7764, object: 'vocabulary', data: { characters: '対応', component_subject_ids: [1] } },
  { id: 2, object: 'kana_vocabulary', data: { characters: 'かな', component_subject_ids: [] } },
  { id: 1, object: 'kanji', data: { characters: '対', level: 8, meanings: [{ meaning: 'Versus', primary: true, accepted_answer: true }], meaning_mnemonic: '<kanji>Versus</kanji> mnemonic', reading_mnemonic: '<reading>たい</reading>', meaning_hint: 'Hint content' } },
];
function page(id = 7764, reading = true) {
  const word = id === 7764 ? '対応' : 'かな';
  return `<div class="page-header__prefix"><span class="subject-character__characters-text">${word}</span></div>
    <span class="page-header__title-text">Dealing With</span><div class="subject-page-header__level">Level 22</div>
    <section class="subject-section" data-name="meaning"><section class="subject-section__content">
    <section data-name="alternativeMeanings"><h3 data-title>Alternative</h3><div data-content>Response</div></section>
    <section data-name="partsOfSpeech"><h3 data-title>Word Type</h3><div data-content>noun, transitive verb</div></section>
    <section data-name="mnemonic"><div data-content><p class="subject-section__text">Meaning <mark title="Vocabulary">mnemonic</mark>.</p></div></section>
    <section data-name="note"><p class="subject-section__text">Private note excluded</p></section></section></section>
    ${reading ? '<section class="subject-section" data-name="reading"><span class="reading-with-audio__reading">たいおう</span><section data-name="mnemonic"><p class="subject-section__text">Reading mnemonic.</p></section></section>' : ''}`;
}
async function setup({ delayed = false, dashboard = false } = {}) {
  const dom = new JSDOM(`<meta name="subject_id" content="7764"><body>${dashboard ? '' : page()}</body>`, {
    url: `https://www.wanikani.com/${dashboard ? '' : 'vocabulary/対応'}`, runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const observers = [];
  const NativeObserver = dom.window.MutationObserver;
  dom.window.MutationObserver = class extends NativeObserver {
    constructor(callback) { super(callback); observers.push(this); }
  };
  const close = dom.window.close.bind(dom.window);
  dom.window.close = () => { observers.forEach(observer => observer.disconnect()); close(); };
  let resolve;
  const data = delayed ? new Promise(r => { resolve = r; }) : Promise.resolve(subjects);
  dom.window.wkof = { include() {}, ready: () => Promise.resolve(), ItemData: { get_items: () => data } };
  dom.window.eval(source);
  const settle = () => new Promise(r => setTimeout(r, 65));
  await settle();
  return { dom, w: dom.window, d: dom.window.document, settle, resolve };
}
test('current DOM exports vocabulary and kanji, colors, hints, and working copy control', async t => {
  const { dom, w, d, settle } = await setup(); t.after(() => dom.window.close());
  const html = d.querySelector('#ankiHtmlSource').value;
  assert.match(html, /対応（Dealing With, Response、たいおう、noun、他動詞、Level 22）：/);
  assert.match(html, /Reading mnemonic/); assert.match(html, /対（Versus、Level 8）：/);
  assert.match(html, /Hint: Hint content/); assert.match(html, /background-color/);
  assert.doesNotMatch(html, /Private note|<mark|class=|<p[ >]/);
  assert.equal(d.querySelector('[data-name="meaning"]').nextElementSibling.id, 'wk-to-anki');
  let copied; w.navigator.clipboard = { writeText: async value => { copied = value; } };
  d.querySelector('#wk-to-anki button').click(); await settle();
  assert.equal(copied, html);
  assert.match(d.querySelector('#wk-to-anki').textContent, /Copied HTML source/);
});
test('Turbo navigation, cache restore, repeated events, and kana pages do not retain or duplicate content', async t => {
  const { dom, w, d, settle } = await setup(); t.after(() => dom.window.close());
  for (let i = 0; i < 3; i++) d.dispatchEvent(new w.Event('turbo:load'));
  await settle(); assert.equal(d.querySelectorAll('#wk-to-anki').length, 1);
  d.dispatchEvent(new w.Event('turbo:before-cache'));
  assert.equal(d.querySelector('#wk-to-anki'), null);
  d.dispatchEvent(new w.Event('turbo:render')); await settle();
  assert.equal(d.querySelectorAll('#wk-to-anki').length, 1);
  w.history.pushState({}, '', '/vocabulary/かな'); d.querySelector('meta').content = '2'; d.body.innerHTML = page(2, false);
  d.dispatchEvent(new w.Event('turbo:render')); await settle();
  assert.match(d.querySelector('#ankiHtmlSource').value, /かな（/);
  assert.doesNotMatch(d.querySelector('#ankiHtmlSource').value, /対応|Versus|Reading mnemonic/);
  w.history.pushState({}, '', '/'); d.dispatchEvent(new w.Event('turbo:load')); await settle();
  assert.equal(d.querySelector('#wk-to-anki'), null);
});
test('late WKOF data and delayed page sections render the current item only', async t => {
  const { dom, w, d, settle, resolve } = await setup({ delayed: true, dashboard: true }); t.after(() => dom.window.close());
  w.history.pushState({}, '', '/vocabulary/対応'); d.body.innerHTML = page(7764, false);
  resolve(subjects); await settle(); assert.equal(d.querySelector('#wk-to-anki'), null);
  d.body.innerHTML = page(); await settle(); assert.equal(d.querySelectorAll('#wk-to-anki').length, 1);
  w.history.pushState({}, '', '/vocabulary/かな'); d.dispatchEvent(new w.Event('turbo:load')); await settle();
  assert.equal(d.querySelector('#wk-to-anki'), null);
});
