# Diku Global Services

Production full-stack site: Node.js 22 + Express + SQLite, vanilla JS front end, admin panel.
**Publishing on a domain: see [DEPLOY.md](DEPLOY.md).**

**Live now:** Devices (TZS prices, Buy now -> WhatsApp to the marketing manager + admin notification).
**Coming soon pages:** Real Estate, Mining, Transportation, Financial Loans (no money or applications taken).

## Run locally (Node 22.5+)
```bash
npm install
cp .env.example .env
npm run secret                       # -> JWT_SECRET
npm run hash -- "a-long-password"    # -> ADMIN_PASSWORD_HASH (quote it in .env if it has $)
npm test && npm start                # http://localhost:3000   admin: /admin.html
```

## Admin panel
Orders, Products (with picture upload), Images library, Hero and company details, Messages, **Errors**, **Activity**.

## Error reporting and records
- Server errors, crashes, failed API calls (5xx) and browser JavaScript errors are all saved.
- Identical errors are grouped into one row with a count, first/last seen, page, status and stack.
- Fixed errors that come back reopen automatically and trigger a Telegram alert.
- Visitors see a short reference code on failures so you can find the exact error.
- Activity log keeps admin logins (including failed ones with IP) and every change. Old resolved errors are pruned after 90 days, activity after 1 year.

## Security
- Strict CSP, HSTS, no inline scripts, no `innerHTML`, clickjacking/MIME-sniff protection
- Admin session: bcrypt (cost 12), 2-hour httpOnly + SameSite=Strict cookie, CSRF header check, 5 failed logins / 15 min / IP
- Uploads: admin only, 5 MB, file type read from the bytes (JPG/PNG/WebP only), random file names, served with `nosniff` and `default-src 'none'`; re-encoded and metadata stripped when `sharp` is installed
- Bots: user-agent filter, hidden honeypot field, signed single-use time token, per-IP rate limits, optional Cloudflare Turnstile
- Server-side validation on every input, 20 KB JSON limit, prices read from the database not the browser
- Secrets only in `.env`; no stack traces sent to visitors; `/admin.html` and `/api/` are `noindex`
- Capacity: rate limits are per visitor IP (300 requests/min), static files are cached and compressed, SQLite runs in WAL mode. A 1-2 GB server handles 500+ simultaneous visitors; Cloudflare in front absorbs spikes.

## Structure
```
server.js  db.js  lib/{security,errors}.js  scripts/  tests/
public/ (index, devices, service, admin + css/js)   Dockerfile  docker-compose.yml  Caddyfile
```
