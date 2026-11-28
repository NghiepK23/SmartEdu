# EducMind — Hệ thống quản lý dạy và học

Website quản lý lớp học, nội dung bài học, bài tập, câu hỏi, đề kiểm tra và tiến độ học tập.
Giao diện viết bằng **JavaScript thuần** (không framework, không cần bước build), backend dùng **Firebase**
(Authentication + Firestore + Storage), toàn bộ mã nguồn lưu trong repository này.
Giáo viên có thể tạo nhiều dạng câu hỏi, chọn câu từ ngân hàng hoặc nhập câu hỏi bằng Excel/CSV để gắn vào bài tập; học sinh trả lời trực tiếp trên web hoặc nộp bài/tệp như trước. Giao diện dữ liệu thật tổ chức nội dung theo thư mục Chủ đề → Bài học, tách mục tiêu và tài liệu thành từng tab; bài tập và bài kiểm tra hiển thị dạng thẻ có thao tác thu gọn.

Để thêm câu hỏi vào bài tập, hãy tạo bài tập thành bản nháp trước. Trang chi tiết của bài tập có mục
**Câu hỏi của bài tập** để tạo câu hỏi theo dạng, chọn câu từ ngân hàng hoặc nhập tệp Excel/CSV;
câu hỏi mới tạo hay nhập từ mục này sẽ được gắn trực tiếp vào bài tập.

## Chạy website trên máy cá nhân

Website cần **máy chủ Express** (`server.js`) vì mọi lời gọi Gemini đều đi qua máy chủ:

```bash
# trong thư mục gốc của repository
npm install
npm start          # http://localhost:3000
```

Mở `http://localhost:3000/` trong trình duyệt. Nếu chỉ muốn xem giao diện tĩnh (không có
Trợ lý AI), có thể dùng `python3 -m http.server 5500` hoặc Live Server.

> Domain đang chạy phải được thêm vào **Authentication → Settings → Authorized domains**
> của Firebase, nếu không đăng nhập/đặt lại mật khẩu sẽ bị từ chối. Muốn đưa website lên
> Internet (Firebase Hosting, Vercel, Netlify…) thì thêm domain mới vào danh sách này trước.

## Chạy unit test & kiểm tra cú pháp

Ứng dụng hỗ trợ cả kiểm thử tự động trong Node.js (không cần cài thêm thư viện ngoài) và trang kiểm thử trực tiếp trên trình duyệt:

```bash
# Chạy toàn bộ unit test tự động (cấu hình khối lớp, hàm tiện ích, đọc CSV, phân tích nhập câu hỏi, chấm điểm 5 dạng trò chơi)
npm test

# Kiểm tra cú pháp toàn bộ mã JavaScript
npm run lint
```

Để mở trang kiểm thử cấu hình khối lớp trên trình duyệt:

1. Khởi động máy chủ (`npm start` trên cổng `3000`, hoặc `python3 -m http.server 5500`).
2. Mở `/tests/grade-config.test.html` (ví dụ `http://localhost:3000/tests/grade-config.test.html`).
3. Xem số kiểm thử đạt/lỗi và kết quả chi tiết trên trang. Không cần đăng nhập hoặc thiết lập backend.

## Tài khoản và phân quyền

Hệ thống chỉ dùng **tài khoản thật** đăng ký bằng email:

1. Bấm **Tạo tài khoản**, chọn vai trò **Giáo viên (TEACHER)** hoặc **Học sinh (STUDENT)**
   (vai trò không đổi được sau khi tạo).
2. Mở hộp thư (kể cả thư rác), nhập **mã xác nhận email**, rồi đăng nhập.
3. Khi đăng ký vai trò **Giáo viên**, có thể nhập **tên lớp** và **môn học** ngay hoặc
   bổ sung sau trong **Tài khoản**. Giáo viên cần hoàn tất hai thông tin này trước khi
   dùng chức năng dạy học; hệ thống sẽ nhắc nếu còn thiếu. Khi lưu, backend tạo/cập nhật
   lớp, khóa học chứa môn học và **mã lớp 8 ký tự**. Học sinh tự đăng ký rồi vào lớp bằng mã đó.
