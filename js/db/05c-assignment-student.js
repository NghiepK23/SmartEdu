/* EducMind · js/db/05c-assignment-student.js
   Học sinh làm bài tập: chọn chế độ chơi (Kéo co, Sinh tồn, Chớp nhoáng), trả lời câu hỏi, nộp và xem lại kết quả. */

let DB_ASSIGNMENT_FLOW = null;
let DB_ASSIGNMENT_REVIEW = null;
let DB_ASSIGNMENT_TIMER = null;
const DB_ASSIGNMENT_GAMES = {
  RACE: { title: 'Kéo co tri thức', icon: '🪢', tag: 'Đua theo chặng', description: 'Trả lời từng câu để đưa đội em tiến gần vạch đích.' },
  SURVIVAL: { title: 'Sinh tồn tri thức', icon: '🏝️', tag: 'Khám phá bản đồ', description: 'Khám phá các trạm trên bản đồ qua từng câu hỏi.' },
  BLITZ: { title: 'Combo chớp nhoáng', icon: '⚡', tag: 'Bứt tốc với đồng hồ', description: 'Bứt tốc qua từng câu và theo dõi thời gian luyện tập.' },
};
function dbAssignmentStopTimer() {
  if (DB_ASSIGNMENT_TIMER == null) return;
  clearInterval(DB_ASSIGNMENT_TIMER);
  DB_ASSIGNMENT_TIMER = null;
}
function dbAssignmentSoundButton() {
  const on = DbSfx.enabled;
  return `<button type="button" class="btn light mini db-assignment-game-sound" data-noicon="1" data-act="assignmentToggleSound" aria-pressed="${on}">${on ? '🔊 Âm thanh: Bật' : '🔇 Âm thanh: Tắt'}</button>`;
}
function dbAssignmentStartTimer() {
  dbAssignmentStopTimer();
  const flow = DB_ASSIGNMENT_FLOW;
  if (!flow || !flow.started || flow.mode !== 'BLITZ') return;
  if (!Number.isFinite(flow.startedAt)) flow.startedAt = Date.now();
  const tick = () => {
    const timer = document.getElementById('db-assignment-blitz-timer');
    if (!timer || DB_ASSIGNMENT_FLOW !== flow || !flow.started) return dbAssignmentStopTimer();
    const elapsed = Math.floor((Date.now() - flow.startedAt) / 1000);
    timer.textContent = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  };
  tick();
  DB_ASSIGNMENT_TIMER = setInterval(tick, 1000);
}
function dbAssignmentModeHud(mode, total, answered, startedAt) {
  const progress = Math.round(answered / Math.max(1, total) * 100);
  const marker = Math.max(4, Math.min(96, progress));
  const track = (icon, className = '') => `<div class="db-assignment-mode-track ${className}" id="db-assignment-game-track"><span style="width:${progress}%"></span><b id="db-assignment-game-marker" style="left:${marker}%" aria-hidden="true">${icon}</b></div>`;
  if (mode === 'SURVIVAL') {
    const landmarks = ['🏝️', '🌊', '⛺', '🗺️', '🏆'].map((icon, i) => `<span class="db-assignment-survival-landmark" style="left:${i * 25}%" aria-hidden="true">${icon}</span>`).join('');
    return `<div class="db-assignment-mode-hud db-assignment-mode-hud-survival">
      <div class="db-assignment-mode-hud-copy"><b>🗺️ HÀNH TRÌNH ĐẢO</b><span id="db-assignment-game-progress-label">Đã khám phá ${answered} / ${total} trạm</span></div>
      <div class="db-assignment-survival-route"><div class="db-assignment-mode-track" id="db-assignment-game-track"><span style="width:${progress}%"></span>${landmarks}<b id="db-assignment-game-marker" style="left:${marker}%" aria-hidden="true">🛶</b></div></div>
    </div>`;
  }
  if (mode === 'BLITZ') {
    const elapsed = Number.isFinite(startedAt) ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0;
    const time = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
    return `<div class="db-assignment-mode-hud db-assignment-mode-hud-blitz">
      <div class="db-assignment-blitz-clock"><span aria-hidden="true">⏱️</span><div><time id="db-assignment-blitz-timer">${time}</time><small>THỜI GIAN LUYỆN</small></div></div>
      <div class="db-assignment-blitz-label"><b>⚡ BỨT TỐC</b><small>Không giới hạn thời gian</small></div>
      <div class="db-assignment-blitz-track" id="db-assignment-game-track"><span style="width:${progress}%"></span></div>
    </div>`;
  }
  return `<div class="db-assignment-mode-hud db-assignment-mode-hud-race">
    <div class="db-assignment-mode-hud-copy"><b>🚦 ĐƯỜNG ĐUA TRI THỨC</b><span id="db-assignment-game-progress-label">Đã hoàn thành ${answered} / ${total} chặng</span></div>
    <div class="db-assignment-race-lane"><span aria-hidden="true">🚦</span>${track('🏃', 'db-assignment-race-track')}<span aria-hidden="true">🏁</span></div>
  </div>`;
}

