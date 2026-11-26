/* EducMind · js/03-firebase.js
   Kết nối Firebase (Auth, Firestore, Storage) và EducMindDB (mọi lệnh đọc/ghi cơ sở dữ liệu).
   Toàn bộ suy luận AI chạy ở máy chủ Express (/api/ai/generate, /api/ai/chat) với Firebase ID token. */

const FirebaseRuntime = (typeof window !== 'undefined' && window.EducMindFirebase) || null;
const firebaseConfig = FirebaseRuntime ? FirebaseRuntime.firebaseConfig : null;
const firebaseAuth = FirebaseRuntime ? FirebaseRuntime.auth : null;
const firebaseDb = FirebaseRuntime ? FirebaseRuntime.db : null;
const firebaseStorage = FirebaseRuntime ? FirebaseRuntime.storage : null;

/* Ngưỡng cấu hình của khóa học (luyện tập thích ứng + chỉ số lớp học) và miền giá trị hợp lệ. */
const COURSE_CONFIG_NUMERIC = [
  'practice_weight', 'practice_unlock_min_official', 'practice_session_length',
  'practice_daily_scored_sessions', 'practice_max_share',
  'dash_reteach_share', 'dash_min_students', 'dash_advanced_threshold',
  'dash_inactive_days', 'dash_question_min_answers',
];
const COURSE_CONFIG_RANGE = {
  practice_weight: { min: 0, max: 0.95 },
  practice_unlock_min_official: { min: 0, max: 20 },
  practice_session_length: { min: 4, max: 40 },
  practice_daily_scored_sessions: { min: 1, max: 10 },
  practice_max_share: { min: 0, max: 0.95 },
  dash_reteach_share: { min: 0, max: 1 },
  dash_min_students: { min: 1, max: 200 },
  dash_advanced_threshold: { min: 0, max: 1 },
  dash_inactive_days: { min: 1, max: 365 },
  dash_question_min_answers: { min: 1, max: 200 },
};

const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
};

