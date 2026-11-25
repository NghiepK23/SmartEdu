/* EducMind · js/db/17-practice.js
   Luyện tập thích ứng theo độ khó (Adaptive Practice) — thuật toán bậc thang, chấm bảo mật ở máy chủ Express. */

const PRACTICE_LEVEL_LABEL = { EASY: 'Cơ bản', MEDIUM: 'Vừa sức', HARD: 'Nâng cao' };
const PRACTICE_LEVEL_CLASS = { EASY: 'plain', MEDIUM: 'prog', HARD: 'good' };

let DB_PRACTICE = {
  session: null,
  objectiveId: '',
  questions: [],
  idx: 0,
  answers: [],
  levelPath: [],
  loading: false,
};

async function dbPracticeLoad() {
  const objectiveId = DB.arg.objectiveId || DB.arg.id || '';
  if (!objectiveId) return { error: 'Thiếu mục tiêu luyện tập.' };
  const content = await dbLoadContent();
  const objective = content.objectives.find((o) => o.id === objectiveId);
  if (!objective) return { error: 'Không tìm thấy mục tiêu.' };
  const cfg = EducMindDB.getCoursePracticeConfig ? EducMindDB.getCoursePracticeConfig(DB.course.id) : { practice_session_length: 8 };
  const questions = await dbCall(EducMindDB.gameQuestions ? EducMindDB.gameQuestions(DB.course.id) : Promise.resolve({ data: [], error: null })).catch(() => []);
  const qFiltered = (questions || []).filter((q) => (q.objective_ids || []).includes(objectiveId));
  const bankCount = qFiltered.length;
  // Check daily limit info via server config
  let mastery = null;
  try {
    const m = await dbCall(EducMindDB.listMastery([objectiveId]));
    mastery = m.find((x) => x.objective_id === objectiveId) || null;
  } catch (_) {}
  let evidence = [];
  try { evidence = await dbCall(EducMindDB.listEvidence([objectiveId])); } catch (_) {}
  const officialCount = evidence.filter((e) => e.source_type !== 'PRACTICE').length;
  const canStart = officialCount >= (cfg.practice_unlock_min_official ?? 1);
  return { objective, cfg, bankCount, mastery, evidenceCount: evidence.length, officialCount, canStart, courseId: DB.course.id, classId: DB.classId };
}

DB_PAGES.practice = {
  title: 'Luyện tập thích ứng',
  sub: 'Phiên 8 câu hỏi thích ứng độ khó — tăng/giảm theo kết quả của em.',
  noClass: false,
  async load() {
    // If we have an active session in progress, stay there
    if (DB_PRACTICE.session && DB_PRACTICE.session.status === 'ACTIVE') {
      return { ...await dbPracticeLoad(), sessionInProgress: DB_PRACTICE.session, practiceState: { ...DB_PRACTICE } };
    }
    return dbPracticeLoad();
  },
  view(d) {
    if (d.error) return `<section class="panel"><p class="muted">${h(d.error)}</p>${dbBtn('Về mục tiêu', 'go', { page: 'progress' }, 'light')}</section>`;
    // Active practice workspace
    if (DB_PRACTICE.session && DB_PRACTICE.session.status === 'ACTIVE' && DB_PRACTICE.questions.length) {
      return dbPracticeWorkspace(d);
    }
    if (d.sessionInProgress && d.sessionInProgress.status === 'ACTIVE') {
      return dbPracticeWorkspace(d);
    }
    const pctVal = d.mastery ? Math.round((d.mastery.mastery_score || 0) * 100) : 0;
    return `<section class="panel">
      <nav class="folder-crumb"><button type="button" data-act="go" data-page="progress">Mức nắm vững</button><span aria-hidden="true">›</span><b>Luyện tập: ${h(d.objective.code)} · ${h(d.objective.description)}</b></nav>
      <div class="row between"><div><h2>${h(d.objective.code)} · ${h(d.objective.description)}</h2><p class="lead">Mức nắm vững hiện tại: ${dbMasteryPill(d.mastery ? d.mastery.mastery_score : null)} · ${d.evidenceCount} bằng chứng (${d.officialCount} chính thức)</p></div>
        <span class="pill ${d.canStart ? 'good' : 'need'}">${d.canStart ? 'Đủ điều kiện luyện tập' : 'Cần thêm bằng chứng chính thức'}</span>
      </div>
      <div class="db-practice-intro">
        <div class="db-practice-stats">
          <div class="db-stat"><b>${d.bankCount}</b><span>câu hỏi sẵn sàng</span></div>
          <div class="db-stat"><b>${d.cfg.practice_session_length ?? 8}</b><span>câu / phiên</span></div>
          <div class="db-stat"><b>${pctVal}%</b><span>nắm vững</span></div>
        </div>
        ${!d.canStart ? `<div class="notice">Cần ít nhất ${d.cfg.practice_unlock_min_official} kết quả chính thức (bài tập/kiểm tra) trước khi luyện tập thích ứng. Hãy hoàn thành bài tập gắn với mục tiêu này.</div>` : ''}
        <div class="row">
          ${d.canStart ? dbBtn(ic('play', 16) + ' Bắt đầu luyện tập thích ứng (8 câu)', 'practiceStart', { objective: d.objective.id }, '') : dbBtn('Chưa đủ điều kiện', 'practiceStart', { objective: d.objective.id }, 'light') }
          ${dbBtn('Xem tài liệu gợi ý', 'practiceShowResources', { objective: d.objective.id }, 'light')}
        </div>
        <p class="muted">Thuật toán bậc thang: trả lời đúng 2 câu liên tiếp → tăng độ khó, trả lời sai → giảm độ khó. Tối đa 3 phiên tính điểm mỗi ngày; phiên thừa vẫn luyện nhưng không cộng điểm.</p>
        <div id="db-practice-resources" class="db-practice-resources"></div>
      </div>
    </section>
    <section class="panel">
      <h3>Lịch sử luyện tập gần đây</h3>
      <div class="muted">Biểu đồ tiến bộ sẽ hiện sau vài phiên luyện tập.</div>
    </section>`;
  },
};

