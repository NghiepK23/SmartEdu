# EducMind – Thiết kế cá nhân hoá dạy và học và kế hoạch triển khai

Bản phác thảo ngày 24/11/2026 · Repo NghiepK23/EducMindSystem, nhánh arena/7ba8e28c-educmindsystem · Dựa trên việc đọc README, các migration SQL, Edge Function ai-generate và một phần mã giao diện. Chưa chạy thử hệ thống; mọi đoạn SQL dưới đây là bản phác thảo, chưa kiểm thử.

## 1. Bối cảnh và nguyên tắc

EducMind đã có phần **chẩn đoán** khá vững: mức nắm vững theo mục tiêu (trung bình có trọng số, bằng chứng giảm một nửa sau 30 ngày), lỗ hổng kiến thức tự mở/đóng (mở khi dưới 50% và có từ 2 bằng chứng, đóng khi từ 65%), gợi ý ba mức (dưới 40% ôn lại nội dung, 40–69% luyện tập có mục tiêu, từ 70% hoạt động nâng cao) và khóa mở bài theo ngưỡng (mặc định 0,8). Chỗ còn thiếu là **can thiệp và thích ứng**, nên có ba việc:

1. Gắn tài nguyên và câu hỏi với mục tiêu để gợi ý trỏ đúng chỗ.
2. Luyện tập thích ứng theo độ khó.
3. Bảng điều khiển lớp cho giáo viên.

Nguyên tắc chung: logic nghiệp vụ nằm ở cơ sở dữ liệu (RLS, RPC, trigger); không sửa migration đã triển khai (README quy ước), mọi thay đổi là migration mới; chạy thử trên một dự án Supabase phát triển trước khi đẩy lên dự án thật.

## 2. Các quyết định đã chốt

| Chủ đề | Quyết định |
| --- | --- |
| Việc 1 | Bảng `resource_objectives` với `purpose` gồm `LEARN`, `PRACTICE`, `EXTEND`; cho phép gắn tài nguyên với mục tiêu của bài học khác trong cùng khóa |
| Việc 2 | Trọng số bằng chứng luyện tập cấu hình được; luyện tập góp phần mở khóa với số bằng chứng chính thức tối thiểu cấu hình được; độ dài phiên và giới hạn phiên tính điểm mỗi ngày cấu hình được |
| Việc 2: giá trị khởi đầu | `practice_weight` 0,3 · `practice_unlock_min_official` 1 · `practice_session_length` 8 · `practice_daily_scored_sessions` 3 · `practice_max_share` 0,5 |
| Việc 3 | Thứ tự 3a (chỉ xem) → 3b (giao bài theo nhóm) → 3c (tóm tắt bằng AI) |
| Việc 3: ngưỡng | `dash_reteach_share` 0,4 · `dash_min_students` 5 · `dash_advanced_threshold` 0,8 · `dash_inactive_days` 14 · `dash_question_min_answers` 10 |
| Cấu hình | Đặt trên bảng `courses`, giống `sequential_unlock` |

Các giá trị khởi đầu là ước tính để làm việc, chưa dựa trên dữ liệu thực tế; nên xem lại sau vài tuần dùng thật.

## 3. Việc 1: Gắn tài nguyên và câu hỏi với mục tiêu

**Hiện trạng.** `question_objectives` và `assignment_objectives` đã có. Bảng `resources` chỉ có `course_id` và `lesson_id`, chưa gắn được với mục tiêu. Thẻ gợi ý chỉ dẫn tới trang bài học hoặc bài kiểm tra chung. Học sinh không đọc trực tiếp bảng `questions` (RLS), chỉ qua RPC.

**Dữ liệu.**

```sql
create table public.resource_objectives(
  resource_id  uuid not null references public.resources(id) on delete cascade,
  objective_id uuid not null references public.learning_objectives(id) on delete cascade,
  purpose text not null default 'LEARN' check (purpose in ('LEARN','PRACTICE','EXTEND')),
  created_at timestamptz not null default now(),
  primary key(resource_id,objective_id)
);
create index resource_objectives_objective_idx on public.resource_objectives(objective_id);
```

Thêm trigger kiểm tra cùng khóa học (mô phỏng `validate_objective_link()`), RLS chỉ cho giáo viên có `can_manage_course` ghi và đọc; học sinh đọc qua RPC.

