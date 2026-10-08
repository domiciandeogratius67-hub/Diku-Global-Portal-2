const crypto = require('crypto');
let lastAlert = 0;

async function notify(msg) {
  const { TELEGRAM_BOT_TOKEN: t, TELEGRAM_CHAT_ID: c } = process.env;
  if (!t || !c) return;
  try {
    await fetch(`https://api.telegram.org/bot${t}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: c, text: msg.slice(0, 900) })
    });
  } catch { console.error('notify failed'); }
}
// /orders/<uuid>?x=1 -> /orders/:id  so the same bug on different pages/records groups together
const normUrl = u => String(u || '').split('?')[0].slice(0, 200)
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id').replace(/\d{4,}/g, ':n');

function logError(store, d) {
  const i = {
    source: d.source === 'client' ? 'client' : 'server', kind: String(d.kind || '').slice(0, 20), level: 'error',
    message: String(d.message || 'unknown error').slice(0, 300), stack: String(d.stack || '').slice(0, 2000),
    url: normUrl(d.url), method: String(d.method || '').slice(0, 10), status: Number(d.status) || 0,
    ua: String(d.ua || '').slice(0, 160), reqId: String(d.reqId || '').slice(0, 20)
  };
  const fp = crypto.createHash('sha256').update([i.source, i.kind, i.message, i.stack.split('\n').slice(0, 2).join('|'), i.url].join('|')).digest('hex').slice(0, 32);
  const { isNew } = store.upsertError(fp, i);
  console.error(JSON.stringify({ t: new Date().toISOString(), lvl: 'error', src: i.source, msg: i.message, url: i.url, status: i.status, req: i.reqId, new: isNew }));
  if (isNew && Date.now() - lastAlert > 60_000) { // at most one alert per minute
    lastAlert = Date.now();
    notify(`Website error (${i.source}) on ${i.url || '-'}\n${i.message}\nSee Admin > Errors`);
  }
  return { fingerprint: fp, isNew };
}
module.exports = { logError, notify, normUrl };
