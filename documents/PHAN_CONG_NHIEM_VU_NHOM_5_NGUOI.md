# KẾ HOẠCH PHÂN CÔNG NGHIÊN CỨU, PHÁT TRIỂN VÀ KIỂM THỬ

## Dự án EducMind / SmartEdu — Nhóm 5 thành viên

> **Giả định lập kế hoạch:** nhóm đang ở giai đoạn khởi đầu, mới có tên đề tài, ý tưởng và danh sách tính năng cơ bản. Chưa coi codebase hiện tại là sản phẩm đã có; cần tự khảo sát, đặc tả, thiết kế, hiện thực và kiểm thử theo từng giai đoạn. Tên công nghệ trong tài liệu là đề xuất ban đầu và cần được nhóm/giảng viên thống nhất trước khi triển khai.

---

## 1. Mục tiêu và nguyên tắc phân công

Mục tiêu là chia đủ công việc nghiên cứu, thiết kế, code, kiểm thử và tích hợp cho cả 5 người; mỗi thành viên sở hữu một miền chức năng tương đối độc lập, giảm việc nhiều người cùng sửa một tệp hoặc một bảng dữ liệu.

Nguyên tắc:

1. **Chia theo miền nghiệp vụ**, không chia tùy tiện theo số màn hình.
2. **Mỗi mô-đun có một owner chính và một reviewer**, nhưng owner không trở thành người duy nhất hiểu mô-đun.
3. **Chốt hợp đồng tích hợp trước khi code sâu:** entity, API, quyền, lỗi, event và điểm nối giữa mô-đun.
4. **Tách phần dùng chung thành hợp đồng nhỏ, ổn định** do leader/nhóm thống nhất; tránh mọi người cùng sửa `App`, router, schema hoặc file cấu hình.
5. **Tích hợp liên tục theo lát dọc nhỏ**, không đợi cuối kỳ mới ghép toàn bộ.
6. Phân vai theo thế mạnh và nguyện vọng sau buổi kick-off. Nếu thành viên có năng lực khác mô tả vai trò, giữ **ranh giới ownership**, đổi người hoặc đổi phần việc thay vì để hai người cùng sở hữu một tệp.

---

## 2. Sản phẩm và phạm vi MVP đề xuất

**Tên đề tài dự kiến:** Hệ thống hỗ trợ quản lý dạy và học trực tuyến cho giáo viên và học sinh phổ thông (EducMind/SmartEdu).

### MVP nên hoàn thành trước

- Tài khoản, đăng nhập và phân vai Giáo viên/Học sinh.
- Giáo viên tạo lớp, môn học; học sinh vào lớp bằng mã mời.
- Giáo viên soạn chủ đề/bài học; học sinh xem nội dung đã xuất bản.
- Ngân hàng câu hỏi cơ bản; tạo bài tập; học sinh nộp bài; giáo viên chấm và trả nhận xét.
- Báo cáo/tiến độ tối thiểu.
- Phân quyền, kiểm thử cốt lõi, triển khai bản demo.

### Nâng cao nếu thời gian cho phép

- Bài kiểm tra tính giờ, tự lưu, giới hạn lượt làm.
- Luyện tập thích ứng, phân tích lỗ hổng và gợi ý.
- Trò chơi ôn tập.
- AI tạo câu hỏi/Trợ lý AI, thông báo realtime, báo cáo xuất file, thùng rác và lịch sử nội dung.

**Lý do:** với nhóm 5 người và thời gian đồ án hữu hạn, cần có luồng hoàn chỉnh chạy được trước khi mở rộng AI/game/analytics. Không nên cam kết toàn bộ tính năng nâng cao nếu chưa xác nhận thời lượng, trình độ và tiêu chí của giảng viên.

---

## 3. Phân công theo thành viên

Tên dưới đây là vai trò **thay thế được bằng tên thật**. Phân công giả định mỗi người có thể dành thời gian tương đương; điều chỉnh theo năng lực và lịch học trong buổi khởi động.

