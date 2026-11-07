const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('../plugins/wanikani-generated-notes/node_modules/jsdom');
const source = name => fs.readFileSync(require('node:path').join(__dirname, `../plugins/${name}/${name}.user.js`), 'utf8');

test('Progress Compass counts lesson dates in the local timezone across UTC midnight', () => {
  const script = source('wanikani-progress-compass');
  const body = script.slice(script.indexOf('function todayStr('), script.indexOf('function fmtDuration('));
  const context = vm.createContext({ Intl, Date });
  vm.runInContext(body, context);
  const date = new Date('2026-11-07T02:00:00Z');
  const local = new Intl.DateTimeFormat('en-CA', {year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  assert.equal(context.todayStr(date), local);
  assert.match(script, /todayStr\(new Date\(i.assignments.started_at\)\) === today/);
});

test('lesson vocabulary tolerates missing subjects and sorts available vocabulary by level', async () => {
  const dom = new JSDOM('', {runScripts:'outside-only'});
  try {
    let build;
    const w = dom.window;
    w.wkof = { include() {}, ready: async () => {}, ItemData: {get_items: async () => [
      {id:1, data:{amalgamation_subject_ids:[99,3,2]}},
      ...[3,2].map(id => ({id, data:{level:id, slug:`word${id}`, characters:`word${id}`,readings:[{reading:'reading'}],meanings:[{meaning:'meaning'}]}})),
    ]}};
    const chain = {on(){return this},forType(){return this},under(){return this},append(_title, callback){build=callback}};
    w.wkItemInfo = chain;
    w.eval(source('wanikani-kanji-vocab-lessons'));
    await new Promise(resolve => setImmediate(resolve));
    const section = build({id:1});
    assert.deepEqual([...section.querySelectorAll('.subject-character__characters')].map(x=>x.textContent), ['word2','word3']);
  } finally {dom.window.close();}
});
