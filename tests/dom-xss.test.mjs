import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { runBuild } from '../scripts/build.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function createDomTestContext(opts = {}) {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const { window, document } = parseHTML(html);

  const storage = new Map();
  const localStorageMock = {
    get length() { return storage.size; },
    key(i) { return [...storage.keys()][i] ?? null; },
    getItem(k) { return storage.has(k) ? storage.get(k) : null; },
    setItem(k, v) { storage.set(k, String(v)); },
    removeItem(k) { storage.delete(k); },
    clear() { storage.clear(); },
  };

  let onlineFlag = opts.online !== false;
  const navMock = {
    language: 'vi-VN',
    get onLine() { return onlineFlag; },
  };

  const winListeners = new Map();
  const addWinListener = (type, fn) => {
    if (!winListeners.has(type)) winListeners.set(type, []);
    winListeners.get(type).push(fn);
  };
  const removeWinListener = (type, fn) => {
    if (!winListeners.has(type)) return;
    winListeners.set(type, winListeners.get(type).filter((x) => x !== fn));
  };
  const dispatchWinEvent = (ev) => {
    const list = winListeners.get(ev && ev.type) || [];
    for (const fn of list) fn(ev);
    return true;
  };

  const historyCalls = [];
  const locationObj = {
    origin: 'http://localhost:3000',
    pathname: '/',
    search: '',
    hash: opts.initialHash || '',
    href: 'http://localhost:3000/' + (opts.initialHash || ''),
    reload() {},
  };
  const historyObj = {
    pushState(_s, _t, url) { historyCalls.push(String(url || '')); locationObj.hash = String(url || '').replace(/^[^#]*/, ''); },
    replaceState(_s, _t, url) { historyCalls.push(String(url || '')); locationObj.hash = String(url || '').replace(/^[^#]*/, ''); },
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
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    Uint32Array,
    ArrayBuffer,
    DataView,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    HTMLElement: window.HTMLElement,
    Node: window.Node,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    document,
    navigator: navMock,
    location: locationObj,
    history: historyObj,
    localStorage: localStorageMock,
    addEventListener: addWinListener,
    removeEventListener: removeWinListener,
    dispatchEvent: dispatchWinEvent,
    scrollTo: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
    supabaseClient: opts.supabaseClient || null,
    EducMindDB: opts.EducMindDB || {},
    backendBusy: false,
    backendRecovery: false,
    backendErrorText: (e) => String((e && e.message) || e || ''),
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);

  const scripts = [
    'js/00-grade-config.js',
    'js/02-state.js',
    'js/04-icons.js',
    'js/05-helpers.js',
    'js/06-shell.js',
    'js/08-theme.js',
    'js/09-render.js',
    'js/18-student-dashboard.js',
    'js/30-auth-session.js',
    'js/31-supabase-screens.js',
    'js/32-auth-flows.js',
    'js/33-login-screen.js',
    'js/37-avatar-ownership.js',
    'js/45-import-dialog.js',
    'js/46-file-readers.js',
    'js/67-teacher-dashboard.js',
    'js/db/01-core.js',
    'js/db/01b-offline-drafts.js',
    'js/db/02-shell.js',
    'js/db/03-classes.js',
    'js/db/04-content.js',
    'js/db/04b-resources-trash.js',
    'js/db/05-assignments.js',
    'js/db/05b-assignment-grading.js',
    'js/db/05c-assignment-student.js',
    'js/db/06-questions.js',
    'js/db/07-assessments.js',
    'js/db/08-exam.js',
    'js/db/09-progress.js',
    'js/db/10-home.js',
    'js/db/11-transfer.js',
    'js/db/12-schedule.js',
    'js/db/13-report.js',
    'js/db/14-ai.js',
    'js/db/14b-ai-chat.js',
    'js/db/15-games.js',
    'js/db/16-live.js',
  ];
  for (const rel of scripts) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(code, ctx, { filename: rel });
  }

  return {
    ctx,
    window: sandbox,
    document,
    storage,
    setOnline: (v) => { onlineFlag = !!v; },
    evalExpr: (expr) => vm.runInContext(expr, ctx),
    dispatchWinEvent,
  };
}

function assertDomSafeFromXss(document, label) {
  const root = document.getElementById('app');
  assert.ok(root, `${label}: #app root exists`);
  assert.equal(root.querySelectorAll('script').length, 0, `${label}: no <script> elements injected in #app`);

  for (const el of root.querySelectorAll('*')) {
    for (const attr of el.attributes) {
      assert.ok(!/^on/i.test(attr.name), `${label}: forbidden inline handler "${attr.name}" on <${el.tagName.toLowerCase()}>`);
      if ((attr.name === 'href' || attr.name === 'src') && attr.value) {
        const lower = attr.value.trim().toLowerCase();
        assert.ok(!lower.startsWith('javascript:'), `${label}: forbidden javascript: URI in ${attr.name}`);
        assert.ok(!lower.startsWith('data:text/html'), `${label}: forbidden data:text/html URI in ${attr.name}`);
      }
    }
  }
}

test('Static HTML/JS audit: lazy vendor loading and zero inline event attributes', () => {
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.doesNotMatch(indexHtml, /js\/vendor\/xlsx\.full\.min\.js/);
  assert.doesNotMatch(indexHtml, /js\/vendor\/mammoth\.browser\.min\.js/);
  assert.match(indexHtml, /js\/db\/01b-offline-drafts\.js/);

  const files = [
    'index.html',
    ...fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`),
    ...fs.readdirSync(path.join(ROOT, 'js/db')).filter((f) => f.endsWith('.js')).map((f) => `js/db/${f}`),
  ];
  for (const rel of files) {
    const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.doesNotMatch(
      content,
      /(?<![.\w$])\bon(?:click|change|submit|input|keyup|keydown|load|error)\s*=\s*(?:['"`]|\\['"])/i,
      `Found inline HTML event handler in ${rel}`,
    );
  }
});

test('DOM rendering & XSS immunity across auth, teacher, and student views', () => {
  const XSS_HTML = '<img src=x onerror=alert(1)><script>window.__xss=1</script>';
  const XSS_ATTR = '" autofocus onfocus="alert(1)" data-evil="1';
  const XSS_URL = 'javascript:alert(1)';

  const { document, evalExpr } = createDomTestContext();

  // 1. Auth views with adversarial inputs
  for (const mode of ['login', 'signup', 'forgot', 'verify-signup', 'reset']) {
    evalExpr(`
      logged = false;
      sess = null;
      authMode = ${JSON.stringify(mode)};
      authEmail = ${JSON.stringify(XSS_ATTR + '@edu.vn')};
      authSignupName = ${JSON.stringify(XSS_HTML)};
      authErr = ${JSON.stringify(XSS_HTML)};
      authMsg = ${JSON.stringify(XSS_ATTR)};
      render();
    `);
    assert.ok(document.getElementById('pageTitle'), `auth ${mode}: renders #pageTitle`);
    assertDomSafeFromXss(document, `auth:${mode}`);
  }

  // 2. Logged-in Teacher shell + Home + Classes + Content + Assignments + Grading + Questions + Assessments
  evalExpr(`
    logged = true;
    role = 'T';
    sess = { email: 'gv@edu.vn', role: 'T', t: Date.now(), backend: true, userId: 'teacher-1' };
    DB.me = { id: 'teacher-1', email: 'gv@edu.vn', full_name: ${JSON.stringify(XSS_HTML)}, role: 'TEACHER' };
    DB.classes = [{ id: 'c1', name: ${JSON.stringify('10A1 ' + XSS_HTML)}, grade: 10, school_year: '2026-2027', owner_teacher_id: 'teacher-1' }];
    DB.classId = 'c1';
    DB.course = { id: 'course-1', class_id: 'c1', title: ${JSON.stringify('Tin học ' + XSS_HTML)}, description: ${JSON.stringify(XSS_ATTR)} };
    DB.notifs = [{ id: 'n1', title: ${JSON.stringify(XSS_HTML)}, content: ${JSON.stringify(XSS_ATTR)}, is_read: false, created_at: '2026-11-21T10:00:00Z', payload: {} }];
  `);

  const teacherFixtures = {
    home: `{
      topics: [], lessons: [{ id: 'l1', title: ${JSON.stringify(XSS_HTML)}, status: 'PUBLISHED' }],
      objectives: [{ id: 'o1', lesson_id: 'l1', code: 'C1', description: ${JSON.stringify(XSS_HTML)} }],
      assignments: [{ id: 'a1', title: ${JSON.stringify(XSS_HTML)}, status: 'PUBLISHED', due_at: '2026-12-01T10:00:00Z', max_score: 10 }],
      submissions: [], assessments: [], attempts: [], mastery: [], gaps: [],
      members: [{ student_id: 'stu-1' }],
      profiles: { 'stu-1': { id: 'stu-1', full_name: ${JSON.stringify(XSS_HTML)}, email: 'hs@edu.vn' } },
      invites: [{ id: 'i1', class_id: 'c1', code: 'ABC123' }],
      resources: [],
    }`,
    content: `{
      topics: [{ id: 't1', title: ${JSON.stringify(XSS_HTML)}, description: ${JSON.stringify(XSS_ATTR)}, status: 'PUBLISHED', display_order: 1 }],
      lessons: [{ id: 'l1', topic_id: 't1', title: ${JSON.stringify(XSS_HTML)}, description: ${JSON.stringify(XSS_ATTR)}, status: 'PUBLISHED', display_order: 1 }],
      objectives: [{ id: 'o1', lesson_id: 'l1', code: 'C1', description: ${JSON.stringify(XSS_HTML)} }],
      resources: [{ id: 'r1', lesson_id: 'l1', kind: 'LINK', url: ${JSON.stringify(XSS_URL)}, file_name: ${JSON.stringify(XSS_HTML)}, mime_type: 'text/link' }],
      deletedTopics: [], deletedLessons: [],
    }`,
    assignments: `{
      assignments: [{ id: 'a1', lesson_id: 'l1', title: ${JSON.stringify(XSS_HTML)}, description: ${JSON.stringify(XSS_ATTR)}, status: 'PUBLISHED', due_at: '2026-12-01T10:00:00Z', max_score: 10 }],
      lessons: [{ id: 'l1', title: ${JSON.stringify(XSS_HTML)} }],
      objectives: [], links: [], members: [{ student_id: 'stu-1' }],
      profiles: { 'stu-1': { id: 'stu-1', full_name: ${JSON.stringify(XSS_HTML)}, email: 'hs@edu.vn' } },
      submissions: [{ id: 's1', assignment_id: 'a1', student_id: 'stu-1', status: 'SUBMITTED', submitted_at: '2026-11-21T09:00:00Z', text_content: ${JSON.stringify(XSS_HTML)}, feedback: ${JSON.stringify(XSS_HTML)}, score: 8 }],
      criteria: [], rubricScores: [], questions: [], qlinks: [],
      assignmentQuestions: [{ assignment_id: 'a1', question_id: 'q1', weight: 2 }],
      assignmentQuestionDetails: [{ id: 'q1', kind: 'SINGLE_CHOICE', content: ${JSON.stringify(XSS_HTML)}, options: [${JSON.stringify(XSS_HTML)}, 'B'], correct_answer: 0 }],
      assignmentAnswers: [{ submission_id: 's1', question_id: 'q1', answer_content: 0 }],
    }`,
    questions: `{
      questions: [{ id: 'q1', kind: 'SINGLE_CHOICE', content: ${JSON.stringify(XSS_HTML)}, options: [${JSON.stringify(XSS_HTML)}, 'B'], correct_answer: 0, difficulty: 'EASY', grade: 10, bloom_level: 'REMEMBER' }],
      lessons: [{ id: 'l1', title: ${JSON.stringify(XSS_HTML)} }],
      objectives: [], qlinks: [],
    }`,
  };

  for (const [page, dataCode] of Object.entries(teacherFixtures)) {
    evalExpr(`
      DB.page = ${JSON.stringify(page)};
      DB.arg = ${page === 'assignments' ? "{ id: 'a1' }" : '{}'};
      DB.data = ${dataCode};
      dbRender();
    `);
    assert.ok(document.querySelector('header.top'), `teacher ${page}: renders header`);
    assert.ok(document.querySelector('nav.side'), `teacher ${page}: renders sidebar`);
    assert.ok(document.getElementById('pageTitle'), `teacher ${page}: renders #pageTitle`);
    assertDomSafeFromXss(document, `teacher:${page}`);
  }

  // 3. Logged-in Student shell + Active assignment + Exam
  evalExpr(`
    role = 'S';
    sess = { email: 'hs@edu.vn', role: 'S', t: Date.now(), backend: true, userId: 'stu-1' };
    DB.me = { id: 'stu-1', email: 'hs@edu.vn', full_name: ${JSON.stringify(XSS_HTML)}, role: 'STUDENT' };
    DB.page = 'exam';
    DB.arg = { id: 'ex-1' };
    DBX = {
      assessment: { id: 'ex-1', title: ${JSON.stringify('Kiểm tra ' + XSS_HTML)}, duration_minutes: 30, max_attempts: 2 },
      attempt: { id: 'att-1', attempt_number: 1, status: 'IN_PROGRESS' },
      endsAt: Date.now() + 600000,
      questions: [
        { question_id: 'q1', kind: 'SINGLE_CHOICE', content: ${JSON.stringify(XSS_HTML)}, options: [${JSON.stringify(XSS_HTML)}, 'Phương án B'], weight: 1 },
        { question_id: 'q2', kind: 'SHORT_ANSWER', content: ${JSON.stringify(XSS_ATTR)}, options: [], weight: 2 },
      ],
      answers: { q2: ${JSON.stringify(XSS_ATTR)} },
      state: { q2: 'saved' },
      debounce: {},
      inFlight: {},
      tick: null,
      finishing: false,
    };
    DB.data = { ready: true };
    dbRender();
  `);
  assert.ok(document.getElementById('db-exam-timer'), 'student exam: renders countdown timer');
  assertDomSafeFromXss(document, 'student:exam');
  evalExpr('dbExamStop(false);');
});

test('Delegated event wiring works without inline attributes', () => {
  const { document, evalExpr } = createDomTestContext();

  evalExpr(`logged = false; sess = null; authMode = 'login'; render();`);
  const signupBtn = document.querySelector('[data-app-act="authGoSignup"]');
  assert.ok(signupBtn, 'login screen has delegated signup button');
  signupBtn.click();
  assert.equal(evalExpr('authMode'), 'signup');
  assert.ok(document.querySelector('form[data-app-act="authBackendSignup"]'), 'signup form rendered via delegated click');

  const backBtn = document.querySelector('[data-app-act="authGoLogin"]');
  assert.ok(backBtn);
  backBtn.click();
  assert.equal(evalExpr('authMode'), 'login');
});

test('Offline draft cache, connectivity banner, F5 recovery, reconnect sync, and logout cleanup', async () => {
  const savedCalls = [];
  let failSaves = true;

  const mockDb = {
    finalizeExpiredAttempts: async () => ({ data: null, error: null }),
    listAttempts: async () => ({ data: [{ id: 'att-1', assessment_id: 'ex-1', status: 'IN_PROGRESS', attempt_number: 1 }], error: null }),
    listAssessments: async () => ({ data: [{ id: 'ex-1', title: 'Kiểm tra 15 phút', duration_minutes: 15, max_attempts: 2 }], error: null }),
    startAttempt: async () => ({
      data: {
        status: 'RESUMED',
        attempt: { id: 'att-1', attempt_number: 1, status: 'IN_PROGRESS' },
        ends_at: new Date(Date.now() + 600000).toISOString(),
      },
      error: null,
    }),
    getAssessmentQuestions: async () => ({
      data: [
        { question_id: 'q1', kind: 'SINGLE_CHOICE', content: '2 + 2 = ?', options: ['3', '4'], weight: 1 },
        { question_id: 'q2', kind: 'SHORT_ANSWER', content: 'Thủ đô?', options: [], weight: 1 },
      ],
      error: null,
    }),
    listAnswers: async () => ({
      data: [{ question_id: 'q1', answer_content: 1 }],
      error: null,
    }),
    saveAnswer: async (attemptId, questionId, answerContent) => {
      if (failSaves) return { data: null, error: { message: 'Failed to fetch' } };
      savedCalls.push({ attemptId, questionId, answerContent });
      return { data: null, error: null };
    },
    submitAttempt: async () => ({ data: { id: 'att-1', status: 'GRADED' }, error: null }),
  };

  const { document, storage, setOnline, evalExpr, dispatchWinEvent } = createDomTestContext({
    EducMindDB: mockDb,
    online: false,
  });

  evalExpr(`
    logged = true;
    role = 'S';
    sess = { email: 'hs@edu.vn', role: 'S', t: Date.now(), backend: true, userId: 'stu-1' };
    DB.me = { id: 'stu-1', email: 'hs@edu.vn', full_name: 'Học sinh A', role: 'STUDENT' };
    DB.classes = [{ id: 'c1', name: '10A1', grade: 10 }];
    DB.classId = 'c1';
    DB.course = { id: 'course-1', class_id: 'c1', title: 'Tin học 10' };
    DB.page = 'exam';
    DB.arg = { id: 'ex-1' };
  `);

  await evalExpr('DB_PAGES.exam.load()');
  evalExpr('DB.data = { ready: true }; dbRender();');

  const banner = document.getElementById('db-net-banner');
  assert.ok(banner, 'connectivity banner exists in DOM');
  assert.equal(banner.hidden, false, 'banner visible while offline');
  assert.match(banner.textContent, /Mất kết nối mạng/);

  // Student types while offline -> saved to localStorage draft immediately
  const input = document.getElementById('db-xa-q2');
  assert.ok(input);
  input.value = 'Hà Nội';
  evalExpr(`DB_ACT.examText(document.getElementById('db-xa-q2'))`);
  evalExpr(`dbExamSave('q2')`);

  const draftKey = 'educmind.draft.exam:stu-1:att-1';
  assert.ok(storage.has(draftKey), 'offline exam answer persisted to localStorage');
  assert.equal(JSON.parse(storage.get(draftKey)).answers.q2, 'Hà Nội');
  assert.match(banner.textContent, /1 câu chờ đồng bộ/);

  // Simulate F5 reload while still offline: memory DBX cleared, server does not have q2 yet
  evalExpr('dbExamStop(false);');
  await evalExpr('DB_PAGES.exam.load()');
  assert.equal(evalExpr("DBX.answers['q2']"), 'Hà Nội', 'unsaved offline draft restored across reload');
  assert.equal(evalExpr("DBX.state['q2']"), 'dirty');

  // Reconnect online -> online event triggers sync & clears exam draft
  failSaves = false;
  setOnline(true);
  dispatchWinEvent(new (evalExpr('Event'))('online'));
  await new Promise((r) => setTimeout(r, 40));

  assert.equal(savedCalls.length, 1);
  assert.deepEqual(savedCalls[0], { attemptId: 'att-1', questionId: 'q2', answerContent: 'Hà Nội' });
  assert.equal(evalExpr("DBX.state['q2']"), 'saved');
  assert.equal(storage.has(draftKey), false, 'exam draft removed once all pending items saved');
  assert.match(document.getElementById('db-net-banner').textContent, /Đã khôi phục kết nối/);

  // Assignment draft save & restore check
  evalExpr(`
    dbExamStop(false);
    DB.page = 'assignments';
    DB.arg = { id: 'asg-1' };
    DB_ASSIGNMENT_FLOW = { assignmentId: 'asg-1', mode: 'RACE', started: true, index: 0 };
    DB.data = {
      assignments: [{ id: 'asg-1', title: 'Bài tập 1', due_at: '2026-12-30T23:59:00Z', max_score: 10, status: 'PUBLISHED' }],
      submissions: [],
      studentQuestions: [{ question_id: 'aq1', kind: 'SHORT_ANSWER', content: 'Giải thích?', options: [], weight: 2 }],
      assignmentAnswers: [],
      lessons: [],
      objectives: [],
      links: [],
    };
    dbDraftWrite('asg', 'asg-1', { version: 1, updatedAt: Date.now(), answers: { aq1: 'Nháp bài tập' }, pending: { aq1: true }, mode: 'RACE' });
    dbRender();
  `);
  const asgInput = document.getElementById('db-asg-aq1');
  assert.ok(asgInput);
  assert.equal(asgInput.value, 'Nháp bài tập', 'local assignment draft hydrated into DOM control');

  // Another student's draft remains untouched when current user logs out
  storage.set('educmind.draft.asg:stu-2:asg-1', JSON.stringify({ version: 1, updatedAt: Date.now(), answers: { aq1: 'Của bạn khác' } }));
  evalExpr('logout()');
  assert.equal(storage.has('educmind.draft.asg:stu-1:asg-1'), false, 'logged-out user draft cleared');
  assert.equal(storage.has('educmind.draft.asg:stu-2:asg-1'), true, 'other user draft preserved');
});

test('Lazy-loader promises deduplicate vendor script tags and reset cleanly on error', async () => {
  const { document, evalExpr, window } = createDomTestContext();

  const p1 = evalExpr(`loadVendorScript('js/vendor/xlsx.full.min.js')`);
  const p2 = evalExpr(`loadVendorScript('js/vendor/xlsx.full.min.js')`);
  assert.equal(p1, p2, 'concurrent loads share the exact same promise');

  const scripts = [...document.head.querySelectorAll('script[data-vendor-src="js/vendor/xlsx.full.min.js"]')];
  assert.equal(scripts.length, 1, 'only one script element inserted');
  scripts[0].onload();
  await p1;
  assert.equal(scripts[0].dataset.loaded, '1');

  // Error resets cache so subsequent attempt can retry
  const errPromise = evalExpr(`loadVendorScript('js/vendor/mammoth.browser.min.js')`);
  const mScript = document.head.querySelector('script[data-vendor-src="js/vendor/mammoth.browser.min.js"]');
  assert.ok(mScript);
  mScript.onerror();
  await assert.rejects(errPromise, /Không tải được thư viện/);
  assert.equal(evalExpr(`_vendorScriptPromises.has('js/vendor/mammoth.browser.min.js')`), false);
});

test('DOM & XSS interactive tests for Games (15-games.js) across all 5 question kinds', async () => {
  const XSS_HTML = '<img src=x onerror=alert(2)><script>window.__xssGame=1</script>';
  const XSS_ATTR = '" onclick="alert(2)" data-bad="1';
  const savedSessions = [];

  const mockDb = {
    createGameSession: async (row) => {
      savedSessions.push(row);
      return { data: { id: 'gs-1', ...row }, error: null };
    },
  };

  const { document, evalExpr, storage } = createDomTestContext({ EducMindDB: mockDb });
  evalExpr(`
    logged = true;
    role = 'S';
    sess = { email: 'hs@edu.vn', role: 'S', t: Date.now(), backend: true, userId: 'stu-1' };
    DB.me = { id: 'stu-1', email: 'hs@edu.vn', full_name: ${JSON.stringify(XSS_HTML)}, role: 'STUDENT' };
    DB.classes = [{ id: 'c1', name: '10A1', grade: 10 }];
    DB.classId = 'c1';
    DB.course = { id: 'course-1', class_id: 'c1', title: 'Tin học 10' };
    DB.page = 'games';
    DB.arg = {};
    DB.data = {
      lessons: [{ id: 'l1', title: ${JSON.stringify('Bài 1 ' + XSS_HTML)} }],
      objectives: [{ id: 'o1', lesson_id: 'l1', code: 'O1', description: ${JSON.stringify(XSS_HTML)} }],
      questions: [
        { id: 'gq1', kind: 'SINGLE_CHOICE', content: ${JSON.stringify('Câu 1 ' + XSS_HTML)}, options: [${JSON.stringify(XSS_HTML)}, 'Sai'], correct_answer: 0, explain: ${JSON.stringify(XSS_ATTR)}, objective_ids: ['o1'] },
        { id: 'gq2', kind: 'TRUE_FALSE', content: ${JSON.stringify('Câu 2 ' + XSS_ATTR)}, options: ['Đúng', 'Sai'], correct_answer: true, explain: ${JSON.stringify(XSS_HTML)}, objective_ids: ['o1'] },
        { id: 'gq3', kind: 'MULTIPLE_CHOICE', content: 'Chọn ý đúng', options: [${JSON.stringify(XSS_HTML)}, 'Ý B', 'Ý C'], correct_answer: [0, 2], explain: 'Giải thích', objective_ids: ['o1'] },
        { id: 'gq4', kind: 'FILL_IN_BLANK', content: 'Thủ đô là ___ và sông ___', options: [], correct_answer: ['Hà Nội', 'Hồng'], explain: 'Điền khuyết', objective_ids: ['o1'] },
        { id: 'gq5', kind: 'MATCHING', content: 'Nối cặp', options: { left: [${JSON.stringify(XSS_HTML)}, 'B'], right: ['1', ${JSON.stringify(XSS_ATTR)}] }, correct_answer: [0, 1], explain: 'Ghép đôi', objective_ids: ['o1'] },
      ],
      sessions: [{ id: 's0', student_id: 'stu-1', mode: 'BLITZ', correct_count: 5, question_count: 5, score: 80, duration_seconds: 30, played_at: '2026-11-20T10:00:00Z' }],
      profiles: { 'stu-1': { id: 'stu-1', full_name: ${JSON.stringify(XSS_HTML)} } },
    };
    dbRender();
  `);
  assertDomSafeFromXss(document, 'games:lobby');

  // Toggle sound via delegated click
  const soundBtn = document.querySelector('[data-act="gameToggleSound"]');
  assert.ok(soundBtn);
  soundBtn.click();
  assert.equal(storage.get('educmind.sfx'), '1');

  // Pick SURVIVAL mode via delegated click (includes all 5 kinds)
  const survBtn = document.querySelector('[data-act="gamePickMode"][data-mode="SURVIVAL"]');
  assert.ok(survBtn);
  survBtn.click();
  assert.equal(evalExpr('DB_GAME_MODE_PICK'), 'SURVIVAL');

  // Start game via form submit (preserve deterministic pool order)
  evalExpr('dbGameBegin(DB.data, "SURVIVAL", "BANK"); DB_GAME.pool = [...DB.data.questions]; DB_GAME.draft = dbGameNewDraft(DB_GAME.pool[0]); dbRender();');
  assertDomSafeFromXss(document, 'games:play:single');

  // Q1: SINGLE_CHOICE -> choose wrong answer (1) so review list renders XSS payload too
  document.querySelector('[data-act="gameAnswer"][data-i="1"]').click();
  assert.equal(evalExpr('DB_GAME.ok'), false);
  assert.equal(evalExpr('DB_GAME.lives'), 2);
  assertDomSafeFromXss(document, 'games:feedback:single');
  document.querySelector('[data-act="gameNext"]').click();

  // Q2: TRUE_FALSE -> answer right (0)
  document.querySelector('[data-act="gameAnswer"][data-i="0"]').click();
  assert.equal(evalExpr('DB_GAME.ok'), true);
  document.querySelector('[data-act="gameNext"]').click();

  // Q3: MULTIPLE_CHOICE -> toggle 0 & 2, then submit
  document.querySelector('[data-act="gameToggle"][data-i="0"]').click();
  document.querySelector('[data-act="gameToggle"][data-i="2"]').click();
  document.querySelector('[data-act="gameSubmit"]').click();
  assert.equal(evalExpr('DB_GAME.ok'), true);
  document.querySelector('[data-act="gameNext"]').click();

  // Q4: FILL_IN_BLANK -> fill 2 gaps, then submit
  const gaps = [...document.querySelectorAll('.db-game-gap')];
  assert.equal(gaps.length, 2);
  gaps[0].value = 'hà nội';
  gaps[1].value = 'Hồng';
  document.querySelector('[data-act="gameSubmit"]').click();
  assert.equal(evalExpr('DB_GAME.ok'), true);
  document.querySelector('[data-act="gameNext"]').click();

  // Q5: MATCHING -> pair 0->0 and 1->1, then submit
  document.querySelector('[data-act="gameMatchL"][data-i="0"]').click();
  document.querySelector('[data-act="gameMatchR"][data-r="0"]').click();
  document.querySelector('[data-act="gameMatchL"][data-i="1"]').click();
  document.querySelector('[data-act="gameMatchR"][data-r="1"]').click();
  document.querySelector('[data-act="gameSubmit"]').click();
  assert.equal(evalExpr('DB_GAME.ok'), true);
  assertDomSafeFromXss(document, 'games:feedback:matching');

  // Finish game & inspect result + wrong review DOM
  await evalExpr('DB_ACT.gameFinish()');
  assert.equal(savedSessions.length, 1);
  assert.equal(savedSessions[0].correct_count, 4);
  assert.ok(document.getElementById('db-h-gr'), 'renders game result heading');
  assertDomSafeFromXss(document, 'games:result');

  evalExpr('DB_PAGES.games.leave();');
});

test('DOM & XSS interactive tests for AI Question Generation (14-ai.js)', () => {
  const XSS_HTML = '<img src=x onerror=alert(3)><script>window.__xssAi=1</script>';
  const XSS_ATTR = '" onfocus="alert(3)" autofocus="1';

  const { document, evalExpr } = createDomTestContext();

  // 1. Student is blocked cleanly
  evalExpr(`
    logged = true;
    role = 'S';
    sess = { email: 'hs@edu.vn', role: 'S', t: Date.now(), backend: true, userId: 'stu-1' };
    DB.me = { id: 'stu-1', email: 'hs@edu.vn', full_name: 'HS', role: 'STUDENT' };
    DB.classes = [{ id: 'c1', name: '10A1', grade: 10 }];
    DB.classId = 'c1';
    DB.course = { id: 'course-1', class_id: 'c1', title: 'Tin học 10' };
    DB.page = 'ai';
    DB.arg = {};
    DB.data = { lessons: [], objectives: [], requests: [], outputs: [], jobs: [], assignments: [], assessments: [] };
    dbRender();
  `);
  assert.match(document.getElementById('app').textContent, /Chỉ giáo viên mới dùng được AI/);
  assertDomSafeFromXss(document, 'ai:student-guard');

  // 2. Teacher view with adversarial payloads
  evalExpr(`
    role = 'T';
    sess = { email: 'gv@edu.vn', role: 'T', t: Date.now(), backend: true, userId: 'teacher-1' };
    DB.me = { id: 'teacher-1', email: 'gv@edu.vn', full_name: ${JSON.stringify(XSS_HTML)}, role: 'TEACHER' };
    DB.data = {
      lessons: [
        { id: 'l1', title: ${JSON.stringify('Bài 1 ' + XSS_HTML)} },
        { id: 'l2', title: ${JSON.stringify('Bài 2 ' + XSS_ATTR)} },
      ],
      objectives: [
        { id: 'o1', lesson_id: 'l1', code: ${JSON.stringify(XSS_ATTR)}, description: ${JSON.stringify(XSS_HTML)} },
        { id: 'o2', lesson_id: 'l2', code: 'C2', description: 'Mục tiêu 2' },
      ],
      requests: [
        { id: 'r1', lesson_id: 'l1', quantity: 2, status: 'FAILED', error_message: ${JSON.stringify(XSS_HTML)}, created_at: '2026-11-22T09:00:00Z', parameters: { objectives: ['o1'] } },
      ],
      outputs: [
        { id: 'out1', request_id: 'r1', kind: 'SINGLE_CHOICE', content: ${JSON.stringify(XSS_HTML)}, options: [${JSON.stringify(XSS_HTML)}, ${JSON.stringify(XSS_ATTR)}], correct_answer: 0, difficulty: 'MEDIUM', bloom_level: 'UNDERSTAND', objective_id: 'o1', review_status: 'PENDING_REVIEW' },
      ],
      jobs: [{ id: 'j1', request_id: 'r1', status: 'FAILED' }],
      assignments: [],
      assessments: [],
    };
    dbRender();
  `);
  assertDomSafeFromXss(document, 'ai:teacher-view');

  // Delegated lesson picker toggles hidden panels without full rerender
  const lessonSelect = document.getElementById('db-ai-lesson');
  assert.ok(lessonSelect);
  const pickLessonOption = (val) => {
    for (const opt of lessonSelect.querySelectorAll('option')) {
      if (opt.value === val) opt.setAttribute('selected', '');
      else opt.removeAttribute('selected');
    }
    evalExpr('DB_ACT.aiLessonPick(document.getElementById("db-ai-lesson"))');
  };
  pickLessonOption('l1');
  assert.equal(document.querySelector('.db-ai-objs[data-lesson="l1"]').hidden, false);
  assert.equal(document.querySelector('.db-ai-objs[data-lesson="l2"]').hidden, true);

  pickLessonOption('ALL');
  assert.equal(document.querySelector('.db-ai-objs[data-lesson="l1"]').hidden, false);
  assert.equal(document.querySelector('.db-ai-objs[data-lesson="l2"]').hidden, false);

  // Open Edit & Approve modal with XSS content
  document.querySelector('[data-act="aiEditApprove"][data-id="out1"]').click();
  assert.ok(document.getElementById('db-ae-c'), 'Edit & Approve modal opened');
  assertDomSafeFromXss(document, 'ai:edit-dialog');

  const parsedEdit = evalExpr(`dbAiParseEdit(DB.data.outputs[0], {
    content: 'Câu đã sửa',
    options: 'Lựa chọn 1\\nLựa chọn 2',
    answer: 'B',
    difficulty: 'HARD',
    bloom_level: 'APPLY',
    grade: '10',
  })`);
  assert.equal(parsedEdit.correct_answer, 1);
  assert.equal(parsedEdit.grade, 10);

  // Open Reject All modal safely
  evalExpr('DB.dialog = null; dbRender();');
  document.querySelector('[data-act="aiRejectAll"]').click();
  assert.ok(document.getElementById('db-aj-all-n'), 'Reject All modal opened');
  assertDomSafeFromXss(document, 'ai:reject-all-dialog');
});

test('DOM & XSS interactive tests for Progress Report (13-report.js)', () => {
  const XSS_HTML = '<img src=x onerror=alert(4)><script>window.__xssRep=1</script>';
  const XSS_ATTR = '" onmouseover="alert(4)" data-x="1';

  const { document, evalExpr, storage } = createDomTestContext();
  evalExpr(`
    logged = true;
    role = 'T';
    sess = { email: 'gv@edu.vn', role: 'T', t: Date.now(), backend: true, userId: 'teacher-1' };
    DB.me = { id: 'teacher-1', email: 'gv@edu.vn', full_name: ${JSON.stringify(XSS_HTML)}, role: 'TEACHER' };
    DB.classes = [{ id: 'c1', name: ${JSON.stringify('10A1 ' + XSS_HTML)}, grade: 10 }];
    DB.classId = 'c1';
    DB.course = { id: 'course-1', class_id: 'c1', title: ${JSON.stringify('Tin học ' + XSS_HTML)} };
    DB.page = 'report';
    DB.arg = {};
    DB_REPORT_STU = '';
    DB.data = {
      topics: [{ id: 't1', title: ${JSON.stringify(XSS_HTML)} }],
      lessons: [{ id: 'l1', topic_id: 't1', title: ${JSON.stringify(XSS_HTML)} }],
      objectives: [{ id: 'o1', lesson_id: 'l1', code: 'O1', description: ${JSON.stringify(XSS_HTML)} }],
      assignments: [{ id: 'a1', title: ${JSON.stringify(XSS_HTML)}, due_at: '2026-12-01T10:00:00Z', max_score: 10 }],
      assessments: [{ id: 'e1', title: ${JSON.stringify(XSS_ATTR)} }],
      submissions: [{ id: 's1', assignment_id: 'a1', student_id: 'stu-1', score: 4 }],
      attempts: [{ id: 'att1', assessment_id: 'e1', student_id: 'stu-1', total_score: 5 }],
      mastery: [{ student_id: 'stu-1', objective_id: 'o1', mastery_score: 0.4 }],
      gaps: [{ id: 'g1', student_id: 'stu-1', objective_id: 'o1', status: 'OPEN', reason: ${JSON.stringify(XSS_HTML)} }],
      evidence: [{ id: 'ev1', student_id: 'stu-1', objective_id: 'o1', observed_at: new Date().toISOString() }],
      members: [{ student_id: 'stu-1' }],
      profiles: { 'stu-1': { id: 'stu-1', full_name: ${JSON.stringify(XSS_HTML)}, email: 'hs@edu.vn' } },
      maxBy: { e1: 10 },
    };
    dbRender();
  `);
  assertDomSafeFromXss(document, 'report:teacher-summary');

  // Update org setting via delegated handler
  const orgInput = document.querySelector('[data-change="reportOrg"][data-field="school"]');
  assert.ok(orgInput);
  orgInput.value = 'THPT ' + XSS_HTML;
  evalExpr('DB_ACT.reportOrg(document.querySelector(\'[data-change="reportOrg"][data-field="school"]\'))');
  assert.equal(JSON.parse(storage.get('educmind.report.org')).school, 'THPT ' + XSS_HTML);

  // Switch to student detail via delegated click
  document.querySelector('[data-act="reportPick"][data-id="stu-1"]').click();
  assert.equal(evalExpr('DB_REPORT_STU'), 'stu-1');
  assertDomSafeFromXss(document, 'report:teacher-student-detail');

  // Student role view & export model generation
  evalExpr(`
    role = 'S';
    sess = { email: 'hs@edu.vn', role: 'S', t: Date.now(), backend: true, userId: 'stu-1' };
    DB.me = { id: 'stu-1', email: 'hs@edu.vn', full_name: ${JSON.stringify(XSS_HTML)}, role: 'STUDENT' };
    dbRender();
  `);
  assertDomSafeFromXss(document, 'report:student-self');
  const exportSheets = evalExpr('dbReportSheets(DB.data, "stu-1", dbReportExportCtx())');
  assert.ok(Array.isArray(exportSheets) && exportSheets.length >= 5);
});

test('DOM & XSS interactive tests for Crema Studio shell, nav filter, and theme switch', () => {
  const XSS_HTML = '<img src=x onerror=alert(9)><script>window.__xssShell=1</script>';
  const { document, evalExpr } = createDomTestContext();
  evalExpr(`
    logged = true;
    role = 'T';
    sess = { email: 'gv@edu.vn', role: 'T', t: Date.now(), backend: true, userId: 'teacher-1' };
    DB.me = { id: 'teacher-1', email: 'gv@edu.vn', full_name: ${JSON.stringify(XSS_HTML)}, role: 'TEACHER' };
    DB.classes = [{ id: 'c1', name: '10A1', grade: 10 }];
    DB.classId = 'c1';
    DB.course = { id: 'course-1', class_id: 'c1', title: 'Tin học' };
    DB.page = 'home';
    DB.data = {
      topics: [], lessons: [], objectives: [], assignments: [], assessments: [],
      submissions: [], attempts: [], mastery: [], gaps: [], members: [], profiles: {}, invites: [], resources: [],
    };
    setTheme('light');
  `);

  assertDomSafeFromXss(document, 'shell:crema-xss');
  assert.ok(document.querySelector('.side-brand'), 'renders .side-brand');
  assert.ok(document.getElementById('db-nav-filter'), 'renders #db-nav-filter search input');
  assert.ok(document.querySelectorAll('.nav-ic-tile').length >= 10, 'renders squircle .nav-ic-tile icons');
  assert.equal(document.querySelector('.side-theme-row'), null, 'does not duplicate theme toggle inside sidebar');
  assert.equal(document.querySelector('.side-profile-btn'), null, 'does not duplicate account button inside sidebar');
  const greeting = document.querySelector('.top .user-greeting');
  assert.ok(greeting && greeting.textContent.includes(XSS_HTML), 'escapes full_name safely inside .user-greeting');
  assert.equal(document.querySelector('.top .theme-btn').getAttribute('aria-pressed'), 'false');

  // Toggle theme and verify topbar theme button aria-pressed flips to true
  evalExpr('toggleTheme();');
  assert.equal(document.querySelector('.top .theme-btn').getAttribute('aria-pressed'), 'true');

  // Sidebar search filter supports accent-folded Vietnamese matching and restores all items on clear
  evalExpr(`(() => {
    const filterEl = document.getElementById('db-nav-filter');
    filterEl.value = 'bao cao';
    DB_ACT.filterNav(filterEl);
  })()`);
  const reportBtn = document.getElementById('nav-report');
  const homeBtn = document.getElementById('nav-home');
  assert.equal(reportBtn.hidden, false, 'matching nav item remains visible');
  assert.equal(homeBtn.hidden, true, 'non-matching nav item is hidden');
  const emptyGrp = homeBtn.closest('.grp');
  assert.equal(emptyGrp.hidden, true, 'group with zero matching items is hidden');

  evalExpr(`(() => {
    const filterEl = document.getElementById('db-nav-filter');
    filterEl.value = '';
    DB_ACT.filterNav(filterEl);
  })()`);
  assert.equal(homeBtn.hidden, false, 'clearing search restores all nav items');
  assert.equal(emptyGrp.hidden, false, 'clearing search restores nav groups');
});

test('Build script bundles & minifies assets, converts to WebP, runs minified runtime, and Express serves CSP + Brotli/Gzip', async () => {
  const buildInfo = runBuild();
  assert.ok(buildInfo.cssCount >= 10);
  assert.ok(buildInfo.jsCount >= 30);
  assert.ok(buildInfo.cssBytes < buildInfo.rawCssBytes, 'CSS bundle is minified');
  assert.ok(buildInfo.appBytes < buildInfo.rawJsBytes, 'JS bundles are minified');

  // Confirm PNG bloat removed and compact WebP assets packaged
  const distAssetsDir = path.join(ROOT, 'dist', 'assets');
  const assetFiles = fs.readdirSync(distAssetsDir);
  assert.ok(assetFiles.includes('background_login.webp'));
  assert.ok(assetFiles.includes('student-characters.webp'));
  assert.equal(assetFiles.some((f) => f.endsWith('.png')), false, 'no giant PNGs remain in dist/assets');
  const webpTotalBytes = fs.statSync(path.join(distAssetsDir, 'background_login.webp')).size
    + fs.statSync(path.join(distAssetsDir, 'student-characters.webp')).size;
  assert.ok(webpTotalBytes < 300 * 1024, `expected combined WebP < 300KB, got ${webpTotalBytes}`);

  const distHtml = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8');
  const distScripts = [...distHtml.matchAll(/<script\s+src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  const distLinks = [...distHtml.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)">/g)].map((m) => m[1]);
  assert.equal(distLinks.length, 1, 'dist/index.html loads single hashed CSS bundle');
  assert.equal(distScripts.length, 4, 'dist/index.html loads supabase, core bundle, env override, app bundle');
  assert.ok(fs.existsSync(path.join(ROOT, 'dist', 'js', 'vendor', 'xlsx.full.min.js')));
  assert.ok(fs.existsSync(path.join(ROOT, 'dist', 'js', 'vendor', 'mammoth.browser.min.js')));

  // Verify actual minified core + app bundles execute cleanly in linkedom + VM
  const { window: minWin, document: minDoc } = parseHTML(distHtml);
  const minSandbox = {
    console, Date, Math, JSON, Number, String, Boolean, Array, Object, Set, Map, RegExp, Error, Promise,
    URL, URLSearchParams, TextEncoder, TextDecoder, Uint8Array, Uint32Array, ArrayBuffer, DataView,
    Event: minWin.Event, CustomEvent: minWin.CustomEvent, HTMLElement: minWin.HTMLElement, Node: minWin.Node,
    MutationObserver: minWin.MutationObserver || class { observe() {} disconnect() {} },
    ResizeObserver: minWin.ResizeObserver || class { observe() {} disconnect() {} },
    IntersectionObserver: minWin.IntersectionObserver || class { observe() {} disconnect() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    document: minDoc,
    navigator: { language: 'vi-VN', onLine: true },
    location: { origin: 'http://localhost:3000', pathname: '/', search: '', hash: '', href: 'http://localhost:3000/' },
    history: { pushState() {}, replaceState() {} },
    localStorage: { length: 0, key: () => null, getItem: () => null, setItem() {}, removeItem() {}, clear() {} },
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
    scrollTo() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    supabaseClient: null,
  };
  minSandbox.window = minSandbox;
  minSandbox.globalThis = minSandbox;
  const minCtx = vm.createContext(minSandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'dist', buildInfo.coreFile), 'utf8'), minCtx, { filename: buildInfo.coreFile });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'dist', buildInfo.appFile), 'utf8'), minCtx, { filename: buildInfo.appFile });
  vm.runInContext('logged = false; sess = null; authMode = "login"; render();', minCtx);
  assert.ok(minDoc.getElementById('pageTitle'), 'minified dist bundle renders login shell cleanly');
  assertDomSafeFromXss(minDoc, 'dist:minified-login');

  process.env.EDUCMIND_NO_LISTEN = '1';
  const { createApp } = await import('../server.js');
  const app = createApp({ rootDir: ROOT, serveSource: false });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const { port } = server.address();
    const requestRaw = (reqPath, headers = {}) => new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port,
        path: reqPath,
        method: 'GET',
        headers: { Connection: 'close', ...headers },
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      });
      req.on('error', reject);
      req.end();
    });

    // 1. HTML + CSP + security headers + Brotli
    const brRes = await requestRaw('/', { 'Accept-Encoding': 'br, gzip' });
    assert.equal(brRes.status, 200);
    assert.equal(brRes.headers['x-content-type-options'], 'nosniff');
    assert.equal(brRes.headers['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.ok(brRes.headers['permissions-policy']);
    assert.equal(brRes.headers['x-frame-options'], undefined, 'must not send X-Frame-Options that breaks AI Studio iframe');
    const csp = String(brRes.headers['content-security-policy'] || '');
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /script-src-attr 'none'/);
    assert.match(csp, /connect-src 'self' https:\/\/\*\.supabase\.co wss:\/\/\*\.supabase\.co/);
    assert.match(csp, /frame-ancestors 'self' https:\/\/aistudio\.google\.com/);
    assert.equal(brRes.headers['content-encoding'], 'br');
    assert.match(String(brRes.headers['vary'] || ''), /Accept-Encoding/i);
    assert.equal(zlib.brotliDecompressSync(brRes.body).toString('utf8'), distHtml);

    // 2. Minified hashed JS bundle + Gzip + immutable Cache-Control
    const gzRes = await requestRaw('/' + buildInfo.appFile, { 'Accept-Encoding': 'gzip' });
    assert.equal(gzRes.status, 200);
    assert.equal(gzRes.headers['content-encoding'], 'gzip');
    assert.match(String(gzRes.headers['cache-control'] || ''), /immutable/);
    const decompressedJs = zlib.gunzipSync(gzRes.body).toString('utf8');
    assert.ok(decompressedJs.includes('dbNetBannerHtml'));

    // 3. WebP image served with image/webp MIME
    const webpRes = await requestRaw('/assets/student-characters.webp');
    assert.equal(webpRes.status, 200);
    assert.match(String(webpRes.headers['content-type'] || ''), /image\/webp/i);
  } finally {
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('DOM & XSS interactive tests for Gemini AI Chatbot workspace, drawer, quiz card, and exam lock (14b-ai-chat.js)', async () => {
  const XSS_HTML = '<img src=x onerror=alert(5)><script>window.__xssChat=1</script>';
  const XSS_ATTR = '" onfocus="alert(5)" data-evil="1';
  const savedDraftCalls = [];

  const mockDb = {
    listChatThreads: async () => ({
      data: [
        { id: 'th-1', title: 'Giáo án ' + XSS_HTML, mode: 'lesson_plan', created_at: '2026-11-23T08:00:00Z', updated_at: '2026-11-23T08:10:00Z' },
      ],
      error: null,
    }),
    listChatMessages: async () => ({
      data: [
        { id: 'm-1', thread_id: 'th-1', sender: 'user', model: null, content: XSS_HTML, artifacts: {}, created_at: '2026-11-23T08:01:00Z' },
        {
          id: 'm-2',
          thread_id: 'th-1',
          sender: 'model',
          model: 'gemini-4-neon',
          content: '## Gợi ý bài giảng\n- **Trọng tâm**: ' + XSS_HTML + '\n```js\nalert("safe")\n```',
          artifacts: {
            quiz: [
              {
                kind: 'SINGLE_CHOICE',
                content: 'Câu hỏi ' + XSS_HTML,
                options: [XSS_HTML, 'Đáp án B ' + XSS_ATTR, 'Đáp án C', 'Đáp án D'],
                correct_index: 2,
                explanation: 'Giải thích ' + XSS_HTML,
                difficulty: 'MEDIUM',
                bloom_level: 'UNDERSTAND',
              },
            ],
          },
          created_at: '2026-11-23T08:01:10Z',
        },
      ],
      error: null,
    }),
    saveChatQuestionsToDrafts: async (lessonId, items) => {
      savedDraftCalls.push({ lessonId, items });
      return { data: 'req-chat-1', error: null };
    },
    deleteChatThread: async (id) => ({ data: [{ id }], error: null }),
  };

  const { document, evalExpr } = createDomTestContext({ EducMindDB: mockDb });

  // 1. Teacher workspace with adversarial payloads
  evalExpr(`
    logged = true;
    role = 'T';
    sess = { email: 'gv@edu.vn', role: 'T', t: Date.now(), backend: true, userId: 'teacher-1' };
    DB.me = { id: 'teacher-1', email: 'gv@edu.vn', full_name: 'Cô An', role: 'TEACHER' };
    DB.classes = [{ id: 'c1', name: '10A1', grade: 10 }];
    DB.classId = 'c1';
    DB.course = { id: 'course-1', class_id: 'c1', title: 'Tin học 10', student_ai_enabled: true };
    DB.page = 'chat';
    DB.arg = {};
    DB_CHAT.activeThreadId = 'th-1';
    DB_CHAT.focusLessonId = 'l1';
    DB_CHAT.focusLessonTitle = ${JSON.stringify('Bài 1 ' + XSS_HTML)};
  `);

  await evalExpr('(async () => { await DB_PAGES.chat.load(); DB.data = { ready: true, lessons: [{ id: "l1", title: "Bài 1" }] }; dbRender(); })()');
  assert.ok(document.getElementById('db-chat-workspace'), 'renders dedicated chat workspace');
  assert.ok(document.getElementById('nav-chat'), 'renders Trợ lý AI in sidebar');
  assert.ok(document.querySelector('.db-chat-code'), 'renders fenced code block');
  assert.ok(document.querySelector('.db-chat-quiz'), 'renders interactive quiz card');
  assertDomSafeFromXss(document, 'ai-chat:teacher-workspace');

  // 2. Teacher saves chat quiz questions into AI draft queue
  const saveDraftBtn = document.querySelector('[data-act="chatSaveQuizDrafts"]');
  assert.ok(saveDraftBtn);
  await evalExpr('DB_ACT.chatSaveQuizDrafts(document.querySelector("[data-act=\'chatSaveQuizDrafts\']"))');
  assert.equal(savedDraftCalls.length, 1);
  assert.equal(savedDraftCalls[0].lessonId, 'l1');
  assert.equal(savedDraftCalls[0].items[0].correct_answer, 2);
  assert.equal(evalExpr('DB_CHAT.quizSaved["m-2"]'), true);

  // 3. Pick wrong answer in interactive quiz card -> shows explanation and follow-up trigger
  document.querySelector('[data-act="chatQuizPick"][data-qi="0"][data-oi="0"]').click();
  assert.ok(document.querySelector('.db-chat-quiz-feedback.is-need'), 'shows remediation feedback for wrong choice');
  assert.ok(document.querySelector('[data-act="chatQuizExplainWrong"]'), 'shows follow-up prompt button');
  assertDomSafeFromXss(document, 'ai-chat:quiz-graded');

  // 4. Floating drawer opens from another page via topbar toggle & contextual lesson trigger
  evalExpr(`
    DB.page = 'content';
    DB.data = { topics: [], lessons: [{ id: 'l1', title: 'Bài 1' }], objectives: [], resources: [] };
    dbRender();
  `);
  await evalExpr('DB_ACT.toggleChatDrawer()');
  assert.equal(evalExpr('DB_CHAT.drawerOpen'), true);
  assert.equal(document.getElementById('db-chat-drawer-host').classList.contains('is-open'), true);
  assertDomSafeFromXss(document, 'ai-chat:floating-drawer');

  // 5. Student exam lock prevents drawer open
  evalExpr(`
    role = 'S';
    DB.me = { id: 'stu-1', email: 'hs@edu.vn', full_name: 'Minh', role: 'STUDENT' };
    DB.page = 'exam';
    DBX = { attempt: { id: 'att-1', status: 'IN_PROGRESS' }, assessment: { title: 'KT 15p' }, questions: [], answers: {}, state: {} };
    DB.data = { ready: true };
    dbRender();
  `);
  assert.equal(evalExpr('dbChatExamLocked()'), true);
  assert.equal(evalExpr('DB_CHAT.drawerOpen'), false);
  assert.ok(document.getElementById('db-chat-toggle').classList.contains('is-locked'));

  // 6. Logout resets DB_CHAT cleanly
  evalExpr('DBX = null; dbReset();');
  assert.equal(evalExpr('DB_CHAT.threads.length'), 0);
  assert.equal(evalExpr('DB_CHAT.activeThreadId'), '');
  assert.equal(evalExpr('DB_CHAT.drawerOpen'), false);
});
