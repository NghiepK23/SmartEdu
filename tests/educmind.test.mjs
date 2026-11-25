import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function createAppContext(opts = {}) {
  const storage = new Map();
  const noop = () => {};
  const listeners = new Map();
  const historyCalls = [];
  const makeEl = () => ({
    id: '',
    className: '',
    hidden: false,
    innerHTML: '',
    textContent: '',
    value: '',
    dataset: {},
    style: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    setAttribute: noop,
    appendChild: noop,
    remove: noop,
    focus: noop,
    addEventListener: noop,
    querySelector: () => null,
    querySelectorAll: () => [],
  });
  const appEl = makeEl();
  const doc = {
    getElementById: (id) => (id === 'app' ? appEl : null),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => makeEl(),
    addEventListener: noop,
    removeEventListener: noop,
    body: makeEl(),
    title: 'EducMind',
  };
  const locationObj = {
    origin: 'http://localhost:3000',
    pathname: '/',
    search: '',
    hash: opts.initialHash || '',
    href: 'http://localhost:3000/' + (opts.initialHash || ''),
  };
  const updateHref = () => {
    locationObj.href = locationObj.origin + locationObj.pathname + locationObj.search + locationObj.hash;
  };
  const applyHistoryUrl = (url) => {
    const raw = String(url || '');
    const hIdx = raw.indexOf('#');
    if (raw.startsWith('#')) {
      locationObj.hash = raw;
    } else if (hIdx >= 0) {
      locationObj.pathname = raw.slice(0, hIdx) || '/';
      locationObj.hash = raw.slice(hIdx);
    } else {
      locationObj.pathname = raw || '/';
      locationObj.hash = '';
    }
    updateHref();
  };
  const historyObj = {
    pushState(_state, _title, url) {
      historyCalls.push({ op: 'push', url: String(url || '') });
      applyHistoryUrl(url);
    },
    replaceState(_state, _title, url) {
      historyCalls.push({ op: 'replace', url: String(url || '') });
      applyHistoryUrl(url);
    },
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
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    Uint32Array,
    ArrayBuffer,
    DataView,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    document: doc,
    navigator: { language: 'vi-VN' },
    location: locationObj,
    history: historyObj,
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      if (!listeners.has(type)) return;
      listeners.set(type, listeners.get(type).filter((x) => x !== fn));
    },
    dispatchEvent(ev) {
      const list = listeners.get(ev && ev.type) || [];
      for (const fn of list) fn(ev);
      return true;
    },
    scrollTo: noop,
    toast: noop,
    render: noop,
    dbStartNotifications: noop,
    dbShell: (_p, b) => String(b || ''),
    EducMindDB: opts.EducMindDB || {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);

  const scripts = [
    'js/00-grade-config.js',
    'js/02-state.js',
    'js/04-icons.js',
    'js/05-helpers.js',
    'js/45-import-dialog.js',
    'js/46-file-readers.js',
    'js/db/01-core.js',
    'js/db/04-content.js',
    'js/db/04b-resources-trash.js',
    'js/db/05-assignments.js',
    'js/db/05b-assignment-grading.js',
    'js/db/05c-assignment-student.js',
    'js/db/06-questions.js',
    'js/db/07-assessments.js',
    'js/db/08-exam.js',
    'js/db/09-progress.js',
    'js/db/11-transfer.js',
    'js/db/12-schedule.js',
    'js/db/15-games.js',
  ];
  for (const rel of scripts) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(code, ctx, { filename: rel });
  }
  const evalExpr = (expr) => vm.runInContext(expr, ctx);
  const evalJson = (expr) => JSON.parse(vm.runInContext(`JSON.stringify(${expr})`, ctx));
  return { ctx, evalExpr, evalJson, historyCalls, locationObj, storage };
}