| `recommendations.kind` | Ưu tiên `purpose` |
| --- | --- |
| `REVIEW_CONTENT` | `LEARN` |
| `TARGETED_PRACTICE` | `PRACTICE`, rồi `LEARN` |
| `ADVANCED_ACTIVITY` | `EXTEND` |

**Đường đọc cho học sinh.** RPC `student_objective_support(objective, kind)` kiểm tra đăng nhập, vai trò `STUDENT` và `can_access_course`; trả tài nguyên theo `resource_objectives`, loại tài nguyên đã xóa mềm, áp cùng điều kiện hiển thị như `can_read_resource` (bài và chủ đề đã xuất bản), sắp xếp theo bảng trên. Nếu mục tiêu chưa có liên kết nào thì dự phòng bằng tài nguyên của bài học chứa mục tiêu. Không lưu tài nguyên vào `recommendations`; tra cứu lúc hiển thị để sửa liên kết thì gợi ý cũ cũng cập nhật. Khóa mở bài không chặn ở đây vì gợi ý luôn thuộc bài học đã học.

**Giao diện.** Giáo viên: khi tải tài nguyên hoặc sửa tài nguyên có sẵn, chọn nhiều mục tiêu và `purpose`; bảng độ phủ cho từng mục tiêu (số tài liệu theo `purpose`, số câu hỏi theo độ khó), cảnh báo khi thiếu tài liệu `LEARN` hoặc quá ít câu hỏi. Học sinh: thẻ gợi ý hiện danh sách tài liệu nên xem và số câu luyện tập khả dụng. Không tự động gắn tài nguyên cũ vào mọi mục tiêu của bài học.

**Kiểm thử.** Gắn tài nguyên khác khóa học bị từ chối; tài nguyên của bài chưa xuất bản không hiện với học sinh; xóa mềm làm tài nguyên biến khỏi gợi ý; mục tiêu chưa gắn thì dùng dự phòng theo bài học; học sinh lớp khác gọi RPC bị từ chối.

**Chưa xác minh.** Chính sách đọc riêng cho tài nguyên dạng liên kết (`resource_link_read`) có cùng điều kiện hiển thị hay không; form tải tài nguyên hiện tại ở `js/db/04-content.js` cần đọc kỹ để chèn ô chọn mục tiêu.

## 4. Việc 2: Luyện tập thích ứng theo độ khó

**Phát hiện quan trọng.** `game_questions` trả đáp án đúng về trình duyệt và trò chơi chấm ở phía giao diện (`dbGameGrade`), nên **không thể dùng lại** cho luyện tập có ghi bằng chứng. Luyện tập phải chấm ở máy chủ và không gửi đáp án trước khi học sinh trả lời. Ngoài ra `learning_evidence.source_type` hiện chỉ cho `ASSIGNMENT` và `ASSESSMENT`. Phần dùng lại được: quy tắc chọn câu hợp lệ của `game_questions` (đúng cấu trúc từng dạng, loại câu thuộc bài kiểm tra chưa đóng) và nhãn `difficulty` (`EASY/MEDIUM/HARD`).

**Dữ liệu.**

```sql
alter table public.learning_evidence drop constraint <tên ràng buộc source_type>;
alter table public.learning_evidence add constraint ... check(source_type in ('ASSIGNMENT','ASSESSMENT','PRACTICE'));
alter table public.learning_evidence add column weight numeric(4,3) not null default 1;

create table public.practice_sessions(
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id),
  objective_id uuid not null references public.learning_objectives(id),
  recommendation_id uuid references public.recommendations(id) on delete set null,
  status text not null default 'ACTIVE' check(status in ('ACTIVE','COMPLETED','ABANDONED')),
  start_level text not null, current_level text not null,
  target_count integer not null default 8,
  started_at timestamptz not null default now(), completed_at timestamptz
);
create unique index practice_one_active on public.practice_sessions(student_id,objective_id) where status='ACTIVE';

create table public.practice_answers(
  session_id uuid not null references public.practice_sessions(id) on delete cascade,
  seq integer not null,
  question_id uuid not null references public.questions(id),
  level text not null,
  served_at timestamptz not null default now(),
  answer jsonb, is_correct boolean, answered_at timestamptz,
  primary key(session_id,seq), unique(session_id,question_id)
);
```