4. Giáo viên cũng có thể **tự tạo tài khoản cho học sinh** ngay trong trang lớp học
   (tự đặt mật khẩu giao cho học sinh).

Tải lại trang bao nhiêu lần cũng giữ nguyên đăng nhập và dữ liệu — mọi thứ được lưu
trên Firestore, không còn dữ liệu tạm trong bộ nhớ.

Tên môn học được lưu trong `courses.title` và liên kết với lớp qua `courses.class_id`.
Thông tin lớp/môn học trong Tài khoản và báo cáo/Xuất Excel-Word đều lấy từ dữ liệu này.

## Cấu trúc mã nguồn

```
index.html                 Trang duy nhất, nạp toàn bộ CSS/JS theo thứ tự số trong tên tệp
css/
  01-base.css … 12-db.css  Kiểu dáng; số càng lớn càng được nạp sau (ghi đè)
js/
  00-grade-config.js       Dải khối lớp dùng chung cho các biểu mẫu và kiểm tra dữ liệu
  02-state.js … 77-liquid-glass.js
                           16 mô-đun giao diện dùng chung đã chuẩn hóa (trạng thái, Firebase API,
                           biểu tượng, tiện ích & kiểm tra URL, khung trang, chủ đề, xác thực/đăng nhập,
                           hình đại diện, mẫu nhập/bộ đọc tệp Excel–Word–CSV, lời chào giáo viên, hiệu ứng kính)
  db/                      Màn hình dữ liệu thật (đăng nhập Firebase), nạp trước js/76-main.js
    01-core.js             Vào app, đăng xuất, phiên, đồng bộ chuông báo
    02-shell.js            Vỏ ứng dụng: điều hướng theo vai trò, chuông thông báo
    03-classes.js … 13-report.js   Lớp học, nội dung, bài tập, câu hỏi, thi, tiến độ,
                           nhập/xuất, lịch & việc cần làm, báo cáo
    14-ai.js               AI tạo câu hỏi nháp (giáo viên)
    14b-ai-chat.js         Trợ lý AI: khung chat nổi và trang chat
    14c-ai-key.js          Quản lý API key Gemini (BYO key) + công tắc AI theo từng bài
    15-games.js            Trò chơi ôn tập 3 chế độ
    16-live.js             Realtime cho chuông thông báo (tự fallback polling)
  vendor/
    firebase-sdk.min.js    Firebase SDK (Auth, Firestore, Storage) ghim sẵn — không phụ thuộc CDN
tests/
  educmind.test.mjs        Bộ kiểm thử tự động Node.js cho các mô-đun nghiệp vụ
  grade-config.test.html   Trang kiểm thử cấu hình khối lớp trên trình duyệt
firestore.rules            Quy tắc bảo mật Firestore — nguồn chuẩn cho phân quyền dữ liệu
firebase-blueprint.json    Bản thiết kế dữ liệu (collections, trường) của ứng dụng
```

Quy ước: tệp **số nhỏ nạp trước**, tệp số lớn có thể dùng hàm/định nghĩa của tệp số nhỏ.
Muốn đổi dải khối lớp trên giao diện, chỉnh `EDUCMIND_GRADE_MIN` và `EDUCMIND_GRADE_MAX` trong `js/00-grade-config.js`.
Ràng buộc dữ liệu và phân quyền được áp dụng bằng `firestore.rules` (kèm `security_spec.md`);
khi đổi dải khối lớp, cần cập nhật quy tắc tương ứng và không sửa quy tắc đã triển khai.
`js/03-firebase.js` chứa cấu hình Firebase và `EducMindDB` — mọi lệnh đọc/ghi cơ sở dữ
liệu đều đi qua đối tượng này (mỗi hàm = một truy vấn tới Firestore).

