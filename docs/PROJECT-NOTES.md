# Quest Board — Project Notes (handoff)

Cập nhật: 2026-10-03. File này ghi lại toàn bộ bối cảnh để tiếp tục làm việc sau khi nén hội thoại.

## 1. App là gì

**Quest Board**: app Kanban cá nhân phong cách gaming pixel, game hoá sâu, chạy dạng PWA, giao diện tiếng Anh (nội dung quest gõ tiếng Việt OK).

- Tài liệu gốc: `docs/superpowers/specs/2026-09-29-quest-board-design.md` (spec), `docs/superpowers/plans/2026-09-29-quest-board.md` (kế hoạch 19 bước, đã làm xong).
- Người dùng: một người, một trình duyệt; dữ liệu lưu localStorage key `quest-board-v1`.

### Tính năng đã có
- Board 1 bảng, cột tuỳ chỉnh (thêm / đổi tên / xoá / kéo đổi thứ tự / chọn cột Done). Luôn đúng 1 cột Done.
- Quest: tiêu đề (1–120), mô tả, độ khó Easy/Normal/Hard/Boss, deadline, nhãn màu. Kéo-thả bằng chuột, cảm ứng, bàn phím (Space nhấc/thả).
- Game: XP gốc 10/25/50/100; đúng hạn ×1.5, trễ ×0.5; streak bonus +5%/ngày tối đa +50%; level L cần `50·L·(L−1)` XP tích luỹ; streak theo ngày local, 1 shield mỗi 7 ngày (tối đa 2); 12 achievements. Kéo ra khỏi Done trừ đúng XP đã nhận. Sắp xếp lại trong cùng cột không bao giờ đổi XP.
- Hiệu ứng: +XP bay lên, hạt pixel, overlay LEVEL UP, toast achievement, avatar đổi biểu cảm (normal/happy/levelUp/sad).
- Âm thanh Web Audio tự tổng hợp (SFX + nhạc nền gốc "Meadow Expedition", F Lydian, mặc định tắt). Không dùng giai điệu có bản quyền.
- Avatar: mascot chibi gốc (KHÔNG phải Chiikawa); trình vẽ pixel 32×32, 4 biểu cảm, pen/eraser/fill/picker, undo/redo, flip, upload ảnh (trace/apply, nearest-neighbour), hỏi trước khi bỏ bản vẽ chưa lưu.
- Settings: âm lượng, nhạc, theme dark/light, Export/Import JSON (`quest-board-backup-YYYY-MM-DD.json`), banner nhắc sao lưu (3 ngày chưa export / 7 ngày từ lần export, "Later" ẩn 24h).
- Hiển thị ngày: `📅 Tue 29/09/2026` trên thanh nhân vật; thẻ quest hiện `🗓 dd/mm` (tạo), `⏳ dd/mm · N days` (deadline), `✅ dd/mm` (xong); modal hiện `Created:` / `Completed:` dd/mm/yyyy hh:mm. Tự đổi lúc nửa đêm (`src/hooks/useToday.ts`).
- PWA: manifest + service worker (vite-plugin-pwa), icon pixel sinh bằng `npm run icons` (`scripts/make-icons.ts`), prompt "New version — Reload".
- Bền vững dữ liệu: dữ liệu localStorage hỏng → app khởi động board mới, giữ bản sao ở `quest-board-corrupt-copy`; đồng bộ giữa nhiều cửa sổ qua sự kiện `storage`; import kiểm tra schema chặt.

## 2. Kỹ thuật

- Stack: React 19 + TypeScript 7 + Vite 8 + Zustand 5 (persist) + @dnd-kit (core/sortable) + vite-plugin-pwa + Vitest 5 + Testing Library + jsdom. Font: Press Start 2P (tiêu đề) + VT323 (nội dung, có subset tiếng Việt).
- Cấu trúc:
  - `src/types.ts` — kiểu dữ liệu (`Quest.completion: {at, xp, difficulty, early} | null`).
  - `src/game/` — luật game thuần (dates, level, xp, deadline, streak, achievements, formatDate).
  - `src/store/` — defaults, progress (complete/uncomplete/moveQuest/finalize), board (CRUD), persistence (validate/import/backup reminder), backup (download/read file), useAppStore, useEffectsStore.
  - `src/audio/` — engine, sfx, music, useAudioSettings. `src/avatar/` — mascot, mood, editor, image.
  - `src/components/` — PlayerBar, PlayerAvatar, PixelCanvas, Board, ColumnView, ColumnMenu, QuickAdd, QuestCard, boardDrop, Modal, QuestModal, EffectsLayer, AchievementsPanel, BackupBanner, PixelEditor, SettingsPanel, ReloadPrompt.
