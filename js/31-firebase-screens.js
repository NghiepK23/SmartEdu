/* EducMind · js/31-firebase-screens.js
   Đăng nhập bằng Google qua Firebase Auth, thiết lập hồ sơ lần đầu và khôi phục phiên. */
let authSignupName = '';
let authSignupRole = 'STUDENT';
let authSignupClassName = '';
let authSignupSubject = '';
let authNeedsVerify = false;
const LOGIN_REMEMBER_KEY = 'educmind.login.remember.v1';

function readRememberedLoginEmail() {
  try {
    return localStorage.getItem(LOGIN_REMEMBER_KEY) || '';
  } catch (_) {
    return '';
  }
}

function storeRememberedLoginEmail(email, remember) {
  try {
    if (remember && email) localStorage.setItem(LOGIN_REMEMBER_KEY, email);
    else localStorage.removeItem(LOGIN_REMEMBER_KEY);
  } catch (_) {}
}

function signupRoleChanged(value) {
  authSignupRole = value === 'TEACHER' ? 'TEACHER' : 'STUDENT';
  const fields = document.getElementById('su-teacher-fields');
  if (fields) fields.hidden = authSignupRole !== 'TEACHER';
}

function backendErrorText(e) {
  const code = String(e?.code || '');
  const m = String(e?.message || '');
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Email hoặc mật khẩu không đúng.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'Email này đã được đăng ký. Hãy đăng nhập hoặc dùng Quên mật khẩu.';
  }
  if (code === 'auth/weak-password') {
    return 'Mật khẩu quá yếu (cần ít nhất 8 ký tự).';
  }
  if (code === 'auth/invalid-email') {
    return 'Địa chỉ email không hợp lệ.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Bạn thao tác quá nhiều lần. Hãy đợi vài phút rồi thử lại.';
  }
  if (code === 'auth/user-disabled') {
    return 'Tài khoản này đã bị vô hiệu hóa.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Phương thức Email/Mật khẩu chưa được kích hoạt trong Firebase Console (Authentication → Sign-in method). Hãy bật "Email/Password" hoặc dùng nút "Đăng nhập bằng Google".';
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return 'Bạn đã đóng cửa sổ đăng nhập Google trước khi hoàn tất.';
  }
  if (code === 'auth/popup-blocked') {
    return 'Trình duyệt đang chặn cửa sổ bật lên. Hãy cho phép popup rồi thử lại.';
  }
  if (code === 'auth/unauthorized-domain') {
    const host = typeof window !== 'undefined' && window.location ? window.location.hostname : '';
    const pid = (typeof firebaseConfig !== 'undefined' && firebaseConfig && firebaseConfig.projectId) || '';
    const detail = host ? ` (${host}${pid ? ' · ' + pid : ''})` : '';
    return `Tên miền hiện tại${detail} chưa được cấp phép trong Firebase Auth. Hãy tải lại trang (Ctrl+F5) hoặc thêm tên miền này vào Firebase Console → Authentication → Settings → Authorized domains.`;
  }
  if (code === 'auth/internal-error') {
    return 'Lỗi nội bộ Firebase Auth khi mở cửa sổ đăng nhập Google. Hãy thử cho phép popup/cookie bên thứ ba hoặc tải lại trang.';
  }
  if (code === 'auth/operation-not-supported-in-this-environment') {
    return 'Trình duyệt hoặc khung hiển thị hiện tại không hỗ trợ đăng nhập popup. Hãy mở ứng dụng trong tab riêng.';
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return 'Email này đã được liên kết với một phương thức đăng nhập khác.';
  }
  if (code === 'auth/network-request-failed' || /Failed to fetch|NetworkError|Load failed|unavailable|offline/i.test(m)) {
    return 'Không kết nối được Firebase. Hãy kiểm tra mạng rồi thử lại.';
  }
  if (/permission-denied|PERMISSION_DENIED/i.test(code + ' ' + m)) {
    return 'Không có quyền truy cập hồ sơ hoặc dữ liệu. Hãy thử đăng nhập lại.';
  }
  return m || 'Không thể kết nối Firebase. Hãy kiểm tra mạng và cấu hình Auth.';
}

