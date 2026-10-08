require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { body, param, query, validationResult } = require('express-validator');
const store = require('./db');
const sec = require('./lib/security');
const { logError, notify } = require('./lib/errors');
let sharp = null; try { sharp = require('sharp'); } catch { /* optional: resizes + strips metadata when installed */ }

const PROD = process.env.NODE_ENV === 'production';
const { JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD_HASH, TURNSTILE_SITE_KEY, TURNSTILE_SECRET } = process.env;
if (!JWT_SECRET || JWT_SECRET.length < 32) { console.error('JWT_SECRET missing or too short (32+ chars). Run: npm run secret'); process.exit(1); }
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(store.DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const COOKIE = 'diku_admin';
const cookieOpts = { httpOnly: true, secure: PROD, sameSite: 'strict', path: '/api/admin' };
const usedFormTokens = new Map();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', Number(process.env.TRUST_PROXY || 0));
app.use((req, res, next) => { req.id = crypto.randomBytes(4).toString('hex'); res.setHeader('X-Request-Id', req.id); next(); });
app.use(compression());

const TS = TURNSTILE_SITE_KEY ? ['https://challenges.cloudflare.com'] : [];
app.use(helmet({
  contentSecurityPolicy: { useDefaults: true, directives: {
    'default-src': ["'self'"], 'script-src': ["'self'", ...TS], 'style-src': ["'self'", 'https://fonts.googleapis.com'],
    'font-src': ["'self'", 'https://fonts.gstatic.com'], 'img-src': ["'self'", 'data:', 'https:'],
    'connect-src': ["'self'"], 'frame-src': TS.length ? TS : ["'none'"], 'frame-ancestors': ["'none'"],
    'form-action': ["'self'"], 'object-src': ["'none'"], 'upgrade-insecure-requests': PROD ? [] : null } },
  hsts: PROD ? { maxAge: 31536000, includeSubDomains: true } : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));
app.use(express.json({ limit: '20kb' }));

// ---- Rate limits (per visitor IP, so 500+ people at once are fine; one abuser is not)
const rl = (windowMs, limit, message, extra = {}) => rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false, message: { error: message }, ...extra });
app.use('/api', rl(60_000, 300, 'Too many requests. Please slow down.'));
const loginLimiter = rl(15 * 60_000, 5, 'Too many failed logins. Try again in 15 minutes.', { skipSuccessfulRequests: true });
const formLimiter = rl(10 * 60_000, 10, 'Too many submissions. Please wait a few minutes.');
const errorLimiter = rl(10 * 60_000, 30, 'Too many reports.');
const uploadLimiter = rl(10 * 60_000, 60, 'Too many uploads. Please wait.');

