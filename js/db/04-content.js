/* EducMind · js/db/04-content.js
   Nội dung học tập: Chủ đề → Bài học → Mục tiêu. Giáo viên soạn và xuất bản; học sinh xem bài đã xuất bản kèm mức nắm vững. */

/* Nạp cây nội dung của lớp đang chọn. Dùng chung cho nhiều trang (bài tập, câu hỏi, đánh giá) để hiện tên bài học / mục tiêu. */
async function dbLoadContent() {
  if (!DB.course) return { topics: [], lessons: [], objectives: [], resources: [] };
  const [topics, lessons, resources] = await Promise.all([dbCall(EducMindDB.listTopics(DB.course.id)), dbCall(EducMindDB.listLessons(DB.course.id)), dbCall(EducMindDB.listResources(DB.course.id))]);
  const topicIds = new Set(topics.map((t) => t.id));
  const live = lessons.filter((l) => topicIds.has(l.topic_id));
  const objectives = await dbCallIn(EducMindDB.listObjectives, live.map((l) => l.id));
  return { topics, lessons: live, objectives, resources };
}
/* Dung lượng tệp dạng dễ đọc: 1,2 MB / 340 KB. */
const dbFileSize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
/* Nhãn mục tiêu: "LO1 · Nhận biết mạng LAN" */
const dbObjLabel = (o) => (o ? `${h(o.code)} · ${h(o.description)}` : 'Mục tiêu đã xóa');
/* Danh sách ô chọn mục tiêu, nhóm theo bài học. name là tên trường của biểu mẫu, picked là tập mã mục tiêu đang chọn.
   opts.fold = true: mỗi bài học là một khối thu gọn có đếm số đã chọn; opts.open = mã bài học được mở sẵn. */
function dbObjectivePicker(content, name, picked, onlyLesson, opts) {
  const byLesson = dbGroup(content.objectives, 'lesson_id');
  const lessons = content.lessons.filter((l) => (byLesson[l.id] || []).length && (!onlyLesson || l.id === onlyLesson));
  if (!lessons.length) return `<p class="muted">Chưa có mục tiêu nào. Hãy thêm mục tiêu ở trang “Thư mục học tập” trước.</p>`;
  if (opts && opts.fold) {
    return `<div class="db-objpick db-objpick-fold">${lessons.map((l) => {
      const objs = byLesson[l.id], n = objs.filter((o) => picked.has(o.id)).length;
      return `<details class="db-objgrp${n ? ' has-picked' : ''}" data-lesson="${h(l.id)}" ${opts.open === l.id ? 'open' : ''}>
        <summary><span class="db-objgrp-title">${h(l.title)}</span><span class="pill ${n ? 'prog' : 'plain'} db-objgrp-count" data-total="${objs.length}">${n}/${objs.length} đã chọn</span></summary>
        <div class="db-objgrp-body">${objs.map((o) =>
          `<label class="objrow"><input type="checkbox" name="${name}" data-multi value="${h(o.id)}" data-change="objGroupCount" data-apply ${picked.has(o.id) ? 'checked' : ''}><span>${dbObjLabel(o)}</span></label>`).join('')}</div>
      </details>`;
    }).join('')}</div>`;
  }
  return `<div class="db-objpick">${lessons.map((l) => `<fieldset><legend>${h(l.title)}</legend>${byLesson[l.id].map((o) =>
    `<label class="objrow"><input type="checkbox" name="${name}" data-multi value="${h(o.id)}" ${picked.has(o.id) ? 'checked' : ''}><span>${dbObjLabel(o)}</span></label>`).join('')}</fieldset>`).join('')}</div>`;
}
/* Đồng bộ bảng liên kết mục tiêu (assignment_objectives / question_objectives): thêm cái mới chọn, gỡ cái bỏ chọn. */
async function dbSyncLinks(current, wanted, add, remove) {
  const cur = new Set(current), want = new Set(wanted);
  const toAdd = [...want].filter((x) => !cur.has(x)), toRemove = [...cur].filter((x) => !want.has(x));
  if (toRemove.length) await remove(toRemove);
  if (toAdd.length) await add(toAdd);
}

/* ===== Giáo viên: Thư mục học tập ===== */
DB_PAGES.content = {
  title: 'Thư mục học tập',
  sub: 'Quản lý nội dung theo Chủ đề → Bài học → Mục tiêu và tài liệu.',
  load: dbLoadContent,
  view(d) {
    const lessonsBy = dbGroup(d.lessons, 'topic_id'), objBy = dbGroup(d.objectives, 'lesson_id');
    const topic = d.topics.find((t) => t.id === DB.arg.topicId);
    const lesson = topic && d.lessons.find((l) => l.id === DB.arg.lessonId && l.topic_id === topic.id);
    if (lesson) return dbContentLessonView(d, topic, lesson, objBy[lesson.id] || []);
    if (topic) return dbContentTopicView(d, topic, lessonsBy[topic.id] || [], objBy);
    return dbContentRootView(d, lessonsBy, objBy);
  },
};

