const crypto = require('crypto');
const FORM_MIN_MS = 2000, FORM_MAX_MS = 2 * 60 * 60 * 1000;

const sign = (secret, payload) => crypto.createHmac('sha256', secret + ':form').update(payload).digest('base64url');

// Signed, single-use form token. Bots that post instantly, replay, or never loaded the page are rejected.
function makeFormToken(secret, now = Date.now()) {
  const payload = now + '.' + crypto.randomBytes(8).toString('hex');
  return payload + '.' + sign(secret, payload);
}
function checkFormToken(secret, token, used, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 200) return 'bad';
  const parts = token.split('.'); if (parts.length !== 3) return 'bad';
  const [ts, nonce, sig] = parts;
  const good = Buffer.from(sign(secret, ts + '.' + nonce)), got = Buffer.from(sig);
  if (good.length !== got.length || !crypto.timingSafeEqual(good, got)) return 'bad';
  const age = now - Number(ts);
  if (!(age >= FORM_MIN_MS)) return 'early';
  if (age > FORM_MAX_MS) return 'expired';
  if (used.has(nonce)) return 'replay';
  used.set(nonce, now + FORM_MAX_MS);
  return 'ok';
}
function sweep(used, now = Date.now()) { for (const [k, exp] of used) if (exp < now) used.delete(k); }

// Identify real image files by their first bytes, never by file name or declared type.
function sniffImage(b) {
  if (!Buffer.isBuffer(b) || b.length < 12) return null;
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpeg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'png';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}
const BOT_UA = /curl|wget|python|scrapy|httpclient|go-http|libwww|java\/|okhttp|headless|phantom|selenium|puppeteer|playwright|spider|crawl|bot\b/i;
const uaLooksBot = ua => !ua || ua.length < 10 || BOT_UA.test(ua);

function parseCookies(header = '') {
  const o = {};
  for (const p of header.split(';')) {
    const i = p.indexOf('='); if (i < 1) continue;
    try { o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch { /* ignore bad cookie */ }
  }
  return o;
}
module.exports = { makeFormToken, checkFormToken, sweep, sniffImage, uaLooksBot, parseCookies };
