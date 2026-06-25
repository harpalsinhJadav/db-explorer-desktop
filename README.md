# DB Explorer — Electron + React Admin Dashboard

A generic **database explorer** desktop app (Electron + React + Vite). It lists
tables, generates an AG Grid view (columns *and* filters) dynamically from schema
metadata, and connects **directly to any PostgreSQL server** — no separate
backend or API service to run.

How it reaches the database: a browser can't open a raw TCP Postgres connection,
but Electron's **Node main process can**. The React UI (renderer) calls the main
process over IPC, and the main process uses **node-postgres (`pg`)** to talk to
your database. There's also an offline **mock** data source for development.

> The data source is chosen at runtime in **Settings** — `mock` (offline, in
> browser) or `postgres` (real server, requires the Electron app). The UI is
> identical either way; only `schemaService`'s backend differs.

---

## Tech Stack

- **Electron 33** — desktop shell; Node main process owns the DB connection
- **React 18** + **Vite 5**
- **node-postgres (`pg`)** — direct PostgreSQL driver (main process)
- **Material UI (MUI) 6** — layout, login, theming
- **AG Grid Community 32** — data grid
- **React Router DOM 6** — routing & protected routes
- **Zustand** — auth + settings state

---

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Launch the desktop app (Vite dev server + Electron window)
npm run dev

# 3. Production build + run packaged renderer in Electron
npm run build
npm run start
```

`npm run dev` runs Vite and Electron together (via `concurrently` + `wait-on`):
Vite serves the renderer on `http://localhost:5173` and Electron loads it in a
desktop window. Connecting to PostgreSQL requires this Electron window — a plain
browser tab can only use the mock source. (`npm run dev:web` runs just the Vite
renderer in a browser for UI work on the mock source.)

### Login

The login screen validates **frontend-only** against static credentials:

| Field    | Value               |
| -------- | ------------------- |
| Email    | `admin@example.com` |
| Password | `admin123`          |

On success the session is saved to `localStorage`, protected routes unlock, and
you are redirected to the dashboard. Use the **Logout** button in the top bar to
clear the session.

---

## Features

- 🔐 **Login / Logout** with `localStorage` persistence and protected routes
- 🗂️ **Dynamic table list** in the sidebar (from `schemaService.getTables()`)
- 🧱 **Dynamic columns** generated from schema metadata — no per-table config
- 🔎 **Dynamic filters** mapped from PostgreSQL data types:
  | data_type | AG Grid filter |
  | --- | --- |
  | `character varying`, `text` | Text Filter |
  | `integer`, `numeric` | Number Filter |
  | `date`, `timestamp` | Date Filter |
  | `boolean` | Set Filter* |
- 🧰 AG Grid: **sorting** (multi-column with Ctrl/Cmd-click), **floating /
  multi filters**, **pagination**, **column resize**, **column hide/show**,
  **quick search**, **CSV export**
