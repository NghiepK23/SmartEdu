/* EducMind · js/db/05b-assignment-grading.js
   Giáo viên: quản lý câu hỏi trong bài tập, xem trước, xem bài nộp của học sinh, chấm điểm từng câu và rubric. */

function dbAssignmentTeacherQuestions(d, a) {
  const links = d.assignmentQuestions.filter((x) => x.assignment_id === a.id);
  const byId = dbById(d.assignmentQuestionDetails), used = new Set(links.map((x) => x.question_id));
  const bank = d.questions.filter((q) => !used.has(q.id));
  const locked = d.submissions.some((s) => s.assignment_id === a.id);
  const weightTotal = links.reduce((sum, link) => sum + Number(link.weight || 0), 0);
  const rows = links.map((x, i) => {
    const q = byId[x.question_id];
    return `<tr><td>${i + 1}</td><th scope="row">${q ? `<div class="db-qtext">${h(q.content)}</div><div class="muted">${h(DB_QKIND[q.kind] || q.kind)} · Đáp án: ${h(dbAnswerKeyText(q))}${q.deleted_at ? ' · Đã xóa khỏi ngân hàng' : ''}</div>` : '<span class="muted">Câu hỏi không còn trong ngân hàng.</span>'}</th>
    <td><label class="sr" for="db-aqw-${h(x.question_id)}">Điểm câu ${i + 1}</label><input id="db-aqw-${h(x.question_id)}" class="db-input-score" type="number" min="0" max="${h(a.max_score)}" step="0.01" value="${h(x.weight)}" data-change="setAssignmentQuestionWeight" data-q="${h(x.question_id)}" ${locked ? 'disabled' : ''}></td>
    <td class="db-cell-actions">${locked ? '' : dbBtn('Gỡ', 'removeAssignmentQuestion', { id: a.id, q: x.question_id }, 'light mini danger-soft')}</td></tr>`;
  });
  const picker = locked
    ? `<div class="notice">${ic('lock', 16)}<div>Đã có học sinh nộp bài nên danh sách câu hỏi bị khóa để bảo đảm công bằng.</div></div>`
    : bank.length
    ? `<form data-act="addAssignmentQuestions" data-id="${h(a.id)}" novalidate>
        <div class="db-objpick">${bank.map((q) => `<label class="objrow"><input type="checkbox" name="pick" data-multi value="${h(q.id)}"><span><span class="db-qtext">${h(q.content)}</span><span class="muted"> · ${h(DB_QKIND[q.kind] || q.kind)} · ${h(DB_QDIFF[q.difficulty] || q.difficulty)}</span></span></label>`).join('')}</div>
        <div class="row db-form-actions"><button type="submit" class="btn">Thêm câu đã chọn</button>${dbFormError()}</div>
      </form>`
    : dbEmpty(d.questions.length ? 'Đã thêm hết câu hỏi trong ngân hàng.' : 'Ngân hàng câu hỏi chưa có câu nào.');
  return `<section class="panel" aria-labelledby="db-h-asq">
    <div class="row between"><div><h2 id="db-h-asq">Câu hỏi của bài tập</h2><p class="lead">${links.length} câu · học sinh trả lời trực tiếp; câu có đáp án được tự chấm, câu trả lời ngắn/tự luận do giáo viên chấm.</p></div>
    ${locked ? '' : dbBtn(ic('plus', 16) + 'Tạo câu hỏi mới', 'go', { page: 'questions', edit: 'new', return_to: 'assignment', assignment_id: a.id }, 'light')}</div>
    ${rows.length ? `<p class="muted">Tổng điểm câu hỏi: <b>${dbNum(weightTotal)} / ${dbNum(a.max_score)}</b>. Thêm/gỡ câu hoặc đổi điểm tối đa sẽ chia điểm đều lại; bạn có thể chỉnh điểm từng câu trước khi xuất bản.</p><details class="db-assignment-question-fold" open><summary>Danh sách câu hỏi · ${links.length} câu</summary>${dbTable(['#', 'Câu hỏi', 'Điểm', '<span class="sr">Thao tác</span>'], rows, 'Câu hỏi trong bài tập')}</details>` : dbEmpty('Chưa có câu hỏi nào.')}
    ${picker}
    ${locked ? '' : `<form data-act="importQuestionFile" data-assignment-id="${h(a.id)}" class="db-form-row db-add-row" novalidate>
      <div class="field"><label class="db-label" for="db-asg-import-${h(a.id)}">Nhập câu hỏi từ Excel hoặc CSV</label>
        <input type="file" id="db-asg-import-${h(a.id)}" name="file" accept=".xlsx,.xls,.csv" class="db-input-file" aria-label="Chọn tệp câu hỏi Excel hoặc CSV">
        <div class="muted db-hint">Cần có cột Nội dung và Dạng; câu trắc nghiệm cần thêm Lựa chọn và Đáp án.</div>
      </div>
      <button type="submit" class="btn light">Nhập và thêm vào bài tập</button>
      ${dbFormError()}
    </form>`}
  </section>`;
}
DB_ACT.addAssignmentQuestions = (form) => dbRun(form, async (v) => {
  const picks = [].concat(v.pick || []).filter(Boolean);
  if (!picks.length) throw new Error('Chọn ít nhất một câu hỏi.');
  const current = DB.data.assignmentQuestions.filter((x) => x.assignment_id === form.dataset.id);
  const used = new Set(current.map((x) => x.question_id));
  const rows = [...new Set(picks)].filter((id) => !used.has(id)).map((question_id, i) => ({
    assignment_id: form.dataset.id,
    question_id,
    display_order: current.reduce((max, x) => Math.max(max, Number(x.display_order) || 0), 0) + i + 1,
  }));
  if (!rows.length) throw new Error('Các câu đã chọn đều có trong bài tập.');
  await dbCall(EducMindDB.addAssignmentQuestions(rows));
}, 'Đã thêm câu hỏi vào bài tập.');
DB_ACT.setAssignmentQuestionWeight = (el) => dbRun(el, async () => {
  const raw = String(el.value || '').trim(), a = DB.data.assignments.find((x) => x.id === DB.arg.id), weight = Number(raw.replace(',', '.'));
  if (!a || !raw || !Number.isFinite(weight) || weight < 0 || weight > Number(a.max_score) || Math.abs(weight * 100 - Math.round(weight * 100)) > 1e-8) {
    throw new Error('Điểm câu hỏi phải từ 0 đến điểm tối đa của bài, tối đa 2 chữ số thập phân.');
  }
  const updated = await dbCall(EducMindDB.updateAssignmentQuestion(a.id, el.dataset.q, { weight }));
  if (!updated.length) throw new Error('Không lưu được điểm câu hỏi.');
}, 'Đã lưu điểm câu hỏi.');
DB_ACT.removeAssignmentQuestion = (el) => dbRun(el, async () => {
  const removed = await dbCall(EducMindDB.removeAssignmentQuestion(el.dataset.id, el.dataset.q));
  if (!removed.length) throw new Error('Không gỡ được câu hỏi này.');
}, 'Đã gỡ câu hỏi khỏi bài tập.');
function dbAssignmentAnswerReview(d, a, answers, submission) {
  const links = d.assignmentQuestions.filter((x) => x.assignment_id === a.id);
  if (!links.length) return '';
  const questions = dbById(d.assignmentQuestionDetails), answerById = dbById(answers.map((x) => ({ ...x, id: x.question_id })));
  return `<div class="db-assignment-answers"><h3>Câu trả lời</h3>${links.map((link, i) => {
    const q = questions[link.question_id], answer = answerById[link.question_id];
    if (!q) return `<div><b>Câu ${i + 1}</b><p class="muted">Câu hỏi không còn trong ngân hàng.</p></div>`;
    const text = answer ? dbAnswerText(q, answer.answer_content) : '';
    const score = answer && answer.score != null ? `<p>${dbPill(`${dbNum(answer.score)} / ${dbNum(link.weight)} điểm`, Number(answer.score) >= Number(link.weight) ? 'good' : Number(answer.score) > 0 ? 'prog' : 'need')}${answer.feedback ? ` <span class="muted">${h(answer.feedback)}</span>` : ''}</p>` : '';
    const grader = submission.question_grading_enabled && !DB_QAUTO.includes(q.kind) && answer
      ? `<form data-act="gradeAssignmentAnswer" data-submission="${h(submission.id)}" data-question="${h(q.id)}" data-weight="${h(link.weight)}" class="db-grade">
          <label for="db-asg-score-${h(q.id)}">Điểm · tối đa ${dbNum(link.weight)}</label>
          <input id="db-asg-score-${h(q.id)}" name="score" type="number" min="0" max="${h(link.weight)}" step="0.01" value="${h(answer.score == null ? '' : answer.score)}" class="db-input-score" required>
          <label class="sr" for="db-asg-feedback-${h(q.id)}">Nhận xét câu ${i + 1}</label>
          <textarea id="db-asg-feedback-${h(q.id)}" name="feedback" rows="2" maxlength="2000" placeholder="Nhận xét">${h(answer.feedback || '')}</textarea>
          <button type="submit" class="btn mini">${answer.score == null ? 'Lưu điểm câu' : 'Cập nhật điểm câu'}</button>${dbFormError()}
        </form>`
      : submission.question_grading_enabled && !DB_QAUTO.includes(q.kind) && !answer ? `<p class="muted">Chưa có câu trả lời được lưu.</p>` : score;
    return `<div><b>Câu ${i + 1} · ${h(DB_QKIND[q.kind] || q.kind)} · ${dbNum(link.weight)} điểm</b><div class="db-prose">${h(q.content)}</div><p><b>Trả lời:</b> ${text ? h(text) : '<span class="muted">Chưa trả lời</span>'}</p>${submission.question_grading_enabled && DB_QAUTO.includes(q.kind) ? score || '<p class="muted">Chưa được tự chấm (cần kiểm tra đáp án đúng).</p>' : grader}</div>`;
  }).join('')}</div>`;
}
function dbToggleSubmission(button) {
  const row = button.closest('.db-submission-row');
  if (!row) return;
  const expand = !row.classList.contains('is-expanded');
  row.parentElement.querySelectorAll('.db-submission-row.is-expanded').forEach((openRow) => {
    openRow.classList.remove('is-expanded');
    openRow.querySelector('.db-submission-toggle').setAttribute('aria-expanded', 'false');
  });
  if (expand) {
    row.classList.add('is-expanded');
    button.setAttribute('aria-expanded', 'true');
  }
}
DB_ACT.toggleSubmission = (el) => dbToggleSubmission(el);
function dbAssignmentTeacherPreview(d, a) {
  const links = d.assignmentQuestions.filter((x) => x.assignment_id === a.id);
  const questions = dbById(d.assignmentQuestionDetails || []);
  const items = links.map((link, i) => {
    const q = questions[link.question_id];
    if (!q) return `<article class="db-assignment-preview-question"><h3>Câu ${i + 1}</h3><p class="muted">Câu hỏi không còn trong ngân hàng.</p></article>`;
    return `<article class="db-assignment-preview-question"><div class="row between"><h3>Câu ${i + 1} · ${h(DB_QKIND[q.kind] || q.kind)}</h3><span class="pill plain">${dbNum(link.weight)} điểm</span></div>
      <div class="db-prose">${q.kind === 'FILL_IN_BLANK' ? dbQuestionFillMarkup(q.content, q.id, null, 'preview', true) : h(q.content)}</div>${dbAssignmentPreviewResponse(q)}
    </article>`;
  });
  return `<section class="panel db-assignment-preview" aria-labelledby="db-h-ap">
    <div class="row between"><div><h2 id="db-h-ap">Xem trước bài tập</h2><p class="lead">Kiểm tra nội dung học sinh sẽ nhận trước khi xuất bản.</p></div>
      <div class="row">${dbBtn('Quay lại câu hỏi', 'go', { page: 'assignments', id: a.id }, 'light')}${dbBtn(a.status === 'PUBLISHED' ? 'Gỡ xuất bản' : 'Xuất bản', 'toggleAssignment', { id: a.id }, a.status === 'PUBLISHED' ? 'light' : 'db-work-publish')}</div></div>
    <div class="notice">${ic('info', 16)}<div><b>${h(a.title)}</b> · ${links.length} câu · ${dbNum(a.max_score)} điểm tối đa.<br>${dbDueText(a)} · ${dbAssignmentObjectives(d, a).length} mục tiêu được đánh giá.</div></div>
    ${a.description ? `<div class="db-prose">${h(a.description)}</div>` : ''}
    ${items.length ? items.join('') : `<div class="notice">${ic('info', 16)}<div>Chưa có câu hỏi trong bài tập. ${a.description ? 'Học sinh sẽ làm theo yêu cầu và có thể nộp bài viết hoặc tệp.' : 'Thêm câu hỏi hoặc yêu cầu bài tập trước khi xuất bản.'}</div></div>`}
    ${!links.length ? `<div class="field"><label>Bài làm</label><textarea rows="4" disabled placeholder="Bài làm của học sinh"></textarea><label>Tệp đính kèm</label><input type="file" disabled></div>` : ''}
  </section>`;
}
function dbAssignmentTeacherDetail(d, a) {
  const preview = DB.arg.tab === 'preview';
  if (preview) return `<section class="panel db-assignment-detail" aria-labelledby="db-h-ad">
    ${dbAssignmentSteps(a, 3)}
    <div class="row between"><div><h2 id="db-h-ad">${h(a.title)}</h2><p class="lead">${dbStatusPill(a.status)}</p></div>
      <div class="row">${dbBtn('Về danh sách', 'go', { page: 'assignments' }, 'light')}${dbBtn('Sửa thông tin', 'go', { page: 'assignments', edit: a.id }, 'light')}</div></div>
    ${dbAssignmentFacts(d, a)}
  </section>${dbAssignmentTeacherPreview(d, a)}`;
  const subs = Object.fromEntries(d.submissions.filter((s) => s.assignment_id === a.id).map((s) => [s.student_id, s]));
  const answersBySubmission = dbGroup(d.assignmentAnswers, 'submission_id');
  const rows = d.members.map((m) => {
    const p = d.profiles[m.student_id], s = subs[m.student_id];
    if (!s) return `<tr><th scope="row">${h(dbName(p))}</th><td>${dbPill('Chưa nộp', 'plain')}</td><td class="muted">—</td><td class="muted">—</td></tr>`;
    return `<tr class="db-submission-row">
      <th scope="row"><button type="button" class="db-submission-toggle" aria-expanded="false" data-act="toggleSubmission">${h(dbName(p))}<span class="muted">${dbDateTime(s.submitted_at)}${s.is_edited ? ' · đã sửa' : ''}</span></button></th>
      <td>${s.score != null ? dbPill('Đã chấm', 'good') : s.status === 'LATE' ? dbPill('Nộp muộn', 'need') : dbPill('Chờ chấm', 'prog')}</td>
      <td><span class="db-submission-collapsed muted">Bấm tên để xem bài làm</span><div class="db-submission-expanded">${s.text_content ? `<div class="db-prose">${h(s.text_content)}</div>` : ''}      ${dbAssignmentAnswerReview(d, a, answersBySubmission[s.id] || [], s)}${s.storage_path ? `<div class="db-file"><span class="db-file-name">${ic('overview', 14)}<span class="db-file-title">${h(dbSubName(s))}</span></span><span class="row db-file-actions">${dbBtn('Xem trước', 'previewSubmission', { path: s.storage_path, name: dbSubName(s) }, 'light mini')}${dbBtn('Tải tệp bài nộp', 'downloadSubmission', { path: s.storage_path, name: dbSubName(s) }, 'light mini')}</span></div>` : ''}${!s.text_content && !s.storage_path && !d.assignmentQuestions.some((x) => x.assignment_id === a.id) ? '<div class="muted">(không có nội dung văn bản)</div>' : ''}</div></td>
      <td><span class="db-submission-collapsed muted">Bấm tên để chấm</span><div class="db-submission-expanded">${dbGradeCell(d, a, p, s, answersBySubmission[s.id] || [])}</div></td>
    </tr>`;
  });
  const n = Object.keys(subs).length, graded = Object.values(subs).filter((s) => s.score != null).length;
  return `<section class="panel db-assignment-detail" aria-labelledby="db-h-ad">
    ${dbAssignmentSteps(a, 2)}
    <div class="row between"><div><h2 id="db-h-ad">${h(a.title)}</h2><p class="lead">${dbStatusPill(a.status)} · ${n}/${d.members.length} đã nộp · ${graded} đã chấm</p></div>
      <div class="row">${dbBtn('Về danh sách', 'go', { page: 'assignments' }, 'light')}${dbBtn('Sửa bài tập', 'go', { page: 'assignments', edit: a.id }, 'light')}</div></div>
    ${dbAssignmentFacts(d, a)}
  </section>
  ${dbAssignmentTeacherQuestions(d, a)}
  <section class="panel" aria-labelledby="db-h-subs">
    <h2 id="db-h-subs">Bài nộp</h2>
    <p class="lead">Điểm từ 0 đến ${dbNum(a.max_score)}. Lưu điểm xong, học sinh nhận thông báo và mức nắm vững được tính lại.</p>
    ${rows.length ? dbTable(['Học sinh', 'Trạng thái', 'Bài làm', 'Điểm và nhận xét'], rows, 'Bài nộp của học sinh') : dbEmpty('Lớp chưa có học sinh.')}
  </section>
  ${d.assignmentQuestions.some((x) => x.assignment_id === a.id) ? '' : dbRubricPanel(d, a)}`;
}

