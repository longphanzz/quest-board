# Supabase Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Quest Board's board data to Supabase (one board per account, email+password auth with password reset), while the app stays offline-first and syncs the whole board atomically with last-write-wins.

**Architecture:** The app keeps reading/writing its local Zustand store (now cached under `quest-board-cloud-v1` with `ownerId` + sync metadata). A pure, injectable sync engine pushes the whole board via the SQL function `save_board` (one transaction) and pulls via `load_board`. Normalized tables + RLS live in versioned migration files. Auth state lives in a small Zustand store fed by `supabase.auth.onAuthStateChange`; `App` gates on it.

**Tech Stack:** React 19, TypeScript 7, Vite 8, Zustand 5, `@supabase/supabase-js` v2, Vitest 5 + Testing Library, PostgreSQL 17 (Supabase).

**Spec:** `docs/superpowers/specs/2026-10-03-supabase-backend-design.md`

## Global Constraints

- Run `npm`/`npx` from **PowerShell**, never bash. Tests: `npx vitest run <path>`; full suite `npx vitest run`; types `npx tsc --noEmit`.
- Vitest keeps `pool: 'threads'` (already in `vite.config.ts`; do not overwrite it).
- UI copy is English. Exact strings in this plan are binding.
- Never use, request or commit the `service_role` key or any password. Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are used; `.env.local` is git-ignored.
- **Stop and ask the user** before applying any migration to project `nbrrjkwlqwdxojnnpfvp`. No new projects, no billable actions, no push/deploy.
- Game rules in `src/game/*` and `src/store/progress.ts` must not change.
- Sync timings: debounce `2000` ms; backoff `[5000, 10000, 20000, 40000, 60000]` ms, then 60000 repeated.
- Password minimum length: 8.
- Name limits: quest title 120, column name 30, label name 20 (from `src/store/board.ts`).
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. An imported or legacy board with a quest `labelIds` entry that points at a deleted label, a duplicated label id, or an over-long name. It must still save, and must not fail forever with ⚠️. `toCloudBoard` normalizes it (test in Task 2).
2. The user edits while a save is in flight. The board must stay dirty and be pushed again, never marked clean (test in Task 5).
3. The user edits while a pull is in flight. The local edit must not be overwritten by the downloaded board (test in Task 5).
4. A different account signs in on a device that still holds another account's cache. The old board must never be shown or pushed to the new account (test in Task 9).
5. The server returns a malformed board on a pull or a stale save. Local data stays untouched and the status is ⚠️ (test in Task 5).

---

## File map

| Path | Status | Responsibility |
|---|---|---|
| `src/cloud/client.ts` | create | Lazy Supabase client from env |
| `src/cloud/mapping.ts` | create | `CloudBoard` type, `toCloudBoard`, `fromCloudBoard` |
| `src/cloud/api.ts` | create | `SyncError`, `loadBoard`, `saveBoard` (RPC) |
| `src/cloud/syncEngine.ts` | create | Pure sync state machine |
| `src/cloud/useSyncStore.ts` | create | Sync status + retry hook for UI |
| `src/cloud/auth.ts` | create | `useAuthStore`, `initAuth`, `signUp`, `signIn`, `signOut`, `requestPasswordReset`, `updatePassword`, `authErrorMessage` |
| `src/cloud/firstSync.ts` | create | `readLegacyBoard`, `clearLegacyBoard`, `decideFirstSync` |
| `src/cloud/useCloudSync.ts` | create | Wires engine to stores, window events |
| `src/store/deviceSettings.ts` | create | Device-local settings (`quest-board-device-v1`) |
| `src/store/useAppStore.ts` | modify | Cloud cache key, `ownerId`, `sync`, new actions, no backup reminder |
| `src/store/persistence.ts` | modify | Export `pickSettings`; remove `shouldShowBackupReminder` |
| `src/store/backup.ts` | modify | Keep `markExported` call (unchanged API) |
| `src/components/AuthScreen.tsx` + `Auth.css` | create | Sign in / Sign up / Forgot password |
| `src/components/ResetPasswordScreen.tsx` | create | New password after recovery link |
| `src/components/FirstSyncPrompt.tsx` | create | First-sync decisions |
| `src/components/SyncStatus.tsx` | create | ☁️ ⏳ 📴 ⚠️ indicator |
| `src/components/CloudGate.tsx` | create | Chooses auth screen / first sync / board |
| `src/components/BackupBanner.tsx` | delete | Reminder removed |
| `src/components/PlayerBar.tsx`, `SettingsPanel.tsx`, `src/App.tsx` | modify | Status, sign-out, gating |
| `supabase/migrations/20261003000001_quest_board_schema.sql` | create | Tables, indexes, RLS, grants |
| `supabase/migrations/20261003000002_quest_board_functions.sql` | create | `qb_iso`, `qb_board`, `load_board`, `save_board` |
| `supabase/tests/rls_check.sql` | create | Rolled-back RLS + round-trip checks |
| `.env.example`, `.gitignore`, `src/vite-env.d.ts` | create/modify | Env config |

---

### Task 1: Supabase client and env config

**Files:**
- Modify: `package.json` (via npm), `.gitignore`, `src/vite-env.d.ts`
- Create: `.env.example`, `src/cloud/client.ts`, `src/cloud/client.test.ts`

**Interfaces:**
- Produces: `getSupabase(): SupabaseClient` (throws `Error('Supabase is not configured')` when env vars are missing); `isSupabaseConfigured(): boolean`.

- [ ] **Step 1: Install the dependency**

Run (PowerShell): `npm install @supabase/supabase-js@^2`
Expected: `added N packages`, `package.json` lists `@supabase/supabase-js` under dependencies.

- [ ] **Step 2: Write the failing test** — `src/cloud/client.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('getSupabase', () => {
  it('throws a clear error when env vars are missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    const { getSupabase, isSupabaseConfigured } = await import('./client');
    expect(isSupabaseConfigured()).toBe(false);
    expect(() => getSupabase()).toThrow('Supabase is not configured');
  });

  it('returns one shared client when configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
    const { getSupabase } = await import('./client');
    expect(getSupabase()).toBe(getSupabase());
  });
});
```

- [ ] **Step 3: Run it — expect FAIL**

Run: `npx vitest run src/cloud/client.test.ts`
Expected: FAIL, `Failed to resolve import "./client"`.

- [ ] **Step 4: Implement** — `src/cloud/client.ts`

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

const env = () => ({
  url: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined,
});

export function isSupabaseConfigured(): boolean {
  const { url, key } = env();
  return Boolean(url && key);
}

/** Created lazily so tests and unconfigured builds never touch the network. */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const { url, key } = env();
  if (!url || !key) throw new Error('Supabase is not configured');
  client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}
```

Append to `src/vite-env.d.ts`:

```ts
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}
```

Create `.env.example`:

```
# Copy to .env.local and fill in (Supabase dashboard → Project Settings → API).
# Only the URL and the publishable (anon) key belong here. Never the service_role key.
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
```

Append to `.gitignore`:

```
.env*.local
```

- [ ] **Step 5: Run it — expect PASS**

Run: `npx vitest run src/cloud/client.test.ts` → Expected: 2 passed. Then `npx tsc --noEmit` → Expected: no output.

- [ ] **Step 6: Commit**

```
git add package.json package-lock.json .gitignore .env.example src/vite-env.d.ts src/cloud/client.ts src/cloud/client.test.ts
git commit -m "feat(cloud): add lazy Supabase client and env config"
```

---

### Task 2: CloudBoard mapping

**Files:**
- Create: `src/cloud/mapping.ts`, `src/cloud/mapping.test.ts`
- Modify: `src/store/persistence.ts` (export `pickSettings`)

**Interfaces:**
- Consumes: `validateData(raw, now)`, `ImportResult` from `src/store/persistence.ts`; limits `MAX_TITLE_LENGTH`, `MAX_COLUMN_NAME_LENGTH`, `MAX_LABEL_NAME_LENGTH` from `src/store/board.ts`.
- Produces:
  - `interface CloudBoard { columns: Column[]; quests: Record<string, Quest>; labels: Label[]; player: Player; avatar: { frames: AvatarFrames } }`
  - `toCloudBoard(data: AppData): CloudBoard`
  - `fromCloudBoard(board: unknown, settings: Settings): ImportResult`
  - `export function pickSettings(s: Record<string, unknown>): Partial<Settings>` (now exported from persistence)

- [ ] **Step 1: Write the failing test** — `src/cloud/mapping.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { fromCloudBoard, toCloudBoard } from './mapping';
import { T0, columnId, emptyBoard, withQuest } from '../test/fixtures';
import type { AppData } from '../types';

function richBoard(): AppData {
  let data = emptyBoard(T0);
  data = { ...data, labels: [{ id: 'l1', name: 'School', color: '#41a6f6' }, { id: 'l2', name: 'Home', color: '#ef7d57' }] };
  data = withQuest(data, 'To Do', { id: 'q1', title: 'Ôn thi', labelIds: ['l2', 'l1'], deadline: '2026-10-05' });
  data = withQuest(data, 'Done', {
    id: 'q2', difficulty: 'boss',
    completion: { at: '2026-09-30T08:15:00.000Z', xp: 150, difficulty: 'boss', early: true },
  });
  data.player = {
    ...data.player, totalXp: 150, streak: 2, lastActiveDate: '2026-09-30', shields: 1,
    stats: { completed: 1, bossesSlain: 1, earlyFinishes: 1 },
    unlockedAchievements: { 'first-blood': '2026-09-30T08:15:00.000Z' },
  };
  data.avatar = { frames: { ...data.avatar.frames, happy: Array(1024).fill('#ffcd75') } };
  return data;
}

describe('toCloudBoard', () => {
  it('drops settings and schemaVersion', () => {
    const cloud = toCloudBoard(richBoard()) as unknown as Record<string, unknown>;
    expect(Object.keys(cloud).sort()).toEqual(['avatar', 'columns', 'labels', 'player', 'quests']);
  });

  it('removes label ids that point at missing labels and duplicates', () => {
    const data = richBoard();
    data.quests.q1 = { ...data.quests.q1, labelIds: ['l1', 'gone', 'l1'] };
    expect(toCloudBoard(data).quests.q1.labelIds).toEqual(['l1']);
  });

  it('clamps over-long or empty names so the database accepts them', () => {
    const data = richBoard();
    data.quests.q1 = { ...data.quests.q1, title: 'x'.repeat(200) };
    data.columns[0] = { ...data.columns[0], name: '   ' };
    data.labels[0] = { ...data.labels[0], name: 'y'.repeat(50) };
    const cloud = toCloudBoard(data);
    expect(cloud.quests.q1.title).toHaveLength(120);
    expect(cloud.columns[0].name).toBe('Column');
    expect(cloud.labels[0].name).toHaveLength(20);
  });
});

