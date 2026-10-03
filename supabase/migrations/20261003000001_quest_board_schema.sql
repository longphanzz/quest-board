-- Quest Board: one board per user. Every row carries user_id; RLS limits each user to their own rows.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  total_xp integer not null default 0 check (total_xp >= 0),
  streak integer not null default 0 check (streak >= 0),
  last_active_date date,
  shields integer not null default 0 check (shields between 0 and 2),
  completed integer not null default 0 check (completed >= 0),
  bosses_slain integer not null default 0 check (bosses_slain >= 0),
  early_finishes integer not null default 0 check (early_finishes >= 0),
  revision bigint not null default 0 check (revision >= 0),
  client_updated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.board_columns (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null check (char_length(name) between 1 and 30),
  position integer not null check (position >= 0),
  is_done boolean not null default false,
  primary key (user_id, id)
);
create unique index board_columns_one_done on public.board_columns (user_id) where is_done;

create table public.quests (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  column_id text not null,
  position integer not null check (position >= 0),
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '',
  difficulty text not null check (difficulty in ('easy', 'normal', 'hard', 'boss')),
  deadline date,
  created_at timestamptz not null,
  completed_at timestamptz,
  completion_xp integer check (completion_xp >= 0),
  completion_difficulty text check (completion_difficulty in ('easy', 'normal', 'hard', 'boss')),
  early boolean,
  primary key (user_id, id),
  foreign key (user_id, column_id) references public.board_columns (user_id, id) on delete cascade,
  check (
    (completed_at is null and completion_xp is null and completion_difficulty is null and early is null)
    or (completed_at is not null and completion_xp is not null and completion_difficulty is not null and early is not null)
  )
);
create index quests_column_idx on public.quests (user_id, column_id);

create table public.labels (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null check (char_length(name) between 1 and 20),
  color text not null check (char_length(color) between 1 and 32),
  position integer not null check (position >= 0),
  primary key (user_id, id)
);

create table public.quest_labels (
  user_id uuid not null references auth.users (id) on delete cascade,
  quest_id text not null,
  label_id text not null,
  position integer not null check (position >= 0),
  primary key (user_id, quest_id, label_id),
  foreign key (user_id, quest_id) references public.quests (user_id, id) on delete cascade,
  foreign key (user_id, label_id) references public.labels (user_id, id) on delete cascade
);
create index quest_labels_label_idx on public.quest_labels (user_id, label_id);

create table public.achievements (
  user_id uuid not null references auth.users (id) on delete cascade,
  achievement_id text not null,
  unlocked_at timestamptz not null,
  primary key (user_id, achievement_id)
);

create table public.avatar_frames (
  user_id uuid not null references auth.users (id) on delete cascade,
  mood text not null check (mood in ('normal', 'happy', 'levelUp', 'sad')),
  pixels jsonb not null check (jsonb_typeof(pixels) = 'array' and jsonb_array_length(pixels) = 1024),
  primary key (user_id, mood)
);

-- Row Level Security: signed-in users see and change only their own rows; anonymous visitors get nothing.
do $$
declare t text;
begin
  foreach t in array array['profiles', 'board_columns', 'quests', 'labels', 'quest_labels', 'achievements', 'avatar_frames'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_own_rows', t);
    execute format('revoke all on table public.%I from anon', t);
  end loop;
end $$;
