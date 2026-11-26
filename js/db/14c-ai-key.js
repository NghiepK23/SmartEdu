/* EducMind · js/db/14c-ai-key.js
   Quản lý API key Gemini của từng người dùng.

   Luồng: người dùng dán key vào Tài khoản → Quản lý API key Gemini → trình duyệt gửi key MỘT LẦN
   cho máy chủ Express (/api/ai/key); máy chủ mã hoá AES-256-GCM rồi ghi vào Firestore bằng chính
   ID token của người dùng. Trình duyệt không bao giờ nhận lại key thô — chỉ 4 ký tự cuối để người
   dùng nhận ra mình đã lưu key nào. Khi gọi Trợ lý AI, máy chủ đọc bản mã và giải mã tại chỗ.

   Học sinh không phải tự đăng ký key: nếu giáo viên bật Trợ lý AI cho lớp và đã lưu key, học sinh
   dùng chung key của giáo viên. Trong lúc đang làm bài tập/bài kiểm tra, máy chủ khoá hẳn. */

const DB_AI_KEY = { status: null, loading: false, error: '', saving: false, testing: false, testResult: '', classId: '' };

async function dbAiKeyLoad(force) {
  if (!EducMindDB || typeof EducMindDB.aiKeyStatus !== 'function') return null;
  /* Trạng thái key gắn với lớp đang chọn (học sinh dùng key của giáo viên chủ lớp),
     nên đổi lớp là nạp lại dù không yêu cầu force. */
  if (DB_AI_KEY.status && DB_AI_KEY.classId !== (DB.classId || '')) force = true;
  if (DB_AI_KEY.status && !force) return DB_AI_KEY.status;
  if (DB_AI_KEY.loading) return DB_AI_KEY.status;
  DB_AI_KEY.loading = true;
  DB_AI_KEY.error = '';
  DB_AI_KEY.classId = DB.classId || '';
  if (force && typeof DB_UI !== 'undefined') DB_UI.aiKeyDraft = '';
  try {
    const { data, error } = await EducMindDB.aiKeyStatus(DB.classId || '');
    if (error) {
      /* Lỗi 401 ở đây là chuyện của phiên đăng nhập, không phải của API key:
         báo đúng nguyên nhân để người dùng không tưởng là đã lưu key thất bại. */
      DB_AI_KEY.error = error.status === 401
        ? 'Phiên đăng nhập chưa sẵn sàng nên chưa kiểm tra được API key. Hãy tải lại trang (F5) rồi thử lại.'
        : (error.message || 'Không kiểm tra được API key.');
      DB_AI_KEY.status = null;
    } else {
      DB_AI_KEY.status = data || null;
    }
  } catch (err) {
    DB_AI_KEY.error = (err && err.message) || 'Không kiểm tra được API key.';
  } finally {
    DB_AI_KEY.loading = false;
  }
  return DB_AI_KEY.status;
}

/* Người dùng hiện tại đã có key dùng được chưa (giáo viên: key của mình; học sinh: key của giáo viên
   chủ lớp hoặc key riêng nếu đã lưu). */
function dbAiKeyReady() {
  const st = DB_AI_KEY.status;
  if (!st) return true; // chưa kiểm tra được thì để máy chủ quyết định, không chặn nhầm
  if (st.hasKey) return true;
  if (!dbIsTeacher() && st.classOwner && st.classOwner.hasKey) return true;
  return !!st.sharedKeyAvailable;
}

