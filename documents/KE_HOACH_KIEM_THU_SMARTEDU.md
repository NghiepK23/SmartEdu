# KẾ HOẠCH VÀ BỘ CA KIỂM THỬ SMARTEDU / EDUCMIND

> **Mục đích:** tài liệu hóa phạm vi, dữ liệu, điều kiện, ca kiểm thử và tiêu chí nghiệm thu cho các chức năng đang được mô tả trong `BAO_CAO_KY_THUAT.md`. Đây là **test specification** để thực thi, không phải bằng chứng rằng mọi ca đã chạy hoặc hệ thống đã đạt chứng nhận thương mại.
>
> **Phiên bản tài liệu:** 1.0  
> **Ngày lập:** 27/11/2026  
> **Đối tượng:** Tester, QA, lập trình viên, chủ sản phẩm và người nghiệm thu.

---

## 1. Phạm vi và nguyên tắc

Tài liệu bao phủ các chức năng Giáo viên (G1–G18), Học sinh (H1–H12), các luồng chung, 7 dạng câu hỏi, API AI/practice, dữ liệu, quyền truy cập, vận hành và các yêu cầu phi chức năng được nêu trong báo cáo kỹ thuật.

### 1.1. Phân biệt kiểm thử và cam kết chất lượng

- Bộ ca này mô tả **cần kiểm tra gì** và **kết quả nào được chấp nhận**; trạng thái ban đầu của tất cả ca là `NOT RUN` trừ khi người thực thi ghi lại bằng chứng.
- Báo cáo kỹ thuật ghi nhận 44 test tự động đã pass khi chạy riêng từng file trong một lần kiểm tra trước đây. Kết quả lịch sử đó không chứng minh các chức năng tích hợp, dịch vụ Firebase/Gemini/email đang hoạt động ở môi trường phát hành.
- Không tài liệu nào có thể đảm bảo “tất cả chức năng luôn hoạt động đúng” hoặc “sẵn sàng thương mại” nếu chưa chạy trên cấu hình triển khai thật, kiểm thử tải, khôi phục, quyền riêng tư và rà soát bảo mật độc lập.
- Chỉ đánh dấu `PASS` khi có kết quả quan sát được và bằng chứng (log, ảnh/video đã ẩn dữ liệu nhạy cảm, ID bản ghi, báo cáo CI). Nếu chưa có môi trường hoặc credential an toàn, ghi `BLOCKED`, không suy diễn là pass.

### 1.2. Mức ưu tiên

| Ưu tiên | Ý nghĩa |
|---|---|
| P0 | Chặn phát hành: xác thực/quyền, lộ đáp án hoặc dữ liệu cá nhân, mất/sai dữ liệu, chấm điểm/hạn thi sai, lỗi làm gián đoạn toàn hệ thống. |
| P1 | Chức năng cốt lõi hoặc luồng thường xuyên; phải đạt trước phát hành. |
| P2 | Trải nghiệm, báo cáo, tương thích/biên; cần đạt theo tiêu chí nghiệm thu sản phẩm. |

### 1.3. Điều kiện nền cần có

1. Môi trường QA Firebase tách biệt hoàn toàn Production: Auth, Firestore, Storage, Rules và Firebase Emulator/Rules Unit Testing.
2. Máy chủ Node.js theo phiên bản trong README/package; cấu hình `.env` lấy từ secret manager, không ghi API key thật vào repo/log/tài liệu.
3. Tài khoản email QA có thể nhận OTP; tài khoản Gemini test có quota thấp/giới hạn và cơ chế chi phí; endpoint upstream có thể mô phỏng timeout/429/5xx.
4. Dữ liệu lớp, câu hỏi, bài tập, bài thi và tệp chỉ là dữ liệu giả lập. Có tài khoản `TEACHER`, `STUDENT` của cùng lớp, học sinh lớp khác, người chưa đăng nhập và dữ liệu thuộc giáo viên khác.
5. Trình duyệt hỗ trợ (tối thiểu Chrome/Edge/Firefox/Safari phiên bản đang được sản phẩm công bố), viewport desktop và mobile; kiểm tra bàn phím và screen reader cơ bản.
6. Đồng hồ máy chủ QA được đồng bộ; thời gian thi/hạn nộp có thể dịch chuyển để kiểm thử biên.

### 1.4. Tài khoản và dữ liệu chuẩn

| Ký hiệu | Thiết lập |
|---|---|
| T1 | Giáo viên A, email đã xác thực, có lớp QA và môn Toán. |
| T2 | Giáo viên B, khác T1; dùng xác minh ranh giới tenant. |
| S1 | Học sinh A, cùng lớp với T1, có email đã xác thực. |
| S2 | Học sinh B, cùng lớp với T1 nhưng khác S1. |
| S3 | Học sinh lớp của T2; không được truy cập lớp T1. |
| U0 | Người chưa đăng nhập / token hết hạn. |
| C1/C2 | Lớp T1/T2; invite đang hiệu lực và mã hết hạn/thu hồi để thử. |
| Q1 | Bộ 7 câu hỏi (mỗi dạng một câu), có đáp án chuẩn/giải thích/độ khó/mục tiêu. |
| A1/EX1 | Bài tập và bài thi có cấu hình hạn, rubric, thời lượng, lượt làm, câu khách quan và tự luận. |
| F1/F2 | Tệp kiểm thử an toàn dưới giới hạn và tệp vượt giới hạn; không chứa dữ liệu cá nhân/malware thật. |

Không dùng mật khẩu/API key thật trong test data. Khôi phục môi trường về baseline sau mỗi lần chạy destructive test.

---

## 2. Quy trình thực thi và ghi nhận

1. Xác nhận build/commit, URL môi trường, cấu hình Firebase, browser/device, ngày giờ, phiên bản Node và tester.
2. Chạy trước `npm run lint`, các unit test (`npm test`) và test Firestore Rules bằng Emulator. Ghi riêng lỗi hạ tầng với lỗi sản phẩm.
3. Chạy ca theo thứ tự: P0 quyền và dữ liệu → xác thực/lớp → học liệu → bài tập/thi → tiến độ/AI → hồi quy → phi chức năng.
4. Mỗi ca ghi `PASS`, `FAIL`, `BLOCKED` hoặc `NOT RUN`; lưu ID lỗi, bằng chứng, phiên bản và thời gian. Che email, UID, nội dung chat, token và tệp riêng tư trong bằng chứng.
5. Khi lỗi được sửa, chạy lại ca lỗi, ca liên quan và regression của cùng mô-đun. Không xóa dấu vết lỗi cũ.
6. Với môi trường production-like, chỉ dùng dữ liệu giả, cờ tính năng/quota hạn chế; không gửi email/AI tốn phí ngoài phạm vi đã duyệt.

