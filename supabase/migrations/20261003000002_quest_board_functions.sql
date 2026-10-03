-- ISO-8601 in UTC with milliseconds, identical to JavaScript's Date.toISOString().
create or replace function public.qb_iso(t timestamptz)
returns text language sql immutable set search_path = '' as $$
  select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

-- The user's board as CloudBoard JSON (see src/cloud/mapping.ts). RLS still applies (security invoker).
create or replace function public.qb_board(p_uid uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'columns', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'isDone', c.is_done,
        'questIds', coalesce((select jsonb_agg(q.id order by q.position)
                              from public.quests q where q.user_id = p_uid and q.column_id = c.id), '[]'::jsonb)
      ) order by c.position)
      from public.board_columns c where c.user_id = p_uid), '[]'::jsonb),
    'quests', coalesce((
      select jsonb_object_agg(q.id, jsonb_build_object(
        'id', q.id, 'title', q.title, 'description', q.description, 'difficulty', q.difficulty,
        'deadline', q.deadline::text,
        'labelIds', coalesce((select jsonb_agg(ql.label_id order by ql.position)
                              from public.quest_labels ql where ql.user_id = p_uid and ql.quest_id = q.id), '[]'::jsonb),
        'createdAt', public.qb_iso(q.created_at),
        'completion', case when q.completed_at is null then 'null'::jsonb else jsonb_build_object(
          'at', public.qb_iso(q.completed_at), 'xp', q.completion_xp,
          'difficulty', q.completion_difficulty, 'early', q.early) end
      ))
      from public.quests q where q.user_id = p_uid), '{}'::jsonb),
    'labels', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'color', l.color) order by l.position)
      from public.labels l where l.user_id = p_uid), '[]'::jsonb),
    'player', (
      select jsonb_build_object(
        'totalXp', p.total_xp, 'streak', p.streak, 'lastActiveDate', p.last_active_date::text, 'shields', p.shields,
        'stats', jsonb_build_object('completed', p.completed, 'bossesSlain', p.bosses_slain, 'earlyFinishes', p.early_finishes),
        'unlockedAchievements', coalesce((
          select jsonb_object_agg(a.achievement_id, public.qb_iso(a.unlocked_at))
          from public.achievements a where a.user_id = p_uid), '{}'::jsonb))
      from public.profiles p where p.user_id = p_uid),
    'avatar', jsonb_build_object('frames', jsonb_build_object(
      'normal', (select f.pixels from public.avatar_frames f where f.user_id = p_uid and f.mood = 'normal'),
      'happy', (select f.pixels from public.avatar_frames f where f.user_id = p_uid and f.mood = 'happy'),
      'levelUp', (select f.pixels from public.avatar_frames f where f.user_id = p_uid and f.mood = 'levelUp'),
      'sad', (select f.pixels from public.avatar_frames f where f.user_id = p_uid and f.mood = 'sad')))
  )
$$;

create or replace function public.load_board()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
  prof public.profiles%rowtype;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into prof from public.profiles where user_id = uid;
  if not found then return null; end if;
  return jsonb_build_object('revision', prof.revision, 'clientUpdatedAt', public.qb_iso(prof.client_updated_at),
                            'board', public.qb_board(uid));
end $$;

