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
- **Export .zip** writes plain `.md` files. **Import** accepts `.md` files or a `.zip`, including an Obsidian vault zipped up.
- An Online/Offline badge, and a "✓ Available offline" status line once caching is ready

## How it's built (and how that maps to Obsidian)
| Obsidian | This prototype |
|---|---|
| Electron / Capacitor shell | Browser + PWA (manifest + service worker) |
| `.md` files in a folder | Notes in IndexedDB on the device; exported as `.md` |
| Metadata cache | Links parsed on the fly (`MD.extractLinks`) |
| CodeMirror editor | Plain `<textarea>` + a custom renderer (`markdown.js`) |
| Sync | Manual: Export zip → AirDrop → Import |

Files: `index.html` (layout), `style.css`, `app.js` (storage, UI, links),
`markdown.js` (renderer), `zip.js` (zip read/write), `sw.js` (offline cache),
`manifest.webmanifest` + `icons/` (installable app).

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
- No graph view, attachments, or folders yet.