function dbContentRootView(d, lessonsBy, objBy) {
  const cards = d.topics.map((t, i) => {
    const lessons = lessonsBy[t.id] || [];
    const objectiveCount = lessons.reduce((n, l) => n + (objBy[l.id] || []).length, 0);
    const lessonRows = lessons.map((l) => dbContentLessonRow(l, objBy, t.id)).join('');
    return `<details class="topic-folder" data-sort-item data-id="${h(t.id)}">
      <summary><span class="topic-mark">${String(i + 1).padStart(2, '0')}</span><span class="topic-title">${h(t.title)}<small class="muted">${lessons.length} bài học · ${objectiveCount} mục tiêu</small></span>
        <span class="topic-actions">
          ${dbContentSortHandle('topic', t.id, t.title)}
          <span class="pill plain">${lessons.length} bài học</span>
          <button type="button" class="topic-icon-btn" data-act="openContentTopic" data-id="${h(t.id)}" aria-label="Mở chủ đề ${h(t.title)} để thêm bài học" title="Thêm bài học">${ic('plus', 16)}</button>
          <button type="button" class="topic-icon-btn" data-act="editTopic" data-id="${h(t.id)}" aria-label="Sửa chủ đề ${h(t.title)}" title="Sửa chủ đề">${ic('edit', 16)}</button>
          <button type="button" class="topic-icon-btn" data-act="deleteTopic" data-id="${h(t.id)}" aria-label="Xóa chủ đề ${h(t.title)}" title="Xóa chủ đề">${ic('trash', 16)}</button>
        </span>
      </summary>
      <div class="topic-lessons" data-sort-scope="lessons" data-topic-id="${h(t.id)}">${lessonRows || '<div class="folder-empty">Chưa có bài học trong chủ đề này.</div>'}</div>
    </details>`;
  }).join('');
  return `<section class="panel" aria-labelledby="db-h-topic">
    <div class="row between db-folder-heading"><div><h2 id="db-h-topic">Chủ đề học tập</h2><p class="lead">${d.topics.length ? d.topics.length + ' chủ đề · ' + d.lessons.length + ' bài học · ' + d.objectives.length + ' mục tiêu' : 'Lớp chưa có nội dung. Bắt đầu bằng cách tạo chủ đề đầu tiên.'}</p></div></div>
    <div class="db-topic-list" data-sort-scope="topics" aria-label="Danh sách chủ đề">${cards || `<div class="folder-empty">Chưa có chủ đề. Tạo chủ đề để bắt đầu xây dựng nội dung.</div>`}</div>
    <details class="db-content-settings"><summary>Cài đặt học tập</summary>
      <label class="db-check db-seq-toggle"><input type="checkbox" data-change="toggleSequential" ${DB.course && DB.course.sequential_unlock ? 'checked' : ''}> Mở bài học tuần tự: học sinh chỉ mở được bài sau khi nắm vững (≥ 0,8) mọi mục tiêu của bài trước</label>
      <label class="db-check db-seq-toggle"><input type="checkbox" data-change="toggleStudentAi" ${!DB.course || DB.course.student_ai_enabled !== false ? 'checked' : ''}> Cho phép học sinh sử dụng Trợ lý AI trong lớp này</label>
    </details>
  </section>`;
}

function dbContentSortHandle(kind, id, title) {
  if (!dbIsTeacher()) return '';
  const label = kind === 'topic' ? 'chủ đề' : 'bài học';
  return `<button type="button" class="db-sort-handle" data-sort-handle data-sort-kind="${kind}" data-id="${h(id)}" aria-label="Giữ và kéo để sắp xếp ${label} ${h(title)}" title="Giữ và kéo để sắp xếp" aria-keyshortcuts="ArrowUp ArrowDown">⠿</button>`;
}

function dbContentLessonRow(lesson, objBy, topicId) {
  const objectiveCount = (objBy[lesson.id] || []).length;
  return `<div class="db-sortable-lesson-row" data-sort-item data-id="${h(lesson.id)}">
    ${dbContentSortHandle('lesson', lesson.id, lesson.title)}
    <button type="button" class="folder-lesson-row" data-act="openContentLesson" data-id="${h(lesson.id)}" data-topic-id="${h(topicId)}">
      <span class="lesson-name"><b>${h(lesson.title)}</b><small>${objectiveCount} mục tiêu cần đạt · ${h(lesson.status === 'PUBLISHED' ? 'Đã xuất bản' : 'Bản nháp')}</small></span>${ic('arrow', 17)}
    </button>
  </div>`;
}

