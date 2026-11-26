import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function createChatUnitContext() {
  const noop = () => {};
  const appEl = {
    innerHTML: '',
    addEventListener: noop,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const doc = {
    getElementById: (id) => (id === 'app' ? appEl : null),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: noop,
    removeEventListener: noop,
    activeElement: null,
    title: 'EducMind',
  };
  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    RegExp,
    Error,
    Promise,
    URLSearchParams,
    document: doc,
    location: { origin: 'http://localhost:3000', pathname: '/', search: '', hash: '' },
    history: { pushState: noop, replaceState: noop },
    localStorage: (() => {
      const store = new Map();
      return {
        get length() { return store.size; },
        key: (i) => [...store.keys()][i] ?? null,
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear(),
      };
    })(),
    addEventListener: noop,
    removeEventListener: noop,
    scrollTo: noop,
    toast: noop,
    render: noop,
    app: appEl,
    logged: true,
    sess: { backend: true, t: Date.now() },
    SESS_IDLE: 60,
    FirebaseRuntime: null,
    firebaseAuth: null,
    firebaseDb: null,
    EducMindDB: {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);

  for (const rel of ['js/00-grade-config.js', 'js/02-state.js', 'js/04-icons.js', 'js/05-helpers.js', 'js/db/01-core.js', 'js/db/05c-assignment-student.js', 'js/db/14b-ai-chat.js', 'js/db/14c-ai-key.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
  }
  return {
    ctx,
    evalExpr: (expr) => vm.runInContext(expr, ctx),
    evalJson: (expr) => JSON.parse(vm.runInContext(`JSON.stringify(${expr})`, ctx)),
  };
}

test('Gemini model routing selects exact models by tier, mode, and intent', () => {
  const { evalJson } = createChatUnitContext();

  // Explicit tiers
  assert.equal(evalJson(`dbChatRecommendModel('fast', 'tutor', 'hello', false)`).model, 'gemini-3.1-flash-lite');
  assert.equal(evalJson(`dbChatRecommendModel('balanced', 'tutor', 'hello', false)`).model, 'gemini-4-hydrogen');
  assert.equal(evalJson(`dbChatRecommendModel('interactive', 'tutor', 'hello', false)`).model, 'gemini-4-neon');
  assert.equal(evalJson(`dbChatRecommendModel('deep', 'tutor', 'hello', false)`).model, 'gemini-4-carbon');

  // Auto routing
  assert.equal(evalJson(`dbChatRecommendModel('auto', 'quiz', 'Tạo câu hỏi trắc nghiệm', true)`).model, 'gemini-4-neon');
  assert.equal(evalJson(`dbChatRecommendModel('auto', 'lesson_plan', 'Soạn giáo án 45 phút', false)`).model, 'gemini-4-neon');
  assert.equal(evalJson(`dbChatRecommendModel('auto', 'gap_analysis', 'Phân tích nguyên nhân lỗ hổng', false)`).model, 'gemini-4-carbon');
  assert.equal(evalJson(`dbChatRecommendModel('auto', 'tutor', 'Tóm tắt mạng LAN là gì?', false)`).model, 'gemini-3.1-flash-lite');
  assert.equal(evalJson(`dbChatRecommendModel('auto', 'tutor', 'Hãy giải thích từng bước cách chuyển đổi số nhị phân sang thập phân và cho ví dụ minh họa chi tiết', false)`).model, 'gemini-4-hydrogen');
});

test('Safe Markdown formatter escapes raw HTML and formats lists, headings, and fenced code blocks', () => {
  const { evalExpr } = createChatUnitContext();
  const sample = [
    '## Tiêu đề <script>alert(1)</script>',
    '- Mục **quan trọng** với `code <tag>`',
    '1. Bước một',
    '```python',
    'print("<xss>")',
    '```',
  ].join('\n');

  const html = evalExpr(`dbChatFormatMarkdown(${JSON.stringify(sample)})`);
  assert.doesNotMatch(html, /<script>/i);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /<h3 class="db-chat-h">Tiêu đề &lt;script&gt;alert\(1\)&lt;\/script&gt;<\/h3>/);
  assert.match(html, /<strong>quan trọng<\/strong>/);
  assert.match(html, /<code class="db-chat-inline-code">code &lt;tag&gt;<\/code>/);
  assert.match(html, /<div class="db-chat-code" data-lang="python"><div class="db-chat-code-head"><span class="db-chat-code-dots" aria-hidden="true"><i><\/i><i><\/i><i><\/i><\/span><span class="db-chat-code-lang">python<\/span><\/div><pre><code>print\(&quot;&lt;xss&gt;&quot;\)<\/code><\/pre><\/div>/);
});

test('AI access follows role, exam/assignment sessions, and the per-work teacher switch', () => {
  const { evalExpr, evalJson } = createChatUnitContext();

  // Đang làm bài kiểm tra -> khoá với học sinh, giáo viên không bị ảnh hưởng.
  evalExpr(`DB.me = { id: 's1', role: 'STUDENT' }; DB.page = 'exam'; DB.data = { ready: true }; DBX = { attempt: { status: 'IN_PROGRESS' }, assessment: { title: 'KT 15 phút' } };`);
  assert.equal(evalExpr('dbChatExamLocked()'), true);
  const examState = evalJson('dbAiStudentState()');
  assert.equal(examState.allowed, false);
  assert.match(examState.reason, /làm bài kiểm tra: KT 15 phút/);

  evalExpr(`DB.me = { id: 't1', role: 'TEACHER' };`);
  assert.equal(evalExpr('dbChatExamLocked()'), false);
  assert.equal(evalJson('dbAiStudentState()').allowed, true, 'giáo viên luôn dùng được Trợ lý AI');

  // Đang làm bài tập -> khoá; nộp bài xong -> mở lại.
  evalExpr(`DB.me = { id: 's1', role: 'STUDENT' }; DBX = null; DB.page = 'assignments'; DB.data = { ready: true, assignments: [{ id: 'as-1', title: 'Bài tập 1' }] }; DB_AI_KEY.status = { hasKey: true };`);
  evalExpr("dbAssignmentMarkBusy('as-1')");
  const busyState = evalJson('dbAiStudentState()');
  assert.equal(busyState.allowed, false);
  assert.match(busyState.reason, /làm bài tập: Bài tập 1/);
  evalExpr("dbAssignmentMarkBusy('as-1', false)");

  // Công tắc cấp lớp đã bỏ hoàn toàn: không còn ai đọc DB.course.student_ai_enabled.
  evalExpr(`DB.course = { id: 'c1', student_ai_enabled: false };`);
  assert.equal(evalExpr("typeof dbChatStudentDisabled === 'undefined'"), true, 'hàm chặn theo lớp đã bị xoá');
  assert.equal(evalJson('dbAiStudentState()').allowed, true, 'công tắc cấp lớp không còn ảnh hưởng');

  // Giáo viên tắt AI cho riêng một bài tập -> học sinh bị chặn khi mở đúng bài đó.
  evalExpr(`DB.arg = { id: 'as-2' }; DB.data = { ready: true, assignments: [{ id: 'as-2', title: 'Bài tự làm', student_ai_enabled: false }] };`);
  const offState = evalJson('dbAiStudentState()');
  assert.equal(offState.allowed, false);
  assert.match(offState.reason, /không cho dùng Trợ lý AI cho bài tập này/);
  evalExpr(`DB.data.assignments[0].student_ai_enabled = true;`);
  assert.equal(evalJson('dbAiStudentState()').allowed, true, 'bật lại thì dùng được');

  // Chưa có API key -> chặn kèm hướng dẫn mở Tài khoản.
  evalExpr(`DB_AI_KEY.status = { hasKey: false, classOwner: { hasKey: false }, sharedKeyAvailable: false }; DB.arg = null;`);
  const noKeyState = evalJson('dbAiStudentState()');
  assert.equal(noKeyState.allowed, false);
  assert.match(noKeyState.reason, /API key/);
});

test('apiRequest sends the ID token in header and body, and retries once with a fresh token on AUTH_REQUIRED', async () => {
  // Dựng ngữ cảnh riêng với fetch giả lập để quan sát request thật.
  const fsMod = await import('node:fs');
  const pathMod = await import('node:path');
  const vmMod = await import('node:vm');
  const root = pathMod.resolve(pathMod.dirname(new URL(import.meta.url).pathname), '..');
  const seen = [];
  let tokenVersion = 'TOKEN1';
  const responses = [
    { ok: false, status: 401, json: async () => ({ error: 'Cần đăng nhập', code: 'AUTH_REQUIRED' }) },
    { ok: true, status: 200, json: async () => ({ ok: true, hint: '4321' }) },
  ];
  const noop = () => {};
  const sandbox = {
    console, Date, Math, JSON, Number, String, Boolean, Array, Object, Set, Map, RegExp, Error, Promise,
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop },
    location: { origin: 'http://localhost:3000', pathname: '/', search: '', hash: '' },
    history: { pushState: noop, replaceState: noop },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop, clear: noop },
    addEventListener: noop, removeEventListener: noop, toast: noop, render: noop,
    app: { innerHTML: '', addEventListener: noop, querySelector: () => null, querySelectorAll: () => [] },
    fetch: async (url, opts) => {
      seen.push({ url, headers: opts.headers, body: JSON.parse(opts.body) });
      return responses.shift();
    },
  };
  /* 03-firebase.js đọc runtime Firebase từ window.EducMindFirebase. */
  sandbox.window = sandbox;
  sandbox.EducMindFirebase = {
    firestoreApi: {},
    authApi: { onAuthStateChanged: () => {} },
    auth: { currentUser: { uid: 'u1', email: 'gv@edu.vn', getIdToken: async (force) => { if (force) tokenVersion = 'TOKEN2'; return tokenVersion; } } },
  };
  sandbox.globalThis = sandbox;
  const ctx = vmMod.createContext(sandbox);
  for (const rel of ['js/00-grade-config.js', 'js/02-state.js', 'js/03-firebase.js']) {
    vmMod.runInContext(fsMod.readFileSync(pathMod.join(root, rel), 'utf8'), ctx, { filename: rel });
  }
  vmMod.runInContext("sess = { userId: 'u1', backend: true }; role = 'T'; DB = { me: { id: 'u1', role: 'TEACHER' } };", ctx);
  const res = await vmMod.runInContext("EducMindDB.aiKeySave('AIzaTestKey0123456789abcdef')", ctx);

  assert.equal(res.error, null, 'lần thử lại với token mới phải thành công');
  assert.equal(seen.length, 2, 'đúng một lần thử lại');
  assert.equal(seen[0].headers.Authorization, 'Bearer TOKEN1');
  assert.equal(seen[0].body.auth_token, 'TOKEN1', 'token cũng nằm trong thân request (proxy có thể bỏ header)');
  assert.equal(seen[1].headers.Authorization, 'Bearer TOKEN2', 'lần thử lại dùng token đã làm mới');
  assert.equal(seen[1].body.auth_token, 'TOKEN2');
  assert.equal(seen[0].body.apiKey, 'AIzaTestKey0123456789abcdef');
});
