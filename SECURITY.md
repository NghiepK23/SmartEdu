# Security Policy

## Báo cáo lỗ hổng

Nếu bạn phát hiện lỗ hổng trong EducMind, vui lòng **không mở issue công khai**. Hãy gửi mô tả
(vị trí, bước tái hiện, ảnh hưởng) tới email bảo trì của repository và cho tối đa 7 ngày để
xử lý trước khi công bố. Mọi báo cáo đều được ghi nhận, kể cả báo cáo bị từ chối.

## Phạm vi và mô hình bảo mật

| Hạng mục | Cơ chế |
|---|---|
| Phân quyền dữ liệu | `firestore.rules` — chặn toàn bộ theo mặc định (`allow read, write: if false`), mở dần theo `request.auth.uid`, `email_verified` và quan hệ lớp/khóa học |
| Xác thực API máy chủ | `server.js` xác thực Firebase ID token trên mọi route `/api/*`, vai trò lấy từ `profiles/{uid}.role` trên Firestore |
| API key Gemini của người dùng | Mã hóa AES-256-GCM ở máy chủ, khóa suy ra từ `AI_KEY_ENCRYPTION_KEY` (biến môi trường, không commit); trình duyệt chỉ thấy 4 ký tự cuối |
| Cấu hình Firebase | `firebase-applet-config.json` **không** được commit (xem `.gitignore`); `server.js` phục vụ tại `/firebase-applet-config.json` lúc chạy |
| Chống rò rỉ bí mật | `tests/secrets.test.mjs` quét repo và fail nếu có khóa Google API, PEM, `.env` hoặc cấu hình dự án bị commit |

## Vì sao khoá `AIza…` xuất hiện trong cảnh báo secret scanning

Firebase Web SDK bắt buộc phải có `apiKey` dạng `AIza…` ở phía trình duyệt; đây là **định danh
công khai của dự án**, không phải bí mật. Quyền truy cập dữ liệu do `firestore.rules`, Storage
rules và Firebase ID token quyết định, **không** do việc giấu khoá này.

Từ commit `4107cb2` (PR #4), repo không còn commit khoá hay cấu hình Firebase, và gói
`js/vendor/firebase-sdk.min.js` chỉ chứa thư viện. Cảnh báo còn hiển thị trên GitHub là do
**commit cũ trong lịch sử**; cách xử lý ghi ở mục dưới.

## Việc cần làm khi khoá đã nằm trong lịch sử git

1. **Giới hạn khoá theo HTTP referrer** (khuyến nghị, hiệu quả nhất): Google Cloud Console →
   APIs & Services → Credentials → chọn khoá → *Application restrictions* = `HTTP referrers`,
   chỉ cho domain của website; *API restrictions* = chỉ Identity Toolkit / Firestore / Storage.
2. **Xoay khoá**: tạo khoá mới, cập nhật `firebase-applet-config.json` trên máy chủ, xoá khoá cũ.
3. **Đóng cảnh báo** trên GitHub: Security → Secret scanning → chọn cảnh báo → *Close as*
   → `Revoked` (nếu đã xoay khoá) hoặc `Won't fix` (khoá công khai, đã giới hạn referrer).
4. **Xoá khỏi lịch sử** (tuỳ chọn, phá vỡ mọi bản clone): `git filter-repo` hoặc BFG rồi force-push.

## Kiểm tra định kỳ

- `npm test` — bao gồm `tests/secrets.test.mjs` (chặn bí mật) và `tests/dom-xss.test.mjs`.
- Firestore Console → Rules: xác nhận đã deploy `firestore.rules` của nhánh `main`.
- Storage → Rules: đặt mặc định `allow read, write: if false;` rồi mở dần cho người dùng đã
  đăng nhập; repository hiện **chưa** có `storage.rules`, hãy kiểm tra trực tiếp trên Console.