function dbPracticeWorkspace(d) {
  const s = DB_PRACTICE.session;
  const total = s ? s.target_count : (d.cfg.practice_session_length || 8);
  const idx = DB_PRACTICE.idx;
  const q = DB_PRACTICE.questions[idx];
  const level = s ? s.current_level : 'MEDIUM';
  const progressPct = Math.round((idx / total) * 100);
  if (!q) {
    return `<section class="panel db-practice-workspace"><h2>Đang chuẩn bị câu hỏi…</h2><p class="muted">Vui lòng chờ trong giây lát.</p></section>`;
  }
  const opts = q.options;
  let answerUI = '';
  if (q.kind === 'SINGLE_CHOICE' || q.kind === 'MULTIPLE_CHOICE') {
    const type = q.kind === 'SINGLE_CHOICE' ? 'radio' : 'checkbox';
    const list = Array.isArray(opts) ? opts : [];
    answerUI = `<div class="db-answers">${list.map((o, i) => `<label class="objrow"><input type="${type}" name="practice_answer" value="${i}"><span class="db-assignment-choice-letter">${dbLetter(i)}</span><span>${h(o)}</span></label>`).join('')}</div>`;
  } else if (q.kind === 'TRUE_FALSE') {
    answerUI = `<div class="db-answers"><label class="objrow"><input type="radio" name="practice_answer" value="true"><span>Đúng</span></label><label class="objrow"><input type="radio" name="practice_answer" value="false"><span>Sai</span></label></div>`;
  } else if (q.kind === 'FILL_IN_BLANK') {
    const blanks = (q.content.match(/_{3,}/g) || []).length || 1;
    answerUI = Array.from({ length: blanks }, (_, i) => `<div class="field"><label>Chỗ trống ${i + 1}</label><input type="text" name="practice_answer_${i}" placeholder="Nhập đáp án"></div>`).join('');
  } else if (q.kind === 'MATCHING') {
    const left = (opts && opts.left) || [];
    const right = (opts && opts.right) || [];
    answerUI = `<div class="db-matching">${left.map((l, i) => `<div class="field"><label>${h(l)}</label><select name="practice_match_${i}"><option value="">— Chọn —</option>${right.map((r, j) => `<option value="${j}">${h(r)}</option>`).join('')}</select></div>`).join('')}</div>`;
  } else {
    answerUI = `<div class="muted">Dạng câu hỏi này chưa hỗ trợ luyện tập thích ứng.</div>`;
  }
  return `<section class="panel db-practice-workspace" aria-labelledby="db-practice-h">
    <div class="db-practice-head">
      <div class="row between"><h2 id="db-practice-h">Luyện tập: ${h(d.objective.code)}</h2><span class="pill ${PRACTICE_LEVEL_CLASS[level] || 'plain'}">${PRACTICE_LEVEL_LABEL[level] || level}</span></div>
      <div class="db-practice-progress"><div class="db-practice-bar"><span style="width:${progressPct}%"></span></div><small>Câu ${idx + 1}/${total}</small></div>
    </div>
    <div class="db-practice-question">
      <div class="db-prose"><b>Câu ${idx + 1}:</b> ${h(q.content)}</div>
      <form data-act="practiceSubmit" class="db-practice-form" novalidate>
        ${answerUI}
        <div class="row">${dbBtn('Trả lời', 'practiceSubmit', {}, '')}${dbBtn('Bỏ qua phiên', 'practiceAbandon', {}, 'light')}</div>
        ${dbFormError()}
      </form>
      <div id="db-practice-feedback" class="db-practice-feedback"></div>
    </div>
    <div class="db-practice-trail">${DB_PRACTICE.levelPath.map((lv, i) => `<span class="pill ${PRACTICE_LEVEL_CLASS[lv] || 'plain'}" title="Câu ${i + 1}">${lv}</span>`).join(' → ') || '<span class="muted">Lộ trình cấp độ sẽ hiện ở đây.</span>'}</div>
  </section>`;
}

