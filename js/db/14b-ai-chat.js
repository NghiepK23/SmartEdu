/* EducMind · js/db/14b-ai-chat.js
   Trợ lý Gemini hội thoại đa lượt:
     - Cửa sổ nổi (Floating Drawer) truy cập nhanh từ mọi màn hình mà không mất vị trí cuộn/nhập liệu.
     - Không gian làm việc chuyên biệt (DB_PAGES.chat) có lịch sử hội thoại, chọn mô hình Gemini, ngữ cảnh lớp/bài học,
       thẻ luyện tập tương tác chấm ngay và lưu câu hỏi vào hàng đợi bản nháp AI của giáo viên. */

const DB_CHAT_MODELS = {
  auto: { id: 'auto', tierLabel: 'Tự động', modelLabel: 'Tự động điều phối', desc: 'Tự chọn mô hình Gemini phù hợp nhất với yêu cầu.' },
  fast: { id: 'gemini-3.1-flash-lite', tierLabel: 'Nhanh', modelLabel: 'Gemini 3.1 Flash-Lite', desc: 'Phản hồi tức thì cho định nghĩa, gợi ý ngắn và tóm tắt.' },
  balanced: { id: 'gemini-4-hydrogen', tierLabel: 'Cân bằng', modelLabel: 'Gemini 4 Hydrogen', desc: 'Mặc định ổn định cho hỏi đáp và giảng dạy hằng ngày.' },
  interactive: { id: 'gemini-4-neon', tierLabel: 'Tương tác', modelLabel: 'Gemini 4 Neon', desc: 'Tối ưu soạn giáo án, rubric và câu hỏi luyện tập tương tác.' },
  deep: { id: 'gemini-4-carbon', tierLabel: 'Chuyên sâu', modelLabel: 'Gemini 4 Carbon', desc: 'Suy luận sâu cho phân tích lỗ hổng lớp và bài toán phức tạp.' },
};

const DB_CHAT_MODES_T = [
  { id: 'tutor', label: 'Trợ giảng' },
  { id: 'lesson_plan', label: 'Soạn giáo án' },
  { id: 'gap_analysis', label: 'Phân tích lỗ hổng' },
  { id: 'quiz', label: 'Soạn câu hỏi' },
];

const DB_CHAT_MODES_S = [
  { id: 'tutor', label: 'Gia sư từng bước' },
  { id: 'quiz', label: 'Luyện tập nhanh' },
];

const DB_CHAT_SIDEBAR_STORAGE_KEY = 'em_chat_sidebar_collapsed';

function dbChatReadSidebarCollapsed() {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(DB_CHAT_SIDEBAR_STORAGE_KEY) === '1';
  } catch (_) {
    return false;
  }
}

const DB_CHAT = {
  drawerOpen: false,
  threads: [],
  threadsLoaded: false,
  threadsLoading: false,
  activeThreadId: '',
  messagesByThread: {},
  messagesLoading: false,
  sending: false,
  mode: '',
  tier: 'auto',
  includeContext: true,
  draftText: '',
  focusLessonId: '',
  focusLessonTitle: '',
  focusObjectiveId: '',
  focusObjectiveLabel: '',
  error: null,
  quizAnswers: {},
  quizSaved: {},
  mobileThreadsOpen: false,
  sidebarCollapsed: dbChatReadSidebarCollapsed(),
};

function dbChatReset() {
  Object.assign(DB_CHAT, {
    drawerOpen: false,
    threads: [],
    threadsLoaded: false,
    threadsLoading: false,
    activeThreadId: '',
    messagesByThread: {},
    messagesLoading: false,
    sending: false,
    mode: '',
    tier: 'auto',
    includeContext: true,
    draftText: '',
    focusLessonId: '',
    focusLessonTitle: '',
    focusObjectiveId: '',
    focusObjectiveLabel: '',
    error: null,
    quizAnswers: {},
    quizSaved: {},
    mobileThreadsOpen: false,
    sidebarCollapsed: false,
  });
}

function dbChatDefaultMode() {
  return 'tutor';
}

function dbChatActiveMode() {
  const T = dbIsTeacher();
  const valid = (T ? DB_CHAT_MODES_T : DB_CHAT_MODES_S).map((m) => m.id);
  return valid.includes(DB_CHAT.mode) ? DB_CHAT.mode : dbChatDefaultMode();
}

function dbChatExamLocked() {
  return !dbIsTeacher() && DB.page === 'exam' && typeof DBX !== 'undefined' && DBX && DBX.attempt && DBX.attempt.status === 'IN_PROGRESS';
}

function dbChatRecommendModel(tier, mode, text, wantQuiz) {
  if (tier && tier !== 'auto' && DB_CHAT_MODELS[tier]) {
    const picked = DB_CHAT_MODELS[tier];
    return { model: picked.id, tier, label: picked.modelLabel, tierLabel: picked.tierLabel };
  }
  const msg = String(text || '').toLowerCase();
  if (wantQuiz || mode === 'quiz' || mode === 'lesson_plan' || /\b(tạo câu hỏi|luyện tập|trắc nghiệm|giáo án|rubric|tiêu chí chấm)\b/i.test(msg)) {
    const m = DB_CHAT_MODELS.interactive;
    return { model: m.id, tier: 'interactive', label: m.modelLabel, tierLabel: m.tierLabel };
  }
  if (mode === 'gap_analysis' || /\b(phân tích sâu|nguyên nhân gốc|lỗ hổng|chứng minh|thuật toán phức tạp|tối ưu hóa|so sánh toàn diện)\b/i.test(msg)) {
    const m = DB_CHAT_MODELS.deep;
    return { model: m.id, tier: 'deep', label: m.modelLabel, tierLabel: m.tierLabel };
  }
  if (msg.length > 0 && msg.length <= 90 && /\b(tóm tắt|định nghĩa|gợi ý nhanh|là gì|ví dụ ngắn|nhắc nhanh)\b/i.test(msg)) {
    const m = DB_CHAT_MODELS.fast;
    return { model: m.id, tier: 'fast', label: m.modelLabel, tierLabel: m.tierLabel };
  }
  const m = DB_CHAT_MODELS.balanced;
  return { model: m.id, tier: 'balanced', label: m.modelLabel, tierLabel: m.tierLabel };
}

function dbChatModelLabel(modelId) {
  const found = Object.values(DB_CHAT_MODELS).find((m) => m.id === modelId);
  return found ? found.modelLabel : String(modelId || 'Gemini');
}

