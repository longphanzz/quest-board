# Capstone II · Quest Board + Quest Coach

> ⚠️ Bản nháp do Claude viết theo yêu cầu của Long (2026-10-19). Chưa phải lời của Long: Long đọc, sửa bằng giọng mình, nhất là mục 5.
> Áp dụng kiến thức khóa *AI Agent & Vibe Coding* (Phong Hồ) tới buổi 6. Buổi 7 chưa có ghi chú trong second brain, sẽ bổ sung khi Long cập nhật.

- **App chạy thật:** https://quest-board.scratch-2026-09-12-9c5ee7.workers.dev
- **Mã nguồn:** GitHub `longphanzz/quest-board`

## 1. Nhu cầu thật

| | |
|---|---|
| **Người dùng** | Long (và người muốn biến mục tiêu lớn thành việc nhỏ làm được mỗi ngày). |
| **Vấn đề** | Có mục tiêu ("mình muốn có cơ bụng", "ôn thi tài chính") nhưng không biết chia thành việc gì, khó đều đặn. To-do list thường thì chán, bỏ giữa chừng. |
| **Mục tiêu** | Một bảng kanban kiểu game (quest, XP, level, streak, thành tựu) + một AI Coach đọc lịch sử thật của mình rồi đề xuất quest nhỏ, vừa sức. |
| **Trạng thái hoàn thành** | Mục tiêu được chia thành 3–5 quest có độ khó, hạn chót; quest nằm trên bảng, đồng bộ mọi thiết bị; mình làm xong thì kéo vào cột Done và nhận XP. |

## 2. Agent hành động thật

Quest Coach không chỉ trả lời chữ. Nó gọi **4 công cụ** (OpenAI function calling) chạy thẳng trên dữ liệu của app:

| Công cụ | Làm gì | Quyền |
|---|---|---|
| `list_board` | Đọc cột, quest, nhãn, lịch sử hoàn thành, ngày hôm nay | Chỉ đọc |
| `add_quest` | Tạo quest mới | Ghi |
| `edit_quest` | Sửa tên, mô tả, độ khó, hạn, nhãn | Ghi |
| `move_quest` | Chuyển quest sang cột khác | Ghi; **vào cột Done phải được người dùng bấm duyệt** |

Thay đổi của Coach đi qua đúng store mà người dùng dùng khi bấm tay, nên XP, streak, đồng bộ Supabase và hoàn tác vẫn chạy như thường.

**Cố ý không giao:** không có công cụ xóa quest, xóa cột, đổi cài đặt, hay đụng tài khoản.

## 3. Vận hành end-to-end

```
Người dùng gõ mục tiêu
  → Trình duyệt gửi hội thoại + token đăng nhập tới Cloudflare Worker (/api/agent)
  → Worker kiểm tra token với Supabase Auth, gắn system prompt + danh sách tool, gọi OpenAI
  → Model trả lời chữ HOẶC yêu cầu gọi tool
  → Trình duyệt chạy tool trên store (đã kiểm tra tham số), gửi kết quả lại
  → Lặp tối đa 8 bước tới khi model trả lời chữ
  → Bảng cập nhật, đồng bộ lên Supabase, thiết bị khác thấy ngay (Realtime)
```

**Cách tự kiểm tra (cho giám khảo):** đăng nhập → bấm nút Coach góc phải dưới → gõ "Mình muốn chạy được 5km" → Coach đọc bảng, đề xuất 3–5 quest → gõ "ok, tạo hết" → quest xuất hiện trên bảng → bấm "↩ Undo coach changes" để hoàn tác. Gõ "quest X xong rồi" → hiện thẻ hỏi duyệt trước khi tính XP.

## 4. Guardrail và kiểm soát

Nguyên tắc: **mức kiểm soát tăng theo mức ảnh hưởng.** Đọc thì tự do; ghi thì được kiểm tra và hoàn tác được; việc ảnh hưởng điểm số thì người dùng phải duyệt.

| Rủi ro | Guardrail | Chặn bằng |
|---|---|---|
| Người lạ dùng chùa tiền OpenAI | Worker chỉ phục vụ người đã đăng nhập (kiểm tra token với Supabase) | Code server |
| Lộ API key | Key OpenAI là secret trên Cloudflare, trình duyệt không bao giờ thấy | Hạ tầng |
| Người dùng chèn system prompt riêng để "bẻ" Coach | Worker từ chối mọi tin nhắn `role: system` từ client | Code server |
| Hội thoại khổng lồ đốt tiền | Giới hạn 40 tin nhắn, 60.000 ký tự; ô nhập tối đa 1.000 ký tự | Code server + UI |
| Agent lặp vô hạn | Tối đa 8 bước mỗi lượt | Code client |
| Model bịa id, ngày sai, độ khó lạ | Mọi tham số được kiểm tra; id không tồn tại → trả lỗi cho model, không đoán | Code client |
| Agent tự tạo hàng loạt quest | System prompt: đề xuất trước, chỉ tạo khi người dùng đồng ý | Prompt (mềm) |
| **Agent tự đánh dấu xong quest để cộng XP** | **Thẻ xác nhận "Yes / No" trước mỗi lần hoàn thành. Không có câu trả lời (hoặc đóng khung chat) = từ chối** | **Code client** (mới, 2026-10-19) |
| Agent làm sai | Nút "Undo coach changes" trả bảng về trước lượt đó | Code client |
| Undo xóa mất thay đổi của chính người dùng | Nút Undo chỉ hiện khi bảng còn y như lúc Coach để lại | Code client |
| Mất dữ liệu | Không có tool xóa | Thiết kế |

