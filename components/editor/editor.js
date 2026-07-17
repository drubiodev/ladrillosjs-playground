import { EVENTS } from "../../common/events.js";
import { EXAMPLES, EXAMPLE_NAMES } from "../../common/examples.js";

const MONACO_CDN = "https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1";
const BLANK_EXAMPLE_NAME = "Blank";
const BLANK_STORAGE_KEY = "ladrillos-playground:blank-files";
const COMPONENT_TAG_PATTERN = /^[a-z][a-z0-9]*-[a-z0-9-]*$/;

// The CDN build spins up web workers for language tooling.
// getWorker is fully self-contained (no outer closure refs) because Monaco
// invokes it later, outside this module's lexical scope.
// NOTE: the import keyword is split so Ladrillos' module-import scanner
// doesn't mistake the Blob source for a real static import.
self.MonacoEnvironment = {
    getWorker(_id, label)
    {
        const CDN = "https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/esm/vs";
        let path = "editor/editor.worker.js";
        if (label === "json") path = "language/json/json.worker.js";
        else if (label === "css" || label === "scss" || label === "less") path = "language/css/css.worker.js";
        else if (label === "html" || label === "handlebars" || label === "razor") path = "language/html/html.worker.js";
        else if (label === "typescript" || label === "javascript") path = "language/typescript/ts.worker.js";
        const src = ("im" + "port") + " " + JSON.stringify(`${CDN}/${path}`) + ";";
        const url = URL.createObjectURL(new Blob([src], { type: "application/javascript" }));
        return new Worker(url, { type: "module" });
    }
};

// Monaco is loaded via the AMD "min" build rather than jsDelivr's "/+esm"
// bundle: "/+esm" inlines the entire editor core into every lazily-imported
// language chunk (~950 KB each for html/css/js), quadrupling the download.
// The min build shares one core and loads languages as ~5 KB chunks, and its
// CSS inlines the codicon font (no cross-origin font 404). Loading happens
// lazily so the page shell paints before the ~1 MB editor arrives.
let monaco;
let monacoPromise;
function loadMonaco()
{
    if (monacoPromise) return monacoPromise;
    const css = new Promise((resolve) =>
    {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.dataset.name = "vs/editor/editor.main";
        link.href = `${MONACO_CDN}/min/vs/editor/editor.main.css`;
        link.onload = link.onerror = resolve;
        document.head.appendChild(link);
    });
    const api = new Promise((resolve, reject) =>
    {
        const loader = document.createElement("script");
        loader.src = `${MONACO_CDN}/min/vs/loader.js`;
        loader.onload = () =>
        {
            window.require.config({ paths: { vs: `${MONACO_CDN}/min/vs` } });
            window.require(["vs/editor/editor.main"], () => resolve(window.monaco), reject);
        };
        loader.onerror = reject;
        document.head.appendChild(loader);
    });
    monacoPromise = Promise.all([api, css]).then(([m]) => m);
    return monacoPromise;
}

// Source of truth for the open files. Each file is a component:
// its tab name is the custom-element tag, its Monaco model holds the source.
let editor;
let files = [];
let activeIndex = 0;
let newFileSeq = 0;
let debounceTimer;
let activeExample;

function makeFile(tag, code)
{
    return { tag, model: monaco.editor.createModel(code, "html") };
}

function loadBlankFiles()
{
    try
    {
        const saved = JSON.parse(localStorage.getItem(BLANK_STORAGE_KEY));
        const tags = new Set();
        if (
            Array.isArray(saved) &&
            saved.length > 0 &&
            saved.every((file) =>
                file &&
                typeof file.tag === "string" &&
                COMPONENT_TAG_PATTERN.test(file.tag) &&
                !tags.has(file.tag) &&
                tags.add(file.tag) &&
                typeof file.code === "string"
            )
        )
        {
            return saved;
        }
    }
    catch
    {
        // Fall back to the built-in Blank example when storage is unavailable.
    }

    return EXAMPLES[BLANK_EXAMPLE_NAME];
}

function saveBlankFiles()
{
    if (activeExample !== BLANK_EXAMPLE_NAME || files.length === 0) return;

    try
    {
        localStorage.setItem(
            BLANK_STORAGE_KEY,
            JSON.stringify(files.map((file) => ({
                tag: file.tag,
                code: file.model.getValue(),
            })))
        );
    }
    catch
    {
        // Editing still works when storage is unavailable.
    }
}

// Tell the tab strip about the current files + selection.
function emitTabs()
{
    $emit(EVENTS.FILES_CHANGED, {
        tabs: files.map((f) => ({ tag: f.tag })),
        activeIndex: activeIndex,
    });
}

// Ask the preview to rebuild from the current sources.
function run()
{
    if (!editor || files.length === 0) return;
    $emit(EVENTS.PREVIEW_BUILD, {
        files: files.map((f) => ({ tag: f.tag, code: f.model.getValue() })),
    });
}

function loadExample(name)
{
    for (const f of files) f.model.dispose();
    activeExample = name;
    const exampleFiles = name === BLANK_EXAMPLE_NAME
        ? loadBlankFiles()
        : EXAMPLES[name];
    files = exampleFiles.map((f) => makeFile(f.name ?? f.tag, f.code));
    activeIndex = 0;
    editor.setModel(files[0].model);
    emitTabs();
    run();
}