function dbChatFormatInline(escapedLine) {
  return escapedLine
    .replace(/`([^`\n]+)`/g, '<code class="db-chat-inline-code">$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
}

/* Chuyển văn bản Markdown sang HTML an toàn: thoát toàn bộ HTML gốc trước khi định dạng. */
function dbChatFormatMarkdown(raw) {
  const source = String(raw == null ? '' : raw).replace(/\r\n?/g, '\n');
  if (!source.trim()) return '';
  const codeBlocks = [];
  const withTokens = source.replace(/```([A-Za-z0-9_+-]*)\n?([\s\S]*?)```/g, (_m, lang, code) => {
    const token = `\u0000CODE_${codeBlocks.length}\u0000`;
    const langTag = lang ? h(lang) : 'code';
    codeBlocks.push(`<div class="db-chat-code" data-lang="${langTag}"><div class="db-chat-code-head"><span class="db-chat-code-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="db-chat-code-lang">${langTag}</span></div><pre><code>${h(code.replace(/\n$/, ''))}</code></pre></div>`);
    return token;
  });

  const lines = withTokens.split('\n');
  const out = [];
  let listType = '';
  const closeList = () => {
    if (listType) { out.push(listType === 'ol' ? '</ol>' : '</ul>'); listType = ''; }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const tokenMatch = line.trim().match(/^\u0000CODE_(\d+)\u0000$/);
    if (tokenMatch) {
      closeList();
      out.push(codeBlocks[Number(tokenMatch[1])] || '');
      continue;
    }
    if (!line.trim()) {
      closeList();
      continue;
    }
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      closeList();
      out.push(`<h4 class="db-chat-h">${dbChatFormatInline(h(h3[1]))}</h4>`);
      continue;
    }
    const h2 = line.match(/^#{1,2}\s+(.+)$/);
    if (h2) {
      closeList();
      out.push(`<h3 class="db-chat-h">${dbChatFormatInline(h(h2[1]))}</h3>`);
      continue;
    }
    const ul = line.match(/^\s*[-*•]\s+(.+)$/);
    if (ul) {
      if (listType !== 'ul') { closeList(); out.push('<ul class="db-chat-list">'); listType = 'ul'; }
      out.push(`<li>${dbChatFormatInline(h(ul[1]))}</li>`);
      continue;
    }
    const ol = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ol) {
      if (listType !== 'ol') { closeList(); out.push('<ol class="db-chat-list">'); listType = 'ol'; }
      out.push(`<li>${dbChatFormatInline(h(ol[1]))}</li>`);
      continue;
    }
    closeList();
    out.push(`<p class="db-chat-p">${dbChatFormatInline(h(line))}</p>`);
  }
  closeList();
  return out.join('');
}

function dbChatStarterPrompts() {
  const cls = dbClass();
  const lessonTitle = DB_CHAT.focusLessonTitle;
  const target = lessonTitle ? `bài “${lessonTitle}”` : cls ? `lớp ${cls.name}` : 'chương trình hiện tại';
  if (dbIsTeacher()) {
    return [
      { label: 'Soạn giáo án 45 phút', mode: 'lesson_plan', text: `Hãy thiết kế giáo án 45 phút theo hướng phát triển năng lực cho ${target}, gồm khởi động, hình thành kiến thức, luyện tập và vận dụng.` },
      { label: 'Phân tích lỗ hổng của lớp', mode: 'gap_analysis', text: `Hãy phân tích các mục tiêu nắm vững thấp và lỗ hổng kiến thức đang mở của lớp, chỉ ra nguyên nhân hiểu nhầm phổ biến và gợi ý hoạt động phụ đạo.` },
      { label: 'Tạo 3 câu luyện tập nháp', mode: 'quiz', wantQuiz: true, text: `Soạn giúp tôi 3 câu hỏi trắc nghiệm phân hóa từ dễ đến vận dụng cho ${target} để tôi xem trước và lưu vào ngân hàng câu hỏi.` },
      { label: 'Xây dựng rubric chấm điểm', mode: 'lesson_plan', text: `Đề xuất bảng tiêu chí chấm (rubric 4 mức độ) cho bài tập thực hành của ${target}.` },
    ];
  }
  return [
    { label: 'Giải thích dễ hiểu', mode: 'tutor', text: `Hãy giải thích khái niệm trọng tâm của ${target} thật dễ hiểu kèm 1 ví dụ thực tế gần gũi.` },
    { label: 'Ôn lỗ hổng kiến thức', mode: 'tutor', text: `Dựa trên các mục tiêu em còn yếu hoặc lỗ hổng đang mở, hãy hướng dẫn em ôn lại từng bước.` },
    { label: 'Tạo 3 câu luyện tập', mode: 'quiz', wantQuiz: true, text: `Tạo cho em 3 câu hỏi trắc nghiệm luyện tập nhanh về ${target} để em tự kiểm tra kiến thức.` },
    { label: 'Gợi ý cách làm bài', mode: 'tutor', text: `Em hay bị nhầm khi làm bài về ${target}. Hãy chỉ cho em mẹo nhận biết và tránh lỗi sai thường gặp.` },
  ];
}

function dbChatContextChipsHtml() {
  const cls = dbClass();
  const parts = [];
  if (DB_CHAT.includeContext) {
    if (cls) parts.push(`Lớp ${h(cls.name)}`);
    if (DB.course && DB.course.title) parts.push(h(DB.course.title));
    if (DB_CHAT.focusLessonTitle) parts.push(`Bài: ${h(DB_CHAT.focusLessonTitle)}`);
    else parts.push(dbIsTeacher() ? 'Tổng hợp tiến độ lớp' : 'Tiến độ & lỗ hổng của em');
  } else {
    parts.push('Đã tắt chia sẻ ngữ cảnh lớp');
  }
  return `<div class="db-chat-context-bar">
    <div class="db-chat-context-info">
      <div class="db-chat-context-main">
        <span class="db-chat-context-dot${DB_CHAT.includeContext ? ' is-on' : ''}" aria-hidden="true"></span>
        <span class="db-chat-context-text">${parts.join(' · ')}</span>
      </div>
      ${DB_CHAT.focusLessonId ? `<button type="button" class="db-chat-link-btn" data-act="chatClearLesson" title="Bỏ ghim bài học">Bỏ ghim bài</button>` : ''}
    </div>
    <label class="db-chat-ctx-toggle">
      <input type="checkbox" data-change="chatToggleContext" ${DB_CHAT.includeContext ? 'checked' : ''}>
      <span>Đọc ngữ cảnh</span>
    </label>
  </div>`;
}

