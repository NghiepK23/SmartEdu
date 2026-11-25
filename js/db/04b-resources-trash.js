/* EducMind · js/db/04b-resources-trash.js
   Tài liệu bài học (tệp tải lên, liên kết, xem trước) và Thùng rác của lớp (khôi phục / xóa vĩnh viễn). */

/* Thùng rác của lớp: chủ đề / bài học / bài tập / câu hỏi đã xóa mềm, chờ khôi phục. */
async function dbLoadTrash() {
  if (!DB.course) return { trash: [] };
  const [topics, lessons, assignments, questions] = await Promise.all([
    dbCall(EducMindDB.listDeletedTopics(DB.course.id)), dbCall(EducMindDB.listDeletedLessons(DB.course.id)),
    dbCall(EducMindDB.listDeletedAssignments(DB.course.id)), dbCall(EducMindDB.listDeletedQuestions(DB.course.id)),
  ]);
  return { trash: [
    ...topics.map((x) => ({ ...x, type: 'topic', label: 'Chủ đề' })),
    ...lessons.map((x) => ({ ...x, type: 'lesson', label: 'Bài học' })),
    ...assignments.map((x) => ({ ...x, type: 'assignment', label: 'Bài tập' })),
    ...questions.map((x) => ({ ...x, type: 'question', label: 'Câu hỏi', title: x.content })),
  ] };
}

/* ===== Xem trước tài liệu =====
   Nhận dạng nhóm tệp theo ĐUÔI TỆP trước (trình duyệt hay để trống MIME với .h, .cpp, .py…),
   rồi mới tới MIME. Nhóm 'office' và 'other' không xem trước được trong trình duyệt → tải xuống. */
const DB_FILE_KINDS = {
  image: 'png jpg jpeg gif webp avif bmp svg',
  pdf: 'pdf',
  video: 'mp4 webm ogv mov m4v',
  audio: 'mp3 wav ogg oga m4a aac flac opus',
  code: 'txt csv md json js ts jsx tsx html htm css scss less py java c cpp cc cxx h hpp hh cs php rb go rs sql xml yml yaml sh bat ps1 ini toml cfg lua kt swift r pl vue dart gradle log env',
  office: 'doc docx xls xlsx ppt pptx docm xlsm pptm odt ods odp rtf epub',
};
function dbFileKind(name, mime) {
  const ext = (String(name || '').split('.').pop() || '').toLowerCase();
  const m = String(mime || '').toLowerCase();
  for (const k of ['image', 'pdf', 'video', 'audio', 'office']) {
    if (DB_FILE_KINDS[k].split(' ').includes(ext)) return k;
  }
  if (DB_FILE_KINDS.code.split(' ').includes(ext)) return 'code';
  if (m.startsWith('image/')) return 'image';
  if (m === 'application/pdf') return 'pdf';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('text/')) return 'code';
  return 'other';
}
/* Mã video YouTube từ nhiều dạng liên kết: watch?v=, youtu.be/, shorts/, embed/, live/. */
function dbYoutubeId(url) {
  const m = String(url || '').match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/);
  return m ? m[1] : '';
}
/* Thân hộp thoại xem trước cho tệp đã có URL (đã ký) hoặc không xem trước được. */
function dbPreviewBody(kind, url, name, dlAct, path) {
  const dl = dbBtn('Tải xuống', dlAct, { path, name }, 'light');
  const cap = `<p class="muted">${h(name)}</p>`;
  if (kind === 'image') return `<div class="db-preview"><img src="${h(url)}" alt="${h(name)}">${cap}<div class="row">${dl}</div></div>`;
  if (kind === 'pdf') return `<div class="db-preview"><iframe class="db-preview-frame" src="${h(url)}" title="${h(name)}"></iframe>${cap}<div class="row">${dl}</div></div>`;
  if (kind === 'video') return `<div class="db-preview"><video class="db-preview-media" controls src="${h(url)}"></video>${cap}<p class="muted">Nếu trình duyệt không phát được định dạng này, hãy tải xuống và mở bằng phần mềm máy tính.</p><div class="row">${dl}</div></div>`;
  if (kind === 'audio') return `<div class="db-preview"><audio class="db-preview-media" controls src="${h(url)}"></audio>${cap}<div class="row">${dl}</div></div>`;
  if (kind === 'code') return `<div class="db-preview"><pre class="db-preview-code" id="db-preview-code">Đang tải nội dung tệp…</pre>${cap}<div class="row">${dl}</div></div>`;
  return `<div class="db-preview"><div class="db-link-card">${ic('overview', 18)}<div><b>Không xem trước được tệp này</b><div class="muted">Định dạng Word / Excel / PowerPoint và một số tệp khác không xem trực tiếp được trong trình duyệt. Bấm “Tải xuống” rồi mở bằng phần mềm máy tính.</div></div></div><div class="row">${dl}</div></div>`;
}
function dbPreviewFillCode(url) {
  fetch(url).then((r) => (r.ok ? r.text() : Promise.reject(new Error('HTTP ' + r.status)))).then((t) => {
    const box = document.getElementById('db-preview-code');
    if (box) box.textContent = t.length > 200000 ? t.slice(0, 200000) + '\n\n… (chỉ hiển thị phần đầu)' : t;
  }).catch(() => {
    const box = document.getElementById('db-preview-code');
    if (box) box.textContent = 'Không đọc được nội dung tệp này — hãy tải xuống để xem.';
  });
}