-- Replaces the caller's whole board in one transaction, last-write-wins on p_client_updated_at.
create or replace function public.save_board(p_board jsonb, p_base_revision bigint, p_client_updated_at timestamptz)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
  prof public.profiles%rowtype;
  has_profile boolean;
  cur_rev bigint := 0;
  new_rev bigint;
  p jsonb := p_board -> 'player';
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  select * into prof from public.profiles where user_id = uid for update;
  has_profile := found;
  if has_profile then cur_rev := prof.revision; end if;

  if has_profile and cur_rev <> p_base_revision and p_client_updated_at <= prof.client_updated_at then
    return jsonb_build_object('status', 'stale', 'revision', cur_rev,
      'clientUpdatedAt', public.qb_iso(prof.client_updated_at), 'board', public.qb_board(uid));
  end if;

  delete from public.quest_labels where user_id = uid;
  delete from public.quests where user_id = uid;
  delete from public.labels where user_id = uid;
  delete from public.board_columns where user_id = uid;
  delete from public.achievements where user_id = uid;
  delete from public.avatar_frames where user_id = uid;

  insert into public.board_columns (user_id, id, name, position, is_done)
  select uid, c ->> 'id', c ->> 'name', (o - 1)::int, (c ->> 'isDone')::boolean
  from jsonb_array_elements(p_board -> 'columns') with ordinality as t(c, o);

  insert into public.labels (user_id, id, name, color, position)
  select uid, l ->> 'id', l ->> 'name', l ->> 'color', (o - 1)::int
  from jsonb_array_elements(p_board -> 'labels') with ordinality as t(l, o);

  insert into public.quests (user_id, id, column_id, position, title, description, difficulty, deadline,
                             created_at, completed_at, completion_xp, completion_difficulty, early)
  select uid, q ->> 'id', c ->> 'id', (qo - 1)::int, q ->> 'title', coalesce(q ->> 'description', ''),
         q ->> 'difficulty', (q ->> 'deadline')::date, (q ->> 'createdAt')::timestamptz,
         (q -> 'completion' ->> 'at')::timestamptz, (q -> 'completion' ->> 'xp')::int,
         q -> 'completion' ->> 'difficulty', (q -> 'completion' ->> 'early')::boolean
  from jsonb_array_elements(p_board -> 'columns') as c
  cross join lateral jsonb_array_elements_text(c -> 'questIds') with ordinality as t(qid, qo)
  cross join lateral (select p_board -> 'quests' -> qid as q) as qq;

  insert into public.quest_labels (user_id, quest_id, label_id, position)
  select uid, q.key, lid, (o - 1)::int
  from jsonb_each(p_board -> 'quests') as q
  cross join lateral jsonb_array_elements_text(q.value -> 'labelIds') with ordinality as t(lid, o);

  insert into public.achievements (user_id, achievement_id, unlocked_at)
  select uid, a.key, a.value::timestamptz
  from jsonb_each_text(p -> 'unlockedAchievements') as a;

  insert into public.avatar_frames (user_id, mood, pixels)
  select uid, f.key, f.value
  from jsonb_each(p_board -> 'avatar' -> 'frames') as f
  where jsonb_typeof(f.value) = 'array';

  new_rev := cur_rev + 1;
  insert into public.profiles as pr (user_id, total_xp, streak, last_active_date, shields, completed, bosses_slain,
                                     early_finishes, revision, client_updated_at, updated_at)
  values (uid, (p ->> 'totalXp')::int, (p ->> 'streak')::int, (p ->> 'lastActiveDate')::date, (p ->> 'shields')::int,
          (p -> 'stats' ->> 'completed')::int, (p -> 'stats' ->> 'bossesSlain')::int,
          (p -> 'stats' ->> 'earlyFinishes')::int, new_rev, p_client_updated_at, now())
  on conflict (user_id) do update set
    total_xp = excluded.total_xp, streak = excluded.streak, last_active_date = excluded.last_active_date,
    shields = excluded.shields, completed = excluded.completed, bosses_slain = excluded.bosses_slain,
    early_finishes = excluded.early_finishes, revision = excluded.revision,
    client_updated_at = excluded.client_updated_at, updated_at = excluded.updated_at;

  return jsonb_build_object('status', 'saved', 'revision', new_rev);
end $$;

revoke execute on function public.qb_board(uuid), public.load_board(), public.save_board(jsonb, bigint, timestamptz) from public, anon;
grant execute on function public.qb_board(uuid), public.load_board(), public.save_board(jsonb, bigint, timestamptz) to authenticated;
