/* EducMind · js/09-render.js
   Hàm render(): chọn màn hình theo trạng thái đăng nhập và đặt lại vị trí nút thu gọn thanh bên. */
/* ===== Hiển thị ===== */
/* Tay nắm thu gọn bám đúng mép phải của thẻ điều hướng, luôn ở giữa chiều cao cửa sổ */
function placeSideToggle(){
  const t=document.querySelector('.side-toggle'),n=document.querySelector('.side');
  if(!t||!n){return}
  const r=n.getBoundingClientRect();
  if(window.innerWidth<=900){
    t.style.removeProperty('--tog-x');
    const y=Math.round(r.top+(r.height-(t.offsetHeight||40))/2)+'px';
    if(t.style.getPropertyValue('--tog-y')!==y)t.style.setProperty('--tog-y',y);
    return;
  }
  t.style.removeProperty('--tog-y');
  const half=t.offsetWidth/2||15,x=Math.round(r.right-half)+'px';
  if(t.style.getPropertyValue('--tog-x')!==x)t.style.setProperty('--tog-x',x);
}
addEventListener('resize',()=>requestAnimationFrame(placeSideToggle));
addEventListener('scroll',()=>{if(window.innerWidth<=900)requestAnimationFrame(placeSideToggle)},{passive:true});
function render(){
  authGuard();
  try{
    if(logged&&sess?.backend){dbRender()}
    else if(!logged&&authHtml()){}
    else{
      document.title='Đăng nhập | EducMind';
      app.innerHTML=`<main class="login-wrap"><div class="login">${brandLogoHtml()}<h1 id="pageTitle" tabindex="-1">Đăng nhập EducMind</h1><p class="sub">Hệ thống sử dụng tài khoản Google đã xác minh. Nếu màn hình này xuất hiện, hãy tải lại trang.</p><button type="button" class="btn" data-app-act="reloadPage">Tải lại trang</button></div></main>`;
    }
    if(focusId){const el=document.getElementById(focusId);if(el)el.focus({preventScroll:true});focusId=null}
    if(flashId){const f=document.getElementById(flashId);if(f){f.classList.add('flash');f.scrollIntoView({block:'center'});setTimeout(()=>f.classList.remove('flash'),3500)}flashId=null}
    try{requestAnimationFrame(placeSideToggle)}catch(_e){}
  }catch(e){
    console.error('Render error:',e);
    app.innerHTML=`<main class="login-wrap"><div class="login" style="padding:2rem;color:#dc2626"><h2>Lỗi hiển thị</h2><p>${esc(e.message||e)}</p><button type="button" class="btn" data-app-act="reloadPage">Tải lại trang</button></div></main>`;
  }
}
