# Quest Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build "Quest Board", a single-user pixel-art RPG Kanban PWA with XP/levels, streaks with shields, achievements, a hand-drawn avatar editor and original chiptune audio.

**Architecture:** All game rules are pure functions in `src/game/` and pure state transitions in `src/store/progress.ts` + `src/store/board.ts` of the shape `(data, input, now) → { data, events, error? }`. A thin Zustand store persists `AppData` to localStorage and forwards `GameEvent`s to a transient effects store that drives sounds, animations and avatar mood. React components only render state and call store actions.

**Tech Stack:** React 19 + TypeScript + Vite, Zustand 5 (persist), @dnd-kit (core/sortable), vite-plugin-pwa, Web Audio API, Vitest + Testing Library + jsdom, @fontsource fonts.

**Spec:** `docs/superpowers/specs/2026-09-29-quest-board-design.md`

**Deliberate refinements of the spec's data model (same behaviour):**
- `Quest.completedAt` + `Quest.xpAwarded` are merged into `Quest.completion: { at, xp, difficulty, early } | null`, so un-completing a quest can reverse stats correctly even if its difficulty was edited after completion.
- `Settings` gains `installedAt` (for the "3 days without export" reminder) and `backupSnoozedUntil` (for the "Later" button).

## Global Constraints

- UI copy is English. User-entered text (often Vietnamese with diacritics) must render correctly.
- Pixel look: `border-radius: 0` everywhere, animations use `steps()`, pixel images use `image-rendering: pixelated`; everything is disabled under `prefers-reduced-motion: reduce`.
- No copyrighted assets: all melodies, sound effects, the mascot and icons are original. Never copy Zelda melodies or Chiikawa art.
- Data lives only in the browser: localStorage key `quest-board-v1`, backup file `quest-board-backup-YYYY-MM-DD.json`, `schemaVersion: 1`.
- XP: base easy 10 / normal 25 / hard 50 / boss 100; on-time ×1.5, late ×0.5, no deadline ×1.0; streak bonus `1 + 0.05 × min(streak, 10)`; `Math.round`.
- Level L needs cumulative `50 × L × (L − 1)` XP. Shields: +1 every 7 streak days, max 2.
- Quest title 1–120 chars (trimmed), column name 1–30 chars, label name 1–20 chars.
- Exactly one column is the Done column at all times.
- Node ≥ 24 (the icon script is run directly as `.ts`). Dates are local-time `YYYY-MM-DD`.
- Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Opening the app over plain http on a LAN IP (e.g. testing on a phone)** — `crypto.randomUUID` is undefined outside secure contexts; creating quests must still work (fallback id). Test in Task 6.
2. **System clock moved backwards / completion dated before `lastActiveDate`** — streak and shields must stay unchanged, never go negative. Test in Task 4.
3. **Corrupted or hand-edited localStorage on startup** — app must start with a fresh board without crashing and keep a raw copy under `quest-board-corrupt-copy`. Test in Task 10.
4. **Deleting the only non-Done column while it still holds quests** — must be refused with a message; no quest may disappear. Test in Task 7.
5. **Saving a quest whose title was edited to only spaces** — modal stays open, quest unchanged, error toast shown. Test in Task 14.

---

## File Map

```
index.html, package.json, tsconfig.json, vite.config.ts, .gitignore
scripts/make-icons.ts            PNG icon generator (Task 18)
public/icons/*.png               generated icons (Task 18)
src/
  main.tsx, App.tsx, App.test.tsx, vite-env.d.ts
  types.ts                       all domain types + GameEvent + Result
  game/  dates.ts level.ts xp.ts deadline.ts streak.ts achievements.ts  (+ *.test.ts)
  store/ defaults.ts progress.ts board.ts persistence.ts backup.ts
         useEffectsStore.ts useAppStore.ts (+ *.test.ts)
  audio/ notes.ts engine.ts sfx.ts music.ts useAudioSettings.ts (+ audio.test.ts)
  avatar/ mascot.ts mood.ts editor.ts image.ts (+ *.test.ts)
  components/ PixelCanvas.tsx PlayerAvatar.tsx PlayerBar.tsx(.css)
              Board.tsx Board.css ColumnView.tsx ColumnMenu.tsx QuickAdd.tsx QuestCard.tsx
              Modal.tsx Modal.css QuestModal.tsx EffectsLayer.tsx Effects.css
              AchievementsPanel.tsx BackupBanner.tsx PixelEditor.tsx PixelEditor.css
              SettingsPanel.tsx ReloadPrompt.tsx (+ *.test.tsx)
  styles/theme.css
  test/ setup.ts fixtures.ts pwa-stub.ts
```

---

### Task 1: Project scaffold, theme base and fonts

**Files:**
- Create: `.gitignore`, `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts`, `src/styles/theme.css`, `src/test/setup.ts`
- Test: `src/App.test.tsx`

**Interfaces:**
- Produces: `npm test`, `npm run build`, `npm run dev`, `npm run typecheck`; CSS tokens (`--bg`, `--panel`, `--panel-alt`, `--ink`, `--ink-dim`, `--border`, `--shadow`, `--card`, `--card-edge`, `--card-ink`, `--accent`, `--xp`, `--xp-deep`, `--danger`, `--good`, `--easy`, `--normal`, `--hard`, `--boss`, `--font-title`, `--font-body`); classes `.pixel-box`, `.pixel-btn` (+ `.primary`, `.danger`, `.ghost`, `.icon`), `.field-input`, `.sr-only`, `.pixelated`.

- [ ] **Step 1: Write config files**

`.gitignore`:
```
node_modules/
dist/
dev-dist/
.vite/
*.log
```

`package.json`:
```json
{
  "name": "quest-board",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "icons": "node scripts/make-icons.ts"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "allowImportingTsExtensions": true,
    "noEmit": true
  },
  "include": ["src", "scripts", "vite.config.ts"]
}
```

`vite.config.ts`:
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

`index.html`:
```html
<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#1a1c2c" />
    <meta name="description" content="A pixel-art RPG Kanban board" />
    <title>Quest Board</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
```

- [ ] **Step 2: Install dependencies**

```bash
npm install react react-dom zustand @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities @fontsource/press-start-2p @fontsource/vt323 @fontsource/pixelify-sans
npm install -D typescript vite @vitejs/plugin-react vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @types/react @types/react-dom @types/node
npx tsc --version
```
Expected: installs succeed; `tsc --version` prints a version. If `npx tsc` is not found (TypeScript 7 ships a different binary), run `npm install -D typescript@5` and re-check. If npm reports a peer-dependency conflict, re-run the failing install with `--legacy-peer-deps`.

- [ ] **Step 3: Pick the body font (Vietnamese diacritics)**

```bash
ls node_modules/@fontsource/pixelify-sans/files | grep -c vietnamese
ls node_modules/@fontsource/vt323/files | grep -c vietnamese
```
- If the Pixelify Sans count is > 0: body font = Pixelify Sans, body size 17px, CSS import `@fontsource/pixelify-sans/400.css`; then `npm uninstall @fontsource/vt323`.
- Otherwise (VT323 expected to have the subset): body font = VT323, body size 20px, CSS import `@fontsource/vt323/400.css`; then `npm uninstall @fontsource/pixelify-sans`.

The code below uses VT323 / 20px. If Pixelify Sans was chosen, change the import line in `main.tsx`, `--font-body` and the `body { font-size }` in `theme.css` accordingly.

- [ ] **Step 4: Write the failing smoke test**

`src/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom has no canvas; PixelCanvas tolerates a null context.
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: () => null,
  configurable: true,
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});
```

`src/App.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  it('renders the app heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Quest Board' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — cannot resolve `./App`.

- [ ] **Step 6: Implement App, main and theme**

`src/App.tsx`:
```tsx
export default function App() {
  return (
    <div className="app">
      <h1 className="sr-only">Quest Board</h1>
    </div>
  );
}
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/press-start-2p/400.css';
import '@fontsource/vt323/400.css';
import './styles/theme.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/styles/theme.css`:
```css
:root {
  --bg: #1a1c2c;
  --bg-dot: #262b44;
  --panel: #29366f;
  --panel-alt: #333c57;
  --ink: #f4f4f4;
  --ink-dim: #94b0c2;
  --border: #f4f4f4;
  --shadow: #0b0c16;
  --card: #f4e4c1;
  --card-edge: #c9a66b;
  --card-ink: #333c57;
  --accent: #ffcd75;
  --xp: #73eff7;
  --xp-deep: #41a6f6;
  --danger: #b13e53;
  --good: #38b764;
  --easy: #38b764;
  --normal: #3b5dc9;
  --hard: #ef7d57;
  --boss: #b13e53;
  --font-title: 'Press Start 2P', monospace;
  --font-body: 'VT323', monospace;
  color-scheme: dark;
}

:root[data-theme='light'] {
  --bg: #e8ecf2;
  --bg-dot: #d5dce6;
  --panel: #94b0c2;
  --panel-alt: #c2d3df;
  --ink: #1a1c2c;
  --ink-dim: #333c57;
  --border: #1a1c2c;
  --shadow: #566c86;
  --card: #fffaf0;
  color-scheme: light;
}

* { box-sizing: border-box; border-radius: 0; }
html, body { margin: 0; min-height: 100%; }
body {
  background-color: var(--bg);
  background-image: radial-gradient(var(--bg-dot) 1px, transparent 1px);
  background-size: 16px 16px;
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 20px;
  line-height: 1.2;
  -webkit-font-smoothing: none;
}
button, input, textarea, select { font: inherit; color: inherit; }

.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
.pixelated { image-rendering: pixelated; image-rendering: crisp-edges; }

.app { display: flex; flex-direction: column; gap: 16px; min-height: 100vh; padding: 16px; }

.pixel-box {
  background: var(--panel);
  border: 4px solid var(--border);
  box-shadow: 4px 4px 0 var(--shadow);
}

.pixel-btn {
  font-family: var(--font-title);
  font-size: 10px;
  line-height: 1.4;
  text-transform: uppercase;
  padding: 8px 10px;
  background: var(--panel-alt);
  color: var(--ink);
  border: 3px solid var(--border);
  box-shadow: 3px 3px 0 var(--shadow);
  cursor: pointer;
}
.pixel-btn:hover { background: var(--panel); }
.pixel-btn:active { transform: translate(3px, 3px); box-shadow: none; }
.pixel-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.pixel-btn.primary { background: var(--good); color: #f4f4f4; }
.pixel-btn.danger { background: var(--danger); color: #f4f4f4; }
.pixel-btn.ghost { background: transparent; box-shadow: none; border-style: dashed; }
.pixel-btn.icon { font-size: 16px; padding: 4px 8px; text-transform: none; }
.pixel-btn[aria-pressed='true'] { background: var(--accent); color: #1a1c2c; }

.field-input {
  width: 100%;
  background: var(--bg);
  color: var(--ink);
  border: 3px solid var(--border);
  padding: 6px 8px;
}

:focus-visible { outline: 3px dashed var(--accent); outline-offset: 2px; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
```

- [ ] **Step 7: Run tests, typecheck and build**

Run: `npm test` → Expected: 1 test PASS.
Run: `npm run build` → Expected: exit 0, `dist/` created.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Quest Board (Vite + React + TS + Vitest)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Domain types, dates and levels

**Files:**
- Create: `src/types.ts`, `src/game/dates.ts`, `src/game/level.ts`
- Test: `src/game/dates.test.ts`, `src/game/level.test.ts`

**Interfaces:**
- Produces: all types below; `toDateKey(date: Date): DateKey`, `daysBetween(from: DateKey, to: DateKey): number` (to − from), `addDays(key: DateKey, days: number): DateKey`; `xpForLevel(level: number): number`, `levelFromXp(xp: number): number`, `levelProgress(xp: number): { level: number; current: number; needed: number }`.

- [ ] **Step 1: Write types**

`src/types.ts`:
```ts
export type Difficulty = 'easy' | 'normal' | 'hard' | 'boss';
export type DateKey = string; // 'YYYY-MM-DD', local time
export type Mood = 'normal' | 'happy' | 'levelUp' | 'sad';
export type Frame = (string | null)[]; // 32*32 = 1024 cells, '#rrggbb' or null
export type Theme = 'dark' | 'light';

export const MOODS: Mood[] = ['normal', 'happy', 'levelUp', 'sad'];

export interface Completion {
  at: string; // ISO
  xp: number;
  difficulty: Difficulty; // difficulty at completion time
  early: boolean; // finished on or before the deadline
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  deadline: DateKey | null;
  labelIds: string[];
  createdAt: string;
  completion: Completion | null;
}

export interface Column { id: string; name: string; questIds: string[]; isDone: boolean; }
export interface Label { id: string; name: string; color: string; }

export interface PlayerStats { completed: number; bossesSlain: number; earlyFinishes: number; }
export interface Player {
  totalXp: number;
  streak: number;
  lastActiveDate: DateKey | null;
  shields: number;
  stats: PlayerStats;
  unlockedAchievements: Record<string, string>; // id -> ISO time
}

export type AvatarFrames = Record<Mood, Frame | null>;
export interface Avatar { frames: AvatarFrames; }

export interface Settings {
  sfxVolume: number;
  musicVolume: number;
  musicOn: boolean;
  muted: boolean;
  theme: Theme;
  lastExportAt: string | null;
  installedAt: string;
  backupSnoozedUntil: string | null;
}

export interface AppData {
  schemaVersion: 1;
  columns: Column[];
  quests: Record<string, Quest>;
  labels: Label[];
  player: Player;
  avatar: Avatar;
  settings: Settings;
}

export type GameEvent =
  | { type: 'questCompleted'; questId: string; xp: number; difficulty: Difficulty }
  | { type: 'questUncompleted'; questId: string; xp: number }
  | { type: 'levelUp'; level: number }
  | { type: 'achievement'; id: string };

export interface Result {
  data: AppData;
  events: GameEvent[];
  error?: string;
  createdId?: string;
}
```

- [ ] **Step 2: Write the failing tests**

`src/game/dates.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, toDateKey } from './dates';

describe('dates', () => {
  it('formats local dates as YYYY-MM-DD', () => {
    expect(toDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(toDateKey(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
  });
  it('counts days between keys across months and years', () => {
    expect(daysBetween('2026-09-29', '2026-09-29')).toBe(0);
    expect(daysBetween('2026-02-27', '2026-03-01')).toBe(2);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-09-29', '2026-09-26')).toBe(-3);
  });
  it('adds days', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
```

`src/game/level.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { levelFromXp, levelProgress, xpForLevel } from './level';

describe('level', () => {
  it('uses cumulative thresholds 50*L*(L-1)', () => {
    expect([1, 2, 3, 4, 10].map(xpForLevel)).toEqual([0, 100, 300, 600, 4500]);
  });
  it('derives level from total XP', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(99)).toBe(1);
    expect(levelFromXp(100)).toBe(2);
    expect(levelFromXp(299)).toBe(2);
    expect(levelFromXp(300)).toBe(3);
  });
  it('reports progress inside the current level', () => {
    expect(levelProgress(0)).toEqual({ level: 1, current: 0, needed: 100 });
    expect(levelProgress(350)).toEqual({ level: 3, current: 50, needed: 300 });
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/game` → Expected: FAIL (modules missing).

- [ ] **Step 4: Implement**

`src/game/dates.ts`:
```ts
import type { DateKey } from '../types';

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

export function toDateKey(date: Date): DateKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toUtcMs(key: DateKey): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysBetween(from: DateKey, to: DateKey): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = new Date(toUtcMs(key) + days * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
```

`src/game/level.ts`:
```ts
export function xpForLevel(level: number): number {
  return 50 * level * (level - 1);
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

export function levelProgress(xp: number): { level: number; current: number; needed: number } {
  const level = levelFromXp(xp);
  return { level, current: xp - xpForLevel(level), needed: xpForLevel(level + 1) - xpForLevel(level) };
}
```

- [ ] **Step 5: Run tests** — `npx vitest run src/game` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/game
git commit -m "feat(game): domain types, local date keys and level curve

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: XP calculation and deadline labels

**Files:**
- Create: `src/game/xp.ts`, `src/game/deadline.ts`
- Test: `src/game/xp.test.ts`, `src/game/deadline.test.ts`

**Interfaces:**
- Consumes: `Difficulty`, `DateKey`, `Quest` from `src/types.ts`; `daysBetween` from `dates.ts`.
- Produces: `BASE_XP`, `type Timing = 'none' | 'early' | 'late'`, `getTiming(deadline: DateKey | null, completedOn: DateKey): Timing`, `calculateXp(difficulty: Difficulty, timing: Timing, streak: number): number`; `deadlineInfo(deadline: DateKey, today: DateKey): { text: string; overdue: boolean; dueToday: boolean }`, `isOverdue(quest: Pick<Quest, 'deadline' | 'completion'>, today: DateKey): boolean`.

- [ ] **Step 1: Write the failing tests**

`src/game/xp.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { calculateXp, getTiming } from './xp';

describe('getTiming', () => {
  it('is none without a deadline', () => expect(getTiming(null, '2026-09-29')).toBe('none'));
  it('is early on or before the deadline', () => {
    expect(getTiming('2026-09-29', '2026-09-29')).toBe('early');
    expect(getTiming('2026-10-01', '2026-09-29')).toBe('early');
  });
  it('is late after the deadline', () => expect(getTiming('2026-09-28', '2026-09-29')).toBe('late'));
});

describe('calculateXp', () => {
  it.each([
    ['normal', 'none', 0, 25],
    ['hard', 'early', 0, 75],
    ['easy', 'late', 0, 5],
    ['boss', 'early', 10, 225],
    ['boss', 'none', 20, 150], // streak bonus capped at 10 days
    ['normal', 'early', 1, 39], // 39.375 rounds down
    ['normal', 'late', 1, 13], // 13.125
    ['normal', 'none', 1, 26], // 26.25
  ] as const)('%s / %s / streak %i → %i XP', (difficulty, timing, streak, expected) => {
    expect(calculateXp(difficulty, timing, streak)).toBe(expected);
  });
});
```

`src/game/deadline.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { deadlineInfo, isOverdue } from './deadline';

const today = '2026-09-29';

describe('deadlineInfo', () => {
  it.each([
    ['2026-09-29', 'today!', false, true],
    ['2026-09-30', 'tomorrow', false, false],
    ['2026-10-02', '3 days', false, false],
    ['2026-09-28', '1 day late', true, false],
    ['2026-09-26', '3 days late', true, false],
  ])('%s → %s', (deadline, text, overdue, dueToday) => {
    expect(deadlineInfo(deadline, today)).toEqual({ text, overdue, dueToday });
  });
});

describe('isOverdue', () => {
  it('only counts unfinished quests past their deadline', () => {
    expect(isOverdue({ deadline: '2026-09-28', completion: null }, today)).toBe(true);
    expect(isOverdue({ deadline: '2026-09-29', completion: null }, today)).toBe(false);
    expect(isOverdue({ deadline: null, completion: null }, today)).toBe(false);
    expect(
      isOverdue({ deadline: '2026-09-28', completion: { at: '', xp: 1, difficulty: 'easy', early: false } }, today),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/game/xp.test.ts src/game/deadline.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`src/game/xp.ts`:
```ts
import type { DateKey, Difficulty } from '../types';

export const BASE_XP: Record<Difficulty, number> = { easy: 10, normal: 25, hard: 50, boss: 100 };
export type Timing = 'none' | 'early' | 'late';
export const TIMING_MULTIPLIER: Record<Timing, number> = { none: 1, early: 1.5, late: 0.5 };
export const MAX_STREAK_BONUS_DAYS = 10;
export const STREAK_BONUS_PER_DAY = 0.05;

export function getTiming(deadline: DateKey | null, completedOn: DateKey): Timing {
  if (!deadline) return 'none';
  return completedOn <= deadline ? 'early' : 'late';
}

export function calculateXp(difficulty: Difficulty, timing: Timing, streak: number): number {
  const bonusDays = Math.min(Math.max(streak, 0), MAX_STREAK_BONUS_DAYS);
  const streakMultiplier = 1 + STREAK_BONUS_PER_DAY * bonusDays;
  return Math.round(BASE_XP[difficulty] * TIMING_MULTIPLIER[timing] * streakMultiplier);
}
```

`src/game/deadline.ts`:
```ts
import type { DateKey, Quest } from '../types';
import { daysBetween } from './dates';

export interface DeadlineInfo { text: string; overdue: boolean; dueToday: boolean; }

export function deadlineInfo(deadline: DateKey, today: DateKey): DeadlineInfo {
  const diff = daysBetween(today, deadline);
  if (diff === 0) return { text: 'today!', overdue: false, dueToday: true };
  if (diff === 1) return { text: 'tomorrow', overdue: false, dueToday: false };
  if (diff > 1) return { text: `${diff} days`, overdue: false, dueToday: false };
  const late = -diff;
  return { text: late === 1 ? '1 day late' : `${late} days late`, overdue: true, dueToday: false };
}

export function isOverdue(quest: Pick<Quest, 'deadline' | 'completion'>, today: DateKey): boolean {
  return quest.completion === null && quest.deadline !== null && quest.deadline < today;
}
```

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game
git commit -m "feat(game): XP formula and deadline labels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Streaks and shields

**Files:**
- Create: `src/game/streak.ts`
- Test: `src/game/streak.test.ts`

**Interfaces:**
- Consumes: `daysBetween`.
- Produces: `interface StreakState { streak: number; lastActiveDate: DateKey | null; shields: number }`, `MAX_SHIELDS = 2`, `SHIELD_EVERY = 7`, `applyActivity(state: StreakState, today: DateKey): StreakState`, `isStreakBroken(state: StreakState, today: DateKey): boolean`, `displayedStreak(state: StreakState, today: DateKey): number`.

- [ ] **Step 1: Write the failing tests**

`src/game/streak.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applyActivity, displayedStreak, isStreakBroken, type StreakState } from './streak';

const s = (streak: number, lastActiveDate: string | null, shields = 0): StreakState => ({ streak, lastActiveDate, shields });
const TODAY = '2026-09-29';

describe('applyActivity', () => {
  it('starts a streak on the first activity', () => {
    expect(applyActivity(s(0, null), TODAY)).toEqual(s(1, TODAY));
  });
  it('does nothing on a second activity the same day', () => {
    expect(applyActivity(s(3, TODAY, 1), TODAY)).toEqual(s(3, TODAY, 1));
  });
  it('extends on consecutive days, across months', () => {
    expect(applyActivity(s(3, '2026-09-28'), TODAY)).toEqual(s(4, TODAY));
    expect(applyActivity(s(2, '2026-09-30'), '2026-10-01')).toEqual(s(3, '2026-10-01'));
  });
  it('resets after a missed day without shields', () => {
    expect(applyActivity(s(5, '2026-09-27'), TODAY)).toEqual(s(1, TODAY));
  });
  it('spends shields to cover missed days', () => {
    expect(applyActivity(s(5, '2026-09-27', 1), TODAY)).toEqual(s(6, TODAY, 0));
    expect(applyActivity(s(5, '2026-09-26', 2), TODAY)).toEqual(s(6, TODAY, 0));
  });
  it('resets but keeps shields when there are not enough to cover the gap', () => {
    expect(applyActivity(s(5, '2026-09-26', 1), TODAY)).toEqual(s(1, TODAY, 1));
  });
  it('earns a shield every 7 days, capped at 2', () => {
    expect(applyActivity(s(6, '2026-09-28'), TODAY)).toEqual(s(7, TODAY, 1));
    expect(applyActivity(s(13, '2026-09-28', 2), TODAY)).toEqual(s(14, TODAY, 2));
  });
  it('ignores activity dated before the last active day (clock moved back)', () => {
    expect(applyActivity(s(4, '2026-09-30', 1), TODAY)).toEqual(s(4, '2026-09-30', 1));
  });
});

