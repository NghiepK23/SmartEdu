/* EducMind · js/db/05-assignments.js
   Bài tập: giáo viên tạo, gắn mục tiêu, xuất bản, xem bài nộp và chấm điểm; học sinh xem, nộp bài và xem điểm.
   Lưu ý: Điểm bài tập chia cho điểm tối đa trở thành bằng chứng học tập của từng mục tiêu gắn với bài (máy chủ tự tính). */

/* Danh sách học sinh của lớp đang chọn kèm hồ sơ (chỉ giáo viên đọc được). */
async function dbLoadRoster() {
  if (!DB.classId) return { members: [], profiles: {} };
  const members = await dbCallIn(EducMindDB.listMembers, [DB.classId]);
  const profiles = await dbCallIn(EducMindDB.listProfiles, members.map((m) => m.student_id));
  return { members, profiles: dbById(profiles) };
}
/* Trạng thái nhận bài theo thời điểm hiện tại: OPEN (còn hạn), LATE (quá hạn nhưng còn nhận bài muộn), CLOSED. */
function dbAssignmentWindow(a) {
  const now = dbNow();
  if (now <= new Date(a.due_at).getTime()) return 'OPEN';
  if (a.allow_late && a.late_close_at && now <= new Date(a.late_close_at).getTime()) return 'LATE';
  return 'CLOSED';
}
const dbDueText = (a) => 'Hạn nộp ' + dbDateTime(a.due_at) + (a.allow_late && a.late_close_at ? ' · nhận bài muộn đến ' + dbDateTime(a.late_close_at) : '');