const dbSafeHttpUrl = (url) => (typeof safeHttpUrl === 'function' ? safeHttpUrl(url) : '');

/* Tài liệu đính kèm bài học: tệp giáo viên tải lên, liên kết (YouTube/Canva/web) giáo viên thêm;
   cả hai vai trò đều xem trước / tải xuống / mở được. */
function dbLessonResources(l, resources) {
  const items = (resources || []).map((r) => {
    const isLink = r.kind === 'LINK';
    const linkUrl = isLink ? dbSafeHttpUrl(r.url) : '';
    const yt = linkUrl ? dbYoutubeId(linkUrl) : '';
    const meta = isLink ? (yt ? 'YouTube' : 'Liên kết') : (r.file_size_bytes == null ? '' : dbFileSize(r.file_size_bytes));
    const previewBtn = isLink
      ? (linkUrl ? dbBtn('Xem trước', 'previewResource', { kind: 'LINK', path: '', url: linkUrl, name: r.file_name, mime: r.mime_type || '' }, 'light mini') : '')
      : dbBtn('Xem trước', 'previewResource', { kind: 'FILE', path: r.storage_path || '', url: '', name: r.file_name, mime: r.mime_type || '' }, 'light mini');
    const actionBtn = isLink
      ? (linkUrl ? dbBtn('Mở', 'openResourceLink', { url: linkUrl }, 'light mini') : '<span class="muted">Liên kết không hợp lệ</span>')
      : dbBtn('Tải xuống', 'downloadResource', { path: r.storage_path, name: r.file_name }, 'light mini');
    return `<li class="db-file">
    <span class="db-file-name">${ic(isLink && yt ? 'play' : 'overview', 14)}<span class="db-file-title">${h(r.file_name)}</span>${isLink ? `<span class="muted db-file-url">${h(String(linkUrl || r.url || '').replace(/^https?:\/\//, '').slice(0, 60))}</span>` : ''}</span>
    <span class="muted db-file-meta">${meta}</span>
    <span class="row db-file-actions">${previewBtn}${actionBtn}${dbIsTeacher() ? dbBtn('Xóa', 'deleteResource', { id: r.id, name: r.file_name }, 'light mini danger-soft') : ''}</span>
  </li>`;
  }).join('');
  // Link purpose pills per resource
  let coverageByRes = {};
  try { coverageByRes = window.__dbCoverageByRes || {}; } catch (_) {}
  const itemsWithTags = (resources || []).map((r) => {
    const tags = (coverageByRes[r.id] || []).map((pur) => `<span class="pill ${pur === 'LEARN' ? 'good' : pur === 'PRACTICE' ? 'prog' : 'plain'} mini" title="${h(dbPurposeLabel(pur))}">${h(DB_PURPOSE_LABEL[pur] || pur)}</span>`).join(' ') || '<span class="muted mini">Chưa gắn mục tiêu</span>';
    return `<li class="db-file">
    <span class="db-file-name">${ic(r.kind === 'LINK' && dbYoutubeId(dbSafeHttpUrl(r.url)) ? 'play' : 'overview', 14)}<span class="db-file-title">${h(r.file_name)}</span>${r.kind === 'LINK' ? `<span class="muted db-file-url">${h(String(dbSafeHttpUrl(r.url) || r.url || '').replace(/^https?:\/\//, '').slice(0, 60))}</span>` : ''}</span>
    <span class="muted db-file-meta">${tags}</span>
    <span class="row db-file-actions">${dbIsTeacher() ? dbBtn('Gắn mục tiêu', 'openResourceLinking', { id: r.id }, 'light mini') : ''}${r.kind === 'LINK' ? (dbSafeHttpUrl(r.url) ? dbBtn('Mở', 'openResourceLink', { url: dbSafeHttpUrl(r.url) }, 'light mini') : '') : dbBtn('Tải xuống', 'downloadResource', { path: r.storage_path, name: r.file_name }, 'light mini')}${dbIsTeacher() ? dbBtn('Xóa', 'deleteResource', { id: r.id, name: r.file_name }, 'light mini danger-soft') : ''}</span>
  </li>`;
  }).join('');
  return `<div class="db-files"><span class="db-label">Tài liệu${dbIsTeacher() ? '' : ' của bài học'}</span>
    ${itemsWithTags ? `<ul class="db-filelist">${itemsWithTags}</ul>` : '<p class="muted">Chưa có tài liệu nào.</p>'}
    ${dbIsTeacher() ? `<form data-act="uploadResource" data-lesson="${h(l.id)}" class="db-form-row db-add-row" novalidate>
      <input type="file" id="db-rf-${h(l.id)}" name="file" class="db-input-file" aria-label="Chọn tệp tài liệu cho bài học ${h(l.title)}">
      <button type="submit" class="btn light">Tải tài liệu lên</button><span class="muted">Mọi định dạng (doc, xlsx, pptx, tệp code, video, âm thanh…), tối đa 50 MB.</span>${dbFormError()}
    </form>
    <form data-act="addResourceLink" data-lesson="${h(l.id)}" class="db-form-row db-add-row" novalidate>
      ${dbField('Thêm liên kết (YouTube, Canva, trang web…)', 'db-rl-' + h(l.id), `<input id="db-rl-${h(l.id)}" name="url" type="url" placeholder="https://…" required>`)}
      ${dbField('Tên hiển thị', 'db-rlt-' + h(l.id), `<input id="db-rlt-${h(l.id)}" name="title" maxlength="200" placeholder="Để trống = tự đặt tên">`)}
      <button type="submit" class="btn light">Thêm liên kết</button>${dbFormError()}
    </form>` : ''}
  </div>`;
}

/* Thùng rác của lớp (chỉ giáo viên): mục đã xóa mềm, bấm Khôi phục để đưa trở lại. */
function dbTrashPanel(d) {
  const list = d.trash || [];
  const rows = list.map((x) => `<tr data-trash-row data-trash-type="${h(x.type)}" data-trash-search="${h(`${x.title || ''} ${x.label}`.toLowerCase())}">
    <th scope="row">${h(String(x.title || '').slice(0, 90))}</th>
    <td>${x.label}</td>
    <td>${dbDateTime(x.deleted_at)}</td>
    <td class="db-cell-actions">${dbBtn('Khôi phục', 'restoreItem', { id: x.id }, 'mini')}${dbBtn('Xóa vĩnh viễn', 'deleteTrashItem', { id: x.id }, 'light mini danger-soft')}</td>
  </tr>`);
  const typeOptions = [...new Set(list.map((x) => x.type))].map((type) => {
    const item = list.find((x) => x.type === type);
    return `<option value="${h(type)}">${h(item.label)}</option>`;
  }).join('');
  return `
  <section class="panel" aria-labelledby="db-h-trash">
    <div class="row between"><div><h2 id="db-h-trash">Thùng rác</h2><p class="lead"><span id="db-trash-count" aria-live="polite">${list.length}</span> mục · Lớp đã lưu trữ được khôi phục ở trang “Lớp học phụ trách”.</p></div>
      ${list.length ? `<div class="row">${dbBtn('Khôi phục tất cả', 'restoreAllTrash', {}, 'light mini')}${dbBtn('Xóa sạch thùng rác', 'deleteAllTrash', {}, 'light mini danger-soft')}</div>` : ''}
    </div>
    ${list.length ? `<div class="row db-filter">
      <label class="sr" for="db-trash-search">Tìm trong thùng rác</label><input id="db-trash-search" type="search" placeholder="Tìm theo tên mục" data-input="filterTrash">
      <label class="sr" for="db-trash-type">Lọc theo loại</label><select id="db-trash-type" data-change="filterTrash"><option value="">Mọi loại</option>${typeOptions}</select>
      ${dbBtn('Xóa bộ lọc', 'clearTrashFilters', {}, 'light mini')}
    </div>` : ''}
    ${rows.length ? dbTable(['Mục', 'Loại', 'Đã xóa lúc', '<span class="sr">Thao tác</span>'], [...rows, '<tr class="db-trash-no-results" hidden><td colspan="4">Không tìm thấy mục phù hợp.</td></tr>'], 'Mục đã xóa') : dbEmpty('Thùng rác trống.')}
  </section>`;
}

DB_PAGES.trash = {
  title: 'Thùng rác',
  sub: 'Khôi phục mục đã xóa hoặc xem dữ liệu liên quan trước khi xóa vĩnh viễn.',
  async load() {
    if (!dbIsTeacher()) throw new Error('Thùng rác chỉ dành cho giáo viên.');
    return dbLoadTrash();
  },
  view: dbTrashPanel,
};

/* ===== Tài liệu ===== */
DB_ACT.uploadResource = (form) => dbRun(form, async () => {
  const input = form.querySelector('input[type="file"]');
  const file = input && input.files[0];
  if (!file) throw new Error('Chọn tệp tài liệu trước khi tải lên.');
  if (file.size > 50 * 1048576) throw new Error('Tệp tài liệu tối đa 50 MB.');
  const course = await dbEnsureCourse();
  const safe = dbSafeFileName(file.name);
  const path = DB.classId + '/' + Date.now() + '-' + safe;
  /* Thẻ tiến trình: hết byte → chuyển sang giai đoạn máy chủ lưu, ẩn khi xong/lỗi. */
  dbUploadShow(file.name);
  try {
    await dbCall(EducMindDB.uploadResourceFile(path, file, file.type || 'application/octet-stream', dbUploadProgress));
    dbUploadSaving();
    try {
      await dbCall(EducMindDB.createResource({ course_id: course.id, lesson_id: form.dataset.lesson, file_name: String(file.name).slice(0, 200), storage_path: path, file_size_bytes: file.size, mime_type: file.type || 'application/octet-stream', uploaded_by: sess.userId }));
    } catch (e) {
      try { await EducMindDB.removeResourceFile(path); } catch (_) {}
      throw e;
    }
  } finally {
    dbUploadHide();
  }
}, 'Đã tải tài liệu lên.');
DB_ACT.deleteResource = (el) => {
  const r = (DB.data.resources || []).find((x) => x.id === el.dataset.id);
  if (!r) return;
  dbConfirm('Xóa tài liệu?', `${r.kind === 'LINK' ? 'Liên kết' : 'Tệp'} “${h(r.file_name)}” sẽ bị xóa vĩnh viễn và không khôi phục được.`, 'Xóa tài liệu', async () => {
    if (r.storage_path) { try { await EducMindDB.removeResourceFile(r.storage_path); } catch (_) {} }
    await dbCall(EducMindDB.deleteResource(r.id));
    toast('Đã xóa tài liệu.');
  }, true);
};
DB_ACT.downloadResource = async (el) => {
  const { data, error } = await EducMindDB.resourceFileUrl(el.dataset.path, el.dataset.name);
  if (error) return toast('Không tạo được liên kết tải xuống: ' + (error.message || ''));
  const safe = dbSafeHttpUrl(data && data.signedUrl);
  if (!safe) return toast('Liên kết tải xuống không hợp lệ.');
  window.open(safe, '_blank', 'noopener,noreferrer');
};
DB_ACT.downloadSubmission = async (el) => {
  const { data, error } = await EducMindDB.submissionFileUrl(el.dataset.path, el.dataset.name);
  if (error) return toast('Không tạo được liên kết tải xuống: ' + (error.message || ''));
  const safe = dbSafeHttpUrl(data && data.signedUrl);
  if (!safe) return toast('Liên kết tải xuống không hợp lệ.');
  window.open(safe, '_blank', 'noopener,noreferrer');
};

/* ===== Xem trước & liên kết tài liệu ===== */
DB_ACT.openResourceLink = (el) => {
  const safe = dbSafeHttpUrl(el.dataset.url);
  if (!safe) return toast('Liên kết không hợp lệ.');
  window.open(safe, '_blank', 'noopener,noreferrer');
};
DB_ACT.previewResource = async (el) => {
  const d = el.dataset;
  if (d.kind === 'LINK') {
    const safeUrl = dbSafeHttpUrl(d.url);
    if (!safeUrl) return toast('Liên kết không hợp lệ.');
    const yt = dbYoutubeId(safeUrl);
    const open = dbBtn('Mở liên kết', 'openResourceLink', { url: safeUrl }, '');
    dbOpenDialog({
      title: d.name, wide: true,
      body: yt
        ? `<div class="db-preview"><iframe class="db-preview-frame db-preview-video" src="https://www.youtube.com/embed/${h(yt)}" title="${h(d.name)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe><div class="row">${open}</div></div>`
        : `<div class="db-preview"><div class="db-link-card">${ic('overview', 18)}<div><b>${h(d.name)}</b><div class="muted">${h(safeUrl)}</div></div></div><p class="muted">Trang này không cho phép nhúng trực tiếp — bấm “Mở liên kết” để mở trong thẻ mới.</p><div class="row">${open}</div></div>`,
    });
    return;
  }
  const { data, error } = await EducMindDB.resourceFileUrl(d.path);
  if (error || !data) return toast('Không tạo được liên kết xem tệp: ' + ((error && error.message) || ''));
  const kind = dbFileKind(d.name, d.mime);
  dbOpenDialog({ title: d.name, wide: true, body: dbPreviewBody(kind, data.signedUrl, d.name, 'downloadResource', d.path) });
  if (kind === 'code') dbPreviewFillCode(data.signedUrl);
};
DB_ACT.previewSubmission = async (el) => {
  const d = el.dataset;
  const { data, error } = await EducMindDB.submissionFileUrl(d.path);
  if (error || !data) return toast('Không tạo được liên kết xem tệp: ' + ((error && error.message) || ''));
  const kind = dbFileKind(d.name, '');
  dbOpenDialog({ title: d.name, wide: true, body: dbPreviewBody(kind, data.signedUrl, d.name, 'downloadSubmission', d.path) });
  if (kind === 'code') dbPreviewFillCode(data.signedUrl);
};
DB_ACT.addResourceLink = (form) => dbRun(form, async (v) => {
  const raw = String(v.url || '').trim();
  const safeUrl = dbSafeHttpUrl(raw);
  if (!safeUrl) throw new Error('Liên kết không hợp lệ. Chỉ chấp nhận địa chỉ bắt đầu bằng http:// hoặc https://.');
  const u = new URL(safeUrl);
  const yt = dbYoutubeId(safeUrl);
  const title = String(v.title || '').trim() || (yt ? 'Video YouTube' : u.hostname.replace(/^www\./, ''));
  const course = await dbEnsureCourse();
  await dbCall(EducMindDB.createResource({
    course_id: course.id, lesson_id: form.dataset.lesson, kind: 'LINK', url: safeUrl,
    file_name: title.slice(0, 200), storage_path: null, file_size_bytes: null,
    mime_type: yt ? 'text/x-youtube' : 'text/x-link', uploaded_by: sess.userId,
  }));
}, 'Đã thêm liên kết.');

/* ===== Gắn tài nguyên với mục tiêu (Phase 1) ===== */
DB_ACT.openResourceLinking = async (el) => {
  const rid = el.dataset.id;
  const courseId = DB.course ? DB.course.id : '';
  const content = await dbLoadContent();
  const links = await dbCall(EducMindDB.listResourceObjectiveLinks(courseId)).catch(() => []);
  const cur = links.filter((x) => x.resource_id === rid);
  const curSet = new Set(cur.map((x) => x.objective_id + '|' + x.purpose));
  const purposes = (typeof DB_PURPOSE_ORDER !== 'undefined' ? DB_PURPOSE_ORDER : ['LEARN', 'PRACTICE', 'EXTEND']);
  const body = content.objectives.map((o) => {
    return '<fieldset class="db-link-field"><legend>' + h(o.code) + ' · ' + h(o.description) + '</legend>' +
      purposes.map((p) => '<label class="db-check"><input type="checkbox" data-link data-obj="' + h(o.id) + '" data-purpose="' + p + '"' + (curSet.has(o.id + '|' + p) ? ' checked' : '') + '> ' + h(dbPurposeLabel(p)) + '</label>').join(' ') + '</fieldset>';
  }).join('') || '<p class="muted">Chưa có mục tiêu.</p>';
  dbOpenDialog({
    title: 'Gắn tài nguyên với mục tiêu', wide: true, okLabel: 'Lưu',
    body: '<div class="db-link-dialog">' + body + '</div>',
    onOk: async () => {
      const checks = [...document.querySelectorAll('[data-link]')];
      const wanted = new Set(checks.filter((c) => c.checked).map((c) => c.dataset.obj + '|' + c.dataset.purpose));
      const current = new Set(cur.map((x) => x.objective_id + '|' + x.purpose));
      const toAdd = [...wanted].filter((x) => !current.has(x));
      const toRemove = [...current].filter((x) => !wanted.has(x));
      for (const key of toAdd) {
        const [oid, pur] = key.split('|');
        await dbCall(EducMindDB.createResourceObjectiveLink({ course_id: courseId, resource_id: rid, objective_id: oid, purpose: pur }));
      }
      for (const key of toRemove) {
        const [oid] = key.split('|');
        const lid = cur.find((x) => x.objective_id === oid && x.purpose === key.split('|')[1]);
        // id is resource_objective: resource_id_objective_id ; but need exact link id
        const linkId = lid ? lid.id : (rid + '_' + oid);
        try { await dbCall(EducMindDB.deleteResourceObjectiveLink(linkId)); } catch (_) {}
      }
      toast('Đã lưu gắn mục tiêu.');
    },
  });
};

/* ===== Thùng rác ===== */
function dbTrashRestore(it) {
  const fn = { topic: EducMindDB.restoreTopic, lesson: EducMindDB.restoreLesson, assignment: EducMindDB.restoreAssignment, question: EducMindDB.restoreQuestion }[it.type];
  if (!fn) throw new Error('Loại mục trong thùng rác không được hỗ trợ.');
  return dbCall(fn(it.id)).then((result) => {
    if (!result.length) throw new Error(`Không thể khôi phục “${it.title}”. Mục này có thể đã được xử lý ở nơi khác.`);
  });
}
async function dbTrashPurge(it) {
  try {
    await dbCall(EducMindDB.purgeTrashedItem(it.type, it.id));
    return true;
  } catch (e) {
    if (e.raw && e.raw.code === '23503') return false;
    throw e;
  }
}
async function dbRefreshTrashData() {
  DB.data = { ...(DB.data || {}), ...(await dbLoadTrash()) };
}
function dbTrashOperationSummary(action, succeeded, blocked) {
  const verb = action === 'restore' ? 'khôi phục' : 'xóa vĩnh viễn';
  if (!blocked.length) return `Đã ${verb} ${succeeded} mục.`;
  const examples = blocked.slice(0, 3).map((x) => `“${String(x.title || '').slice(0, 45)}”`).join(', ');
  const suffix = blocked.length > 3 ? ` và ${blocked.length - 3} mục khác` : '';
  if (action === 'delete') return `Đã ${verb} ${succeeded} mục. ${blocked.length} mục còn dữ liệu liên quan nên được giữ nguyên: ${examples}${suffix}. Mở từng mục để xem chi tiết.`;
  return `Đã ${verb} ${succeeded} mục. ${blocked.length} mục còn lại vì vẫn có dữ liệu liên quan: ${examples}${suffix}.`;
}
function dbRunTrashBulk(action) {
  const items = (DB.data.trash || []).slice();
  if (!items.length) return;
  const order = action === 'restore'
    ? { topic: 0, lesson: 1, assignment: 2, question: 3 }
    : { assignment: 0, question: 1, lesson: 2, topic: 3 };
  items.sort((a, b) => order[a.type] - order[b.type]);
  const restore = action === 'restore';
  dbConfirm(
    restore ? 'Khôi phục tất cả mục?' : 'Xóa sạch thùng rác?',
    restore
      ? `Khôi phục ${items.length} mục trong lớp đang chọn.`
      : `Thử xóa vĩnh viễn ${items.length} mục trong lớp đang chọn. Mục còn dữ liệu phụ thuộc sẽ được giữ lại; bài nộp, điểm và dữ liệu học tập không bị xóa.`,
    restore ? 'Khôi phục tất cả' : 'Xóa sạch',
    async () => {
      let succeeded = 0;
      const blocked = [];
      try {
        for (const item of items) {
          if (restore) {
            await dbTrashRestore(item);
            succeeded++;
          } else if (await dbTrashPurge(item)) {
            succeeded++;
          } else {
            blocked.push(item);
          }
        }
      } catch (e) {
        try { await dbRefreshTrashData(); } catch (refreshError) { dbLogError(refreshError); }
        throw new Error(`Đã xử lý ${succeeded} mục trước khi dừng do lỗi: ${dbErrText(e)}`);
      }
      toast(dbTrashOperationSummary(action, succeeded, blocked));
    },
    !restore,
  );
}
DB_ACT.filterTrash = () => {
  const input = document.getElementById('db-trash-search'), select = document.getElementById('db-trash-type');
  if (!input || !select) return;
  const text = input.value.trim().toLowerCase(), type = select.value;
  let visible = 0;
  document.querySelectorAll('#main tbody tr[data-trash-row]').forEach((row) => {
    const show = (!type || row.dataset.trashType === type) && (!text || row.dataset.trashSearch.includes(text));
    row.hidden = !show;
    if (show) visible++;
  });
  const count = document.getElementById('db-trash-count');
  const empty = document.querySelector('.db-trash-no-results');
  if (count) count.textContent = `${visible} / ${(DB.data.trash || []).length}`;
  if (empty) empty.hidden = visible !== 0;
};
DB_ACT.clearTrashFilters = () => {
  const input = document.getElementById('db-trash-search'), select = document.getElementById('db-trash-type');
  if (!input || !select) return;
  input.value = '';
  select.value = '';
  DB_ACT.filterTrash();
  input.focus();
};
DB_ACT.restoreItem = (el) => dbRun(el, async () => {
  const it = (DB.data.trash || []).find((x) => x.id === el.dataset.id);
  if (!it) throw new Error('Không tìm thấy mục cần khôi phục.');
  await dbTrashRestore(it);
  if (it.type === 'lesson' && (DB.data.trash || []).some((x) => x.type === 'topic' && x.id === it.topic_id)) {
    await dbReload();
    toast('Đã khôi phục bài học. Chủ đề của bài học cũng đang bị xóa — hãy khôi phục cả chủ đề để học sinh thấy được.');
    return false;
  }
}, 'Đã khôi phục mục này.');
DB_ACT.deleteTrashItem = (el) => dbRun(el, async () => {
  const it = (DB.data.trash || []).find((x) => x.id === el.dataset.id);
  if (!it) throw new Error('Không tìm thấy mục cần xóa.');
  const dependencies = await dbCall(EducMindDB.trashItemDependencies(it.type, it.id));
  const linked = dependencies.filter((dependency) => Number(dependency.item_count) > 0);
  if (linked.length) {
    const rows = linked.map((dependency) => `<li><strong>${h(dependency.label)}: ${Number(dependency.item_count)}</strong><br><span class="muted">${h(dependency.impact)}</span></li>`).join('');
    const historyNote = linked.some((dependency) => dependency.preserves_history)
      ? '<p class="muted">Lịch sử bài nộp, chấm điểm, bằng chứng học tập hoặc tạo nội dung được bảo toàn; không thể xóa mục này bằng cách xóa các dữ liệu lịch sử đó.</p>'
      : '<p class="muted">Hệ thống không tự xóa các liên kết nội dung này.</p>';
    dbOpenDialog({
      title: 'Chưa thể xóa vĩnh viễn',
      wide: true,
      body: `<p>Mục “${h(it.title || '')}” còn dữ liệu liên quan. Các mục dưới đây đang chặn thao tác:</p><ul>${rows}</ul><p class="muted">Không có dữ liệu nào bị xóa.</p>${historyNote}`,
    });
    return false;
  }
  dbConfirm('Xóa vĩnh viễn?', `Không tìm thấy dữ liệu liên quan cho “${h(it.title || '')}”. Thao tác này không thể hoàn tác.`, 'Xóa vĩnh viễn', async () => {
    if (!await dbTrashPurge(it)) throw new Error('Dữ liệu liên quan đã thay đổi sau bước kiểm tra. Không có dữ liệu nào bị xóa; hãy kiểm tra lại mục này trong thùng rác.');
    toast('Đã xóa vĩnh viễn mục này.');
  }, true);
  return false;
});
DB_ACT.restoreAllTrash = () => dbRunTrashBulk('restore');
DB_ACT.deleteAllTrash = () => dbRunTrashBulk('delete');
