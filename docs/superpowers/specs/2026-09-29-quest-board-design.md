# Quest Board — Kanban phong cách gaming pixel (Design Spec)

Ngày: 2026-09-29 · Trạng thái: chờ duyệt

## 1. Mục tiêu

App Kanban cá nhân, dùng hằng ngày trên một máy, phong cách game pixel phiêu lưu, game hoá sâu để tạo động lực hoàn thành việc.

**Thành công khi:**
- Dùng hằng ngày mượt: tạo, sửa, kéo-thả quest nhanh, không mất dữ liệu.
- Hoàn thành quest thấy "đã tay": XP bay lên, âm thanh, level up, achievement.
- Cài được như app (PWA), chạy offline.

**Ngoài phạm vi:** tài khoản, server, đồng bộ nhiều thiết bị, nhiều board, đa ngôn ngữ giao diện, nhạc/hình có bản quyền (Zelda, Chiikawa…).

## 2. Quyết định đã chốt

| Chủ đề | Quyết định |
|---|---|
| Người dùng | Một người, một trình duyệt |
| Game hoá | Sâu: XP/level, avatar tự vẽ, streak + shield, achievement, độ khó |
| Kanban | 1 board, cột tuỳ chỉnh, task có deadline + nhãn |
| Nền tảng | PWA (web app cài được, offline) |
| Ngôn ngữ UI | Tiếng Anh; nội dung task gõ tiếng Việt hiển thị đúng dấu |
| Stack | React + TypeScript + Vite + Zustand + dnd-kit + vite-plugin-pwa + Vitest |

## 3. Kiến trúc

```
src/
  game/        # Luật game — hàm thuần, không phụ thuộc React
    xp.ts            tính XP khi hoàn thành quest
    level.ts         XP tổng → level, tiến độ
    streak.ts        cập nhật streak + shield theo ngày
    achievements.ts  định nghĩa + kiểm tra achievement
    dates.ts         tiện ích ngày local (YYYY-MM-DD)
  store/       # Zustand store, persist localStorage
    useAppStore.ts   board + player + settings, các action
    persistence.ts   export/import JSON, validate, migrate schema
  audio/       # Web Audio synth — SFX + nhạc nền, sáng tác gốc
  avatar/      # Trình vẽ pixel + render avatar
  components/  # Board, Column, QuestCard, QuestModal, PlayerBar,
               # AchievementsPanel, SettingsPanel, Toasts, Effects
  styles/      # CSS pixel theme (biến CSS, theme tối/sáng)
```

Nguyên tắc: mọi luật game nằm trong `src/game/` dưới dạng hàm thuần `(state, input, now) → kết quả`, được test đầy đủ. Store gọi các hàm này; component chỉ hiển thị và gọi action. Thời gian (`now`) luôn truyền vào để test được.

## 4. Mô hình dữ liệu

```ts
type Difficulty = 'easy' | 'normal' | 'hard' | 'boss';

interface Quest {
  id: string;
  title: string;            // bắt buộc, 1–120 ký tự
  description: string;      // có thể rỗng
  difficulty: Difficulty;   // mặc định 'normal'
  deadline: string | null;  // 'YYYY-MM-DD' theo giờ local
  labelIds: string[];
  createdAt: string;        // ISO
  completedAt: string | null;   // ISO, set khi vào cột Done
  xpAwarded: number;        // XP đã cộng cho lần hoàn thành hiện tại, 0 nếu chưa
}

interface Column { id: string; name: string; questIds: string[]; isDone: boolean; }
interface Label  { id: string; name: string; color: string; } // 8 màu preset

interface Player {
  totalXp: number;
  streak: number;
  lastActiveDate: string | null; // 'YYYY-MM-DD' ngày gần nhất hoàn thành quest
  shields: number;               // 0–2
  stats: { completed: number; bossesSlain: number; earlyFinishes: number; };
  unlockedAchievements: Record<string, string>; // id → ISO thời điểm mở khoá
}

interface Avatar {
  // Mỗi frame: 32×32 = 1024 phần tử, giá trị là màu hex hoặc null (trong suốt)
  frames: { normal: Frame | null; happy: Frame | null; levelUp: Frame | null; sad: Frame | null; };
}

interface Settings {
  sfxVolume: number;   // 0–1, mặc định 0.6
  musicVolume: number; // 0–1, mặc định 0.4
  musicOn: boolean;    // mặc định false
  muted: boolean;      // nút 🔊 tắt toàn bộ
  theme: 'dark' | 'light';
  lastExportAt: string | null;
}

interface AppData { schemaVersion: 1; columns; quests: Record<string, Quest>; labels; player; avatar; settings; }
```

**Board mặc định:** 3 cột `To Do`, `Doing`, `Done` (Done có `isDone: true`) + 1 quest mẫu hướng dẫn.

**Ràng buộc cột:** luôn có đúng một cột `isDone`. Có thể chuyển vai trò Done sang cột khác. Không xoá được cột Done (phải chuyển vai trò trước). Xoá cột còn quest → hỏi xác nhận, chuyển quest sang cột đầu tiên không phải Done.