/* ===== Học sinh ===== */
function dbSubmissionPill(a, s) {
  if (s && s.score != null) return dbPill(`Đã chấm ${dbNum(s.score)}/${dbNum(a.max_score)}`, 'good');
  if (s) return dbPill(s.status === 'LATE' ? 'Đã nộp muộn' : 'Đã nộp', 'prog');
  const w = dbAssignmentWindow(a);
  return w === 'OPEN' ? dbPill('Chưa nộp', 'need') : w === 'LATE' ? dbPill('Quá hạn · còn nhận bài muộn', 'need') : dbPill('Đã hết hạn', 'plain');
}
function dbAssignmentStudentList(d) {
  const mine = Object.fromEntries(d.submissions.map((s) => [s.assignment_id, s]));
  const liveAssignments = d.assignments.filter((a) => !a.deleted_at);
  const todo = liveAssignments.filter((a) => !mine[a.id] && dbAssignmentWindow(a) !== 'CLOSED');
  const card = (a) => `<article class="db-task">
      <div class="row between"><div><button type="button" class="db-link db-task-title" data-act="go" data-page="assignments" data-id="${h(a.id)}">${h(a.title)}</button>
        <div class="db-work-meta">
          <span><small>Bài học</small><b>${h(dbLessonTitle(d, a.lesson_id) || 'Chưa gắn bài học')}</b></span>
          <span><small>Thời hạn</small><b>${dbDueText(a)}</b></span>
          <span><small>Điểm tối đa</small><b>${dbNum(a.max_score)} điểm</b></span>
        </div></div>
      <div class="row">${dbSubmissionPill(a, mine[a.id])}${dbBtn(mine[a.id] ? 'Xem bài' : 'Làm bài', 'go', { page: 'assignments', id: a.id }, mine[a.id] ? 'light' : '')}</div></div>
    </article>`;
  return `<section class="panel" aria-labelledby="db-h-sa">
    <h2 id="db-h-sa">Bài tập được giao</h2>
    <p class="lead">${liveAssignments.length} bài tập · ${todo.length} bài cần nộp</p>
    ${liveAssignments.length ? liveAssignments.map(card).join('') : dbEmpty('Chưa có bài tập nào được giao.')}
  </section>`;
}
function dbAssignmentStudentQuestions(d, submission, editable, presentation) {
  const questions = d.studentQuestions || [];
  if (!questions.length) return '';
  const mode = presentation && presentation.mode || 'RACE';
  const submitLabel = submission ? 'Nộp lại' : 'Nộp bài';
  const step = presentation && Number.isInteger(presentation.index) ? presentation.index : 0;
  const current = Math.max(0, Math.min(questions.length - 1, step));
  const answers = dbById((d.assignmentAnswers || []).filter((x) => submission && x.submission_id === submission.id).map((x) => ({ ...x, id: x.question_id })));
  const asgId = (presentation && presentation.assignmentId) || (submission && submission.assignment_id) || (DB && DB.arg && DB.arg.id) || '';
  const localDraft = editable && asgId && typeof dbDraftRead === 'function' ? dbDraftRead('asg', asgId) : null;
  if (localDraft && localDraft.answers) {
    for (const [qId, val] of Object.entries(localDraft.answers)) {
      answers[qId] = { question_id: qId, answer_content: val };
    }
  }
  const answered = questions.filter((q) => !dbAssignmentAnswerBlank(answers[q.question_id] && answers[q.question_id].answer_content)).length;
  const game = DB_ASSIGNMENT_GAMES[mode] || DB_ASSIGNMENT_GAMES.RACE;
  const items = questions.map((q, i) => {
    const saved = answers[q.question_id], answer = saved ? saved.answer_content : null, options = Array.isArray(q.options) ? q.options : [], name = 'db-asg-' + q.question_id;
    const hasAnswer = !dbAssignmentAnswerBlank(answer);
    let response, questionContent = h(q.content);
    if (!editable) {
      if (q.kind === 'SINGLE_CHOICE' || q.kind === 'MULTIPLE_CHOICE') {
        const selected = new Set(answer == null || answer === '' ? [] : [].concat(answer).map(Number));
        response = options.length
          ? `<div class="db-assignment-review-options">${options.map((option, k) => `<div class="db-assignment-review-option${selected.has(k) ? ' selected' : ''}"><span class="db-assignment-review-letter">${dbLetter(k)}</span><span>${h(option)}</span>${selected.has(k) ? '<span class="db-assignment-review-selected">Đã chọn</span>' : ''}</div>`).join('')}</div>${hasAnswer ? '' : '<p class="muted db-assignment-review-unanswered">Chưa trả lời</p>'}`
          : `<p><b>Câu trả lời:</b> ${hasAnswer ? h(dbAnswerText(q, answer)) : '<span class="muted">Chưa trả lời</span>'}</p>`;
      } else if (q.kind === 'TRUE_FALSE') {
        response = `<div class="db-assignment-review-options">${[['true', 'Đúng'], ['false', 'Sai']].map(([value, label]) => {
          const selected = answer != null && String(answer) === value;
          return `<div class="db-assignment-review-option${selected ? ' selected' : ''}"><span class="db-assignment-review-letter">${selected ? '✓' : '·'}</span><span>${label}</span>${selected ? '<span class="db-assignment-review-selected">Đã chọn</span>' : ''}</div>`;
        }).join('')}</div>${hasAnswer ? '' : '<p class="muted db-assignment-review-unanswered">Chưa trả lời</p>'}`;
      } else {
        const text = saved ? dbAnswerText(q, answer) : '';
        response = `<div class="db-assignment-review-answer"><b>Câu trả lời</b><div>${text ? h(text) : '<span class="muted">Chưa trả lời</span>'}</div></div>`;
      }
    } else if (q.kind === 'SINGLE_CHOICE') {
      response = options.map((option, k) => `<label class="objrow" data-choice="${k}"><input type="radio" name="${h(name)}" value="${k}" data-change="assignmentAnswerChanged" data-assignment-answer="${h(q.question_id)}" ${answer != null && answer !== '' && Number(answer) === k ? 'checked' : ''}><span class="db-assignment-choice-letter" aria-hidden="true">${dbLetter(k)}</span><span class="db-assignment-choice-text">${h(option)}</span><span class="db-assignment-choice-mark" aria-hidden="true">✓</span></label>`).join('');
    } else if (q.kind === 'MULTIPLE_CHOICE') {
      const selected = new Set(answer == null || answer === '' ? [] : [].concat(answer).map(Number));
      response = `<div class="muted db-hint">Chọn mọi đáp án đúng.</div>` + options.map((option, k) => `<label class="objrow" data-choice="${k}"><input type="checkbox" name="${h(name)}" value="${k}" data-change="assignmentAnswerChanged" data-assignment-answer="${h(q.question_id)}" ${selected.has(k) ? 'checked' : ''}><span class="db-assignment-choice-letter" aria-hidden="true">${dbLetter(k)}</span><span class="db-assignment-choice-text">${h(option)}</span><span class="db-assignment-choice-mark" aria-hidden="true">✓</span></label>`).join('');
    } else if (q.kind === 'TRUE_FALSE') {
      response = [['true', 'Đúng'], ['false', 'Sai']].map(([value, label]) => `<label class="objrow"><input type="radio" name="${h(name)}" value="${value}" data-change="assignmentAnswerChanged" data-assignment-answer="${h(q.question_id)}" ${answer != null && String(answer) === value ? 'checked' : ''}><span class="db-assignment-choice-text">${label}</span><span class="db-assignment-choice-mark" aria-hidden="true">✓</span></label>`).join('');
    } else if (q.kind === 'FILL_IN_BLANK') {
      if (editable) questionContent = dbQuestionFillMarkup(q.content, q.question_id, answer, 'assignment');
      const text = saved ? dbAnswerText(q, answer) : '';
      response = editable ? '' : `<div class="db-assignment-review-answer"><b>Câu trả lời</b><div>${text ? h(text) : '<span class="muted">Chưa trả lời</span>'}</div></div>`;
    } else if (q.kind === 'MATCHING') {
      response = editable
        ? dbQuestionMatchingMarkup(q.question_id, q.options, answer, 'assignment')
        : `<div class="db-assignment-review-answer"><b>Câu trả lời</b><div>${hasAnswer ? h(dbAnswerText(q, answer)) : '<span class="muted">Chưa trả lời</span>'}</div></div>`;
    } else if (q.kind === 'SHORT_ANSWER') {
      response = `<label class="sr" for="${h(name)}">Câu trả lời câu ${i + 1}</label><input id="${h(name)}" type="text" maxlength="1000" value="${h(answer == null ? '' : answer)}" data-input="assignmentAnswerChanged" data-assignment-answer="${h(q.question_id)}" placeholder="Câu trả lời của em">`;
    } else {
      response = `<label class="sr" for="${h(name)}">Bài làm câu ${i + 1}</label><textarea id="${h(name)}" rows="5" maxlength="20000" data-input="assignmentAnswerChanged" data-assignment-answer="${h(q.question_id)}" placeholder="Bài làm của em">${h(answer == null ? '' : answer)}</textarea>`;
    }
    const grade = !editable && submission && submission.question_grading_enabled
      ? saved && saved.score != null
        ? `<p class="db-assignment-answer-grade"><b>Điểm câu:</b> ${dbNum(saved.score)} / ${dbNum(q.weight)}${saved.feedback ? ` · ${h(saved.feedback)}` : ''}</p>`
        : `<p class="muted db-assignment-answer-grade">${DB_QAUTO.includes(q.kind) ? 'Đang chờ hệ thống chấm câu này.' : 'Đang chờ giáo viên chấm câu này.'}</p>`
      : '';
    return `<fieldset class="field db-question db-assignment-game-question${hasAnswer ? ' answered' : ''}" data-game-question="${i}" tabindex="-1" ${i !== current ? 'hidden' : ''}><legend><span class="db-assignment-q-number">${String(i + 1).padStart(2, '0')}</span><span><b>Câu ${i + 1}</b><small>${h(DB_QKIND[q.kind] || q.kind)}</small></span></legend><div class="db-prose">${questionContent}</div><div class="db-answers">${response}</div>${grade}</fieldset>`;
  }).join('');
  const progress = Math.round(answered / questions.length * 100);
  const progressHeader = `<div class="db-assignment-game-progress">
    <div class="db-assignment-game-progress-head">
      <div class="db-assignment-game-progress-mode"><span aria-hidden="true">${editable ? game.icon : '📖'}</span><div><b>${editable ? h(game.title) : 'Xem lại bài làm'}</b><small>${editable ? h(game.description) : 'Chọn câu hỏi để xem câu trả lời đã nộp.'}</small></div></div>
      <div class="db-assignment-game-progress-stats"><span class="db-assignment-game-position" id="db-assignment-game-position" aria-live="polite">Câu ${current + 1} / ${questions.length}</span><span id="db-assignment-game-answered">Đã trả lời ${answered} / ${questions.length}</span></div>
    </div>
    ${editable ? dbAssignmentModeHud(mode, questions.length, answered, presentation && presentation.startedAt) : `<div class="db-assignment-game-track"><span style="width:${progress}%"></span></div>`}
  </div>`;
  const jumpAction = editable ? 'assignmentGameJump' : 'assignmentReviewJump';
  const questionNav = questions.length > 1 ? `<div class="db-assignment-question-nav" role="group" aria-label="Đi đến câu hỏi">${questions.map((q, i) => {
    const hasAnswer = !dbAssignmentAnswerBlank(answers[q.question_id] && answers[q.question_id].answer_content);
    return `<button type="button" class="db-assignment-question-jump${i === current ? ' current' : ''}${hasAnswer ? ' answered' : ''}" data-act="${jumpAction}" data-index="${i}" data-question-index="${i}" aria-label="Câu ${i + 1}, ${hasAnswer ? 'đã trả lời' : 'chưa trả lời'}"${i === current ? ' aria-current="step"' : ''}>${i + 1}</button>`;
  }).join('')}</div>` : '';
  const stepAction = editable ? 'assignmentGameStep' : 'assignmentReviewStep';
  const nextLabel = !editable ? 'Câu tiếp theo →' : mode === 'RACE' ? 'Kéo dây →' : mode === 'SURVIVAL' ? 'Sang trạm →' : 'Bứt tốc →';
  const isLastQuestion = current === questions.length - 1;
  const nav = questions.length > 1 || editable
    ? `<div class="db-assignment-game-nav"><button type="button" class="btn light" data-act="${stepAction}" data-dir="-1" ${current === 0 ? 'disabled' : ''}>← Trước</button><span class="muted">${editable ? '<kbd>←</kbd> <kbd>→</kbd> chuyển câu · <kbd>1–4</kbd> / <kbd>A–D</kbd> chọn đáp án · <kbd>Enter</kbd> sang câu' : '<kbd>←</kbd> <kbd>→</kbd> chuyển câu · Chọn số câu để xem nhanh.'}</span>${editable
      ? `<button type="button" class="btn" data-act="${stepAction}" data-dir="1" ${isLastQuestion ? 'hidden disabled' : ''}>${nextLabel}</button><button type="submit" class="btn db-assignment-submit-inline" ${isLastQuestion ? '' : 'hidden'}>${submitLabel}</button>`
      : `<button type="button" class="btn" data-act="${stepAction}" data-dir="1" ${isLastQuestion ? 'disabled' : ''}>${nextLabel}</button>`}</div>`
    : '';
  return `<div class="db-assignment-questions db-assignment-game" data-mode="${h(mode)}" data-editable="${editable}">
    ${progressHeader}${questionNav}
    <div class="db-assignment-game-questions">${items}</div>${nav}
  </div>`;
}
function dbAssignmentStudentGamePicker(d, a, questions, flow) {
  const selected = flow && flow.mode || 'RACE';
  const cards = Object.entries(DB_ASSIGNMENT_GAMES).map(([id, game]) => `
    <button type="button" class="db-assignment-game-choice db-assignment-game-choice-${id}${selected === id ? ' chosen' : ''}" aria-pressed="${selected === id}" data-act="assignmentPickMode" data-id="${h(a.id)}" data-mode="${id}">
      <span class="db-assignment-game-icon db-assignment-game-icon-${id}" aria-hidden="true">${game.icon}</span>
      <span class="db-assignment-game-copy"><b>${game.title}</b><small>${game.description}</small><em>${game.tag}</em></span>
      <span class="db-assignment-game-radio" aria-hidden="true">${selected === id ? '✓' : ''}</span>
    </button>`).join('');
  return `<div class="db-assignment-game-picker">
    <section class="panel db-assignment-game-picker-main" aria-labelledby="db-h-game-picker">
      <header class="db-assignment-game-hero">
        <span class="db-assignment-game-kicker">NHIỆM VỤ HỌC TẬP · ${questions.length} CÂU · ${dbNum(a.max_score)} ĐIỂM</span>
        <h2 id="db-h-game-picker">Chọn cách luyện tập</h2>
        <p>Chọn thử thách phù hợp với em. Mỗi câu trả lời đều được ghi nhận trong bài tập.</p>
      </header>
      <div class="db-assignment-game-picker-body">
        <div class="db-assignment-game-picker-heading"><div><h3>Chọn trò chơi</h3><p>Mỗi lựa chọn thay đổi cách hiển thị câu hỏi, không đổi nội dung bài tập.</p></div><span>BƯỚC 1 / 2</span></div>
        <div class="db-assignment-game-choice-list" role="group" aria-label="Chọn cách luyện tập">${cards}</div>
        <div class="db-assignment-game-picker-actions">
          ${dbBtn('Quay lại danh sách', 'go', { page: 'assignments' }, 'light')}
          ${dbAssignmentSoundButton()}
          <button type="button" class="btn db-assignment-game-start" data-act="assignmentGameStart" ${questions.length ? '' : 'disabled'}>Bắt đầu ${DB_ASSIGNMENT_GAMES[selected].title} ${ic('arrow', 17)}</button>
        </div>
      </div>
    </section>
  </div>`;
}
DB_ACT.assignmentToggleSound = () => {
  const on = DbSfx.toggle();
  document.querySelectorAll('.db-assignment-game-sound, .db-game-sound').forEach((button) => {
    button.setAttribute('aria-pressed', String(on));
    button.textContent = on ? '🔊 Âm thanh: Bật' : '🔇 Âm thanh: Tắt';
  });
};
DB_ACT.assignmentPickMode = (el) => {
  const mode = el.dataset.mode;
  if (!DB_ASSIGNMENT_GAMES[mode]) return;
  dbAssignmentStopTimer();
  DbSfx.play('click');
  DB_ASSIGNMENT_FLOW = { assignmentId: el.dataset.id, mode, started: false, index: 0 };
  render();
};
DB_ACT.assignmentGameStart = () => {
  if (!DB_ASSIGNMENT_FLOW) return;
  DbSfx.play('click');
  DB_ASSIGNMENT_FLOW.started = true;
  DB_ASSIGNMENT_FLOW.index = 0;
  DB_ASSIGNMENT_FLOW.startedAt = Date.now();
  render();
  dbAssignmentStartTimer();
  document.querySelector('.db-assignment-game[data-editable="true"] [data-game-question="0"]')?.focus({ preventScroll: true });
};
function dbAssignmentShowQuestion(root, next, state, editable) {
  const questions = [...root.querySelectorAll('[data-game-question]')];
  if (!state || !Number.isInteger(next) || next < 0 || next >= questions.length) return;
  state.index = next;
  questions.forEach((question, i) => { question.hidden = i !== next; });
  root.querySelectorAll('[data-question-index]').forEach((button) => {
    const active = Number(button.dataset.questionIndex) === next;
    button.classList.toggle('current', active);
    if (active) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  });
  const nav = root.querySelector('.db-assignment-question-nav');
  const jump = nav && nav.querySelector(`[data-question-index="${next}"]`);
  if (nav && jump) {
    const navRect = nav.getBoundingClientRect(), jumpRect = jump.getBoundingClientRect();
    if (jumpRect.left < navRect.left) nav.scrollLeft -= navRect.left - jumpRect.left;
    else if (jumpRect.right > navRect.right) nav.scrollLeft += jumpRect.right - navRect.right;
  }
  root.querySelectorAll('.db-assignment-game-nav [data-dir]').forEach((button) => {
    button.disabled = Number(button.dataset.dir) < 0 ? next === 0 : next === questions.length - 1;
  });
  if (editable) {
    const isLastQuestion = next === questions.length - 1;
    const nextButton = root.querySelector('.db-assignment-game-nav [data-dir="1"]');
    const submitButton = root.querySelector('.db-assignment-submit-inline');
    if (nextButton) nextButton.hidden = isLastQuestion;
    if (submitButton) submitButton.hidden = !isLastQuestion;
  }
  const position = root.querySelector('#db-assignment-game-position');
  if (position) position.textContent = `Câu ${next + 1} / ${questions.length}`;
  const question = questions[next], scroller = root.querySelector('.db-assignment-game-questions');
  if (scroller) scroller.scrollTop = 0;
  question.focus({ preventScroll: true });
}
DB_ACT.assignmentGameStep = (el) => {
  const root = el.closest('.db-assignment-game');
  if (DB_ASSIGNMENT_FLOW && root) {
    DbSfx.play('click');
    dbAssignmentShowQuestion(root, DB_ASSIGNMENT_FLOW.index + Number(el.dataset.dir), DB_ASSIGNMENT_FLOW, true);
  }
};
DB_ACT.assignmentGameJump = (el) => {
  const root = el.closest('.db-assignment-game');
  if (DB_ASSIGNMENT_FLOW && root) {
    DbSfx.play('click');
    dbAssignmentShowQuestion(root, Number(el.dataset.index), DB_ASSIGNMENT_FLOW, true);
  }
};
DB_ACT.assignmentReviewStep = (el) => {
  const root = el.closest('.db-assignment-game');
  if (DB_ASSIGNMENT_REVIEW && root) dbAssignmentShowQuestion(root, DB_ASSIGNMENT_REVIEW.index + Number(el.dataset.dir), DB_ASSIGNMENT_REVIEW, false);
};
DB_ACT.assignmentReviewJump = (el) => {
  const root = el.closest('.db-assignment-game');
  if (DB_ASSIGNMENT_REVIEW && root) dbAssignmentShowQuestion(root, Number(el.dataset.index), DB_ASSIGNMENT_REVIEW, false);
};
DB_ACT.assignmentEditSubmitted = (el) => {
  if (!DB_ASSIGNMENT_FLOW || DB_ASSIGNMENT_FLOW.assignmentId !== el.dataset.id || !DB_ASSIGNMENT_FLOW.submitted) return;
  DB_ASSIGNMENT_FLOW.submitted = false;
  DB_ASSIGNMENT_FLOW.started = true;
  DB_ASSIGNMENT_FLOW.index = 0;
  DB_ASSIGNMENT_FLOW.startedAt = Date.now();
  DB_ASSIGNMENT_REVIEW = null;
  render();
  dbAssignmentStartTimer();
  document.querySelector('.db-assignment-game[data-editable="true"] [data-game-question="0"]')?.focus({ preventScroll: true });
};
document.addEventListener('keydown', (ev) => {
  if (!dbActive() || DB.page !== 'assignments' || DB.dialog
      || ev.defaultPrevented || ev.repeat || ev.altKey || ev.ctrlKey || ev.metaKey) return;
  const editable = !!(DB_ASSIGNMENT_FLOW && DB_ASSIGNMENT_FLOW.started);
  const state = editable ? DB_ASSIGNMENT_FLOW : DB_ASSIGNMENT_REVIEW;
  const root = document.querySelector(`.db-assignment-game[data-editable="${editable}"]`);
  if (!root || !state) return;
  const target = ev.target;
  const editingField = target && target.closest && target.closest('input,textarea,select,[contenteditable="true"]');
  const choiceField = editingField && editingField.matches && editingField.matches('input[type="radio"],input[type="checkbox"]');
  if (editingField && !choiceField) return;
  if (target && target.closest && target.closest('a,button') && !root.contains(target)) return;
  const key = String(ev.key).toLowerCase();
  const choiceIndex = /^[1-4]$/.test(key) ? Number(key) - 1 : /^[a-d]$/.test(key) ? key.charCodeAt(0) - 97 : -1;
  if (editable && choiceIndex >= 0) {
    const question = root.querySelector(`[data-game-question="${state.index}"]`);
    const choices = question ? [...question.querySelectorAll('.db-answers input[type="radio"],.db-answers input[type="checkbox"]')] : [];
    const choice = choices[choiceIndex];
    if (choice && !choice.disabled) {
      ev.preventDefault();
      choice.click();
    }
    return;
  }
  if (editable && key === 'enter') {
    if (target && target.closest && target.closest('a,button')) return;
    const next = root.querySelector('.db-assignment-game-nav [data-dir="1"]');
    if (next && !next.disabled && !next.hidden) {
      ev.preventDefault();
      next.click();
    }
    return;
  }
  if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
  const direction = ev.key === 'ArrowLeft' ? -1 : 1;
  const next = state.index + direction;
  const questions = root.querySelectorAll('[data-game-question]');
  if (next < 0 || next >= questions.length) return;
  ev.preventDefault();
  dbAssignmentShowQuestion(root, next, state, editable);
});
DB_ACT.assignmentAnswerChanged = (el) => {
  if (el.type === 'radio' || el.type === 'checkbox') DbSfx.play('click');
  const form = el.closest('form'), root = form && form.querySelector('.db-assignment-game');
  if (!form || !root) return;
  const answers = dbReadAssignmentAnswers(form, DB.data.studentQuestions || []);
  const asgId = form.dataset.id;
  if (asgId && typeof dbDraftWrite === 'function') {
    dbDraftWrite('asg', asgId, {
      version: 1,
      updatedAt: Date.now(),
      answers,
      pending: Object.fromEntries(Object.keys(answers).filter((k) => !dbAssignmentAnswerBlank(answers[k])).map((k) => [k, true])),
      mode: root.dataset.mode || 'RACE',
    });
  }
  const questions = DB.data.studentQuestions || [];
  const answered = Object.values(answers).filter((value) => !dbAssignmentAnswerBlank(value)).length;
  const count = root.querySelector('#db-assignment-game-answered'), track = root.querySelector('#db-assignment-game-track > span');
  if (count) count.textContent = `Đã trả lời ${answered} / ${questions.length}`;
  const progress = Math.round(answered / Math.max(1, questions.length) * 100);
  if (track) track.style.width = progress + '%';
  const marker = root.querySelector('#db-assignment-game-marker');
  if (marker) marker.style.left = Math.max(4, Math.min(96, progress)) + '%';
  const label = root.querySelector('#db-assignment-game-progress-label');
  if (label) label.textContent = root.dataset.mode === 'SURVIVAL'
    ? `Đã khám phá ${answered} / ${questions.length} trạm`
    : `Đã hoàn thành ${answered} / ${questions.length} chặng`;
  root.querySelectorAll('[data-game-question]').forEach((question, i) => {
    const q = questions[i];
    if (!q) return;
    const hasAnswer = !dbAssignmentAnswerBlank(answers[q.question_id]);
    question.classList.toggle('answered', hasAnswer);
    const jump = root.querySelector(`[data-question-index="${i}"]`);
    if (jump) {
      jump.classList.toggle('answered', hasAnswer);
      jump.setAttribute('aria-label', `Câu ${i + 1}, ${hasAnswer ? 'đã trả lời' : 'chưa trả lời'}`);
    }
  });
};
function dbReadAssignmentAnswers(form, questions) {
  return Object.fromEntries(questions.map((q) => {
    const controls = [...form.querySelectorAll(`[data-assignment-answer="${q.question_id}"]`)];
    let answer = null;
    if (q.kind === 'SINGLE_CHOICE') {
      const checked = controls.find((x) => x.checked);
      answer = checked ? Number(checked.value) : '';
    } else if (q.kind === 'MULTIPLE_CHOICE') answer = controls.filter((x) => x.checked).map((x) => Number(x.value));
    else if (q.kind === 'TRUE_FALSE') {
      const checked = controls.find((x) => x.checked);
      answer = checked ? checked.value === 'true' : '';
    } else if (q.kind === 'FILL_IN_BLANK') answer = controls.map((x) => x.value);
    else if (q.kind === 'MATCHING') answer = controls.map((x) => x.value === '' ? null : Number(x.value));
    else answer = controls[0] ? controls[0].value : '';
    return [q.question_id, answer];
  }));
}
function dbAssignmentAnswerBlank(value) {
  return value == null || value === '' || (Array.isArray(value) && !value.some((item) => item != null && String(item).trim() !== '')) || (typeof value === 'string' && !value.trim());
}
function dbAssignmentStudentDetail(d, a) {
  const s = d.submissions.find((x) => x.assignment_id === a.id), w = dbAssignmentWindow(a), graded = s && s.score != null;
  const deleted = !!a.deleted_at;
  const deleteBtn = s && !graded && w !== 'CLOSED'
    ? dbBtn('Xóa bài nộp', 'deleteUngradedSubmission', { id: s.id }, 'light danger-soft')
    : '';
  const questions = d.studentQuestions || [];
  if (DB_ASSIGNMENT_FLOW && DB_ASSIGNMENT_FLOW.assignmentId !== a.id) DB_ASSIGNMENT_FLOW = null;
  if (DB_ASSIGNMENT_REVIEW && DB_ASSIGNMENT_REVIEW.assignmentId !== a.id) DB_ASSIGNMENT_REVIEW = null;
  if ((graded || w === 'CLOSED') && !DB_ASSIGNMENT_REVIEW) DB_ASSIGNMENT_REVIEW = { assignmentId: a.id, index: 0 };
  if (DB_ASSIGNMENT_REVIEW && questions.length) DB_ASSIGNMENT_REVIEW.index = Math.max(0, Math.min(questions.length - 1, Number.isInteger(DB_ASSIGNMENT_REVIEW.index) ? DB_ASSIGNMENT_REVIEW.index : 0));
  const canChooseGame = !dbIsTeacher() && !deleted && !graded && w !== 'CLOSED' && questions.length > 0;
  if (canChooseGame && !DB_ASSIGNMENT_FLOW) {
    DB_ASSIGNMENT_FLOW = { assignmentId: a.id, mode: 'RACE', started: false, index: 0 };
  }
  const flow = canChooseGame ? DB_ASSIGNMENT_FLOW : null;
  const justSubmitted = !!(s && flow && flow.submitted);
  if (justSubmitted && !DB_ASSIGNMENT_REVIEW) DB_ASSIGNMENT_REVIEW = { assignmentId: a.id, index: 0 };
  if (flow && !flow.started && !flow.submitted) {
    return `<section class="panel db-assignment-detail-head" aria-labelledby="db-h-sd">
        <div class="row between"><div><h2 id="db-h-sd">${h(a.title)}</h2><p class="lead">${dbSubmissionPill(a, s)}${s ? ' · nộp lúc ' + dbDateTime(s.submitted_at) + (s.is_edited ? ' (đã sửa)' : '') : ''}</p></div><div class="row">${deleteBtn}${dbBtn('Về danh sách', 'go', { page: 'assignments' }, 'light')}</div></div>
        ${dbAssignmentFacts(d, a)}
      </section>
      ${dbAssignmentStudentGamePicker(d, a, questions, flow)}`;
  }
  const detailHeader = flow && flow.started
    ? `<section class="db-assignment-playing-head"><div><span class="db-assignment-game-kicker">ĐANG LÀM BÀI · ${h(DB_ASSIGNMENT_GAMES[flow.mode]?.title || DB_ASSIGNMENT_GAMES.RACE.title)}</span><h2>${h(a.title)}</h2></div><div class="row">${dbAssignmentSoundButton()}${dbBtn('Về danh sách', 'go', { page: 'assignments' }, 'light')}</div></section>`
    : `<section class="panel" aria-labelledby="db-h-sd">
        <div class="row between"><div><h2 id="db-h-sd">${h(a.title)}</h2><p class="lead">${dbSubmissionPill(a, s)}${s ? ' · nộp lúc ' + dbDateTime(s.submitted_at) + (s.is_edited ? ' (đã sửa)' : '') : ''}</p></div><div class="row">${deleteBtn}${dbBtn('Về danh sách', 'go', { page: 'assignments' }, 'light')}</div></div>
        ${dbAssignmentFacts(d, a)}
      </section>`;
  let form;
  if (deleted) form = `<div class="notice">${ic('info', 16)}<div>Bài tập đã bị giáo viên xóa mềm. Kết quả đã ghi vẫn được xem ở đây nhưng không thể nộp hoặc sửa.</div></div>`;
  else if (graded) form = `<div class="notice">${ic('info', 16)}<div>Bài đã được chấm nên không sửa được nữa.</div></div>`;
  else if (w === 'CLOSED') form = `<div class="notice">${ic('info', 16)}<div>${s ? 'Đã hết hạn nên không sửa được bài nộp.' : 'Đã hết hạn nộp bài.'}</div></div>`;
  else if (!questions.length) form = `<div class="notice">${ic('info', 16)}<div>Bài tập chưa có câu hỏi để làm. Vui lòng liên hệ giáo viên.</div></div>`;
  else if (justSubmitted) form = dbAssignmentStudentQuestions(d, s, false, DB_ASSIGNMENT_REVIEW);
  else form = `<form class="${flow && flow.started ? 'db-assignment-game-form' : ''}" data-game-mode="${h(flow && flow.mode || 'RACE')}" data-act="submitAssignment" data-id="${h(a.id)}" novalidate>
      ${dbAssignmentStudentQuestions(d, s, true, flow)}
      ${w === 'LATE' ? `<div class="notice">${ic('info', 16)}<div>Đã quá hạn nộp: bài nộp hoặc sửa lúc này được ghi là nộp muộn.</div></div>` : ''}
      ${dbFormError()}
    </form>`;
  const submittedNotice = justSubmitted ? `<section class="db-assignment-submit-success" role="status"><span aria-hidden="true">✓</span><div><b>Nộp bài thành công!</b><p>Câu trắc nghiệm, đúng/sai, điền khuyết và ghép đôi được tự chấm; câu trả lời ngắn/tự luận sẽ có điểm sau khi giáo viên chấm bài.</p></div><button type="button" class="btn light" data-act="assignmentEditSubmitted" data-id="${h(a.id)}">Chỉnh sửa / nộp lại</button></section>` : '';
  return `${detailHeader}
  ${graded ? `<section class="panel" aria-labelledby="db-h-res"><h2 id="db-h-res">Kết quả</h2>
      <div class="facts db-key-facts"><div class="db-fact-score"><span>Điểm</span><b>${dbNum(s.score)} / ${dbNum(a.max_score)}</b></div><div class="db-fact-time"><span>Chấm lúc</span><b>${dbDateTime(s.graded_at)}</b></div>${dbRubricResult(d, s)}</div>
      ${s.feedback ? `<div class="db-prose"><b>Nhận xét của giáo viên:</b> ${h(s.feedback)}</div>` : ''}</section>` : ''}
  ${submittedNotice}
  ${flow && flow.started ? form : `<section class="panel" aria-labelledby="db-h-sw"><h2 id="db-h-sw">Bài làm</h2>
    ${graded || w === 'CLOSED' ? (s ? `${dbAssignmentStudentQuestions(d, s, false, DB_ASSIGNMENT_REVIEW)}${s.text_content ? `<div class="db-prose">${h(s.text_content)}</div>` : ''}${s.storage_path ? `<div class="db-file"><span class="db-file-name">${ic('overview', 14)}<span class="db-file-title">${h(dbSubName(s))}</span></span><span class="row db-file-actions">${dbBtn('Xem trước', 'previewSubmission', { path: s.storage_path, name: dbSubName(s) }, 'light mini')}${dbBtn('Tải xuống', 'downloadSubmission', { path: s.storage_path, name: dbSubName(s) }, 'light mini')}</span></div>` : ''}` : dbAssignmentStudentQuestions(d, null, false, DB_ASSIGNMENT_REVIEW)) : form}
  </section>`}`;
}
/* Điểm từng tiêu chí rubric trong trang kết quả của học sinh. */
function dbRubricResult(d, s) {
  const rows = (d.rubricScores || []).filter((x) => x.submission_id === s.id);
  if (!rows.length) return '';
  const crit = dbById(d.criteria || []);
  return rows.map((r) => { const c = crit[r.criterion_id]; return c ? `<div><span>${h(c.title)}</span><b>${dbNum(r.score)} / ${dbNum(c.max_score)}</b></div>` : ''; }).join('');
}
DB_ACT.submitAssignment = (form) => dbRun(form, async () => {
  const a = DB.data.assignments.find((x) => x.id === form.dataset.id);
  const prev = (DB.data.submissions || []).find((x) => x.assignment_id === a.id);
  const questions = DB.data.studentQuestions || [], answers = dbReadAssignmentAnswers(form, questions);
  if (!questions.length) throw new Error('Bài tập chưa có câu hỏi để làm.');
  const hasAnswer = Object.values(answers).some((answer) => !dbAssignmentAnswerBlank(answer));
  if (!hasAnswer) throw new Error('Hãy trả lời ít nhất một câu trước khi nộp bài.');
  const first = dbAssignmentWindow(a) === 'OPEN' ? 'SUBMITTED' : 'LATE';
  const send = (status) => EducMindDB.submitAssignment({
    assignment_id: a.id,
    text_content: prev ? prev.text_content || '' : '',
    storage_path: prev ? prev.storage_path : null,
    file_name: prev ? prev.file_name : null,
    status,
  });
  let r = await send(first);
  /* Đồng hồ của máy người dùng có thể lệch vài giây so với máy chủ quanh thời điểm hết hạn: thử lại với trạng thái còn lại. */
  if (r.error && /Submission status is not valid/i.test(r.error.message || '')) r = await send(first === 'SUBMITTED' ? 'LATE' : 'SUBMITTED');
  const saved = await dbCall(Promise.resolve(r));
  await dbCall(EducMindDB.saveAssignmentAnswers(questions.map((q) => ({
    submission_id: saved.id,
    question_id: q.question_id,
    answer_content: answers[q.question_id],
  }))));
  if (typeof dbDraftClear === 'function') dbDraftClear('asg', a.id);
  dbAssignmentStopTimer();
  DB_ASSIGNMENT_FLOW = { ...(DB_ASSIGNMENT_FLOW || {}), assignmentId: a.id, started: false, submitted: true, index: 0 };
  DB_ASSIGNMENT_REVIEW = { assignmentId: a.id, index: 0 };
  DB.dialog = {
    title: 'Nộp bài thành công!',
    body: '<p>Bài làm của em đã được gửi. Em có thể xem lại câu trả lời bên dưới; điểm sẽ hiển thị sau khi giáo viên chấm bài.</p>',
  };
}, 'Đã nộp bài thành công.');
