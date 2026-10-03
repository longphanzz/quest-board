do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  frame jsonb := (select jsonb_agg('#ffcd75'::text) from generate_series(1, 1024));
  board_a jsonb;
  board_b jsonb := '{"columns":[{"id":"b1","name":"Todo","isDone":false,"questIds":["bq"]},{"id":"b2","name":"Done","isDone":true,"questIds":[]}],
    "quests":{"bq":{"id":"bq","title":"B quest","description":"","difficulty":"easy","deadline":null,"labelIds":[],"createdAt":"2026-10-03T01:00:00.000Z","completion":null}},
    "labels":[],"player":{"totalXp":0,"streak":0,"lastActiveDate":null,"shields":0,"stats":{"completed":0,"bossesSlain":0,"earlyFinishes":0},"unlockedAchievements":{}},
    "avatar":{"frames":{"normal":null,"happy":null,"levelUp":null,"sad":null}}}';
  r jsonb;
  n int;
  failed boolean;
begin
  board_a := jsonb_build_object(
    'columns', '[{"id":"c1","name":"To Do","isDone":false,"questIds":["q1","q3"]},{"id":"c2","name":"Done","isDone":true,"questIds":["q2"]}]'::jsonb,
    'quests', '{"q1":{"id":"q1","title":"Ôn thi","description":"chương 1","difficulty":"normal","deadline":"2026-10-05","labelIds":["l2","l1"],"createdAt":"2026-10-01T03:04:05.678Z","completion":null},
                "q3":{"id":"q3","title":"Đọc sách","description":"","difficulty":"easy","deadline":null,"labelIds":[],"createdAt":"2026-10-01T03:04:06.000Z","completion":null},
                "q2":{"id":"q2","title":"Boss","description":"","difficulty":"boss","deadline":null,"labelIds":["l1"],"createdAt":"2026-09-30T00:00:00.000Z","completion":{"at":"2026-09-30T08:15:00.123Z","xp":150,"difficulty":"boss","early":true}}}'::jsonb,
    'labels', '[{"id":"l1","name":"School","color":"#41a6f6"},{"id":"l2","name":"Home","color":"#ef7d57"}]'::jsonb,
    'player', '{"totalXp":150,"streak":2,"lastActiveDate":"2026-09-30","shields":1,"stats":{"completed":1,"bossesSlain":1,"earlyFinishes":1},"unlockedAchievements":{"first-blood":"2026-09-30T08:15:00.123Z"}}'::jsonb,
    'avatar', jsonb_build_object('frames', jsonb_build_object('normal', null, 'happy', frame, 'levelUp', null, 'sad', null)));

  insert into auth.users (id, email, aud, role) values
    (a, 'rls-a@example.test', 'authenticated', 'authenticated'),
    (b, 'rls-b@example.test', 'authenticated', 'authenticated');
  set local role authenticated;

  -- A saves and reads back exactly the same board.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  r := public.save_board(board_a, 0, '2026-10-03T10:00:00Z');
  if r ->> 'status' <> 'saved' or (r ->> 'revision')::int <> 1 then raise exception 'RLS_CHECK_FAIL: first save %', r; end if;
  r := public.load_board();
  if r -> 'board' <> board_a then raise exception 'RLS_CHECK_FAIL: round trip differs: %', r -> 'board'; end if;

  -- B sees none of A's rows.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  if public.load_board() is not null then raise exception 'RLS_CHECK_FAIL: B sees a board before saving'; end if;
  select count(*) into n from public.quests;
  if n <> 0 then raise exception 'RLS_CHECK_FAIL: B can read % of A''s quests', n; end if;
  update public.quests set title = 'hacked' where user_id = a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS_CHECK_FAIL: B updated A''s quests'; end if;
  failed := false;
  begin
    insert into public.board_columns (user_id, id, name, position, is_done) values (a, 'x', 'x', 9, false);
  exception when insufficient_privilege then failed := true;
  end;
  if not failed then raise exception 'RLS_CHECK_FAIL: B inserted a row for A'; end if;

  -- B's save only touches B.
  r := public.save_board(board_b, 0, '2026-10-03T10:00:00Z');
  if r ->> 'status' <> 'saved' then raise exception 'RLS_CHECK_FAIL: B save %', r; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  if public.load_board() -> 'board' <> board_a then raise exception 'RLS_CHECK_FAIL: B''s save changed A'; end if;

  -- Last write wins.
  r := public.save_board(board_b, 0, '2026-10-03T09:00:00Z');
  if r ->> 'status' <> 'stale' or r -> 'board' <> board_a then raise exception 'RLS_CHECK_FAIL: older save not stale %', r ->> 'status'; end if;
  r := public.save_board(board_a, 0, '2026-10-03T11:00:00Z');
  if r ->> 'status' <> 'saved' or (r ->> 'revision')::int <> 2 then raise exception 'RLS_CHECK_FAIL: newer save %', r; end if;

  -- A bad payload writes nothing.
  failed := false;
  begin
    perform public.save_board(jsonb_set(board_a, '{quests,q1,difficulty}', '"legendary"'), 2, '2026-10-03T12:00:00Z');
  exception when others then failed := true;
  end;
  r := public.load_board();
  if not failed or (r ->> 'revision')::int <> 2 or r -> 'board' <> board_a then
    raise exception 'RLS_CHECK_FAIL: bad payload was not rejected cleanly';
  end if;

  raise exception 'RLS_CHECK_OK';
end $$;