function dbChatQuizCardHtml(msg) {
  const quiz = msg && msg.artifacts && Array.isArray(msg.artifacts.quiz) ? msg.artifacts.quiz : [];
  if (!quiz.length) return '';
  const T = dbIsTeacher();
  const saved = !!DB_CHAT.quizSaved[msg.id];
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];

  const itemsHtml = quiz.map((q, qi) => {
    const opts = Array.isArray(q.options) ? q.options : (q.kind === 'TRUE_FALSE' ? ['Đúng', 'Sai'] : []);
    const key = `${msg.id}:${qi}`;
    const picked = key in DB_CHAT.quizAnswers ? Number(DB_CHAT.quizAnswers[key]) : -1;
    const hasPicked = picked >= 0;
    const correctIdx = Number(q.correct_index);
    const isCorrect = hasPicked && picked === correctIdx;

    return `<div class="db-chat-quiz-item${hasPicked ? (isCorrect ? ' is-correct' : ' is-wrong') : ''}">
      <div class="db-chat-quiz-qhead">
        <span class="db-chat-quiz-num">Câu ${qi + 1}</span>
        <span class="db-chat-quiz-meta">${h(q.kind === 'TRUE_FALSE' ? 'Đúng / Sai' : 'Trắc nghiệm')}${q.difficulty ? ' · ' + h(q.difficulty === 'EASY' ? 'Dễ' : q.difficulty === 'HARD' ? 'Khó' : 'Trung bình') : ''}</span>
      </div>
      <div class="db-chat-quiz-stem">${h(q.content)}</div>
      <div class="db-chat-quiz-opts" role="group" aria-label="Lựa chọn câu ${qi + 1}">
        ${opts.map((opt, oi) => {
          const chosen = picked === oi;
          const rightChoice = hasPicked && oi === correctIdx;
          const wrongChoice = hasPicked && chosen && oi !== correctIdx;
          const cls = rightChoice ? ' is-right' : wrongChoice ? ' is-wrong' : chosen ? ' is-picked' : '';
          return `<button type="button" class="db-chat-quiz-opt${cls}" data-act="chatQuizPick" data-msg="${h(msg.id)}" data-qi="${qi}" data-oi="${oi}" aria-pressed="${chosen ? 'true' : 'false'}">
            <span class="db-chat-quiz-letter">${letters[oi] || String(oi + 1)}</span>
            <span class="db-chat-quiz-opttxt">${h(opt)}</span>
          </button>`;
        }).join('')}
      </div>
      ${hasPicked ? `<div class="db-chat-quiz-feedback ${isCorrect ? 'is-good' : 'is-need'}">
        <b>${isCorrect ? 'Chính xác!' : `Chưa đúng (đáp án đúng: ${letters[correctIdx] || correctIdx + 1}).`}</b>
        ${q.explanation ? `<span>${h(q.explanation)}</span>` : ''}
        ${!isCorrect ? `<button type="button" class="db-chat-link-btn" data-act="chatQuizExplainWrong" data-msg="${h(msg.id)}" data-qi="${qi}">Hỏi lại câu này</button>` : ''}
      </div>` : ''}
    </div>`;
  }).join('');

  return `<div class="db-chat-quiz">
    <div class="db-chat-quiz-head">
      <div><b>Luyện tập tương tác</b> · <span>${quiz.length} câu hỏi</span></div>
      ${T ? (saved
        ? `<span class="db-chat-saved-tag">${ic('check', 14)} Đã lưu bản nháp</span>`
        : `<button type="button" class="btn light mini" data-act="chatSaveQuizDrafts" data-msg="${h(msg.id)}">${ic('save', 14)} Lưu vào bản nháp AI</button>`) : ''}
    </div>
    <div class="db-chat-quiz-list">${itemsHtml}</div>
  </div>`;
}

function dbChatMessagesHtml() {
  const tid = DB_CHAT.activeThreadId;
  const msgs = tid ? (DB_CHAT.messagesByThread[tid] || []) : [];

  if (DB_CHAT.messagesLoading && !msgs.length) {
    return `<div class="db-chat-empty" aria-busy="true"><p class="muted">Đang tải cuộc trò chuyện…</p></div>`;
  }

  if (!msgs.length && !DB_CHAT.sending) {
    const starters = dbChatStarterPrompts();
    return `<div class="db-chat-welcome">
      <div class="db-chat-welcome-mark" aria-hidden="true">${ic('spark', 22)}</div>
      <h3>${dbIsTeacher() ? 'Trợ lý Sư phạm Gemini' : 'Gia sư AI EducMind'}</h3>
      <p>${dbIsTeacher()
        ? 'Hỗ trợ soạn giáo án, phân tích lỗ hổng kiến thức của lớp và tạo nhanh câu hỏi nháp bám sát mục tiêu.'
        : 'Hỏi bài theo từng bước, ôn tập các mục tiêu còn yếu và làm câu hỏi luyện tập trực tiếp tại đây.'}</p>
      <div class="db-chat-starters">
        ${starters.map((s, idx) => `<button type="button" class="db-chat-starter" data-act="chatUseStarter" data-idx="${idx}">${h(s.label)}</button>`).join('')}
      </div>
    </div>`;
  }

  const bubbles = msgs.map((m) => {
    const isUser = m.sender === 'user';
    const timeStr = m.created_at ? dbDateTime(m.created_at).split(' ')[1] || '' : '';
    const meta = isUser
      ? (timeStr ? `<span>Bạn · ${h(timeStr)}</span>` : '<span>Bạn</span>')
      : `<span>${h(dbChatModelLabel(m.model))}${timeStr ? ' · ' + h(timeStr) : ''}</span>`;
    return `<article class="db-chat-msg ${isUser ? 'is-user' : 'is-model'}">
      <div class="db-chat-bubble">${isUser ? `<p class="db-chat-p">${h(m.content).replace(/\n/g, '<br>')}</p>` : dbChatFormatMarkdown(m.content)}</div>
      ${!isUser ? dbChatQuizCardHtml(m) : ''}
      <div class="db-chat-msg-meta">${meta}</div>
    </article>`;
  }).join('');

  const typing = DB_CHAT.sending
    ? `<article class="db-chat-msg is-model is-pending" aria-live="polite">
        <div class="db-chat-bubble"><span class="db-chat-dots" aria-hidden="true"><i></i><i></i><i></i></span> Gemini đang suy nghĩ và soạn câu trả lời…</div>
      </article>`
    : '';

  return `<div class="db-chat-stream-inner">${bubbles}${typing}</div>`;
}

function dbChatErrorBannerHtml() {
  const err = DB_CHAT.error;
  if (!err) return '';
  return `<div class="db-chat-error" role="alert">
    <div class="db-chat-error-copy">${ic('alert', 16)} <span>${h(err.message)}</span></div>
    <div class="db-chat-error-actions">
      ${(err.code === 'QUOTA_OR_PAID_KEY_REQUIRED' || err.code === 'KEY_PERMISSION_OR_INVALID' || err.code === 'MISSING_API_KEY' || err.code === 'KEY_RECORD_INVALID')
        ? dbBtn(ic('spark', 15) + ' Quản lý API key', 'openAiKey', {}, 'light mini') : ''}
      ${(err.code === 'QUOTA_OR_PAID_KEY_REQUIRED' || err.code === 'KEY_PERMISSION_OR_INVALID') && err.retryPayload
        ? dbBtn('Thử lại với Cân bằng', 'chatRetryBalanced', {}, 'light mini') : ''}
      ${err.retryPayload ? dbBtn('Thử lại', 'chatRetryLast', {}, 'light mini') : ''}
      <button type="button" class="db-chat-link-btn" data-act="chatDismissError">Đóng</button>
    </div>
  </div>`;
}

