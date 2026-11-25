/* EducMind · js/06-shell.js
   Điều hướng chung (đăng xuất, thu gọn thanh bên), thông báo nhanh toast() và thành phần khung dùng chung. */
function logout(){
  const wasBackend=!!(sess&&sess.backend);
  const uid=sess&&sess.userId;
  logged=false;role='T';sess=null;authMode='login';authErr='';authMsg='';focusId='loginBtn';layer4BgOpen=false;
  if(wasBackend){
    if(uid&&typeof dbDraftClearUserAll==='function')dbDraftClearUserAll(uid);
    if(typeof dbReset==='function')dbReset();
    if(typeof dbClearRouteHash==='function')dbClearRouteHash();
    if(typeof FirebaseRuntime!=='undefined'&&FirebaseRuntime&&firebaseAuth){
      FirebaseRuntime.authApi.signOut(firebaseAuth).catch(console.error);
    }
  }
  render();
}
function toggleSidebar(){sidebarCollapsed=!sidebarCollapsed;render()}

let toastTimer;
function toast(t){
  const n=document.getElementById('toast');
  if(!n)return;
  n.textContent=t;n.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.classList.remove('show'),2800);
}
function metric(icon,label,value,hint,isText){
  return `<div class="card metric"><span class="mi">${ic(icon,20)}</span><div><div class="label">${label}</div><strong class="${isText?'text':''}">${value}</strong><div class="hint">${hint}</div></div></div>`;
}
const note=t=>`<div class="notice">${ic('info',16)}<div>${t}</div></div>`;
const APP_ACT={
  reloadPage:()=>{if(typeof location!=='undefined'&&location.reload)location.reload();},
  logout:()=>logout(),
  toggleSidebar:()=>toggleSidebar(),
  toggleTheme:()=>toggleTheme(),
  toggleLoginCardTheme:()=>toggleLoginCardTheme(),
  toggleLoginBgPanel:()=>toggleLoginBgPanel(),
  applyLoginBgUrl:()=>applyLoginBgUrl(),
  clearLoginBackground:()=>clearLoginBackground(),
  loginBgFileChanged:(el)=>{if(el.files&&el.files[0])uploadLoginBg(el.files[0]);el.value='';},
  toggleLayer4BgPanel:()=>toggleLayer4BgPanel(),
  applyLayer4BgUrl:()=>applyLayer4BgUrl(),
  clearLayer4Background:()=>clearLayer4Background(),
  layer4BgFileChanged:(el)=>{if(el.files&&el.files[0])uploadLayer4Bg(el.files[0]);el.value='';},
  openAvatarUpload:()=>{const input=document.getElementById('avatar-upload');if(input)input.click();},
  avatarFileChanged:(el)=>{if(el.files&&el.files[0])uploadAvatar(el.files[0]);el.value='';},
  authGoLogin:()=>goLogin(),
  authGoSignup:()=>goSignup(),
  authGoReset:()=>goResetPassword(),
  authEmailLogin:(form)=>doEmailLogin(form),
  authEmailSignup:(form)=>doEmailSignup(form),
  authEmailReset:(form)=>doEmailReset(form),
  authTogglePassword:(el)=>toggleAuthPassword(el),
  authResendVerify:()=>resendEmailVerification(),
  authCheckVerify:()=>checkEmailVerification(),
  authGoogleLogin:()=>doLogin(),
  authCompleteOnboarding:()=>doCompleteOnboarding(),
  authCancelOnboarding:()=>cancelGoogleOnboarding(),
  authSignupRoleChanged:(el)=>signupRoleChanged(el.value),
};
if(typeof app!=='undefined'&&app&&typeof app.addEventListener==='function'){
  app.addEventListener('click',(ev)=>{
    const el=ev.target&&ev.target.closest?ev.target.closest('[data-app-act]'):null;
    if(!el||el.tagName==='FORM'||el.disabled)return;
    const fn=APP_ACT[el.dataset.appAct];
    if(fn){ev.preventDefault();fn(el,ev);}
  });
  app.addEventListener('submit',(ev)=>{
    const form=ev.target&&ev.target.closest?ev.target.closest('form[data-app-act]'):null;
    if(!form)return;
    const fn=APP_ACT[form.dataset.appAct];
    if(fn){ev.preventDefault();fn(form,ev);}
  });
  app.addEventListener('change',(ev)=>{
    const el=ev.target&&ev.target.closest?ev.target.closest('[data-app-change]'):null;
    if(!el)return;
    const fn=APP_ACT[el.dataset.appChange];
    if(fn)fn(el,ev);
  });
}

