# Orderly

A static kanban board for tracking project increment tickets, plus a simple diagram canvas. No server, build step, or account.

## Open or publish

Open `index.html` in a modern browser, or publish this folder with GitHub Pages. All asset paths are relative to the folder that contains `index.html`.

```
index.html, diagram.html     # Entry pages
assets/
  css/main.css               # Board UI, dialogs, themed dropdowns (section comments in file)
  css/diagram.css            # Diagram canvas
  icons/favicon.svg          # Tab icon
  js/board/                  # Kanban data + UI
  js/diagram/                # Diagram data + UI
data/                        # Sample CSV (e.g. orderly-board.csv); not loaded automatically
tests/                       # Node.js tests
README.md, ARCHITECTURE.md
```

## Board

Create tickets with **+ New ticket**; only a **title** is required. **Click a ticket title** on the board to open a read-only view; use **Edit ticket** there or **Edit** on the card to change fields. Drag cards between columns, or change column in the edit dialog.

**Project** and **Owner** in the edit dialog are dropdowns of values already used on the board, plus **Add new…** (prompt). The current value appears as the selected option when editing.

Cards show a **colored column tag** from the column name (for example yellow for In Progress, green for Done). While dragging, the card stays clearly visible with a stronger shadow.

Search and **Project** / **Increment** filters narrow the board. Add, rename, or delete columns with column controls; deleting a column that has tickets asks where to move them.

**Switch to dark mode** / **Switch to light mode** toggles the theme for both board and diagrams in this browser (`orderly-theme` in local storage; not in CSV).

## Save, load, and board file

Changes auto-save to **local storage** (`orderly-board-v1`). If saving fails, the page shows a warning.

- **Select board file** — pick a CSV file to link for **Load** and **Save** (File System Access API in Chromium-based browsers).
- The linked file name appears **under** that button (`orderly-board-csv-filename` is remembered even after refresh; you may need to link the file again in a new session).
- **Save** — writes the full board CSV to the linked file, or prompts for a save location, or downloads using the remembered filename.
- **Load** — reads from the linked file, or prompts for a file, validates, confirms, then replaces the in-memory board.

On browsers without file linking, **Save** downloads CSV and **Load** uses the file picker. Import always replaces the whole board after confirmation.

## Diagrams

Open **Diagrams** from the header (or `diagram.html`). Draw rectangles, ellipses, lines, and text on an infinite SVG canvas. **Select** to move or resize; double-click shapes to edit text; **Delete** removes the selection; hold **Space** and drag to pan; scroll to zoom.

Diagram state is stored separately (`orderly-diagram-v1`). **Export JSON** / **Import JSON** back up diagram data.

## Leaving the page

If the board could not be saved to local storage, or a diagram edit is still in flight (for example mid-drag before save), the browser may show a standard **unsaved changes** prompt when you leave the tab.

## Storage notes

Storage is per browser, device, and origin. `file:` URLs may behave differently. Export a CSV or diagram JSON backup before clearing site data or switching machines.

Collaboration is manual: share the latest CSV export. There is no live sync or merge. CSV can contain private data; be careful opening untrusted CSV in spreadsheets (formula injection).

The CSV format uses version `1` with `board`, `column`, and `ticket` rows. See [ARCHITECTURE.md](ARCHITECTURE.md) for the header and validation rules.

## Tests

From this folder:

```bash
node --test tests
```

Covers board CSV round trips, diagram JSON validation, and theme behavior. The app does not need Node.js to run in the browser.

## Further reading

[ARCHITECTURE.md](ARCHITECTURE.md) — layout, data flow, key functions, and styling conventions.