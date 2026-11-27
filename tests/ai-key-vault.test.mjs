import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/* Khoá mã hoá phải có TRƯỚC khi nạp server.js (module đọc biến môi trường lúc khởi tạo).
   Bản clone sạch không có .env nên test phải tự đặt, không phụ thuộc máy đang chạy. */
if (!(process.env.AI_KEY_ENCRYPTION_KEY || '').trim() || process.env.AI_KEY_ENCRYPTION_KEY.trim().length < 32) {
  process.env.AI_KEY_ENCRYPTION_KEY = 'test-encryption-secret-with-enough-length-1234';
}
/* Nạp server.js NGAY khi file test bắt đầu, trước mọi lần thay globalThis.fetch:
   module dùng fetch toàn cục lúc chạy, nhưng nạp sớm giúp hành vi ổn định giữa các test. */
const { createApp } = await import('../server.js');

/* Kiểm thử tích hợp kho API key: máy chủ Express + "Google" giả lập.
   - Firebase ID token được ký thật bằng RSA nên đi qua đúng phần xác thực của server.js.
   - Cert Firebase và Firestore được thay bằng máy chủ cục bộ (sandbox không ra được Internet).
   Nhờ vậy kiểm chứng được: key được mã hoá, không có key thô trong request ghi Firestore,
   server timestamp đúng cho rules, và mọi đường xác thực đều dùng được. */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Một cặp khoá cho cả file: server.js cache chứng chỉ Firebase sau lần đầu nên mọi token
   trong file phải cùng khoá thì mới kiểm tra chữ ký được. */
const { privateKey: TEST_PRIVATE_KEY, publicKey: TEST_PUBLIC_KEY } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

function makeIdToken(projectId) {
  const privateKey = TEST_PRIVATE_KEY;
  const b64 = (b) => Buffer.from(b).toString('base64url');
  const nowSec = Math.floor(Date.now() / 1000);
  const signingInput = `${b64(JSON.stringify({ alg: 'RS256', kid: 'test-key' }))}.${b64(JSON.stringify({
    sub: 'user-1',
    aud: projectId,
    iss: `https://securetoken.google.com/${projectId}`,
    iat: nowSec,
    exp: nowSec + 3600,
    email_verified: true,
    email: 'gv@edu.vn',
  }))}`;
  const signature = crypto.sign('sha256', Buffer.from(signingInput), privateKey);
  return { token: `${signingInput}.${b64(signature)}`, certPem: TEST_PUBLIC_KEY.export({ type: 'spki', format: 'pem' }) };
}

test('AI key vault: save/status round-trip against a fake Google, ciphertext only', async () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase-applet-config.json'), 'utf8'));
  const { token, certPem } = makeIdToken(cfg.projectId);
  const seen = [];
  const fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen.push({ url: req.url, method: req.method, body });
      if (req.url.startsWith('/robot')) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=300' });
        res.end(JSON.stringify({ 'test-key': certPem }));
        return;
      }
      if (req.url.startsWith('/v1/projects')) {
        if (req.method === 'GET') { res.writeHead(404); res.end('{}'); return; }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
        return;
      }
      res.writeHead(404);
      res.end('{}');
    });
  });
  await new Promise((resolve) => fake.listen(0, '127.0.0.1', resolve));
  const fakePort = fake.address().port;

  const realFetch = globalThis.fetch;
  globalThis.fetch = (url, opts) => {
    const target = String(url);
    if (target.includes('googleapis.com')) {
      const parsed = new URL(target);
      const localPath = parsed.pathname.startsWith('/robot') ? '/robot' : parsed.pathname + (parsed.search || '');
      return realFetch(`http://127.0.0.1:${fakePort}${localPath}`, opts);
    }
    return realFetch(url, opts);
  };

  const server = http.createServer(createApp({ rootDir: ROOT, serveSource: false }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const call = (pathName, method, headers, body) => new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: pathName, method, headers: { Connection: 'close', ...headers } },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
  const json = { 'Content-Type': 'application/json' };
  const RAW_KEY = 'AIzaFAKEKEY0123456789abcdefghijk';

  try {
    // 1. Lưu key -> 200, chỉ trả 4 ký tự cuối
    const saved = await call('/api/ai/key', 'POST', { ...json, Authorization: 'Bearer ' + token }, JSON.stringify({ apiKey: RAW_KEY }));
    assert.equal(saved.status, 200);
    assert.deepEqual(JSON.parse(saved.body), { ok: true, hint: RAW_KEY.slice(-4) });

    // 2. Bản ghi Firestore: chỉ có bản mã + server timestamp, KHÔNG có key thô
    const commit = seen.find((r) => r.url.includes(':commit'));
    assert.ok(commit, 'phải ghi tài liệu qua :commit');
    const write = JSON.parse(commit.body).writes[0];
    assert.deepEqual(Object.keys(write.update.fields).sort(), ['ciphertext', 'created_at', 'id', 'iv', 'key_hint', 'tag', 'updated_at']);
    assert.equal(commit.body.includes(RAW_KEY), false, 'key thô không được gửi tới Firestore');
    assert.equal(write.update.fields.key_hint.stringValue, RAW_KEY.slice(-4));
    assert.deepEqual(write.updateTransforms, [
      { fieldPath: 'createdAt', setToServerTimestamp: {} },
      { fieldPath: 'updatedAt', setToServerTimestamp: {} },
    ], 'rules dạng createdAt == request.time cần server timestamp');
    assert.equal(write.currentDocument.exists, false, 'tạo mới khi chưa có tài liệu');

    // 3. Trạng thái đọc được qua header riêng (đường dự phòng khi proxy bỏ Authorization)
    const status = await call('/api/ai/key/status', 'POST', { ...json, 'X-EducMind-Token': 'Bearer ' + token }, '{}');
    assert.equal(status.status, 200);
    const statusJson = JSON.parse(status.body);
    assert.equal(statusJson.role, 'STUDENT', 'vai trò lấy từ Firestore, không tin body');

    // 4. Xoá key -> 200 và gọi DELETE tới Firestore
    const removed = await call('/api/ai/key', 'DELETE', { Authorization: 'Bearer ' + token });
    assert.equal(removed.status, 200);
    assert.ok(seen.some((r) => r.method === 'DELETE'), 'phải xoá tài liệu trên Firestore');
  } finally {
    globalThis.fetch = realFetch;
    await new Promise((resolve) => server.close(resolve));
    await new Promise((resolve) => fake.close(resolve));
  }
});