DB_PAGES.assignments = {
  title: 'Bài tập',
  sub: () => (dbIsTeacher() ? 'Tạo bài có câu hỏi, theo dõi bài nộp và chấm điểm.' : 'Bài tập giáo viên đã giao cho lớp.'),
  leave() { dbAssignmentStopTimer(); DB_ASSIGNMENT_FLOW = null; DB_ASSIGNMENT_REVIEW = null; },
  async load() {
    const content = await dbLoadContent();
    const activeAssignments = DB.course ? await dbCall(EducMindDB.listAssignments(DB.course.id)) : [];
    const deletedAssignments = DB.course && !dbIsTeacher() ? await dbCall(EducMindDB.listDeletedAssignmentRows(DB.course.id)) : [];
    const assignments = [...activeAssignments, ...deletedAssignments];
    const ids = assignments.map((a) => a.id);
    const [links, submissions] = await Promise.all([dbCallIn(EducMindDB.listAssignmentObjectives, ids), dbCallIn(EducMindDB.listSubmissions, ids)]);
    const [criteria, rubricScores, assignmentQuestions, assignmentAnswers] = await Promise.all([
      dbCallIn(EducMindDB.listRubricCriteria, ids),
      dbCallIn(EducMindDB.listRubricScores, submissions.map((s) => s.id)),
      dbIsTeacher() ? dbCallIn(EducMindDB.listAssignmentQuestions, ids) : [],
      dbCallIn(EducMindDB.listAssignmentAnswers, submissions.map((s) => s.id)),
    ]);
    const roster = dbIsTeacher() ? await dbLoadRoster() : { members: [], profiles: {} };
    const questions = dbIsTeacher() && DB.course ? await dbCall(EducMindDB.listQuestions(DB.course.id)) : [];
    const qlinks = dbIsTeacher() ? await dbCallIn(EducMindDB.listQuestionObjectives, questions.map((q) => q.id)) : [];
    const assignmentQuestionDetails = dbIsTeacher() && DB.course ? await dbCall(EducMindDB.listAssignmentQuestionDetails(DB.course.id)) : [];
    const studentQuestions = !dbIsTeacher() && DB.arg.id ? await dbCall(EducMindDB.getAssignmentQuestions(DB.arg.id)) : [];
    return { ...content, assignments, links, submissions, criteria, rubricScores, assignmentQuestions, assignmentAnswers, questions, qlinks, assignmentQuestionDetails, studentQuestions, ...roster };  },
  view(d) {
    const T = dbIsTeacher();
    if (T && DB.arg.edit) return dbAssignmentForm(d, DB.arg.edit === 'new' ? null : d.assignments.find((a) => a.id === DB.arg.edit));
    if (DB.arg.id) {
      const a = d.assignments.find((x) => x.id === DB.arg.id);
      if (!a) return `<section class="panel">${dbEmpty('Không tìm thấy bài tập này (có thể đã bị xóa hoặc chưa xuất bản).')}${dbBtn('Về danh sách bài tập', 'go', { page: 'assignments' }, 'light')}</section>`;
      return T ? dbAssignmentTeacherDetail(d, a) : dbAssignmentStudentDetail(d, a);
    }
    return T ? dbAssignmentTeacherList(d) : dbAssignmentStudentList(d);
  },
};
const dbLessonTitle = (d, id) => { const l = d.lessons.find((x) => x.id === id); return l ? h(l.title) : ''; };
function dbAssignmentObjectives(d, a) {
  const byId = dbById(d.objectives);
  return d.links.filter((x) => x.assignment_id === a.id).map((x) => byId[x.objective_id]).filter(Boolean)
    .sort((x, y) => String(x.code || '').localeCompare(String(y.code || ''), undefined, { numeric: true, sensitivity: 'base' }));
}
function dbAssignmentSteps(a, active, creating = false) {
  const steps = [
    { n: 1, title: 'Thiết lập', arg: a && { page: 'assignments', edit: a.id } },
    { n: 2, title: 'Câu hỏi', arg: a && { page: 'assignments', id: a.id } },
    { n: 3, title: 'Xem trước', arg: a && { page: 'assignments', id: a.id, tab: 'preview' } },
  ];
  return `<ol class="db-workflow-steps" aria-label="Các bước tạo bài tập">${steps.map((s) => `<li class="${s.n === active ? 'is-current' : s.n < active ? 'is-complete' : ''}" ${s.n === active ? 'aria-current="step"' : ''}>
    ${s.n === active || s.n > active ? `<span><b>${s.n}</b> ${s.title}</span>` : creating
      ? `<button type="button" class="btn light mini" data-act="assignmentStep" data-step="${s.n}"><span><b>${s.n}</b> ${s.title}</span></button>`
      : dbBtn(`<span><b>${s.n}</b> ${s.title}</span>`, 'go', s.arg, 'light mini')}
  </li>`).join('')}</ol>`;
}
function dbAssignmentPreviewResponse(q) {
  const options = Array.isArray(q.options) ? q.options : [];
  if (q.kind === 'FILL_IN_BLANK') return '';
  if (q.kind === 'MATCHING') return dbQuestionMatchingPreview(q.options);
  if (q.kind === 'SINGLE_CHOICE' || q.kind === 'MULTIPLE_CHOICE') {
    const type = q.kind === 'SINGLE_CHOICE' ? 'radio' : 'checkbox';
    return `<div class="db-answers">${options.map((option, i) => `<label class="objrow"><input type="${type}" disabled><span class="db-assignment-choice-letter" aria-hidden="true">${dbLetter(i)}</span><span class="db-assignment-choice-text">${h(option)}</span></label>`).join('')}</div>`;
  }
  if (q.kind === 'TRUE_FALSE') {
    return `<div class="db-answers">${[['Đúng', '✓'], ['Sai', '×']].map(([label, icon]) => `<label class="objrow"><input type="radio" disabled><span class="db-assignment-choice-letter" aria-hidden="true">${icon}</span><span class="db-assignment-choice-text">${label}</span></label>`).join('')}</div>`;
  }
  return `<div class="field"><label>Bài làm</label>${q.kind === 'SHORT_ANSWER' ? '<input type="text" disabled placeholder="Câu trả lời của em">' : '<textarea rows="3" disabled placeholder="Bài làm của em"></textarea>'}</div>`;
}
function dbAssignmentCreatePreview(form) {
  const value = (name) => String(form.elements.namedItem(name)?.value || '').trim();
  const title = value('title') || 'Chưa đặt tên bài tập';
  const description = value('description');
  const lesson = form.querySelector('#db-af-lesson option:checked')?.textContent || 'Không gắn bài học';
  const due = value('due');
  const max = value('max_score') || '10';
  const late = form.querySelector('[name="allow_late"]')?.checked;
  const lateClose = value('late_close');
  const source = form.querySelector('[name="content_source"]:checked')?.value || 'BANK';
  const questions = [...form.querySelectorAll('input[name="pick"]:checked')].map((input) => DB.data.questions.find((q) => q.id === input.value)).filter(Boolean);
  const questionPreview = questions.length
    ? questions.map((q, i) => `<article class="db-assignment-preview-question"><h3>Câu ${i + 1} · ${h(DB_QKIND[q.kind] || q.kind)}</h3><div class="db-prose">${q.kind === 'FILL_IN_BLANK' ? dbQuestionFillMarkup(q.content, q.id, null, 'preview', true) : h(q.content)}</div>${dbAssignmentPreviewResponse(q)}</article>`).join('')
    : source === 'FILE'
      ? `<p class="muted">${h(form.querySelector('#db-af-file-preview')?.textContent || 'Chưa chọn tệp câu hỏi.')}</p>`
      : '<p class="muted">Chưa chọn câu hỏi. Bạn có thể tiếp tục tạo bản nháp, nhưng cần thêm câu hỏi hoặc yêu cầu trước khi xuất bản.</p>';
  return `<div class="facts db-key-facts">
      <div><span>Tên bài tập</span><b>${h(title)}</b></div><div><span>Bài học</span><b>${h(lesson)}</b></div>
      <div class="db-fact-time"><span>Hạn nộp</span><b>${h(due ? dbDateTime(dbFromLocalInput(due)) : 'Chưa chọn')}</b></div>
      <div class="db-fact-score"><span>Điểm tối đa</span><b>${h(max)} điểm</b></div>
    </div>
    <p>${description ? h(description) : '<span class="muted">Chưa có yêu cầu / hướng dẫn riêng.</span>'}</p>
    <p class="muted">${late ? `Cho phép nộp muộn đến ${h(lateClose ? dbDateTime(dbFromLocalInput(lateClose)) : 'chưa chọn thời điểm')}.` : 'Không cho phép nộp muộn.'}</p>
    <h3>Câu hỏi trong bài tập · ${questions.length}${source === 'FILE' && !questions.length ? ' + từ tệp' : ''}</h3>
    ${questionPreview}`;
}

