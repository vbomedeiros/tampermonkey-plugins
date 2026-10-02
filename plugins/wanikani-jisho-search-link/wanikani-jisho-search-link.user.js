// ==UserScript==
// @name         Wanikani: Jisho Search Link
// @namespace    https://github.com/vbomedeiros/tampermonkey-plugins
// @version      1.0.3
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
        const existing = document.getElementById('jisho-search-link');
        const searchResults = document.querySelector('.search-results');
        const query = new URLSearchParams(location.search).get('query');
        if (location.pathname !== '/search' || !searchResults || !query) {
            existing?.remove();
            return;
        }

        const jishoDiv = existing || document.createElement('div');
        if (!existing) {
            jishoDiv.id = 'jisho-search-link';
            jishoDiv.style.marginTop = '20px';
            const link = document.createElement('a');
            link.target = '_blank';
            jishoDiv.appendChild(link);
        }
        const jishoLink = jishoDiv.querySelector('a');
        const href = `https://jisho.org/search/${encodeURIComponent(query)}`;
        const label = `Search "${query}" on Jisho.org`;
        if (jishoLink.getAttribute('href') !== href) jishoLink.href = href;
        if (jishoLink.textContent !== label) jishoLink.textContent = label;
        // Results may be replaced independently of the rest of the page.
        if (searchResults.nextElementSibling !== jishoDiv) searchResults.after(jishoDiv);
    }

    let scheduled = false;
    function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            inject();
        });
    }

    document.addEventListener('turbo:load', schedule);
    document.addEventListener('turbo:render', schedule);
    window.addEventListener('popstate', schedule);
    new MutationObserver(schedule).observe(document.documentElement, {
        childList: true, subtree: true,
    });
    // Tampermonkey may start after the initial turbo:load event has fired.
    schedule();
})();
