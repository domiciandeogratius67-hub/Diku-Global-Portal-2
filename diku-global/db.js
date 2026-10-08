// SQLite (built into Node 22+). WAL mode = many readers + one writer, plenty for thousands of visitors.
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'diku.db'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;');
db.exec(`
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, price INTEGER NOT NULL,
  tag TEXT NOT NULL DEFAULT '', summary TEXT NOT NULL DEFAULT '', specs TEXT NOT NULL DEFAULT '[]',
  image TEXT NOT NULL DEFAULT '', featured INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL, product_name TEXT NOT NULL, price INTEGER NOT NULL,
  name TEXT NOT NULL, phone TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, topic TEXT NOT NULL, message TEXT NOT NULL,
  created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY, filename TEXT NOT NULL UNIQUE, size INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT, fingerprint TEXT NOT NULL UNIQUE, source TEXT NOT NULL, kind TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT 'error', message TEXT NOT NULL, stack TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL DEFAULT '', status INTEGER NOT NULL DEFAULT 0, user_agent TEXT NOT NULL DEFAULT '',
  request_id TEXT NOT NULL DEFAULT '', first_seen TEXT NOT NULL, last_seen TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1, resolved INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '', ip TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_errors_last ON errors(last_seen);
`);

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const bool = v => (v ? 1 : 0);
const P = r => r && ({ id: r.id, name: r.name, category: r.category, price: r.price, tag: r.tag, summary: r.summary,
  specs: JSON.parse(r.specs), image: r.image, featured: !!r.featured, active: !!r.active });
const O = r => ({ id: r.id, productId: r.product_id, productName: r.product_name, price: r.price, name: r.name,
  phone: r.phone, note: r.note, status: r.status, createdAt: r.created_at });
const E = r => ({ id: r.id, source: r.source, kind: r.kind, level: r.level, message: r.message, stack: r.stack, url: r.url,
  method: r.method, status: r.status, requestId: r.request_id, firstSeen: r.first_seen, lastSeen: r.last_seen,
  count: r.count, resolved: !!r.resolved });

const DEFAULT_SETTINGS = {
  company: { name: 'Diku Global Services', tagline: 'Internet hardware today. Property, mining and transport next.',
    phone: '+255000000000', email: 'info@example.com', address: 'Tanzania', regNo: '', tin: '' },
  whatsapp: '255000000000', heroImages: []
};

