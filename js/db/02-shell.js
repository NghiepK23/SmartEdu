/* EducMind · js/db/02-shell.js
   Khung giao diện của chế độ dữ liệu thật: thanh trên, thanh điều hướng, ô chọn lớp, thông báo và hộp thoại tài khoản.
   Lưu ý: Dùng lại các lớp CSS của bản gốc (.top, .side, .nav, .head, .panel, …) nên giao diện giống chế độ demo. */

/* Danh mục điều hướng: [tên nhóm, [[khóa trang, nhãn, biểu tượng], …]] */
const DB_NAV_T = [
  ['', [['home', 'Tổng quan', 'dashboard'], ['schedule', 'Lịch & việc cần làm', 'calendar']]],
  ['Dạy học', [['content', 'Thư mục học tập', 'lessons'], ['assignments', 'Bài tập', 'navAsg'], ['questions', 'Ngân hàng câu hỏi', 'questionBank'], ['assessments', 'Bài kiểm tra', 'exam'], ['ai', 'AI tạo câu hỏi', 'spark'], ['chat', 'Trợ lý AI', 'chat']]],
  ['Đánh giá học tập', [['progress', 'Mức độ nắm vững', 'mastery'], ['gaps', 'Lỗ hổng kiến thức', 'gaps'], ['recommend', 'Gợi ý học tập', 'recommend'], ['report', 'Báo cáo tiến bộ', 'trend'], ['class_overview', 'Sức khoẻ lớp học', 'classes']]],
  ['Quản lý', [['classes', 'Lớp học phụ trách', 'classes'], ['trash', 'Thùng rác', 'trash'], ['history', 'Lịch sử chỉnh sửa', 'history']]],
];
const DB_NAV_S = [
  ['', [['home', 'Tổng quan', 'dashboard'], ['schedule', 'Lịch & việc cần làm', 'calendar']]],
  ['Học tập', [['lessons', 'Bài học', 'lessons'], ['assignments', 'Bài tập', 'assignments'], ['assessments', 'Bài kiểm tra', 'exam'], ['chat', 'Trợ lý AI', 'chat']]],
  ['Kết quả', [['progress', 'Mức nắm vững', 'mastery'], ['gaps', 'Lỗ hổng kiến thức', 'gaps'], ['recommend', 'Gợi ý học tập', 'recommend'], ['report', 'Báo cáo tiến bộ', 'trend']]],
  ['Lớp học', [['classes', 'Lớp của em', 'classes']]],
];