test('Grade configuration (js/00-grade-config.js)', () => {
  const { evalExpr, evalJson } = createAppContext();
  assert.equal(evalExpr('EDUCMIND_GRADE_MIN'), 3);
  assert.equal(evalExpr('EDUCMIND_GRADE_MAX'), 12);
  assert.equal(evalExpr('EDUCMIND_GRADE_RANGE_LABEL'), '3–12');
  assert.deepEqual(evalJson('educmindGradeValues()'), [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(evalExpr('educmindGradeIsValid(3)'), true);
  assert.equal(evalExpr('educmindGradeIsValid(12)'), true);
  assert.equal(evalExpr('educmindGradeIsValid(2)'), false);
  assert.equal(evalExpr('educmindGradeIsValid(13)'), false);
  assert.equal(evalExpr('educmindGradeIsValid("10")'), false);
  assert.match(evalExpr('educmindGradeOptions(8)'), /<option value="8" selected>Khối 8<\/option>/);
});

test('HTML escaping, URL/image guards, and mastery tiers (js/05-helpers.js)', () => {
  const { evalExpr } = createAppContext();

  assert.equal(
    evalExpr(`esc('<script>alert("x" & \\'y\\')</script>')`),
    '&lt;script&gt;alert(&quot;x&quot; &amp; &#39;y&#39;)&lt;/script&gt;',
  );

  // Safe HTTP/HTTPS URL checks
  assert.equal(evalExpr(`safeHttpUrl('https://educmind.edu.vn/bai-hoc?id=1')`), 'https://educmind.edu.vn/bai-hoc?id=1');
  assert.equal(evalExpr(`safeHttpUrl('http://localhost:3000/tai-lieu.pdf')`), 'http://localhost:3000/tai-lieu.pdf');
  assert.equal(evalExpr(`safeHttpUrl('javascript:alert(1)')`), '');
  assert.equal(evalExpr(`safeHttpUrl('data:text/html,<script>alert(1)</script>')`), '');
  assert.equal(evalExpr(`safeHttpUrl('vbscript:msgbox(1)')`), '');
  assert.equal(evalExpr(`safeHttpUrl('not a valid url')`), '');

  // Safe image source checks (raster data URIs + http/https allowed; svg/javascript blocked)
  assert.equal(evalExpr(`safeImageSrc('data:image/png;base64,iVBORw0KGgo=')`), 'data:image/png;base64,iVBORw0KGgo=');
  assert.equal(evalExpr(`safeImageSrc('data:image/svg+xml;base64,PHN2Zz4=')`), '');
  assert.equal(evalExpr(`safeImageSrc('javascript:alert(1)')`), '');
  assert.equal(evalExpr(`safeImageSrc('https://cdn.example.com/avatar.webp')`), 'https://cdn.example.com/avatar.webp');

  // Mastery percentage, mean, tier, and escaped progress bar
  assert.equal(evalExpr('pct(0.696)'), 70);
  assert.ok(Math.abs(evalExpr('mean([0.5, 0.7, 0.9])') - 0.7) < 1e-12);
  assert.equal(evalExpr('mean([])'), 0);
  assert.equal(evalExpr('tier(0.39)'), 'need');
  assert.equal(evalExpr('tier(0.4)'), 'prog');
  assert.equal(evalExpr('tier(0.7)'), 'good');
  assert.equal(
    evalExpr(`bar(0.75, 'good" onclick="x', 'Tiến độ <100%>')`),
    '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="75" aria-label="Tiến độ &lt;100%&gt;"><span class="good&quot; onclick=&quot;x" style="width:75%"></span></div>',
  );
});

test('Vietnamese normalization and CSV parser (js/45-import-dialog.js & js/46-file-readers.js)', () => {
  const { evalExpr, evalJson } = createAppContext();

  assert.equal(evalExpr(`nz('  Điền   Khuyết · Đáp án ĐÚNG  ')`), 'dien khuyet · dap an dung');
  assert.deepEqual(
    evalJson(`csvRows('\\ufeff"STT","Câu hỏi","Đáp án"\\r\\n1,"Mạng ""LAN"" là gì?","A"\\r\\n\\r\\n2,"Router, Switch","A, B"')`),
    [
      ['STT', 'Câu hỏi', 'Đáp án'],
      ['1', 'Mạng "LAN" là gì?', 'A'],
      ['2', 'Router, Switch', 'A, B'],
    ],
  );
  assert.deepEqual(
    evalJson(`csvRows('Họ tên;Email\\nNguyễn An;an@edu.vn')`),
    [
      ['Họ tên', 'Email'],
      ['Nguyễn An', 'an@edu.vn'],
    ],
  );
});

test('Class grade resolution and storage-safe filenames (js/db/01-core.js)', () => {
  const { evalExpr } = createAppContext();

  assert.equal(evalExpr(`dbResolveClassGrade('10A1')`), 10);
  assert.equal(evalExpr(`dbResolveClassGrade('7B2')`), 7);
  assert.equal(evalExpr(`dbResolveClassGrade('Lớp Tin nâng cao', 11)`), 11);
  assert.throws(() => evalExpr(`dbResolveClassGrade('Tin học đại cương')`), /Không xác định được khối/);
  assert.throws(() => evalExpr(`dbResolveClassGrade('10A1', 15)`), /Khối là số nguyên từ 1 đến 12/);

  assert.equal(evalExpr(`dbSafeFileName('Đề kiểm tra học kỳ 1 (Tin học 10).docx')`), 'De-kiem-tra-hoc-ky-1-Tin-hoc-10.docx');
  assert.equal(evalExpr(`dbSafeFileName('   .pdf')`), 'tep.pdf');
});

test('URL hash routing, role normalization, F5 restore, and auth hash protection (js/db/01-core.js)', async () => {
  const stubDb = {
    serverNow: async () => ({ data: new Date().toISOString(), error: null }),
    listClasses: async () => ({
      data: [
        { id: 'c1', name: '10A1', grade: 10 },
        { id: 'c2', name: '11B2', grade: 11 },
      ],
      error: null,
    }),
    listCourses: async (cid) => ({
      data: [{ id: 'course-' + cid, class_id: cid, title: 'Tin học' }],
      error: null,
    }),
  };
  const { ctx, evalExpr, evalJson, historyCalls, locationObj } = createAppContext({
    EducMindDB: stubDb,
    initialHash: '#/assignments?class=c2&id=asg-9&tab=detail',
  });

  // Ensure all referenced pages exist in DB_PAGES with lightweight synchronous loaders for router unit tests
  evalExpr(`
    for (const p of ['home', 'classes', 'account', 'lessons', 'ai', 'history', 'games']) {
      if (!DB_PAGES[p]) DB_PAGES[p] = { title: p, sub: '', load: async () => ({}), view: () => '' };
    }
    DB_PAGES.classes.noClass = true;
    DB_PAGES.account.noClass = true;
    DB_PAGES.assignments.load = async () => ({ ok: true });
    DB_PAGES.assessments.load = async () => ({ ok: true });
    DB_PAGES.content.load = async () => ({ ok: true });
    DB_PAGES.trash.load = async () => ({ ok: true });
  `);

  // Auth hash detection
  assert.equal(evalExpr(`dbIsAuthHash('#access_token=abc&type=recovery')`), true);
  assert.equal(evalExpr(`dbIsAuthHash('#error=access_denied&error_description=expired')`), true);
  assert.equal(evalExpr(`dbIsAuthHash('#token_hash=xyz&type=magiclink')`), true);
  assert.equal(evalExpr(`dbIsAuthHash('#/assignments?class=c1')`), false);
  assert.equal(evalExpr(`dbIsAuthHash('')`), false);

  // Hash parsing & building
  assert.deepEqual(evalJson(`dbParseRouteHash('#/assignments?class=c1&id=a1&tab=preview')`), {
    page: 'assignments',
    classId: 'c1',
    arg: { id: 'a1', tab: 'preview' },
  });
  assert.deepEqual(evalJson(`dbParseRouteHash('#/')`), { page: 'home', classId: '', arg: {} });
  assert.equal(evalExpr(`dbParseRouteHash('#access_token=123')`), null);
  assert.equal(evalExpr(`dbBuildRouteHash('assignments', 'c1', { tab: 'b', id: '1', empty: '' })`), '#/assignments?class=c1&id=1&tab=b');
  assert.equal(evalExpr(`dbBuildRouteHash('classes', 'c1', {})`), '#/classes');

  // Role normalization
  assert.deepEqual(evalJson(`dbNormalizeRouteForRole('games', { mode: 'RACE' }, true)`), { page: 'assignments', arg: {}, changed: true });
  assert.deepEqual(evalJson(`dbNormalizeRouteForRole('exam', { id: 'ex-1' }, true)`), { page: 'assessments', arg: { id: 'ex-1' }, changed: true });
  assert.deepEqual(evalJson(`dbNormalizeRouteForRole('content', {}, false)`), { page: 'lessons', arg: {}, changed: true });
  assert.deepEqual(evalJson(`dbNormalizeRouteForRole('trash', { class: 'c1' }, false)`), { page: 'home', arg: {}, changed: true });
  assert.deepEqual(evalJson(`dbNormalizeRouteForRole('assignments', { id: 'a1', edit: 'a1' }, false)`), { page: 'assignments', arg: { id: 'a1' }, changed: true });
  assert.deepEqual(evalJson(`dbNormalizeRouteForRole('does-not-exist', { id: '1' }, true)`), { page: 'home', arg: {}, changed: true });

  // Simulate logged-in session and F5 start restoring class c2 + assignments route
  evalExpr(`logged = true; sess = { backend: true, t: Date.now() };`);
  await ctx.dbStart({ id: 'u1', role: 'STUDENT', full_name: 'An' });
  assert.equal(evalExpr('DB.classId'), 'c2');
  assert.equal(evalExpr('DB.page'), 'assignments');
  assert.deepEqual(evalJson('DB.arg'), { id: 'asg-9', tab: 'detail' });
  assert.equal(locationObj.hash, '#/assignments?class=c2&id=asg-9&tab=detail');

  // Navigation pushes history; same-route navigation replaces instead of duplicating
  const callsBeforeNav = historyCalls.length;
  await ctx.dbGo('assessments', { id: 'ex-2' });
  assert.equal(historyCalls.length, callsBeforeNav + 1);
  assert.equal(historyCalls[historyCalls.length - 1].op, 'push');
  assert.equal(locationObj.hash, '#/assessments?class=c2&id=ex-2');

  await ctx.dbGo('assessments', { id: 'ex-2' });
  assert.equal(locationObj.hash, '#/assessments?class=c2&id=ex-2');

  // Class switch updates URL hash
  // Học sinh không đổi lớp được: dbSetClass bị chặn và không đụng route hash
  await ctx.dbSetClass('c1', 'home', {});
  assert.equal(evalExpr('DB.classId'), 'c2');
  assert.equal(locationObj.hash, '#/assessments?class=c2&id=ex-2');

  // Browser Back (hashchange) should restore route via history:'pop' without pushing another entry
  locationObj.hash = '#/assignments?class=c2&id=asg-9';
  const beforePopCount = historyCalls.length;
  await ctx.dbNavigateFromHash();
  assert.equal(evalExpr('DB.classId'), 'c2');
  assert.equal(evalExpr('DB.page'), 'assignments');
  assert.deepEqual(evalJson('DB.arg'), { id: 'asg-9' });
  assert.equal(historyCalls.length, beforePopCount);

  // Logout hash clear strips app route hash, but preserves Supabase auth hash
  ctx.dbClearRouteHash();
  assert.equal(locationObj.hash, '');
  locationObj.hash = '#access_token=tok&type=recovery';
  ctx.dbClearRouteHash();
  assert.equal(locationObj.hash, '#access_token=tok&type=recovery');
});

test('Exam F5 auto-resume guard and timer formatting (js/db/08-exam.js)', async () => {
  let startAttemptCalled = 0;
  let attemptList = [];
  const stubDb = {
    finalizeExpiredAttempts: async () => ({ error: null }),
    listAttempts: async () => ({ data: attemptList, error: null }),
    listAssessments: async () => ({
      data: [{ id: 'ex-1', title: 'Kiểm tra 15p', duration_minutes: 15, max_attempts: 1 }],
      error: null,
    }),
    startAttempt: async () => {
      startAttemptCalled++;
      return {
        data: {
          status: 'RESUMED',
          attempt: { id: 'att-1', attempt_number: 1, status: 'IN_PROGRESS' },
          ends_at: new Date(Date.now() + 600000).toISOString(),
        },
        error: null,
      };
    },
    getAssessmentQuestions: async () => ({
      data: [{ question_id: 'q1', kind: 'SINGLE_CHOICE', content: '2+2=?', options: ['3', '4'], weight: 1 }],
      error: null,
    }),
    listAnswers: async () => ({
      data: [{ question_id: 'q1', answer_content: 1 }],
      error: null,
    }),
  };

  const { ctx, evalExpr, evalJson } = createAppContext({ EducMindDB: stubDb });
  evalExpr(`
    logged = true;
    sess = { backend: true, t: Date.now() };
    DB.me = { id: 'stu-1', role: 'STUDENT' };
    DB.course = { id: 'course-1' };
    DB.arg = { id: 'ex-1' };
  `);

  // Blank check + timer formatting
  assert.equal(evalExpr(`dbExamBlank('')`), true);
  assert.equal(evalExpr(`dbExamBlank([null, '  '])`), true);
  assert.equal(evalExpr(`dbExamBlank(0)`), false);
  assert.equal(evalExpr(`dbExamBlank(['', 'ok'])`), false);
  evalExpr(`DBX = { endsAt: Date.now() + 3665000 }; DB.clockSkew = 0;`);
  assert.match(evalExpr(`dbExamClock()`), /^1:01:0[45]$/);
  evalExpr(`DBX = null;`);

  // No IN_PROGRESS attempt on F5 -> must NOT call startAttempt
  attemptList = [{ id: 'att-old', assessment_id: 'ex-1', status: 'GRADED' }];
  const missingResult = await evalExpr('DB_PAGES.exam.load()');
  assert.equal(missingResult.missing, true);
  assert.equal(startAttemptCalled, 0);

  // Existing IN_PROGRESS attempt on F5 -> must call startAttempt once and hydrate saved answer
  attemptList = [{ id: 'att-1', assessment_id: 'ex-1', status: 'IN_PROGRESS' }];
  const resumeResult = await evalExpr('DB_PAGES.exam.load()');
  assert.equal(resumeResult.ready, true);
  assert.equal(startAttemptCalled, 1);
  assert.equal(evalJson(`DBX.answers.q1`), 1);
  evalExpr(`dbExamStop();`);
});

test('Assignment, assessment, schedule, and progress helpers', () => {
  const { evalExpr, evalJson } = createAppContext();

  // Assignment window & blank answer helpers
  const now = Date.now();
  const iso = (deltaMs) => new Date(now + deltaMs).toISOString();
  assert.equal(evalExpr(`dbAssignmentWindow({ due_at: '${iso(3600000)}', allow_late: false })`), 'OPEN');
  assert.equal(evalExpr(`dbAssignmentWindow({ due_at: '${iso(-60000)}', allow_late: true, late_close_at: '${iso(3600000)}' })`), 'LATE');
  assert.equal(evalExpr(`dbAssignmentWindow({ due_at: '${iso(-60000)}', allow_late: false })`), 'CLOSED');
  assert.equal(evalExpr(`dbAssignmentAnswerBlank('   ')`), true);
  assert.equal(evalExpr(`dbAssignmentAnswerBlank([null, null])`), true);
  assert.equal(evalExpr(`dbAssignmentAnswerBlank(0)`), false);
  assert.equal(evalExpr(`dbAssignmentAnswerBlank([0, null])`), false);

  // Assessment window, weights, and readiness checks
  assert.equal(evalExpr(`dbAssessmentWindow({ open_at: '${iso(60000)}', close_at: '${iso(120000)}' })`), 'SOON');
  assert.equal(evalExpr(`dbAssessmentWindow({ open_at: '${iso(-60000)}', close_at: '${iso(60000)}' })`), 'OPEN');
  assert.equal(evalExpr(`dbAssessmentWindow({ open_at: '${iso(-120000)}', close_at: '${iso(-60000)}' })`), 'CLOSED');

  assert.equal(evalExpr('dbAssessmentWeightValid(0.25)'), true);
  assert.equal(evalExpr('dbAssessmentWeightValid(1.5)'), true);
  assert.equal(evalExpr('dbAssessmentWeightValid(0.3)'), false);
  assert.equal(evalExpr(`dbReadAssessmentWeight('0,75')`), 0.75);
  assert.throws(() => evalExpr(`dbReadAssessmentWeight('0.1')`), /0,25/);

  assert.deepEqual(
    evalJson(`dbAssessmentChecks({ questions: [] }, {}, [])`),
    ['Thêm ít nhất một câu hỏi.'],
  );
  assert.deepEqual(
    evalJson(`dbAssessmentChecks(
      { questions: [{ id: 'q1', kind: 'SINGLE_CHOICE', correct_answer: null }, { id: 'q2', kind: 'ESSAY', correct_answer: null }] },
      {},
      [{ question_id: 'q1', weight: 1 }, { question_id: 'q2', weight: 2 }]
    )`),
    ['Câu 1 (Một lựa chọn) chưa có đáp án đúng.'],
  );
  assert.deepEqual(
    evalJson(`dbAssessmentChecks(
      { questions: [{ id: 'q1', kind: 'SINGLE_CHOICE', correct_answer: 1 }] },
      {},
      [{ question_id: 'q1', weight: 1.5 }]
    )`),
    [],
  );

  // Schedule priorities & day formatting
  assert.equal(evalExpr(`dbSchedDay(new Date(2026, 10, 5, 14, 30).getTime())`), '2026-11-05');
  assert.equal(evalExpr(`dbSchedPrio(${now - 60000})`), 0);
  assert.equal(evalExpr(`dbSchedPrio(${now + 60000})`), 1);
  assert.equal(evalExpr(`dbSchedPrio(${now + 2 * 86400000})`), 2);
  assert.equal(evalExpr(`dbSchedPrio(${now + 5 * 86400000})`), 3);

  // Progress filter & stats
  assert.ok(Math.abs(evalExpr(`dbMean([0.4, 0.8])`) - 0.6) < 1e-12);
  assert.equal(evalExpr(`dbMean([])`), null);
  assert.equal(evalExpr(`dbPct(null)`), '—');
  assert.equal(evalExpr(`dbPct(0.846)`), '85%');
  assert.equal(evalExpr(`dbPfNorm('Độ  Vững Kiến Thức')`), 'do  vung kien thuc');
  assert.equal(evalExpr(`dbPfHit(['mang', 'lan'], 'Mạng máy tính LAN và WAN')`), true);
  assert.equal(evalExpr(`dbPfHit(['mang', 'bluetooth'], 'Mạng máy tính LAN')`), false);
});

test('Question validation and bulk import parser for all 7 kinds (js/db/06-questions.js)', () => {
  const { evalExpr, evalJson } = createAppContext();

  evalExpr(`
    DB.course = { id: 'course-1' };
    DB.data = {
      lessons: [
        { id: 'lesson-1', title: 'Mạng máy tính' },
        { id: 'lesson-2', title: 'An toàn thông tin' },
      ],
      objectives: [
        { id: 'obj-1', lesson_id: 'lesson-1', code: 'LO1', description: 'Phân biệt LAN và WAN' },
        { id: 'obj-2', lesson_id: 'lesson-2', code: 'LO1', description: 'Bảo vệ mật khẩu' },
        { id: 'obj-3', lesson_id: 'lesson-2', code: 'LO2', description: 'Nhận diện lừa đảo' },
      ],
    };
  `);

  const rows = [
    ['STT', 'Bài học', 'Câu hỏi', 'Dạng câu hỏi', 'Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án D', 'Đáp án đúng', 'Cặp ghép', 'Mục tiêu', 'Độ khó', 'Mức Bloom', 'Giải thích đáp án'],
    ['1', 'Mạng máy tính', 'IPv4 dài bao nhiêu bit?', 'Một lựa chọn', '8', '16', '32', '64', 'C', '', 'LO01', 'Dễ', 'Nhớ', '32 bit'],
    ['2', 'An toàn thông tin', 'Chọn biện pháp bảo mật đúng:', 'Nhiều lựa chọn', 'Mật khẩu mạnh', 'Dùng 123456', 'Xác thực 2 bước', 'Chia sẻ OTP', 'A, C', '', 'LO2', 'Trung bình', 'Vận dụng', ''],
    ['3', 'Mạng máy tính', 'HTTP là giao thức truyền siêu văn bản.', 'Đúng / Sai', '', '', '', '', 'Đúng', '', 'LO1', 'Dễ', 'Nhớ', ''],
    ['4', '', 'Giao thức ___ dùng để truyền tệp; ___ dùng để gửi thư.', 'Điền khuyết', '', '', '', '', 'FTP | SMTP', '', '', 'Khó', 'Hiểu', ''],
    ['5', '', 'Ghép thiết bị với chức năng', 'Ghép đôi', '', '', '', '', '', 'Router => Định tuyến\nSwitch => Chuyển mạch', '', 'Trung bình', 'Phân tích', ''],
    ['6', '', 'Nêu vai trò của DNS.', 'Trả lời ngắn', '', '', '', '', 'Phân giải tên miền sang IP', '', '', '', '', ''],
    ['7', '', 'Trình bày các nguyên tắc an toàn số.', 'Tự luận', '', '', '', '', '', '', '', '', '', ''],
    // Ambiguous LO1 without lesson name should be recorded in ambiguousCodes and skipped for linking
    ['8', '', 'Câu có mục tiêu trùng mã', 'Đúng / Sai', '', '', '', '', 'Sai', '', 'LO1', '', '', ''],
    // Unknown lesson & invalid row (missing answer for TRUE_FALSE)
    ['9', 'Bài không tồn tại', 'Câu gắn bài sai', 'Đúng / Sai', '', '', '', '', 'Đúng', '', 'LO1', '', '', ''],
    ['10', '', 'Câu trắc nghiệm thiếu đáp án', 'Một lựa chọn', 'A1', 'B1', '', '', '', '', '', '', '', ''],
  ];

  const result = evalJson(`dbParseQuestionImportRows(${JSON.stringify(rows)})`);
  assert.equal(result.parsed.length, 9);
  assert.equal(result.skipped.length, 1);
  assert.deepEqual(result.ambiguousCodes, ['LO1']);
  assert.deepEqual(result.unknownLessons, ['Bài không tồn tại']);

  // Single choice with lesson disambiguation + LO01 -> obj-1 normalization
  assert.equal(result.parsed[0].row.kind, 'SINGLE_CHOICE');
  assert.equal(result.parsed[0].row.correct_answer, 2);
  assert.equal(result.parsed[0].row.difficulty, 'EASY');
  assert.equal(result.parsed[0].row.bloom_level, 'REMEMBER');
  assert.deepEqual(result.parsed[0].objectiveIds, ['obj-1']);

  // Multiple choice
  assert.equal(result.parsed[1].row.kind, 'MULTIPLE_CHOICE');
  assert.deepEqual(result.parsed[1].row.correct_answer, [0, 2]);
  assert.deepEqual(result.parsed[1].objectiveIds, ['obj-3']);

  // True/False
  assert.equal(result.parsed[2].row.kind, 'TRUE_FALSE');
  assert.equal(result.parsed[2].row.correct_answer, true);

  // Fill-in-blank
  assert.equal(result.parsed[3].row.kind, 'FILL_IN_BLANK');
  assert.deepEqual(result.parsed[3].row.correct_answer, ['FTP', 'SMTP']);

  // Matching
  assert.equal(result.parsed[4].row.kind, 'MATCHING');
  assert.deepEqual(result.parsed[4].row.options, { left: ['Router', 'Switch'], right: ['Định tuyến', 'Chuyển mạch'] });
  assert.deepEqual(result.parsed[4].row.correct_answer, [0, 1]);

  // Short answer & Essay
  assert.equal(result.parsed[5].row.kind, 'SHORT_ANSWER');
  assert.equal(result.parsed[5].row.correct_answer, 'Phân giải tên miền sang IP');
  assert.equal(result.parsed[6].row.kind, 'ESSAY');
  assert.equal(result.parsed[6].row.correct_answer, null);

  // Direct manual form validator dbReadQuestion
  const manual = evalJson(`dbReadQuestion({
    content: 'Thủ đô là ___',
    kind: 'FILL_IN_BLANK',
    fill_answers: 'Hà Nội',
    difficulty: 'EASY',
    grade: '10',
    bloom_level: 'REMEMBER',
    explain: 'Ghi chú',
  })`);
  assert.deepEqual(manual.correct_answer, ['Hà Nội']);
  assert.equal(manual.grade, 10);
  assert.throws(() => evalExpr(`dbReadQuestion({ content: 'Câu hỏi', kind: 'FILL_IN_BLANK', fill_answers: 'A' })`), /cụm ___/);
});

test('Game validation and auto-grading across all 5 objective kinds (js/db/15-games.js)', () => {
  const { evalExpr, evalJson } = createAppContext();

  // SINGLE_CHOICE
  const qSingle = { kind: 'SINGLE_CHOICE', content: '2+2=?', options: ['3', '4', '5'], correct_answer: 1 };
  assert.equal(evalExpr(`dbGameValid(${JSON.stringify(qSingle)})`), true);
  assert.deepEqual(evalJson(`dbGameGrade(${JSON.stringify(qSingle)}, 1)`), { ok: true, parts: null });
  assert.deepEqual(evalJson(`dbGameGrade(${JSON.stringify(qSingle)}, 0)`), { ok: false, parts: null });

  // MULTIPLE_CHOICE
  const qMulti = { kind: 'MULTIPLE_CHOICE', content: 'Số chẵn?', options: ['1', '2', '3', '4'], correct_answer: [1, 3] };
  assert.equal(evalExpr(`dbGameValid(${JSON.stringify(qMulti)})`), true);
  assert.deepEqual(evalJson(`dbGameGrade(${JSON.stringify(qMulti)}, [3, 1])`), { ok: true, parts: null });
  assert.deepEqual(evalJson(`dbGameGrade(${JSON.stringify(qMulti)}, [1])`), { ok: false, parts: null });
  assert.deepEqual(evalJson(`dbGameGrade(${JSON.stringify(qMulti)}, [1, 2, 3])`), { ok: false, parts: null });

  // TRUE_FALSE
  const qTf = { kind: 'TRUE_FALSE', content: 'HTML là ngôn ngữ đánh dấu.', options: [], correct_answer: true };
  assert.equal(evalExpr(`dbGameValid(${JSON.stringify(qTf)})`), true);
  assert.deepEqual(evalJson(`dbGameGrade(${JSON.stringify(qTf)}, 0)`), { ok: true, parts: null });
  assert.deepEqual(evalJson(`dbGameGrade(${JSON.stringify(qTf)}, 1)`), { ok: false, parts: null });

  // FILL_IN_BLANK (case/whitespace/Unicode NFC normalized)
  const qFill = { kind: 'FILL_IN_BLANK', content: 'Từ ___ đến ___', options: [], correct_answer: ['Hà Nội', 'Huế'] };
  assert.equal(evalExpr(`dbGameValid(${JSON.stringify(qFill)})`), true);
  assert.deepEqual(evalJson(`dbGameGrade(${JSON.stringify(qFill)}, ['  hà   nội ', 'HUẾ'])`), { ok: true, parts: [true, true] });
  assert.deepEqual(evalJson(`dbGameGrade(${JSON.stringify(qFill)}, ['Hà Nội', 'Đà Nẵng'])`), { ok: false, parts: [true, false] });

  // MATCHING
  const qMatch = {
    kind: 'MATCHING',
    content: 'Ghép đôi',
    options: { left: ['HTTP', 'DNS'], right: ['Web', 'Tên miền'] },
    correct_answer: [0, 1],
  };
  assert.equal(evalExpr(`dbGameValid(${JSON.stringify(qMatch)})`), true);
  assert.deepEqual(evalJson(`dbGameGrade(${JSON.stringify(qMatch)}, [0, 1])`), { ok: true, parts: [true, true] });
  assert.deepEqual(evalJson(`dbGameGrade(${JSON.stringify(qMatch)}, [1, 1])`), { ok: false, parts: [false, true] });
  assert.equal(evalExpr(`dbGameKeyText(${JSON.stringify(qMatch)})`), 'HTTP → Web · DNS → Tên miền');

  // Invalid question shapes rejected gracefully
  assert.equal(evalExpr(`dbGameValid({ kind: 'ESSAY', content: 'Viết bài', correct_answer: null })`), false);
  assert.equal(evalExpr(`dbGameValid({ kind: 'SINGLE_CHOICE', content: '?', options: ['Only 1'], correct_answer: 0 })`), false);
  assert.equal(evalExpr(`dbGameValid({ kind: 'FILL_IN_BLANK', content: 'No blank', correct_answer: ['x'] })`), false);
});

test('OOXML Excel/Word builders and vendored xlsx/mammoth browser bundles', async () => {
  const { ctx, evalExpr } = createAppContext();

  // Build real OOXML .xlsx and .docx bytes
  const xlsxBytes = evalExpr(`DBTF.buildXlsx([
    {
      name: 'Bảng điểm 10A1',
      title: 'BÁO CÁO KẾT QUẢ',
      headers: ['STT', 'Họ và tên', 'Điểm'],
      rows: [
        [1, 'Nguyễn Minh Anh', { v: 8.5, fmt: 'score' }],
        [2, 'Trần Bảo Châu', { v: 9, fmt: 'score' }],
      ],
    },
  ])`);
  assert.ok(xlsxBytes instanceof ctx.Uint8Array);
  assert.equal(xlsxBytes[0], 0x50); // 'P'
  assert.equal(xlsxBytes[1], 0x4b); // 'K'
  assert.equal(xlsxBytes[2], 0x03);
  assert.equal(xlsxBytes[3], 0x04);

  const docxBytes = evalExpr(`DBTF.buildDocx('BÁO CÁO LỚP', [
    {
      heading: 'I. Thống kê',
      text: 'Kết quả học tập lớp 10A1.',
      table: { headers: ['Chỉ tiêu', 'Giá trị'], rows: [['Sĩ số', 35]] },
    },
  ])`);
  assert.ok(docxBytes instanceof ctx.Uint8Array);
  assert.equal(docxBytes[0], 0x50);
  assert.equal(docxBytes[1], 0x4b);
  assert.ok(Buffer.from(docxBytes).includes('word/document.xml'));

  // Verify vendored browser bundles load cleanly in a browser-like VM without CDN
  const vendorSandbox = {
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
    Uint8Array,
    Int32Array,
    Uint16Array,
    ArrayBuffer,
    DataView,
    TextEncoder,
    TextDecoder,
    setTimeout,
    clearTimeout,
  };
  vendorSandbox.window = vendorSandbox;
  vendorSandbox.self = vendorSandbox;
  vendorSandbox.globalThis = vendorSandbox;
  const vendorCtx = vm.createContext(vendorSandbox);

  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/vendor/xlsx.full.min.js'), 'utf8'), vendorCtx, { filename: 'js/vendor/xlsx.full.min.js' });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/vendor/mammoth.browser.min.js'), 'utf8'), vendorCtx, { filename: 'js/vendor/mammoth.browser.min.js' });

  assert.equal(typeof vendorCtx.XLSX?.read, 'function');
  assert.equal(typeof vendorCtx.XLSX?.utils?.sheet_to_json, 'function');
  assert.equal(typeof vendorCtx.mammoth?.extractRawText, 'function');
  assert.equal(typeof vendorCtx.mammoth?.convertToHtml, 'function');

  // Round-trip our generated .xlsx bytes through vendored XLSX + DBTF.readSheets
  ctx.XLSX = vendorCtx.XLSX;
  ctx.__testXlsxFile = { arrayBuffer: async () => Buffer.from(xlsxBytes) };
  const parsedSheets = JSON.parse(JSON.stringify(await evalExpr('DBTF.readSheets(__testXlsxFile)')));
  assert.equal(parsedSheets.length, 1);
  assert.equal(parsedSheets[0].name, 'Bảng điểm 10A1');
  const flatText = parsedSheets[0].rows.flat().map(String);
  assert.ok(flatText.includes('Nguyễn Minh Anh'));
  assert.ok(parsedSheets[0].rows.some((r) => r.includes('Nguyễn Minh Anh') && r.includes(8.5)));

  // Confirm index.html has no third-party CDN script tags left and vendored libs exist for lazy load
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /cdnjs\.cloudflare\.com/);
  assert.match(html, /src="js\/vendor\/firebase-sdk\.min\.js"/);
  assert.ok(fs.existsSync(path.join(ROOT, 'js/vendor/xlsx.full.min.js')));
  assert.ok(fs.existsSync(path.join(ROOT, 'js/vendor/mammoth.browser.min.js')));
});