/* Tên tệp từ đường dẫn lưu trữ: bỏ phần mã số thời gian phía trước. */
const dbFileName = (p) => decodeURIComponent(String(p).split('/').pop() || '').replace(/^\d+-/, '');
/* Tên hiển thị của tệp bài nộp: ưu tiên tên gốc học sinh đã chọn khi tải lên. */
const dbSubName = (s) => s.file_name || dbFileName(s.storage_path);
/* Ô chấm điểm: có rubric thì nhập điểm từng tiêu chí (tổng là điểm bài nộp); không thì nhập điểm trực tiếp. */
function dbGradeCell(d, a, p, s, answers) {
  if (s.question_grading_enabled) {
    const links = d.assignmentQuestions.filter((x) => x.assignment_id === a.id);
    const answerById = dbById(answers.map((x) => ({ ...x, id: x.question_id })));
    const earned = links.reduce((sum, link) => sum + Number(answerById[link.question_id]?.score || 0), 0);
    const pending = links.filter((link) => !answerById[link.question_id] || answerById[link.question_id].score == null).length;
    return `<div>${s.score != null ? `<b>${dbNum(s.score)}</b> / ${dbNum(a.max_score)} · đã chấm` : `<b>${dbNum(earned)}</b> điểm đã có · ${pending} câu chờ giáo viên chấm`}</div>`;
  }
  const crits = (d.criteria || []).filter((c) => c.assignment_id === a.id);
  const scores = (d.rubricScores || []).filter((x) => x.submission_id === s.id);
  const scoreBox = crits.length
    ? `<div class="db-rubric">${crits.map((c) => { const rs = scores.find((x) => x.criterion_id === c.id); return `<label class="db-rubric-row"><span>${h(c.title)} <span class="muted">/ ${dbNum(c.max_score)}</span></span><input name="rc-${h(c.id)}" type="number" min="0" max="${h(c.max_score)}" step="0.25" value="${h(rs == null ? '' : rs.score)}" class="db-input-score" required></label>`; }).join('')}<p class="muted">Tổng điểm các tiêu chí là điểm bài nộp.</p></div>`
    : `<label class="sr" for="db-gs-${h(s.id)}">Điểm của ${h(dbName(p))}</label><input id="db-gs-${h(s.id)}" name="score" type="number" min="0" max="${h(a.max_score)}" step="0.25" value="${h(s.score == null ? '' : s.score)}" placeholder="Điểm" class="db-input-score" required><span class="muted">/ ${dbNum(a.max_score)}</span>`;
  return `<form data-act="gradeSubmission" data-id="${h(s.id)}" class="db-grade" novalidate>
    ${scoreBox}
    <label class="sr" for="db-gf-${h(s.id)}">Nhận xét cho ${h(dbName(p))}</label>
    <textarea id="db-gf-${h(s.id)}" name="feedback" rows="2" maxlength="2000" placeholder="Nhận xét">${h(s.feedback || '')}</textarea>
    <button type="submit" class="btn mini">${s.score != null ? 'Cập nhật điểm' : 'Lưu điểm'}</button>${dbFormError()}
  </form>`;
}
/* Thang điểm chi tiết (rubric) của bài tập: giáo viên đặt tiêu chí trước khi chấm. */
function dbRubricPanel(d, a) {
  const crits = (d.criteria || []).filter((c) => c.assignment_id === a.id);
  const rows = crits.map((c) => `<tr>
    <th scope="row">${h(c.title)}${c.description ? `<div class="muted">${h(c.description)}</div>` : ''}</th>
    <td>${dbNum(c.max_score)}</td>
    <td class="db-cell-actions">${dbBtn('Sửa', 'editCriterion', { id: c.id }, 'light mini')}${dbBtn('Xóa', 'deleteCriterion', { id: c.id }, 'light mini danger-soft')}</td>
  </tr>`);
  return `<section class="panel" aria-labelledby="db-h-rub">
    <h2 id="db-h-rub">Thang điểm chi tiết (rubric)</h2>
    <p class="lead">Đặt các tiêu chí chấm (ví dụ: Nội dung, Trình bày). Khi chấm, tổng điểm các tiêu chí là điểm bài nộp và học sinh thấy điểm từng tiêu chí.</p>
    ${rows.length ? dbTable(['Tiêu chí', 'Điểm tối đa', '<span class="sr">Thao tác</span>'], rows, 'Tiêu chí chấm') : dbEmpty('Chưa có tiêu chí nào. Thêm tiêu chí nếu muốn chấm điểm chi tiết.')}
    <form data-act="addCriterion" data-id="${h(a.id)}" class="db-form-row db-add-row" novalidate>
      ${dbField('Tiêu chí mới', 'db-rc-title', `<input id="db-rc-title" name="title" maxlength="200" placeholder="Ví dụ: Nội dung" required>`)}
      ${dbField('Mô tả', 'db-rc-desc', `<input id="db-rc-desc" name="description" maxlength="500" placeholder="Yêu cầu của tiêu chí">`)}
      ${dbField('Điểm tối đa', 'db-rc-max', `<input id="db-rc-max" name="max_score" type="number" min="0.5" step="0.5" value="5" required>`)}
      <button type="submit" class="btn light">Thêm tiêu chí</button>${dbFormError()}
    </form>
  </section>`;
}
DB_ACT.gradeSubmission = (form) => dbRun(form, async (v) => {
  const a = DB.data.assignments.find((x) => x.id === DB.arg.id);
  const crits = (DB.data.criteria || []).filter((c) => a && c.assignment_id === a.id);
  let score, rubricRows = null;
  if (crits.length) {
    /* Có rubric: điểm từng tiêu chí bắt buộc nhập; tổng điểm tiêu chí là điểm bài nộp. */
    rubricRows = crits.map((c) => {
      const raw = v['rc-' + c.id];
      if (raw === '' || raw == null) throw new Error('Nhập điểm cho tiêu chí “' + c.title + '”.');
      const n = Number(String(raw).replace(',', '.'));
      if (!Number.isFinite(n) || n < 0 || n > Number(c.max_score)) throw new Error('Điểm tiêu chí “' + c.title + '” phải từ 0 đến ' + dbNum(c.max_score) + '.');
      return { submission_id: form.dataset.id, criterion_id: c.id, score: n, feedback: '' };
    });
    score = rubricRows.reduce((s, r) => s + Number(r.score), 0);
    if (a && score > Number(a.max_score)) throw new Error('Tổng điểm rubric (' + dbNum(score) + ') vượt điểm tối đa của bài tập (' + dbNum(a.max_score) + '). Hãy giảm điểm tối đa của các tiêu chí.');
  } else {
    if (v.score === '') throw new Error('Nhập điểm.');
    score = Number(String(v.score).replace(',', '.'));
    if (!Number.isFinite(score) || score < 0) throw new Error('Điểm phải là số không âm.');
    if (a && score > Number(a.max_score)) throw new Error('Điểm tối đa của bài này là ' + dbNum(a.max_score) + '.');
  }
  if (rubricRows) await dbCall(EducMindDB.saveRubricScores(rubricRows));
  await dbCall(EducMindDB.gradeSubmission(form.dataset.id, { score, feedback: v.feedback || '' }));
}, 'Đã lưu điểm và nhận xét.');
DB_ACT.gradeAssignmentAnswer = (form) => dbRun(form, async (v) => {
  const raw = String(v.score || '').trim(), weight = Number(form.dataset.weight), score = Number(raw.replace(',', '.'));
  if (!raw || !Number.isFinite(score) || score < 0 || score > weight || Math.abs(score * 100 - Math.round(score * 100)) > 1e-8) {
    throw new Error('Điểm phải từ 0 đến ' + dbNum(weight) + ', tối đa 2 chữ số thập phân.');
  }
  await dbCall(EducMindDB.gradeAssignmentAnswer(
    form.dataset.submission, form.dataset.question, score, String(v.feedback || '').trim(),
  ));
}, 'Đã lưu điểm câu trả lời.');

