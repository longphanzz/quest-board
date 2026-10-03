# Quest Board — Supabase Backend Design

Date: 2026-10-03 · Status: draft for review · Supersedes: the localStorage-only persistence of `2026-09-29-quest-board-design.md` (game rules in that spec are unchanged).

## 1. Goal and decisions

Move Quest Board's data from the browser to Supabase so each person has an account and sees the same board on every device, while the app keeps working offline.

Decisions agreed with the user (brainstorm, 2026-10-03):

| # | Decision |
|---|----------|
| D1 | Multi-user: every person has their own account and their own board (one board per account). |
| D2 | Offline-first: the app reads/writes a local copy; changes sync in the background. Conflicts resolve **last-write-wins on the whole board**. |
| D3 | Email + password auth now, with confirmation email and **forgot-password** flow. Google sign-in is a later phase (out of scope here). |
| D4 | Sign-in is required. First sign-in on a device offers to upload the existing local board. Signing out deletes the local board copy. |
| D5 | Normalized tables, written atomically by one SQL function (`save_board`) per sync — never row-by-row. |
| D6 | Audio/theme settings stay per device and are not synced. The backup reminder banner is removed; Export/Import JSON stays. |
| D7 | Privacy: Row Level Security on every table; functions derive the user from `auth.uid()`, never from client input. |

Non-goals: Google/OAuth sign-in, sharing boards between users, real-time push between devices, per-field merge (CRDT), hosting/deploying the app.

## 2. Database (Supabase project `nbrrjkwlqwdxojnnpfvp`)