function dbPracticeReadAnswer(q) {
  if (!q) return null;
  if (q.kind === 'SINGLE_CHOICE') {
    const el = document.querySelector('input[name="practice_answer"]:checked');
    return el ? Number(el.value) : null;
  }
  if (q.kind === 'MULTIPLE_CHOICE') {
    const els = [...document.querySelectorAll('input[name="practice_answer"]:checked')];
    return els.length ? els.map((e) => Number(e.value)) : null;
  }
  if (q.kind === 'TRUE_FALSE') {
    const el = document.querySelector('input[name="practice_answer"]:checked');
    return el ? (el.value === 'true') : null;
  }
  if (q.kind === 'FILL_IN_BLANK') {
    const blanks = (q.content.match(/_{3,}/g) || []).length || 1;
    const arr = [];
    for (let i = 0; i < blanks; i++) {
      const el = document.querySelector(`input[name="practice_answer_${i}"]`);
      arr.push(el ? el.value.trim() : '');
    }
    return arr;
  }
  if (q.kind === 'MATCHING') {
    const left = (q.options && q.options.left) || [];
    return left.map((_, i) => {
      const el = document.querySelector(`select[name="practice_match_${i}"]`);
      return el && el.value !== '' ? Number(el.value) : null;
    });
  }
  return null;
}

