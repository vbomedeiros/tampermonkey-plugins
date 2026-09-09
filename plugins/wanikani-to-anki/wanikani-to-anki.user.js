// ==UserScript==
// @name         WaniKani to Anki
// @namespace    https://github.com/vbomedeiros/tampermonkey-plugins
// @version      5.0.1
// @description  Build easy-to-copy HTML source for Anki HTML editor
// @author       Victor Medeiros
// @match        https://www.wanikani.com/vocabulary/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=wanikani.com
// @require      https://greasyfork.org/scripts/430565-wanikani-item-info-injector/code/WaniKani%20Item%20Info%20Injector.user.js?version=1326536
// @grant        none
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/vbomedeiros/tampermonkey-plugins/main/plugins/wanikani-to-anki/wanikani-to-anki.user.js
// @downloadURL  https://raw.githubusercontent.com/vbomedeiros/tampermonkey-plugins/main/plugins/wanikani-to-anki/wanikani-to-anki.user.js
// ==/UserScript==

;(function () {
    if (!window.wkof) {
        alert('WaniKani to Anki requires WaniKani Open Framework.\n' +
              'You will now be forwarded to installation instructions.');
        window.location.href = 'https://community.wanikani.com/t/instructions-installing-wanikani-open-framework/28549';
        return;
    }

    let subjectsById;

    window.wkof.include('ItemData');
    window.wkof.ready('ItemData')
        .then(() => window.wkof.ItemData.get_items('subjects'))
        .then(subjects => {
            subjectsById = new Map(subjects.map(subject => [subject.id, subject]));
            register();
        })
        .catch(err => {
            console.error('WaniKani to Anki: failed to load WKOF subject data', err);
        });

    // Register with the injector so the section is re-built on every Turbo
    // navigation, not just on the initial hard load.
    function register() {
        if (!window.wkItemInfo) { setTimeout(register, 50); return; }
        ['vocabulary', 'kanaVocabulary'].forEach(type => {
            window.wkItemInfo
                .on('itemPage')
                .forType(type)
                .under('meaning')
                .append('For Anki HTML import', buildSection);
        });
    }

    function buildSection(itemObject) {
        console.log("WaniKani to Anki: notified!");
        return loadWanikaniToAnkiSection(itemObject);
    }

    function inlineMarkStyles(root) {
        const marks = root.querySelectorAll("mark");

        marks.forEach((mark) => {
            const title = mark.getAttribute("title");
            const span = document.createElement("span");

            switch (title) {
                case "Vocabulary":
                    span.style.color = "#fff";
                    span.style.backgroundColor = "#aa00ff";
                    break;
                case "Kanji":
                    span.style.color = "#fff";
                    span.style.backgroundColor = "#ff00aa";
                    break;
                case "Radical":
                    span.style.color = "#fff";
                    span.style.backgroundColor = "#00aaff";
                    break;
                case "Reading":
                    span.style.color = "#fff";
                    span.style.backgroundColor = "#555555";
                    break;
                default:
                    break;
            }

            span.innerHTML = mark.innerHTML;
            mark.parentNode.replaceChild(span, mark);
        });
    }

    function replaceTag(el, newTagName) {
        const replacement = document.createElement(newTagName);

        for (const attr of [...el.attributes]) {
            if (attr.name !== "class") {
                replacement.setAttribute(attr.name, attr.value);
            }
        }

        replacement.innerHTML = el.innerHTML;
        el.replaceWith(replacement);
        return replacement;
    }

    function normalizeHtmlForAnki(root) {
        root.querySelectorAll("[class]").forEach((el) => el.removeAttribute("class"));

        root.querySelectorAll("section").forEach((section) => {
            replaceTag(section, "div");
        });

        // Use div instead of p to avoid paragraph margins in Anki.
        root.querySelectorAll("p").forEach((p) => {
            replaceTag(p, "div");
        });
    }

    function trimBlockEdgeWhitespace(root) {
        const blockSelector = "div";

        root.querySelectorAll(blockSelector).forEach((block) => {
            while (
                block.firstChild &&
                block.firstChild.nodeType === Node.TEXT_NODE &&
                block.firstChild.nodeValue.trim() === ""
            ) {
                block.removeChild(block.firstChild);
            }

            while (
                block.lastChild &&
                block.lastChild.nodeType === Node.TEXT_NODE &&
                block.lastChild.nodeValue.trim() === ""
            ) {
                block.removeChild(block.lastChild);
            }

            if (block.firstChild && block.firstChild.nodeType === Node.TEXT_NODE) {
                block.firstChild.nodeValue = block.firstChild.nodeValue.replace(/^\s+/, "");
            }

            if (block.lastChild && block.lastChild.nodeType === Node.TEXT_NODE) {
                block.lastChild.nodeValue = block.lastChild.nodeValue.replace(/\s+$/, "");
            }
        });
    }

    function cleanupTopLevelWhitespace(root) {
        const nodes = [...root.childNodes];

        for (const node of nodes) {
            if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() === "") {
                root.removeChild(node);
            }
        }
    }

    function serializeNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.nodeValue;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
            return "";
        }

        const tag = node.tagName.toLowerCase();

        if (tag === "br") {
            return "<br>";
        }

        return node.outerHTML;
    }

    function formatHtmlForReading(root) {
        const pieces = [];
        const nodes = [...root.childNodes];

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const html = serializeNode(node);

            if (!html) continue;

            pieces.push(html);

            if (node.nodeType === Node.ELEMENT_NODE && node.tagName.toLowerCase() === "br") {
                pieces.push("\n");
            } else if (i < nodes.length - 1) {
                pieces.push("\n");
            }
        }

        return pieces.join("").trim();
    }

    function getAnkiHtml(container) {
        const clone = container.cloneNode(true);

        inlineMarkStyles(clone);
        normalizeHtmlForAnki(clone);
        trimBlockEdgeWhitespace(clone);
        cleanupTopLevelWhitespace(clone);

        return formatHtmlForReading(clone);
    }

    function loadWanikaniToAnkiSection(itemObject) {
        // The injector wraps the returned element in a titled <section>.
        // Return a plain container with just the controls and content.
        const container = document.createElement("div");

        const copyControls = document.createElement("section");
        copyControls.classList.add("subject-section__subsection");
        container.appendChild(copyControls);

        const copyButton = document.createElement("button");
        copyButton.textContent = "Copy HTML source";
        copyControls.appendChild(copyButton);

        const status = document.createElement("span");
        status.style.marginLeft = "12px";
        copyControls.appendChild(status);

        const ankiContent = document.createElement("section");
        ankiContent.classList.add("subject-section__subsection");
        ankiContent.id = "ankiImportSection";
        container.appendChild(ankiContent);

        const htmlPreviewTitle = document.createElement("h3");
        htmlPreviewTitle.textContent = "HTML source to paste into Anki HTML editor:";
        container.appendChild(htmlPreviewTitle);

        const htmlSourceBox = document.createElement("textarea");
        htmlSourceBox.id = "ankiHtmlSource";
        htmlSourceBox.readOnly = true;
        htmlSourceBox.style.width = "100%";
        htmlSourceBox.style.minHeight = "320px";
        htmlSourceBox.style.fontFamily = "monospace";
        htmlSourceBox.style.whiteSpace = "pre";
        htmlSourceBox.style.boxSizing = "border-box";
        container.appendChild(htmlSourceBox);

        function refreshHtmlSource() {
            const html = getAnkiHtml(ankiContent);
            htmlSourceBox.value = html;
            return html;
        }

        copyButton.onclick = async function () {
            try {
                const html = refreshHtmlSource();
                await navigator.clipboard.writeText(html);
                status.textContent = "Copied HTML source.";
            } catch (err) {
                console.error(err);
                status.textContent = "Copy failed. Select the textarea and copy manually.";
                htmlSourceBox.focus();
                htmlSourceBox.select();
            }
        };

        function appendBreak() {
            ankiContent.appendChild(document.createElement("br"));
        }

        function cloneElements(elementsToCopy, initialString) {
            if (!elementsToCopy || elementsToCopy.length === 0) return;

            const firstElement = elementsToCopy[0].cloneNode(true);
            if (initialString) {
                firstElement.insertAdjacentText("afterbegin", initialString);
            }
            ankiContent.appendChild(firstElement);

            for (let i = 1; i < elementsToCopy.length; i++) {
                ankiContent.appendChild(elementsToCopy[i].cloneNode(true));
            }
        }

        function apiMarkupFragment(html) {
            const template = document.createElement("template");
            template.innerHTML = html || "";

            const markupTitles = {
                radical: "Radical",
                kanji: "Kanji",
                vocabulary: "Vocabulary",
                meaning: "Meaning",
                reading: "Reading",
            };

            template.content
                .querySelectorAll(Object.keys(markupTitles).join(","))
                .forEach((element) => {
                    const mark = document.createElement("mark");
                    mark.title = markupTitles[element.tagName.toLowerCase()];
                    mark.innerHTML = element.innerHTML;
                    element.replaceWith(mark);
                });

            // API-created <mark> elements do not have WaniKani's CSS classes,
            // so apply the same inline colors used by the copied Anki HTML.
            inlineMarkStyles(template.content);

            return template.content;
        }

        function appendApiText(html, initialString) {
            if (!html) return;

            const paragraph = document.createElement("p");
            paragraph.classList.add("subject-section__text");
            if (initialString) paragraph.append(initialString);
            paragraph.append(apiMarkupFragment(html));
            ankiContent.appendChild(paragraph);
        }

        function appendApiHint(html) {
            if (!html) return;

            appendBreak();
            const paragraph = document.createElement("p");
            paragraph.append("Hint: ");
            paragraph.append(apiMarkupFragment(html));
            ankiContent.appendChild(paragraph);
        }

        function alternativeMeanings(kanjiData) {
            const primary = kanjiData.meanings.find(meaning => meaning.primary);
            const alternatives = [
                ...kanjiData.meanings
                    .filter(meaning => meaning !== primary && meaning.accepted_answer)
                    .map(meaning => meaning.meaning),
                ...(kanjiData.auxiliary_meanings || [])
                    .filter(meaning => meaning.type === "whitelist")
                    .map(meaning => meaning.meaning),
            ];

            return [...new Map(
                alternatives.map(meaning => [meaning.toLocaleLowerCase(), meaning])
            ).values()];
        }

        function appendKanji(kanji) {
            const data = kanji.data;
            const primaryMeaning =
                data.meanings.find(meaning => meaning.primary)?.meaning ||
                data.meanings[0]?.meaning ||
                "";
            const alternatives = alternativeMeanings(data);
            const alternativesText = alternatives.length > 0
                ? ", " + alternatives.join(", ")
                : "";

            appendBreak();
            appendApiText(
                data.meaning_mnemonic,
                data.characters + "（" + primaryMeaning + alternativesText +
                    "、Level " + data.level + "）："
            );
            appendApiHint(data.meaning_hint);

            appendBreak();
            appendApiText(data.reading_mnemonic);
            appendApiHint(data.reading_hint);
        }

        const vocabulary =
            document.querySelector(".page-header__prefix .subject-character__characters-text")?.textContent || "";
        const vocabularyMeaning =
            document.querySelector(".page-header__title-text")?.textContent || "";
        const readingNode = document.querySelector(".reading-with-audio__reading");
        const vocabularyReading = readingNode ? "、" + readingNode.textContent : "";

        const meaningSections = document.querySelectorAll(".subject-section__meanings");

        let vocabularyType = "";
        let vocabularyAlternatives = "";

        for (let i = 0; i < meaningSections.length; i++) {
            const titleNode = meaningSections[i].querySelector(".subject-section__meanings-title");
            const itemsNode = meaningSections[i].querySelector(".subject-section__meanings-items");
            if (!titleNode || !itemsNode) continue;

            const meaningTitle = titleNode.textContent;
            if (meaningTitle === "Word Type") {
                vocabularyType = "、" + itemsNode.textContent;
                vocabularyType = vocabularyType.replace(/, /g, "、");
                vocabularyType = vocabularyType.replace(/godan verb/g, "五段");
                vocabularyType = vocabularyType.replace(/ichidan verb/g, "一段");
                vocabularyType = vocabularyType.replace(/、intransitive verb/g, "、自動詞");
                vocabularyType = vocabularyType.replace(/、transitive verb/g, "、他動詞");
            }
            if (meaningTitle === "Alternatives" || meaningTitle === "Alternative") {
                vocabularyAlternatives = ", " + itemsNode.textContent;
            }
        }

        const levelNode = document.querySelector(".subject-page-header__level");
        const vocabularyLevel = levelNode ? "、" + levelNode.textContent.trim() : "";

        cloneElements(
            document.querySelectorAll(".subject-section--meaning .subject-section__subsection p.subject-section__text"),
            vocabulary + "（" + vocabularyMeaning + vocabularyAlternatives + vocabularyReading + vocabularyType + vocabularyLevel + "）："
        );

        appendBreak();

        cloneElements(
            document.querySelectorAll(".subject-section--reading .subject-section__subsection p.subject-section__text")
        );

        const vocabularySubject = subjectsById.get(itemObject.id);
        const componentIds = vocabularySubject?.data.component_subject_ids || [];

        componentIds
            .map(id => subjectsById.get(id))
            .filter(subject => subject?.object === "kanji")
            .forEach(appendKanji);

        refreshHtmlSource();
        return container;
    }
})();