/* ===== Giáo viên ===== */
function dbAssignmentTeacherList(d) {
  const subsBy = dbGroup(d.submissions, 'assignment_id'), questionsBy = dbGroup(d.assignmentQuestions, 'assignment_id'), total = d.members.length;
  const cards = d.assignments.map((a) => {
    const subs = subsBy[a.id] || [], waiting = subs.filter((s) => s.score == null).length, pub = a.status === 'PUBLISHED';
    const questionCount = (questionsBy[a.id] || []).length;
    return `<details class="work-card">
      <summary><div class="work-summary-head"><span class="work-detail"><b>${h(a.title)}</b></span>
        <span class="work-summary-actions"><span class="pill prog">${questionCount ? questionCount + ' câu hỏi' : 'Chưa có câu hỏi'}</span> ${dbStatusPill(a.status)} <span class="pill plain">Mở thao tác</span></span>
      </div><div class="db-work-meta">
        <span><small>Bài học</small><b>${h(dbLessonTitle(d, a.lesson_id) || 'Chưa gắn bài học')}</b></span>
        <span><small>Hạn nộp</small><b>${dbDateTime(a.due_at)}</b></span>
        <span><small>Điểm tối đa</small><b>${dbNum(a.max_score)} điểm</b></span>
        <span><small>Bài nộp</small><b>${subs.length}/${total} đã nộp${waiting ? ` · ${waiting} chờ chấm` : ''}</b></span>
      </div></summary>
      <div class="work-actions">${dbBtn('Mở bài tập', 'go', { page: 'assignments', id: a.id }, 'light mini')}${dbBtn(pub ? 'Gỡ xuất bản' : 'Xuất bản', 'toggleAssignment', { id: a.id }, pub ? 'light mini' : 'mini db-work-publish')}${dbBtn('Sửa thông tin', 'go', { page: 'assignments', edit: a.id }, 'light mini')}${dbBtn('Xóa', 'deleteAssignment', { id: a.id }, 'light mini danger-soft')}</div>
      ${a.description ? `<p class="muted">${h(a.description)}</p>` : ''}
    </details>`;
  });
  return `<section class="panel" aria-labelledby="db-h-asg">
    <div class="row between"><div><h2 id="db-h-asg">Bài tập của lớp</h2><p class="lead">${d.assignments.length} bài tập · mở từng thẻ để quản lý câu hỏi, bài nộp và điểm.</p></div></div>
    ${cards.length ? cards.join('') : dbEmpty('Chưa có bài tập nào.')}
  </section>`;
}

