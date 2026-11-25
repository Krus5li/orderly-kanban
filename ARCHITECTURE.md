# How Orderly works

Orderly is a standalone static site. Open `index.html` directly or host this folder on GitHub Pages. There is no server, build step, or live sync. The board loads `assets/js/board/data.js` then `assets/js/board/app.js`, deferred. Diagrams load their own `data.js` and `app.js` plus shared `main.css`.

## Project layout

```
index.html, diagram.html     # Entry pages; both link assets/icons/favicon.svg
assets/
  css/main.css               # Shared layout, board, dialogs, .select-wrap (commented sections)
  css/diagram.css            # Diagram-only UI
  icons/favicon.svg
  js/board/data.js             # BoardData: validate, exportCsv, importCsv
  js/board/app.js              # Kanban UI, file linking, ticket view
  js/diagram/data.js           # DiagramData: validate, exportJson, importJson
  js/diagram/app.js            # SVG canvas UI
data/                        # Optional sample CSV; app does not read this path automatically
tests/
  board-data.test.js
  board-theme.test.js
  diagram-data.test.js
README.md, ARCHITECTURE.md
```

## Board data and persistence

The board is `{ columns: [...], tickets: [...] }`. Columns have `id` and `name`. Tickets have `id`, `columnId`, `title`, `project`, `increment`, `description`, `owner`, `dueDate` (all strings; title required; due date `YYYY-MM-DD` when set).

| Key | Purpose |
|-----|---------|
| `orderly-board-v1` | Board JSON in `localStorage` |
| `orderly-theme` | `dark` or default light |
| `orderly-board-csv-filename` | Last chosen CSV basename for download fallback |

Startup loads and validates saved JSON; on failure, warns and uses a new default board (To Do, In Progress, Done) without overwriting bad storage until the user saves. Every mutation goes through `save()`: validate, `localStorage.setItem`, `render()`.

`unsavedChanges` and `beforeunload` warn when local storage write failed or when leaving with unsaved diagram-style in-memory edits on the diagram page; on the board, unsaved is mainly failed `save()`.

## CSV file linking (board)

`board-app.js` keeps an in-memory `boardFileHandle` when the File System Access API is available.

- **Select board file** — `showOpenFilePicker`; sets handle and remembers `handle.name`.
- **Save** — `writeBoardCsv()` writes via `boardFileHandle.createWritable()`, or `showSaveFilePicker`, or `<a download>` with `getBoardFileName()`.
- **Load** — reads from handle, or picker, then `BoardData.importCsv()` and confirm replace.

`ensureFilePermission()` requests read/write on the handle when needed.

## Interface flow (board)

- `render()` — filter dropdowns, search, ticket count, rebuild columns.
- `renderColumn()` / `renderTicket()` — cards, drag-and-drop, column drop targets.
- `renderTicket()` — `.card-title` button opens `openTicketView()`; drag sets `titleClickAllowed = false` until `dragend`. Column tag class from `columnTagClass(columnName)` (`tag-column-todo`, `tag-column-progress`, `tag-column-done`, `tag-column-other`).
- `openTicketView()` — fills `#ticket-view-dialog` (`displayValue()` for empty → `—`).
- `openTicket()` — edit dialog; `populateTicketSuggestions(ticket)` builds project/owner `<select>` options; `quickPickNew` (`__new__`) + **Add new…** uses `prompt()` to add an option.
- `populateQuickPick()`, `bindQuickPickNew()`, column/ticket dialogs, `deleteColumn()` — unchanged patterns from earlier design.
- DOM helpers: `node()`, `option()`, `button()`; text via `textContent` only.

## CSV format and `BoardData`

Header: `type,id,name,column_id,title,project,increment,description,owner,due_date,position`. One `board` row with version `1`; `column` / `ticket` rows with consecutive positions. See `data.js` for `validate`, `exportCsv`, `importCsv`, `parseRows`, `encode`.

## Diagram data and persistence

Versioned JSON: `viewport`, `nodes[]` (`rect`, `ellipse`, `text`, `line`). Storage key `orderly-diagram-v1`. `markUnsaved()` during drags/pans before `save()` completes; same `beforeunload` pattern as failed persistence.

## Styling (`assets/css/main.css`)

CSS is grouped with banner comments (Base, Typography, Buttons, Header, Notices, Toolbar, Form controls, **Select / `.select-wrap`**, Board layout, Columns, **Ticket cards**, **Dialogs** including `.ticket-view-*`, Dark theme, Responsive). Diagram-specific rules stay in `diagram.css`.

Native `<select>` elements used in the UI are wrapped in `<span class="select-wrap">` for a custom chevron rail; hover highlight is on the chevron, not the whole field. Board header uses `.load-button` / `.save-button` for Load and Save.

## Tests

`node --test tests` — board CSV, theme toggle DOM stub (`board-theme.test.js` loads `board/app.js`), diagram JSON.

## User-facing summary

See [README.md](README.md) for how to use the board, diagrams, save/load, and collaboration expectations.