function dbChatComposerHtml(surface) {
  /* Một nguồn quyết định duy nhất: dbAiStudentState() (khoá khi đang làm bài, công tắc của giáo viên,
     lớp bị tắt AI, chưa có API key). Giáo viên luôn được dùng. */
  const aiState = typeof dbAiStudentState === 'function' ? dbAiStudentState() : { allowed: true, reason: '' };
  const disabled = DB_CHAT.sending || !aiState.allowed;
  const modeList = dbIsTeacher() ? DB_CHAT_MODES_T : DB_CHAT_MODES_S;
  const activeMode = dbChatActiveMode();
  const rec = dbChatRecommendModel(DB_CHAT.tier, activeMode, DB_CHAT.draftText, activeMode === 'quiz');
  const inputId = surface === 'page' ? 'db-chat-input-page' : 'db-chat-input-drawer';
  const tierId = surface === 'page' ? 'db-chat-tier-page' : 'db-chat-tier-drawer';

  const modeRow = surface !== 'page'
    ? `<div class="db-chat-mode-row" role="group" aria-label="Chế độ trợ lý">
      ${modeList.map((m) => `<button type="button" class="db-chat-mode-btn${activeMode === m.id ? ' is-active' : ''}" data-act="chatSetMode" data-mode="${h(m.id)}" aria-pressed="${activeMode === m.id ? 'true' : 'false'}">${h(m.label)}</button>`).join('')}
    </div>`
    : '';

  return `<form class="db-chat-composer" data-act="chatSend" data-surface="${h(surface)}" novalidate>
    ${modeRow}
    <div class="db-chat-input-wrap">
      <textarea id="${inputId}" name="message" rows="2" maxlength="4000" placeholder="${!aiState.allowed
        ? h(aiState.reason)
        : 'Nhập câu hỏi hoặc yêu cầu (Enter để gửi, Shift+Enter xuống dòng)…'}" data-input="chatDraftInput" ${disabled ? 'disabled' : ''}>${h(DB_CHAT.draftText)}</textarea>
      <div class="db-chat-composer-foot">
        <div class="db-chat-tier-pick">
          <label for="${tierId}" class="sr">Chọn mức xử lý Gemini</label>
          <select id="${tierId}" data-change="chatSetTier" title="Chọn mức xử lý mô hình Gemini">
            ${Object.entries(DB_CHAT_MODELS).map(([k, v]) => `<option value="${h(k)}" ${DB_CHAT.tier === k ? 'selected' : ''}>${h(v.tierLabel)}</option>`).join('')}
          </select>
          <span class="db-chat-model-hint">${h(rec.label)}</span>
        </div>
        <button type="submit" class="btn db-chat-send-btn" ${disabled ? 'disabled' : ''}>${ic('send', 15)}<span>${DB_CHAT.sending ? 'Đang gửi…' : 'Gửi'}</span></button>
      </div>
    </div>
  </form>`;
}

function dbChatTopBtnHtml() {
  const aiState = typeof dbAiStudentState === 'function' ? dbAiStudentState() : { allowed: true, reason: '' };
  const locked = !aiState.allowed;
  const needsKey = locked && /API key/i.test(aiState.reason);
  const active = DB_CHAT.drawerOpen || DB.page === 'chat';
  const label = locked ? 'Trợ lý AI (' + aiState.reason + ')' : 'Trợ lý AI';
  const act = needsKey ? 'openAiKey' : 'toggleChatDrawer';
  return `<button type="button" id="db-chat-toggle" class="btn light mini db-chat-top-btn${active ? ' is-active' : ''}${locked ? ' is-locked' : ''}" data-act="${act}" aria-expanded="${DB_CHAT.drawerOpen ? 'true' : 'false'}" aria-label="${h(label)}" title="${h(label)}">
    ${ic(locked ? 'lock' : 'chat', 16)}<span>Trợ lý AI</span>
  </button>`;
}

function dbChatDrawerInnerHtml() {
  const threads = DB_CHAT.threads || [];
  const activeThread = threads.find((t) => t.id === DB_CHAT.activeThreadId);
  const threadPicker = threads.length
    ? `<select class="db-chat-thread-select" data-change="chatPickThread" aria-label="Chọn cuộc trò chuyện gần đây">
        <option value="">+ Cuộc trò chuyện mới</option>
        ${threads.slice(0, 15).map((t) => `<option value="${h(t.id)}" ${t.id === DB_CHAT.activeThreadId ? 'selected' : ''}>${h(t.title)}</option>`).join('')}
      </select>`
    : '';
  return `<div class="db-chat-drawer-head">
      <div class="db-chat-drawer-title">
        <span class="db-chat-badge-ic" aria-hidden="true">${ic('chat', 16)}</span>
        <div><b>${h(activeThread ? activeThread.title : 'Trợ lý AI Gemini')}</b><small>${dbIsTeacher() ? 'Hỗ trợ giảng dạy' : 'Gia sư học tập'}</small></div>
      </div>
      <div class="db-chat-drawer-actions">
        <button type="button" class="btn light icon-only mini" data-iconified="1" data-act="chatNewThread" aria-label="Cuộc trò chuyện mới" title="Cuộc trò chuyện mới">${ic('plus', 16)}<span class="sr">Cuộc trò chuyện mới</span></button>
        <button type="button" class="btn light icon-only mini" data-iconified="1" data-act="chatOpenFullWorkspace" aria-label="Mở không gian AI toàn màn hình" title="Mở toàn màn hình">${ic('expand', 16)}<span class="sr">Mở toàn màn hình</span></button>
        <button type="button" class="btn light icon-only mini" data-iconified="1" data-act="closeChatDrawer" aria-label="Đóng Trợ lý AI" title="Đóng (Esc)">${ic('close', 16)}<span class="sr">Đóng</span></button>
      </div>
    </div>
    ${threadPicker ? `<div class="db-chat-drawer-threads">${threadPicker}</div>` : ''}
    ${dbChatContextChipsHtml()}
    <div class="db-chat-stream" id="db-chat-drawer-stream">${dbChatMessagesHtml()}</div>
    ${dbChatErrorBannerHtml()}
    ${dbChatComposerHtml('drawer')}`;
}

function dbChatDrawerHtml() {
  const aiState = typeof dbAiStudentState === 'function' ? dbAiStudentState() : { allowed: true };
  if (!aiState.allowed && /làm bài/.test(aiState.reason) && DB_CHAT.drawerOpen) DB_CHAT.drawerOpen = false;
  const open = !!DB_CHAT.drawerOpen && DB.page !== 'chat';
  return `<div id="db-chat-drawer-host" class="db-chat-drawer-host${open ? ' is-open' : ''}">${dbChatDrawerHostBodyHtml(open)}</div>`;
}

function dbChatDrawerHostBodyHtml(open) {
  return `<div class="db-chat-backdrop" data-act="closeChatDrawer" ${open ? '' : 'hidden'}></div>
    <aside class="db-chat-drawer" role="dialog" aria-label="Trợ lý AI Gemini" ${open ? '' : 'hidden'}>
      ${open ? dbChatDrawerInnerHtml() : ''}
    </aside>`;
}

