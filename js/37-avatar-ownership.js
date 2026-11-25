/* EducMind · js/37-avatar-ownership.js
   Ảnh đại diện lưu cục bộ trên trình duyệt theo từng tài khoản. */
const avatarStorageKey=()=>`educmind.avatar:${String((sess&&sess.email)||'guest').toLowerCase()}`;
function avatarPhotoData(){
  try{return safeImageSrc(localStorage.getItem(avatarStorageKey())||'')}catch(e){return ''}
}
function avatarPickerHtml(avatar){
  return `<button type='button' class='avatar-pick' aria-label='Đổi ảnh đại diện' title='Đổi ảnh đại diện' data-app-act='openAvatarUpload'>${avatar}</button><input id='avatar-upload' type='file' accept='image/png,image/jpeg,image/webp,image/gif' hidden data-app-change='avatarFileChanged'>`;
}
function uploadAvatar(file){
  if(!file)return;
  if(!/^image\/(png|jpeg|webp|gif)$/i.test(file.type)){toast('Hãy chọn ảnh PNG, JPG, WEBP hoặc GIF.');return}
  if(file.size>15*1024*1024){toast('Ảnh đại diện cần nhỏ hơn 15 MB.');return}
  const reader=new FileReader();reader.onerror=()=>toast('Không đọc được tệp ảnh.');
  reader.onload=()=>{const img=new Image();img.onerror=()=>toast('Tệp này không phải ảnh hợp lệ.');img.onload=()=>{
    try{
      const size=512,scale=Math.min(1,size/img.naturalWidth,size/img.naturalHeight),w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale)),canvas=document.createElement('canvas');
      canvas.width=w;canvas.height=h;const cx=canvas.getContext('2d');cx.fillStyle='#fff';cx.fillRect(0,0,w,h);cx.drawImage(img,0,0,w,h);
      const photo=canvas.toDataURL('image/jpeg',.84);
      localStorage.setItem(avatarStorageKey(),photo);
      render();toast('Đã cập nhật ảnh đại diện trên thiết bị này.');
    }catch(e){toast('Không lưu được ảnh đại diện. Hãy thử ảnh khác hoặc giải phóng dung lượng trình duyệt.')}
  };img.src=String(reader.result||'')};reader.readAsDataURL(file)
}