### Thành viên 1 — Leader / Phân tích nghiệp vụ / Tích hợp và chất lượng

**Phù hợp nếu:** có khả năng tổng hợp yêu cầu, giao tiếp, tổ chức, hiểu luồng tổng thể; không nhất thiết là người code giỏi nhất.

**Nghiên cứu và phân tích**
- Chốt vấn đề, mục tiêu, đối tượng, phạm vi MVP, giả định và giới hạn với giảng viên.
- Lập stakeholder, user journey, use case, acceptance criteria và ưu tiên MoSCoW.
- Quản lý backlog, phụ thuộc, rủi ro, biên bản quyết định công nghệ.

**Phát triển / sở hữu**
- Sở hữu cấu hình ứng dụng, router/layout tích hợp, luồng điều hướng và hợp đồng chung; chỉ sửa phần này sau khi thống nhất.
- Tạo khung app tối thiểu, CI/lint/test command, môi trường local/QA và hướng dẫn chạy.
- Điều phối tích hợp, xử lý conflict ở file chung, không tự ý viết lại phần nghiệp vụ do owner khác sở hữu.

**Kiểm thử**
- Quản lý test plan, regression checklist, kiểm thử end-to-end các luồng liên mô-đun.
- Theo dõi defect, quyết định release gate cùng nhóm; kiểm tra demo/UAT.

**Đầu ra bàn giao**
- `docs/requirements.md`, backlog có acceptance criteria, decision log, release checklist, hướng dẫn chạy dự án và báo cáo tiến độ.

**Ranh giới code gợi ý**
- `app/` hoặc `src/app/`, `router/`, cấu hình tích hợp, CI workflow, tài liệu tổng thể. Không sở hữu module lớp học/nội dung/bài tập của thành viên khác.

---

### Thành viên 2 — Phân tích thiết kế dữ liệu / Backend / Bảo mật

**Phù hợp nếu:** có tư duy dữ liệu, API, xác thực, xử lý lỗi và bảo mật; có thể làm backend hoặc Firebase tùy quyết định kiến trúc.

**Nghiên cứu**
- So sánh lựa chọn backend (ví dụ Firebase/Firestore hoặc PostgreSQL), xác định chi phí, giới hạn, cách phân quyền và khả năng triển khai.
- Thiết kế data dictionary, ERD/logical model, API contract và quy tắc nghiệp vụ ở server/database.
- Thống nhất định danh, timestamp, trạng thái, quy tắc xóa mềm, ranh giới tenant/lớp.

**Phát triển / sở hữu**
- Xây authentication/authorization, profile và role; API/service dùng chung; schema/migration/rules; logging/error contract.
- Xây các service truy cập dữ liệu; không để UI gọi database tuỳ tiện nếu kiến trúc yêu cầu qua service layer.
- Cấu hình môi trường, secrets, backup/restore cơ bản và kiểm soát quyền.

**Kiểm thử**
- Unit/integration test backend, security rules/API, truy cập chéo lớp, token sai/hết hạn, payload sai.
- Viết test fixture và seed data QA dùng chung.

**Đầu ra bàn giao**
- ERD/data dictionary, API spec/OpenAPI hoặc interface TS, auth/role policy, migrations/rules, test backend và tài liệu biến môi trường.

**Ranh giới code gợi ý**
- `server/` hoặc `src/backend/`, `db/`, `migrations/`, `security/`, API contract; phối hợp với thành viên 1 trước khi đổi cấu hình chung.

---

### Thành viên 3 — Giáo viên: lớp học và nội dung học tập

**Phù hợp nếu:** mạnh về UI/UX, biểu mẫu, luồng nghiệp vụ giáo viên hoặc quan tâm nghiệp vụ sư phạm.

