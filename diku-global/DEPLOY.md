# Publish Diku Global on your own domain

You pay for two things: a **domain** and a small **server (VPS)**. Everything else here is free.

## 1. Buy
- **Domain:** any registrar (Namecheap, Cloudflare Registrar, GoDaddy). For `.co.tz` use a TZNIC-accredited registrar. Put the domain in the client's name/email, not yours.
- **Server:** a small Linux VPS (1 vCPU, 1-2 GB RAM is enough for 500+ visitors) from DigitalOcean, Hetzner, Contabo, Vultr, etc. Choose Ubuntu 24.04.

## 2. Point the domain at the server
At your registrar (or Cloudflare) add two DNS records:
`A  @    <server IP>`   and   `A  www  <server IP>`

## 3. Install and start (on the server, via SSH)
```bash
curl -fsSL https://get.docker.com | sh
git clone https://github.com/domiciandeogratius67-hub/diku-global.git && cd diku-global
cp .env.example .env && nano .env      # set DOMAIN, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD_HASH
```
Make the secrets without installing Node on the server:
```bash
docker run --rm node:22-alpine node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"        # JWT_SECRET
docker run --rm node:22-alpine sh -c "npm i -s bcryptjs && node -e \"console.log(require('bcryptjs').hashSync(process.argv[1],12))\" 'YourLongPassword'"   # ADMIN_PASSWORD_HASH
```
Wrap the hash in single quotes in `.env` if it contains `$`.
```bash
docker compose up -d --build
```
Open `https://yourdomain.com` (HTTPS certificate is automatic) and `https://yourdomain.com/admin.html`.

## 4. Firewall
`ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable`. Use SSH keys, disable password SSH.

## 5. Cloudflare (free) in front: strongly recommended for bots and attacks
1. Add the domain to Cloudflare, switch nameservers, turn the proxy (orange cloud) on.
2. SSL/TLS mode: **Full (strict)**. Turn on **Bot Fight Mode** and "Always use HTTPS".
3. Set `TRUST_PROXY=2` in `.env`, then `docker compose up -d`.
4. Turnstile (free human check): Cloudflare dashboard > Turnstile > add site. Put the keys in `.env` as `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET`, restart.

## 6. Alerts and monitoring
- Telegram: make a bot with @BotFather, put token and chat id in `.env`. You get a message for every new order and every NEW website error (max 1 per minute).
- Admin > **Errors** lists every error with how many times it happened, page, time and a reference. Visitors who see an error are shown the same reference.
- Free uptime alerts: UptimeRobot on `https://yourdomain.com/healthz`.

## 7. Backups (do this on day one)
```bash
docker compose exec app npm run backup          # database copy in /data/backups
docker run --rm -v diku-global_appdata:/data -v $PWD:/out alpine tar czf /out/diku-$(date +%F).tgz /data
```
Run the second line daily with `crontab -e` and copy the file off the server (another cloud drive or the client's computer).

## 8. Updating the site
```bash
git pull && docker compose up -d --build
```
