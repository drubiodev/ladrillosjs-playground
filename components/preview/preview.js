import { EVENTS } from "../../common/events.js";

const LADRILLOS_SRC = new URL(
  "https://cdn.jsdelivr.net/npm/ladrillosjs@latest/dist/index.js",
  location.href
).href;

let errorMsg = "";
let activeBlobUrls = [];
let isDark = false;

function getTheme()
{
  return isDark
    ? { mode: "dark", background: "#1a1a1a", text: "#f5f5f5" }
    : { mode: "light", background: "#ffffff", text: "#1a1a1a" };
}

function applyThemeToFrame()
{
  const doc = $refs.frame.contentDocument;
  if (!doc?.documentElement || !doc.body) return;

  const theme = getTheme();
  doc.documentElement.style.colorScheme = theme.mode;
  doc.documentElement.style.backgroundColor = theme.background;
  doc.body.style.backgroundColor = theme.background;
  doc.body.style.color = theme.text;
}

function toggleTheme()
{
  isDark = !isDark;
  applyThemeToFrame();
}

// Build & mount the preview: register every file as a component, then mount the root component.
function build(files)
{
  if (!files || files.length === 0) return;
  errorMsg = "";

  for (const u of activeBlobUrls) URL.revokeObjectURL(u);

  activeBlobUrls = [];

  const regs = files.map((f) =>
  {
    const base = URL.createObjectURL(
      new Blob([f.code], { type: "text/html" })
    );

    activeBlobUrls.push(base);

    return { tag: f.tag, url: base + "#.html" };
  });

  const rootTag = regs[0].tag;
  const theme = getTheme();

  const doc = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0;
        min-height: 100%;
        background: ${theme.background};
        color: ${theme.text};
        color-scheme: ${theme.mode};
      }
      body { padding: 8px; font-family: system-ui, sans-serif; }
    </style>
  </head>
  <body>
    <div id="mount"></div>

    <script type="module">

     import { registerComponent } from ${JSON.stringify(LADRILLOS_SRC)};
     
      const post = (message) =>
        parent.postMessage({ __repl: "error", message }, "*");

      
      window.addEventListener("error", (e) => post(e.message));
      window.addEventListener("unhandledrejection", (e) =>
        post(e.reason?.message || String(e.reason))
      );

      const files = ${JSON.stringify(regs)};
      try {
        // Register every component first, then mount the root element.
        for (const f of files) {
          await registerComponent(f.tag, f.url, true);
        }
        document
          .getElementById("mount")
          .appendChild(document.createElement("${rootTag}"));
      } catch (e) {
        post(e?.message || String(e));
      }
    <\/script>
  </body>
</html>`;

  $refs.frame.srcdoc = doc;
}

// Rebuild when the editor sends fresh sources.
$listen(EVENTS.PREVIEW_BUILD, (data) => build(data.files));

// Show editor-side messages (e.g. rename validation) in the error strip.
$listen(EVENTS.PREVIEW_ERROR, (msg) =>
{
  errorMsg = msg;
});

// Surface framework/runtime errors reported from inside the sandbox.
window.addEventListener("message", (e) =>
{
  if (e.data && e.data.__repl === "error" && e.data.message)
  {
    errorMsg = e.data.message;
  }
});