function dbDockSubItems(T) {
  const p = DB.page || 'home';
  const arg = DB.arg || {};
  const sub = DB_UI.dockSub || '';
  const items = [];
  if (p === 'home') {
    const workItems = DB.data && typeof dbHomeWorkItems === 'function' ? dbHomeWorkItems(DB.data, T) : [];
    const needCount = T ? workItems.filter((x) => x.pending > 0).length : workItems.filter((x) => x.todo).length;
    if (T) {
      items.push(
        { sub: 'home-work', label: 'Bảng công việc', icon: 'list', active: sub ? sub === 'home-work' : DB_UI.homeTab !== 'PENDING' },
        { sub: 'home-pending', label: 'Chờ chấm', icon: 'grade', badge: needCount, active: sub ? sub === 'home-pending' : DB_UI.homeTab === 'PENDING' },
        { sub: 'home-analytics', label: 'Phân tích', icon: 'mastery', active: sub === 'home-analytics' },
        { sub: 'home-priorities', label: 'Ưu tiên', icon: 'alert', active: sub === 'home-priorities' },
        { sub: 'home-recent', label: 'Gần đây', icon: 'history', active: sub === 'home-recent' },
      );
    } else {
      items.push(
        { sub: 'home-work', label: 'Việc học tập', icon: 'list', active: sub ? sub === 'home-work' : DB_UI.homeTab !== 'TODO' },
        { sub: 'home-todo', label: 'Chưa xong', icon: 'clock', badge: needCount, active: sub ? sub === 'home-todo' : DB_UI.homeTab === 'TODO' },
        { sub: 'home-overview', label: 'Tiến độ', icon: 'mastery', active: sub === 'home-overview' },
        { sub: 'home-gaps', label: 'Cần củng cố', icon: 'gaps', active: sub === 'home-gaps' },
        { sub: 'home-tasks', label: 'Lộ trình', icon: 'target', active: sub === 'home-tasks' },
      );
    }
  } else if (p === 'schedule') {
    items.push(
      { sub: 'sched-cal', label: 'Lịch tháng', icon: 'calendar', active: !sub || sub === 'sched-cal' },
      { sub: 'sched-prev', label: 'Tháng trước', icon: 'chevronLeft', active: false },
      { sub: 'sched-next', label: 'Tháng sau', icon: 'chevronRight', active: false },
      { sub: 'sched-list', label: 'Việc cần làm', icon: 'list', active: sub === 'sched-list' },
    );
    if (typeof DB_SCHED_SEL !== 'undefined' && DB_SCHED_SEL) {
      items.push({ sub: 'sched-all-days', label: 'Bỏ lọc ngày', icon: 'refresh', active: false });
    }
  } else if (p === 'content') {
    if (arg.topicId && arg.lessonId) {
      const tab = typeof dbContentTab === 'function' ? dbContentTab() : (arg.tab === 'resources' ? 'resources' : 'objectives');
      const lesson = (DB.data?.lessons || []).find((l) => l.id === arg.lessonId);
      const published = lesson && lesson.status === 'PUBLISHED';
      items.push(
        { sub: 'content-tab-objectives', label: 'Mục tiêu', icon: 'target', active: tab === 'objectives' },
        { sub: 'content-tab-resources', label: 'Tài liệu', icon: 'file', active: tab === 'resources' },
        { sub: 'content-toggle-lesson', label: published ? 'Gỡ xuất bản' : 'Xuất bản', icon: published ? 'eyeOff' : 'eye', active: false },
        { sub: 'content-edit-lesson', label: 'Sửa bài học', icon: 'edit', active: false },
        { sub: 'content-delete-lesson', label: 'Xóa bài học', icon: 'trash', active: false },
        { sub: 'content-topic', label: 'Về chủ đề', icon: 'arrowLeft', active: false },
      );
    } else if (arg.topicId) {
      items.push(
        { sub: 'content-lessons', label: 'Bài học', icon: 'lessons', active: !sub || sub === 'content-lessons' },
        { sub: 'content-add-lesson', label: 'Thêm bài học', icon: 'plus', active: sub === 'content-add-lesson' },
        { sub: 'content-edit-topic', label: 'Sửa chủ đề', icon: 'edit', active: false },
        { sub: 'content-root', label: 'Thư mục', icon: 'arrowLeft', active: false },
      );
    } else {
      items.push(
        { sub: 'content-topics', label: 'Chủ đề', icon: 'lessons', active: !sub || sub === 'content-topics' },
        { sub: 'content-new-topic', label: 'Tạo chủ đề', icon: 'plus', active: sub === 'content-new-topic' },
        { sub: 'content-expand', label: 'Mở tất cả', icon: 'expand', active: sub === 'content-expand' },
        { sub: 'content-collapse', label: 'Thu gọn', icon: 'chevronUp', active: sub === 'content-collapse' },
        { sub: 'content-settings', label: 'Cài đặt AI', icon: 'settings', active: sub === 'content-settings' },
      );
    }
  } else if (p === 'lessons') {
    items.push(
      { sub: 'lessons-all', label: 'Chủ đề học', icon: 'lessons', active: !sub || sub === 'lessons-all' },
      { sub: 'lessons-expand', label: 'Mở tất cả', icon: 'expand', active: sub === 'lessons-expand' },
      { sub: 'lessons-collapse', label: 'Thu gọn', icon: 'chevronUp', active: sub === 'lessons-collapse' },
      { sub: 'lessons-tutor', label: 'Hỏi bài AI', icon: 'spark', active: false },
    );
  } else if (p === 'assignments') {
    if (T && arg.id) {
      items.push(
        { sub: 'asg-detail', label: 'Câu hỏi & Nộp', icon: 'list', active: arg.tab !== 'preview' && sub !== 'asg-subs' },
        { sub: 'asg-subs', label: 'Bài nộp', icon: 'grade', active: arg.tab !== 'preview' && sub === 'asg-subs' },
        { sub: 'asg-preview', label: 'Xem trước', icon: 'eye', active: arg.tab === 'preview' },
        { sub: 'asg-edit', label: 'Thiết lập', icon: 'settings', active: false },
        { sub: 'asg-list', label: 'Danh sách', icon: 'arrowLeft', active: false },
      );
    } else if (T && arg.edit) {
      items.push({ sub: 'asg-form', label: 'Thiết lập', icon: 'settings', active: true });
      if (arg.edit !== 'new') {
        items.push(
          { sub: 'asg-detail', label: 'Câu hỏi', icon: 'questions', active: false },
          { sub: 'asg-preview', label: 'Xem trước', icon: 'eye', active: false },
        );
      }
      items.push({ sub: 'asg-list', label: 'Danh sách', icon: 'arrowLeft', active: false });
    } else if (T) {
      items.push(
        { sub: 'asg-list', label: 'Danh sách', icon: 'list', active: !sub || sub === 'asg-list' },
        { sub: 'asg-new', label: 'Tạo bài tập', icon: 'plus', active: false },
        { sub: 'asg-expand', label: 'Mở thẻ', icon: 'expand', active: sub === 'asg-expand' },
        { sub: 'asg-collapse', label: 'Thu gọn', icon: 'chevronUp', active: sub === 'asg-collapse' },
      );
    } else if (arg.id) {
      items.push(
        { sub: 'asg-detail', label: 'Đề bài', icon: 'assignments', active: !sub || sub === 'asg-detail' },
        { sub: 'asg-submit', label: 'Bài làm', icon: 'edit', active: sub === 'asg-submit' },
        { sub: 'asg-list', label: 'Danh sách', icon: 'arrowLeft', active: false },
      );
    } else {
      items.push(
        { sub: 'asg-all', label: 'Tất cả bài', icon: 'list', active: !sub || sub === 'asg-all' },
        { sub: 'asg-todo', label: 'Chưa nộp', icon: 'clock', active: sub === 'asg-todo' },
        { sub: 'asg-done', label: 'Đã nộp', icon: 'check', active: sub === 'asg-done' },
      );
    }
  } else if (p === 'questions') {
    if (arg.edit) {
      items.push(
        { sub: 'q-form', label: 'Biểu mẫu', icon: 'edit', active: true },
        { sub: 'q-list', label: 'Về ngân hàng', icon: 'arrowLeft', active: false },
      );
    } else {
      items.push(
        { sub: 'q-table', label: 'Danh sách câu', icon: 'list', active: !sub || sub === 'q-table' },
        { sub: 'q-search', label: 'Tìm & lọc', icon: 'search', active: sub === 'q-search' },
        { sub: 'q-import', label: 'Nhập tệp', icon: 'upload', active: sub === 'q-import' },
        { sub: 'q-new', label: 'Thêm câu hỏi', icon: 'plus', active: false },
        { sub: 'q-export', label: 'Xuất Excel', icon: 'download', active: false },
      );
    }
  } else if (p === 'assessments') {
    if (T && arg.id && arg.attempt) {
      items.push(
        { sub: 'ex-review', label: 'Bài làm', icon: 'eye', active: true },
        { sub: 'ex-attempts', label: 'Về lượt làm', icon: 'arrowLeft', active: false },
        { sub: 'ex-list', label: 'Danh sách', icon: 'list', active: false },
      );
    } else if (T && arg.id) {
      items.push(
        { sub: 'ex-questions', label: 'Câu hỏi', icon: 'questions', active: arg.tab !== 'preview' && arg.tab !== 'attempts' },
        { sub: 'ex-preview', label: 'Xem trước', icon: 'eye', active: arg.tab === 'preview' },
        { sub: 'ex-attempts', label: 'Lượt làm', icon: 'students', active: arg.tab === 'attempts' },
        { sub: 'ex-edit', label: 'Thiết lập', icon: 'settings', active: false },
        { sub: 'ex-list', label: 'Danh sách', icon: 'arrowLeft', active: false },
      );
    } else if (T && arg.edit) {
      items.push({ sub: 'ex-edit', label: 'Thiết lập', icon: 'settings', active: true });
      if (arg.edit !== 'new') {
        items.push(
          { sub: 'ex-questions', label: 'Câu hỏi', icon: 'questions', active: false },
          { sub: 'ex-preview', label: 'Xem trước', icon: 'eye', active: false },
          { sub: 'ex-attempts', label: 'Lượt làm', icon: 'students', active: false },
        );
      }
      items.push({ sub: 'ex-list', label: 'Danh sách', icon: 'arrowLeft', active: false });
    } else if (T) {
      items.push(
        { sub: 'ex-list', label: 'Danh sách đề', icon: 'list', active: !sub || sub === 'ex-list' },
        { sub: 'ex-new', label: 'Tạo đề mới', icon: 'plus', active: false },
        { sub: 'ex-expand', label: 'Mở thẻ', icon: 'expand', active: sub === 'ex-expand' },
        { sub: 'ex-collapse', label: 'Thu gọn', icon: 'chevronUp', active: sub === 'ex-collapse' },
      );
    } else if (arg.id && arg.attempt) {
      items.push(
        { sub: 'ex-review', label: 'Xem lại', icon: 'eye', active: true },
        { sub: 'ex-detail', label: 'Về bài thi', icon: 'arrowLeft', active: false },
      );
    } else if (arg.id) {
      items.push(
        { sub: 'ex-info', label: 'Thông tin đề', icon: 'info', active: !sub || sub === 'ex-info' },
        { sub: 'ex-runs', label: 'Lượt làm', icon: 'history', active: sub === 'ex-runs' },
        { sub: 'ex-list', label: 'Danh sách', icon: 'arrowLeft', active: false },
      );
    } else {
      items.push(
        { sub: 'ex-all', label: 'Tất cả đề', icon: 'list', active: !sub || sub === 'ex-all' },
        { sub: 'ex-open', label: 'Đang mở', icon: 'play', active: sub === 'ex-open' },
      );
    }
  } else if (p === 'ai') {
    items.push(
      { sub: 'ai-form', label: 'Cấu hình AI', icon: 'spark', active: !sub || sub === 'ai-form' },
      { sub: 'ai-drafts', label: 'Bản nháp', icon: 'check', active: sub === 'ai-drafts' },
      { sub: 'ai-approve-all', label: 'Duyệt tất cả', icon: 'grade', active: false },
      { sub: 'ai-history', label: 'Lịch sử tạo', icon: 'history', active: sub === 'ai-history' },
    );
  } else if (p === 'chat') {
    const activeMode = typeof dbChatActiveMode === 'function' ? dbChatActiveMode() : 'tutor';
    const modes = T
      ? (typeof DB_CHAT_MODES_T !== 'undefined' ? DB_CHAT_MODES_T : [{ id: 'tutor', label: 'Trợ giảng' }])
      : (typeof DB_CHAT_MODES_S !== 'undefined' ? DB_CHAT_MODES_S : [{ id: 'tutor', label: 'Gia sư từng bước' }]);
    const modeIcons = { tutor: 'chat', lesson_plan: 'lessons', gap_analysis: 'gaps', quiz: 'spark' };
    modes.forEach((m) => {
      items.push({ sub: 'chat-mode:' + m.id, label: m.label, icon: modeIcons[m.id] || 'chat', active: activeMode === m.id });
    });
    items.push({ sub: 'chat-new', label: 'Hội thoại mới', icon: 'plus', active: false });
  } else if (p === 'progress' || p === 'gaps' || p === 'recommend') {
    items.push(
      { sub: 'eval-lesson', label: 'Lọc bài học', icon: 'filter', active: sub === 'eval-lesson' },
      { sub: 'eval-search', label: 'Tìm kiếm', icon: 'search', active: sub === 'eval-search' },
      { sub: 'eval-expand', label: 'Mở tất cả', icon: 'expand', active: sub === 'eval-expand' },
      { sub: 'eval-collapse', label: 'Thu gọn', icon: 'chevronUp', active: sub === 'eval-collapse' },
      { sub: 'eval-clear', label: 'Xóa lọc', icon: 'refresh', active: false },
    );
  } else if (p === 'report') {
    items.push({ sub: 'rep-top', label: 'Tổng quan', icon: 'trend', active: !sub || sub === 'rep-top' });
    if (T) items.push({ sub: 'rep-org', label: 'Đơn vị', icon: 'settings', active: sub === 'rep-org' });
    items.push(
      { sub: 'rep-excel', label: 'Xuất Excel', icon: 'file-spreadsheet', active: false },
      { sub: 'rep-word', label: 'Xuất Word', icon: 'file-text', active: false },
    );
  } else if (p === 'classes') {
    if (T) {
      items.push(
        { sub: 'cls-list', label: 'Lớp hiện có', icon: 'classes', active: !sub || sub === 'cls-list' },
        { sub: 'cls-new', label: 'Tạo lớp mới', icon: 'plus', active: sub === 'cls-new' },
        { sub: 'cls-members', label: 'Học sinh & Mã', icon: 'students', active: sub === 'cls-members' },
        { sub: 'cls-archived', label: 'Lưu trữ', icon: 'history', active: sub === 'cls-archived' },
      );
    } else {
      items.push(
        { sub: 'cls-join', label: 'Nhập mã lớp', icon: 'plus', active: sub === 'cls-join' },
        { sub: 'cls-list', label: 'Lớp đang học', icon: 'classes', active: !sub || sub === 'cls-list' },
      );
    }
  } else if (p === 'trash') {
    items.push(
      { sub: 'trash-search', label: 'Tìm kiếm', icon: 'search', active: !sub || sub === 'trash-search' },
      { sub: 'trash-clear', label: 'Xóa lọc', icon: 'refresh', active: false },
      { sub: 'trash-restore-all', label: 'Khôi phục hết', icon: 'undo', active: false },
    );
  } else if (p === 'history') {
    items.push(
      { sub: 'hist-top', label: 'Danh sách', icon: 'history', active: !sub || sub === 'hist-top' },
      { sub: 'hist-search', label: 'Tìm kiếm', icon: 'search', active: sub === 'hist-search' },
      { sub: 'hist-clear', label: 'Xóa lọc', icon: 'refresh', active: false },
    );
  } else if (p === 'class_overview') {
    items.push(
      { sub: 'co-kpi', label: 'Chỉ số', icon: 'dashboard', active: !sub || sub === 'co-kpi' },
      { sub: 'co-reteach', label: 'Cần dạy lại', icon: 'alert', active: sub === 'co-reteach' },
      { sub: 'co-groups', label: 'Nhóm HS', icon: 'students', active: sub === 'co-groups' },
      { sub: 'co-coverage', label: 'Độ phủ', icon: 'target', active: sub === 'co-coverage' },
      { sub: 'co-settings', label: 'Ngưỡng', icon: 'settings', active: sub === 'co-settings' },
    );
  } else if (p === 'games') {
    items.push(
      { sub: 'game-modes', label: 'Chế độ chơi', icon: 'play', active: !sub || sub === 'game-modes' },
      { sub: 'game-src', label: 'Nguồn câu hỏi', icon: 'questionBank', active: sub === 'game-src' },
      { sub: 'game-sound', label: 'Âm thanh', icon: 'info', active: false },
      { sub: 'game-history', label: 'Lịch sử chơi', icon: 'history', active: sub === 'game-history' },
    );
  }
  return items;
}

