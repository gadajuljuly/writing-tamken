-- Shared access: everyone logs in with one code (the password of the shared account).
-- Run once in Supabase → SQL Editor after the shared account was created.
insert into public.wt_profiles (id, name)
select id, 'اللجنة' from auth.users where email = 'committee@writing-tamken.app'
on conflict (id) do nothing;

-- existing minutes belong to the shared account, so everyone can approve them
update public.wt_minutes set uploaded_by = (select id from auth.users where email = 'committee@writing-tamken.app');
