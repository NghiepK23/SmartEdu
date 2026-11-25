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
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
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

  for (const rel of ['js/00-grade-config.js', 'js/02-state.js', 'js/04-icons.js', 'js/05-helpers.js', 'js/db/01-core.js', 'js/db/14b-ai-chat.js']) {
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

test('Exam lock and per-course student AI disable checks enforce role and course rules', () => {
  const { evalExpr } = createChatUnitContext();

  evalExpr(`DB.me = { id: 's1', role: 'STUDENT' }; DB.page = 'exam'; DBX = { attempt: { status: 'IN_PROGRESS' } };`);
  assert.equal(evalExpr('dbChatExamLocked()'), true);

  evalExpr(`DB.me = { id: 't1', role: 'TEACHER' };`);
  assert.equal(evalExpr('dbChatExamLocked()'), false);

  evalExpr(`DB.me = { id: 's1', role: 'STUDENT' }; DBX = null; DB.page = 'lessons'; DB.course = { id: 'c1', student_ai_enabled: false };`);
  assert.equal(evalExpr('dbChatStudentDisabled()'), true);

  evalExpr(`DB.course = { id: 'c1', student_ai_enabled: true };`);
  assert.equal(evalExpr('dbChatStudentDisabled()'), false);
});