DB_ACT.practiceStart = (el) => dbRun(el, async () => {
  const objectiveId = el.dataset.objective || DB_PRACTICE.objectiveId || DB.arg.objectiveId;
  if (!objectiveId) throw new Error('Thiếu mục tiêu luyện tập.');
  const courseId = DB.course ? DB.course.id : '';
  const classId = DB.classId || '';
  DB_PRACTICE.objectiveId = objectiveId;
  // Fetch questions for this objective
  const allQs = await dbCall(EducMindDB.gameQuestions(courseId)).catch(() => []);
  const pool = (allQs || []).filter((q) => (q.objective_ids || []).includes(objectiveId));
  if (pool.length < 4) throw new Error('Ngân hàng câu hỏi chưa đủ (cần ít nhất 4 câu cho mục tiêu này).');
  // Determine start level via mastery
  let startLevel = 'MEDIUM';
  try {
    const m = await dbCall(EducMindDB.listMastery([objectiveId]));
    const mastery = m.find((x) => x.objective_id === objectiveId);
    if (mastery) {
      const score = Number(mastery.mastery_score || 0);
      if (score >= 0.75) startLevel = 'HARD';
      else if (score <= 0.4) startLevel = 'EASY';
    }
  } catch (_) {}
  const res = await dbCall(EducMindDB.practiceStart(objectiveId, courseId, classId));
  // Server returns session; fallback to local if API fails and we are in demo
  let session = res && res.session ? res.session : res;
  if (!session || !session.id) {
    // Fallback: create local session
    session = {
      id: 'local_' + Date.now(),
      objective_id: objectiveId,
      course_id: courseId,
      class_id: classId,
      status: 'ACTIVE',
      start_level: startLevel,
      current_level: startLevel,
      consecutive_correct: 0,
      target_count: 8,
      answered_count: 0,
      weighted_score: 0,
    };
  } else {
    session.start_level = startLevel;
    session.current_level = startLevel;
  }
  DB_PRACTICE.session = session;
  DB_PRACTICE.idx = 0;
  DB_PRACTICE.answers = [];
  DB_PRACTICE.levelPath = [startLevel];
  // Build question queue staircase-aware: pre-select by difficulty buckets
  const byLevel = { EASY: pool.filter((q) => q.difficulty === 'EASY'), MEDIUM: pool.filter((q) => q.difficulty === 'MEDIUM'), HARD: pool.filter((q) => q.difficulty === 'HARD') };
  // Ensure each bucket has fallback to pool
  for (const lv of ['EASY', 'MEDIUM', 'HARD']) if (!byLevel[lv].length) byLevel[lv] = pool;
  const used = new Set();
  const pickForLevel = (lv) => {
    const bucket = byLevel[lv] || pool;
    const avail = bucket.filter((q) => !used.has(q.id));
    const pickPool = avail.length ? avail : pool.filter((q) => !used.has(q.id));
    if (!pickPool.length) return pool[Math.floor(Math.random() * pool.length)];
    const pick = pickPool[Math.floor(Math.random() * pickPool.length)];
    used.add(pick.id);
    return pick;
  };
  // First question
  DB_PRACTICE.questions = [];
  for (let i = 0; i < session.target_count; i++) {
    // We will lazily pick on demand based on current level, but prefill with MEDIUM
    DB_PRACTICE.questions.push(pickForLevel(i === 0 ? startLevel : 'MEDIUM'));
  }
  // Replace first with correct level
  DB_PRACTICE.questions[0] = pickForLevel(startLevel);
  await dbGo('practice', { objectiveId }, { history: 'replace' });
});

