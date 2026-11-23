/* EducMind · js/db/01b-offline-drafts.js
   Bộ nhớ đệm nháp ngoại tuyến và thanh cảnh báo kết nối mạng cho bài kiểm tra / bài tập.
   Lưu ý: Dữ liệu chấm điểm và thời gian mở/đóng bài luôn do máy chủ quyết định; bộ đệm cục bộ
   chỉ giúp học sinh không mất câu trả lời đang nhập dở khi rớt mạng hoặc F5. */

const DB_NET = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  syncing: false,
  saveError: false,
  syncedNotice: false,
  hideTimer: null,
};

function dbDraftUserId() {
  return (typeof DB !== 'undefined' && DB && DB.me && DB.me.id)
    || (typeof sess !== 'undefined' && sess && sess.userId)
    || '';
}

function dbDraftKey(kind, scopeId) {
  const uid = dbDraftUserId();
  if (!uid || !kind || !scopeId) return '';
  return `educmind.draft.${kind}:${uid}:${scopeId}`;
}

function dbDraftRead(kind, scopeId) {
  const key = dbDraftKey(kind, scopeId);
  if (!key || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.answers !== 'object') return null;
    return {
      version: 1,
      updatedAt: Number(parsed.updatedAt) || 0,
      answers: parsed.answers || {},
      pending: parsed.pending && typeof parsed.pending === 'object' ? parsed.pending : {},
      mode: parsed.mode || '',
    };
  } catch (_) {
    return null;
  }
}

function dbDraftWrite(kind, scopeId, draft) {
  const key = dbDraftKey(kind, scopeId);
  if (!key || typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(key, JSON.stringify({
      version: 1,
      updatedAt: Number(draft.updatedAt) || Date.now(),
      answers: draft.answers || {},
      pending: draft.pending || {},
      mode: draft.mode || '',
    }));
    return true;
  } catch (_) {
    return false;
  }
}

function dbDraftClear(kind, scopeId) {
  const key = dbDraftKey(kind, scopeId);
  if (!key || typeof localStorage === 'undefined') return;
  try { localStorage.removeItem(key); } catch (_) {}
}

function dbDraftClearUserAll(userId) {
  if (!userId || typeof localStorage === 'undefined' || typeof localStorage.length !== 'number') return;
  const tag = `:${userId}:`;
  const toDelete = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('educmind.draft.') && k.includes(tag)) toDelete.push(k);
    }
    for (const k of toDelete) localStorage.removeItem(k);
  } catch (_) {}
}

function dbDraftSetAnswer(kind, scopeId, questionId, value, pending = true, extra = null) {
  if (!scopeId || !questionId) return false;
  const cur = dbDraftRead(kind, scopeId) || { version: 1, updatedAt: Date.now(), answers: {}, pending: {}, mode: '' };
  cur.answers[questionId] = value;
  if (pending) cur.pending[questionId] = true;
  else delete cur.pending[questionId];
  if (extra && extra.mode) cur.mode = String(extra.mode);
  cur.updatedAt = Date.now();
  return dbDraftWrite(kind, scopeId, cur);
}

function dbDraftMarkSaved(kind, scopeId, questionId) {
  if (!scopeId || !questionId) return;
  const cur = dbDraftRead(kind, scopeId);
  if (!cur) return;
  delete cur.pending[questionId];
  if (kind === 'exam' && !Object.keys(cur.pending).length) {
    dbDraftClear(kind, scopeId);
    return;
  }
  cur.updatedAt = Date.now();
  dbDraftWrite(kind, scopeId, cur);
}

function dbNetPendingCount() {
  if (typeof DBX !== 'undefined' && DBX && DBX.state) {
    return Object.values(DBX.state).filter((s) => s === 'dirty' || s === 'saving' || s === 'error').length;
  }
  return 0;
}

