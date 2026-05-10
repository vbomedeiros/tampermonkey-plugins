// ==UserScript==
// @name         Wanikani: Jisho Search Link
// @namespace    https://github.com/vbomedeiros/tampermonkey-plugins
// @version      1.0.2
// @description  Adds a link to Jisho.org search results below the search results on Wanikani search pages.
// @author       Victor Medeiros
// @match        https://www.wanikani.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=wanikani.com
// @grant        none
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/vbomedeiros/tampermonkey-plugins/main/plugins/wanikani-jisho-search-link/wanikani-jisho-search-link.user.js
// @downloadURL  https://raw.githubusercontent.com/vbomedeiros/tampermonkey-plugins/main/plugins/wanikani-jisho-search-link/wanikani-jisho-search-link.user.js
// ==/UserScript==

(function() {
    'use strict';

    function inject() {
        if (!location.pathname.startsWith('/search')) return false;
        if (document.getElementById('jisho-search-link')) return true;

        const searchResults = document.querySelector('.search-results');
        if (!searchResults) return false;

        const query = new URLSearchParams(window.location.search).get('query');
        if (!query) return false;

        const jishoLink = document.createElement('a');
        jishoLink.href = `https://jisho.org/search/${encodeURIComponent(query)}`;
        jishoLink.target = '_blank';
        jishoLink.textContent = `Search "${query}" on Jisho.org`;

        const jishoDiv = document.createElement('div');
        jishoDiv.id = 'jisho-search-link';
        jishoDiv.style.marginTop = '20px';
        jishoDiv.appendChild(jishoLink);

        searchResults.parentNode.insertBefore(jishoDiv, searchResults.nextSibling);
        return true;
    }

    document.addEventListener('turbo:load', () => {
        if (inject()) return;

        // .search-results not yet in DOM (loaded async by Turbo Frame) — watch for it
        const observer = new MutationObserver(() => {
            if (inject()) observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => observer.disconnect(), 5000);
    });
})();