DB_ACT.practiceSubmit = (form) => dbRun(form, async () => {
  const q = DB_PRACTICE.questions[DB_PRACTICE.idx];
  if (!q) throw new Error('Không có câu hỏi.');
  const ans = dbPracticeReadAnswer(q);
  if (ans == null || (Array.isArray(ans) && ans.some((v) => v == null || v === ''))) throw new Error('Hãy nhập đáp án trước khi nộp.');
  // Grade via server
  let result = null;
  try {
    result = await dbCall(EducMindDB.practiceSubmitAnswer(DB_PRACTICE.session.id, q, ans));
  } catch (e) {
    // Fallback local grading
    const local = (() => {
      const key = q.correct_answer;
      if (q.kind === 'SINGLE_CHOICE') return Number(ans) === Number(key) ? 1 : 0;
      if (q.kind === 'TRUE_FALSE') return (ans === true) === (key === true || String(key).toLowerCase() === 'true') ? 1 : 0;
      if (q.kind === 'MULTIPLE_CHOICE') {
        const kSet = new Set([].concat(key).map(Number)), aSet = new Set([].concat(ans).map(Number));
        return kSet.size === aSet.size && [...kSet].every((x) => aSet.has(x)) ? 1 : 0;
      }
      return 0;
    })();
    result = { is_correct: !!local, score: local, correct_answer: q.correct_answer, explain: q.explain || '', next_level: DB_PRACTICE.session.current_level, completed: DB_PRACTICE.idx + 1 >= DB_PRACTICE.session.target_count };
  }
  const fb = document.getElementById('db-practice-feedback');
  if (fb) {
    fb.innerHTML = `<div class="notice ${result.is_correct ? 'good' : 'need'}">${result.is_correct ? ic('check', 16) + ' Chính xác!' : ic('alert', 16) + ' Chưa đúng.'} ${h(result.explain || '')} ${result.correct_answer != null ? `<div class="muted">Đáp án đúng: ${h(String(result.correct_answer))}</div>` : ''}</div>`;
  }
  // Update session tracking
  DB_PRACTICE.session.current_level = result.next_level || DB_PRACTICE.session.current_level;
  DB_PRACTICE.levelPath.push(DB_PRACTICE.session.current_level);
  DB_PRACTICE.answers.push({ question_id: q.id, is_correct: result.is_correct, score: result.score });
  // If completed
  if (result.completed || DB_PRACTICE.idx + 1 >= DB_PRACTICE.session.target_count) {
    setTimeout(async () => {
      try {
        const fin = await dbCall(EducMindDB.practiceFinish(DB_PRACTICE.session.id, DB_PRACTICE.session.objective_id));
        DB_PRACTICE.session.status = 'COMPLETED';
        const rate = Math.round((fin.rate || 0) * 100);
        const masteryPct = Math.round((fin.mastery_score || 0) * 100);
        dbOpenDialog({
          title: 'Hoàn thành phiên luyện tập!',
          body: `<div class="db-practice-summary"><div class="db-stat">Đúng ${fin.correct || 0}/${fin.total || 8} (${rate}%)</div><div class="db-stat">Mức nắm vững mới: ${masteryPct}%</div><p class="muted">${h(fin.message || '')}</p><div class="db-practice-trail">${DB_PRACTICE.levelPath.map((lv) => `<span class="pill">${lv}</span>`).join(' → ')}</div></div>`,
          okLabel: 'Về trang tiến độ',
          onOk: async () => { DB_PRACTICE = { session: null, objectiveId: '', questions: [], idx: 0, answers: [], levelPath: [], loading: false }; await dbGo('progress', {}); },
        });
      } catch (err) {
        toast('Hoàn thành phiên: ' + dbErrText(err));
        DB_PRACTICE.session.status = 'COMPLETED';
        await dbGo('progress', {});
      }
    }, 900);
    return false;
  }
  // Prepare next question: pick next by next_level pool
  setTimeout(async () => {
    DB_PRACTICE.idx += 1;
    // If we prefilled, update next question to match next_level
    try {
      const courseId = DB.course.id;
      const allQs = await dbCall(EducMindDB.gameQuestions(courseId)).catch(() => []);
      const pool = (allQs || []).filter((qq) => (qq.objective_ids || []).includes(DB_PRACTICE.session.objective_id));
      const byLevel = { EASY: pool.filter((x) => x.difficulty === 'EASY'), MEDIUM: pool.filter((x) => x.difficulty === 'MEDIUM'), HARD: pool.filter((x) => x.difficulty === 'HARD') };
      for (const lv of ['EASY', 'MEDIUM', 'HARD']) if (!byLevel[lv].length) byLevel[lv] = pool;
      const usedIds = new Set(DB_PRACTICE.questions.map((x) => x.id));
      const bucket = byLevel[DB_PRACTICE.session.current_level] || pool;
      const avail = bucket.filter((x) => !usedIds.has(x.id));
      const pickPool = avail.length ? avail : pool.filter((x) => !usedIds.has(x.id));
      if (pickPool.length) {
        DB_PRACTICE.questions[DB_PRACTICE.idx] = pickPool[Math.floor(Math.random() * pickPool.length)];
      }
    } catch (_) {}
    render();
  }, 800);
  return false;
});

DB_ACT.practiceAbandon = () => {
  dbConfirm('Bỏ phiên luyện tập?', 'Tiến độ phiên hiện tại sẽ không được lưu.', 'Bỏ phiên', async () => {
    DB_PRACTICE = { session: null, objectiveId: '', questions: [], idx: 0, answers: [], levelPath: [], loading: false };
    await dbGo('progress', {});
  }, false);
};

DB_ACT.practiceShowResources = (el) => dbRun(el, async () => {
  const oid = el.dataset.objective;
  const resources = await dbCall(EducMindDB.getStudentObjectiveSupport(oid, null)).catch(() => []);
  const box = document.getElementById('db-practice-resources');
  if (!box) return;
  if (!resources.length) box.innerHTML = '<p class="muted">Chưa có tài liệu gợi ý cho mục tiêu này.</p>';
  else box.innerHTML = `<ul class="db-filelist">${resources.map((r) => `<li class="db-file"><span>${h(r.file_name)}</span><span class="pill plain">${h(r.kind)}</span></li>`).join('')}</ul>`;
  toast('Đã tải tài liệu gợi ý.');
});

/* dbLetter() đã được khai báo trong js/db/06-questions.js nên dùng lại, không khai báo trùng. */