Vì sao chặn hoàn thành quest bằng code chứ không bằng prompt: prompt chỉ là lời dặn, model có thể quên. Hoàn thành quest đụng tới XP và streak (thứ người dùng quý nhất trong app), nên phải là **người** quyết định. Giống bài học buổi 3 và 5: *duyệt trên Buffer trước khi đăng*.

**Kiểm chứng:** 295 test tự động (Vitest), trong đó có test: model gọi `move_quest` vào Done mà người dùng chưa duyệt thì quest **không** được hoàn thành; người dùng bấm Yes thì mới hoàn thành; bấm No (hoặc đóng khung chat) thì Coach nhận lời "người dùng từ chối, đừng thử lại".

## 5. Làm chủ và chỉ huy Agent

### Áp dụng khung của khóa học

**Vòng chỉ huy (buổi 1): GOAL → CONTEXT → AGENT → RESULT → VERIFY**

| Bước | Trong Quest Coach |
|---|---|
| GOAL | Biến mục tiêu thành 3–5 quest nhỏ, vừa sức |
| CONTEXT | `list_board` đưa lịch sử thật (đã làm xong gì, độ khó nào, bao lâu một lần) + ngày hôm nay |
| AGENT | Model suy luận, gọi tool |
| RESULT | Quest hiện trên bảng + câu trả lời ngắn |
| VERIFY | Người dùng duyệt đề xuất, duyệt hoàn thành, có Undo |

**Sáu năng lực (Context → Skill → MCP → Agent → Workflow → Output):**
- *Context:* ảnh chụp bảng mỗi lượt. *Context engineering* (buổi 2: đúng thứ, đúng lúc, đúng lượng): ảnh chụp bảng không được giữ lại trong lịch sử vì nó to và cũ ngay lượt sau; chỉ giữ tin nhắn người dùng và câu trả lời.
- *Skill:* system prompt là "cách làm" của Coach (đọc bảng trước, đề xuất trước khi tạo, trả lời ngắn, đúng ngôn ngữ người dùng).
- *Kết nối:* 4 tool nội bộ thay cho MCP, vì Coach chỉ cần đụng dữ liệu của chính app.
- *Output → Second Brain:* quest làm xong trở thành lịch sử, lần sau Coach đọc lại để đề xuất sát hơn. Đây là vòng lặp nhỏ của chính app.

**Workflow hay Agent (buổi 5):** việc lặp lại, cố định (đồng bộ, tính XP, streak) để code cứng làm: rẻ, rõ lỗi. Chỉ phần cần linh hoạt (hiểu mục tiêu mơ hồ, chia nhỏ theo lịch sử) mới giao cho agent.

**CLI trước MCP (buổi 3, quy tắc của Long):** deploy bằng `wrangler` (CLI chính chủ Cloudflare), key đặt bằng `wrangler secret put`, không dán vào chat.

### Quyết định quan trọng (và vì sao)

1. **Tool chạy ở trình duyệt, key ở server.** Chạy tool qua store sẵn có nên XP, đồng bộ, hoàn tác không phải viết lại; key OpenAI vẫn an toàn trên Worker.
2. **Không cho agent quyền xóa.** Rủi ro mất dữ liệu lớn hơn lợi ích; người dùng tự xóa trong 1 giây.
3. **Hoàn thành quest phải duyệt bằng code.** (mục 4)
4. **Undo ở mức cả lượt, nhưng không bao giờ ghi đè thay đổi của người dùng.**

### Giới hạn còn biết

- "Đề xuất trước khi tạo" mới chặn bằng prompt, chưa chặn bằng code.
- Chưa giới hạn số lượt gọi theo từng người dùng/ngày (đã có giới hạn kích thước mỗi lần gọi).
- Coach không nhớ hội thoại khi tải lại trang.

### Long tự nhận (Long viết)

- Câu hỏi của mình có tác dụng nhất: …
- Mình đã giữ quyết định gì, giao gì cho AI: …
- Lần sau làm khác: …