## Thiết lập backend Firebase

1. Tạo dự án Firebase và bật **Authentication** (Email/Password), **Firestore** và **Storage**.
2. Điền cấu hình dự án vào `firebase-applet-config.json` (hoặc `js/00-environment.local.js`
   cho cấu hình cục bộ). Khóa trong cấu hình Firebase là khóa công khai của trình duyệt;
   mọi phân quyền do **`firestore.rules`** quyết định.
3. Triển khai quy tắc bảo mật: `firebase deploy --only firestore:rules,storage:rules`
   (hoặc dán nội dung `firestore.rules` vào Firestore → Rules trên Firebase Console).
4. Trong **Authentication → Settings → Authorized domains**: thêm domain đang chạy
   (mặc định `localhost` có sẵn) để đăng nhập và đặt lại mật khẩu hoạt động.
5. Hai thư mục lưu tệp `educmind-resources` (tài liệu bài học) và `educmind-submissions`
   (bài nộp của học sinh) được tạo tự động ở lần tải lên đầu tiên; quy tắc Storage nằm
   trong `firestore.rules`/cấu hình Storage của dự án.

### Gửi mã xác nhận và đặt lại mật khẩu qua Gmail

Gmail thay thế máy chủ **gửi thư mặc định** của Firebase Authentication; Firebase Auth vẫn tạo
tài khoản, phát hành/kiểm tra mã OTP và lưu mật khẩu. Không gửi mật khẩu người dùng qua Gmail,
không tự kiểm tra mã ở trình duyệt và không tắt xác nhận email.

