# Tampermonkey MCP development workflow

Use the [official Tampermonkey MCP server](https://github.com/Tampermonkey/tampermonkey-mcp)
to read and update installed userscripts, then use browser tools to test the live
page. MCP manages script source; it does not inspect the page or prove that the
script ran correctly.

## Setup and pairing

1. Install Tampermonkey and [Tampermonkey Editors for Chrome](https://chromewebstore.google.com/detail/tampermonkey-editors/lieodnapokbjkkdkhdljlllmgkmdokcm).
2. Install the server and register it in Codex:

   ```sh
   npm install -g tampermonkey-mcp
   codex mcp add tampermonkey -- tampermonkey-mcp
   ```

   If Codex cannot find the executable, use absolute paths to Node and the
   installed package's `dist/index.js`. This machine was configured that way.
   Server version 0.0.5 was used for the initial successful test.
3. Restart Codex if the new server's tools are not available.
4. Call `tampermonkey_get_connection_code` and enter the returned code in the
   Tampermonkey Editors extension in Chrome.
5. Verify pairing with `tampermonkey_list`, locating the intended script by both
   name and namespace. Do not assume the returned list respects its filter.

Pairing codes belong to the running server. After a server restart or lost
connection, obtain a fresh code and pair again. Do not put pairing codes or
userscript storage contents in the repository. Browser automation may block
extension pages; ask the user to complete the extension UI step when needed.

## Edit, install, and verify

1. Read the installed script with `tampermonkey_get`, using the source path
   returned by `tampermonkey_list`. Do not hard-code a browser-specific script ID.
2. Compare it with the repository copy. Preserve independent browser edits;
   investigate differences before overwriting them.
3. Edit the repository `.user.js` file and bump `@version` for a release. Run
   applicable tests and a JavaScript syntax check.
4. Call `tampermonkey_patch` with the complete repository source and the
   `lastModified` value returned by the read, when available. Stop and reread if
   there is a concurrent-edit conflict. Patch only the intended script's source,
   not its storage, dependencies, or unrelated scripts.
5. Read the installed script back and compare its full source with the repository.
6. Reload the target page in the Chrome profile containing Tampermonkey. Check
   actual content, placement, controls, navigation, duplicate insertion, and stale
   content. Test relevant asynchronous flows; distinguish live verification from
   synthetic DOM tests. Record any flows that were not tested.
7. Remove temporary instrumentation from both copies. Follow `CLAUDE.md` for
   commit and push authorization: an explicit user request is sufficient; do not
   ask again. Include a descriptive commit message and a `Test plan:` section
   recording checks performed, results, and relevant untested flows.

Installing through MCP does not commit or publish a GitHub change. Keep the local
and installed copies aligned so a later auto-update does not replace unrecorded
browser-only changes.

## Generated Notes checks

```sh
npm ci --prefix plugins/wanikani-generated-notes
npm test --prefix plugins/wanikani-generated-notes
node --check plugins/wanikani-generated-notes/wanikani-generated-notes.user.js
git diff --check
```

Use a word with an existing Anki `GeneratedNotes` field to verify successful
content loading, and a word without a match to verify the empty state. Keep Anki
and AnkiConnect running. Navigate between words and back; there should be only
one Generated Notes panel and no content retained from the previous word.
See the [plugin README](plugins/wanikani-generated-notes/README.md) for review
behavior and the limits of the recorded live testing.