function dbSyncDockActive() {
  const dock = document.querySelector('.db-bottom-dock');
  if (!dock) return;
  const items = dbDockSubItems(dbIsTeacher());
  const bySub = Object.fromEntries(items.map((x) => [x.sub, x]));
  dock.querySelectorAll('.db-dock-item').forEach((btn) => {
    const it = bySub[btn.dataset.sub];
    const on = !!(it && it.active);
    btn.classList.toggle('is-active', on);
    if (on) btn.setAttribute('aria-current', 'true');
    else btn.removeAttribute('aria-current');
  });
  dbDockPillSync(dock);
}

/* Đặt viên thuốc trượt đúng vị trí mục đang chọn (kiểu tab bar iOS). */
function dbDockPillSync(dock) {
  if (!dock) return;
  const active = dock.querySelector('.db-dock-item.is-active');
  if (!active) { dock.style.setProperty('--dock-w', '0px'); return; }
  dock.style.setProperty('--dock-x', active.offsetLeft + 'px');
  dock.style.setProperty('--dock-w', active.offsetWidth + 'px');
}

function dbQuickCreateItems(T) {
  return T
    ? [
        { kind: 'page', page: 'assignments', arg: { edit: 'new' }, icon: 'assignments', label: 'Tạo bài tập mới', sub: 'Giao bài luyện tập cho lớp' },
        { kind: 'page', page: 'assessments', arg: { edit: 'new' }, icon: 'exam', label: 'Tạo bài kiểm tra', sub: 'Soạn đề có giới hạn thời gian' },
        { kind: 'page', page: 'questions', arg: {}, icon: 'questionBank', label: 'Thêm câu hỏi', sub: 'Bổ sung ngân hàng câu hỏi' },
        { kind: 'page', page: 'classes', arg: {}, icon: 'classes', label: 'Tạo lớp mới', sub: 'Mở lớp và tạo mã tham gia' },
        { kind: 'chat', icon: 'chat', label: 'Hỏi Trợ lý AI', sub: 'Soạn giáo án hoặc gợi ý câu hỏi' },
      ]
    : [
        { kind: 'page', page: 'classes', arg: {}, icon: 'classes', label: 'Tham gia lớp học', sub: 'Nhập mã lớp do giáo viên cấp' },
        { kind: 'page', page: 'games', arg: {}, icon: 'spark', label: 'Luyện tập trò chơi', sub: 'Ôn nhanh qua chế độ thi đấu' },
        { kind: 'chat', icon: 'chat', label: 'Hỏi Trợ lý AI', sub: 'Giải thích bài học từng bước' },
      ];
}

function dbBottomDockHtml(T) {
  const examLocked = DB.page === 'exam' || (typeof dbChatExamLocked === 'function' && dbChatExamLocked());
  if (examLocked || dbTeacherSetupRequired()) return '';
  const items = dbDockSubItems(T);
  if (!items.length) return '';
  const tabs = items.map((it) => {
    const badge = it.badge > 0 ? `<span class="db-dock-badge" aria-hidden="true">${it.badge > 9 ? '9+' : it.badge}</span>` : '';
    return `<button type="button" class="db-dock-item${it.active ? ' is-active' : ''}" data-act="dockSubAction" data-sub="${h(it.sub)}" ${it.active ? 'aria-current="true"' : ''} aria-label="${h(it.label)}" title="${h(it.label)}">${ic(it.icon, 16)}<span>${h(it.label)}</span>${badge}</button>`;
  }).join('');
  const ctx = DB.page || 'home';
  return `<div class="db-dock-wrap" aria-label="Chức năng trang hiện tại" data-context="${h(ctx)}">
    <nav class="db-bottom-dock" aria-label="Chức năng bên trong mục hiện tại" data-context="${h(ctx)}">${tabs}</nav>
  </div>`;
}

function dbSettingsTriggerHtml() {
  const open = DB_UI.settingsOpen;
  return `<div class="db-settings-wrap" id="db-settings-wrap">
    <button type="button" class="btn light db-settings-trigger" id="db-settings-trigger" data-act="toggleSettingsMenu" aria-label="Cài đặt" title="Cài đặt" aria-expanded="${open ? 'true' : 'false'}" aria-controls="db-settings-menu">
      <span class="nav-ic-tile" aria-hidden="true">${ic('settings', 16)}</span>
      <span class="nav-label">Cài đặt</span>
    </button>
  </div>`;
}

function dbSettingsMenuHtml() {
  const dark = typeof THEME !== 'undefined' && THEME === 'dark';
  const customBg = typeof layer4BackgroundData === 'function' && !!layer4BackgroundData();
  const themeLabel = dark ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối';
  const open = DB_UI.settingsOpen;
  return `<div class="db-settings-menu" id="db-settings-menu" role="menu" aria-label="Cài đặt hệ thống" ${open ? '' : 'hidden'}>
    <div class="db-settings-head">
      <b>Cài đặt</b>
      <small>Tùy chỉnh hệ thống & cá nhân</small>
    </div>
    <div class="db-settings-list">
      <button type="button" class="db-settings-item" data-act="openAccountFromSettings" role="menuitem">
        <span class="db-settings-ic" aria-hidden="true">${ic('user', 17)}</span>
        <span class="db-settings-copy">
          <b>Tài khoản</b>
          <small>${h(dbName(DB.me))} · ${dbIsTeacher() ? 'Giáo viên' : 'Học sinh'}</small>
        </span>
        <span class="db-settings-chevron" aria-hidden="true">${ic('chevronRight', 14)}</span>
      </button>

      <button type="button" class="db-settings-item" data-act="openThemeSettings" role="menuitem">
        <span class="db-settings-ic" aria-hidden="true">${ic(dark ? 'moon' : 'sun', 17)}</span>
        <span class="db-settings-copy">
          <b>Chế độ sáng / tối</b>
          <small>${dark ? 'Đang dùng giao diện Tối' : 'Đang dùng giao diện Sáng'}</small>
        </span>
        <span class="db-settings-chevron" aria-hidden="true">${ic('chevronRight', 14)}</span>
      </button>

      <button type="button" class="db-settings-item" data-act="openBgSettings" role="menuitem">
        <span class="db-settings-ic" aria-hidden="true">${ic('file-image', 17)}</span>
        <span class="db-settings-copy">
          <b>Đổi hình nền</b>
          <small>${customBg ? 'Đang dùng ảnh nền riêng' : 'Nền phong cảnh mặc định'}</small>
        </span>
        <span class="db-settings-chevron" aria-hidden="true">${ic('chevronRight', 14)}</span>
      </button>
    </div>
  </div>`;
}

function dbGlobalSearchMatches(rawQuery) {
  const q = dbFoldSearch(rawQuery);
  const T = dbIsTeacher();
  const out = [];
  const navGroups = T ? DB_NAV_T : DB_NAV_S;
  navGroups.forEach(([g, items]) => {
    items.forEach(([k, label, icon]) => {
      if (!q || dbFoldSearch(label).includes(q) || dbFoldSearch(k).includes(q) || (g && dbFoldSearch(g).includes(q))) {
        out.push({ kind: 'page', page: k, icon, title: label, sub: g ? `Mục · ${g}` : 'Chuyển nhanh phân hệ' });
      }
    });
  });
  if (q) {
    const settingsItems = [
      { act: 'openAccount', icon: 'user', title: 'Tài khoản', sub: 'Cài đặt tài khoản', keys: 'tai khoan ho so lop mon' },
      { act: 'openThemeSettings', icon: 'sun', title: 'Chế độ sáng / tối', sub: 'Cài đặt giao diện', keys: 'che do sang toi giao dien theme dark light' },
      { act: 'openBgSettings', icon: 'file-image', title: 'Đổi hình nền', sub: 'Cài đặt hình nền', keys: 'doi hinh nen anh nen wallpaper' },
    ];
    settingsItems.forEach((s) => {
      if (dbFoldSearch(s.title).includes(q) || s.keys.includes(q)) {
        out.push({ kind: 'act', act: s.act, icon: s.icon, title: s.title, sub: s.sub });
      }
    });
  }
  (DB.classes || []).forEach((c) => {
    if (q && dbFoldSearch(c.name).includes(q)) {
      out.push({ kind: 'class', classId: c.id, icon: 'classes', title: c.name, sub: c.id === DB.classId ? 'Lớp đang chọn' : 'Chuyển sang lớp này' });
    }
  });
  const d = DB.data && typeof DB.data === 'object' ? DB.data : null;
  if (d && q) {
    (d.assignments || []).forEach((a) => {
      if (dbFoldSearch(a.title).includes(q)) {
        out.push({ kind: 'page', page: 'assignments', id: a.id, icon: 'assignments', title: a.title, sub: 'Bài tập' });
      }
    });
    (d.assessments || []).forEach((e) => {
      if (dbFoldSearch(e.title).includes(q)) {
        out.push({ kind: 'page', page: 'assessments', id: e.id, icon: 'exam', title: e.title, sub: 'Bài kiểm tra' });
      }
    });
    (d.lessons || []).forEach((l) => {
      if (dbFoldSearch(l.title).includes(q)) {
        out.push({ kind: 'page', page: T ? 'content' : 'lessons', icon: 'lessons', title: l.title, sub: 'Bài học' });
      }
    });
  }
  return out.slice(0, 8);
}