const store = {
  db, DATA_DIR,
  getSettings() { const r = db.prepare('SELECT v FROM kv WHERE k=?').get('settings'); return r ? JSON.parse(r.v) : DEFAULT_SETTINGS; },
  saveSettings(s) { db.prepare('INSERT INTO kv(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run('settings', JSON.stringify(s)); },

  listProducts({ onlyActive = false, category } = {}) {
    let sql = 'SELECT * FROM products WHERE 1=1'; const a = [];
    if (onlyActive) sql += ' AND active=1';
    if (category) { sql += ' AND category=?'; a.push(category); }
    return db.prepare(sql + ' ORDER BY created_at DESC').all(...a).map(P);
  },
  getProduct: id => P(db.prepare('SELECT * FROM products WHERE id=?').get(id)),
  insertProduct(p) {
    const id = uid();
    db.prepare('INSERT INTO products(id,name,category,price,tag,summary,specs,image,featured,active,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, p.name, p.category, p.price, p.tag || '', p.summary || '', JSON.stringify(p.specs || []), p.image || '', bool(p.featured), bool(p.active), now());
    return store.getProduct(id);
  },
  updateProduct(id, p) {
    const r = db.prepare('UPDATE products SET name=?,category=?,price=?,tag=?,summary=?,specs=?,image=?,featured=?,active=? WHERE id=?')
      .run(p.name, p.category, p.price, p.tag || '', p.summary || '', JSON.stringify(p.specs || []), p.image || '', bool(p.featured), bool(p.active), id);
    return r.changes ? store.getProduct(id) : null;
  },
  deleteProduct: id => db.prepare('DELETE FROM products WHERE id=?').run(id).changes,

  insertOrder(o) {
    const id = uid();
    db.prepare('INSERT INTO orders(id,product_id,product_name,price,name,phone,note,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id, o.productId, o.productName, o.price, o.name, o.phone, o.note || '', 'new', now());
    return O(db.prepare('SELECT * FROM orders WHERE id=?').get(id));
  },
  listOrders: () => db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 1000').all().map(O),
  setOrderStatus: (id, s) => db.prepare('UPDATE orders SET status=? WHERE id=?').run(s, id).changes,

  insertMessage(m) { db.prepare('INSERT INTO messages(id,name,phone,topic,message,created_at) VALUES(?,?,?,?,?,?)').run(uid(), m.name, m.phone, m.topic, m.message, now()); },
  listMessages: () => db.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT 1000').all()
    .map(r => ({ id: r.id, name: r.name, phone: r.phone, topic: r.topic, message: r.message, createdAt: r.created_at })),

  insertImage(filename, size) { const id = uid(); db.prepare('INSERT INTO images(id,filename,size,created_at) VALUES(?,?,?,?)').run(id, filename, size, now()); return id; },
  listImages: () => db.prepare('SELECT * FROM images ORDER BY created_at DESC LIMIT 500').all()
    .map(r => ({ id: r.id, url: '/uploads/' + r.filename, size: r.size, createdAt: r.created_at })),
  getImage: id => db.prepare('SELECT * FROM images WHERE id=?').get(id),
  deleteImage: id => db.prepare('DELETE FROM images WHERE id=?').run(id).changes,

  // Errors are grouped by fingerprint so one bug seen 400 times is ONE row with count=400
  upsertError(fp, i) {
    const t = now();
    const row = db.prepare('SELECT id,resolved FROM errors WHERE fingerprint=?').get(fp);
    if (row) {
      db.prepare('UPDATE errors SET last_seen=?,count=count+1,resolved=0,request_id=?,status=? WHERE id=?').run(t, i.reqId, i.status, row.id);
      return { isNew: row.resolved === 1 };
    }
    if (db.prepare('SELECT COUNT(*) c FROM errors').get().c >= 5000) return { isNew: false }; // flood guard
    db.prepare('INSERT INTO errors(fingerprint,source,kind,level,message,stack,url,method,status,user_agent,request_id,first_seen,last_seen,count,resolved) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1,0)')
      .run(fp, i.source, i.kind, i.level, i.message, i.stack, i.url, i.method, i.status, i.ua, i.reqId, t, t);
    return { isNew: true };
  },
  listErrors(status = 'open') {
    const where = status === 'open' ? 'WHERE resolved=0' : status === 'resolved' ? 'WHERE resolved=1' : '';
    return db.prepare(`SELECT * FROM errors ${where} ORDER BY last_seen DESC LIMIT 500`).all().map(E);
  },
  setErrorResolved: (id, r) => db.prepare('UPDATE errors SET resolved=? WHERE id=?').run(bool(r), id).changes,
  deleteResolvedErrors: () => db.prepare('DELETE FROM errors WHERE resolved=1').run().changes,

  addAudit(actor, action, detail = '', ip = '') { db.prepare('INSERT INTO audit(at,actor,action,detail,ip) VALUES(?,?,?,?,?)').run(now(), String(actor).slice(0, 80), action, String(detail).slice(0, 300), String(ip).slice(0, 60)); },
  listAudit: () => db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 300').all()
    .map(r => ({ id: r.id, at: r.at, actor: r.actor, action: r.action, detail: r.detail, ip: r.ip })),

  summary: () => ({
    newOrders: db.prepare("SELECT COUNT(*) c FROM orders WHERE status='new'").get().c,
    openErrors: db.prepare('SELECT COUNT(*) c FROM errors WHERE resolved=0').get().c,
    products: db.prepare('SELECT COUNT(*) c FROM products WHERE active=1').get().c
  }),
  prune() {
    db.prepare("DELETE FROM errors WHERE resolved=1 AND last_seen < datetime('now','-90 days')").run();
    db.prepare("DELETE FROM audit WHERE at < datetime('now','-365 days')").run();
  },
  backupTo(file) { db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`); }
};

if (!db.prepare('SELECT 1 FROM kv WHERE k=?').get('settings')) store.saveSettings(DEFAULT_SETTINGS);
if (!db.prepare('SELECT 1 FROM products LIMIT 1').get()) {
  [['4G Portable WiFi Router (sample)', 'Portable', 85000, 'Pocket-size router. Share one SIM with several phones.', ['4G LTE', 'Battery powered', 'Up to 10 devices'], true],
   ['5G Home Router (sample)', 'High speed', 450000, 'Fast home and office internet for the whole household.', ['5G ready', 'Dual-band WiFi', 'Up to 64 devices'], true],
   ['External Router Antenna (sample)', 'Accessory', 60000, 'Boosts signal where reception is weak.', ['High gain', 'Fits most 4G/5G routers'], false]]
    .forEach(([name, tag, price, summary, specs, featured]) => store.insertProduct({ name, category: 'devices', tag, price, summary, specs, image: '', featured, active: true }));
}
module.exports = store;