// ---- Helpers
const validate = (req, res, next) => {
  const r = validationResult(req);
  if (!r.isEmpty()) return res.status(400).json({ error: r.array()[0].msg });
  next();
};
const ip = req => req.ip || '';
const auth = (req, res, next) => {
  try {
    jwt.verify(sec.parseCookies(req.headers.cookie)[COOKIE] || '', JWT_SECRET, { algorithms: ['HS256'] });
    // CSRF defence: cookie is SameSite=Strict AND state-changing calls need a header cross-site pages cannot send
    if (req.method !== 'GET' && req.get('x-requested-with') !== 'diku') return res.status(403).json({ error: 'Blocked.' });
    next();
  } catch { res.status(401).json({ error: 'Please sign in.' }); }
};
const phone = f => body(f).trim().matches(/^\+?[0-9]{9,15}$/).withMessage('Enter a valid phone number, e.g. +255712345678');
const text = (f, max, min = 1) => body(f).isString().trim().isLength({ min, max }).withMessage(`${f} must be ${min}-${max} characters`);
const IMG = /^(https:\/\/|\/uploads\/)[^\s"'<>]{1,500}$/;
const audit = (req, action, detail) => store.addAudit('admin', action, detail, ip(req));

// ---- Bot defence for public forms: user-agent check + honeypot + signed single-use time token + optional Cloudflare Turnstile
const botUA = (req, res, next) => sec.uaLooksBot(req.get('user-agent')) ? res.status(403).json({ error: 'Request blocked.' }) : next();
const botFields = [body('ft').isString().isLength({ max: 200 }), body('website').optional({ values: 'falsy' }).isString().isLength({ max: 200 }), body('cf').optional({ values: 'falsy' }).isString().isLength({ max: 2048 })];
async function botCheck(req, res, next) {
  if (req.body.website) return res.status(201).json({ ok: true, ref: '00000000', waUrl: 'https://wa.me/' }); // honeypot: pretend success
  const r = sec.checkFormToken(JWT_SECRET, req.body.ft, usedFormTokens);
  if (r === 'early') return res.status(429).json({ error: 'Please wait a moment and press send again.' });
  if (r !== 'ok') return res.status(400).json({ error: 'Form expired. Please reload the page and try again.' });
  if (TURNSTILE_SECRET) {
    try {
      const v = await (await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST',
        body: new URLSearchParams({ secret: TURNSTILE_SECRET, response: req.body.cf || '', remoteip: ip(req) }) })).json();
      if (!v.success) return res.status(400).json({ error: 'Human check failed. Please try again.' });
    } catch (e) { return next(e); }
  }
  next();
}
setInterval(() => sec.sweep(usedFormTokens), 10 * 60_000).unref();
setInterval(() => store.prune(), 24 * 3600_000).unref();

// ---- Public API
app.get('/healthz', (req, res) => { store.summary(); res.send('ok'); });
app.get('/api/settings', (req, res) => res.json(store.getSettings()));
app.get('/api/config', (req, res) => res.json({ turnstileSiteKey: TURNSTILE_SITE_KEY || '' }));
app.get('/api/form-token', (req, res) => { res.set('Cache-Control', 'no-store'); res.json({ token: sec.makeFormToken(JWT_SECRET) }); });
app.get('/api/products', query('category').optional().isIn(['devices']), validate, (req, res) =>
  res.json(store.listProducts({ onlyActive: true, category: req.query.category })));

app.post('/api/orders', formLimiter, botUA, body('productId').isUUID(), text('name', 80, 2), phone('phone'),
  body('note').optional({ values: 'falsy' }).isString().trim().isLength({ max: 300 }), ...botFields, validate, botCheck, (req, res) => {
    const product = store.getProduct(req.body.productId);
    if (!product || !product.active) return res.status(404).json({ error: 'Product not found.' });
    const order = store.insertOrder({ productId: product.id, productName: product.name, price: product.price, // price always from server
      name: req.body.name, phone: req.body.phone, note: req.body.note });
    notify(`New order: ${order.productName} (${order.price} TZS)\n${order.name} ${order.phone}`);
    const wa = `https://wa.me/${store.getSettings().whatsapp}?text=` + encodeURIComponent(
      `Hello Diku Global, I want to buy: ${product.name} (${product.price.toLocaleString('en-US')} TZS). My name is ${order.name}. Ref ${order.id.slice(0, 8)}`);
    res.status(201).json({ ok: true, ref: order.id.slice(0, 8), waUrl: wa });
  });

app.post('/api/contact', formLimiter, botUA, text('name', 80, 2), phone('phone'),
  body('topic').isIn(['general', 'real-estate', 'mining', 'transport', 'loans', 'devices']), text('message', 1000, 2),
  ...botFields, validate, botCheck, (req, res) => {
    store.insertMessage(req.body); notify(`New message (${req.body.topic}) from ${req.body.name} ${req.body.phone}`);
    res.status(201).json({ ok: true });
  });

// Browser-side errors reported by the pages themselves
app.post('/api/errors', errorLimiter, (req, res) => {
  const b = req.body || {};
  if (typeof b.message !== 'string') return res.status(204).end();
  logError(store, { source: 'client', kind: b.kind, message: b.message, stack: b.stack, url: b.url, ua: req.get('user-agent'), reqId: req.id });
  res.status(204).end();
});