### Trạng thái kết quả

`NOT RUN` = chưa chạy; `PASS` = đạt; `FAIL` = không đạt; `BLOCKED` = không chạy được do phụ thuộc/môi trường; `N/A` = ngoài phạm vi bản phát hành (phải có phê duyệt).

### Mẫu nhật ký chạy

| Test ID | Trạng thái | Build/commit | Tester / ngày | Bằng chứng | Defect ID / ghi chú |
|---|---|---|---|---|---|
| Ví dụ: AUTH-01 | NOT RUN |  |  |  |  |

---

## 3. Bộ ca kiểm thử chức năng

### 3.1. Xác thực, hồ sơ, vai trò và phiên — G1/H1

| ID | Ưu tiên | Tiền điều kiện / thao tác | Kết quả mong đợi |
|---|---|---|---|
| AUTH-01 | P0 | Đăng ký email hợp lệ với vai trò TEACHER, xác nhận OTP đúng. | Auth user và `profiles/{uid}` được tạo; role đúng; chỉ chuyển vào app sau xác nhận theo chính sách. |
| AUTH-02 | P0 | Lặp AUTH-01 với vai trò STUDENT. | Profile có STUDENT; không cấp quyền giáo viên. |
| AUTH-03 | P1 | Gửi OTP sai, hết hạn, dùng lại OTP hoặc gửi nhiều OTP liên tiếp. | Xác nhận bị từ chối; giới hạn gửi/ thử lại được thực thi; không tạo profile xác thực giả. |
| AUTH-04 | P1 | Đăng ký email đã dùng, email sai định dạng, mật khẩu không đạt chính sách. | Báo lỗi thân thiện; không tạo bản ghi trùng hoặc lộ thông tin nhạy cảm trong thông báo/log. |
| AUTH-05 | P0 | Gửi yêu cầu Firestore sửa `profiles.role` STUDENT thành TEACHER sau đăng ký. | Rules từ chối; vai trò không thể tự nâng quyền. |
| AUTH-06 | P1 | Đăng nhập đúng/sai mật khẩu; đăng xuất; đăng nhập lại. | Đúng thì vào đúng dashboard; sai thì không vào; logout xóa phiên/token phía client theo thiết kế. |
| AUTH-07 | P1 | Đặt lại mật khẩu với email hợp lệ/không hợp lệ và dùng link/mã hết hạn. | Luồng reset an toàn; mật khẩu cũ hết hiệu lực khi reset thành công; không lộ tài khoản tồn tại quá mức cần thiết. |
| AUTH-08 | P0 | Token hết hạn/thu hồi; truy cập API bảo vệ bằng token cũ hoặc không có token. | API trả 401/403 phù hợp; client yêu cầu đăng nhập lại; không lộ dữ liệu. |
| AUTH-09 | P1 | Mở đường dẫn/hash điều hướng khi chưa đăng nhập; đăng nhập/đăng xuất ở nhiều tab. | Không bypass guard; trạng thái phiên và điều hướng đồng bộ/được xử lý nhất quán. |
| AUTH-10 | P1 | Đăng ký học sinh và thử hoàn tất onboarding như giáo viên (hoặc ngược lại). | Học sinh không tự tạo/cấu hình lớp với quyền giáo viên; nhánh onboarding theo vai trò chính xác. |

### 3.2. Lớp học, thành viên và ghi danh — G2–G4/H2

| ID | Ưu tiên | Tiền điều kiện / thao tác | Kết quả mong đợi |
|---|---|---|---|
| CLASS-01 | P1 | T1 tạo lớp với tên, khối 3–12, năm học, môn hợp lệ. | Lớp, course và invite/code được tạo liên kết đúng; mã có định dạng quy định và dùng được. |
| CLASS-02 | P1 | Tạo lớp với tên rỗng/quá dài, grade ngoài 3–12, dữ liệu thiếu. | Validation chặn; không tạo dữ liệu dang dở. |
| CLASS-03 | P0 | Tạo lớp đồng thời ở nhiều phiên để thử trùng mã invite. | Mã duy nhất; xử lý retry/transaction; không ghi đè lớp khác. |
| CLASS-04 | P1 | S1 nhập mã lớp hợp lệ đang hiệu lực. | Ghi thành viên và các liên kết teacher/student đúng, nhất quán; lớp xuất hiện ở tài khoản S1. |
| CLASS-05 | P1 | Nhập mã sai định dạng, không tồn tại, hết hạn, thu hồi. | Báo lỗi rõ; không tạo membership hay liên kết một phần. |
| CLASS-06 | P0 | S1 đã thuộc lớp T1/môn tương ứng, thử nhập mã lớp khác của cùng T1. | Quy tắc một lớp/giáo viên/môn được áp dụng theo thiết kế; không có trạng thái ghi danh kép. |
| CLASS-07 | P0 | S1 thử ghi trực tiếp membership vào lớp T2 hoặc đổi teacher_id/student_id. | Firestore Rules từ chối. |
| CLASS-08 | P1 | T1 thêm học sinh bằng email; thử email có/không có tài khoản. | Thêm đúng người theo luồng hỗ trợ; thông báo/response không làm lộ thông tin ngoài quyền. |
| CLASS-09 | P1 | T1 dùng chức năng tự tạo tài khoản học sinh. | Tài khoản/profile/membership được tạo theo thiết kế và có trạng thái xác thực/onboarding an toàn; không lộ mật khẩu. |
| CLASS-10 | P1 | T1 gỡ học sinh; kiểm tra student, roster, liên kết hai chiều và truy cập sau khi gỡ. | Quan hệ được dọn nhất quán; người đã gỡ mất quyền lớp, dữ liệu lịch sử được bảo toàn theo chính sách. |
| CLASS-11 | P1 | T1 chuyển học sinh theo chức năng được hỗ trợ; thử chuyển trái phép bởi học sinh. | Chuyển lớp đúng atomicity; học sinh không tự chuyển/né ràng buộc. |
| CLASS-12 | P1 | T1 archive/restore lớp; học sinh dùng mã lớp của lớp archive. | Lớp archive không nhận thành viên mới; restore khôi phục theo quy định, không tạo bản sao. |
| CLASS-13 | P0 | T2 sửa/xóa lớp của T1 bằng UI và gọi Firestore trực tiếp. | Bị từ chối; ownership kiểm tra ở Rules chứ không chỉ ẩn nút giao diện. |
| CLASS-14 | P1 | Kiểm tra lớp có nhiều môn và cùng học sinh ở các môn khác nhau. | Membership/teacher-student index không vi phạm chính sách ghi danh nhiều môn đã mô tả. |