async function emailLogin(form) {
  if (!FirebaseRuntime || !firebaseAuth) {
    authErr = 'Không tải được Firebase SDK. Hãy tải lại trang rồi thử lại.';
    render();
    return;
  }
  const emailEl = (form && form.querySelector('#login-email')) || document.getElementById('login-email');
  const passEl = (form && form.querySelector('#login-pass')) || document.getElementById('login-pass');
  const remEl = (form && form.querySelector('#login-remember')) || document.getElementById('login-remember');
  const email = String(emailEl ? emailEl.value : '').trim().toLowerCase();
  const pass = String(passEl ? passEl.value : '');
  const remember = !!(remEl && remEl.checked);

  authEmail = email;
  authErr = '';
  authMsg = '';
  authNeedsVerify = false;
  storeRememberedLoginEmail(email, remember);

  if (!email) { authErr = 'Hãy nhập địa chỉ email.'; render(); return; }
  if (!pass) { authErr = 'Hãy nhập mật khẩu.'; render(); return; }

  backendBusy = true;
  render();
  try {
    const { signInWithEmailAndPassword } = FirebaseRuntime.authApi;
    const cred = await signInWithEmailAndPassword(firebaseAuth, email, pass);
    const user = cred && cred.user;
    if (!user) throw new Error('Không nhận được thông tin tài khoản.');
    backendBusy = false;
    if (!user.emailVerified) {
      authNeedsVerify = true;
      authErr = 'Email chưa được xác minh. Hãy mở hộp thư (kể cả mục Spam) và nhấn vào liên kết xác minh.';
      render();
      return;
    }
    await activateBackendSession(user);
  } catch (e) {
    backendBusy = false;
    authErr = 'Đăng nhập thất bại: ' + backendErrorText(e);
    render();
  }
}

async function emailSignup(form) {
  if (!FirebaseRuntime || !firebaseAuth) {
    authErr = 'Không tải được Firebase SDK. Hãy tải lại trang rồi thử lại.';
    render();
    return;
  }
  const emailEl = (form && form.querySelector('#su-email')) || document.getElementById('su-email');
  const passEl = (form && form.querySelector('#su-pass')) || document.getElementById('su-pass');
  const pass2El = (form && form.querySelector('#su-pass2')) || document.getElementById('su-pass2');
  const email = String(emailEl ? emailEl.value : '').trim().toLowerCase();
  const pass = String(passEl ? passEl.value : '');
  const pass2 = String(pass2El ? pass2El.value : '');
  const minPw = typeof PW_MIN === 'number' ? PW_MIN : 8;

  authEmail = email;
  authErr = '';
  authMsg = '';
  authNeedsVerify = false;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    authErr = 'Hãy nhập địa chỉ email hợp lệ.';
    render();
    return;
  }
  if (pass.length < minPw) {
    authErr = `Mật khẩu cần có ít nhất ${minPw} ký tự.`;
    render();
    return;
  }
  if (pass !== pass2) {
    authErr = 'Mật khẩu nhập lại không khớp.';
    render();
    return;
  }

  backendBusy = true;
  render();
  try {
    const { createUserWithEmailAndPassword, sendEmailVerification } = FirebaseRuntime.authApi;
    const cred = await createUserWithEmailAndPassword(firebaseAuth, email, pass);
    const user = cred && cred.user;
    if (!user) throw new Error('Không thể tạo tài khoản.');
    if (typeof sendEmailVerification === 'function') {
      await sendEmailVerification(user).catch(() => {});
    }
    backendBusy = false;
    authNeedsVerify = true;
    authMode = 'login';
    authErr = '';
    authMsg = `Đã tạo tài khoản cho ${email}. Hãy kiểm tra hộp thư (kể cả Spam) để xác minh email trước khi đăng nhập và chọn vai trò.`;
    render();
  } catch (e) {
    backendBusy = false;
    authErr = 'Đăng ký thất bại: ' + backendErrorText(e);
    render();
  }
}

async function emailResetPassword(form) {
  if (!FirebaseRuntime || !firebaseAuth) {
    authErr = 'Không tải được Firebase SDK. Hãy tải lại trang rồi thử lại.';
    render();
    return;
  }
  const emailEl = (form && form.querySelector('#reset-email')) || document.getElementById('reset-email');
  const email = String(emailEl ? emailEl.value : '').trim().toLowerCase();
  authEmail = email;
  authErr = '';
  authMsg = '';
  authNeedsVerify = false;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    authErr = 'Hãy nhập địa chỉ email hợp lệ.';
    render();
    return;
  }

  backendBusy = true;
  render();
  try {
    const { sendPasswordResetEmail } = FirebaseRuntime.authApi;
    await sendPasswordResetEmail(firebaseAuth, email);
    backendBusy = false;
    authMode = 'login';
    authErr = '';
    authMsg = `Đã gửi liên kết đặt lại mật khẩu tới ${email}. Hãy kiểm tra hộp thư của bạn.`;
    render();
  } catch (e) {
    backendBusy = false;
    authErr = 'Không gửi được email đặt lại mật khẩu: ' + backendErrorText(e);
    render();
  }
}

