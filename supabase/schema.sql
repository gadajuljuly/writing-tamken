-- =====================================================================
-- مسابقة الكتابة · תחרות הכתיבה — Supabase schema
-- Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to run more than once. Every object is prefixed with wt_ so it
-- can live inside an existing Supabase project without touching
-- other apps' tables.
--
-- !!! Change the committee signup code on the line marked CHANGE-ME !!!
-- =====================================================================

-- ---------- settings (not readable by clients) ----------
create table if not exists public.wt_settings (key text primary key, value text not null);
alter table public.wt_settings enable row level security;
revoke all on public.wt_settings from anon, authenticated;
insert into public.wt_settings (key, value) values ('signup_code', 'CHANGE-ME')   -- CHANGE-ME
on conflict (key) do nothing;

-- ---------- committee member profiles ----------
create table if not exists public.wt_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create or replace function public.wt_is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.wt_profiles where id = auth.uid());
$$;

-- Called right after sign-up: joins the committee only with the right code.
create or replace function public.wt_join(p_code text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if coalesce(trim(p_code), '') = '' or trim(p_code) <> (select value from wt_settings where key = 'signup_code') then
    raise exception 'bad_code';
  end if;
  insert into wt_profiles (id, name) values (auth.uid(), coalesce(nullif(trim(p_name), ''), 'member'))
  on conflict (id) do update set name = excluded.name;
end $$;

-- ---------- text helpers for duplicate detection ----------
create or replace function public.wt_title_key(s text) returns text
language plpgsql immutable as $$
declare k text := normalize(coalesce(s, ''), NFKC);
begin
  k := regexp_replace(k, '[ً-ٰٟـ]', '', 'g');   -- Arabic diacritics, tatweel
  k := regexp_replace(k, '[֑-ׇ]', '', 'g');               -- Hebrew niqqud
  k := translate(k, 'أإآٱىةؤئ', 'اااايهوي');
  k := lower(k);
  k := regexp_replace(k, '[[:space:][:punct:]،؛؟«»“”‘’"''`´—–_\-]+', ' ', 'g');
  return trim(regexp_replace(k, '\s+', ' ', 'g'));
end $$;

create or replace function public.wt_tokens(k text) returns text[]
language sql immutable as $$
  select coalesce(array_agg(distinct w), '{}') from (
    select case when char_length(t) >= 5 and t ~ '^(ال|וה)' then substr(t, 3)
                when char_length(t) >= 4 and t ~ '^(ה|ו)' then substr(t, 2)
                else t end as w
    from unnest(string_to_array(k, ' ')) as t
  ) x
  where w <> '' and w not in ('ال','و','في','من','على','الى','عن','مع','של','את','עם','על','ו','ה','ל','ב');
$$;

create or replace function public.wt_is_dup(a text, b text) returns boolean
language plpgsql immutable as $$
declare ka text := wt_title_key(a); kb text := wt_title_key(b); ta text[]; tb text[]; inter int; uni int;
begin
  if ka = '' or kb = '' then return false; end if;
  if ka = kb then return true; end if;
  ta := wt_tokens(ka); tb := wt_tokens(kb);
  if cardinality(ta) < 2 or cardinality(tb) < 2 then return false; end if;
  select count(*) into inter from unnest(ta) x where x = any(tb);
  uni := cardinality(ta) + cardinality(tb) - inter;
  return inter::numeric / uni >= 0.8;
end $$;

-- ---------- core tables ----------
create table if not exists public.wt_members (
  id serial primary key,
  competition text not null check (competition in ('ar','he')),
  name text not null,
  created_at timestamptz not null default now(),
  unique (competition, name)
);

create table if not exists public.wt_minutes (
  id serial primary key,
  competition text not null check (competition in ('ar','he')),
  title text not null default '',
  meeting_date text not null default '',
  source_type text not null check (source_type in ('file','whatsapp','direct')),
  source_file_path text,
  source_file_name text,
  raw_text text not null default '',
  draft jsonb,
  status text not null default 'draft',
  has_pending_changes boolean not null default true,
  current_version integer not null default 0,
  archived boolean not null default false,
  ai_organized boolean not null default false,
  search_text text not null default '',
  uploaded_by uuid not null default auth.uid() references public.wt_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wt_minute_versions (
  id serial primary key,
  minute_id integer not null references public.wt_minutes (id) on delete cascade,
  version integer not null,
  content jsonb not null,
  approved_by uuid references public.wt_profiles (id),
  created_at timestamptz not null default now(),
  unique (minute_id, version)
);

create table if not exists public.wt_tasks (
  id serial primary key,
  competition text not null check (competition in ('ar','he')),
  axis integer not null default 6 check (axis between 1 and 6),
  title text not null check (trim(title) <> ''),
  title_key text not null default '',
  description text not null default '',
  assignees jsonb not null default '[]',
  status text not null default 'not_started' check (status in ('not_started','in_progress','done')),
  notes text not null default '',
  proposal_approved boolean not null default false,
  decision_minute_id integer references public.wt_minutes (id) on delete set null,
  source_minute_id integer references public.wt_minutes (id) on delete set null,
  created_by uuid default auth.uid() references public.wt_profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (competition, title_key)
);

create table if not exists public.wt_task_items (
  id serial primary key,
  task_id integer not null references public.wt_tasks (id) on delete cascade,
  kind text not null check (kind in ('file','image','link','suggestion')),
  label text not null default '',
  url text not null default '',
  body text not null default '',
  file_path text,
  mime text,
  created_by uuid default auth.uid() references public.wt_profiles (id),
  created_at timestamptz not null default now(),
  check (kind <> 'link' or url ~* '^https?://')
);

create table if not exists public.wt_suggestions (
  id serial primary key,
  minute_id integer not null references public.wt_minutes (id) on delete cascade,
  title text not null,
  description text not null default '',
  axis integer not null default 6 check (axis between 1 and 6),
  assignees jsonb not null default '[]',
  state text not null default 'pending' check (state in ('pending','duplicate','added','rejected')),
  duplicate_of integer references public.wt_tasks (id) on delete set null,
  created_task_id integer references public.wt_tasks (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.wt_audit (
  id bigserial primary key,
  competition text not null,
  user_id uuid default auth.uid() references public.wt_profiles (id) on delete set null,
  entity text not null,
  entity_id integer,
  action text not null,
  summary text not null default '',
  changes jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists wt_tasks_comp_idx on public.wt_tasks (competition);

-- deleted tasks go to a recycle bin (deleted_at) and can be restored
alter table public.wt_tasks add column if not exists deleted_at timestamptz;
alter table public.wt_tasks drop constraint if exists wt_tasks_competition_title_key_key;
create unique index if not exists wt_tasks_live_title on public.wt_tasks (competition, title_key) where deleted_at is null;
create index if not exists wt_minutes_comp_idx on public.wt_minutes (competition, archived);
create index if not exists wt_audit_comp_idx on public.wt_audit (competition, created_at desc);

insert into public.wt_members (competition, name) values
  ('ar','غادة جلجولي'),('ar','راوية كتان بولوس'),('ar','تمارا مصطفى'),('ar','أروى علي'),
  ('ar','رشا سخنيني'),('ar','رنا مروات'),('ar','محمود جبارين'),('ar','مزنة طيبي')
on conflict do nothing;

-- ---------- audit helper ----------
create or replace function public.wt_log(p_comp text, p_entity text, p_id integer, p_action text, p_summary text, p_changes jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into wt_audit (competition, user_id, entity, entity_id, action, summary, changes)
  values (p_comp, auth.uid(), p_entity, p_id, p_action, coalesce(p_summary, ''), coalesce(p_changes, '{}'));
$$;
revoke all on function public.wt_log(text, text, integer, text, text, jsonb) from public, anon, authenticated;

-- ---------- tasks: duplicate guard, completion date, audit ----------
create or replace function public.wt_tasks_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare dup record;
begin
  new.title := trim(new.title);
  new.title_key := wt_title_key(new.title);
  if new.deleted_at is null and (tg_op = 'INSERT' or new.title is distinct from old.title or old.deleted_at is not null) then
    select id, title into dup from wt_tasks
     where competition = new.competition and id <> new.id and deleted_at is null and wt_is_dup(title, new.title) limit 1;
    if found then
      raise exception using errcode = '23505', message = 'duplicate', detail = dup.title, hint = dup.id::text;
    end if;
  end if;
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status <> 'done' then new.completed_at := now(); end if;
  else
    new.completed_at := null;
  end if;
  if tg_op = 'UPDATE' then
    new.competition := old.competition;    -- a task never moves between competitions
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.source_minute_id := old.source_minute_id;
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists wt_tasks_before on public.wt_tasks;
create trigger wt_tasks_before before insert or update on public.wt_tasks
for each row execute function public.wt_tasks_before();

create or replace function public.wt_tasks_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare ch jsonb := '{}'; f text; o jsonb; n jsonb;
begin
  if tg_op = 'INSERT' then
    perform wt_log(new.competition, 'task', new.id,
      case when new.source_minute_id is null then 'created' else 'created_from_minute' end, new.title);
  elsif tg_op = 'DELETE' then
    perform wt_log(old.competition, 'task', old.id, 'purged', old.title);
  else
    if old.deleted_at is null and new.deleted_at is not null then
      perform wt_log(new.competition, 'task', new.id, 'deleted', new.title); return null;
    elsif old.deleted_at is not null and new.deleted_at is null then
      perform wt_log(new.competition, 'task', new.id, 'restored', new.title); return null;
    end if;
    o := to_jsonb(old); n := to_jsonb(new);
    foreach f in array array['title','description','axis','assignees','status','notes','proposal_approved','decision_minute_id'] loop
      if o -> f is distinct from n -> f then ch := ch || jsonb_build_object(f, jsonb_build_object('from', o -> f, 'to', n -> f)); end if;
    end loop;
    if ch <> '{}' then
      perform wt_log(new.competition, 'task', new.id,
        case when (select count(*) from jsonb_object_keys(ch)) = 1 and ch ? 'status' then 'status' else 'updated' end, new.title, ch);
    end if;
  end if;
  return null;
end $$;
drop trigger if exists wt_tasks_after on public.wt_tasks;
create trigger wt_tasks_after after insert or update or delete on public.wt_tasks
for each row execute function public.wt_tasks_after();

create or replace function public.wt_items_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record; it record;
begin
  if tg_op = 'INSERT' then it := new; else it := old; end if;
  select competition, title into r from wt_tasks where id = it.task_id;
  if found then
    perform wt_log(r.competition, 'task', it.task_id, case when tg_op = 'INSERT' then 'item_added' else 'item_removed' end, r.title,
      jsonb_build_object('kind', it.kind, 'label', coalesce(nullif(it.label, ''), nullif(it.url, ''), it.body)));
  end if;
  return null;
end $$;
drop trigger if exists wt_items_after on public.wt_task_items;
create trigger wt_items_after after insert or delete on public.wt_task_items
for each row execute function public.wt_items_after();

create or replace function public.wt_members_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform wt_log(new.competition, 'member', new.id, 'member_added', new.name);
  return null;
end $$;
drop trigger if exists wt_members_after on public.wt_members;
create trigger wt_members_after after insert on public.wt_members
for each row execute function public.wt_members_after();

-- ---------- minutes ----------
create or replace function public.wt_minutes_before() returns trigger
language plpgsql as $$
begin
  new.search_text := lower(concat_ws(' ', new.title, new.meeting_date, new.raw_text, new.draft::text));
  if tg_op = 'INSERT' then
    new.status := 'draft'; new.current_version := 0; new.has_pending_changes := true; new.archived := false;
    new.uploaded_by := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists wt_minutes_before on public.wt_minutes;
create trigger wt_minutes_before before insert or update on public.wt_minutes
for each row execute function public.wt_minutes_before();

create or replace function public.wt_minutes_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform wt_log(new.competition, 'minute', new.id, 'minute_created', coalesce(nullif(new.title, ''), new.meeting_date));
  return null;
end $$;
drop trigger if exists wt_minutes_after_insert on public.wt_minutes;
create trigger wt_minutes_after_insert after insert on public.wt_minutes
for each row execute function public.wt_minutes_after_insert();

create or replace function public.wt_get_minute(p_id integer) returns public.wt_minutes
language plpgsql security definer set search_path = public as $$
declare m wt_minutes;
begin
  if not wt_is_member() then raise exception 'unauthorized'; end if;
  select * into m from wt_minutes where id = p_id;
  if not found then raise exception 'not_found'; end if;
  return m;
end $$;
revoke all on function public.wt_get_minute(integer) from public, anon, authenticated;

create or replace function public.wt_label(m public.wt_minutes) returns text language sql immutable as $$
  select coalesce(nullif(m.title, ''), m.meeting_date);
$$;

-- recompute duplicate flags of open suggestions (vs. tasks and vs. each other)
create or replace function public.wt_refresh_suggestions(p_minute integer) returns void
language plpgsql security definer set search_path = public as $$
declare s record; m wt_minutes; dup integer; seen text[] := '{}'; t text; sib boolean;
begin
  select * into m from wt_minutes where id = p_minute;
  for s in select * from wt_suggestions where minute_id = p_minute and state in ('pending','duplicate') order by id loop
    select id into dup from wt_tasks where competition = m.competition and deleted_at is null and wt_is_dup(title, s.title) limit 1;
    sib := false;
    foreach t in array seen loop if wt_is_dup(t, s.title) then sib := true; end if; end loop;
    if dup is not null or sib then
      update wt_suggestions set state = 'duplicate', duplicate_of = dup where id = s.id;
    else
      update wt_suggestions set state = 'pending', duplicate_of = null where id = s.id;
      seen := seen || s.title;
    end if;
  end loop;
end $$;
revoke all on function public.wt_refresh_suggestions(integer) from public, anon, authenticated;

-- any member may edit the draft; it stays pending until the uploader approves it
create or replace function public.wt_minute_save_draft(p_id integer, p_draft jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare m wt_minutes := wt_get_minute(p_id);
begin
  update wt_minutes set draft = p_draft, has_pending_changes = true, updated_at = now() where id = p_id;
  perform wt_log(m.competition, 'minute', p_id, 'minute_edited', wt_label(m));
end $$;

create or replace function public.wt_minute_set_archived(p_id integer, p_archived boolean) returns void
language plpgsql security definer set search_path = public as $$
declare m wt_minutes := wt_get_minute(p_id);
begin
  update wt_minutes set archived = p_archived, updated_at = now() where id = p_id;
  perform wt_log(m.competition, 'minute', p_id, case when p_archived then 'minute_archived' else 'minute_unarchived' end, wt_label(m));
end $$;

-- only the uploader approves; every approval is a new version
create or replace function public.wt_minute_approve(p_id integer, p_draft jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare m wt_minutes := wt_get_minute(p_id); v integer;
begin
  if m.uploaded_by <> auth.uid() then raise exception 'only_uploader'; end if;
  v := m.current_version + 1;
  insert into wt_minute_versions (minute_id, version, content, approved_by) values (p_id, v, p_draft, auth.uid());
  update wt_minutes set draft = p_draft, status = 'approved', has_pending_changes = false, current_version = v,
    title = coalesce(nullif(p_draft ->> 'title', ''), title), meeting_date = coalesce(nullif(p_draft ->> 'date', ''), meeting_date),
    updated_at = now() where id = p_id;
  perform wt_log(m.competition, 'minute', p_id, 'minute_approved', coalesce(nullif(p_draft ->> 'title', ''), wt_label(m)), jsonb_build_object('version', v));
  return v;
end $$;

create or replace function public.wt_minute_restore(p_id integer, p_version integer) returns void
language plpgsql security definer set search_path = public as $$
declare m wt_minutes := wt_get_minute(p_id); c jsonb;
begin
  select content into c from wt_minute_versions where minute_id = p_id and version = p_version;
  if not found then raise exception 'not_found'; end if;
  update wt_minutes set draft = c, has_pending_changes = true, updated_at = now() where id = p_id;
  perform wt_log(m.competition, 'minute', p_id, 'minute_restored', wt_label(m), jsonb_build_object('version', p_version));
end $$;

-- written by the AI edge function (with the user's own login); nothing is approved here
create or replace function public.wt_minute_set_ai_result(p_id integer, p_draft jsonb, p_tasks jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare m wt_minutes := wt_get_minute(p_id); t jsonb;
begin
  update wt_minutes set draft = p_draft, ai_organized = true, has_pending_changes = true, updated_at = now() where id = p_id;
  delete from wt_suggestions where minute_id = p_id and state in ('pending','duplicate');
  for t in select * from jsonb_array_elements(coalesce(p_tasks, '[]')) loop
    if coalesce(trim(t ->> 'title'), '') <> '' then
      insert into wt_suggestions (minute_id, title, description, axis, assignees)
      values (p_id, trim(t ->> 'title'), coalesce(t ->> 'description', ''),
        case when (t ->> 'axis') ~ '^[1-6]$' then (t ->> 'axis')::int else 6 end, coalesce(t -> 'assignees', '[]'));
    end if;
  end loop;
  perform wt_refresh_suggestions(p_id);
  perform wt_log(m.competition, 'minute', p_id, 'minute_organized', wt_label(m), jsonb_build_object('suggestions', jsonb_array_length(coalesce(p_tasks, '[]'))));
end $$;

create or replace function public.wt_suggestion_add(p_minute integer, p_title text, p_description text, p_axis integer, p_assignees jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare m wt_minutes := wt_get_minute(p_minute);
begin
  if coalesce(trim(p_title), '') = '' then raise exception 'title_required'; end if;
  insert into wt_suggestions (minute_id, title, description, axis, assignees)
  values (p_minute, trim(p_title), coalesce(p_description, ''), least(6, greatest(1, coalesce(p_axis, 6))), coalesce(p_assignees, '[]'));
  perform wt_refresh_suggestions(p_minute);
end $$;

create or replace function public.wt_suggestion_update(p_id integer, p_title text, p_description text, p_axis integer, p_assignees jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare s wt_suggestions;
begin
  select * into s from wt_suggestions where id = p_id;
  if not found then raise exception 'not_found'; end if;
  perform wt_get_minute(s.minute_id);
  if s.state = 'added' then raise exception 'already_added'; end if;
  update wt_suggestions set title = coalesce(nullif(trim(p_title), ''), title), description = coalesce(p_description, description),
    axis = least(6, greatest(1, coalesce(p_axis, axis))), assignees = coalesce(p_assignees, assignees) where id = p_id;
  perform wt_refresh_suggestions(s.minute_id);
end $$;

create or replace function public.wt_suggestion_set_state(p_id integer, p_state text) returns void
language plpgsql security definer set search_path = public as $$
declare s wt_suggestions; m wt_minutes;
begin
  select * into s from wt_suggestions where id = p_id;
  if not found then raise exception 'not_found'; end if;
  m := wt_get_minute(s.minute_id);
  if m.uploaded_by <> auth.uid() then raise exception 'only_uploader'; end if;
  if p_state not in ('pending','rejected') or s.state = 'added' then raise exception 'bad_state'; end if;
  update wt_suggestions set state = p_state where id = p_id;
  perform wt_refresh_suggestions(s.minute_id);
end $$;

-- the uploader approves selected proposals → checklist tasks linked to the minute; duplicates never added
create or replace function public.wt_minute_apply(p_minute integer, p_ids integer[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m wt_minutes := wt_get_minute(p_minute); s record; new_id integer; added int := 0; skipped int := 0;
begin
  if m.uploaded_by <> auth.uid() then raise exception 'only_uploader'; end if;
  perform wt_refresh_suggestions(p_minute);
  for s in select * from wt_suggestions where minute_id = p_minute and id = any(p_ids) order by id loop
    if s.state <> 'pending' then skipped := skipped + 1; continue; end if;
    begin
      insert into wt_tasks (competition, axis, title, description, assignees, source_minute_id)
      values (m.competition, s.axis, s.title, s.description, s.assignees, p_minute) returning id into new_id;
      update wt_suggestions set state = 'added', created_task_id = new_id where id = s.id;
      added := added + 1;
    exception when unique_violation then
      update wt_suggestions set state = 'duplicate' where id = s.id;
      skipped := skipped + 1;
    end;
  end loop;
  if added > 0 then perform wt_log(m.competition, 'minute', p_minute, 'tasks_from_minute', wt_label(m), jsonb_build_object('count', added)); end if;
  perform wt_refresh_suggestions(p_minute);
  return jsonb_build_object('added', added, 'skipped', skipped);
end $$;

-- "proposal approved" is documented in the chosen minutes (as a pending change the uploader approves)
create or replace function public.wt_document_decision(p_task integer, p_minute integer, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare m wt_minutes := wt_get_minute(p_minute); t wt_tasks; d jsonb; line text;
begin
  select * into t from wt_tasks where id = p_task;
  if not found or t.competition <> m.competition then raise exception 'bad_minute'; end if;
  d := coalesce(m.draft, (select content from wt_minute_versions where minute_id = m.id order by version desc limit 1),
       jsonb_build_object('title', m.title, 'date', m.meeting_date, 'participants', '[]'::jsonb, 'topics', '[]'::jsonb,
         'discussions', '[]'::jsonb, 'decisions', '[]'::jsonb, 'tasks', '[]'::jsonb, 'notes', '[]'::jsonb));
  line := case when m.competition = 'ar' then 'تم اعتماد الاقتراح' else 'ההצעה אושרה' end || ': ' || t.title
          || case when coalesce(trim(p_text), '') <> '' then ' — ' || trim(p_text) else '' end;
  d := jsonb_set(d, '{decisions}', coalesce(d -> 'decisions', '[]'::jsonb) || to_jsonb(line));
  update wt_minutes set draft = d, has_pending_changes = true, updated_at = now() where id = m.id;
  perform wt_log(m.competition, 'minute', m.id, 'decision_documented', wt_label(m), jsonb_build_object('task', t.title, 'text', p_text));
end $$;

-- ---------- row level security ----------
alter table public.wt_profiles enable row level security;
alter table public.wt_members enable row level security;
alter table public.wt_minutes enable row level security;
alter table public.wt_minute_versions enable row level security;
alter table public.wt_tasks enable row level security;
alter table public.wt_task_items enable row level security;
alter table public.wt_suggestions enable row level security;
alter table public.wt_audit enable row level security;

revoke all on public.wt_profiles, public.wt_members, public.wt_minutes, public.wt_minute_versions,
  public.wt_tasks, public.wt_task_items, public.wt_suggestions, public.wt_audit from anon, authenticated;
grant select on public.wt_profiles, public.wt_members, public.wt_minutes, public.wt_minute_versions,
  public.wt_tasks, public.wt_task_items, public.wt_suggestions, public.wt_audit to authenticated;
grant insert on public.wt_members, public.wt_minutes, public.wt_tasks, public.wt_task_items to authenticated;
grant update (title, description, axis, assignees, status, notes, proposal_approved, decision_minute_id, deleted_at) on public.wt_tasks to authenticated;
grant delete on public.wt_tasks, public.wt_task_items to authenticated;
grant usage, select on sequence public.wt_members_id_seq, public.wt_minutes_id_seq, public.wt_tasks_id_seq,
  public.wt_task_items_id_seq to authenticated;

drop policy if exists wt_read on public.wt_profiles;          create policy wt_read on public.wt_profiles for select to authenticated using (wt_is_member());
drop policy if exists wt_read on public.wt_members;           create policy wt_read on public.wt_members for select to authenticated using (wt_is_member());
drop policy if exists wt_read on public.wt_minutes;           create policy wt_read on public.wt_minutes for select to authenticated using (wt_is_member());
drop policy if exists wt_read on public.wt_minute_versions;   create policy wt_read on public.wt_minute_versions for select to authenticated using (wt_is_member());
drop policy if exists wt_read on public.wt_tasks;             create policy wt_read on public.wt_tasks for select to authenticated using (wt_is_member());
drop policy if exists wt_read on public.wt_task_items;        create policy wt_read on public.wt_task_items for select to authenticated using (wt_is_member());
drop policy if exists wt_read on public.wt_suggestions;       create policy wt_read on public.wt_suggestions for select to authenticated using (wt_is_member());
drop policy if exists wt_read on public.wt_audit;             create policy wt_read on public.wt_audit for select to authenticated using (wt_is_member());

-- the Arabic competition uses the fixed committee list; the Hebrew one lets members add names
drop policy if exists wt_insert on public.wt_members;   create policy wt_insert on public.wt_members for insert to authenticated with check (wt_is_member() and competition = 'he');
drop policy if exists wt_insert on public.wt_minutes;   create policy wt_insert on public.wt_minutes for insert to authenticated with check (wt_is_member());
drop policy if exists wt_insert on public.wt_tasks;     create policy wt_insert on public.wt_tasks for insert to authenticated with check (wt_is_member() and source_minute_id is null);
drop policy if exists wt_update on public.wt_tasks;     create policy wt_update on public.wt_tasks for update to authenticated using (wt_is_member()) with check (wt_is_member());
drop policy if exists wt_delete on public.wt_tasks;     create policy wt_delete on public.wt_tasks for delete to authenticated using (wt_is_member());
drop policy if exists wt_insert on public.wt_task_items; create policy wt_insert on public.wt_task_items for insert to authenticated with check (wt_is_member());
drop policy if exists wt_delete on public.wt_task_items; create policy wt_delete on public.wt_task_items for delete to authenticated using (wt_is_member());

do $$
declare f text;
begin
  foreach f in array array['wt_join(text,text)','wt_minute_save_draft(integer,jsonb)','wt_minute_set_archived(integer,boolean)',
    'wt_minute_approve(integer,jsonb)','wt_minute_restore(integer,integer)','wt_minute_set_ai_result(integer,jsonb,jsonb)',
    'wt_suggestion_add(integer,text,text,integer,jsonb)','wt_suggestion_update(integer,text,text,integer,jsonb)',
    'wt_suggestion_set_state(integer,text)','wt_minute_apply(integer,integer[])','wt_document_decision(integer,integer,text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------- private file storage (Supabase Storage) ----------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('wt-files', 'wt-files', false, 10485760) on conflict (id) do nothing;
    execute 'drop policy if exists wt_files_read on storage.objects';
    execute 'create policy wt_files_read on storage.objects for select to authenticated using (bucket_id = ''wt-files'' and public.wt_is_member())';
    execute 'drop policy if exists wt_files_insert on storage.objects';
    execute 'create policy wt_files_insert on storage.objects for insert to authenticated with check (bucket_id = ''wt-files'' and public.wt_is_member())';
    execute 'drop policy if exists wt_files_delete on storage.objects';
    execute 'create policy wt_files_delete on storage.objects for delete to authenticated using (bucket_id = ''wt-files'' and public.wt_is_member())';
  end if;
end $$;

-- ---------- realtime: members see each other's changes immediately ----------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['wt_tasks','wt_task_items','wt_minutes','wt_suggestions','wt_members','wt_audit'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- =====================================================================
-- Controlled access: the admin invites people by phone number.
-- Only someone with a personal invite link can join. Login = phone + password.
-- =====================================================================
alter table public.wt_profiles add column if not exists phone text;
alter table public.wt_profiles add column if not exists role text not null default 'member';
alter table public.wt_profiles add column if not exists active boolean not null default true;

-- the first member (the committee owner) becomes admin if there is no admin yet
update public.wt_profiles set role = 'admin'
where id = (select id from public.wt_profiles order by created_at limit 1)
  and not exists (select 1 from public.wt_profiles where role = 'admin');

create or replace function public.wt_is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.wt_profiles where id = auth.uid() and active);
$$;

create or replace function public.wt_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.wt_profiles where id = auth.uid() and active and role = 'admin');
$$;

-- digits only; Israeli local numbers (05x…) become 9725x…
create or replace function public.wt_phone(p text) returns text language sql immutable as $$
  select case when d ~ '^0\d{8,9}$' then '972' || substr(d, 2) else d end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;

create table if not exists public.wt_invites (
  id serial primary key,
  phone text not null,
  name text not null default '',
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_by uuid default auth.uid() references public.wt_profiles (id),
  created_at timestamptz not null default now(),
  used_by uuid references public.wt_profiles (id),
  used_at timestamptz,
  revoked boolean not null default false
);
create unique index if not exists wt_invites_open_phone on public.wt_invites (phone) where used_at is null and not revoked;
alter table public.wt_invites enable row level security;
revoke all on public.wt_invites from anon, authenticated;
grant select on public.wt_invites to authenticated;
drop policy if exists wt_admin_read on public.wt_invites;
create policy wt_admin_read on public.wt_invites for select to authenticated using (wt_is_admin());

-- the old shared signup code no longer works: access is by personal invite only
create or replace function public.wt_join(p_code text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin raise exception 'invite_only'; end $$;

-- admin: invite a phone number (returns the invite with its token)
create or replace function public.wt_invite_create(p_phone text, p_name text) returns public.wt_invites
language plpgsql security definer set search_path = public as $$
declare ph text := wt_phone(p_phone); inv wt_invites;
begin
  if not wt_is_admin() then raise exception 'only_admin'; end if;
  if char_length(ph) < 9 then raise exception 'bad_phone'; end if;
  if exists (select 1 from wt_profiles where phone = ph and active) then raise exception 'already_member'; end if;
  select * into inv from wt_invites where phone = ph and used_at is null and not revoked;
  if found then
    update wt_invites set name = coalesce(nullif(trim(p_name), ''), name) where id = inv.id returning * into inv;
    return inv;
  end if;
  insert into wt_invites (phone, name) values (ph, coalesce(trim(p_name), '')) returning * into inv;
  return inv;
end $$;

create or replace function public.wt_invite_revoke(p_id integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not wt_is_admin() then raise exception 'only_admin'; end if;
  update wt_invites set revoked = true where id = p_id and used_at is null;
end $$;

-- public: what an invite link is for (name + phone), so the sign-up form can be pre-filled
create or replace function public.wt_invite_info(p_token text) returns table (name text, phone text)
language sql stable security definer set search_path = public as $$
  select name, phone from wt_invites where token = p_token and used_at is null and not revoked;
$$;

-- after signing up with the invite's phone: becomes a committee member; the invite is used up
create or replace function public.wt_join_invite(p_token text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare inv wt_invites; my_phone text;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  select * into inv from wt_invites where token = p_token and used_at is null and not revoked for update;
  if not found then raise exception 'bad_invite'; end if;
  select split_part(email, '@', 1) into my_phone from auth.users where id = auth.uid();
  if my_phone is distinct from inv.phone then raise exception 'bad_invite'; end if;
  insert into wt_profiles (id, name, phone, role, active)
  values (auth.uid(), coalesce(nullif(trim(p_name), ''), nullif(inv.name, ''), 'member'), inv.phone, 'member', true)
  on conflict (id) do update set name = excluded.name, phone = excluded.phone, active = true;
  update wt_invites set used_by = auth.uid(), used_at = now() where id = inv.id;
end $$;

-- admin: remove / restore a member's access (their past work stays)
create or replace function public.wt_member_set_active(p_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not wt_is_admin() then raise exception 'only_admin'; end if;
  if p_id = auth.uid() then raise exception 'not_self'; end if;
  update wt_profiles set active = p_active where id = p_id;
end $$;

do $$
declare f text;
begin
  foreach f in array array['wt_invite_create(text,text)','wt_invite_revoke(integer)','wt_join_invite(text,text)',
    'wt_member_set_active(uuid,boolean)','wt_is_admin()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  execute 'revoke all on function public.wt_invite_info(text) from public';
  execute 'grant execute on function public.wt_invite_info(text) to anon, authenticated';
end $$;
