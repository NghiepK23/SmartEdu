/* EducMind · js/09-render.js
   Hàm render(): chọn màn hình theo trạng thái đăng nhập và đặt lại vị trí nút thu gọn thanh bên. */
/* ===== Hiển thị ===== */
/* Tay nắm thu gọn: vị trí do CSS quyết định (bám mép phải thanh bên, xem
   css/06-floating-nav.css). Không đo bằng JS rồi ghi toạ độ nữa: mỗi lần vẽ lại,
   phần tử mới luôn xuất hiện ở giá trị mặc định rồi mới nhảy về toạ độ đo được,
   nên bấm bất kỳ mục nào ở thanh bên hay tab bar nổi đều thấy nút này "chạy" ngang.
   Chỉ cần một hàm rỗng để các chỗ gọi cũ vẫn chạy an toàn. */
function placeSideToggle(){}
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