### 3.3. Nội dung, tài nguyên và xuất bản — G5–G7/H3

| ID | Ưu tiên | Tiền điều kiện / thao tác | Kết quả mong đợi |
|---|---|---|---|
| CONTENT-01 | P1 | T1 tạo Course → Topic → Lesson → Objective hợp lệ. | Quan hệ class/course/topic/lesson đúng; nội dung lưu và tải lại chính xác. |
| CONTENT-02 | P1 | Tạo/cập nhật tiêu đề rỗng/quá dài, mô tả quá giới hạn, thứ tự hiển thị không hợp lệ. | Client và Firestore Rules từ chối; không lưu dữ liệu lỗi. |
| CONTENT-03 | P0 | T1 tạo nội dung DRAFT, S1 truy vấn trực tiếp và qua UI. | Học sinh không đọc nội dung nháp; giáo viên chủ lớp đọc được. |
| CONTENT-04 | P1 | T1 publish rồi unpublish nội dung. | Học sinh chỉ thấy nội dung PUBLISHED; thay đổi trạng thái đồng bộ với index. |
| CONTENT-05 | P0 | T2 thử đọc/sửa nội dung lớp T1 và truy cập `class_indexes` trái quyền. | Bị từ chối; không rò nội dung/tài nguyên lớp khác. |
| RES-01 | P1 | Tải tệp nhỏ hợp lệ, theo dõi tiến trình, mở lại resource. | Upload hoàn tất; metadata và storage_path đúng; tệp tải/xem được bởi người có quyền. |
| RES-02 | P1 | Tải tệp đúng giới hạn 50 MB, tệp vượt giới hạn 1 byte/50 MB. | Kích thước hợp lệ được chấp nhận; quá giới hạn bị chặn ở client và/hoặc Storage Rules/server phù hợp. |
| RES-03 | P0 | Thử MIME giả, tên file chứa `../`, ký tự điều khiển, URL `javascript:`, URL ngoài whitelist nếu có. | Không path traversal, XSS hoặc tải URL nguy hiểm; tên hiển thị được escape; URL được validate. |
| RES-04 | P1 | Xem trước ảnh/PDF/video/âm thanh/tệp mã và loại không hỗ trợ. | Loại được hỗ trợ hiển thị đúng; loại không hỗ trợ có fallback tải xuống; không thực thi nội dung độc hại. |
| RES-05 | P1 | Upload bị ngắt mạng, token hết hạn hoặc Storage trả lỗi; thử tải lại. | UI báo lỗi, bỏ trạng thái loading, không tạo resource mồ côi; retry không nhân đôi bản ghi. |
| RES-06 | P0 | S1 truy cập storage_path của submission/resource người khác hoặc URL đã hết quyền. | Bị chặn theo Storage Rules/quyền; không lộ URL công khai vượt chính sách. |
| RES-07 | P1 | Thêm link YouTube/Canva/web hợp lệ và link không an toàn. | Link an toàn mở đúng; link nguy hiểm bị từ chối/hiển thị dạng text an toàn. |

### 3.4. Ngân hàng câu hỏi, nhập/xuất và chấm — G8

| ID | Ưu tiên | Tiền điều kiện / thao tác | Kết quả mong đợi |
|---|---|---|---|
| QUESTION-01 | P1 | Tạo/sửa/xóa mềm từng loại SINGLE_CHOICE, MULTIPLE_CHOICE, TRUE_FALSE, FILL_IN_BLANK, MATCHING, SHORT_ANSWER, ESSAY. | Schema và kind đúng; xem lại được; xóa mềm không làm mất bản ghi vĩnh viễn. |
| QUESTION-02 | P1 | Mỗi dạng câu nhập đáp án hợp lệ và trả lời đúng. | Câu khách quan được chấm theo quy tắc; câu tự luận/trả lời ngắn chuyển chấm tay khi thiết kế yêu cầu. |
| QUESTION-03 | P1 | SINGLE_CHOICE thiếu hoặc có >1 đáp án đúng; MULTIPLE_CHOICE không có đáp án; TRUE_FALSE sai cấu trúc. | Validation chặn dữ liệu không hợp lệ. |
| QUESTION-04 | P1 | Kiểm tra các ranh giới difficulty EASY/MEDIUM/HARD, grade 3/12 và ngoài miền, 6 cấp Bloom. | Giá trị hợp lệ lưu đúng; giá trị sai bị từ chối/chuẩn hóa theo thiết kế. |
| QUESTION-05 | P1 | Gắn/bỏ mục tiêu; objective khác lớp/course. | Quan hệ hợp lệ được lưu; mục tiêu ngoài phạm vi bị chặn. |
| QUESTION-06 | P1 | Nhập file Excel/Word/CSV hợp lệ chứa 7 loại câu. | Parser nhận diện đúng trường, tiếng Việt/Unicode, đáp án và thứ tự. |
| QUESTION-07 | P1 | Nhập file có dòng sai, duplicate, ô công thức/CSV dấu phẩy/quote/newline và BOM UTF-8. | Báo lỗi theo dòng; chính sách import atomic/partial rõ ràng; không mất dữ liệu cũ hoặc tạo bản ghi ngoài dự kiến. |
| QUESTION-08 | P1 | Xuất từng tập câu ra Excel/Word/CSV rồi nhập lại. | Định dạng mở được; nội dung/Unicode/dấu câu/đáp án không bị đổi; công thức không bị thực thi khi mở bảng tính. |
| QUESTION-09 | P0 | Học sinh hoặc T2 truy cập câu hỏi nháp/đáp án trước kỳ thi. | Không lộ ngân hàng/đáp án khi chưa được phép; Rules/API giới hạn dữ liệu theo vai trò và trạng thái. |
| QUESTION-10 | P1 | Cập nhật/xóa câu đang được dùng trong bài tập/bài thi. | Quan hệ và lịch sử bài làm hiện hữu được bảo toàn; UI cảnh báo phụ thuộc hoặc từ chối xóa không an toàn. |

