// ==UserScript==
// @name         Wanikani: Press K for Audio
// @namespace    https://github.com/vbomedeiros/tampermonkey-plugins
// @version      1.0.0
// @description  Press K to play the audio on WaniKani lesson and item pages.
// @author       Victor Medeiros
// @match        https://www.wanikani.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=wanikani.com
// @grant        none
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/vbomedeiros/tampermonkey-plugins/main/plugins/wanikani-press-k-for-audio/wanikani-press-k-for-audio.user.js
// @downloadURL  https://raw.githubusercontent.com/vbomedeiros/tampermonkey-plugins/main/plugins/wanikani-press-k-for-audio/wanikani-press-k-for-audio.user.js
// ==/UserScript==

;(function () {
    'use strict';

    (function register() {
        if (!window.keyboardManager) { setTimeout(register, 50); return; }

        window.keyboardManager.registerHotKey({
            key: 'k',
            callback: function () {
                let listItem = document.querySelector('.reading-with-audio__audio-item[data-audio-player-auto-play-value="false"]');
                if (!listItem) {
                    listItem = document.querySelector('.reading-with-audio__audio-item');
                }
                if (listItem) {
                    listItem.querySelector('.reading-with-audio__icons').click();
                }
            }
        });
    })();
})();