function dbContentTopicView(d, topic, lessons, objBy) {
  const rows = lessons.map((l) => dbContentLessonRow(l, objBy, topic.id)).join('');
  const published = topic.status === 'PUBLISHED';
  return `<div class="folder-wrap">
    <nav class="folder-crumb" aria-label="Đường dẫn"><button type="button" data-act="openContentRoot">Thư mục nội dung</button><span aria-hidden="true">›</span><b>${h(topic.title)}</b></nav>
    <section class="panel">
      <div class="row between"><div><h2>${h(topic.title)}</h2><p class="lead">${dbStatusPill(topic.status)} · ${lessons.length} bài học${topic.description ? ' · ' + h(topic.description) : ''}</p></div>
        <div class="row">${dbBtn(published ? 'Gỡ xuất bản' : 'Xuất bản', 'toggleTopic', { id: topic.id }, published ? 'light mini' : 'mini')}${dbBtn('Sửa chủ đề', 'editTopic', { id: topic.id }, 'light mini')}${dbBtn('Xóa', 'deleteTopic', { id: topic.id }, 'light mini danger-soft')}</div>
      </div>
      <div class="topic-lessons" data-sort-scope="lessons" data-topic-id="${h(topic.id)}">${rows || `<div class="folder-empty">Chủ đề chưa có bài học. Thêm bài học bên dưới để bắt đầu.</div>`}</div>
      <form data-act="createLesson" data-topic="${h(topic.id)}" class="db-form-row db-add-row" novalidate>
        ${dbField('Tên bài học mới', 'db-nl-' + h(topic.id), `<input id="db-nl-${h(topic.id)}" name="title" maxlength="200" placeholder="Nhập tên bài học" required>`)}
        <button type="submit" class="btn light">${ic('plus', 16)}Thêm bài học</button>${dbFormError()}
      </form>
    </section>
  </div>`;
}

function dbContentLessonView(d, topic, lesson, objectives) {
  const tab = DB.arg.tab === 'resources' ? 'resources' : 'objectives';
  const tabs = `<div class="folder-tabs split-2" role="tablist" aria-label="Nội dung bài học">
    <button type="button" role="tab" aria-selected="${tab === 'objectives'}" data-act="selectContentTab" data-tab="objectives">${ic('target', 16)}<span>Mục tiêu</span></button>
    <button type="button" role="tab" aria-selected="${tab === 'resources'}" data-act="selectContentTab" data-tab="resources">${ic('file', 16)}<span>Tài liệu</span></button>
  </div>`;
  const body = tab === 'resources' ? dbLessonResources(lesson, (d.resources || []).filter((r) => r.lesson_id === lesson.id)) : dbLessonObjectives(lesson, objectives);
  const published = lesson.status === 'PUBLISHED';
  return `<div class="folder-wrap">
    <nav class="folder-crumb" aria-label="Đường dẫn"><button type="button" data-act="openContentRoot">Thư mục nội dung</button><span aria-hidden="true">›</span><button type="button" data-act="openContentTopic" data-id="${h(topic.id)}">${h(topic.title)}</button><span aria-hidden="true">›</span><b>${h(lesson.title)}</b></nav>
    <section class="panel lesson-workspace">
      <div class="lesson-workspace-head">
        <div class="row between"><div><h2>${h(lesson.title)}</h2><p class="lead">${dbStatusPill(lesson.status)} · ${h(topic.title)}</p>${lesson.description ? `<p class="muted">${h(lesson.description)}</p>` : ''}</div></div>${tabs}
      </div>
      <div class="lesson-workspace-body">${body}</div>
    </section>
  </div>`;
}

function dbLessonObjectives(lesson, objectives) {
  const rows = objectives.map((o) => `<li><span class="db-obj-code">${h(o.code)}</span><span class="db-obj-text">${h(o.description)}</span>
    <span class="row">${dbBtn('Sửa', 'editObjective', { id: o.id }, 'light mini')}${dbBtn('Xóa', 'deleteObjective', { id: o.id }, 'light mini danger-soft')}</span></li>`).join('');
  return `<section class="panel">
    <div class="row between"><div><h3>Mục tiêu cần đạt</h3><p class="lead">Mục tiêu được dùng để gắn câu hỏi và theo dõi mức độ nắm vững.</p></div><span class="pill plain">${objectives.length} mục tiêu</span></div>
    <form data-act="createObjective" data-lesson="${h(lesson.id)}" class="db-form-row db-add-row" novalidate>
      ${dbField('Mã', 'db-oc-' + h(lesson.id), `<input id="db-oc-${h(lesson.id)}" name="code" maxlength="20" value="${h(dbNextObjectiveCode(objectives))}" class="db-input-code" required>`)}
      ${dbField('Mục tiêu mới', 'db-od-' + h(lesson.id), `<input id="db-od-${h(lesson.id)}" name="description" maxlength="500" placeholder="Nhập điều học sinh cần đạt" required>`)}
      <button type="submit" class="btn light">${ic('plus', 16)}Thêm mục tiêu</button>${dbFormError()}
    </form>
    <div class="db-objectives-body">${rows ? `<ul class="db-objectives">${rows}</ul>` : `<div class="folder-empty">Chưa có mục tiêu cho bài học này.</div>`}</div>
  </section>`;
}

/* Mã gợi ý cho mục tiêu tiếp theo của bài học: LO1, LO2, … (mã không trùng trong cùng một bài học). */
function dbNextObjectiveCode(objectives) {
  const used = new Set(objectives.map((o) => o.code));
  let n = objectives.length + 1;
  while (used.has('LO' + n)) n++;
  return 'LO' + n;
}
const dbNextOrder = (list) => list.reduce((m, x) => Math.max(m, x.display_order || 0), 0) + 1;

function dbUnusedDisplayOrder(usedOrders) {
  const min = Math.min(...usedOrders), max = Math.max(...usedOrders);
  if (max < 2147483647) return max + 1;
  if (min > -2147483648) return min - 1;
  for (let candidate = 0; candidate <= usedOrders.length; candidate++) {
    if (!usedOrders.includes(candidate)) return candidate;
  }
  return null;
}