### 3.5. Bài tập, nộp bài, rubric và chấm — G9/H4

| ID | Ưu tiên | Tiền điều kiện / thao tác | Kết quả mong đợi |
|---|---|---|---|
| ASSIGN-01 | P1 | T1 tạo bài DRAFT với target ALL và TARGETED; thêm câu hỏi/rubric; publish. | Học sinh đúng đối tượng thấy bài; học sinh ngoài target không thấy/không nộp được. |
| ASSIGN-02 | P1 | Kiểm tra hạn: trước `due_at`, đúng hạn, sau hạn khi `allow_late` true/false, sau `late_close_at`. | Status đúng SUBMITTED/LATE hoặc bị từ chối; tính theo giờ máy chủ và không phụ thuộc đồng hồ client. |
| ASSIGN-03 | P1 | S1 nộp text-only, file-only và kết hợp file + text. | Bài nộp lưu đúng nội dung/tệp, liên kết đúng assignment/student; trạng thái và thời gian chính xác. |
| ASSIGN-04 | P1 | Upload file bài nộp; thử vượt 50 MB, MIME/name giả và mất mạng giữa chừng. | Hợp lệ được lưu; lỗi bị chặn và không tạo submission mồ côi/trùng. |
| ASSIGN-05 | P1 | Nộp lại trước khi chấm; nộp lại sau khi trạng thái GRADED. | Nộp lại theo chính sách; bài đã chấm không bị sửa trái phép. |
| ASSIGN-06 | P1 | T1 chấm tổng điểm/nhận xét; S1 xem điểm và feedback. | Score nằm trong miền max_score; người học chỉ đọc được bài của mình; notification được gửi nếu bật. |
| ASSIGN-07 | P1 | Chấm rubric nhiều tiêu chí, điểm bằng 0, điểm max, điểm âm, vượt max; sửa rubric giữa lúc chấm. | Validation đúng; tổng điểm nhất quán; tiêu chí và feedback khớp; xử lý rubric đã dùng an toàn. |
| ASSIGN-08 | P1 | Chấm theo từng câu khách quan/tự luận của assignment. | Câu khách quan được chấm đúng; tự luận chờ người chấm; tổng điểm không cộng trùng. |
| ASSIGN-09 | P1 | Xem trước file submission với vai trò giáo viên chủ lớp, giáo viên khác, học sinh khác. | Chỉ đúng người được phép xem; URL tạm thời không vượt phạm vi. |
| ASSIGN-10 | P1 | T1 cấp lượt nộp/làm bù, thử số 0/âm và cấp cho học sinh ngoài lớp. | Số lượt hợp lệ tăng đúng; ghi người cấp/lý do; trái quyền bị chặn. |
| ASSIGN-11 | P0 | Gọi trực tiếp Firestore/API sửa score/graded_by hoặc nộp thay S2 bằng token S1. | Rules từ chối; không thể giả danh hoặc tự chấm điểm. |
| ASSIGN-12 | P1 | Hai lần submit đồng thời / retry request sau timeout. | Không phát sinh hai submission ngoài ý muốn; operation idempotent hoặc UI hướng dẫn trạng thái rõ. |

### 3.6. Bài kiểm tra, đồng hồ, lượt làm và chấm — G10/H5

| ID | Ưu tiên | Tiền điều kiện / thao tác | Kết quả mong đợi |
|---|---|---|---|
| EXAM-01 | P1 | T1 tạo DRAFT, gắn câu hỏi/trọng số và publish. | DRAFT không hiển thị cho học sinh; PUBLISHED hiển thị đúng nhóm/lớp. |
| EXAM-02 | P0 | Thử bắt đầu trước `open_at`, tại giờ mở, sau `close_at`, với giờ client chỉnh lùi/tiến. | Server time là nguồn chuẩn; ngoài cửa sổ không tạo attempt; biên giờ tuân chính sách. |
| EXAM-03 | P1 | Bắt đầu lượt với attempt hợp lệ và nhiều request đồng thời. | Chỉ tạo lượt hợp lệ, attempt_number tuần tự; không vượt max_attempts. |
| EXAM-04 | P1 | Trả lời nhiều câu; tải lại trang/F5; mở lại từ thiết bị/trình duyệt khác nếu được hỗ trợ. | Đáp án tự lưu và khôi phục đúng attempt; không lẫn attempt của người khác. |
| EXAM-05 | P0 | Hết giờ khi đang làm; mất mạng quanh thời điểm nộp. | Tự nộp theo server policy; trạng thái cuối nhất quán; retry không tạo điểm/attempt trùng. |
| EXAM-06 | P1 | Nộp tay trước hạn và nộp hai lần. | Lần đầu finalize; lần sau idempotent hoặc từ chối; không thể đổi đáp án sau khi khóa. |
| EXAM-07 | P1 | Làm hết số lượt và T1 cấp extra attempts; thử vượt số lượt. | Hết lượt bị chặn; lượt bù đúng số lượng và chỉ cho đúng học sinh. |
| EXAM-08 | P1 | Chấm các dạng khách quan, trọng số lẻ, tổng weight khác 1, điểm biên. | Quy tắc scale/rounding thống nhất; điểm không âm/không vượt max; có test oracle được duyệt. |
| EXAM-09 | P1 | Có câu ESSAY/SHORT_ANSWER, chấm tay, chấm lại. | Trạng thái SUBMITTED đến khi đủ chấm; điểm tổng cập nhật đúng; audit/feedback không mất. |
| EXAM-10 | P0 | Học sinh sửa `total_score`, đáp án sau nộp; T2 đọc attempt của T1. | Firestore Rules từ chối sửa/đọc trái quyền. |
| EXAM-11 | P1 | Tắt/bật AI cho bài thi; thử hỏi AI trong lúc attempt IN_PROGRESS. | Khóa AI khi đang làm bài; mã lỗi và UI thống nhất với đặc tả. |
| EXAM-12 | P1 | Bài thi không có câu hỏi, thời lượng/lượt 0 hoặc giá trị rất lớn. | Không publish/cấu hình không hợp lệ; giới hạn tài nguyên và validation hoạt động. |

