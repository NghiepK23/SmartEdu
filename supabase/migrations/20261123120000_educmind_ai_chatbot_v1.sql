-- Multi-turn Gemini AI Chatbot schema, RLS policies, course toggle, and draft-question bridge

alter table public.courses
  add column if not exists student_ai_enabled boolean not null default true;

create table if not exists public.ai_chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  role public.app_role not null,
  mode text not null default 'tutor' check (mode in ('tutor', 'lesson_plan', 'gap_analysis', 'quiz')),
  title text not null default 'Cuộc trò chuyện mới' check (length(btrim(title)) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_chat_threads_user_updated_idx
  on public.ai_chat_threads (user_id, updated_at desc);

create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.ai_chat_threads(id) on delete cascade,
  sender text not null check (sender in ('user', 'model')),
  model text,
  content text not null check (length(content) <= 40000),
  artifacts jsonb not null default '{}'::jsonb,
  context_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_chat_messages_thread_created_idx
  on public.ai_chat_messages (thread_id, created_at asc);

alter table public.ai_chat_threads enable row level security;
alter table public.ai_chat_messages enable row level security;

drop policy if exists ai_chat_threads_owner_all on public.ai_chat_threads;
create policy ai_chat_threads_owner_all
  on public.ai_chat_threads
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists ai_chat_messages_owner_select on public.ai_chat_messages;
create policy ai_chat_messages_owner_select
  on public.ai_chat_messages
  for select
  to authenticated
  using (exists (
    select 1 from public.ai_chat_threads t
    where t.id = public.ai_chat_messages.thread_id
      and t.user_id = auth.uid()
  ));

drop policy if exists ai_chat_messages_owner_insert on public.ai_chat_messages;
create policy ai_chat_messages_owner_insert
  on public.ai_chat_messages
  for insert
  to authenticated
  with check (exists (
    select 1 from public.ai_chat_threads t
    where t.id = public.ai_chat_messages.thread_id
      and t.user_id = auth.uid()
  ));

drop policy if exists ai_chat_messages_owner_delete on public.ai_chat_messages;
create policy ai_chat_messages_owner_delete
  on public.ai_chat_messages
  for delete
  to authenticated
  using (exists (
    select 1 from public.ai_chat_threads t
    where t.id = public.ai_chat_messages.thread_id
      and t.user_id = auth.uid()
  ));

grant select, insert, update, delete on public.ai_chat_threads to authenticated;
grant select, insert, delete on public.ai_chat_messages to authenticated;
grant all on public.ai_chat_threads, public.ai_chat_messages to service_role;

-- Bridge chat-generated draft questions into the existing AI Question Drafts queue for teacher review
create or replace function public.save_chat_questions_to_ai_drafts(p_lesson uuid, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_course_id uuid;
  v_request_id uuid;
  v_count integer;
  v_item jsonb;
  v_obj_id uuid;
  v_kind public.question_kind;
  v_diff public.difficulty_level;
  v_bloom public.bloom_level;
  v_content text;
  v_options jsonb;
  v_correct jsonb;
begin
  if auth.uid() is null or public.current_app_role() <> 'TEACHER' then
    raise exception 'Chỉ giáo viên mới lưu được câu hỏi nháp từ trợ lý AI';
  end if;

  select l.course_id into v_course_id
  from public.lessons l
  where l.id = p_lesson and l.deleted_at is null;

  if v_course_id is null or not public.can_manage_course(v_course_id) then
    raise exception 'Bạn không quản lý bài học này';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Danh sách câu hỏi không hợp lệ';
  end if;

  v_count := jsonb_array_length(p_items);
  if v_count < 1 or v_count > 20 then
    raise exception 'Số lượng câu hỏi lưu nháp phải từ 1 đến 20';
  end if;

  insert into public.ai_generation_requests (teacher_id, lesson_id, quantity, parameters, status, completed_at)
  values (
    auth.uid(),
    p_lesson,
    v_count,
    jsonb_build_object('source', 'ai_chat', 'kind', 'AUTO', 'difficulty', 'AUTO', 'bloom', 'AUTO'),
    'COMPLETED',
    now()
  )
  returning id into v_request_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_content := nullif(btrim(coalesce(v_item ->> 'content', '')), '');
    if v_content is null then
      raise exception 'Nội dung câu hỏi không được để trống';
    end if;

    v_obj_id := null;
    if coalesce(v_item ->> 'objective_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select lo.id into v_obj_id
      from public.learning_objectives lo
      where lo.id = (v_item ->> 'objective_id')::uuid
        and lo.lesson_id = p_lesson;
    end if;

    if v_obj_id is null then
      select lo.id into v_obj_id
      from public.learning_objectives lo
      where lo.lesson_id = p_lesson
      order by lo.code
      limit 1;
    end if;

    if v_obj_id is null then
      raise exception 'Bài học chưa có mục tiêu học tập; hãy thêm ít nhất 1 mục tiêu trước khi lưu câu hỏi nháp';
    end if;

    v_kind := case coalesce(v_item ->> 'kind', 'SINGLE_CHOICE')
      when 'MULTIPLE_CHOICE' then 'MULTIPLE_CHOICE'::public.question_kind
      when 'TRUE_FALSE' then 'TRUE_FALSE'::public.question_kind
      when 'SHORT_ANSWER' then 'SHORT_ANSWER'::public.question_kind
      when 'ESSAY' then 'ESSAY'::public.question_kind
      else 'SINGLE_CHOICE'::public.question_kind
    end;

    v_diff := case coalesce(v_item ->> 'difficulty', 'MEDIUM')
      when 'EASY' then 'EASY'::public.difficulty_level
      when 'HARD' then 'HARD'::public.difficulty_level
      else 'MEDIUM'::public.difficulty_level
    end;

    v_bloom := case coalesce(v_item ->> 'bloom_level', 'UNDERSTAND')
      when 'REMEMBER' then 'REMEMBER'::public.bloom_level
      when 'APPLY' then 'APPLY'::public.bloom_level
      when 'ANALYZE' then 'ANALYZE'::public.bloom_level
      when 'EVALUATE' then 'EVALUATE'::public.bloom_level
      when 'CREATE' then 'CREATE'::public.bloom_level
      else 'UNDERSTAND'::public.bloom_level
    end;

    v_options := case
      when jsonb_typeof(v_item -> 'options') = 'array' then v_item -> 'options'
      else '[]'::jsonb
    end;
    v_correct := coalesce(v_item -> 'correct_answer', '0'::jsonb);

    insert into public.ai_generation_outputs (
      request_id, objective_id, kind, content, options, correct_answer, difficulty, bloom_level
    )
    values (
      v_request_id, v_obj_id, v_kind, left(v_content, 4000), v_options, v_correct, v_diff, v_bloom
    );
  end loop;

  return v_request_id;
end;
$$;

revoke all on function public.save_chat_questions_to_ai_drafts(uuid, jsonb) from public, anon;
grant execute on function public.save_chat_questions_to_ai_drafts(uuid, jsonb) to authenticated;
