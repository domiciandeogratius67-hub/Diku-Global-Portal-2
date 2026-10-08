process.env.DATA_DIR = require('fs').mkdtempSync(require('os').tmpdir() + '/diku-');
const test = require('node:test'), assert = require('node:assert');
const store = require('../db');
const { logError, normUrl } = require('../lib/errors');

test('seeded products and server-side order record', () => {
  const [p] = store.listProducts({ onlyActive: true, category: 'devices' });
  const o = store.insertOrder({ productId: p.id, productName: p.name, price: p.price, name: 'Asha', phone: '+255712345678' });
  assert.equal(store.listOrders()[0].id, o.id);
  assert.equal(store.setOrderStatus(o.id, 'paid'), 1);
});
test('same error is grouped, counted, and reopens after resolve', () => {
  const e = { source: 'server', message: 'boom', stack: 'Error: boom\n at a.js:1', url: '/api/orders/123456' };
  assert.equal(logError(store, e).isNew, true);
  assert.equal(logError(store, e).isNew, false);
  let [row] = store.listErrors('open'); assert.equal(row.count, 2);
  store.setErrorResolved(row.id, true); assert.equal(store.listErrors('open').length, 0);
  assert.equal(logError(store, e).isNew, true);              // regression -> alerts again
  assert.equal(store.listErrors('open')[0].count, 3);
});
test('url normalising groups ids', () => assert.equal(normUrl('/p/123456?x=1'), '/p/:n'));
test('product CRUD + audit', () => {
  const p = store.insertProduct({ name: 'T', category: 'devices', price: 5, specs: ['a'], featured: true, active: true });
  assert.equal(store.updateProduct(p.id, { ...p, price: 9 }).price, 9);
  assert.equal(store.deleteProduct(p.id), 1);
  store.addAudit('admin', 'x', 'y', '1.1.1.1'); assert.equal(store.listAudit()[0].action, 'x');
});
test('backup works', () => { const f = store.DATA_DIR + '/b.db'; store.backupTo(f); assert.ok(require('fs').statSync(f).size > 0); });