### 3.7. Luyện tập thích ứng — H6/API practice

| ID | Ưu tiên | Tiền điều kiện / thao tác | Kết quả mong đợi |
|---|---|---|---|
| PRACT-01 | P1 | Học sinh chưa đủ kết quả chính thức yêu cầu, gọi start từ UI và trực tiếp API. | Cả UI lẫn API từ chối; không tạo phiên tính điểm. |
| PRACT-02 | P1 | Đủ điều kiện, bắt đầu phiên với objective/course hợp lệ. | Server xác nhận quyền/lớp và cấu hình; session ACTIVE gắn đúng học sinh/mục tiêu. |
| PRACT-03 | P0 | Gọi next-question/submit-answer bằng session ID của học sinh khác hoặc session đã đóng. | API xác thực ID token và ownership; request trái quyền bị từ chối. |
| PRACT-04 | P1 | Trả lời đúng/sai liên tiếp tại các ngưỡng đổi độ khó. | Level tăng/giảm theo chính xác quy tắc cấu hình; phản hồi không tiết lộ đáp án trước khi trả lời. |
| PRACT-05 | P1 | Submit cùng answer lặp, sequence sai, question không được server cấp. | Server từ chối replay/tampering; câu trả lời không được ghi hai lần. |
| PRACT-06 | P1 | Kết thúc đủ session_length, bỏ dở phiên, finish lặp. | Trạng thái COMPLETED/ABANDONED đúng; kết quả chỉ được ghi một lần; phiên dở xử lý rõ. |
| PRACT-07 | P1 | Vượt giới hạn phiên tính điểm hằng ngày; đổi course config biên và sai kiểu. | Quota/ngưỡng được thực thi ở server; cấu hình bị clamp/validation như thiết kế. |
| PRACT-08 | P0 | Gửi điểm cao giả hoặc sửa `is_correct`, `weighted_score` trên client/Firestore. | Chỉ điểm server-authoritative được chấp nhận; Rules chặn sửa trái phép. |
| PRACT-09 | P1 | API practice timeout, 401, upstream lỗi, client retry. | Mã lỗi an toàn, không lộ stack/key; session có trạng thái phục hồi và retry không nhân đôi. |
| PRACT-10 | P1 | Kiểm tra lịch sử theo objective của chính mình và objective của người khác. | Chỉ trả lịch sử đúng phạm vi; không rò session/answers. |

### 3.8. Trò chơi ôn tập và lịch sử — H7/G18

| ID | Ưu tiên | Tiền điều kiện / thao tác | Kết quả mong đợi |
|---|---|---|---|
| GAME-01 | P1 | Chơi chế độ Nhanh trong 60 giây, gồm kết thúc sớm/hết giờ. | Timer chính xác; dừng một lần; score/correct_count đúng; lưu một game session. |
| GAME-02 | P1 | Chơi Đua tốc độ: 10 câu × 20 giây; bỏ qua/hết giờ một câu. | Không vượt số câu; timer từng câu đúng; điểm tính theo quy tắc công bố. |
| GAME-03 | P1 | Chơi Sinh tồn: trả lời đúng/sai đến hết 3 khiên hoặc 10 đợt. | Khiên/đợt cập nhật đúng; dừng ở điều kiện kết thúc; không crash khi kết thúc ở biên. |
| GAME-04 | P1 | Câu hỏi thuộc đủ loại được trò chơi hỗ trợ; nội dung có HTML/Unicode. | Render an toàn, chấm đúng; không XSS; câu không tương thích được loại có thông báo. |
| GAME-05 | P1 | Reload/thoát khi đang chơi; gửi kết quả giả từ client. | Trạng thái game theo thiết kế; lịch sử/score không tin dữ liệu client không xác thực. |
| GAME-06 | P0 | S1 xem lịch sử của mình; S2/T2 thử lịch sử lớp ngoài quyền. | Phạm vi dữ liệu đúng; giáo viên chỉ xem lớp phụ trách. |
| GAME-07 | P1 | Kết quả game được ghi vào phân tích mastery hay không. | Tuân đúng chính sách: trò chơi không ảnh hưởng điểm chính thức nếu không được quy định. |

### 3.9. Tiến độ, mastery, lỗ hổng, gợi ý và chất lượng lớp — G15/H8

| ID | Ưu tiên | Tiền điều kiện / thao tác | Kết quả mong đợi |
|---|---|---|---|
| PROG-01 | P1 | Tạo bằng chứng từ bài tập, bài thi và luyện tập có điểm biết trước. | `learning_evidence` ghi đúng source_type/source_id/objective/student; score nằm 0–1. |
| PROG-02 | P0 | Client cố ghi trực tiếp learning_evidence/mastery/knowledge_gaps. | Firestore Rules từ chối các collection chỉ hệ thống/máy chủ được ghi. |
| PROG-03 | P1 | Tính mastery từ nhiều bằng chứng có weight, giá trị biên 0/1 và không có evidence. | Mastery/evidence_count đúng oracle nghiệp vụ; không NaN/ngoài 0–1; snapshot đúng thời điểm. |
| PROG-04 | P1 | Điểm thấp mở gap; cải thiện điểm/đủ evidence; giáo viên dismiss gap. | Trạng thái OPEN/RESOLVED/DISMISSED và reason/timestamp chuyển đúng; không nhân đôi gap đang mở. |
| PROG-05 | P1 | Sinh recommendation ACTIVE; học sinh accept/dismiss. | Gợi ý gắn đúng objective/assessment; trạng thái và responded_at đúng. |
| PROG-06 | P1 | T1 xem dashboard cả lớp; S1 xem dashboard của mình; T2/S2 truy cập trái phạm vi. | Số liệu đúng đối tượng; dữ liệu cá nhân/lớp khác bị chặn. |
| PROG-07 | P1 | Không đủ số học sinh/đáp án tối thiểu theo cấu hình chất lượng lớp. | Dashboard không kết luận sai; hiển thị “chưa đủ dữ liệu”/trạng thái tương ứng. |
| PROG-08 | P1 | Dữ liệu rỗng, nhiều lớp, nhiều môn, học sinh ngừng hoạt động qua ngưỡng. | Dashboard không lỗi; bộ lọc và ngưỡng inactive/reteach/advanced thực hiện đúng. |
| PROG-09 | P1 | Chạy cùng dữ liệu nhiều lần/tải lại dashboard. | Kết quả ổn định, không tạo side effect hoặc evidence trùng. |