describe('displayedStreak / isStreakBroken', () => {
  it('shows 0 before any activity', () => {
    expect(displayedStreak(s(0, null), TODAY)).toBe(0);
    expect(isStreakBroken(s(0, null), TODAY)).toBe(false);
  });
  it('keeps the streak while it can still be continued today', () => {
    expect(displayedStreak(s(4, '2026-09-28'), TODAY)).toBe(4);
    expect(displayedStreak(s(4, TODAY), TODAY)).toBe(4);
  });
  it('keeps the streak when shields cover the gap', () => {
    expect(displayedStreak(s(4, '2026-09-26', 2), TODAY)).toBe(4);
    expect(isStreakBroken(s(4, '2026-09-26', 2), TODAY)).toBe(false);
  });
  it('shows 0 once the gap exceeds the shields', () => {
    expect(displayedStreak(s(4, '2026-09-26', 1), TODAY)).toBe(0);
    expect(isStreakBroken(s(4, '2026-09-26', 1), TODAY)).toBe(true);
  });
  it('is not broken when the clock moved back', () => {
    expect(isStreakBroken(s(4, '2026-10-02'), TODAY)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/game/streak.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`src/game/streak.ts`:
```ts
import type { DateKey } from '../types';
import { daysBetween } from './dates';

export interface StreakState { streak: number; lastActiveDate: DateKey | null; shields: number; }

export const MAX_SHIELDS = 2;
export const SHIELD_EVERY = 7;

export function applyActivity(state: StreakState, today: DateKey): StreakState {
  const { lastActiveDate } = state;
  if (lastActiveDate !== null && today <= lastActiveDate) return state;

  let { streak, shields } = state;
  if (lastActiveDate === null) {
    streak = 1;
  } else {
    const missed = daysBetween(lastActiveDate, today) - 1;
    if (missed === 0) {
      streak += 1;
    } else if (missed <= shields) {
      shields -= missed;
      streak += 1;
    } else {
      streak = 1;
    }
  }
  if (streak % SHIELD_EVERY === 0) shields = Math.min(shields + 1, MAX_SHIELDS);
  return { streak, lastActiveDate: today, shields };
}

export function isStreakBroken(state: StreakState, today: DateKey): boolean {
  if (state.lastActiveDate === null) return false;
  const missed = daysBetween(state.lastActiveDate, today) - 1;
  return missed > state.shields;
}

export function displayedStreak(state: StreakState, today: DateKey): number {
  if (state.lastActiveDate === null) return 0;
  return isStreakBroken(state, today) ? 0 : state.streak;
}
```

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game
git commit -m "feat(game): daily streaks with streak shields

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Achievements

**Files:**
- Create: `src/game/achievements.ts`
- Test: `src/game/achievements.test.ts`

**Interfaces:**
- Produces: `interface AchievementContext { completed; bossesSlain; earlyFinishes; streak; level; hasCustomNormal: boolean; customFrames: number; openQuests; overdueQuests }` (all others `number`), `interface AchievementDef { id; name; description; icon; check(ctx): boolean }`, `ACHIEVEMENTS: AchievementDef[]` (12 entries), `findNewAchievements(ctx: AchievementContext, unlocked: Record<string, string>): string[]`.

- [ ] **Step 1: Write the failing test**

`src/game/achievements.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, findNewAchievements, type AchievementContext } from './achievements';

const base: AchievementContext = {
  completed: 0, bossesSlain: 0, earlyFinishes: 0, streak: 0, level: 1,
  hasCustomNormal: false, customFrames: 0, openQuests: 0, overdueQuests: 0,
};

describe('achievements', () => {
  it('defines 12 unique achievements', () => {
    expect(ACHIEVEMENTS).toHaveLength(12);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(12);
  });

  it('unlocks nothing for a brand-new player', () => {
    expect(findNewAchievements(base, {})).toEqual([]);
  });

  it.each<[string, Partial<AchievementContext>]>([
    ['first-blood', { completed: 1 }],
    ['boss-slayer', { bossesSlain: 1 }],
    ['boss-hunter', { bossesSlain: 10 }],
    ['on-fire', { streak: 7 }],
    ['unstoppable', { streak: 30 }],
    ['early-bird', { earlyFinishes: 10 }],
    ['centurion', { completed: 100 }],
    ['level-10', { level: 10 }],
    ['level-25', { level: 25 }],
    ['artist', { hasCustomNormal: true, customFrames: 1 }],
    ['full-wardrobe', { hasCustomNormal: true, customFrames: 4 }],
    ['clean-slate', { openQuests: 5, overdueQuests: 0 }],
  ])('unlocks %s', (id, patch) => {
    expect(findNewAchievements({ ...base, ...patch }, {})).toContain(id);
  });

  it('does not unlock clean-slate with an overdue quest', () => {
    expect(findNewAchievements({ ...base, openQuests: 6, overdueQuests: 1 }, {})).not.toContain('clean-slate');
  });

  it('skips achievements that are already unlocked', () => {
    expect(findNewAchievements({ ...base, completed: 1 }, { 'first-blood': '2026-09-29T00:00:00.000Z' })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement**

`src/game/achievements.ts`:
```ts
export interface AchievementContext {
  completed: number;
  bossesSlain: number;
  earlyFinishes: number;
  streak: number;
  level: number;
  hasCustomNormal: boolean;
  customFrames: number;
  openQuests: number;
  overdueQuests: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  check: (ctx: AchievementContext) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-blood', name: 'First Blood', description: 'Complete your first quest.', icon: '⚔️', check: (c) => c.completed >= 1 },
  { id: 'boss-slayer', name: 'Boss Slayer', description: 'Defeat a Boss quest.', icon: '💀', check: (c) => c.bossesSlain >= 1 },
  { id: 'boss-hunter', name: 'Boss Hunter', description: 'Defeat 10 Boss quests.', icon: '👑', check: (c) => c.bossesSlain >= 10 },
  { id: 'on-fire', name: 'On Fire', description: 'Reach a 7-day streak.', icon: '🔥', check: (c) => c.streak >= 7 },
  { id: 'unstoppable', name: 'Unstoppable', description: 'Reach a 30-day streak.', icon: '☄️', check: (c) => c.streak >= 30 },
  { id: 'early-bird', name: 'Early Bird', description: 'Finish 10 quests before their deadline.', icon: '🐦', check: (c) => c.earlyFinishes >= 10 },
  { id: 'centurion', name: 'Centurion', description: 'Complete 100 quests.', icon: '💯', check: (c) => c.completed >= 100 },
  { id: 'level-10', name: 'Hero Rank', description: 'Reach level 10.', icon: '🛡️', check: (c) => c.level >= 10 },
  { id: 'level-25', name: 'Legend Rank', description: 'Reach level 25.', icon: '🌟', check: (c) => c.level >= 25 },
  { id: 'artist', name: 'Artist', description: 'Draw your own avatar.', icon: '🎨', check: (c) => c.hasCustomNormal },
  { id: 'full-wardrobe', name: 'Full Wardrobe', description: 'Draw all 4 avatar moods.', icon: '👕', check: (c) => c.customFrames >= 4 },
  { id: 'clean-slate', name: 'Clean Slate', description: 'Have 5+ open quests and none overdue.', icon: '🧹', check: (c) => c.openQuests >= 5 && c.overdueQuests === 0 },
];

export function findNewAchievements(ctx: AchievementContext, unlocked: Record<string, string>): string[] {
  return ACHIEVEMENTS.filter((a) => !unlocked[a.id] && a.check(ctx)).map((a) => a.id);
}
```

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game
git commit -m "feat(game): 12 achievements

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Default data, ids and quest progress (complete / un-complete / move)

**Files:**
- Create: `src/store/defaults.ts`, `src/store/progress.ts`, `src/test/fixtures.ts`
- Test: `src/store/defaults.test.ts`, `src/store/progress.test.ts`

**Interfaces:**
- Consumes: everything from `src/game/*`.
- Produces:
  - `defaults.ts`: `LABEL_COLORS: readonly string[]` (8), `newId(): string`, `createSettings(now: Date): Settings`, `createPlayer(): Player`, `createAvatar(): Avatar`, `createDefaultData(now?: Date): AppData` (columns "To Do", "Doing", "Done"(isDone) + one welcome quest in To Do).
  - `progress.ts`: `completeQuest(data, questId, now): Result`, `uncompleteQuest(data, questId): Result`, `moveQuest(data, questId, toColumnId, toIndex, now): Result`, `buildAchievementContext(data, now): AchievementContext`, `finalize(data, events, now): Result`.
  - `fixtures.ts`: `T0` (2026-09-29 10:00 local), `at(dayOffset, hour?)`, `makeQuest(partial)`, `emptyBoard(now?)`, `columnId(data, name)`, `withQuest(data, columnName, partial)`.

- [ ] **Step 1: Write fixtures and failing tests**

`src/test/fixtures.ts`:
```ts
import type { AppData, Quest } from '../types';
import { createDefaultData } from '../store/defaults';

export const T0 = new Date(2026, 8, 29, 10, 0); // 2026-09-29 local

export function at(dayOffset: number, hour = 10): Date {
  return new Date(2026, 8, 29 + dayOffset, hour, 0);
}

export function makeQuest(partial: Partial<Quest> & { id: string }): Quest {
  return {
    title: `Quest ${partial.id}`,
    description: '',
    difficulty: 'normal',
    deadline: null,
    labelIds: [],
    createdAt: T0.toISOString(),
    completion: null,
    ...partial,
  };
}

export function emptyBoard(now: Date = T0): AppData {
  const data = createDefaultData(now);
  return { ...data, quests: {}, columns: data.columns.map((c) => ({ ...c, questIds: [] })) };
}

export function columnId(data: AppData, name: string): string {
  const column = data.columns.find((c) => c.name === name);
  if (!column) throw new Error(`No column named ${name}`);
  return column.id;
}

export function withQuest(data: AppData, columnName: string, partial: Partial<Quest> & { id: string }): AppData {
  const quest = makeQuest(partial);
  const target = columnId(data, columnName);
  return {
    ...data,
    quests: { ...data.quests, [quest.id]: quest },
    columns: data.columns.map((c) => (c.id === target ? { ...c, questIds: [...c.questIds, quest.id] } : c)),
  };
}
```

`src/store/defaults.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createDefaultData, newId } from './defaults';
import { T0 } from '../test/fixtures';

describe('createDefaultData', () => {
  it('creates To Do / Doing / Done with one welcome quest', () => {
    const data = createDefaultData(T0);
    expect(data.columns.map((c) => c.name)).toEqual(['To Do', 'Doing', 'Done']);
    expect(data.columns.filter((c) => c.isDone).map((c) => c.name)).toEqual(['Done']);
    expect(data.columns[0].questIds).toHaveLength(1);
    expect(Object.keys(data.quests)).toEqual(data.columns[0].questIds);
    expect(data.player.totalXp).toBe(0);
    expect(data.settings.installedAt).toBe(T0.toISOString());
    expect(data.settings.musicOn).toBe(false);
  });
});

describe('newId', () => {
  it('returns unique ids', () => {
    expect(newId()).not.toBe(newId());
  });
  it('falls back when crypto.randomUUID is unavailable (plain-http LAN access)', () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const a = newId();
      const b = newId();
      expect(a).not.toBe(b);
      expect(a.length).toBeGreaterThan(8);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
    }
  });
});
```

`src/store/progress.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { AppData } from '../types';
import { finalize, moveQuest } from './progress';
import { T0, at, columnId, emptyBoard, withQuest } from '../test/fixtures';

const toDone = (data: AppData, id: string, now = T0) => moveQuest(data, id, columnId(data, 'Done'), 0, now);
const toTodo = (data: AppData, id: string, now = T0) => moveQuest(data, id, columnId(data, 'To Do'), 0, now);

describe('moveQuest into Done', () => {
  it('awards XP, starts the streak and unlocks First Blood', () => {
    const data = withQuest(emptyBoard(), 'To Do', { id: 'q1' });
    const { data: next, events } = toDone(data, 'q1');
    expect(next.player.totalXp).toBe(26); // 25 * 1.05 (streak 1)
    expect(next.player.streak).toBe(1);
    expect(next.player.lastActiveDate).toBe('2026-09-29');
    expect(next.player.stats.completed).toBe(1);
    expect(next.quests.q1.completion).toEqual({ at: T0.toISOString(), xp: 26, difficulty: 'normal', early: false });
    expect(events).toEqual([
      { type: 'questCompleted', questId: 'q1', xp: 26, difficulty: 'normal' },
      { type: 'achievement', id: 'first-blood' },
    ]);
    expect(next.player.unlockedAchievements['first-blood']).toBe(T0.toISOString());
  });

  it('halves XP when late and adds 50% when on time', () => {
    const late = toDone(withQuest(emptyBoard(), 'To Do', { id: 'q', deadline: '2026-09-28' }), 'q');
    expect(late.data.player.totalXp).toBe(13);
    const early = toDone(withQuest(emptyBoard(), 'To Do', { id: 'q', deadline: '2026-09-29' }), 'q');
    expect(early.data.player.totalXp).toBe(39);
    expect(early.data.player.stats.earlyFinishes).toBe(1);
  });

  it('emits a single levelUp with the final level on multi-level jumps', () => {
    let data = withQuest(emptyBoard(), 'To Do', { id: 'boss', difficulty: 'boss', deadline: '2026-09-30' });
    data = { ...data, player: { ...data.player, totalXp: 95, streak: 9, lastActiveDate: '2026-09-28' } };
    const { data: next, events } = toDone(data, 'boss');
    expect(next.player.totalXp).toBe(320); // 95 + 100*1.5*1.5
    expect(events.filter((e) => e.type === 'levelUp')).toEqual([{ type: 'levelUp', level: 3 }]);
    expect(next.player.stats.bossesSlain).toBe(1);
  });

  it('does not re-award XP when reordering inside Done', () => {
    const done = toDone(withQuest(emptyBoard(), 'To Do', { id: 'q1' }), 'q1').data;
    const again = moveQuest(done, 'q1', columnId(done, 'Done'), 5, T0);
    expect(again.data.player.totalXp).toBe(26);
    expect(again.events).toEqual([]);
  });
});

describe('moveQuest out of Done', () => {
  it('removes exactly the awarded XP and stats (no XP farming)', () => {
    const done = toDone(withQuest(emptyBoard(), 'To Do', { id: 'q1' }), 'q1').data;
    const back = toTodo(done, 'q1');
    expect(back.data.player.totalXp).toBe(0);
    expect(back.data.player.stats.completed).toBe(0);
    expect(back.data.quests.q1.completion).toBeNull();
    expect(back.events).toEqual([{ type: 'questUncompleted', questId: 'q1', xp: 26 }]);
    const redo = toDone(back.data, 'q1');
    expect(redo.data.player.totalXp).toBe(26);
    expect(redo.events.some((e) => e.type === 'achievement')).toBe(false); // First Blood only once
  });

  it('uses the difficulty recorded at completion time', () => {
    const done = toDone(withQuest(emptyBoard(), 'To Do', { id: 'b', difficulty: 'boss' }), 'b').data;
    expect(done.player.totalXp).toBe(105);
    const edited: AppData = { ...done, quests: { ...done.quests, b: { ...done.quests.b, difficulty: 'easy' } } };
    const back = toTodo(edited, 'b');
    expect(back.data.player.totalXp).toBe(0);
    expect(back.data.player.stats.bossesSlain).toBe(0);
  });

  it('keeps the streak when un-completing', () => {
    const done = toDone(withQuest(emptyBoard(), 'To Do', { id: 'q1' }), 'q1').data;
    expect(toTodo(done, 'q1').data.player.streak).toBe(1);
  });
});

describe('moveQuest ordering', () => {
  it('clamps the target index', () => {
    let data = withQuest(emptyBoard(), 'To Do', { id: 'a' });
    data = withQuest(data, 'To Do', { id: 'b' });
    const next = moveQuest(data, 'a', columnId(data, 'To Do'), 99, T0).data;
    expect(next.columns[0].questIds).toEqual(['b', 'a']);
  });
  it('ignores unknown quests and columns', () => {
    const data = withQuest(emptyBoard(), 'To Do', { id: 'a' });
    expect(moveQuest(data, 'nope', columnId(data, 'Done'), 0, T0).data).toBe(data);
    expect(moveQuest(data, 'a', 'nope', 0, T0).data).toBe(data);
  });
});

describe('finalize', () => {
  it('unlocks Clean Slate with 5 open quests and none overdue', () => {
    let data = emptyBoard();
    for (const id of ['a', 'b', 'c', 'd', 'e']) data = withQuest(data, 'To Do', { id });
    expect(finalize(data, [], T0).events).toEqual([{ type: 'achievement', id: 'clean-slate' }]);
  });
  it('does not unlock Clean Slate when one quest is overdue', () => {
    let data = emptyBoard();
    for (const id of ['a', 'b', 'c', 'd']) data = withQuest(data, 'To Do', { id });
    data = withQuest(data, 'To Do', { id: 'late', deadline: '2026-09-28' });
    expect(finalize(data, [], at(0)).events).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/store` → FAIL.

- [ ] **Step 3: Implement**

`src/store/defaults.ts`:
```ts
import type { AppData, Avatar, Player, Quest, Settings } from '../types';

export const LABEL_COLORS = ['#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#41a6f6', '#3b5dc9', '#5d275d'] as const;

let fallbackCounter = 0;

/** crypto.randomUUID only exists in secure contexts (https / localhost). */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  fallbackCounter += 1;
  return `id-${Date.now().toString(36)}-${fallbackCounter.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createSettings(now: Date): Settings {
  return {
    sfxVolume: 0.6,
    musicVolume: 0.4,
    musicOn: false,
    muted: false,
    theme: 'dark',
    lastExportAt: null,
    installedAt: now.toISOString(),
    backupSnoozedUntil: null,
  };
}

export function createPlayer(): Player {
  return {
    totalXp: 0,
    streak: 0,
    lastActiveDate: null,
    shields: 0,
    stats: { completed: 0, bossesSlain: 0, earlyFinishes: 0 },
    unlockedAchievements: {},
  };
}

export function createAvatar(): Avatar {
  return { frames: { normal: null, happy: null, levelUp: null, sad: null } };
}

export function createDefaultData(now: Date = new Date()): AppData {
  const welcome: Quest = {
    id: newId(),
    title: 'Welcome, hero! Drag me to Done',
    description:
      'Create quests with "+ New Quest", pick a difficulty and a deadline, then drag them across the board. Finishing quests in the Done column earns XP!',
    difficulty: 'easy',
    deadline: null,
    labelIds: [],
    createdAt: now.toISOString(),
    completion: null,
  };
  return {
    schemaVersion: 1,
    columns: [
      { id: newId(), name: 'To Do', questIds: [welcome.id], isDone: false },
      { id: newId(), name: 'Doing', questIds: [], isDone: false },
      { id: newId(), name: 'Done', questIds: [], isDone: true },
    ],
    quests: { [welcome.id]: welcome },
    labels: [],
    player: createPlayer(),
    avatar: createAvatar(),
    settings: createSettings(now),
  };
}
```

`src/store/progress.ts`:
```ts
import type { AppData, GameEvent, Quest, Result } from '../types';
import { toDateKey } from '../game/dates';
import { calculateXp, getTiming } from '../game/xp';
import { levelFromXp } from '../game/level';
import { applyActivity } from '../game/streak';
import { isOverdue } from '../game/deadline';
import { findNewAchievements, type AchievementContext } from '../game/achievements';

export function completeQuest(data: AppData, questId: string, now: Date): Result {
  const quest = data.quests[questId];
  if (!quest || quest.completion) return { data, events: [] };

  const today = toDateKey(now);
  const { player } = data;
  const streak = applyActivity(
    { streak: player.streak, lastActiveDate: player.lastActiveDate, shields: player.shields },
    today,
  );
  const timing = getTiming(quest.deadline, today);
  const xp = calculateXp(quest.difficulty, timing, streak.streak);
  const early = timing === 'early';
  const totalXp = player.totalXp + xp;

  const events: GameEvent[] = [{ type: 'questCompleted', questId, xp, difficulty: quest.difficulty }];
  const after = levelFromXp(totalXp);
  if (after > levelFromXp(player.totalXp)) events.push({ type: 'levelUp', level: after });

  const completed: Quest = { ...quest, completion: { at: now.toISOString(), xp, difficulty: quest.difficulty, early } };
  return {
    data: {
      ...data,
      quests: { ...data.quests, [questId]: completed },
      player: {
        ...player,
        ...streak,
        totalXp,
        stats: {
          completed: player.stats.completed + 1,
          bossesSlain: player.stats.bossesSlain + (quest.difficulty === 'boss' ? 1 : 0),
          earlyFinishes: player.stats.earlyFinishes + (early ? 1 : 0),
        },
      },
    },
    events,
  };
}

export function uncompleteQuest(data: AppData, questId: string): Result {
  const quest = data.quests[questId];
  if (!quest?.completion) return { data, events: [] };
  const { xp, difficulty, early } = quest.completion;
  const { player } = data;
  return {
    data: {
      ...data,
      quests: { ...data.quests, [questId]: { ...quest, completion: null } },
      player: {
        ...player,
        totalXp: Math.max(0, player.totalXp - xp),
        stats: {
          completed: Math.max(0, player.stats.completed - 1),
          bossesSlain: Math.max(0, player.stats.bossesSlain - (difficulty === 'boss' ? 1 : 0)),
          earlyFinishes: Math.max(0, player.stats.earlyFinishes - (early ? 1 : 0)),
        },
      },
    },
    events: [{ type: 'questUncompleted', questId, xp }],
  };
}

export function moveQuest(data: AppData, questId: string, toColumnId: string, toIndex: number, now: Date): Result {
  const quest = data.quests[questId];
  const target = data.columns.find((c) => c.id === toColumnId);
  if (!quest || !target) return { data, events: [] };

  const columns = data.columns.map((c) => ({ ...c, questIds: c.questIds.filter((id) => id !== questId) }));
  const dest = columns.find((c) => c.id === toColumnId)!;
  dest.questIds.splice(Math.max(0, Math.min(toIndex, dest.questIds.length)), 0, questId);

  let result: Result = { data: { ...data, columns }, events: [] };
  if (target.isDone && !quest.completion) result = completeQuest(result.data, questId, now);
  else if (!target.isDone && quest.completion) result = uncompleteQuest(result.data, questId);
  return finalize(result.data, result.events, now);
}

export function buildAchievementContext(data: AppData, now: Date): AchievementContext {
  const today = toDateKey(now);
  const open = Object.values(data.quests).filter((q) => q.completion === null);
  const frames = Object.values(data.avatar.frames);
  return {
    ...data.player.stats,
    streak: data.player.streak,
    level: levelFromXp(data.player.totalXp),
    hasCustomNormal: data.avatar.frames.normal !== null,
    customFrames: frames.filter((f) => f !== null).length,
    openQuests: open.length,
    overdueQuests: open.filter((q) => isOverdue(q, today)).length,
  };
}

export function finalize(data: AppData, events: GameEvent[], now: Date): Result {
  const ids = findNewAchievements(buildAchievementContext(data, now), data.player.unlockedAchievements);
  if (ids.length === 0) return { data, events };
  const stamp = now.toISOString();
  const unlocked = { ...data.player.unlockedAchievements };
  for (const id of ids) unlocked[id] = stamp;
  return {
    data: { ...data, player: { ...data.player, unlockedAchievements: unlocked } },
    events: [...events, ...ids.map((id): GameEvent => ({ type: 'achievement', id }))],
  };
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/store` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store src/test/fixtures.ts
git commit -m "feat(store): default board and quest completion rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Board editing (quests, columns, labels, avatar)

**Files:**
- Create: `src/store/board.ts`
- Test: `src/store/board.test.ts`

**Interfaces:**
- Consumes: `newId` (defaults), `completeQuest`, `finalize` (progress).
- Produces: `MAX_TITLE_LENGTH = 120`, `MAX_COLUMN_NAME_LENGTH = 30`, `MAX_LABEL_NAME_LENGTH = 20`, `interface QuestInput { title: string; description?; difficulty?; deadline?: DateKey | null; labelIds? }`, `type QuestPatch = Partial<Pick<Quest, 'title'|'description'|'difficulty'|'deadline'|'labelIds'>>`, and (all returning `Result`):
  `addQuest(data, columnId, input, now)` (sets `createdId`), `updateQuest(data, questId, patch, now)`, `deleteQuest(data, questId, now)`, `addColumn(data, name)` (sets `createdId`), `renameColumn(data, columnId, name)`, `deleteColumn(data, columnId, now)`, `setDoneColumn(data, columnId)`, `moveColumn(data, from, to)`, `addLabel(data, name, color)` (sets `createdId`), `deleteLabel(data, labelId)`, `saveAvatar(data, frames: AvatarFrames, now)`, `resetAvatar(data)`.
  Error strings (exact): `'Quest title cannot be empty.'`, `'That column no longer exists.'`, `'That quest no longer exists.'`, `'Column name cannot be empty.'`, `'Pick another Done column before deleting this one.'`, `'Add another column first — these quests need somewhere to go.'`, `'Label name cannot be empty.'`.

- [ ] **Step 1: Write the failing tests**

`src/store/board.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { AppData, Frame } from '../types';
import {
  addColumn, addLabel, addQuest, deleteColumn, deleteLabel, deleteQuest, moveColumn,
  renameColumn, resetAvatar, saveAvatar, setDoneColumn, updateQuest,
} from './board';
import { moveQuest } from './progress';
import { T0, columnId, emptyBoard, withQuest } from '../test/fixtures';

const blank = (): Frame => Array(1024).fill(null);

describe('quests', () => {
  it('adds a trimmed quest with defaults at the end of the column', () => {
    const data = withQuest(emptyBoard(), 'To Do', { id: 'first' });
    const r = addQuest(data, columnId(data, 'To Do'), { title: '  Đánh boss cuối  ' }, T0);
    expect(r.error).toBeUndefined();
    const q = r.data.quests[r.createdId!];
    expect(q.title).toBe('Đánh boss cuối');
    expect(q.difficulty).toBe('normal');
    expect(r.data.columns[0].questIds).toEqual(['first', r.createdId]);
  });

  it('rejects an empty title and leaves data untouched', () => {
    const data = emptyBoard();
    const r = addQuest(data, columnId(data, 'To Do'), { title: '   ' }, T0);
    expect(r.error).toBe('Quest title cannot be empty.');
    expect(r.data).toBe(data);
  });

  it('truncates titles to 120 characters', () => {
    const data = emptyBoard();
    const r = addQuest(data, columnId(data, 'To Do'), { title: 'x'.repeat(200) }, T0);
    expect(r.data.quests[r.createdId!].title).toHaveLength(120);
  });

  it('completes a quest created directly in the Done column', () => {
    const data = emptyBoard();
    const r = addQuest(data, columnId(data, 'Done'), { title: 'Already done' }, T0);
    expect(r.data.quests[r.createdId!].completion).not.toBeNull();
    expect(r.events[0]).toMatchObject({ type: 'questCompleted' });
  });

  it('updates fields but never changes awarded XP', () => {
    let data = withQuest(emptyBoard(), 'To Do', { id: 'q' });
    data = moveQuest(data, 'q', columnId(data, 'Done'), 0, T0).data;
    const r = updateQuest(data, 'q', { difficulty: 'boss', title: 'Renamed' }, T0);
    expect(r.data.quests.q.title).toBe('Renamed');
    expect(r.data.player.totalXp).toBe(data.player.totalXp);
    expect(updateQuest(data, 'q', { title: '  ' }, T0).error).toBe('Quest title cannot be empty.');
  });

  it('keeps XP when a completed quest is deleted', () => {
    let data = withQuest(emptyBoard(), 'To Do', { id: 'q' });
    data = moveQuest(data, 'q', columnId(data, 'Done'), 0, T0).data;
    const r = deleteQuest(data, 'q', T0);
    expect(r.data.quests.q).toBeUndefined();
    expect(r.data.columns.every((c) => !c.questIds.includes('q'))).toBe(true);
    expect(r.data.player.totalXp).toBe(26);
  });
});

describe('columns', () => {
  it('adds a column with a default name', () => {
    const r = addColumn(emptyBoard(), '   ');
    expect(r.data.columns.at(-1)!.name).toBe('New Column');
    expect(r.createdId).toBe(r.data.columns.at(-1)!.id);
  });

  it('renames, rejecting empty names', () => {
    const data = emptyBoard();
    expect(renameColumn(data, columnId(data, 'Doing'), 'In Battle').data.columns[1].name).toBe('In Battle');
    expect(renameColumn(data, columnId(data, 'Doing'), ' ').error).toBe('Column name cannot be empty.');
  });

  it('refuses to delete the Done column', () => {
    const data = emptyBoard();
    expect(deleteColumn(data, columnId(data, 'Done'), T0).error).toBe('Pick another Done column before deleting this one.');
  });

  it('moves quests of a deleted column to the first non-Done column', () => {
    let data = withQuest(emptyBoard(), 'To Do', { id: 'a' });
    data = withQuest(data, 'Doing', { id: 'b' });
    const r = deleteColumn(data, columnId(data, 'Doing'), T0);
    expect(r.data.columns.map((c) => c.name)).toEqual(['To Do', 'Done']);
    expect(r.data.columns[0].questIds).toEqual(['a', 'b']);
  });

  it('refuses to delete the only non-Done column while it holds quests', () => {
    let data: AppData = emptyBoard();
    data = { ...data, columns: data.columns.filter((c) => c.name !== 'Doing') };
    data = withQuest(data, 'To Do', { id: 'a' });
    const r = deleteColumn(data, columnId(data, 'To Do'), T0);
    expect(r.error).toBe('Add another column first — these quests need somewhere to go.');
    expect(r.data.quests.a).toBeDefined();
  });

  it('switches the Done column so exactly one is Done', () => {
    const data = emptyBoard();
    const r = setDoneColumn(data, columnId(data, 'Doing'));
    expect(r.data.columns.filter((c) => c.isDone).map((c) => c.name)).toEqual(['Doing']);
  });

  it('reorders columns', () => {
    const r = moveColumn(emptyBoard(), 0, 2);
    expect(r.data.columns.map((c) => c.name)).toEqual(['Doing', 'Done', 'To Do']);
    expect(moveColumn(emptyBoard(), 0, 9).data.columns.map((c) => c.name)).toEqual(['To Do', 'Doing', 'Done']);
  });
});

describe('labels', () => {
  it('adds and deletes labels, removing them from quests', () => {
    let data = withQuest(emptyBoard(), 'To Do', { id: 'q' });
    const added = addLabel(data, ' Học ', '#41a6f6');
    const labelId = added.createdId!;
    data = updateQuest(added.data, 'q', { labelIds: [labelId] }, T0).data;
    const r = deleteLabel(data, labelId);
    expect(r.data.labels).toEqual([]);
    expect(r.data.quests.q.labelIds).toEqual([]);
    expect(addLabel(data, ' ', '#fff').error).toBe('Label name cannot be empty.');
  });
});

describe('avatar', () => {
  it('stores blank frames as null', () => {
    const r = saveAvatar(emptyBoard(), { normal: blank(), happy: null, levelUp: blank(), sad: null }, T0);
    expect(r.data.avatar.frames).toEqual({ normal: null, happy: null, levelUp: null, sad: null });
  });
  it('unlocks Artist when a normal frame is drawn, and resets', () => {
    const drawn = blank();
    drawn[0] = '#1a1c2c';
    const r = saveAvatar(emptyBoard(), { normal: drawn, happy: null, levelUp: null, sad: null }, T0);
    expect(r.events).toContainEqual({ type: 'achievement', id: 'artist' });
    expect(resetAvatar(r.data).data.avatar.frames.normal).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/store/board.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`src/store/board.ts`:
```ts
import type { AppData, AvatarFrames, Column, DateKey, Difficulty, Frame, GameEvent, Label, Quest, Result } from '../types';
import { createAvatar, newId } from './defaults';
import { completeQuest, finalize } from './progress';

export const MAX_TITLE_LENGTH = 120;
export const MAX_COLUMN_NAME_LENGTH = 30;
export const MAX_LABEL_NAME_LENGTH = 20;

export interface QuestInput {
  title: string;
  description?: string;
  difficulty?: Difficulty;
  deadline?: DateKey | null;
  labelIds?: string[];
}
export type QuestPatch = Partial<Pick<Quest, 'title' | 'description' | 'difficulty' | 'deadline' | 'labelIds'>>;

const unchanged = (data: AppData): Result => ({ data, events: [] });
const fail = (data: AppData, error: string): Result => ({ data, events: [], error });
const clean = (raw: string, max: number): string | null => {
  const text = raw.trim();
  return text ? text.slice(0, max) : null;
};

export function addQuest(data: AppData, columnId: string, input: QuestInput, now: Date): Result {
  const title = clean(input.title, MAX_TITLE_LENGTH);
  if (!title) return fail(data, 'Quest title cannot be empty.');
  const column = data.columns.find((c) => c.id === columnId);
  if (!column) return fail(data, 'That column no longer exists.');

  const quest: Quest = {
    id: newId(),
    title,
    description: input.description ?? '',
    difficulty: input.difficulty ?? 'normal',
    deadline: input.deadline ?? null,
    labelIds: input.labelIds ?? [],
    createdAt: now.toISOString(),
    completion: null,
  };
  let next: AppData = {
    ...data,
    quests: { ...data.quests, [quest.id]: quest },
    columns: data.columns.map((c) => (c.id === columnId ? { ...c, questIds: [...c.questIds, quest.id] } : c)),
  };
  let events: GameEvent[] = [];
  if (column.isDone) ({ data: next, events } = completeQuest(next, quest.id, now));
  return { ...finalize(next, events, now), createdId: quest.id };
}

export function updateQuest(data: AppData, questId: string, patch: QuestPatch, now: Date): Result {
  const quest = data.quests[questId];
  if (!quest) return fail(data, 'That quest no longer exists.');
  const next: Quest = { ...quest, ...patch };
  if (patch.title !== undefined) {
    const title = clean(patch.title, MAX_TITLE_LENGTH);
    if (!title) return fail(data, 'Quest title cannot be empty.');
    next.title = title;
  }
  return finalize({ ...data, quests: { ...data.quests, [questId]: next } }, [], now);
}

export function deleteQuest(data: AppData, questId: string, now: Date): Result {
  if (!data.quests[questId]) return unchanged(data);
  const quests = { ...data.quests };
  delete quests[questId];
  const columns = data.columns.map((c) => ({ ...c, questIds: c.questIds.filter((id) => id !== questId) }));
  return finalize({ ...data, quests, columns }, [], now);
}

export function addColumn(data: AppData, name: string): Result {
  const column: Column = { id: newId(), name: clean(name, MAX_COLUMN_NAME_LENGTH) ?? 'New Column', questIds: [], isDone: false };
  return { data: { ...data, columns: [...data.columns, column] }, events: [], createdId: column.id };
}

export function renameColumn(data: AppData, columnId: string, name: string): Result {
  const clean_ = clean(name, MAX_COLUMN_NAME_LENGTH);
  if (!clean_) return fail(data, 'Column name cannot be empty.');
  return unchanged({ ...data, columns: data.columns.map((c) => (c.id === columnId ? { ...c, name: clean_ } : c)) });
}

export function deleteColumn(data: AppData, columnId: string, now: Date): Result {
  const column = data.columns.find((c) => c.id === columnId);
  if (!column) return unchanged(data);
  if (column.isDone) return fail(data, 'Pick another Done column before deleting this one.');
  const target = data.columns.find((c) => c.id !== columnId && !c.isDone);
  if (column.questIds.length > 0 && !target) {
    return fail(data, 'Add another column first — these quests need somewhere to go.');
  }
  const columns = data.columns
    .filter((c) => c.id !== columnId)
    .map((c) => (c.id === target?.id ? { ...c, questIds: [...c.questIds, ...column.questIds] } : c));
  return finalize({ ...data, columns }, [], now);
}

export function setDoneColumn(data: AppData, columnId: string): Result {
  if (!data.columns.some((c) => c.id === columnId)) return unchanged(data);
  return unchanged({ ...data, columns: data.columns.map((c) => ({ ...c, isDone: c.id === columnId })) });
}

export function moveColumn(data: AppData, from: number, to: number): Result {
  const n = data.columns.length;
  if (from < 0 || from >= n || to < 0 || to >= n || from === to) return unchanged(data);
  const columns = [...data.columns];
  const [moved] = columns.splice(from, 1);
  columns.splice(to, 0, moved);
  return unchanged({ ...data, columns });
}

export function addLabel(data: AppData, name: string, color: string): Result {
  const clean_ = clean(name, MAX_LABEL_NAME_LENGTH);
  if (!clean_) return fail(data, 'Label name cannot be empty.');
  const label: Label = { id: newId(), name: clean_, color };
  return { data: { ...data, labels: [...data.labels, label] }, events: [], createdId: label.id };
}

export function deleteLabel(data: AppData, labelId: string): Result {
  const quests: Record<string, Quest> = {};
  for (const [id, q] of Object.entries(data.quests)) {
    quests[id] = q.labelIds.includes(labelId) ? { ...q, labelIds: q.labelIds.filter((l) => l !== labelId) } : q;
  }
  return unchanged({ ...data, labels: data.labels.filter((l) => l.id !== labelId), quests });
}

const isBlank = (frame: Frame | null): boolean => !frame || frame.every((c) => c === null);

export function saveAvatar(data: AppData, frames: AvatarFrames, now: Date): Result {
  const normalized: AvatarFrames = {
    normal: isBlank(frames.normal) ? null : frames.normal,
    happy: isBlank(frames.happy) ? null : frames.happy,
    levelUp: isBlank(frames.levelUp) ? null : frames.levelUp,
    sad: isBlank(frames.sad) ? null : frames.sad,
  };
  return finalize({ ...data, avatar: { frames: normalized } }, [], now);
}

export function resetAvatar(data: AppData): Result {
  return unchanged({ ...data, avatar: createAvatar() });
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/store` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store
git commit -m "feat(store): quest, column, label and avatar editing rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Backup export/import validation and backup reminder

**Files:**
- Create: `src/store/persistence.ts`
- Test: `src/store/persistence.test.ts`

**Interfaces:**
- Consumes: `createSettings`, types.
- Produces: `serialize(data: AppData): string`, `backupFileName(now: Date): string`, `type ImportResult = { ok: true; data: AppData } | { ok: false; error: string }`, `validateData(raw: unknown, now?: Date): ImportResult`, `parseBackup(text: string, now?: Date): ImportResult`, `shouldShowBackupReminder(data: AppData, now: Date): boolean`.
  Error strings: `'This file is not valid JSON.'`, `'This backup was made by an unsupported version of Quest Board.'`, `'This backup file is damaged or incomplete.'`.

- [ ] **Step 1: Write the failing tests**

`src/store/persistence.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { AppData } from '../types';
import { backupFileName, parseBackup, serialize, shouldShowBackupReminder, validateData } from './persistence';
import { T0, emptyBoard, withQuest } from '../test/fixtures';

const DAY = 86_400_000;
const clone = (d: AppData) => JSON.parse(JSON.stringify(d));

describe('parseBackup', () => {
  it('round-trips exported data', () => {
    const data = withQuest(emptyBoard(), 'To Do', { id: 'q', title: 'Học tiếng Nhật' });
    const r = parseBackup(serialize(data));
    expect(r).toEqual({ ok: true, data });
  });
  it('rejects invalid JSON', () => {
    expect(parseBackup('{oops')).toEqual({ ok: false, error: 'This file is not valid JSON.' });
  });
  it('rejects other schema versions', () => {
    expect(validateData({ ...clone(emptyBoard()), schemaVersion: 2 })).toEqual({
      ok: false, error: 'This backup was made by an unsupported version of Quest Board.',
    });
  });
  it.each([
    ['two Done columns', (d: any) => { d.columns[0].isDone = true; }],
    ['a column pointing at a missing quest', (d: any) => { d.columns[0].questIds.push('ghost'); }],
    ['a quest listed in two columns', (d: any) => { d.columns[1].questIds.push('q'); }],
    ['a bad difficulty', (d: any) => { d.quests.q.difficulty = 'legendary'; }],
    ['a frame of the wrong size', (d: any) => { d.avatar.frames.normal = [null]; }],
    ['a missing player', (d: any) => { delete d.player; }],
  ])('rejects %s', (_name, mutate) => {
    const raw = clone(withQuest(emptyBoard(), 'To Do', { id: 'q' }));
    mutate(raw);
    expect(validateData(raw)).toEqual({ ok: false, error: 'This backup file is damaged or incomplete.' });
  });
  it('fills missing or invalid settings with defaults', () => {
    const raw = clone(emptyBoard());
    raw.settings = { theme: 'neon', musicOn: true };
    const r = validateData(raw, T0);
    expect(r.ok && r.data.settings.theme).toBe('dark');
    expect(r.ok && r.data.settings.musicOn).toBe(true);
    expect(r.ok && r.data.settings.sfxVolume).toBe(0.6);
  });
  it('drops quests that are not on any column', () => {
    const raw = clone(emptyBoard());
    raw.quests.orphan = { ...clone(withQuest(emptyBoard(), 'To Do', { id: 'orphan' })).quests.orphan };
    const r = validateData(raw);
    expect(r.ok && r.data.quests.orphan).toBeUndefined();
  });
});

describe('backupFileName', () => {
  it('uses the local date', () => expect(backupFileName(T0)).toBe('quest-board-backup-2026-09-29.json'));
});

describe('shouldShowBackupReminder', () => {
  const withSettings = (patch: Partial<AppData['settings']>) => {
    const data = withQuest(emptyBoard(T0), 'To Do', { id: 'q' });
    return { ...data, settings: { ...data.settings, ...patch } };
  };
  it('stays quiet on an empty board', () => {
    expect(shouldShowBackupReminder(emptyBoard(T0), new Date(T0.getTime() + 30 * DAY))).toBe(false);
  });
  it('asks after 3 days if never exported', () => {
    expect(shouldShowBackupReminder(withSettings({}), new Date(T0.getTime() + 2 * DAY))).toBe(false);
    expect(shouldShowBackupReminder(withSettings({}), new Date(T0.getTime() + 3 * DAY))).toBe(true);
  });
  it('asks 7 days after the last export', () => {
    const data = withSettings({ lastExportAt: T0.toISOString() });
    expect(shouldShowBackupReminder(data, new Date(T0.getTime() + 6 * DAY))).toBe(false);
    expect(shouldShowBackupReminder(data, new Date(T0.getTime() + 7 * DAY))).toBe(true);
  });
  it('respects snoozing', () => {
    const data = withSettings({ backupSnoozedUntil: new Date(T0.getTime() + 5 * DAY).toISOString() });
    expect(shouldShowBackupReminder(data, new Date(T0.getTime() + 4 * DAY))).toBe(false);
    expect(shouldShowBackupReminder(data, new Date(T0.getTime() + 6 * DAY))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement**

`src/store/persistence.ts`:
```ts
import type { AppData, AvatarFrames, Column, Frame, Label, Player, Quest, Settings } from '../types';
import { MOODS } from '../types';
import { toDateKey } from '../game/dates';
import { createSettings } from './defaults';

export type ImportResult = { ok: true; data: AppData } | { ok: false; error: string };

type Obj = Record<string, unknown>;
const DAMAGED: ImportResult = { ok: false, error: 'This backup file is damaged or incomplete.' };
const DIFFICULTIES = ['easy', 'normal', 'hard', 'boss'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const isNullableStr = (v: unknown): v is string | null => v === null || isStr(v);

function isQuest(v: unknown): v is Quest {
  if (!isObj(v)) return false;
  const c = v.completion;
  const completionOk =
    c === null ||
    (isObj(c) && isStr(c.at) && isNum(c.xp) && DIFFICULTIES.includes(c.difficulty as string) && isBool(c.early));
  return (
    isStr(v.id) && isStr(v.title) && isStr(v.description) &&
    DIFFICULTIES.includes(v.difficulty as string) &&
    (v.deadline === null || (isStr(v.deadline) && DATE_RE.test(v.deadline))) &&
    isStrArr(v.labelIds) && isStr(v.createdAt) && completionOk
  );
}

const isColumn = (v: unknown): v is Column =>
  isObj(v) && isStr(v.id) && isStr(v.name) && isStrArr(v.questIds) && isBool(v.isDone);

const isLabel = (v: unknown): v is Label => isObj(v) && isStr(v.id) && isStr(v.name) && isStr(v.color);

function isPlayer(v: unknown): v is Player {
  if (!isObj(v) || !isObj(v.stats) || !isObj(v.unlockedAchievements)) return false;
  const s = v.stats;
  return (
    isNum(v.totalXp) && v.totalXp >= 0 && isNum(v.streak) && isNullableStr(v.lastActiveDate) && isNum(v.shields) &&
    isNum(s.completed) && isNum(s.bossesSlain) && isNum(s.earlyFinishes) &&
    Object.values(v.unlockedAchievements).every(isStr)
  );
}

const isFrame = (v: unknown): v is Frame | null =>
  v === null || (Array.isArray(v) && v.length === 1024 && v.every((c) => c === null || isStr(c)));

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function pickSettings(s: Obj): Partial<Settings> {
  const out: Partial<Settings> = {};
  if (isNum(s.sfxVolume)) out.sfxVolume = clamp01(s.sfxVolume);
  if (isNum(s.musicVolume)) out.musicVolume = clamp01(s.musicVolume);
  if (isBool(s.musicOn)) out.musicOn = s.musicOn;
  if (isBool(s.muted)) out.muted = s.muted;
  if (s.theme === 'dark' || s.theme === 'light') out.theme = s.theme;
  if (isNullableStr(s.lastExportAt)) out.lastExportAt = s.lastExportAt;
  if (isStr(s.installedAt)) out.installedAt = s.installedAt;
  if (isNullableStr(s.backupSnoozedUntil)) out.backupSnoozedUntil = s.backupSnoozedUntil;
  return out;
}

export function validateData(raw: unknown, now: Date = new Date()): ImportResult {
  if (!isObj(raw)) return DAMAGED;
  if (raw.schemaVersion !== 1) {
    return { ok: false, error: 'This backup was made by an unsupported version of Quest Board.' };
  }
  const { columns, quests, labels, player, avatar } = raw;
  if (!Array.isArray(columns) || !columns.every(isColumn)) return DAMAGED;
  if (columns.filter((c) => c.isDone).length !== 1) return DAMAGED;
  if (!isObj(quests) || !Object.values(quests).every(isQuest)) return DAMAGED;
  const questMap = quests as Record<string, Quest>;
  const placed = columns.flatMap((c) => c.questIds);
  if (new Set(placed).size !== placed.length) return DAMAGED;
  if (!placed.every((id) => questMap[id]?.id === id)) return DAMAGED;
  if (!Array.isArray(labels) || !labels.every(isLabel)) return DAMAGED;
  if (!isPlayer(player)) return DAMAGED;
  if (!isObj(avatar) || !isObj(avatar.frames)) return DAMAGED;
  const rawFrames = avatar.frames;
  if (!MOODS.every((m) => isFrame(rawFrames[m]))) return DAMAGED;

  const placedSet = new Set(placed);
  const keptQuests = Object.fromEntries(Object.entries(questMap).filter(([id]) => placedSet.has(id)));
  const frames = Object.fromEntries(MOODS.map((m) => [m, rawFrames[m] as Frame | null])) as AvatarFrames;
  const settings: Settings = { ...createSettings(now), ...(isObj(raw.settings) ? pickSettings(raw.settings) : {}) };

  return {
    ok: true,
    data: { schemaVersion: 1, columns, quests: keptQuests, labels, player, avatar: { frames }, settings },
  };
}

export function parseBackup(text: string, now: Date = new Date()): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }
  return validateData(raw, now);
}

export function serialize(data: AppData): string {
  return JSON.stringify(data, null, 2);
}

export function backupFileName(now: Date): string {
  return `quest-board-backup-${toDateKey(now)}.json`;
}

export function shouldShowBackupReminder(data: AppData, now: Date): boolean {
  if (Object.keys(data.quests).length === 0) return false;
  const { lastExportAt, installedAt, backupSnoozedUntil } = data.settings;
  const t = now.getTime();
  if (backupSnoozedUntil && t < Date.parse(backupSnoozedUntil)) return false;
  if (lastExportAt) return t - Date.parse(lastExportAt) >= 7 * DAY_MS;
  return t - Date.parse(installedAt) >= 3 * DAY_MS;
}
```

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store
git commit -m "feat(store): backup validation, import and reminder rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Chiptune audio engine, sound effects and original music loop

**Files:**
- Create: `src/audio/notes.ts`, `src/audio/engine.ts`, `src/audio/sfx.ts`, `src/audio/music.ts`
- Test: `src/audio/audio.test.ts`

**Interfaces:**
- Produces: `noteToFreq(note: string): number`; `type Wave = 'pulse12'|'pulse25'|'pulse50'|'triangle'|'noise'`, `interface NoteSpec { wave; freq; start; dur; gain?; slideTo? }`, `audio: AudioEngine` with `ensure()`, `resume()`, `setVolumes(sfx, music, muted)`, `play(notes, bus: 'sfx'|'music', at?)`, `resetMusicBus()`; `type SfxName = 'create'|'drop'|'complete'|'uncomplete'|'levelUp'|'achievement'|'boss'`, `SFX`, `playSfx(name)`; `SONG`, `CHORD_TONES`, `parseLead(lead)`, `barNotes(index)`, `STEPS_PER_BAR = 8`, `music: MusicPlayer` with `start()`, `stop()`.

All melodies below are original compositions (F Lydian / adventure feel). Do not replace them with melodies from existing games.

- [ ] **Step 1: Write the failing tests**

`src/audio/audio.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { noteToFreq } from './notes';
import { SFX, playSfx } from './sfx';
import { CHORD_TONES, SONG, STEPS_PER_BAR, barNotes, parseLead } from './music';

describe('noteToFreq', () => {
  it('maps note names to equal-tempered frequencies', () => {
    expect(noteToFreq('A4')).toBeCloseTo(440);
    expect(noteToFreq('A5')).toBeCloseTo(880);
    expect(noteToFreq('C4')).toBeCloseTo(261.63, 1);
    expect(noteToFreq('F#5')).toBeCloseTo(739.99, 1);
  });
  it('throws on bad names', () => expect(() => noteToFreq('H2')).toThrow());
});

describe('SFX', () => {
  it('has valid notes for every effect', () => {
    for (const notes of Object.values(SFX)) {
      expect(notes.length).toBeGreaterThan(0);
      for (const n of notes) {
        expect(n.start).toBeGreaterThanOrEqual(0);
        expect(n.dur).toBeGreaterThan(0);
        if (n.wave !== 'noise') expect(n.freq).toBeGreaterThan(20);
      }
    }
  });
  it('is silent (no throw) without Web Audio support', () => {
    expect(() => playSfx('complete')).not.toThrow();
  });
});

describe('music', () => {
  it('has 16 bars of exactly 8 eighth-note steps with known chords', () => {
    expect(SONG).toHaveLength(16);
    for (const bar of SONG) {
      expect(parseLead(bar.lead).reduce((sum, s) => sum + s.steps, 0)).toBe(STEPS_PER_BAR);
      expect(CHORD_TONES[bar.chord]).toBeDefined();
    }
  });
  it('renders every bar to playable notes', () => {
    for (let i = 0; i < SONG.length; i++) {
      for (const n of barNotes(i)) {
        expect(Number.isFinite(n.freq)).toBe(true);
        expect(n.dur).toBeGreaterThan(0);
      }
    }
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement**

`src/audio/notes.ts`:
```ts
const NOTE_INDEX: Record<string, number> = {
  C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11,
};

export function noteToFreq(note: string): number {
  const match = /^([A-G]#?)(\d)$/.exec(note);
  if (!match) throw new Error(`Bad note name: ${note}`);
  const midi = (Number(match[2]) + 1) * 12 + NOTE_INDEX[match[1]];
  return 440 * 2 ** ((midi - 69) / 12);
}
```

`src/audio/engine.ts`:
```ts
export type Wave = 'pulse12' | 'pulse25' | 'pulse50' | 'triangle' | 'noise';
export type Bus = 'sfx' | 'music';

export interface NoteSpec {
  wave: Wave;
  freq: number;
  start: number; // seconds after the play() base time
  dur: number;
  gain?: number;
  slideTo?: number;
}

const DUTY = { pulse12: 0.125, pulse25: 0.25, pulse50: 0.5 } as const;
type PulseWave = keyof typeof DUTY;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private waves = new Map<PulseWave, PeriodicWave>();
  private noise: AudioBuffer | null = null;
  private volumes = { sfx: 0.6, music: 0.4, muted: false };

  ensure(): AudioContext | null {
    if (!this.ctx) {
      const w = typeof window === 'undefined' ? undefined : (window as Window & { webkitAudioContext?: typeof AudioContext });
      const Ctor = w?.AudioContext ?? w?.webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.ctx.destination);
      this.musicBus = this.createMusicBus(this.ctx);
      this.applyVolumes();
    }
    this.resume();
    return this.ctx;
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  setVolumes(sfx: number, music: number, muted: boolean): void {
    this.volumes = { sfx, music, muted };
    this.applyVolumes();
  }

  /** Cuts off already-scheduled music immediately. */
  resetMusicBus(): void {
    if (!this.ctx || !this.musicBus) return;
    this.musicBus.disconnect();
    this.musicBus = this.createMusicBus(this.ctx);
    this.applyVolumes();
  }

  play(notes: NoteSpec[], bus: Bus, at?: number): void {
    if (this.volumes.muted) return;
    const ctx = this.ensure();
    const out = bus === 'sfx' ? this.sfxBus : this.musicBus;
    if (!ctx || !out) return;
    const base = at ?? ctx.currentTime + 0.01;
    for (const note of notes) this.voice(ctx, out, note, base + note.start);
  }

  private createMusicBus(ctx: AudioContext): GainNode {
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    return gain;
  }

  private applyVolumes(): void {
    if (!this.sfxBus || !this.musicBus) return;
    const on = this.volumes.muted ? 0 : 1;
    this.sfxBus.gain.value = this.volumes.sfx * on;
    this.musicBus.gain.value = this.volumes.music * 0.5 * on;
  }

  private voice(ctx: AudioContext, out: GainNode, n: NoteSpec, t: number): void {
    const peak = n.gain ?? 0.3;
    const end = t + n.dur;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.005);
    env.gain.setValueAtTime(peak, Math.max(t + 0.005, end - 0.03));
    env.gain.linearRampToValueAtTime(0, end);
    env.connect(out);

    let src: AudioScheduledSourceNode;
    if (n.wave === 'noise') {
      const buffer = ctx.createBufferSource();
      buffer.buffer = this.noiseBuffer(ctx);
      src = buffer;
    } else {
      const osc = ctx.createOscillator();
      if (n.wave === 'triangle') osc.type = 'triangle';
      else osc.setPeriodicWave(this.pulse(ctx, n.wave));
      osc.frequency.setValueAtTime(n.freq, t);
      if (n.slideTo) osc.frequency.exponentialRampToValueAtTime(n.slideTo, end);
      src = osc;
    }
    src.connect(env);
    src.start(t);
    src.stop(end + 0.02);
    src.onended = () => env.disconnect();
  }

  private pulse(ctx: AudioContext, wave: PulseWave): PeriodicWave {
    const cached = this.waves.get(wave);
    if (cached) return cached;
    const harmonics = 64;
    const real = new Float32Array(harmonics);
    const imag = new Float32Array(harmonics);
    for (let k = 1; k < harmonics; k++) real[k] = (2 * Math.sin(Math.PI * k * DUTY[wave])) / (Math.PI * k);
    const periodic = ctx.createPeriodicWave(real, imag);
    this.waves.set(wave, periodic);
    return periodic;
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise) return this.noise;
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buffer;
    return buffer;
  }
}

export const audio = new AudioEngine();
```

`src/audio/sfx.ts`:
```ts
import { audio, type NoteSpec, type Wave } from './engine';
import { noteToFreq as n } from './notes';

export type SfxName = 'create' | 'drop' | 'complete' | 'uncomplete' | 'levelUp' | 'achievement' | 'boss';

function seq(wave: Wave, notes: string[], step: number, gain: number, last: number, offset = 0): NoteSpec[] {
  return notes.map((note, i) => ({
    wave,
    freq: n(note),
    start: offset + i * step,
    dur: i === notes.length - 1 ? last : step * 0.95,
    gain,
  }));
}

export const SFX: Record<SfxName, NoteSpec[]> = {
  // "sword drawn": a noise swish and a rising ping
  create: [
    { wave: 'noise', freq: 0, start: 0, dur: 0.07, gain: 0.18 },
    { wave: 'pulse25', freq: n('E6'), start: 0.04, dur: 0.08, gain: 0.18, slideTo: n('B6') },
  ],
  // "footsteps"
  drop: [
    { wave: 'triangle', freq: n('C4'), start: 0, dur: 0.045, gain: 0.35 },
    { wave: 'triangle', freq: n('G3'), start: 0.07, dur: 0.045, gain: 0.35 },
  ],
  // "chest opens": rising Gmaj7 run
  complete: seq('pulse50', ['G4', 'B4', 'D5', 'F#5', 'G5'], 0.075, 0.22, 0.3),
  uncomplete: seq('triangle', ['D5', 'A4', 'D4'], 0.09, 0.3, 0.18),
  levelUp: [
    ...seq('pulse50', ['D5', 'F#5', 'A5', 'D6'], 0.1, 0.22, 0.35),
    ...seq('pulse50', ['C#6', 'E6', 'D6'], 0.12, 0.22, 0.7, 0.72),
    ...seq('triangle', ['D3', 'A3', 'D4'], 0.35, 0.35, 0.8),
  ],
  // "secret found" sparkle with an echo
  achievement: [
    ...seq('pulse12', ['E6', 'G#6', 'B6', 'E7'], 0.06, 0.16, 0.25),
    ...seq('pulse12', ['E6', 'G#6', 'B6', 'E7'], 0.06, 0.06, 0.25, 0.12),
  ],
  boss: [
    ...seq('pulse50', ['A4', 'C#5', 'E5', 'A5'], 0.09, 0.22, 0.2),
    ...seq('pulse50', ['G5', 'A5', 'B5', 'C#6', 'E6'], 0.08, 0.22, 0.6, 0.45),
    ...seq('triangle', ['A2', 'E3', 'A3'], 0.3, 0.35, 0.7),
  ],
};

export function playSfx(name: SfxName): void {
  audio.play(SFX[name], 'sfx');
}
```

`src/audio/music.ts`:
```ts
import { audio, type NoteSpec } from './engine';
import { noteToFreq } from './notes';

export const BPM = 112;
export const STEP = 60 / BPM / 2; // one eighth note
export const STEPS_PER_BAR = 8;

export const CHORD_TONES: Record<string, string[]> = {
  F: ['F4', 'A4', 'C5', 'E5'],
  G: ['G4', 'B4', 'D5', 'B4'],
  Em: ['E4', 'G4', 'B4', 'G4'],
  Am: ['A4', 'C5', 'E5', 'C5'],
  Dm: ['D4', 'F4', 'A4', 'F4'],
  C: ['C4', 'E4', 'G4', 'E4'],
};
const BASS: Record<string, string> = { F: 'F2', G: 'G2', Em: 'E2', Am: 'A2', Dm: 'D2', C: 'C3' };

/** "Meadow Expedition" — original 16-bar loop in F Lydian. Tokens are note:eighths, '-' is a rest. */
export const SONG: { chord: string; lead: string }[] = [
  { chord: 'F', lead: 'C5:2 F5:2 A5:3 G5:1' },
  { chord: 'G', lead: 'B5:4 A5:2 G5:2' },
  { chord: 'Em', lead: 'G5:2 E5:2 B4:4' },
  { chord: 'Am', lead: 'C5:2 E5:2 A5:4' },
  { chord: 'F', lead: 'A5:2 C6:2 B5:2 A5:2' },
  { chord: 'G', lead: 'G5:3 D5:1 B4:4' },
  { chord: 'C', lead: 'C5:2 E5:2 G5:2 E5:2' },
  { chord: 'C', lead: 'C5:6 -:2' },
  { chord: 'F', lead: 'F5:2 A5:2 C6:3 B5:1' },
  { chord: 'G', lead: 'B5:2 D6:2 B5:2 G5:2' },
  { chord: 'Em', lead: 'E5:2 G5:2 B5:4' },
  { chord: 'Am', lead: 'A5:3 G5:1 E5:4' },
  { chord: 'Dm', lead: 'D5:2 F5:2 A5:2 F5:2' },
  { chord: 'G', lead: 'G5:2 B5:2 D6:4' },
  { chord: 'C', lead: 'E6:2 D6:2 C6:2 G5:2' },
  { chord: 'G', lead: 'B5:4 -:4' },
];

export interface LeadStep { note: string | null; steps: number; }

export function parseLead(lead: string): LeadStep[] {
  return lead.trim().split(/\s+/).map((token) => {
    const [note, length] = token.split(':');
    return { note: note === '-' ? null : note, steps: Number(length) };
  });
}

export function barNotes(index: number): NoteSpec[] {
  const bar = SONG[index % SONG.length];
  const notes: NoteSpec[] = [];
  let pos = 0;
  for (const step of parseLead(bar.lead)) {
    if (step.note) {
      notes.push({ wave: 'pulse25', freq: noteToFreq(step.note), start: pos * STEP, dur: step.steps * STEP * 0.92, gain: 0.22 });
    }
    pos += step.steps;
  }
  const tones = CHORD_TONES[bar.chord];
  for (let i = 0; i < STEPS_PER_BAR; i++) {
    notes.push({ wave: 'pulse12', freq: noteToFreq(tones[i % tones.length]), start: i * STEP, dur: STEP * 0.8, gain: 0.07 });
    if (i % 2 === 0) notes.push({ wave: 'noise', freq: 0, start: i * STEP, dur: 0.03, gain: 0.04 });
  }
  const root = noteToFreq(BASS[bar.chord]);
  notes.push(
    { wave: 'triangle', freq: root, start: 0, dur: STEP * 3, gain: 0.35 },
    { wave: 'triangle', freq: root * 2, start: STEP * 4, dur: STEP * 2, gain: 0.3 },
    { wave: 'triangle', freq: root, start: STEP * 6, dur: STEP * 2, gain: 0.3 },
  );
  return notes;
}

const LOOKAHEAD = 1.2;

export class MusicPlayer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private bar = 0;
  private nextTime = 0;

  start(): void {
    if (this.timer) return;
    const ctx = audio.ensure();
    if (!ctx) return;
    this.bar = 0;
    this.nextTime = ctx.currentTime + 0.1;
    this.tick();
    this.timer = setInterval(() => this.tick(), 250);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    audio.resetMusicBus();
  }

  private tick(): void {
    const ctx = audio.ensure();
    if (!ctx) return;
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05; // after a suspend/resume
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      audio.play(barNotes(this.bar), 'music', this.nextTime);
      this.nextTime += STEP * STEPS_PER_BAR;
      this.bar = (this.bar + 1) % SONG.length;
    }
  }
}

export const music = new MusicPlayer();
```

- [ ] **Step 4: Run tests** — `npx vitest run src/audio` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/audio
git commit -m "feat(audio): Web Audio chiptune engine, SFX and original music loop

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Zustand stores (persisted app store + transient effects store)

**Files:**
- Create: `src/store/useEffectsStore.ts`, `src/store/useAppStore.ts`
- Test: `src/store/stores.test.ts`

**Interfaces:**
- Consumes: `board.*`, `moveQuest` (progress), `createDefaultData`, `validateData`, `playSfx`.
- Produces:
  - `useEffectsStore` with state `{ items: EffectItem[]; mood: TransientMood | null }` and actions `push(events: GameEvent[])`, `toast(message: string, tone?: 'info' | 'error')`, `dismiss(key: number)`. Types: `type UiEvent = GameEvent | { type: 'toast'; message: string; tone: ToastTone }`, `interface EffectItem { key: number; event: UiEvent }`, `interface TransientMood { mood: 'happy' | 'levelUp'; until: number }`.
  - `useAppStore` with `data: AppData` and actions: `addQuest(columnId, input): string | null`, `updateQuest(id, patch): boolean`, `deleteQuest(id)`, `moveQuest(id, toColumnId, toIndex)`, `addColumn(name): string | null`, `renameColumn(id, name): boolean`, `deleteColumn(id): boolean`, `setDoneColumn(id)`, `moveColumn(from, to)`, `addLabel(name, color): string | null`, `deleteLabel(id)`, `saveAvatar(frames)`, `resetAvatar()`, `updateSettings(patch)`, `markExported()`, `snoozeBackup()`, `replaceData(data)`. Constants `STORAGE_KEY = 'quest-board-v1'`, `CORRUPT_KEY = 'quest-board-corrupt-copy'`.

- [ ] **Step 1: Write the failing tests**

`src/store/stores.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CORRUPT_KEY, STORAGE_KEY, useAppStore } from './useAppStore';
import { useEffectsStore } from './useEffectsStore';
import { createDefaultData } from './defaults';

const app = () => useAppStore.getState();
const fx = () => useEffectsStore.getState();

beforeEach(() => {
  useAppStore.setState({ data: createDefaultData() });
  useEffectsStore.setState({ items: [], mood: null });
});
afterEach(() => vi.restoreAllMocks());

describe('useAppStore', () => {
  it('adds a quest and persists it to localStorage', () => {
    const todo = app().data.columns[0].id;
    const id = app().addQuest(todo, { title: 'Ôn thi cuối kỳ' });
    expect(id).not.toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toContain('Ôn thi cuối kỳ');
  });

  it('turns logic errors into error toasts', () => {
    expect(app().addQuest(app().data.columns[0].id, { title: ' ' })).toBeNull();
    expect(fx().items.at(-1)?.event).toEqual({ type: 'toast', message: 'Quest title cannot be empty.', tone: 'error' });
  });

  it('pushes game events and a happy mood when a quest is completed', () => {
    const { columns } = app().data;
    const questId = columns[0].questIds[0];
    app().moveQuest(questId, columns[2].id, 0);
    expect(fx().items.map((i) => i.event.type)).toEqual(['questCompleted', 'achievement']);
    expect(fx().mood?.mood).toBe('happy');
  });

  it('warns once when storage is full', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    app().addColumn('A');
    app().addColumn('B');
    const toasts = fx().items.filter((i) => i.event.type === 'toast');
    expect(toasts).toHaveLength(1);
    expect(toasts[0].event).toMatchObject({ tone: 'error' });
  });

  it('starts fresh and keeps a copy when saved data is corrupted', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { data: { schemaVersion: 1, columns: 'bad' } }, version: 1 }));
    await useAppStore.persist.rehydrate();
    expect(app().data.columns).toHaveLength(3);
    expect(localStorage.getItem(CORRUPT_KEY)).toContain('bad');
  });
});

describe('useEffectsStore', () => {
  it('prefers the level-up mood and auto-dismisses items', () => {
    vi.useFakeTimers();
    try {
      fx().push([{ type: 'questCompleted', questId: 'q', xp: 10, difficulty: 'easy' }, { type: 'levelUp', level: 2 }]);
      expect(fx().mood?.mood).toBe('levelUp');
      expect(fx().items).toHaveLength(2);
      vi.advanceTimersByTime(5000);
      expect(fx().items).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement**

`src/store/useEffectsStore.ts`:
```ts
import { create } from 'zustand';
import type { GameEvent } from '../types';
import { playSfx, type SfxName } from '../audio/sfx';

export type ToastTone = 'info' | 'error';
export type UiEvent = GameEvent | { type: 'toast'; message: string; tone: ToastTone };
export interface EffectItem { key: number; event: UiEvent; }
export interface TransientMood { mood: 'happy' | 'levelUp'; until: number; }

const DURATION: Record<UiEvent['type'], number> = {
  questCompleted: 1600,
  questUncompleted: 1600,
  levelUp: 2800,
  achievement: 4000,
  toast: 4500,
};

function soundFor(event: GameEvent): { name: SfxName; delay: number } {
  switch (event.type) {
    case 'questCompleted': return { name: event.difficulty === 'boss' ? 'boss' : 'complete', delay: 0 };
    case 'questUncompleted': return { name: 'uncomplete', delay: 0 };
    case 'levelUp': return { name: 'levelUp', delay: 450 };
    case 'achievement': return { name: 'achievement', delay: 1100 };
  }
}

interface EffectsState {
  items: EffectItem[];
  mood: TransientMood | null;
  push: (events: GameEvent[]) => void;
  toast: (message: string, tone?: ToastTone) => void;
  dismiss: (key: number) => void;
}

let nextKey = 1;

export const useEffectsStore = create<EffectsState>()((set, get) => {
  const add = (events: UiEvent[]) => {
    const added = events.map((event) => ({ key: nextKey++, event }));
    set((s) => ({ items: [...s.items, ...added] }));
    for (const item of added) setTimeout(() => get().dismiss(item.key), DURATION[item.event.type]);
  };
  return {
    items: [],
    mood: null,
    push: (events) => {
      if (events.length === 0) return;
      for (const event of events) {
        const sound = soundFor(event);
        setTimeout(() => playSfx(sound.name), sound.delay);
      }
      const now = Date.now();
      if (events.some((e) => e.type === 'levelUp')) set({ mood: { mood: 'levelUp', until: now + 3000 } });
      else if (events.some((e) => e.type === 'questCompleted')) set({ mood: { mood: 'happy', until: now + 2000 } });
      add(events);
    },
    toast: (message, tone = 'info') => add([{ type: 'toast', message, tone }]),
    dismiss: (key) => set((s) => ({ items: s.items.filter((i) => i.key !== key) })),
  };
});
```

`src/store/useAppStore.ts`:
```ts
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { AppData, AvatarFrames, Result, Settings } from '../types';
import * as board from './board';
import type { QuestInput, QuestPatch } from './board';
import { moveQuest as moveQuestLogic } from './progress';
import { createDefaultData } from './defaults';
import { validateData } from './persistence';
import { useEffectsStore } from './useEffectsStore';

export const STORAGE_KEY = 'quest-board-v1';
export const CORRUPT_KEY = 'quest-board-corrupt-copy';

let saveWarningShown = false;

const safeStorage: StateStorage = {
  getItem: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
      saveWarningShown = false;
    } catch {
      if (saveWarningShown) return;
      saveWarningShown = true;
      useEffectsStore.getState().toast('Could not save — browser storage is full. Export a backup now!', 'error');
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export interface AppState {
  data: AppData;
  addQuest: (columnId: string, input: QuestInput) => string | null;
  updateQuest: (questId: string, patch: QuestPatch) => boolean;
  deleteQuest: (questId: string) => void;
  moveQuest: (questId: string, toColumnId: string, toIndex: number) => void;
  addColumn: (name: string) => string | null;
  renameColumn: (columnId: string, name: string) => boolean;
  deleteColumn: (columnId: string) => boolean;
  setDoneColumn: (columnId: string) => void;
  moveColumn: (from: number, to: number) => void;
  addLabel: (name: string, color: string) => string | null;
  deleteLabel: (labelId: string) => void;
  saveAvatar: (frames: AvatarFrames) => void;
  resetAvatar: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
  markExported: () => void;
  snoozeBackup: () => void;
  replaceData: (data: AppData) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      const run = (fn: (data: AppData, now: Date) => Result): Result => {
        const result = fn(get().data, new Date());
        const effects = useEffectsStore.getState();
        if (result.error) {
          effects.toast(result.error, 'error');
          return result;
        }
        set({ data: result.data });
        effects.push(result.events);
        return result;
      };
      return {
        data: createDefaultData(),
        addQuest: (columnId, input) => run((d, now) => board.addQuest(d, columnId, input, now)).createdId ?? null,
        updateQuest: (questId, patch) => !run((d, now) => board.updateQuest(d, questId, patch, now)).error,
        deleteQuest: (questId) => void run((d, now) => board.deleteQuest(d, questId, now)),
        moveQuest: (questId, toColumnId, toIndex) =>
          void run((d, now) => moveQuestLogic(d, questId, toColumnId, toIndex, now)),
        addColumn: (name) => run((d) => board.addColumn(d, name)).createdId ?? null,
        renameColumn: (columnId, name) => !run((d) => board.renameColumn(d, columnId, name)).error,
        deleteColumn: (columnId) => !run((d, now) => board.deleteColumn(d, columnId, now)).error,
        setDoneColumn: (columnId) => void run((d) => board.setDoneColumn(d, columnId)),
        moveColumn: (from, to) => void run((d) => board.moveColumn(d, from, to)),
        addLabel: (name, color) => run((d) => board.addLabel(d, name, color)).createdId ?? null,
        deleteLabel: (labelId) => void run((d) => board.deleteLabel(d, labelId)),
        saveAvatar: (frames) => void run((d, now) => board.saveAvatar(d, frames, now)),
        resetAvatar: () => void run((d) => board.resetAvatar(d)),
        updateSettings: (patch) => set((s) => ({ data: { ...s.data, settings: { ...s.data.settings, ...patch } } })),
        markExported: () => get().updateSettings({ lastExportAt: new Date().toISOString() }),
        snoozeBackup: () => get().updateSettings({ backupSnoozedUntil: new Date(Date.now() + 86_400_000).toISOString() }),
        replaceData: (data) => set({ data }),
      };
    },
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({ data: state.data }),
      merge: (persisted, current) => {
        const raw = (persisted as { data?: unknown } | undefined)?.data;
        if (raw === undefined) return current;
        const result = validateData(raw);
        if (result.ok) return { ...current, data: result.data };
        try {
          localStorage.setItem(CORRUPT_KEY, JSON.stringify(raw));
        } catch {
          /* ignore */
        }
        queueMicrotask(() =>
          useEffectsStore.getState().toast('Saved data was damaged — started a fresh board. A copy was kept.', 'error'),
        );
        return current;
      },
    },
  ),
);
```

- [ ] **Step 4: Run tests** — `npx vitest run src/store` → PASS. Then `npm run typecheck` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/store
git commit -m "feat(store): persisted app store and effects store

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Mascot sprite, avatar mood and pixel canvas

**Files:**
- Create: `src/avatar/mascot.ts`, `src/avatar/mood.ts`, `src/components/PixelCanvas.tsx`, `src/components/PlayerAvatar.tsx`
- Test: `src/avatar/mascot.test.ts`, `src/avatar/mood.test.ts`

**Interfaces:**
- Consumes: `isStreakBroken`, `isOverdue`, `toDateKey`, `useAppStore`, `useEffectsStore`.
- Produces: `GRID = 32`, `PALETTE: string[]` (16 colours + pink `#ff9eb0` = 17), `emptyFrame(): Frame`, `createMascotFrames(): Record<Mood, Frame>` (only `import type` from other modules — it is also run by Node in Task 18); `MASCOT` (module constant in `mood.ts`), `selectMood(input: MoodInput): Mood`, `type AvatarAnimation = 'bounce' | 'jump' | 'shake' | null`, `resolveFrame(frames: AvatarFrames, mood: Mood, mascot: Record<Mood, Frame>): { frame: Frame; animation: AvatarAnimation }`; `<PixelCanvas frame size? className? label? />`, `<PlayerAvatar size />`.

- [ ] **Step 1: Write the failing tests**

`src/avatar/mascot.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { GRID, createMascotFrames } from './mascot';

describe('createMascotFrames', () => {
  const frames = createMascotFrames();

  it('produces four 32x32 frames that differ from each other', () => {
    for (const frame of Object.values(frames)) expect(frame).toHaveLength(GRID * GRID);
    const serialized = new Set(Object.values(frames).map((f) => JSON.stringify(f)));
    expect(serialized.size).toBe(4);
  });

  it('draws a solid, left-right symmetric body for the normal mood', () => {
    const normal = frames.normal;
    expect(normal.filter((c) => c !== null).length).toBeGreaterThan(300);
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) expect(normal[y * GRID + x]).toBe(normal[y * GRID + (GRID - 1 - x)]);
    }
  });
});
```

`src/avatar/mood.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { AvatarFrames, Frame } from '../types';
import { resolveFrame, selectMood } from './mood';
import { createMascotFrames, emptyFrame } from './mascot';

const mascot = createMascotFrames();
const drawn = (): Frame => { const f = emptyFrame(); f[0] = '#ffffff'; return f; };
const none: AvatarFrames = { normal: null, happy: null, levelUp: null, sad: null };

describe('selectMood', () => {
  const base = { now: 1000, transient: null, streakBroken: false, overdueCount: 0 };
  it('is normal by default', () => expect(selectMood(base)).toBe('normal'));
  it('uses an active transient mood first', () => {
    expect(selectMood({ ...base, transient: { mood: 'levelUp', until: 2000 }, overdueCount: 3 })).toBe('levelUp');
  });
  it('ignores an expired transient mood', () => {
    expect(selectMood({ ...base, transient: { mood: 'happy', until: 500 } })).toBe('normal');
  });
  it('is sad with overdue quests or a broken streak', () => {
    expect(selectMood({ ...base, overdueCount: 1 })).toBe('sad');
    expect(selectMood({ ...base, streakBroken: true })).toBe('sad');
  });
});

describe('resolveFrame', () => {
  it('uses the mascot when no custom normal frame exists', () => {
    expect(resolveFrame(none, 'happy', mascot)).toEqual({ frame: mascot.happy, animation: 'bounce' });
  });
  it('uses the custom frame for the mood when drawn', () => {
    const sad = drawn();
    const frames = { ...none, normal: drawn(), sad };
    expect(resolveFrame(frames, 'sad', mascot)).toEqual({ frame: sad, animation: null });
  });
  it('falls back to the custom normal frame plus an animation', () => {
    const normal = drawn();
    const frames = { ...none, normal };
    expect(resolveFrame(frames, 'levelUp', mascot)).toEqual({ frame: normal, animation: 'jump' });
    expect(resolveFrame(frames, 'sad', mascot)).toEqual({ frame: normal, animation: 'shake' });
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement**

`src/avatar/mascot.ts`:
```ts
import type { Frame, Mood } from '../types';

export const GRID = 32;

/** "Sweetie 16" palette plus a cheek pink. */
export const PALETTE = [
  '#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179',
  '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57', '#ff9eb0',
];

const C = {
  outline: '#1a1c2c',
  body: '#f4f4f4',
  shade: '#c2d3df',
  cheek: '#ff9eb0',
  eye: '#1a1c2c',
  mouth: '#b13e53',
  star: '#ffcd75',
  tear: '#41a6f6',
};

export const emptyFrame = (): Frame => Array<string | null>(GRID * GRID).fill(null);

const inEllipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

// Original chibi blob: round body, two round ears, two little feet. Symmetric around x = 15.5.
const inBody = (x: number, y: number) =>
  inEllipse(x, y, 15.5, 18, 11, 10) ||
  inEllipse(x, y, 9, 9, 3, 3) ||
  inEllipse(x, y, 22, 9, 3, 3) ||
  inEllipse(x, y, 11, 27.5, 3, 2) ||
  inEllipse(x, y, 20, 27.5, 3, 2);

function baseFrame(): Frame {
  const frame = emptyFrame();
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (!inBody(x, y)) continue;
      const edge = !inBody(x - 1, y) || !inBody(x + 1, y) || !inBody(x, y - 1) || !inBody(x, y + 1);
      const rim = ((x - 15.5) / 11) ** 2 + ((y - 18) / 10) ** 2;
      frame[y * GRID + x] = edge ? C.outline : rim > 0.6 && y > 20 ? C.shade : C.body;
    }
  }
  return frame;
}

type Pixel = [number, number];

function paint(frame: Frame, pixels: Pixel[], color: string): void {
  for (const [x, y] of pixels) frame[y * GRID + x] = color;
}

const DOT_EYES: Pixel[] = [[11, 16], [12, 16], [11, 17], [12, 17], [19, 16], [20, 16], [19, 17], [20, 17]];
const HAPPY_EYES: Pixel[] = [[10, 17], [11, 16], [12, 16], [13, 17], [18, 17], [19, 16], [20, 16], [21, 17]];
const SAD_EYES: Pixel[] = [[11, 17], [12, 17], [11, 18], [12, 18], [19, 17], [20, 17], [19, 18], [20, 18]];
const CHEEKS: Pixel[] = [[8, 19], [9, 19], [22, 19], [23, 19]];
const SMILE: Pixel[] = [[14, 20], [15, 21], [16, 21], [17, 20]];
const FROWN: Pixel[] = [[14, 22], [15, 21], [16, 21], [17, 22]];
const OPEN_MOUTH_EDGE: Pixel[] = [[14, 20], [15, 20], [16, 20], [17, 20], [14, 21], [17, 21], [15, 22], [16, 22]];
const OPEN_MOUTH_FILL: Pixel[] = [[15, 21], [16, 21]];
const STARS: Pixel[] = [
  [3, 4], [2, 5], [3, 5], [4, 5], [3, 6],
  [28, 3], [27, 4], [28, 4], [29, 4], [28, 5],
  [28, 14], [2, 15],
];
const TEAR: Pixel[] = [[12, 19], [12, 20]];

function face(mood: Mood): Frame {
  const frame = baseFrame();
  paint(frame, CHEEKS, C.cheek);
  if (mood === 'normal') {
    paint(frame, DOT_EYES, C.eye);
    paint(frame, SMILE, C.outline);
  } else if (mood === 'happy' || mood === 'levelUp') {
    paint(frame, HAPPY_EYES, C.eye);
    paint(frame, OPEN_MOUTH_EDGE, C.outline);
    paint(frame, OPEN_MOUTH_FILL, C.mouth);
    if (mood === 'levelUp') paint(frame, STARS, C.star);
  } else {
    paint(frame, SAD_EYES, C.eye);
    paint(frame, FROWN, C.outline);
    paint(frame, TEAR, C.tear);
  }
  return frame;
}

export function createMascotFrames(): Record<Mood, Frame> {
  return { normal: face('normal'), happy: face('happy'), levelUp: face('levelUp'), sad: face('sad') };
}
```

`src/avatar/mood.ts`:
```ts
import type { AvatarFrames, Frame, Mood } from '../types';
import type { TransientMood } from '../store/useEffectsStore';
import { createMascotFrames } from './mascot';

export const MASCOT = createMascotFrames();

export interface MoodInput {
  now: number;
  transient: TransientMood | null;
  streakBroken: boolean;
  overdueCount: number;
}

export type AvatarAnimation = 'bounce' | 'jump' | 'shake' | null;

export function selectMood(input: MoodInput): Mood {
  if (input.transient && input.now < input.transient.until) return input.transient.mood;
  if (input.streakBroken || input.overdueCount > 0) return 'sad';
  return 'normal';
}

export function resolveFrame(
  frames: AvatarFrames,
  mood: Mood,
  mascot: Record<Mood, Frame>,
): { frame: Frame; animation: AvatarAnimation } {
  const cheer: AvatarAnimation = mood === 'happy' ? 'bounce' : mood === 'levelUp' ? 'jump' : null;
  if (!frames.normal) return { frame: mascot[mood], animation: cheer };
  const own = frames[mood];
  if (own) return { frame: own, animation: cheer };
  return { frame: frames.normal, animation: mood === 'sad' ? 'shake' : cheer };
}
```

`src/components/PixelCanvas.tsx`:
```tsx
import { useEffect, useRef } from 'react';
import type { Frame } from '../types';
import { GRID } from '../avatar/mascot';

interface Props { frame: Frame; size?: number; className?: string; label?: string; }

export function PixelCanvas({ frame, size, className, label }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, GRID, GRID);
    frame.forEach((color, i) => {
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(i % GRID, Math.floor(i / GRID), 1, 1);
    });
  }, [frame]);
  return (
    <canvas
      ref={ref}
      width={GRID}
      height={GRID}
      className={`pixelated ${className ?? ''}`}
      style={size ? { width: size, height: size } : undefined}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
```

`src/components/PlayerAvatar.tsx`:
```tsx
import { useEffect, useReducer } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useEffectsStore } from '../store/useEffectsStore';
import { toDateKey } from '../game/dates';
import { isStreakBroken } from '../game/streak';
import { isOverdue } from '../game/deadline';
import { MASCOT, resolveFrame, selectMood } from '../avatar/mood';
import { PixelCanvas } from './PixelCanvas';

export function PlayerAvatar({ size }: { size: number }) {
  const frames = useAppStore((s) => s.data.avatar.frames);
  const player = useAppStore((s) => s.data.player);
  const quests = useAppStore((s) => s.data.quests);
  const transient = useEffectsStore((s) => s.mood);
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!transient) return;
    const ms = transient.until - Date.now();
    if (ms <= 0) return;
    const timer = setTimeout(rerender, ms + 20);
    return () => clearTimeout(timer);
  }, [transient]);

  const today = toDateKey(new Date());
  const overdueCount = Object.values(quests).filter((q) => isOverdue(q, today)).length;
  const mood = selectMood({ now: Date.now(), transient, streakBroken: isStreakBroken(player, today), overdueCount });
  const { frame, animation } = resolveFrame(frames, mood, MASCOT);

  return (
    <div className={`player-avatar ${animation ? `anim-${animation}` : ''}`} data-mood={mood}>
      <PixelCanvas frame={frame} size={size} label={`Your avatar (${mood})`} />
    </div>
  );
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/avatar` → PASS; `npm run typecheck` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/avatar src/components
git commit -m "feat(avatar): original chibi mascot, mood selection and pixel canvas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Player bar and app shell

**Files:**
- Create: `src/components/PlayerBar.tsx`, `src/components/PlayerBar.css`, `src/audio/useAudioSettings.ts`
- Modify: `src/App.tsx`
- Test: `src/components/PlayerBar.test.tsx`

**Interfaces:**
- Consumes: `levelProgress`, `displayedStreak`, `toDateKey`, `PlayerAvatar`, `useAppStore`, `audio`, `music`.
- Produces: `type Panel = 'achievements' | 'settings' | 'editor'`, `<PlayerBar onOpen={(p: Panel) => void} />`, `useAudioSettings()`.

- [ ] **Step 1: Write the failing test**

`src/components/PlayerBar.test.tsx`:
```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlayerBar } from './PlayerBar';
import { useAppStore } from '../store/useAppStore';
import { createDefaultData } from '../store/defaults';
import { toDateKey } from '../game/dates';