function dbContentOrderScope(scope, kind) {
  if (!dbIsTeacher() || DB.page !== 'content' || !DB.course || !DB.data || !scope) return null;
  const courseId = DB.course.id;
  if (kind === 'topic' && scope.dataset.sortScope === 'topics') {
    return { items: DB.data.topics.filter((topic) => topic.course_id === courseId), update: EducMindDB.updateTopic };
  }
  const topicId = scope.dataset.topicId;
  if (kind === 'lesson' && scope.dataset.sortScope === 'lessons' && topicId
    && DB.data.topics.some((topic) => topic.id === topicId && topic.course_id === courseId)) {
    return {
      items: DB.data.lessons.filter((lesson) => lesson.course_id === courseId && lesson.topic_id === topicId),
      update: EducMindDB.updateLesson,
    };
  }
  return null;
}

function dbContentSortChildren(scope) {
  return [...scope.children].filter((child) => child.hasAttribute('data-sort-item'));
}

function dbTemporaryOrders(usedOrders, count) {
  const used = new Set(usedOrders);
  let start = 0;
  while (start <= 2147483647 - count + 1) {
    let available = true;
    for (let i = 0; i < count; i++) {
      if (used.has(start + i)) { start += i + 1; available = false; break; }
    }
    if (available) return Array.from({ length: count }, (_, i) => start + i);
  }
  return null;
}

async function dbPersistContentOrder(scope, kind, orderedIds) {
  const context = dbContentOrderScope(scope, kind);
  if (!context || scope.dataset.sortBusy === '1') return;
  const { items, update } = context;
  const byId = new Map(items.map((item) => [item.id, item]));
  const currentIds = items.slice().sort((a, b) => Number(a.display_order) - Number(b.display_order)).map((item) => item.id);
  if (orderedIds.length !== currentIds.length || new Set(orderedIds).size !== currentIds.length
    || orderedIds.some((id) => !byId.has(id))) {
    throw new Error('Danh sách cần sắp xếp không khớp với dữ liệu hiện tại.');
  }
  const from = currentIds.findIndex((id, index) => id !== orderedIds[index]);
  if (from < 0) return;
  const movedId = currentIds[from];
  const to = orderedIds.indexOf(movedId);
  if (to < 0) throw new Error('Không tìm thấy mục cần di chuyển.');

  const originalOrders = new Map();
  const usedOrders = new Set();
  for (const item of items) {
    const order = Number(item.display_order);
    if (item.display_order == null || !Number.isInteger(order) || order < -2147483648 || order > 2147483647) {
      throw new Error('Thứ tự hiện tại không hợp lệ.');
    }
    if (usedOrders.has(order)) throw new Error('Phát hiện giá trị thứ tự bị trùng.');
    usedOrders.add(order);
    originalOrders.set(item.id, order);
  }
  const affected = [movedId];
  if (from < to) for (let i = from + 1; i <= to; i++) affected.push(currentIds[i]);
  else for (let i = from - 1; i >= to; i--) affected.push(currentIds[i]);
  const temporaryOrder = dbUnusedDisplayOrder([...usedOrders]);
  if (temporaryOrder == null) throw new Error('Không tìm được giá trị thứ tự tạm thời chưa sử dụng.');

  scope.dataset.sortBusy = '1';
  scope.setAttribute('aria-busy', 'true');
  scope.querySelectorAll('[data-sort-handle]').forEach((handle) => { handle.disabled = true; });
  try {
    await dbCall(update(movedId, { display_order: temporaryOrder }));
    if (from < to) {
      for (let i = from + 1; i <= to; i++) {
        await dbCall(update(currentIds[i], { display_order: originalOrders.get(currentIds[i - 1]) }));
      }
    } else {
      for (let i = from - 1; i >= to; i--) {
        await dbCall(update(currentIds[i], { display_order: originalOrders.get(currentIds[i + 1]) }));
      }
    }
    await dbCall(update(movedId, { display_order: originalOrders.get(currentIds[to]) }));

    const finalOrders = new Map(currentIds.map((id) => [id, originalOrders.get(id)]));
    orderedIds.forEach((id, index) => finalOrders.set(id, originalOrders.get(currentIds[index])));
    const key = kind === 'topic' ? 'topics' : 'lessons';
    DB.data[key] = DB.data[key].map((item) => finalOrders.has(item.id)
      ? { ...item, display_order: finalOrders.get(item.id) }
      : item).sort((a, b) => Number(a.display_order) - Number(b.display_order));
    if (kind === 'topic') {
      dbContentSortChildren(scope).forEach((topic, index) => {
        const mark = topic.querySelector('.topic-mark');
        if (mark) mark.textContent = String(index + 1).padStart(2, '0');
      });
    }
    toast(kind === 'topic' ? 'Đã cập nhật thứ tự chủ đề.' : 'Đã cập nhật thứ tự bài học.');
  } catch (error) {
    dbLogError(error);
    const rollbackErrors = [];
    const rollbackOrders = dbTemporaryOrders([...originalOrders.values()], affected.length);
    if (rollbackOrders) {
      for (let i = 0; i < affected.length; i++) {
        try {
          await dbCall(update(affected[i], { display_order: rollbackOrders[i] }));
        } catch (rollbackError) {
          dbLogError(rollbackError);
          rollbackErrors.push(`${affected[i]}: ${dbErrText(rollbackError)}`);
        }
      }
      if (!rollbackErrors.length) {
        for (const id of affected) {
          try {
            await dbCall(update(id, { display_order: originalOrders.get(id) }));
          } catch (rollbackError) {
            dbLogError(rollbackError);
            rollbackErrors.push(`${id}: ${dbErrText(rollbackError)}`);
          }
        }
      }
    } else rollbackErrors.push('Không tìm được thứ tự tạm thời để khôi phục.');

    const openTopics = [...document.querySelectorAll('.db-topic-list .topic-folder[open]')]
      .map((topic) => topic.dataset.id);
    let reloadError = '';
    try {
      const reloaded = await dbReload();
      reloadError = !reloaded ? 'Tải lại bị gián đoạn.' : DB.loadError;
      if (reloaded) {
        document.querySelectorAll('.db-topic-list .topic-folder[data-id]').forEach((topic) => {
          if (openTopics.includes(topic.dataset.id)) topic.open = true;
        });
      }
    } catch (refreshError) {
      dbLogError(refreshError);
      reloadError = dbErrText(refreshError);
    }
    toast(rollbackErrors.length
      ? `Không lưu được thứ tự (${dbErrText(error)}). Khôi phục thất bại: ${rollbackErrors.join('; ')}${reloadError ? `. Tải lại cũng thất bại: ${reloadError}` : '. Đã tải lại dữ liệu; hãy kiểm tra thứ tự hiện tại.'}`
      : reloadError
        ? `Không lưu được thứ tự (${dbErrText(error)}). Không xác nhận được trạng thái sau tải lại: ${reloadError}`
        : 'Không lưu được thứ tự. Đã khôi phục thứ tự ban đầu và tải lại dữ liệu từ máy chủ.');
  } finally {
    if (scope.isConnected) {
      scope.querySelectorAll('[data-sort-handle]').forEach((handle) => { handle.disabled = false; });
      delete scope.dataset.sortBusy;
      scope.removeAttribute('aria-busy');
    }
  }
}