### 3.10. Báo cáo và xuất dữ liệu — G14/H9

| ID | Ưu tiên | Tiền điều kiện / thao tác | Kết quả mong đợi |
|---|---|---|---|
| REPORT-01 | P1 | Mở báo cáo tổng hợp và chi tiết cho lớp có dữ liệu chuẩn. | Tổng, trung bình, số lượng và lọc học sinh khớp dữ liệu nguồn/oracle. |
| REPORT-02 | P1 | Mở báo cáo cho lớp rỗng, một học sinh, điểm thiếu/chưa chấm. | Hiển thị empty state; không chia cho 0/điểm mặc định gây hiểu nhầm. |
| REPORT-03 | P1 | Xuất Excel gồm sheet Bảng điểm, tiếng Việt, ngày/điểm và tên file có ký tự đặc biệt. | Workbook mở được; nội dung khớp UI; không sai encoding, công thức không tin cậy không được thực thi. |
| REPORT-04 | P1 | Xuất Word và in ở desktop/mobile. | Tài liệu bố cục đọc được, không cắt dữ liệu quan trọng, tổng điểm khớp. |
| REPORT-05 | P0 | S1/T2 yêu cầu export lớp/báo cáo ngoài quyền. | Bị chặn ở dữ liệu nguồn/server; không chỉ ẩn nút; file không sinh ra chứa dữ liệu ngoài quyền. |
| REPORT-06 | P2 | Export dataset lớn, nhiều cột và Unicode; kiểm tra thời gian/bộ nhớ. | Hoàn tất trong ngân sách hiệu năng đã được chủ sản phẩm phê duyệt hoặc có thông báo giới hạn. |

### 3.11. AI tạo câu hỏi, chat, API key — G11/G12/H10

| ID | Ưu tiên | Tiền điều kiện / thao tác | Kết quả mong đợi |
|---|---|---|---|
| AI-01 | P1 | Lưu API key hợp lệ, kiểm tra, xem trạng thái và xóa key. | Key chỉ gửi qua kênh bảo vệ; server mã hóa AES-256-GCM; UI chỉ hiện hint; xóa làm key không dùng được. |
| AI-02 | P0 | Đọc `ai_keys/{uid}` bằng người khác; kiểm tra Firestore/log/network response. | Ciphertext chỉ chủ sở hữu đọc theo Rules; plaintext/API key không xuất hiện ở log, response, analytics hoặc client storage không an toàn. |
| AI-03 | P1 | Thiếu key, key sai, key thu hồi, Gemini 429/5xx/timeout. | Mã lỗi (ví dụ MISSING_API_KEY/UPSTREAM_UNREACHABLE) đúng; thông báo tiếng Việt; retry có giới hạn; không lộ key/stack. |
| AI-04 | P1 | Tạo 1 và 20 câu; thử 0, 21, prompt quá dài và tham số không hợp lệ. | Chấp nhận đúng giới hạn; từ chối ngoài miền; request/output/job liên kết đúng. |
| AI-05 | P1 | Tạo câu hỏi nền thành công, lỗi một lô, retry; reload trang theo dõi job. | Trạng thái PROCESSING/COMPLETED/FAILED nhất quán; retry không nhân đôi câu đã hoàn tất; UI tiến độ đúng. |
| AI-06 | P1 | Duyệt, sửa-và-duyệt, từ chối output; thử duyệt lặp và output của giáo viên khác. | Chỉ output được phép duyệt; approved tạo câu ngân hàng đúng một lần; trạng thái/reviewer/audit đúng. |
| AI-07 | P0 | Prompt injection trong nội dung bài học/câu hỏi yêu cầu lộ system prompt, key, PII hoặc tạo mã độc. | Hệ thống không tiết lộ bí mật/dữ liệu không liên quan; nội dung AI được coi là không tin cậy và render an toàn. |
| AI-08 | P1 | Chat ở các mode tutor/lesson_plan/gap_analysis/quiz; hội thoại dài, ký tự HTML. | Mode/model phù hợp; thread/message gắn đúng uid; giới hạn độ dài; Markdown sanitized; XSS không thực thi. |
| AI-09 | P0 | S1 chat khi attempt IN_PROGRESS; bài tắt AI; bài không liên quan/lớp khác. | Bị khóa đúng (423/403 theo API); xác thực trạng thái từ nguồn tin cậy; không thể bypass bằng request thủ công. |
| AI-10 | P1 | Học sinh dùng key giáo viên chia sẻ theo quan hệ hợp lệ/không hợp lệ; giáo viên xóa key. | Chỉ đúng chủ lớp/key policy được dùng; xóa/thu hồi có hiệu lực; không dùng key của lớp khác. |
| AI-11 | P1 | Gửi chat/generate không token, token hết hạn, token uid khác user_id trong payload. | API xác minh Firebase ID token; payload user không thể giả mạo danh tính. |
| AI-12 | P1 | Gửi nhiều yêu cầu đồng thời vượt quota/rate policy. | Có rate/cost guard theo cấu hình sản phẩm; hệ thống không bị cạn tài nguyên hoặc phát sinh chi phí ngoài kiểm soát. |

### 3.12. Lịch, thông báo, thùng rác, lịch sử — G13/G16/G17/H11/H12