function dbAssignmentForm(d, a) {
  if (DB.arg.edit !== 'new' && !a) return `<section class="panel">${dbEmpty('Không tìm thấy bài tập cần sửa.')}</section>`;
  const picked = new Set(a ? d.links.filter((x) => x.assignment_id === a.id).map((x) => x.objective_id) : []);
  const defDue = new Date(dbNow() + 7 * 86400000); defDue.setHours(23, 59, 0, 0);
  const linkedQuestions = new Set(a ? d.assignmentQuestions.filter((x) => x.assignment_id === a.id).map((x) => x.question_id) : []);
  const questionBank = d.questions.filter((q) => !linkedQuestions.has(q.id));
  const locked = a && d.submissions.some((s) => s.assignment_id === a.id);
  const minimum = new Date(dbNow()).toISOString();
  /* Bài học của từng câu hỏi = bài học chứa các mục tiêu mà câu đó gắn. Câu chưa gắn mục tiêu thì không rõ thuộc bài nào. */
  const objById = dbById(d.objectives), qlinksBy = dbGroup(d.qlinks || [], 'question_id');
  const lessonsOfQ = (qid) => [...new Set((qlinksBy[qid] || []).map((x) => objById[x.objective_id]).filter(Boolean).map((o) => o.lesson_id))];
  const initLesson = a && a.lesson_id ? a.lesson_id : '';
  const bankRows = questionBank.map((q) => { const ls = lessonsOfQ(q.id); return { q, ls, hide: !!(initLesson && ls.length && !ls.includes(initLesson)) }; });
  const shownInit = bankRows.filter((r) => !r.hide).length;
  const sourceChoices = !a ? `<fieldset class="db-create-source-fieldset">
      <legend class="db-label">Bắt đầu bằng cách nào?</legend>
      <div class="db-create-source db-create-source-compact">
        <label class="db-create-source-card"><input type="radio" name="content_source" value="BANK" checked data-change="assignmentSource"><span><b>Ngân hàng câu hỏi</b><small>Chọn câu đã có hoặc tạo thêm câu riêng.</small></span></label>
        <label class="db-create-source-card"><input type="radio" name="content_source" value="FILE" data-change="assignmentSource"><span><b>Excel hoặc Word</b><small>Tải tệp mẫu, nhập câu hỏi rồi xem lại.</small></span></label>
      </div>
    </fieldset>` : '';
  const fileSource = !a ? `<section class="db-assignment-source" data-assignment-source-panel="FILE" hidden>
      <h3>Nhập câu hỏi từ Excel hoặc Word</h3>
      <p class="muted">Tệp sẽ được kiểm tra trước; câu hỏi hợp lệ được lưu vào ngân hàng và thêm vào bài tập nháp.</p>
      <label class="db-label" for="db-af-file">Tệp câu hỏi (.xlsx, .xls, .csv, .docx)</label>
      <input id="db-af-file" type="file" accept=".xlsx,.xls,.csv,.docx" data-change="assignmentImportPreview" aria-label="Chọn tệp câu hỏi Excel hoặc Word">
      <div class="row db-source-actions">
        <button type="button" class="btn light" data-act="downloadTemplate" data-kind="questions" data-format="excel">Tải mẫu Excel</button>
        <button type="button" class="btn light" data-act="downloadTemplate" data-kind="questions" data-format="word">Tải mẫu Word</button>
      </div>
      <p class="muted db-hint" id="db-af-file-preview" role="status">Chưa chọn tệp.</p>
    </section>
    ` : '';
  return `<section class="panel" aria-labelledby="db-h-af">
    <h2 id="db-h-af">${a ? 'Sửa bài tập' : 'Tạo bài tập'}</h2>
    <p class="lead">${a ? 'Sửa thông tin bài tập và câu hỏi. Học sinh chỉ thấy bài sau khi xuất bản.' : 'Thiết lập bài tập, chọn câu hỏi rồi xem lại trước khi tạo bản nháp.'}</p>
    <form data-act="saveAssignment" data-id="${h(a ? a.id : '')}" data-step="1" novalidate>
      ${dbAssignmentSteps(a, 1, !a)}
      ${!a ? '<section class="db-assignment-step-panel" data-assignment-step-panel="1" aria-label="Thiết lập bài tập">' : ''}
      ${dbField('Tên bài tập', 'db-af-title', `<input id="db-af-title" name="title" maxlength="200" value="${h(a ? a.title : '')}" required>`)}
      ${dbField('Yêu cầu / hướng dẫn (không phải câu hỏi)', 'db-af-desc', `<textarea id="db-af-desc" name="description" rows="5" maxlength="5000">${h(a ? a.description : '')}</textarea>`)}
      <div class="db-form-grid">
        ${dbField('Bài học', 'db-af-lesson', `<select id="db-af-lesson" name="lesson_id" data-change="assignmentLessonPick" data-apply><option value="">Không gắn bài học</option>${d.lessons.map((l) => `<option value="${h(l.id)}" ${a && a.lesson_id === l.id ? 'selected' : ''}>${h(l.title)}</option>`).join('')}</select>`)}
        ${dbField('Hạn nộp', 'db-af-due', dbDatetimeField('db-af-due', 'due', a ? a.due_at : defDue.toISOString(), '', minimum))}
        ${dbField('Điểm tối đa', 'db-af-max', `<input id="db-af-max" name="max_score" type="number" min="0.5" step="0.5" value="${h(a ? a.max_score : 10)}" required>`)}
      </div>
      <div class="db-form-grid db-late-grid">
        <div class="field"><label class="db-check"><input type="checkbox" id="db-af-late" name="allow_late" ${a && a.allow_late ? 'checked' : ''}> Cho phép nộp muộn</label></div>
        ${dbField('Nhận bài muộn đến', 'db-af-lateclose', dbDatetimeField('db-af-lateclose', 'late_close', a ? a.late_close_at : '', '', minimum), 'Chỉ dùng khi cho phép nộp muộn; phải sau hạn nộp.')}
      </div>
      ${!a ? '</section><section class="db-assignment-step-panel" data-assignment-step-panel="2" aria-label="Chọn câu hỏi" hidden>' : ''}
      ${sourceChoices}
      ${fileSource}
      <section class="panel ab-sec db-asg-bank" aria-labelledby="db-h-af-bank" ${!a ? 'data-assignment-source-panel="BANK"' : ''}>
        <div class="ab-sec-head"><div><h3 id="db-h-af-bank">Câu hỏi trong bài tập</h3><p class="lead">Chọn một hoặc nhiều câu từ ngân hàng; dạng câu hỏi và đáp án sẽ được giữ nguyên.</p></div><span class="ab-sum">${linkedQuestions.size} đã thêm · ${questionBank.length} có thể chọn</span></div>
        ${locked ? `<div class="notice">${ic('lock', 16)}<div>Bài đã có học sinh nộp nên không thể thay đổi danh sách câu hỏi.</div></div>` : questionBank.length ? `<details class="db-bankfold" open>
          <summary><span class="db-bankfold-title">Ngân hàng câu hỏi</span><span class="pill plain db-bankfold-count">0 câu được chọn</span><span class="db-bankfold-hint"><span class="when-open">Thu gọn</span><span class="when-closed">Mở rộng</span></span></summary>
          <div class="ab-tools">
            <div class="selectbox"><label for="db-af-q-lesson">Lọc theo bài học</label><select id="db-af-q-lesson" data-change="filterAssignmentBank"><option value="">Mọi bài học</option>${d.lessons.map((l) => `<option value="${h(l.id)}" ${initLesson === l.id ? 'selected' : ''}>${h(l.title)}</option>`).join('')}</select></div>
            <div class="selectbox"><label for="db-af-q-kind">Lọc theo dạng</label><select id="db-af-q-kind" data-change="filterAssignmentBank"><option value="">Mọi dạng</option>${Object.entries(DB_QKIND).map(([k, v]) => `<option value="${h(k)}">${h(v)}</option>`).join('')}</select></div>
            <div class="selectbox"><label for="db-af-q-search">Tìm trong ngân hàng</label><input id="db-af-q-search" type="search" data-input="filterAssignmentBank" placeholder="Nội dung câu hỏi"></div>
          </div>
          <p class="muted db-hint" id="db-af-q-shown" role="status">Đang hiển thị ${shownInit}/${questionBank.length} câu. Câu chưa gắn mục tiêu luôn được hiển thị.</p>
          <div class="ab-bank" id="db-af-question-bank">${bankRows.map(({ q, ls, hide }) => `<label class="item qrow" data-assignment-bank-item data-qkind="${h(q.kind)}" data-qlessons="${h(ls.join(' '))}" data-qtext="${h((q.content || '').toLocaleLowerCase())}" ${hide ? 'hidden' : ''}>
            <input type="checkbox" name="pick" data-multi value="${h(q.id)}" data-change="assignmentPickCount" data-apply>
            <span><b>${h(q.content)}</b><span class="muted" style="display:block">${h(DB_QKIND[q.kind] || q.kind)} · ${h(DB_QDIFF[q.difficulty] || q.difficulty)}${q.grade ? ' · Khối ' + h(q.grade) : ''}</span></span>
          </label>`).join('')}</div>
        </details>` : dbEmpty(d.questions.length ? 'Các câu trong ngân hàng đã được thêm vào bài tập.' : 'Ngân hàng chưa có câu hỏi. Lưu bài tập trước, sau đó tạo câu mới hoặc nhập Excel/CSV ngay trong chi tiết bài tập.')}
      </section>
      <div class="field"><span class="db-label">Mục tiêu được đánh giá qua bài tập này</span>${dbObjectivePicker(d, 'objectives', picked, null, { fold: true, open: a ? a.lesson_id : null })}</div>
      ${!a ? `</section><section class="db-assignment-step-panel" data-assignment-step-panel="3" aria-labelledby="db-h-af-preview" hidden>
        <h3 id="db-h-af-preview">Xem trước bài tập</h3><p class="lead">Kiểm tra thông tin và câu hỏi trước khi tạo bản nháp.</p>
        <div class="db-assignment-create-preview"></div>
      </section>` : ''}
      ${dbFormError()}
      <div class="row db-form-actions">${a
        ? `${dbBtn('Hủy', 'go', { page: 'assignments' }, 'light')}<button type="submit" class="btn">Lưu thay đổi</button>`
        : `${dbBtn('Hủy', 'go', { page: 'assignments' }, 'light')}<button type="button" class="btn light" data-act="assignmentStep" data-dir="-1" hidden>Quay lại</button><button type="button" class="btn" data-act="assignmentStep" data-dir="1">Tiếp tục</button><button type="submit" class="btn" data-assignment-submit hidden>Tạo bài tập nháp</button>`}</div>
    </form>
  </section>`;
}
DB_ACT.filterAssignmentBank = () => {
  const kind = document.getElementById('db-af-q-kind')?.value || '';
  const lesson = document.getElementById('db-af-q-lesson')?.value || '';
  const query = (document.getElementById('db-af-q-search')?.value || '').trim().toLocaleLowerCase();
  const rows = [...document.querySelectorAll('#db-af-question-bank [data-assignment-bank-item]')];
  let shown = 0;
  rows.forEach((row) => {
    const ls = (row.dataset.qlessons || '').split(' ').filter(Boolean);
    const miss = (kind && row.dataset.qkind !== kind) || (query && !row.dataset.qtext.includes(query)) || (lesson && ls.length && !ls.includes(lesson));
    row.hidden = !!miss;
    if (!miss) shown++;
  });
  const note = document.getElementById('db-af-q-shown');
  if (note) note.textContent = `Đang hiển thị ${shown}/${rows.length} câu. Câu chưa gắn mục tiêu luôn được hiển thị.`;
};
/* Đổi ô "Bài học": đồng bộ bộ lọc ngân hàng, mở nhóm mục tiêu của bài đó và thu gọn các nhóm còn lại. */
DB_ACT.assignmentLessonPick = async (el, ev) => {
  const form = el.closest('form');
  if (!form) return;
  if (ev) { const bank = form.querySelector('#db-af-q-lesson'); if (bank) bank.value = el.value; }
  if (el.value) form.querySelectorAll('.db-objgrp').forEach((g) => { g.open = g.dataset.lesson === el.value; });
  DB_ACT.filterAssignmentBank();
  const fileInput = form.querySelector('#db-af-file');
  if (fileInput && fileInput.files && fileInput.files[0]) await DB_ACT.assignmentImportPreview(fileInput);
};
DB_ACT.assignmentSource = (el) => {
  const form = el.closest('form');
  if (!form) return;
  form.querySelectorAll('[data-assignment-source-panel]').forEach((panel) => { panel.hidden = panel.dataset.assignmentSourcePanel !== el.value; });
};
DB_ACT.assignmentStep = (el) => {
  const form = el.closest('form');
  if (!form) return;
  const current = Number(form.dataset.step) || 1;
  const requested = Number(el.dataset.step);
  const next = Number.isInteger(requested) ? requested : current + Number(el.dataset.dir || 0);
  if (next < 1 || next > 3) return;
  if (next > current && current === 1) {
    const title = String(form.elements.namedItem('title')?.value || '').trim();
    const due = dbFromLocalInput(form.elements.namedItem('due')?.value);
    const max = Number(form.elements.namedItem('max_score')?.value);
    if (!title) { toast('Nhập tên bài tập trước khi tiếp tục.'); form.querySelector('#db-af-title')?.focus(); return; }
    if (!due) { toast('Chọn hạn nộp hợp lệ trước khi tiếp tục.'); form.querySelector('#db-af-due')?.focus(); return; }
    if (new Date(due) < new Date(dbNow())) { toast('Hạn nộp không được ở quá khứ.'); form.querySelector('#db-af-due')?.focus(); return; }
    if (!(max > 0)) { toast('Điểm tối đa phải lớn hơn 0.'); form.querySelector('#db-af-max')?.focus(); return; }
    if (form.querySelector('[name="allow_late"]')?.checked) {
      const lateClose = dbFromLocalInput(form.elements.namedItem('late_close')?.value);
      if (new Date(lateClose) < new Date(dbNow())) { toast('Thời điểm ngừng nhận bài muộn không được ở quá khứ.'); form.querySelector('#db-af-lateclose')?.focus(); return; }
      if (!lateClose || new Date(lateClose) <= new Date(due)) { toast('Thời điểm ngừng nhận bài muộn phải sau hạn nộp.'); form.querySelector('#db-af-lateclose')?.focus(); return; }
    }
  }
  form.dataset.step = String(next);
  form.querySelectorAll('[data-assignment-step-panel]').forEach((panel) => { panel.hidden = Number(panel.dataset.assignmentStepPanel) !== next; });
  form.querySelectorAll('.db-workflow-steps li').forEach((item, index) => {
    const step = index + 1, currentStep = step === next;
    item.classList.toggle('is-current', currentStep);
    item.classList.toggle('is-complete', step < next);
    if (currentStep) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
  });
  const back = form.querySelector('[data-dir="-1"]'), forward = form.querySelector('[data-dir="1"]'), submit = form.querySelector('[data-assignment-submit]');
  if (back) back.hidden = next === 1;
  if (forward) forward.hidden = next === 3;
  if (submit) submit.hidden = next !== 3;
  if (next === 3) {
    const preview = form.querySelector('.db-assignment-create-preview');
    if (preview) preview.innerHTML = dbAssignmentCreatePreview(form);
  }
  const heading = form.querySelector(`[data-assignment-step-panel="${next}"] h3`);
  if (heading) heading.focus({ preventScroll: true });
};
DB_ACT.assignmentImportPreview = async (el) => {
  const form = el.form, preview = form && form.querySelector('#db-af-file-preview');
  const file = el.files && el.files[0];
  if (!preview) return;
  const revision = String((Number(form.dataset.importPreviewRevision) || 0) + 1);
  form.dataset.importPreviewRevision = revision;
  if (!file) { preview.textContent = 'Chưa chọn tệp.'; return; }
  const lessonId = form.querySelector('#db-af-lesson')?.value;
  preview.textContent = 'Đang đọc tệp…';
  const result = await dbReadQuestionImport(file, lessonId);
  if (form.dataset.importPreviewRevision !== revision || form.querySelector('#db-af-file')?.files?.[0] !== file) return;
  const sample = result.parsed.slice(0, 3).map((x, i) => `${i + 1}. ${x.row.content}`).join(' · ');
  const objectiveWarnings = [
    result.unknownCodes.length ? `Không nhận diện mã mục tiêu: ${result.unknownCodes.join(', ')}.` : '',
    result.ambiguousCodes.length ? `Mã mục tiêu trùng giữa nhiều bài học, hãy điền đúng tên bài học trong tệp để phân giải: ${result.ambiguousCodes.join(', ')}.` : '',
    result.unknownLessons.length ? `Không nhận diện bài học: ${result.unknownLessons.join(', ')}.` : '',
    result.ambiguousLessons.length ? `Tên bài học trùng, không thể phân giải: ${result.ambiguousLessons.join(', ')}.` : '',
  ].filter(Boolean).join(' ');
  preview.textContent = `Đọc được ${result.parsed.length} câu${result.skipped.length ? `; bỏ qua ${result.skipped.length} dòng lỗi` : ''}.${sample ? ` Ví dụ: ${sample}` : ''}${objectiveWarnings ? ' ' + objectiveWarnings : ''}`;
  form.dataset.importFileName = file.name;
  form.dataset.importFileSize = String(file.size);
  form.dataset.importFileModified = String(file.lastModified);
};
/* Cập nhật số mục tiêu đã chọn trên tiêu đề nhóm. */
DB_ACT.objGroupCount = (el) => {
  const g = el.closest('.db-objgrp');
  if (!g) return;
  const n = g.querySelectorAll('input[type="checkbox"]:checked').length, pill = g.querySelector('.db-objgrp-count');
  pill.textContent = n + '/' + pill.dataset.total + ' đã chọn';
  pill.classList.toggle('prog', n > 0);
  pill.classList.toggle('plain', n === 0);
  g.classList.toggle('has-picked', n > 0);
};
/* Đếm số câu đã tick trên tiêu đề khối ngân hàng. */
DB_ACT.assignmentPickCount = (el) => {
  const box = el.closest('.db-bankfold');
  if (!box) return;
  const n = box.querySelectorAll('input[name="pick"]:checked').length, pill = box.querySelector('.db-bankfold-count');
  pill.textContent = n + ' câu được chọn';
  pill.classList.toggle('prog', n > 0);
  pill.classList.toggle('plain', n === 0);
};
DB_ACT.saveAssignment = (form) => dbRun(form, async (v) => {
  const id = form.dataset.id;
  const isNewAssignment = !id || form.dataset.newFlow === '1';
  if (!id && form.dataset.step !== '3') throw new Error('Hoàn tất bước xem trước trước khi tạo bài tập.');
  const source = isNewAssignment ? (form.dataset.contentSource || v.content_source || 'BANK') : 'BANK';
  if (!v.title) throw new Error('Nhập tên bài tập.');
  const due = dbFromLocalInput(v.due);
  if (!due) throw new Error('Chọn hạn nộp.');
  if (new Date(due) < new Date(dbNow())) throw new Error('Hạn nộp không được ở quá khứ.');
  const max = Number(v.max_score);
  if (!(max > 0)) throw new Error('Điểm tối đa phải lớn hơn 0.');
  let importDraft = null;
  if (isNewAssignment && source === 'FILE') {
    const file = form.querySelector('#db-af-file')?.files?.[0];
    if (!file) throw new Error('Chọn tệp câu hỏi Excel hoặc Word trước khi lưu.');
    importDraft = await dbReadQuestionImport(file, v.lesson_id);
  }
  let lateClose = null;
  if (v.allow_late) {
    lateClose = dbFromLocalInput(v.late_close);
    if (!lateClose) throw new Error('Chọn thời điểm ngừng nhận bài muộn.');
    if (new Date(lateClose) < new Date(dbNow())) throw new Error('Thời điểm ngừng nhận bài muộn không được ở quá khứ.');
    if (new Date(lateClose) <= new Date(due)) throw new Error('Thời điểm ngừng nhận bài muộn phải sau hạn nộp.');
  }
  const course = await dbEnsureCourse();
  const row = { title: v.title, description: v.description || '', lesson_id: v.lesson_id || null, due_at: due, allow_late: !!v.allow_late, late_close_at: lateClose, max_score: max };
  let a;
  if (id) { a = await dbCall(EducMindDB.updateAssignment(id, { ...row, topic_id: null })); }
  else a = await dbCall(EducMindDB.createAssignment({ ...row, course_id: course.id }));
  form.dataset.id = a.id;
  if (isNewAssignment) {
    form.dataset.newFlow = '1';
    form.dataset.contentSource = source;
  }
  const questionIds = source === 'BANK' ? [...new Set([].concat(v.pick || []).filter(Boolean))] : [];
  let addedQuestions = 0;
  let imported = [];
  if (importDraft) {
    const file = form.querySelector('#db-af-file')?.files?.[0];
    const importKey = file ? [file.name, file.size, file.lastModified].join('|') : '';
    let importedIds = [];
    if (form.dataset.importKey === importKey) {
      try { importedIds = JSON.parse(form.dataset.importedQuestionIds || '[]'); } catch (_) { importedIds = []; }
    }
    if (importedIds.length === importDraft.parsed.length) imported = importedIds.map((questionId) => ({ id: questionId }));
    else {
      imported = await dbCall(EducMindDB.createQuestions(importDraft.parsed.map((x) => x.row)));
      if (imported.length !== importDraft.parsed.length) throw new Error('Máy chủ không trả đủ mã câu hỏi đã nhập; hãy tải lại trang để kiểm tra trước khi nhập lại.');
      form.dataset.importKey = importKey;
      form.dataset.importedQuestionIds = JSON.stringify(imported.map((q) => q.id));
    }
    const existingObjectiveLinks = await dbCallIn(EducMindDB.listQuestionObjectives, imported.map((q) => q.id));
    const linkedObjectives = new Set(existingObjectiveLinks.map((x) => `${x.question_id}:${x.objective_id}`));
    const objectiveLinks = importDraft.parsed.flatMap((item, i) => item.objectiveIds.map((objective_id) => ({ question_id: imported[i].id, objective_id })));
    const missingObjectiveLinks = objectiveLinks.filter((x) => !linkedObjectives.has(`${x.question_id}:${x.objective_id}`));
    if (missingObjectiveLinks.length) await dbCall(EducMindDB.addQuestionObjectives(missingObjectiveLinks));
    const links = await dbCall(EducMindDB.listAssignmentQuestions([a.id]));
    const linkedQuestions = new Set(links.map((x) => x.question_id));
    const unlinkedQuestions = imported.filter((q) => !linkedQuestions.has(q.id));
    let order = links.reduce((maxOrder, x) => Math.max(maxOrder, Number(x.display_order) || 0), 0);
    if (unlinkedQuestions.length) await dbCall(EducMindDB.addAssignmentQuestions(unlinkedQuestions.map((q) => ({ assignment_id: a.id, question_id: q.id, display_order: ++order }))));
    addedQuestions = unlinkedQuestions.length;
  }
  if (questionIds.length) {
    const available = new Set(DB.data.questions.map((q) => q.id));
    if (questionIds.some((questionId) => !available.has(questionId))) throw new Error('Một câu được chọn không còn trong ngân hàng của lớp. Hãy tải lại trang rồi thử lại.');
    const currentQuestions = await dbCall(EducMindDB.listAssignmentQuestions([a.id]));
    const used = new Set(currentQuestions.map((x) => x.question_id));
    const newQuestions = questionIds.filter((questionId) => !used.has(questionId));
    let order = currentQuestions.reduce((max, x) => Math.max(max, Number(x.display_order) || 0), 0);
    if (newQuestions.length) {
      await dbCall(EducMindDB.addAssignmentQuestions(newQuestions.map((question_id) => ({
        assignment_id: a.id,
        question_id,
        display_order: ++order,
      }))));
      addedQuestions = newQuestions.length;
    }
  }
  const current = id
    ? isNewAssignment
      ? (await dbCall(EducMindDB.listAssignmentObjectives([a.id]))).map((x) => x.objective_id)
      : DB.data.links.filter((x) => x.assignment_id === id).map((x) => x.objective_id)
    : [];
  const assignmentObjectives = new Set([].concat(v.objectives || []));
  if (importDraft) importDraft.parsed.forEach((item) => item.objectiveIds.forEach((objectiveId) => assignmentObjectives.add(objectiveId)));
  await dbSyncLinks(current, [...assignmentObjectives],
    (add) => dbCall(EducMindDB.addAssignmentObjectives(add.map((o) => ({ assignment_id: a.id, objective_id: o })))),
    (rem) => dbCall(EducMindDB.removeAssignmentObjectives(a.id, rem)));
  toast(id ? `Đã lưu bài tập${addedQuestions ? ' và thêm ' + addedQuestions + ' câu hỏi' : ''}.` : `Đã tạo bài tập (bản nháp)${addedQuestions ? ' và thêm ' + addedQuestions + ' câu hỏi' : ''}. Hãy hoàn thiện nội dung trước khi xuất bản.`);
  await dbGo('assignments', { id: a.id, ...(!id ? { tab: 'preview' } : {}) });
  return false;
});
DB_ACT.toggleAssignment = (el) => dbRun(el, async () => {
  const a = DB.data.assignments.find((x) => x.id === el.dataset.id), pub = a.status === 'PUBLISHED';
  if (!pub) {
    const links = DB.data.assignmentQuestions.filter((x) => x.assignment_id === a.id);
    const hasQuestions = links.length > 0;
    if (!hasQuestions && !(a.description || '').trim()) throw new Error('Hãy thêm ít nhất một câu hỏi hoặc nhập yêu cầu bài tập trước khi xuất bản.');
    if (hasQuestions && Math.round(links.reduce((sum, x) => sum + Number(x.weight || 0), 0) * 100) !== Math.round(Number(a.max_score) * 100)) {
      throw new Error('Tổng điểm các câu hỏi phải bằng điểm tối đa của bài tập.');
    }
    const byId = dbById(DB.data.assignmentQuestionDetails || []);
    const missingAnswer = links.find((x) => {
      const q = byId[x.question_id];
      if (!q || !DB_QAUTO.includes(q.kind)) return false;
      if (q.correct_answer == null || q.correct_answer === '') return true;
      return ['MULTIPLE_CHOICE', 'FILL_IN_BLANK', 'MATCHING'].includes(q.kind)
        && (!Array.isArray(q.correct_answer) || q.correct_answer.length === 0);
    });
    if (missingAnswer) throw new Error('Hãy cấu hình đáp án đúng cho mọi câu hỏi tự chấm trước khi xuất bản.');
  }
  await dbCall(EducMindDB.updateAssignment(a.id, { status: pub ? 'DRAFT' : 'PUBLISHED' }));
  toast(pub ? 'Đã gỡ xuất bản bài tập.' : 'Đã xuất bản bài tập. Học sinh trong lớp nhận được thông báo.');
});
DB_ACT.deleteAssignment = (el) => {
  const a = DB.data.assignments.find((x) => x.id === el.dataset.id);
  dbConfirm('Xóa bài tập?', `Bài tập “${h(a.title)}” sẽ bị ẩn khỏi lớp. Bài nộp và điểm đã có vẫn được giữ trong cơ sở dữ liệu.`, 'Xóa bài tập', async () => {
    await dbCall(EducMindDB.updateAssignment(a.id, { deleted_at: new Date().toISOString() }));
    toast('Đã xóa bài tập.');
  }, true);
};
DB_ACT.deleteUngradedSubmission = (el) => {
  const submission = (DB.data.submissions || []).find((s) => s.id === el.dataset.id);
  if (!submission) return;
  dbConfirm('Xóa bài nộp chưa chấm?', 'Bài nộp và tệp đính kèm sẽ được xóa khỏi danh sách chờ chấm. Em vẫn có thể nộp lại trong thời hạn còn lại.', 'Xóa bài nộp', async () => {
    await dbCall(EducMindDB.deleteUngradedSubmission(submission.id));
    if (submission.storage_path) {
      try { await EducMindDB.removeSubmissionFile(submission.storage_path); } catch (_) {}
    }
    await dbReload();
    toast('Đã xóa bài nộp chưa chấm. Em có thể nộp lại.');
  }, true);
};

function dbAssignmentFacts(d, a) {
  const objs = dbAssignmentObjectives(d, a);
  return `<div class="facts db-key-facts">
      <div class="db-fact-time"><span>Hạn nộp</span><b>${dbDateTime(a.due_at)}</b></div>
      <div><span>Nộp muộn</span><b>${a.allow_late ? 'Đến ' + dbDateTime(a.late_close_at) : 'Không nhận'}</b></div>
      <div class="db-fact-score"><span>Điểm tối đa</span><b>${dbNum(a.max_score)}</b></div>
      <div class="db-fact-lesson"><span>Bài học</span><b>${dbLessonTitle(d, a.lesson_id) || 'Chưa gắn bài học'}</b></div>
    </div>
    ${a.description ? `<div class="db-prose">${h(a.description)}</div>` : ''}
    ${objs.length ? `<div class="db-objlist"><span class="db-label">Mục tiêu được đánh giá</span><ul>${objs.map((o) => `<li>${dbObjLabel(o)}</li>`).join('')}</ul></div>` : (dbIsTeacher() ? `<p class="muted">Bài tập chưa gắn mục tiêu nên điểm sẽ không được tính vào mức nắm vững.</p>` : '')}`;
}