- Trạng thái kiểm thử: 177/177 test pass, `tsc --noEmit` sạch, build OK.
- Git: chỉ có nhánh `master` (đã merge `feat/quest-board` và xoá nhánh). Commit mới nhất: `feat(ui): show today's date and per-quest dates`. Chưa có remote GitHub.

### Lưu ý môi trường (quan trọng)
- Chạy `npm` / `npx` bằng **PowerShell**, không dùng bash (shim cmd trong bash không tìm thấy `node`).
- Vitest phải dùng `pool: 'threads'` (đã đặt trong `vite.config.ts`; pool forks bị timeout ở máy này).
- Lệnh: `npm run dev` (http://localhost:5173), `npx vitest run`, `npx tsc --noEmit`, `npm run build`, `npm run preview`.
- `.claude/launch.json` có cấu hình `quest-board-dev` (5173) và `quest-board-preview` (4173).
- Commit kết thúc bằng: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Quyết định đã chọn (ruling) cần nhớ
- Tạo quest thẳng trong Done rồi xoá vẫn giữ XP (spec cho phép; app một người dùng).
- Chưa bấm thử Export trên trình duyệt (tránh tải file khi chưa được phép) — người dùng nên tự thử một lần.
- Chạm thẻ trên điện thoại thật để mở modal chưa kiểm chứng (công cụ trình duyệt không gửi được cú chạm) — nhờ người dùng thử.

## 3. Đang làm dở: học Supabase (chế độ C — học từng bước, có giải thích)

- Thầy của người dùng hướng dẫn dùng Supabase làm backend. Người dùng chọn **C: học cách Supabase hoạt động**, làm từng bước kèm giải thích để tự làm lại được.
- **Connector Supabase đã kết nối** (công cụ: list_projects, list_tables, execute_sql, apply_migration, get_advisors, generate_typescript_types, get_publishable_keys, search_docs…).
- **Plugin Supabase chính thức**: ListPlugins ngày 2026-10-03 chưa thấy (chưa cài). Không bắt buộc — connector đã đủ dùng.
- **Project**: `Kanban - Quest board`, id/ref `nbrrjkwlqwdxojnnpfvp`, region us-east-1, Postgres 17.
- **Backend Supabase ĐÃ LÀM XONG (2026-10-04)** trên nhánh `feat/supabase-backend`. Spec `docs/superpowers/specs/2026-10-03-supabase-backend-design.md`, plan `docs/superpowers/plans/2026-10-03-supabase-backend.md`.
  - DB: 2 migration đã áp lên project thật (`supabase/migrations/`): 7 bảng + RLS "mỗi người chỉ dòng của mình" + hàm `load_board()` / `save_board(p_board, p_base_revision, p_client_updated_at)`. Kiểm tra `supabase/tests/rls_check.sql` → `RLS_CHECK_OK` (luôn rollback). Anon gọi REST/RPC → 401.
  - App: `src/cloud/` (client, mapping, api, syncEngine, auth, firstSync, useCloudSync, useSyncStore); màn hình AuthScreen / ResetPasswordScreen / FirstSyncPrompt / CloudGate / SyncStatus; nút Sign out trong Settings. BackupBanner đã bỏ.
  - localStorage: `quest-board-cloud-v1` (cache + ownerId + sync), `quest-board-device-v1` (cài đặt máy), `quest-board-v1` (board cũ, chỉ để hỏi Upload lần đầu) → sau khi chọn được cất sang `quest-board-v1-backup` (không bao giờ xoá).
  - Key: `.env.local` (git-ignored) chứa `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`; mẫu ở `.env.example`.
  - Test: 247/247; vitest `testTimeout: 20000` vì máy chậm khi bận. Nếu vitest báo "Timeout waiting for worker" → máy thiếu RAM, tắt bớt (dev server) rồi chạy lại.
  - Người dùng đã đăng ký (email), Upload board cũ thành công, đã link Google (2026-10-06): 1 user, identities email + google. Google OAuth client trong Google Cloud project "Quest Board" (Testing mode, test users), redirect URI `https://nbrrjkwlqwdxojnnpfvp.supabase.co/auth/v1/callback`; "Allow manual linking" đã bật.
  - Sau đó thêm: nút 👁 hiện/ẩn mật khẩu (`PasswordInput`), "Continue with Google" + Link/Unlink Google trong Settings (`SignInMethods`), "Clear done quests" trong menu ⋮ cột Done + thanh Undo 5 giây (`UndoBar`, `lastCleared` chỉ trong bộ nhớ). 273 test.
  - 6 lỗi nhỏ còn để sau (review cuối): (1) thiếu VITE_SUPABASE_* thì trang trắng; (2) FirstSyncPrompt lỗi chỉ có Retry, không có Sign out; (3) ĐÃ SỬA 2026-10-06: thay đổi chưa đồng bộ được cất riêng theo tài khoản (`stashUnsynced`/`takeUnsynced`) khi sign out hoặc khi người khác đăng nhập, và tự khôi phục khi chủ cũ đăng nhập lại; (4) chưa giới hạn độ dài description / số quest; (5) authenticated còn quyền TRUNCATE/TRIGGER/REFERENCES mặc định, qb_iso anon gọi được (vô hại); (6) lỗi "statement timeout" hiện 📴 thay vì ⚠️. Advisor: `public.rls_auto_enable()` (hàm event-trigger có sẵn của Supabase) bị cảnh báo — đã để nguyên, có thể revoke nếu người dùng muốn.
- Lộ trình học: bước 1–6 đã làm (bước 2 key, 3 bảng, 4 RLS, 5 đăng nhập, 6 đồng bộ) — có thể ôn lại từng phần cho người dùng nếu họ muốn hiểu sâu.
- Quy tắc an toàn: không bao giờ xin/nhận `service_role` key hay mật khẩu trong chat; URL project + anon/publishable key thì được. Hỏi trước mọi thao tác thay đổi dữ liệu hoặc tốn phí (tạo project, migration…).

### Lộ trình học (6 bước)
1. Supabase là gì bên trong: PostgreSQL, Auth, API tự sinh, Row Level Security. Xem tài khoản đang có project nào.
2. Tạo/chọn project; giải thích URL, anon key, service key khác nhau thế nào.
3. Thiết kế bảng cho Quest Board (chuyển JSON hiện tại → bảng SQL) — **theo quy trình brainstorming: thiết kế + spec để duyệt trước khi code**.
4. Bật RLS: mỗi người chỉ đọc/ghi dữ liệu của mình.
5. Thêm đăng nhập vào app.
6. Đồng bộ dữ liệu app ↔ Supabase (cân nhắc giữ chế độ offline).

## 4. Việc khác có thể làm sau
- ĐÃ deploy (2026-10-06): Cloudflare Workers (static assets, `wrangler.jsonc`), nối GitHub `longphanzz/quest-board` → push `master` là tự build. Link: https://quest-board.scratch-2026-09-12-9c5ee7.workers.dev. Build command `npm run build`, deploy `npx wrangler deploy`, 2 biến VITE_SUPABASE_* đặt ở Build variables.
- Supabase Auth đã cấu hình (2026-10-07): Site URL = link workers.dev, Redirect URLs gồm `<link>/**` (+ localhost cho dev). Đăng nhập Google trên bản online đã chạy.

## 5. Về người dùng
- Nói tiếng Việt; người mới, không rành kỹ thuật → giải thích đơn giản, dùng ví dụ, tránh thuật ngữ khó.
- Muốn tiết kiệm token nhưng vẫn đảm bảo chất lượng; muốn kiểm tra kỹ, gặp lỗi thì sửa tại chỗ và báo lại.
- Dùng bộ plugin superpowers (brainstorming → spec → plan → executing-plans, TDD).
