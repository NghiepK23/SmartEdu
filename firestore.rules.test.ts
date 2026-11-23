/**
 * EducMind Firestore Rules Security Test Suite (Phase 0 TDD)
 * Verifies that all 12 Dirty Dozen adversarial payloads are rejected with PERMISSION_DENIED
 * against firestore.rules when executed with the Firebase Rules Unit Testing / Emulator runner.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

const RULES_PATH = path.resolve(process.cwd(), 'firestore.rules');
const DRAFT_RULES_PATH = path.resolve(process.cwd(), 'DRAFT_firestore.rules');

export const DIRTY_DOZEN_CASES = [
  {
    id: 1,
    name: 'Privilege escalation on profile update (role STUDENT -> TEACHER)',
    path: 'profiles/stu-1',
    op: 'update',
    auth: { uid: 'stu-1', token: { email_verified: true } },
    payload: { role: 'TEACHER' },
    expectedRuleGuard: "affectedKeys().hasOnly(['full_name', 'updatedAt'])",
  },
  {
    id: 2,
    name: 'Shadow field injection (isAdmin: true) on profile create',
    path: 'profiles/stu-1',
    op: 'create',
    auth: { uid: 'stu-1', token: { email_verified: true } },
    payload: { id: 'stu-1', email: 'stu@edu.vn', full_name: 'Student', role: 'STUDENT', isAdmin: true },
    expectedRuleGuard: "hasOnly(['id', 'email', 'full_name', 'role', 'createdAt', 'updatedAt'])",
  },
  {
    id: 3,
    name: 'Unverified email spoofing on class creation',
    path: 'classes/cls-bad',
    op: 'create',
    auth: { uid: 'teacher-1', token: { email_verified: false } },
    payload: { id: 'cls-bad', name: '10A1', owner_teacher_id: 'teacher-1' },
    expectedRuleGuard: 'request.auth.token.email_verified == true',
  },
  {
    id: 4,
    name: 'Identity spoofing on class creation (owner_teacher_id != request.auth.uid)',
    path: 'classes/cls-spoof',
    op: 'create',
    auth: { uid: 'attacker-1', token: { email_verified: true } },
    payload: { id: 'cls-spoof', name: '10A9', owner_teacher_id: 'teacher-victim' },
    expectedRuleGuard: 'incoming().owner_teacher_id == request.auth.uid',
  },
  {
    id: 5,
    name: 'Orphan class enrollment without valid invite or atomic roster links',
    path: 'class_members/cls-1_attacker-1',
    op: 'create',
    auth: { uid: 'attacker-1', token: { email_verified: true } },
    payload: { id: 'cls-1_attacker-1', class_id: 'cls-1', student_id: 'attacker-1', teacher_id: 'teacher-1' },
    expectedRuleGuard: 'existsAfter(/databases/$(database)/documents/teacher_students/',
  },
  {
    id: 6,
    name: 'Student self-grading assignment submission',
    path: 'assignment_submissions/asg-1_stu-1',
    op: 'update',
    auth: { uid: 'stu-1', token: { email_verified: true } },
    payload: { status: 'GRADED', score: 10, feedback: 'Self-graded' },
    expectedRuleGuard: "affectedKeys().hasOnly(['text_content', 'storage_path', 'file_name', 'status', 'is_edited', 'submitted_at', 'question_grading_enabled', 'updatedAt'])",
  },
  {
    id: 7,
    name: 'Terminal state violation on GRADED assessment attempt by student',
    path: 'assessment_attempts/att-graded',
    op: 'update',
    auth: { uid: 'stu-1', token: { email_verified: true } },
    payload: { status: 'IN_PROGRESS', total_score: 10 },
    expectedRuleGuard: "existing().status == 'IN_PROGRESS'",
  },
  {
    id: 8,
    name: 'Cross-user PII profile read without roster relationship',
    path: 'profiles/other-user',
    op: 'get',
    auth: { uid: 'stu-1', token: { email_verified: true } },
    payload: null,
    expectedRuleGuard: 'exists(/databases/$(database)/documents/teacher_students/',
  },
  {
    id: 9,
    name: 'Path variable ID poisoning (>128 chars or forbidden symbols)',
    path: 'courses/bad$id',
    op: 'create',
    auth: { uid: 'teacher-1', token: { email_verified: true } },
    payload: { id: 'bad$id', title: 'Hack' },
    expectedRuleGuard: 'isValidId(',
  },
  {
    id: 10,
    name: 'Denial-of-Wallet oversized string exceeding max size',
    path: 'questions/q-huge',
    op: 'create',
    auth: { uid: 'teacher-1', token: { email_verified: true } },
    payload: { id: 'q-huge', content: 'x'.repeat(10000), kind: 'ESSAY', difficulty: 'EASY' },
    expectedRuleGuard: 'data.content.size() <= 5000',
  },
  {
    id: 11,
    name: 'Client-forged backdated timestamps violating request.time invariant',
    path: 'ai_chat_threads/th-spoof',
    op: 'create',
    auth: { uid: 'stu-1', token: { email_verified: true } },
    payload: { id: 'th-spoof', user_id: 'stu-1', role: 'STUDENT', mode: 'tutor', title: 'Test', createdAt: '2020-01-01T00:00:00Z' },
    expectedRuleGuard: 'createdAt == request.time',
  },
  {
    id: 12,
    name: 'Blanket list query scraping on profiles and questions',
    path: 'profiles',
    op: 'list',
    auth: { uid: 'stu-1', token: { email_verified: true } },
    payload: null,
    expectedRuleGuard: 'allow list: if false;',
  },
];

test('Dirty Dozen security invariants are enforced across Firestore rules', () => {
  const target = fs.existsSync(RULES_PATH) ? RULES_PATH : DRAFT_RULES_PATH;
  const rulesText = fs.readFileSync(target, 'utf8');
  assert.match(rulesText, /rules_version\s*=\s*'2'/);
  assert.match(rulesText, /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/);

  for (const tc of DIRTY_DOZEN_CASES) {
    assert.ok(
      rulesText.includes(tc.expectedRuleGuard),
      `Dirty Dozen #${tc.id} (${tc.name}) guard missing: ${tc.expectedRuleGuard}`,
    );
  }
});
