'use strict';
// Reports browser errors to the server's error log (max 5 per page load)
let _reported = 0;
function reportError(d) {
  if (_reported++ >= 5) return;
  try { fetch('/api/errors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
    body: JSON.stringify({ kind: d.kind, message: String(d.message || '').slice(0, 300), stack: String(d.stack || '').slice(0, 2000), url: location.pathname }) }).catch(() => {}); } catch (e) { /* ignore */ }
}
addEventListener('error', e => { if (e.message && e.message !== 'Script error.') reportError({ kind: 'js', message: e.message, stack: e.error && e.error.stack }); });
addEventListener('unhandledrejection', e => reportError({ kind: 'promise', message: (e.reason && e.reason.message) || String(e.reason), stack: e.reason && e.reason.stack }));

const $ = (s, r = document) => r.querySelector(s);
// Safe DOM builder: text is always inserted as text (no innerHTML => no XSS)
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
const money = n => new Intl.NumberFormat('en-US').format(n) + ' TZS';
async function api(url, opt = {}) {
  const res = await fetch(url, {
    ...opt, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'diku', ...opt.headers },
    body: opt.body ? JSON.stringify(opt.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status >= 500) reportError({ kind: 'api', message: `${opt.method || 'GET'} ${url} returned ${res.status} (ref ${data.ref || '-'})` });
    throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, ref: data.ref });
  }
  return data;
}
const errText = e => e.message + (e.ref ? ` (ref ${e.ref})` : '');
function modal(title, ...content) {
  const d = h('dialog', {}, h('div', { class: 'in' },
    h('button', { class: 'x', 'aria-label': 'Close', onclick: () => d.close() }, '×'),
    h('h2', {}, title), ...content));
  d.addEventListener('close', () => d.remove());
  document.body.append(d); d.showModal(); return d;
}
const ICON = {
  device: '<path d="M4 14h16v6H4zM8 17h.01M12 17h.01M7 14l-2-4M17 14l2-4M9 10a4 4 0 016 0M7 7a8 8 0 0110 0"/>',
  estate: '<path d="M3 21V9l9-6 9 6v12M9 21v-7h6v7"/>',
  mining: '<path d="M6 3h12l4 6-10 12L2 9z M2 9h20M9 3l3 6 3-6M12 21L9 9M12 21l3-12"/>',
  truck: '<path d="M2 6h12v10H2zM14 10h5l3 3v3h-8M6 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z"/>',
  loan: '<path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>'
};
const icon = k => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = ICON[k]; return s; };

const SERVICES = [
  { key: 'devices', href: '/devices.html', icon: 'device', title: 'Devices', live: true, text: 'Routers, WiFi devices and accessories for home and business.' },
  { key: 'real-estate', href: '/service.html?s=real-estate', icon: 'estate', title: 'Real Estate', text: 'Land and property opportunities.' },
  { key: 'mining', href: '/service.html?s=mining', icon: 'mining', title: 'Mining', text: 'Responsible mineral trade and investment.' },
  { key: 'transport', href: '/service.html?s=transport', icon: 'truck', title: 'Transportation', text: 'Freight and passenger transport services.' },
  { key: 'loans', href: '/service.html?s=loans', icon: 'loan', title: 'Financial Loans', text: 'Credit and financing for people and businesses.' }
];

async function chrome(active) {
  const s = await api('/api/settings');
  const c = s.company;
  document.title = (document.title ? document.title + ' | ' : '') + c.name;
  $('#hdr').replaceWith(h('header', { class: 'site' }, h('div', { class: 'wrap' },
    h('a', { class: 'brand', href: '/' }, 'Diku ', h('span', {}, 'Global')),
    h('nav', { class: 'main', 'aria-label': 'Main' },
      h('a', { href: '/', ...(active === 'home' ? { 'aria-current': 'page' } : {}) }, 'Home'),
      h('a', { href: '/devices.html', ...(active === 'devices' ? { 'aria-current': 'page' } : {}) }, 'Devices'),
      h('a', { href: '/service.html?s=real-estate' }, 'Real Estate'),
      h('a', { href: '/service.html?s=mining' }, 'Mining'),
      h('a', { href: '/service.html?s=transport' }, 'Transport'),
      h('a', { href: '/#contact' }, 'Contact')))));
  const legal = [c.regNo && 'Reg. no. ' + c.regNo, c.tin && 'TIN ' + c.tin].filter(Boolean).join(' / ');
  $('#ftr').replaceWith(h('footer', { class: 'site' }, h('div', { class: 'wrap' },
    h('strong', {}, c.name), h('p', {}, c.tagline),
    h('p', {}, c.address, ' | ', h('a', { href: 'tel:' + c.phone }, c.phone), ' | ', h('a', { href: 'mailto:' + c.email }, c.email)),
    legal ? h('p', {}, legal) : null,
    h('p', { class: 'risk' }, 'Investment notice: returns are never guaranteed and the value of any investment can go down as well as up. Services marked "Coming soon" are not yet available and no money is accepted for them. Prices are in Tanzanian shillings (TZS).'))));
  assistant(s);
  return s;
}