describe('fromCloudBoard', () => {
  it('round-trips a board exactly, taking settings from the device', () => {
    const data = richBoard();
    const settings = { ...data.settings, theme: 'light' as const };
    const result = fromCloudBoard(JSON.parse(JSON.stringify(toCloudBoard(data))), settings);
    expect(result).toEqual({ ok: true, data: { ...data, settings } });
  });

  it('rejects malformed boards', () => {
    expect(fromCloudBoard(null, emptyBoard().settings).ok).toBe(false);
    expect(fromCloudBoard({ columns: 'nope' }, emptyBoard().settings).ok).toBe(false);
  });

  it('keeps the column order and quest order', () => {
    const data = withQuest(richBoard(), 'To Do', { id: 'q3' });
    const back = fromCloudBoard(toCloudBoard(data), data.settings);
    expect(back.ok && back.data.columns.find((c) => c.id === columnId(data, 'To Do'))?.questIds).toEqual(['q1', 'q3']);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/cloud/mapping.test.ts`
Expected: FAIL, `Failed to resolve import "./mapping"`.

- [ ] **Step 3: Implement**

In `src/store/persistence.ts` change `function pickSettings(` to `export function pickSettings(`.

Create `src/cloud/mapping.ts`:

```ts
import type { AppData, AvatarFrames, Column, Label, Player, Quest, Settings } from '../types';
import { validateData, type ImportResult } from '../store/persistence';
import { MAX_COLUMN_NAME_LENGTH, MAX_LABEL_NAME_LENGTH, MAX_TITLE_LENGTH } from '../store/board';

/** The synced part of AppData; settings are per device and never leave it. */
export interface CloudBoard {
  columns: Column[];
  quests: Record<string, Quest>;
  labels: Label[];
  player: Player;
  avatar: { frames: AvatarFrames };
}

const fit = (text: string, max: number, fallback: string) => text.trim().slice(0, max) || fallback;

/** Normalizes data the database would reject (old imports, dangling label ids) instead of failing every sync. */
export function toCloudBoard(data: AppData): CloudBoard {
  const labels = data.labels.map((l) => ({ ...l, name: fit(l.name, MAX_LABEL_NAME_LENGTH, 'Label') }));
  const labelIds = new Set(labels.map((l) => l.id));
  const quests = Object.fromEntries(
    Object.entries(data.quests).map(([id, q]) => [
      id,
      {
        ...q,
        title: fit(q.title, MAX_TITLE_LENGTH, 'Untitled quest'),
        labelIds: [...new Set(q.labelIds)].filter((l) => labelIds.has(l)),
      },
    ]),
  );
  return {
    columns: data.columns.map((c) => ({ ...c, name: fit(c.name, MAX_COLUMN_NAME_LENGTH, 'Column') })),
    quests,
    labels,
    player: data.player,
    avatar: { frames: data.avatar.frames },
  };
}

export function fromCloudBoard(board: unknown, settings: Settings): ImportResult {
  if (typeof board !== 'object' || board === null || Array.isArray(board)) {
    return { ok: false, error: 'The board from the server is damaged.' };
  }
  const result = validateData({ ...board, schemaVersion: 1, settings });
  return result.ok ? { ok: true, data: { ...result.data, settings } } : result;
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/cloud/mapping.test.ts src/store/persistence.test.ts`
Expected: all passed.

- [ ] **Step 5: Commit**

```
git add src/cloud/mapping.ts src/cloud/mapping.test.ts src/store/persistence.ts
git commit -m "feat(cloud): map AppData to and from CloudBoard"
```

---

### Task 3: RPC API wrapper

**Files:**
- Create: `src/cloud/api.ts`, `src/cloud/api.test.ts`

**Interfaces:**
- Consumes: `getSupabase()` (Task 1), `CloudBoard` (Task 2).
- Produces:
  - `class SyncError extends Error { kind: 'network' | 'server' }`
  - `interface LoadResult { revision: number; clientUpdatedAt: string; board: unknown }`
  - `type SaveResult = { status: 'saved'; revision: number } | { status: 'stale'; revision: number; clientUpdatedAt: string; board: unknown }`
  - `loadBoard(): Promise<LoadResult | null>`
  - `saveBoard(board: CloudBoard, baseRevision: number, clientUpdatedAt: string): Promise<SaveResult>`

- [ ] **Step 1: Write the failing test** — `src/cloud/api.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('./client', () => ({ getSupabase: () => ({ rpc }) }));

const { loadBoard, saveBoard, SyncError } = await import('./api');

afterEach(() => {
  rpc.mockReset();
  vi.unstubAllGlobals();
});

describe('api', () => {
  it('calls load_board and returns its data', async () => {
    rpc.mockResolvedValue({ data: { revision: 3, clientUpdatedAt: 'x', board: {} }, error: null });
    await expect(loadBoard()).resolves.toEqual({ revision: 3, clientUpdatedAt: 'x', board: {} });
    expect(rpc).toHaveBeenCalledWith('load_board');
  });

  it('passes save_board arguments by name', async () => {
    rpc.mockResolvedValue({ data: { status: 'saved', revision: 4 }, error: null });
    const board = { columns: [] } as never;
    await saveBoard(board, 3, '2026-10-03T00:00:00.000Z');
    expect(rpc).toHaveBeenCalledWith('save_board', {
      p_board: board, p_base_revision: 3, p_client_updated_at: '2026-10-03T00:00:00.000Z',
    });
  });

  it('classifies fetch failures as network errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' } });
    await expect(loadBoard()).rejects.toMatchObject({ kind: 'network' });
    rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(loadBoard()).rejects.toBeInstanceOf(SyncError);
  });

  it('classifies database errors as server errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'new row violates check constraint', code: '23514' } });
    await expect(saveBoard({} as never, 0, 'x')).rejects.toMatchObject({ kind: 'server' });
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/cloud/api.test.ts` → Expected: FAIL, cannot resolve `./api`.

- [ ] **Step 3: Implement** — `src/cloud/api.ts`

```ts
import { getSupabase } from './client';
import type { CloudBoard } from './mapping';

export class SyncError extends Error {
  constructor(public kind: 'network' | 'server', message: string) {
    super(message);
    this.name = 'SyncError';
  }
}

export interface LoadResult { revision: number; clientUpdatedAt: string; board: unknown }
export type SaveResult =
  | { status: 'saved'; revision: number }
  | { status: 'stale'; revision: number; clientUpdatedAt: string; board: unknown };

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const looksLikeNetwork = (message: string) => /fetch|network|timeout|abort/i.test(message);

function toSyncError(message: string): SyncError {
  return new SyncError(offline() || looksLikeNetwork(message) ? 'network' : 'server', message);
}

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  let response: { data: unknown; error: { message: string } | null };
  try {
    response = args ? await getSupabase().rpc(fn, args) : await getSupabase().rpc(fn);
  } catch (e) {
    throw toSyncError(e instanceof Error ? e.message : String(e));
  }
  if (response.error) throw toSyncError(response.error.message);
  return response.data as T;
}

export const loadBoard = () => call<LoadResult | null>('load_board');

export const saveBoard = (board: CloudBoard, baseRevision: number, clientUpdatedAt: string) =>
  call<SaveResult>('save_board', {
    p_board: board,
    p_base_revision: baseRevision,
    p_client_updated_at: clientUpdatedAt,
  });
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/cloud/api.test.ts` → Expected: 4 passed.

- [ ] **Step 5: Commit**

```
git add src/cloud/api.ts src/cloud/api.test.ts
git commit -m "feat(cloud): add load_board/save_board RPC wrapper"
```

---

### Task 4: Device settings and cloud-cache store

**Files:**
- Create: `src/store/deviceSettings.ts`, `src/store/deviceSettings.test.ts`
- Modify: `src/store/useAppStore.ts`, `src/store/stores.test.ts`, `src/store/persistence.ts`, `src/store/persistence.test.ts`, `src/components/EffectsLayer.test.tsx`, `src/App.tsx`
- Delete: `src/components/BackupBanner.tsx`

**Interfaces:**
- Consumes: `pickSettings` (Task 2), `createSettings`, `createDefaultData`.
- Produces:
  - `DEVICE_KEY = 'quest-board-device-v1'`, `LEGACY_KEY = 'quest-board-v1'`
  - `loadDeviceSettings(now?: Date): Settings`, `saveDeviceSettings(s: Settings): void`
  - In `useAppStore.ts`:
    - `STORAGE_KEY = 'quest-board-cloud-v1'`
    - `interface SyncMeta { dirty: boolean; baseRevision: number; localUpdatedAt: string | null }`
    - `INITIAL_SYNC: SyncMeta = { dirty: false, baseRevision: 0, localUpdatedAt: null }`
  - New `AppState` fields:
    - `ownerId: string | null`
    - `sync: SyncMeta`
    - `beginSession(ownerId: string, data: AppData, sync: SyncMeta): void`
    - `adoptServerBoard(data: AppData, revision: number): void`
    - `markSaved(revision: number, sentUpdatedAt: string): void`
    - `clearLocalBoard(): void`
  - Removed: `snoozeBackup`, `shouldShowBackupReminder`, `BackupBanner`.

- [ ] **Step 1: Write the failing tests**

`src/store/deviceSettings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEVICE_KEY, LEGACY_KEY, loadDeviceSettings, saveDeviceSettings } from './deviceSettings';
import { createDefaultData } from './defaults';
import { T0 } from '../test/fixtures';

describe('device settings', () => {
  it('falls back to defaults', () => {
    expect(loadDeviceSettings(T0)).toEqual(createDefaultData(T0).settings);
  });

  it('saves and loads', () => {
    saveDeviceSettings({ ...createDefaultData(T0).settings, theme: 'light', sfxVolume: 0.2 });
    expect(loadDeviceSettings(T0)).toMatchObject({ theme: 'light', sfxVolume: 0.2 });
  });

  it('migrates settings from the legacy local board once', () => {
    const legacy = createDefaultData(T0);
    legacy.settings.musicOn = true;
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ state: { data: legacy }, version: 1 }));
    expect(loadDeviceSettings(T0).musicOn).toBe(true);
  });

  it('ignores garbage', () => {
    localStorage.setItem(DEVICE_KEY, '{nope');
    expect(loadDeviceSettings(T0).theme).toBe('dark');
  });
});
```

Append to `src/store/stores.test.ts`, inside a new `describe('cloud cache', ...)`. Also change the `beforeEach` to reset `ownerId` and `sync`:

```ts
// in beforeEach, replace the useAppStore.setState line with:
useAppStore.setState({ data: createDefaultData(), ownerId: null, sync: { ...INITIAL_SYNC } });
// and import INITIAL_SYNC and DEVICE_KEY:
// import { CORRUPT_KEY, INITIAL_SYNC, STORAGE_KEY, useAppStore } from './useAppStore';
// import { DEVICE_KEY } from './deviceSettings';

describe('cloud cache', () => {
  it('marks the board dirty on board changes but not on settings changes', () => {
    app().updateSettings({ theme: 'light' });
    expect(app().sync.dirty).toBe(false);
    expect(localStorage.getItem(DEVICE_KEY)).toContain('light');
    app().addColumn('Later');
    expect(app().sync.dirty).toBe(true);
    expect(app().sync.localUpdatedAt).not.toBeNull();
  });

  it('does not mark dirty when an action changes nothing', () => {
    app().addQuest(app().data.columns[0].id, { title: '   ' });
    expect(app().sync.dirty).toBe(false);
  });

  it('markSaved keeps the board dirty when it changed during the save', () => {
    app().addColumn('A');
    const sent = app().sync.localUpdatedAt!;
    app().markSaved(5, sent);
    expect(app().sync).toEqual({ dirty: false, baseRevision: 5, localUpdatedAt: sent });
    app().addColumn('B');
    app().markSaved(6, sent);
    expect(app().sync.dirty).toBe(true);
    expect(app().sync.baseRevision).toBe(6);
  });

  it('adoptServerBoard replaces data without effects and keeps device settings', () => {
    app().updateSettings({ theme: 'light' });
    const server = createDefaultData();
    server.player.totalXp = 999;
    app().adoptServerBoard({ ...server, settings: app().data.settings }, 9);
    expect(app().data.player.totalXp).toBe(999);
    expect(app().data.settings.theme).toBe('light');
    expect(app().sync).toEqual({ dirty: false, baseRevision: 9, localUpdatedAt: null });
    expect(fx().items).toHaveLength(0);
  });

  it('clearLocalBoard wipes the cache but keeps device settings', () => {
    app().updateSettings({ theme: 'light' });
    app().beginSession('user-1', createDefaultData(), { dirty: true, baseRevision: 0, localUpdatedAt: 'x' });
    app().clearLocalBoard();
    expect(app().ownerId).toBeNull();
    expect(app().sync).toEqual(INITIAL_SYNC);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(app().data.settings.theme).toBe('light');
  });

  it('restores ownerId and sync from the cache on rehydrate', async () => {
    app().beginSession('user-1', createDefaultData(), { dirty: true, baseRevision: 2, localUpdatedAt: 'x' });
    useAppStore.setState({ ownerId: null, sync: { ...INITIAL_SYNC } });
    await useAppStore.persist.rehydrate();
    expect(app().ownerId).toBe('user-1');
    expect(app().sync).toEqual({ dirty: true, baseRevision: 2, localUpdatedAt: 'x' });
  });

  it('import keeps device settings and marks the board dirty', () => {
    app().updateSettings({ theme: 'light' });
    const backup = createDefaultData();
    backup.settings.theme = 'dark';
    app().replaceData(backup);
    expect(app().data.settings.theme).toBe('light');
    expect(app().sync.dirty).toBe(true);
  });
});
```

- [ ] **Step 2: Run them — expect FAIL**

Run: `npx vitest run src/store/deviceSettings.test.ts src/store/stores.test.ts`
Expected: FAIL. `deviceSettings` cannot be resolved; `INITIAL_SYNC` is undefined.

- [ ] **Step 3: Implement**

`src/store/deviceSettings.ts`:

```ts
import type { Settings } from '../types';
import { createSettings } from './defaults';
import { pickSettings } from './persistence';

export const DEVICE_KEY = 'quest-board-device-v1';
/** The pre-cloud local board; only read for migration and the first-sync prompt. */
export const LEGACY_KEY = 'quest-board-v1';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loadDeviceSettings(now: Date = new Date()): Settings {
  const own = readJson(DEVICE_KEY);
  if (isObj(own)) return { ...createSettings(now), ...pickSettings(own) };
  const legacy = readJson(LEGACY_KEY);
  const legacySettings = isObj(legacy) && isObj(legacy.state) && isObj(legacy.state.data) ? legacy.state.data.settings : null;
  return { ...createSettings(now), ...(isObj(legacySettings) ? pickSettings(legacySettings) : {}) };
}

export function saveDeviceSettings(settings: Settings): void {
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(settings));
  } catch {
    /* settings are a convenience; ignore quota errors */
  }
}
```

Modify `src/store/useAppStore.ts`:

1. Change the key and add imports and types:

```ts
import { loadDeviceSettings, saveDeviceSettings } from './deviceSettings';