**Nghiên cứu**
- Phỏng vấn/khảo sát giáo viên; mô tả tạo lớp, mời học sinh, cấu trúc môn/chủ đề/bài học/mục tiêu.
- Xác định quyền giáo viên, quy tắc xuất bản/nháp, luồng tải tài liệu và tiêu chí UX.

**Phát triển / sở hữu**
- Màn hình giáo viên tạo/quản lý lớp, môn học, invite code.
- Màn hình soạn nội dung: chủ đề, bài học, mục tiêu; publish/unpublish.
- Tài nguyên học liệu/link và hiển thị nội dung đã xuất bản cho học sinh (phần rendering, không sở hữu auth).

**Kiểm thử**
- Test form validation, quyền giáo viên/học sinh, trạng thái nháp/xuất bản, upload lỗi và hiển thị mobile.
- Kiểm thử khả dụng với ít nhất một người dùng đại diện hoặc kịch bản UAT.

**Đầu ra bàn giao**
- Wireframe/prototype, module lớp/nội dung, test UI/module, tài liệu thao tác cho giáo viên.

**Ranh giới code gợi ý**
- `features/classes/`, `features/content/`, component riêng của module; không chỉnh schema cốt lõi/API khi chưa review của thành viên 2.

---

### Thành viên 4 — Học tập: câu hỏi, bài tập, bài kiểm tra và chấm

**Phù hợp nếu:** logic nghiệp vụ tốt, thích xử lý biểu mẫu/điểm số/trạng thái; có thể phối hợp với giáo viên để xác thực quy tắc chấm.

**Nghiên cứu**
- Phân tích loại câu hỏi MVP, đáp án, cách chấm, hạn nộp, nộp muộn, rubric và lượt làm.
- Định nghĩa state machine cho bài tập/bài nộp/bài kiểm tra/attempt; làm rõ auto-save, deadline và chấm tay.

**Phát triển / sở hữu**
- Ngân hàng câu hỏi và validator/import-export nếu nằm trong phạm vi.
- Giáo viên tạo bài tập/đề; học sinh xem, làm/nộp; giáo viên chấm và trả điểm/feedback.
- Bài kiểm tra tính giờ là phần mở rộng sau khi luồng assignment ổn định.

**Kiểm thử**
- Test chấm điểm bằng bộ oracle, boundary của điểm/hạn/lượt, nộp lại, tự lưu, khôi phục sau reload và quyền sửa điểm.
- Viết test regression cho mỗi loại câu hỏi được hỗ trợ.

**Đầu ra bàn giao**
- State diagram, quy tắc chấm được duyệt, module question/assignment/assessment, test tự động và hướng dẫn giáo viên/học sinh.

**Ranh giới code gợi ý**
- `features/questions/`, `features/assignments/`, `features/assessments/`; chỉ dùng interface dữ liệu đã chốt, không sửa service/auth dùng chung.

---

### Thành viên 5 — Học sinh: trải nghiệm học, tiến độ, báo cáo và kiểm thử tự động

**Phù hợp nếu:** mạnh về trải nghiệm người học, kiểm thử tỉ mỉ, phân tích dữ liệu hoặc giao diện dashboard.

**Nghiên cứu**
- Khảo sát hành trình học sinh: vào lớp, xem bài, làm/nộp, nhận kết quả, xem tiến độ.
- Xác định chỉ số tiến bộ tối thiểu có thể giải thích được; tránh đưa thuật toán AI/analytics không có dữ liệu kiểm chứng.

**Phát triển / sở hữu**
- Dashboard học sinh, danh sách bài/việc cần làm, xem bài học đã publish.
- Tiến độ/báo cáo cơ bản, hiển thị điểm/feedback/notification tùy phạm vi MVP.
- Các tính năng nâng cao (practice/game/AI) chỉ nhận sau khi core MVP ổn định hoặc được nhóm ưu tiên.

**Kiểm thử**
- Sở hữu bộ regression UI/E2E smoke cho luồng người học; khả năng dùng bàn phím, responsive, trạng thái loading/error/empty.
- Kiểm tra số liệu dashboard đối chiếu dữ liệu mẫu; kiểm tra export nếu được giao.