// Simple rule-based help assistant (no external AI service, no data leaves the site)
function assistant(s) {
  const fab = h('button', { class: 'ai-fab', 'aria-label': 'Open help assistant' }, 'AI');
  const answers = [
    [/price|cost|bei|how much/, 'All prices are in TZS and shown on each device card. Open Devices to see them.'],
    [/buy|order|nunua/, 'On the Devices page press "Buy now", enter your name and phone, and we continue on WhatsApp with our marketing manager.'],
    [/real estate|land|house|plot|nyumba/, 'Real Estate is coming soon. Leave your number on that page and we will tell you first.'],
    [/mining|mine|mineral/, 'Mining is coming soon. Leave your details on the Mining page.'],
    [/transport|truck|freight|bus/, 'Transportation is coming soon. Leave your details on the Transportation page.'],
    [/loan|credit|mkopo/, 'Financial loans are coming soon. We do not accept loan applications or fees yet.'],
    [/safe|secure|scam|trust|legit/, 'We never ask for payment before you speak with us on our official WhatsApp number. Always confirm details on this website.'],
    [/contact|phone|call|whatsapp/, `You can call ${s.company.phone} or message us on WhatsApp from any Buy now button.`]
  ];
  const log = h('div', { class: 'chat', 'aria-live': 'polite' }, h('p', {}, 'Hi! Ask about devices, prices, ordering or our upcoming services.'));
  const input = h('input', { type: 'text', maxlength: '120', 'aria-label': 'Your question' });
  fab.addEventListener('click', () => {
    const d = modal('Ask Diku', log, h('form', { class: 'stack', onsubmit: e => {
      e.preventDefault(); const q = input.value.trim().toLowerCase(); if (!q) return;
      log.append(h('p', { class: 'me' }, input.value.trim()));
      const hit = answers.find(a => a[0].test(q));
      log.append(h('p', {}, hit ? hit[1] : 'I am not sure. Please message us on WhatsApp and a person will help.'));
      input.value = ''; log.scrollTop = log.scrollHeight;
    } }, input, h('button', { class: 'btn dark' }, 'Send')));
    input.focus();
  });
  document.body.append(fab);
}