| ID | Ưu tiên | Tiền điều kiện / thao tác | Kết quả mong đợi |
|---|---|---|---|
| SCHED-01 | P1 | Tạo bài tập có hạn, bài thi có open/close, bài cần chấm. | Lịch/việc cần làm sinh đúng thời điểm, loại và liên kết; không nhân đôi sau reload. |
| SCHED-02 | P1 | Thay đổi hạn, hoàn tất/chấm bài, xóa mềm. | Item lịch cập nhật hoặc biến mất theo trạng thái mới; không còn stale item ngoài chính sách. |
| NOTIF-01 | P1 | Tạo sự kiện có bài mới, bài nộp, điểm mới. | Notification đúng `user_id`, actor/type/title; chỉ đối tượng liên quan nhận. |
| NOTIF-02 | P1 | Nhận Firestore onSnapshot; đánh dấu đã đọc/ẩn/xóa. | Chuông cập nhật; trạng thái read_at/is_read chính xác và bền vững. |
| NOTIF-03 | P1 | Mô phỏng Realtime không khả dụng, chuyển polling 10 giây rồi phục hồi. | Có fallback không mất thông báo; không tạo listener/poll trùng; dừng polling khi không cần. |
| NOTIF-04 | P0 | User khác đọc/sửa/xóa notification của người dùng hiện tại. | Firestore Rules từ chối. |
| TRASH-01 | P1 | Xóa mềm từng loại được hỗ trợ: topic, lesson, assignment, question, assessment. | `deleted_at` được ghi; item biến mất khỏi danh sách hoạt động nhưng còn trong thùng rác. |
| TRASH-02 | P1 | Khôi phục item; kiểm tra liên kết/index/quyền và học sinh. | Item trở lại đúng vị trí/trạng thái; không tạo duplicate; quyền không mở rộng. |
| TRASH-03 | P0 | Xóa vĩnh viễn item có quan hệ phụ thuộc; người không phải chủ sở hữu gọi purge. | Cảnh báo dependency/confirm; xóa cascade theo chính sách; unauthorized purge bị chặn; không để dữ liệu mồ côi ngoài ý muốn. |
| HIST-01 | P1 | Tạo/sửa/xóa nội dung; mở lịch sử trước/sau. | `content_revisions` lưu action, entity, actor, before/after đúng; lịch sử chỉ hiển thị đối tượng được phép. |
| HIST-02 | P0 | User cố ghi/sửa/xóa revision trực tiếp hoặc T2 xem lịch sử T1. | Rules từ chối ghi trái quyền; không thể giả mạo audit history. |

### 3.13. API, bảo mật, cấu hình và triển khai

| ID | Ưu tiên | Tiền điều kiện / thao tác | Kết quả mong đợi |
|---|---|---|---|
| API-01 | P1 | Gọi `GET /api/health/upstream` và `/api/server-now`. | Health response không tiết lộ secret; thời gian định dạng/UTC thống nhất với client. |
| API-02 | P0 | Gọi API AI/practice bằng thiếu/sai token ở Authorization, `X-EducMind-Token`, body token. | Chỉ token hợp lệ được chấp nhận; không cho phép token giả/expired; không ghi token vào log. |
| API-03 | P1 | Kiểm tra method/path/body/schema/size sai; gửi payload rất lớn. | 400/404/413/405 phù hợp; server không crash; không phản chiếu HTML/stack. |
| API-04 | P0 | Kiểm tra CORS, CSP, frame embedding, MIME sniffing, referrer, security headers. | Chính sách khớp domain được duyệt; không wildcard ngoài ý muốn; không inline script unsafe; iframe clickjacking bị hạn chế. |
| API-05 | P1 | Đo timeout upstream 15 giây và retry tối đa 1 lần; upstream không hồi đáp. | Tổng thời gian bị giới hạn; lỗi 502 `UPSTREAM_UNREACHABLE` hoặc contract tương ứng; không treo request. |
| API-06 | P0 | Kiểm tra lỗi và request logs với payload có API key, email, chat, answer. | Không ghi secret/PII quá mức; log có correlation ID và đủ dữ liệu chẩn đoán theo chính sách retention. |
| SEC-01 | P0 | Chạy toàn bộ `firestore.rules.test.ts`/Dirty Dozen trên Firebase Emulator. | Tất cả payload trái phép bị `PERMISSION_DENIED`; test hợp lệ cũng phải xác minh được allow path để tránh rules luôn deny. |
| SEC-02 | P0 | Kiểm thử ma trận read/create/update/delete cho mọi role/collection: chủ lớp, học sinh cùng lớp, học sinh lớp khác, giáo viên khác, anonymous. | Mỗi thao tác theo policy; quyền xác minh tại Firestore Rules, không phụ thuộc UI. Lưu ma trận kết quả theo collection. |
| SEC-03 | P0 | Kiểm tra IDOR bằng thay `class_id`, `student_id`, `teacher_id`, `uid`, document ID trong mọi endpoint. | Không truy cập/thao tác chéo tenant; tất cả IDs được xác thực quan hệ. |
| SEC-04 | P0 | Fuzz payload: field thừa/thiếu, kiểu sai, chuỗi quá dài, NaN/Infinity, ID sai, timestamp giả. | Rules/API reject theo schema; không có bypass qua update field hoặc null/field omission. |
| SEC-05 | P0 | Chạy dependency audit/SCA và secret scanning theo chính sách CI. | Không còn critical/high chưa xử lý; ngoại lệ có người duyệt, lý do và hạn xử lý. |
| DEPLOY-01 | P1 | Cài sạch từ lockfile trên Node version công bố; chạy lint/test/build/start. | Tái lập được; build/start thành công; không phụ thuộc file local bị bỏ qua. |
| DEPLOY-02 | P0 | Deploy cấu hình QA/production không có biến secret bắt buộc hoặc sai Firebase config. | Startup fail-fast hoặc chức năng phụ thuộc bị disable an toàn; không chạy ngầm với default không an toàn. |
| DEPLOY-03 | P1 | Restart server trong khi có request; kiểm tra health/log/port. | Server khởi động lại ổn; không mất dữ liệu đã commit; health check phản ánh trạng thái thật. |
| DEPLOY-04 | P0 | Backup/restore hoặc diễn tập khôi phục Firestore/Storage theo kế hoạch. | RPO/RTO được đo, dữ liệu có thể khôi phục và kiểm tra quyền sau restore. |

---

## 4. Kiểm thử phi chức năng và sẵn sàng thương mại

Các ngưỡng dưới đây cần Product/Engineering chốt trước khi test. Không tự gán SLA/throughput khi chưa biết số người dùng mục tiêu và gói Firebase triển khai.