function dbRequestContentOrder(scope, kind, orderedIds, source) {
  dbPersistContentOrder(scope, kind, orderedIds).catch((error) => {
    dbLogError(error);
    const context = dbContentOrderScope(scope, kind);
    if (context && scope.isConnected) {
      const nodes = new Map(dbContentSortChildren(scope).map((node) => [node.dataset.id, node]));
      context.items.slice().sort((a, b) => Number(a.display_order) - Number(b.display_order))
        .forEach((item) => {
          const node = nodes.get(item.id);
          if (node) scope.appendChild(node);
        });
    }
    dbShowError(error, source);
  });
}

let dbContentDrag = null;
app.addEventListener('pointerdown', (ev) => {
  const handle = ev.target.closest('[data-sort-handle]');
  if (!handle || handle.disabled || ev.button !== 0 || !dbIsTeacher() || DB.page !== 'content') return;
  const kind = handle.dataset.sortKind;
  const scope = handle.closest('[data-sort-scope]');
  const item = handle.closest('[data-sort-item]');
  if (!scope || !item || item.parentElement !== scope || !dbContentOrderScope(scope, kind) || scope.dataset.sortBusy === '1') return;
  dbContentDrag = {
    pointerId: ev.pointerId, handle, item, scope, kind,
    startX: ev.clientX, startY: ev.clientY, active: false,
    originalItems: dbContentSortChildren(scope),
  };
  handle.setPointerCapture(ev.pointerId);
  ev.preventDefault();
});
app.addEventListener('pointermove', (ev) => {
  const drag = dbContentDrag;
  if (!drag || drag.pointerId !== ev.pointerId) return;
  if (!drag.active && Math.hypot(ev.clientX - drag.startX, ev.clientY - drag.startY) < 6) return;
  drag.active = true;
  drag.item.classList.add('is-sorting');
  ev.preventDefault();
  const underPointer = document.elementFromPoint(ev.clientX, ev.clientY);
  const target = underPointer && underPointer.closest('[data-sort-item]');
  if (!target || target === drag.item || target.parentElement !== drag.scope) return;
  const rect = target.getBoundingClientRect();
  if (ev.clientY < rect.top + rect.height / 2) drag.scope.insertBefore(drag.item, target);
  else drag.scope.insertBefore(drag.item, target.nextSibling);
});
function dbFinishContentDrag(ev, cancelled) {
  const drag = dbContentDrag;
  if (!drag || drag.pointerId !== ev.pointerId) return;
  dbContentDrag = null;
  drag.item.classList.remove('is-sorting');
  if (cancelled) drag.originalItems.forEach((item) => drag.scope.appendChild(item));
  else if (drag.active) {
    const orderedIds = dbContentSortChildren(drag.scope).map((item) => item.dataset.id);
    dbRequestContentOrder(drag.scope, drag.kind, orderedIds, drag.handle);
  }
}
app.addEventListener('pointerup', (ev) => dbFinishContentDrag(ev, false));
app.addEventListener('pointercancel', (ev) => dbFinishContentDrag(ev, true));
app.addEventListener('click', (ev) => {
  if (ev.target.closest('[data-sort-handle]')) ev.preventDefault();
});
app.addEventListener('keydown', (ev) => {
  const handle = ev.target.closest('[data-sort-handle]');
  if (!handle || !['ArrowUp', 'ArrowDown'].includes(ev.key) || !dbIsTeacher()) return;
  const scope = handle.closest('[data-sort-scope]');
  const item = handle.closest('[data-sort-item]');
  if (!scope || !item || item.parentElement !== scope || scope.dataset.sortBusy === '1') return;
  ev.preventDefault();
  const siblings = dbContentSortChildren(scope);
  const index = siblings.indexOf(item), next = index + (ev.key === 'ArrowUp' ? -1 : 1);
  if (next < 0 || next >= siblings.length) return;
  if (next < index) scope.insertBefore(item, siblings[next]);
  else scope.insertBefore(item, siblings[next].nextSibling);
  dbRequestContentOrder(scope, handle.dataset.sortKind, dbContentSortChildren(scope).map((child) => child.dataset.id), handle);
});