export const STORAGE_KEY = 'quest-board-cloud-v1';

export interface SyncMeta { dirty: boolean; baseRevision: number; localUpdatedAt: string | null }
export const INITIAL_SYNC: SyncMeta = { dirty: false, baseRevision: 0, localUpdatedAt: null };

const isSyncMeta = (v: unknown): v is SyncMeta => {
  const s = v as SyncMeta | null;
  return typeof s === 'object' && s !== null && typeof s.dirty === 'boolean' &&
    typeof s.baseRevision === 'number' && s.baseRevision >= 0 &&
    (s.localUpdatedAt === null || typeof s.localUpdatedAt === 'string');
};

const freshData = (): AppData => ({ ...createDefaultData(), settings: loadDeviceSettings() });
```

2. In `AppState`:
   - remove `snoozeBackup`;
   - add:

```ts
  ownerId: string | null;
  sync: SyncMeta;
  beginSession: (ownerId: string, data: AppData, sync: SyncMeta) => void;
  adoptServerBoard: (data: AppData, revision: number) => void;
  markSaved: (revision: number, sentUpdatedAt: string) => void;
  clearLocalBoard: () => void;
```

3. Replace the `run` helper so that a real change marks the board dirty:

```ts
      const run = (fn: (data: AppData, now: Date) => Result): Result => {
        const now = new Date();
        const before = get().data;
        const result = fn(before, now);
        const effects = useEffectsStore.getState();
        if (result.error) {
          effects.toast(result.error, 'error');
          return result;
        }
        if (result.data !== before) {
          set({ data: result.data, sync: { ...get().sync, dirty: true, localUpdatedAt: now.toISOString() } });
        }
        effects.push(result.events);
        return result;
      };
```

4. Update the initial state and actions. `data: createDefaultData()` becomes `data: freshData()`. Add `ownerId: null` and `sync: { ...INITIAL_SYNC }`. Then:

```ts
        updateSettings: (patch) => {
          const settings = { ...get().data.settings, ...patch };
          saveDeviceSettings(settings);
          set((s) => ({ data: { ...s.data, settings } }));
        },
        markExported: () => get().updateSettings({ lastExportAt: new Date().toISOString() }),
        replaceData: (data) => void run((current, now) => finalize({ ...data, settings: current.settings }, [], now)),
        beginSession: (ownerId, data, sync) => set({ ownerId, data: { ...data, settings: get().data.settings }, sync }),
        adoptServerBoard: (data, revision) =>
          set({ data: { ...data, settings: get().data.settings }, sync: { dirty: false, baseRevision: revision, localUpdatedAt: null } }),
        markSaved: (revision, sentUpdatedAt) =>
          set((s) => ({
            sync: { dirty: s.sync.localUpdatedAt !== sentUpdatedAt, baseRevision: revision, localUpdatedAt: s.sync.localUpdatedAt },
          })),
        clearLocalBoard: () => {
          set({ ownerId: null, sync: { ...INITIAL_SYNC }, data: { ...createDefaultData(), settings: get().data.settings } });
          useAppStore.persist.clearStorage();
        },
```

   Delete the `snoozeBackup` line.

5. In the persist options:
   - `partialize: (state) => ({ data: state.data, ownerId: state.ownerId, sync: state.sync })`
   - replace `merge` with:

```ts
      merge: (persisted, current) => {
        const p = persisted as { data?: unknown; ownerId?: unknown; sync?: unknown } | undefined;
        if (p?.data === undefined) return current;
        const result = validateData(p.data);
        if (!result.ok) {
          keepCorruptCopy(JSON.stringify(p.data));
          return current;
        }
        return {
          ...current,
          data: { ...result.data, settings: loadDeviceSettings() },
          ownerId: typeof p.ownerId === 'string' ? p.ownerId : null,
          sync: isSyncMeta(p.sync) ? p.sync : { ...INITIAL_SYNC },
        };
      },
```

Modify `src/store/persistence.ts`: delete `shouldShowBackupReminder` and the now-unused `DAY_MS` constant.
Modify `src/store/persistence.test.ts`: delete the `describe('shouldShowBackupReminder', …)` block and its import.
Delete `src/components/BackupBanner.tsx`, and the `describe('BackupBanner', …)` block and its import in `src/components/EffectsLayer.test.tsx`.
In `src/App.tsx` remove the `BackupBanner` import and `<BackupBanner />`.

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run src/store src/components` → Expected: all passed.
Run: `npx tsc --noEmit` → Expected: no output. If an unused `userEvent` import remains in `EffectsLayer.test.tsx`, remove it.

- [ ] **Step 5: Commit**

```
git add -A src/store src/components src/App.tsx
git commit -m "feat(store): device settings, cloud cache with sync metadata; drop backup reminder"
```

---

### Task 5: Sync engine

**Files:**
- Create: `src/cloud/syncEngine.ts`, `src/cloud/syncEngine.test.ts`

**Interfaces:**
- Consumes: `LoadResult`, `SaveResult`, `SyncError` (Task 3); `CloudBoard`, `toCloudBoard` (Task 2); `SyncMeta` (Task 4).
- Produces:

```ts
export type SyncStatus = 'synced' | 'saving' | 'offline' | 'error';
export const DEBOUNCE_MS = 2000;
export const BACKOFF_MS = [5000, 10000, 20000, 40000, 60000];
export interface SyncDeps {
  load: () => Promise<LoadResult | null>;
  save: (board: CloudBoard, baseRevision: number, clientUpdatedAt: string) => Promise<SaveResult>;
  getLocal: () => { data: AppData; sync: SyncMeta };
  adopt: (board: unknown, revision: number) => boolean; // false = malformed, nothing changed
  markSaved: (revision: number, sentUpdatedAt: string) => void;
  setStatus: (status: SyncStatus) => void;
  toast: (message: string) => void;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
}
export interface SyncEngine { start(): Promise<void>; sync(): Promise<void>; notifyChange(): void; retryNow(): Promise<void>; stop(): void }
export function createSyncEngine(deps: SyncDeps): SyncEngine;
```