/* Thẻ "Quản lý API key Gemini" trong hộp thoại Tài khoản. */
function dbAiKeyPanelHtml() {
  const st = DB_AI_KEY.status;
  const loading = DB_AI_KEY.loading && !st;
  const teacher = dbIsTeacher();
  const hint = st && st.hasKey ? (st.hint ? '••••' + h(st.hint) : 'đã lưu') : '';
  const updated = st && st.updatedAt ? dbDateTime(st.updatedAt) : '';
  const ownerNote = !teacher && st
    ? (st.classOwner && st.classOwner.hasKey
      ? `<p class="db-ai-key-note is-ok">${ic('check', 15)} Giáo viên lớp này đã lưu API key, em dùng chung được Trợ lý AI${st.hasKey ? ' (em cũng đã lưu key riêng)' : ''}.</p>`
      : (st.hasKey
        ? `<p class="db-ai-key-note is-ok">${ic('check', 15)} Em đã lưu API key riêng.</p>`
        : `<p class="db-ai-key-note is-warn">${ic('info', 15)} Giáo viên lớp này chưa lưu API key. Em có thể tự lưu key riêng hoặc nhờ giáo viên thiết lập.</p>`))
    : '';
  const status = st && st.hasKey
    ? `<p class="db-ai-key-note is-ok">${ic('check', 15)} Đã lưu key <b class="db-code">${hint}</b>${updated ? ` · cập nhật ${h(updated)}` : ''}</p>`
    : (loading
      ? `<p class="muted db-ai-key-note">Đang kiểm tra trạng thái API key…</p>`
      : `<p class="db-ai-key-note is-warn">${ic('alert', 15)} Chưa lưu API key. Trợ lý AI sẽ không hoạt động cho tới khi bạn lưu key.</p>`);
  return `<div class="db-ai-key-card" id="db-ai-key-card">
    <div class="db-ai-key-head">
      <span class="db-ai-key-ic" aria-hidden="true">${ic('spark', 18)}</span>
      <div>
        <b>Quản lý API key Gemini</b>
        <small>Tự đăng ký key ở Google AI Studio rồi dán vào đây. Key được mã hoá ở máy chủ, không hiển thị lại.</small>
      </div>
    </div>
    ${DB_AI_KEY.error ? `<p class="db-ai-key-note is-bad">${ic('alert', 15)} ${h(DB_AI_KEY.error)}</p>` : ''}
    ${status}
    ${ownerNote}
    <div class="db-ai-key-form">
      <label for="db-ai-key-input" class="sr">API key Gemini</label>
      <input id="db-ai-key-input" type="password" data-input="aiKeyDraft" autocomplete="off" spellcheck="false"
        placeholder="${st && st.hasKey ? 'Dán key mới để thay thế…' : 'Dán API key Gemini (AIza… hoặc AQ.…)'}" value="">
      <div class="db-ai-key-actions">
        <button type="button" class="btn mini" data-act="aiKeySave" ${DB_AI_KEY.saving ? 'disabled' : ''}>${ic('save', 15)} ${st && st.hasKey ? 'Thay key' : 'Lưu key'}</button>
        <button type="button" class="btn light mini" data-act="aiKeyTest" ${!DB_AI_KEY.testing ? '' : 'disabled'}>${ic('play', 15)} ${DB_AI_KEY.testing ? 'Đang kiểm tra…' : 'Kiểm tra key'}</button>
        ${st && st.hasKey ? `<button type="button" class="btn light mini danger-soft" data-act="aiKeyDelete">${ic('trash', 15)} Xoá key</button>` : ''}
      </div>
      ${DB_AI_KEY.testResult ? `<p class="db-ai-key-note ${DB_AI_KEY.testResult.startsWith('ok:') ? 'is-ok' : 'is-bad'}">${ic(DB_AI_KEY.testResult.startsWith('ok:') ? 'check' : 'alert', 15)} ${h(DB_AI_KEY.testResult.replace(/^ok:|^bad:/, ''))}</p>` : ''}
    </div>
    <p class="db-ai-key-help">
      <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Mở Google AI Studio để tạo key</a>
      <span aria-hidden="true">·</span>
      <span>Key chỉ dùng cho tài khoản của bạn. Google áp hạn mức theo dự án gắn với key.</span>
    </p>
  </div>`;
}

/* Hộp thoại chỉ thay nội dung khi "dấu" nội dung đổi, nên thẻ key cần được đánh dấu
   bằng hai mốc chú thích để thay đúng đoạn sau mỗi thao tác lưu / kiểm tra / xoá. */
const DB_AI_KEY_MARK_A = '<!--AI-KEY-PANEL-->';
const DB_AI_KEY_MARK_B = '<!--/AI-KEY-PANEL-->';
function dbAiKeyPanelMarked() {
  return DB_AI_KEY_MARK_A + dbAiKeyPanelHtml() + DB_AI_KEY_MARK_B;
}
/* Vẽ lại riêng thẻ API key khi hộp thoại Tài khoản đang mở; trả về false nếu không có. */
function dbAiKeyPaint() {
  const d = DB.dialog;
  if (!d || typeof d.body !== 'string') return false;
  const from = d.body.indexOf(DB_AI_KEY_MARK_A);
  const to = d.body.indexOf(DB_AI_KEY_MARK_B);
  if (from < 0 || to < from) return false;
  d.body = d.body.slice(0, from) + dbAiKeyPanelMarked() + d.body.slice(to + DB_AI_KEY_MARK_B.length);
  render();
  /* Hộp thoại được dựng lại: đặt lại key người dùng đang gõ dở (không ghi vào HTML). */
  try {
    const input = document.getElementById('db-ai-key-input');
    if (input && !input.value && DB_UI.aiKeyDraft) input.value = DB_UI.aiKeyDraft;
  } catch (_) { /* bỏ qua */ }
  return true;
}

