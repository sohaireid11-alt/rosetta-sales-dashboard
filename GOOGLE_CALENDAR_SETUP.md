# Google Calendar setup

Follow-up dates on Sales records and Client care can sync to one Google Calendar.
The default target account is Danyal (`danyal@rosettalanguages.org`). After this
one-time Google Cloud and Worker secret setup, admins connect the account, edit
templates, and turn sync on from **Admin controls → Calendar**. No further GitHub
or Cloudflare dashboard work is needed for day-to-day use.

Do not commit OAuth client IDs, client secrets, or refresh tokens.

## 1. Google Cloud Console

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Enable **Google Calendar API** (APIs & Services → Library → Google Calendar API → Enable).
3. Configure the **OAuth consent screen**.
   - App type **Internal** if the Rosetta Google Workspace allows it.
   - Otherwise **External**, keep the app in testing, and add `danyal@rosettalanguages.org` (and any admin who will click Connect) as test users.
4. Create credentials → **OAuth client ID** → Application type **Web application**.
5. Add **Authorized redirect URIs**. They must match the Worker callback exactly:
   - Production: `https://rosetta-sales-dashboard.sohaireid11.workers.dev/api/calendar/oauth/callback`
   - Custom domain, if used: `https://<your-domain>/api/calendar/oauth/callback`
   - Local preview: `http://localhost:<dev-port>/api/calendar/oauth/callback` (use the port printed by `npm run dev`)
6. Copy the **Client ID** and **Client secret**. Store them only as Worker secrets.

## 2. Worker secrets

From the repo root, using the Cloudflare account that owns `rosetta-sales-dashboard`:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

Optional encryption key for the stored refresh token. If omitted, the app encrypts
tokens with the existing `APP_SESSION_SECRET`:

```bash
npx wrangler secret put GOOGLE_TOKEN_ENCRYPTION_KEY
```

Optional redirect URI override. Set this when the public URL does not match the
request origin. The value must be identical to an Authorized redirect URI:

```bash
npx wrangler secret put GOOGLE_OAUTH_REDIRECT_URI
```

Example: `https://rosetta-sales-dashboard.sohaireid11.workers.dev/api/calendar/oauth/callback`

Account access secrets from `ACCOUNT_ACCESS_SETUP.md` must already be set,
including `APP_SESSION_SECRET`.

## 3. Database migration

```bash
npx wrangler d1 migrations apply rosetta-sales-dashboard --remote
```

This creates `calendar_event_mappings` (entity → Google event id) and
`google_oauth_connections` (encrypted refresh token, admin-only).

## 4. Admin enablement (no code)

After deploy, migration, and secrets:

1. Sign in as an administrator.
2. Open **Admin controls → Calendar**.
3. Click **Connect Google Calendar** and sign in as Danyal (`danyal@rosettalanguages.org`).
4. Confirm **Calendar ID** (`primary` unless another calendar is required) and timezone (`Africa/Cairo` by default).
5. Edit the event title and description templates if needed. Placeholders: `{name}` `{action}` `{date}` `{type}` `{stage}` `{service}` `{company}` `{context}`.
6. Turn **Sync follow-up dates to Google Calendar** on and save.

If sync is on but Google is not connected, Admin controls shows that status.
Creating or updating a sales or client-care record still succeeds.

## Scopes requested

Minimal Calendar access plus the connected account email:

- `https://www.googleapis.com/auth/calendar.events` — create, update, and delete events
- `https://www.googleapis.com/auth/userinfo.email` — show which Google account connected

## Behaviour

- Every follow-up on the dashboard syncs to the connected calendar, not only leads owned by Danyal.
- Date-only follow-up fields become all-day events. The end date is the next day (Google all-day exclusive end).
- Changing a follow-up date updates the same event (idempotent mapping by sales record or client-care row).
- Clearing a follow-up date, or deleting the row, deletes the linked event.
- Google API errors are stored on the Calendar tab and never fail the user's save.
