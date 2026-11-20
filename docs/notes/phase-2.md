# Phase 2 — Spec, Acceptance Criteria & Thay đổi từ Phase 1

## 1. Nguồn yêu cầu
Đối chiếu trực tiếp từ **Ticket-02 — "Ba hòn đảo" (Phase 2 · Test Contract v1.1)** trên Lab board (`#p2`).

## 2. Thay đổi so với Phase 1 (Ticket-02 chuẩn hóa & thay thế)

| Hạng mục | Phase 1 (PRD-0 / v1.0) | Phase 2 (Ticket-02 / v1.1) | Lý do cập nhật test Phase 1 |
|---|---|---|---|
| Sức chứa & chi phí đèn | `carry_capacity=5`, `lantern_cost=3` | `carry_capacity=10`, `lantern_cost=10` | Đồng bộ số chuẩn Phần 1 |
| Bán kính nhặt / nạp / Tỏa Sáng / vùng an toàn / hit | `1.5` / `2.5` / `6` / `5` / `1.2` m | `1.0` / `2.0` / `5.0` (3D từ `y+0.8`) / `6.0` / `1.0` m | Đồng bộ số chuẩn Phần 1 |
| Đom đóm ban đầu & spawn | 12 con, dưới 8 sinh mỗi 5s | 20 con tại 20 điểm khác nhau, trần 30, sinh ở tick 240/480… | Đồng bộ số chuẩn Phần 1 |
| Bóng Mực ban đầu & spawn | 2 con lúc tick 0, tốc độ `3.6`, trạng thái `chase/stunned` | 2 con lúc tick `300`, mỗi 480 tick Đêm 1 (`420` Đ2, `360` Đ3), tốc độ `4.0` (`4.5` Đ3), 5 trạng thái (`spawning/wander/chase/recoil/stunned`) | Theo lịch sinh và AI chuẩn hóa |
| Tỏa Sáng (`pulse`) | Tốn `2`, choáng `2.5s`, đẩy tức thì `4m`, cooldown `3s` | Tốn `3`, choáng `120` tick (`2s`), đẩy `4m` trong 15 tick đầu | Theo cơ chế Tỏa Sáng chuẩn |
| Tính điểm | `+10` lúc **nhặt**, `+25` choáng, thắng `floor(t)*5 + flames*50` | `+10` lúc **nạp** vào đèn, `+100` thắp đèn, `+5` choáng, thắng `floor(t)*2 + flames*50` | Tránh farm điểm bằng nhặt/rơi |
| Rơi khỏi đảo & Đêm | `fall_enabled=false`, 1 Đêm `180s`, `R=35m` | `fall_enabled=true` (`Y < -10`), 3 Đêm `300/330/360s`, Đ1 `R=40m` | Mở rộng bản đồ & cơ chế rơi |
| Vùng an toàn vừa thắp | Đẩy ra tức thì | Đẩy ra trong ≤ 30 tick và không gây sát thương trong lúc đó | Theo cơ chế vùng an toàn mới |
| Ưu tiên kết thúc | `all_lit > no_flames > dawn` | `no_flames > all_lit > dawn` (hết Ngọn Lửa luôn thua) | Quy tắc mới Ticket-02 |

## 3. Acceptance Criteria — Phần 3 (Tính năng mới)

1. **Gió Lạc (`Drifters`, Đêm 2 & 3):**
   - Tối đa 2 con, id `D1`, `D2`…, sinh tại tick `1200, 2400, …` ở điểm sương (điểm sinh Bóng Mực) ngẫu nhiên có seed.
   - `idle` (lượn 2 m/s) chuyển `chase` (7 m/s) khi Mây mang `>= 5` đom đóm và cách XZ `<= 15m`; mất điều kiện quay về `idle`.
   - Chạm Mây (`XZ <= 1.2m`) khi `chase` và chưa cướp: cướp `min(3, carried)` đom đóm, bất kể vùng sáng hay bất tử; chuyển `flee` (7 m/s ra xa Mây 240 tick rồi biến mất).
   - Trúng Tỏa Sáng (3D `<= 5m` từ `y+0.8`): nếu đang `chase` → `flee` (không đồ); nếu đang `flee` có `stolen > 0` → thả lại toàn bộ thành đom đóm rơi tại chỗ, phát `drifter_drop`, rồi biến mất sau 120 tick.
2. **Bùa Gió (`Charms`):**
   - Đặt tại `(35,0,0)` (Đêm 2, id `C1`) và `(30,0,25)`, `(-30,0,25)` (Đêm 3, id `C1`, `C2`).
   - Nhặt khi `available` (`XZ <= 1.0m`, `|ΔY| <= 1.5m`) → hiệu lực `600` tick (nhặt lại làm mới): chạy `7.2 m/s`, Lướt không hồi chiêu (vẫn cần nhấn lại, đang lướt thì bỏ qua nút), tái xuất hiện sau `2700` tick.
3. **Chuỗi 3 Đêm & Màn Bình Minh:**
   - Menu chính → Intro Đêm (tên đảo + lời Ông Đăng) → Chơi → Kết quả Đêm → Đêm tiếp theo (tích lũy điểm các Đêm đã thắng) → Thắng Đêm 3 hiện màn **Bình Minh** với tổng điểm; thua được chơi lại Đêm đó.