function dbChatThreadSidebarHtml() {
  const threads = DB_CHAT.threads || [];
  const collapsed = !!DB_CHAT.sidebarCollapsed;
  const toggleLabel = collapsed ? 'Mở rộng thanh Trò chuyện' : 'Thu nhỏ thanh Trò chuyện';
  return `<aside class="db-chat-sidebar${DB_CHAT.mobileThreadsOpen ? ' is-mobile-open' : ''}${collapsed ? ' is-collapsed' : ''}" aria-label="Lịch sử trò chuyện AI">
    <div class="db-chat-sidebar-head">
      <b>Cuộc trò chuyện</b>
      <div class="db-chat-sidebar-actions">
        <button type="button" class="btn mini db-chat-new-btn" data-act="chatNewThread" aria-label="Cuộc trò chuyện mới" title="Cuộc trò chuyện mới">${ic('plus', 14)}<span>Mới</span></button>
        <button type="button" class="btn light icon-only mini db-chat-sidebar-toggle" data-iconified="1" data-act="chatToggleSidebar" aria-label="${toggleLabel}" title="${toggleLabel}" aria-expanded="${!collapsed}">${ic(collapsed ? 'chevronRight' : 'chevronLeft', 15)}<span class="sr">${collapsed ? 'Mở rộng' : 'Thu nhỏ'}</span></button>
      </div>
    </div>
    <div class="db-chat-thread-list">
      ${DB_CHAT.threadsLoading && !threads.length
        ? `<div class="muted db-chat-thread-empty">Đang tải lịch sử…</div>`
        : threads.length
        ? threads.map((t) => {
            const active = t.id === DB_CHAT.activeThreadId;
            return `<div class="db-chat-thread-item${active ? ' is-active' : ''}">
              <button type="button" class="db-chat-thread-open" data-act="chatSelectThread" data-id="${h(t.id)}" aria-current="${active ? 'true' : 'false'}">
                <span class="db-chat-thread-title">${h(t.title)}</span>
                <small>${h(dbDateTime(t.updated_at || t.created_at))}</small>
              </button>
              <button type="button" class="btn light icon-only mini danger-soft db-chat-thread-del" data-iconified="1" data-act="chatDeleteThread" data-id="${h(t.id)}" aria-label="Xóa cuộc trò chuyện ${h(t.title)}" title="Xóa">${ic('trash', 14)}<span class="sr">Xóa</span></button>
            </div>`;
          }).join('')
        : `<div class="muted db-chat-thread-empty">Chưa có cuộc trò chuyện nào. Hãy gửi câu hỏi đầu tiên bên phải.</div>`}
    </div>
  </aside>`;
}

function dbChatWorkspaceBodyHtml() {
  const activeThread = (DB_CHAT.threads || []).find((t) => t.id === DB_CHAT.activeThreadId);
  return `${dbChatThreadSidebarHtml()}
    <section class="db-chat-stage" aria-label="Nội dung trò chuyện AI">
      <div class="db-chat-stage-head">
        <div class="db-chat-stage-title">
          <button type="button" class="btn light mini db-chat-mobile-threads-btn" data-act="chatToggleMobileThreads">${ic('list', 15)}<span>Lịch sử (${(DB_CHAT.threads || []).length})</span></button>
          <div>
            <h2>${h(activeThread ? activeThread.title : 'Cuộc trò chuyện mới')}</h2>
            <p class="muted">${dbIsTeacher() ? 'Trợ lý Sư phạm · Dữ liệu lớp học được bảo vệ theo quyền giáo viên' : 'Gia sư AI · Hỗ trợ học tập theo tiến độ của em'}</p>
          </div>
        </div>
      </div>
      ${dbChatContextChipsHtml()}
      <div class="db-chat-stream" id="db-chat-page-stream">${dbChatMessagesHtml()}</div>
      ${dbChatErrorBannerHtml()}
      ${dbChatComposerHtml('page')}
    </section>`;
}

function dbChatWorkspaceHtml() {
  return `<div id="db-chat-workspace" class="db-chat-workspace panel${DB_CHAT.sidebarCollapsed ? ' is-sidebar-collapsed' : ''}">${dbChatWorkspaceBodyHtml()}</div>`;
}

DB_PAGES.chat = {
  title: 'Trợ lý AI',
  sub: () => (dbIsTeacher()
    ? 'Trao đổi đa lượt với Gemini để soạn giáo án, phân tích lỗ hổng lớp và tạo nhanh câu hỏi nháp.'
    : 'Hỏi đáp bài học theo từng bước, ôn tập lỗ hổng và luyện câu hỏi trắc nghiệm cùng Gemini.'),
  async load() {
    DB_CHAT.drawerOpen = false;
    if (typeof dbAiKeyLoad === 'function') await dbAiKeyLoad();
    await dbChatEnsureThreads(true);
    if (DB_CHAT.activeThreadId && !DB_CHAT.messagesByThread[DB_CHAT.activeThreadId]) {
      await dbChatLoadThreadMessages(DB_CHAT.activeThreadId);
    }
    return { ready: true };
  },
  view() {
    return dbChatWorkspaceHtml();
  },
};

async function dbChatEnsureThreads(force = false) {
  if (!EducMindDB || typeof EducMindDB.listChatThreads !== 'function') return;
  if (DB_CHAT.threadsLoaded && !force) return;
  DB_CHAT.threadsLoading = true;
  try {
    const list = await dbCall(EducMindDB.listChatThreads(40));
    DB_CHAT.threads = Array.isArray(list) ? list : [];
    DB_CHAT.threadsLoaded = true;
    if (DB_CHAT.activeThreadId && !DB_CHAT.threads.some((t) => t.id === DB_CHAT.activeThreadId)) {
      DB_CHAT.activeThreadId = '';
    }
  } catch (e) {
    dbLogError(e);
  } finally {
    DB_CHAT.threadsLoading = false;
  }
}

async function dbChatLoadThreadMessages(threadId) {
  if (!threadId || !EducMindDB || typeof EducMindDB.listChatMessages !== 'function') return;
  DB_CHAT.messagesLoading = true;
  dbChatRepaint();
  try {
    const rows = await dbCall(EducMindDB.listChatMessages(threadId, 80));
    DB_CHAT.messagesByThread[threadId] = Array.isArray(rows) ? rows : [];
  } catch (e) {
    dbLogError(e);
    toast(dbErrText(e));
  } finally {
    DB_CHAT.messagesLoading = false;
    dbChatRepaint();
  }
}