beforeEach(() => {
  const data = createDefaultData();
  data.player = { ...data.player, totalXp: 350, streak: 4, shields: 1, lastActiveDate: toDateKey(new Date()) };
  useAppStore.setState({ data });
});

describe('PlayerBar', () => {
  it('shows level, XP progress and streak', () => {
    render(<PlayerBar onOpen={() => {}} />);
    expect(screen.getByText('LV 3')).toBeInTheDocument();
    expect(screen.getByText('XP 50/300')).toBeInTheDocument();
    expect(screen.getByTitle('Daily streak')).toHaveTextContent('4');
    expect(screen.getByRole('progressbar', { name: 'Experience' })).toHaveAttribute('aria-valuenow', '50');
  });

  it('opens panels and toggles mute', async () => {
    const onOpen = vi.fn();
    render(<PlayerBar onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: 'Achievements' }));
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit avatar' }));
    expect(onOpen.mock.calls.map((c) => c[0])).toEqual(['achievements', 'settings', 'editor']);
    await userEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(useAppStore.getState().data.settings.muted).toBe(true);
    expect(screen.getByRole('button', { name: 'Unmute' })).toBeInTheDocument();
  });

  it('updates when a quest is completed', () => {
    useAppStore.setState({ data: createDefaultData() });
    render(<PlayerBar onOpen={() => {}} />);
    const { columns } = useAppStore.getState().data;
    act(() => useAppStore.getState().moveQuest(columns[0].questIds[0], columns[2].id, 0));
    expect(screen.getByText('XP 11/100')).toBeInTheDocument(); // easy welcome quest: 10 * 1.05
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement**

`src/components/PlayerBar.tsx`:
```tsx
import { useAppStore } from '../store/useAppStore';
import { levelProgress } from '../game/level';
import { displayedStreak } from '../game/streak';
import { toDateKey } from '../game/dates';
import { PlayerAvatar } from './PlayerAvatar';
import './PlayerBar.css';

export type Panel = 'achievements' | 'settings' | 'editor';

export function PlayerBar({ onOpen }: { onOpen: (panel: Panel) => void }) {
  const player = useAppStore((s) => s.data.player);
  const muted = useAppStore((s) => s.data.settings.muted);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const { level, current, needed } = levelProgress(player.totalXp);
  const streak = displayedStreak(player, toDateKey(new Date()));

  return (
    <header className="player-bar pixel-box">
      <button className="avatar-button" onClick={() => onOpen('editor')} aria-label="Edit avatar">
        <PlayerAvatar size={64} />
      </button>
      <div className="player-stats">
        <div className="player-level">LV {level}</div>
        <div className="xp-bar" role="progressbar" aria-label="Experience" aria-valuemin={0} aria-valuenow={current} aria-valuemax={needed}>
          <div className="xp-fill" style={{ width: `${(current / needed) * 100}%` }} />
        </div>
        <div className="xp-text">XP {current}/{needed}</div>
      </div>
      <div className="player-streak" title="Daily streak">
        🔥 {streak}
        {player.shields > 0 && (
          <span className="shields" title={`${player.shields} streak shield(s)`}>{' '}{'🛡️'.repeat(player.shields)}</span>
        )}
      </div>
      <nav className="player-actions">
        <button className="pixel-btn icon" onClick={() => onOpen('achievements')} aria-label="Achievements">🏆</button>
        <button className="pixel-btn icon" onClick={() => onOpen('settings')} aria-label="Settings">⚙️</button>
        <button className="pixel-btn icon" onClick={() => updateSettings({ muted: !muted })} aria-label={muted ? 'Unmute' : 'Mute'}>
          {muted ? '🔇' : '🔊'}
        </button>
      </nav>
    </header>
  );
}
```

`src/components/PlayerBar.css`:
```css
.player-bar { display: flex; align-items: center; gap: 16px; padding: 10px 14px; flex-wrap: wrap; }
.avatar-button { background: var(--bg); border: 3px solid var(--border); padding: 4px; cursor: pointer; line-height: 0; }
.player-stats { flex: 1; min-width: 180px; display: grid; gap: 6px; }
.player-level { font-family: var(--font-title); font-size: 14px; color: var(--accent); }
.xp-bar { height: 18px; background: var(--bg); border: 3px solid var(--border); }
.xp-fill {
  height: 100%;
  background: repeating-linear-gradient(90deg, var(--xp) 0 8px, var(--xp-deep) 8px 10px);
  transition: width 0.4s steps(8);
}
.xp-text { font-family: var(--font-title); font-size: 9px; color: var(--ink-dim); }
.player-streak { font-family: var(--font-title); font-size: 14px; white-space: nowrap; }
.shields { font-size: 12px; }
.player-actions { display: flex; gap: 8px; }

.anim-bounce { animation: avatar-bounce 0.5s steps(2) 4; }
.anim-jump { animation: avatar-jump 0.6s steps(3) 5; }
.anim-shake { animation: avatar-shake 2s steps(1) infinite; }
@keyframes avatar-bounce { 50% { transform: translateY(-4px); } }
@keyframes avatar-jump { 50% { transform: translateY(-10px) scale(1.1); } }
@keyframes avatar-shake {
  0%, 100% { transform: translateX(0); }
  5% { transform: translateX(-2px); }
  10% { transform: translateX(2px); }
  15% { transform: translateX(0); }
}

@media (max-width: 767px) {
  .player-bar { gap: 10px; }
  .player-stats { order: 3; flex-basis: 100%; }
}
```

`src/audio/useAudioSettings.ts`:
```ts
import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { audio } from './engine';
import { music } from './music';

export function useAudioSettings(): void {
  const settings = useAppStore((s) => s.data.settings);
  const { sfxVolume, musicVolume, musicOn, muted } = settings;

  useEffect(() => {
    audio.setVolumes(sfxVolume, musicVolume, muted);
  }, [sfxVolume, musicVolume, muted]);

  useEffect(() => {
    if (musicOn && !muted) music.start();
    else music.stop();
    return () => music.stop();
  }, [musicOn, muted]);

  // Browsers only allow audio after a user gesture.
  useEffect(() => {
    const unlock = () => audio.resume();
    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, []);
}
```

`src/App.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import { useAudioSettings } from './audio/useAudioSettings';
import { PlayerBar, type Panel } from './components/PlayerBar';

export default function App() {
  const theme = useAppStore((s) => s.data.settings.theme);
  const [, setPanel] = useState<Panel | null>(null);
  useAudioSettings();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="app">
      <h1 className="sr-only">Quest Board</h1>
      <PlayerBar onOpen={setPanel} />
    </div>
  );
}
```

- [ ] **Step 4: Run tests** — `npm test` → PASS (App smoke test included).

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat(ui): player bar with level, XP, streak and audio settings hook

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Kanban board with drag-and-drop

**Files:**
- Create: `src/components/Board.tsx`, `src/components/Board.css`, `src/components/ColumnView.tsx`, `src/components/ColumnMenu.tsx`, `src/components/QuickAdd.tsx`, `src/components/QuestCard.tsx`
- Modify: `src/App.tsx`
- Test: `src/components/Board.test.tsx`

**Interfaces:**
- Consumes: `useAppStore` actions `addQuest`, `moveQuest`, `moveColumn`, `addColumn`, `renameColumn`, `setDoneColumn`, `deleteColumn`; `deadlineInfo`; `playSfx`.
- Produces: `<Board />` (owns `openQuestId` state; Task 14 renders the modal from it), `<QuestCard quest onOpen? />`, `<SortableQuestCard quest columnId onOpen />`.

- [ ] **Step 1: Write the failing test**

`src/components/Board.test.tsx`:
```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Board } from './Board';
import { useAppStore } from '../store/useAppStore';
import { createDefaultData } from '../store/defaults';

beforeEach(() => useAppStore.setState({ data: createDefaultData() }));
afterEach(() => vi.restoreAllMocks());

const column = (name: string) => screen.getByRole('region', { name: `${name} column` });

describe('Board', () => {
  it('renders the three default columns and the welcome quest', () => {
    render(<Board />);
    expect(column('To Do')).toBeInTheDocument();
    expect(column('Doing')).toBeInTheDocument();
    expect(column('Done')).toBeInTheDocument();
    expect(screen.getByText(/Welcome, hero!/)).toBeInTheDocument();
  });

  it('quick-adds a quest with Vietnamese text', async () => {
    render(<Board />);
    await userEvent.click(within(column('Doing')).getByRole('button', { name: '+ New Quest' }));
    await userEvent.type(screen.getByLabelText('New quest title'), 'Hạ gục con boss cuối{Enter}');
    expect(within(column('Doing')).getByText(/Hạ gục con boss cuối/)).toBeInTheDocument();
    expect(useAppStore.getState().data.columns[1].questIds).toHaveLength(1);
  });

  it('adds and renames a column', async () => {
    render(<Board />);
    await userEvent.click(screen.getByRole('button', { name: '+ Column' }));
    await userEvent.click(within(column('New Column')).getByLabelText('New Column options'));
    await userEvent.click(within(column('New Column')).getByRole('button', { name: 'Rename' }));
    const input = screen.getByLabelText('Column name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Backlog{Enter}');
    expect(column('Backlog')).toBeInTheDocument();
  });

  it('makes another column the Done column and blocks deleting it', async () => {
    render(<Board />);
    await userEvent.click(within(column('Doing')).getByLabelText('Doing options'));
    await userEvent.click(within(column('Doing')).getByRole('button', { name: 'Make Done column' }));
    expect(useAppStore.getState().data.columns.find((c) => c.isDone)?.name).toBe('Doing');
    expect(within(column('Doing')).getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('asks before deleting a column that holds quests', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Board />);
    await userEvent.click(within(column('To Do')).getByLabelText('To Do options'));
    await userEvent.click(within(column('To Do')).getByRole('button', { name: 'Delete' }));
    expect(confirm).toHaveBeenCalled();
    expect(useAppStore.getState().data.columns).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement**

`src/components/QuestCard.tsx`:
```tsx
import type { CSSProperties, KeyboardEvent } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Difficulty, Quest } from '../types';
import { useAppStore } from '../store/useAppStore';
import { deadlineInfo } from '../game/deadline';
import { toDateKey } from '../game/dates';

const DIFFICULTY_BADGE: Record<Difficulty, string> = { easy: '★☆☆', normal: '★★☆', hard: '★★★', boss: '💀 BOSS' };

export function QuestCard({ quest, onOpen }: { quest: Quest; onOpen?: () => void }) {
  const labels = useAppStore((s) => s.data.labels);
  const info = quest.deadline && !quest.completion ? deadlineInfo(quest.deadline, toDateKey(new Date())) : null;
  const questLabels = labels.filter((l) => quest.labelIds.includes(l.id));
  const classes = ['quest-card', `diff-${quest.difficulty}`, info?.overdue ? 'overdue' : '', quest.completion ? 'done' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <article className={classes} onClick={onOpen}>
      <div className="quest-title">{quest.completion ? '✅ ' : '⚔️ '}{quest.title}</div>
      <div className="quest-meta">
        <span className="quest-stars" aria-label={`Difficulty: ${quest.difficulty}`}>{DIFFICULTY_BADGE[quest.difficulty]}</span>
        {info && (
          <span className={`deadline ${info.overdue ? 'overdue' : ''} ${info.dueToday ? 'today' : ''}`}>
            {info.overdue ? '⚠️ ' : '⏳ '}{info.text}
          </span>
        )}
      </div>
      {questLabels.length > 0 && (
        <div className="quest-labels">
          {questLabels.map((l) => (
            <span key={l.id} className="label-chip" style={{ background: l.color }}>{l.name}</span>
          ))}
        </div>
      )}
    </article>
  );
}

interface SortableProps { quest: Quest; columnId: string; onOpen: (questId: string) => void; }

export function SortableQuestCard({ quest, columnId, onOpen }: SortableProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: quest.id,
    data: { type: 'quest', columnId },
  });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    listeners?.onKeyDown?.(e);
    if (e.key === 'Enter') onOpen(quest.id);
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onKeyDown={onKeyDown} aria-label={`Quest: ${quest.title}`}>
      <QuestCard quest={quest} onOpen={() => onOpen(quest.id)} />
    </div>
  );
}
```

`src/components/QuickAdd.tsx`:
```tsx
import { useState, type FormEvent } from 'react';
import { useAppStore } from '../store/useAppStore';
import { playSfx } from '../audio/sfx';

