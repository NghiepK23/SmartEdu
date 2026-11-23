# EducMind Firestore Security Specification (Phase 0 — Payload-First Security TDD)

## 1. Data Invariants
1. **Identity & Role Integrity (`profiles/{userId}`)**:
   - A profile document MUST use `id == request.auth.uid` and `userId == request.auth.uid`.
   - Creation requires `request.auth.token.email_verified == true` and `role in ['STUDENT', 'TEACHER']`.
   - `role`, `id`, `email`, and `createdAt` are strictly immutable after creation; `full_name` updates only affect `['full_name', 'updatedAt']`.
   - Blanket profile reads and `allow list` are forbidden (`email` PII isolation). Only the profile owner or an active roster peer linked via `teacher_students` / `student_teachers` may `get` a profile.
2. **Classroom Ownership & Membership (`classes/{classId}`, `class_members/{memberId}`, `class_invite_codes/{code}`)**:
   - Only a verified `TEACHER` profile can create a class, and `owner_teacher_id` MUST equal `request.auth.uid` and remain immutable.
   - Students can ONLY enroll in `class_members/{classId}_{studentId}` using a valid, non-revoked, non-expired `class_invite_codes/{code}` document (`exists(...)`), OR be added by the class owner teacher (`isClassTeacher(classId)`), and MUST atomically write `teacher_students` and `student_teachers` links (`existsAfter(...)`).
3. **Curriculum & Assessment Ownership (`courses`, `course_topics`, `lessons`, `learning_objectives`, `resources`, `questions`, `assignments`, `rubric_criteria`, `assessments`)**:
   - Every curriculum/assessment document carries `teacher_id` and `class_id`. Only the owning teacher (`isClassTeacher(classId)` and `teacher_id == request.auth.uid`) can create, update, or delete.
   - Every `allow list` rule evaluates `resource.data.teacher_id == request.auth.uid` (and `resource.data.student_id == request.auth.uid` for student-scoped submissions/attempts/results) with zero `get()` or `exists()` lookups.
   - Enrolled students read published curriculum and assessment metadata via `class_indexes/{classId}` and verified single-document `get` rules.
4. **Submissions, Timed Attempts & Terminal State Locking (`assessment_attempts`, `assignment_submissions`, `knowledge_gaps`, `recommendations`)**:
   - A student may create or update only their own `assignment_submissions` and `assessment_attempts` (`student_id == request.auth.uid`) while enrolled in the class (`isClassStudent(class_id)`).
   - Once an `assessment_attempts` document reaches terminal state `GRADED`, the student can no longer modify `status`, `total_score`, or `submitted_at` (only the owning teacher may regrade).
   - Once a `knowledge_gaps` document transitions to `RESOLVED` or `DISMISSED`, subsequent mutations to closed fields by unauthorized actors are rejected.
   - `recommendations` updates by students can ONLY modify `['status', 'responded_at', 'updatedAt']` with `status in ['ACCEPTED', 'DISMISSED']`.
5. **AI Chat, Notifications & Audit History (`ai_chat_threads`, `ai_chat_messages`, `notifications`, `ai_generation_*`, `content_revisions`)**:
   - AI chat threads and messages are strictly private to `user_id == request.auth.uid`.
   - AI generation requests/outputs/jobs and content revisions are strictly owned by `teacher_id == request.auth.uid`.
   - Temporal fields (`createdAt`, `updatedAt`) MUST match `request.time` on creation, `createdAt` is immutable on update, and `updatedAt == request.time` on every update.
   - Every string field enforces `.size() <= MAX` and every bounded array enforces `.size() <= MAX`.

## 2. The "Dirty Dozen" Adversarial Payloads
Each payload below violates Identity, Integrity, Schema, or State Invariants and MUST yield `PERMISSION_DENIED`:

1. **Privilege Escalation on Profile Update** (`/profiles/stu-1`):
   ```json
   { "role": "TEACHER", "updatedAt": "SERVER_TIMESTAMP" }
   ```
   - *Attack*: Student tries to elevate `role` from `STUDENT` to `TEACHER` via partial update.
