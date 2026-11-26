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
    FirebaseRuntime: opts.FirebaseRuntime || null,
    firebaseAuth: opts.firebaseAuth || null,
    firebaseDb: opts.firebaseDb || null,
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
    'js/31-firebase-screens.js',
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
    'js/db/17-practice.js',
    'js/db/18-class-overview.js',
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

  // 1. Auth views with adversarial inputs across login, signup, reset, and onboarding
  for (const mode of ['login', 'signup', 'reset', 'onboarding']) {
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
  // Verify pre-role login -> signup -> reset mode navigation and password toggle
  evalExpr(`logged = false; sess = null; authMode = 'login'; authEmail = ''; authErr = ''; authMsg = ''; render();`);
  assert.ok(document.getElementById('login-email'), 'login renders #login-email');
  assert.ok(document.getElementById('login-pass'), 'login renders #login-pass');
  document.querySelector('[data-app-act="authTogglePassword"]').click();
  assert.equal(document.getElementById('login-pass').type, 'text', 'toggles password visibility to text');
  document.querySelector('[data-app-act="authGoSignup"]').click();
  assert.equal(evalExpr('authMode'), 'signup');
  assert.ok(document.getElementById('su-pass2'), 'signup renders confirm password');
  document.querySelector('[data-app-act="authGoLogin"]').click();
  assert.equal(evalExpr('authMode'), 'login');
  document.querySelector('[data-app-act="authGoReset"]').click();
  assert.equal(evalExpr('authMode'), 'reset');
  assert.ok(document.getElementById('reset-email'), 'reset renders #reset-email');

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

test('Delegated event wiring works without inline attributes', async () => {
  const { document, evalExpr } = createDomTestContext();

  evalExpr(`logged = false; sess = null; authMode = 'login'; render();`);
  const googleBtn = document.querySelector('[data-app-act="authGoogleLogin"]');
  assert.ok(googleBtn, 'login screen has delegated Google login button');

  const bgTrigger = document.querySelector('[data-app-act="toggleLoginBgPanel"]');
  assert.ok(bgTrigger, 'login screen has delegated background panel toggle');
  bgTrigger.click();
  assert.equal(evalExpr('authBgOpen'), true);

  evalExpr(`authMode = 'onboarding'; authEmail = 'gv@edu.vn'; render();`);
  assert.ok(document.querySelector('form[data-app-act="authCompleteOnboarding"]'), 'onboarding form rendered');
  evalExpr(`signupRoleChanged('TEACHER');`);
  assert.equal(document.getElementById('su-teacher-fields').hidden, false, 'teacher fields unhide on TEACHER role');

  const cancelBtn = document.querySelector('[data-app-act="authCancelOnboarding"]');
  assert.ok(cancelBtn);
  cancelBtn.click();
  await new Promise((r) => setTimeout(r, 10));
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

test('DOM & XSS interactive tests for Botanical Teal shell, user card, global search, bottom dock, work table, and theme switch', async () => {
  const XSS_HTML = '<img src=x onerror=alert(9)><script>window.__xssShell=1</script>';
  const { document, evalExpr } = createDomTestContext();

  // Default fallback theme is light when educmind.theme is unset
  assert.equal(evalExpr('applyTheme(); document.documentElement.dataset.theme'), 'light', 'defaults to light pastel theme');

  evalExpr(`
    logged = true;
    role = 'T';
    sess = { email: 'gv@edu.vn', role: 'T', t: Date.now(), backend: true, userId: 'teacher-1' };
    DB.me = { id: 'teacher-1', email: 'gv@edu.vn', full_name: ${JSON.stringify(XSS_HTML)}, role: 'TEACHER' };
    DB.classes = [{ id: 'c1', name: ${JSON.stringify('10A1 ' + XSS_HTML)}, grade: 10 }];
    DB.classId = 'c1';
    DB.course = { id: 'course-1', class_id: 'c1', title: 'Tin học' };
    DB.notifs = [{ id: 'n1', title: 'Mới', is_read: false }];
    DB.page = 'home';
    DB.data = {
      topics: [], lessons: [{ id: 'l1', title: ${JSON.stringify('Bài 1 ' + XSS_HTML)}, status: 'PUBLISHED' }],
      objectives: [],
      assignments: [{ id: 'a1', title: ${JSON.stringify('BT ' + XSS_HTML)}, status: 'PUBLISHED', due_at: '2026-12-01T10:00:00Z', max_score: 10 }],
      assessments: [{ id: 'e1', title: ${JSON.stringify('KT ' + XSS_HTML)}, status: 'PUBLISHED', duration_minutes: 20 }],
      submissions: [{ id: 's1', assignment_id: 'a1', student_id: 'stu-1', status: 'SUBMITTED' }],
      attempts: [], mastery: [], gaps: [], members: [{ student_id: 'stu-1' }], profiles: {}, invites: [], resources: [],
    };
    setTheme('light');
    dbRender();
  `);

  assertDomSafeFromXss(document, 'shell:botanical-xss');
  assert.ok(document.querySelector('.side-brand'), 'renders .side-brand');
  assert.equal(document.querySelector('.side-user-card'), null, 'removes redundant .side-user-card from sidebar');
  assert.equal(document.querySelector('#nav-home .nav-badge').textContent, '1', 'renders unread nav badge');
  assert.equal(document.getElementById('db-nav-filter'), null, 'removes redundant #db-nav-filter search input from sidebar');
  assert.ok(document.getElementById('db-global-search'), 'renders integrated #db-global-search in topbar');
  assert.ok(document.querySelectorAll('.nav-ic-tile').length >= 10, 'renders squircle .nav-ic-tile icons');
  assert.equal(document.querySelector('.side-theme-row'), null, 'does not duplicate theme toggle inside sidebar');
  assert.equal(document.querySelector('.side-profile-btn'), null, 'does not duplicate account button inside sidebar');
  const greeting = document.querySelector('.top .user-greeting');
  assert.ok(greeting && greeting.textContent.includes(XSS_HTML), 'escapes full_name safely inside .user-greeting');
  assert.ok(document.querySelector('.db-settings-menu [data-act="openThemeSettings"]'), 'renders theme settings menu item');

  // Settings gear menu groups Account, Theme toggle, and Wallpaper while keeping Logout button in topbar
  const settingsBtn = document.getElementById('db-settings-trigger');
  assert.ok(settingsBtn && document.querySelector('.side #db-settings-trigger'), 'renders gear settings button in sidebar');
  const logoutBtn = document.querySelector('.top [data-app-act="logout"]');
  assert.ok(logoutBtn, 'renders standalone logout button in topbar');
  const settingsMenu = document.getElementById('db-settings-menu');
  assert.ok(settingsMenu, 'renders settings dropdown menu');
  assert.equal(settingsMenu.hidden, true, 'settings menu is closed by default');
  settingsBtn.click();
  assert.equal(settingsMenu.hidden, false, 'clicking gear button opens settings menu');

  // Verify the 3 grouped items exist inside the gear settings menu
  const accountItem = settingsMenu.querySelector('[data-act="openAccountFromSettings"]');
  const themeItem = settingsMenu.querySelector('[data-act="openThemeSettings"]');
  const bgItem = settingsMenu.querySelector('[data-act="openBgSettings"]');
  assert.ok(accountItem, 'settings menu contains Account item');
  assert.ok(themeItem, 'settings menu contains Theme settings item');
  assert.ok(bgItem, 'settings menu contains Wallpaper change item');
  assert.equal(document.querySelector('.app-bg-controls'), null, 'removes standalone floating background button');

  // Test opening background dialog from settings menu
  bgItem.click();
  assert.ok(document.querySelector('.db-dialog'), 'clicking change background opens background dialog');
  {
    const ov = document.querySelector('.db-dialog.ov');
    const root = document.getElementById('db-dialog-root');
    assert.ok(ov && root && root.contains(ov), 'dialog overlay is portaled into #db-dialog-root');
    assert.equal(ov.closest('#main'), null, 'dialog overlay is outside #main so backdrop-filter cannot trap it');
    assert.equal(ov.closest('#app'), null, 'dialog overlay portals out of #app to cover the whole viewport');
  }
  assert.ok(document.getElementById('app-bg-url'), 'background dialog contains image URL input');
  assert.ok(document.getElementById('app-bg-file'), 'background dialog contains file upload input');
  evalExpr('dbCloseDialog();');

  // Open theme settings dialog from menu and pick dark mode
  settingsBtn.click();
  const freshThemeItem = document.querySelector('[data-act="openThemeSettings"]');
  freshThemeItem.click();
  assert.ok(document.querySelector('.db-dialog'), 'clicking theme settings opens theme dialog');
  const themeDarkBtn = document.querySelector('[data-act="setThemeDark"]');
  assert.ok(themeDarkBtn, 'theme dialog contains dark mode button');
  themeDarkBtn.click();
  assert.equal(document.documentElement.dataset.theme, 'dark');

  // Global search filters classes/assignments safely & picks target
  evalExpr(`(() => {
    const gs = document.getElementById('db-global-search');
    gs.value = '10A1';
    DB_ACT.globalSearch(gs);
  })()`);
  const gResults = document.getElementById('db-global-results');
  assert.equal(gResults.hidden, false, 'global search dropdown opens');
  assert.ok(gResults.querySelector('.db-global-item'), 'global search renders matching item');
  assertDomSafeFromXss(document, 'shell:global-search');

  // Floating bottom dock displays internal sub-functions of the active sidebar page + quick-create menu
  const dockWrap = document.querySelector('.db-dock-wrap');
  assert.ok(dockWrap, 'renders bottom dock wrapper');
  assert.equal(dockWrap.closest('#main'), null, 'bottom dock wrapper is mounted outside #main so backdrop-filter cannot trap fixed positioning');
  const dockEl = document.querySelector('.db-bottom-dock');
  assert.ok(dockEl, 'renders bottom dock');
  assert.equal(dockEl.querySelector('[data-act="go"]'), null, 'bottom dock does not duplicate top-level sidebar routes');
  assert.ok(dockEl.querySelector('.db-dock-item.is-active[data-sub="home-work"]'), 'highlights active sub-function inside home');
  assert.ok(dockEl.querySelector('.db-dock-item[data-sub="home-pending"]'), 'includes internal pending-grading filter inside home');
  const plusBtn = document.getElementById('db-dock-plus');
  assert.equal(plusBtn, null, 'removes floating + quick-create button from bottom dock');
  assert.equal(document.getElementById('db-quick-menu'), null, 'removes quick-create menu');
  assert.equal(document.querySelector('#main .head #classSelect'), null, 'removes class select from #main .head');
  // Giáo viên: ô chọn lớp nằm trong .top .user; thẻ lớp hiển thị tĩnh (không có select) để tránh đổi lớp nhầm.
  const topClassBadge = document.querySelector('.top .user .user-class-static');
  assert.ok(topClassBadge && topClassBadge.textContent.includes('10A1'), 'places class badge in .top .user role slot');
  assert.equal(document.querySelector('.top .user #classSelect'), null, 'teacher sees static class badge instead of a class selector');

  // Clicking bottom dock sub-function switches internal home filter without leaving sidebar page
  dockEl.querySelector('.db-dock-item[data-sub="home-pending"]').click();
  assert.equal(evalExpr('DB.page'), 'home', 'dock sub-action keeps active sidebar page');
  assert.equal(document.querySelector('.td-seg-tab[data-tab="PENDING"]').classList.contains('is-active'), true, 'dock sub-action updates work table tab');
  assert.equal(document.querySelector('.db-dock-item[data-sub="home-pending"]').classList.contains('is-active'), true, 'dock highlights selected sub-function');

  // Unified Activity & Work Table filter tabs and search
  assert.ok(document.getElementById('db-home-work-panel'), 'renders unified work table');
  const allTab = document.querySelector('.td-seg-tab[data-tab="ALL"]');
  assert.ok(allTab);
  allTab.click();
  assert.equal(allTab.classList.contains('is-active'), true, 'switches active work table tab back to ALL');
  assert.equal(document.querySelector('.db-dock-item[data-sub="home-work"]').classList.contains('is-active'), true, 'dock syncs back when in-page tab clicked');
  const pendingTab = document.querySelector('.td-seg-tab[data-tab="PENDING"]');
  pendingTab.click();
  assert.equal(pendingTab.classList.contains('is-active'), true, 'switches active work table tab');
  evalExpr(`(() => {
    const ts = document.getElementById('db-home-table-search');
    ts.value = 'BT';
    DB_ACT.homeFilterTable(ts);
  })()`);
  assert.ok(document.querySelectorAll('#db-home-work-tbody tr').length >= 1, 'table search filters rows');
  assertDomSafeFromXss(document, 'shell:work-table');

  // Switching sidebar page updates bottom dock to that page's internal sub-functions
  evalExpr(`DB.page = 'chat'; DB.arg = {}; DB.data = { topics: [], lessons: [], objectives: [], assignments: [], assessments: [], members: [], profiles: {} }; dbRender();`);
  assert.ok(document.querySelector('.db-dock-item.is-active[data-sub="chat-mode:tutor"]'), 'chat page dock shows chat modes');
  assert.equal(document.querySelector('.db-dock-item[data-sub="home-work"]'), null, 'chat dock removes previous page sub-functions');
  document.querySelector('.db-dock-item[data-sub="chat-mode:quiz"]').click();
  assert.equal(evalExpr('DB_CHAT.mode'), 'quiz', 'clicking dock mode item switches AI chat mode in-place');
  assert.equal(document.querySelector('.db-dock-item[data-sub="chat-mode:quiz"]').classList.contains('is-active'), true, 'highlights switched chat mode in dock');

  evalExpr(`DB.page = 'assessments'; DB.arg = { id: 'ex1', tab: 'preview' }; DB.data = { topics: [], lessons: [], objectives: [], assessments: [{ id: 'ex1', title: 'KT 15p', status: 'DRAFT', duration_minutes: 15, max_attempts: 1, open_at: new Date().toISOString(), close_at: new Date(Date.now() + 86400000).toISOString() }], aq: [], attempts: [], questions: [], members: [], profiles: {}, extra: [] }; dbRender();`);
  assert.ok(document.querySelector('.db-dock-item.is-active[data-sub="ex-preview"]'), 'assessment detail dock highlights active sub-tab');
  assert.ok(document.querySelector('.db-dock-item[data-sub="ex-attempts"]'), 'assessment detail dock exposes attempts sub-tab');

  // Restore home page before integrated top search checks
  evalExpr(`DB.page = 'home'; DB.arg = {}; DB.data = { topics: [], lessons: [], objectives: [], assignments: [{ id: 'a1', title: 'BT1', status: 'PUBLISHED', due_at: new Date().toISOString(), max_score: 10 }], assessments: [], submissions: [], attempts: [], mastery: [], gaps: [], members: [], profiles: {} }; dbRender();`);

  // Integrated top search supports accent-folded Vietnamese nav matching and picks target route
  evalExpr(`(() => {
    const gs = document.getElementById('db-global-search');
    gs.value = 'bao cao';
    DB_ACT.globalSearch(gs);
  })()`);
  const navMatch = document.querySelector('#db-global-results .db-global-item[data-page="report"]');
  assert.ok(navMatch && navMatch.dataset.kind === 'page', 'integrated top search matches accent-folded Vietnamese sidebar item');

  // Integrated top search also exposes settings actions (e.g. theme switch) and opens dialog on click
  evalExpr(`(() => {
    const gs = document.getElementById('db-global-search');
    gs.value = 'giao dien';
    DB_ACT.globalSearch(gs);
  })()`);
  const themeSearchMatch = document.querySelector('#db-global-results .db-global-item[data-target-act="openThemeSettings"]');
  assert.ok(themeSearchMatch, 'integrated top search matches settings actions');
  themeSearchMatch.click();
  assert.ok(document.querySelector('.db-dialog [data-act="setThemeDark"]'), 'clicking settings search match opens theme dialog');
  evalExpr(`dbCloseDialog(); DB.page = 'home'; DB.arg = {}; DB_UI.globalOpen = false; DB_UI.globalQuery = ''; dbRender();`);

  // Student view renders student internal dock sub-functions, quick-create & hides dock during exam
  evalExpr(`
    dbReset();
    role = 'S';
    sess = { email: 'hs@edu.vn', role: 'S', t: Date.now(), backend: true, userId: 'stu-1' };
    DB.me = { id: 'stu-1', email: 'hs@edu.vn', full_name: 'Minh', role: 'STUDENT' };
    DB.classes = [{ id: 'c1', name: '10A1', grade: 10 }];
    DB.classId = 'c1';
    DB.course = { id: 'course-1', class_id: 'c1', title: 'Tin học' };
    DB.page = 'home';
    DB.data = { topics: [], lessons: [], objectives: [], assignments: [], assessments: [], submissions: [], attempts: [], mastery: [], gaps: [], recs: [] };
    dbRender();
  `);
  assert.ok(document.getElementById('db-home-work-panel'), 'student home renders unified work table');
  assert.ok(document.querySelector('.db-dock-item[data-sub="home-todo"]'), 'student home dock shows internal todo filter');
  assert.equal(document.getElementById('db-dock-plus'), null, 'student bottom dock does not render + button');
  const stuClassSelect = document.querySelector('.top .user #classSelect');
  assert.ok(stuClassSelect, 'student topbar displays current class in role slot');
  // Lớp của học sinh do giáo viên phân công: đổi lớp bị chặn ở tầng hành động.
  assert.equal(evalExpr('(DB_ACT.setClass({ value: "c2" }), role)'), 'S');
  assert.equal(evalExpr('DB.classId'), 'c1', 'student cannot switch class (action is guarded)');
  evalExpr(`DB.page = 'exam'; DBX = { assessment: { id: 'ex1', title: 'KT' }, attempt: { id: 'att1', status: 'IN_PROGRESS' }, questions: [], answers: {}, state: {}, debounce: {} }; dbRender();`);
  assert.equal(document.querySelector('.db-bottom-dock'), null, 'bottom dock is hidden during active exam');
  evalExpr(`DB_PAGES.exam && dbExamStop(false);`);
});

test('Adaptive practice page (17-practice.js) exposes a floating dock and styled stats', async () => {
  const { document, evalExpr } = createDomTestContext();
  evalExpr(`
    logged = true;
    role = 'S';
    sess = { email: 'hs@edu.vn', role: 'S', t: Date.now(), backend: true, userId: 's1' };
    DB.me = { id: 's1', email: 'hs@edu.vn', full_name: 'An', role: 'STUDENT' };
    DB.classes = [{ id: 'c1', name: '10A1', grade: 10 }];
    DB.classId = 'c1';
    DB.course = { id: 'course-1', class_id: 'c1', title: 'Tin học' };
    DB.notifs = [];
    DB.page = 'practice';
    DB.arg = { objectiveId: 'o1' };
    DB_PRACTICE = { session: null, objectiveId: '', idx: 0, questions: [], answers: [], levelPath: [], cfg: {} };
    DB.loading = false;
    DB.loadError = '';
    DB.data = {
      objective: { id: 'o1', code: 'O1', description: 'Mục tiêu thử' },
      mastery: { mastery_score: 0.5 }, evidenceCount: 3, officialCount: 2,
      bankCount: 12, cfg: { practice_session_length: 8, practice_unlock_min_official: 1 },
      canStart: true,
    };
    dbRender();
  `);
  const dock = document.querySelector('.db-bottom-dock');
  assert.ok(dock, 'practice page renders the floating bottom dock');
  assert.equal(dock.dataset.context, 'practice');
  assert.ok(dock.querySelector('[data-sub="pr-start"]'), 'dock can jump to the start button');
  assert.equal(document.querySelectorAll('.db-practice-stats .db-stat').length, 3, 'renders three practice stats');
  assert.ok(document.querySelector('#db-practice-resources'), 'resources slot exists');
});

test('Every page except the exam screen offers floating dock sub-tabs', async () => {
  const { evalExpr } = createDomTestContext();
  const missing = evalExpr(`(() => {
    const out = [];
    const prev = DB.page;
    for (const p of Object.keys(DB_PAGES)) {
      if (p === 'exam') continue;
      DB.page = p;
      DB.arg = {};
      DB_UI.dockSub = '';
      if (!dbDockSubItems(true).length) out.push('GV:' + p);
      if (!dbDockSubItems(false).length) out.push('HS:' + p);
    }
    DB.page = prev;
    return out;
  })()`);
  assert.equal(missing.length, 0, 'mọi trang (trừ màn làm bài) đều có tab bar nổi: ' + missing.join(', '));
});

test('Sidebar brand uses the same EducMind logo as the login screen, and nav icons are unique', async () => {
  const { document, evalExpr } = createDomTestContext();
  evalExpr(`
    logged = true; role = 'T';
    sess = { email: 'gv@edu.vn', role: 'T', t: Date.now(), backend: true, userId: 't1' };
    DB.me = { id: 't1', email: 'gv@edu.vn', full_name: 'GV', role: 'TEACHER' };
    DB.classes = [{ id: 'c1', name: '10A1', grade: 10 }];
    DB.classId = 'c1'; DB.course = { id: 'course-1', class_id: 'c1', title: 'Tin học' };
    DB.notifs = []; DB.loading = false; DB.loadError = '';
    DB.page = 'home'; DB.arg = {}; DB.data = null;
    dbRender();
  `);

  // Logo thanh bên phải là cùng SVG với logo trên thanh trên (dùng chung BRAND_MARK_SVG).
  const sideMark = document.querySelector('.side-brand .logo-mark');
  const topMark = document.querySelector('.top .logo .logo-mark');
  assert.ok(sideMark, 'sidebar renders the brand mark');
  assert.ok(topMark, 'top bar renders the brand mark');
  assert.equal(sideMark.innerHTML.trim(), topMark.innerHTML.trim(), 'sidebar và thanh trên dùng chung một biểu tượng');
  assert.ok(sideMark.querySelector('svg path'), 'brand mark là SVG mở sách, không phải biểu tượng khác');
  // Không còn mũ tốt nghiệp trong khối thương hiệu thanh bên.
  assert.equal(evalExpr("String(document.querySelector('.side-brand').innerHTML).includes('M2 9l10-5 10 5-10 5z')"), false,
    'không dùng lại icon mũ tốt nghiệp cho logo');

  // Mỗi mục điều hướng một biểu tượng riêng.
  const labels = [...document.querySelectorAll('.side .nav')].map((b) => (b.getAttribute('aria-label') || '').trim());
  const tiles = [...document.querySelectorAll('.side .nav .nav-ic-tile')].map((t) => (t.innerHTML || '').trim());
  assert.equal(new Set(tiles).size, tiles.length, 'không có hai mục nào dùng cùng một biểu tượng');
  const quality = document.querySelector('.side .nav[data-page="class_overview"]');
  const classes = document.querySelector('.side .nav[data-page="classes"]');
  assert.ok(quality && classes, 'có cả mục Chất lượng lớp học và Lớp học phụ trách');
  assert.notEqual((quality.querySelector('.nav-ic-tile').innerHTML || '').trim(),
    (classes.querySelector('.nav-ic-tile').innerHTML || '').trim(), 'hai mục này không trùng biểu tượng');

  // Màn hình khoá (đăng nhập) dùng đúng biểu tượng đó.
  const loginMarkup = evalExpr('brandLogoHtml()');
  assert.ok(loginMarkup.includes(evalExpr('BRAND_MARK_SVG')), 'login logo dùng chung BRAND_MARK_SVG');
  assert.equal(tiles.length, labels.length, 'số biểu tượng khớp số mục điều hướng');
});

test('Trợ lý AI có đúng một lối vào trên thanh bên/thanh trên, không trùng lặp', async () => {
  const { document, evalExpr } = createDomTestContext();
  for (const role of ['T', 'S']) {
    evalExpr(`
      logged = true; role = '${role}';
      sess = { email: 'u@edu.vn', role: '${role}', t: Date.now(), backend: true, userId: 'u1' };
      DB.me = { id: 'u1', email: 'u@edu.vn', full_name: 'Người dùng', role: '${role === 'T' ? 'TEACHER' : 'STUDENT'}' };
      DB.classes = [{ id: 'c1', name: '10A1', grade: 10 }];
      DB.classId = 'c1'; DB.course = { id: 'course-1', class_id: 'c1', title: 'Tin học' };
      DB.notifs = []; DB.loading = false; DB.loadError = '';
      DB.page = 'home'; DB.arg = {};
      DB.data = null;
      dbRender();
    `);
    assert.equal(document.querySelector('.side [data-page="chat"]'), null, `${role}: thanh bên không còn mục Trợ lý AI`);
    assert.ok(document.getElementById('db-chat-toggle'), `${role}: nút Trợ lý AI trên thanh trên vẫn còn`);
    const navLabels = [...document.querySelectorAll('.side .nav')].map((b) => b.getAttribute('aria-label'));
    assert.equal(navLabels.filter((l) => l === 'Trợ lý AI').length, 0, `${role}: không có nhãn Trợ lý AI lặp trong thanh bên`);
  }

  // Trang chat đầy đủ vẫn mở được từ khung chat nổi và từ tìm kiếm
  const pages = evalExpr('Object.keys(DB_PAGES)');
  assert.ok(pages.includes('chat'), 'trang chat toàn màn hình vẫn tồn tại');
  const matches = evalExpr('dbGlobalSearchMatches("trợ lý ai")');
  assert.ok(matches.some((m) => m.title === 'Trợ lý AI' && m.kind === 'act'), 'tìm kiếm vẫn tìm được Trợ lý AI');
});

test('Sidebar collapse handle does not shift when a nav or dock button is pressed', async () => {
  const { document, evalExpr } = createDomTestContext();
  const src = fs.readFileSync(path.join(ROOT, 'js/09-render.js'), 'utf8');
  assert.ok(!src.includes('--tog-x'), 'collapse handle position is not written by JS');
  assert.ok(!/setProperty\('--tog-x'/.test(src), 'no runtime --tog-x writes');

  const css = fs.readdirSync(path.join(ROOT, 'css')).filter((f) => f.endsWith('.css'))
    .map((f) => fs.readFileSync(path.join(ROOT, 'css', f), 'utf8')).join('\n');
  const flat = css.replace(/\s+/g, ' ');
  assert.ok(flat.includes('left:calc(max(18px, 50vw - 702px) + 196px - 16px)'),
    'handle position derives from the sidebar formula in CSS');
  assert.ok(flat.includes('left:calc(max(18px, 50vw - 702px) + 74px - 16px)'),
    'collapsed sidebar keeps the handle on its right edge');
  assert.ok(!/left \.22s/.test(css), 'no left transition that animates the handle sideways');

  evalExpr(`
    logged = true; role = 'T';
    sess = { email: 'gv@edu.vn', role: 'T', t: Date.now(), backend: true, userId: 't1' };
    DB.me = { id: 't1', email: 'gv@edu.vn', full_name: 'GV', role: 'TEACHER' };
    DB.classes = [{ id: 'c1', name: '10A1', grade: 10 }];
    DB.classId = 'c1'; DB.course = { id: 'course-1', class_id: 'c1', title: 'Tin học' };
    DB.notifs = []; DB.loading = false; DB.loadError = '';
    DB.page = 'class_overview'; DB.arg = {};
    DB.data = null;
    dbRender();
  `);
  const before = String(document.querySelector('.side-toggle').getAttribute('style') || '');
  // Bấm một mục ở thanh bên trái rồi một nút trên tab bar nổi.
  evalExpr("DB_ACT.dockSubAction({ dataset: { sub: 'co-kpi' } })");
  evalExpr("dbGo('class_overview', {})");
  const after = String(document.querySelector('.side-toggle').getAttribute('style') || '');
  assert.ok(!/--tog-x|-?\d+px/.test(before), 'handle starts with no JS-positioned offset: ' + before);
  assert.equal(after.replace(/\s+/g, ' ').trim(), before.replace(/\s+/g, ' ').trim(), 'handle style unchanged after clicking nav/dock');
});

test('Class quality page uses Vietnamese labels (no Coverage Matrix / LEARN / PRACTICE / EXTEND in UI)', async () => {
  const { document, evalExpr } = createDomTestContext();
  evalExpr(`
    logged = true; role = 'T';
    sess = { email: 'gv@edu.vn', role: 'T', t: Date.now(), backend: true, userId: 'teacher-1' };
    DB.me = { id: 'teacher-1', email: 'gv@edu.vn', full_name: 'GV', role: 'TEACHER' };
    DB.classes = [{ id: 'c1', name: '10A1', grade: 10 }];
    DB.classId = 'c1';
    DB.course = { id: 'course-1', class_id: 'c1', title: 'Tin học' };
    DB.notifs = [];
    DB.loading = false; DB.loadError = '';
    DB.page = 'class_overview'; DB.arg = {};
    DB.data = {
      cfg: { dash_reteach_share: 0.4, dash_min_students: 5, dash_advanced_threshold: 0.8, dash_inactive_days: 14, dash_question_min_answers: 10 },
      members: [{ student_id: 's1' }], profilesById: { s1: { full_name: 'An' } },
      mastery: [], gaps: [], evidence: [], practiceSessions: [], questions: [],
      content: { objectives: [{ id: 'o1', code: 'O1', description: 'Mục tiêu một' }], topics: [], lessons: [] },
      reteach: [], groups: { SUPPORT: [], ON_TRACK: [], ADVANCED: [], INACTIVE: [] }, questionStats: [],
      linkCountByObj: { o1: { LEARN: 1, PRACTICE: 1, EXTEND: 0 } }, qCountByObj: { o1: 3 },
    };
    dbRender();
  `);

  assert.equal(evalExpr("DB_PAGES.class_overview.title"), 'Chất lượng lớp học', 'nav title uses a descriptive Vietnamese name');

  const view = document.getElementById('main').textContent;
  ['Coverage Matrix', 'LEARN', 'PRACTICE', 'EXTEND'].forEach((en) => {
    assert.ok(!new RegExp('\\b' + en + '\\b').test(view), `no English label "${en}" rendered`);
  });
  ['Chất lượng lớp', 'Bảng độ phủ tài liệu theo mục tiêu', 'Học kiến thức mới', 'Luyện tập', 'Mở rộng'].forEach((vi) => {
    assert.ok(view.includes(vi), `Vietnamese label present: ${vi}`);
  });
  // Nhãn dock dùng tiếng Việt đầy đủ, không viết tắt kiểu "HS" hay "KPI"
  const dockLabels = [...document.querySelectorAll('.db-bottom-dock .db-dock-item')].map((b) => b.getAttribute('aria-label') || '');
  assert.equal(dockLabels.length, 5, 'dock keeps five sub-tabs');
  dockLabels.forEach((label) => {
    assert.ok(label.trim().length > 2, `dock label not empty: ${label}`);
    assert.ok(!/(^|\s)(HS|KPI|GV)(\s|$)/.test(label), `dock label avoids abbreviations: ${label}`);
  });
});

test('Assignment targeting dialog and class-quality groups use Vietnamese labels', async () => {
  const { document, evalExpr } = createDomTestContext();
  evalExpr(`
    logged = true; role = 'T';
    sess = { email: 'gv@edu.vn', role: 'T', t: Date.now(), backend: true, userId: 'teacher-1' };
    DB.me = { id: 'teacher-1', email: 'gv@edu.vn', full_name: 'GV', role: 'TEACHER' };
    DB.classes = [{ id: 'c1', name: '10A1', grade: 10 }];
    DB.classId = 'c1';
    DB.course = { id: 'course-1', class_id: 'c1', title: 'Tin học' };
    DB.notifs = [];
    DB.loading = false; DB.loadError = '';
    DB.page = 'assignments'; DB.arg = {};
    EducMindDB.getClassOverview = async () => ({ data: { groups: { SUPPORT: [1, 2], ON_TRACK: [3], ADVANCED: [], INACTIVE: [4] } }, error: null });
  `);

  assert.equal(evalExpr('DB_GROUP_LABEL.SUPPORT'), 'Cần củng cố', 'group labels are Vietnamese');
  assert.equal(evalExpr('dbPurposeLabel("EXTEND")'), 'Mở rộng', 'resource purpose labels are Vietnamese');
  assert.ok(evalExpr('DB_PURPOSE_ORDER.length') === 3);

  // Hộp thoại giao bài theo nhóm: nhãn nhóm + câu chữ đều tiếng Việt
  return evalExpr('DB_ACT.openAssignmentTargeting({ dataset: { id: "a1" } })').then(() => {
    // Chỉ kiểm tra chữ HIỂN THỊ; giá trị kỹ thuật (value="SUPPORT") vẫn được phép nằm trong DOM.
    const text = (document.body.textContent || '') + [...document.querySelectorAll('.db-dialog option')].map((o) => o.textContent || '').join(' ');
    ['SUPPORT', 'ON_TRACK', 'ADVANCED', 'INACTIVE', 'Targeting'].forEach((en) => {
      assert.ok(!text.includes(en), `no English token "${en}" in targeting dialog`);
    });
    assert.ok(text.includes('Cần củng cố'), 'dialog lists Vietnamese group names');
  });
});

test('Class overview dashboard (18-class-overview.js) has dock sub-tabs and styled KPI cards', async () => {
  const { document, evalExpr } = createDomTestContext();
  evalExpr(`
    logged = true;
    role = 'T';
    sess = { email: 'gv@edu.vn', role: 'T', t: Date.now(), backend: true, userId: 'teacher-1' };
    DB.me = { id: 'teacher-1', email: 'gv@edu.vn', full_name: 'GV', role: 'TEACHER' };
    DB.classes = [{ id: 'c1', name: '10A1', grade: 10 }];
    DB.classId = 'c1';
    DB.course = { id: 'course-1', class_id: 'c1', title: 'Tin học' };
    DB.notifs = [];
    DB.page = 'class_overview';
    DB.arg = {};
    DB.loading = false;
    DB.loadError = '';
    DB.data = {
      cfg: { dash_reteach_share: 0.4, dash_min_students: 5, dash_advanced_threshold: 0.8, dash_inactive_days: 14, dash_question_min_answers: 10 },
      members: [{ student_id: 's1' }], profilesById: { s1: { full_name: 'An' } },
      mastery: [], gaps: [], evidence: [], practiceSessions: [], questions: [],
      content: { objectives: [], topics: [], lessons: [] },
      reteach: [], groups: { SUPPORT: [], ON_TRACK: [], ADVANCED: [], INACTIVE: [] }, questionStats: [],
      linkCountByObj: {}, qCountByObj: {},
    };
    dbRender();
  `);

  // Có tab bar nổi như mọi phân hệ khác
  const dock = document.querySelector('.db-bottom-dock');
  assert.ok(dock, 'class overview renders the floating bottom dock');
  assert.equal(dock.dataset.context, 'class_overview', 'dock is scoped to the class overview page');
  assert.ok(dock.querySelector('[data-sub="co-kpi"]'), 'dock has quick-metrics item');
  assert.ok(dock.querySelector('[data-sub="co-groups"]'), 'dock has student-group item');
  assert.equal(dock.querySelectorAll('.db-dock-item').length, 5, 'dock is compact like other feature pages');
  assert.ok(document.getElementById('db-co-kpi') && document.getElementById('db-co-groups'), 'dock targets exist on the page');

  // Nhãn chỉ số nằm trong phần tử riêng, không dính vào số

  const kpis = [...document.querySelectorAll('.db-overview-grid .db-kpi')];
  assert.equal(kpis.length, 4, 'renders four KPI cards');
  kpis.forEach((kpi) => {
    assert.ok(kpi.querySelector('b'), 'KPI has a value');
    assert.ok(kpi.querySelector('.db-kpi-label'), 'KPI label is wrapped in its own element');
    assert.ok(kpi.querySelector('.db-kpi-meta'), 'KPI hint is wrapped in its own element');
    assert.equal(kpi.querySelector('span:not([class])'), null, 'no bare span label that could collide with the value');
  });

  // Mỗi lớp CSS dùng ở trang này phải tồn tại trong bundle CSS
  const css = fs.readdirSync(path.join(ROOT, 'css'))
    .filter((f) => f.endsWith('.css'))
    .map((f) => fs.readFileSync(path.join(ROOT, 'css', f), 'utf8'))
    .join('\n');
  ['.db-overview-grid', '.db-kpi', '.db-kpi-label', '.db-kpi-meta', '.db-settings-grid', '.db-co-tabs'].forEach((sel) => {
    assert.ok(css.includes(sel + '{') || css.includes(sel + ' '), `CSS defines ${sel}`);
  });

  // Cài đặt ngưỡng đọc được bằng data-field (saveDashSettings)
  ['dash_reteach_share', 'dash_min_students', 'dash_advanced_threshold', 'dash_inactive_days'].forEach((k) => {
    assert.ok(document.querySelector(`#db-co-settings [data-field="${k}"]`), `settings input exposes ${k}`);
  });
  assert.ok(document.querySelector('#db-co-settings [data-act="saveDashSettings"]'), 'settings panel can save');
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
  assert.equal(distScripts.length, 4, 'dist/index.html loads firebase, core bundle, env override, app bundle');
  assert.equal(distScripts[0], buildInfo.firebaseFile, 'dist/index.html loads content-hashed Firebase SDK bundle');
  const fbCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase-applet-config.json'), 'utf8'));
  const fbDistJs = fs.readFileSync(path.join(ROOT, 'dist', buildInfo.firebaseFile), 'utf8');
  assert.ok(fbDistJs.includes(`projectId:${JSON.stringify(fbCfg.projectId)}`), 'hashed Firebase bundle matches firebase-applet-config.json');
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
    FirebaseRuntime: null, firebaseAuth: null, firebaseDb: null,
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
    assert.match(csp, /script-src [^;]*https:\/\/apis\.google\.com/);
    assert.match(csp, /script-src [^;]*https:\/\/www\.gstatic\.com/);
    assert.match(csp, /script-src-attr 'none'/);
    assert.match(csp, /connect-src 'self' https:\/\/\*\.googleapis\.com https:\/\/apis\.google\.com https:\/\/identitytoolkit\.googleapis\.com/);
    assert.match(csp, /frame-src [^;]*https:\/\/\*\.firebaseapp\.com/);
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

    // 4. Express server API endpoints: server-now + auth-protected AI routes
    const nowRes = await requestRaw('/api/server-now');
    assert.equal(nowRes.status, 200);
    const nowJson = JSON.parse(nowRes.body.toString('utf8'));
    assert.ok(!Number.isNaN(Date.parse(nowJson.now)), '/api/server-now returns valid ISO timestamp');

    const postJson = (reqPath, body) => new Promise((resolve, reject) => {
      const payload = JSON.stringify(body);
      const req = http.request({
        host: '127.0.0.1',
        port,
        path: reqPath,
        method: 'POST',
        headers: { Connection: 'close', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('error', reject);
      req.end(payload);
    });

    const genUnauth = await postJson('/api/ai/generate', { quantity: 1 });
    assert.equal(genUnauth.status, 401, '/api/ai/generate rejects unauthenticated calls');
    const chatUnauth = await postJson('/api/ai/chat', { message: 'hello' });
    assert.equal(chatUnauth.status, 401, '/api/ai/chat rejects unauthenticated calls');
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
  assert.equal(document.getElementById('nav-chat'), null, 'Trợ lý AI không còn mục riêng ở thanh bên');
  assert.ok(document.getElementById('db-chat-toggle'), 'vẫn còn nút Trợ lý AI trên thanh trên');
  assert.ok(document.querySelector('.db-chat-code'), 'renders fenced code block');
  assert.ok(document.querySelector('.db-chat-code-head .db-chat-code-dots'), 'renders macOS window header inside code block');
  assert.ok(document.querySelector('.db-chat-quiz'), 'renders interactive quiz card');
  assert.equal(document.querySelector('#db-chat-workspace .db-chat-mode-row'), null, 'omits redundant mode row in dedicated chat workspace');
  assert.equal(document.querySelector('#db-chat-workspace .db-chat-stage-head [data-act="chatNewThread"]'), null, 'omits duplicate new-thread button in stage head');
  assertDomSafeFromXss(document, 'ai-chat:teacher-workspace');

  // 1b. Collapsing & expanding the chat threads sidebar
  const ws = document.getElementById('db-chat-workspace');
  const toggleSidebarBtn = document.querySelector('[data-act="chatToggleSidebar"]');
  assert.ok(toggleSidebarBtn, 'renders collapse button for chat sidebar');
  assert.equal(ws.classList.contains('is-sidebar-collapsed'), false);
  toggleSidebarBtn.click();
  assert.equal(evalExpr('DB_CHAT.sidebarCollapsed'), true);
  assert.equal(document.getElementById('db-chat-workspace').classList.contains('is-sidebar-collapsed'), true);
  assert.equal(document.querySelector('.db-chat-sidebar').classList.contains('is-collapsed'), true);
  assert.equal(document.querySelector('[data-act="chatToggleSidebar"]').getAttribute('aria-expanded'), 'false');
  assert.equal(document.querySelector('.db-chat-rail-history'), null);
  document.querySelector('[data-act="chatToggleSidebar"]').click();
  assert.equal(evalExpr('DB_CHAT.sidebarCollapsed'), false);
  assert.equal(document.getElementById('db-chat-workspace').classList.contains('is-sidebar-collapsed'), false);

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
  assert.equal(evalExpr('DB_CHAT.sidebarCollapsed'), false);
});