test('Upstream network failure is reported as 502 UPSTREAM_UNREACHABLE instead of "fetch failed"', async () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase-applet-config.json'), 'utf8'));
  const { token } = makeIdToken(cfg.projectId);
  const realFetch = globalThis.fetch;
  /* Khoá mã hoá phải có để đi tới bước gọi Google (máy chủ thật đọc từ .env). */
  const savedSecret = process.env.AI_KEY_ENCRYPTION_KEY;
  process.env.AI_KEY_ENCRYPTION_KEY = 'test-encryption-secret-with-enough-length-1234';
  /* Mọi lời gọi ra Google đều đứt kết nối (giống khi máy chủ không có mạng). */
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('googleapis.com')) {
      const err = new TypeError('fetch failed');
      err.cause = { code: 'ECONNRESET' };
      throw err;
    }
    return realFetch(url, opts);
  };
  const server = http.createServer(createApp({ rootDir: ROOT, serveSource: false }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const res = await new Promise((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port, path: '/api/ai/key', method: 'POST', headers: { Connection: 'close', 'Content-Type': 'application/json', Authorization: 'Bearer ' + token } },
        (r) => {
          const chunks = [];
          r.on('data', (c) => chunks.push(c));
          r.on('end', () => resolve({ status: r.statusCode, body: Buffer.concat(chunks).toString() }));
        },
      );
      req.on('error', reject);
      req.write(JSON.stringify({ apiKey: 'AIzaFAKEKEY0123456789abcdefghijk' }));
      req.end();
    });
    assert.equal(res.status, 502, 'lỗi hạ tầng phải là 502, không phải 500 — body: ' + res.body);
    const body = JSON.parse(res.body);
    assert.equal(body.code, 'UPSTREAM_UNREACHABLE');
    assert.doesNotMatch(body.error, /^fetch failed$/, 'không để lộ chuỗi lỗi thô của Node');
    assert.match(body.error, /chưa kết nối được/i);

    // Endpoint chẩn đoán cũng phải báo không kết nối được (503), không treo.
    const health = await new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path: '/api/health/upstream', method: 'GET', headers: { Connection: 'close' } }, (r) => {
        const chunks = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => resolve({ status: r.statusCode, body: Buffer.concat(chunks).toString() }));
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(health.status, 503);
    assert.equal(JSON.parse(health.body).ok, false);
  } finally {
    globalThis.fetch = realFetch;
    if (savedSecret === undefined) delete process.env.AI_KEY_ENCRYPTION_KEY;
    else process.env.AI_KEY_ENCRYPTION_KEY = savedSecret;
    await new Promise((resolve) => server.close(resolve));
  }
});
