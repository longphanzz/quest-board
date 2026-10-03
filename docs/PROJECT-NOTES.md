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
- **Plugin Supabase chính thức** (supabase-community, skills `supabase` + `supabase-postgres-best-practices` + MCP): đã hiện thẻ cài, **chờ người dùng bấm cài và báo "xong"** → kiểm tra bằng ListPlugins.
- Quy tắc an toàn: không bao giờ xin/nhận `service_role` key hay mật khẩu trong chat; URL project + anon/publishable key thì được. Hỏi trước mọi thao tác thay đổi dữ liệu hoặc tốn phí (tạo project, migration…).

### Lộ trình học (6 bước)
1. Supabase là gì bên trong: PostgreSQL, Auth, API tự sinh, Row Level Security. Xem tài khoản đang có project nào.
2. Tạo/chọn project; giải thích URL, anon key, service key khác nhau thế nào.
3. Thiết kế bảng cho Quest Board (chuyển JSON hiện tại → bảng SQL) — **theo quy trình brainstorming: thiết kế + spec để duyệt trước khi code**.
4. Bật RLS: mỗi người chỉ đọc/ghi dữ liệu của mình.
5. Thêm đăng nhập vào app.
6. Đồng bộ dữ liệu app ↔ Supabase (cân nhắc giữ chế độ offline).

## 4. Việc khác có thể làm sau
- Đưa app lên mạng (Cloudflare Pages / Netlify / GitHub Pages) để cài PWA lên điện thoại — người dùng chưa chọn; đưa lên là công khai ra ngoài nên phải hỏi trước.
- Repo chưa có remote GitHub.

## 5. Về người dùng
- Nói tiếng Việt; người mới, không rành kỹ thuật → giải thích đơn giản, dùng ví dụ, tránh thuật ngữ khó.
- Muốn tiết kiệm token nhưng vẫn đảm bảo chất lượng; muốn kiểm tra kỹ, gặp lỗi thì sửa tại chỗ và báo lại.
- Dùng bộ plugin superpowers (brainstorming → spec → plan → executing-plans, TDD).
