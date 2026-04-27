// ==UserScript==
// @name         WaniKani Vocabulary Analysis
// @namespace    https://github.com/vbomedeiros/tampermonkey-plugins
// @version      1.8.0
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

    const CACHE_PREFIX = 'wk_analysis_v3_';
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

The GPT always answers in English except for the dictionary definition in section 5, which is written in Japanese. It uses kanji or hiragana when referencing Japanese terms but never uses romaji. Explanations should remain clear, structured, and engaging for learners and curious readers.

Format your response as HTML with inline styles only — no <style> blocks, no classes, no markdown, no preamble, no wrapper element around the whole response. Use this structure for each section:

<div style="border-top:1px solid #e0e0e0;margin-top:20px;padding-top:16px;">
<h4 style="font-size:1.05em;font-weight:bold;margin:0 0 10px 0;">1. Section Name</h4>
<p style="margin:0 0 8px 0;line-height:1.65;">Paragraph text. Use <strong> for bold key terms.</strong></p>
</div>

Additional rules:
- Wrap every section in the <div> above (with border-top), including section 1
- In section 4 (Example Phrases), format each example as: <p style="margin:0 0 2px 0;"><strong>Japanese sentence</strong></p><p style="margin:0 0 10px 0;color:#666;font-size:.9em;">English translation</p>
- In section 5 (Dictionary Definition), put the entry inside: <div style="background:#f5f5f5;padding:10px 14px;border-radius:4px;font-family:monospace;line-height:1.8;margin:4px 0;">
- Output ONLY the HTML — nothing else.`;

    // ── API key ──────────────────────────────────────────────────────────────

    function getApiKey() {
        let key = GM_getValue(API_KEY_STORAGE, '');
        if (!key) {
            key = (prompt('WaniKani Vocabulary Analysis\nEnter your OpenAI API key:') || '').trim();
            if (key) GM_setValue(API_KEY_STORAGE, key);
        }
        return key;
    }

    // ── API call ─────────────────────────────────────────────────────────────
    //
    // True streaming requires ReadableStream, which GM_xmlhttpRequest cannot
    // deliver (it buffers the full response). We try unsafeWindow.fetch first
    // since it supports ReadableStream and OpenAI sets CORS headers. If the
    // page's CSP blocks the connection (TypeError), we fall back to
    // GM_xmlhttpRequest which bypasses CSP but can only parse the full body.

    // Parse one SSE data line. Returns new accumulated text, or null on [DONE].
    function parseLine(line, accumulated, onDelta) {
        if (!line.startsWith('data: ')) return accumulated;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') return null;
        try {
            const event = JSON.parse(payload);
            if (event.type === 'response.output_text.delta' && event.delta) {
                accumulated += event.delta;
                onDelta?.(accumulated);
            }
        } catch {}
        return accumulated;
    }

    async function streamViaFetch(apiKey, body, onDelta) {
        const pageWindow = window.unsafeWindow || window;
        const response = await pageWindow.fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body,
        });
        if (response.status === 401) {
            GM_setValue(API_KEY_STORAGE, '');
            throw new Error('Invalid API key — cleared. Click again to re-enter.');
        }
        if (!response.ok) {
            let msg = `API error ${response.status}`;
            try { const d = await response.json(); msg += ': ' + d.error?.message; } catch {}
            throw new Error(msg);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let accumulated = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) {
                const next = parseLine(line, accumulated, onDelta);
                if (next === null) return accumulated; // [DONE]
                accumulated = next;
            }
        }
        return accumulated;
    }

    function fallbackViaGM(apiKey, body, onDelta) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://api.openai.com/v1/responses',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                data: body,
                onload(r) {
                    if (r.status === 401) {
                        GM_setValue(API_KEY_STORAGE, '');
                        reject(new Error('Invalid API key — cleared. Click again to re-enter.'));
                        return;
                    }
                    if (r.status !== 200) {
                        let msg = `API error ${r.status}`;
                        try { msg += ': ' + JSON.parse(r.responseText).error?.message; } catch {}
                        reject(new Error(msg));
                        return;
                    }
                    let accumulated = '';
                    for (const line of r.responseText.split('\n')) {
                        const next = parseLine(line, accumulated, null);
                        if (next !== null) accumulated = next;
                    }
                    onDelta?.(accumulated);
                    resolve(accumulated);
                },
                onerror() { reject(new Error('Network request failed')); },
            });
        });
    }

    function callChatGPT(vocab, apiKey, onDelta) {
        const body = JSON.stringify({
            model: 'gpt-5.5',
            instructions: SYSTEM_PROMPT,
            input: vocab,
            reasoning: { effort: 'high' },
            stream: true,
        });
        return streamViaFetch(apiKey, body, onDelta).catch(e => {
            if (e instanceof TypeError) return fallbackViaGM(apiKey, body, onDelta);
            throw e;
        });
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
        if (cached) content.innerHTML = cached;

        wrapper.append(header, status, content);

        analyzeBtn.addEventListener('click', async () => {
            analyzeBtn.disabled = true;
            status.textContent = 'Loading…';
            content.innerHTML = '';
            try {
                const key = getApiKey();
                if (!key) { status.textContent = 'No API key provided.'; return; }
                if (!vocab) { status.textContent = 'No vocabulary characters available.'; return; }
                const text = await callChatGPT(vocab, key, (partial) => {
                    if (status.textContent === 'Loading…') status.textContent = '';
                    content.innerHTML = partial;
                });
                if (!text.trimStart().startsWith('<')) {
                    status.textContent = 'Unexpected response format — not cached.';
                    content.textContent = text;
                    return;
                }
                GM_setValue(CACHE_PREFIX + id, text);
                content.innerHTML = text;
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
    // wkItemInfo is a standalone library that sets window.wkItemInfo at
    // document.readyState === 'interactive'. Poll until it's available.

    // Scripts with GM_* grants run in a Tampermonkey sandbox where window is a
    // proxy. The injector sets wkItemInfo on unsafeWindow (the real page window),
    // not the sandbox window, so we must look there first.
    (function register() {
        const wkItemInfo = (window.unsafeWindow || window).wkItemInfo;
        if (!wkItemInfo) { setTimeout(register, 50); return; }
        ['vocabulary', 'kanaVocabulary'].forEach(type => {
            wkItemInfo
                .on('lesson')
                .forType(type)
                .under('meaning')
                .append('Vocabulary Analysis', buildSection);
        });
    })();

})();