export function QuickAdd({ columnId }: { columnId: string }) {
  const addQuest = useAppStore((s) => s.addQuest);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');

  const close = () => {
    setOpen(false);
    setTitle('');
  };

  if (!open) {
    return (
      <button className="pixel-btn ghost quick-add-open" onClick={() => setOpen(true)}>
        + New Quest
      </button>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (addQuest(columnId, { title })) {
      playSfx('create');
      setTitle('');
    }
  };

  return (
    <form className="quick-add" onSubmit={submit}>
      <input
        className="field-input"
        autoFocus
        aria-label="New quest title"
        placeholder="Quest name…"
        maxLength={120}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && close()}
      />
      <div className="quick-add-actions">
        <button type="submit" className="pixel-btn primary">Add</button>
        <button type="button" className="pixel-btn ghost" onClick={close}>Cancel</button>
      </div>
    </form>
  );
}
```

`src/components/ColumnMenu.tsx`:
```tsx
import { useRef } from 'react';
import type { Column } from '../types';
import { useAppStore } from '../store/useAppStore';

export function ColumnMenu({ column, onRename }: { column: Column; onRename: () => void }) {
  const setDoneColumn = useAppStore((s) => s.setDoneColumn);
  const deleteColumn = useAppStore((s) => s.deleteColumn);
  const ref = useRef<HTMLDetailsElement>(null);
  const close = () => ref.current?.removeAttribute('open');

  const remove = () => {
    close();
    const count = column.questIds.length;
    if (count > 0 && !window.confirm(`Delete "${column.name}"? Its ${count} quest(s) will move to another column.`)) return;
    deleteColumn(column.id);
  };

  return (
    <details className="column-menu" ref={ref}>
      <summary className="pixel-btn icon" aria-label={`${column.name} options`}>⋮</summary>
      <div className="menu-items pixel-box">
        <button className="pixel-btn ghost" onClick={() => { close(); onRename(); }}>Rename</button>
        {!column.isDone && (
          <button className="pixel-btn ghost" onClick={() => { close(); setDoneColumn(column.id); }}>Make Done column</button>
        )}
        <button
          className="pixel-btn danger"
          disabled={column.isDone}
          title={column.isDone ? 'Pick another Done column first' : undefined}
          onClick={remove}
        >
          Delete
        </button>
      </div>
    </details>
  );
}
```

`src/components/ColumnView.tsx`:
```tsx
import { useRef, useState, type CSSProperties } from 'react';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Column, Quest } from '../types';
import { useAppStore } from '../store/useAppStore';
import { SortableQuestCard } from './QuestCard';
import { QuickAdd } from './QuickAdd';
import { ColumnMenu } from './ColumnMenu';