**Đầu ra bàn giao**
- User flow học sinh, module dashboard/tiến độ, bộ test UI/E2E và checklist khả dụng.

**Ranh giới code gợi ý**
- `features/student/`, `features/progress/`, `features/reports/`, `tests/e2e/`; không sửa module bài tập của thành viên 4 ngoài qua API/component contract.

---

## 4. Bản đồ ownership và reviewer

| Miền / artifact | Owner | Reviewer chính | Người hỗ trợ |
|---|---|---|---|
| Yêu cầu, backlog, kế hoạch tích hợp | Thành viên 1 | Cả nhóm | Cả nhóm cung cấp đầu vào |
| Data model, auth, API, rules/bảo mật | Thành viên 2 | Thành viên 1 + Thành viên 4 | Thành viên 3/5 review luồng dữ liệu UI |
| Lớp học, học liệu, nội dung giáo viên | Thành viên 3 | Thành viên 2 (dữ liệu/quyền) + Thành viên 1 (nghiệp vụ) | Thành viên 5 (trải nghiệm học sinh) |
| Câu hỏi, assignment, assessment, grading | Thành viên 4 | Thành viên 2 (integrity/quyền) + Thành viên 3 (nghiệp vụ giáo viên) | Thành viên 5 (luồng học sinh) |
| Dashboard học sinh, tiến độ, báo cáo/E2E | Thành viên 5 | Thành viên 1 + Thành viên 2 (dữ liệu) | Thành viên 3/4 cung cấp API/module |
| Router/layout/cấu hình tích hợp/CI | Thành viên 1 | Thành viên 2 | Tất cả không tự sửa nếu không phối hợp |

**Quy tắc dự phòng:** mọi miền có ít nhất một reviewer biết cách chạy/test. Thành viên 1 không phải “người sửa tất cả”; owner module chịu trách nhiệm sửa bug trong miền mình.

---

## 5. Kế hoạch theo giai đoạn (tham khảo 8 tuần)

> Thời lượng cần điều chỉnh theo lịch đồ án của trường. Nếu chỉ có 4–6 tuần, giảm scope nâng cao thay vì giảm kiểm thử và tích hợp.

| Tuần | Mục tiêu | Công việc chính | Cổng hoàn thành |
|---|---|---|---|
| 1 — Khởi động | Chốt vấn đề và MVP | Cả nhóm khảo sát; M1 backlog/use cases; M2 công nghệ/data draft; M3/M4/M5 user flow và wireframe | Giảng viên/nhóm duyệt phạm vi, actor, 5–8 use case MVP, tiêu chí nghiệm thu |
| 2 — Thiết kế và khung | Đóng băng contract v0 | M2 ERD/API/auth draft; M1 repo/CI/skeleton; M3/M4/M5 prototype và test strategy | Có interface/schema mock, app chạy, mọi module build được độc lập |
| 3 — Vertical slice | Luồng đăng nhập → tạo lớp → vào lớp | M1/M2 auth + profile; M3 lớp/invite; M5 học sinh vào lớp; M4 viết test/khung question service | Demo end-to-end trên QA, không chỉ mock |
| 4 — Học liệu | Giáo viên tạo bài, học sinh xem | M3 content/topic/lesson/publish; M2 rules/storage; M5 student view; M1 regression | Draft/published và quyền đã kiểm chứng |
| 5 — Bài tập | Tạo → nộp → chấm | M4 assignment/question MVP; M3 tích hợp giao bài; M5 student flow/tests; M2 permission/data | Có bài nộp và điểm xuyên suốt, audit các quyền |
| 6 — Báo cáo + ổn định | Xem kết quả học tập | M5 dashboard/report cơ bản; M4 grading edge cases; M2 rules; M1 E2E/bug triage | Chạy regression, không có P0/P1 mở ở luồng core |
| 7 — Nâng cao có chọn lọc | Thi/AI/practice tùy ưu tiên | Chỉ chọn 1–2 tính năng; chia owner theo module, API contract riêng | Tính năng mới không làm hỏng core; test có trong CI |
| 8 — UAT và bàn giao | Demo/release | Cả nhóm test chéo, sửa lỗi, viết hướng dẫn, backup/rollback và báo cáo | UAT ký nhận; build tái lập; demo sạch và dữ liệu giả |

