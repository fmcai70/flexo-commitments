-- =====================================================================
-- ActionRegister: permission test against the REAL database rules.
--
-- Run in Supabase → SQL Editor AFTER schema.sql. It creates temporary people (…@rls-test.local),
-- acts as each one, checks what they can do, then deletes everything it created.
--   ✔ Success: one row saying "All N ActionRegister checks passed".
--   ✘ Failure: an error listing every check that failed (nothing is kept).
--
--   Alice = Flexo admin (not on the list) · Exa = executive · Ann = manager · Ben = manager (helper)
--   Cid = manager · Fay = Flexo account, not on the list · Out = no ActionRegister access
-- =====================================================================
create or replace function pg_temp.ar_try(p_user uuid, p_sql text) returns text language plpgsql as $$
declare r text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute p_sql into r;
  return 'ok:' || coalesce(r, '');
exception when others then
  return 'err:' || sqlstate || ':' || sqlerrm;
end $$;

-- The test reads a few rows back while acting as a user.
create or replace function pg_temp.ar_doc(p_id text) returns text language sql security definer as $$
  select doc::text from public.ar_projects where id = p_id $$;
create or replace function pg_temp.ar_key(p_id text) returns text language sql security definer as $$
  select storage_key from public.ar_files where id = p_id::uuid $$;