function handleFirestoreError(error, operationType, path) {
  const user = firebaseAuth ? firebaseAuth.currentUser : null;
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: user ? user.uid : undefined,
      email: user ? user.email : undefined,
      emailVerified: user ? user.emailVerified : undefined,
      isAnonymous: user ? user.isAnonymous : undefined,
      tenantId: user ? user.tenantId : undefined,
      providerInfo: user && Array.isArray(user.providerData)
        ? user.providerData.map((provider) => ({
            providerId: provider.providerId,
            displayName: provider.displayName,
            email: provider.email,
            photoUrl: provider.photoURL,
          }))
        : [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

async function testFirebaseConnection() {
  if (!FirebaseRuntime || !firebaseDb || !firebaseAuth || !firebaseAuth.currentUser) return;
  const { doc, getDocFromServer } = FirebaseRuntime.firestoreApi;
  try {
    await getDocFromServer(doc(firebaseDb, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && /the client is offline|unavailable/i.test(error.message)) {
      console.error('Please check your Firebase configuration. Client seems offline:', error.message);
    }
  }
}

/* backendBusy: đang chờ Firebase trả lời ở màn hình đăng nhập. backendRecovery: người dùng đang đặt lại mật khẩu. */
let backendBusy = false, backendRecovery = false;
if (FirebaseRuntime && firebaseAuth) {
  const { onAuthStateChanged } = FirebaseRuntime.authApi;
  onAuthStateChanged(firebaseAuth, (user) => {
    if (!user && typeof appReady !== 'undefined' && appReady && typeof logged !== 'undefined' && logged && sess && sess.backend) {
      if (typeof dbReset === 'function') dbReset();
      if (typeof dbClearRouteHash === 'function') dbClearRouteHash();
      logged = false;
      sess = null;
      role = 'T';
      authMode = 'login';
      authMsg = '';
      authErr = 'Phiên đăng nhập đã kết thúc. Hãy đăng nhập lại.';
      if (typeof render === 'function') render();
    }
  });
}

async function educMindSha256Hex(text) {
  const normalized = String(text || '').trim().toLowerCase();
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const EducMindDB = (() => {
  const nowIso = () => new Date().toISOString();
  const me = () => (typeof sess !== 'undefined' && sess && sess.userId) || (firebaseAuth && firebaseAuth.currentUser ? firebaseAuth.currentUser.uid : '');
  const isTeacherRole = () => (typeof DB !== 'undefined' && DB.me && DB.me.role === 'TEACHER') || (typeof role !== 'undefined' && role === 'T');
  const genId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().replace(/-/g, '');
    }
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  };
  const genJoinCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    const arr = new Uint8Array(8);
    crypto.getRandomValues(arr);
    for (let i = 0; i < arr.length; i++) out += chars[arr[i] % chars.length];
    return out;
  };
  const api = () => FirebaseRuntime.firestoreApi;
  const stApi = () => FirebaseRuntime.storageApi;

  const docData = (snap) => (snap && snap.exists() ? { id: snap.id, ...snap.data() } : null);
  const docsData = (snap) => (snap ? snap.docs.map((d) => ({ id: d.id, ...d.data() })) : []);

  async function getFreshIdToken(forceRefresh = false) {
    const user = firebaseAuth && firebaseAuth.currentUser;
    if (!user) throw new Error('JWT expired');
    return await user.getIdToken(forceRefresh);
  }

  /* Gọi API máy chủ kèm ID token.
     Token được gửi ở header Authorization, header riêng X-EducMind-Token và (chỉ với request có
     phần thân) trường auth_token trong thân JSON. Lý do: một số proxy/khung nhúng chuyển tiếp thân
     request nhưng bỏ header Authorization. GET/HEAD không bao giờ có phần thân (trình duyệt chặn:
     "Request with GET/HEAD method cannot have body").
     Không dùng cookie nên không có nguy cơ CSRF; máy chủ vẫn kiểm tra Origin/Referer cho request
     có token trong thân (xem callerToken trong server.js). */
  async function apiRequest(method, url, body, retried) {
    const verb = String(method || 'GET').toUpperCase();
    const allowsBody = verb !== 'GET' && verb !== 'HEAD';
    const hasBody = allowsBody && body !== undefined && body !== null;
    let token;
    try {
      token = await getFreshIdToken(!!retried);
    } catch (tokenErr) {
      token = '';
      if (!retried) token = await getFreshIdToken(true).catch(() => '');
      if (!token) {
        const err = new Error('Phiên đăng nhập đã hết hạn. Hãy tải lại trang và đăng nhập lại.');
        err.status = 401;
        err.details = { code: 'AUTH_REQUIRED', error: err.message, cause: tokenErr && tokenErr.message };
        throw err;
      }
    }
    if (!token) {
      const err = new Error('Phiên đăng nhập đã hết hạn. Hãy tải lại trang và đăng nhập lại.');
      err.status = 401;
      err.details = { code: 'AUTH_REQUIRED', error: err.message };
      throw err;
    }

    const send = async (tk) => {
      const headers = { Authorization: 'Bearer ' + tk, 'X-EducMind-Token': 'Bearer ' + tk };
      if (hasBody) headers['Content-Type'] = 'application/json';
      const res = await fetch(url, {
        method: verb,
        headers,
        ...(hasBody ? { body: JSON.stringify({ ...body, auth_token: tk }) } : {}),
      });
      let payload = null;
      try { payload = await res.json(); } catch (_) { payload = null; }
      return { res, payload };
    };

    let { res, payload } = await send(token);
    /* 401 vì máy chủ không nhận được thông tin đăng nhập: làm mới token rồi thử lại đúng một lần. */
    if (res.status === 401 && !retried && payload && payload.code === 'AUTH_REQUIRED') {
      retried = true;
      const fresh = await getFreshIdToken(true);
      ({ res, payload } = await send(fresh));
    }
    if (!res.ok) {
      const msg = (payload && (payload.error || payload.message)) || ('HTTP ' + res.status);
      const err = new Error(msg);
      err.status = res.status;
      err.details = payload;
      throw err;
    }
    return payload;
  }

  /* Gọi API máy chủ có kèm ID token, không ném lỗi: dùng cho các form nhỏ
     (Quản lý API key Gemini) để tự hiển thị thông báo lỗi tại chỗ. */
  async function apiFetch(method, url, body) {
    try {
      const payload = await apiRequest(method, url, body);
      return { data: payload, error: null };
    } catch (err) {
      return {
        data: null,
        error: {
          message: err instanceof Error ? err.message : 'Không kết nối được máy chủ.',
          code: (err && err.details && err.details.code) || '',
          status: (err && err.status) || 0,
        },
      };
    }
  }

  async function safeWrap(fn, opType = OperationType.GET, path = '') {
    try {
      const data = await fn();
      return { data, error: null };
    } catch (error) {
      if (path && error && /permission-denied|PERMISSION_DENIED|Missing or insufficient permissions/i.test(error.message || error.code || '')) {
        handleFirestoreError(error, opType, path);
      }
      return {
        data: null,
        error: {
          message: error && error.message ? error.message : String(error),
          code: (error && error.code) || '',
          details: error && error.details,
        },
      };
    }
  }

  async function getById(colName, id) {
    if (!id) return null;
    const { doc, getDoc } = api();
    try {
      const snap = await getDoc(doc(firebaseDb, colName, String(id)));
      return docData(snap);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `${colName}/${id}`);
      throw error;
    }
  }

  async function getByIds(colName, ids) {
    const uniq = [...new Set((ids || []).filter(Boolean).map(String))];
    if (!uniq.length) return [];
    const results = [];
    for (let i = 0; i < uniq.length; i += 25) {
      const chunk = uniq.slice(i, i + 25);
      const batch = await Promise.all(chunk.map((id) => getById(colName, id).catch((e) => {
        if (/permission-denied/i.test(e?.code || e?.message || '')) return null;
        throw e;
      })));
      for (const item of batch) if (item) results.push(item);
    }
    return results;
  }

  async function queryByField(colName, field, value) {
    const { collection, query, where, getDocs } = api();
    try {
      const snap = await getDocs(query(collection(firebaseDb, colName), where(field, '==', value)));
      return docsData(snap);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, colName);
      throw error;
    }
  }

  async function resolveCourseMeta(courseId) {
    const course = await getById('courses', courseId);
    if (!course) throw new Error('Không tìm thấy khóa học.');
    return course;
  }

  async function resolveClassForCourseOrItem(courseId) {
    const course = await getById('courses', courseId);
    return course ? { class_id: course.class_id, teacher_id: course.teacher_id } : { class_id: courseId, teacher_id: me() };
  }

  async function updateClassIndex(classId, field, addIds = [], removeIds = []) {
    if (!classId || !field) return;
    const { doc, updateDoc, setDoc, serverTimestamp, arrayUnion, arrayRemove } = api();
    const ref = doc(firebaseDb, 'class_indexes', classId);
    const existing = await getById('class_indexes', classId);
    const ts = serverTimestamp();
    if (!existing) {
      const initial = {
        id: classId,
        class_id: classId,
        teacher_id: me(),
        topic_ids: [],
        lesson_ids: [],
        objective_ids: [],
        resource_ids: [],
        assignment_ids: [],
        assessment_ids: [],
        question_ids: [],
        criterion_ids: [],
        createdAt: ts,
        updatedAt: ts,
      };
      if (addIds.length) initial[field] = [...new Set(addIds)];
      await setDoc(ref, initial);
      return;
    }
    const patch = { updatedAt: ts };
    if (addIds.length) patch[field] = arrayUnion(...addIds);
    else if (removeIds.length) patch[field] = arrayRemove(...removeIds);
    else return;
    await updateDoc(ref, patch);
  }

  async function getClassIndexIds(classId, field) {
    const idx = await getById('class_indexes', classId);
    if (!idx || !Array.isArray(idx[field])) return [];
    return idx[field];
  }

  /* Mỗi học sinh chỉ thuộc MỘT lớp của một giáo viên (mỗi môn học).
     Trả về lớp khác của cùng giáo viên mà học sinh đang thuộc, hoặc null.
     Học sinh đọc được class_members của chính mình; giáo viên đọc được thành viên các lớp mình dạy. */
  async function membershipInOtherClass(studentId, teacherId, exceptClassId) {
    if (!studentId || !teacherId) return null;
    const rows = teacherId === me()
      ? await queryByField('class_members', 'teacher_id', teacherId).catch(() => [])
      : await queryByField('class_members', 'student_id', studentId).catch(() => []);
    const hit = rows.find((m) => m && m.student_id === studentId && m.teacher_id === teacherId && m.class_id !== exceptClassId);
    if (!hit) return null;
    const cls = await getById('classes', hit.class_id).catch(() => null);
    return { class_id: hit.class_id, name: (cls && cls.name) || '' };
  }

  async function recordRevision(classId, teacherId, entityType, entityId, action, beforeState, afterState) {
    if (!classId || teacherId !== me()) return;
    const { doc, setDoc, serverTimestamp } = api();
    const id = genId();
    const ts = serverTimestamp();
    await setDoc(doc(firebaseDb, 'content_revisions', id), {
      id,
      class_id: classId,
      teacher_id: teacherId,
      entity_type: entityType,
      entity_id: String(entityId),
      action,
      actor_id: me(),
      before_state: beforeState || null,
      after_state: afterState || null,
      created_at: nowIso(),
      createdAt: ts,
      updatedAt: ts,
    }).catch(() => {});
  }

  async function createNotificationForUser(userId, type, title, content, payload) {
    if (!userId) return;
    const { doc, setDoc, serverTimestamp } = api();
    const id = genId();
    const ts = serverTimestamp();
    await setDoc(doc(firebaseDb, 'notifications', id), {
      id,
      user_id: userId,
      actor_id: me(),
      type,
      title: String(title || '').slice(0, 300),
      content: String(content || '').slice(0, 1000),
      is_read: false,
      payload: payload || null,
      read_at: null,
      deleted_at: null,
      created_at: nowIso(),
      createdAt: ts,
      updatedAt: ts,
    }).catch(() => {});
  }

  async function notifyClassStudents(classId, type, title, content, payload) {
    const members = (await queryByField('class_members', 'teacher_id', me())).filter((m) => m.class_id === classId);
    await Promise.all(members.map((m) => createNotificationForUser(m.student_id, type, title, content, payload)));
  }

  /* ===== Auto-grading helper (mirrors Postgres auto_grade_answer & game scoring) ===== */
  const normText = (s) => String(s == null ? '' : s).normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

  function gradeQuestionAnswer(question, answer, weight) {
    const w = Number(weight || 0);
    if (!question) return null;
    const kind = question.kind;
    if (!['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_IN_BLANK', 'MATCHING'].includes(kind)) return null;
    if (answer == null || answer === '') return 0;
    const key = question.correct_answer;
    if (key == null) return null;
    let ok = false;
    if (kind === 'SINGLE_CHOICE') {
      ok = Number(answer) === Number(key);
    } else if (kind === 'TRUE_FALSE') {
      const aBool = answer === true || String(answer).toLowerCase() === 'true';
      const kBool = key === true || String(key).toLowerCase() === 'true';
      ok = aBool === kBool;
    } else if (kind === 'MULTIPLE_CHOICE') {
      const kSet = new Set([].concat(key).map(Number));
      const aSet = new Set(Array.isArray(answer) ? answer.map(Number) : [Number(answer)]);
      ok = kSet.size > 0 && kSet.size === aSet.size && [...kSet].every((x) => aSet.has(x));
    } else if (kind === 'FILL_IN_BLANK') {
      const kArr = Array.isArray(key) ? key : [key];
      const aArr = Array.isArray(answer) ? answer : [];
      ok = kArr.length > 0 && kArr.every((kVal, i) => normText(aArr[i]) !== '' && normText(aArr[i]) === normText(kVal));
    } else if (kind === 'MATCHING') {
      const kArr = Array.isArray(key) ? key.map(Number) : [];
      const aArr = Array.isArray(answer) ? answer : [];
      ok = kArr.length > 0 && kArr.every((kVal, i) => aArr[i] != null && Number(aArr[i]) === kVal);
    }
    return ok ? w : 0;
  }

  async function updateLearningFromSource({ classId, teacherId, studentId, objectiveIds, sourceType, sourceId, normalizedScore, assessmentId }) {
    const uniqObjs = [...new Set((objectiveIds || []).filter(Boolean))];
    if (!uniqObjs.length || !classId || !teacherId || !studentId) return;
    const scoreVal = Math.max(0, Math.min(1, Number(normalizedScore || 0)));
    const { doc, setDoc, updateDoc, deleteDoc, serverTimestamp } = api();
    const obsAt = nowIso();
    const isTeacher = me() === teacherId;

    const existingEvidence = (await queryByField('learning_evidence', isTeacher ? 'teacher_id' : 'student_id', me()))
      .filter((e) => e.student_id === studentId && e.class_id === classId);

    for (const oid of uniqObjs) {
      const ts = serverTimestamp();
      const matchingOld = existingEvidence.filter((e) => e.objective_id === oid && e.source_type === sourceType && e.source_id === sourceId);
      if (isTeacher && matchingOld.length) {
        await Promise.all(matchingOld.map((e) => deleteDoc(doc(firebaseDb, 'learning_evidence', e.id)).catch(() => {})));
      }
      const evId = isTeacher
        ? `${sourceType}_${sourceId}_${studentId}_${oid}`.slice(0, 128)
        : `${sourceType}_${sourceId}_${studentId}_${oid}_${Date.now()}`.slice(0, 128);
      await setDoc(doc(firebaseDb, 'learning_evidence', evId), {
        id: evId,
        class_id: classId,
        teacher_id: teacherId,
        student_id: studentId,
        objective_id: oid,
        source_type: sourceType,
        source_id: String(sourceId),
        score: scoreVal,
        observed_at: obsAt,
        createdAt: ts,
        updatedAt: ts,
      });

      const refreshed = [
        ...existingEvidence.filter((e) => e.objective_id === oid && !(isTeacher && e.source_type === sourceType && e.source_id === sourceId) && e.id !== evId),
        { id: evId, student_id: studentId, objective_id: oid, score: scoreVal, observed_at: obsAt },
      ];
      const count = refreshed.length;
      const mean = count ? refreshed.reduce((s, e) => s + Number(e.score || 0), 0) / count : scoreVal;

      const masteryId = `${studentId}_${oid}`.slice(0, 128);
      const existingMastery = await getById('mastery', masteryId).catch(() => null);
      if (existingMastery) {
        await updateDoc(doc(firebaseDb, 'mastery', masteryId), {
          mastery_score: mean,
          evidence_count: count,
          updated_at: obsAt,
          updatedAt: ts,
        });
      } else {
        await setDoc(doc(firebaseDb, 'mastery', masteryId), {
          id: masteryId,
          class_id: classId,
          teacher_id: teacherId,
          student_id: studentId,
          objective_id: oid,
          mastery_score: mean,
          evidence_count: count,
          updated_at: obsAt,
          createdAt: ts,
          updatedAt: ts,
        });
      }

      const gapId = `${studentId}_${oid}`.slice(0, 128);
      const existingGap = await getById('knowledge_gaps', gapId).catch(() => null);
      if (count >= 2 && mean < 0.5) {
        const reason = `Mức nắm vững đạt ${Math.round(mean * 100)}% sau ${count} kết quả.`;
        if (!existingGap) {
          await setDoc(doc(firebaseDb, 'knowledge_gaps', gapId), {
            id: gapId,
            class_id: classId,
            teacher_id: teacherId,
            student_id: studentId,
            objective_id: oid,
            status: 'OPEN',
            reason,
            dismiss_reason: null,
            opened_at: obsAt,
            resolved_at: null,
            dismissed_at: null,
            createdAt: ts,
            updatedAt: ts,
          });
        } else if (isTeacher && existingGap.status === 'RESOLVED') {
          await updateDoc(doc(firebaseDb, 'knowledge_gaps', gapId), {
            status: 'OPEN',
            reason,
            resolved_at: null,
            updatedAt: ts,
          });
        }
      } else if (existingGap && existingGap.status === 'OPEN' && mean >= 0.65) {
        await updateDoc(doc(firebaseDb, 'knowledge_gaps', gapId), {
          status: 'RESOLVED',
          reason: `Đã cải thiện lên ${Math.round(mean * 100)}%.`,
          resolved_at: obsAt,
          updatedAt: ts,
        });
      }

      if (mean < 0.65) {
        const recId = `rec_${studentId}_${oid}`.slice(0, 128);
        const existingRec = await getById('recommendations', recId).catch(() => null);
        if (!existingRec) {
          await setDoc(doc(firebaseDb, 'recommendations', recId), {
            id: recId,
            class_id: classId,
            teacher_id: teacherId,
            student_id: studentId,
            objective_id: oid,
            assessment_id: assessmentId || null,
            kind: mean < 0.4 ? 'REVIEW_CONTENT' : 'TARGETED_PRACTICE',
            reason: `Mức nắm vững mục tiêu hiện đạt ${Math.round(mean * 100)}%. Hãy ôn tập thêm.`,
            status: 'ACTIVE',
            created_at: obsAt,
            responded_at: null,
            createdAt: ts,
            updatedAt: ts,
          });
        }
      }
    }
  }

  async function firebaseStorageUpload(path, file, contentType, onProgress) {
    const { ref, uploadBytesResumable } = stApi();
    const storageRef = ref(firebaseStorage, path);
    const metadata = { contentType: contentType || file.type || 'application/octet-stream' };
    return await new Promise((resolve) => {
      const task = uploadBytesResumable(storageRef, file, metadata);
      task.on(
        'state_changed',
        (snapshot) => {
          if (onProgress) onProgress(snapshot.bytesTransferred, snapshot.totalBytes);
        },
        (error) => resolve({ data: null, error: { message: error.message || String(error) } }),
        () => resolve({ data: { path }, error: null }),
      );
    });
  }

  async function firebaseStorageDelete(path) {
    if (!path) return { data: null, error: null };
    const { ref, deleteObject } = stApi();
    try {
      await deleteObject(ref(firebaseStorage, path));
      return { data: { path }, error: null };
    } catch (error) {
      if (error && error.code === 'storage/object-not-found') return { data: null, error: null };
      return { data: null, error: { message: error.message || String(error) } };
    }
  }

  async function firebaseStorageUrl(path) {
    const { ref, getDownloadURL } = stApi();
    try {
      const signedUrl = await getDownloadURL(ref(firebaseStorage, path));
      return { data: { signedUrl }, error: null };
    } catch (error) {
      return { data: null, error: { message: error.message || String(error) } };
    }
  }

  async function finalizeAttemptInternal(attemptId, allowBeforeExpiry = false) {
    const { doc, updateDoc, serverTimestamp } = api();
    const attempt = await getById('assessment_attempts', attemptId);
    if (!attempt) throw new Error('Attempt not found');
    if (attempt.status !== 'IN_PROGRESS') return attempt;

    const assessment = await getById('assessments', attempt.assessment_id);
    if (!assessment) throw new Error('Assessment not found');
    if (!allowBeforeExpiry) {
      const endsMs = Math.min(
        new Date(attempt.started_at).getTime() + Number(assessment.duration_minutes) * 60000,
        new Date(assessment.close_at).getTime(),
      );
      if (Date.now() + ((typeof DB !== 'undefined' && DB.clockSkew) || 0) < endsMs - 2000) {
        return attempt;
      }
    }

    const aq = await getByIds('assessment_questions', (assessment.question_ids || []).map((qid) => `${assessment.id}_${qid}`));
    const qs = await getByIds('questions', aq.map((x) => x.question_id));
    const qById = Object.fromEntries(qs.map((q) => [q.id, q]));
    const myAnswers = (await queryByField('submission_answers', me() === attempt.teacher_id ? 'teacher_id' : 'student_id', me()))
      .filter((a) => a.attempt_id === attempt.id);
    const ansByQ = Object.fromEntries(myAnswers.map((a) => [a.question_id, a]));

    let totalScore = 0;
    let maxTotal = 0;
    let allGraded = aq.length > 0;
    const tsNow = nowIso();

    for (const link of aq) {
      const q = qById[link.question_id];
      const weight = Number(link.weight || 0);
      maxTotal += weight;
      const ansDoc = ansByQ[link.question_id];
      const computed = q ? gradeQuestionAnswer(q, ansDoc ? ansDoc.answer_content : null, weight) : null;
      if (computed != null) {
        totalScore += computed;
        if (ansDoc && ansDoc.score !== computed) {
          await updateDoc(doc(firebaseDb, 'submission_answers', ansDoc.id), {
            answer_content: ansDoc.answer_content == null ? null : ansDoc.answer_content,
            score: computed,
            graded_at: tsNow,
            updatedAt: serverTimestamp(),
          });
        }
      } else {
        if (ansDoc && ansDoc.score != null) totalScore += Number(ansDoc.score);
        else allGraded = false;
      }
    }

    const nextStatus = allGraded ? 'GRADED' : 'SUBMITTED';
    const patch = {
      status: nextStatus,
      submitted_at: tsNow,
      graded_at: allGraded ? tsNow : null,
      total_score: allGraded ? totalScore : null,
      updatedAt: serverTimestamp(),
    };
    await updateDoc(doc(firebaseDb, 'assessment_attempts', attempt.id), patch);

    if (allGraded && maxTotal > 0) {
      const objIds = [...new Set(qs.flatMap((q) => q.objective_ids || []))];
      await updateLearningFromSource({
        classId: attempt.class_id,
        teacherId: attempt.teacher_id,
        studentId: attempt.student_id,
        objectiveIds: objIds,
        sourceType: 'ASSESSMENT',
        sourceId: attempt.assessment_id,
        normalizedScore: totalScore / maxTotal,
        assessmentId: attempt.assessment_id,
      }).catch(() => {});
    }

    return { ...attempt, ...patch };
  }

  return {
    /* ----- Giờ máy chủ ----- */
    serverNow: () => safeWrap(async () => {
      const res = await fetch('/api/server-now');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      return json.now;
    }),

    /* ----- Hồ sơ ----- */
    getProfile: (id) => safeWrap(() => getById('profiles', id), OperationType.GET, `profiles/${id}`),
    listProfiles: (ids) => safeWrap(() => getByIds('profiles', ids), OperationType.GET, 'profiles'),
    renameMe: (fullName) => safeWrap(async () => {
      const { doc, updateDoc, serverTimestamp } = api();
      const uid = me();
      await updateDoc(doc(firebaseDb, 'profiles', uid), { full_name: fullName, updatedAt: serverTimestamp() });
      return await getById('profiles', uid);
    }, OperationType.UPDATE, 'profiles'),

    /* ----- Lớp học ----- */
    listClasses: () => safeWrap(async () => {
      const uid = me();
      if (isTeacherRole()) {
        return (await queryByField('classes', 'owner_teacher_id', uid))
          .filter((c) => !c.deleted_at)
          .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      }
      const [members, links] = await Promise.all([
        queryByField('class_members', 'student_id', uid),
        queryByField('student_teachers', 'student_id', uid).catch(() => []),
      ]);
      const classes = await getByIds('classes', members.map((m) => m.class_id));
      /* Học sinh chỉ học MỘT lớp cho mỗi giáo viên: dữ liệu cũ (nhiều lớp cùng một giáo viên) được gộp về một lớp. */
      const onePerTeacher = typeof dbOneClassPerTeacher === 'function'
        ? dbOneClassPerTeacher(classes, members, links)
        : classes.filter((c) => !c.deleted_at);
      return onePerTeacher.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    }, OperationType.LIST, 'classes'),

    listArchivedClasses: () => safeWrap(async () => {
      return (await queryByField('classes', 'owner_teacher_id', me()))
        .filter((c) => !!c.deleted_at)
        .sort((a, b) => String(b.deleted_at || '').localeCompare(String(a.deleted_at || '')));
    }, OperationType.LIST, 'classes'),

    createClassWithSubject: (name, grade, year, subject) => safeWrap(async () => {
      const { doc, setDoc, writeBatch, serverTimestamp } = api();
      const uid = me();
      const classId = genId();
      const inviteId = genId();
      const code = genJoinCode();
      const tsNow = nowIso();

      await setDoc(doc(firebaseDb, 'classes', classId), {
        id: classId,
        name: String(name).trim(),
        grade: grade ? Number(grade) : null,
        school_year: year ? String(year).trim() : null,
        owner_teacher_id: uid,
        created_at: tsNow,
        deleted_at: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const batch = writeBatch(firebaseDb);
      const ts2 = serverTimestamp();
      batch.set(doc(firebaseDb, 'courses', classId), {
        id: classId,
        class_id: classId,
        teacher_id: uid,
        title: String(subject || 'Tin học').trim(),
        description: '',
        sequential_unlock: false,
        created_at: tsNow,
        deleted_at: null,
        createdAt: ts2,
        updatedAt: ts2,
      });
      batch.set(doc(firebaseDb, 'class_invites', inviteId), {
        id: inviteId,
        class_id: classId,
        teacher_id: uid,
        code,
        created_at: tsNow,
        expires_at: null,
        revoked_at: null,
        createdAt: ts2,
        updatedAt: ts2,
      });
      batch.set(doc(firebaseDb, 'class_invite_codes', code), {
        code,
        invite_id: inviteId,
        class_id: classId,
        teacher_id: uid,
        revoked_at: null,
        expires_at: null,
        createdAt: ts2,
        updatedAt: ts2,
      });
      batch.set(doc(firebaseDb, 'class_indexes', classId), {
        id: classId,
        class_id: classId,
        teacher_id: uid,
        topic_ids: [],
        lesson_ids: [],
        objective_ids: [],
        resource_ids: [],
        assignment_ids: [],
        assessment_ids: [],
        question_ids: [],
        criterion_ids: [],
        createdAt: ts2,
        updatedAt: ts2,
      });
      await batch.commit();
      return [{ class_id: classId, join_code: code }];
    }, OperationType.CREATE, 'classes'),

    createClass: (name, grade, year) => EducMindDB.createClassWithSubject(name, grade, year, grade ? `Tin học ${grade}` : 'Tin học'),

    updateClassWithSubject: (id, row) => safeWrap(async () => {
      const { doc, writeBatch, serverTimestamp } = api();
      const batch = writeBatch(firebaseDb);
      const ts = serverTimestamp();
      batch.update(doc(firebaseDb, 'classes', id), {
        name: String(row.name).trim(),
        grade: row.grade ? Number(row.grade) : null,
        school_year: row.school_year ? String(row.school_year).trim() : null,
        updatedAt: ts,
      });
      if (row.subject) {
        batch.update(doc(firebaseDb, 'courses', id), {
          title: String(row.subject).trim(),
          updatedAt: ts,
        });
      }
      await batch.commit();
      return await getById('classes', id);
    }, OperationType.UPDATE, `classes/${id}`),

    updateClass: (id, row) => safeWrap(async () => {
      const { doc, updateDoc, serverTimestamp } = api();
      const patch = { updatedAt: serverTimestamp() };
      if ('name' in row) patch.name = row.name;
      if ('grade' in row) patch.grade = row.grade;
      if ('school_year' in row) patch.school_year = row.school_year;
      await updateDoc(doc(firebaseDb, 'classes', id), patch);
      return await getById('classes', id);
    }, OperationType.UPDATE, `classes/${id}`),

    archiveClass: (id) => safeWrap(async () => {
      const { doc, updateDoc, serverTimestamp } = api();
      await updateDoc(doc(firebaseDb, 'classes', id), { deleted_at: nowIso(), updatedAt: serverTimestamp() });
      return [{ id }];
    }, OperationType.UPDATE, `classes/${id}`),

    restoreClass: (id) => safeWrap(async () => {
      const { doc, updateDoc, serverTimestamp } = api();
      await updateDoc(doc(firebaseDb, 'classes', id), { deleted_at: null, updatedAt: serverTimestamp() });
      return [{ id }];
    }, OperationType.UPDATE, `classes/${id}`),

    joinClass: (code) => safeWrap(async () => {
      const uid = me();
      if (isTeacherRole()) throw new Error('Only students can join a class');
      const cleanCode = String(code || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{6,12}$/.test(cleanCode)) throw new Error('Invalid or expired class code');
      const invite = await getById('class_invite_codes', cleanCode);
      if (!invite || invite.revoked_at || (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now())) {
        throw new Error('Invalid or expired class code');
      }
      const { class_id: classId, teacher_id: teacherId } = invite;
      const memberId = `${classId}_${uid}`;
      const existingMember = await getById('class_members', memberId).catch(() => null);
      if (existingMember) return classId;

      /* Học sinh đã ở một lớp khác của cùng giáo viên: không cho tự chuyển lớp. */
      const other = await membershipInOtherClass(uid, teacherId, classId);
      if (other) {
        throw new Error('Em đã ở lớp “' + (other.name || 'khác') + '” của giáo viên này. Mỗi học sinh chỉ học một lớp cho mỗi môn học — hãy liên hệ giáo viên nếu cần chuyển lớp.');
      }

      const tsId = `${teacherId}_${uid}`;
      const stId = `${uid}_${teacherId}`;
      const [hasTs, hasSt] = await Promise.all([
        getById('teacher_students', tsId).catch(() => null),
        getById('student_teachers', stId).catch(() => null),
      ]);

      const { doc, writeBatch, serverTimestamp } = api();
      const batch = writeBatch(firebaseDb);
      const ts = serverTimestamp();
      if (hasTs) batch.update(doc(firebaseDb, 'teacher_students', tsId), { class_id: classId, updatedAt: ts });
      else batch.set(doc(firebaseDb, 'teacher_students', tsId), { id: tsId, teacher_id: teacherId, student_id: uid, class_id: classId, createdAt: ts, updatedAt: ts });

      if (hasSt) batch.update(doc(firebaseDb, 'student_teachers', stId), { class_id: classId, updatedAt: ts });
      else batch.set(doc(firebaseDb, 'student_teachers', stId), { id: stId, teacher_id: teacherId, student_id: uid, class_id: classId, createdAt: ts, updatedAt: ts });

      batch.set(doc(firebaseDb, 'class_members', memberId), {
        id: memberId,
        class_id: classId,
        student_id: uid,
        teacher_id: teacherId,
        joined_at: nowIso(),
        createdAt: ts,
        updatedAt: ts,
      });
      await batch.commit();
      return classId;
    }, OperationType.CREATE, 'class_members'),

    listInvites: (classIds) => safeWrap(async () => {
      const set = new Set(classIds || []);
      return (await queryByField('class_invites', 'teacher_id', me()))
        .filter((i) => set.has(i.class_id))
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    }, OperationType.LIST, 'class_invites'),

    listMembers: (classIds) => safeWrap(async () => {
      const set = new Set(classIds || []);
      const field = isTeacherRole() ? 'teacher_id' : 'student_id';
      return (await queryByField('class_members', field, me()))
        .filter((m) => set.has(m.class_id))
        .sort((a, b) => String(a.joined_at || '').localeCompare(String(b.joined_at || '')));
    }, OperationType.LIST, 'class_members'),

    addStudentByEmail: (classId, email) => safeWrap(async () => {
      const emailHash = await educMindSha256Hex(email);
      const idx = await getById('email_index', emailHash);
      if (!idx) return 'NOT_FOUND';
      if (idx.role !== 'STUDENT') return 'NOT_A_STUDENT';
      const studentId = idx.user_id;
      const teacherId = me();
      const memberId = `${classId}_${studentId}`;
      const existingMember = await getById('class_members', memberId).catch(() => null);
      if (existingMember) return 'ALREADY_MEMBER';

      /* Một học sinh chỉ học một lớp cho mỗi giáo viên: giáo viên phải gỡ khỏi lớp cũ trước khi thêm vào lớp khác. */
      const other = await membershipInOtherClass(studentId, teacherId, classId);
      if (other) return 'ALREADY_IN_OTHER_CLASS:' + String(other.name || '');

      const tsId = `${teacherId}_${studentId}`;
      const stId = `${studentId}_${teacherId}`;
      const [hasTs, hasSt] = await Promise.all([
        getById('teacher_students', tsId).catch(() => null),
        getById('student_teachers', stId).catch(() => null),
      ]);

      const { doc, writeBatch, serverTimestamp } = api();
      const batch = writeBatch(firebaseDb);
      const ts = serverTimestamp();
      if (hasTs) batch.update(doc(firebaseDb, 'teacher_students', tsId), { class_id: classId, updatedAt: ts });
      else batch.set(doc(firebaseDb, 'teacher_students', tsId), { id: tsId, teacher_id: teacherId, student_id: studentId, class_id: classId, createdAt: ts, updatedAt: ts });

      if (hasSt) batch.update(doc(firebaseDb, 'student_teachers', stId), { class_id: classId, updatedAt: ts });
      else batch.set(doc(firebaseDb, 'student_teachers', stId), { id: stId, teacher_id: teacherId, student_id: studentId, class_id: classId, createdAt: ts, updatedAt: ts });

      batch.set(doc(firebaseDb, 'class_members', memberId), {
        id: memberId,
        class_id: classId,
        student_id: studentId,
        teacher_id: teacherId,
        joined_at: nowIso(),
        createdAt: ts,
        updatedAt: ts,
      });
      await batch.commit();
      return 'ADDED';
    }, OperationType.CREATE, 'class_members'),

    removeMember: (classId, studentId) => safeWrap(async () => {
      const teacherId = me();
      const memberId = `${classId}_${studentId}`;
      const { doc, writeBatch, deleteDoc } = api();
      await deleteDoc(doc(firebaseDb, 'class_members', memberId));
      const remaining = (await queryByField('class_members', 'teacher_id', teacherId))
        .filter((m) => m.student_id === studentId && m.class_id !== classId);
      if (!remaining.length) {
        const batch = writeBatch(firebaseDb);
        batch.delete(doc(firebaseDb, 'teacher_students', `${teacherId}_${studentId}`));
        batch.delete(doc(firebaseDb, 'student_teachers', `${studentId}_${teacherId}`));
        await batch.commit();
      }
      return [{ student_id: studentId }];
    }, OperationType.DELETE, 'class_members'),

    regenClassCode: (classId) => safeWrap(async () => {
      const teacherId = me();
      const oldInvites = (await queryByField('class_invites', 'teacher_id', teacherId))
        .filter((i) => i.class_id === classId && !i.revoked_at);
      const { doc, writeBatch, serverTimestamp } = api();
      const batch = writeBatch(firebaseDb);
      const tsNow = nowIso();
      const ts = serverTimestamp();

      for (const inv of oldInvites) {
        batch.update(doc(firebaseDb, 'class_invites', inv.id), { revoked_at: tsNow, updatedAt: ts });
        batch.update(doc(firebaseDb, 'class_invite_codes', inv.code), { revoked_at: tsNow, updatedAt: ts });
      }
      const newInviteId = genId();
      const code = genJoinCode();
      batch.set(doc(firebaseDb, 'class_invites', newInviteId), {
        id: newInviteId,
        class_id: classId,
        teacher_id: teacherId,
        code,
        created_at: tsNow,
        expires_at: null,
        revoked_at: null,
        createdAt: ts,
        updatedAt: ts,
      });
      batch.set(doc(firebaseDb, 'class_invite_codes', code), {
        code,
        invite_id: newInviteId,
        class_id: classId,
        teacher_id: teacherId,
        revoked_at: null,
        expires_at: null,
        createdAt: ts,
        updatedAt: ts,
      });
      await batch.commit();
      return code;
    }, OperationType.WRITE, 'class_invites'),

    createStudentAccount: () => Promise.resolve({
      data: null,
      error: { message: 'Vui lòng gửi Mã lớp cho học sinh để các em tự đăng nhập Google hoặc tạo tài khoản và tham gia lớp.' },
    }),

    /* ----- Khóa học ----- */
    listCourses: (classId) => safeWrap(async () => {
      const c = await getById('courses', classId);
      if (c && !c.deleted_at) return [c];
      if (isTeacherRole()) {
        return (await queryByField('courses', 'teacher_id', me())).filter((x) => x.class_id === classId && !x.deleted_at);
      }
      return [];
    }, OperationType.GET, `courses/${classId}`),

    listCoursesForClasses: (classIds) => safeWrap(async () => {
      const list = await getByIds('courses', classIds);
      return list.filter((c) => !c.deleted_at).sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
    }, OperationType.GET, 'courses'),

    createCourse: (row) => safeWrap(async () => {
      const { doc, setDoc, serverTimestamp } = api();
      const id = row.class_id;
      const ts = serverTimestamp();
      await setDoc(doc(firebaseDb, 'courses', id), {
        id,
        class_id: row.class_id,
        teacher_id: me(),
        title: String(row.title || 'Khóa học').trim(),
        description: row.description || '',
        sequential_unlock: !!row.sequential_unlock,
        created_at: nowIso(),
        deleted_at: null,
        createdAt: ts,
        updatedAt: ts,
      });
      return await getById('courses', id);
    }, OperationType.CREATE, 'courses'),

    updateCourse: (id, row) => safeWrap(async () => {
      const { doc, updateDoc, serverTimestamp } = api();
      const patch = { updatedAt: serverTimestamp() };
      for (const k of ['title', 'description', 'sequential_unlock', 'deleted_at']) {
        if (k in row) patch[k] = row[k];
      }
      /* Ngưỡng cấu hình: trước đây bị bỏ qua nên nút "Lưu" ở phần cài đặt không ghi được gì. */
      for (const k of COURSE_CONFIG_NUMERIC) {
        if (!(k in row)) continue;
        const v = Number(row[k]);
        if (!Number.isFinite(v)) continue;
        const r = COURSE_CONFIG_RANGE[k];
        patch[k] = Math.min(r.max, Math.max(r.min, v));
      }
      await updateDoc(doc(firebaseDb, 'courses', id), patch);
      return await getById('courses', id);
    }, OperationType.UPDATE, `courses/${id}`),

    /* ----- Chủ đề, bài học, mục tiêu ----- */
    listTopics: (courseId) => safeWrap(async () => {
      const list = isTeacherRole()
        ? (await queryByField('course_topics', 'teacher_id', me())).filter((x) => x.course_id === courseId)
        : await getByIds('course_topics', await getClassIndexIds(courseId, 'topic_ids'));
      return list.filter((x) => !x.deleted_at)
        .sort((a, b) => (Number(a.display_order || 0) - Number(b.display_order || 0)) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
    }, OperationType.LIST, 'course_topics'),

    createTopic: (row) => safeWrap(async () => {
      const { doc, setDoc, serverTimestamp } = api();
      const meta = await resolveCourseMeta(row.course_id);
      const id = genId();
      const ts = serverTimestamp();
      await setDoc(doc(firebaseDb, 'course_topics', id), {
        id,
        class_id: meta.class_id,
        teacher_id: meta.teacher_id,
        course_id: row.course_id,
        title: row.title,
        description: row.description || '',
        display_order: Number(row.display_order || 1),
        status: row.status || 'PUBLISHED',
        created_at: nowIso(),
        deleted_at: null,
        createdAt: ts,
        updatedAt: ts,
      });
      await updateClassIndex(meta.class_id, 'topic_ids', [id]);
      await recordRevision(meta.class_id, meta.teacher_id, 'course_topic', id, 'CREATE', null, { title: row.title });
      return await getById('course_topics', id);
    }, OperationType.CREATE, 'course_topics'),

    updateTopic: (id, row) => safeWrap(async () => {
      const { doc, updateDoc, serverTimestamp } = api();
      const before = await getById('course_topics', id);
      const patch = { updatedAt: serverTimestamp() };
      for (const k of ['title', 'description', 'display_order', 'status', 'deleted_at']) {
        if (k in row) patch[k] = row[k];
      }
      await updateDoc(doc(firebaseDb, 'course_topics', id), patch);
      if (before) await recordRevision(before.class_id, before.teacher_id, 'course_topic', id, row.deleted_at ? 'SOFT_DELETE' : 'UPDATE', { title: before.title, status: before.status }, row);
      return await getById('course_topics', id);
    }, OperationType.UPDATE, `course_topics/${id}`),

    listLessons: (courseId) => safeWrap(async () => {
      const list = isTeacherRole()
        ? (await queryByField('lessons', 'teacher_id', me())).filter((x) => x.course_id === courseId)
        : await getByIds('lessons', await getClassIndexIds(courseId, 'lesson_ids'));
      return list.filter((x) => !x.deleted_at)
        .sort((a, b) => (Number(a.display_order || 0) - Number(b.display_order || 0)) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
    }, OperationType.LIST, 'lessons'),

    createLesson: (row) => safeWrap(async () => {
      const { doc, setDoc, serverTimestamp } = api();
      const meta = await resolveCourseMeta(row.course_id);
      const id = genId();
      const ts = serverTimestamp();
      await setDoc(doc(firebaseDb, 'lessons', id), {
        id,
        class_id: meta.class_id,
        teacher_id: meta.teacher_id,
        course_id: row.course_id,
        topic_id: row.topic_id || null,
        title: row.title,
        description: row.description || '',
        display_order: Number(row.display_order || 1),
        status: row.status || 'DRAFT',
        created_at: nowIso(),
        deleted_at: null,
        createdAt: ts,
        updatedAt: ts,
      });
      await updateClassIndex(meta.class_id, 'lesson_ids', [id]);
      await recordRevision(meta.class_id, meta.teacher_id, 'lesson', id, 'CREATE', null, { title: row.title });
      return await getById('lessons', id);
    }, OperationType.CREATE, 'lessons'),

    updateLesson: (id, row) => safeWrap(async () => {
      const { doc, updateDoc, serverTimestamp } = api();
      const before = await getById('lessons', id);
      const patch = { updatedAt: serverTimestamp() };
      for (const k of ['topic_id', 'title', 'description', 'display_order', 'status', 'deleted_at']) {
        if (k in row) patch[k] = row[k];
      }
      await updateDoc(doc(firebaseDb, 'lessons', id), patch);
      if (before) await recordRevision(before.class_id, before.teacher_id, 'lesson', id, row.deleted_at ? 'SOFT_DELETE' : 'UPDATE', { title: before.title, status: before.status }, row);
      return await getById('lessons', id);
    }, OperationType.UPDATE, `lessons/${id}`),

    listObjectives: (lessonIds) => safeWrap(async () => {
      const set = new Set(lessonIds || []);
      if (!set.size) return [];
      const classId = (typeof DB !== 'undefined' && DB.classId) || '';
      const list = isTeacherRole()
        ? await queryByField('learning_objectives', 'teacher_id', me())
        : (classId ? await getByIds('learning_objectives', await getClassIndexIds(classId, 'objective_ids')) : []);
      return list.filter((o) => set.has(o.lesson_id)).sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));
    }, OperationType.LIST, 'learning_objectives'),

    createObjective: (row) => safeWrap(async () => {
      const { doc, setDoc, serverTimestamp } = api();
      const lesson = await getById('lessons', row.lesson_id);
      if (!lesson) throw new Error('Không tìm thấy bài học.');
      const id = genId();
      const ts = serverTimestamp();
      await setDoc(doc(firebaseDb, 'learning_objectives', id), {
        id,
        class_id: lesson.class_id,
        teacher_id: lesson.teacher_id,
        course_id: lesson.course_id,
        lesson_id: row.lesson_id,
        code: row.code,
        description: row.description,
        createdAt: ts,
        updatedAt: ts,
      });
      await updateClassIndex(lesson.class_id, 'objective_ids', [id]);
      return await getById('learning_objectives', id);
    }, OperationType.CREATE, 'learning_objectives'),

    updateObjective: (id, row) => safeWrap(async () => {
      const { doc, updateDoc, serverTimestamp } = api();
      const patch = { updatedAt: serverTimestamp() };
      if ('code' in row) patch.code = row.code;
      if ('description' in row) patch.description = row.description;
      await updateDoc(doc(firebaseDb, 'learning_objectives', id), patch);
      return await getById('learning_objectives', id);
    }, OperationType.UPDATE, `learning_objectives/${id}`),

    deleteObjective: (id) => safeWrap(async () => {
      const { doc, deleteDoc } = api();
      const obj = await getById('learning_objectives', id);
      await deleteDoc(doc(firebaseDb, 'learning_objectives', id));
      if (obj) await updateClassIndex(obj.class_id, 'objective_ids', [], [id]).catch(() => {});
      return [{ id }];
    }, OperationType.DELETE, `learning_objectives/${id}`),

    /* ----- Tài liệu đính kèm bài học ----- */
    listResources: (courseId) => safeWrap(async () => {
      const list = isTeacherRole()
        ? (await queryByField('resources', 'teacher_id', me())).filter((x) => x.course_id === courseId)
        : await getByIds('resources', await getClassIndexIds(courseId, 'resource_ids'));
      return list.filter((x) => !x.deleted_at)
        .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
    }, OperationType.LIST, 'resources'),

    createResource: (row) => safeWrap(async () => {
      const { doc, setDoc, serverTimestamp } = api();
      const meta = await resolveCourseMeta(row.course_id);
      const id = genId();
      const ts = serverTimestamp();
      await setDoc(doc(firebaseDb, 'resources', id), {
        id,
        class_id: meta.class_id,
        teacher_id: meta.teacher_id,
        course_id: row.course_id,
        lesson_id: row.lesson_id,
        kind: row.kind || 'FILE',
        url: row.url || null,
        file_name: row.file_name || null,
        storage_path: row.storage_path || null,
        file_size_bytes: row.file_size_bytes != null ? Number(row.file_size_bytes) : null,
        mime_type: row.mime_type || null,
        created_at: nowIso(),
        deleted_at: null,
        createdAt: ts,
        updatedAt: ts,
      });
      await updateClassIndex(meta.class_id, 'resource_ids', [id]);
      return await getById('resources', id);
    }, OperationType.CREATE, 'resources'),

    deleteResource: (id) => safeWrap(async () => {
      const { doc, deleteDoc } = api();
      const resDoc = await getById('resources', id);
      await deleteDoc(doc(firebaseDb, 'resources', id));
      if (resDoc) await updateClassIndex(resDoc.class_id, 'resource_ids', [], [id]).catch(() => {});
      return [{ id, storage_path: resDoc ? resDoc.storage_path : null }];
    }, OperationType.DELETE, `resources/${id}`),

    uploadResourceFile: (path, file, contentType, onProgress) => firebaseStorageUpload('educmind-resources/' + path, file, contentType, onProgress),
    removeResourceFile: (path) => firebaseStorageDelete('educmind-resources/' + path),
    resourceFileUrl: (path) => firebaseStorageUrl('educmind-resources/' + path),

    uploadSubmissionFile: (path, file, onProgress) => firebaseStorageUpload('educmind-submissions/' + path, file, file.type, onProgress),
    removeSubmissionFile: (path) => firebaseStorageDelete('educmind-submissions/' + path),
    submissionFileUrl: (path) => firebaseStorageUrl('educmind-submissions/' + path),

    /* ----- Bài tập và bài nộp ----- */
    listAssignments: (courseId) => safeWrap(async () => {
      const list = isTeacherRole()
        ? (await queryByField('assignments', 'teacher_id', me())).filter((x) => x.course_id === courseId)
        : await getByIds('assignments', await getClassIndexIds(courseId, 'assignment_ids'));
      return list.filter((x) => !x.deleted_at)
        .sort((a, b) => String(a.due_at || '').localeCompare(String(b.due_at || '')));
    }, OperationType.LIST, 'assignments'),

    createAssignment: (row) => safeWrap(async () => {
      const { doc, setDoc, serverTimestamp } = api();
      const meta = await resolveCourseMeta(row.course_id);
      const id = genId();
      const ts = serverTimestamp();
      await setDoc(doc(firebaseDb, 'assignments', id), {
        id,
        class_id: meta.class_id,
        teacher_id: meta.teacher_id,
        created_by: me(),
        course_id: row.course_id,
        topic_id: row.topic_id || null,
        lesson_id: row.lesson_id || null,
        title: row.title,
        description: row.description || '',
        due_at: row.due_at || null,
        allow_late: !!row.allow_late,
        late_close_at: row.late_close_at || null,
        max_score: Number(row.max_score || 10),
        /* Công tắc cho học sinh dùng Trợ lý AI khi làm bài này (mặc định bật). */
        student_ai_enabled: row.student_ai_enabled !== false,
        status: row.status || 'DRAFT',
        objective_ids: [],
        question_ids: [],
        created_at: nowIso(),
        deleted_at: null,
        createdAt: ts,
        updatedAt: ts,
      });
      await updateClassIndex(meta.class_id, 'assignment_ids', [id]);
      await recordRevision(meta.class_id, meta.teacher_id, 'assignment', id, 'CREATE', null, { title: row.title });
      return await getById('assignments', id);
    }, OperationType.CREATE, 'assignments'),

    updateAssignment: (id, row) => safeWrap(async () => {
      const { doc, updateDoc, serverTimestamp } = api();
      const before = await getById('assignments', id);
      const patch = { updatedAt: serverTimestamp() };
      for (const k of ['topic_id', 'lesson_id', 'title', 'description', 'due_at', 'allow_late', 'late_close_at', 'max_score', 'student_ai_enabled', 'status', 'deleted_at']) {
        if (k in row) patch[k] = row[k];
      }
      await updateDoc(doc(firebaseDb, 'assignments', id), patch);
      if (before) {
        await recordRevision(before.class_id, before.teacher_id, 'assignment', id, row.deleted_at ? 'SOFT_DELETE' : 'UPDATE', { title: before.title, status: before.status }, row);
        if (before.status !== 'PUBLISHED' && row.status === 'PUBLISHED') {
          await notifyClassStudents(before.class_id, 'ASSIGNMENT_PUBLISHED', `Bài tập mới: ${before.title}`, `Hạn nộp: ${before.due_at || ''}`, { page: 'assignments', id, class_id: before.class_id });
        }
      }
      return await getById('assignments', id);
    }, OperationType.UPDATE, `assignments/${id}`),

    listAssignmentObjectives: (assignmentIds) => safeWrap(async () => {
      const set = new Set(assignmentIds || []);
      if (!set.size) return [];
      if (isTeacherRole()) {
        return (await queryByField('assignment_objectives', 'teacher_id', me())).filter((x) => set.has(x.assignment_id));
      }
      const asgs = await getByIds('assignments', [...set]);
      return asgs.flatMap((a) => (a.objective_ids || []).map((oid) => ({ assignment_id: a.id, objective_id: oid })));
    }, OperationType.LIST, 'assignment_objectives'),

    addAssignmentObjectives: (rows) => safeWrap(async () => {
      if (!rows || !rows.length) return [];
      const { doc, writeBatch, serverTimestamp, arrayUnion } = api();
      const byAsg = {};
      for (const r of rows) (byAsg[r.assignment_id] = byAsg[r.assignment_id] || []).push(r.objective_id);
      const asgs = await getByIds('assignments', Object.keys(byAsg));
      const asgById = Object.fromEntries(asgs.map((a) => [a.id, a]));
      const batch = writeBatch(firebaseDb);
      const ts = serverTimestamp();
      const created = [];
      for (const r of rows) {
        const a = asgById[r.assignment_id];
        if (!a) continue;
        const id = `${r.assignment_id}_${r.objective_id}`;
        const item = {
          id,
          class_id: a.class_id,
          teacher_id: a.teacher_id,
          assignment_id: r.assignment_id,
          objective_id: r.objective_id,
          createdAt: ts,
          updatedAt: ts,
        };
        batch.set(doc(firebaseDb, 'assignment_objectives', id), item);
        created.push(item);
      }
      for (const [aid, oids] of Object.entries(byAsg)) {
        batch.update(doc(firebaseDb, 'assignments', aid), { objective_ids: arrayUnion(...oids), updatedAt: ts });
      }
      await batch.commit();
      return created;
    }, OperationType.CREATE, 'assignment_objectives'),

    removeAssignmentObjectives: (assignmentId, objectiveIds) => safeWrap(async () => {
      if (!objectiveIds || !objectiveIds.length) return [];
      const { doc, writeBatch, serverTimestamp, arrayRemove } = api();
      const batch = writeBatch(firebaseDb);
      for (const oid of objectiveIds) {
        batch.delete(doc(firebaseDb, 'assignment_objectives', `${assignmentId}_${oid}`));
      }
      batch.update(doc(firebaseDb, 'assignments', assignmentId), {
        objective_ids: arrayRemove(...objectiveIds),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return objectiveIds.map((objective_id) => ({ assignment_id: assignmentId, objective_id }));
    }, OperationType.DELETE, 'assignment_objectives'),

    listSubmissions: (assignmentIds) => safeWrap(async () => {
      const set = new Set(assignmentIds || []);
      const field = isTeacherRole() ? 'teacher_id' : 'student_id';
      return (await queryByField('assignment_submissions', field, me()))
        .filter((s) => set.has(s.assignment_id) && !s.deleted_at);
    }, OperationType.LIST, 'assignment_submissions'),

    submitAssignment: (row) => safeWrap(async () => {
      const a = await getById('assignments', row.assignment_id);
      if (!a || a.deleted_at || a.status !== 'PUBLISHED') throw new Error('Assignment unavailable');
      const dueMs = new Date(a.due_at).getTime();
      const lateMs = a.late_close_at ? new Date(a.late_close_at).getTime() : 0;
      const nowMs = Date.now() + ((typeof DB !== 'undefined' && DB.clockSkew) || 0);
      const validWindow = nowMs <= dueMs ? 'OPEN' : (a.allow_late && lateMs && nowMs <= lateMs ? 'LATE' : 'CLOSED');
      if (validWindow === 'CLOSED') throw new Error('Late submission is not allowed');
      if ((validWindow === 'OPEN' && row.status !== 'SUBMITTED') || (validWindow === 'LATE' && row.status !== 'LATE')) {
        throw new Error('Submission status is not valid for current time');
      }
      const uid = me();
      const subId = `${a.id}_${uid}`;
      const existing = await getById('assignment_submissions', subId).catch(() => null);
      const hasQs = Array.isArray(a.question_ids) && a.question_ids.length > 0;
      const { doc, setDoc, updateDoc, serverTimestamp } = api();
      const ts = serverTimestamp();
      const tsNow = nowIso();
      if (existing) {
        if (existing.status === 'GRADED') throw new Error('Students cannot change grades');
        await updateDoc(doc(firebaseDb, 'assignment_submissions', subId), {
          text_content: row.text_content || '',
          storage_path: row.storage_path || null,
          file_name: row.file_name || null,
          status: row.status,
          is_edited: true,
          submitted_at: tsNow,
          question_grading_enabled: hasQs,
          updatedAt: ts,
        });
      } else {
        await setDoc(doc(firebaseDb, 'assignment_submissions', subId), {
          id: subId,
          class_id: a.class_id,
          teacher_id: a.teacher_id,
          assignment_id: a.id,
          student_id: uid,
          text_content: row.text_content || '',
          storage_path: row.storage_path || null,
          file_name: row.file_name || null,
          status: row.status,
          score: null,
          feedback: null,
          graded_by: null,
          graded_at: null,
          is_edited: false,
          question_grading_enabled: hasQs,
          submitted_at: tsNow,
          deleted_at: null,
          createdAt: ts,
          updatedAt: ts,
        });
      }
      return await getById('assignment_submissions', subId);
    }, OperationType.WRITE, 'assignment_submissions'),

    deleteUngradedSubmission: (submissionId) => safeWrap(async () => {
      const sub = await getById('assignment_submissions', submissionId);
      if (!sub) return null;
      const ans = (await queryByField('assignment_submission_answers', 'student_id', me())).filter((x) => x.submission_id === submissionId);
      const { doc, writeBatch } = api();
      const batch = writeBatch(firebaseDb);
      for (const a of ans) batch.delete(doc(firebaseDb, 'assignment_submission_answers', a.id));
      batch.delete(doc(firebaseDb, 'assignment_submissions', submissionId));
      await batch.commit();
      return { id: submissionId };
    }, OperationType.DELETE, `assignment_submissions/${submissionId}`),

    gradeSubmission: (id, row) => safeWrap(async () => {
      const sub = await getById('assignment_submissions', id);
      if (!sub) throw new Error('Submission not found');
      const a = await getById('assignments', sub.assignment_id);
      const { doc, updateDoc, serverTimestamp } = api();
      const tsNow = nowIso();
      await updateDoc(doc(firebaseDb, 'assignment_submissions', id), {
        score: Number(row.score),
        feedback: row.feedback || '',
        status: 'GRADED',
        graded_by: me(),
        graded_at: tsNow,
        updatedAt: serverTimestamp(),
      });
      if (a && Number(a.max_score) > 0 && Array.isArray(a.objective_ids) && a.objective_ids.length) {
        await updateLearningFromSource({
          classId: sub.class_id,
          teacherId: sub.teacher_id,
          studentId: sub.student_id,
          objectiveIds: a.objective_ids,
          sourceType: 'ASSIGNMENT',
          sourceId: a.id,
          normalizedScore: Number(row.score) / Number(a.max_score),
        }).catch(() => {});
      }
      if (a) {
        await createNotificationForUser(sub.student_id, 'ASSIGNMENT_GRADED', `Đã chấm bài: ${a.title}`, `Điểm: ${row.score}/${a.max_score}`, { page: 'assignments', id: a.id, class_id: a.class_id });
      }
      return await getById('assignment_submissions', id);
    }, OperationType.UPDATE, `assignment_submissions/${id}`),

    listAssignmentQuestions: (assignmentIds) => safeWrap(async () => {
      const set = new Set(assignmentIds || []);
      if (!set.size) return [];
      const list = isTeacherRole()
        ? (await queryByField('assignment_questions', 'teacher_id', me())).filter((x) => set.has(x.assignment_id))
        : (await getByIds('assignments', [...set])).flatMap((a) => (a.question_ids || []).map((qid) => `${a.id}_${qid}`))
          .reduce((acc, p) => (acc.push(p), acc), []);
      const resolved = isTeacherRole() ? list : await getByIds('assignment_questions', list);
      return resolved.sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0));
    }, OperationType.LIST, 'assignment_questions'),

    addAssignmentQuestions: (rows) => safeWrap(async () => {
      if (!rows || !rows.length) return [];
      const asgId = rows[0].assignment_id;
      const a = await getById('assignments', asgId);
      if (!a) throw new Error('Assignment not found');
      const existing = (await queryByField('assignment_questions', 'teacher_id', me())).filter((x) => x.assignment_id === asgId);
      const { doc, writeBatch, serverTimestamp, arrayUnion } = api();
      const batch = writeBatch(firebaseDb);
      const ts = serverTimestamp();

      const totalCount = existing.length + rows.length;
      const equalWeight = totalCount ? Math.round((Number(a.max_score || 10) / totalCount) * 100) / 100 : 1;
      for (const ex of existing) {
        batch.update(doc(firebaseDb, 'assignment_questions', ex.id), { weight: equalWeight, updatedAt: ts });
      }
      const addedIds = [];
      const created = [];
      rows.forEach((r, idx) => {
        const id = `${asgId}_${r.question_id}`;
        const w = idx === rows.length - 1 && totalCount > 0
          ? Math.round((Number(a.max_score || 10) - equalWeight * (totalCount - 1)) * 100) / 100
          : equalWeight;
        const item = {
          id,
          class_id: a.class_id,
          teacher_id: a.teacher_id,
          assignment_id: asgId,
          question_id: r.question_id,
          display_order: Number(r.display_order || existing.length + idx + 1),
          weight: r.weight != null ? Number(r.weight) : w,
          createdAt: ts,
          updatedAt: ts,
        };
        batch.set(doc(firebaseDb, 'assignment_questions', id), item);
        addedIds.push(r.question_id);
        created.push(item);
      });
      batch.update(doc(firebaseDb, 'assignments', asgId), { question_ids: arrayUnion(...addedIds), updatedAt: ts });
      await batch.commit();
      return created;
    }, OperationType.CREATE, 'assignment_questions'),

    updateAssignmentQuestion: (assignmentId, questionId, row) => safeWrap(async () => {
      const id = `${assignmentId}_${questionId}`;
      const { doc, updateDoc, serverTimestamp } = api();
      const patch = { updatedAt: serverTimestamp() };
      if ('weight' in row) patch.weight = Number(row.weight);
      if ('display_order' in row) patch.display_order = Number(row.display_order);
      await updateDoc(doc(firebaseDb, 'assignment_questions', id), patch);
      return [await getById('assignment_questions', id)];
    }, OperationType.UPDATE, `assignment_questions/${assignmentId}_${questionId}`),

    removeAssignmentQuestion: (assignmentId, questionId) => safeWrap(async () => {
      const id = `${assignmentId}_${questionId}`;
      const { doc, writeBatch, serverTimestamp, arrayRemove } = api();
      const batch = writeBatch(firebaseDb);
      batch.delete(doc(firebaseDb, 'assignment_questions', id));
      batch.update(doc(firebaseDb, 'assignments', assignmentId), { question_ids: arrayRemove(questionId), updatedAt: serverTimestamp() });
      await batch.commit();
      return [{ assignment_id: assignmentId, question_id: questionId }];
    }, OperationType.DELETE, `assignment_questions/${id}`),

    listAssignmentQuestionDetails: (courseId) => safeWrap(async () => {
      return (await queryByField('questions', 'teacher_id', me())).filter((q) => q.course_id === courseId);
    }, OperationType.LIST, 'questions'),

    listAssignmentAnswers: (submissionIds) => safeWrap(async () => {
      const set = new Set(submissionIds || []);
      if (!set.size) return [];
      const field = isTeacherRole() ? 'teacher_id' : 'student_id';
      const answers = (await queryByField('assignment_submission_answers', field, me()))
        .filter((a) => set.has(a.submission_id));
      if (isTeacherRole() && answers.some((a) => a.score == null)) {
        const subs = await getByIds('assignment_submissions', [...set]);
        const asgIds = [...new Set(subs.map((s) => s.assignment_id))];
        const asgs = await getByIds('assignments', asgIds);
        const aqLinks = (await queryByField('assignment_questions', 'teacher_id', me())).filter((x) => asgIds.includes(x.assignment_id));
        const qs = await getByIds('questions', aqLinks.map((x) => x.question_id));
        const qById = Object.fromEntries(qs.map((q) => [q.id, q]));
        const wByKey = Object.fromEntries(aqLinks.map((x) => [`${x.assignment_id}_${x.question_id}`, Number(x.weight || 0)]));
        const subById = Object.fromEntries(subs.map((s) => [s.id, s]));
        const { doc, updateDoc, serverTimestamp } = api();
        const tsNow = nowIso();
        for (const ans of answers) {
          const s = subById[ans.submission_id];
          if (!s || !s.question_grading_enabled || ans.score != null) continue;
          const q = qById[ans.question_id];
          const w = wByKey[`${s.assignment_id}_${ans.question_id}`] || 0;
          const autoScore = gradeQuestionAnswer(q, ans.answer_content, w);
          if (autoScore != null) {
            await updateDoc(doc(firebaseDb, 'assignment_submission_answers', ans.id), {
              score: autoScore,
              graded_by: me(),
              graded_at: tsNow,
              updatedAt: serverTimestamp(),
            }).catch(() => {});
            ans.score = autoScore;
            ans.graded_by = me();
            ans.graded_at = tsNow;
          }
        }
        for (const s of subs) {
          if (!s.question_grading_enabled || s.status === 'GRADED') continue;
          const links = aqLinks.filter((l) => l.assignment_id === s.assignment_id);
          if (!links.length) continue;
          const sAns = Object.fromEntries(answers.filter((x) => x.submission_id === s.id).map((x) => [x.question_id, x]));
          if (links.every((l) => sAns[l.question_id] && sAns[l.question_id].score != null)) {
            const total = links.reduce((sum, l) => sum + Number(sAns[l.question_id].score || 0), 0);
            const a = asgs.find((x) => x.id === s.assignment_id);
            await updateDoc(doc(firebaseDb, 'assignment_submissions', s.id), {
              score: total,
              status: 'GRADED',
              graded_by: me(),
              graded_at: tsNow,
              updatedAt: serverTimestamp(),
            }).catch(() => {});
            if (a && Number(a.max_score) > 0 && Array.isArray(a.objective_ids) && a.objective_ids.length) {
              await updateLearningFromSource({
                classId: s.class_id,
                teacherId: s.teacher_id,
                studentId: s.student_id,
                objectiveIds: a.objective_ids,
                sourceType: 'ASSIGNMENT',
                sourceId: a.id,
                normalizedScore: total / Number(a.max_score),
              }).catch(() => {});
            }
          }
        }
      }
      return answers;
    }, OperationType.LIST, 'assignment_submission_answers'),

    saveAssignmentAnswers: (rows) => safeWrap(async () => {
      if (!rows || !rows.length) return [];
      const subId = rows[0].submission_id;
      const sub = await getById('assignment_submissions', subId);
      if (!sub) throw new Error('Submission not found');
      const { doc, writeBatch, serverTimestamp } = api();
      const batch = writeBatch(firebaseDb);
      const ts = serverTimestamp();
      const existingIds = new Set(
        (await queryByField('assignment_submission_answers', 'student_id', me()))
          .filter((a) => a.submission_id === subId)
          .map((a) => a.id),
      );
      const out = [];
      for (const r of rows) {
        const id = `${r.submission_id}_${r.question_id}`;
        const val = r.answer_content === undefined ? null : r.answer_content;
        if (existingIds.has(id)) {
          batch.update(doc(firebaseDb, 'assignment_submission_answers', id), {
            answer_content: val,
            updatedAt: ts,
          });
        } else {
          batch.set(doc(firebaseDb, 'assignment_submission_answers', id), {
            id,
            class_id: sub.class_id,
            teacher_id: sub.teacher_id,
            submission_id: r.submission_id,
            student_id: me(),
            question_id: r.question_id,
            answer_content: val,
            score: null,
            feedback: null,
            graded_by: null,
            graded_at: null,
            createdAt: ts,
            updatedAt: ts,
          });
        }
        out.push({ id, submission_id: r.submission_id, question_id: r.question_id, answer_content: val });
      }
      await batch.commit();
      return out;
    }, OperationType.WRITE, 'assignment_submission_answers'),

    gradeAssignmentAnswer: (submissionId, questionId, score, feedback) => safeWrap(async () => {
      const sub = await getById('assignment_submissions', submissionId);
      if (!sub) throw new Error('Submission not found');
      const a = await getById('assignments', sub.assignment_id);
      const id = `${submissionId}_${questionId}`;
      const { doc, updateDoc, serverTimestamp } = api();
      const tsNow = nowIso();
      await updateDoc(doc(firebaseDb, 'assignment_submission_answers', id), {
        score: Number(score),
        feedback: feedback || '',
        graded_by: me(),
        graded_at: tsNow,
        updatedAt: serverTimestamp(),
      });
      const links = (await queryByField('assignment_questions', 'teacher_id', me())).filter((x) => x.assignment_id === sub.assignment_id);
      const answers = (await queryByField('assignment_submission_answers', 'teacher_id', me())).filter((x) => x.submission_id === submissionId);
      const ansMap = Object.fromEntries(answers.map((x) => [x.question_id, x]));
      if (links.length && links.every((l) => ansMap[l.question_id] && ansMap[l.question_id].score != null)) {
        const total = links.reduce((sum, l) => sum + Number(ansMap[l.question_id].score || 0), 0);
        await updateDoc(doc(firebaseDb, 'assignment_submissions', submissionId), {
          score: total,
          status: 'GRADED',
          graded_by: me(),
          graded_at: tsNow,
          question_grading_enabled: true,
          updatedAt: serverTimestamp(),
        });
        if (a && Number(a.max_score) > 0 && Array.isArray(a.objective_ids) && a.objective_ids.length) {
          await updateLearningFromSource({
            classId: sub.class_id,
            teacherId: sub.teacher_id,
            studentId: sub.student_id,
            objectiveIds: a.objective_ids,
            sourceType: 'ASSIGNMENT',
            sourceId: a.id,
            normalizedScore: total / Number(a.max_score),
          }).catch(() => {});
        }
        if (a) {
          await createNotificationForUser(sub.student_id, 'ASSIGNMENT_GRADED', `Đã chấm bài: ${a.title}`, `Điểm: ${total}/${a.max_score}`, { page: 'assignments', id: a.id, class_id: a.class_id });
        }
      }
      return { id, score };
    }, OperationType.UPDATE, `assignment_submission_answers/${submissionId}_${questionId}`),

    getAssignmentQuestions: (assignmentId) => safeWrap(async () => {
      const a = await getById('assignments', assignmentId);
      if (!a || !Array.isArray(a.question_ids) || !a.question_ids.length) return [];
      const [links, qs] = await Promise.all([
        getByIds('assignment_questions', a.question_ids.map((qid) => `${assignmentId}_${qid}`)),
        getByIds('questions', a.question_ids),
      ]);
      const qById = Object.fromEntries(qs.map((q) => [q.id, q]));
      return links.sort((x, y) => Number(x.display_order || 0) - Number(y.display_order || 0)).map((l) => {
        const q = qById[l.question_id];
        if (!q) return null;
        return {
          question_id: q.id,
          content: q.content,
          kind: q.kind,
          options: q.options || null,
          weight: Number(l.weight || 0),
          display_order: Number(l.display_order || 0),
        };
      }).filter(Boolean);
    }, OperationType.GET, 'assignment_questions'),

    /* ----- Rubric ----- */
    listRubricCriteria: (assignmentIds) => safeWrap(async () => {
      const set = new Set(assignmentIds || []);
      if (!set.size) return [];
      const classId = (typeof DB !== 'undefined' && DB.classId) || '';
      const list = isTeacherRole()
        ? await queryByField('rubric_criteria', 'teacher_id', me())
        : (classId ? await getByIds('rubric_criteria', await getClassIndexIds(classId, 'criterion_ids')) : []);
      return list.filter((c) => set.has(c.assignment_id))
        .sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0));
    }, OperationType.LIST, 'rubric_criteria'),

    createRubricCriterion: (row) => safeWrap(async () => {
      const a = await getById('assignments', row.assignment_id);
      if (!a) throw new Error('Assignment not found');
      const { doc, setDoc, serverTimestamp } = api();
      const id = genId();
      const ts = serverTimestamp();
      await setDoc(doc(firebaseDb, 'rubric_criteria', id), {
        id,
        class_id: a.class_id,
        teacher_id: a.teacher_id,
        assignment_id: a.id,
        title: row.title,
        description: row.description || '',
        max_score: Number(row.max_score),
        display_order: Number(row.display_order || 1),
        createdAt: ts,
        updatedAt: ts,
      });
      await updateClassIndex(a.class_id, 'criterion_ids', [id]);
      return await getById('rubric_criteria', id);
    }, OperationType.CREATE, 'rubric_criteria'),

    updateRubricCriterion: (id, row) => safeWrap(async () => {
      const { doc, updateDoc, serverTimestamp } = api();
      const patch = { updatedAt: serverTimestamp() };
      for (const k of ['title', 'description', 'max_score', 'display_order']) {
        if (k in row) patch[k] = row[k];
      }
      await updateDoc(doc(firebaseDb, 'rubric_criteria', id), patch);
      return await getById('rubric_criteria', id);
    }, OperationType.UPDATE, `rubric_criteria/${id}`),

    deleteRubricCriterion: (id) => safeWrap(async () => {
      const { doc, deleteDoc } = api();
      const c = await getById('rubric_criteria', id);
      await deleteDoc(doc(firebaseDb, 'rubric_criteria', id));
      if (c) await updateClassIndex(c.class_id, 'criterion_ids', [], [id]).catch(() => {});
      return [{ id }];
    }, OperationType.DELETE, `rubric_criteria/${id}`),

    listRubricScores: (submissionIds) => safeWrap(async () => {
      const set = new Set(submissionIds || []);
      if (!set.size) return [];
      const field = isTeacherRole() ? 'teacher_id' : 'student_id';
      return (await queryByField('rubric_scores', field, me())).filter((x) => set.has(x.submission_id));
    }, OperationType.LIST, 'rubric_scores'),

    saveRubricScores: (rows) => safeWrap(async () => {
      if (!rows || !rows.length) return [];
      const sub = await getById('assignment_submissions', rows[0].submission_id);
      if (!sub) throw new Error('Submission not found');
      const { doc, writeBatch, serverTimestamp } = api();
      const batch = writeBatch(firebaseDb);
      const ts = serverTimestamp();
      const tsNow = nowIso();
      const existing = new Set((await queryByField('rubric_scores', 'teacher_id', me())).map((x) => x.id));
      for (const r of rows) {
        const id = `${r.submission_id}_${r.criterion_id}`;
        if (existing.has(id)) {
          batch.update(doc(firebaseDb, 'rubric_scores', id), {
            score: Number(r.score),
            feedback: r.feedback || '',
            graded_by: me(),
            updated_at: tsNow,
            updatedAt: ts,
          });
        } else {
          batch.set(doc(firebaseDb, 'rubric_scores', id), {
            id,
            class_id: sub.class_id,
            teacher_id: sub.teacher_id,
            submission_id: r.submission_id,
            student_id: sub.student_id,
            criterion_id: r.criterion_id,
            score: Number(r.score),
            feedback: r.feedback || '',
            graded_by: me(),
            updated_at: tsNow,
            createdAt: ts,
            updatedAt: ts,
          });
        }
      }
      await batch.commit();
      return rows;
    }, OperationType.WRITE, 'rubric_scores'),

    /* ----- Thùng rác ----- */
    listDeletedTopics: (courseId) => safeWrap(async () => {
      return (await queryByField('course_topics', 'teacher_id', me())).filter((x) => x.course_id === courseId && !!x.deleted_at);
    }, OperationType.LIST, 'course_topics'),

    listDeletedLessons: (courseId) => safeWrap(async () => {
      return (await queryByField('lessons', 'teacher_id', me())).filter((x) => x.course_id === courseId && !!x.deleted_at);
    }, OperationType.LIST, 'lessons'),

    listDeletedAssignments: (courseId) => safeWrap(async () => {
      return (await queryByField('assignments', 'teacher_id', me())).filter((x) => x.course_id === courseId && !!x.deleted_at);
    }, OperationType.LIST, 'assignments'),

    listDeletedAssignmentRows: (courseId) => safeWrap(async () => {
      const list = isTeacherRole()
        ? (await queryByField('assignments', 'teacher_id', me())).filter((x) => x.course_id === courseId)
        : await getByIds('assignments', await getClassIndexIds(courseId, 'assignment_ids'));
      return list.filter((x) => !!x.deleted_at);
    }, OperationType.LIST, 'assignments'),

    listDeletedAssessments: (courseId) => safeWrap(async () => {
      const list = isTeacherRole()
        ? (await queryByField('assessments', 'teacher_id', me())).filter((x) => x.course_id === courseId)
        : await getByIds('assessments', await getClassIndexIds(courseId, 'assessment_ids'));
      return list.filter((x) => !!x.deleted_at);
    }, OperationType.LIST, 'assessments'),

    listDeletedQuestions: (courseId) => safeWrap(async () => {
      return (await queryByField('questions', 'teacher_id', me())).filter((x) => x.course_id === courseId && !!x.deleted_at);
    }, OperationType.LIST, 'questions'),

    softDeleteTopic: (id) => safeWrap(async () => {
      const { doc, writeBatch, serverTimestamp } = api();
      const topic = await getById('course_topics', id);
      if (!topic) return [];
      const lessons = (await queryByField('lessons', 'teacher_id', me())).filter((l) => l.topic_id === id && !l.deleted_at);
      const batch = writeBatch(firebaseDb);
      const tsNow = nowIso();
      const ts = serverTimestamp();
      batch.update(doc(firebaseDb, 'course_topics', id), { deleted_at: tsNow, updatedAt: ts });
      for (const l of lessons) batch.update(doc(firebaseDb, 'lessons', l.id), { deleted_at: tsNow, updatedAt: ts });
      await batch.commit();
      return [{ id }];
    }, OperationType.UPDATE, `course_topics/${id}`),

    restoreTopic: (id) => safeWrap(async () => {
      const { doc, writeBatch, serverTimestamp } = api();
      const topic = await getById('course_topics', id);
      if (!topic) return [];
      const lessons = (await queryByField('lessons', 'teacher_id', me())).filter((l) => l.topic_id === id && !!l.deleted_at);
      const batch = writeBatch(firebaseDb);
      const ts = serverTimestamp();
      batch.update(doc(firebaseDb, 'course_topics', id), { deleted_at: null, updatedAt: ts });
      for (const l of lessons) batch.update(doc(firebaseDb, 'lessons', l.id), { deleted_at: null, updatedAt: ts });
      await batch.commit();
      return [{ id }];
    }, OperationType.UPDATE, `course_topics/${id}`),

    restoreLesson: (id) => safeWrap(async () => {
      const { doc, updateDoc, serverTimestamp } = api();
      await updateDoc(doc(firebaseDb, 'lessons', id), { deleted_at: null, updatedAt: serverTimestamp() });
      return [{ id }];
    }, OperationType.UPDATE, `lessons/${id}`),

    restoreAssignment: (id) => safeWrap(async () => {
      const { doc, updateDoc, serverTimestamp } = api();
      await updateDoc(doc(firebaseDb, 'assignments', id), { deleted_at: null, updatedAt: serverTimestamp() });
      return [{ id }];
    }, OperationType.UPDATE, `assignments/${id}`),

    restoreQuestion: (id) => safeWrap(async () => {
      const { doc, updateDoc, serverTimestamp } = api();
      await updateDoc(doc(firebaseDb, 'questions', id), { deleted_at: null, updatedAt: serverTimestamp() });
      return [{ id }];
    }, OperationType.UPDATE, `questions/${id}`),

    trashItemDependencies: (type, id) => safeWrap(async () => {
      const uid = me();
      const out = [];
      if (type === 'topic') {
        const lessons = (await queryByField('lessons', 'teacher_id', uid)).filter((l) => l.topic_id === id);
        if (lessons.length) out.push({ label: 'Bài học thuộc chủ đề', item_count: lessons.length, impact: 'Cần gỡ hoặc xóa các bài học này trước.', preserves_history: false });
      } else if (type === 'lesson') {
        const [objs, res, asgs, exs] = await Promise.all([
          queryByField('learning_objectives', 'teacher_id', uid),
          queryByField('resources', 'teacher_id', uid),
          queryByField('assignments', 'teacher_id', uid),
          queryByField('assessments', 'teacher_id', uid),
        ]);
        const oc = objs.filter((o) => o.lesson_id === id).length;
        const rc = res.filter((r) => r.lesson_id === id).length;
        const ac = asgs.filter((a) => a.lesson_id === id).length;
        const xc = exs.filter((e) => e.lesson_id === id).length;
        if (oc) out.push({ label: 'Mục tiêu học tập', item_count: oc, impact: 'Các mục tiêu đang gắn với bài học này.', preserves_history: true });
        if (rc) out.push({ label: 'Tài liệu đính kèm', item_count: rc, impact: 'Các tài liệu của bài học.', preserves_history: false });
        if (ac) out.push({ label: 'Bài tập', item_count: ac, impact: 'Các bài tập gắn với bài học.', preserves_history: true });
        if (xc) out.push({ label: 'Bài kiểm tra', item_count: xc, impact: 'Các bài kiểm tra gắn với bài học.', preserves_history: true });
      } else if (type === 'assignment') {
        const subs = (await queryByField('assignment_submissions', 'teacher_id', uid)).filter((s) => s.assignment_id === id);
        if (subs.length) out.push({ label: 'Bài nộp của học sinh', item_count: subs.length, impact: 'Lịch sử bài nộp và điểm số được bảo toàn.', preserves_history: true });
      } else if (type === 'question') {
        const [aq, xq] = await Promise.all([
          queryByField('assignment_questions', 'teacher_id', uid),
          queryByField('assessment_questions', 'teacher_id', uid),
        ]);
        const ac = aq.filter((x) => x.question_id === id).length;
        const xc = xq.filter((x) => x.question_id === id).length;
        if (ac) out.push({ label: 'Bài tập đang dùng câu hỏi', item_count: ac, impact: 'Câu hỏi nằm trong bài tập.', preserves_history: true });
        if (xc) out.push({ label: 'Bài kiểm tra đang dùng câu hỏi', item_count: xc, impact: 'Câu hỏi nằm trong bài kiểm tra.', preserves_history: true });
      }
      return out;
    }, OperationType.LIST, 'trash'),

    purgeTrashedItem: (type, id) => safeWrap(async () => {
      const deps = await dbCall(EducMindDB.trashItemDependencies(type, id));
      if (deps.length) {
        const err = new Error('violates foreign key constraint');
        err.code = '23503';
        throw err;
      }
      const { doc, deleteDoc } = api();
      const map = { topic: ['course_topics', 'topic_ids'], lesson: ['lessons', 'lesson_ids'], assignment: ['assignments', 'assignment_ids'], question: ['questions', 'question_ids'] };
      const [col, idxField] = map[type] || [];
      if (!col) throw new Error('Invalid trash type');
      const existing = await getById(col, id);
      await deleteDoc(doc(firebaseDb, col, id));
      if (existing) await updateClassIndex(existing.class_id, idxField, [], [id]).catch(() => {});
      return [{ id }];
    }, OperationType.DELETE, 'trash'),

    /* ----- Ngân hàng câu hỏi ----- */
    listQuestions: (courseId) => safeWrap(async () => {
      return (await queryByField('questions', 'teacher_id', me())).filter((q) => q.course_id === courseId && !q.deleted_at);
    }, OperationType.LIST, 'questions'),

    createQuestions: (rows) => safeWrap(async () => {
      if (!rows || !rows.length) return [];
      const meta = await resolveCourseMeta(rows[0].course_id);
      const { doc, writeBatch, serverTimestamp } = api();
      const batch = writeBatch(firebaseDb);
      const ts = serverTimestamp();
      const created = [];
      for (const r of rows) {
        const id = genId();
        batch.set(doc(firebaseDb, 'questions', id), {
          id,
          class_id: meta.class_id,
          teacher_id: meta.teacher_id,
          created_by: me(),
          course_id: r.course_id,
          content: r.content,
          kind: r.kind,
          options: r.options ?? null,
          correct_answer: r.correct_answer ?? null,
          explain: r.explain || '',
          difficulty: r.difficulty || 'MEDIUM',
          grade: r.grade ? Number(r.grade) : null,
          bloom_level: r.bloom_level || null,
          objective_ids: [],
          deleted_at: null,
          createdAt: ts,
          updatedAt: ts,
        });
        created.push({ id });
      }
      await batch.commit();
      await updateClassIndex(meta.class_id, 'question_ids', created.map((c) => c.id));
      return created;
    }, OperationType.CREATE, 'questions'),

    createQuestion: (row) => safeWrap(async () => {
      const meta = await resolveCourseMeta(row.course_id);
      const { doc, setDoc, serverTimestamp } = api();
      const id = genId();
      const ts = serverTimestamp();
      await setDoc(doc(firebaseDb, 'questions', id), {
        id,
        class_id: meta.class_id,
        teacher_id: meta.teacher_id,
        created_by: me(),
        course_id: row.course_id,
        content: row.content,
        kind: row.kind,
        options: row.options ?? null,
        correct_answer: row.correct_answer ?? null,
        explain: row.explain || '',
        difficulty: row.difficulty || 'MEDIUM',
        grade: row.grade ? Number(row.grade) : null,
        bloom_level: row.bloom_level || null,
        objective_ids: [],
        deleted_at: null,
        createdAt: ts,
        updatedAt: ts,
      });
      await updateClassIndex(meta.class_id, 'question_ids', [id]);
      return await getById('questions', id);
    }, OperationType.CREATE, 'questions'),

    updateQuestion: (id, row) => safeWrap(async () => {
      const { doc, updateDoc, serverTimestamp } = api();
      const patch = { updatedAt: serverTimestamp() };
      for (const k of ['content', 'kind', 'options', 'correct_answer', 'explain', 'difficulty', 'grade', 'bloom_level', 'deleted_at']) {
        if (k in row) patch[k] = row[k];
      }
      await updateDoc(doc(firebaseDb, 'questions', id), patch);
      return await getById('questions', id);
    }, OperationType.UPDATE, `questions/${id}`),

    listQuestionObjectives: (questionIds) => safeWrap(async () => {
      const set = new Set(questionIds || []);
      if (!set.size) return [];
      return (await queryByField('question_objectives', 'teacher_id', me())).filter((x) => set.has(x.question_id));
    }, OperationType.LIST, 'question_objectives'),

    addQuestionObjectives: (rows) => safeWrap(async () => {
      if (!rows || !rows.length) return [];
      const byQ = {};
      for (const r of rows) (byQ[r.question_id] = byQ[r.question_id] || []).push(r.objective_id);
      const qs = await getByIds('questions', Object.keys(byQ));
      const qById = Object.fromEntries(qs.map((q) => [q.id, q]));
      const { doc, writeBatch, serverTimestamp, arrayUnion } = api();
      const batch = writeBatch(firebaseDb);
      const ts = serverTimestamp();
      const created = [];
      for (const r of rows) {
        const q = qById[r.question_id];
        if (!q) continue;
        const id = `${r.question_id}_${r.objective_id}`;
        const item = {
          id,
          class_id: q.class_id,
          teacher_id: q.teacher_id,
          question_id: r.question_id,
          objective_id: r.objective_id,
          createdAt: ts,
          updatedAt: ts,
        };
        batch.set(doc(firebaseDb, 'question_objectives', id), item);
        created.push(item);
      }
      for (const [qid, oids] of Object.entries(byQ)) {
        batch.update(doc(firebaseDb, 'questions', qid), { objective_ids: arrayUnion(...oids), updatedAt: ts });
      }
      await batch.commit();
      return created;
    }, OperationType.CREATE, 'question_objectives'),

    removeQuestionObjectives: (questionId, objectiveIds) => safeWrap(async () => {
      if (!objectiveIds || !objectiveIds.length) return [];
      const { doc, writeBatch, serverTimestamp, arrayRemove } = api();
      const batch = writeBatch(firebaseDb);
      for (const oid of objectiveIds) {
        batch.delete(doc(firebaseDb, 'question_objectives', `${questionId}_${oid}`));
      }
      batch.update(doc(firebaseDb, 'questions', questionId), {
        objective_ids: arrayRemove(...objectiveIds),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return objectiveIds.map((objective_id) => ({ question_id: questionId, objective_id }));
    }, OperationType.DELETE, 'question_objectives'),

    /* ----- Bài kiểm tra ----- */
    listAssessments: (courseId) => safeWrap(async () => {
      const list = isTeacherRole()
        ? (await queryByField('assessments', 'teacher_id', me())).filter((x) => x.course_id === courseId)
        : await getByIds('assessments', await getClassIndexIds(courseId, 'assessment_ids'));
      return list.filter((x) => !x.deleted_at)
        .sort((a, b) => String(a.open_at || '').localeCompare(String(b.open_at || '')));
    }, OperationType.LIST, 'assessments'),

    createAssessment: (row) => safeWrap(async () => {
      const meta = await resolveCourseMeta(row.course_id);
      const { doc, setDoc, serverTimestamp } = api();
      const id = genId();
      const ts = serverTimestamp();
      await setDoc(doc(firebaseDb, 'assessments', id), {
        id,
        class_id: meta.class_id,
        teacher_id: meta.teacher_id,
        created_by: me(),
        course_id: row.course_id,
        topic_id: row.topic_id || null,
        lesson_id: row.lesson_id || null,
        title: row.title,
        duration_minutes: Number(row.duration_minutes || 15),
        max_attempts: Number(row.max_attempts || 1),
        open_at: row.open_at || null,
        close_at: row.close_at || null,
        /* Công tắc cho học sinh dùng Trợ lý AI khi làm bài kiểm tra này (mặc định bật). */
        student_ai_enabled: row.student_ai_enabled !== false,
        status: row.status || 'DRAFT',
        question_ids: [],
        created_at: nowIso(),
        deleted_at: null,
        createdAt: ts,
        updatedAt: ts,
      });
      await updateClassIndex(meta.class_id, 'assessment_ids', [id]);
      await recordRevision(meta.class_id, meta.teacher_id, 'assessment', id, 'CREATE', null, { title: row.title });
      return await getById('assessments', id);
    }, OperationType.CREATE, 'assessments'),

    updateAssessment: (id, row) => safeWrap(async () => {
      const { doc, updateDoc, serverTimestamp } = api();
      const before = await getById('assessments', id);
      const patch = { updatedAt: serverTimestamp() };
      for (const k of ['topic_id', 'lesson_id', 'title', 'duration_minutes', 'max_attempts', 'open_at', 'close_at', 'student_ai_enabled', 'status', 'deleted_at']) {
        if (k in row) patch[k] = row[k];
      }
      await updateDoc(doc(firebaseDb, 'assessments', id), patch);
      if (before) {
        await recordRevision(before.class_id, before.teacher_id, 'assessment', id, row.deleted_at ? 'SOFT_DELETE' : 'UPDATE', { title: before.title, status: before.status }, row);
        if (before.status !== 'PUBLISHED' && row.status === 'PUBLISHED') {
          await notifyClassStudents(before.class_id, 'ASSESSMENT_PUBLISHED', `Bài kiểm tra mới: ${before.title}`, `Thời lượng ${before.duration_minutes} phút`, { page: 'assessments', id, class_id: before.class_id });
        }
      }
      return await getById('assessments', id);
    }, OperationType.UPDATE, `assessments/${id}`),

    listAssessmentQuestions: (assessmentIds) => safeWrap(async () => {
      const set = new Set(assessmentIds || []);
      if (!set.size) return [];
      const list = isTeacherRole()
        ? (await queryByField('assessment_questions', 'teacher_id', me())).filter((x) => set.has(x.assessment_id))
        : await getByIds('assessment_questions', (await getByIds('assessments', [...set])).flatMap((a) => (a.question_ids || []).map((qid) => `${a.id}_${qid}`)));
      return list.sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0));
    }, OperationType.LIST, 'assessment_questions'),

    addAssessmentQuestions: (rows) => safeWrap(async () => {
      if (!rows || !rows.length) return [];
      const assessmentId = rows[0].assessment_id;
      const e = await getById('assessments', assessmentId);
      if (!e) throw new Error('Assessment not found');
      const { doc, writeBatch, serverTimestamp, arrayUnion } = api();
      const batch = writeBatch(firebaseDb);
      const ts = serverTimestamp();
      const qIds = [];
      const created = [];
      for (const r of rows) {
        const id = `${assessmentId}_${r.question_id}`;
        const item = {
          id,
          class_id: e.class_id,
          teacher_id: e.teacher_id,
          assessment_id: assessmentId,
          question_id: r.question_id,
          weight: Number(r.weight || 1),
          display_order: Number(r.display_order || 1),
          createdAt: ts,
          updatedAt: ts,
        };
        batch.set(doc(firebaseDb, 'assessment_questions', id), item);
        qIds.push(r.question_id);
        created.push(item);
      }
      batch.update(doc(firebaseDb, 'assessments', assessmentId), { question_ids: arrayUnion(...qIds), updatedAt: ts });
      await batch.commit();
      return created;
    }, OperationType.CREATE, 'assessment_questions'),

    updateAssessmentQuestion: (assessmentId, questionId, row) => safeWrap(async () => {
      const id = `${assessmentId}_${questionId}`;
      const { doc, updateDoc, serverTimestamp } = api();
      const patch = { updatedAt: serverTimestamp() };
      if ('weight' in row) patch.weight = Number(row.weight);
      if ('display_order' in row) patch.display_order = Number(row.display_order);
      await updateDoc(doc(firebaseDb, 'assessment_questions', id), patch);
      return [await getById('assessment_questions', id)];
    }, OperationType.UPDATE, `assessment_questions/${assessmentId}_${questionId}`),

    removeAssessmentQuestion: (assessmentId, questionId) => safeWrap(async () => {
      const id = `${assessmentId}_${questionId}`;
      const { doc, writeBatch, serverTimestamp, arrayRemove } = api();
      const batch = writeBatch(firebaseDb);
      batch.delete(doc(firebaseDb, 'assessment_questions', id));
      batch.update(doc(firebaseDb, 'assessments', assessmentId), { question_ids: arrayRemove(questionId), updatedAt: serverTimestamp() });
      await batch.commit();
      return [{ assessment_id: assessmentId, question_id: questionId }];
    }, OperationType.DELETE, `assessment_questions/${id}`),

    listAttempts: (assessmentIds) => safeWrap(async () => {
      const set = new Set(assessmentIds || []);
      if (!set.size) return [];
      const field = isTeacherRole() ? 'teacher_id' : 'student_id';
      return (await queryByField('assessment_attempts', field, me()))
        .filter((t) => set.has(t.assessment_id))
        .sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')));
    }, OperationType.LIST, 'assessment_attempts'),

    grantExtraAttempts: (assessmentId, studentId, extra, reason) => safeWrap(async () => {
      const e = await getById('assessments', assessmentId);
      if (!e) throw new Error('Assessment not found');
      const { doc, setDoc, serverTimestamp } = api();
      const id = genId();
      const ts = serverTimestamp();
      await setDoc(doc(firebaseDb, 'assessment_extra_attempts', id), {
        id,
        class_id: e.class_id,
        teacher_id: e.teacher_id,
        assessment_id: assessmentId,
        student_id: studentId,
        extra: Number(extra),
        reason: reason || '',
        granted_by: me(),
        created_at: nowIso(),
        createdAt: ts,
        updatedAt: ts,
      });
      return { id };
    }, OperationType.CREATE, 'assessment_extra_attempts'),

    listExtraAttempts: (assessmentIds) => safeWrap(async () => {
      const set = new Set(assessmentIds || []);
      if (!set.size) return [];
      const field = isTeacherRole() ? 'teacher_id' : 'student_id';
      return (await queryByField('assessment_extra_attempts', field, me())).filter((x) => set.has(x.assessment_id));
    }, OperationType.LIST, 'assessment_extra_attempts'),

    startAttempt: (assessmentId) => safeWrap(async () => {
      if (isTeacherRole()) throw new Error('Only students can take an assessment');
      const uid = me();
      const e = await getById('assessments', assessmentId);
      if (!e || e.deleted_at || e.status !== 'PUBLISHED') return { status: 'CLOSED', attempt: null, ends_at: null };
      const nowMs = Date.now() + ((typeof DB !== 'undefined' && DB.clockSkew) || 0);
      if (nowMs < new Date(e.open_at).getTime() || nowMs > new Date(e.close_at).getTime()) {
        return { status: 'CLOSED', attempt: null, ends_at: null };
      }
      const attempts = (await queryByField('assessment_attempts', 'student_id', uid)).filter((t) => t.assessment_id === assessmentId);
      const live = attempts.find((t) => t.status === 'IN_PROGRESS');
      if (live) {
        const endsMs = Math.min(new Date(live.started_at).getTime() + Number(e.duration_minutes) * 60000, new Date(e.close_at).getTime());
        if (nowMs < endsMs) {
          return { status: 'RESUMED', attempt: live, ends_at: new Date(endsMs).toISOString() };
        }
        await finalizeAttemptInternal(live.id, false);
        attempts.forEach((t) => { if (t.id === live.id) t.status = 'SUBMITTED'; });
      }
      const extras = (await queryByField('assessment_extra_attempts', 'student_id', uid))
        .filter((x) => x.assessment_id === assessmentId)
        .reduce((s, x) => s + Number(x.extra || 0), 0);
      const maxAtt = Number(e.max_attempts || 1) + extras;
      const doneCount = attempts.length;
      if (doneCount >= maxAtt) return { status: 'NO_ATTEMPTS_LEFT', attempt: null, ends_at: null };

      const id = genId();
      const startedAt = nowIso();
      const endsMs = Math.min(new Date(startedAt).getTime() + Number(e.duration_minutes) * 60000, new Date(e.close_at).getTime());
      const { doc, setDoc, serverTimestamp } = api();
      const ts = serverTimestamp();
      const row = {
        id,
        class_id: e.class_id,
        teacher_id: e.teacher_id,
        assessment_id: assessmentId,
        student_id: uid,
        attempt_number: doneCount + 1,
        status: 'IN_PROGRESS',
        started_at: startedAt,
        submitted_at: null,
        graded_at: null,
        total_score: null,
        createdAt: ts,
        updatedAt: ts,
      };
      await setDoc(doc(firebaseDb, 'assessment_attempts', id), row);
      return { status: 'STARTED', attempt: await getById('assessment_attempts', id), ends_at: new Date(endsMs).toISOString() };
    }, OperationType.CREATE, 'assessment_attempts'),

    getAssessmentQuestions: (assessmentId) => safeWrap(async () => {
      const e = await getById('assessments', assessmentId);
      if (!e || !Array.isArray(e.question_ids) || !e.question_ids.length) return [];
      const [links, qs] = await Promise.all([
        getByIds('assessment_questions', e.question_ids.map((qid) => `${assessmentId}_${qid}`)),
        getByIds('questions', e.question_ids),
      ]);
      const qById = Object.fromEntries(qs.map((q) => [q.id, q]));
      return links.sort((x, y) => Number(x.display_order || 0) - Number(y.display_order || 0)).map((l) => {
        const q = qById[l.question_id];
        if (!q) return null;
        return {
          question_id: q.id,
          content: q.content,
          kind: q.kind,
          options: q.options || null,
          weight: Number(l.weight || 0),
          display_order: Number(l.display_order || 0),
        };
      }).filter(Boolean);
    }, OperationType.GET, 'assessment_questions'),

    listAnswers: (attemptIds) => safeWrap(async () => {
      const set = new Set(attemptIds || []);
      if (!set.size) return [];
      const field = isTeacherRole() ? 'teacher_id' : 'student_id';
      return (await queryByField('submission_answers', field, me())).filter((a) => set.has(a.attempt_id));
    }, OperationType.LIST, 'submission_answers'),

    saveAnswer: (attemptId, questionId, answer) => safeWrap(async () => {
      const attempt = await getById('assessment_attempts', attemptId);
      if (!attempt) throw new Error('Attempt not found');
      if (attempt.status !== 'IN_PROGRESS') throw new Error('Submitted attempt is locked');
      const e = await getById('assessments', attempt.assessment_id);
      if (e) {
        const endsMs = Math.min(new Date(attempt.started_at).getTime() + Number(e.duration_minutes) * 60000, new Date(e.close_at).getTime());
        if (Date.now() + ((typeof DB !== 'undefined' && DB.clockSkew) || 0) > endsMs + 3000) {
          throw new Error('Assessment time window has ended');
        }
      }
      const id = `${attemptId}_${questionId}`;
      const existing = await getById('submission_answers', id).catch(() => null);
      const { doc, setDoc, updateDoc, serverTimestamp } = api();
      const val = answer === undefined ? null : answer;
      if (existing) {
        await updateDoc(doc(firebaseDb, 'submission_answers', id), { answer_content: val, updatedAt: serverTimestamp() });
      } else {
        const ts = serverTimestamp();
        await setDoc(doc(firebaseDb, 'submission_answers', id), {
          id,
          class_id: attempt.class_id,
          teacher_id: attempt.teacher_id,
          attempt_id: attemptId,
          student_id: me(),
          question_id: questionId,
          answer_content: val,
          score: null,
          feedback: null,
          graded_by: null,
          graded_at: null,
          createdAt: ts,
          updatedAt: ts,
        });
      }
      return { id, attempt_id: attemptId, question_id: questionId, answer_content: val };
    }, OperationType.WRITE, 'submission_answers'),

    submitAttempt: (attemptId) => safeWrap(() => finalizeAttemptInternal(attemptId, true), OperationType.UPDATE, `assessment_attempts/${attemptId}`),

    reviewAttempt: (attemptId) => safeWrap(async () => {
      const attempt = await getById('assessment_attempts', attemptId);
      if (!attempt) throw new Error('Attempt not found');
      const e = await getById('assessments', attempt.assessment_id);
      if (!e || !Array.isArray(e.question_ids)) return [];
      const [links, qs] = await Promise.all([
        getByIds('assessment_questions', e.question_ids.map((qid) => `${e.id}_${qid}`)),
        getByIds('questions', e.question_ids),
      ]);
      const answers = (await queryByField('submission_answers', isTeacherRole() ? 'teacher_id' : 'student_id', me()))
        .filter((a) => a.attempt_id === attemptId);
      const qById = Object.fromEntries(qs.map((q) => [q.id, q]));
      const ansByQ = Object.fromEntries(answers.map((a) => [a.question_id, a]));
      return links.sort((x, y) => Number(x.display_order || 0) - Number(y.display_order || 0)).map((l) => {
        const q = qById[l.question_id] || {};
        const a = ansByQ[l.question_id] || {};
        return {
          question_id: l.question_id,
          weight: Number(l.weight || 0),
          display_order: Number(l.display_order || 0),
          kind: q.kind || 'SHORT_ANSWER',
          content: q.content || '',
          options: q.options || null,
          answer_content: a.answer_content ?? null,
          score: a.score ?? null,
          feedback: a.feedback || '',
        };
      });
    }, OperationType.GET, `assessment_attempts/${attemptId}`),

    gradeAnswer: (id, row) => safeWrap(async () => {
      const ans = await getById('submission_answers', id);
      if (!ans) throw new Error('Answer not found');
      const attempt = await getById('assessment_attempts', ans.attempt_id);
      if (!attempt) throw new Error('Attempt not found');
      const { doc, updateDoc, serverTimestamp } = api();
      const tsNow = nowIso();
      await updateDoc(doc(firebaseDb, 'submission_answers', id), {
        score: Number(row.score),
        feedback: row.feedback || '',
        graded_by: me(),
        graded_at: tsNow,
        updatedAt: serverTimestamp(),
      });
      const e = await getById('assessments', attempt.assessment_id);
      const links = (await queryByField('assessment_questions', 'teacher_id', me())).filter((x) => x.assessment_id === attempt.assessment_id);
      const allAns = (await queryByField('submission_answers', 'teacher_id', me())).filter((a) => a.attempt_id === attempt.id);
      const ansByQ = Object.fromEntries(allAns.map((a) => [a.question_id, a]));
      if (links.length && links.every((l) => ansByQ[l.question_id] && ansByQ[l.question_id].score != null)) {
        const total = links.reduce((s, l) => s + Number(ansByQ[l.question_id].score || 0), 0);
        const maxTotal = links.reduce((s, l) => s + Number(l.weight || 0), 0);
        await updateDoc(doc(firebaseDb, 'assessment_attempts', attempt.id), {
          status: 'GRADED',
          graded_at: tsNow,
          total_score: total,
          updatedAt: serverTimestamp(),
        });
        if (maxTotal > 0 && e) {
          const qs = await getByIds('questions', links.map((l) => l.question_id));
          const objIds = [...new Set(qs.flatMap((q) => q.objective_ids || []))];
          await updateLearningFromSource({
            classId: attempt.class_id,
            teacherId: attempt.teacher_id,
            studentId: attempt.student_id,
            objectiveIds: objIds,
            sourceType: 'ASSESSMENT',
            sourceId: attempt.assessment_id,
            normalizedScore: total / maxTotal,
            assessmentId: attempt.assessment_id,
          }).catch(() => {});
          await createNotificationForUser(attempt.student_id, 'ASSESSMENT_GRADED', `Đã chấm bài kiểm tra: ${e.title}`, `Điểm: ${total}/${maxTotal}`, { page: 'assessments', id: e.id, attempt: attempt.id, class_id: e.class_id });
        }
      }
      return await getById('submission_answers', id);
    }, OperationType.UPDATE, `submission_answers/${id}`),

    regradeAssessment: (assessmentId) => safeWrap(async () => {
      const e = await getById('assessments', assessmentId);
      if (!e) throw new Error('Assessment not found');
      const links = (await queryByField('assessment_questions', 'teacher_id', me())).filter((x) => x.assessment_id === assessmentId);
      const qs = await getByIds('questions', links.map((l) => l.question_id));
      const qById = Object.fromEntries(qs.map((q) => [q.id, q]));
      const attempts = (await queryByField('assessment_attempts', 'teacher_id', me()))
        .filter((t) => t.assessment_id === assessmentId && t.status !== 'IN_PROGRESS');
      const allAns = (await queryByField('submission_answers', 'teacher_id', me()));
      const { doc, updateDoc, serverTimestamp } = api();
      const tsNow = nowIso();
      let count = 0;

      for (const t of attempts) {
        const tAns = Object.fromEntries(allAns.filter((a) => a.attempt_id === t.id).map((a) => [a.question_id, a]));
        let total = 0;
        let maxTotal = 0;
        let allGraded = links.length > 0;
        for (const l of links) {
          const w = Number(l.weight || 0);
          maxTotal += w;
          const q = qById[l.question_id];
          const a = tAns[l.question_id];
          const computed = q ? gradeQuestionAnswer(q, a ? a.answer_content : null, w) : null;
          if (computed != null) {
            total += computed;
            if (a && a.score !== computed) {
              await updateDoc(doc(firebaseDb, 'submission_answers', a.id), {
                score: computed,
                graded_by: me(),
                graded_at: tsNow,
                updatedAt: serverTimestamp(),
              });
            }
          } else if (a && a.score != null) {
            total += Number(a.score);
          } else {
            allGraded = false;
          }
        }
        await updateDoc(doc(firebaseDb, 'assessment_attempts', t.id), {
          status: allGraded ? 'GRADED' : 'SUBMITTED',
          graded_at: allGraded ? tsNow : null,
          total_score: allGraded ? total : null,
          updatedAt: serverTimestamp(),
        });
        if (allGraded && maxTotal > 0) {
          const objIds = [...new Set(qs.flatMap((q) => q.objective_ids || []))];
          await updateLearningFromSource({
            classId: t.class_id,
            teacherId: t.teacher_id,
            studentId: t.student_id,
            objectiveIds: objIds,
            sourceType: 'ASSESSMENT',
            sourceId: assessmentId,
            normalizedScore: total / maxTotal,
            assessmentId,
          }).catch(() => {});
        }
        count++;
      }
      return count;
    }, OperationType.UPDATE, `assessments/${assessmentId}`),

    finalizeExpiredAttempts: (assessmentId) => safeWrap(async () => {
      if (isTeacherRole()) return 0;
      const attempts = (await queryByField('assessment_attempts', 'student_id', me()))
        .filter((t) => t.status === 'IN_PROGRESS' && (!assessmentId || t.assessment_id === assessmentId));
      let n = 0;
      for (const t of attempts) {
        const res = await finalizeAttemptInternal(t.id, false).catch(() => null);
        if (res && res.status !== 'IN_PROGRESS') n++;
      }
      return n;
    }, OperationType.UPDATE, 'assessment_attempts'),

    /* ----- Đánh giá học tập ----- */
    listMastery: (objectiveIds) => safeWrap(async () => {
      const set = new Set(objectiveIds || []);
      if (!set.size) return [];
      const field = isTeacherRole() ? 'teacher_id' : 'student_id';
      return (await queryByField('mastery', field, me())).filter((m) => set.has(m.objective_id));
    }, OperationType.LIST, 'mastery'),

    listEvidence: (objectiveIds) => safeWrap(async () => {
      const set = new Set(objectiveIds || []);
      if (!set.size) return [];
      const field = isTeacherRole() ? 'teacher_id' : 'student_id';
      return (await queryByField('learning_evidence', field, me()))
        .filter((e) => set.has(e.objective_id))
        .sort((a, b) => String(b.observed_at || '').localeCompare(String(a.observed_at || '')));
    }, OperationType.LIST, 'learning_evidence'),

    listGaps: (objectiveIds) => safeWrap(async () => {
      const set = new Set(objectiveIds || []);
      if (!set.size) return [];
      const field = isTeacherRole() ? 'teacher_id' : 'student_id';
      return (await queryByField('knowledge_gaps', field, me()))
        .filter((g) => set.has(g.objective_id))
        .sort((a, b) => String(b.opened_at || '').localeCompare(String(a.opened_at || '')));
    }, OperationType.LIST, 'knowledge_gaps'),

    dismissGap: (gapId, reason) => safeWrap(async () => {
      const { doc, updateDoc, serverTimestamp } = api();
      await updateDoc(doc(firebaseDb, 'knowledge_gaps', gapId), {
        status: 'DISMISSED',
        dismiss_reason: reason || '',
        dismissed_at: nowIso(),
        updatedAt: serverTimestamp(),
      });
      return await getById('knowledge_gaps', gapId);
    }, OperationType.UPDATE, `knowledge_gaps/${gapId}`),

    listRecommendations: () => safeWrap(async () => {
      const field = isTeacherRole() ? 'teacher_id' : 'student_id';
      return (await queryByField('recommendations', field, me()))
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    }, OperationType.LIST, 'recommendations'),

    respondRecommendation: (id, status) => safeWrap(async () => {
      const { doc, updateDoc, serverTimestamp } = api();
      await updateDoc(doc(firebaseDb, 'recommendations', id), {
        status,
        responded_at: nowIso(),
        updatedAt: serverTimestamp(),
      });
      return { id, status };
    }, OperationType.UPDATE, `recommendations/${id}`),

    /* ----- Thông báo ----- */
    listNotifications: (lim) => safeWrap(async () => {
      return (await queryByField('notifications', 'user_id', me()))
        .filter((n) => !n.deleted_at)
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
        .slice(0, lim || 30);
    }, OperationType.LIST, 'notifications'),

    markNotificationRead: (id) => safeWrap(async () => {
      const { doc, updateDoc, serverTimestamp } = api();
      await updateDoc(doc(firebaseDb, 'notifications', id), { is_read: true, read_at: nowIso(), updatedAt: serverTimestamp() });
      return [{ id }];
    }, OperationType.UPDATE, `notifications/${id}`),

    markAllNotificationsRead: () => safeWrap(async () => {
      const list = (await queryByField('notifications', 'user_id', me())).filter((n) => !n.deleted_at && !n.is_read);
      if (!list.length) return [];
      const { doc, writeBatch, serverTimestamp } = api();
      const batch = writeBatch(firebaseDb);
      const tsNow = nowIso();
      const ts = serverTimestamp();
      for (const n of list) batch.update(doc(firebaseDb, 'notifications', n.id), { is_read: true, read_at: tsNow, updatedAt: ts });
      await batch.commit();
      return list.map((n) => ({ id: n.id }));
    }, OperationType.UPDATE, 'notifications'),

    hideNotification: (id) => safeWrap(async () => {
      const { doc, updateDoc, serverTimestamp } = api();
      await updateDoc(doc(firebaseDb, 'notifications', id), { deleted_at: nowIso(), updatedAt: serverTimestamp() });
      return [{ id }];
    }, OperationType.UPDATE, `notifications/${id}`),

    hideAllNotifications: () => safeWrap(async () => {
      const list = (await queryByField('notifications', 'user_id', me())).filter((n) => !n.deleted_at);
      if (!list.length) return [];
      const { doc, writeBatch, serverTimestamp } = api();
      const batch = writeBatch(firebaseDb);
      const tsNow = nowIso();
      const ts = serverTimestamp();
      for (const n of list) batch.update(doc(firebaseDb, 'notifications', n.id), { deleted_at: tsNow, updatedAt: ts });
      await batch.commit();
      return list.map((n) => ({ id: n.id }));
    }, OperationType.UPDATE, 'notifications'),

    /* ----- Lịch sử chỉnh sửa ----- */
    listRevisions: (classId, lim) => safeWrap(async () => {
      return (await queryByField('content_revisions', 'teacher_id', me()))
        .filter((r) => r.class_id === classId)
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
        .slice(0, lim || 200);
    }, OperationType.LIST, 'content_revisions'),

    /* ----- API key Gemini của từng người (máy chủ mã hoá rồi lưu Firestore) ----- */
    /* POST (không phải GET) để token dự phòng đi kèm được trong thân request:
       GET/HEAD bị trình duyệt cấm có phần thân. */
    aiKeyStatus: (classId) => apiFetch('POST', '/api/ai/key/status', { classId: classId || '' }),
    aiKeySave: (apiKey) => apiFetch('POST', '/api/ai/key', { apiKey }),
    aiKeyDelete: () => apiFetch('DELETE', '/api/ai/key'),
    /* Tham số tuỳ chọn: key đang gõ (để kiểm tra trước khi lưu). */
    aiKeyTest: (apiKey) => apiFetch('POST', '/api/ai/key/test', typeof apiKey === 'string' && apiKey ? { apiKey } : {}),

    /* ----- AI tạo câu hỏi nháp (qua Express /api/ai/generate) ----- */
    listAiRequests: () => safeWrap(async () => {
      return (await queryByField('ai_generation_requests', 'teacher_id', me()))
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    }, OperationType.LIST, 'ai_generation_requests'),

    deleteAiRequest: (id) => safeWrap(async () => {
      const req = await getById('ai_generation_requests', id);
      if (!req || req.status === 'PROCESSING') throw new Error('Không thể xóa yêu cầu đang xử lý.');
      const [outs, jobs] = await Promise.all([
        queryByField('ai_generation_outputs', 'teacher_id', me()),
        queryByField('ai_generation_jobs', 'teacher_id', me()),
      ]);
      const { doc, writeBatch } = api();
      const batch = writeBatch(firebaseDb);
      for (const o of outs.filter((x) => x.request_id === id)) batch.delete(doc(firebaseDb, 'ai_generation_outputs', o.id));
      for (const j of jobs.filter((x) => x.request_id === id)) batch.delete(doc(firebaseDb, 'ai_generation_jobs', j.id));
      batch.delete(doc(firebaseDb, 'ai_generation_requests', id));
      await batch.commit();
      return { id };
    }, OperationType.DELETE, `ai_generation_requests/${id}`),

    createAiRequest: (lessonId, quantity, params) => safeWrap(async () => {
      const { doc, setDoc, serverTimestamp } = api();
      const id = genId();
      const ts = serverTimestamp();
      await setDoc(doc(firebaseDb, 'ai_generation_requests', id), {
        id,
        teacher_id: me(),
        lesson_id: lessonId,
        quantity: Number(quantity),
        parameters: params || {},
        status: 'PROCESSING',
        error_message: null,
        created_at: nowIso(),
        completed_at: null,
        createdAt: ts,
        updatedAt: ts,
      });
      return await getById('ai_generation_requests', id);
    }, OperationType.CREATE, 'ai_generation_requests'),

    aiGenerate: (requestId, retry = false) => safeWrap(async () => {
      const req = await getById('ai_generation_requests', requestId);
      if (!req) throw new Error('Không tìm thấy yêu cầu AI.');
      const { doc, updateDoc, writeBatch, serverTimestamp } = api();
      try {
        const lesson = await getById('lessons', req.lesson_id).catch(() => null);
        const course = lesson && lesson.course_id ? await getById('courses', lesson.course_id).catch(() => null) : null;
        const cls = course && course.class_id ? await getById('classes', course.class_id).catch(() => null) : null;
        const selectedObjIds = Array.isArray(req.parameters?.objectives) ? req.parameters.objectives.filter(Boolean) : [];
        let objectives = selectedObjIds.length
          ? await getByIds('learning_objectives', selectedObjIds)
          : (await queryByField('learning_objectives', 'teacher_id', me())).filter((o) => o.lesson_id === req.lesson_id);
        objectives = objectives.slice(0, 50);

        const lessonIds = [...new Set(objectives.map((o) => o.lesson_id).filter(Boolean))];
        const lessonsList = lessonIds.length ? await getByIds('lessons', lessonIds) : (lesson ? [lesson] : []);
        const lessonMap = Object.fromEntries(lessonsList.map((l) => [l.id, l]));
        const topicIds = [...new Set(lessonsList.map((l) => l.topic_id).filter(Boolean))];
        const topicsList = topicIds.length ? await getByIds('course_topics', topicIds) : [];
        const topicMap = Object.fromEntries(topicsList.map((t) => [t.id, t]));

        const context = {
          class_name: (cls && cls.name) || (course && course.title) || 'Lớp học',
          learning_objectives: objectives.map((o) => {
            const l = lessonMap[o.lesson_id] || lesson || {};
            const t = l.topic_id ? topicMap[l.topic_id] : null;
            return {
              id: o.id,
              code: o.code || '',
              description: o.description || '',
              lesson_title: l.title || '',
              lesson_description: l.description || '',
              topic_title: (t && t.title) || '',
            };
          }),
          uploaded_lesson_plan: typeof req.parameters?.source_document_text === 'string'
            ? req.parameters.source_document_text
            : '',
        };

        const result = await apiRequest('POST', '/api/ai/generate', {
          request_id: requestId,
          lesson_id: req.lesson_id,
          quantity: req.quantity,
          parameters: req.parameters || {},
          retry: !!retry,
          context,
        });
        const items = Array.isArray(result && result.items) ? result.items : [];
        const batch = writeBatch(firebaseDb);
        const ts = serverTimestamp();
        for (const item of items) {
          const oid = genId();
          batch.set(doc(firebaseDb, 'ai_generation_outputs', oid), {
            id: oid,
            teacher_id: me(),
            request_id: requestId,
            content: String(item.content || '').slice(0, 5000),
            kind: item.kind || 'SINGLE_CHOICE',
            objective_id: item.objective_id || null,
            difficulty: item.difficulty || 'MEDIUM',
            bloom_level: item.bloom_level || null,
            options: item.options ?? null,
            correct_answer: item.correct_answer ?? null,
            review_status: 'PENDING_REVIEW',
            review_note: null,
            approved_question_id: null,
            reviewed_by: null,
            reviewed_at: null,
            createdAt: ts,
            updatedAt: ts,
          });
        }
        batch.update(doc(firebaseDb, 'ai_generation_requests', requestId), {
          status: 'COMPLETED',
          error_message: null,
          completed_at: nowIso(),
          updatedAt: ts,
        });
        await batch.commit();
        return { accepted: true, count: items.length };
      } catch (err) {
        await updateDoc(doc(firebaseDb, 'ai_generation_requests', requestId), {
          status: 'FAILED',
          error_message: String((err && err.message) || err || 'Lỗi tạo câu hỏi AI.').slice(0, 1000),
          updatedAt: serverTimestamp(),
        }).catch(() => {});
        throw err;
      }
    }, OperationType.WRITE, 'ai_generation_requests'),

    listAiOutputs: (requestIds) => safeWrap(async () => {
      const set = new Set(requestIds || []);
      if (!set.size) return [];
      return (await queryByField('ai_generation_outputs', 'teacher_id', me()))
        .filter((o) => set.has(o.request_id))
        .sort((a, b) => String(a.content || '').localeCompare(String(b.content || '')));
    }, OperationType.LIST, 'ai_generation_outputs'),

    listAiJobs: (requestIds) => safeWrap(async () => {
      const set = new Set(requestIds || []);
      if (!set.size) return [];
      return (await queryByField('ai_generation_jobs', 'teacher_id', me())).filter((j) => set.has(j.request_id));
    }, OperationType.LIST, 'ai_generation_jobs'),

    updateAiOutput: (id, row) => safeWrap(async () => {
      const { doc, updateDoc, serverTimestamp } = api();
      const patch = {
        reviewed_by: me(),
        reviewed_at: nowIso(),
        updatedAt: serverTimestamp(),
      };
      for (const k of ['content', 'options', 'correct_answer', 'difficulty', 'bloom_level', 'review_status', 'review_note', 'approved_question_id']) {
        if (k in row) patch[k] = row[k];
      }
      await updateDoc(doc(firebaseDb, 'ai_generation_outputs', id), patch);
      return await getById('ai_generation_outputs', id);
    }, OperationType.UPDATE, `ai_generation_outputs/${id}`),

    approveAiOutput: (id, content, options, correct, difficulty, bloom, grade, assignmentId) => safeWrap(async () => {
      const o = await getById('ai_generation_outputs', id);
      if (!o) throw new Error('Không tìm thấy bản nháp.');
      const req = await getById('ai_generation_requests', o.request_id);
      const lesson = req ? await getById('lessons', req.lesson_id) : null;
      const courseId = lesson ? lesson.course_id : (typeof DB !== 'undefined' && DB.course ? DB.course.id : '');
      const meta = await resolveClassForCourseOrItem(courseId);
      const qId = genId();
      const { doc, setDoc, updateDoc, serverTimestamp, arrayUnion } = api();
      const ts = serverTimestamp();

      await setDoc(doc(firebaseDb, 'questions', qId), {
        id: qId,
        class_id: meta.class_id,
        teacher_id: meta.teacher_id,
        created_by: me(),
        course_id: courseId,
        content,
        kind: o.kind,
        options: options ?? o.options ?? null,
        correct_answer: correct !== undefined ? correct : (o.correct_answer ?? null),
        explain: '',
        difficulty: difficulty || o.difficulty || 'MEDIUM',
        grade: grade ? Number(grade) : null,
        bloom_level: bloom !== undefined ? bloom : (o.bloom_level || null),
        objective_ids: o.objective_id ? [o.objective_id] : [],
        deleted_at: null,
        createdAt: ts,
        updatedAt: ts,
      });
      await updateClassIndex(meta.class_id, 'question_ids', [qId]);
      if (o.objective_id) {
        await setDoc(doc(firebaseDb, 'question_objectives', `${qId}_${o.objective_id}`), {
          id: `${qId}_${o.objective_id}`,
          class_id: meta.class_id,
          teacher_id: meta.teacher_id,
          question_id: qId,
          objective_id: o.objective_id,
          createdAt: ts,
          updatedAt: ts,
        });
      }
      if (assignmentId) {
        await dbCall(EducMindDB.addAssignmentQuestions([{ assignment_id: assignmentId, question_id: qId }]));
      }
      await updateDoc(doc(firebaseDb, 'ai_generation_outputs', id), {
        content,
        options: options ?? o.options ?? null,
        correct_answer: correct !== undefined ? correct : (o.correct_answer ?? null),
        difficulty: difficulty || o.difficulty || 'MEDIUM',
        bloom_level: bloom !== undefined ? bloom : (o.bloom_level || null),
        review_status: content !== o.content ? 'EDITED_AND_APPROVED' : 'APPROVED',
        approved_question_id: qId,
        reviewed_by: me(),
        reviewed_at: nowIso(),
        updatedAt: ts,
      });
      return { question_id: qId };
    }, OperationType.WRITE, 'ai_generation_outputs'),

    approveAiOutputForAssignment: (id, content, options, correct, difficulty, bloom, grade, assignmentId) =>
      EducMindDB.approveAiOutput(id, content, options, correct, difficulty, bloom, grade, assignmentId),

    /* ===== Phase 1: Resource-Objective Linking ===== */
    listResourceObjectiveLinks: (courseId) => safeWrap(async () => {
      if (isTeacherRole()) {
        return (await queryByField('resource_objective_links', 'teacher_id', me())).filter((x) => x.course_id === courseId);
      }
      const ids = await getClassIndexIds(courseId, 'resource_objective_link_ids').catch(() => []);
      return ids.length ? await getByIds('resource_objective_links', ids) : [];
    }, OperationType.LIST, 'resource_objective_links'),

    createResourceObjectiveLink: (row) => safeWrap(async () => {
      const meta = await resolveCourseMeta(row.course_id);
      const { doc, setDoc, serverTimestamp, arrayUnion } = api();
      const id = `${row.resource_id}_${row.objective_id}`;
      const ts = serverTimestamp();
      const item = {
        id,
        class_id: meta.class_id,
        teacher_id: meta.teacher_id,
        course_id: row.course_id,
        resource_id: row.resource_id,
        objective_id: row.objective_id,
        purpose: row.purpose || 'LEARN',
        createdAt: ts,
        updatedAt: ts,
      };
      await setDoc(doc(firebaseDb, 'resource_objective_links', id), item);
      await updateClassIndex(meta.class_id, 'resource_objective_link_ids', [id]).catch(() => {});
      return item;
    }, OperationType.CREATE, 'resource_objective_links'),

    deleteResourceObjectiveLink: (linkId) => safeWrap(async () => {
      const { doc, deleteDoc } = api();
      const link = await getById('resource_objective_links', linkId).catch(() => null);
      await deleteDoc(doc(firebaseDb, 'resource_objective_links', linkId));
      if (link) await updateClassIndex(link.class_id, 'resource_objective_link_ids', [], [linkId]).catch(() => {});
      return { id: linkId };
    }, OperationType.DELETE, 'resource_objective_links'),

    getObjectiveCoverage: (courseId) => safeWrap(async () => {
      const [resources, objectives, questions, links, members] = await Promise.all([
        dbCall(EducMindDB.listResources(courseId)).catch(() => []),
        (async () => {
          const c = await dbLoadContent().catch(() => ({ objectives: [] }));
          return c.objectives || [];
        })(),
        dbCall(EducMindDB.listQuestions(courseId)).catch(() => []),
        dbCall(EducMindDB.listResourceObjectiveLinks(courseId)).catch(() => []),
        dbIsTeacher() ? dbCallIn(EducMindDB.listMembers, [DB.classId]).catch(() => []) : [],
      ]);
      const qByObj = {};
      for (const q of questions) {
        for (const oid of (q.objective_ids || [])) {
          qByObj[oid] = (qByObj[oid] || 0) + 1;
        }
      }
      const linkByObj = {};
      for (const l of links) {
        if (!linkByObj[l.objective_id]) linkByObj[l.objective_id] = { LEARN: 0, PRACTICE: 0, EXTEND: 0 };
        linkByObj[l.objective_id][l.purpose] = (linkByObj[l.objective_id][l.purpose] || 0) + 1;
      }
      return { resources, objectives, questions, links, linkByObj, qByObj, membersCount: members.length };
    }, OperationType.GET, 'resource_objective_links'),

    getStudentObjectiveSupport: (objectiveId, kind) => safeWrap(async () => {
      const allLinks = await dbCall(EducMindDB.listResourceObjectiveLinks(DB.course ? DB.course.id : '')).catch(() => []);
      const filtered = allLinks.filter((l) => l.objective_id === objectiveId && (!kind || l.purpose === kind));
      const resourceIds = [...new Set(filtered.map((l) => l.resource_id))];
      const resources = resourceIds.length ? await getByIds('resources', resourceIds) : [];
      return resources.filter((r) => !r.deleted_at);
    }, OperationType.GET, 'resource_objective_links'),

    /* ===== Phase 2: Adaptive Practice ===== */
    PRACTICE_DEFAULTS: {
      practice_weight: 0.3,
      practice_unlock_min_official: 1,
      practice_session_length: 8,
      practice_daily_scored_sessions: 3,
      practice_max_share: 0.5,
      dash_reteach_share: 0.4,
      dash_min_students: 5,
      dash_advanced_threshold: 0.8,
      dash_inactive_days: 14,
      dash_question_min_answers: 10,
    },

    listPracticeSessions: (objectiveId) => safeWrap(async () => {
      const field = isTeacherRole() ? 'teacher_id' : 'student_id';
      const list = await queryByField('practice_sessions', field, me());
      return list.filter((s) => !objectiveId || s.objective_id === objectiveId)
        .sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')));
    }, OperationType.LIST, 'practice_sessions'),

    listPracticeAnswers: (sessionIds) => safeWrap(async () => {
      const set = new Set(sessionIds || []);
      if (!set.size) return [];
      const field = isTeacherRole() ? 'teacher_id' : 'student_id';
      return (await queryByField('practice_answers', field, me())).filter((a) => set.has(a.session_id));
    }, OperationType.LIST, 'practice_answers'),

    listMasterySnapshots: (objectiveIds) => safeWrap(async () => {
      const set = new Set(objectiveIds || []);
      const field = isTeacherRole() ? 'teacher_id' : 'student_id';
      const list = await queryByField('mastery_snapshots', field, me());
      return list.filter((s) => !set.size || set.has(s.objective_id))
        .sort((a, b) => String(a.recorded_at || '').localeCompare(String(b.recorded_at || '')));
    }, OperationType.LIST, 'mastery_snapshots'),

    getCoursePracticeConfig: (courseId) => {
      const course = (typeof DB !== 'undefined' && DB.course && DB.course.id === courseId) ? DB.course : null;
      const d = EducMindDB.PRACTICE_DEFAULTS || { practice_weight: 0.3, practice_unlock_min_official: 1, practice_session_length: 8, practice_daily_scored_sessions: 3, practice_max_share: 0.5 };
      if (!course) return d;
      return {
        practice_weight: course.practice_weight ?? d.practice_weight,
        practice_unlock_min_official: course.practice_unlock_min_official ?? d.practice_unlock_min_official,
        practice_session_length: course.practice_session_length ?? d.practice_session_length,
        practice_daily_scored_sessions: course.practice_daily_scored_sessions ?? d.practice_daily_scored_sessions,
        practice_max_share: course.practice_max_share ?? d.practice_max_share,
        dash_reteach_share: course.dash_reteach_share ?? 0.4,
        dash_min_students: course.dash_min_students ?? 5,
        dash_advanced_threshold: course.dash_advanced_threshold ?? 0.8,
        dash_inactive_days: course.dash_inactive_days ?? 14,
        dash_question_min_answers: course.dash_question_min_answers ?? 10,
      };
    },

    practiceStart: (objectiveId, courseId, classId) => safeWrap(async () => {
      const cfg = EducMindDB.getCoursePracticeConfig(courseId);
      const official = await dbCall(EducMindDB.listEvidence([objectiveId])).catch(() => []);
      if (official.length < (cfg.practice_unlock_min_official || 1)) {
        const err = new Error(`Cần ít nhất ${cfg.practice_unlock_min_official} kết quả chính thức trước khi luyện tập.`);
        err.code = 'PRACTICE_LOCKED';
        throw err;
      }
      const todaySessions = (await queryByField('practice_sessions', 'student_id', me()))
        .filter((s) => s.objective_id === objectiveId && s.started_at && new Date(s.started_at).toDateString() === new Date().toDateString() && s.status === 'COMPLETED');
      if (todaySessions.length >= Number(cfg.practice_daily_scored_sessions || 3)) {
        // Still allow practice but mark as non-scored; inform UI via flag
      }
      const res = await apiRequest('POST', '/api/practice/start', { objective_id: objectiveId, course_id: courseId, class_id: classId, session_length: cfg.practice_session_length });
      return res.session || res;
    }, OperationType.CREATE, 'practice_sessions'),

    practiceNextQuestion: (sessionId) => safeWrap(async () => {
      return await apiRequest('POST', '/api/practice/next-question', { session_id: sessionId });
    }, OperationType.GET, 'practice_answers'),

    practiceSubmitAnswer: (sessionId, question, answer) => safeWrap(async () => {
      return await apiRequest('POST', '/api/practice/submit-answer', { session_id: sessionId, question, answer });
    }, OperationType.WRITE, 'practice_answers'),

    practiceFinish: (sessionId, objectiveId) => safeWrap(async () => {
      const courseId = (typeof DB !== 'undefined' && DB.course) ? DB.course.id : '';
      const cfg = EducMindDB.getCoursePracticeConfig(courseId);
      const officialScores = (await dbCall(EducMindDB.listEvidence([objectiveId])).catch(() => [])).map((e) => Number(e.score || 0));
      const res = await apiRequest('POST', '/api/practice/finish', { session_id: sessionId, official_scores: officialScores, course_config: cfg });
      if (res.evidence_recorded) {
        // Also record snapshot locally
        try {
          const { doc, setDoc, serverTimestamp } = api();
          const snapId = genId();
          const ts = serverTimestamp();
          await setDoc(doc(firebaseDb, 'mastery_snapshots', snapId), {
            id: snapId,
            class_id: DB.classId || '',
            teacher_id: DB.course ? DB.course.teacher_id : me(),
            student_id: me(),
            objective_id: objectiveId,
            mastery_score: Number(res.mastery_score || 0),
            evidence_count: officialScores.length + 1,
            recorded_at: nowIso(),
            createdAt: ts,
            updatedAt: ts,
          });
        } catch (_) {}
      }
      return res;
    }, OperationType.WRITE, 'practice_sessions'),

    /* ===== Phase 3: Class Overview & Assignment Targeting ===== */
    listAssignmentTargets: (assignmentIds) => safeWrap(async () => {
      const set = new Set(assignmentIds || []);
      if (!set.size) return [];
      const field = isTeacherRole() ? 'teacher_id' : 'student_id';
      return (await queryByField('assignment_targets', field, me())).filter((t) => set.has(t.assignment_id));
    }, OperationType.LIST, 'assignment_targets'),

    createAssignmentTarget: (row) => safeWrap(async () => {
      const asg = await getById('assignments', row.assignment_id);
      if (!asg) throw new Error('Assignment not found');
      const { doc, setDoc, serverTimestamp, arrayUnion } = api();
      const id = `${row.assignment_id}_${row.student_id}`;
      const ts = serverTimestamp();
      const item = {
        id,
        class_id: asg.class_id,
        teacher_id: asg.teacher_id,
        assignment_id: row.assignment_id,
        student_id: row.student_id,
        target_group: row.target_group || null,
        createdAt: ts,
        updatedAt: ts,
      };
      await setDoc(doc(firebaseDb, 'assignment_targets', id), item);
      await setDoc(doc(firebaseDb, 'assignments', asg.id), { target_mode: 'TARGETED', target_group: row.target_group || null, target_student_ids: arrayUnion(row.student_id) }, { merge: true }).catch(async () => {
        const { updateDoc } = api();
        await updateDoc(doc(firebaseDb, 'assignments', asg.id), { target_mode: 'TARGETED', target_group: row.target_group || null, updatedAt: ts });
      });
      return item;
    }, OperationType.CREATE, 'assignment_targets'),

    createAssignmentTargets: (rows) => safeWrap(async () => {
      if (!rows || !rows.length) return [];
      const asgId = rows[0].assignment_id;
      const asg = await getById('assignments', asgId);
      if (!asg) throw new Error('Assignment not found');
      const { doc, writeBatch, serverTimestamp, arrayUnion } = api();
      const batch = writeBatch(firebaseDb);
      const ts = serverTimestamp();
      const ids = [];
      for (const r of rows) {
        const id = `${r.assignment_id}_${r.student_id}`;
        ids.push(r.student_id);
        batch.set(doc(firebaseDb, 'assignment_targets', id), {
          id,
          class_id: asg.class_id,
          teacher_id: asg.teacher_id,
          assignment_id: r.assignment_id,
          student_id: r.student_id,
          target_group: r.target_group || null,
          createdAt: ts,
          updatedAt: ts,
        });
      }
      batch.update(doc(firebaseDb, 'assignments', asgId), { target_mode: 'TARGETED', target_group: rows[0].target_group || null, target_student_ids: arrayUnion(...ids), updatedAt: ts });
      await batch.commit();
      return rows;
    }, OperationType.CREATE, 'assignment_targets'),

    deleteAssignmentTargets: (assignmentId, studentIds) => safeWrap(async () => {
      const { doc, writeBatch, serverTimestamp, arrayRemove } = api();
      const batch = writeBatch(firebaseDb);
      for (const sid of (studentIds || [])) batch.delete(doc(firebaseDb, 'assignment_targets', `${assignmentId}_${sid}`));
      if (studentIds && studentIds.length) batch.update(doc(firebaseDb, 'assignments', assignmentId), { target_student_ids: arrayRemove(...studentIds), updatedAt: serverTimestamp() });
      await batch.commit();
      return studentIds;
    }, OperationType.DELETE, 'assignment_targets'),

    getClassOverview: (courseId) => safeWrap(async () => {
      if (!dbIsTeacher()) throw new Error('Chỉ giáo viên mới xem được trang chất lượng lớp học.');
      const cfg = EducMindDB.getCoursePracticeConfig(courseId);
      const content = await dbLoadContent();
      const objIds = content.objectives.map((o) => o.id);
      const [mastery, gaps, recommendations, members, profiles, evidence, questions, practiceSessions] = await Promise.all([
        dbCallIn(EducMindDB.listMastery, objIds).catch(() => []),
        dbCallIn(EducMindDB.listGaps, objIds).catch(() => []),
        dbCall(EducMindDB.listRecommendations()).catch(() => []),
        dbCallIn(EducMindDB.listMembers, [DB.classId]).catch(() => []),
        dbCallIn(EducMindDB.listProfiles, (await dbCallIn(EducMindDB.listMembers, [DB.classId]).catch(() => [])).map((m) => m.student_id)).catch(() => []),
        dbCallIn(EducMindDB.listEvidence, objIds).catch(() => []),
        dbCall(EducMindDB.listQuestions(courseId)).catch(() => []),
        dbCall(EducMindDB.listPracticeSessions()).catch(() => []),
      ]);
      return { content, mastery, gaps, recommendations, members, profilesById: dbById(profiles), evidence, questions, practiceSessions, cfg };
    }, OperationType.GET, 'assignments'),

    /* ----- Trò chơi ôn tập ----- */
    gameQuestions: (courseId) => safeWrap(async () => {
      const qs = await getByIds('questions', await getClassIndexIds(courseId, 'question_ids'));
      const autoKinds = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_IN_BLANK', 'MATCHING'];
      return qs.filter((q) => !q.deleted_at && autoKinds.includes(q.kind));
    }, OperationType.GET, 'questions'),

    listGameSessions: (courseId) => safeWrap(async () => {
      const field = isTeacherRole() ? 'teacher_id' : 'student_id';
      return (await queryByField('game_sessions', field, me()))
        .filter((s) => s.course_id === courseId)
        .sort((a, b) => String(b.played_at || '').localeCompare(String(a.played_at || '')))
        .slice(0, 100);
    }, OperationType.LIST, 'game_sessions'),

    createGameSession: (row) => safeWrap(async () => {
      const meta = await resolveCourseMeta(row.course_id);
      const { doc, setDoc, serverTimestamp } = api();
      const id = genId();
      const ts = serverTimestamp();
      await setDoc(doc(firebaseDb, 'game_sessions', id), {
        id,
        class_id: meta.class_id,
        teacher_id: meta.teacher_id,
        student_id: me(),
        course_id: row.course_id,
        mode: row.mode,
        source: row.source || 'BANK',
        question_count: Number(row.question_count || 1),
        correct_count: Number(row.correct_count || 0),
        score: Number(row.score || 0),
        duration_seconds: row.duration_seconds != null ? Number(row.duration_seconds) : null,
        played_at: nowIso(),
        createdAt: ts,
        updatedAt: ts,
      });
      return await getById('game_sessions', id);
    }, OperationType.CREATE, 'game_sessions'),

    /* ----- Trợ lý Gemini hội thoại đa lượt ----- */
    listChatThreads: (lim) => safeWrap(async () => {
      return (await queryByField('ai_chat_threads', 'user_id', me()))
        .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
        .slice(0, lim || 40);
    }, OperationType.LIST, 'ai_chat_threads'),

    createChatThread: (row) => safeWrap(async () => {
      const { doc, setDoc, serverTimestamp } = api();
      const id = genId();
      const tsNow = nowIso();
      const ts = serverTimestamp();
      await setDoc(doc(firebaseDb, 'ai_chat_threads', id), {
        id,
        user_id: me(),
        class_id: row.class_id || null,
        role: isTeacherRole() ? 'TEACHER' : 'STUDENT',
        mode: row.mode || (isTeacherRole() ? 'lesson_plan' : 'tutor'),
        title: String(row.title || 'Cuộc trò chuyện mới').slice(0, 200),
        created_at: tsNow,
        updated_at: tsNow,
        createdAt: ts,
        updatedAt: ts,
      });
      return await getById('ai_chat_threads', id);
    }, OperationType.CREATE, 'ai_chat_threads'),

    updateChatThread: (id, row) => safeWrap(async () => {
      const { doc, updateDoc, serverTimestamp } = api();
      const patch = { updated_at: nowIso(), updatedAt: serverTimestamp() };
      for (const k of ['title', 'mode', 'class_id']) {
        if (k in row) patch[k] = row[k];
      }
      await updateDoc(doc(firebaseDb, 'ai_chat_threads', id), patch);
      return await getById('ai_chat_threads', id);
    }, OperationType.UPDATE, `ai_chat_threads/${id}`),

    deleteChatThread: (id) => safeWrap(async () => {
      const msgs = (await queryByField('ai_chat_messages', 'user_id', me())).filter((m) => m.thread_id === id);
      const { doc, writeBatch } = api();
      const batch = writeBatch(firebaseDb);
      for (const m of msgs) batch.delete(doc(firebaseDb, 'ai_chat_messages', m.id));
      batch.delete(doc(firebaseDb, 'ai_chat_threads', id));
      await batch.commit();
      return [{ id }];
    }, OperationType.DELETE, `ai_chat_threads/${id}`),

    listChatMessages: (threadId, lim) => safeWrap(async () => {
      return (await queryByField('ai_chat_messages', 'user_id', me()))
        .filter((m) => m.thread_id === threadId)
        .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
        .slice(0, lim || 80);
    }, OperationType.LIST, 'ai_chat_messages'),

    sendAiChat: (payload) => safeWrap(async () => {
      const uid = me();
      const userRole = isTeacherRole() ? 'TEACHER' : 'STUDENT';
      const isTeacher = userRole === 'TEACHER';

      let history = [];
      if (payload.thread_id) {
        history = (await queryByField('ai_chat_messages', 'user_id', uid).catch(() => []))
          .filter((m) => m.thread_id === payload.thread_id)
          .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
          .slice(-16)
          .map((m) => ({ sender: m.sender, content: m.content }));
      }

      const includeContext = payload.include_context !== false;
      const contextSummary = {
        role: userRole,
        page: payload.page || 'chat',
        ...(includeContext ? {} : { context_paused: true }),
      };
      const contextData = { active_page: payload.page || 'chat' };

      if (payload.class_id) {
        const courseCheck = await getById('courses', payload.class_id).catch(() => null);
        if (includeContext) {
          const cls = await getById('classes', payload.class_id).catch(() => null);
          if (cls && !cls.deleted_at) {
            contextSummary.class_name = cls.name;
            contextData.classroom = { name: cls.name, grade: cls.grade, school_year: cls.school_year };
            const course = courseCheck && !courseCheck.deleted_at ? courseCheck : null;
            if (course) {
              contextSummary.course_title = course.title;
              contextData.course = { title: course.title, description: String(course.description || '').slice(0, 600) };

              const [rawTopics, rawLessons, rawObjectives] = await Promise.all([
                isTeacher
                  ? queryByField('course_topics', 'teacher_id', uid).then((xs) => xs.filter((x) => x.course_id === course.id)).catch(() => [])
                  : getByIds('course_topics', await getClassIndexIds(cls.id, 'topic_ids').catch(() => [])).catch(() => []),
                isTeacher
                  ? queryByField('lessons', 'teacher_id', uid).then((xs) => xs.filter((x) => x.course_id === course.id)).catch(() => [])
                  : getByIds('lessons', await getClassIndexIds(cls.id, 'lesson_ids').catch(() => [])).catch(() => []),
                isTeacher
                  ? queryByField('learning_objectives', 'teacher_id', uid).catch(() => [])
                  : getByIds('learning_objectives', await getClassIndexIds(cls.id, 'objective_ids').catch(() => [])).catch(() => []),
              ]);

              const topics = rawTopics.filter((t) => !t.deleted_at).sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0)).slice(0, 20);
              const lessons = rawLessons.filter((l) => !l.deleted_at && (isTeacher || l.status === 'PUBLISHED')).sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0)).slice(0, 35);
              const lessonIds = new Set(lessons.map((l) => l.id));
              const objectives = rawObjectives.filter((o) => lessonIds.has(o.lesson_id)).sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''))).slice(0, 80);
              const topicMap = Object.fromEntries(topics.map((t) => [t.id, t.title]));
              const objById = Object.fromEntries(objectives.map((o) => [o.id, o]));
              const objIds = new Set(objectives.map((o) => o.id));

              contextData.curriculum = lessons.slice(0, 20).map((l) => ({
                id: l.id,
                topic: topicMap[l.topic_id] || '',
                title: l.title,
                summary: String(l.description || '').slice(0, 260),
                objectives: objectives.filter((o) => o.lesson_id === l.id).slice(0, 8).map((o) => ({ code: o.code, description: String(o.description || '').slice(0, 200) })),
              }));

              if (payload.lesson_id) {
                const focusedLesson = lessons.find((l) => l.id === payload.lesson_id);
                if (focusedLesson) {
                  contextSummary.lesson_title = focusedLesson.title;
                  contextData.focused_lesson = {
                    id: focusedLesson.id,
                    title: focusedLesson.title,
                    description: String(focusedLesson.description || '').slice(0, 2000),
                    objectives: objectives.filter((o) => o.lesson_id === focusedLesson.id).map((o) => ({ id: o.id, code: o.code, description: o.description })),
                  };
                }
              }

              if (payload.objective_id && objById[payload.objective_id]) {
                const focusedObj = objById[payload.objective_id];
                contextSummary.objective_code = focusedObj.code;
                contextData.focused_objective = { code: focusedObj.code, description: focusedObj.description };
              }

              if (objIds.size) {
                if (isTeacher) {
                  const [members, allGaps, allMastery] = await Promise.all([
                    queryByField('class_members', 'teacher_id', uid).then((xs) => xs.filter((m) => m.class_id === cls.id)).catch(() => []),
                    queryByField('knowledge_gaps', 'teacher_id', uid).then((xs) => xs.filter((g) => objIds.has(g.objective_id) && g.status === 'OPEN')).catch(() => []),
                    queryByField('mastery', 'teacher_id', uid).then((xs) => xs.filter((m) => objIds.has(m.objective_id))).catch(() => []),
                  ]);
                  const gapCounts = {};
                  for (const g of allGaps.slice(0, 200)) {
                    const o = objById[g.objective_id];
                    if (!o) continue;
                    if (!gapCounts[o.id]) gapCounts[o.id] = { code: o.code, description: String(o.description || '').slice(0, 160), open_count: 0 };
                    gapCounts[o.id].open_count += 1;
                  }
                  const masteryAgg = {};
                  for (const m of allMastery.slice(0, 500)) {
                    if (!masteryAgg[m.objective_id]) masteryAgg[m.objective_id] = { sum: 0, n: 0 };
                    masteryAgg[m.objective_id].sum += Number(m.mastery_score || 0);
                    masteryAgg[m.objective_id].n += 1;
                  }
                  contextData.class_analytics = {
                    enrolled_students: members.length,
                    open_gap_count: allGaps.length,
                    top_open_gaps: Object.values(gapCounts).sort((a, b) => b.open_count - a.open_count).slice(0, 8),
                    objective_mastery_averages: Object.entries(masteryAgg).slice(0, 12).map(([oid, agg]) => ({
                      code: (objById[oid] && objById[oid].code) || oid,
                      avg_percent: Math.round((agg.sum / Math.max(1, agg.n)) * 100),
                      evidence_students: agg.n,
                    })),
                  };
                  contextSummary.open_gaps = allGaps.length;
                } else {
                  const [myMastery, myGaps, myRecs] = await Promise.all([
                    queryByField('mastery', 'student_id', uid).then((xs) => xs.filter((m) => objIds.has(m.objective_id))).catch(() => []),
                    queryByField('knowledge_gaps', 'student_id', uid).then((xs) => xs.filter((g) => objIds.has(g.objective_id) && g.status === 'OPEN')).catch(() => []),
                    queryByField('recommendations', 'student_id', uid).then((xs) => xs.filter((r) => r.status === 'ACTIVE' || r.status === 'ACCEPTED').slice(0, 10)).catch(() => []),
                  ]);
                  contextData.student_learning_state = {
                    mastery: myMastery.slice(0, 20).map((m) => {
                      const o = objById[m.objective_id];
                      return { code: (o && o.code) || '', description: String((o && o.description) || '').slice(0, 140), percent: Math.round(Number(m.mastery_score || 0) * 100), evidence_count: m.evidence_count };
                    }),
                    open_gaps: myGaps.map((g) => {
                      const o = objById[g.objective_id];
                      return { code: (o && o.code) || '', description: String((o && o.description) || '').slice(0, 160), reason: g.reason || '' };
                    }),
                    active_recommendations: myRecs.map((r) => {
                      const o = r.objective_id ? objById[r.objective_id] : null;
                      return { kind: r.kind, objective: o ? `${o.code}: ${String(o.description || '').slice(0, 120)}` : '', reason: r.reason || '' };
                    }),
                  };
                  contextSummary.open_gaps = myGaps.length;
                }
              }
            }
          }
        }
      }

      const result = await apiRequest('POST', '/api/ai/chat', {
        ...payload,
        role: userRole,
        /* Bài tập / bài kiểm tra đang mở: máy chủ kiểm tra công tắc AI của riêng bài đó. */
        work_kind: payload.work_kind === 'assessment' || payload.work_kind === 'assignment' ? payload.work_kind : undefined,
        work_id: typeof payload.work_id === 'string' ? payload.work_id.slice(0, 200) : undefined,
        history,
        contextData,
        contextSummary,
      });
      const { doc, writeBatch, serverTimestamp } = api();
      const tsNow = nowIso();
      const tsNow2 = new Date(Date.now() + 1).toISOString();
      const ts = serverTimestamp();

      let threadId = payload.thread_id || '';
      const existingThread = threadId ? await getById('ai_chat_threads', threadId).catch(() => null) : null;
      const batch = writeBatch(firebaseDb);

      if (!existingThread) {
        threadId = threadId || genId();
        batch.set(doc(firebaseDb, 'ai_chat_threads', threadId), {
          id: threadId,
          user_id: uid,
          class_id: payload.class_id || null,
          role: userRole,
          mode: payload.mode || (userRole === 'TEACHER' ? 'lesson_plan' : 'tutor'),
          title: String(result.suggestedTitle || payload.message || 'Cuộc trò chuyện mới').slice(0, 200),
          created_at: tsNow,
          updated_at: tsNow2,
          createdAt: ts,
          updatedAt: ts,
        });
      } else {
        batch.update(doc(firebaseDb, 'ai_chat_threads', threadId), {
          mode: payload.mode || existingThread.mode,
          class_id: payload.class_id !== undefined ? payload.class_id : existingThread.class_id,
          ...(result.suggestedTitle && existingThread.title === 'Cuộc trò chuyện mới' ? { title: String(result.suggestedTitle).slice(0, 200) } : {}),
          updated_at: tsNow2,
          updatedAt: ts,
        });
      }

      const userMsgId = genId();
      const assistantMsgId = genId();
      const userMessage = {
        id: userMsgId,
        user_id: uid,
        thread_id: threadId,
        sender: 'user',
        model: null,
        content: String(payload.message || '').slice(0, 30000),
        artifacts: null,
        context_summary: null,
        created_at: tsNow,
        createdAt: ts,
        updatedAt: ts,
      };
      const assistantMessage = {
        id: assistantMsgId,
        user_id: uid,
        thread_id: threadId,
        sender: 'model',
        model: result.modelUsed || payload.model || 'gemini-3.1-flash-lite',
        content: String(result.replyText || '').slice(0, 30000),
        artifacts: result.artifacts || null,
        context_summary: result.contextSummary || null,
        created_at: tsNow2,
        createdAt: ts,
        updatedAt: ts,
      };
      batch.set(doc(firebaseDb, 'ai_chat_messages', userMsgId), userMessage);
      batch.set(doc(firebaseDb, 'ai_chat_messages', assistantMsgId), assistantMessage);
      await batch.commit();

      const savedThread = await getById('ai_chat_threads', threadId);
      return {
        thread: savedThread,
        userMessage: { ...userMessage, created_at: tsNow },
        assistantMessage: { ...assistantMessage, created_at: tsNow2 },
        modelUsed: result.modelUsed,
        contextSummary: result.contextSummary,
      };
    }, OperationType.WRITE, 'ai_chat'),

    saveChatQuestionsToDrafts: (lessonId, items) => safeWrap(async () => {
      if (!lessonId || !Array.isArray(items) || !items.length) throw new Error('Thiếu bài học hoặc câu hỏi.');
      const { doc, writeBatch, serverTimestamp } = api();
      const batch = writeBatch(firebaseDb);
      const ts = serverTimestamp();
      const tsNow = nowIso();
      const reqId = genId();
      batch.set(doc(firebaseDb, 'ai_generation_requests', reqId), {
        id: reqId,
        teacher_id: me(),
        lesson_id: lessonId,
        quantity: items.length,
        parameters: { source: 'gemini_chat' },
        status: 'COMPLETED',
        error_message: null,
        created_at: tsNow,
        completed_at: tsNow,
        createdAt: ts,
        updatedAt: ts,
      });
      for (const q of items) {
        const oid = genId();
        batch.set(doc(firebaseDb, 'ai_generation_outputs', oid), {
          id: oid,
          teacher_id: me(),
          request_id: reqId,
          content: String(q.content || '').slice(0, 5000),
          kind: q.kind || 'SINGLE_CHOICE',
          objective_id: q.objective_id || null,
          difficulty: q.difficulty || 'MEDIUM',
          bloom_level: q.bloom_level || null,
          options: q.options ?? null,
          correct_answer: q.correct_answer ?? null,
          review_status: 'PENDING_REVIEW',
          review_note: null,
          approved_question_id: null,
          reviewed_by: null,
          reviewed_at: null,
          createdAt: ts,
          updatedAt: ts,
        });
      }
      await batch.commit();
      return { request_id: reqId, count: items.length };
    }, OperationType.CREATE, 'ai_generation_outputs'),
  };
})();