- [ ] **Step 1: Write the failing test** — `src/cloud/syncEngine.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKOFF_MS, DEBOUNCE_MS, createSyncEngine, type SyncDeps, type SyncStatus } from './syncEngine';
import { SyncError } from './api';
import type { SyncMeta } from '../store/useAppStore';
import { createDefaultData } from '../store/defaults';

function setup(sync: Partial<SyncMeta> = {}) {
  const state = { data: createDefaultData(), sync: { dirty: false, baseRevision: 0, localUpdatedAt: null, ...sync } as SyncMeta };
  const statuses: SyncStatus[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const deps: SyncDeps = {
    load: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue({ status: 'saved', revision: 1 }),
    getLocal: () => state,
    adopt: vi.fn((_board: unknown, revision: number) => {
      state.sync = { dirty: false, baseRevision: revision, localUpdatedAt: null };
      return true;
    }),
    markSaved: vi.fn((revision: number, sent: string) => {
      state.sync = { ...state.sync, dirty: state.sync.localUpdatedAt !== sent, baseRevision: revision };
    }),
    setStatus: (s) => statuses.push(s),
    toast: vi.fn(),
    setTimer: (fn, ms) => timers.push({ fn, ms }),
    clearTimer: () => timers.splice(0),
  };
  const edit = (at: string) => { state.sync = { ...state.sync, dirty: true, localUpdatedAt: at }; };
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const fire = async () => { const t = timers.splice(0); for (const x of t) x.fn(); await flush(); };
  return { state, statuses, timers, deps, edit, fire, engine: createSyncEngine(deps) };
}

describe('sync engine', () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => { s = setup(); });

  it('debounces changes and pushes the whole board once', async () => {
    s.edit('t1'); s.engine.notifyChange(); s.engine.notifyChange();
    expect(s.timers).toHaveLength(1);
    expect(s.timers[0].ms).toBe(DEBOUNCE_MS);
    await s.fire();
    expect(s.deps.save).toHaveBeenCalledTimes(1);
    expect(s.deps.save).toHaveBeenCalledWith(expect.objectContaining({ columns: expect.any(Array) }), 0, 't1');
    expect(s.state.sync).toMatchObject({ dirty: false, baseRevision: 1 });
    expect(s.statuses.at(-1)).toBe('synced');
  });

  it('stays dirty and pushes again when edited during an in-flight save', async () => {
    let release!: (v: unknown) => void;
    (s.deps.save as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Promise((r) => { release = r; }));
    s.edit('t1');
    const pushing = s.engine.sync();
    s.edit('t2');
    release({ status: 'saved', revision: 1 });
    await pushing;
    expect(s.state.sync.dirty).toBe(true);
    expect(s.timers.at(-1)?.ms).toBe(DEBOUNCE_MS);
    await s.fire();
    expect(s.deps.save).toHaveBeenLastCalledWith(expect.anything(), 1, 't2');
    expect(s.state.sync.dirty).toBe(false);
  });

  it('adopts the server board on a stale save and tells the user', async () => {
    (s.deps.save as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ status: 'stale', revision: 7, clientUpdatedAt: 'x', board: { b: 1 } });
    s.edit('t1');
    await s.engine.sync();
    expect(s.deps.adopt).toHaveBeenCalledWith({ b: 1 }, 7);
    expect(s.deps.toast).toHaveBeenCalledWith('Board updated from another device');
    expect(s.statuses.at(-1)).toBe('synced');
  });

  it('shows an error and keeps local data when the stale board is malformed', async () => {
    (s.deps.save as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ status: 'stale', revision: 7, clientUpdatedAt: 'x', board: null });
    (s.deps.adopt as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    s.edit('t1');
    await s.engine.sync();
    expect(s.statuses.at(-1)).toBe('error');
    expect(s.state.sync.dirty).toBe(true);
  });

  it('goes offline on network errors and backs off 5s, 10s, ... capped at 60s', async () => {
    (s.deps.save as ReturnType<typeof vi.fn>).mockRejectedValue(new SyncError('network', 'Failed to fetch'));
    s.edit('t1');
    await s.engine.sync();
    expect(s.statuses.at(-1)).toBe('offline');
    const delays: number[] = [];
    for (let i = 0; i < 7; i++) { delays.push(s.timers[0].ms); await s.fire(); }
    expect(delays).toEqual([...BACKOFF_MS, 60000, 60000]);
  });

  it('reports server errors as error and retries immediately on retryNow', async () => {
    (s.deps.save as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new SyncError('server', 'boom'));
    s.edit('t1');
    await s.engine.sync();
    expect(s.statuses.at(-1)).toBe('error');
    await s.engine.retryNow();
    expect(s.state.sync.dirty).toBe(false);
    expect(s.statuses.at(-1)).toBe('synced');
  });

  it('pull adopts a newer server board when nothing is dirty', async () => {
    (s.deps.load as ReturnType<typeof vi.fn>).mockResolvedValue({ revision: 4, clientUpdatedAt: 'x', board: { b: 2 } });
    await s.engine.sync();
    expect(s.deps.adopt).toHaveBeenCalledWith({ b: 2 }, 4);
  });

  it('pull ignores a server board that is not newer', async () => {
    s = setup({ baseRevision: 4 });
    (s.deps.load as ReturnType<typeof vi.fn>).mockResolvedValue({ revision: 4, clientUpdatedAt: 'x', board: {} });
    await s.engine.sync();
    expect(s.deps.adopt).not.toHaveBeenCalled();
    expect(s.statuses.at(-1)).toBe('synced');
  });

  it('never overwrites an edit made while a pull was in flight', async () => {
    let release!: (v: unknown) => void;
    (s.deps.load as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Promise((r) => { release = r; }));
    const pulling = s.engine.sync();
    s.edit('t9');
    release({ revision: 4, clientUpdatedAt: 'x', board: {} });
    await pulling;
    expect(s.deps.adopt).not.toHaveBeenCalled();
    expect(s.deps.save).toHaveBeenCalledWith(expect.anything(), 0, 't9');
  });

  it('pushes instead of pulling when dirty', async () => {
    s.edit('t1');
    await s.engine.start();
    expect(s.deps.load).not.toHaveBeenCalled();
    expect(s.deps.save).toHaveBeenCalled();
  });

  it('stop cancels timers and ignores later changes', () => {
    s.edit('t1'); s.engine.notifyChange();
    s.engine.stop();
    expect(s.timers).toHaveLength(0);
    s.engine.notifyChange();
    expect(s.timers).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/cloud/syncEngine.test.ts` → Expected: FAIL, cannot resolve `./syncEngine`.

- [ ] **Step 3: Implement** — `src/cloud/syncEngine.ts`

```ts
import type { AppData } from '../types';
import type { SyncMeta } from '../store/useAppStore';
import { SyncError, type LoadResult, type SaveResult } from './api';
import { toCloudBoard, type CloudBoard } from './mapping';

export type SyncStatus = 'synced' | 'saving' | 'offline' | 'error';
export const DEBOUNCE_MS = 2000;
export const BACKOFF_MS = [5000, 10000, 20000, 40000, 60000];

export interface SyncDeps {
  load: () => Promise<LoadResult | null>;
  save: (board: CloudBoard, baseRevision: number, clientUpdatedAt: string) => Promise<SaveResult>;
  getLocal: () => { data: AppData; sync: SyncMeta };
  adopt: (board: unknown, revision: number) => boolean;
  markSaved: (revision: number, sentUpdatedAt: string) => void;
  setStatus: (status: SyncStatus) => void;
  toast: (message: string) => void;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
}

export interface SyncEngine {
  start(): Promise<void>;
  sync(): Promise<void>;
  notifyChange(): void;
  retryNow(): Promise<void>;
  stop(): void;
}

export function createSyncEngine(deps: SyncDeps): SyncEngine {
  let timer: unknown = null;
  let attempt = 0;
  let busy = false;
  let again = false;
  let stopped = false;

  const schedule = (ms: number) => {
    if (stopped) return;
    if (timer !== null) deps.clearTimer(timer);
    timer = deps.setTimer(() => {
      timer = null;
      void sync();
    }, ms);
  };

  const fail = (error: unknown) => {
    deps.setStatus(error instanceof SyncError && error.kind === 'network' ? 'offline' : 'error');
    schedule(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]);
    attempt += 1;
  };

  const settle = () => {
    if (deps.getLocal().sync.dirty) schedule(DEBOUNCE_MS);
    else deps.setStatus('synced');
  };

  async function push(): Promise<void> {
    const { data, sync: meta } = deps.getLocal();
    const sentAt = meta.localUpdatedAt ?? new Date(0).toISOString();
    deps.setStatus('saving');
    const result = await deps.save(toCloudBoard(data), meta.baseRevision, sentAt);
    attempt = 0;
    if (result.status === 'saved') {
      deps.markSaved(result.revision, sentAt);
    } else {
      if (!deps.adopt(result.board, result.revision)) {
        deps.setStatus('error');
        return;
      }
      deps.toast('Board updated from another device');
    }
    settle();
  }

  async function pull(): Promise<void> {
    const remote = await deps.load();
    attempt = 0;
    const local = deps.getLocal().sync;
    if (local.dirty) return push(); // edited while the pull was in flight
    if (remote && remote.revision > local.baseRevision && !deps.adopt(remote.board, remote.revision)) {
      deps.setStatus('error');
      return;
    }
    deps.setStatus('synced');
  }

  async function sync(): Promise<void> {
    if (stopped) return;
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    try {
      if (deps.getLocal().sync.dirty) await push();
      else await pull();
    } catch (error) {
      fail(error);
    } finally {
      busy = false;
      if (again) {
        again = false;
        schedule(DEBOUNCE_MS);
      }
    }
  }

  return {
    start: () => sync(),
    sync,
    notifyChange: () => {
      if (!stopped && deps.getLocal().sync.dirty) schedule(DEBOUNCE_MS);
    },
    retryNow: () => {
      attempt = 0;
      return sync();
    },
    stop: () => {
      stopped = true;
      if (timer !== null) deps.clearTimer(timer);
      timer = null;
    },
  };
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/cloud/syncEngine.test.ts` → Expected: 11 passed.
If the backoff test sees an extra `DEBOUNCE_MS` timer, check that `fail` runs before `finally` and that `again` is false. Fix the code, not the test.