function dbChatScrollToBottom() {
  ['db-chat-drawer-stream', 'db-chat-page-stream'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function dbChatRepaint(opts = {}) {
  const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
  const activeId = activeEl && activeEl.id ? activeEl.id : '';
  const selStart = activeEl && typeof activeEl.selectionStart === 'number' ? activeEl.selectionStart : null;

  const ws = document.getElementById('db-chat-workspace');
  if (ws && DB.page === 'chat') {
    ws.classList.toggle('is-sidebar-collapsed', !!DB_CHAT.sidebarCollapsed);
    ws.innerHTML = dbChatWorkspaceBodyHtml();
  }
  const host = document.getElementById('db-chat-drawer-host');
  if (host) {
    if (dbChatExamLocked() && DB_CHAT.drawerOpen) DB_CHAT.drawerOpen = false;
    const open = !!DB_CHAT.drawerOpen && DB.page !== 'chat';
    host.classList.toggle('is-open', open);
    host.innerHTML = dbChatDrawerHostBodyHtml(open);
  }
  const topBtn = document.getElementById('db-chat-toggle');
  if (topBtn) {
    topBtn.setAttribute('aria-expanded', DB_CHAT.drawerOpen ? 'true' : 'false');
    topBtn.classList.toggle('is-active', DB_CHAT.drawerOpen || DB.page === 'chat');
  }

  if (opts.scroll !== false) dbChatScrollToBottom();
  if (opts.focusInput) {
    const target = document.getElementById(DB.page === 'chat' ? 'db-chat-input-page' : 'db-chat-input-drawer');
    if (target) target.focus({ preventScroll: true });
  } else if (activeId && (activeId === 'db-chat-input-page' || activeId === 'db-chat-input-drawer')) {
    const restored = document.getElementById(activeId);
    if (restored) {
      restored.focus({ preventScroll: true });
      if (selStart != null && typeof restored.setSelectionRange === 'function') {
        try { restored.setSelectionRange(selStart, selStart); } catch (_) {}
      }
    }
  }
}

function dbChatCloseDrawer() {
  if (!DB_CHAT.drawerOpen) return;
  DB_CHAT.drawerOpen = false;
  dbChatRepaint({ scroll: false });
}

async function dbChatOpenWithContext(opts = {}) {
  if (dbChatExamLocked()) {
    toast('Trợ lý AI tạm khóa trong lúc em đang làm bài kiểm tra tính giờ.');
    return;
  }
  if (opts.mode) DB_CHAT.mode = opts.mode;
  if (opts.tier) DB_CHAT.tier = opts.tier;
  if ('lessonId' in opts) DB_CHAT.focusLessonId = opts.lessonId || '';
  if ('lessonTitle' in opts) DB_CHAT.focusLessonTitle = opts.lessonTitle || '';
  if ('objectiveId' in opts) DB_CHAT.focusObjectiveId = opts.objectiveId || '';
  if ('objectiveLabel' in opts) DB_CHAT.focusObjectiveLabel = opts.objectiveLabel || '';
  if (opts.newThread) DB_CHAT.activeThreadId = '';
  if (typeof opts.prompt === 'string') DB_CHAT.draftText = opts.prompt;

  if (DB.page !== 'chat') {
    DB_CHAT.drawerOpen = true;
    dbChatRepaint({ focusInput: !opts.autoSend });
    await dbChatEnsureThreads(false);
    if (DB_CHAT.drawerOpen) dbChatRepaint({ focusInput: !opts.autoSend });
  } else {
    dbChatRepaint({ focusInput: !opts.autoSend });
  }

  if (opts.autoSend && DB_CHAT.draftText.trim()) {
    await dbChatExecuteSend(DB_CHAT.draftText.trim(), { wantQuiz: !!opts.wantQuiz });
  }
}

async function dbChatParseInvokeError(error) {
  let detail = (error && error.details && typeof error.details === 'object') ? error.details : null;
  let message = (detail && typeof detail.error === 'string' && detail.error)
    || (error && error.message)
    || 'Không kết nối được tới Trợ lý Gemini.';
  if (!detail && error && error.context && typeof error.context.clone === 'function') {
    try {
      detail = await error.context.clone().json();
      if (detail && typeof detail.error === 'string') message = detail.error;
    } catch (_) {}
  }
  return {
    message,
    code: detail && detail.code ? String(detail.code) : '',
    suggestedModel: detail && detail.suggestedModel ? String(detail.suggestedModel) : '',
  };
}

async function dbChatExecuteSend(text, opts = {}) {
  const cleanText = String(text || '').trim();
  if (!cleanText || DB_CHAT.sending) return;
  const aiState = typeof dbAiStudentState === 'function' ? dbAiStudentState() : { allowed: true, reason: '' };
  if (!aiState.allowed) {
    toast(aiState.reason || 'Trợ lý AI hiện không dùng được.');
    return;
  }
  if (!EducMindDB || typeof EducMindDB.sendAiChat !== 'function') {
    toast('Chưa kết nối được dịch vụ Trợ lý AI.');
    return;
  }

  const mode = opts.mode || dbChatActiveMode();
  const tier = opts.tier || DB_CHAT.tier || 'auto';
  const wantQuiz = opts.wantQuiz === true || (mode === 'quiz' && tier !== 'fast');
  /* Bài tập / bài kiểm tra đang mở: máy chủ kiểm tra công tắc AI riêng của bài đó. */
  const workPage = DB.page === 'assignments' ? 'assignment' : (DB.page === 'assessments' || DB.page === 'exam' ? 'assessment' : '');
  const payload = {
    thread_id: DB_CHAT.activeThreadId || null,
    class_id: DB.classId || null,
    work_kind: workPage || undefined,
    work_id: workPage ? ((DB.arg && DB.arg.id) || undefined) : undefined,
    lesson_id: DB_CHAT.focusLessonId || null,
    objective_id: DB_CHAT.focusObjectiveId || null,
    page: DB.page || 'home',
    mode,
    tier,
    want_quiz: wantQuiz,
    include_context: DB_CHAT.includeContext,
    message: cleanText,
  };

  const prevDraft = DB_CHAT.draftText;
  const tempKey = DB_CHAT.activeThreadId || '__pending__';
  const optimisticMsg = {
    id: 'temp-' + Date.now(),
    thread_id: DB_CHAT.activeThreadId,
    sender: 'user',
    model: null,
    content: cleanText,
    artifacts: {},
    created_at: new Date().toISOString(),
  };

  DB_CHAT.sending = true;
  DB_CHAT.error = null;
  DB_CHAT.draftText = '';
  DB_CHAT.messagesByThread[tempKey] = (DB_CHAT.messagesByThread[tempKey] || []).concat(optimisticMsg);
  dbChatRepaint({ scroll: true });

  try {
    const { data, error } = await EducMindDB.sendAiChat(payload);
    if (error) {
      const parsed = await dbChatParseInvokeError(error);
      throw Object.assign(new Error(parsed.message), { chatCode: parsed.code, suggestedModel: parsed.suggestedModel });
    }
    if (!data || !data.assistantMessage || !data.thread) {
      throw new Error('Phản hồi từ Trợ lý AI không đầy đủ; hãy thử lại.');
    }

    const thread = data.thread;
    const prevList = (DB_CHAT.messagesByThread[tempKey] || []).filter((m) => m.id !== optimisticMsg.id);
    if (tempKey === '__pending__') delete DB_CHAT.messagesByThread.__pending__;
    DB_CHAT.activeThreadId = thread.id;
    const baseMsgs = tempKey === thread.id ? prevList : (DB_CHAT.messagesByThread[thread.id] || prevList);
    DB_CHAT.messagesByThread[thread.id] = baseMsgs.concat([data.userMessage, data.assistantMessage]);

    const idx = DB_CHAT.threads.findIndex((t) => t.id === thread.id);
    if (idx >= 0) DB_CHAT.threads.splice(idx, 1);
    DB_CHAT.threads.unshift(thread);
    DB_CHAT.threadsLoaded = true;
  } catch (err) {
    dbLogError(err);
    DB_CHAT.messagesByThread[tempKey] = (DB_CHAT.messagesByThread[tempKey] || []).filter((m) => m.id !== optimisticMsg.id);
    if (!DB_CHAT.draftText) DB_CHAT.draftText = prevDraft || cleanText;
    DB_CHAT.error = {
      message: (err && err.message) || 'Không gửi được tin nhắn.',
      code: (err && err.chatCode) || '',
      suggestedModel: (err && err.suggestedModel) || '',
      retryPayload: { text: cleanText, opts: { mode, tier, wantQuiz } },
    };
  } finally {
    DB_CHAT.sending = false;
    dbChatRepaint({ scroll: true, focusInput: true });
  }
}

/* ===== Thao tác (Delegated Handlers) ===== */
DB_ACT.toggleChatDrawer = async () => {
  if (dbChatExamLocked()) {
    toast('Trợ lý AI tạm khóa trong lúc em đang làm bài kiểm tra tính giờ.');
    return;
  }
  if (DB.page === 'chat') {
    const input = document.getElementById('db-chat-input-page');
    if (input) input.focus();
    return;
  }
  DB_CHAT.drawerOpen = !DB_CHAT.drawerOpen;
  dbChatRepaint({ focusInput: DB_CHAT.drawerOpen });
  if (DB_CHAT.drawerOpen && !DB_CHAT.threadsLoaded) {
    await dbChatEnsureThreads(false);
    if (DB_CHAT.activeThreadId && !DB_CHAT.messagesByThread[DB_CHAT.activeThreadId]) {
      await dbChatLoadThreadMessages(DB_CHAT.activeThreadId);
    } else if (DB_CHAT.drawerOpen) {
      dbChatRepaint({ focusInput: true });
    }
  }
};

DB_ACT.closeChatDrawer = () => dbChatCloseDrawer();

DB_ACT.chatOpenFullWorkspace = () => {
  DB_CHAT.drawerOpen = false;
  return dbGo('chat');
};

DB_ACT.chatNewThread = () => {
  DB_CHAT.activeThreadId = '';
  DB_CHAT.error = null;
  DB_CHAT.mobileThreadsOpen = false;
  dbChatRepaint({ focusInput: true });
};

DB_ACT.chatSelectThread = async (el) => {
  const id = el.dataset.id || '';
  if (!id) return;
  DB_CHAT.activeThreadId = id;
  DB_CHAT.error = null;
  DB_CHAT.mobileThreadsOpen = false;
  const found = DB_CHAT.threads.find((t) => t.id === id);
  if (found && found.mode) DB_CHAT.mode = found.mode;
  if (!DB_CHAT.messagesByThread[id]) {
    await dbChatLoadThreadMessages(id);
  } else {
    dbChatRepaint({ scroll: true, focusInput: true });
  }
};

DB_ACT.chatPickThread = async (el) => {
  const id = el.value || '';
  if (!id) {
    DB_ACT.chatNewThread();
    return;
  }
  DB_CHAT.activeThreadId = id;
  DB_CHAT.error = null;
  if (!DB_CHAT.messagesByThread[id]) await dbChatLoadThreadMessages(id);
  else dbChatRepaint({ scroll: true, focusInput: true });
};

DB_ACT.chatDeleteThread = (el) => {
  const id = el.dataset.id;
  const thread = (DB_CHAT.threads || []).find((t) => t.id === id);
  if (!thread) return;
  dbConfirm('Xóa cuộc trò chuyện?', `Cuộc trò chuyện “${h(thread.title)}” sẽ bị xóa vĩnh viễn.`, 'Xóa', async () => {
    await dbCall(EducMindDB.deleteChatThread(id));
    DB_CHAT.threads = DB_CHAT.threads.filter((t) => t.id !== id);
    delete DB_CHAT.messagesByThread[id];
    if (DB_CHAT.activeThreadId === id) DB_CHAT.activeThreadId = '';
    toast('Đã xóa cuộc trò chuyện.');
  }, true);
};

DB_ACT.chatToggleMobileThreads = () => {
  DB_CHAT.mobileThreadsOpen = !DB_CHAT.mobileThreadsOpen;
  dbChatRepaint({ scroll: false });
};

DB_ACT.chatToggleSidebar = () => {
  DB_CHAT.sidebarCollapsed = !DB_CHAT.sidebarCollapsed;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DB_CHAT_SIDEBAR_STORAGE_KEY, DB_CHAT.sidebarCollapsed ? '1' : '0');
    }
  } catch (_) {}
  dbChatRepaint({ scroll: false });
};