/* ===== Thang điểm chi tiết (rubric) ===== */
DB_ACT.addCriterion = (form) => dbRun(form, async (v) => {
  const a = DB.data.assignments.find((x) => x.id === form.dataset.id);
  if (!v.title) throw new Error('Nhập tên tiêu chí.');
  const max = Number(String(v.max_score).replace(',', '.'));
  if (!(max > 0)) throw new Error('Điểm tối đa của tiêu chí phải lớn hơn 0.');
  const crits = (DB.data.criteria || []).filter((c) => a && c.assignment_id === a.id);
  await dbCall(EducMindDB.createRubricCriterion({ assignment_id: a.id, title: v.title, description: v.description || '', max_score: max, display_order: crits.reduce((m, x) => Math.max(m, x.display_order || 0), 0) + 1 }));
}, 'Đã thêm tiêu chí chấm.');
DB_ACT.editCriterion = (el) => {
  const c = (DB.data.criteria || []).find((x) => x.id === el.dataset.id);
  if (!c) return;
  dbOpenDialog({
    title: 'Sửa tiêu chí', okLabel: 'Lưu thay đổi',
    body: dbField('Tên tiêu chí', 'db-ec-title', `<input id="db-ec-title" name="title" maxlength="200" value="${h(c.title)}" required>`)
      + dbField('Mô tả', 'db-ec-desc', `<input id="db-ec-desc" name="description" maxlength="500" value="${h(c.description)}">`)
      + dbField('Điểm tối đa', 'db-ec-max', `<input id="db-ec-max" name="max_score" type="number" min="0.5" step="0.5" value="${h(c.max_score)}" required>`, 'Điểm tối đa mới không được nhỏ hơn điểm đã chấm.'),
    onOk: async (v) => {
      if (!v.title) throw new Error('Nhập tên tiêu chí.');
      const max = Number(String(v.max_score).replace(',', '.'));
      if (!(max > 0)) throw new Error('Điểm tối đa của tiêu chí phải lớn hơn 0.');
      await dbCall(EducMindDB.updateRubricCriterion(c.id, { title: v.title, description: v.description || '', max_score: max }));
      toast('Đã lưu tiêu chí.');
    },
  });
};
DB_ACT.deleteCriterion = (el) => {
  const c = (DB.data.criteria || []).find((x) => x.id === el.dataset.id);
  if (!c) return;
  if ((DB.data.rubricScores || []).some((x) => x.criterion_id === c.id)) return toast('Tiêu chí đã có điểm chấm nên không xóa được.');
  dbConfirm('Xóa tiêu chí?', `Tiêu chí “${h(c.title)}” sẽ bị xóa khỏi thang điểm của bài tập.`, 'Xóa tiêu chí', async () => {
    await dbCall(EducMindDB.deleteRubricCriterion(c.id));
    toast('Đã xóa tiêu chí.');
  }, true);
};