### Quy tắc cổng chuyển giai đoạn

- Không bắt đầu module phụ thuộc khi schema/API còn thay đổi liên tục; dùng contract mock trước.
- Mỗi tuần phải có bản chạy được trên nhánh tích hợp, không gom code đến cuối giai đoạn.
- Nếu trễ: giữ authentication, lớp/nội dung, bài tập-nộp-chấm, quyền và kiểm thử; hoãn AI/game/analytics nâng cao.

---

## 6. Cách giảm conflict khi làm chung repository

### 6.1. Cấu trúc thư mục đề xuất

```text
src/
  app/                 # Thành viên 1: shell, router, bootstrap
  shared/              # Shared component/type/error contract; thay đổi qua PR có review
  backend/             # Thành viên 2: API/services/auth
  features/
    classes/           # Thành viên 3
    content/           # Thành viên 3
    questions/         # Thành viên 4
    assignments/       # Thành viên 4
    assessments/       # Thành viên 4
    student/           # Thành viên 5
    progress/          # Thành viên 5
    reports/           # Thành viên 5
  styles/
 tests/
  unit/
  integration/
  e2e/
 docs/
```

Cấu trúc thực tế có thể khác; điều quan trọng là **mỗi module có đường dẫn ownership rõ**, tránh gom toàn bộ logic vào một `app.js` hoặc một file database lớn.

### 6.2. Quy trình Git

1. Dùng branch ngắn hạn theo ticket, ví dụ `feat/class-invite`, `test/assignment-submit`, `fix/role-guard`; không commit trực tiếp vào nhánh tích hợp/main.
2. Một PR giải quyết một mục backlog nhỏ; mô tả mục tiêu, ảnh/UI nếu cần, test chạy, migration/schema tác động, rủi ro và cách rollback.
3. PR cần ít nhất một reviewer khác owner; thay đổi auth/schema/rules/API chung cần reviewer M2 và M1.
4. Bắt buộc CI xanh: format/lint, unit test, module test; integration/E2E cho PR ảnh hưởng luồng quan trọng.
5. Merge thường xuyên (ít nhất mỗi ngày làm việc hoặc khi hoàn tất lát nhỏ), ưu tiên squash/rebase theo quy ước giảng viên/nhóm; không để branch tồn tại nhiều ngày mà chưa sync.
6. Không cùng lúc sửa cùng file: nếu phải sửa `router`, shared types, package config, schema hoặc CSS tokens, mở PR riêng/đặt lịch phối hợp; chỉ một người làm primary editor.
7. Xử lý conflict bằng cách trao đổi với owner file; không chọn “ours/theirs” mù quáng, chạy lại test sau resolve.

### 6.3. Definition of Ready (DoR)

Một ticket chỉ bắt đầu khi có:

- Mục tiêu/người dùng, phạm vi và ngoài phạm vi.
- Acceptance criteria có thể quan sát được, gồm trường hợp lỗi/permission nếu phù hợp.
- API/data contract và owner đã xác định; dependency không còn mơ hồ.
- Wireframe hoặc ví dụ input/output cho luồng UI quan trọng.
- Ước lượng và test plan ngắn.

### 6.4. Definition of Done (DoD)

Một ticket chỉ được coi là xong khi:

- Code/module theo ownership, không chứa secret; có validation và trạng thái loading/empty/error phù hợp.
- Unit/integration test tương ứng được thêm/cập nhật và pass; luồng chính có regression.
- Quyền được kiểm tra ở backend/database, không chỉ ẩn UI.
- PR được review, CI xanh, tài liệu/API/schema cập nhật.
- Có test bằng chứng trên QA khi feature cần Firebase/Storage/email/AI.
- Không còn defect P0/P1 liên quan hoặc có quyết định ngoại lệ được ghi lại.

---

## 7. Hợp đồng tích hợp phải thống nhất trước khi chia code

### 7.1. Data/API contract

Thành viên 2 chủ trì, cả nhóm review và đóng băng bản đầu:

- Tên entity/collection/table, primary ID, trường bắt buộc/tùy chọn, timestamp và enum trạng thái.
- Cách biểu diễn lỗi thống nhất (`code`, `message` an toàn, `requestId`); UI không parse chuỗi lỗi tự do.
- Hợp đồng các thao tác cốt lõi: auth/profile; create class/join; content publish/list; create assignment/submit/grade; report progress.
- Quy tắc pagination/limit, idempotency cho submit, timezone, concurrency, soft delete và quyền truy cập.
- Thay đổi contract phải có version/changelog và thông báo các consumer trước khi merge.

### 7.2. Quy ước shared UI

Thành viên 1/3 chủ trì thống nhất:

- Tokens màu/font/spacing, button/input/dialog/table, form error/loading/empty state.
- Component dùng chung chỉ thêm khi có ít nhất hai use case; module riêng ưu tiên component cục bộ.
- Mỗi component có props/type contract; không import component nội bộ của feature khác nếu chưa công bố API.

### 7.3. Contract kiểm thử

- Thành viên 1 định nghĩa smoke/E2E; M2 cung cấp emulator/seed fixture; M3–M5 cung cấp test module.
- API/service mock dùng fixture có phiên bản; không copy mỗi nhóm một bộ dữ liệu seed lệch nhau.
- Test không phụ thuộc thứ tự chạy, không dùng tài khoản/DB production và không tạo chi phí ngoài ý muốn.

---

## 8. Ma trận hỗ trợ chéo và học tập

| Giai đoạn | Người dẫn | Người học/đối tác | Hình thức |
|---|---|---|---|
| Yêu cầu/nghiệp vụ | M1 | Cả nhóm | Workshop 60–90 phút, cùng duyệt use case và MVP |
| Data/API/auth | M2 | M1 + M3/M4/M5 | Review ERD/API, ví dụ request/response, test permission |
| Lớp/nội dung | M3 | M5 | Demo user flow; M5 kiểm tra góc nhìn học sinh |
| Bài tập/chấm | M4 | M3 + M5 | Chốt quy tắc chấm/hạn; kiểm thử chéo vai trò |
| Dashboard/test E2E | M5 | M1 + M2 | Đối chiếu dữ liệu, cùng chạy smoke và accessibility |
| Release/demo | M1 điều phối | Cả nhóm | Diễn tập demo; mỗi thành viên trình bày module của mình |

Mỗi tuần có một buổi **pair/review chéo 30–45 phút**. Mỗi thành viên cần biết chạy module của ít nhất một thành viên khác để tránh “bus factor = 1”.

---

## 9. Rủi ro và phương án giảm thiểu

