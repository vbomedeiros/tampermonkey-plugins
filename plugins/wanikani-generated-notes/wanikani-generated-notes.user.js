// ==UserScript==
// @name         WaniKani Generated Notes
// @namespace    https://github.com/vbomedeiros/tampermonkey-plugins
// @version      0.2.1
// @description  Show saved Anki GeneratedNotes in vocabulary pages, lessons, and answered reviews
// @author       Victor Medeiros
// @match        https://www.wanikani.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @connect      127.0.0.1
// @run-at       document-end
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/vbomedeiros/tampermonkey-plugins/main/plugins/wanikani-generated-notes/wanikani-generated-notes.user.js
// @downloadURL  https://raw.githubusercontent.com/vbomedeiros/tampermonkey-plugins/main/plugins/wanikani-generated-notes/wanikani-generated-notes.user.js
// ==/UserScript==

(function () {
    'use strict';

    const ENDPOINT = 'http://127.0.0.1:8765';
    const SETTINGS = 'wk_generated_notes_settings_v1';
    const LIBRARY = 'wk_generated_notes_library_v1_';
    const PANEL = 'wk-generated-notes';
    const READ_ACTIONS = new Set(['getActiveProfile', 'findNotes', 'notesInfo']);
    let settings = GM_getValue(SETTINGS, { profile: '', apiKey: '' });
    let active = null;
    const pending = new Map();
    let review = { subject: null, answered: false, frameReady: false };

    const libraryKey = profile => LIBRARY + encodeURIComponent(profile);
    const library = profile => GM_getValue(libraryKey(profile), { links: {}, syncedAt: 0 });
    const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
    const plain = html => {
        const template = document.createElement('template');
        template.innerHTML = String(html || '');
        return template.content.textContent.trim().normalize('NFC');
    };
    const field = (note, name) => note?.fields?.[name]?.value;

    // Rebuild with an allowlist instead of trusting Anki edits, attributes, or CSS.
    function sanitized(html) {
        const source = document.createElement('template');
        source.innerHTML = String(html || '');
        const allowed = new Set(['H2', 'H3', 'H4', 'P', 'DIV', 'BR', 'HR', 'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I', 'RUBY', 'RT', 'RP']);
        const drop = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA']);
        function copy(node, target) {
            if (node.nodeType === 3) { target.append(document.createTextNode(node.textContent)); return; }
            if (node.nodeType !== 1 || drop.has(node.tagName.toUpperCase())) return;
            const element = allowed.has(node.tagName.toUpperCase()) ? document.createElement(node.tagName.toLowerCase()) : document.createDocumentFragment();
            for (const child of node.childNodes) copy(child, element);
            target.append(element);
        }
        const fragment = document.createDocumentFragment();
        for (const node of source.content.childNodes) copy(node, fragment);
        return fragment;
    }

    function request(action, params = {}, apiKey = settings.apiKey) {
        if (!READ_ACTIONS.has(action)) return Promise.reject(new Error('Unsupported read action.'));
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST', url: ENDPOINT, timeout: 5000,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({ action, version: 6, params, ...(apiKey ? { key: apiKey } : {}) }),
                onload(response) {
                    try {
                        if (response.status !== 200) throw new Error('AnkiConnect refused the connection. Check its access settings.');
                        const data = JSON.parse(response.responseText);
                        if (!Object.hasOwn(data, 'result') || !Object.hasOwn(data, 'error')) throw new Error('Unexpected AnkiConnect response.');
                        if (data.error) throw new Error(String(data.error));
                        resolve(data.result);
                    } catch (error) { reject(error); }
                },
                onerror: () => reject(new Error('Anki is unavailable. Open Anki with AnkiConnect enabled. Saved notes are still available.')),
                ontimeout: () => reject(new Error('Anki did not respond. Saved notes are still available; try again later.')),
                onabort: () => reject(new Error('Connection cancelled. Saved notes are still available.')),
            });
        });
    }

    async function checkProfile(profile) {
        if (!profile || settings.profile !== profile) throw new Error('Connect this browser to an Anki profile first.');
        const current = await request('getActiveProfile');
        if (current !== profile || settings.profile !== profile) {
            throw new Error('A different Anki profile is open. Saved notes were not changed. Use Connection to select it explicitly.');
        }
    }

    async function readNotes(ids, profile) {
        await checkProfile(profile);
        const notes = await request('notesInfo', { notes: ids });
        if (!Array.isArray(notes) || notes.length !== ids.length) throw new Error('Incomplete Anki response. Saved notes were not changed.');
        notes.forEach((note, index) => {
            if (Object.keys(note).length && (note.noteId !== ids[index] || (note.profile && note.profile !== profile))) {
                throw new Error('Anki returned a different note or profile. Saved notes were not changed.');
            }
        });
        await checkProfile(profile);
        return notes;
    }

    // Cache by Front, never by a remembered Anki note ID. Reuse old saved prose
    // during the upgrade, but always resolve the current note through a new search.
    function cachedWord(profile, characters) {
        const data = library(profile);
        return data.words?.[characters] || Object.values(data.links || {}).find(entry => entry.characters === characters);
    }

    async function lookup(panel) {
        if (!panel) return;
        try {
            if (!settings.profile) {
                const profile = await request('getActiveProfile');
                if (typeof profile !== 'string' || !profile) throw new Error('No Anki profile is open.');
                if (!settings.profile) {
                    settings = { ...settings, profile };
                    GM_setValue(SETTINGS, settings);
                }
            }
            const profile = settings.profile;
            const characters = panel.subject.characters;
            const key = JSON.stringify([profile, characters]);
            if (!pending.has(key)) {
                pending.set(key, (async () => {
                    await checkProfile(profile);
                    const escaped = characters.replace(/[\\"*_]/g, '\\$&');
                    const ids = await request('findNotes', { query: `"Front:${escaped}"` });
                    if (!Array.isArray(ids) || !ids.every(positiveId)) throw new Error('Unexpected Anki search response.');
                    if (ids.length > 50) throw new Error('Too many Anki search results for this word.');
                    const notes = await readNotes(ids, profile);
                    const matches = notes.filter(note => plain(field(note, 'Front')) === characters);
                    const html = matches.length === 1 ? field(matches[0], 'GeneratedNotes') : '';
                    const state = matches.length === 0 ? 'missing' : matches.length > 1 ? 'duplicate'
                        : typeof html !== 'string' ? 'field-missing' : plain(html) ? 'ready' : 'empty';
                    const data = library(profile);
                    data.words = { ...data.words, [characters]: { characters, html: html || '', state, checkedAt: Date.now() } };
                    GM_setValue(libraryKey(profile), data);
                })().finally(() => pending.delete(key)));
            }
            await pending.get(key);
            if (panel === active) {
                renderSaved();
                status('', panel);
            }
        } catch (error) { status(error.message, panel); }
    }

    function element(tag, text, className) {
        const node = document.createElement(tag);
        if (text) node.textContent = text;
        if (className) node.className = className;
        return node;
    }

    function status(message, panel = active) {
        if (panel === active && panel?.root.isConnected) panel.status.textContent = message;
    }

    function button(label, action) {
        const node = element('button', label);
        node.type = 'button';
        node.addEventListener('click', async () => {
            const panel = active;
            node.disabled = true;
            try { await action(panel); }
            catch (error) { status(error.message, panel); }
            finally { node.disabled = false; }
        });
        return node;
    }

    function renderSaved() {
        if (!active) return;
        const { subject, content, source, root } = active;
        if (!root.isConnected) return;
        const entry = settings.profile ? cachedWord(settings.profile, subject.characters) : null;
        content.replaceChildren();
        if (entry?.characters === subject.characters && entry.state === 'ready') {
            content.append(sanitized(entry.html));
            source.textContent = `Anki · ${settings.profile} · Saved ${new Date(entry.checkedAt).toLocaleString()}`;
        } else {
            const messages = {
                missing: 'No exact Front match found in Anki.',
                duplicate: 'More than one Anki note has this Front. Resolve the duplicates in Anki.',
                'field-missing': 'The Anki note has no GeneratedNotes field.',
                empty: 'Not prepared yet. The Anki note’s GeneratedNotes field is empty.',
            };
            content.append(element('p', messages[entry?.state] || 'Loading notes from Anki…'));
            source.textContent = settings.profile ? `Anki · ${settings.profile}` : 'Saved explanations from Anki';
        }
    }

    function mount(subject, anchor) {
        if (active?.subject.id === subject.id && active.subject.characters === subject.characters && active.anchor === anchor && active.root.isConnected) return;
        removePanel();
        const root = element('section', '', 'subject-section');
        root.id = PANEL;
        root.append(element('h2', 'Generated Notes', 'subject-section__title'));
        const body = element('div', '', 'wkgn-body');
        const source = element('p', '', 'wkgn-source');
        const controls = element('div', '', 'wkgn-controls');
        const content = element('div', '', 'wkgn-content');
        const message = element('p', '', 'wkgn-status');
        message.setAttribute('role', 'status');
        controls.append(button('Refresh from Anki', lookup));
        const connection = element('details', '', 'wkgn-connection');
        connection.append(element('summary', 'Connection'));
        const label = element('label', 'AnkiConnect API key (only if configured) ');
        const input = element('input');
        input.type = 'password';
        input.autocomplete = 'off';
        input.value = settings.apiKey;
        label.append(input);
        connection.append(label, button('Connect to open Anki profile', async panel => {
            const apiKey = input.value.trim();
            const profile = await request('getActiveProfile', {}, apiKey);
            if (typeof profile !== 'string' || !profile) throw new Error('No Anki profile is open.');
            if (panel !== active) return;
            settings = { profile, apiKey };
            GM_setValue(SETTINGS, settings);
            renderSaved();
            connection.open = false;
            await lookup(panel);
        }));
        body.append(source, controls, connection, message, content);
        root.append(body);
        anchor.after(root);
        active = { root, anchor, subject, content, source, status: message };
        renderSaved();
        const panel = active;
        lookup(panel);
    }

    function removePanel() {
        active?.root.remove();
        active = null;
        // Remove markup restored from Turbo's page cache as well.
        document.getElementById(PANEL)?.remove();
    }

    function subjectData(subject) {
        const type = String(subject?.type || subject?.subject_category || '').toLowerCase().replaceAll('_', '');
        if (!['vocabulary', 'kanavocabulary'].includes(type) || !positiveId(subject.id) || !subject.characters) return null;
        return { id: Number(subject.id), characters: String(subject.characters).trim().normalize('NFC') };
    }

    function isReview() {
        return /^\/subjects\/review(?:\/|$)/.test(location.pathname) || /^\/subject-lessons\/[^/]+\/quiz(?:\/|$)/.test(location.pathname);
    }

    function reconcile() {
        if (!window.document) return;
        let subject = null;
        let anchor = null;
        if (/^\/vocabulary\/[^/]+\/?$/.test(location.pathname)) {
            const id = document.querySelector('meta[name="subject_id"]')?.content;
            const characters = document.querySelector('.page-header__prefix .subject-character__characters-text, .page-header__icon')?.textContent.trim();
            // URL/header agreement avoids attaching the old page during Turbo navigation.
            let slug = '';
            try { slug = decodeURIComponent(location.pathname.split('/')[2]); } catch { /* incomplete URL */ }
            if (positiveId(id) && characters && characters === slug) subject = { id: Number(id), characters: characters.normalize('NFC') };
            anchor = document.querySelector('.subject-section--reading')
                || document.querySelector('.subject-section--meaning');
        } else if (isReview()) {
            if (review.answered && review.frameReady) {
                subject = review.subject;
                anchor = document.querySelector('#subject-info .subject-section--reading')
                    || document.querySelector('#subject-info .subject-section--meaning');
            }
        } else {
            const id = location.pathname.match(/^\/subject-lessons\/[^/]+\/(\d+)\/?$/)?.[1];
            const header = document.querySelector('.character-header--vocabulary');
            const characters = header?.querySelector('.character-header__characters')?.textContent.trim();
            if (positiveId(id) && characters && location.hash === '#meaning') {
                subject = { id: Number(id), characters: characters.normalize('NFC') };
                const tab = document.getElementById('meaning');
                anchor = tab?.querySelector('.subject-slide__sections')?.lastElementChild;
                if (anchor?.id === PANEL) anchor = active?.anchor;
            }
        }
        if (subject && anchor) mount(subject, anchor);
        else removePanel();
    }

    function schedule() {
        if (schedule.pending) return;
        schedule.pending = true;
        queueMicrotask(() => { schedule.pending = false; reconcile(); });
    }

    // WaniKani emits these events for both correct and incorrect submitted answers.
    // No quiz answer or scheduling operation is performed by this script.
    window.addEventListener('willShowNextQuestion', event => {
        review = { subject: subjectData(event.detail?.subject), answered: false, frameReady: false };
        removePanel();
    });
    window.addEventListener('didAnswerQuestion', event => {
        review = { subject: subjectData(event.detail?.subjectWithStats?.subject), answered: true, frameReady: false };
        removePanel();
    });
    document.addEventListener('turbo:frame-load', event => {
        if (isReview() && event.target.id === 'subject-info' && review.answered && review.subject) {
            const src = event.target.getAttribute('src') || '';
            // Reject a late info-frame response for a different subject.
            review.frameReady = new RegExp(`(?:/|subject_id=)${review.subject.id}(?:[/?&#]|$)`).test(src);
        }
        schedule();
    });
    document.addEventListener('turbo:before-cache', removePanel);
    document.addEventListener('turbo:before-render', () => { removePanel(); review.frameReady = false; });
    document.addEventListener('turbo:load', schedule);
    window.addEventListener('hashchange', schedule);
    window.addEventListener('popstate', schedule);

    const observer = new MutationObserver(records => {
        // Ignore our own panel updates to avoid render/observer loops.
        if (records.some(record => !record.target.closest?.(`#${PANEL}`))) schedule();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-subject-id'] });
    if (typeof GM_addValueChangeListener === 'function') {
        GM_addValueChangeListener(SETTINGS, (_key, _old, value, remote) => {
            if (!remote) return;
            settings = value;
            removePanel();
            schedule();
        });
    }
    window.addEventListener('focus', () => {
        renderSaved();
        const panel = active;
        lookup(panel);
    });

    const style = element('style');
    style.textContent = `
        #${PANEL} { margin: 24px 0; }
        #${PANEL} .wkgn-body { padding: 12px 0; }
        #${PANEL} .wkgn-controls { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
        #${PANEL} button { padding: 6px 12px; border: 1px solid #aaa; border-radius: 4px; background: #f8f8f8; color: #333; cursor: pointer; font: inherit; }
        #${PANEL} button:disabled { opacity: .6; cursor: wait; }
        #${PANEL} .wkgn-source, #${PANEL} .wkgn-status { color: #666; font-size: .9em; }
        #${PANEL} .wkgn-connection { margin: 10px 0; }
        #${PANEL} .wkgn-connection summary { cursor: pointer; }
        #${PANEL} .wkgn-connection label { display: block; margin: 10px 0; }
        #${PANEL} input { max-width: 100%; padding: 5px; }
        #${PANEL} .wkgn-content { line-height: 1.7; overflow-wrap: anywhere; }
        #${PANEL} .wkgn-content h2, #${PANEL} .wkgn-content h3, #${PANEL} .wkgn-content h4 { font-size: 1.1em; font-weight: 600; border-top: 1px solid #ddd; padding-top: 16px; margin: 20px 0 8px; }
        #${PANEL} .wkgn-content p { margin: 8px 0; }
        #${PANEL} .wkgn-content ul, #${PANEL} .wkgn-content ol { padding-left: 24px; }
    `;
    document.head.append(style);
    reconcile();
})();