interface Props {
  column: Column;
  quests: Record<string, Quest>;
  onOpenQuest: (questId: string) => void;
}

function ColumnNameInput({ column, onDone }: { column: Column; onDone: () => void }) {
  const renameColumn = useAppStore((s) => s.renameColumn);
  const [value, setValue] = useState(column.name);
  const finished = useRef(false);
  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    if (save && value.trim() !== column.name) renameColumn(column.id, value);
    onDone();
  };
  return (
    <input
      className="field-input column-name-input"
      aria-label="Column name"
      autoFocus
      maxLength={30}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      }}
    />
  );
}

export function ColumnView({ column, quests, onOpenQuest }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
    data: { type: 'column' },
  });
  const [editing, setEditing] = useState(false);
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={`column pixel-box ${column.isDone ? 'is-done' : ''}`}
      aria-label={`${column.name} column`}
    >
      <header className="column-header">
        <button className="drag-handle" {...attributes} {...listeners} aria-label={`Move column ${column.name}`}>⠿</button>
        {editing ? (
          <ColumnNameInput column={column} onDone={() => setEditing(false)} />
        ) : (
          <h2 className="column-title" onDoubleClick={() => setEditing(true)}>
            {column.name}
            {column.isDone && <span className="done-flag" title="Quests finished here earn XP"> ★</span>}
          </h2>
        )}
        <span className="column-count">{column.questIds.length}</span>
        <ColumnMenu column={column} onRename={() => setEditing(true)} />
      </header>
      <SortableContext items={column.questIds} strategy={verticalListSortingStrategy}>
        <div className="quest-list">
          {column.questIds.map((id) =>
            quests[id] ? <SortableQuestCard key={id} quest={quests[id]} columnId={column.id} onOpen={onOpenQuest} /> : null,
          )}
        </div>
      </SortableContext>
      <QuickAdd columnId={column.id} />
    </section>
  );
}
```

`src/components/Board.tsx`:
```tsx
import { useState } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCorners, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent, type UniqueIdentifier,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { Column } from '../types';
import { useAppStore } from '../store/useAppStore';
import { playSfx } from '../audio/sfx';
import { ColumnView } from './ColumnView';
import { QuestCard } from './QuestCard';
import './Board.css';