function dbGlobalSearchHtml(matches, q) {
  if (!matches.length) {
    return `<div class="db-global-empty">Không tìm thấy mục phù hợp với “${h(q)}”.</div>`;
  }
  return matches.map((m) => {
    const attrs = m.kind === 'class'
      ? `data-kind="class" data-class-id="${h(m.classId)}"`
      : m.kind === 'act'
        ? `data-kind="act" data-target-act="${h(m.act)}"`
        : `data-kind="page" data-page="${h(m.page)}"${m.id ? ` data-id="${h(m.id)}"` : ''}`;
    return `<button type="button" class="db-global-item" role="option" data-act="globalSearchPick" ${attrs}><span class="db-global-ic" aria-hidden="true">${ic(m.icon, 15)}</span><span><b>${h(m.title)}</b><small>${h(m.sub)}</small></span><span class="db-global-go" aria-hidden="true">${ic('chevronRight', 14)}</span></button>`;
  }).join('');
}

function dbShell(P, body) {
  const T = dbIsTeacher();
  const collapsed = typeof sidebarCollapsed !== 'undefined' && sidebarCollapsed;
  const width = typeof sidebarWidth !== 'undefined' ? sidebarWidth : 196;
  const avatarPhoto = safeImageSrc(avatarPhotoData());
  const avatarFallback = h(dbInitials((DB.me && (DB.me.full_name || DB.me.email)) || ''));
  const avatarMarkup = `<span class="avatar" aria-hidden="true">${avatarPhoto ? `<img src="${h(avatarPhoto)}" alt="">` : avatarFallback}</span>`;
  const unread = DB.notifs.filter((n) => !n.is_read).length;
  const bellLabel = 'Thông báo' + (unread ? ', ' + unread + ' chưa xem' : '');
  const setupNotice = dbTeacherSetupRequired()
    ? `<div class="notice" role="alert"><div><b>Chưa hoàn tất thông tin giáo viên.</b> Hãy nhập Lớp và Môn học trong Tài khoản để sử dụng các chức năng của hệ thống. ${dbBtn('Cập nhật Tài khoản', 'openAccount', {}, 'light mini')}</div></div>`
    : '';
  const nav = (T ? DB_NAV_T : DB_NAV_S).map(([g, items]) => `<div class="grp${g ? '' : ' grp-bare'}">${g ? `<h2>${g}</h2>` : ''}<div class="items">${items.map(([k, label, icon]) => {
    const badge = k === 'home' && unread > 0 ? `<span class="nav-badge" aria-hidden="true">${unread > 9 ? '9+' : unread}</span>` : '';
    return `<button type="button" class="nav" id="nav-${k}" ${DB.page === k ? 'aria-current="page"' : ''} aria-label="${label}" title="${label}" data-act="go" data-page="${k}"><span class="nav-ic-tile" data-nav-tone="${k}" aria-hidden="true">${ic(icon, 15)}</span><span class="nav-label">${label}</span>${badge}</button>`;
  }).join('')}</div></div>`).join('');
  const title = typeof P.title === 'function' ? P.title() : P.title;
  const sub = typeof P.sub === 'function' ? P.sub() : P.sub;
  const activeClass = DB.classes.find((c) => c.id === DB.classId) || DB.classes[0] || null;
  const topClassPicker = DB.classes.length
    ? (T || P.hideClass
        ? `<span class="user-role user-class-static">· Lớp: ${h(activeClass ? activeClass.name : '')}</span>`
        : `<label class="user-class-picker" for="classSelect" title="Lớp"><span class="user-class-label">Lớp:</span><select id="classSelect" data-change="setClass" aria-label="Chọn lớp">${DB.classes.map((c) => `<option value="${h(c.id)}" ${c.id === DB.classId ? 'selected' : ''}>${h(c.name)}</option>`).join('')}</select></label>`)
    : `<span class="user-role user-class-static">· Chưa có lớp</span>`;
  const iconBtn = (label, icon, attrs, extra, cls) => `<button type="button" class="btn light icon-only ${cls || ''}" data-iconified="1" ${attrs} aria-label="${label}" title="${label}">${ic(icon, 18)}<span class="sr">${label}</span>${extra || ''}</button>`;
  const greetingName = h(dbName(DB.me));
  const studentHero = !T && DB.page === 'home'
    ? `<section class="db-student-hero db-home-hero db-home-hero--student" aria-label="Tổng quan học tập">
        <div class="db-student-hero-copy">
          <span class="db-student-hero-kicker">HÀNH TRÌNH HỌC TẬP CỦA EM</span>
          <h2>Chào ${greetingName}!</h2>
          <h3>Mỗi bước học hôm nay đưa em tiến xa hơn.</h3>
          <p>Bài học · mục tiêu · gợi ý dành riêng cho em</p>
          ${dbBtn('Bắt đầu học ngay', 'go', { page: 'lessons' }, 'db-student-hero-action')}
        </div>
        <div class="db-student-hero-art" aria-hidden="true">
          <img src="assets/student-characters.webp" alt="" width="1400" height="665" decoding="async">
        </div>
      </section>`
    : '';
  const sideHeader = `
    <div class="side-brand">
      <span class="side-brand-mark" aria-hidden="true">${ic('classes', 18)}</span>
      <div class="side-brand-copy"><b>EducMind</b><small>${T ? 'Không gian giảng dạy' : 'Không gian học tập'}</small></div>
    </div>`;
  const searchResults = DB_UI.globalOpen ? dbGlobalSearchHtml(dbGlobalSearchMatches(DB_UI.globalQuery), DB_UI.globalQuery) : '';
  app.innerHTML = `
  <header class="top db-student-top">
    ${brandLogoHtml()}
    <div class="user">${avatarPickerHtml(avatarMarkup)}<span class="user-greeting">Xin chào, ${greetingName}</span>${topClassPicker}</div>
    <span class="spacer"></span>
    <div class="db-global-search-wrap" id="db-global-search-box">
      ${ic('search', 15)}
      <input id="db-global-search" type="search" value="${h(DB_UI.globalQuery)}" placeholder="Tìm kiếm mục, lớp, bài tập…" aria-label="Tìm kiếm mục điều hướng, lớp và bài tập" data-input="globalSearch" autocomplete="off">
      <div id="db-global-results" class="db-global-results" role="listbox" aria-label="Kết quả tìm kiếm nhanh" ${DB_UI.globalOpen ? '' : 'hidden'}>${searchResults}</div>
    </div>
    <span class="spacer"></span>
    ${typeof dbChatTopBtnHtml === 'function' ? dbChatTopBtnHtml() : ''}
    ${iconBtn(bellLabel, 'bell', 'data-act="openNotifs" id="db-bell"', unread ? `<span class="nb" aria-hidden="true">${unread > 9 ? '9+' : unread}</span>` : '', 'notif-btn')}
    ${iconBtn('Đăng xuất', 'logout', 'data-app-act="logout"')}
  </header>
  <div class="layout ${T ? 'teacher-layout' : ''} ${collapsed ? 'sidebar-collapsed' : ''} ${DB.dialog ? 'has-dialog' : ''}" style="--sidebar-width:${width}px">
    <nav class="side" aria-label="Điều hướng chính">${sideHeader}${nav}<div class="side-footer">${dbSettingsTriggerHtml()}</div></nav>
    <button type="button" class="side-toggle" data-app-act="toggleSidebar" aria-label="${collapsed ? 'Mở rộng' : 'Thu gọn'} thanh điều hướng" title="${collapsed ? 'Mở rộng' : 'Thu gọn'} thanh điều hướng" aria-expanded="${!collapsed}">${ic(collapsed ? 'chevronRight' : 'chevronLeft', 16)}</button>
    <main class="main" id="main">
      <div class="head">
        <div><h1 id="pageTitle" tabindex="-1">${h(title)}</h1>${sub ? `<p class="sub">${h(sub)}</p>` : ''}</div>
      </div>
      ${typeof dbNetBannerHtml === 'function' ? dbNetBannerHtml() : ''}
      ${setupNotice}
      ${studentHero}
      <div class="view">${body}</div>
    </main>
  </div>${dbDialogHostHtml()}${dbBottomDockHtml(T)}${typeof dbChatDrawerHtml === 'function' ? dbChatDrawerHtml() : ''}<div class="db-settings-global-wrap" aria-hidden="true">${dbSettingsMenuHtml()}</div>`;
  applyLayer4Background();
  dbMountDialogHost();
  // iOS 26 adaptive morph — trigger morph animation khi đổi ngữ cảnh
  requestAnimationFrame(()=>{
    const w=document.querySelector('.db-dock-wrap');
    if(w){ w.classList.remove('is-morphing'); void w.offsetWidth; w.classList.add('is-morphing'); setTimeout(()=>w.classList.remove('is-morphing'),520); }
    dbDockPillSync(document.querySelector('.db-bottom-dock'));
  });
  if(!window.__dbDockPillBound){
    window.__dbDockPillBound = true;
    const sync=()=>dbDockPillSync(document.querySelector('.db-bottom-dock'));
    window.addEventListener('resize',sync,{passive:true});
    document.addEventListener('scroll',(e)=>{ if(e.target && e.target.classList && e.target.classList.contains('db-bottom-dock')) sync(); },{capture:true,passive:true});
  }
  // Đánh dấu body có dock để CSS ẩn nút trùng lặp trong khung chính
  document.body.classList.toggle('has-db-dock', !!document.querySelector('.db-bottom-dock'));
}