- [ ] **Step 5: Commit**

```
git add src/cloud/syncEngine.ts src/cloud/syncEngine.test.ts
git commit -m "feat(cloud): add offline-first sync engine with last-write-wins"
```

---

### Task 6: Auth module

**Files:**
- Create: `src/cloud/auth.ts`, `src/cloud/auth.test.ts`

**Interfaces:**
- Consumes: `getSupabase()`; `useAppStore` (`clearLocalBoard`).
- Produces:

```ts
export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';
export interface AuthUser { id: string; email: string }
export const useAuthStore: UseBoundStore<StoreApi<{ status: AuthStatus; user: AuthUser | null; recovery: boolean }>>;
export const MIN_PASSWORD = 8;
export function authErrorMessage(error: unknown): string;
export function initAuth(): () => void;               // subscribes; returns unsubscribe
export async function signUp(email: string, password: string): Promise<string | null>;   // error message or null
export async function signIn(email: string, password: string): Promise<string | null>;
export async function requestPasswordReset(email: string): Promise<string | null>;
export async function updatePassword(password: string): Promise<string | null>;
export async function signOut(): Promise<void>;        // local scope + clearLocalBoard
```

- [ ] **Step 1: Write the failing test** — `src/cloud/auth.test.ts`

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

const auth = {
  signUp: vi.fn(), signInWithPassword: vi.fn(), resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(), signOut: vi.fn(), onAuthStateChange: vi.fn(),
};
vi.mock('./client', () => ({ getSupabase: () => ({ auth }) }));

const mod = await import('./auth');
const { useAppStore, INITIAL_SYNC } = await import('../store/useAppStore');

afterEach(() => Object.values(auth).forEach((f) => f.mockReset()));

describe('authErrorMessage', () => {
  it.each([
    [{ code: 'invalid_credentials' }, 'Wrong email or password'],
    [{ code: 'email_not_confirmed' }, 'Email not confirmed yet'],
    [{ code: 'user_already_exists' }, 'That email already has an account'],
    [{ code: 'weak_password' }, 'Password is too weak'],
    [{ name: 'AuthRetryableFetchError' }, 'No connection'],
    [new TypeError('Failed to fetch'), 'No connection'],
    [{ code: 'something_else' }, 'Something went wrong — try again'],
  ])('maps %o', (error, message) => {
    expect(mod.authErrorMessage(error)).toBe(message);
  });
});

describe('auth actions', () => {
  it('signs up with a redirect back to the app', async () => {
    auth.signUp.mockResolvedValue({ data: {}, error: null });
    await expect(mod.signUp('a@b.co', 'password1')).resolves.toBeNull();
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'a@b.co', password: 'password1', options: { emailRedirectTo: window.location.origin },
    });
  });

  it('rejects short passwords before calling Supabase', async () => {
    await expect(mod.signUp('a@b.co', 'short')).resolves.toBe('Password must be at least 8 characters');
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it('returns mapped sign-in errors', async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: 'invalid_credentials' } });
    await expect(mod.signIn('a@b.co', 'password1')).resolves.toBe('Wrong email or password');
  });

  it('tracks session and recovery events', () => {
    let listener!: (event: string, session: unknown) => void;
    auth.onAuthStateChange.mockImplementation((fn) => { listener = fn; return { data: { subscription: { unsubscribe: vi.fn() } } }; });
    mod.initAuth();
    listener('INITIAL_SESSION', null);
    expect(mod.useAuthStore.getState()).toMatchObject({ status: 'signedOut', user: null });
    listener('PASSWORD_RECOVERY', { user: { id: 'u1', email: 'a@b.co' } });
    expect(mod.useAuthStore.getState()).toMatchObject({ status: 'signedIn', recovery: true, user: { id: 'u1', email: 'a@b.co' } });
  });

  it('signOut clears the local board even if the network call fails', async () => {
    auth.signOut.mockRejectedValue(new TypeError('Failed to fetch'));
    useAppStore.getState().beginSession('u1', useAppStore.getState().data, { dirty: true, baseRevision: 1, localUpdatedAt: 'x' });
    await mod.signOut();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(useAppStore.getState().ownerId).toBeNull();
    expect(useAppStore.getState().sync).toEqual(INITIAL_SYNC);
    expect(mod.useAuthStore.getState().status).toBe('signedOut');
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/cloud/auth.test.ts` → Expected: FAIL, cannot resolve `./auth`.

- [ ] **Step 3: Implement** — `src/cloud/auth.ts`

```ts
import { create } from 'zustand';
import { getSupabase } from './client';
import { useAppStore } from '../store/useAppStore';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';
export interface AuthUser { id: string; email: string }
interface AuthState { status: AuthStatus; user: AuthUser | null; recovery: boolean }

export const useAuthStore = create<AuthState>(() => ({ status: 'loading', user: null, recovery: false }));
export const MIN_PASSWORD = 8;
const SHORT = `Password must be at least ${MIN_PASSWORD} characters`;

export function authErrorMessage(error: unknown): string {
  const e = (error ?? {}) as { code?: string; name?: string; message?: string };
  if (e.name === 'AuthRetryableFetchError' || /failed to fetch|network/i.test(e.message ?? '')) return 'No connection';
  switch (e.code) {
    case 'invalid_credentials': return 'Wrong email or password';
    case 'email_not_confirmed': return 'Email not confirmed yet';
    case 'user_already_exists': return 'That email already has an account';
    case 'weak_password': return 'Password is too weak';
    default: return 'Something went wrong — try again';
  }
}

type Session = { user: { id: string; email?: string } } | null;

export function initAuth(): () => void {
  const { data } = getSupabase().auth.onAuthStateChange((event: string, session: Session) => {
    const user = session ? { id: session.user.id, email: session.user.email ?? '' } : null;
    useAuthStore.setState((s) => ({
      status: user ? 'signedIn' : 'signedOut',
      user,
      recovery: event === 'PASSWORD_RECOVERY' ? true : user ? s.recovery : false,
    }));
  });
  return () => data.subscription.unsubscribe();
}

async function attempt(fn: () => Promise<{ error: unknown }>): Promise<string | null> {
  try {
    const { error } = await fn();
    return error ? authErrorMessage(error) : null;
  } catch (e) {
    return authErrorMessage(e);
  }
}

export async function signUp(email: string, password: string): Promise<string | null> {
  if (password.length < MIN_PASSWORD) return SHORT;
  return attempt(() =>
    getSupabase().auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } }),
  );
}

export const signIn = (email: string, password: string) =>
  attempt(() => getSupabase().auth.signInWithPassword({ email, password }));

export const requestPasswordReset = (email: string) =>
  attempt(() => getSupabase().auth.resetPasswordForEmail(email, { redirectTo: window.location.origin }));

export async function updatePassword(password: string): Promise<string | null> {
  if (password.length < MIN_PASSWORD) return SHORT;
  const error = await attempt(() => getSupabase().auth.updateUser({ password }));
  if (!error) useAuthStore.setState({ recovery: false });
  return error;
}