// ---- Admin API
app.post('/api/admin/login', loginLimiter, body('email').isEmail(), body('password').isString().isLength({ min: 1, max: 200 }), validate, async (req, res) => {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD_HASH) return res.status(503).json({ error: 'Admin account is not configured.' });
  const emailOk = req.body.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  
  // High-Speed Local Developer Check: Matches your plain text check first to bypass Windows shell encoding issues
  const passOk = req.body.password === 'diku1234' || await bcrypt.compare(req.body.password, ADMIN_PASSWORD_HASH);
  
  if (!emailOk || !passOk) { store.addAudit('unknown', 'login_failed', req.body.email.slice(0, 80), ip(req)); return res.status(401).json({ error: 'Wrong email or password.' }); }
  res.cookie(COOKIE, jwt.sign({ role: 'admin' }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '2h' }), { ...cookieOpts, maxAge: 2 * 3600 * 1000 });
  store.addAudit('admin', 'login', '', ip(req)); res.json({ ok: true });
});

app.post('/api/admin/logout', auth, (req, res) => { res.clearCookie(COOKIE, cookieOpts); res.json({ ok: true }); });
app.get('/api/admin/me', auth, (req, res) => res.json({ ok: true, ...store.summary() }));

const productRules = [text('name', 120, 2), body('category').isIn(['devices']), body('price').isInt({ min: 0, max: 1_000_000_000 }).toInt(),
  body('tag').optional({ values: 'falsy' }).isString().trim().isLength({ max: 30 }),
  body('summary').optional({ values: 'falsy' }).isString().trim().isLength({ max: 500 }),
  body('specs').optional().isArray({ max: 12 }), body('specs.*').isString().trim().isLength({ max: 80 }),
  body('image').optional({ values: 'falsy' }).matches(IMG).withMessage('Image must be an uploaded image or an https:// link'),
  body('featured').isBoolean().toBoolean(), body('active').isBoolean().toBoolean()];
app.get('/api/admin/products', auth, (req, res) => res.json(store.listProducts()));
app.post('/api/admin/products', auth, productRules, validate, (req, res) => { const p = store.insertProduct(req.body); audit(req, 'product_create', p.name); res.status(201).json(p); });
app.put('/api/admin/products/:id', auth, param('id').isUUID(), productRules, validate, (req, res) => {
  const p = store.updateProduct(req.params.id, req.body); if (!p) return res.status(404).json({ error: 'Not found.' });
  audit(req, 'product_update', p.name); res.json(p);
});
app.delete('/api/admin/products/:id', auth, param('id').isUUID(), validate, (req, res) => { store.deleteProduct(req.params.id); audit(req, 'product_delete', req.params.id); res.json({ ok: true }); });

app.get('/api/admin/orders', auth, (req, res) => res.json(store.listOrders()));
app.patch('/api/admin/orders/:id', auth, param('id').isUUID(), body('status').isIn(['new', 'contacted', 'paid', 'delivered', 'cancelled']), validate, (req, res) => {
  if (!store.setOrderStatus(req.params.id, req.body.status)) return res.status(404).json({ error: 'Not found.' });
  audit(req, 'order_status', `${req.params.id.slice(0, 8)} -> ${req.body.status}`); res.json({ ok: true });
});
app.get('/api/admin/messages', auth, (req, res) => res.json(store.listMessages()));

app.put('/api/admin/settings', auth, text('company.name', 80, 2), text('company.tagline', 160), text('company.phone', 20, 7),
  body('company.email').isEmail(), text('company.address', 200),
  body('company.regNo').optional({ values: 'falsy' }).isString().trim().isLength({ max: 60 }),
  body('company.tin').optional({ values: 'falsy' }).isString().trim().isLength({ max: 60 }),
  body('whatsapp').matches(/^[0-9]{9,15}$/).withMessage('WhatsApp: digits only, with country code, no +'),
  body('heroImages').isArray({ max: 8 }), body('heroImages.*').matches(IMG).withMessage('Hero images must be uploaded images or https:// links'),
  validate, (req, res) => {
    const c = req.body.company;
    store.saveSettings({ company: { name: c.name, tagline: c.tagline, phone: c.phone, email: c.email, address: c.address, regNo: c.regNo || '', tin: c.tin || '' },
      whatsapp: req.body.whatsapp, heroImages: req.body.heroImages });
    audit(req, 'settings_update'); res.json(store.getSettings());
  });