4. **Tạm dừng (`Esc` / `P` / `pause` input):**
   - Trong lúc `paused`: `tick` vẫn tăng, `sim_tick`, thời gian, hồi chiêu, spawn, TTL đóng băng; có nút Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu.
5. **Cài đặt:**
   - Âm lượng và độ nhạy chuột chỉnh được trong menu/pause và **lưu bền vững** giữa các lần tải lại (`localStorage`).
6. **Âm thanh:**
   - Nhạc nền đêm + SFX Web Audio tổng hợp cho: nhặt, thắp đèn, tỏa sáng, bị đánh, nhảy, lướt, thắng, thua, Bóng Mực xuất hiện, đếm ngược 10s cuối (và cảnh báo gió/bùa).
7. **HUD đầy đủ:**
   - Trên trái: Ngọn Lửa; trên giữa: đồng hồ `mm:ss` (đỏ `#FF5A5F` + nhấp nháy khi `<= 30s`); trên phải: đèn `k/n` + điểm; dưới giữa: thanh đom đóm 10 ô + nhắc `"E — Nạp ánh sáng (x/10)"` khi trong bán kính nạp; dưới phải: hồi chiêu Lướt & Tỏa Sáng; mũi tên mép màn hình chỉ tới đèn chưa sáng gần nhất khi ngoài khung hình.
8. **Bảng màu chuẩn & Ánh sáng:**
   - Dùng đúng mã HEX chuẩn (±10% RGB) trong [scene.ts](../../src/client/scene.ts) và [style.css](../../src/client/style.css); ánh sáng môi trường `0.15 + 0.55 × (đèn sáng / tổng đèn)`.

### Đêm 3 — Giả định điểm xuất phát
- Vì tâm `(0, 0)` ở Đêm 3 là Tầng 2 (`Y=6`) và Tháp chuông (`r < 2`), điểm xuất phát (và hồi sinh) mặc định của Đêm 3 được đặt tại `(0, 0, 32)` trên Tầng 0 (`Y=0`, quay mặt `-Z` hướng về hai dốc lên Tầng 1).

## 4. Nhật ký sử dụng AI, Lỗi phát hiện & Token

- **Các lỗi đã phát hiện & cách khắc phục:**
  1. *Spawn mặc định Đêm 3 đặt ở `(0, 0, 0)`:* Phát hiện khi chạy benchmark Đêm 3 (`21,600` ticks) — `(0, 0)` trên Đêm 3 nằm trong Tháp chuông (`r < 2`) trên Tầng 2 (`Y=6`) khiến player rơi liên tục khi hồi sinh. Đã chuyển spawn Đêm 3 ra `(0, 0, 32)` trên Tầng 0 thoáng đãng hướng về 2 dốc `30°`/`150°`.
  2. *Lỗi rising-edge nút Tiếp tục sau khi Pause trên trình duyệt (`src/client/main.ts`):* Phát hiện nhờ kiểm thử thực tế trên Chrome (không thể phát hiện chỉ bằng unit test headless!). Khi gọi `world.step({ pause: true })` để tạm dừng, `lastPause` bị giữ ở `true`, nên khi người chơi bấm `"Tiếp tục"` và gọi `world.step({ pause: true })` lần nữa, `!!input.pause && !this.lastPause` trả về `false` khiến simulation vẫn đóng băng dù modal đã đóng. Đã sửa bằng cách xả `{ pause: false }` ngay sau khi tạm dừng và trước khi tiếp tục trong `pauseGame()`/`resumeGame()`, sau đó kiểm chứng lại pass 100% trên Chrome ở cả Đêm 1 (`P`) và Đêm 2 (`Esc`).
  3. *Hiệu năng headless `cli.ts`:* Gọi `world.snapshot()` mỗi tick để kiểm tra `.state` sẽ clone mảng không cần thiết 21.600 lần. Đã thêm `world.getState()` O(1) giúp chạy Đêm 3 `21,600` tick chỉ mất **~137 ms** (so với ngưỡng 30.000 ms).
  4. *Test cooldown/fall lệch vài tick trong unit test:* Đã sửa assertion khớp đúng tick bước của 12-step pipeline (`dash` 90 tick, `fall` ~62 tick rơi + 60 tick chờ hồi sinh).
- **Ước tính token & cách tiết kiệm:**
  - Phiên Phase 2 ước tính sử dụng khoảng **~70k–90k tokens** (lên plan, viết `maps.ts` + `simulation.ts` v1.1, bộ test & 14 fixtures, giao diện 3D 3 Đêm + Web Audio + HUD, và 2 lượt kiểm thử browser Chrome).
  - *Cách tiết kiệm:* Tái sử dụng trực tiếp core `GameWorld` + `Mulberry32` từ Phase 1, viết script `collect-proof.mjs` tự động chạy cả 28 checks trong 1 lần gọi (~4s), và dùng lại subagent browser đang mở để test lại riêng phần Pause/Resume sau khi vá lỗi.