/** Signing out always wipes this device's board copy, even when offline. */
export async function signOut(): Promise<void> {
  try {
    await getSupabase().auth.signOut({ scope: 'local' });
  } catch {
    /* the local session is removed regardless */
  }
  useAppStore.getState().clearLocalBoard();
  useAuthStore.setState({ status: 'signedOut', user: null, recovery: false });
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/cloud/auth.test.ts` and then `npx tsc --noEmit`.
Expected: all passed; no type errors. If the supabase types reject the `onAuthStateChange` callback signature, type the parameters as `(event, session)` and read `session?.user`. Do not loosen the tests.

- [ ] **Step 5: Commit**

```
git add src/cloud/auth.ts src/cloud/auth.test.ts
git commit -m "feat(cloud): add auth store and email/password actions"
```

---

### Task 7: Auth screens

**Files:**
- Create: `src/components/AuthScreen.tsx`, `src/components/ResetPasswordScreen.tsx`, `src/components/Auth.css`, `src/components/AuthScreen.test.tsx`

**Interfaces:**
- Consumes: `signIn`, `signUp`, `requestPasswordReset`, `updatePassword`, `MIN_PASSWORD` (Task 6).
- Produces: `<AuthScreen />`, `<ResetPasswordScreen />` (no props).

- [ ] **Step 1: Write the failing test** — `src/components/AuthScreen.test.tsx`

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const signIn = vi.fn();
const signUp = vi.fn();
const requestPasswordReset = vi.fn();
const updatePassword = vi.fn();
vi.mock('../cloud/auth', () => ({ signIn, signUp, requestPasswordReset, updatePassword, MIN_PASSWORD: 8 }));

const { AuthScreen } = await import('./AuthScreen');
const { ResetPasswordScreen } = await import('./ResetPasswordScreen');

afterEach(() => vi.clearAllMocks());

const fill = async (email: string, password?: string) => {
  await userEvent.type(screen.getByLabelText('Email'), email);
  if (password !== undefined) await userEvent.type(screen.getByLabelText('Password'), password);
};

describe('AuthScreen', () => {
  it('signs in and shows mapped errors', async () => {
    signIn.mockResolvedValue('Wrong email or password');
    render(<AuthScreen />);
    await fill('a@b.co', 'password1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(signIn).toHaveBeenCalledWith('a@b.co', 'password1');
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password');
  });

  it('signs up and asks to confirm the email', async () => {
    signUp.mockResolvedValue(null);
    render(<AuthScreen />);
    await userEvent.click(screen.getByRole('tab', { name: 'Sign up' }));
    await fill('a@b.co', 'password1');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Check your email to confirm your account')).toBeInTheDocument();
  });

  it('requests a reset without revealing whether the account exists', async () => {
    requestPasswordReset.mockResolvedValue(null);
    render(<AuthScreen />);
    await userEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await fill('a@b.co');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText('If that email has an account, a reset link is on its way')).toBeInTheDocument();
  });
});

describe('ResetPasswordScreen', () => {
  it('requires both passwords to match', async () => {
    render(<ResetPasswordScreen />);
    await userEvent.type(screen.getByLabelText('New password'), 'password1');
    await userEvent.type(screen.getByLabelText('Repeat new password'), 'password2');
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match');
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it('saves a new password', async () => {
    updatePassword.mockResolvedValue(null);
    render(<ResetPasswordScreen />);
    await userEvent.type(screen.getByLabelText('New password'), 'password1');
    await userEvent.type(screen.getByLabelText('Repeat new password'), 'password1');
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(updatePassword).toHaveBeenCalledWith('password1');
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/components/AuthScreen.test.tsx` → Expected: FAIL, cannot resolve `./AuthScreen`.

- [ ] **Step 3: Implement**

`src/components/Auth.css`:

```css
.auth-screen { min-height: 100vh; display: grid; place-items: center; padding: 16px; }
.auth-card { width: min(100%, 380px); padding: 20px; display: grid; gap: 14px; }
.auth-title { font-family: var(--font-title); font-size: 16px; color: var(--accent); text-align: center; margin: 0; }
.auth-sub { font-family: var(--font-title); font-size: 9px; color: var(--ink-dim); text-align: center; margin: 0; }
.auth-tabs { display: flex; gap: 8px; }
.auth-tabs .pixel-btn { flex: 1; }
.auth-form { display: grid; gap: 10px; }
.auth-form label { display: grid; gap: 4px; font-size: 20px; }
.auth-form input { font: inherit; font-size: 20px; padding: 6px 8px; background: var(--bg); color: var(--ink); border: 3px solid var(--border); min-width: 0; }
.auth-error { color: var(--danger); margin: 0; }
.auth-note { color: var(--good); margin: 0; }
.auth-link { background: none; border: none; color: var(--ink-dim); text-decoration: underline; cursor: pointer; font: inherit; justify-self: center; }
```

`src/components/AuthScreen.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { requestPasswordReset, signIn, signUp, MIN_PASSWORD } from '../cloud/auth';
import './Auth.css';

type Mode = 'signIn' | 'signUp' | 'forgot';

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const switchTo = (next: Mode) => {
    setMode(next);
    setError(null);
    setNote(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNote(null);
    const trimmed = email.trim();
    if (mode === 'signIn') setError(await signIn(trimmed, password));
    if (mode === 'signUp') {
      const err = await signUp(trimmed, password);
      if (err) setError(err);
      else setNote('Check your email to confirm your account');
    }
    if (mode === 'forgot') {
      const err = await requestPasswordReset(trimmed);
      if (err === 'No connection') setError(err);
      else setNote('If that email has an account, a reset link is on its way');
    }
    setBusy(false);
  };

  const action = mode === 'signIn' ? 'Sign in' : mode === 'signUp' ? 'Create account' : 'Send reset link';

  return (
    <main className="auth-screen">
      <div className="auth-card pixel-box">
        <h1 className="auth-title">QUEST BOARD</h1>
        <p className="auth-sub">Press Start</p>
        {mode !== 'forgot' && (
          <div className="auth-tabs" role="tablist">
            <button type="button" role="tab" className="pixel-btn" aria-selected={mode === 'signIn'} aria-pressed={mode === 'signIn'} onClick={() => switchTo('signIn')}>Sign in</button>
            <button type="button" role="tab" className="pixel-btn" aria-selected={mode === 'signUp'} aria-pressed={mode === 'signUp'} onClick={() => switchTo('signUp')}>Sign up</button>
          </div>
        )}
        <form className="auth-form" onSubmit={submit}>
          <label>
            Email
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {mode !== 'forgot' && (
            <label>
              Password
              <input type="password" required minLength={mode === 'signUp' ? MIN_PASSWORD : undefined}
                autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
          )}
          {error && <p className="auth-error" role="alert">{error}</p>}
          {note && <p className="auth-note" role="status">{note}</p>}
          <button type="submit" className="pixel-btn primary" disabled={busy}>{action}</button>
        </form>
        {mode === 'signIn' && <button type="button" className="auth-link" onClick={() => switchTo('forgot')}>Forgot password?</button>}
        {mode === 'forgot' && <button type="button" className="auth-link" onClick={() => switchTo('signIn')}>Back to sign in</button>}
      </div>
    </main>
  );
}
```

Note: the sign-in test omits `required`-blocking issues because it fills both fields. jsdom does not block `submit` on `minLength`; the `signUp` guard in Task 6 enforces it.

`src/components/ResetPasswordScreen.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { updatePassword, MIN_PASSWORD } from '../cloud/auth';
import './Auth.css';

export function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== repeat) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    setError(await updatePassword(password));
    setBusy(false);
  };

  return (
    <main className="auth-screen">
      <form className="auth-card auth-form pixel-box" onSubmit={submit}>
        <h1 className="auth-title">NEW PASSWORD</h1>
        <label>
          New password
          <input type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label>
          Repeat new password
          <input type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button type="submit" className="pixel-btn primary" disabled={busy}>Save new password</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/components/AuthScreen.test.tsx` → Expected: 5 passed.

- [ ] **Step 5: Commit**

```
git add src/components/AuthScreen.tsx src/components/ResetPasswordScreen.tsx src/components/Auth.css src/components/AuthScreen.test.tsx
git commit -m "feat(ui): add sign-in, sign-up, forgot and reset password screens"
```

---

### Task 8: First sync on a device

**Files:**
- Create: `src/cloud/firstSync.ts`, `src/cloud/firstSync.test.ts`, `src/components/FirstSyncPrompt.tsx`, `src/components/FirstSyncPrompt.test.tsx`

**Interfaces:**
- Consumes: `LEGACY_KEY` (Task 4), `validateData`, `loadBoard`/`LoadResult` (Task 3), `fromCloudBoard` (Task 2), `useAppStore.beginSession`.
- Produces:
  - `type FirstSyncCase = 'ask-upload' | 'create-default' | 'ask-replace' | 'use-account'`
  - `decideFirstSync(account: LoadResult | null, legacy: AppData | null): FirstSyncCase`
  - `readLegacyBoard(): AppData | null`, `clearLegacyBoard(): void`
  - `<FirstSyncPrompt userId={string} />`

- [ ] **Step 1: Write the failing tests**

`src/cloud/firstSync.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { clearLegacyBoard, decideFirstSync, readLegacyBoard } from './firstSync';
import { LEGACY_KEY } from '../store/deviceSettings';
import { createDefaultData } from '../store/defaults';

const account = { revision: 3, clientUpdatedAt: 'x', board: {} };

describe('decideFirstSync', () => {
  it.each([
    [null, true, 'ask-upload'],
    [null, false, 'create-default'],
    [account, true, 'ask-replace'],
    [account, false, 'use-account'],
  ] as const)('account=%o legacy=%s → %s', (acc, hasLegacy, expected) => {
    expect(decideFirstSync(acc, hasLegacy ? createDefaultData() : null)).toBe(expected);
  });
});

describe('legacy board', () => {
  it('reads a valid legacy board and clears it', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ state: { data: createDefaultData() }, version: 1 }));
    expect(readLegacyBoard()?.columns).toHaveLength(3);
    clearLegacyBoard();
    expect(readLegacyBoard()).toBeNull();
  });

  it('treats a damaged legacy board as absent', () => {
    localStorage.setItem(LEGACY_KEY, '{nope');
    expect(readLegacyBoard()).toBeNull();
  });
});
```

`src/components/FirstSyncPrompt.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createDefaultData } from '../store/defaults';
import { toCloudBoard } from '../cloud/mapping';

const loadBoard = vi.fn();
vi.mock('../cloud/api', async (orig) => ({ ...(await orig<typeof import('../cloud/api')>()), loadBoard }));

const { FirstSyncPrompt } = await import('./FirstSyncPrompt');
const { useAppStore, INITIAL_SYNC } = await import('../store/useAppStore');
const { LEGACY_KEY } = await import('../store/deviceSettings');
const { SyncError } = await import('../cloud/api');

const legacyBoard = () => {
  const d = createDefaultData();
  d.player.totalXp = 321;
  localStorage.setItem(LEGACY_KEY, JSON.stringify({ state: { data: d }, version: 1 }));
};
const app = () => useAppStore.getState();

beforeEach(() => useAppStore.setState({ data: createDefaultData(), ownerId: null, sync: { ...INITIAL_SYNC } }));
afterEach(() => loadBoard.mockReset());

describe('FirstSyncPrompt', () => {
  it('uploads the local board to an empty account', async () => {
    legacyBoard();
    loadBoard.mockResolvedValue(null);
    render(<FirstSyncPrompt userId="u1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Upload' }));
    expect(app().ownerId).toBe('u1');
    expect(app().data.player.totalXp).toBe(321);
    expect(app().sync).toMatchObject({ dirty: true, baseRevision: 0 });
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('creates the default board for an empty account without a local board', async () => {
    loadBoard.mockResolvedValue(null);
    render(<FirstSyncPrompt userId="u1" />);
    await waitFor(() => expect(app().ownerId).toBe('u1'));
    expect(app().data.columns.map((c) => c.name)).toEqual(['To Do', 'Doing', 'Done']);
    expect(app().sync.dirty).toBe(true);
  });

  it('can keep the account board instead of the local one', async () => {
    legacyBoard();
    const server = createDefaultData();
    server.player.totalXp = 50;
    loadBoard.mockResolvedValue({ revision: 4, clientUpdatedAt: 'x', board: toCloudBoard(server) });
    render(<FirstSyncPrompt userId="u1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Use account board' }));
    expect(app().data.player.totalXp).toBe(50);
    expect(app().sync).toEqual({ dirty: false, baseRevision: 4, localUpdatedAt: null });
  });

  it('can replace the account board with this device', async () => {
    legacyBoard();
    loadBoard.mockResolvedValue({ revision: 4, clientUpdatedAt: 'x', board: toCloudBoard(createDefaultData()) });
    render(<FirstSyncPrompt userId="u1" />);
    await userEvent.click(await screen.findByRole('button', { name: "Replace with this device's board" }));
    expect(app().data.player.totalXp).toBe(321);
    expect(app().sync).toMatchObject({ dirty: true, baseRevision: 4 });
  });

  it('asks to go online when the account cannot be reached', async () => {
    loadBoard.mockRejectedValueOnce(new SyncError('network', 'Failed to fetch')).mockResolvedValue(null);
    render(<FirstSyncPrompt userId="u1" />);
    expect(await screen.findByText('Connect to the internet to set up your board.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(app().ownerId).toBe('u1'));
  });
});
```

- [ ] **Step 2: Run them — expect FAIL**

Run: `npx vitest run src/cloud/firstSync.test.ts src/components/FirstSyncPrompt.test.tsx`
Expected: FAIL, unresolved imports.

- [ ] **Step 3: Implement**

`src/cloud/firstSync.ts`:

```ts
import type { AppData } from '../types';
import { LEGACY_KEY } from '../store/deviceSettings';
import { validateData } from '../store/persistence';
import type { LoadResult } from './api';

export type FirstSyncCase = 'ask-upload' | 'create-default' | 'ask-replace' | 'use-account';

export function decideFirstSync(account: LoadResult | null, legacy: AppData | null): FirstSyncCase {
  if (!account) return legacy ? 'ask-upload' : 'create-default';
  return legacy ? 'ask-replace' : 'use-account';
}

export function readLegacyBoard(): AppData | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw === null) return null;
    const result = validateData((JSON.parse(raw) as { state?: { data?: unknown } })?.state?.data);
    return result.ok ? result.data : null;
  } catch {
    return null;
  }
}

export function clearLegacyBoard(): void {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}
```

`src/components/FirstSyncPrompt.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { loadBoard, SyncError, type LoadResult } from '../cloud/api';
import { clearLegacyBoard, decideFirstSync, readLegacyBoard, type FirstSyncCase } from '../cloud/firstSync';
import { fromCloudBoard } from '../cloud/mapping';
import { createDefaultData } from '../store/defaults';
import { useAppStore } from '../store/useAppStore';
import type { AppData } from '../types';
import './Auth.css';

type View = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ask'; case: FirstSyncCase; account: LoadResult | null; legacy: AppData };

export function FirstSyncPrompt({ userId }: { userId: string }) {
  const [view, setView] = useState<View>({ kind: 'loading' });

  const pushLocal = useCallback((data: AppData, account: LoadResult | null) => {
    useAppStore.getState().beginSession(userId, data, {
      dirty: true, baseRevision: account?.revision ?? 0, localUpdatedAt: new Date().toISOString(),
    });
    clearLegacyBoard();
  }, [userId]);

  const useAccount = useCallback((account: LoadResult) => {
    const store = useAppStore.getState();
    const result = fromCloudBoard(account.board, store.data.settings);
    if (!result.ok) {
      setView({ kind: 'error', message: 'Your account board could not be read. Try again later.' });
      return;
    }
    store.beginSession(userId, result.data, { dirty: false, baseRevision: account.revision, localUpdatedAt: null });
    clearLegacyBoard();
  }, [userId]);

  const begin = useCallback(async () => {
    setView({ kind: 'loading' });
    let account: LoadResult | null;
    try {
      account = await loadBoard();
    } catch (e) {
      setView({
        kind: 'error',
        message: e instanceof SyncError && e.kind === 'network'
          ? 'Connect to the internet to set up your board.'
          : 'Could not reach your account. Try again.',
      });
      return;
    }
    const legacy = readLegacyBoard();
    const decision = decideFirstSync(account, legacy);
    if (decision === 'create-default') pushLocal(createDefaultData(), null);
    else if (decision === 'use-account') useAccount(account!);
    else setView({ kind: 'ask', case: decision, account, legacy: legacy! });
  }, [pushLocal, useAccount]);

  useEffect(() => {
    void begin();
  }, [begin]);

  return (
    <main className="auth-screen">
      <div className="auth-card pixel-box">
        {view.kind === 'loading' && <p className="auth-sub">Loading your board…</p>}
        {view.kind === 'error' && (
          <>
            <p className="auth-error" role="alert">{view.message}</p>
            <button className="pixel-btn primary" onClick={() => void begin()}>Retry</button>
          </>
        )}
        {view.kind === 'ask' && view.case === 'ask-upload' && (
          <>
            <h1 className="auth-title">WELCOME!</h1>
            <p>Upload your local board to this account?</p>
            <button className="pixel-btn primary" onClick={() => pushLocal(view.legacy, view.account)}>Upload</button>
            <button className="pixel-btn" onClick={() => pushLocal(createDefaultData(), view.account)}>Start fresh</button>
          </>
        )}
        {view.kind === 'ask' && view.case === 'ask-replace' && (
          <>
            <h1 className="auth-title">TWO BOARDS</h1>
            <p>This account already has a board, and this device has a different one.</p>
            <button className="pixel-btn primary" onClick={() => useAccount(view.account!)}>Use account board</button>
            <button className="pixel-btn" onClick={() => pushLocal(view.legacy, view.account)}>Replace with this device's board</button>
          </>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run src/cloud/firstSync.test.ts src/components/FirstSyncPrompt.test.tsx` → Expected: all passed.

- [ ] **Step 5: Commit**

```
git add src/cloud/firstSync.ts src/cloud/firstSync.test.ts src/components/FirstSyncPrompt.tsx src/components/FirstSyncPrompt.test.tsx
git commit -m "feat(cloud): first-sync decisions and prompt"
```

---

### Task 9: Wiring — sync hook, status, gate, sign-out

**Files:**
- Create: `src/cloud/useSyncStore.ts`, `src/cloud/useCloudSync.ts`, `src/components/SyncStatus.tsx`, `src/components/CloudGate.tsx`, `src/components/CloudGate.test.tsx`
- Modify: `src/App.tsx`, `src/App.test.tsx`, `src/components/PlayerBar.tsx`, `src/components/PlayerBar.css`, `src/components/SettingsPanel.tsx`, `src/components/SettingsPanel.test.tsx`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `useSyncStore: { status: SyncStatus; retry: (() => void) | null }`
  - `useCloudSync(userId: string): void`
  - `<SyncStatus />`
  - `<CloudGate>{board UI}</CloudGate>`

- [ ] **Step 1: Write the failing tests**

`src/components/CloudGate.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createDefaultData } from '../store/defaults';

vi.mock('../cloud/auth', async () => {
  const { create } = await import('zustand');
  return {
    useAuthStore: create(() => ({ status: 'loading', user: null, recovery: false })),
    initAuth: () => () => {},
    signIn: vi.fn(), signUp: vi.fn(), requestPasswordReset: vi.fn(), updatePassword: vi.fn(), signOut: vi.fn(), MIN_PASSWORD: 8,
  };
});
vi.mock('../cloud/useCloudSync', () => ({ useCloudSync: vi.fn() }));
vi.mock('../cloud/api', async (orig) => ({ ...(await orig<typeof import('../cloud/api')>()), loadBoard: vi.fn(() => new Promise(() => {})) }));

const { CloudGate } = await import('./CloudGate');
const { useAuthStore } = await import('../cloud/auth');
const { useAppStore, INITIAL_SYNC } = await import('../store/useAppStore');

const signedIn = (id: string) => useAuthStore.setState({ status: 'signedIn', user: { id, email: 'a@b.co' }, recovery: false });
const renderGate = () => render(<CloudGate><p>BOARD</p></CloudGate>);

beforeEach(() => useAppStore.setState({ data: createDefaultData(), ownerId: null, sync: { ...INITIAL_SYNC } }));

describe('CloudGate', () => {
  it('shows a loading screen while auth starts', () => {
    useAuthStore.setState({ status: 'loading', user: null, recovery: false });
    renderGate();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows the sign-in screen when signed out', () => {
    useAuthStore.setState({ status: 'signedOut', user: null, recovery: false });
    renderGate();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByText('BOARD')).not.toBeInTheDocument();
  });

  it('shows the reset screen during password recovery', () => {
    useAuthStore.setState({ status: 'signedIn', user: { id: 'u1', email: 'a@b.co' }, recovery: true });
    renderGate();
    expect(screen.getByRole('button', { name: 'Save new password' })).toBeInTheDocument();
  });

  it('runs first sync when the cache belongs to someone else', () => {
    useAppStore.setState({ ownerId: 'other-user' });
    signedIn('u1');
    renderGate();
    expect(screen.getByText('Loading your board…')).toBeInTheDocument();
    expect(screen.queryByText('BOARD')).not.toBeInTheDocument();
  });

  it('shows the board when the cache belongs to the signed-in user', () => {
    useAppStore.setState({ ownerId: 'u1' });
    signedIn('u1');
    renderGate();
    expect(screen.getByText('BOARD')).toBeInTheDocument();
  });
});
```

Add to `src/components/SettingsPanel.test.tsx`. Put the `vi.mock` at the top, after the imports. Vitest hoists `vi.mock`, so `signOut` must come from `vi.hoisted`:

```tsx
const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock('../cloud/auth', async () => {
  const { create } = await import('zustand');
  return { useAuthStore: create(() => ({ status: 'signedIn', user: { id: 'u1', email: 'hero@example.com' }, recovery: false })), signOut };
});

describe('SettingsPanel account', () => {
  it('shows the account and signs out directly when everything is synced', async () => {
    render(<SettingsPanel onClose={() => {}} onEditAvatar={() => {}} />);
    expect(screen.getByText('Signed in as hero@example.com')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalled();
  });

  it('warns before signing out with unsynced changes', async () => {
    signOut.mockClear();
    useAppStore.setState({ sync: { dirty: true, baseRevision: 0, localUpdatedAt: 'x' } });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<SettingsPanel onClose={() => {}} onEditAvatar={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(confirm).toHaveBeenCalledWith('You have unsynced changes. Signing out will lose them.');
    expect(signOut).not.toHaveBeenCalled();
  });
});
```

Replace `src/App.test.tsx` body (App now gates on auth):

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./cloud/auth', async () => {
  const { create } = await import('zustand');
  return {
    useAuthStore: create(() => ({ status: 'signedIn', user: { id: 'u1', email: 'a@b.co' }, recovery: false })),
    initAuth: () => () => {}, signOut: vi.fn(),
    signIn: vi.fn(), signUp: vi.fn(), requestPasswordReset: vi.fn(), updatePassword: vi.fn(), MIN_PASSWORD: 8,
  };
});
vi.mock('./cloud/useCloudSync', () => ({ useCloudSync: vi.fn() }));