Dòng `practice_answers` được tạo lúc **phát** câu hỏi, nên học sinh chỉ nộp được câu mà máy chủ đã phát. Học sinh chỉ đọc dòng của mình, giáo viên đọc qua `can_manage_class`; mọi ghi đều qua RPC (thu hồi insert/update/delete của `authenticated`).

**Thuật toán (bậc thang).** Mức bắt đầu theo mức nắm vững hiện có: dưới 40% `EASY`, 40–69% `MEDIUM`, từ 70% `HARD`; chưa có dữ liệu thì `MEDIUM`. Đúng 2 câu liên tiếp thì lên một mức, sai 1 câu thì xuống một mức. Chọn câu ưu tiên đúng mức, chưa làm gần đây; rồi mức kề; sau cùng mới lặp. Chỉ lấy câu có liên kết mục tiêu, hợp lệ theo quy tắc của `game_questions`, loại tự luận và trả lời ngắn. Kết thúc khi đủ `practice_session_length` câu hoặc học sinh dừng.

| RPC | Việc làm |
| --- | --- |
| `start_practice(objective, recommendation?)` | Kiểm quyền; tiếp tục phiên ACTIVE nếu có, không thì tạo mới; chốt số câu từ cấu hình |
| `next_practice_question(session)` | Chọn câu, ghi dòng `practice_answers`, trả `content/kind/options`, không trả đáp án hay lời giải |
| `submit_practice_answer(session, question, answer)` | Chấm ở máy chủ, trả đúng/sai kèm lời giải, cập nhật mức |
| `finish_practice(session)` | Tính điểm phiên, gọi `record_evidence('PRACTICE', …)` |

Điểm phiên tính theo trọng số độ khó (ví dụ EASY 1, MEDIUM 2, HARD 3): Σ(trọng số × đúng) ÷ Σ trọng số. Đây là đề xuất làm việc, chưa có căn cứ dữ liệu.

**Trọng số và trần tỷ trọng.** Công thức mới trong `recalc_mastery`, với W\_o là tổng trọng số bằng chứng chính thức, W\_p là tổng trọng số luyện tập (đã nhân hệ số theo tuổi):

```
f = min(1, (share ÷ (1 − share)) × W_o ÷ W_p)
mức nắm vững = (Σ w_o·s_o + f · Σ w_p·s_p) ÷ (W_o + f · W_p)
```

Ví dụ cùng độ tuổi, một bài tập 0,5 điểm và một phiên luyện tập 1,0 điểm: trọng số luyện tập 0 cho 0,50; 0,3 cho 0,615; 1 cho 0,75. Hai điểm yếu cần chặn: (a) nếu chỉ có bằng chứng luyện tập thì trọng số bị triệt tiêu và một phiên điểm 1,0 cho mức nắm vững 1,0, nên `practice_unlock_min_official` là bắt buộc: chưa đủ bằng chứng chính thức thì phiên vẫn chạy nhưng không ghi bằng chứng; nếu giáo viên đặt giá trị này bằng 0 thì bỏ trần; (b) trọng số tính theo từng dòng nên nhiều phiên cộng dồn (10 phiên × 0,3 = 3,0 so với một bài tập 1,0), `practice_max_share` chặn trần tỷ trọng luyện tập, ví dụ 0,5 nghĩa là tổng trọng số luyện tập không vượt tổng bằng chứng chính thức. Trọng số được ghi cố định vào từng bằng chứng lúc tạo nên đổi cấu hình chỉ ảnh hưởng phiên mới; có thể thêm nút "Tính lại" sau.

**Chống lạm dụng.** Giới hạn số phiên tính điểm mỗi ngày cho mỗi mục tiêu (các phiên sau vẫn làm được nhưng không ghi bằng chứng); không lặp lại câu trong N ngày; trọng số thấp; trần tỷ trọng.

**Giao diện.** Thẻ gợi ý có nút bắt đầu luyện tập kèm số câu khả dụng. Màn luyện tập hiện một câu mỗi lần, thanh tiến độ, phản hồi đúng/sai và lời giải ngay sau mỗi câu (đáp án đến từ phản hồi của máy chủ); cuối phiên tóm tắt và mức nắm vững mới. Giáo viên chỉnh năm cài đặt `practice_*` trong cài đặt lớp.

