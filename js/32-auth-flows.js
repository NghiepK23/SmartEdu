/* EducMind · js/32-auth-flows.js
   Điều hướng đăng nhập, đăng ký, quên mật khẩu và hoàn tất thiết lập tài khoản lần đầu qua Firebase Auth. */
function goLogin() {
  if (authMode === 'onboarding') {
    void cancelGoogleOnboarding();
    return;
  }
  authMode = 'login';
  authErr = '';
  authMsg = '';
  if (typeof authNeedsVerify !== 'undefined') authNeedsVerify = false;
  render();
}
function goSignup() {
  authMode = 'signup';
  authErr = '';
  authMsg = '';
  if (typeof authNeedsVerify !== 'undefined') authNeedsVerify = false;
  render();
}
function goResetPassword() {
  authMode = 'reset';
  authErr = '';
  authMsg = '';
  if (typeof authNeedsVerify !== 'undefined') authNeedsVerify = false;
  render();
}
function doLogin() {
  return googleLogin();
}
function doEmailLogin(form) {
  return emailLogin(form);
}
function doEmailSignup(form) {
  return emailSignup(form);
}
function doEmailReset(form) {
  return emailResetPassword(form);
}
function doCompleteOnboarding() {
  return completeGoogleOnboarding();
}
function toggleAuthPassword(btn) {
  const id = btn && btn.dataset ? btn.dataset.target : '';
  const input = id ? document.getElementById(id) : null;
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  btn.setAttribute('aria-pressed', String(show));
  btn.setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
  btn.innerHTML = ic(show ? 'eye' : 'eyeOff', 18);
}