| ID | Nhóm | Phương pháp / tiêu chí đạt cần thống nhất |
|---|---|---|
| NFR-01 | Hiệu năng | Xác định tải mục tiêu (đồng thời, request/s, lớp/học sinh, dữ liệu). Load test login, mở dashboard, lưu đáp án, submit, report và notifications; p95/p99/error rate phải đạt SLO đã duyệt. |
| NFR-02 | Tải đột biến | Spike test khi cả lớp cùng bắt đầu thi/nộp bài; không mất đáp án, trùng submission, vượt quota hoặc bị retry storm. |
| NFR-03 | Tải dài hạn | Soak test tối thiểu một chu kỳ đại diện (ví dụ 4–8 giờ theo release plan); theo dõi RAM, event loop, listeners, Firestore reads/writes, Storage và Gemini quota. |
| NFR-04 | Mạng kém/offline | Mô phỏng latency, packet loss, offline/online, chuyển tab, sleep/wake. Không báo lưu thành công khi chưa lưu; đồng bộ không nhân đôi/ghi đè sai. |
| NFR-05 | Tương thích | Chạy smoke/regression trên browser/OS nằm trong ma trận hỗ trợ chính thức; responsive desktop/tablet/mobile và zoom 200%. |
| NFR-06 | Trợ năng | Bàn phím-only, focus visible, label/form error, contrast, heading/landmark và screen reader cho đăng nhập, làm thi, nộp bài, thông báo. Đặt mục tiêu WCAG 2.2 AA nếu sản phẩm cam kết. |
| NFR-07 | Bảo mật web | DAST/SAST, XSS/CSRF/CORS/SSRF/open redirect/clickjacking/rate limits/file upload; penetration test độc lập trước phát hành thương mại và sau thay đổi lớn. |
| NFR-08 | Riêng tư | Lập data inventory, mục đích/retention/xóa, quyền truy cập, xử lý dữ liệu trẻ em và consent/notice theo luật áp dụng; kiểm tra không gửi PII vào Gemini ngoài chính sách. |
| NFR-09 | Khả phục hồi | Diễn tập backup/restore; kiểm tra purge/xóa tài khoản, orphan files và đồng bộ indexes. |
| NFR-10 | Quan sát hệ thống | Logs/metrics/traces có alert cho error rate, auth failures, quota, upstream latency, Firestore/Storage failures; không thu secret/PII nhạy cảm. |
| NFR-11 | Khả vận hành | Có runbook incident, rollback, on-call, quản lý secret/rotation, quota/cost alert, bảo trì dependencies, support và escalation. |
| NFR-12 | Localization/time | Kiểm tra tiếng Việt/Unicode, timezone (UTC và giờ VN), daylight/time boundaries, định dạng ngày/điểm, thông báo lỗi dễ hiểu. |

---

## 5. Ma trận bao phủ chức năng

| Nguồn trong báo cáo | Nhóm test liên kết |
|---|---|
| G1/H1 | AUTH-01…AUTH-10 |
| G2–G4/H2 | CLASS-01…CLASS-14 |
| G5–G7/H3 | CONTENT-01…CONTENT-05, RES-01…RES-07 |
| G8 / 7 dạng câu hỏi | QUESTION-01…QUESTION-10 |
| G9/H4 | ASSIGN-01…ASSIGN-12 |
| G10/H5 | EXAM-01…EXAM-12 |
| H6, API practice | PRACT-01…PRACT-10 |
| H7/G18 | GAME-01…GAME-07 |
| G15/H8 | PROG-01…PROG-09 |
| G14/H9 | REPORT-01…REPORT-06 |
| G11/G12/H10 | AI-01…AI-12 |
| G13/H12 | SCHED-01…SCHED-02 |
| H11 | NOTIF-01…NOTIF-04 |
| G16/G17 | TRASH-01…TRASH-03, HIST-01…HIST-02 |
| Server/Firestore/Storage | API-01…API-06, SEC-01…SEC-05 |
| Triển khai | DEPLOY-01…DEPLOY-04 |
| Phi chức năng/sản phẩm thương mại | NFR-01…NFR-12 |

---

## 6. Tiêu chí nghiệm thu / release gate

Chỉ đề xuất phát hành khi **tất cả** điều kiện bắt buộc bên dưới được người có thẩm quyền xác nhận:

- [ ] Tất cả P0 và P1 trong phạm vi release chạy trên build release candidate; không còn lỗi P0/P1 chưa có phê duyệt ngoại lệ.
- [ ] `npm run lint`, unit test và test Firestore Rules chạy từ CI sạch; có bằng chứng, kết quả không dựa vào test bị skip hoặc chỉ chạy một phần.
- [ ] Toàn bộ luồng cốt lõi end-to-end thành công trên Firebase QA: tạo tài khoản/lớp → nội dung → assignment/exam → chấm → mastery/report → quyền truy cập.
- [ ] Rules positive + negative test đầy đủ, đặc biệt role immutability, chéo tenant, attempt/submission, dữ liệu server-only, Storage object access.
- [ ] Load/performance SLO, quota, chi phí Firebase/Gemini và giới hạn concurrent users đã được chủ sản phẩm định nghĩa và test đạt.
- [ ] DAST/SAST/dependency/secret scan và rà soát bảo mật độc lập hoàn tất; không có finding nghiêm trọng chưa xử lý.
- [ ] Backup/restore, rollback, monitoring/alerts, incident response, support và chính sách retention/xóa dữ liệu đã được diễn tập/phê duyệt.
- [ ] Kiểm thử riêng tư và pháp lý đối với tài khoản học sinh/trẻ em, consent, lưu trữ/xử lý dữ liệu và dịch vụ AI được người phụ trách phù hợp duyệt.
- [ ] UAT được giáo viên/học sinh đại diện thực hiện trên thiết bị/browser mục tiêu; có xác nhận nghiệm thu.

**Quyết định phát hành:** `PENDING` / `GO` / `NO-GO`  
**Build/commit:** ____________________  
**QA owner:** ____________________  
**Product owner:** ____________________  
**Security/Privacy approver:** ____________________  
**Ngày và chữ ký:** ____________________

---

## 7. Căn cứ và giới hạn

- Đặc tả chức năng, vai trò, luồng và công nghệ lấy từ `BAO_CAO_KY_THUAT.md` (đặc biệt mục 3, 6–12, phụ lục API).
- Test case liên kết với tên collection/API được tài liệu mô tả; trước khi chạy cần đối chiếu implementation hiện tại, vì báo cáo kỹ thuật không thay thế acceptance criteria chi tiết của chủ sản phẩm.
- Một số chi tiết (chính sách OTP/rate limit, retry, số lần nộp lại, làm tròn điểm, quy tắc tính mastery, quyền export, retention, SLA/RPO/RTO) cần được Product/Engineering chốt bằng quyết định có phiên bản. Nếu chưa chốt, ca liên quan phải ghi `BLOCKED` thay vì tự giả định.
- Kiểm thử thực tế trên dữ liệu giả và môi trường cô lập; tuyệt đối không chạy các ca phá hủy trên Production.