type DragKind = 'quest' | 'column';
const kindOf = (data: unknown): DragKind | undefined => (data as { type?: DragKind } | undefined)?.type;

function findColumnId(columns: Column[], id: UniqueIdentifier): string | null {
  const key = String(id);
  return columns.find((c) => c.id === key)?.id ?? columns.find((c) => c.questIds.includes(key))?.id ?? null;
}

export function Board() {
  const columns = useAppStore((s) => s.data.columns);
  const quests = useAppStore((s) => s.data.quests);
  const moveQuest = useAppStore((s) => s.moveQuest);
  const moveColumn = useAppStore((s) => s.moveColumn);
  const addColumn = useAppStore((s) => s.addColumn);

  // While a quest is dragged we preview cross-column moves locally; the store (and XP) only changes on drop.
  const [preview, setPreview] = useState<Column[] | null>(null);
  const [active, setActive] = useState<{ id: string; kind: DragKind } | null>(null);
  const [, setOpenQuestId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  );
  const shown = preview ?? columns;

  const onDragStart = ({ active: a }: DragStartEvent) => {
    const kind = kindOf(a.data.current);
    if (!kind) return;
    setActive({ id: String(a.id), kind });
    if (kind === 'quest') setPreview(columns.map((c) => ({ ...c, questIds: [...c.questIds] })));
  };

  const onDragOver = ({ active: a, over }: DragOverEvent) => {
    if (!over || kindOf(a.data.current) !== 'quest') return;
    setPreview((prev) => {
      if (!prev) return prev;
      const from = findColumnId(prev, a.id);
      const to = findColumnId(prev, over.id);
      if (!from || !to || from === to) return prev;
      const id = String(a.id);
      return prev.map((c) => {
        if (c.id === from) return { ...c, questIds: c.questIds.filter((q) => q !== id) };
        if (c.id !== to) return c;
        const ids = [...c.questIds];
        const overIndex = ids.indexOf(String(over.id));
        ids.splice(overIndex >= 0 ? overIndex : ids.length, 0, id);
        return { ...c, questIds: ids };
      });
    });
  };

  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    const kind = kindOf(a.data.current);
    const snapshot = preview;
    setActive(null);
    setPreview(null);
    if (!over) return;

    if (kind === 'column') {
      const from = columns.findIndex((c) => c.id === String(a.id));
      const to = columns.findIndex((c) => c.id === findColumnId(columns, over.id));
      if (from >= 0 && to >= 0 && from !== to) moveColumn(from, to);
      return;
    }
    if (kind !== 'quest' || !snapshot) return;
    const id = String(a.id);
    const column = snapshot.find((c) => c.id === findColumnId(snapshot, id));
    if (!column) return;
    const overIndex = column.questIds.indexOf(String(over.id));
    const index = overIndex >= 0 ? overIndex : column.questIds.indexOf(id);
    moveQuest(id, column.id, index);
    playSfx('drop');
  };

  const onDragCancel = () => {
    setActive(null);
    setPreview(null);
  };

  const activeQuest = active?.kind === 'quest' ? quests[active.id] : undefined;
  const activeColumn = active?.kind === 'column' ? columns.find((c) => c.id === active.id) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <main className="board" aria-label="Quest board">
        <SortableContext items={shown.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
          {shown.map((column) => (
            <ColumnView key={column.id} column={column} quests={quests} onOpenQuest={setOpenQuestId} />
          ))}
        </SortableContext>
        <button className="pixel-btn ghost add-column" onClick={() => addColumn('New Column')}>+ Column</button>
      </main>
      <DragOverlay>
        {activeQuest ? (
          <div className="drag-overlay"><QuestCard quest={activeQuest} /></div>
        ) : activeColumn ? (
          <div className="column-ghost pixel-box">{activeColumn.name}</div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
```

`src/components/Board.css`:
```css
.board {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  overflow-x: auto;
  padding: 4px 8px 16px 4px;
  flex: 1;
  scroll-snap-type: x proximity;
}
.column {
  flex: 0 0 300px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  max-height: calc(100vh - 190px);
  scroll-snap-align: start;
}
.column.is-done { border-color: var(--accent); }
.column-header { display: flex; align-items: center; gap: 6px; }
.column-title { font-family: var(--font-title); font-size: 11px; line-height: 1.5; flex: 1; margin: 0; overflow-wrap: anywhere; cursor: text; }
.done-flag { color: var(--accent); }
.column-count { font-family: var(--font-title); font-size: 9px; background: var(--bg); padding: 4px 6px; }
.drag-handle { cursor: grab; background: none; border: none; color: var(--ink); font-size: 18px; padding: 0 4px; touch-action: none; }
.column-name-input { flex: 1; }
.column-menu { position: relative; }
.column-menu summary { list-style: none; }
.column-menu summary::-webkit-details-marker { display: none; }
.column-menu .menu-items {
  position: absolute; right: 0; top: calc(100% + 6px); z-index: 20;
  display: flex; flex-direction: column; gap: 6px; padding: 8px; min-width: 190px;
}
.quest-list { display: flex; flex-direction: column; gap: 10px; overflow-y: auto; min-height: 40px; padding: 2px 6px 6px 2px; }

.quest-card {
  background: var(--card);
  color: var(--card-ink);
  border: 3px solid var(--card-edge);
  border-left-width: 8px;
  box-shadow: 3px 3px 0 var(--shadow);
  padding: 8px 10px;
  cursor: pointer;
  user-select: none;
}
.quest-card.diff-easy { border-left-color: var(--easy); }
.quest-card.diff-normal { border-left-color: var(--normal); }
.quest-card.diff-hard { border-left-color: var(--hard); }
.quest-card.diff-boss { border-color: var(--boss); animation: boss-blink 1.2s steps(1) infinite; }
.quest-card.overdue { animation: overdue-shake 3s steps(1) infinite; }
.quest-card.done { opacity: 0.75; }
.quest-card.done .quest-title { text-decoration: line-through; }
@keyframes boss-blink { 50% { border-color: var(--accent); } }
@keyframes overdue-shake {
  0%, 100% { transform: translateX(0); }
  2% { transform: translateX(-3px); }
  4% { transform: translateX(3px); }
  6% { transform: translateX(-3px); }
  8% { transform: translateX(0); }
}
.quest-title { font-size: 20px; overflow-wrap: anywhere; }
.quest-meta { display: flex; justify-content: space-between; gap: 8px; font-size: 18px; margin-top: 4px; }
.deadline.overdue { color: var(--danger); }
.deadline.today { color: #b86f00; }
.quest-labels { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.label-chip { font-size: 16px; padding: 0 6px; color: #1a1c2c; border: 2px solid #1a1c2c; }

.quick-add { display: grid; gap: 6px; }
.quick-add-actions { display: flex; gap: 6px; }
.add-column { flex: 0 0 auto; }
.drag-overlay .quest-card { transform: rotate(3deg); cursor: grabbing; }
.column-ghost { padding: 12px; font-family: var(--font-title); font-size: 11px; width: 300px; }

@media (max-width: 767px) {
  .board { scroll-snap-type: x mandatory; }
  .column { flex-basis: 85vw; max-height: none; }
}
```

`src/App.tsx` (render the board under the player bar):
```tsx
import { useEffect, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import { useAudioSettings } from './audio/useAudioSettings';
import { PlayerBar, type Panel } from './components/PlayerBar';
import { Board } from './components/Board';

export default function App() {
  const theme = useAppStore((s) => s.data.settings.theme);
  const [, setPanel] = useState<Panel | null>(null);
  useAudioSettings();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="app">
      <h1 className="sr-only">Quest Board</h1>
      <PlayerBar onOpen={setPanel} />
      <Board />
    </div>
  );
}
```

- [ ] **Step 4: Run tests** — `npm test` → PASS; `npm run typecheck` → exit 0.

- [ ] **Step 5: Manual drag check** — `npm run dev`, open http://localhost:5173: drag the welcome quest to Done (XP bar fills, "chest" sound plays), drag it back (XP returns to 0), reorder columns by the ⠿ handle, use Tab + Space + arrow keys + Space to move a card by keyboard.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat(ui): kanban board with drag-and-drop, quick add and column menu

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Modal and quest editor (difficulty, deadline, labels)

**Files:**
- Create: `src/components/Modal.tsx`, `src/components/Modal.css`, `src/components/QuestModal.tsx`
- Modify: `src/components/Board.tsx`
- Test: `src/components/QuestModal.test.tsx`

**Interfaces:**
- Consumes: `updateQuest`, `deleteQuest`, `addLabel`, `deleteLabel`, `LABEL_COLORS`.
- Produces: `<Modal title onClose wide? children />` (Escape closes, focuses the first control, `role="dialog"`), `<QuestModal questId onClose />`.

- [ ] **Step 1: Write the failing test**

`src/components/QuestModal.test.tsx`:
```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuestModal } from './QuestModal';
import { useAppStore } from '../store/useAppStore';
import { useEffectsStore } from '../store/useEffectsStore';
import { createDefaultData } from '../store/defaults';

let questId = '';
beforeEach(() => {
  const data = createDefaultData();
  questId = data.columns[0].questIds[0];
  useAppStore.setState({ data });
  useEffectsStore.setState({ items: [], mood: null });
});
afterEach(() => vi.restoreAllMocks());

const quest = () => useAppStore.getState().data.quests[questId];

describe('QuestModal', () => {
  it('edits title, difficulty, deadline and a new label', async () => {
    const onClose = vi.fn();
    render(<QuestModal questId={questId} onClose={onClose} />);
    const title = screen.getByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Viết báo cáo');
    await userEvent.click(screen.getByRole('button', { name: /Boss/ }));
    fireEvent.change(screen.getByLabelText('Deadline'), { target: { value: '2026-10-01' } });
    await userEvent.type(screen.getByLabelText('New label name'), 'Work');
    await userEvent.click(screen.getByRole('button', { name: 'Add label' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(quest()).toMatchObject({ title: 'Viết báo cáo', difficulty: 'boss', deadline: '2026-10-01' });
    expect(quest().labelIds).toHaveLength(1);
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the modal open and the quest unchanged when the title is only spaces', async () => {
    const onClose = vi.fn();
    const before = quest().title;
    render(<QuestModal questId={questId} onClose={onClose} />);
    const title = screen.getByLabelText('Title');
    await userEvent.clear(title);
    await userEvent.type(title, '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(quest().title).toBe(before);
    expect(useEffectsStore.getState().items.at(-1)?.event).toMatchObject({ tone: 'error' });
  });

  it('deletes after confirmation and closes on Escape', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onClose = vi.fn();
    render(<QuestModal questId={questId} onClose={onClose} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(quest()).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement**

`src/components/Modal.tsx`:
```tsx
import { useEffect, useId, useRef, type ReactNode } from 'react';
import './Modal.css';

interface Props { title: string; onClose: () => void; children: ReactNode; wide?: boolean; }

export function Modal({ title, onClose, children, wide }: Props) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input, textarea, select, button:not(.modal-close)')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeRef.current()}>
      <div ref={ref} className={`modal pixel-box ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-header">
          <h2 id={titleId} className="modal-title">{title}</h2>
          <button className="pixel-btn icon modal-close" onClick={() => closeRef.current()} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
```

`src/components/Modal.css`:
```css
.modal-backdrop {
  position: fixed; inset: 0; z-index: 50;
  display: grid; place-items: center; padding: 16px;
  background: rgb(11 12 22 / 0.7);
}
.modal { width: min(560px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; padding: 16px; }
.modal.wide { width: min(880px, 100%); }
.modal-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.modal-title { font-family: var(--font-title); font-size: 14px; line-height: 1.5; margin: 0; color: var(--accent); }
.modal fieldset { border: 3px dashed var(--ink-dim); padding: 8px; margin: 0; }
.modal legend { font-family: var(--font-title); font-size: 10px; padding: 0 6px; }
.modal-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.spacer { flex: 1; }

.quest-form { display: grid; gap: 12px; }
.quest-form > label { display: grid; gap: 4px; }
.difficulty-picker, .label-picker, .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.label-toggle { display: inline-flex; align-items: stretch; }
.label-toggle .pixel-btn { text-transform: none; font-family: var(--font-body); font-size: 18px; padding: 2px 8px; }
.swatches { display: flex; gap: 6px; flex-wrap: wrap; }
.swatch { width: 26px; height: 26px; border: 3px solid var(--border); cursor: pointer; padding: 0; }
.swatch[aria-pressed='true'] { outline: 3px solid var(--accent); outline-offset: 1px; }
.completion-note { margin: 0; color: var(--good); }
```

`src/components/QuestModal.tsx`:
```tsx
import { useState, type FormEvent } from 'react';
import type { Difficulty } from '../types';
import { useAppStore } from '../store/useAppStore';
import { LABEL_COLORS } from '../store/defaults';
import { Modal } from './Modal';

const DIFFICULTIES: { value: Difficulty; label: string; badge: string }[] = [
  { value: 'easy', label: 'Easy', badge: '★' },
  { value: 'normal', label: 'Normal', badge: '★★' },
  { value: 'hard', label: 'Hard', badge: '★★★' },
  { value: 'boss', label: 'Boss', badge: '💀' },
];

export function QuestModal({ questId, onClose }: { questId: string; onClose: () => void }) {
  const quest = useAppStore((s) => s.data.quests[questId]);
  const labels = useAppStore((s) => s.data.labels);
  const updateQuest = useAppStore((s) => s.updateQuest);
  const deleteQuest = useAppStore((s) => s.deleteQuest);
  const addLabel = useAppStore((s) => s.addLabel);
  const deleteLabel = useAppStore((s) => s.deleteLabel);

  const [title, setTitle] = useState(quest?.title ?? '');
  const [description, setDescription] = useState(quest?.description ?? '');
  const [difficulty, setDifficulty] = useState<Difficulty>(quest?.difficulty ?? 'normal');
  const [deadline, setDeadline] = useState(quest?.deadline ?? '');
  const [labelIds, setLabelIds] = useState<string[]>(quest?.labelIds ?? []);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState<string>(LABEL_COLORS[0]);

  if (!quest) return null;

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (updateQuest(questId, { title, description, difficulty, deadline: deadline || null, labelIds })) onClose();
  };
  const remove = () => {
    if (!window.confirm(`Delete "${quest.title}"?`)) return;
    deleteQuest(questId);
    onClose();
  };
  const toggleLabel = (id: string) =>
    setLabelIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const createLabel = () => {
    const id = addLabel(newLabel, newColor);
    if (!id) return;
    setLabelIds((ids) => [...ids, id]);
    setNewLabel('');
  };
  const removeLabel = (id: string, name: string) => {
    if (!window.confirm(`Delete the label "${name}" from every quest?`)) return;
    deleteLabel(id);
    setLabelIds((ids) => ids.filter((x) => x !== id));
  };

  return (
    <Modal title={quest.completion ? 'Quest Log' : 'Edit Quest'} onClose={onClose}>
      <form className="quest-form" onSubmit={save}>
        <label>
          Title
          <input className="field-input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Description
          <textarea className="field-input" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <fieldset>
          <legend>Difficulty</legend>
          <div className="difficulty-picker">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.value}
                type="button"
                className={`pixel-btn diff-${d.value}`}
                aria-pressed={difficulty === d.value}
                onClick={() => setDifficulty(d.value)}
              >
                {d.badge} {d.label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="row">
          <label className="row">
            Deadline
            <input className="field-input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </label>
          {deadline && (
            <button type="button" className="pixel-btn ghost" onClick={() => setDeadline('')}>No deadline</button>
          )}
        </div>
        <fieldset>
          <legend>Labels</legend>
          <div className="label-picker">
            {labels.map((l) => (
              <span key={l.id} className="label-toggle">
                <button
                  type="button"
                  className="pixel-btn"
                  style={{ borderLeft: `10px solid ${l.color}` }}
                  aria-pressed={labelIds.includes(l.id)}
                  onClick={() => toggleLabel(l.id)}
                >
                  {l.name}
                </button>
                <button type="button" className="pixel-btn ghost" aria-label={`Delete label ${l.name}`} onClick={() => removeLabel(l.id, l.name)}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <input
              className="field-input"
              style={{ width: 160 }}
              aria-label="New label name"
              placeholder="New label"
              maxLength={20}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <div className="swatches">
              {LABEL_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="swatch"
                  style={{ background: c }}
                  aria-label={`Label color ${c}`}
                  aria-pressed={newColor === c}
                  onClick={() => setNewColor(c)}
                />
              ))}
            </div>
            <button type="button" className="pixel-btn" onClick={createLabel}>Add label</button>
          </div>
        </fieldset>
        {quest.completion && (
          <p className="completion-note">
            ✅ Completed {new Date(quest.completion.at).toLocaleDateString()} · +{quest.completion.xp} XP
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="pixel-btn danger" onClick={remove}>Delete</button>
          <span className="spacer" />
          <button type="button" className="pixel-btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="pixel-btn primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}
```

Modify `src/components/Board.tsx`:
- Add `import { QuestModal } from './QuestModal';`
- Replace `const [, setOpenQuestId] = useState<string | null>(null);` with `const [openQuestId, setOpenQuestId] = useState<string | null>(null);`
- Wrap the returned `<DndContext>…</DndContext>` in a fragment and render the modal after it:
```tsx
  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        {/* …unchanged board + DragOverlay… */}
      </DndContext>
      {openQuestId && <QuestModal questId={openQuestId} onClose={() => setOpenQuestId(null)} />}
    </>
  );
```

Add to `src/components/Board.test.tsx` inside `describe('Board')`:
```tsx
  it('opens the quest editor when a card is clicked', async () => {
    render(<Board />);
    await userEvent.click(screen.getByText(/Welcome, hero!/));
    expect(screen.getByRole('dialog', { name: 'Edit Quest' })).toBeInTheDocument();
  });
```

- [ ] **Step 4: Run tests** — `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat(ui): quest editor modal with difficulty, deadline and labels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Effects layer, achievements panel and backup banner

**Files:**
- Create: `src/components/EffectsLayer.tsx`, `src/components/Effects.css`, `src/components/AchievementsPanel.tsx`, `src/components/BackupBanner.tsx`, `src/store/backup.ts`
- Modify: `src/App.tsx`
- Test: `src/components/EffectsLayer.test.tsx`

**Interfaces:**
- Consumes: `useEffectsStore`, `ACHIEVEMENTS`, `shouldShowBackupReminder`, `serialize`, `backupFileName`, `parseBackup`.
- Produces: `<EffectsLayer />`, `<AchievementsPanel onClose />`, `<BackupBanner />`, `downloadBackup(now?: Date): void`, `readBackupFile(file: Blob): Promise<ImportResult>`.

- [ ] **Step 1: Write the failing test**

`src/components/EffectsLayer.test.tsx`:
```tsx
import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EffectsLayer } from './EffectsLayer';
import { AchievementsPanel } from './AchievementsPanel';
import { BackupBanner } from './BackupBanner';
import { useEffectsStore } from '../store/useEffectsStore';
import { useAppStore } from '../store/useAppStore';
import { createDefaultData } from '../store/defaults';

beforeEach(() => {
  useEffectsStore.setState({ items: [], mood: null });
  useAppStore.setState({ data: createDefaultData() });
});

describe('EffectsLayer', () => {
  it('shows XP gain, level up and achievement toasts', () => {
    render(<EffectsLayer />);
    act(() =>
      useEffectsStore.getState().push([
        { type: 'questCompleted', questId: 'q', xp: 26, difficulty: 'normal' },
        { type: 'levelUp', level: 3 },
        { type: 'achievement', id: 'first-blood' },
      ]),
    );
    expect(screen.getByText('+26 XP')).toBeInTheDocument();
    expect(screen.getByText('LEVEL UP!')).toBeInTheDocument();
    expect(screen.getByText('LV 3')).toBeInTheDocument();
    expect(screen.getByText('First Blood')).toBeInTheDocument();
  });

  it('shows error toasts as alerts', () => {
    render(<EffectsLayer />);
    act(() => useEffectsStore.getState().toast('Boom', 'error'));
    expect(screen.getByRole('alert')).toHaveTextContent('Boom');
  });
});

describe('AchievementsPanel', () => {
  it('lists unlocked and locked achievements', () => {
    const data = createDefaultData();
    data.player.unlockedAchievements = { 'first-blood': new Date().toISOString() };
    useAppStore.setState({ data });
    render(<AchievementsPanel onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Achievements 1/12' })).toBeInTheDocument();
    expect(screen.getByText('First Blood').closest('li')).toHaveClass('unlocked');
    expect(screen.getByText('Boss Slayer').closest('li')).toHaveClass('locked');
  });
});

describe('BackupBanner', () => {
  it('appears when a backup is due and can be snoozed', async () => {
    const data = createDefaultData(new Date(Date.now() - 4 * 86_400_000));
    useAppStore.setState({ data });
    render(<BackupBanner />);
    await userEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('button', { name: 'Later' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement**

`src/store/backup.ts`:
```ts
import { backupFileName, parseBackup, serialize, type ImportResult } from './persistence';
import { useAppStore } from './useAppStore';

export function downloadBackup(now: Date = new Date()): void {
  const blob = new Blob([serialize(useAppStore.getState().data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = backupFileName(now);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  useAppStore.getState().markExported();
}

function readText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export async function readBackupFile(file: Blob): Promise<ImportResult> {
  try {
    return parseBackup(await readText(file));
  } catch {
    return { ok: false, error: 'Could not read that file.' };
  }
}
```

`src/components/EffectsLayer.tsx`:
```tsx
import type { CSSProperties } from 'react';
import { useEffectsStore, type EffectItem } from '../store/useEffectsStore';
import { ACHIEVEMENTS } from '../game/achievements';
import './Effects.css';

function XpBurst({ xp, boss }: { xp: number; boss: boolean }) {
  const count = boss ? 20 : 12;
  return (
    <div className="xp-burst">
      <div className="xp-float">+{xp} XP{boss ? ' 💀' : ''}</div>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="particle"
          style={{ '--angle': `${(360 / count) * i}deg`, '--dist': `${40 + (i % 3) * 18}px` } as CSSProperties}
        />
      ))}
    </div>
  );
}

function Overlay({ item }: { item: EffectItem }) {
  const { event } = item;
  switch (event.type) {
    case 'questCompleted':
      return <XpBurst xp={event.xp} boss={event.difficulty === 'boss'} />;
    case 'questUncompleted':
      return <div className="xp-float negative">-{event.xp} XP</div>;
    case 'levelUp':
      return (
        <div className="level-up-overlay" role="status">
          <div className="level-up-text">LEVEL UP!</div>
          <div className="level-up-level">LV {event.level}</div>
        </div>
      );
    default:
      return null;
  }
}

function Toast({ item }: { item: EffectItem }) {
  const { event } = item;
  if (event.type === 'toast') {
    return (
      <div className={`toast toast-${event.tone}`} role={event.tone === 'error' ? 'alert' : 'status'}>
        {event.message}
      </div>
    );
  }
  if (event.type !== 'achievement') return null;
  const achievement = ACHIEVEMENTS.find((a) => a.id === event.id);
  if (!achievement) return null;
  return (
    <div className="toast achievement-toast" role="status">
      <span className="toast-icon">{achievement.icon}</span>
      <div>
        <div className="toast-title">🏆 ACHIEVEMENT UNLOCKED</div>
        <div>{achievement.name}</div>
      </div>
    </div>
  );
}

export function EffectsLayer() {
  const items = useEffectsStore((s) => s.items);
  return (
    <>
      <div className="effects-layer">
        {items.map((item) => <Overlay key={item.key} item={item} />)}
      </div>
      <div className="toast-stack">
        {items.map((item) => <Toast key={item.key} item={item} />)}
      </div>
    </>
  );
}
```

`src/components/Effects.css`:
```css
.effects-layer { position: fixed; inset: 0; pointer-events: none; z-index: 40; }
.xp-burst { position: absolute; left: 50%; top: 40%; }
.xp-float {
  position: absolute; left: 0; top: 0;
  font-family: var(--font-title); font-size: 18px; white-space: nowrap;
  color: var(--xp); text-shadow: 3px 3px 0 var(--shadow);
  animation: xp-rise 1.5s steps(10) forwards;
}
.xp-float.negative { left: 50%; top: 40%; color: var(--danger); }
@keyframes xp-rise {
  from { transform: translate(-50%, 0); opacity: 1; }
  to { transform: translate(-50%, -120px); opacity: 0; }
}
.particle {
  position: absolute; left: 0; top: 0; width: 8px; height: 8px;
  background: var(--accent);
  animation: particle-fly 0.8s steps(6) forwards;
}
.particle:nth-child(3n) { background: var(--xp); }
.particle:nth-child(3n + 1) { background: #f4f4f4; }
@keyframes particle-fly {
  from { transform: rotate(var(--angle)) translateX(0); opacity: 1; }
  to { transform: rotate(var(--angle)) translateX(var(--dist)); opacity: 0; }
}
.level-up-overlay {
  position: absolute; inset: 0; display: grid; place-content: center; text-align: center;
  background: rgb(26 28 44 / 0.55);
  animation: overlay-out 2.8s steps(1) forwards;
}
.level-up-text {
  font-family: var(--font-title); font-size: clamp(28px, 7vw, 64px);
  color: var(--accent); text-shadow: 6px 6px 0 var(--danger);
  animation: blink 0.4s steps(1) infinite;
}
.level-up-level { font-family: var(--font-title); font-size: 20px; margin-top: 16px; color: #f4f4f4; }
@keyframes blink { 50% { opacity: 0.3; } }
@keyframes overlay-out { 90% { opacity: 1; } 100% { opacity: 0; } }

.toast-stack {
  position: fixed; right: 16px; bottom: 16px; z-index: 45;
  display: flex; flex-direction: column; gap: 8px;
  max-width: calc(100vw - 32px); pointer-events: none;
}
.toast {
  display: flex; gap: 10px; align-items: center; padding: 10px 12px;
  background: var(--panel); border: 3px solid var(--border); box-shadow: 3px 3px 0 var(--shadow);
  animation: toast-in 0.3s steps(3);
}
.toast-error { border-color: var(--danger); }
.achievement-toast { border-color: var(--accent); }
.toast-title { font-family: var(--font-title); font-size: 9px; color: var(--accent); margin-bottom: 4px; }
.toast-icon { font-size: 28px; }
@keyframes toast-in { from { transform: translateX(40px); opacity: 0; } }

.backup-banner { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 8px 12px; background: var(--panel-alt); }
.backup-banner p { margin: 0; flex: 1; min-width: 200px; }

.achievement-grid {
  list-style: none; margin: 0; padding: 0;
  display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}
.achievement { display: flex; gap: 10px; padding: 10px; background: var(--panel-alt); border: 3px solid var(--border); }
.achievement.locked { opacity: 0.55; }
.achievement.locked .badge { filter: grayscale(1); }
.badge { flex: 0 0 44px; height: 44px; display: grid; place-items: center; font-size: 26px; background: var(--bg); border: 3px solid var(--accent); }
.achievement-name { font-family: var(--font-title); font-size: 10px; line-height: 1.5; margin-bottom: 4px; }
.achievement-desc, .achievement-date { font-size: 17px; color: var(--ink-dim); }
```

`src/components/AchievementsPanel.tsx`:
```tsx
import { useAppStore } from '../store/useAppStore';
import { ACHIEVEMENTS } from '../game/achievements';
import { Modal } from './Modal';

export function AchievementsPanel({ onClose }: { onClose: () => void }) {
  const unlocked = useAppStore((s) => s.data.player.unlockedAchievements);
  const count = ACHIEVEMENTS.filter((a) => unlocked[a.id]).length;
  return (
    <Modal title={`Achievements ${count}/${ACHIEVEMENTS.length}`} onClose={onClose} wide>
      <ul className="achievement-grid">
        {ACHIEVEMENTS.map((a) => {
          const at = unlocked[a.id];
          return (
            <li key={a.id} className={`achievement ${at ? 'unlocked' : 'locked'}`}>
              <span className="badge" aria-hidden="true">{a.icon}</span>
              <div>
                <div className="achievement-name">{a.name}</div>
                <div className="achievement-desc">{a.description}</div>
                {at && <div className="achievement-date">Unlocked {new Date(at).toLocaleDateString()}</div>}
              </div>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
```

`src/components/BackupBanner.tsx`:
```tsx
import { useAppStore } from '../store/useAppStore';
import { shouldShowBackupReminder } from '../store/persistence';
import { downloadBackup } from '../store/backup';

export function BackupBanner() {
  const data = useAppStore((s) => s.data);
  const snoozeBackup = useAppStore((s) => s.snoozeBackup);
  if (!shouldShowBackupReminder(data, new Date())) return null;
  return (
    <div className="backup-banner pixel-box" role="status">
      <p>💾 Your quests only live in this browser. Save a backup file!</p>
      <button className="pixel-btn primary" onClick={() => downloadBackup()}>Export now</button>
      <button className="pixel-btn ghost" onClick={snoozeBackup}>Later</button>
    </div>
  );
}
```

`src/App.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import { useAudioSettings } from './audio/useAudioSettings';
import { PlayerBar, type Panel } from './components/PlayerBar';
import { Board } from './components/Board';
import { BackupBanner } from './components/BackupBanner';
import { EffectsLayer } from './components/EffectsLayer';
import { AchievementsPanel } from './components/AchievementsPanel';

export default function App() {
  const theme = useAppStore((s) => s.data.settings.theme);
  const [panel, setPanel] = useState<Panel | null>(null);
  const close = () => setPanel(null);
  useAudioSettings();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="app">
      <h1 className="sr-only">Quest Board</h1>
      <PlayerBar onOpen={setPanel} />
      <BackupBanner />
      <Board />
      <EffectsLayer />
      {panel === 'achievements' && <AchievementsPanel onClose={close} />}
    </div>
  );
}
```

- [ ] **Step 4: Run tests** — `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat(ui): XP bursts, level-up overlay, achievement toasts and backup banner

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Pixel avatar editor

**Files:**
- Create: `src/avatar/editor.ts`, `src/avatar/image.ts`, `src/components/PixelEditor.tsx`, `src/components/PixelEditor.css`
- Modify: `src/App.tsx`
- Test: `src/avatar/editor.test.ts`, `src/components/PixelEditor.test.tsx`

**Interfaces:**
- Consumes: `GRID`, `PALETTE`, `emptyFrame`, `MASCOT`, `saveAvatar`, `resetAvatar`, `PixelCanvas`, `Modal`.
- Produces: `setPixel(frame, index, color): Frame` (same reference when unchanged), `floodFill(frame, index, color): Frame`, `flipHorizontal(frame): Frame`, `rgbaToFrame(data: ArrayLike<number>): Frame`, `interface History { past: Frame[]; present: Frame; future: Frame[] }`, `MAX_HISTORY = 100`, `historyInit`, `historyPush`, `historyReplace`, `undo`, `redo`; `imageFileToFrame(file: File): Promise<Frame>`; `<PixelEditor onClose />`.

- [ ] **Step 1: Write the failing tests**

`src/avatar/editor.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { GRID, emptyFrame } from './mascot';
import { MAX_HISTORY, floodFill, flipHorizontal, historyInit, historyPush, historyReplace, redo, rgbaToFrame, setPixel, undo } from './editor';

describe('pixel operations', () => {
  it('sets a pixel and returns the same frame when nothing changes', () => {
    const f = emptyFrame();
    const g = setPixel(f, 5, '#ff0000');
    expect(g[5]).toBe('#ff0000');
    expect(f[5]).toBeNull();
    expect(setPixel(g, 5, '#ff0000')).toBe(g);
  });

  it('flood fills an empty frame completely', () => {
    expect(floodFill(emptyFrame(), 0, '#000000').every((c) => c === '#000000')).toBe(true);
  });

  it('stops flood fill at a wall', () => {
    let f = emptyFrame();
    for (let y = 0; y < GRID; y++) f = setPixel(f, y * GRID + 10, '#111111'); // vertical wall at x=10
    const filled = floodFill(f, 0, '#ff0000');
    expect(filled[5]).toBe('#ff0000');
    expect(filled[20]).toBeNull();
    expect(filled[10]).toBe('#111111');
    expect(floodFill(filled, 0, '#ff0000')).toBe(filled);
  });

  it('flips horizontally', () => {
    const f = setPixel(emptyFrame(), 0, '#abcdef');
    expect(flipHorizontal(f)[GRID - 1]).toBe('#abcdef');
  });

  it('converts RGBA data, treating low alpha as transparent', () => {
    const data = new Uint8ClampedArray(GRID * GRID * 4);
    data.set([255, 128, 0, 255], 0);
    data.set([10, 10, 10, 50], 4);
    const f = rgbaToFrame(data);
    expect(f[0]).toBe('#ff8000');
    expect(f[1]).toBeNull();
  });
});

describe('history', () => {
  it('undoes and redoes', () => {
    const a = emptyFrame();
    const b = setPixel(a, 1, '#000000');
    let h = historyPush(historyInit(a), b);
    h = undo(h);
    expect(h.present).toBe(a);
    h = redo(h);
    expect(h.present).toBe(b);
  });
  it('ignores pushes that change nothing and replaces during strokes', () => {
    const a = emptyFrame();
    const h = historyInit(a);
    expect(historyPush(h, a)).toBe(h);
    const c = setPixel(a, 2, '#000000');
    expect(historyReplace(h, c)).toEqual({ past: [], present: c, future: [] });
  });
  it('caps the undo stack', () => {
    let h = historyInit(emptyFrame());
    for (let i = 0; i < MAX_HISTORY + 20; i++) h = historyPush(h, setPixel(h.present, i, '#000000'));
    expect(h.past).toHaveLength(MAX_HISTORY);
  });
});
```

`src/components/PixelEditor.test.tsx`:
```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PixelEditor } from './PixelEditor';
import { useAppStore } from '../store/useAppStore';
import { createDefaultData } from '../store/defaults';
import { MASCOT } from '../avatar/mood';

beforeEach(() => useAppStore.setState({ data: createDefaultData() }));
afterEach(() => vi.restoreAllMocks());

const frames = () => useAppStore.getState().data.avatar.frames;

describe('PixelEditor', () => {
  it('starts from the mascot and saves it as a custom frame', async () => {
    const onClose = vi.fn();
    render(<PixelEditor onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start from mascot' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(frames().normal).toEqual(MASCOT.normal);
    expect(frames().happy).toBeNull();
    expect(useAppStore.getState().data.player.unlockedAchievements.artist).toBeDefined();
    expect(onClose).toHaveBeenCalled();
  });

  it('undo restores the empty frame', async () => {
    render(<PixelEditor onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start from mascot' }));
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(frames().normal).toBeNull();
  });

  it('copies Normal into another mood tab', async () => {
    render(<PixelEditor onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start from mascot' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Sad' }));
    await userEvent.click(screen.getByRole('button', { name: 'Copy from Normal' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(frames().sad).toEqual(MASCOT.normal);
  });

  it('resets to default after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const data = createDefaultData();
    data.avatar.frames.normal = MASCOT.sad;
    useAppStore.setState({ data });
    render(<PixelEditor onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
    expect(frames().normal).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement**

`src/avatar/editor.ts`:
```ts
import type { Frame } from '../types';
import { GRID } from './mascot';

export function setPixel(frame: Frame, index: number, color: string | null): Frame {
  if (frame[index] === color) return frame;
  const next = [...frame];
  next[index] = color;
  return next;
}

export function floodFill(frame: Frame, start: number, color: string | null): Frame {
  const target = frame[start];
  if (target === color) return frame;
  const next = [...frame];
  const stack = [start];
  while (stack.length > 0) {
    const i = stack.pop()!;
    if (next[i] !== target) continue;
    next[i] = color;
    const x = i % GRID;
    const y = Math.floor(i / GRID);
    if (x > 0) stack.push(i - 1);
    if (x < GRID - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - GRID);
    if (y < GRID - 1) stack.push(i + GRID);
  }
  return next;
}

export function flipHorizontal(frame: Frame): Frame {
  return frame.map((_, i) => {
    const x = i % GRID;
    const y = Math.floor(i / GRID);
    return frame[y * GRID + (GRID - 1 - x)];
  });
}

const hex = (n: number) => n.toString(16).padStart(2, '0');

export function rgbaToFrame(data: ArrayLike<number>): Frame {
  const frame: Frame = [];
  for (let i = 0; i < GRID * GRID; i++) {
    const o = i * 4;
    frame.push(data[o + 3] < 128 ? null : `#${hex(data[o])}${hex(data[o + 1])}${hex(data[o + 2])}`);
  }
  return frame;
}

export interface History { past: Frame[]; present: Frame; future: Frame[]; }
export const MAX_HISTORY = 100;

export const historyInit = (frame: Frame): History => ({ past: [], present: frame, future: [] });

export function historyPush(h: History, next: Frame): History {
  if (next === h.present) return h;
  return { past: [...h.past, h.present].slice(-MAX_HISTORY), present: next, future: [] };
}

export function historyReplace(h: History, next: Frame): History {
  return next === h.present ? h : { ...h, present: next };
}

export function undo(h: History): History {
  if (h.past.length === 0) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

export function redo(h: History): History {
  if (h.future.length === 0) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}
```

`src/avatar/image.ts`:
```ts
import type { Frame } from '../types';
import { GRID } from './mascot';
import { rgbaToFrame } from './editor';

/** Scales an image to fit 32x32 (keeping aspect ratio, centered) and converts it to a frame. */
export async function imageFileToFrame(file: File): Promise<Frame> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Unreadable image'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = GRID;
    canvas.height = GRID;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const scale = Math.min(GRID / img.width, GRID / img.height);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    ctx.drawImage(img, Math.floor((GRID - w) / 2), Math.floor((GRID - h) / 2), w, h);
    return rgbaToFrame(ctx.getImageData(0, 0, GRID, GRID).data);
  } finally {
    URL.revokeObjectURL(url);
  }
}
```

`src/components/PixelEditor.tsx`:
```tsx
import { useRef, useState, type ChangeEvent, type KeyboardEvent, type PointerEvent } from 'react';
import type { Frame, Mood } from '../types';
import { useAppStore } from '../store/useAppStore';
import { useEffectsStore } from '../store/useEffectsStore';
import { GRID, PALETTE, emptyFrame } from '../avatar/mascot';
import { MASCOT } from '../avatar/mood';
import {
  floodFill, flipHorizontal, historyInit, historyPush, historyReplace, redo, setPixel, undo, type History,
} from '../avatar/editor';
import { imageFileToFrame } from '../avatar/image';
import { Modal } from './Modal';
import { PixelCanvas } from './PixelCanvas';
import './PixelEditor.css';

const TABS: { id: Mood; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'happy', label: 'Happy' },
  { id: 'levelUp', label: 'Level Up' },
  { id: 'sad', label: 'Sad' },
];
type Tool = 'pen' | 'eraser' | 'fill' | 'picker';
const TOOLS: { id: Tool; label: string }[] = [
  { id: 'pen', label: '✏️ Pen' },
  { id: 'eraser', label: '🧽 Eraser' },
  { id: 'fill', label: '🪣 Fill' },
  { id: 'picker', label: '💧 Picker' },
];

export function PixelEditor({ onClose }: { onClose: () => void }) {
  const saved = useAppStore((s) => s.data.avatar.frames);
  const saveAvatar = useAppStore((s) => s.saveAvatar);
  const resetAvatar = useAppStore((s) => s.resetAvatar);

  const [tab, setTab] = useState<Mood>('normal');
  const [histories, setHistories] = useState<Record<Mood, History>>(() => ({
    normal: historyInit(saved.normal ?? emptyFrame()),
    happy: historyInit(saved.happy ?? emptyFrame()),
    levelUp: historyInit(saved.levelUp ?? emptyFrame()),
    sad: historyInit(saved.sad ?? emptyFrame()),
  }));
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>(PALETTE[0]);
  const [trace, setTrace] = useState<Frame | null>(null);
  const [uploadMode, setUploadMode] = useState<'trace' | 'apply'>('trace');
  const drawing = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const present = histories[tab].present;
  const update = (fn: (h: History) => History) => setHistories((hs) => ({ ...hs, [tab]: fn(hs[tab]) }));
  const paintColor = tool === 'eraser' ? null : color;

  const cellAt = (e: PointerEvent<HTMLDivElement>): number | null => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * GRID);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * GRID);
    return x < 0 || y < 0 || x >= GRID || y >= GRID ? null : y * GRID + x;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const i = cellAt(e);
    if (i === null) return;
    if (tool === 'picker') {
      const picked = present[i];
      if (picked) {
        setColor(picked);
        setTool('pen');
      }
      return;
    }
    if (tool === 'fill') {
      update((h) => historyPush(h, floodFill(h.present, i, color)));
      return;
    }
    drawing.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    update((h) => historyPush(h, setPixel(h.present, i, paintColor)));
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drawing.current) return;
    const i = cellAt(e);
    if (i !== null) update((h) => historyReplace(h, setPixel(h.present, i, paintColor)));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key.toLowerCase() === 'z') {
      e.preventDefault();
      update(e.shiftKey ? redo : undo);
    } else if (e.key.toLowerCase() === 'y') {
      e.preventDefault();
      update(redo);
    }
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const frame = await imageFileToFrame(file);
      if (uploadMode === 'trace') setTrace(frame);
      else update((h) => historyPush(h, frame));
    } catch {
      useEffectsStore.getState().toast('Could not read that image.', 'error');
    }
  };

  const save = () => {
    saveAvatar({
      normal: histories.normal.present,
      happy: histories.happy.present,
      levelUp: histories.levelUp.present,
      sad: histories.sad.present,
    });
    onClose();
  };

  const reset = () => {
    if (!window.confirm('Reset your avatar to the default mascot? Your drawings will be lost.')) return;
    resetAvatar();
    onClose();
  };

  return (
    <Modal title="Avatar Workshop" onClose={onClose} wide>
      <div className="editor" onKeyDown={onKeyDown}>
        <div className="editor-main">
          <div className="editor-tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className="pixel-btn" aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <div
            ref={gridRef}
            className="editor-grid"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => (drawing.current = false)}
            onPointerCancel={() => (drawing.current = false)}
          >
            {trace && <PixelCanvas frame={trace} className="trace-layer" />}
            <PixelCanvas frame={present} className="draw-layer" label={`${tab} frame`} />
          </div>
        </div>

        <div className="editor-side">
          <div className="row">
            {TOOLS.map((t) => (
              <button key={t.id} className="pixel-btn" aria-pressed={tool === t.id} onClick={() => setTool(t.id)}>{t.label}</button>
            ))}
          </div>
          <div className="palette">
            {PALETTE.map((c) => (
              <button key={c} className="swatch" style={{ background: c }} aria-label={`Color ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} />
            ))}
            <input type="color" aria-label="Custom color" value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
          <div className="row">
            <button className="pixel-btn" onClick={() => update(undo)}>Undo</button>
            <button className="pixel-btn" onClick={() => update(redo)}>Redo</button>
            <button className="pixel-btn" onClick={() => update((h) => historyPush(h, flipHorizontal(h.present)))}>Flip</button>
            <button className="pixel-btn" onClick={() => update((h) => historyPush(h, emptyFrame()))}>Clear</button>
          </div>
          <div className="row">
            <button className="pixel-btn" disabled={tab === 'normal'} onClick={() => update((h) => historyPush(h, [...histories.normal.present]))}>
              Copy from Normal
            </button>
            <button className="pixel-btn" onClick={() => update((h) => historyPush(h, [...MASCOT[tab]]))}>Start from mascot</button>
          </div>
          <fieldset>
            <legend>Image</legend>
            <div className="row">
              <label><input type="radio" name="upload-mode" checked={uploadMode === 'trace'} onChange={() => setUploadMode('trace')} /> Trace</label>
              <label><input type="radio" name="upload-mode" checked={uploadMode === 'apply'} onChange={() => setUploadMode('apply')} /> Apply</label>
            </div>
            <div className="row">
              <button className="pixel-btn" onClick={() => fileRef.current?.click()}>📷 Upload</button>
              {trace && <button className="pixel-btn ghost" onClick={() => setTrace(null)}>Hide trace</button>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          </fieldset>
          <div className="editor-preview">
            {TABS.map((t) => (
              <PixelCanvas key={t.id} frame={histories[t.id].present} size={40} label={`${t.label} preview`} />
            ))}
          </div>
          <div className="modal-actions">
            <button className="pixel-btn danger" onClick={reset}>Reset to default</button>
            <span className="spacer" />
            <button className="pixel-btn ghost" onClick={onClose}>Cancel</button>
            <button className="pixel-btn primary" onClick={save}>Save</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
```

`src/components/PixelEditor.css`:
```css
.editor { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 16px; }
.editor-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.editor-grid {
  position: relative;
  width: min(100%, 448px);
  aspect-ratio: 1;
  border: 3px solid var(--border);
  background: #ffffff conic-gradient(#e4e8ee 25%, #ffffff 0 50%, #e4e8ee 0 75%, #ffffff 0) 0 0 / calc(100% / 16) calc(100% / 16);
  touch-action: none;
  cursor: crosshair;
}
.editor-grid canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.editor-grid .trace-layer { opacity: 0.35; }
.editor-grid::after {
  content: '';
  position: absolute; inset: 0; pointer-events: none;
  background-image:
    linear-gradient(rgb(0 0 0 / 0.12) 1px, transparent 1px),
    linear-gradient(90deg, rgb(0 0 0 / 0.12) 1px, transparent 1px);
  background-size: calc(100% / 32) calc(100% / 32);
}
.editor-side { display: grid; gap: 12px; align-content: start; }
.palette { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; }
.palette .swatch { width: 100%; height: auto; aspect-ratio: 1; }
.palette input[type='color'] { width: 100%; height: 100%; min-height: 26px; padding: 0; border: 3px solid var(--border); background: none; }
.editor-preview { display: flex; gap: 8px; }
.editor-preview canvas { background: var(--bg); border: 2px solid var(--border); }
@media (max-width: 767px) { .editor { grid-template-columns: 1fr; } }
```

`src/App.tsx`: add `import { PixelEditor } from './components/PixelEditor';` and after the achievements line render:
```tsx
      {panel === 'editor' && <PixelEditor onClose={close} />}
```

- [ ] **Step 4: Run tests** — `npm test` → PASS; `npm run typecheck` → exit 0.

- [ ] **Step 5: Manual check** — `npm run dev`: click the avatar, draw with the pen (mouse drag), fill, pick a color, undo with Ctrl+Z, upload a photo in Trace mode, save; the player bar avatar shows your drawing and bounces after completing a quest.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat(avatar): pixel editor with 4 mood frames, tools, undo and image tracing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Settings panel (sound, theme, avatar, backup import/export)

**Files:**
- Create: `src/components/SettingsPanel.tsx`
- Modify: `src/App.tsx`
- Test: `src/components/SettingsPanel.test.tsx`

**Interfaces:**
- Consumes: `updateSettings`, `replaceData`, `downloadBackup`, `readBackupFile`, `playSfx`, `useEffectsStore().toast`.
- Produces: `<SettingsPanel onClose onEditAvatar />`.

- [ ] **Step 1: Write the failing test**

`src/components/SettingsPanel.test.tsx`:
```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPanel } from './SettingsPanel';
import { useAppStore } from '../store/useAppStore';
import { useEffectsStore } from '../store/useEffectsStore';
import { createDefaultData } from '../store/defaults';
import { serialize } from '../store/persistence';

beforeEach(() => {
  useAppStore.setState({ data: createDefaultData() });
  useEffectsStore.setState({ items: [], mood: null });
});
afterEach(() => vi.restoreAllMocks());

const settings = () => useAppStore.getState().data.settings;

describe('SettingsPanel', () => {
  it('changes theme and music settings', async () => {
    render(<SettingsPanel onClose={() => {}} onEditAvatar={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Light' }));
    expect(settings().theme).toBe('light');
    await userEvent.click(screen.getByLabelText('Background music'));
    expect(settings().musicOn).toBe(true);
  });

  it('imports a valid backup after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const backup = createDefaultData();
    backup.player.totalXp = 777;
    render(<SettingsPanel onClose={() => {}} onEditAvatar={() => {}} />);
    const file = new File([serialize(backup)], 'backup.json', { type: 'application/json' });
    fireEvent.change(screen.getByTestId('import-input'), { target: { files: [file] } });
    await waitFor(() => expect(useAppStore.getState().data.player.totalXp).toBe(777));
  });

  it('rejects a broken backup and keeps current data', async () => {
    const before = useAppStore.getState().data;
    render(<SettingsPanel onClose={() => {}} onEditAvatar={() => {}} />);
    fireEvent.change(screen.getByTestId('import-input'), {
      target: { files: [new File(['{nope'], 'bad.json', { type: 'application/json' })] },
    });
    await waitFor(() =>
      expect(useEffectsStore.getState().items.at(-1)?.event).toEqual({ type: 'toast', message: 'This file is not valid JSON.', tone: 'error' }),
    );
    expect(useAppStore.getState().data).toBe(before);
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement**

`src/components/SettingsPanel.tsx`:
```tsx
import { useRef, type ChangeEvent } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useEffectsStore } from '../store/useEffectsStore';
import { downloadBackup, readBackupFile } from '../store/backup';
import { playSfx } from '../audio/sfx';
import { Modal } from './Modal';

interface Props { onClose: () => void; onEditAvatar: () => void; }

export function SettingsPanel({ onClose, onEditAvatar }: Props) {
  const settings = useAppStore((s) => s.data.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const replaceData = useAppStore((s) => s.replaceData);
  const fileRef = useRef<HTMLInputElement>(null);

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const effects = useEffectsStore.getState();
    const result = await readBackupFile(file);
    if (!result.ok) {
      effects.toast(result.error, 'error');
      return;
    }
    if (!window.confirm('Replace ALL current quests and progress with this backup?')) return;
    replaceData(result.data);
    effects.toast('Backup restored!');
  };

  return (
    <Modal title="Settings" onClose={onClose}>
      <section className="settings-section">
        <h3>Sound</h3>
        <label className="range-row">
          Effects volume
          <input type="range" min={0} max={1} step={0.05} value={settings.sfxVolume}
            onChange={(e) => updateSettings({ sfxVolume: Number(e.target.value) })} />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={settings.musicOn} onChange={(e) => updateSettings({ musicOn: e.target.checked })} />
          Background music
        </label>
        <label className="range-row">
          Music volume
          <input type="range" min={0} max={1} step={0.05} value={settings.musicVolume}
            onChange={(e) => updateSettings({ musicVolume: Number(e.target.value) })} />
        </label>
        <div className="row">
          <button className="pixel-btn ghost" onClick={() => playSfx('complete')}>Test sound</button>
        </div>
      </section>

      <section className="settings-section">
        <h3>Theme</h3>
        <div className="row">
          <button className="pixel-btn" aria-pressed={settings.theme === 'dark'} onClick={() => updateSettings({ theme: 'dark' })}>Dark</button>
          <button className="pixel-btn" aria-pressed={settings.theme === 'light'} onClick={() => updateSettings({ theme: 'light' })}>Light</button>
        </div>
      </section>

      <section className="settings-section">
        <h3>Avatar</h3>
        <div className="row">
          <button className="pixel-btn" onClick={onEditAvatar}>🎨 Edit avatar</button>
        </div>
      </section>

      <section className="settings-section">
        <h3>Backup</h3>
        <p className="settings-note">
          {settings.lastExportAt ? `Last export: ${new Date(settings.lastExportAt).toLocaleString()}` : 'Never exported yet.'}
        </p>
        <div className="row">
          <button className="pixel-btn primary" onClick={() => downloadBackup()}>💾 Export</button>
          <button className="pixel-btn" onClick={() => fileRef.current?.click()}>📂 Import</button>
        </div>
        <input ref={fileRef} data-testid="import-input" type="file" accept="application/json,.json" hidden onChange={onImport} />
      </section>
    </Modal>
  );
}
```

Append to `src/components/Modal.css`:
```css
.settings-section { display: grid; gap: 8px; margin-bottom: 16px; }
.settings-section h3 { font-family: var(--font-title); font-size: 11px; margin: 0; color: var(--accent); }
.range-row { display: grid; grid-template-columns: 150px 1fr; align-items: center; gap: 8px; }
.check-row { display: flex; align-items: center; gap: 8px; }
.settings-note { margin: 0; color: var(--ink-dim); }
```

`src/App.tsx`: add `import { SettingsPanel } from './components/SettingsPanel';` and render:
```tsx
      {panel === 'settings' && <SettingsPanel onClose={close} onEditAvatar={() => setPanel('editor')} />}
```

- [ ] **Step 4: Run tests** — `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat(ui): settings panel with sound, theme, avatar and backup import/export

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: PWA (icons, manifest, offline service worker, update prompt)

**Files:**
- Create: `scripts/make-icons.ts`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/apple-touch-icon.png`, `public/icons/favicon.png` (generated), `src/components/ReloadPrompt.tsx`, `src/test/pwa-stub.ts`
- Modify: `vite.config.ts`, `index.html`, `src/vite-env.d.ts`, `src/App.tsx`

**Interfaces:**
- Consumes: `createMascotFrames` (run directly by Node — `mascot.ts` only has `import type` dependencies).
- Produces: installable, offline-capable build; `<ReloadPrompt />`.

- [ ] **Step 1: Install the plugin**

```bash
npm install -D vite-plugin-pwa
```

- [ ] **Step 2: Write the icon generator**

`scripts/make-icons.ts`:
```ts
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createMascotFrames } from '../src/avatar/mascot.ts';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size: number, rgba: Uint8Array): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.subarray(y * size * 4, (y + 1) * size * 4)).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function render(size: number, scale: number, background: string): Uint8Array {
  const frame = createMascotFrames().happy;
  const out = new Uint8Array(size * size * 4);
  const [br, bg, bb] = rgb(background);
  const offset = Math.floor((size - 32 * scale) / 2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = Math.floor((x - offset) / scale);
      const fy = Math.floor((y - offset) / scale);
      const color = fx >= 0 && fy >= 0 && fx < 32 && fy < 32 ? frame[fy * 32 + fx] : null;
      const [r, g, b] = color ? rgb(color) : [br, bg, bb];
      out.set([r, g, b, 255], (y * size + x) * 4);
    }
  }
  return out;
}

mkdirSync('public/icons', { recursive: true });
const BG = '#29366f';
for (const [name, size, scale] of [
  ['icon-192.png', 192, 5],
  ['icon-512.png', 512, 14],
  ['apple-touch-icon.png', 180, 5],
  ['favicon.png', 64, 2],
] as const) {
  writeFileSync(`public/icons/${name}`, png(size, render(size, scale, BG)));
  console.log(`wrote public/icons/${name}`);
}
```

- [ ] **Step 3: Generate icons**

Run: `npm run icons`
Expected: four `wrote public/icons/...` lines. Open `public/icons/icon-512.png` (Read tool) and confirm it shows the chibi mascot on a navy background.

- [ ] **Step 4: Configure the PWA**

`vite.config.ts`:
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/favicon.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Quest Board',
        short_name: 'Quest Board',
        description: 'A pixel-art RPG Kanban board',
        theme_color: '#1a1c2c',
        background_color: '#1a1c2c',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,png,woff,woff2}'] },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    alias: {
      'virtual:pwa-register/react': fileURLToPath(new URL('./src/test/pwa-stub.ts', import.meta.url)),
    },
  },
});
```

`src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
```

`src/test/pwa-stub.ts`:
```ts
export function useRegisterSW() {
  return {
    needRefresh: [false, () => {}] as [boolean, (value: boolean) => void],
    offlineReady: [false, () => {}] as [boolean, (value: boolean) => void],
    updateServiceWorker: async () => {},
  };
}
```

`index.html` — add inside `<head>` after the description meta:
```html
    <link rel="icon" type="image/png" href="/icons/favicon.png" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
```

`src/components/ReloadPrompt.tsx`:
```tsx
import { useRegisterSW } from 'virtual:pwa-register/react';

export function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="reload-prompt pixel-box" role="status">
      <span>✨ A new version is ready!</span>
      <button className="pixel-btn primary" onClick={() => void updateServiceWorker(true)}>Reload</button>
      <button className="pixel-btn ghost" onClick={() => setNeedRefresh(false)}>Later</button>
    </div>
  );
}
```

Append to `src/styles/theme.css`:
```css
.reload-prompt { position: fixed; left: 16px; bottom: 16px; z-index: 60; display: flex; gap: 8px; align-items: center; padding: 10px; }
```

`src/App.tsx` final version:
```tsx
import { useEffect, useState } from 'react';
import { useAppStore } from './store/useAppStore';
import { useAudioSettings } from './audio/useAudioSettings';
import { PlayerBar, type Panel } from './components/PlayerBar';
import { Board } from './components/Board';
import { BackupBanner } from './components/BackupBanner';
import { EffectsLayer } from './components/EffectsLayer';
import { AchievementsPanel } from './components/AchievementsPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { PixelEditor } from './components/PixelEditor';
import { ReloadPrompt } from './components/ReloadPrompt';

export default function App() {
  const theme = useAppStore((s) => s.data.settings.theme);
  const [panel, setPanel] = useState<Panel | null>(null);
  const close = () => setPanel(null);
  useAudioSettings();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="app">
      <h1 className="sr-only">Quest Board</h1>
      <PlayerBar onOpen={setPanel} />
      <BackupBanner />
      <Board />
      <EffectsLayer />
      {panel === 'achievements' && <AchievementsPanel onClose={close} />}
      {panel === 'settings' && <SettingsPanel onClose={close} onEditAvatar={() => setPanel('editor')} />}
      {panel === 'editor' && <PixelEditor onClose={close} />}
      <ReloadPrompt />
    </div>
  );
}
```

- [ ] **Step 5: Run tests and build**

Run: `npm test` → all PASS.
Run: `npm run build` → exit 0; output lists `dist/sw.js` and `dist/manifest.webmanifest`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(pwa): installable offline app with generated pixel icons

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: End-to-end verification in the browser

**Files:**
- Create: `.claude/launch.json`

- [ ] **Step 1: Full automated check**

Run: `npm test` → all PASS. Run: `npm run build` → exit 0. Record the test count.

- [ ] **Step 2: Launch config**

`.claude/launch.json`:
```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "quest-board-dev", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 5173 },
    { "name": "quest-board-preview", "runtimeExecutable": "npm", "runtimeArgs": ["run", "preview", "--", "--port", "4173"], "port": 4173 }
  ]
}
```

- [ ] **Step 3: Browser walkthrough (desktop)** — start `quest-board-dev` with the browser pane and verify, with screenshots:
  1. Board shows To Do / Doing / Done, mascot avatar, LV 1, XP 0/100, 🔥 0; no console errors.
  2. Quick-add "Hạ gục boss cuối tuần" — Vietnamese diacritics render correctly in the pixel font.
  3. Open it, set Boss + deadline today + a label, save; card shows 💀 BOSS, "today!", label chip.
  4. Drag it to Done: XP burst, LEVEL UP overlay (105 XP ≥ 100), achievement toasts (First Blood, Boss Slayer), avatar switches to happy/level-up.
  5. Drag it back: XP drops, LV returns to 1.
  6. 🏆 panel lists unlocked/locked badges; ⚙️ theme Light works; Export downloads a JSON file.
  7. Avatar editor: draw a few pixels, save; avatar updates.
- [ ] **Step 4: Mobile check** — resize to the mobile preset: columns snap-scroll horizontally, player bar wraps, modal fits, no horizontal page overflow outside the board. Reset to desktop afterwards.
- [ ] **Step 5: PWA check** — start `quest-board-preview` (after `npm run build`); confirm `manifest.webmanifest` loads and a service worker registers (read network/console), then stop the servers.
- [ ] **Step 6: Commit**

```bash
git add .claude/launch.json
git commit -m "chore: add launch configs for dev and preview

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