DB_ACT.chatSetMode = (el) => {
  DB_CHAT.mode = el.dataset.mode || dbChatDefaultMode();
  dbChatRepaint({ scroll: false });
  if (typeof dbSyncDockActive === 'function') dbSyncDockActive();
};

DB_ACT.chatSetTier = (el) => {
  DB_CHAT.tier = el.value || 'auto';
  dbChatRepaint({ scroll: false });
};

DB_ACT.chatToggleContext = (el) => {
  DB_CHAT.includeContext = !!el.checked;
  dbChatRepaint({ scroll: false });
};

DB_ACT.chatClearLesson = () => {
  DB_CHAT.focusLessonId = '';
  DB_CHAT.focusLessonTitle = '';
  DB_CHAT.focusObjectiveId = '';
  DB_CHAT.focusObjectiveLabel = '';
  dbChatRepaint({ scroll: false });
};

DB_ACT.chatDraftInput = (el) => {
  DB_CHAT.draftText = el.value || '';
  const foot = el.closest('.db-chat-composer')?.querySelector('.db-chat-model-hint');
  if (foot) {
    const mode = dbChatActiveMode();
    foot.textContent = dbChatRecommendModel(DB_CHAT.tier, mode, DB_CHAT.draftText, mode === 'quiz').label;
  }
};

DB_ACT.chatSend = async (form) => {
  const textarea = form.querySelector('textarea[name="message"]');
  const val = textarea ? textarea.value : DB_CHAT.draftText;
  await dbChatExecuteSend(val);
};

DB_ACT.chatUseStarter = async (el) => {
  const idx = Number(el.dataset.idx);
  const starters = dbChatStarterPrompts();
  const s = starters[idx];
  if (!s) return;
  if (s.mode) DB_CHAT.mode = s.mode;
  await dbChatExecuteSend(s.text, { mode: s.mode, wantQuiz: !!s.wantQuiz });
};

DB_ACT.chatDismissError = () => {
  DB_CHAT.error = null;
  dbChatRepaint({ scroll: false });
};

DB_ACT.chatRetryBalanced = async () => {
  const last = DB_CHAT.error && DB_CHAT.error.retryPayload;
  if (!last) return;
  DB_CHAT.tier = 'balanced';
  await dbChatExecuteSend(last.text, { ...last.opts, tier: 'balanced' });
};

DB_ACT.chatRetryLast = async () => {
  const last = DB_CHAT.error && DB_CHAT.error.retryPayload;
  if (!last) return;
  await dbChatExecuteSend(last.text, last.opts);
};

