// ==UserScript==
// @name         WaniKani Vocabulary Analysis
// @namespace    https://github.com/vbomedeiros/tampermonkey-plugins
// @version      1.2.0
// @description  Adds a ChatGPT-powered etymology and analysis section to WaniKani vocabulary lessons
// @author       Victor Medeiros
// @match        https://www.wanikani.com/subject-lessons/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      api.openai.com
// @require      https://greasyfork.org/scripts/430565-wanikani-item-info-injector/code/WaniKani%20Item%20Info%20Injector.user.js?version=1380162
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/vbomedeiros/tampermonkey-plugins/main/plugins/wanikani-vocab-analysis/wanikani-vocab-analysis.user.js
// @downloadURL  https://raw.githubusercontent.com/vbomedeiros/tampermonkey-plugins/main/plugins/wanikani-vocab-analysis/wanikani-vocab-analysis.user.js
// ==/UserScript==

(function () {
    'use strict';

    const CACHE_PREFIX = 'wk_analysis_';
    const API_KEY_STORAGE = 'wk_analysis_api_key';

    const SYSTEM_PROMPT = `This GPT specializes in explaining the meaning and etymology of Japanese words, with a focus on kanji composition. When given a Japanese word, it provides a structured explanation in fluent English, following a consistent six-part layout:

1. **Word Overview** – Shows the word in kanji (and hiragana if helpful), gives a concise English definition, and notes whether it is native Japanese, Sino-Japanese, or borrowed.

2. **Kanji Breakdown** – Explains each kanji: its literal meaning, nuance, and reading in the compound. Describes how the kanji meanings combine to express the concept.

3. **Etymology and Cultural Context** – Provides background on how the word originated or evolved, and notes any cultural, historical, or linguistic significance.

4. **Example Phrases** – Provides 2–3 short, natural Japanese example sentences using the word, with English translations. Keeps grammar appropriate for intermediate learners and prioritizes clarity. Highlights the word in bold within the sentence.

5. **Dictionary Definition (Japanese)** – Provides a concise dictionary-style definition modeled after Sanseido. The entry is written entirely in Japanese using simple JLPT N3–N5 level vocabulary. It includes the reading in hiragana, the usual kanji＋hiragana spelling in brackets, and a part-of-speech marker such as ｟名｠ or ｟自他五｠. If there is a clear antonym, include it in parentheses with an arrow (↔...). The format follows this structure:
reading［kanji］｟POS｠
short definition sentence.

6. **In Summary** – Produces a concise wrap-up (under 500 characters) of the word's meaning and how the kanji contribute to it. The model first generates a draft summary, counts its characters, and silently iterates at least once to expand and enrich the summary if it is too short or lacking context. The goal is to make full use of the 500-character limit while maintaining clarity and accuracy. This summary includes both the English meaning and each kanji's role or meaning, written in a style suitable for direct copy-paste into WaniKani notes for quick reference.

The GPT always answers in English except for the dictionary definition in section 5, which is written in Japanese. It uses kanji or hiragana when referencing Japanese terms but never uses romaji. Explanations should remain clear, structured, and engaging for learners and curious readers.`;

    // ── API key ──────────────────────────────────────────────────────────────

    function getApiKey() {
        let key = GM_getValue(API_KEY_STORAGE, '');
        if (!key) {
            key = (prompt('WaniKani Vocabulary Analysis\nEnter your OpenAI API key:') || '').trim();
            if (key) GM_setValue(API_KEY_STORAGE, key);
        }
        return key;
    }

    // ── ChatGPT call ─────────────────────────────────────────────────────────

    function callChatGPT(vocab, apiKey) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://api.openai.com/v1/chat/completions',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                data: JSON.stringify({
                    model: 'gpt-4o',
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        { role: 'user', content: vocab },
                    ],
                    max_tokens: 1500,
                }),
                onload(r) {
                    if (r.status === 200) {
                        try {
                            resolve(JSON.parse(r.responseText).choices[0].message.content);
                        } catch {
                            reject(new Error('Failed to parse API response'));
                        }
                    } else if (r.status === 401) {
                        GM_setValue(API_KEY_STORAGE, '');
                        reject(new Error('Invalid API key — cleared. Click again to re-enter.'));
                    } else {
                        let msg = `API error ${r.status}`;
                        try { msg += ': ' + JSON.parse(r.responseText).error?.message; } catch {}
                        reject(new Error(msg));
                    }
                },
                onerror() { reject(new Error('Network request failed')); },
            });
        });
    }

    // ── Markdown renderer ────────────────────────────────────────────────────

    function renderMarkdown(md) {
        const esc = md
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        const bold = s => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        const lines = esc.split('\n');
        const out = [];
        let inList = false;

        for (const raw of lines) {
            const heading = raw.match(/^#{1,4} (.+)/);
            const listItem = raw.match(/^(?:[-*]|\d+\.) (.+)/);

            if (heading) {
                if (inList) { out.push('</ul>'); inList = false; }
                out.push(`<h4 style="margin:16px 0 4px;font-size:1em;">${bold(heading[1])}</h4>`);
            } else if (listItem) {
                if (!inList) { out.push('<ul style="margin:4px 0 4px 20px;padding:0;">'); inList = true; }
                out.push(`<li>${bold(listItem[1])}</li>`);
            } else if (!raw.trim()) {
                if (inList) { out.push('</ul>'); inList = false; }
            } else {
                if (inList) { out.push('</ul>'); inList = false; }
                out.push(`<p style="margin:4px 0;">${bold(raw)}</p>`);
            }
        }
        if (inList) out.push('</ul>');
        return out.join('');
    }

    // ── Section UI ───────────────────────────────────────────────────────────

    function buildSection(itemObject) {
        const { id, characters: vocab } = itemObject;
        const cached = GM_getValue(CACHE_PREFIX + id, '');

        const wrapper = document.createElement('div');

        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:12px;';

        const analyzeBtn = document.createElement('button');
        analyzeBtn.textContent = cached ? 'Refresh' : 'Get Analysis';
        analyzeBtn.style.cssText = 'padding:6px 14px;cursor:pointer;border-radius:4px;border:1px solid #aaa;background:#f5f5f5;font-size:.9em;';

        const keyBtn = document.createElement('button');
        keyBtn.textContent = '⚙ API Key';
        keyBtn.title = 'Update OpenAI API key';
        keyBtn.style.cssText = 'padding:5px 10px;cursor:pointer;border-radius:4px;border:1px solid #ccc;background:#f5f5f5;font-size:.85em;color:#666;';

        header.append(analyzeBtn, keyBtn);

        const status = document.createElement('div');
        status.style.cssText = 'font-size:.9em;color:#666;margin-bottom:8px;min-height:1em;';

        const content = document.createElement('div');
        content.style.cssText = 'font-size:.95em;line-height:1.65;';
        if (cached) content.innerHTML = renderMarkdown(cached);

        wrapper.append(header, status, content);

        analyzeBtn.addEventListener('click', async () => {
            analyzeBtn.disabled = true;
            status.textContent = 'Loading…';
            content.innerHTML = '';
            try {
                const key = getApiKey();
                if (!key) { status.textContent = 'No API key provided.'; return; }
                const text = await callChatGPT(vocab, key);
                GM_setValue(CACHE_PREFIX + id, text);
                content.innerHTML = renderMarkdown(text);
                analyzeBtn.textContent = 'Refresh';
                status.textContent = '';
            } catch (e) {
                status.textContent = e.message;
            } finally {
                analyzeBtn.disabled = false;
            }
        });

        keyBtn.addEventListener('click', () => {
            const key = (prompt('Enter new OpenAI API key:') || '').trim();
            if (key) GM_setValue(API_KEY_STORAGE, key);
        });

        return wrapper;
    }

    // ── Register with Item Info Injector ─────────────────────────────────────
    // wkItemInfo initializes asynchronously via WKOF; wait for it before registering.

    window.wkof.include('wkItemInfo');
    window.wkof.ready('wkItemInfo').then(() => {
        ['vocabulary', 'kanaVocabulary'].forEach(type => {
            window.wkItemInfo
                .on('lesson')
                .forType(type)
                .under('meaning')
                .append('Vocabulary Analysis', buildSection);
        });
    });

})();