async function resendEmailVerification() {
  if (!FirebaseRuntime || !firebaseAuth || !firebaseAuth.currentUser) {
    authErr = 'Hãy đăng nhập lại bằng email và mật khẩu để gửi lại liên kết xác minh.';
    authNeedsVerify = false;
    render();
    return;
  }
  backendBusy = true;
  authErr = '';
  render();
  try {
    const { sendEmailVerification } = FirebaseRuntime.authApi;
    await sendEmailVerification(firebaseAuth.currentUser);
    backendBusy = false;
    authMsg = 'Đã gửi lại email xác minh. Hãy mở hộp thư và nhấn vào liên kết xác nhận.';
    render();
  } catch (e) {
    backendBusy = false;
    authErr = 'Không gửi lại được email xác minh: ' + backendErrorText(e);
    render();
  }
}

async function checkEmailVerification() {
  if (!FirebaseRuntime || !firebaseAuth || !firebaseAuth.currentUser) {
    authNeedsVerify = false;
    authErr = 'Phiên kiểm tra đã hết hạn. Hãy đăng nhập lại.';
    render();
    return;
  }
  backendBusy = true;
  authErr = '';
  render();
  try {
    const user = firebaseAuth.currentUser;
    if (typeof user.reload === 'function') await user.reload();
    if (!user.emailVerified) {
      backendBusy = false;
      authErr = 'Email vẫn chưa được xác minh. Hãy nhấn vào liên kết trong hộp thư rồi thử lại.';
      render();
      return;
    }
    backendBusy = false;
    authNeedsVerify = false;
    await activateBackendSession(user);
  } catch (e) {
    backendBusy = false;
    authErr = 'Không kiểm tra được trạng thái xác minh: ' + backendErrorText(e);
    render();
  }
}

async function googleLogin() {
  if (!FirebaseRuntime || !firebaseAuth) {
    authErr = 'Không tải được Firebase SDK. Hãy tải lại trang rồi thử lại.';
    render();
    return;
  }
  authErr = '';
  authMsg = '';
  authNeedsVerify = false;
  backendBusy = true;
  render();
  try {
    const { GoogleAuthProvider, signInWithPopup, signOut } = FirebaseRuntime.authApi;
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(firebaseAuth, provider);
    const user = result && result.user;
    if (!user) throw new Error('Không nhận được thông tin tài khoản Google.');
    if (!user.emailVerified) {
      await signOut(firebaseAuth).catch(() => {});
      throw new Error('Tài khoản Google chưa xác minh email.');
    }
    backendBusy = false;
    await activateBackendSession(user);
  } catch (e) {
    console.error('Firebase Google Sign-In error:', e?.code, e?.message, e);
    backendBusy = false;
    authErr = 'Đăng nhập thất bại: ' + backendErrorText(e);
    render();
  }
}

async function activateBackendSession(user) {
  if (!user || !user.uid) {
    authErr = 'Không nhận được phiên đăng nhập.';
    render();
    return;
  }
  if (!user.emailVerified) {
    if (FirebaseRuntime && firebaseAuth) {
      await FirebaseRuntime.authApi.signOut(firebaseAuth).catch(() => {});
    }
    authEmail = String(user.email || authEmail || '').trim().toLowerCase();
    authMode = 'login';
    authNeedsVerify = false;
    authErr = 'Email chưa được xác minh. Hãy xác minh email trong hộp thư trước khi đăng nhập.';
    render();
    return;
  }
  await testFirebaseConnection();
  const { data: profile, error } = await EducMindDB.getProfile(user.uid);
  if (error) {
    if (FirebaseRuntime && firebaseAuth) {
      await FirebaseRuntime.authApi.signOut(firebaseAuth).catch(() => {});
    }
    authErr = 'Không đọc được hồ sơ tài khoản: ' + backendErrorText(error);
    render();
    return;
  }
  if (!profile) {
    authSignupName = (user.displayName || authSignupName || '').trim().slice(0, 120);
    authEmail = String(user.email || '').trim().toLowerCase();
    authMode = 'onboarding';
    authNeedsVerify = false;
    authErr = '';
    authMsg = 'Chào mừng bạn lần đầu đến với EducMind. Hãy chọn vai trò để hoàn tất hồ sơ.';
    render();
    return;
  }
  authSignupName = '';
  authSignupClassName = '';
  authSignupSubject = '';
  sess = {
    email: profile.email || user.email,
    role: profile.role === 'TEACHER' ? 'T' : 'S',
    t: Date.now(),
    backend: true,
    userId: profile.id,
  };
  role = sess.role;
  logged = true;
  authMode = 'login';
  authErr = '';
  authMsg = '';
  authEmail = '';
  await dbStart(profile);
}