DB_ACT.openContentRoot = () => { DB.arg = {}; if (typeof dbSyncUrl === 'function') dbSyncUrl(); render(); };
DB_ACT.openContentTopic = (el) => { DB.arg = { topicId: el.dataset.id }; if (typeof dbSyncUrl === 'function') dbSyncUrl(); render(); };
DB_ACT.openContentLesson = (el) => { DB.arg = { topicId: el.dataset.topicId, lessonId: el.dataset.id }; if (typeof dbSyncUrl === 'function') dbSyncUrl(); render(); };
DB_ACT.selectContentTab = (el) => { DB.arg = { ...DB.arg, tab: el.dataset.tab }; if (typeof dbSyncUrl === 'function') dbSyncUrl(); render(); };

DB_ACT.createTopic = (form) => dbRun(form, async (v) => {
  if (!v.title) throw new Error('Nhập tên chủ đề.');
  const course = await dbEnsureCourse();
  await dbCall(EducMindDB.createTopic({ course_id: course.id, title: v.title, display_order: dbNextOrder(DB.data.topics || []) }));
}, 'Đã thêm chủ đề (bản nháp).');
DB_ACT.openCreateTopicDialog = () => {
  dbOpenDialog({
    title: 'Tạo chủ đề mới',
    okLabel: 'Thêm',
    body: dbField('Tên chủ đề mới', 'db-new-topic', `<input id="db-new-topic" name="title" maxlength="200" placeholder="Ví dụ: Mạng máy tính" required>`),
    onOk: async (v) => {
      if (!v.title) throw new Error('Nhập tên chủ đề.');
      const course = await dbEnsureCourse();
      await dbCall(EducMindDB.createTopic({ course_id: course.id, title: v.title, display_order: dbNextOrder(DB.data.topics || []) }));
      toast('Đã thêm chủ đề (bản nháp).');
    },
  });
};
DB_ACT.toggleTopic = (el) => dbRun(el, async () => {
  const t = DB.data.topics.find((x) => x.id === el.dataset.id);
  await dbCall(EducMindDB.updateTopic(t.id, { status: t.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED' }));
  toast(t.status === 'PUBLISHED' ? 'Đã gỡ xuất bản chủ đề.' : 'Đã xuất bản chủ đề.');
});
/* Bật/tắt mở bài học tuần tự cho khóa học của lớp đang chọn. */
DB_ACT.toggleSequential = (el) => dbRun(el, async () => {
  const course = await dbEnsureCourse();
  await dbCall(EducMindDB.updateCourse(course.id, { sequential_unlock: el.checked }));
  DB.course.sequential_unlock = el.checked;
  toast(el.checked ? 'Đã bật mở bài học tuần tự.' : 'Đã tắt mở bài học tuần tự.');
});
/* Bật/tắt Trợ lý AI cho học sinh trong lớp đang chọn. */
DB_ACT.toggleStudentAi = (el) => dbRun(el, async () => {
  const course = await dbEnsureCourse();
  await dbCall(EducMindDB.updateCourse(course.id, { student_ai_enabled: el.checked }));
  DB.course.student_ai_enabled = el.checked;
  toast(el.checked ? 'Đã bật Trợ lý AI cho học sinh lớp này.' : 'Đã tạm tắt Trợ lý AI cho học sinh lớp này.');
});
DB_ACT.editTopic = (el) => {
  const t = DB.data.topics.find((x) => x.id === el.dataset.id);
  dbOpenDialog({
    title: 'Sửa chủ đề', okLabel: 'Lưu thay đổi',
    body: dbField('Tên chủ đề', 'db-et-title', `<input id="db-et-title" name="title" maxlength="200" value="${h(t.title)}" required>`)
      + dbField('Mô tả', 'db-et-desc', `<textarea id="db-et-desc" name="description" rows="3" maxlength="1000">${h(t.description)}</textarea>`),
    onOk: async (v) => {
      if (!v.title) throw new Error('Nhập tên chủ đề.');
      await dbCall(EducMindDB.updateTopic(t.id, { title: v.title, description: v.description || '' }));
      toast('Đã lưu chủ đề.');
    },
  });
};
DB_ACT.deleteTopic = (el) => {
  const t = DB.data.topics.find((x) => x.id === el.dataset.id);
  dbConfirm('Xóa chủ đề?', `Chủ đề “${h(t.title)}” và mọi bài học bên trong sẽ bị ẩn khỏi lớp. Bài tập, bài kiểm tra, điểm và bằng chứng đã có sẽ được giữ.`, 'Xóa chủ đề', async () => {
    await dbCall(EducMindDB.softDeleteTopic(t.id));
    if (DB.arg.topicId === t.id) DB.arg = {};
    toast('Đã xóa chủ đề.');
  }, true);
};
DB_ACT.createLesson = (form) => dbRun(form, async (v) => {
  if (!v.title) throw new Error('Nhập tên bài học.');
  const course = await dbEnsureCourse(), topicId = form.dataset.topic;
  await dbCall(EducMindDB.createLesson({ course_id: course.id, topic_id: topicId, title: v.title, display_order: dbNextOrder(DB.data.lessons.filter((l) => l.topic_id === topicId)) }));
}, 'Đã thêm bài học (bản nháp).');
DB_ACT.toggleLesson = (el) => dbRun(el, async () => {
  const l = DB.data.lessons.find((x) => x.id === el.dataset.id);
  const topic = DB.data.topics.find((t) => t.id === l.topic_id);
  await dbCall(EducMindDB.updateLesson(l.id, { status: l.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED' }));
  toast(l.status === 'PUBLISHED' ? 'Đã gỡ xuất bản bài học.' : topic && topic.status !== 'PUBLISHED' ? 'Đã xuất bản bài học. Học sinh sẽ thấy bài khi chủ đề cũng được xuất bản.' : 'Đã xuất bản bài học.');
});
DB_ACT.editLesson = (el) => {
  const l = DB.data.lessons.find((x) => x.id === el.dataset.id);
  dbOpenDialog({
    title: 'Sửa bài học', okLabel: 'Lưu thay đổi',
    body: dbField('Tên bài học', 'db-el-title', `<input id="db-el-title" name="title" maxlength="200" value="${h(l.title)}" required>`)
      + dbField('Mô tả', 'db-el-desc', `<textarea id="db-el-desc" name="description" rows="3" maxlength="2000">${h(l.description)}</textarea>`)
      + dbField('Chủ đề', 'db-el-topic', `<select id="db-el-topic" name="topic_id">${DB.data.topics.map((t) => `<option value="${h(t.id)}" ${t.id === l.topic_id ? 'selected' : ''}>${h(t.title)}</option>`).join('')}</select>`),
    onOk: async (v) => {
      if (!v.title) throw new Error('Nhập tên bài học.');
      await dbCall(EducMindDB.updateLesson(l.id, { title: v.title, description: v.description || '', topic_id: v.topic_id }));
      toast('Đã lưu bài học.');
    },
  });
};
DB_ACT.deleteLesson = (el) => {
  const l = DB.data.lessons.find((x) => x.id === el.dataset.id);
  dbConfirm('Xóa bài học?', `Bài học “${h(l.title)}” sẽ bị ẩn khỏi lớp. Bài tập, bài kiểm tra và kết quả học tập đã có vẫn được giữ.`, 'Xóa bài học', async () => {
    await dbCall(EducMindDB.updateLesson(l.id, { deleted_at: new Date().toISOString() }));
    if (DB.arg.lessonId === l.id) DB.arg = { topicId: l.topic_id };
    toast('Đã xóa bài học.');
  }, true);
};
function dbReadObjective(v) {
  if (!v.code) throw new Error('Nhập mã mục tiêu (ví dụ LO1).');
  if (!v.description) throw new Error('Nhập nội dung mục tiêu.');
  return { code: v.code, description: v.description };
}
DB_ACT.createObjective = (form) => dbRun(form, async (v) => {
  const o = dbReadObjective(v), lessonId = form.dataset.lesson;
  if (DB.data.objectives.some((x) => x.lesson_id === lessonId && x.code === o.code)) throw new Error('Mã ' + o.code + ' đã có trong bài học này.');
  await dbCall(EducMindDB.createObjective({ lesson_id: lessonId, ...o }));
}, 'Đã thêm mục tiêu.');
DB_ACT.editObjective = async (el) => {
  const o = DB.data.objectives.find((x) => x.id === el.dataset.id);
  let evidenceLocked = false;
  try {
    const evidence = await dbCall(EducMindDB.listEvidence([o.id]));
    evidenceLocked = evidence.length > 0;
  } catch (_) {
    evidenceLocked = false;
  }
  dbOpenDialog({
    title: 'Sửa mục tiêu', okLabel: 'Lưu thay đổi',
    body: dbField('Mã', 'db-eo-code', `<input id="db-eo-code" name="code" maxlength="20" value="${h(o.code)}" required ${evidenceLocked ? 'disabled' : ''}>`, evidenceLocked ? 'Mã mục tiêu đã khóa vì đã có bằng chứng học tập. Có thể sửa mô tả.' : '')
      + dbField('Nội dung mục tiêu', 'db-eo-desc', `<textarea id="db-eo-desc" name="description" rows="3" maxlength="500" required>${h(o.description)}</textarea>`),
    onOk: async (v) => {
      if (!v.description) throw new Error('Nhập nội dung mục tiêu.');
      const x = evidenceLocked ? { code: o.code, description: v.description } : dbReadObjective(v);
      if (DB.data.objectives.some((y) => y.lesson_id === o.lesson_id && y.id !== o.id && y.code === x.code)) throw new Error('Mã ' + x.code + ' đã có trong bài học này.');
      await dbCall(EducMindDB.updateObjective(o.id, x));
      toast('Đã lưu mục tiêu.');
    },
  });
};
DB_ACT.deleteObjective = (el) => {
  const o = DB.data.objectives.find((x) => x.id === el.dataset.id);
  dbConfirm('Xóa mục tiêu?', `“${dbObjLabel(o)}”. Mục tiêu đã gắn với bài tập, câu hỏi hoặc đã có kết quả học tập thì không xóa được.`, 'Xóa mục tiêu', async () => {
    const r = await dbCall(EducMindDB.deleteObjective(o.id));
    if (!r.length) throw new Error('Không xóa được mục tiêu này.');
    toast('Đã xóa mục tiêu.');
  }, true);
};

/* ===== Học sinh: Bài học ===== */
DB_PAGES.lessons = {
  title: 'Bài học',
  sub: 'Các bài học giáo viên đã xuất bản, kèm mức nắm vững của em ở từng mục tiêu.',
  async load() {
    const content = await dbLoadContent();
    const [mastery, courses] = await Promise.all([
      dbCallIn(EducMindDB.listMastery, content.objectives.map((o) => o.id)),
      DB.classId ? dbCall(EducMindDB.listCourses(DB.classId)) : [],
    ]);
    return { ...content, mastery: Object.fromEntries(mastery.map((m) => [m.objective_id, m])), seq: !!(courses[0] && courses[0].sequential_unlock) };
  },
  view(d) {
    if (!d.topics.length) return `<section class="panel">${dbEmpty('Giáo viên chưa xuất bản bài học nào cho lớp này.')}</section>`;
    const lessonsBy = dbGroup(d.lessons, 'topic_id'), objBy = dbGroup(d.objectives, 'lesson_id');
    const resBy = dbGroup(d.resources || [], 'lesson_id');
    /* Mở tuần tự: bài học bị khóa cho tới khi mọi mục tiêu của bài liền trước đạt ≥ 0,8.
       Bài không có mục tiêu thì không chặn bài sau. Thứ tự: theo chủ đề rồi theo bài học (display_order). */
    const locked = {};
    if (d.seq) {
      const flat = d.topics.flatMap((t) => lessonsBy[t.id] || []);
      let prevOk = true;
      for (const l of flat) {
        locked[l.id] = !prevOk;
        const objs = objBy[l.id] || [];
        prevOk = objs.length === 0 || objs.every((o) => Number(((d.mastery[o.id] || {}).mastery_score) || 0) >= 0.8);
      }
    }
    return d.topics.map((t, i) => {
      const lessons = lessonsBy[t.id] || [];
      return `<details class="topic-folder">
        <summary><span class="topic-mark">${String(i + 1).padStart(2, '0')}</span><span class="topic-title">${h(t.title)}</span><span class="pill plain">${lessons.length} bài học</span></summary>
        <div class="topic-lessons">${t.description ? `<p class="muted">${h(t.description)}</p>` : ''}
          ${lessons.map((l) => `<details class="scope-lesson">
            <summary><span><b>${h(l.title)}</b> ${locked[l.id] ? dbPill('Đang khóa', 'need') : ''}</span>${ic(locked[l.id] ? 'lock' : 'arrow', 16)}</summary>
            ${locked[l.id]
              ? `<div class="db-lock-note">${ic('lock', 16)} Bài học đang khóa — hãy nắm vững (≥ 0,8) mọi mục tiêu của bài trước để mở bài này.</div>`
              : `<div class="db-lesson" id="db-l-${h(l.id)}">
                  ${l.description ? `<p class="muted">${h(l.description)}</p>` : ''}
                  ${(objBy[l.id] || []).length ? `<ul class="db-objectives">${objBy[l.id].map((o) => `<li><span class="db-obj-code">${h(o.code)}</span><span class="db-obj-text">${h(o.description)}</span><span>${dbMasteryPill(d.mastery[o.id] ? d.mastery[o.id].mastery_score : null)}</span></li>`).join('')}</ul>` : `<p class="muted">Chưa có mục tiêu cho bài học này.</p>`}
                  ${dbLessonResources(l, resBy[l.id] || [])}
                  <div class="db-lesson-ai-bar">
                    ${dbBtn(ic('chat', 15) + ' Hỏi gia sư AI về bài này', 'chatAskLesson', { lesson: l.id, 'lesson-title': l.title, mode: 'tutor' }, 'light mini db-chat-trigger')}
                    ${dbBtn(ic('spark', 15) + ' Tạo câu luyện nhanh', 'chatAskLesson', { lesson: l.id, 'lesson-title': l.title, mode: 'quiz', quiz: '1' }, 'light mini db-chat-trigger')}
                  </div>
                </div>`}
          </details>`).join('') || `<div class="folder-empty">Chủ đề chưa có bài học được xuất bản.</div>`}
        </div>
      </details>`;
    }).join('');
  },
};
