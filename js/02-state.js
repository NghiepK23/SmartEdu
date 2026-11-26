/* EducMind · js/02-state.js
   Trạng thái chung của ứng dụng: thanh bên, phiên đăng nhập và bộ định danh phần tử.
   Lưu ý: Tệp này nạp trước mọi tệp khác có dùng trạng thái. appReady do js/76-main.js bật lên khi mọi tệp đã nạp xong. */
/* ===== Trạng thái ===== */
let logged=false,role='T',focusId=null,flashId=null,sidebarCollapsed=false,sidebarWidth=196;
const app=document.getElementById('app');
/* Phiên đăng nhập và trạng thái màn hình đăng nhập. */
let sess=null,authMode='login',authErr='',authMsg='',authEmail='';
/* appReady: js/76-main.js bật cờ này khi mọi tệp đã nạp xong. Sự kiện đến sớm hơn
   (ví dụ mở liên kết đặt lại mật khẩu khi mạng chậm) chỉ ghi nhận trạng thái; màn hình được vẽ ở lần render() đầu tiên. */
let appReady=false;
