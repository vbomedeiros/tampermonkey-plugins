// ==UserScript==
// @name         WaniKani Hide Context Sentence
// @namespace    https://github.com/vbomedeiros/tampermonkey-plugins
// @version      2.1.0
// @description  Hide context sentences until hovered.
// @author       Robin Findley
// @match        https://www.wanikani.com/*
// @match        https://preview.wanikani.com/*
// @copyright    2015+, Robin Findley
// @license      MIT; http://opensource.org/licenses/MIT
// @grant        none
// @updateURL    https://raw.githubusercontent.com/vbomedeiros/tampermonkey-plugins/main/plugins/wanikani-hide-context-sentence/wanikani-hide-context-sentence.user.js
// @downloadURL  https://raw.githubusercontent.com/vbomedeiros/tampermonkey-plugins/main/plugins/wanikani-hide-context-sentence/wanikani-hide-context-sentence.user.js
// ==/UserScript==

;(function () {

    const match_patterns = [
        '/subjects/extra_study',
        '/subject-lessons/*',
        '/subjects/*/lesson',
        '/subjects/review',
        '/vocabulary/*'
    ];

    function url_matches(url) {
        url = url || window.location.pathname;
        if (url[0] !== '/') url = new URL(url).pathname;
        return match_patterns.some(pattern => {
            const regex = new RegExp(pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*'));
            return regex.test(url);
        });
    }

    function inject_css() {
        if (document.querySelector('style[name="hide_context_sentence"]')) return;
        document.head.insertAdjacentHTML('beforeend', `
            <style name="hide_context_sentence" type="text/css">
            .context-sentence-group p:not([lang="ja"]):not(:hover),
            .subject-collocations__collocation-text:not([lang="ja"]):not(:hover),
            .context-sentences .wk-text:not([lang="ja"]):not(:hover)
            {
                background-color: #ccc;
                color: #ccc;
                text-shadow: none;
            }
            </style>
        `);
    }

    function add_context_sentence_classes(root) {
        Array.from(root.querySelectorAll('.subject-section__subtitle'))
            .find(node => node.textContent.includes('Context Sentences'))
            ?.closest('section')
            ?.querySelectorAll('.subject-section__text')
            ?.forEach(elem => elem.classList.add('context-sentence-group'));
    }

    // Add classes to the incoming body before Turbo swaps it in, preventing a flash.
    // No URL check here — harmless if the new page has no context sentences.
    document.documentElement.addEventListener('turbo:before-render', e => {
        add_context_sentence_classes(e.detail.newBody);
    });

    // Fires on initial hard load and after every Turbo navigation.
    document.documentElement.addEventListener('turbo:load', () => {
        if (!url_matches()) return;
        inject_css();
        add_context_sentence_classes(document);
    });

}());