async function completeGoogleOnboarding() {
  if (!FirebaseRuntime || !firebaseAuth || !firebaseDb) {
    authErr = 'Không tải được Firebase SDK. Hãy tải lại trang.';
    render();
    return;
  }
  const user = firebaseAuth.currentUser;
  if (!user || !user.uid || !user.emailVerified) {
    authMode = 'login';
    authErr = 'Phiên đăng nhập Google không còn hợp lệ. Hãy đăng nhập lại.';
    render();
    return;
  }
  const name = (document.getElementById('su-name')?.value || '').trim();
  const suRole = document.querySelector('input[name="su-role"]:checked')?.value === 'TEACHER' ? 'TEACHER' : 'STUDENT';
  const className = (document.getElementById('su-class')?.value || '').trim();
  const subject = (document.getElementById('su-subject')?.value || '').trim();
  const email = String(user.email || authEmail || '').trim().toLowerCase();

  authSignupName = name;
  authSignupRole = suRole;
  authSignupClassName = className;
  authSignupSubject = subject;
  authErr = '';
  authMsg = '';

  if (!name) { authErr = 'Nhập họ và tên.'; render(); return; }
  if (name.length > 120) { authErr = 'Họ và tên tối đa 120 ký tự.'; render(); return; }
  if (!email || email.length < 3) { authErr = 'Không xác định được email từ tài khoản Google.'; render(); return; }
  if (suRole === 'TEACHER' && !!className !== !!subject) {
    authErr = 'Nếu nhập thông tin lớp lúc thiết lập, hãy nhập cả tên lớp và môn học.';
    render();
    return;
  }
  if (suRole === 'TEACHER' && className.length > 100) { authErr = 'Tên lớp tối đa 100 ký tự.'; render(); return; }
  if (suRole === 'TEACHER' && subject.length > 120) { authErr = 'Tên môn học tối đa 120 ký tự.'; render(); return; }

  backendBusy = true;
  render();
  try {
    const { doc, writeBatch, serverTimestamp } = FirebaseRuntime.firestoreApi;
    const emailHash = await educMindSha256Hex(email);
    const ts = serverTimestamp();
    const batch = writeBatch(firebaseDb);
    batch.set(doc(firebaseDb, 'profiles', user.uid), {
      id: user.uid,
      email,
      full_name: name,
      role: suRole,
      createdAt: ts,
      updatedAt: ts,
    });
    batch.set(doc(firebaseDb, 'email_index', emailHash), {
      email_hash: emailHash,
      user_id: user.uid,
      role: suRole,
      createdAt: ts,
      updatedAt: ts,
    });
    await batch.commit();

    const profile = { id: user.uid, email, full_name: name, role: suRole };
    authSignupName = '';
    authSignupClassName = '';
    authSignupSubject = '';
    sess = {
      email,
      role: suRole === 'TEACHER' ? 'T' : 'S',
      t: Date.now(),
      backend: true,
      userId: user.uid,
    };
    role = sess.role;
    logged = true;
    authMode = 'login';
    authErr = '';
    authMsg = '';
    authEmail = '';
    backendBusy = false;

    if (suRole === 'TEACHER' && className && subject) {
      await EducMindDB.createClassWithSubject(className, null, null, subject).catch(console.warn);
    }
    await dbStart(profile);
  } catch (e) {
    backendBusy = false;
    authErr = 'Không lưu được hồ sơ tài khoản: ' + backendErrorText(e);
    render();
  }
}

async function cancelGoogleOnboarding() {
  if (FirebaseRuntime && firebaseAuth) {
    await FirebaseRuntime.authApi.signOut(firebaseAuth).catch(() => {});
  }
  authSignupName = '';
  authSignupClassName = '';
  authSignupSubject = '';
  authEmail = '';
  authMode = 'login';
  authErr = '';
  authMsg = '';
  render();
}

async function restoreBackendSession() {
  /* Cấu hình Firebase do server phục vụ lúc chạy: chờ tới khi nạp xong mới khôi phục phiên. */
  if (typeof firebaseConfigReady !== 'undefined' && firebaseConfigReady) await firebaseConfigReady;
  if (!FirebaseRuntime || !firebaseAuth || backendRecovery) {
    if (!firebaseAuth && !backendRecovery) {
      authErr = 'Không tải được cấu hình Firebase. Hãy kiểm tra máy chủ phục vụ /firebase-applet-config.json rồi tải lại trang.';
      if (typeof render === 'function') render();
    }
    return;
  }
  if (firebaseAuth.currentUser) {
    await activateBackendSession(firebaseAuth.currentUser);
    return;
  }
  const { onAuthStateChanged } = FirebaseRuntime.authApi;
  const user = await new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; try { unsub(); } catch (_) {} resolve(null); }
    }, 4000);
    const unsub = onAuthStateChanged(firebaseAuth, (u) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        try { unsub(); } catch (_) {}
        resolve(u || null);
      }
    });
  });
  if (user && !backendRecovery && !logged) {
    await activateBackendSession(user);
  }
}