function selectFile(i)
{
    activeIndex = i;
    editor.setModel(files[i].model);
    emitTabs();
    editor.focus();
}

function addFile()
{
    const tag = uniqueTag("my-component");
    files = [...files, makeFile(tag, defaultFileCode(tag))];
    selectFile(files.length - 1);
    saveBlankFiles();
    run();
}

function removeFile(i)
{
    if (i === 0 || files.length <= 1) return; // keep the root file
    files[i].model.dispose();
    files = files.filter((_, j) => j !== i);
    activeIndex = Math.min(activeIndex, files.length - 1);
    editor.setModel(files[activeIndex].model);
    emitTabs();
    saveBlankFiles();
    run();
}

function renameFile(i)
{
    const current = files[i].tag;
    const next = (
        window.prompt(
            "Component tag name (lowercase, must contain a hyphen):",
            current
        ) || ""
    ).trim();
    if (!next || next === current) return;
    if (!COMPONENT_TAG_PATTERN.test(next))
    {
        $emit(
            EVENTS.PREVIEW_ERROR,
            `Invalid tag "${next}". Custom element names must be lowercase and contain a hyphen, e.g. "user-card".`
        );
        return;
    }
    if (files.some((f, j) => j !== i && f.tag === next))
    {
        $emit(EVENTS.PREVIEW_ERROR, `A file named "${next}" already exists.`);
        return;
    }
    files[i].tag = next;
    emitTabs();
    saveBlankFiles();
    run();
}

function uniqueTag(base)
{
    let n = ++newFileSeq;
    let tag = `${base}-${n}`;
    while (files.some((f) => f.tag === tag)) tag = `${base}-${++n}`;
    return tag;
}

function defaultFileCode(tag)
{
    return [
        `<div class="box">`,
        `  <p>Hello from &lt;${tag}&gt;</p>`,
        `</div>`,
        ``,
        `<style>`,
        `  .box { font-family: system-ui; padding: 1rem; }`,
        `</style>`,
    ].join("\n");
}

// HTML void elements never get a closing tag.
const VOID_TAGS = new Set([
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
]);

// When the user types ">" to finish an opening tag, insert the matching
// closing tag and leave the caret between them. Handles multi-cursor edits.
function enableAutoCloseTags(editor)
{
    editor.onKeyDown((e) =>
    {
        if (e.browserEvent.key !== ">") return;

        const model = editor.getModel();
        if (!model || model.getLanguageId() !== "html") return;

        const edits = [];
        const newSelections = [];

        for (const selection of editor.getSelections())
        {
            // The ">" isn't in the model yet; account for it when re-placing carets.
            newSelections.push(
                new monaco.Selection(
                    selection.selectionStartLineNumber,
                    selection.selectionStartColumn + 1,
                    selection.endLineNumber,
                    selection.endColumn + 1
                )
            );

            const line = model.getValueInRange({
                startLineNumber: selection.endLineNumber,
                startColumn: 1,
                endLineNumber: selection.endLineNumber,
                endColumn: selection.endColumn,
            });

            // Match an unclosed opening tag ending right before the caret,
            // skipping self-closing (`<br/`) and closing (`</div`) tags.
            const match = line.match(/<([a-zA-Z][\w-]*)(?:\s[^<>]*?)?$/);
            if (!match) continue;

            const tag = match[1];
            if (VOID_TAGS.has(tag.toLowerCase())) continue;

            edits.push({
                range: {
                    startLineNumber: selection.endLineNumber,
                    startColumn: selection.endColumn + 1,
                    endLineNumber: selection.endLineNumber,
                    endColumn: selection.endColumn + 1,
                },
                text: `</${tag}>`,
                forceMoveMarkers: true,
            });
        }

        if (edits.length === 0) return;

        // Let Monaco insert the ">" first, then splice in the closing tags
        // and drop the carets between the two tags.
        setTimeout(() =>
        {
            editor.executeEdits("auto-close-tag", edits, newSelections);
        }, 0);
    });
}

// React to header + tab-strip actions over the event bus.
$listen(EVENTS.EXAMPLE_SELECT, (name) => loadExample(name));
$listen(EVENTS.RUN, () => run());
$listen(EVENTS.TAB_SELECT, (i) => selectFile(i));
$listen(EVENTS.TAB_CLOSE, (i) => removeFile(i));
$listen(EVENTS.TAB_RENAME, (i) => renameFile(i));
$listen(EVENTS.FILE_ADD, () => addFile());

// Wait for the template (and $refs) to be ready before mounting Monaco,
// then render the first example.
$host.addEventListener("ladrillos:ready", async () =>
{
    monaco = await loadMonaco();
    editor = monaco.editor.create($refs.editorHost, {
        language: "html", // highlights embedded <script> and <style> too
        theme: "vs-dark",
        automaticLayout: true,
        minimap: { enabled: false },
        fontFamily:
            'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        fontSize: 13,
        lineHeight: 21,
        tabSize: 2,
        scrollBeyondLastLine: false,
        padding: { top: 12, bottom: 12 },
        scrollbar: {
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
            useShadows: false,
        },
    });

    // Monaco core doesn't auto-close HTML tags, so wire it up manually.
    enableAutoCloseTags(editor);

    // Debounced live re-run on edit.
    editor.onDidChangeModelContent(() =>
    {
        saveBlankFiles();
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(run, 400);
    });

    loadExample(EXAMPLE_NAMES[0]);
});
