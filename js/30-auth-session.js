/* EducMind · js/30-auth-session.js
   Quy tắc phiên đăng nhập: thời hạn không hoạt động, độ dài mật khẩu tối thiểu và bảo vệ phiên Firebase. */
const SESS_IDLE=30,PW_MIN=8;
function authGuard(){
  /* Mở liên kết đặt lại mật khẩu: luôn hiện màn hình đặt mật khẩu mới, kể cả khi phiên vừa được khôi phục từ liên kết. */
  if(backendRecovery&&logged){logged=false;sess=null;role='T'}
  if(!logged||!sess)return;
  if(sess.exp||Date.now()-sess.t>SESS_IDLE*60000){
    const wasBackend=!!sess.backend;
    logged=false;sess=null;role='T';authMode='login';authMsg='';
    authErr='Phiên làm việc đã hết hạn do không hoạt động. Thao tác chưa lưu không được ghi nhận. Hãy đăng nhập lại.';
    /* Phiên Firebase: xóa dữ liệu khỏi bộ nhớ và đăng xuất khỏi Firebase Auth, để tải lại trang không tự đăng nhập lại. */
    if(wasBackend){
      if(typeof dbReset==='function')dbReset();
      if(typeof dbClearRouteHash==='function')dbClearRouteHash();
      if(typeof FirebaseRuntime!=='undefined'&&FirebaseRuntime&&firebaseAuth){
        FirebaseRuntime.authApi.signOut(firebaseAuth).catch(console.error);
      }
    }
  }
  else sess.t=Date.now();
}
