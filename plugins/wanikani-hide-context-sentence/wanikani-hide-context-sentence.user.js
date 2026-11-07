// ==UserScript==
// @name         WaniKani Hide Context Sentence
// @namespace    https://github.com/vbomedeiros/tampermonkey-plugins
// @version      2.1.1
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

    function setup() {
        if (url_matches()) inject_css();
    }

    // Current WaniKani supplies .context-sentences/.wk-text itself. CSS also
    // covers content added later by lesson/review rendering without DOM edits.
    document.addEventListener('turbo:load', setup);
    setup(); // The initial Turbo event may precede Tampermonkey startup.

}());
