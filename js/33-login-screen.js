/* EducMind · js/33-login-screen.js
   Màn hình đăng nhập (authHtml), ảnh nền đăng nhập và ảnh nền ứng dụng. */
const LOGIN_BG_KEY='educmind.login.background.v1';
let authBgOpen=false;
function loginBgValue(){try{return localStorage.getItem(LOGIN_BG_KEY)||''}catch(e){return ''}}
function applyLoginBackground(){
  const el=document.querySelector('.login-wrap');if(!el)return;
  const src=safeImageSrc(loginBgValue());
  if(!src){el.style.backgroundImage='none';return}
  const escaped=src.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/[\n\r]/g,'');
  el.style.backgroundImage='linear-gradient(135deg,rgba(13,34,33,.14),rgba(13,34,33,.03)),url("'+escaped+'")';
  el.style.backgroundPosition='center,center';el.style.backgroundSize='cover,cover';el.style.backgroundRepeat='no-repeat,no-repeat';
}
function loginBgStatus(message){const el=document.getElementById('login-bg-status');if(el)el.textContent=message}
function toggleLoginBgPanel(){
  const panel=document.getElementById('login-bg-panel'),btn=document.getElementById('login-bg-trigger');if(!panel)return;
  authBgOpen=!authBgOpen;panel.hidden=!authBgOpen;if(btn)btn.setAttribute('aria-expanded',String(authBgOpen));
}
function storeLoginBackground(value){
  try{localStorage.setItem(LOGIN_BG_KEY,value);applyLoginBackground();loginBgStatus('Nền đăng nhập đã được cập nhật và lưu trên thiết bị này.');return true}
  catch(e){loginBgStatus('Không lưu được ảnh nền. Hãy dùng ảnh nhỏ hơn hoặc giải phóng dung lượng trình duyệt.');return false}
}
function loginBgImageUrl(raw){
  const u=new URL(raw),host=u.hostname.toLowerCase();if(!['http:','https:'].includes(u.protocol))throw new Error('protocol');
  if((host==='pexels.com'||host.endsWith('.pexels.com'))&&!host.startsWith('images.')){
    const m=u.pathname.match(/-(\d+)\/?$/);if(!m)throw new Error('pexels-page');
    return 'https://images.pexels.com/photos/'+m[1]+'/pexels-photo-'+m[1]+'.jpeg?auto=compress&cs=tinysrgb&w=1920';
  }
  if((host==='unsplash.com'||host.endsWith('.unsplash.com'))&&!host.startsWith('images.'))throw new Error('unsplash-page');
  return u.href;
}
function applyLoginBgUrl(){
  const input=document.getElementById('login-bg-url'),raw=(input&&input.value||'').trim();if(!raw){loginBgStatus('Hãy dán liên kết ảnh trực tiếp.');return}
  let url;try{url=loginBgImageUrl(raw)}catch(e){
    loginBgStatus(e.message==='pexels-page'?'Không tìm thấy mã ảnh trong liên kết Pexels. Hãy dùng liên kết trang ảnh hoặc URL CDN trực tiếp.':e.message==='unsplash-page'?'Đây là link trang Unsplash, không phải tệp ảnh. Mở ảnh, nhấp phải và chọn “Sao chép địa chỉ hình ảnh”, rồi dán URL images.unsplash.com.':'Liên kết chưa hợp lệ. Hãy dùng URL công khai bắt đầu bằng http:// hoặc https://.');return
  }
  loginBgStatus('Đang kiểm tra ảnh…');const probe=new Image();probe.onload=()=>{storeLoginBackground(url)};
  probe.onerror=()=>loginBgStatus('Không tải được ảnh từ liên kết này (có thể đây là trang web, không phải ảnh, hoặc bản xem trước đang chặn mạng). Hãy dùng địa chỉ ảnh trực tiếp hoặc tải ảnh về rồi chọn “Tải ảnh lên”.');
  probe.src=url;
}
function uploadLoginBg(file){
  if(!file)return;if(!/^image\/(png|jpeg|webp|gif)$/i.test(file.type)){loginBgStatus('Hãy chọn ảnh PNG, JPG, WEBP hoặc GIF.');return}
  if(file.size>15*1024*1024){loginBgStatus('Ảnh tải lên cần nhỏ hơn 15 MB.');return}
  const reader=new FileReader();reader.onerror=()=>loginBgStatus('Không đọc được tệp ảnh.');
  reader.onload=()=>{const img=new Image();img.onerror=()=>loginBgStatus('Tệp này không phải ảnh hợp lệ.');img.onload=()=>{
    try{const maxW=1920,maxH=1200,scale=Math.min(1,maxW/img.naturalWidth,maxH/img.naturalHeight),w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale)),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const cx=canvas.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,w,h);cx.drawImage(img,0,0,w,h);storeLoginBackground(canvas.toDataURL('image/jpeg',.84))}
    catch(e){loginBgStatus('Không thể xử lý ảnh này. Hãy thử PNG, JPG hoặc WEBP khác.')}
  };img.src=String(reader.result||'')};reader.readAsDataURL(file)
}
function clearLoginBackground(){try{localStorage.removeItem(LOGIN_BG_KEY)}catch(e){}applyLoginBackground();loginBgStatus('Đã xóa ảnh nền và trở về màu nền mặc định.')}
function loginBackgroundControls(){return `<div class='login-bg-controls'><button type='button' class='login-bg-trigger' id='login-bg-trigger' aria-expanded='${authBgOpen}' aria-controls='login-bg-panel' data-app-act='toggleLoginBgPanel'><span aria-hidden='true'>▧</span> Đổi ảnh nền</button><section class='login-bg-panel' id='login-bg-panel' aria-labelledby='login-bg-title' ${authBgOpen?'':'hidden'}><h2 id='login-bg-title'>Ảnh nền đăng nhập</h2><p>Dán URL ảnh trực tiếp hoặc link trang ảnh Pexels (hệ thống sẽ thử chuyển sang CDN). Với Unsplash, hãy mở ảnh rồi chọn “Sao chép địa chỉ hình ảnh”. Nếu preview chặn mạng, tải ảnh về và upload. Ảnh lưu trên trình duyệt này.</p><label for='login-bg-url'>Liên kết ảnh</label><input id='login-bg-url' type='url' placeholder='https://images.unsplash.com/photo-…' inputmode='url'><div class='login-bg-links'>Tìm ảnh tại <a href='https://unsplash.com/' target='_blank' rel='noopener noreferrer'>Unsplash</a><a href='https://www.pexels.com/' target='_blank' rel='noopener noreferrer'>Pexels</a></div><div class='login-bg-actions'><button type='button' class='btn' data-app-act='applyLoginBgUrl'>Dùng liên kết</button><button type='button' class='btn light' data-app-act='clearLoginBackground'>Xóa nền</button></div><label for='login-bg-file'>Hoặc tải ảnh lên</label><input id='login-bg-file' type='file' accept='image/png,image/jpeg,image/webp,image/gif' data-app-change='loginBgFileChanged'><div class='login-bg-status' id='login-bg-status' role='status'></div></section></div>`}
const LOGIN_CARD_THEME_KEY='educmind.login-card.theme';
function loginCardDarkEnabled(){try{return localStorage.getItem(LOGIN_CARD_THEME_KEY)==='dark'}catch(e){return false}}
function loginCardThemeIcon(dark){return dark?`<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><circle cx='12' cy='12' r='4'/><path d='M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42'/></svg>`:`<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M20.8 13A8.5 8.5 0 0 1 11 3.2 8.7 8.7 0 1 0 20.8 13Z'/><path d='M16.5 3.5v3m-1.5-1.5h3'/></svg>`}
function loginCardThemeButton(){const dark=loginCardDarkEnabled();return `<button type='button' class='login-theme-toggle' id='login-card-theme-toggle' aria-label='${dark?'Bật chế độ sáng':'Bật chế độ tối'} riêng cho thẻ đăng nhập' title='${dark?'Bật chế độ sáng':'Bật chế độ tối'} cho thẻ đăng nhập' aria-pressed='${dark}' data-app-act='toggleLoginCardTheme'>${loginCardThemeIcon(dark)}</button>`}
function toggleLoginCardTheme(){
  const card=document.querySelector('.login'),btn=document.getElementById('login-card-theme-toggle');if(!card)return;
  const dark=!card.classList.contains('login-dark');card.classList.toggle('login-dark',dark);
  try{localStorage.setItem(LOGIN_CARD_THEME_KEY,dark?'dark':'light')}catch(e){}
  if(btn){btn.setAttribute('aria-pressed',String(dark));btn.setAttribute('aria-label',(dark?'Bật chế độ sáng':'Bật chế độ tối')+' riêng cho thẻ đăng nhập');btn.title=(dark?'Bật chế độ sáng':'Bật chế độ tối')+' cho thẻ đăng nhập';btn.innerHTML=loginCardThemeIcon(dark)}
}
function loginGoogleSvg(){
  return `<svg class='login-google-ic' width='18' height='18' viewBox='0 0 24 24' aria-hidden='true'><path fill='#4285F4' d='M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3.01h3.88c2.27-2.09 3.55-5.17 3.55-8.88Z'/><path fill='#34A853' d='M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3.01c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.26v3.11A12 12 0 0 0 12 24Z'/><path fill='#FBBC05' d='M5.27 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.37-2.28V6.61H1.26A12 12 0 0 0 0 12c0 1.94.46 3.77 1.26 5.39l4.01-3.11Z'/><path fill='#EA4335' d='M12 4.76c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.26 6.61l4.01 3.11C6.22 6.87 8.87 4.76 12 4.76Z'/></svg>`;
}
function authHtml(){
  const logo=brandLogoHtml();
  const err=authErr?`<div class='notice login-notice' role='alert' style='background:var(--err-bg);color:var(--err-ink)'>${ic('alert',16)}<div>${esc(authErr)}</div></div>`:'',msg=authMsg?`<div class='notice login-notice' role='status'>${ic('info',16)}<div>${esc(authMsg)}</div></div>`:'';
  const showVerifyActions=typeof authNeedsVerify!=='undefined'&&authNeedsVerify&&typeof firebaseAuth!=='undefined'&&firebaseAuth&&firebaseAuth.currentUser;
  const verifyBar=showVerifyActions?`<div class='login-verify-actions'><button type='button' class='btn light mini' data-app-act='authCheckVerify' ${backendBusy?'disabled':''}>Tôi đã xác minh</button><button type='button' class='btn light mini' data-app-act='authResendVerify' ${backendBusy?'disabled':''}>Gửi lại email</button></div>`:'';
  const remembered=typeof readRememberedLoginEmail==='function'?readRememberedLoginEmail():'';
  const emailVal=authEmail||remembered;
  const back=`<button class='btn light' type='button' style='width:100%;justify-content:center;margin-top:8px' data-app-act='authCancelOnboarding' ${backendBusy?'disabled':''}>Dùng tài khoản khác</button>`;
  let b;
  if(authMode==='onboarding'){
    document.title='Hoàn tất hồ sơ | EducMind';
    b=`<h1 id='pageTitle' tabindex='-1'>Hoàn tất hồ sơ</h1><p class='sub'>Tài khoản: <b>${esc(authEmail)}</b></p>${msg}${err}<form data-app-act='authCompleteOnboarding' novalidate><fieldset class='su-role'><legend>Tôi là</legend><label><input type='radio' name='su-role' value='STUDENT' data-app-change='authSignupRoleChanged' ${authSignupRole!=='TEACHER'?'checked':''}><span>Học sinh</span></label><label><input type='radio' name='su-role' value='TEACHER' data-app-change='authSignupRoleChanged' ${authSignupRole==='TEACHER'?'checked':''}><span>Giáo viên</span></label></fieldset><div class='field'><label for='su-name'>Họ và tên</label><input id='su-name' autocomplete='name' maxlength='120' value="${esc(authSignupName)}" required></div><div id='su-teacher-fields' class='su-teacher-fields' ${authSignupRole==='TEACHER'?'':'hidden'}><div class='field'><label for='su-class'>Lớp</label><input id='su-class' maxlength='100' value="${esc(authSignupClassName)}" placeholder='Ví dụ: 10A1' autocomplete='off'></div><div class='field'><label for='su-subject'>Môn học</label><input id='su-subject' maxlength='120' value="${esc(authSignupSubject)}" placeholder='Ví dụ: Toán, Tin học...' autocomplete='off'></div></div><button class='btn primary login-cta' id='loginBtn' type='submit' ${backendBusy?'disabled':''}>${backendBusy?'Đang lưu hồ sơ…':'Hoàn tất thiết lập'}</button></form>${back}`;
  } else if(authMode==='signup'){
    document.title='Đăng ký | EducMind';
    b=`<h1 id='pageTitle' class='login-title' tabindex='-1'>Tạo tài khoản</h1><p class='sub login-sub'>Đăng ký tài khoản EducMind mới</p>${msg}${err}<form class='login-form' data-app-act='authEmailSignup' novalidate><div class='login-pill-field'><span class='login-pill-ic' aria-hidden='true'>${ic('mail',18)}</span><input id='su-email' name='email' type='email' placeholder='Nhập email của bạn' autocomplete='email' value="${esc(authEmail)}" required></div><div class='login-pill-field'><span class='login-pill-ic' aria-hidden='true'>${ic('lock',18)}</span><input id='su-pass' name='password' type='password' placeholder='Tạo mật khẩu (tối thiểu 8 ký tự)' autocomplete='new-password' required><button type='button' class='login-eye-btn' data-app-act='authTogglePassword' data-target='su-pass' aria-label='Hiện mật khẩu' aria-pressed='false'>${ic('eyeOff',18)}</button></div><div class='login-pill-field'><span class='login-pill-ic' aria-hidden='true'>${ic('lock',18)}</span><input id='su-pass2' name='password_confirm' type='password' placeholder='Nhập lại mật khẩu' autocomplete='new-password' required><button type='button' class='login-eye-btn' data-app-act='authTogglePassword' data-target='su-pass2' aria-label='Hiện mật khẩu' aria-pressed='false'>${ic('eyeOff',18)}</button></div><button class='btn primary login-cta' id='loginBtn' type='submit' ${backendBusy?'disabled':''}><span>${backendBusy?'Đang đăng ký…':'Đăng ký'}</span>${ic('arrow',18)}</button></form><div class='login-or'><span>hoặc</span></div><button class='btn light login-google-btn' type='button' data-app-act='authGoogleLogin' ${backendBusy?'disabled':''}>${loginGoogleSvg()}<span>Tiếp tục với Google</span></button><div class='login-foot'>Đã có tài khoản? <button type='button' class='login-foot-link' data-app-act='authGoLogin'>Đăng nhập</button></div>`;
  } else if(authMode==='reset'){
    document.title='Quên mật khẩu | EducMind';
    b=`<h1 id='pageTitle' class='login-title' tabindex='-1'>Quên mật khẩu</h1><p class='sub login-sub'>Nhập email để nhận liên kết đặt lại mật khẩu</p>${msg}${err}<form class='login-form' data-app-act='authEmailReset' novalidate><div class='login-pill-field'><span class='login-pill-ic' aria-hidden='true'>${ic('mail',18)}</span><input id='reset-email' name='email' type='email' placeholder='Nhập email của bạn' autocomplete='email' value="${esc(emailVal)}" required></div><button class='btn primary login-cta' id='loginBtn' type='submit' ${backendBusy?'disabled':''}><span>${backendBusy?'Đang gửi liên kết…':'Gửi liên kết đặt lại'}</span>${ic('arrow',18)}</button></form><div class='login-foot'>Đã nhớ mật khẩu? <button type='button' class='login-foot-link' data-app-act='authGoLogin'>Đăng nhập</button></div>`;
  } else {
    document.title='Đăng nhập | EducMind';
    b=`<h1 id='pageTitle' class='login-title' tabindex='-1'>Chào mừng trở lại</h1><p class='sub login-sub'>Đăng nhập vào tài khoản của bạn</p>${msg}${err}${verifyBar}<form class='login-form' data-app-act='authEmailLogin' novalidate><div class='login-pill-field'><span class='login-pill-ic' aria-hidden='true'>${ic('mail',18)}</span><input id='login-email' name='email' type='email' placeholder='Nhập email của bạn' autocomplete='email' value="${esc(emailVal)}" required></div><div class='login-pill-field'><span class='login-pill-ic' aria-hidden='true'>${ic('lock',18)}</span><input id='login-pass' name='password' type='password' placeholder='Nhập mật khẩu' autocomplete='current-password' required><button type='button' class='login-eye-btn' data-app-act='authTogglePassword' data-target='login-pass' aria-label='Hiện mật khẩu' aria-pressed='false'>${ic('eyeOff',18)}</button></div><div class='login-meta-row'><label class='login-remember'><input id='login-remember' type='checkbox' ${remembered?'checked':''}><span>Ghi nhớ đăng nhập</span></label><button type='button' class='login-text-link' data-app-act='authGoReset'>Quên mật khẩu?</button></div><button class='btn primary login-cta' id='loginBtn' type='submit' ${backendBusy?'disabled':''}><span>${backendBusy?'Đang đăng nhập…':'Đăng nhập'}</span>${ic('arrow',18)}</button></form><div class='login-or'><span>hoặc</span></div><button class='btn light login-google-btn' type='button' data-app-act='authGoogleLogin' ${backendBusy?'disabled':''}>${loginGoogleSvg()}<span>Tiếp tục với Google</span></button><div class='login-foot'>Chưa có tài khoản? <button type='button' class='login-foot-link' data-app-act='authGoSignup'>Đăng ký</button></div>`;
  }
  app.innerHTML=`<main class='login-wrap'><div class='login ${loginCardDarkEnabled()?'login-dark':''}'>
    <div class='login-header-badge'>${logo}</div>
    ${loginCardThemeButton()}
    ${b}
  </div>${loginBackgroundControls()}</main>`;
  applyLoginBackground();
  return true;
}
/* Nền riêng của layer 4, lưu cục bộ theo từng tài khoản giáo viên/học sinh. */
let layer4BgOpen=false;
function layer4BackgroundKey(){return 'educmind.layer4-background:'+String((sess&&sess.email)||'guest').toLowerCase()}
function layer4BackgroundData(){try{return localStorage.getItem(layer4BackgroundKey())||''}catch(e){return ''}}
function layer4BgStatus(message){const el=document.getElementById('app-bg-status');if(el)el.textContent=message}
function toggleLayer4BgPanel(){
  const panel=document.getElementById('app-bg-panel'),btn=document.getElementById('app-bg-trigger');if(!panel)return;
  layer4BgOpen=!layer4BgOpen;panel.hidden=!layer4BgOpen;if(btn)btn.setAttribute('aria-expanded',String(layer4BgOpen));
}
function storeLayer4Background(value){
  try{localStorage.setItem(layer4BackgroundKey(),value);applyLayer4Background();layer4BgStatus('Ảnh nền màn hình chính đã được cập nhật và lưu cho tài khoản này.');return true}
  catch(e){layer4BgStatus('Không lưu được ảnh nền. Hãy dùng ảnh nhỏ hơn hoặc giải phóng dung lượng trình duyệt.');return false}
}
function applyLayer4BgUrl(){
  const input=document.getElementById('app-bg-url'),raw=(input&&input.value||'').trim();if(!raw){layer4BgStatus('Hãy dán liên kết ảnh trực tiếp.');return}
  let url;try{url=loginBgImageUrl(raw)}catch(e){
    layer4BgStatus(e.message==='pexels-page'?'Không tìm thấy mã ảnh trong liên kết Pexels. Hãy dùng liên kết trang ảnh hoặc URL CDN trực tiếp.':e.message==='unsplash-page'?'Đây là link trang Unsplash, không phải tệp ảnh. Hãy dùng URL ảnh images.unsplash.com.':'Liên kết chưa hợp lệ. Hãy dùng URL công khai bắt đầu bằng http:// hoặc https://.');return
  }
  layer4BgStatus('Đang kiểm tra ảnh…');const probe=new Image();probe.onload=()=>storeLayer4Background(url);
  probe.onerror=()=>layer4BgStatus('Không tải được ảnh từ liên kết này. Hãy dùng địa chỉ ảnh trực tiếp hoặc tải ảnh lên.');
  probe.src=url;
}
function uploadLayer4Bg(file){
  if(!file)return;if(!/^image\/(png|jpeg|webp|gif)$/i.test(file.type)){layer4BgStatus('Hãy chọn ảnh PNG, JPG, WEBP hoặc GIF.');return}
  if(file.size>15*1024*1024){layer4BgStatus('Ảnh tải lên cần nhỏ hơn 15 MB.');return}
  const reader=new FileReader();reader.onerror=()=>layer4BgStatus('Không đọc được tệp ảnh.');
  reader.onload=()=>{const img=new Image();img.onerror=()=>layer4BgStatus('Tệp này không phải ảnh hợp lệ.');img.onload=()=>{
    try{const maxW=1920,maxH=1200,scale=Math.min(1,maxW/img.naturalWidth,maxH/img.naturalHeight),w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale)),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const cx=canvas.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,w,h);cx.drawImage(img,0,0,w,h);storeLayer4Background(canvas.toDataURL('image/jpeg',.84))}
    catch(e){layer4BgStatus('Không thể xử lý ảnh này. Hãy thử PNG, JPG hoặc WEBP khác.')}
  };img.src=String(reader.result||'')};reader.readAsDataURL(file)
}
function layer4BackgroundControls(){return `<div class='app-bg-controls'><button type='button' class='app-bg-trigger' id='app-bg-trigger' aria-expanded='${layer4BgOpen}' aria-controls='app-bg-panel' data-app-act='toggleLayer4BgPanel'><span aria-hidden='true'>▧</span> Đổi ảnh nền</button><section class='app-bg-panel' id='app-bg-panel' aria-labelledby='app-bg-title' ${layer4BgOpen?'':'hidden'}><h2 id='app-bg-title'>Ảnh nền màn hình chính</h2><p>Nền được lưu riêng cho tài khoản này trên thiết bị. Dán URL ảnh trực tiếp hoặc tải ảnh lên.</p><label for='app-bg-url'>Liên kết ảnh</label><input id='app-bg-url' type='url' placeholder='https://images.unsplash.com/photo-…' inputmode='url'><div class='app-bg-links'>Tìm ảnh tại <a href='https://unsplash.com/' target='_blank' rel='noopener noreferrer'>Unsplash</a><a href='https://www.pexels.com/' target='_blank' rel='noopener noreferrer'>Pexels</a></div><div class='app-bg-actions'><button type='button' class='btn' data-app-act='applyLayer4BgUrl'>Dùng liên kết</button><button type='button' class='btn light' data-app-act='clearLayer4Background'>Xóa nền</button></div><label for='app-bg-file'>Hoặc tải ảnh lên</label><input id='app-bg-file' type='file' accept='image/png,image/jpeg,image/webp,image/gif' data-app-change='layer4BgFileChanged'><div class='app-bg-status' id='app-bg-status' role='status'></div></section></div>`}
function applyLayer4Background(){
  const layout=document.querySelector('#app .layout');
  if(!layout)return;
  const data=layer4BackgroundData();
  // Keep the image tied to the viewport, not to #main's changing content height.
  layout.style.removeProperty('background-image');
  layout.style.removeProperty('background-size');
  layout.style.removeProperty('background-position');
  layout.style.removeProperty('background-repeat');
  const src=safeImageSrc(data);
  if(src){
    const escaped=src.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/[\n\r]/g,'');
    layout.style.setProperty('--layer4-bg-image',`url("${escaped}")`);
  }
  else layout.style.removeProperty('--layer4-bg-image');
}
function clearLayer4Background(){
  try{localStorage.removeItem(layer4BackgroundKey())}catch(e){layer4BgStatus('Không xóa được ảnh nền khỏi trình duyệt.');return}
  applyLayer4Background();layer4BgStatus('Đã xóa ảnh nền và trở về nền mặc định.');toast('Đã xóa ảnh nền màn hình chính.');
}