All schema changes live in versioned files under `supabase/migrations/` and are applied with the Supabase connector only after the user approves. Every table is in `public`, has `user_id uuid not null references auth.users(id) on delete cascade`, and app-generated ids are `text` (the app's `newId()` may fall back to a non-UUID format).

| Table | Primary key | Columns (besides `user_id`) | Constraints |
|---|---|---|---|
| `profiles` | `user_id` | `total_xp int`, `streak int`, `last_active_date date null`, `shields int`, `completed int`, `bosses_slain int`, `early_finishes int`, `revision bigint`, `client_updated_at timestamptz`, `updated_at timestamptz default now()` | all counters `>= 0`; `shields between 0 and 2` |
| `board_columns` | `(user_id, id)` | `name text`, `position int`, `is_done bool` | name 1–30 chars (`MAX_COLUMN_NAME_LENGTH`); partial unique index: one `is_done` column per user |
| `quests` | `(user_id, id)` | `column_id text`, `position int`, `title text`, `description text`, `difficulty text`, `deadline date null`, `created_at timestamptz`, `completed_at timestamptz null`, `completion_xp int null`, `completion_difficulty text null`, `early bool null` | FK `(user_id, column_id) → board_columns on delete cascade`; title 1–120 chars; `difficulty` and `completion_difficulty` in `easy/normal/hard/boss`; completion fields all null or all set |
| `labels` | `(user_id, id)` | `name text`, `color text` | name 1–20 chars (`MAX_LABEL_NAME_LENGTH`); color non-empty text (the app does not restrict its format) |
| `quest_labels` | `(user_id, quest_id, label_id)` | — | FKs to `quests` and `labels`, both `on delete cascade` |
| `achievements` | `(user_id, achievement_id)` | `unlocked_at timestamptz` | — |
| `avatar_frames` | `(user_id, mood)` | `pixels jsonb` | mood in `normal/happy/levelUp/sad`; `pixels` is a JSON array of 1024 entries |

Length limits mirror `src/store/board.ts` (title 120, column name 30, label name 20); if they ever differ, the app's limits win.

### Row Level Security
RLS is enabled on all seven tables. Each table gets policies for `select`, `insert`, `update`, `delete` to role `authenticated` with `user_id = (select auth.uid())`. Role `anon` gets nothing.

### Functions
Both functions are `security invoker` (so RLS still applies) with `set search_path = ''` and fully qualified names.

**`load_board() returns jsonb`** — for the current user returns `null` if no `profiles` row exists, else `{ "revision": n, "clientUpdatedAt": iso, "board": CloudBoard }`.

**`save_board(p_board jsonb, p_base_revision bigint, p_client_updated_at timestamptz) returns jsonb`**, in one transaction:
1. `uid := auth.uid()`; raise if null.
2. Lock the user's `profiles` row (`for update`). If none exists, treat current revision as `0`.
3. If `current_revision <> p_base_revision` **and** `p_client_updated_at <= stored client_updated_at` → return `{ "status": "stale", "revision": current, "clientUpdatedAt": stored, "board": <same as load_board's board> }` and write nothing.
4. Otherwise replace the user's board: delete the user's rows in `quest_labels`, `quests`, `labels`, `board_columns`, `achievements`, `avatar_frames`; insert from `p_board`; upsert `profiles` with counters, `revision = current + 1`, `client_updated_at = p_client_updated_at`. Return `{ "status": "saved", "revision": new }`.
5. Any constraint violation aborts the whole transaction (nothing partially written) and surfaces as an error to the client.

### CloudBoard (the JSON exchanged with both functions)
The synced subset of `AppData`, same field names as `src/types.ts`:
`{ columns: Column[], quests: Record<string, Quest>, labels: Label[], player: Player, avatar: { frames } }`.
Order is positional: `board_columns.position` = index in `columns`; `quests.position` = index in its column's `questIds`. `settings` and `schemaVersion` are not sent. A round-trip `AppData → CloudBoard → tables → CloudBoard → AppData` must reproduce the board exactly (settings come from the device).

## 3. App architecture

New folder `src/cloud/`:

| Unit | Responsibility | Depends on |
|---|---|---|
| `client.ts` | Creates the Supabase client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` | `@supabase/supabase-js` v2 |
| `mapping.ts` | Pure: `toCloudBoard(data)`, `fromCloudBoard(board, settings)`; validates incoming boards with the existing `validateData` | `src/store/persistence.ts` |
| `api.ts` | `loadBoard()`, `saveBoard(board, baseRevision, clientUpdatedAt)` via `rpc`; maps network vs server errors | `client.ts` |
| `syncEngine.ts` | Sync state machine (§4). API, clock and timers are injected so it is testable without a network | `api.ts` (injected) |
| `useAuth.ts` | Session state, `signUp`, `signIn`, `signOut`, `requestPasswordReset`, `updatePassword`; listens to `onAuthStateChange` | `client.ts` |

New components: `AuthScreen` (tabs Sign in / Sign up / Forgot password), `ResetPasswordScreen` (shown on the `PASSWORD_RECOVERY` auth event), `FirstSyncPrompt`, `SyncStatus` (in `PlayerBar`).

Changes to existing code:
- **Local storage split.**
  - Device settings: key `quest-board-device-v1`, holding `Settings`.
  - Board cache: key `quest-board-cloud-v1`, holding `{ ownerId, data, sync: { dirty, baseRevision, localUpdatedAt } }`.
  - On boot, a cache whose `ownerId` ≠ the signed-in user is discarded.
  - The legacy key `quest-board-v1` is read only by `FirstSyncPrompt`. It is removed once the user's choice has been saved.
- **Settings.** `AppData.settings` stays in memory for the UI but is excluded from sync. On first run, settings are migrated from the legacy key into the device key.
- **Removed.** `BackupBanner` and the backup-reminder logic are removed. Export/Import JSON stays. Import replaces the board and marks it dirty.
- **Settings panel.** Shows "Signed in as <email>" and a **Sign out** button.
- **Store actions.** Every mutating store action marks the board dirty with `localUpdatedAt = now`. `replaceData` from the server does not fire game effects.
- **Service worker.** It must not cache requests to `*.supabase.co`.
- **Config files.** `.env.example` documents both variables; `.env.local` holds the real values and `.env*.local` is added to `.gitignore`. The `service_role` key is never used by the app or committed.

Game rules (`src/game/*`, `src/store/progress.ts`) are not changed.

## 4. Sync behaviour

States shown by `SyncStatus`:
- ☁️ **Synced**
- ⏳ **Saving…**
- 📴 **Offline** — saved on this device
- ⚠️ **Sync error** — click to retry

**Push**
- When the board is dirty, wait 2 s after the last change, then call `save_board(toCloudBoard(data), baseRevision, localUpdatedAt)`.
- On `saved`: set `baseRevision = revision` and clear `dirty`, but only if no newer local change happened meanwhile. Otherwise, schedule another push.
- On `stale`: replace local data with the returned board, set `baseRevision`, clear `dirty`, and show the toast "Board updated from another device".
- On network failure: show 📴 and retry after 5, 10, 20, 40, 60, 60… seconds. Retry immediately on the browser `online` event.
- On a server or validation error: show ⚠️ and retry with the same backoff. A click on ⚠️ retries now.

**Pull** triggers:
- after sign-in or app start with a session;
- on the `online` event;
- when the tab becomes visible.

On a pull, act on the first case that applies:
1. Local is dirty → push instead. The server decides last-write-wins.
2. The server revision is greater than `baseRevision` → replace the local board with no effects.
3. Otherwise → nothing changes.

A malformed board from the server never overwrites local data. It shows ⚠️ instead.

Two tabs of the same account push independently. The losing tab receives `stale` and adopts the winner.

Signing in while offline with a stored session works: the cached board is used and pushed when online.

## 5. Auth flows

- **Sign up**
  - Requires an email and a password of at least 8 characters.
  - Uses `emailRedirectTo = window.location.origin`.
  - Then shows "Check your email to confirm your account".
- **Sign in**
  - Errors map to: "Wrong email or password", "Email not confirmed yet", "No connection", "Something went wrong — try again".
- **Forgot password**
  - `resetPasswordForEmail(email, { redirectTo: origin })` sends the email.
  - The app then always shows "If that email has an account, a reset link is on its way" (it does not reveal whether the account exists).
  - Following the link opens `ResetPasswordScreen` (new password ≥ 8 characters, entered twice).
- **First sync on a device**, after `load_board()`. The legacy key is checked *before* the board is cached.

  | Account | Legacy local board | Action |
  |---|---|---|
  | empty (`null`) | present | Prompt **Upload** / **Start fresh** |
  | empty | absent | Create the default board and push it |
  | has board | present | Prompt **Use account board** / **Replace with this device's board** |
  | has board | absent | Use the account board |

- **Sign out**
  - If the board is dirty, confirm first: "You have unsynced changes. Signing out will lose them."
  - Then `signOut()` and delete `quest-board-cloud-v1`. Device settings are kept.
- **Session expiry**
  - The Supabase client refreshes the session automatically.
  - If refresh fails, return to `AuthScreen`. The dirty cache is kept, and it is pushed after the same user signs in again.

**Manual setup by the user** in the Supabase dashboard (guided step by step when reached):
- set Site URL / Redirect URLs to `http://localhost:5173`;
- optionally disable "Confirm email" while testing, then re-enable it.

## 6. Error handling summary

| Situation | Behaviour |
|---|---|
| No network | 📴, local edits kept, auto-push on reconnect |
| Supabase error / timeout | Backoff retry (5 s → 60 s cap), ⚠️ after the first server error |
| Session refresh fails | Back to sign-in; unsynced changes kept for the same user |
| Malformed server board | Local data untouched, ⚠️ |
| Tab closed with unsynced changes | Cache persists; pushed on next open |
| Constraint violation in `save_board` | Whole save rolled back, ⚠️, local data untouched |

## 7. Testing

1. **Unit / component tests (Vitest, TDD — each test seen failing first)**
   - `mapping`: round-trip equality and rejection of malformed boards.
   - `syncEngine` with a fake API and fake clock: debounce; saved; stale; offline then online; backoff schedule; change during an in-flight save.
   - `useAuth` error mapping.
   - `AuthScreen`, `ResetPasswordScreen`, `FirstSyncPrompt` (all four rows), and sign-out confirmation.
   - The existing 177 tests stay green; tests for the removed backup reminder are deleted along with it.
2. **Database tests on the real project**
   - The SQL check script lives at `supabase/tests/rls_check.sql`.
   - It runs inside a transaction that is rolled back, impersonating two fake users via `set local role authenticated` and `request.jwt.claims`.
   - It checks that:
     - user B reads nothing of user A;
     - B's `save_board` cannot touch A's rows;
     - the stale and saved paths return the right status;
     - a bad payload writes nothing.
   - Supabase **security advisors** run with no new warnings.
3. **Manual browser check**
   - Claude verifies what it can on `localhost`.
   - The user creates the real account with their own email (Claude does not create accounts on external services).
   - The user then tries:
     - uploading the old board;
     - two tabs;
     - offline then online;
     - forgot password;
     - sign out.

## 8. Safety rules for this work

- Ask before applying each migration to the real project. No new project, no billable action.
- Never request or handle the `service_role` key or any password in chat. The URL and publishable key are fetched through the connector into `.env.local`.
- Ask before pushing to a remote or deploying.