**Kiểm thử.** Nộp câu chưa được phát bị từ chối; phản hồi của `next_practice_question` không chứa đáp án; câu thuộc bài kiểm tra chưa đóng không bao giờ được phát; hai tab chỉ có một phiên ACTIVE mỗi mục tiêu; đúng liên tiếp thì lên mức, sai thì xuống, hết câu ở một mức thì sang mức kề; phiên kết thúc có đúng một dòng bằng chứng `PRACTICE` và `mastery` được tính lại; vượt giới hạn phiên mỗi ngày thì không ghi thêm bằng chứng.

**Chưa xác minh.** Chưa đọc hàm chấm từng câu bên trong `autograde_attempt` và `autograde_assignment_submission` (cần tách thành hàm dùng chung); chưa kiểm tra `questions.difficulty` có ràng buộc giá trị ở cấp bảng hay không; độ khó là nhãn do giáo viên hoặc AI gán nên có thể sai, về sau nên so với tỷ lệ đúng thực tế.

## 5. Việc 3: Bảng điều khiển lớp cho giáo viên

**Hiện trạng.** Giáo viên đã có bảng mức nắm vững (học sinh × mục tiêu, gom theo bài, trung bình lớp, số học sinh dưới 50%), danh sách lỗ hổng và gợi ý; dữ liệu tải về trình duyệt rồi tính ở đó. Chưa có: xếp hạng mục tiêu theo mức yếu của cả lớp, phân nhóm học sinh, thống kê chất lượng câu hỏi, xu hướng theo thời gian (bảng `mastery` chỉ giữ giá trị hiện tại), giao việc khác nhau cho từng nhóm. Giữ nguyên bảng cũ làm màn chi tiết và thêm trang "Tổng quan lớp" tính ở máy chủ.

**Ảnh chụp mức nắm vững.**

```sql
create table public.mastery_snapshots(
  student_id uuid not null references public.profiles(id),
  objective_id uuid not null references public.learning_objectives(id) on delete cascade,
  mastery_score numeric(5,4) not null, evidence_count integer not null,
  recorded_at timestamptz not null default now()
);
create index mastery_snapshots_obj_idx on public.mastery_snapshots(objective_id,recorded_at);
```

`recalc_mastery` ghi thêm một dòng mỗi khi điểm đổi, để vẽ xu hướng và đo xem luyện tập hoặc gợi ý có làm điểm tăng thật hay không. Lịch sử không thể dựng lại sau này nên cần ghi sớm (xem mục 6).

**Bốn RPC chỉ dành cho giáo viên** (kiểm `can_manage_course`, chỉ trả học sinh của lớp đó):

| RPC | Nội dung |
| --- | --- |
| `class_objective_stats(course)` | Mỗi mục tiêu: số học sinh có dữ liệu, mức nắm vững trung bình, số học sinh theo ba tầng (dưới 40, 40–69, từ 70), số lỗ hổng mở, số bằng chứng chính thức và luyện tập, độ phủ tài nguyên và câu hỏi |
| `class_student_groups(course)` | Nhóm `SUPPORT` (trung bình dưới 50% hoặc có lỗ hổng mở), `ON_TRACK`, `ADVANCED` (từ ngưỡng nâng cao và không có lỗ hổng), `NO_DATA`, `INACTIVE`; kèm tối đa 3 mục tiêu yếu nhất mỗi học sinh |
| `class_question_stats(course)` | Tỷ lệ đúng thực tế của từng câu (bài kiểm tra, bài tập, luyện tập) so với nhãn độ khó; gắn cờ khi lệch rõ và đủ số câu trả lời |
| `class_practice_activity(course)` | Số học sinh đã luyện, số phiên, điểm trung bình, số lỗ hổng được đóng sau khi luyện tập |

**Trang "Tổng quan lớp".** Thẻ tóm tắt (tỷ lệ theo nhóm, số lỗ hổng mở, số phiên luyện tập 7 ngày); mục tiêu cần chú ý xếp theo tỷ lệ học sinh dưới 50% với cờ thiếu tài liệu hoặc câu hỏi và gợi ý dạy lại; nhóm học sinh (chỉ giáo viên thấy nhãn); câu hỏi nên xem lại; mức tham gia luyện tập. Mỗi khối liên kết xuống bảng chi tiết cũ. Không thêm chức năng gửi thông báo thủ công vì thông báo tự động đã đủ.

