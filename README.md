# Rosetta Sales Performance Dashboard

Rosetta's sales, lead follow-up, client-care, and team-access dashboard.
The application is a Vinext/React service deployed to Cloudflare Workers with
Cloudflare D1 as its database.

## Prerequisites

- Node.js `>=22.13.0`
- A Cloudflare account with Workers and D1 access

## Local development

```bash
npm install
npm run dev
```

The app uses a local D1 placeholder for local previews. Production bindings and
secrets are configured in Cloudflare; never commit `.env` files or passwords.

## Deployment

```bash
npm run build
npx wrangler d1 migrations apply rosetta-sales-dashboard --remote
npx wrangler deploy
```

The production D1 binding is recorded in `wrangler.jsonc`. Configure the
required Worker secrets before the first deployment:

- `PASSWORD_ACCESS_ENABLED=true`
- `APP_SESSION_SECRET`
- `ADMIN_EMAIL`
- `INITIAL_ADMIN_PASSWORD`

Optional Google Calendar sync (see `GOOGLE_CALENDAR_SETUP.md`; do not commit these values):

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_TOKEN_ENCRYPTION_KEY` (optional; falls back to `APP_SESSION_SECRET`)
- `GOOGLE_OAUTH_REDIRECT_URI` (optional; defaults to `{origin}/api/calendar/oauth/callback`)

The deployment account and database should be transferred to Rosetta before any
administrator leaves the organization.

## Client care for Won leads

Migration `drizzle/0010_won_leads_client_care.sql`:

- Adds a unique index on `client_follow_ups.sales_record_id` (unlinked rows may still share a NULL).
- Unlinks extra follow-ups that pointed at the same sales record so the unique index can apply; those care rows are kept.
- Inserts a client-care row for each existing `sales_records` row in stage `Won` that is not already linked.

Apply with the usual `wrangler d1 migrations apply` before deploy. The Worker also
idempotently creates missing Won-lead care rows when Client care or Admin controls
open, and when a lead is created, updated, imported, or merged into Won. Client
Care stays Won-only while the Admin toggle is on: changing a linked lead away from
Won (from Client Care Status, Sales records, or any deal PATCH) deletes that
`client_follow_ups` row and its calendar event. Unlinked care rows are left alone.
Turning the toggle off stops new auto-adds and stops auto-removes; existing care
rows then stay, including after a lead leaves Won.

## Project structure

- `app/`: dashboard pages, UI, and API routes
- `db/`: D1 database binding and Drizzle schema
- `drizzle/`: ordered SQL migrations
- `worker/`: Cloudflare Worker entry point
- `public/`: Rosetta visual assets
- `tests/`: rendered application checks

## Useful commands

- `npm run dev`: run a local preview
- `npm run build`: build the Worker and client assets
- `npm test`: build and run the rendered HTML check
- `npm run db:generate`: create new Drizzle migrations after schema changes