/* Ô nhập key: giữ giá trị đang gõ khi màn hình được vẽ lại. */
if (typeof DB_UI !== 'undefined') DB_UI.aiKeyDraft = DB_UI.aiKeyDraft || '';
DB_ACT.aiKeyDraft = (el) => { DB_UI.aiKeyDraft = String(el.value || ''); };

DB_ACT.aiKeyRefresh = async () => {
  await dbAiKeyLoad(true);
  dbAiKeyPaint();
};

DB_ACT.aiKeySave = async () => {
  if (DB_AI_KEY.saving) return;
  const input = document.getElementById('db-ai-key-input');
  const key = String((input && input.value) || DB_UI.aiKeyDraft || '').trim();
  if (key.length < 20) throw new Error('API key quá ngắn. Hãy dán đầy đủ key lấy từ Google AI Studio.');
  if (/\s/.test(key)) throw new Error('API key không được chứa dấu cách hoặc xuống dòng.');
  DB_AI_KEY.saving = true;
  DB_AI_KEY.testResult = '';
  dbAiKeyPaint();
  try {
    const { data, error } = await EducMindDB.aiKeySave(key);
    if (error) {
      if (error.status === 401) {
        throw new Error('Máy chủ chưa nhận được thông tin đăng nhập. Hãy tải lại trang (F5) rồi lưu lại key.');
      }
      throw new Error(error.message || 'Không lưu được API key.');
    }
    DB_UI.aiKeyDraft = '';
    await dbAiKeyLoad(true);
    toast(data && data.hint ? `Đã lưu API key (••••${data.hint}).` : 'Đã lưu API key.');
  } finally {
    DB_AI_KEY.saving = false;
    dbAiKeyPaint();
  }
};

DB_ACT.aiKeyDelete = () => {
  dbConfirm('Xoá API key Gemini', 'Sau khi xoá, Trợ lý AI sẽ không hoạt động cho tới khi bạn lưu key mới. Key đã lưu bị xoá vĩnh viễn khỏi hệ thống.', 'Xoá key', async () => {
    const { error } = await EducMindDB.aiKeyDelete();
    if (error) throw new Error(error.message || 'Không xoá được API key.');
    DB_AI_KEY.testResult = '';
    await dbAiKeyLoad(true);
    toast('Đã xoá API key Gemini.');
  }, true);
};

DB_ACT.aiKeyTest = async () => {
  if (DB_AI_KEY.testing) return;
  const input = document.getElementById('db-ai-key-input');
  const draft = String((input && input.value) || DB_UI.aiKeyDraft || '').trim();
  if (draft && draft.length < 20) throw new Error('API key quá ngắn. Hãy dán đầy đủ key lấy từ Google AI Studio.');
  if (draft && /\s/.test(draft)) throw new Error('API key không được chứa dấu cách hoặc xuống dòng.');
  DB_AI_KEY.testing = true;
  DB_AI_KEY.testResult = '';
  dbAiKeyPaint();
  try {
    /* Có key đang gõ thì kiểm tra chính key đó (chưa lưu), chưa gõ thì kiểm tra key đã lưu. */
    const { data, error } = draft ? await EducMindDB.aiKeyTest(draft) : await EducMindDB.aiKeyTest();
    DB_AI_KEY.testResult = error
      ? 'bad:' + (error.message || 'Key chưa dùng được.')
      : 'ok:Key hoạt động bình thường' + (data && data.model ? ` (${data.model})` : '') + '.';
  } catch (err) {
    DB_AI_KEY.testResult = 'bad:' + ((err && err.message) || 'Không kiểm tra được key.');
  } finally {
    DB_AI_KEY.testing = false;
    dbAiKeyPaint();
  }
};