**Ngưỡng cấu hình** (trên `courses`): `dash_reteach_share` 0,4 (tỷ lệ học sinh dưới 50% để gợi ý dạy lại); `dash_min_students` 5 (số học sinh có dữ liệu tối thiểu để đưa khuyến nghị cấp lớp); `dash_advanced_threshold` 0,8; `dash_inactive_days` 14; `dash_question_min_answers` 10.

**Ba giai đoạn.** 3a chỉ xem (các mục trên). 3b giao bài theo nhóm: hiện bài tập áp dụng cho cả lớp, cần bảng `assignment_targets(assignment_id, student_id)` và sửa điều kiện hiển thị (`student_can_submit`, danh sách bài). 3c tóm tắt bằng AI từ số liệu đã tổng hợp và ẩn danh, dùng key Gemini riêng của giáo viên theo cơ chế hiện có.

**Kiểm thử.** Giáo viên lớp khác hoặc học sinh gọi RPC bị từ chối; lớp dưới `dash_min_students` không sinh khuyến nghị cấp lớp; học sinh vừa có lỗ hổng vừa trung bình 85% vào `SUPPORT`; câu gắn nhãn `EASY` nhưng tỷ lệ đúng thấp thì bị gắn cờ khi đủ số câu trả lời và không gắn cờ khi chưa đủ.

**Chưa xác minh.** Chính sách RLS đọc `mastery`, `knowledge_gaps`, `learning_evidence` cho phép giáo viên đọc dữ liệu học sinh trong lớp quản lý (đã thấy mô thức tương tự `recommendation_read` nhưng câu lệnh bị cắt); cách tính tỷ lệ đúng từ ba nguồn có thể lệch (bài tập tính theo trọng số câu, bài kiểm tra có cách riêng), cần thống nhất công thức.

## 6. Kế hoạch triển khai

### 6.1 Thứ tự migration

Tên tệp dùng mốc thời gian sau `20261122164500`.

| # | Giai đoạn | Nội dung | Ghi chú |
| --- | --- | --- | --- |
| M1 | Việc 1 | `resource_objectives`, trigger, RLS; RPC `student_objective_support`, `objective_coverage` | Chỉ thêm, không đụng bảng cũ |
| M2 | Việc 2 (nền) | 5 cột `practice_*` trên `courses` kèm ràng buộc khoảng giá trị; `learning_evidence` thêm `PRACTICE` và `weight`; bảng `mastery_snapshots` | Tách khỏi M3 để M3 chỉ còn logic |
| M3 | Việc 2 (logic) | Tách hàm chấm câu dùng chung; `practice_sessions`, `practice_answers`; 4 RPC; viết lại `recalc_mastery` (trọng số, trần tỷ trọng, ngưỡng chính thức, ghi ảnh chụp) | Rủi ro cao nhất |
| M4 | 3a | 5 cột `dash_*`; 4 RPC `class_*` | Chỉ đọc |
| M5 | 3b | `assignment_targets`; sửa điều kiện hiển thị và nộp bài | Đụng nhiều chỗ nhất |
| E1 | 3c | Edge Function tóm tắt AI, dùng lại cơ chế giải mã key của `ai-credentials` | Chỉ gửi số liệu đã tổng hợp, ẩn danh |

Bảng `mastery_snapshots` và việc ghi ảnh chụp nên có ngay từ M2/M3, dù chỉ Việc 3 mới dùng, để khi làm 3a đã có dữ liệu xu hướng.

### 6.2 Tệp JavaScript