## 5. Luật game

### 5.1 XP
Khi quest được chuyển **vào** cột Done (từ cột khác) hoặc tạo trực tiếp trong cột Done:

```
base      = { easy: 10, normal: 25, hard: 50, boss: 100 }[difficulty]
timing    = không deadline → 1.0
            ngày hoàn thành (local) ≤ deadline → 1.5   (đúng hạn)
            ngày hoàn thành > deadline → 0.5            (trễ)
streakMul = 1 + 0.05 × min(streak sau khi cập nhật hôm nay, 10)
xp        = round(base × timing × streakMul)
```
- Lưu `xpAwarded = xp`, `completedAt = now`; cộng vào `totalXp`; tăng `stats` (completed; bossesSlain nếu boss; earlyFinishes nếu timing = 1.5).
- **Kéo ra khỏi Done:** trừ đúng `xpAwarded` (không để `totalXp` < 0), giảm các `stats` tương ứng, đặt `xpAwarded = 0`, `completedAt = null`. Streak và achievement đã mở **không** bị thu hồi.
- Kéo trong nội bộ cột Done hoặc sửa quest đã hoàn thành (kể cả độ khó/deadline) không thay đổi XP.
- Xoá quest đã hoàn thành: giữ nguyên XP và stats.

### 5.2 Level
XP tích luỹ để đạt level L: `50 × L × (L − 1)` (LV2 = 100, LV3 = 300, LV4 = 600…; tức lên level kế cần `100 × level hiện tại`). Level luôn được suy ra từ `totalXp`, nên trừ XP có thể làm giảm level (không có hiệu ứng khi giảm). Tăng level → hiệu ứng LEVEL UP + fanfare + avatar frame `levelUp` trong ~3 giây.

### 5.3 Streak & Shield
Ngày tính theo giờ local của máy. Khi hoàn thành quest vào ngày `D`:
- `lastActiveDate == D` → không đổi.
- `lastActiveDate == D − 1` hoặc `null` → `streak += 1` (null → 1).
- Bỏ lỡ `g = D − lastActiveDate − 1` ngày, nếu `shields ≥ g` → dùng `g` shield, `streak += 1`; ngược lại `streak = 1`.
- Sau khi tăng, nếu `streak` chia hết cho 7 → `shields = min(shields + 1, 2)`.
- `lastActiveDate = D`.

**Hiển thị:** nếu hôm nay đã bỏ lỡ số ngày > `shields` (tức streak chắc chắn đã đứt), thanh nhân vật hiện 🔥 0 và avatar dùng frame `sad`. Dữ liệu thật chỉ cập nhật khi hoàn thành quest kế tiếp.

### 5.4 Achievements (12)
Kiểm tra sau mọi thay đổi trạng thái; mở rồi thì không mất.

| id | Tên | Điều kiện |
|---|---|---|
| first-blood | First Blood | stats.completed ≥ 1 |
| boss-slayer | Boss Slayer | bossesSlain ≥ 1 |
| boss-hunter | Boss Hunter | bossesSlain ≥ 10 |
| on-fire | On Fire | streak ≥ 7 |
| unstoppable | Unstoppable | streak ≥ 30 |
| early-bird | Early Bird | earlyFinishes ≥ 10 |
| centurion | Centurion | completed ≥ 100 |
| level-10 | Hero Rank | level ≥ 10 |
| level-25 | Legend Rank | level ≥ 25 |
| artist | Artist | đã lưu frame `normal` tự vẽ |
| full-wardrobe | Full Wardrobe | đủ 4 frame tự vẽ |
| clean-slate | Clean Slate | ≥ 5 quest chưa xong và không quest nào quá hạn |

Mở khoá → toast "🏆 ACHIEVEMENT UNLOCKED" + SFX. Panel 🏆 hiện huy hiệu pixel; chưa mở thì xám kèm mô tả điều kiện.

## 6. Âm thanh

Tổng hợp bằng Web Audio API (sóng vuông 12.5%/25%/50%, tam giác, noise) — không có file âm thanh. **Toàn bộ giai điệu là sáng tác gốc**, phong cách phiêu lưu (Lydian/Mixolydian, arpeggio, fanfare), không sao chép giai điệu game có sẵn.

| Sự kiện | Âm thanh |
|---|---|
| Tạo quest | "rút kiếm" — noise sweep ngắn + nốt cao |
| Thả task | "bước chân" — 2 tick nhẹ |
| Hoàn thành quest | "mở rương" — 4 nốt đi lên |
| Level up | Fanfare ~2 giây |
| Achievement | Chuỗi nốt lấp lánh |
| Hạ Boss | Fanfare dài, hoành tráng hơn |

**Nhạc nền:** vòng lặp gốc 30–45 giây, tempo vừa, "khám phá đồng cỏ"; mặc định tắt. AudioContext chỉ khởi tạo sau thao tác đầu tiên của người dùng (yêu cầu của trình duyệt). Âm lượng SFX/nhạc chỉnh riêng, nút 🔊 tắt tất cả.