/* Đưa hộp thoại ra khỏi #app (về body) để lớp phủ .ov phủ đúng toàn khung nhìn.
   Nếu để trong #app/#main, backdrop-filter của khung kính biến #main thành
   containing block khiến lớp phủ chỉ còn hình chữ nhật của #main (góc sắc, xám thô). */
function dbMountDialogHost() {
  if (typeof document === 'undefined' || !document.body) return;
  const host = document.querySelector('#app .db-dialog-host');
  if (!host) {
    document.querySelectorAll('body > .db-dialog-host').forEach((n) => n.remove());
    return;
  }
  let fixed = document.getElementById('db-dialog-root');
  if (!fixed) {
    fixed = document.createElement('div');
    fixed.id = 'db-dialog-root';
    fixed.className = 'db-dialog-host';
    document.body.appendChild(fixed);
  }
  if (fixed.dataset.mark !== host.dataset.mark) {
    /* Giữ nguyên giá trị người dùng đã gõ khi hộp thoại được vẽ lại (ví dụ sau lỗi). */
    const typed = {};
    fixed.querySelectorAll('.db-dialog input, .db-dialog textarea, .db-dialog select').forEach((f) => {
      if (f.name) typed[f.name] = f.value;
    });
    fixed.innerHTML = host.innerHTML;
    fixed.dataset.mark = host.dataset.mark;
    Object.entries(typed).forEach(([name, value]) => {
      const f = fixed.querySelector(`.db-dialog [name="${name}"]`);
      if (f && !f.value) f.value = value;
    });
    /* Đưa tiêu điểm vào ô đầu tiên / nút Lưu: hộp thoại vừa được dời sang cổng ngoài #app. */
    const target = fixed.querySelector('.db-dialog [autofocus], .db-dialog input, .db-dialog textarea, .db-dialog select, .db-dialog #db-dlg-ok');
    if (target && fixed.contains(document.activeElement) === false) {
      const active = document.activeElement;
      const wasInside = active && active.closest && active.closest('#db-dialog-root');
      if (!wasInside) target.focus({ preventScroll: true });
    }
  }
  host.remove();
}

function dbFoldSearch(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().trim();
}
DB_ACT.filterNav = (el) => {
  const side = document.querySelector('#app .layout>.side');
  if (!side) return;
  const q = dbFoldSearch(el && el.value);
  side.querySelectorAll('.grp').forEach((grp) => {
    let shown = 0;
    grp.querySelectorAll('.nav').forEach((btn) => {
      const label = dbFoldSearch(btn.textContent || btn.getAttribute('aria-label') || '');
      const match = !q || label.includes(q);
      btn.hidden = !match;
      if (match) shown++;
    });
    grp.hidden = shown === 0;
  });
};
DB_ACT.globalSearch = (el) => {
  const q = String((el && el.value) || '');
  DB_UI.globalQuery = q;
  DB_UI.globalOpen = q.trim().length > 0;
  const box = document.getElementById('db-global-results');
  if (!box) return;
  if (!DB_UI.globalOpen) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  box.innerHTML = dbGlobalSearchHtml(dbGlobalSearchMatches(q), q);
  box.hidden = false;
};
DB_ACT.globalSearchPick = async (el) => {
  DB_UI.globalOpen = false;
  DB_UI.globalQuery = '';
  const box = document.getElementById('db-global-results');
  const inp = document.getElementById('db-global-search');
  if (box) box.hidden = true;
  if (inp) inp.value = '';
  if (el.dataset.kind === 'class' && el.dataset.classId) {
    await dbSetClass(el.dataset.classId);
    return;
  }
  if (el.dataset.kind === 'act' && el.dataset.targetAct && typeof DB_ACT[el.dataset.targetAct] === 'function') {
    await DB_ACT[el.dataset.targetAct]();
    return;
  }
  const page = el.dataset.page || 'home';
  const arg = el.dataset.id ? { id: el.dataset.id } : {};
  await dbGo(page, arg);
};
DB_ACT.toggleQuickMenu = () => {
  DB_UI.quickMenuOpen = !DB_UI.quickMenuOpen;
  const qm = document.getElementById('db-quick-menu');
  const qp = document.getElementById('db-dock-plus');
  if (qm) qm.hidden = !DB_UI.quickMenuOpen;
  if (qp) qp.setAttribute('aria-expanded', String(DB_UI.quickMenuOpen));
};
DB_ACT.toggleSettingsMenu = () => {
  DB_UI.settingsOpen = !DB_UI.settingsOpen;
  const sm = document.getElementById('db-settings-menu');
  const st = document.getElementById('db-settings-trigger');
  if (sm) sm.hidden = !DB_UI.settingsOpen;
  if (st) st.setAttribute('aria-expanded', String(DB_UI.settingsOpen));
};
DB_ACT.openAccountFromSettings = () => {
  DB_UI.settingsOpen = false;
  const sm = document.getElementById('db-settings-menu');
  const st = document.getElementById('db-settings-trigger');
  if (sm) sm.hidden = true;
  if (st) st.setAttribute('aria-expanded', 'false');
  return DB_ACT.openAccount();
};
DB_ACT.openBgSettings = () => {
  DB_UI.settingsOpen = false;
  const sm = document.getElementById('db-settings-menu');
  const st = document.getElementById('db-settings-trigger');
  if (sm) sm.hidden = true;
  if (st) st.setAttribute('aria-expanded', 'false');
  const current = typeof layer4BackgroundData === 'function' ? layer4BackgroundData() : '';
  const hasBg = !!current;
  dbOpenDialog({
    title: 'Đổi hình nền',
    compact: true,
    body: `<div class="db-bg-dlg-content">
      <div class="field" style="margin-top:4px">
        <label for="app-bg-url">Liên kết ảnh (URL)</label>
        <input id="app-bg-url" type="url" placeholder="https://images.unsplash.com/…" inputmode="url">
      </div>
      <div class="row db-bg-dlg-actions" style="margin:8px 0 10px;gap:8px;align-items:center">
        <button type="button" class="btn mini" data-app-act="applyLayer4BgUrl">Áp dụng</button>
        ${hasBg ? `<button type="button" class="btn light mini danger-soft" data-app-act="clearLayer4Background">Xóa nền</button>` : ''}
        <span style="margin-left:auto;display:flex;gap:10px;font-size:.75rem">
          <a href="https://unsplash.com/" target="_blank" rel="noopener noreferrer">Unsplash ↗</a>
          <a href="https://www.pexels.com/" target="_blank" rel="noopener noreferrer">Pexels ↗</a>
        </span>
      </div>
      <div class="field" style="margin-top:10px;border-top:1px solid var(--line);padding-top:10px">
        <label for="app-bg-file">Hoặc tải ảnh lên</label>
        <input id="app-bg-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-app-change="layer4BgFileChanged">
      </div>
      <div class="app-bg-status" id="app-bg-status" role="status" style="margin-top:6px;font-size:.78rem;color:var(--muted)"></div>
    </div>`,
  });
};
DB_ACT.openThemeSettings = () => {
  DB_UI.settingsOpen = false;
  const sm = document.getElementById('db-settings-menu');
  const st = document.getElementById('db-settings-trigger');
  if (sm) sm.hidden = true;
  if (st) st.setAttribute('aria-expanded', 'false');
  const dark = typeof THEME !== 'undefined' && THEME === 'dark';
  dbOpenDialog({
    title: 'Giao diện',
    compact: true,
    body: `<div class="db-theme-dlg-content" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:2px 0">
      <button type="button" class="btn ${!dark ? 'primary' : 'light'}" data-act="setThemeLight" style="display:flex;align-items:center;justify-content:center;gap:8px;min-height:42px;border-radius:12px!important">
        ${ic('sun', 16)}
        <span>Sáng</span>
      </button>
      <button type="button" class="btn ${dark ? 'primary' : 'light'}" data-act="setThemeDark" style="display:flex;align-items:center;justify-content:center;gap:8px;min-height:42px;border-radius:12px!important">
        ${ic('moon', 16)}
        <span>Tối</span>
      </button>
    </div>`,
  });
};
DB_ACT.setThemeLight = () => {
  if (typeof setTheme === 'function') setTheme('light');
  dbCloseDialog();
};
DB_ACT.setThemeDark = () => {
  if (typeof setTheme === 'function') setTheme('dark');
  dbCloseDialog();
};
DB_ACT.quickCreateAction = async (el) => {
  const idx = Number(el.dataset.qidx);
  const items = dbQuickCreateItems(dbIsTeacher());
  const item = items[idx];
  DB_UI.quickMenuOpen = false;
  const qm = document.getElementById('db-quick-menu');
  const qp = document.getElementById('db-dock-plus');
  if (qm) qm.hidden = true;
  if (qp) qp.setAttribute('aria-expanded', 'false');
  if (!item) return;
  if (item.kind === 'chat') {
    if (typeof DB_ACT.toggleChatDrawer === 'function' && DB.page !== 'chat') return DB_ACT.toggleChatDrawer();
    return dbGo('chat', {});
  }
  return dbGo(item.page, item.arg || {});
};

