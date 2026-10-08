const test = require('node:test'), assert = require('node:assert');
const sec = require('../lib/security');
const S = 'x'.repeat(40);

test('form token: early, ok, replay, expired, tampered', () => {
  const t0 = 1_000_000, tok = sec.makeFormToken(S, t0), used = new Map();
  assert.equal(sec.checkFormToken(S, tok, used, t0 + 500), 'early');
  assert.equal(sec.checkFormToken(S, tok, used, t0 + 3000), 'ok');
  assert.equal(sec.checkFormToken(S, tok, used, t0 + 4000), 'replay');
  assert.equal(sec.checkFormToken(S, sec.makeFormToken(S, t0), new Map(), t0 + 3 * 3600_000), 'expired');
  assert.equal(sec.checkFormToken(S, tok.slice(0, -2) + 'aa', new Map(), t0 + 3000), 'bad');
  assert.equal(sec.checkFormToken('y'.repeat(40), tok, new Map(), t0 + 3000), 'bad');
  assert.equal(sec.checkFormToken(S, undefined, new Map()), 'bad');
});
test('image sniffing ignores names and trusts bytes', () => {
  assert.equal(sec.sniffImage(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0, 0, 0, 0, 0])), 'jpeg');
  assert.equal(sec.sniffImage(Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(8)])), 'png');
  assert.equal(sec.sniffImage(Buffer.from('RIFF\0\0\0\0WEBPVP8 ')), 'webp');
  assert.equal(sec.sniffImage(Buffer.from('<svg onload=alert(1)></svg>')), null);
  assert.equal(sec.sniffImage(Buffer.from('<?php echo 1; ?>   ')), null);
});
test('bot user agents', () => {
  assert.ok(sec.uaLooksBot('')); assert.ok(sec.uaLooksBot('curl/8.0')); assert.ok(sec.uaLooksBot('python-requests/2.31'));
  assert.ok(!sec.uaLooksBot('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36'));
});
test('cookie parsing survives garbage', () => {
  assert.deepEqual(sec.parseCookies('a=1; diku_admin=abc%20d; bad=%E0%A4%A'), { a: '1', diku_admin: 'abc d' });
});