## 7. Giao diện

**Bố cục:** thanh nhân vật trên cùng (avatar 64px, LV, thanh XP, 🔥 streak, 🛡️ shield, nút 🏆 ⚙️ 🔊) → board các cột cuộn ngang → nút `+ Column` cuối hàng.

**Phong cách:**
- Font: "Press Start 2P" cho tiêu đề/nút/số; font pixel có subset tiếng Việt cho nội dung (ứng viên: Pixelify Sans, VT323 — chọn font hiển thị dấu tốt nhất khi triển khai; fallback monospace). Font tự host qua `@fontsource` để chạy offline.
- Nền tối xanh đêm; cột kiểu hộp thoại RPG (viền trắng dày, bóng đổ vuông, không bo góc); thẻ quest kiểu giấy da. Theme sáng tuỳ chọn.
- Màu độ khó: Easy xanh lá · Normal xanh dương · Hard cam · Boss đỏ + viền nhấp nháy.
- Quá hạn: thẻ rung nhẹ định kỳ + ⚠️. Deadline hiển thị "today!", "3 days", "2 days late".
- Animation dùng `steps()` (giật từng khung như game cũ); tôn trọng `prefers-reduced-motion`.
- Hoàn thành: hạt pixel lấp lánh + "+XP" bay lên thanh XP.
- `image-rendering: pixelated` cho mọi hình pixel.

**Quest modal:** tiêu đề, mô tả, chọn độ khó (4 nút), deadline (date picker), nhãn (chọn/tạo), nút Delete (xác nhận). Tạo nhanh: `+ New Quest` cuối cột → ô nhập tiêu đề, Enter để tạo.

**Kéo-thả:** dnd-kit, hỗ trợ chuột, cảm ứng, bàn phím; sắp xếp trong cột và giữa các cột; kéo đổi thứ tự cột.

**Mobile (< 768px):** cột rộng ~85% màn hình, cuộn ngang theo snap; thanh nhân vật thu gọn.

## 8. Trình vẽ nhân vật

- Mở từ ⚙️ hoặc bấm avatar. Lưới 32×32, 4 tab: Normal / Happy / Level Up / Sad.
- Công cụ: bút, tẩy, đổ màu (flood fill), lấy màu, lật ngang, undo/redo (≥ 50 bước), xoá hết, "Copy from Normal".
- Bảng 16 màu retro + ô chọn màu tuỳ ý.
- Upload ảnh → thu nhỏ về 32×32 (canvas, nearest-neighbor), đặt làm nền mờ để đồ theo hoặc áp trực tiếp vào frame.
- Save / Cancel; "Reset to default" có xác nhận.
- Mascot mặc định: sinh vật chibi tròn **thiết kế gốc**, có sẵn đủ 4 frame.
- Chọn frame hiển thị: happy (~2s sau khi xong quest), levelUp (~3s sau level up), sad (khi streak đứt hoặc có quest quá hạn), còn lại normal. Frame trống → dùng normal + hiệu ứng động (nhún/nhảy/rung).

## 9. Lưu trữ & sao lưu

- Zustand `persist` → localStorage key `quest-board-v1`, lưu ngay mỗi thay đổi.
- **Export:** tải `quest-board-backup-YYYY-MM-DD.json` (toàn bộ `AppData`), cập nhật `lastExportAt`.
- **Import:** validate schema (kiểu, trường bắt buộc, `schemaVersion`) → hỏi xác nhận ghi đè → thay thế dữ liệu. Sai/hỏng → báo lỗi, giữ nguyên dữ liệu hiện tại.
- Nhắc sao lưu: banner khi có ≥ 1 quest và chưa export trong 7 ngày (hoặc chưa export lần nào sau 3 ngày sử dụng); có nút "Later" ẩn 24 giờ.
- Lỗi ghi localStorage (đầy bộ nhớ) → toast cảnh báo, gợi ý Export.

## 10. PWA

`vite-plugin-pwa`: manifest (tên "Quest Board", icon pixel 192/512, theme màu xanh đêm, display standalone), service worker precache toàn bộ asset → chạy offline hoàn toàn. Tự cập nhật khi có bản mới (prompt "New version — reload?").

## 11. Kiểm thử

- **Unit (Vitest)** cho `src/game/`: XP mọi tổ hợp độ khó × timing × streak; làm tròn; level/ngưỡng/giảm level; streak (cùng ngày, liên tiếp, bỏ lỡ có/không đủ shield, nhận shield mỗi 7 ngày, trần 2); hiển thị streak đứt; từng achievement.
- **Store tests:** hoàn thành → kéo ra → hoàn thành lại (không farm XP); ràng buộc cột Done; xoá cột chuyển quest; export/import round-trip; import file hỏng giữ dữ liệu.
- **Component tests (Testing Library):** tạo quest nhanh, mở/sửa modal, hoàn thành cập nhật thanh XP; trình vẽ: vẽ, undo, fill.
- **Kiểm tra thủ công cuối:** chạy app trong trình duyệt, thao tác luồng chính, chụp màn hình desktop + mobile.
