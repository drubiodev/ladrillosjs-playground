export const EVENTS = {
    // header → editor
    EXAMPLE_SELECT: "repl:example-select",
    RUN: "repl:run",

    // header → cheatsheet (slide the syntax reference open/closed)
    CHEATSHEET_TOGGLE: "repl:cheatsheet-toggle",

    // editor → tabs (current file list + which one is active)
    FILES_CHANGED: "repl:files-changed",

    // tabs → editor (user actions on the tab strip)
    TAB_SELECT: "repl:tab-select",
    TAB_CLOSE: "repl:tab-close",
    TAB_RENAME: "repl:tab-rename",
    FILE_ADD: "repl:file-add",

    // editor → preview (rebuild the sandbox) / surface a message
    PREVIEW_BUILD: "repl:preview-build",
    PREVIEW_ERROR: "repl:preview-error",
};