- ✏️ **Full CRUD on the data** — no backend required:
  - **Create** via an Add Row dialog generated from the schema — it shows every
    column you must/may provide (including the primary key when it has no
    default), marks NOT NULL columns required, omits DB-filled columns
    (identity/serial/defaults/generated), and renders **enum columns as
    dropdowns** of their allowed values
  - **Read** the live table
  - **Update** by editing cells inline (values are coerced to the column's type)
  - **Delete** selected rows (checkbox selection)
  - **Reset** a table back to its seed data
  - Writes persist to `localStorage`, so changes survive a refresh
- 🔌 **Configurable data source** (Settings page) — switch between offline mock
  data and a **real PostgreSQL server** (any host, direct or pooled), connected
  directly by the Electron main process. The change takes effect immediately;
  use **Sync DB** in the grid toolbar to re-fetch.
- 🧩 **Single generic grid** — no separate screen per table
- 🔍 Filters open from each **column header menu** (always-visible menu icon),
  so there's no separate "Columns" button.

\* Set Filter is an AG Grid **Enterprise** feature. On Community it gracefully
degrades to a Text Filter (see `src/utils/filterMapper.js`).

---

## Project Structure

```
electron/
  main.cjs                         # Node main process: pg connection + IPC + CRUD
  preload.cjs                      # contextBridge -> window.dbApi (safe IPC)
src/
  components/
    Sidebar/      Sidebar.jsx      # dynamic table list
    Topbar/       Topbar.jsx       # user info + logout
    DataGrid/     DataGrid.jsx     # generic AG Grid + toolbar (search, CSV)
  pages/
    Login/        Login.jsx        # MUI login screen
    Dashboard/    Dashboard.jsx    # orchestrates schema -> columns -> data
    Settings/     Settings.jsx     # choose data source (mock vs live Postgres)
  services/
    schemaService.js               # dispatches mock <-> postgres (IPC) backends
    authService.js                 # static-credential auth
  store/
    authStore.js                   # Zustand auth store
    settingsStore.js               # Zustand data-source config (localStorage)
  components/
    RecordFormDialog/ RecordFormDialog.jsx  # dynamic Add-Row form
  mock-data/
    schema.js                      # tables + column metadata
    mockDb.js                      # localStorage-backed mutable mock database
    customers.json                 # 60 seed rows
    products.json                  # 60 seed rows
    orders.json                    # 60 seed rows
  utils/
    filterMapper.js                # data_type -> AG Grid filter
    agGridHelpers.js               # schema -> columnDefs
  routes/
    ProtectedRoute.jsx             # auth guard
  App.jsx                          # route table
  main.jsx                         # entry, providers, AG Grid styles
  theme.js                         # MUI theme
scripts/
  generate-mock-data.mjs           # regenerates the mock-data/*.json files
```

---

## Architecture: data sources

All data access flows through **`src/services/schemaService.js`**, which
dispatches to one of two interchangeable backends based on the source picked in
**Settings**. UI components never know which backend is active, so the source
can change at runtime with zero component changes.

| `dataSource` | Backend | What it is |
| --- | --- | --- |
| `mock` | `mockBackend` | the localStorage mock DB (`src/mock-data/mockDb.js`) |
| `postgres` | `postgresBackend` | a real PostgreSQL server via `window.dbApi` (Electron IPC → `pg`) |

Every backend implements the same interface, so the dynamic columns, filters,
and type coercion work identically against either:

| Method | Returns |
| --- | --- |
| `getTables()` | `string[]` |
| `getTableSchema(name)` | `Array<{column_name,data_type,primary_key?}>` |
| `getTableData(name)` | `Array<Object>` |
| `insertRecord(name, rec)` | created row |
| `updateRecord(name, id, chg)` | updated row |
| `deleteRecords(name, ids)` | deleted count |

### How the Postgres connection works

```
React renderer (schemaService → window.dbApi)
        │  IPC (contextBridge, preload.cjs)
        ▼
Electron main process (main.cjs)
        │  node-postgres (pg) over TCP/TLS
        ▼
   PostgreSQL  (any host: local, remote, or pooled)
```

- **`electron/main.cjs`** holds the `pg.Pool` and implements every query:
  - table list + schema from `information_schema` (columns, data types,
    primary keys) — fully dynamic, nothing hardcoded;
  - CRUD via **parameterized** SQL; table/column identifiers are validated
    against the real catalog and quoted to prevent injection;
  - `numeric`/`bigint` are parsed to JS numbers so grid filters/sorting work.
- **`electron/preload.cjs`** exposes a minimal, whitelisted `window.dbApi`
  through `contextBridge` (the renderer never sees `pg` or `ipcRenderer`).

### Connecting to your PostgreSQL (Settings page)

> **Why does this need Electron?** A browser cannot open a raw TCP Postgres
> connection (ports `5432`/`6543`, direct or pooled) — only HTTP/WebSocket.
> Electron's Node process has real sockets, so it makes the connection for the
> UI. That's the whole reason the app is an Electron desktop app.

1. Launch the desktop app: `npm run dev`.
2. Open **Settings** (gear icon, top-right) and choose **PostgreSQL**.
3. Enter a **Connection String** (e.g.
   `postgresql://user:password@host:5432/dbname` — pooler URLs work too) **or**
   the individual host/port/database/user/password fields; toggle **SSL** for
   managed providers. **Test Connection** → **Save**.
4. Go to the dashboard. Your real tables appear in the sidebar; selecting one
   loads its live schema and rows. **Sync DB** re-fetches on demand. Add/edit/
   delete write straight to your database.

**Security note:** credentials are stored in this app's `localStorage` and used
only by the local Electron process to connect. Don't ship a build with baked-in
production credentials, and prefer a least-privilege database role.

### `src/services/authService.js`

Swap the static-credential check for `POST /api/auth/login` etc. The Zustand
store and login UI depend only on this module's interface.

---

## Building & distributing the macOS app

```bash
npm run dist:mac            # arm64 (Apple Silicon) DMG -> release/
npm run dist:mac:universal  # universal (Intel + Apple Silicon) DMG
```

The output is `release/DB Explorer-<version>-arm64.dmg`.

### "DB Explorer is damaged and can't be opened" on other Macs

This is **Gatekeeper**, not a real corruption. The app is **ad-hoc signed but
not notarized**, so macOS blocks it on machines other than the one that built
it (the downloaded DMG is quarantined). The build re-signs the bundle with a
valid ad-hoc signature (`build/after-pack.cjs`), which downgrades the scary
"damaged" error to the normal "unidentified developer" prompt. To open it:

- **Right-click** the app in Applications → **Open** → **Open**, or
- Clear the quarantine flag once, from Terminal:

  ```bash
  xattr -cr "/Applications/DB Explorer.app"
  ```

### Distributing with zero warnings (Developer ID + notarization)

For a DMG that opens with no prompts on any Mac, sign with an Apple **Developer
ID Application** certificate and notarize (requires the paid Apple Developer
Program). Then, in `package.json` → `build.mac`, remove `"identity": null`, add
hardened-runtime entitlements, and notarize with your Apple credentials
(`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`) — e.g. via
`@electron/notarize` in an `afterSign` hook. Ask and this can be wired up.

---

## Regenerating mock data

```bash
node scripts/generate-mock-data.mjs
```

Deterministic (seeded) output → 60 rows per table written to
`src/mock-data/*.json`.
