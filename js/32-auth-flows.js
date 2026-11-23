/* EducMind · js/32-auth-flows.js
   Luồng đăng nhập, quên mật khẩu, xác minh OTP và đặt lại mật khẩu qua Supabase Auth. */
function goLogin(){authMode='login';authErr='';authMsg='';render()}
function goForgot(){authMode='forgot';authErr='';authMsg='';render()}
function doLogin(){backendLogin()}
function doForgot(){
  const em=(document.getElementById('em')?.value||'').trim().toLowerCase();authEmail=em;
  if(!supabaseClient){authErr='Không tải được Supabase SDK. Hãy kết nối Internet rồi tải lại trang.';render();return}
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){authErr='Nhập đúng địa chỉ email.';render();return}
  backendBusy=true;authErr='';authMsg='';render();
  supabaseClient.auth.resetPasswordForEmail(em,{redirectTo:location.href.split('#')[0]}).then(({error})=>{
    backendBusy=false;authMode=error?'forgot':'verify-recovery';
    authErr=error?'Không gửi được mã đặt lại mật khẩu: '+backendErrorText(error):'';
    authMsg=error?'':'Nếu email tồn tại, mã đặt lại mật khẩu đã được gửi.';
    render();
  });
}
async function verifyBackendCode(purpose){
  if(!supabaseClient)return;
  const token=(document.getElementById('auth-code')?.value||'').trim();
  if(!/^\d{6,10}$/.test(token)){authErr='Nhập mã gồm 6–10 chữ số trong email.';render();return}
  const email=authEmail.trim().toLowerCase();
  backendBusy=true;authErr='';authMsg='';render();
  const {data,error}=await supabaseClient.auth.verifyOtp({email,token,type:purpose==='signup'?'email':'recovery'});
  backendBusy=false;
  if(error){authErr='Mã xác nhận không hợp lệ hoặc đã hết hạn: '+backendErrorText(error);render();return}
  if(purpose==='recovery'){
    if(!data.session){authErr='Mã đã được xác nhận nhưng chưa mở được phiên đặt lại mật khẩu. Hãy gửi mã mới.';authMode='login';render();return}
    backendRecovery=true;authMode='reset';authErr='';authMsg='Mã đã xác nhận. Hãy đặt mật khẩu mới.';render();return;
  }
  if(!data.session){authErr='Mã đã được xác nhận nhưng chưa mở được phiên đăng nhập. Hãy thử đăng nhập lại.';authMode='login';render();return}
  authSignupName='';authSignupClassName='';authSignupSubject='';await activateBackendSession(data.session);
}
async function resendBackendCode(purpose){
  if(!supabaseClient)return;
  const email=authEmail.trim().toLowerCase();
  backendBusy=true;authErr='';authMsg='';render();
  const result=purpose==='signup'
    ? await supabaseClient.auth.resend({type:'signup',email})
    : await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo:location.href.split('#')[0]});
  backendBusy=false;
  if(result.error){authErr='Không gửi lại được mã: '+backendErrorText(result.error);render();return}
  authMsg=purpose==='signup'?'Nếu tài khoản chưa được xác nhận, mã xác nhận đã được gửi lại.':'Nếu email tồn tại, mã đặt lại mật khẩu đã được gửi lại.';
  render();
}
function doReset(){
  const n=document.getElementById('np')?.value||'',n2=document.getElementById('np2')?.value||'';
  if(!supabaseClient||!backendRecovery){
    authMode='login';authErr='Liên kết hoặc phiên đặt lại mật khẩu không còn hợp lệ. Hãy gửi yêu cầu mới.';authMsg='';render();return;
  }
  if(n.length<PW_MIN){authErr='Mật khẩu mới phải có ít nhất '+PW_MIN+' ký tự.';render();return}
  if(n!==n2){authErr='Hai lần nhập mật khẩu không khớp.';render();return}
  backendBusy=true;authErr='';render();
  supabaseClient.auth.updateUser({password:n}).then(async({error})=>{
    backendBusy=false;
    if(error){authErr='Không cập nhật được mật khẩu: '+backendErrorText(error);render();return}
    backendRecovery=false;await supabaseClient.auth.signOut();
    logged=false;sess=null;role='T';authMode='login';authEmail='';
    authMsg='Đã cập nhật mật khẩu. Hãy đăng nhập lại.';render();
  });
}
