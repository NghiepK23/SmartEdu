import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* Chặn rò rỉ bí mật vào git.
   GitHub secret scanning từng báo "Google API Key" trong js/vendor/firebase-sdk.min.js
   (khóa bị nhúng vào gói thư viện lúc build). Test này quét các tệp được track và giữ
   cho cảnh báo đó không tái diễn: không khóa Google API, không tệp .env, không cấu hình
   Firebase thật, không PEM/password. */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Chỉ quét mã nguồn, tài liệu và cấu hình — bỏ qua thư mục phụ thuộc/build và tệp media. */
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'coverage', '.firebase']);
/* Cấu hình Firebase thật là tệp cục bộ (đã gitignore) nên được phép có trên máy chạy;
   ở cuối test vẫn kiểm tra .gitignore chặn tệp này. */
const LOCAL_ONLY_FILES = new Set(['firebase-applet-config.json', '.env']);
const TEXT_EXT = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.json', '.md', '.html', '.css', '.txt',
  '.yml', '.yaml', '.toml', '.rules', '.sh', '.example',
]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      walk(full, out);
      continue;
    }
    /* Tệp .env thật không bao giờ được nằm trong repo; chỉ cho phép .env.example. */
    if (LOCAL_ONLY_FILES.has(entry.name)) continue;
    if (entry.name.startsWith('.env') && entry.name !== '.env.example') continue;
    out.push(full);
  }
  return out;
}

function isTextFile(file) {
  if (file.endsWith('.example')) return true;
  const ext = path.extname(file).toLowerCase();
  if (!TEXT_EXT.has(ext)) return false;
  const stat = fs.statSync(file);
  return stat.size <= 4 * 1024 * 1024;
}

/* Mẫu bí mật: khóa Google API (dùng cho Firebase), PEM, mật khẩu nối trực tiếp. */
const SECRET_PATTERNS = [
  { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{35}/g, allowFile: 'firebase-applet-config.example.json' },
  { name: 'PEM private key', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'AWS access key', re: /AKIA[0-9A-Z]{16}/g },
  { name: 'Slack token', re: /xox[baprs]-[0-9A-Za-z-]{10,}/g },
];

test('Repository has no committed secrets (Google API key, env file, Firebase config)', () => {
  const files = walk(ROOT).filter(isTextFile);
  assert.ok(files.length > 30, 'phải quét được mã nguồn của repository');

  const findings = [];
  for (const file of files) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    const text = fs.readFileSync(file, 'utf8');
    for (const { name, re, allowFile } of SECRET_PATTERNS) {
      if (allowFile && rel === allowFile) continue;
      /* Giá trị mẫu trong tài liệu/kiểm thử: có chữ DUMMY/FAKE/X/Example là cố ý. */
      const hits = (text.match(re) || []).filter((hit) => !/DUMMY|FAKE|XXXX|Dummy|Fake|Example|Test/i.test(hit));
      if (hits.length) findings.push(`${rel}: ${name} (${hits[0].slice(0, 12)}…)`);
    }
  }
  assert.deepEqual(findings, [], 'không được có bí mật trong repository');

  /* Cấu hình Firebase thật là tệp cục bộ của từng máy, phải nằm trong .gitignore. */
  const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  assert.match(gitignore, /^firebase-applet-config\.json$/m, '.gitignore phải chặn firebase-applet-config.json');
  assert.match(gitignore, /^\.env$/m, '.gitignore phải chặn .env');

  /* Chỉ tệp mẫu (không có giá trị thật) được đưa vào git. */
  assert.ok(fs.existsSync(path.join(ROOT, 'firebase-applet-config.example.json')), 'phải có tệp cấu hình mẫu');

  /* Gói thư viện Firebase đã build không nhúng cấu hình dự án. */
  const vendor = path.join(ROOT, 'js', 'vendor', 'firebase-sdk.min.js');
  if (fs.existsSync(vendor)) {
    const sdk = fs.readFileSync(vendor, 'utf8');
    assert.doesNotMatch(sdk, /AIza[0-9A-Za-z_-]{35}/, 'gói Firebase không được chứa khóa API');
    assert.doesNotMatch(sdk, /projectId:"/, 'gói Firebase không được chứa cấu hình dự án');
  }
});