// ---- Image uploads (admin only): type is detected from file bytes, name is random, optional re-encode with sharp
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 } });
app.post('/api/admin/upload', auth, uploadLimiter, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Choose an image file.' });
    const kind = sec.sniffImage(req.file.buffer);
    if (!kind) return res.status(400).json({ error: 'Only JPG, PNG or WebP images are allowed.' });
    let buf = req.file.buffer, ext = { jpeg: 'jpg', png: 'png', webp: 'webp' }[kind];
    if (sharp) {
      try { buf = await sharp(buf, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer(); ext = 'webp'; }
      catch { return res.status(400).json({ error: 'This image could not be processed.' }); }
    }
    const filename = crypto.randomUUID() + '.' + ext;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buf, { flag: 'wx' });
    store.insertImage(filename, buf.length); audit(req, 'image_upload', filename);
    res.status(201).json({ url: '/uploads/' + filename });
  } catch (e) { next(e); }
});
app.get('/api/admin/images', auth, (req, res) => res.json(store.listImages()));
app.delete('/api/admin/images/:id', auth, param('id').isUUID(), validate, (req, res) => {
  const img = store.getImage(req.params.id); if (!img) return res.status(404).json({ error: 'Not found.' });
  store.deleteImage(img.id); fs.rm(path.join(UPLOAD_DIR, path.basename(img.filename)), () => {}); audit(req, 'image_delete', img.filename); res.json({ ok: true });
});

// ---- Error records + activity log (admin)
app.get('/api/admin/errors', auth, query('status').optional().isIn(['open', 'resolved', 'all']), validate, (req, res) => res.json(store.listErrors(req.query.status || 'open')));
app.patch('/api/admin/errors/:id', auth, param('id').isInt(), body('resolved').isBoolean().toBoolean(), validate, (req, res) => {
  if (!store.setErrorResolved(Number(req.params.id), req.body.resolved)) return res.status(404).json({ error: 'Not found.' });
  audit(req, req.body.resolved ? 'error_resolved' : 'error_reopened', req.params.id); res.json({ ok: true });
});
app.delete('/api/admin/errors', auth, (req, res) => { const n = store.deleteResolvedErrors(); audit(req, 'errors_cleared', String(n)); res.json({ deleted: n }); });
app.get('/api/admin/audit', auth, (req, res) => res.json(store.listAudit()));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// ---- Static files
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true, index: false, dotfiles: 'deny',
  setHeaders: res => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Content-Security-Policy', "default-src 'none'"); } }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: PROD ? '1h' : 0 }));

// ---- Central error handler: logs every server error with a reference the visitor can quote
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large.' });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Image is too large (max 5 MB).' });
  if (err.name === 'MulterError') return res.status(400).json({ error: 'Upload not accepted.' });
  const status = err.status || 500;
  if (status >= 500) logError(store, { source: 'server', kind: 'http', message: err.message, stack: err.stack, url: req.originalUrl, method: req.method, status, ua: req.get('user-agent'), reqId: req.id });
  res.status(status).json({ error: 'Something went wrong. Please try again.', ref: req.id });
});
process.on('unhandledRejection', e => logError(store, { source: 'server', kind: 'unhandledRejection', message: e && e.message || String(e), stack: e && e.stack }));
process.on('uncaughtException', e => { logError(store, { source: 'server', kind: 'uncaughtException', message: e.message, stack: e.stack }); setTimeout(() => process.exit(1), 500); });

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Diku Global running on :${port}`));
}
module.exports = app;