/* Nút mở nhanh màn hình key từ thông báo lỗi của Trợ lý AI. */
DB_ACT.openAiKey = async () => {
  await dbAiKeyLoad(true);
  if (typeof DB_ACT.openAccount === 'function') await DB_ACT.openAccount();
};

/* Công tắc Trợ lý AI của một bài tập / bài kiểm tra (giáo viên có thể tắt từng bài).
   Mặc định bật khi bài chưa có giá trị (bài cũ trước khi có công tắc). */
function dbAiEnabledForWork(kind, item) {
  if (!item) return true;
  return item.student_ai_enabled !== false;
}
/* Bài tập/bài kiểm tra mà học sinh đang làm dở (để báo đúng tên bài khi bị khoá). */
function dbAiActiveWork() {
  const d = DB.data;
  if (!d || !Array.isArray(d.assignments)) return null;
  let busyId = '';
  if (typeof DB_ASSIGNMENT_FLOW !== 'undefined' && DB_ASSIGNMENT_FLOW && DB_ASSIGNMENT_FLOW.started) busyId = DB_ASSIGNMENT_FLOW.assignmentId;
  if (!busyId) { try { busyId = localStorage.getItem(DB_ASSIGNMENT_BUSY_KEY) || ''; } catch (_) { busyId = ''; } }
  return busyId ? (d.assignments.find((a) => a.id === busyId) || null) : null;
}

/* Trạng thái tính năng AI cho học sinh, dùng cho khung chat và trang chat. */
function dbAiStudentState() {
  if (dbIsTeacher()) return { allowed: true, reason: '' };
  if (typeof dbChatExamLocked === 'function' && dbChatExamLocked()) {
    const name = typeof DBX !== 'undefined' && DBX && DBX.assessment && DBX.assessment.title ? String(DBX.assessment.title) : '';
    return { allowed: false, reason: 'Trợ lý AI tạm khoá trong lúc em đang làm bài kiểm tra' + (name ? ': ' + name : '') + '. Hãy nộp bài trước.' };
  }
  if (typeof dbAssignmentBusy === 'function' && dbAssignmentBusy()) {
    const work = typeof dbAiActiveWork === 'function' ? dbAiActiveWork() : null;
    return { allowed: false, reason: 'Trợ lý AI tạm khoá trong lúc em đang làm bài tập' + (work && work.title ? ': ' + work.title : '') + '. Hãy nộp bài trước.' };
  }
  /* Đang xem một bài tập / bài kiểm tra mà giáo viên tắt AI cho bài đó. */
  const page = DB.page || '';
  const argId = DB.arg && DB.arg.id;
  if (page === 'assignments' && argId && DB.data && Array.isArray(DB.data.assignments)) {
    const work = DB.data.assignments.find((a) => a.id === argId);
    if (!dbAiEnabledForWork('assignment', work)) {
      return { allowed: false, reason: 'Giáo viên không cho dùng Trợ lý AI cho bài tập này.' };
    }
  }
  if (page === 'assessments' && argId && DB.data && Array.isArray(DB.data.assessments)) {
    const work = DB.data.assessments.find((e) => e.id === argId);
    if (!dbAiEnabledForWork('assessment', work)) {
      return { allowed: false, reason: 'Giáo viên không cho dùng Trợ lý AI cho bài kiểm tra này.' };
    }
  }
  if (!dbAiKeyReady()) {
    return { allowed: false, reason: 'Chưa có API key Gemini cho lớp này. Hãy nhờ giáo viên lưu key hoặc tự lưu key trong Tài khoản.' };
  }
  return { allowed: true, reason: '' };
}

/* Công tắc "cho phép học sinh dùng Trợ lý AI" trong form bài tập / bài kiểm tra.
   Mặc định BẬT để không đổi hành vi cũ; giáo viên tắt khi muốn học sinh tự làm.
   value: true/false hiện tại. kind: 'assignment' | 'assessment'. */
function dbAiSwitchHtml(kind, on, label, hint) {
  const id = 'db-ai-switch-' + kind;
  return `<div class="db-ai-switch" data-ai-switch="${h(kind)}">
    <label class="db-check db-ai-switch-row" for="${id}">
      <input type="checkbox" id="${id}" name="student_ai_enabled" ${on ? 'checked' : ''}>
      <span class="db-ai-switch-copy"><b>${h(label)}</b>${hint ? `<small>${h(hint)}</small>` : ''}</span>
    </label>
  </div>`;
}
