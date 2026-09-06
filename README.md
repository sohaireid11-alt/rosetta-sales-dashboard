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
npx wrangler deploy --config dist/server/wrangler.json
```

Before deploying, update the generated `dist/server/wrangler.json` with the
correct production D1 database ID and configure the required Worker secrets:

- `PASSWORD_ACCESS_ENABLED=true`
- `APP_SESSION_SECRET`
- `ADMIN_EMAIL`
- `INITIAL_ADMIN_PASSWORD`

The deployment account and database should be transferred to Rosetta before any
administrator leaves the organization.

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