| Giai đoạn | Tệp | Việc |
| --- | --- | --- |
| Việc 1 | `js/03-supabase.js` | Thêm hàm gọi trong `EducMindDB` (mỗi hàm một lệnh) |
|  | `js/db/04-content.js` | Form `uploadResource` và `addResourceLink`: ô chọn mục tiêu và `purpose`; danh sách tài nguyên; bảng độ phủ |
|  | `js/db/09-progress.js` (khoảng dòng 316–339) | Thẻ gợi ý: danh sách tài liệu và số câu luyện tập thay cho nút "Xem bài học" chung |
| Việc 2 | `js/db/17-practice.js` (mới) | Màn luyện tập; tái dùng hàm hiển thị đáp án của `15-games.js`, dữ liệu lấy từ RPC |
|  | `js/db/03-classes.js` (dự kiến) | Cài đặt `practice_*`; chưa xác minh đây có phải nơi đặt cài đặt lớp |
| 3a | `js/db/18-class-overview.js`, `css/14-*.css` (mới) | Trang "Tổng quan lớp", đăng ký vào `DB_PAGES` |
|  | `js/db/02-shell.js` | Thêm mục vào `DB_NAV_T`, nhóm "Đánh giá học tập" |
| 3b | `js/db/05-assignments.js` | Chọn nhóm khi giao bài |
| 3c | `js/db/18-class-overview.js` | Nút "Tóm tắt bằng AI" |

### 6.3 Rủi ro và cách giảm

1. **Viết lại `recalc_mastery` (M3).** Mọi điểm đều đi qua hàm này. Tiêu chí nghiệm thu bắt buộc: khi chưa có bằng chứng `PRACTICE` và mọi `weight = 1`, kết quả phải **trùng chính xác** với công thức cũ trên dữ liệu hiện có; chụp trước toàn bộ bảng `mastery`, chạy bản mới rồi so sánh.
2. **Tách hàm chấm câu dùng chung.** Cần đọc kỹ `autograde_attempt` và `autograde_assignment_submission` trước khi sửa; sai lệch làm lệch điểm chính thức.
3. **3b thay đổi quyền nhìn thấy bài tập.** Sai điều kiện có thể làm học sinh thấy bài không thuộc về mình hoặc mất bài đáng thấy; kiểm thử cả hai chiều.
4. **Tải dữ liệu.** Các màn cũ tải toàn bộ về trình duyệt; trang mới dùng RPC tổng hợp.
5. **Ngưỡng mặc định chưa có căn cứ.** Xem lại sau vài tuần dùng thật nhờ ảnh chụp và thống kê câu hỏi.

### 6.4 Kiểm thử

- Cơ sở dữ liệu: các tình huống đã liệt kê ở từng việc (quyền, rò rỉ đáp án, giới hạn phiên, trần tỷ trọng, nhóm học sinh, cờ câu hỏi).
- So sánh số liệu trước/sau M3 như mục 6.3.
- Thủ công theo vai trò: một tài khoản giáo viên và hai tài khoản học sinh thuộc hai lớp khác nhau, để kiểm tra không rò dữ liệu giữa lớp.

## 7. Điểm còn chưa xác minh (tổng hợp)

Tám điểm đã được kiểm tra lại trong mã nguồn nhánh arena/7ba8e28c-educmindsystem (24/11/2026). Bảy điểm có kết quả rõ ràng; tên ràng buộc `source_type` chỉ kiểm tra được trong migration, chưa kiểm tra được trên cơ sở dữ liệu thật.

