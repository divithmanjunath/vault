# Vault: an offline, Obsidian-style notes prototype

A single web app (PWA) that runs on macOS and iOS. Notes are saved on each device.
Once it has been opened, the app keeps working with no internet connection.

## What it does
- Markdown notes with live Preview (⌘E)
- `[[Wikilinks]]`. Clicking a link to a note that doesn't exist yet creates that note.
- A **Backlinks** panel for every note
- Renaming a note updates every `[[link]]` that points to it
- `#tags`. Tap one in Preview to search for it.
- Search across titles and text (⌘K); new note (⌘J)
- **Graph view (⌘G)**: every note is a dot and every `[[link]]` is a line. Notes are coloured by their main `#tag` topic.
  - **Topics** shows each tag as a ◆ hub. **Local** shows only the open note and the notes within 2 links of it.
  - Tap a topic chip to highlight that topic. Tap a dot to open the note.
  - Drag dots to move them. Scroll or pinch to zoom, drag the background to pan, and ⤢ re-centres the graph.
- **Export .zip** writes plain `.md` files. **Import** accepts `.md` files or a `.zip`, including an Obsidian vault zipped up.
- An Online/Offline badge, and a "✓ Available offline" status line once caching is ready

## How it's built (and how that maps to Obsidian)
| Obsidian | This prototype |
|---|---|
| Electron / Capacitor shell | Browser + PWA (manifest + service worker) |
| `.md` files in a folder | Notes in IndexedDB on the device; exported as `.md` |
| Metadata cache | Links and tags parsed on the fly (`MD.extractLinks`, `MD.extractTags`) |
| Graph view (PixiJS / WebGL) | `graph.js`: force-directed layout on a 2D canvas, no libraries |
| CodeMirror editor | Plain `<textarea>` + a custom renderer (`markdown.js`) |
| Sync | Manual: Export zip → AirDrop → Import |

Files: `index.html` (layout), `style.css`, `app.js` (storage, UI, links),
`markdown.js` (renderer), `graph.js` (graph view), `zip.js` (zip read/write), `sw.js` (offline cache),
`manifest.webmanifest` + `icon-*.png` (installable app).

**Online vs offline:** `sw.js` is network-first with a 3-second timeout. When you're online,
you always get the latest version of the app. When you're offline, or the network is slow,
the cached copy loads instantly. Your notes never touch the network either way.

## Run it

Service workers only run over **HTTPS** or on **localhost**, so:

**On your Mac (quick test)**
```bash
cd vault
python3 -m http.server 8000
# open http://localhost:8000 in Safari or Chrome
```
To make it an app: in Safari use **File → Add to Dock**. In Chrome, use the install icon in the address bar.

**On your iPhone (needs HTTPS): host it once, for free**
1. Push this folder to a GitHub repo, then go to **Settings → Pages → Deploy from branch**.
   (Dragging the folder onto Netlify Drop also works.)
2. On the iPhone, open the URL in **Safari**, tap **Share → Add to Home Screen**.
3. Open it from the home screen once while online. After that it works in airplane mode.

The hosting only serves the app's code. Your notes stay on each device.

## Moving notes between Mac and iPhone
Export .zip on one device → AirDrop / Files → Import on the other.
If a note exists on both with different text, you choose: replace it, or keep both copies.

## Known limits (next steps)
- No automatic sync yet. That's the next milestone: Yjs/Automerge CRDT over local Wi-Fi.
- iOS can evict web-app storage after long disuse, so export regularly.
  (The app requests persistent storage, but iOS doesn't guarantee it.)
- No attachments or folders yet. The graph is fine for a few hundred notes; beyond that it would need WebGL.
