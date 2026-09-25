# Private calendar subscription Worker

This Worker stores one current ICS document per subscription in Workers KV. It never receives ECNU credentials, cookies, session identifiers, or student IDs.

## Security model

- The extension generates independent 256-bit read and update tokens with `crypto.getRandomValues()`.
- The read token is a bearer secret embedded in the calendar URL.
- The update token is sent only in the `Authorization` header. KV stores only its SHA-256 hash.
- KV keys use a SHA-256 hash of the read token, rather than the raw token.
- Each KV record stores only the latest ICS, token hash, timestamps, expiration and a content hash.
- KV expiration deletes the record automatically. Revocation deletes the record, with Cloudflare KV propagation normally completing within about 60 seconds.
- Cross-origin API access is allowed only from browser-extension origins; ordinary websites do not receive CORS permission.
- Requests larger than 512 KiB and subscriptions lasting more than 400 days are rejected.

Anyone who has a read URL can see the course names, times and locations in that feed. Treat it as a password and revoke it if it is exposed.

Workers KV is eventually consistent. Calendar updates and revocations may take up to roughly 60 seconds to become visible from every edge location; calendar clients also refresh subscriptions on their own schedules.

## Repository boundary

The Worker name, public domain, KV binding name and KV namespace ID in `wrangler.jsonc` are public configuration. A namespace ID identifies a resource but does not grant access to it.

Never commit Cloudflare API tokens, Wrangler OAuth credentials, Global API keys, GitHub Actions deployment tokens, real subscription URLs or tokens, KV calendar data, or ECNU cookies and passwords. Wrangler local state and dotenv files are ignored by the repository. If CI deployment is added, store real values only in GitHub Actions secrets such as `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

## Deploy

```bash
npm install
npx wrangler kv namespace create CALENDAR_FEEDS
```

Copy the returned namespace ID into `wrangler.jsonc`, then run:

```bash
npm test
npm run deploy
```

The repository configuration uses `calendar.ycping.top` as the public custom domain. A fork should replace both `PUBLIC_BASE_URL` in `wrangler.jsonc` and `SERVICE_BASE_URL` in `lib/subscription-config.js`.