function dbDockScrollTo(selector, focusSelector) {
  const mainEl = document.getElementById('main') || document;
  const target = selector ? mainEl.querySelector(selector) : null;
  if (target) {
    const det = target.closest ? target.closest('details') : null;
    if (det && 'open' in det) det.open = true;
    if (target.tagName === 'DETAILS' && 'open' in target) target.open = true;
    if (typeof target.scrollIntoView === 'function') target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const focusEl = focusSelector ? mainEl.querySelector(focusSelector) : null;
  if (focusEl && typeof focusEl.focus === 'function') focusEl.focus();
  return target;
}

DB_ACT.dockSubAction = async (el) => {
  const sub = String(el?.dataset?.sub || '');
  const T = dbIsTeacher();
  const arg = DB.arg || {};
  DB_UI.dockSub = sub;

  if (sub === 'home-work' || sub === 'home-pending' || sub === 'home-todo') {
    const tab = sub === 'home-pending' ? 'PENDING' : sub === 'home-todo' ? 'TODO' : 'ALL';
    if (typeof DB_ACT.homeFilterTab === 'function') DB_ACT.homeFilterTab({ dataset: { tab } });
    dbDockScrollTo('#db-home-work-panel');
    dbSyncDockActive();
    return;
  }
  if (sub === 'home-analytics') { dbDockScrollTo('.td-analytics'); dbSyncDockActive(); return; }
  if (sub === 'home-priorities') { dbDockScrollTo('.td-priorities'); dbSyncDockActive(); return; }
  if (sub === 'home-recent') { dbDockScrollTo('.td-recent'); dbSyncDockActive(); return; }
  if (sub === 'home-overview') { dbDockScrollTo('.sd-db-overview'); dbSyncDockActive(); return; }
  if (sub === 'home-gaps') { dbDockScrollTo('.sd-db-gaps'); dbSyncDockActive(); return; }
  if (sub === 'home-tasks') { dbDockScrollTo('.sd-db-tasks'); dbSyncDockActive(); return; }

  if (sub === 'sched-cal') { dbDockScrollTo('.db-sched-cal'); dbSyncDockActive(); return; }
  if (sub === 'sched-prev' && typeof dbSchedMoveMonth === 'function') { dbSchedMoveMonth(-1); return; }
  if (sub === 'sched-next' && typeof dbSchedMoveMonth === 'function') { dbSchedMoveMonth(1); return; }
  if (sub === 'sched-list') { dbDockScrollTo('.db-sched-list, #db-h-sch'); dbSyncDockActive(); return; }
  if (sub === 'sched-all-days' && typeof DB_SCHED_SEL !== 'undefined') { DB_SCHED_SEL = ''; DB_UI.dockSub = ''; render(); return; }

  if (sub === 'content-tab-objectives' && typeof DB_ACT.selectContentTab === 'function') { DB_ACT.selectContentTab({ dataset: { tab: 'objectives' } }); return; }
  if (sub === 'content-tab-resources' && typeof DB_ACT.selectContentTab === 'function') { DB_ACT.selectContentTab({ dataset: { tab: 'resources' } }); return; }
  if (sub === 'content-toggle-lesson' && arg.lessonId && typeof DB_ACT.toggleLesson === 'function') {
    return DB_ACT.toggleLesson({ dataset: { id: arg.lessonId } });
  }
  if (sub === 'content-edit-lesson' && arg.lessonId && typeof DB_ACT.editLesson === 'function') {
    return DB_ACT.editLesson({ dataset: { id: arg.lessonId } });
  }
  if (sub === 'content-delete-lesson' && arg.lessonId && typeof DB_ACT.deleteLesson === 'function') {
    return DB_ACT.deleteLesson({ dataset: { id: arg.lessonId } });
  }
  if (sub === 'content-topic' && arg.topicId && typeof DB_ACT.openContentTopic === 'function') { DB_ACT.openContentTopic({ dataset: { id: arg.topicId } }); return; }
  if (sub === 'content-root' && typeof DB_ACT.openContentRoot === 'function') { DB_ACT.openContentRoot(); return; }
  if (sub === 'content-lessons') { dbDockScrollTo('.topic-lessons, #main'); dbSyncDockActive(); return; }
  if (sub === 'content-add-lesson') { dbDockScrollTo('#db-nl-' + arg.topicId, '#db-nl-' + arg.topicId); dbSyncDockActive(); return; }
  if (sub === 'content-edit-topic' && arg.topicId && typeof DB_ACT.editTopic === 'function') { DB_ACT.editTopic({ dataset: { id: arg.topicId } }); return; }
  if (sub === 'content-topics') { dbDockScrollTo('.db-topic-list, #main'); dbSyncDockActive(); return; }
  if (sub === 'content-new-topic') {
    if (typeof DB_ACT.openCreateTopicDialog === 'function') DB_ACT.openCreateTopicDialog();
    dbSyncDockActive();
    return;
  }
  if (sub === 'content-expand' || sub === 'lessons-expand') {
    document.querySelectorAll('#main details.topic-folder, #main details.scope-lesson').forEach((d) => { d.open = true; });
    dbSyncDockActive();
    return;
  }
  if (sub === 'content-collapse' || sub === 'lessons-collapse') {
    document.querySelectorAll('#main details.topic-folder, #main details.scope-lesson').forEach((d) => { d.open = false; });
    dbSyncDockActive();
    return;
  }
  if (sub === 'content-settings') { dbDockScrollTo('details.db-content-settings'); dbSyncDockActive(); return; }
  if (sub === 'lessons-all') { dbDockScrollTo('#main'); dbSyncDockActive(); return; }
  if (sub === 'lessons-tutor') {
    if (typeof DB_ACT.toggleChatDrawer === 'function') return DB_ACT.toggleChatDrawer();
    return;
  }

  if (sub === 'asg-detail') {
    if (arg.id && !arg.tab && !arg.edit) { dbDockScrollTo('#main'); dbSyncDockActive(); return; }
    const targetId = arg.id || (arg.edit && arg.edit !== 'new' ? arg.edit : '');
    if (targetId) return dbGo('assignments', { id: targetId });
  }
  if (sub === 'asg-subs') {
    if (arg.id && arg.tab) { DB_UI.dockSub = 'asg-subs'; await dbGo('assignments', { id: arg.id }); dbDockScrollTo('#db-h-subs'); return; }
    dbDockScrollTo('#db-h-subs');
    dbSyncDockActive();
    return;
  }
  if (sub === 'asg-preview') {
    const targetId = arg.id || (arg.edit && arg.edit !== 'new' ? arg.edit : '');
    if (targetId) return dbGo('assignments', { id: targetId, tab: 'preview' });
  }
  if (sub === 'asg-edit' && arg.id) return dbGo('assignments', { edit: arg.id });
  if (sub === 'asg-form') { dbDockScrollTo('#main form'); dbSyncDockActive(); return; }
  if (sub === 'asg-list') {
    if (arg.id || arg.edit) return dbGo('assignments', {});
    dbDockScrollTo('#main');
    dbSyncDockActive();
    return;
  }
  if (sub === 'asg-new') return dbGo('assignments', { edit: 'new' });
  if (sub === 'asg-expand' || sub === 'ex-expand') {
    document.querySelectorAll('#main details.work-card').forEach((d) => { d.open = true; });
    dbSyncDockActive();
    return;
  }
  if (sub === 'asg-collapse' || sub === 'ex-collapse') {
    document.querySelectorAll('#main details.work-card').forEach((d) => { d.open = false; });
    dbSyncDockActive();
    return;
  }
  if (sub === 'asg-submit') { dbDockScrollTo('form[data-act="submitAssignment"], .db-assignment-game, .db-assignment-review'); dbSyncDockActive(); return; }
  if (sub === 'asg-all' || sub === 'asg-todo' || sub === 'asg-done') {
    document.querySelectorAll('#main .db-task').forEach((card) => {
      const need = !!card.querySelector('.pill.need');
      card.hidden = sub === 'asg-todo' ? !need : sub === 'asg-done' ? need : false;
    });
    dbSyncDockActive();
    return;
  }

  if (sub === 'q-form') { dbDockScrollTo('#main form', '#main form input, #main form textarea'); dbSyncDockActive(); return; }
  if (sub === 'q-list') return dbGo('questions', {});
  if (sub === 'q-table') { dbDockScrollTo('.db-qtable-fold'); dbSyncDockActive(); return; }
  if (sub === 'q-search') { dbDockScrollTo('.db-filter', '#db-q-search'); dbSyncDockActive(); return; }
  if (sub === 'q-import') { dbDockScrollTo('.db-create-source', '#db-q-import'); dbSyncDockActive(); return; }
  if (sub === 'q-new') return dbGo('questions', { edit: 'new' });
  if (sub === 'q-export' && typeof DB_ACT.exportQuestions === 'function') { DB_ACT.exportQuestions(); return; }

  if (sub === 'ex-review' || sub === 'ex-info') { dbDockScrollTo('#main'); dbSyncDockActive(); return; }
  if (sub === 'ex-detail' && arg.id) return dbGo('assessments', { id: arg.id });
  if (sub === 'ex-runs') { dbDockScrollTo('#db-h-sr'); dbSyncDockActive(); return; }
  if (sub === 'ex-questions') {
    const targetId = arg.id || (arg.edit && arg.edit !== 'new' ? arg.edit : '');
    if (targetId) return dbGo('assessments', { id: targetId });
  }
  if (sub === 'ex-preview') {
    const targetId = arg.id || (arg.edit && arg.edit !== 'new' ? arg.edit : '');
    if (targetId) return dbGo('assessments', { id: targetId, tab: 'preview' });
  }
  if (sub === 'ex-attempts') {
    const targetId = arg.id || (arg.edit && arg.edit !== 'new' ? arg.edit : '');
    if (targetId) return dbGo('assessments', { id: targetId, tab: 'attempts' });
  }
  if (sub === 'ex-edit') {
    if (arg.id) return dbGo('assessments', { edit: arg.id });
    dbDockScrollTo('#main form');
    dbSyncDockActive();
    return;
  }
  if (sub === 'ex-list') {
    if (arg.id || arg.edit) return dbGo('assessments', {});
    dbDockScrollTo('#main');
    dbSyncDockActive();
    return;
  }
  if (sub === 'ex-new') return dbGo('assessments', { edit: 'new' });
  if (sub === 'ex-all' || sub === 'ex-open') {
    document.querySelectorAll('#main .db-task').forEach((card) => {
      card.hidden = sub === 'ex-open' ? !card.querySelector('.pill.good, .pill.need') : false;
    });
    dbSyncDockActive();
    return;
  }

  if (sub === 'ai-form') { dbDockScrollTo('#db-h-aif', '#db-ai-lesson, #db-ai-topic'); dbSyncDockActive(); return; }
  if (sub === 'ai-drafts') { dbDockScrollTo('#db-h-aip'); dbSyncDockActive(); return; }
  if (sub === 'ai-approve-all') {
    const approveBtn = document.querySelector('#main [data-act="aiApproveAll"]');
    if (approveBtn && typeof DB_ACT.aiApproveAll === 'function') return DB_ACT.aiApproveAll(approveBtn);
    dbDockScrollTo('#db-h-aip');
    dbSyncDockActive();
    return;
  }
  if (sub === 'ai-history') { dbDockScrollTo('.db-ai-history, #main section.panel:last-of-type'); dbSyncDockActive(); return; }

  if (sub.startsWith('chat-mode:') && typeof DB_ACT.chatSetMode === 'function') {
    const mode = sub.slice('chat-mode:'.length);
    DB_UI.dockSub = '';
    DB_ACT.chatSetMode({ dataset: { mode } });
    dbSyncDockActive();
    return;
  }
  if (sub === 'chat-new' && typeof DB_ACT.chatNewThread === 'function') {
    DB_UI.dockSub = '';
    DB_ACT.chatNewThread();
    dbSyncDockActive();
    return;
  }

  if (sub === 'eval-lesson') { dbDockScrollTo('[data-pf-lesson]', '[data-pf-lesson]'); dbSyncDockActive(); return; }
  if (sub === 'eval-search') { dbDockScrollTo('[data-pf-q]', '[data-pf-q]'); dbSyncDockActive(); return; }
  if (sub === 'eval-expand' && typeof DB_ACT.pfFold === 'function') { DB_ACT.pfFold({ dataset: { dir: 'open' } }); dbSyncDockActive(); return; }
  if (sub === 'eval-collapse' && typeof DB_ACT.pfFold === 'function') { DB_ACT.pfFold({ dataset: { dir: 'close' } }); dbSyncDockActive(); return; }
  if (sub === 'eval-clear' && typeof DB_ACT.pfClear === 'function') { DB_UI.dockSub = ''; DB_ACT.pfClear(); dbSyncDockActive(); return; }

  if (sub === 'rep-top') {
    if (T && typeof DB_REPORT_STU !== 'undefined' && DB_REPORT_STU) { DB_REPORT_STU = ''; render(); return; }
    dbDockScrollTo('#main');
    dbSyncDockActive();
    return;
  }
  if (sub === 'rep-org') { dbDockScrollTo('details.db-org', 'details.db-org input'); dbSyncDockActive(); return; }
  if (sub === 'rep-excel' && typeof DB_ACT.reportExcel === 'function') { DB_ACT.reportExcel(el); return; }
  if (sub === 'rep-word' && typeof DB_ACT.reportWord === 'function') { DB_ACT.reportWord(el); return; }

  if (sub === 'cls-list') { dbDockScrollTo('#db-h-classes'); dbSyncDockActive(); return; }
  if (sub === 'cls-new') { dbDockScrollTo('#db-h-newclass', '#db-class-name'); dbSyncDockActive(); return; }
  if (sub === 'cls-members') { dbDockScrollTo('#db-h-members'); dbSyncDockActive(); return; }
  if (sub === 'cls-archived') { dbDockScrollTo('#db-h-archived'); dbSyncDockActive(); return; }
  if (sub === 'cls-join') { dbDockScrollTo('#db-h-join', '#db-join-code-input'); dbSyncDockActive(); return; }

  if (sub === 'trash-search') { dbDockScrollTo('#db-trash-search', '#db-trash-search'); dbSyncDockActive(); return; }
  if (sub === 'trash-clear' && typeof DB_ACT.clearTrashFilters === 'function') { DB_UI.dockSub = ''; DB_ACT.clearTrashFilters(); dbSyncDockActive(); return; }
  if (sub === 'trash-restore-all' && typeof DB_ACT.restoreAllTrash === 'function') { DB_ACT.restoreAllTrash(); return; }

  if (sub === 'hist-top') { dbDockScrollTo('#db-h-h'); dbSyncDockActive(); return; }
  if (sub === 'hist-search') { dbDockScrollTo('#db-history-search', '#db-history-search'); dbSyncDockActive(); return; }
  if (sub === 'hist-clear' && typeof DB_ACT.clearHistoryFilters === 'function') { DB_UI.dockSub = ''; DB_ACT.clearHistoryFilters(); dbSyncDockActive(); return; }

  if (sub === 'co-kpi') { dbDockScrollTo('#db-co-kpi'); dbSyncDockActive(); return; }
  if (sub === 'co-reteach') { dbDockScrollTo('#db-co-reteach'); dbSyncDockActive(); return; }
  if (sub === 'co-coverage') { dbDockScrollTo('#db-co-coverage'); dbSyncDockActive(); return; }
  if (sub === 'co-settings') { dbDockScrollTo('#db-co-settings', '#db-dash-reteach'); dbSyncDockActive(); return; }
  if (sub === 'co-groups') { dbDockScrollTo('#db-co-groups'); dbSyncDockActive(); return; }

  if (sub === 'game-modes') { dbDockScrollTo('#db-h-gl'); dbSyncDockActive(); return; }
  if (sub === 'game-src') { dbDockScrollTo('#db-game-src', '#db-game-src'); dbSyncDockActive(); return; }
  if (sub === 'game-sound' && typeof DB_ACT.gameToggleSound === 'function') { DB_ACT.gameToggleSound(); return; }
  if (sub === 'game-history') { dbDockScrollTo('.db-game-history, #main'); dbSyncDockActive(); return; }
};

/* ===== Thông báo ===== */
const DB_NOTIF_EVERY = 60000;
async function dbLoadNotifications(reportError = false) {
  if (!dbActive()) return false;
  try {
    const list = await dbCall(EducMindDB.listNotifications(30));
    if (!dbActive()) return false;
    const before = DB.notifs.filter((n) => !n.is_read).length, after = list.filter((n) => !n.is_read).length;
    DB.notifs = list;
    if (before !== after) dbPaintBell();
    return true;
  } catch (e) {
    console.warn('Không tải được thông báo:', e.message || e);
    if (reportError) throw e;
    return false;
  }
}
/* Chỉ cập nhật con số trên chuông, không vẽ lại cả trang (tránh làm mất nội dung người dùng đang nhập). */
function dbPaintBell() {
  const b = document.getElementById('db-bell');
  if (!b) return;
  const unread = DB.notifs.filter((n) => !n.is_read).length, label = 'Thông báo' + (unread ? ', ' + unread + ' chưa xem' : '');
  b.setAttribute('aria-label', label); b.title = label;
  const sr = b.querySelector('.sr');
  if (sr) sr.textContent = label;
  let nb = b.querySelector('.nb');
  if (unread) { if (!nb) { nb = document.createElement('span'); nb.className = 'nb'; nb.setAttribute('aria-hidden', 'true'); b.appendChild(nb); } nb.textContent = unread > 9 ? '9+' : String(unread); }
  else if (nb) nb.remove();
}
function dbStartNotifications() {
  dbLoadNotifications();
  DB.timers.push(setInterval(dbLoadNotifications, DB_NOTIF_EVERY));
  /* Realtime: chuông tự cập nhật khi có thông báo mới; dự phòng tự nạp lại định kỳ. */
  if (typeof dbLiveStart === 'function') dbLiveStart();
}
/* Thông báo do máy chủ tạo, payload.page cho biết nên mở trang nào. */
function dbNotifTarget(n) {
  const p = n.payload || {}, T = dbIsTeacher();
  const map = {
    grading: p.assessment_id ? ['assessments', { id: p.assessment_id, tab: 'attempts' }] : ['assignments', { id: p.assignment_id }],
    results: p.assessment_id ? ['assessments', { id: p.assessment_id }] : ['assignments', { id: p.assignment_id }],
    lessons: [T ? 'content' : 'lessons', {}],
    assignments: ['assignments', p.assignment_id ? { id: p.assignment_id } : {}],
    assessments: ['assessments', p.assessment_id ? { id: p.assessment_id } : {}],
    recommend: ['recommend', {}],
    ai: ['ai', {}],
    students: ['classes', {}],
    dashboard: ['home', {}],
  };
  const t = map[p.page] || ['home', {}];
  Object.keys(t[1]).forEach((k) => t[1][k] == null && delete t[1][k]);
  return { page: t[0], arg: t[1], classId: p.class_id || '' };
}
function dbShowNotifications() {
  const rows = DB.notifs.map((n) => `<div class="db-notif-row">
      <button type="button" class="db-notif${n.is_read ? '' : ' unread'}" data-act="openNotif" data-id="${h(n.id)}">
        <b>${h(n.title)}</b>${n.content ? `<span class="muted">${h(n.content)}</span>` : ''}<span class="muted db-notif-time">${dbDateTime(n.created_at)}${n.is_read ? '' : ' · chưa xem'}</span>
      </button><button type="button" class="btn light icon-only mini danger-soft db-notif-delete" data-iconified="1" data-act="hideNotification" data-id="${h(n.id)}" aria-label="Ẩn thông báo" title="Ẩn thông báo">${ic('trash', 18)}<span class="sr">Ẩn thông báo</span></button>
    </div>`).join('');
  const controls = DB.notifs.length
    ? `<div class="db-notif-controls">${dbBtn('Đánh dấu tất cả đã xem', 'readAllNotifs', {}, 'light mini')}${dbBtn('Ẩn tất cả', 'hideAllNotifications', {}, 'light mini danger-soft')}</div>`
    : '';
  dbOpenDialog({
    title: 'Thông báo', wide: true,
    body: controls + (rows ? `<div class="db-notifs">${rows}</div>` : dbEmpty('Chưa có thông báo nào.')),
  });
}
DB_ACT.openNotifs = async () => {
  await dbLoadNotifications(true);
  dbShowNotifications();
};
DB_ACT.hideNotification = (el) => {
  const n = DB.notifs.find((x) => x.id === el.dataset.id);
  if (!n) throw new Error('Không tìm thấy thông báo cần ẩn.');
  dbConfirm('Ẩn thông báo?', `Thông báo “${h(n.title)}” sẽ không còn hiển thị trong danh sách của bạn.`, 'Ẩn thông báo', async () => {
    const hidden = await dbCall(EducMindDB.hideNotification(n.id));
    if (!hidden.length) throw new Error('Thông báo không còn tồn tại hoặc không thuộc tài khoản của bạn.');
    DB.notifs = DB.notifs.filter((x) => x.id !== n.id);
    dbPaintBell();
    toast('Đã ẩn thông báo khỏi danh sách của bạn.');
    dbShowNotifications();
    return false;
  }, true);
};
DB_ACT.readAllNotifs = (el) => dbRun(el, async () => {
  await dbCall(EducMindDB.markAllNotificationsRead());
  DB.notifs.forEach((n) => { n.is_read = true; });
  DB.dialog = null; render();
  return false;
}, 'Đã đánh dấu tất cả thông báo là đã xem.');
DB_ACT.hideAllNotifications = () => dbConfirm('Ẩn tất cả thông báo?', 'Tất cả thông báo sẽ không còn hiển thị trong danh sách của bạn.', 'Ẩn tất cả', async () => {
  await dbCall(EducMindDB.hideAllNotifications());
  DB.notifs = [];
  dbPaintBell();
  toast('Đã ẩn tất cả thông báo khỏi danh sách của bạn.');
  dbShowNotifications();
  return false;
}, true);
DB_ACT.openNotif = async (el) => {
  const n = DB.notifs.find((x) => x.id === el.dataset.id);
  if (!n) return;
  if (!n.is_read) { n.is_read = true; EducMindDB.markNotificationRead(n.id).then(({ error }) => error && console.warn(error.message)); }
  const t = dbNotifTarget(n);
  DB.dialog = null;
  if (t.classId && t.classId !== DB.classId && DB.classes.some((c) => c.id === t.classId)) await dbSetClass(t.classId, t.page, t.arg);
  else await dbGo(t.page, t.arg);
};

/* ===== Tài khoản ===== */
DB_ACT.openAccount = async () => {
  const courses = await dbCall(EducMindDB.listCoursesForClasses(DB.classes.map((c) => c.id)));
  const coursesByClass = Object.fromEntries(courses.map((course) => [course.class_id, course]));
  const selectedClass = DB.classes.find((c) => c.id === DB.classId) || DB.classes[0] || null;
  let accountClass = selectedClass;
  const selectedCourse = selectedClass ? coursesByClass[selectedClass.id] : null;
  const setupRequired = dbIsTeacher() && dbTeacherSetupRequired();
  const classInfo = DB.classes.length
    ? DB.classes.map((c) => `<div class="item"><div><b>${h(c.name)}</b><div class="muted">Môn học: ${h((coursesByClass[c.id] || {}).title || 'Chưa thiết lập')}</div></div></div>`).join('')
    : `<p class="muted">Chưa có lớp nào.</p>`;
  const teacherFields = dbIsTeacher()
    ? dbField('Lớp', 'db-acc-class', `<input id="db-acc-class" name="class_name" maxlength="100" value="${h(selectedClass ? selectedClass.name : '')}" autocomplete="off">`, DB.classes.length > 1 ? 'Lớp đang chọn: ' + h(selectedClass.name) : '')
      + dbField('Môn học', 'db-acc-subject', `<input id="db-acc-subject" name="subject" maxlength="120" value="${h(selectedCourse ? selectedCourse.title : '')}" placeholder="Ví dụ: Toán, Ngữ văn..." autocomplete="off">`)
      + (setupRequired ? `<p class="muted" role="alert">Nhập Lớp và Môn học để tiếp tục.</p>` : '')
    : `<div class="field"><span class="db-label">Lớp & môn học</span><div>${classInfo}</div></div>`;
  const hasPasswordProvider = !!(typeof firebaseAuth !== 'undefined' && firebaseAuth?.currentUser?.providerData?.some((p) => p.providerId === 'password'));
  dbOpenDialog({
    title: setupRequired ? 'Thông tin giáo viên' : 'Tài khoản',
    okLabel: 'Lưu',
    compact: true,
    teacherSetup: setupRequired,
    body: `<div class="facts"><div><span>Email</span><b>${h(DB.me.email)}</b></div><div><span>Vai trò</span><b>${dbIsTeacher() ? 'Giáo viên' : 'Học sinh'}</b></div></div>
      ${teacherFields}
      ${dbField('Họ và tên', 'db-acc-name', `<input id="db-acc-name" name="full_name" maxlength="120" value="${h(DB.me.full_name)}" autocomplete="name">`)}
      ${hasPasswordProvider
        ? `<div class="field"><span class="db-label">Mật khẩu</span>${dbBtn('Đổi mật khẩu', 'changePassword', {}, 'light')}</div>`
        : `<div class="field"><span class="db-label">Đăng nhập</span><p class="muted">Tài khoản Google</p></div>`}`,
    onOk: async (v) => {
      if (!v.full_name) throw new Error('Nhập họ và tên.');
      const className = String(v.class_name || '').trim(), subject = String(v.subject || '').trim();
      if (dbIsTeacher()) {
        if (!className) throw new Error('Nhập tên Lớp.');
        if (className.length > 100) throw new Error('Tên Lớp tối đa 100 ký tự.');
        if (!subject) throw new Error('Nhập tên Môn học.');
        if (subject.length > 120) throw new Error('Tên Môn học tối đa 120 ký tự.');
      }
      if (v.full_name !== DB.me.full_name) DB.me = await dbCall(EducMindDB.renameMe(v.full_name));
      let joinCode = '';
      if (dbIsTeacher()) {
        if (accountClass) {
          await dbCall(EducMindDB.updateClassWithSubject(accountClass.id, {
            name: className, grade: accountClass.grade, school_year: accountClass.school_year, subject,
          }));
        } else {
          const made = await dbCall(EducMindDB.createClassWithSubject(className, null, null, subject));
          const row = Array.isArray(made) ? made[0] : made;
          if (!row || !row.class_id) throw new Error('Không tạo được lớp cho tài khoản giáo viên.');
          accountClass = { id: row.class_id, name: className, grade: null, school_year: null };
          DB.classId = row.class_id;
          joinCode = row.join_code || '';
          try { localStorage.setItem('educmind.db.class', DB.classId); } catch (_) {}
        }
        await dbLoadClasses();
        await dbLoadCourse();
      }
      toast(joinCode ? `Đã lưu thông tin và tạo lớp ${className}. Mã lớp: ${joinCode}.` : 'Đã lưu thông tin tài khoản, lớp và môn học.');
    },
  });
};

DB_ACT.changePassword = () => {
  dbOpenDialog({
    title: 'Đổi mật khẩu',
    okLabel: 'Lưu mật khẩu mới',
    body: `<p class="muted">Nhập mật khẩu hiện tại để xác nhận đây là tài khoản của bạn.</p>
      ${dbField('Mật khẩu hiện tại', 'db-cpw-old', `<input id="db-cpw-old" name="old_pw" type="password" autocomplete="current-password" required>`)}
      ${dbField('Mật khẩu mới', 'db-cpw-new', `<input id="db-cpw-new" name="new_pw" type="password" autocomplete="new-password" required>`, `Tối thiểu ${PW_MIN} ký tự.`)}
      ${dbField('Nhập lại mật khẩu mới', 'db-cpw-new2', `<input id="db-cpw-new2" name="new_pw2" type="password" autocomplete="new-password" required>`)}`,
    onOk: async (v) => {
      const oldPw = String(v.old_pw || '');
      const newPw = String(v.new_pw || '');
      const newPw2 = String(v.new_pw2 || '');
      if (!oldPw) throw new Error('Nhập mật khẩu hiện tại.');
      if (newPw.length < PW_MIN) throw new Error('Mật khẩu mới cần ít nhất ' + PW_MIN + ' ký tự.');
      if (newPw !== newPw2) throw new Error('Hai lần nhập mật khẩu mới không khớp.');
      if (newPw === oldPw) throw new Error('Mật khẩu mới phải khác mật khẩu hiện tại.');
      if (!FirebaseRuntime || !firebaseAuth || !firebaseAuth.currentUser) throw new Error('Phiên đăng nhập không hợp lệ.');
      const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = FirebaseRuntime.authApi;
      const cred = EmailAuthProvider.credential(DB.me.email, oldPw);
      await reauthenticateWithCredential(firebaseAuth.currentUser, cred);
      await updatePassword(firebaseAuth.currentUser, newPw);
      toast('Đã đổi mật khẩu thành công.');
    },
  });
};