DB_ACT.chatQuizPick = (el) => {
  const msgId = el.dataset.msg;
  const qi = Number(el.dataset.qi);
  const oi = Number(el.dataset.oi);
  if (!msgId || Number.isNaN(qi) || Number.isNaN(oi)) return;
  DB_CHAT.quizAnswers[`${msgId}:${qi}`] = oi;
  dbChatRepaint({ scroll: false });
};

DB_ACT.chatQuizExplainWrong = async (el) => {
  const msgId = el.dataset.msg;
  const qi = Number(el.dataset.qi);
  const msgs = DB_CHAT.messagesByThread[DB_CHAT.activeThreadId] || [];
  const msg = msgs.find((m) => m.id === msgId);
  const q = msg && msg.artifacts && Array.isArray(msg.artifacts.quiz) ? msg.artifacts.quiz[qi] : null;
  if (!q) return;
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  const pickedIdx = Number(DB_CHAT.quizAnswers[`${msgId}:${qi}`]);
  const opts = Array.isArray(q.options) ? q.options : [];
  const chosenLabel = pickedIdx >= 0 ? `${letters[pickedIdx]} (${opts[pickedIdx] || ''})` : '';
  const prompt = `Ở câu "${q.content}", ${chosenLabel ? `em chọn ${chosenLabel} nhưng bị sai.` : 'em chưa hiểu.'} Hãy giải thích từng bước vì sao đáp án đó sai và cách tư duy đúng.`;
  await dbChatExecuteSend(prompt, { mode: 'tutor', wantQuiz: false });
};

DB_ACT.chatSaveQuizDrafts = async (el) => {
  if (!dbIsTeacher()) return;
  const msgId = el.dataset.msg;
  const msgs = DB_CHAT.messagesByThread[DB_CHAT.activeThreadId] || [];
  const msg = msgs.find((m) => m.id === msgId);
  const quiz = msg && msg.artifacts && Array.isArray(msg.artifacts.quiz) ? msg.artifacts.quiz : [];
  if (!quiz.length) return;

  let lessons = (DB.data && Array.isArray(DB.data.lessons) && DB.data.lessons.length) ? DB.data.lessons : [];
  if (!lessons.length && DB.course) {
    lessons = await dbCall(EducMindDB.listLessons(DB.course.id));
  }
  if (!lessons.length) {
    toast('Lớp chưa có bài học nào. Hãy tạo bài học và mục tiêu trong Thư mục học tập trước.');
    return;
  }

  const saveForLesson = async (lessonId) => {
    const items = quiz.map((q) => ({
      kind: q.kind === 'TRUE_FALSE' ? 'TRUE_FALSE' : 'SINGLE_CHOICE',
      content: q.content,
      options: q.kind === 'TRUE_FALSE' ? ['Đúng', 'Sai'] : (Array.isArray(q.options) ? q.options : []),
      correct_answer: q.kind === 'TRUE_FALSE' ? Number(q.correct_index) === 0 : Number(q.correct_index || 0),
      difficulty: q.difficulty || 'MEDIUM',
      bloom_level: q.bloom_level || 'UNDERSTAND',
    }));
    await dbCall(EducMindDB.saveChatQuestionsToDrafts(lessonId, items));
    DB_CHAT.quizSaved[msgId] = true;
    dbChatRepaint({ scroll: false });
    toast(`Đã lưu ${items.length} câu hỏi vào mục AI tạo câu hỏi (Chờ duyệt).`);
  };

  if (DB_CHAT.focusLessonId && lessons.some((l) => l.id === DB_CHAT.focusLessonId)) {
    await saveForLesson(DB_CHAT.focusLessonId);
    return;
  }

  dbOpenDialog({
    title: 'Lưu câu hỏi vào bản nháp AI',
    okLabel: 'Lưu bản nháp',
    body: `<p class="muted">Chọn bài học để gắn ${quiz.length} câu hỏi này vào hàng đợi chờ duyệt của trang AI tạo câu hỏi.</p>
      ${dbField('Bài học', 'db-chat-save-lesson', `<select id="db-chat-save-lesson" name="lesson_id" required>${lessons.map((l) => `<option value="${h(l.id)}">${h(l.title)}</option>`).join('')}</select>`)}`,
    onOk: async (v) => {
      if (!v.lesson_id) throw new Error('Hãy chọn một bài học.');
      await saveForLesson(v.lesson_id);
      return false;
    },
  });
};

DB_ACT.chatAskLesson = (el) => {
  const lessonId = el.dataset.lesson || '';
  const lessonTitle = el.dataset.lessonTitle || '';
  const mode = el.dataset.mode || (dbIsTeacher() ? 'lesson_plan' : 'tutor');
  const wantQuiz = el.dataset.quiz === '1';
  const prompt = wantQuiz
    ? `Tạo giúp em 3 câu hỏi trắc nghiệm luyện tập nhanh cho bài "${lessonTitle}".`
    : dbIsTeacher()
    ? `Hãy gợi ý giáo án trọng tâm và 2 hoạt động luyện tập phân hóa cho bài "${lessonTitle}".`
    : `Em đang học bài "${lessonTitle}". Hãy tóm tắt trọng tâm bài này và gợi ý bước ôn tập hiệu quả.`;
  return dbChatOpenWithContext({
    mode,
    lessonId,
    lessonTitle,
    prompt,
    wantQuiz,
    autoSend: false,
    newThread: true,
  });
};

DB_ACT.chatAskGaps = (el) => {
  const mode = el.dataset.mode || (dbIsTeacher() ? 'gap_analysis' : 'tutor');
  const focus = el.dataset.focus || 'gaps';
  const prompt = dbIsTeacher()
    ? (focus === 'mastery'
        ? 'Hãy phân tích bảng mức độ nắm vững hiện tại của lớp, chỉ ra những mục tiêu dưới 50% và đề xuất nhóm học sinh cần hỗ trợ.'
        : 'Hãy phân tích các lỗ hổng kiến thức đang mở trong lớp, nguyên nhân gốc phổ biến và đề xuất kế hoạch phụ đạo cụ thể.')
    : (focus === 'mastery'
        ? 'Dựa trên mức nắm vững các mục tiêu của em, hãy đề xuất lộ trình ôn tập ưu tiên từ mục tiêu yếu nhất.'
        : 'Hãy xem các lỗ hổng kiến thức đang mở của em và hướng dẫn em ôn lại từng bước kèm câu hỏi kiểm tra nhỏ.');
  return dbChatOpenWithContext({
    mode,
    lessonId: '',
    lessonTitle: '',
    prompt,
    autoSend: false,
    newThread: true,
  });
};

/* Nhấn Enter để gửi nhanh (Shift+Enter để xuống dòng) bên trong khung nhập liệu trợ lý AI. */
app.addEventListener('keydown', (ev) => {
  if (!dbActive()) return;
  const target = ev.target;
  if (!target || (target.id !== 'db-chat-input-drawer' && target.id !== 'db-chat-input-page')) return;
  if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
    ev.preventDefault();
    const form = target.closest('form[data-act="chatSend"]');
    if (form) DB_ACT.chatSend(form);
  }
});
