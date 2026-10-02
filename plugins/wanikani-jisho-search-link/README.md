# Wanikani: Jisho Search Link

Adds a link to Jisho.org search results below the search results on WaniKani search pages, so you can quickly look up an item in an external dictionary.

## Install

Click the link below while Tampermonkey is installed in your browser:

[Install wanikani-jisho-search-link.user.js](https://raw.githubusercontent.com/vbomedeiros/tampermonkey-plugins/main/plugins/wanikani-jisho-search-link/wanikani-jisho-search-link.user.js)

## What it does

- On any WaniKani search page (`/search?query=…`), injects a "Search … on Jisho.org" link below the search results
- Opens Jisho in a new tab with the same query pre-filled

## Notes

- Initializes immediately, even if the first `turbo:load` event has already fired.
- Handles Turbo navigation, browser history, and delayed or replaced search results.
- Updates the existing link for the current query without creating duplicates, and removes it outside search results.
