/* EducMind · js/db/16-live.js
   Realtime cho chuông thông báo: lắng nghe Firestore onSnapshot theo thông báo của người dùng;
   khi có thông báo mới hoặc cập nhật thì chuông tự làm mới, có polling dự phòng nếu mất kết nối. */

const DB_LIVE_POLL_MS = 10000;
const DB_LIVE = { unsub: null, poll: null, subscribed: false };

function dbLiveStart() {
  dbLiveStop();
  if (!dbActive() || !DB.me) return;
  DB_LIVE.poll = setInterval(dbLoadNotifications, DB_LIVE_POLL_MS);
  try {
    if (typeof FirebaseRuntime === 'undefined' || !FirebaseRuntime || !firebaseDb) return;
    const { collection, query, where, onSnapshot } = FirebaseRuntime.firestoreApi;
    if (typeof onSnapshot !== 'function') return;
    const q = query(collection(firebaseDb, 'notifications'), where('user_id', '==', DB.me.id));
    DB_LIVE.unsub = onSnapshot(q, (snapshot) => {
      DB_LIVE.subscribed = true;
      if (DB_LIVE.poll) { clearInterval(DB_LIVE.poll); DB_LIVE.poll = null; }
      const list = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((n) => !n.deleted_at)
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
        .slice(0, 30);
      const before = DB.notifs.filter((n) => !n.is_read).length;
      const after = list.filter((n) => !n.is_read).length;
      DB.notifs = list;
      if (before !== after) dbPaintBell();
      if (DB.dialog && DB.dialog.title === 'Thông báo') dbShowNotifications();
    }, (err) => {
      DB_LIVE.subscribed = false;
      if (typeof handleFirestoreError === 'function') {
        handleFirestoreError(err, typeof OperationType !== 'undefined' ? OperationType.LIST : 'list', 'notifications');
      }
      if (!DB_LIVE.poll) DB_LIVE.poll = setInterval(dbLoadNotifications, DB_LIVE_POLL_MS);
    });
  } catch (e) {
    console.warn('Firestore Realtime không khả dụng, dùng chế độ tự nạp lại:', e.message || e);
    DB_LIVE.subscribed = false;
  }
}

function dbLiveStop() {
  if (DB_LIVE.unsub) {
    try { DB_LIVE.unsub(); } catch (_) { /* listener đã hủy */ }
    DB_LIVE.unsub = null;
  }
  if (DB_LIVE.poll) { clearInterval(DB_LIVE.poll); DB_LIVE.poll = null; }
  DB_LIVE.subscribed = false;
}
