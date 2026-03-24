# OmniStock

OmniStock is a Cloudflare-ready warehouse inventory starter built with React and a Worker backend. It includes a responsive dashboard, inventory operations, master data, reports, administration, offline cache with IndexedDB, a sync API, WebSocket updates, barcode-assisted search, Excel export, and print-ready reporting.

## What Is Included

- `Dashboard`: KPI cards, alert queue, movement summary, and activity feed.
- `Inventory OPS`: GRN, GIN, transfer, adjustment, stock count, and wastage entry workflow.
- `Master Data`: items, suppliers, warehouses, and outlets.
- `Reports & Analytics`: movement ledger filters, Excel export, and printing.
- `Administration`: users, role matrix, settings, and audit activity.
- `Offline-first client`: service worker shell cache plus IndexedDB snapshot/outbox queue.
- `Realtime backend`: REST sync API with Durable Object WebSocket fan-out for concurrent users.

## Architecture

- Frontend: React + React Router + Vite.
- Hosting: Cloudflare Workers serving the React build through Workers static assets.
- Realtime and sync coordination: a Durable Object (`OmniStockHub`) stores the current snapshot, mutation history, processed mutation IDs, and active WebSockets.
- Offline data: IndexedDB stores the latest per-user bootstrap payload and the local mutation outbox.
- Sync model:
  1. The UI applies inventory mutations optimistically.
  2. Mutations are queued in IndexedDB.
  3. The client pushes queued mutations to `/api/sync/push`.
  4. The Durable Object applies mutations serially, updates stock, appends ledger/activity, and broadcasts WebSocket events.
  5. Other clients merge those events or re-pull from `/api/sync/pull` if they need a fresh snapshot.

## Roles

- `Superadmin`: full access across all modules.
- `Admin`: full operational access, reporting, users, settings, and activity.
- `Manager`: operations, master data, reports, and activity audit.
- `Worker`: dashboard plus inventory operations.

The current starter uses a demo user switcher in the header so you can test permissions immediately. For production, wire this to Cloudflare Access, JWTs, or your identity provider and enforce the same permission map server-side.

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Start the Vite development server:

```bash
npm run dev
```

3. Build the project:

```bash
npm run build
```

4. Deploy to Cloudflare:

```bash
npm run deploy
```

## Cloudflare Notes

- `wrangler.toml` serves the Vite build from `dist/` and routes `/api/*` and `/ws` to the Worker first.
- The Cloudflare Vite plugin generates a deploy-ready config at `dist/omnistock/wrangler.json`, and the npm `preview` / `deploy` scripts target that verified output directly.
- The Durable Object is declared as `OmniStockHub` and uses a SQLite-backed migration.
- The Worker currently persists the main demo snapshot and event log inside the Durable Object. For larger production deployments, you will likely split this into:
  - D1 for long-term relational storage and reporting
  - one or more Durable Objects for serialized inventory mutation handling and realtime fan-out

## Barcode, Export, and Print

- Barcode scanning uses the browser `BarcodeDetector` API when available and falls back to manual or handheld-scanner entry.
- Excel export uses `xlsx`.
- Printing uses standard browser print with print-focused CSS.

## Important Next Steps For Production

- Add real authentication and session validation.
- Enforce role permissions inside the Worker, not only in the UI.
- Add approval workflows for submitted GRN / GIN / transfer requests if posting should not be immediate.
- Replace seeded demo data with persistent warehouse records.
- Add server-side validation for stock limits, duplicate references, and warehouse-level ownership.
- Add automated tests for mutation rules and sync conflict handling.