| Điểm | Kết quả kiểm tra | Hệ quả cho thiết kế |
| --- | --- | --- |
| Nơi đặt giao diện cài đặt lớp | Đã xác minh: công tắc "Mở bài học tuần tự" nằm ở `js/db/04-content.js` (dòng \~111, xử lý \~554 gọi `updateCourse`). Đây là nơi cài đặt cấp khóa học hiện có. | Đặt cài đặt `practice_*` và `dash_*` cạnh công tắc này, không dùng `03-classes.js`. Thêm cột mới vào các câu `select` của `courses` trong `js/03-supabase.js` (dòng 85–89: `listCourses`, `listCoursesForClasses`, `createCourse`, `updateCourse`), nếu không giao diện không đọc được giá trị mới. |
| Cách `index.html` nạp tệp trong `js/db/` | Đã xác minh: nạp bằng thẻ script liệt kê thủ công, `js/db/01` đến `16` rồi `js/76-main.js`. Không tự nạp theo thư mục. | Thêm thẻ script cho `js/db/17-practice.js` và `js/db/18-class-overview.js` sau `js/db/16-live.js`, trước `js/76-main.js`. |
| Hàm chấm từng câu | Đã xác minh một phần: không có hàm chấm từng câu dùng chung. Logic chấm nằm trực tiếp trong `autograde_attempt` (3 bản qua các migration, mới nhất ở `20261121170000`) và `autograde_assignment_submission`; chỉ `answer_tokens(jsonb)` là hàm phụ. Đã đọc đầy đủ `autograde_assignment_submission`: một/nhiều lựa chọn và đúng/sai chỉ có điểm khi khớp toàn bộ; điền khuyết so khớp không phân biệt hoa thường, bỏ khoảng trắng hai đầu; ghép đôi cho điểm một phần theo số cặp đúng; câu bỏ trống 0 điểm. Chưa đọc thân `autograde_attempt` bản mới nhất. | Không sửa các hàm cũ. Viết hàm chấm mới (ví dụ `grade_question_answer`) trả điểm 0–1 theo cùng quy tắc, kèm kiểm thử so khớp với cả hai hàm cũ trên cùng dữ liệu. `practice_answers` thêm cột `score` (0–1); `is_correct` = `score` bằng 1. |
| Tên ràng buộc `source_type` | Chưa kiểm tra được trên cơ sở dữ liệu thật. Trong migration, ràng buộc tạo trực tiếp trong `create table` và không migration nào đổi tên hay bỏ nó. Tên mặc định thường là `learning_evidence_source_type_check` nhưng chưa xác nhận. | Migration M2 dùng khối `DO` tìm ràng buộc loại check trên `learning_evidence` có chứa `source_type` trong định nghĩa (qua `pg_constraint`) rồi bỏ, không phụ thuộc tên. |
| Điều kiện hiển thị tài nguyên dạng liên kết | Đã xác minh: chính sách `resource_read` cho tài nguyên `LINK` (`storage_path` trống) yêu cầu chưa xóa, `can_access_course`, và giáo viên, hoặc không gắn bài học, hoặc bài và chủ đề đã xuất bản. Tệp thì qua `can_read_resource` với cùng điều kiện. | Hai loại tài nguyên dùng chung một điều kiện hiển thị; RPC `student_objective_support` áp điều kiện này. |
| `questions.difficulty` | Đã xác minh: cột `text not null default 'MEDIUM'`, không có ràng buộc giá trị ở cấp bảng (khác `bloom_level` có check). Giao diện chỉ cho chọn `EASY/MEDIUM/HARD`, nhập Excel đổi giá trị lạ thành `MEDIUM`, AI kiểm tra ba giá trị; nhưng ghi trực tiếp qua API vẫn nhận giá trị bất kỳ. | Hàm chọn câu của luyện tập coi giá trị lạ là `MEDIUM`. Tuỳ chọn: thêm check `not valid` rồi validate sau khi dọn dữ liệu. |
| RLS đọc `mastery`, `knowledge_gaps`, `learning_evidence` | Đã xác minh: ba chính sách cùng mô thức. Học sinh đọc dòng của mình; giáo viên đọc khi học sinh thuộc `class_members` của lớp chứa mục tiêu và `can_manage_class` đúng. `can_manage_class` chỉ đúng với giáo viên chủ lớp (`classes.owner_teacher_id = auth.uid()`). | RPC của Việc 3 dùng cùng điều kiện (`can_manage_class` của lớp chứa khóa học) nên chạy được. Chưa hỗ trợ giáo viên phụ; nếu cần, phải sửa `can_manage_class`. |
| Trang tổng quan giáo viên đã có (phát hiện thêm) | Đã xác minh: trang chủ giáo viên (`DB_PAGES.home`, `js/db/10-home.js`, `dbHomeTeacher`) đã có biểu đồ xu hướng điểm và hoạt động gần đây. `js/67-teacher-dashboard.js` có vẻ là mã của chế độ mẫu (dùng biến toàn cục `page`, `render()`); chưa kiểm tra còn dùng ở chế độ dữ liệu thật hay không. | Cần chốt cho 3a: thêm trang "Tổng quan lớp" riêng hay mở rộng `dbHomeTeacher`. Nên đọc `dbHomeTeacher` trước để tránh trùng lặp. |

Còn mở: (1) thân `autograde_attempt` bản mới nhất chưa được đọc; (2) tên thật của ràng buộc `source_type` trên dự án Supabase; (3) `js/67-teacher-dashboard.js` có còn dùng ở chế độ dữ liệu thật hay không; (4) công thức tỷ lệ đúng của câu hỏi từ ba nguồn (bài tập, bài kiểm tra, luyện tập) còn phải thống nhất.