do $$
declare
  alice uuid := gen_random_uuid(); exa uuid := gen_random_uuid(); ann uuid := gen_random_uuid();
  ben uuid := gen_random_uuid(); cid uuid := gen_random_uuid(); fay uuid := gen_random_uuid(); outu uuid := gen_random_uuid();
  r text; v text; n int; fid text;
  failures text[] := '{}';
  checks int := 0;
  proj text := '{"title":"RLS test plan","owner":"RLS Ann","assignedBy":"RLS Exa","plan":"SP","commitDate":"%s","activities":[],"coResp":["RLS Ben"]}';
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e || '@rls-test.local', '', '{}', now(), now()
  from (values (alice, 'alice'), (exa, 'exa'), (ann, 'ann'), (ben, 'ben'), (cid, 'cid'), (fay, 'fay'), (outu, 'out')) t(u, e);
  update public.profiles set role = 'admin' where id = alice;
  insert into public.app_access (user_id, app) select u, 'actionregister' from unnest(array[exa, ann, ben, cid, fay]) u;
  insert into public.ar_members (display_name, email, role, is_admin, sees_all_files, sort_order) values
    ('RLS Exa', 'exa@rls-test.local', 'exec', false, false, 9001),
    ('RLS Ann', 'ann@rls-test.local', 'manager', false, false, 9002),
    ('RLS Ben', 'ben@rls-test.local', 'manager', false, false, 9003),
    ('RLS Cid', 'cid@rls-test.local', 'manager', false, false, 9004),
    ('RLS Out', 'out@rls-test.local', 'manager', false, false, 9005);

  set local role authenticated;

  -- ---- who may use the app ---------------------------------------------
  r := pg_temp.ar_try(outu, 'select public.ar_state()::text');
  checks := checks + 1; if r not like 'err:AR403%' then failures := failures || ('on the list but no app access: ' || r); end if;
  r := pg_temp.ar_try(fay, 'select public.ar_state()::text');
  checks := checks + 1; if r not like 'err:AR403%' then failures := failures || ('app access but not on the list: ' || r); end if;
  r := pg_temp.ar_try(ann, 'select public.ar_whoami()::text');
  checks := checks + 1; if r not like '%"me": "RLS Ann"%' or r not like '%"allowed": true%' then failures := failures || ('whoami Ann: ' || r); end if;
  r := pg_temp.ar_try(ann, 'select count(*)::text from public.ar_projects');
  checks := checks + 1; if r not like 'err:42501%' then failures := failures || ('tables must not be readable directly: ' || r); end if;

  -- ---- projects ---------------------------------------------------------
  r := pg_temp.ar_try(ann, format('select public.ar_put_project(%L, %L::jsonb)::text', 'rlsT1',
         '{"title":"Mine","owner":"RLS Ann","assignedBy":"RLS Ann","plan":"OP","activities":[]}'));
  checks := checks + 1; if r not like 'ok:%"version": "1"%' then failures := failures || ('Ann adds own project: ' || r); end if;
  r := pg_temp.ar_try(ann, format('select public.ar_put_project(%L, %L::jsonb)::text', 'rlsT2',
         '{"title":"For Ben","owner":"RLS Ben","assignedBy":"RLS Ann","plan":"CM","activities":[]}'));
  checks := checks + 1; if r not like 'ok:%' then failures := failures || ('Ann assigns to co-manager Ben: ' || r); end if;
  r := pg_temp.ar_try(cid, format('select public.ar_put_project(%L, %L::jsonb)::text', 'rlsT3',
         '{"title":"Sneaky","owner":"RLS Ann","assignedBy":"RLS Exa","activities":[]}'));
  checks := checks + 1; if r not like 'err:AR403%' then failures := failures || ('Cid adds a project for Ann under the exec''s name: ' || r); end if;
  r := pg_temp.ar_try(exa, format('select public.ar_put_project(%L, %L::jsonb)::text', 'rlsT4', format(proj, to_char(current_date + 3, 'YYYY-MM-DD'))));
  checks := checks + 1; if r not like 'ok:%' then failures := failures || ('Exec assigns to Ann: ' || r); end if;
  r := pg_temp.ar_try(ann, format('select public.ar_put_project(%L, %L::jsonb, %L)::text', 'rlsT1',
         '{"title":"Mine v2","owner":"RLS Ann","assignedBy":"RLS Ann","plan":"OP","activities":[]}', '1'));
  checks := checks + 1; if r not like 'ok:%"version": "2"%' then failures := failures || ('Ann edits own project: ' || r); end if;
  r := pg_temp.ar_try(ann, format('select public.ar_put_project(%L, %L::jsonb, %L)::text', 'rlsT1',
         '{"title":"Mine v3","owner":"RLS Ann","assignedBy":"RLS Ann","plan":"OP","activities":[]}', '1'));
  checks := checks + 1; if r not like 'err:AR409%' then failures := failures || ('stale version must be refused: ' || r); end if;
  r := pg_temp.ar_try(ann, format('select public.ar_put_project(%L, %L::jsonb, %L)::text', 'rlsT1',
         '{"title":"Mine","owner":"RLS Cid","assignedBy":"RLS Ann","activities":[]}', '2'));
  checks := checks + 1; if r not like 'err:AR403%' then failures := failures || ('owner change must be refused: ' || r); end if;
  v := pg_temp.ar_doc('rlsT4');
  r := pg_temp.ar_try(ben, format('select public.ar_put_project(%L, %L::jsonb, %L)::text', 'rlsT4',
         (v::jsonb || '{"activities":[{"id":"a1","text":"Help","status":"doing"}]}')::text, '1'));
  checks := checks + 1; if r not like 'ok:%' then failures := failures || ('helper Ben updates activities: ' || r); end if;
  v := pg_temp.ar_doc('rlsT4');
  r := pg_temp.ar_try(ben, format('select public.ar_put_project(%L, %L::jsonb, %L)::text', 'rlsT4',
         (v::jsonb || '{"title":"Renamed by helper"}')::text, '2'));
  checks := checks + 1; if r not like 'err:AR403%' then failures := failures || ('helper Ben renames: ' || r); end if;
  r := pg_temp.ar_try(cid, format('select public.ar_put_project(%L, %L::jsonb, %L)::text', 'rlsT4', v, '2'));
  checks := checks + 1; if r not like 'err:AR403%' then failures := failures || ('Cid edits Ann''s project: ' || r); end if;
  r := pg_temp.ar_try(cid, 'select jsonb_array_length(public.ar_state() -> ''projects'')::text');
  checks := checks + 1; if r not like 'ok:%' or split_part(r, ':', 2)::int < 3 then failures := failures || ('everyone on the list sees all projects: ' || r); end if;

  -- ---- extension request emails the executives -----------------------------
  v := pg_temp.ar_doc('rlsT4');
  r := pg_temp.ar_try(ann, format('select public.ar_put_project(%L, %L::jsonb, %L)::text', 'rlsT4',
         (v::jsonb || '{"extension":{"status":"pending","requested":"2027-01-31","forDeadline":"x","reason":"r","requestedAt":"t"}}')::text, '2'));
  checks := checks + 1; if r not like 'ok:%' then failures := failures || ('Ann requests an extension: ' || r); end if;

  -- ---- sub plans ------------------------------------------------------------
  r := pg_temp.ar_try(cid, format('select public.ar_put_subplan(%L, %L::jsonb)::text', 'rlsT4', '{"title":"Sub","owner":"RLS Ann","assignee":"RLS Ben"}'));
  checks := checks + 1; if r not like 'err:AR403%' then failures := failures || ('Cid creates Ann''s sub plan: ' || r); end if;
  r := pg_temp.ar_try(ann, format('select public.ar_put_subplan(%L, %L::jsonb)::text', 'rlsT4', '{"title":"Sub","owner":"RLS Ann","assignee":"RLS Ben"}'));
  checks := checks + 1; if r not like 'ok:%' then failures := failures || ('Ann creates her sub plan: ' || r); end if;
  r := pg_temp.ar_try(ben, format('select public.ar_put_subplan(%L, %L::jsonb, %L)::text', 'rlsT4', '{"title":"Sub 2","owner":"RLS Ann","assignee":"RLS Ben"}', '1'));
  checks := checks + 1; if r not like 'ok:%' then failures := failures || ('assignee Ben edits the sub plan: ' || r); end if;
  r := pg_temp.ar_try(cid, format('select public.ar_put_subplan(%L, %L::jsonb, %L)::text', 'rlsT4', '{"title":"Sub 3","owner":"RLS Ann","assignee":"RLS Ben"}', '2'));
  checks := checks + 1; if r not like 'err:AR403%' then failures := failures || ('Cid edits the sub plan: ' || r); end if;
  r := pg_temp.ar_try(ben, format('select public.ar_delete_subplan(%L)::text', 'rlsT4'));
  checks := checks + 1; if r not like 'err:AR403%' then failures := failures || ('assignee deletes the sub plan: ' || r); end if;

  -- ---- attachments ----------------------------------------------------------
  r := pg_temp.ar_try(ann, format('select public.ar_file_begin(%L, %L, %L, 100)::text', 'p', 'rlsT4', 'notes.pdf'));
  checks := checks + 1; if r not like 'err:AR400%' then failures := failures || ('only Excel/CSV: ' || r); end if;
  r := pg_temp.ar_try(cid, format('select public.ar_file_begin(%L, %L, %L, 100)::text', 'p', 'rlsT4', 'x.xlsx'));
  checks := checks + 1; if r not like 'err:AR403%' then failures := failures || ('Cid attaches to Ann''s project: ' || r); end if;
  r := pg_temp.ar_try(ann, format('select public.ar_file_begin(%L, %L, %L, 100)::text', 'p', 'rlsT4', 'Budget.xlsx'));
  checks := checks + 1; if r not like 'ok:%' then failures := failures || ('Ann attaches: ' || r); end if;
  fid := (substring(r from 4))::jsonb ->> 'id';
  r := pg_temp.ar_try(cid, format('select public.ar_file_key(%L)::text', fid));
  checks := checks + 1; if r not like 'err:AR403%' then failures := failures || ('Cid opens Ann''s file: ' || r); end if;
  r := pg_temp.ar_try(exa, format('select public.ar_file_key(%L)::text', fid));
  checks := checks + 1; if r not like 'ok:%' then failures := failures || ('exec opens any file: ' || r); end if;
  r := pg_temp.ar_try(cid, format('select public.ar_storage_can_read(%L)::text', pg_temp.ar_key(fid)));
  checks := checks + 1; if r <> 'ok:false' then failures := failures || ('storage rule lets Cid read: ' || r); end if;
  r := pg_temp.ar_try(cid, format('select public.ar_file_delete(%L)::text', fid));
  checks := checks + 1; if r not like 'err:AR403%' then failures := failures || ('Cid removes Ann''s file: ' || r); end if;

  -- ---- view as (admins only) -------------------------------------------------
  r := pg_temp.ar_try(ann, format('select public.ar_put_project(%L, %L::jsonb, null, %L)::text', 'rlsT5',
         '{"title":"As Ben","owner":"RLS Ben","assignedBy":"RLS Ben","activities":[]}', 'RLS Ben'));
  checks := checks + 1; if r not like 'err:AR403%' then failures := failures || ('non-admin works as someone else: ' || r); end if;
  r := pg_temp.ar_try(alice, format('select public.ar_put_project(%L, %L::jsonb)::text', 'rlsT5',
         '{"title":"No one","owner":"RLS Ben","assignedBy":"RLS Ben","activities":[]}'));
  checks := checks + 1; if r not like 'err:AR400%' then failures := failures || ('admin not on the list must choose a person: ' || r); end if;
  r := pg_temp.ar_try(alice, format('select public.ar_put_project(%L, %L::jsonb, null, %L)::text', 'rlsT5',
         '{"title":"As Ben","owner":"RLS Ben","assignedBy":"RLS Ben","activities":[]}', 'RLS Ben'));
  checks := checks + 1; if r not like 'ok:%' then failures := failures || ('admin works as Ben: ' || r); end if;

  -- ---- people list ----------------------------------------------------------
  r := pg_temp.ar_try(ann, 'select public.ar_members_list()::text');
  checks := checks + 1; if r not like 'err:AR403%' then failures := failures || ('non-admin lists people: ' || r); end if;
  r := pg_temp.ar_try(alice, format('select public.ar_add_member(%L, %L)::text', 'FAY@rls-test.local', 'RLS Fay'));
  checks := checks + 1; if r not like 'ok:%' then failures := failures || ('admin adds Fay: ' || r); end if;
  r := pg_temp.ar_try(fay, 'select public.ar_whoami()::text');
  checks := checks + 1; if r not like '%"me": "RLS Fay"%' or r not like '%"allowed": true%' then failures := failures || ('Fay can use the app once added: ' || r); end if;
  r := pg_temp.ar_try(ann, format('select public.ar_import(%L::jsonb)::text', '{}'));
  checks := checks + 1; if r not like 'err:AR403%' then failures := failures || ('non-admin imports: ' || r); end if;

  -- ---- deleting ---------------------------------------------------------------
  r := pg_temp.ar_try(ann, format('select public.ar_delete_project(%L)::text', 'rlsT1'));
  checks := checks + 1; if r not like 'err:AR403%' then failures := failures || ('manager deletes a project: ' || r); end if;
  r := pg_temp.ar_try(exa, format('select public.ar_delete_project(%L)::text', 'rlsT1'));
  checks := checks + 1; if r not like 'ok:%' then failures := failures || ('exec deletes a project: ' || r); end if;

  -- ---- emails and reminders (as the database owner) ------------------------------
  reset role;
  select count(*) into n from public.ar_outbox where to_email = 'ben@rls-test.local' and subject like '%New commitment%';
  checks := checks + 1; if n <> 1 then failures := failures || format('assignment email to Ben (got %s)', n); end if;
  select count(*) into n from public.ar_outbox where to_email = 'exa@rls-test.local' and subject like '%Extension request%';
  checks := checks + 1; if n <> 1 then failures := failures || format('extension request email to the exec (got %s)', n); end if;
  update public.ar_projects set doc = doc - 'extension' where id = 'rlsT4';
  perform public.ar_daily_reminders();
  select count(*) into n from public.ar_outbox where to_email = 'ann@rls-test.local' and subject like '%waiting for your update%';
  checks := checks + 1; if n <> 1 then failures := failures || format('check-in reminder to Ann (got %s)', n); end if;
  perform public.ar_daily_reminders();
  select count(*) into n from public.ar_outbox where to_email = 'ann@rls-test.local' and subject like '%waiting for your update%';
  checks := checks + 1; if n <> 1 then failures := failures || format('reminder must not repeat (got %s)', n); end if;
  checks := checks + 1;
  if public.ar_subplan_cycle('weekly-thu', '', '2026-10-17') <> '2026-10-15'
     or public.ar_subplan_cycle('first-thu', '', '2026-10-01') <> '2026-10-01'
     or public.ar_subplan_cycle('first-thu', '', '2026-11-03') <> '2026-10-01'
     or public.ar_subplan_cycle('first-thu', '2026-10-02T00:00:00Z', '2026-11-03') is not null then
    failures := failures || 'sub plan cycle dates'::text;
  end if;
  select count(*) into n from public.ar_audit_log where acting_as = 'RLS Ben' and entity_id = 'rlsT5';
  checks := checks + 1; if n <> 1 then failures := failures || format('history notes "as Ben" (got %s)', n); end if;

  -- ---- cleanup -------------------------------------------------------------------
  delete from public.ar_files where parent_id like 'rlsT%';
  delete from public.ar_projects where id like 'rlsT%';
  delete from public.ar_audit_log where entity_id like 'rlsT%' or entity_id like 'RLS %';
  delete from public.ar_notification_log where key like '%|rlsT%';
  delete from public.ar_outbox where to_email like '%@rls-test.local';
  delete from public.ar_members where display_name like 'RLS %';
  delete from public.app_access where user_id in (alice, exa, ann, ben, cid, fay, outu);
  delete from auth.users where id in (alice, exa, ann, ben, cid, fay, outu);

  if array_length(failures, 1) > 0 then
    raise exception E'% of % ActionRegister checks FAILED:\n - %', array_length(failures, 1), checks, array_to_string(failures, E'\n - ');
  end if;
  perform set_config('flexo.ar_checks', checks::text, false);
end $$;

select 'All ' || current_setting('flexo.ar_checks') || ' ActionRegister checks passed ✔' as result;
