# Phase 1 — Giả định, Tiêu chí nghiệm thu & Nhật ký AI

## 1. Nguồn yêu cầu
Đối chiếu trực tiếp từ **PRD-0** và **Test Contract v1.0** trên Lab board Phase 1 (`Đảo Đèn Lồng`).

## 2. Giả định cho các điểm mở trong PRD-0
1. **Bản đồ Đảo Bến:** Hình tròn phẳng tâm `(0, 0, 0)`, bán kính `35m`, mặt đất `Y = 0`. Rìa đảo có giới hạn mềm (`fall_enabled: false`), không rơi khỏi đảo.
2. **Vị trí 5 Đèn Lồng Lớn (`L1`..`L5`):** Phân bố đều trên vòng tròn bán kính `18m` quanh tâm đảo.
3. **Nhân vật Mây & Nhảy:** Mây xuất phát tại `(0, 0, 0)`. Nhảy sử dụng `v0 = 6.5 m/s`, `g = -18 m/s²` (tích phân bán ẩn Euler) trên trục Y; mọi phép đo khoảng cách trong `tuning` giữ nguyên trên mặt phẳng ngang XZ theo đúng Test Contract v1.0.
4. **Sinh đom đóm & Bóng Mực (`random_motes`, `random_shades`):**
   - Dùng PRNG `Mulberry32` có seed `uint32` (mặc định `42`).
   - Khi `random_motes = true` và không bị `scenario.motes` ghi đè: khởi tạo `12` đom đóm trong bán kính `[4, 32]`m; mỗi `5s` (bội số global tick) nếu số đom đóm `< 8` thì sinh thêm 1 (tối đa `12`).
   - Khi `random_shades = true` và không bị `scenario.shades` ghi đè: khởi tạo `2` Bóng Mực (`S1`, `S2`) trong bán kính `[20, 32]`m; mỗi `45s` sinh thêm 1 (tối đa `4`), phát event `shade_spawned`.
5. **Vùng an toàn (`safe_radius = 5m`):** Chỉ áp dụng quanh các đèn **đã thắp (`lit === true`)**. Với nhiều vùng sáng chồng nhau hoặc giao rìa đảo, chiếu điểm của Bóng Mực lên tập điểm khả thi gần nhất ngoài mọi đĩa sáng và trong bán kính đảo `35m`. Người chơi đứng trong/trên biên vùng sáng không bị Bóng Mực chạm.
6. **Cơ chế `deposit`, `pulse`, `player_hit`:**
   - Thứ tự xử lý mỗi tick: giảm cooldown → di chuyển/nhảy → `interact` (rising edge, nạp vào đèn chưa thắp gần nhất trong `2.5m`) → `pulse` (rising edge, tốn `2` đom đóm đang mang, đẩy `4m` & làm choáng `2.5s` trong `6m`, hồi chiêu `3s`) → nhặt đom đóm (`1.5m`) → Bóng Mực đuổi (`3.6 m/s`) & va chạm (`1.2m`, rơi `floor(carried * 0.5)`, bất tử `1.5s`) → spawn chu kỳ → giảm timer & xét kết thúc.
   - Đom đóm rơi khi bị đánh rơi xuống `Y = 0` tại XZ người chơi và nhặt lại được từ tick kế tiếp.
7. **Ưu tiên kết thúc:** `all_lit` > `no_flames` > `dawn`. Khi thắng, thưởng `floor(time_left_s) * 5 + flames * 50`. Khi đã kết thúc, thế giới đóng băng.

## 3. Tiêu chí nghiệm thu Phase 1
- Game 3D mở được trên trình duyệt WebGL, chơi trọn vòng từ bắt đầu → nhặt đom đóm → thắp 5 đèn / hết máu / hết giờ → chơi lại.
- Chế độ headless tuân thủ đúng 100% **Test Contract v1.0** (`game.contract.json`, flags, sticky `inputs.frames`, `cam_yaw_deg`, `scenario` patching, 7 event names, dòng `end`, mã thoát `2` khi sai format, chạy 2 lần cùng seed giống nhau từng byte).
- Toàn bộ unit test và contract test pass bằng 1 lệnh (`npm run verify`).

## 4. Nhật ký sử dụng AI, Lỗi phát hiện & Token
- **Các lỗi AI đã gặp & cách xử lý:**
  1. *Lượt tạo mã ban đầu bị đặt trong thư mục con `Lab 12/` thay vì root repo:* Đã phát hiện khi kiểm tra cấu trúc git; di chuyển toàn bộ dự án lên đúng gốc repo và sửa `.github/workflows/ci.yml`.
  2. *Schema lượt đầu tiên tự suy đoán lệch với Test Contract v1.0 thật:* Lệch các trường `contract_version`, `inputs.frames` (thiếu wrapper & sticky input), dấu xoay `cam_yaw_deg`, `scenario` dùng `stored`/`{x,y,z}` thay vì `deposited`/`[x,y,z]`, event bọc lồng và thiếu dòng `end`, `--snapshot-every` mặc định `60` thay vì `10`. Đã đối chiếu trực tiếp Test Contract v1.0 trên Lab board, chuẩn hóa lại `types.ts`, `validators.ts`, `simulation.ts`, `cli.ts`, cập nhật lại toàn bộ fixtures + 60 test case, đồng thời ghi rõ bất biến vào `AGENTS.md` để phase sau không lặp lại.
  3. *Lỗi hình học vùng sáng chồng lấn:* Review logic phát hiện chiếu tuần tự có thể dao động khi 2 vùng sáng gần nhau/sát bờ; đã xử lý bằng giải giao điểm đĩa và bổ sung `tests/unit/safe-zones.test.ts`.
  4. *Lỗi viết test giữ nút nhảy trong `simulation.test.ts`:* `advance(edge, 60)` gửi `{}` làm reset `lastJump`; đã sửa thành truyền `{ jump: true }` liên tục để test đúng rising-edge.
- **Ước tính token & cách tiết kiệm:**
  - Tổng phiên Phase 1 ước tính dùng khoảng **~65k–85k tokens** (gồm bước dựng khung ban đầu, đối chiếu Test Contract v1.0, chỉnh sửa schema/test và kiểm thử browser).
  - *Cách tiết kiệm:* Tách `src/core/` gọn nhẹ khỏi 3D renderer, giữ `AGENTS.md` ngắn dưới 25 dòng, gom tất cả thông số vào `game.contract.json` để không trùng lặp hằng số, và dùng script `collect-proof.mjs` tự động gom log thay vì chạy rời rạc từng lệnh.