2. **Shadow / Ghost Field Injection on Profile Create** (`/profiles/stu-1`):
   ```json
   {
     "id": "stu-1",
     "email": "stu@edu.vn",
     "full_name": "Student",
     "role": "STUDENT",
     "isAdmin": true,
     "createdAt": "SERVER_TIMESTAMP",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
   - *Attack*: Injects undeclared `isAdmin: true` ghost field on registration.
3. **Unverified Email Spoofing on Class Creation** (`/classes/cls-bad`):
   - Authenticated with `email_verified: false` attempting `setDoc` with `{ "id": "cls-bad", "owner_teacher_id": "t-1", ... }`.
   - *Attack*: Bypass email verification check.
4. **Identity Spoofing on Class Creation** (`/classes/cls-spoof`):
   ```json
   {
     "id": "cls-spoof",
     "name": "10A9",
     "owner_teacher_id": "teacher-victim",
     "created_at": "2026-11-23T00:00:00Z",
     "createdAt": "SERVER_TIMESTAMP",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
   - *Attack*: Signed-in user `attacker-1` tries to create a class claiming `owner_teacher_id` belongs to another teacher.
5. **Orphan / Forged Class Enrollment Without Valid Invite** (`/class_members/cls-1_attacker-1`):
   ```json
   {
     "id": "cls-1_attacker-1",
     "class_id": "cls-1",
     "student_id": "attacker-1",
     "teacher_id": "teacher-1",
     "joined_at": "2026-11-23T00:00:00Z",
     "createdAt": "SERVER_TIMESTAMP",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
   - *Attack*: Writes `class_members` directly without `class_invite_codes` proof and without atomic `teacher_students` / `student_teachers` batch writes.
6. **Student Self-Grading Submission** (`/assignment_submissions/asg-1_stu-1`):
   ```json
   {
     "status": "GRADED",
     "score": 10,
     "feedback": "Self graded 10",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
   - *Attack*: Student tries to set `score` and `status: "GRADED"` on their own assignment submission.
7. **Terminal State Violation on Graded Attempt** (`/assessment_attempts/att-graded`):
   ```json
   {
     "status": "IN_PROGRESS",
     "total_score": 10,
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
   - *Attack*: Student attempts to reopen a `GRADED` assessment attempt back to `IN_PROGRESS` or alter `total_score`.
8. **Cross-User Profile PII Read** (`GET /profiles/other-user`):
   - User `u1` with no shared class (`teacher_students`/`student_teachers` absent) reads `profiles/u2`.
   - *Attack*: Email PII enumeration across unrelated accounts.
9. **Path Variable ID Poisoning** (`/courses/bad$id/with/invalid%chars`):
   ```json
   { "id": "bad$id", "title": "Hack", "createdAt": "SERVER_TIMESTAMP", "updatedAt": "SERVER_TIMESTAMP" }
   ```
   - *Attack*: Invalid document ID outside `^[a-zA-Z0-9_\-]+$` or exceeding 128 bytes.
10. **Denial-of-Wallet Oversized String Payload** (`/questions/q-huge`):
    ```json
    {
      "id": "q-huge",
      "content": "<10000_CHAR_STRING>",
      "kind": "ESSAY",
      "difficulty": "EASY",
      "createdAt": "SERVER_TIMESTAMP",
      "updatedAt": "SERVER_TIMESTAMP"
    }
    ```
    - *Attack*: `content.size() > 5000` violates schema string size upper bound.
11. **Backdated Temporal Spoofing** (`/ai_chat_threads/th-spoof`):
    ```json
    {
      "id": "th-spoof",
      "user_id": "stu-1",
      "role": "STUDENT",
      "mode": "tutor",
      "title": "Spoofed time",
      "createdAt": "2020-01-01T00:00:00Z",
      "updatedAt": "2020-01-01T00:00:00Z"
    }
    ```
    - *Attack*: Supplies client-forged string timestamp instead of `request.time` (`serverTimestamp()`).
12. **Blanket List Query Scraping** (`LIST /profiles`, `LIST /questions` as non-owner):
    - Authenticated student runs unconstrained collection `list` on `profiles` or `questions` without matching `teacher_id == request.auth.uid`.
    - *Attack*: Scrapes all users' emails or course answer keys via unguarded `allow list`.