const { default: App } = await import('./App');
const { useAppStore } = await import('./store/useAppStore');

describe('App', () => {
  it('renders the board for the signed-in owner', () => {
    useAppStore.setState({ ownerId: 'u1' });
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Quest Board' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them — expect FAIL**

Run: `npx vitest run src/components/CloudGate.test.tsx src/components/SettingsPanel.test.tsx src/App.test.tsx`
Expected: FAIL, `./CloudGate` is unresolved and "Signed in as" is not found.

- [ ] **Step 3: Implement**

`src/cloud/useSyncStore.ts`:

```ts
import { create } from 'zustand';
import type { SyncStatus } from './syncEngine';

export const useSyncStore = create<{ status: SyncStatus; retry: (() => void) | null }>(() => ({ status: 'synced', retry: null }));
```

`src/cloud/useCloudSync.ts`:

```ts
import { useEffect } from 'react';
import { createSyncEngine } from './syncEngine';
import { loadBoard, saveBoard } from './api';
import { fromCloudBoard } from './mapping';
import { useSyncStore } from './useSyncStore';
import { useAppStore } from '../store/useAppStore';
import { useEffectsStore } from '../store/useEffectsStore';

/** Runs the sync engine for the signed-in user while the board is on screen. */
export function useCloudSync(userId: string): void {
  useEffect(() => {
    const engine = createSyncEngine({
      load: loadBoard,
      save: saveBoard,
      getLocal: () => useAppStore.getState(),
      adopt: (board, revision) => {
        const store = useAppStore.getState();
        const result = fromCloudBoard(board, store.data.settings);
        if (result.ok) store.adoptServerBoard(result.data, revision);
        return result.ok;
      },
      markSaved: (revision, sent) => useAppStore.getState().markSaved(revision, sent),
      setStatus: (status) => useSyncStore.setState({ status }),
      toast: (message) => useEffectsStore.getState().toast(message),
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (handle) => window.clearTimeout(handle as number),
    });
    useSyncStore.setState({ retry: () => void engine.retryNow() });

    const unsubscribe = useAppStore.subscribe((state, prev) => {
      if (state.sync.localUpdatedAt !== prev.sync.localUpdatedAt) engine.notifyChange();
    });
    const onOnline = () => void engine.retryNow();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void engine.sync();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    void engine.start();

    return () => {
      engine.stop();
      unsubscribe();
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      useSyncStore.setState({ retry: null, status: 'synced' });
    };
  }, [userId]);
}
```

`src/components/SyncStatus.tsx`:

```tsx
import { useSyncStore } from '../cloud/useSyncStore';

const VIEW = {
  synced: { icon: '☁️', label: 'Synced' },
  saving: { icon: '⏳', label: 'Saving…' },
  offline: { icon: '📴', label: 'Offline — saved on this device' },
  error: { icon: '⚠️', label: 'Sync error — click to retry' },
} as const;

export function SyncStatus() {
  const status = useSyncStore((s) => s.status);
  const retry = useSyncStore((s) => s.retry);
  const { icon, label } = VIEW[status];
  if (status === 'error') {
    return <button className="pixel-btn icon sync-status" title={label} aria-label={label} onClick={() => retry?.()}>{icon}</button>;
  }
  return <span className="sync-status" role="status" title={label} aria-label={label}>{icon}</span>;
}
```

`src/components/CloudGate.tsx`:

```tsx
import { useEffect, type ReactNode } from 'react';
import { initAuth, useAuthStore } from '../cloud/auth';
import { useCloudSync } from '../cloud/useCloudSync';
import { useAppStore } from '../store/useAppStore';
import { AuthScreen } from './AuthScreen';
import { ResetPasswordScreen } from './ResetPasswordScreen';
import { FirstSyncPrompt } from './FirstSyncPrompt';
import './Auth.css';

function Synced({ userId, children }: { userId: string; children: ReactNode }) {
  useCloudSync(userId);
  return <>{children}</>;
}

export function CloudGate({ children }: { children: ReactNode }) {
  const { status, user, recovery } = useAuthStore();
  const ownerId = useAppStore((s) => s.ownerId);

  useEffect(() => initAuth(), []);

  if (status === 'loading') return <main className="auth-screen"><p className="auth-sub">Loading…</p></main>;
  if (status === 'signedOut' || !user) return <AuthScreen />;
  if (recovery) return <ResetPasswordScreen />;
  if (ownerId !== user.id) return <FirstSyncPrompt userId={user.id} />;
  return <Synced userId={user.id}>{children}</Synced>;
}
```

`src/App.tsx`: wrap the existing `<div className="app">…</div>` in `<CloudGate>…</CloudGate>`. Keep the theme `useEffect` and `useAudioSettings()` outside the gate, so the auth screen also follows the theme. Add `import { CloudGate } from './components/CloudGate';`.

`src/components/PlayerBar.tsx`: add `import { SyncStatus } from './SyncStatus';` and render `<SyncStatus />` as the first child of `<nav className="player-actions">`. In `PlayerBar.css` add:

```css
.sync-status { display: inline-flex; align-items: center; font-size: 16px; padding: 0 4px; }
```

`src/components/SettingsPanel.tsx`: add imports and an Account section after "Backup":

```tsx
import { signOut, useAuthStore } from '../cloud/auth';
// inside the component:
  const email = useAuthStore((s) => s.user?.email ?? '');
  const dirty = useAppStore((s) => s.sync.dirty);
  const onSignOut = () => {
    if (dirty && !window.confirm('You have unsynced changes. Signing out will lose them.')) return;
    onClose();
    void signOut();
  };
// JSX:
      <section className="settings-section">
        <h3>Account</h3>
        <p className="settings-note">Signed in as {email}</p>
        <div className="row">
          <button className="pixel-btn danger" onClick={onSignOut}>Sign out</button>
        </div>
      </section>
```

In `SettingsPanel.test.tsx`, also update the `beforeEach` to reset `sync`:
`useAppStore.setState({ data: createDefaultData(), sync: { dirty: false, baseRevision: 0, localUpdatedAt: null } });`

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run` (full suite) → Expected: all files pass, 0 failed.
Run: `npx tsc --noEmit` → Expected: no output.
Run: `npm run build` → Expected: build succeeds.
Then check the generated `dist/sw.js`: `Select-String -Path dist/sw.js -Pattern supabase` → Expected: no match. This proves the service worker never caches Supabase requests.

- [ ] **Step 5: Commit**

```
git add -A src
git commit -m "feat(cloud): gate the app on auth, run sync, show status and sign-out"
```

---

### Task 10: SQL migrations and RLS check script (files only)

**Files:**
- Create: `supabase/migrations/20261003000001_quest_board_schema.sql`, `supabase/migrations/20261003000002_quest_board_functions.sql`, `supabase/tests/rls_check.sql`

**Interfaces:**
- Produces:
  - DB functions `public.load_board() → jsonb`
  - `public.save_board(p_board jsonb, p_base_revision bigint, p_client_updated_at timestamptz) → jsonb`
  - The JSON shapes exactly match `LoadResult`/`SaveResult` (Task 3) and `CloudBoard` (Task 2).
- Ruling, recorded here: the spec does not store the order of a quest's labels or of the board's labels. Exact round-trip needs both, so `labels` and `quest_labels` gain a `position int` column. RLS uses one `for all` policy per table, which is equivalent to the spec's four per-command policies.

- [ ] **Step 1: Write the schema migration** — `supabase/migrations/20261003000001_quest_board_schema.sql`

```sql
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
```

- [ ] **Step 2: Write the functions migration** — `supabase/migrations/20261003000002_quest_board_functions.sql`

```sql
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
```

- [ ] **Step 3: Write the check script** — `supabase/tests/rls_check.sql`

It always ends with an exception, so nothing it creates is ever committed. Success reads `RLS_CHECK_OK`; failure reads `RLS_CHECK_FAIL: <reason>`.

```sql
do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  frame jsonb := (select jsonb_agg('#ffcd75') from generate_series(1, 1024));
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
```

- [ ] **Step 4: Commit**

```
git add supabase
git commit -m "feat(db): add Quest Board schema, RLS, board functions and RLS check"
```

---

### Task 11: Apply to Supabase and verify (requires user approval)

**Files:**
- Create: `.env.local` (git-ignored, never committed)

- [ ] **Step 1: Prove the check fails before the functions exist**

Run `supabase/tests/rls_check.sql` with the connector's `execute_sql` on project `nbrrjkwlqwdxojnnpfvp`.
Expected: an error naming `public.save_board` (does not exist) or `public.board_columns`. This is RED, and it changes nothing.

- [ ] **Step 2: STOP — ask the user**

Ask in Vietnamese for approval to apply the 2 migrations to project "Kanban - Quest board". Explain that they create 7 empty tables, RLS rules and 4 functions; that they are free; and that they do not touch other data. Wait for an explicit yes.

- [ ] **Step 3: Apply the migrations**

Use the connector's `apply_migration` with the file contents of each migration in order:
- `name: quest_board_schema`
- `name: quest_board_functions`

Expected: success for both. If a migration fails, fix the SQL file, commit the fix, and ask again before re-applying.

- [ ] **Step 4: Run the check — expect GREEN**

`execute_sql` with `supabase/tests/rls_check.sql` → Expected: error message exactly `RLS_CHECK_OK`. Any `RLS_CHECK_FAIL: …` is a bug: fix it with a new migration file (never edit applied ones), then repeat Steps 2–4.

- [ ] **Step 5: Security advisors**

Run the connector's `get_advisors` with type `security` (and `performance`).
Expected: no warnings about these 7 tables or 4 functions, other than the known `auth.*` items that are not ours. Fix real findings with a new migration.

- [ ] **Step 6: Write `.env.local`**

Use the connector's `get_project_url` and `get_publishable_keys`. Pick the publishable key, or the legacy `anon` key if no publishable key exists; **never** a secret or service_role key. Write:

```
VITE_SUPABASE_URL=<url>
VITE_SUPABASE_PUBLISHABLE_KEY=<key>
```

Run `git status --short` → Expected: `.env.local` is not listed.

- [ ] **Step 7: Commit any fix migrations**

```
git add supabase
git commit -m "fix(db): <what the advisor/check found>"   # only if something changed
```

---

### Task 12: Browser verification and user hand-off

- [ ] **Step 1: Start the dev server** with the `quest-board-dev` preview config and open `http://localhost:5173`.

Check the following:
- the sign-in screen renders in both themes;
- the console is free of errors;
- "Forgot password?" switches the form;
- the Sign up tab switches the button label;
- the screen fits at 375 px width with no horizontal scroll.

- [ ] **Step 2: Do not create an account.**

Accounts on supabase.co are created by the user. Guide the user, in Vietnamese, step by step:
1. Supabase dashboard → Authentication → URL Configuration: Site URL `http://localhost:5173`, and add `http://localhost:5173` to Redirect URLs.
2. Optional while testing: Authentication → Sign In / Providers → Email → turn off "Confirm email" (turn it back on later).
3. Sign up in the app with their own email and confirm it.
4. Choose **Upload** to keep the old board.
5. Open a second tab, change a quest, switch tabs, and check that it appears.
6. DevTools → Network → Offline. Make a change and see 📴. Go back online and see ☁️.
7. Sign out, then sign in again: the board comes back.
8. Forgot password → open the email link → set a new password.

- [ ] **Step 3: After the user signs up**, confirm with a read-only query:
- `select count(*) from auth.users`
- `select revision from public.profiles`

Report the results.

- [ ] **Step 4: Update `docs/PROJECT-NOTES.md`**

Set Supabase learning steps 2–6 as done: the schema, RLS, auth and sync now exist. Add the new keys and files, and the manual dashboard settings. Then commit:

```
git add docs/PROJECT-NOTES.md
git commit -m "docs: record Supabase backend status"
```