function deviceCard(p, onInfo, onBuy) {
  return h('article', { class: 'card' },
    h('div', { class: 'img', ...(p.image ? { role: 'img', 'aria-label': p.name } : {}) }, p.image ? null : icon('device')),
    h('div', { class: 'body' },
      p.tag ? h('span', { class: 'tag' }, p.tag) : null,
      h('h3', {}, p.name),
      h('div', { class: 'price' }, money(p.price)),
      h('div', { class: 'row' },
        h('button', { class: 'btn alt', onclick: () => onInfo(p) }, 'More info'),
        h('button', { class: 'btn', onclick: () => onBuy(p) }, 'Buy now'))));
}
function applyImages() { document.querySelectorAll('.img[data-src]').forEach(e => e.style.backgroundImage = `url("${e.dataset.src}")`); }
function setCardImages(root, list) {
  root.querySelectorAll('.card').forEach((el, i) => { const p = list[i]; if (p && p.image) el.querySelector('.img').style.backgroundImage = `url("${p.image}")`; });
}
function showInfo(p) {
  modal(p.name, h('p', {}, h('strong', {}, money(p.price))), h('p', {}, p.summary || ''),
    p.specs && p.specs.length ? h('ul', { class: 'specs' }, p.specs.map(x => h('li', {}, x))) : null,
    h('button', { class: 'btn', onclick: e => { e.target.closest('dialog').close(); buyFlow(p); } }, 'Buy now'));
}
// Bot defence: hidden honeypot + signed time token (+ Cloudflare Turnstile when the site has a key)
let _cfg;
function loadTurnstile() {
  return new Promise(ok => { if (window.turnstile) return ok(); const t = document.createElement('script');
    t.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; t.async = true; t.onload = ok; document.head.append(t); });
}
async function botGuard() {
  _cfg = _cfg || await api('/api/config');
  const { token } = await api('/api/form-token');
  const hp = h('input', { name: 'website', class: 'hp', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
  const box = h('div'); let wid = null;
  if (_cfg.turnstileSiteKey) loadTurnstile().then(() => { wid = window.turnstile.render(box, { sitekey: _cfg.turnstileSiteKey }); });
  return { el: h('div', {}, hp, box), payload: () => ({ ft: token, website: hp.value, cf: wid !== null ? window.turnstile.getResponse(wid) : '' }) };
}

function buyFlow(p) {
  const out = h('div'); const btn = h('button', { class: 'btn' }, 'Continue'); let guard;
  const f = h('form', { class: 'stack', onsubmit: async e => {
    e.preventDefault(); if (!guard) return; btn.disabled = true; out.replaceChildren();
    const fd = new FormData(f);
    try {
      const r = await api('/api/orders', { method: 'POST', body: { productId: p.id, name: fd.get('name'), phone: fd.get('phone'), note: fd.get('note'), ...guard.payload() } });
      f.replaceWith(h('div', {}, h('p', { class: 'msg' }, `Order request sent. Reference ${r.ref}. Our marketing manager has been notified.`),
        h('a', { class: 'btn', href: r.waUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Continue on WhatsApp')));
    } catch (err) { out.replaceChildren(h('p', { class: 'msg err' }, errText(err))); btn.disabled = false; }
  } },
    h('p', {}, h('strong', {}, p.name), ' - ', money(p.price)),
    h('label', {}, 'Your name', h('input', { name: 'name', required: true, minlength: 2, maxlength: 80, autocomplete: 'name' })),
    h('label', {}, 'Phone (with country code)', h('input', { name: 'phone', required: true, type: 'tel', placeholder: '+255712345678', autocomplete: 'tel' })),
    h('label', {}, 'Note (optional)', h('input', { name: 'note', maxlength: 300 })),
    out, btn);
  modal('Buy now', f);
  botGuard().then(g => { guard = g; f.append(g.el); }).catch(err => out.replaceChildren(h('p', { class: 'msg err' }, errText(err))));
}

function contactForm(topic) {
  const out = h('div'); const btn = h('button', { class: 'btn dark' }, 'Send message'); let guard;
  const f = h('form', { class: 'stack', onsubmit: async e => {
    e.preventDefault(); if (!guard) return; btn.disabled = true; out.replaceChildren();
    const fd = new FormData(f);
    try {
      await api('/api/contact', { method: 'POST', body: { name: fd.get('name'), phone: fd.get('phone'), topic: fd.get('topic') || topic, message: fd.get('message'), ...guard.payload() } });
      f.replaceWith(h('p', { class: 'msg' }, 'Thank you. We received your message and will reply by phone.'));
    } catch (err) { out.replaceChildren(h('p', { class: 'msg err' }, errText(err))); btn.disabled = false; }
  } },
    h('label', {}, 'Your name', h('input', { name: 'name', required: true, minlength: 2, maxlength: 80, autocomplete: 'name' })),
    h('label', {}, 'Phone (with country code)', h('input', { name: 'phone', required: true, type: 'tel', placeholder: '+255712345678', autocomplete: 'tel' })),
    topic ? null : h('label', {}, 'Topic', h('select', { name: 'topic' }, ['general', 'devices', 'real-estate', 'mining', 'transport', 'loans'].map(t => h('option', { value: t }, t.replace('-', ' '))))),
    h('label', {}, 'Message', h('textarea', { name: 'message', required: true, minlength: 2, maxlength: 1000 })),
    out, btn);
  botGuard().then(g => { guard = g; f.append(g.el); }).catch(err => out.replaceChildren(h('p', { class: 'msg err' }, errText(err))));
  return f;
}