function dbNetBannerState() {
  const pending = dbNetPendingCount();
  const isOnline = typeof navigator === 'undefined' ? DB_NET.online : (navigator.onLine !== false && DB_NET.online);
  if (!isOnline) {
    return {
      hidden: false,
      tone: 'warn',
      icon: 'alert',
      text: 'Mất kết nối mạng — bài làm đang được lưu nháp trên thiết bị này.'
        + (pending ? ` (${pending} câu chờ đồng bộ)` : ''),
      retry: false,
    };
  }
  if (DB_NET.syncing) {
    return {
      hidden: false,
      tone: 'info',
      icon: 'refresh',
      text: 'Đang đồng bộ câu trả lời lên máy chủ…',
      retry: false,
    };
  }
  if (DB_NET.saveError || (typeof DBX !== 'undefined' && DBX && Object.values(DBX.state || {}).some((s) => s === 'error'))) {
    return {
      hidden: false,
      tone: 'warn',
      icon: 'alert',
      text: `Chưa thể đồng bộ ${pending || 1} câu trả lời lên máy chủ. Nháp vẫn được giữ an toàn trên thiết bị.`,
      retry: true,
    };
  }
  if (DB_NET.syncedNotice) {
    return {
      hidden: false,
      tone: 'good',
      icon: 'check',
      text: 'Đã khôi phục kết nối và đồng bộ bài làm.',
      retry: false,
    };
  }
  return { hidden: true, tone: '', icon: 'info', text: '', retry: false };
}

function dbNetBannerInner(st) {
  if (st.hidden) return '';
  return `<span class="db-net-banner-copy">${ic(st.icon, 16)}<span>${h(st.text)}</span></span>`
    + (st.retry ? `<button type="button" class="btn light mini" data-act="syncOfflineDrafts">Thử đồng bộ lại</button>` : '');
}

function dbNetBannerHtml() {
  const st = dbNetBannerState();
  const cls = st.tone ? ` is-${st.tone}` : '';
  return `<div id="db-net-banner" class="db-net-banner${cls}" role="status" aria-live="polite"${st.hidden ? ' hidden' : ''}>${dbNetBannerInner(st)}</div>`;
}

function dbNetUpdateBanner() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('db-net-banner');
  if (!el) return;
  const st = dbNetBannerState();
  el.className = 'db-net-banner' + (st.tone ? ` is-${st.tone}` : '');
  el.hidden = !!st.hidden;
  el.innerHTML = dbNetBannerInner(st);
}

async function dbNetSyncNow() {
  const onlineNow = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  DB_NET.online = onlineNow;
  if (!onlineNow) {
    DB_NET.syncing = false;
    DB_NET.syncedNotice = false;
    dbNetUpdateBanner();
    if (typeof toast === 'function') toast('Vẫn đang mất kết nối mạng. Nháp tiếp tục được giữ trên thiết bị.');
    return false;
  }
  clearTimeout(DB_NET.hideTimer);
  DB_NET.syncing = true;
  DB_NET.syncedNotice = false;
  dbNetUpdateBanner();
  try {
    if (typeof DBX !== 'undefined' && DBX && typeof dbExamFlush === 'function') {
      const pending = await dbExamFlush(DBX);
      DB_NET.saveError = pending.length > 0;
    } else {
      DB_NET.saveError = false;
    }
  } catch (_) {
    DB_NET.saveError = true;
  }
  DB_NET.syncing = false;
  if (!DB_NET.saveError) {
    DB_NET.syncedNotice = true;
    DB_NET.hideTimer = setTimeout(() => {
      DB_NET.syncedNotice = false;
      dbNetUpdateBanner();
    }, 4000);
  }
  dbNetUpdateBanner();
  return !DB_NET.saveError;
}

if (typeof DB_ACT !== 'undefined') {
  DB_ACT.syncOfflineDrafts = () => dbNetSyncNow();
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('offline', () => {
    clearTimeout(DB_NET.hideTimer);
    DB_NET.online = false;
    DB_NET.syncing = false;
    DB_NET.syncedNotice = false;
    dbNetUpdateBanner();
  });
  window.addEventListener('online', () => {
    const wasDegraded = !DB_NET.online || DB_NET.saveError || dbNetPendingCount() > 0;
    DB_NET.online = true;
    if (wasDegraded) {
      dbNetSyncNow().catch(() => {});
    } else {
      dbNetUpdateBanner();
    }
  });
}