1. Bật **Xác minh 2 bước** cho tài khoản Gmail, sau đó tạo **App Password** tại
   [Google Account → App passwords](https://myaccount.google.com/apppasswords).
   Dùng App Password này thay cho mật khẩu đăng nhập Gmail.
2. Trong Firebase Console, mở **Authentication → Templates → SMTP settings**, bật custom SMTP và đặt:
   - Host: `smtp.gmail.com`
   - Port: `587` (TLS/STARTTLS)
   - Username: địa chỉ Gmail đầy đủ
   - Password: App Password của Google
   - Sender email: chính địa chỉ Gmail đã xác thực
   - Sender name: `EducMind`
3. Trong **Authentication → Templates**, đặt template **Email address verification**:

   - Subject: `Mã xác nhận tài khoản EducMind`
   - Body:

     ```html
     <h2>Xác nhận email</h2>
     <p>Nhập mã này trong EducMind để xác nhận tài khoản:</p>
     <p style="font-size:28px;font-weight:bold;letter-spacing:6px">%VERIFICATION_CODE%</p>
     <p>Nếu bạn không tạo tài khoản, hãy bỏ qua email này.</p>
     ```

4. Đặt template **Password reset**:

   - Subject: `Mã đặt lại mật khẩu EducMind`
   - Body:

     ```html
     <h2>Đặt lại mật khẩu</h2>
     <p>Nhập mã này trong EducMind để tiếp tục:</p>
     <p style="font-size:28px;font-weight:bold;letter-spacing:6px">%VERIFICATION_CODE%</p>
     <p>Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.</p>
     ```

5. Giữ bật xác nhận email và kiểm tra giới hạn gửi thư trong
   **Authentication → Templates → Quotas**. Gmail có hạn mức gửi; với lượng email giao dịch lớn,
   nên dùng dịch vụ SMTP chuyên cho ứng dụng thay vì hộp thư cá nhân. Mã OTP mặc định
   thường có 6 chữ số; giao diện hỗ trợ mã dài từ 6 đến 10 chữ số.

Không lưu App Password trong mã nguồn, tệp cấu hình nào của dự án hay biến JavaScript phía trình duyệt.
Nếu lộ App Password, hãy thu hồi ngay trong Google Account rồi tạo mật khẩu ứng dụng mới.

### Trợ lý AI và API key Gemini (mỗi người dùng tự đăng ký key)

Toàn bộ lời gọi Gemini đi qua **máy chủ Express** (`server.js`), không gọi trực tiếp từ trình duyệt.
Mô hình: **mỗi người dùng mang API key của mình (BYO key)**, không có key thì Trợ lý AI không chạy.

- Người dùng vào **Tài khoản → Quản lý API key Gemini**, dán key tự đăng ký ở Google AI Studio và
  bấm **Kiểm tra key** (kiểm tra được cả key chưa lưu) rồi **Lưu key**.
- Trình duyệt gửi key **một lần** cho `POST /api/ai/key`. Máy chủ mã hoá **AES-256-GCM**
  (khoá = `sha256(AI_KEY_ENCRYPTION_KEY)`, IV 12 byte ngẫu nhiên, AAD = uid) rồi ghi vào
  Firestore `ai_keys/{uid}` **bằng chính ID token của người dùng** (quy tắc bảo mật cho phép mỗi người
  chỉ đọc/ghi tài liệu của mình). Key thô không bao giờ được trả lại trình duyệt — giao diện chỉ hiện
  4 ký tự cuối; ai đọc được Firestore cũng chỉ thấy bản mã.
- Vai trò luôn lấy từ `profiles/{uid}.role` trên Firestore, không tin tham số do trình duyệt gửi.
- Học sinh không cần key riêng: khi gọi `/api/ai/chat` kèm `class_id`, máy chủ dùng key của
  **giáo viên chủ lớp** (`classes.owner_teacher_id`). Học sinh cũng có thể tự lưu key riêng.
- Thiếu key ⇒ HTTP 400 `MISSING_API_KEY`; giao diện hiện lời nhắc mở Tài khoản → Quản lý API key.
  Biến môi trường `GEMINI_API_KEY` chỉ là phương án dự phòng cho chính chủ máy chủ.

**Giới hạn của giáo viên với học sinh (theo từng bài)**

- Mỗi bài tập và mỗi bài kiểm tra có công tắc **“Học sinh được dùng Trợ lý AI khi làm bài này”**
  (trường `student_ai_enabled`, mặc định **bật**). Giáo viên tắt trong lúc tạo/sửa bài.
- Trong lúc học sinh **đang làm bài**, Trợ lý AI bị khoá hoàn toàn cho tới khi nộp:
  máy chủ kiểm tra `assessment_attempts` còn `IN_PROGRESS` và các câu trả lời bài tập chưa nộp,
  nên tải lại trang, mở tab mới hay dùng khung chat nổi đều không mở khoá được (HTTP 423
  `AI_LOCKED_WHILE_WORKING`). Công tắc cấp lớp trước đây đã được bỏ.
- Tắt công tắc của một bài ⇒ máy chủ trả HTTP 403 `AI_DISABLED_FOR_WORK` khi học sinh hỏi Trợ lý AI
  trong ngữ cảnh bài đó.

Chẩn đoán khi gặp lỗi **"fetch failed"** hoặc *"Máy chủ chưa kết nối được Google"*: đây là lỗi
**hạ tầng phía máy chủ** (máy chủ không ra được Internet), không phải lỗi API key hay lỗi trình duyệt.
Mở `GET /api/health/upstream` để xem máy chủ có gọi được `googleapis.com` (Firebase Auth) và
`firestore.googleapis.com` hay không; kết quả kèm mã lỗi mạng (`ECONNRESET`, `ENOTFOUND`, …) và
cho biết `AI_KEY_ENCRYPTION_KEY` đã cấu hình chưa. Mọi lời gọi ra Google đều có timeout 15 giây
(`AI_UPSTREAM_TIMEOUT_MS` để đổi) và thử lại một lần; khi thất bại, API trả **502
`UPSTREAM_UNREACHABLE`** kèm câu tiếng Việt thay vì chuỗi `fetch failed` thô.

Để chạy trên máy chủ:

1. Đặt trong `.env` (xem `.env.example`): `AI_KEY_ENCRYPTION_KEY` (tối thiểu 32 ký tự, tạo bằng
   `openssl rand -base64 32`), tuỳ chọn `GEMINI_API_KEY`, `GEMINI_MODEL`. `server.js` tự nạp `.env`
   khi khởi động (Node ≥ 20.12). Không commit `.env`; **không đổi** `AI_KEY_ENCRYPTION_KEY` sau khi
   người dùng đã lưu key, vì key đã lưu sẽ không giải mã được.
2. Áp dụng `firestore.rules` (đã có `ai_keys/{uid}` chỉ chủ sở hữu đọc/ghi, và trường
   `student_ai_enabled` trong `assignments`/`assessments`).
3. Mọi lời gọi `/api/*` gửi Firebase ID token ở header `Authorization`, header riêng
   `X-EducMind-Token` và (chỉ với request có phần thân) trường `auth_token` trong thân JSON.
   Request `GET`/`HEAD` **không bao giờ** có phần thân (trình duyệt chặn với lỗi
   "Request with GET/HEAD method cannot have body"), nên trạng thái API key dùng
   `POST /api/ai/key/status` (route `GET /api/ai/key` vẫn giữ cho tương thích). Lý do: một số proxy/khung nhúng (như lớp xem trước của trình soạn thảo)
   chuyển tiếp thân request nhưng bỏ header `Authorization`, khiến máy chủ tưởng người dùng chưa đăng nhập.
   Khi lấy token từ thân, máy chủ kiểm tra `Origin`/`Referer` (cùng host hoặc trong `ALLOWED_ORIGINS`,
   danh sách URL cách nhau dấu phẩy) để trang khác không gọi hộ; `auth_token` bị xoá khỏi body trước khi
   xử lý nên không được ghi vào Firestore hay gửi cho Gemini. Phản hồi 401 kèm `code: AUTH_REQUIRED` và
   trường `auth` (chỉ báo có/không có token, không lộ token) để chẩn đoán; trình duyệt tự làm mới token
   và thử lại một lần.
4. Chỉ tên lớp/chủ đề/bài học/mục tiêu được gửi cho Gemini; dữ liệu cá nhân của học sinh không được gửi.
   Câu hỏi do AI sinh ra vẫn ở trạng thái chờ giáo viên duyệt. Google áp hạn mức theo dự án gắn với
   từng key (nhiều key cùng một dự án vẫn dùng chung quota).

Lưu ý bảo mật của backend:

- Collection do máy chủ tự ghi (`learning_evidence`, `mastery`, `knowledge_gaps`,
  `content_revisions`, `notifications`): người dùng **chỉ được đọc** theo `firestore.rules`,
  mọi thay đổi do máy chủ (Express API) ghi lại (ví dụ `content_revisions` là nhật ký chỉnh
  sửa nội dung — chỉ máy chủ ghi).
- Các thao tác nhiều bước (tạo lớp, vào lớp, bắt đầu/nộp bài kiểm tra, tạo tài khoản học sinh,
  sinh câu hỏi AI…) đi qua API máy chủ để kiểm tra quyền và ghi trong một transaction.
- `EducMindDB.serverNow()` trả về giờ máy chủ để tính hạn nộp và đồng hồ làm bài,
  không phụ thuộc đồng hồ trên máy người dùng.
- Câu hỏi trò chơi chỉ được cấp qua API máy chủ, **không lộ câu hỏi
  đang dùng cho bài kiểm tra chưa đóng**.

## Tính năng hiện có

### Giáo viên

- Tạo/lưu lớp (mã lớp tự sinh), thêm học sinh bằng email, mã lớp,
  hoặc **tự tạo tài khoản cho học sinh** (tự đặt mật khẩu).
- Soạn chủ đề – bài học – mục tiêu; **tải tệp tài nguyên** (mọi định dạng: doc, docx, xlsx, pptx,
  PDF, ảnh, video, âm thanh, tệp code `.h/.cpp/.py/…` — tối đa 50 MB) và **liên kết**
  (YouTube, Canva, trang web) theo bài học; có **thanh tiến trình** khi đang tải tệp lên;
  **xem trước** ảnh/PDF/video/âm thanh/tệp mã
  ngay trong trình duyệt — tệp Office và liên kết khác bấm là tải xuống hoặc mở trang web.
  Tên tệp có dấu/khoảng trắng vẫn tải lên được: tên lưu kho tự chuẩn hóa (bỏ dấu),
  tên gốc giữ nguyên khi hiển thị và khi tải xuống.
- Bài tập: giao đề, **rubric nhiều tiêu chí**, chấm điểm theo tiêu chí, cho phép nộp lại,
  thêm **lượt làm bù** cho từng học sinh; **xem trước tệp bài nộp** của học sinh ngay khi chấm.
- Ngân hàng câu hỏi (5 dạng, theo độ khó và cấp Bloom, gắn mục tiêu) — nhập/xuất **Excel**.
- Đề kiểm tra: chọn câu từ ngân hàng, cửa sổ mở/đóng, chấm tự động và chấm tay,
  tự cộng dồn điểm từng câu (không cần nhập tổng).
- **AI tạo câu hỏi nháp bằng Gemini** cho một bài học (tối đa 20 câu/lượt, không giới hạn lượt/ngày
  ở cấp ứng dụng), theo dõi tiến độ nền và thử lại lô lỗi; duyệt / sửa-và-duyệt / từ chối trước khi đưa
  vào ngân hàng.
- **Lịch & việc cần làm** tự động chốt theo hạn nộp và trạng thái chấm.
- **Báo cáo tiến bộ**: tổng hợp + chi tiết từng học sinh, xuất **Excel** (kể cả sheet
  Bảng điểm), **Word** và **in báo cáo** (bản in đã tối ưu cho máy in).
- **Thùng rác**: xóa mềm chủ đề/bài học/bài tập/câu hỏi và **khôi phục** lại.
- Xem lịch sử chơi của lớp; mức độ nắm vững, lỗ hổng kiến thức, gợi ý học tập;
  thông báo **Realtime** (tự cập nhật chuông, tự fallback polling 10 giây).

### Học sinh

- Vào lớp bằng mã lớp; xem bài học, mục tiêu và tài liệu đã xuất bản.
  Mỗi học sinh chỉ thuộc **một lớp cho mỗi giáo viên (mỗi môn học)**: em không tự chuyển
  lớp (thanh trên chỉ hiện tên lớp, không có ô chọn lớp) — giáo viên là người thêm, gỡ
  hoặc chuyển lớp cho học sinh. Chỉ giáo viên dạy nhiều lớp mới có ô chọn lớp để chuyển.
- Nộp/nộp lại bài tập bằng **tệp đính kèm** hoặc văn bản (kèm **thanh tiến trình** khi tải tệp);
  **xem trước** tệp đã nộp; xem điểm, nhận xét, rubric.
- Làm bài kiểm tra có đồng hồ đếm ngược (tự lưu, tự nộp khi hết giờ, làm nhiều lượt
  theo số lượt giáo viên đặt — kể cả lượt bù).
- **Trò chơi ôn tập** 3 chế độ: Nhanh (60 giây), Đua tốc độ (10 câu × 20 giây),
  Sinh tồn (3 mạng) — chơi bằng câu hỏi trắc nghiệm của lớp, không ảnh hưởng điểm chính thức.
- Xem tiến độ, mức nắm vững, lỗ hổng kiến thức, đề xuất luyện tập, lịch & việc cần làm,
  báo cáo tiến bộ của bản thân; nhận thông báo Realtime.