| Rủi ro | Dấu hiệu sớm | Phương án |
|---|---|---|
| Phạm vi quá lớn | Backlog tăng, core chưa demo ở tuần 3–4 | Đóng băng MVP; hoãn AI/game/analytics, không giảm test bảo mật/cốt lõi |
| Schema/API đổi liên tục | UI mock không khớp backend; nhiều conflict | Contract-first, version, mock server/fixtures, thay đổi qua PR có consumer review |
| Tích hợp muộn | Branch dài ngày, mỗi người chạy riêng | Merge lát dọc hàng ngày; deploy preview/QA sớm; có integration owner |
| Một người ôm router/schema | PR chờ lâu, cả nhóm bị block | Backup owner, reviewer thứ hai, checklist thay đổi file shared |
| Chia việc không đều | Một người có nhiều blocker, người khác chờ | Theo dõi capacity hàng tuần; chia ticket nhỏ; hỗ trợ chéo có owner rõ |
| Kiểm thử chỉ happy path | Lỗi quyền, deadline, mạng yếu xuất hiện gần demo | Test boundary/negative/role matrix ngay từ acceptance criteria |
| Dữ liệu thật/secret vào repo | `.env`, key, email xuất hiện trong commit | `.gitignore`, secret manager, secret scan, rotate key ngay khi nghi lộ |
| Tính năng AI tốn phí/khó kiểm chứng | Quota/cost tăng, output không ổn định | BYO key hoặc quota sandbox; mock cho test; duyệt người dùng; fallback không-AI |
| Không đủ thời gian UAT | Demo chỉ do developer tự kiểm tra | Đặt lịch UAT từ đầu; chuẩn bị kịch bản và dữ liệu giả; giữ 1 tuần stabilization |

---

## 10. Kế hoạch họp và báo cáo tiến độ

- **Kick-off (90 phút):** xác nhận mục tiêu, vai trò/nguyện vọng, MVP, công nghệ, Definition of Done và lịch.
- **Planning đầu tuần (30 phút):** chọn ticket theo capacity, phụ thuộc, tiêu chí nghiệm thu.
- **Async daily update:** mỗi người ghi `Hôm qua / Hôm nay / Blocker`; không cần họp dài nếu không có vấn đề.
- **Integration demo cuối tuần (45–60 phút):** chạy chức năng trên nhánh tích hợp; demo code thật, không chỉ slide.
- **Retrospective (15 phút):** một điều tốt, một điểm vướng, một hành động cải tiến có owner.
- Mỗi ticket có owner, reviewer, dự kiến hoàn thành, trạng thái, liên kết PR và test evidence.

### Mẫu cập nhật cá nhân

```text
Tên / tuần:
Đã hoàn tất (kèm PR/test):
Đang làm:
Blocker / cần ai hỗ trợ:
Rủi ro cho mốc tiếp theo:
```

---

## 11. Việc cần làm ngay trong buổi đầu tiên

1. Mỗi thành viên ghi kỹ năng, phần muốn học, thời gian có thể dành mỗi tuần và lịch bận.
2. Chốt persona và phỏng vấn tối thiểu một giáo viên, một học sinh (hoặc giả lập có xác nhận của giảng viên).
3. Chọn MVP 5–8 use case ưu tiên; ghi rõ cái gì chưa làm.
4. Chọn stack dựa trên yêu cầu môn học, khả năng nhóm, triển khai và bảo mật; không mặc định phải dùng nguyên codebase hiện tại.
5. Tạo repo skeleton, branch/PR/CI, issue board, coding convention, test command và môi trường QA.
6. Thành viên 2 đề xuất ERD/API; các module owner review bằng tình huống thực tế.
7. Dựng một vertical slice nhỏ: đăng nhập → tạo lớp → học sinh vào lớp → giáo viên đăng bài → học sinh xem, trước khi đầu tư vào tính năng nâng cao.
8. Chốt lịch demo và UAT; lưu quyết định, giả định, và các điểm chưa rõ để hỏi giảng viên.

---

## 12. Kết luận

Cách chia này tạo năm vùng trách nhiệm tương đối ít chồng lấn: **điều phối/tích hợp**, **backend/dữ liệu/bảo mật**, **lớp và nội dung**, **đánh giá và chấm**, **trải nghiệm học sinh/tiến độ/kiểm thử**. Giảm conflict không chỉ bằng cách chia file; điều cốt yếu là chốt hợp đồng, giới hạn người sửa file dùng chung, tích hợp sớm và review chéo. Sau buổi kick-off, hãy thay M1–M5 bằng tên thật và điều chỉnh ownership theo năng lực, nguyện vọng và thời gian của từng người.
