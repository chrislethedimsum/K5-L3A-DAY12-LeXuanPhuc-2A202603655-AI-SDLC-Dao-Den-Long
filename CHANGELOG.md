# Changelog

## [1.0.0] — Phase 4: "Bình minh: phát hành v1.0.0" (Contract v1.3)
### Added
- **Test Contract v1.3 (`game.contract.json`):** Khai báo thêm `bench_cmd` (`node scripts/bench.mjs`), `soak_cmd` (`node --jitless --max-semi-space-size=1 --no-lazy --optimize-for-size --expose-gc dist-headless/src/headless/soak.js`), và chuẩn hóa `run_cmd` (`node scripts/run.mjs`) hỗ trợ cả phục vụ web tĩnh, API bảng xếp hạng lẫn `--export-leaderboard`.
- **Chế độ Benchmark (`?bench=1` + `scripts/bench.mjs` + `bench.json`):** Tải Đêm 1 ở cửa sổ `1280×720` không toàn màn hình, tắt vsync, cảnh chuẩn 200 Bóng Mực `wander` + 100 đom đóm + L1–L3 `fuel 100`, camera quay tròn `R=30 m, Y=15 m` (15 s/vòng ngược chiều kim đồng hồ), tắt hiệu ứng sáng tạo thêm. Chuyển Bóng Mực và đom đóm trong `src/client/scene.ts` sang `THREE.InstancedMesh` đạt `796.6 FPS` trung bình (`p1_low_fps: 365.6`, `load_ms: 1768`).
- **Soak Test (`src/headless/soak.ts` + `soak.json`):** Chạy 10 Đêm xoay vòng `1→2→3` trong một tiến trình Node với input ngẫu nhiên theo seed (`7+i`), tối ưu zero-allocation trên hot path của `GameWorld.step()` và `validateInputFrame()`, đạt `crashes: 0` và `mem_start_mb: 15.9 → mem_end_mb: 16.7` (`1.05× ≤ 1.2×`).
- **Bảng xếp hạng cục bộ (`src/core/leaderboard.ts`, `src/client/leaderboard.ts`, `scripts/run.mjs`):** Lưu tên `3–12` ký tự `[A-Za-z0-9_]` (hỗ trợ tiếng Việt có dấu) sau Bình Minh hoặc mọi màn thua, giữ Top 10 giảm dần theo điểm (bằng điểm ưu tiên đạt trước), bền vững xuống đĩa (`~/.dao-den-long/leaderboard.json`), màn hình xem từ Menu chính và xuất qua `--export-leaderboard <path>`.
- **4 tính năng Khả năng tiếp cận:** Đổi toàn bộ 9 phím điều khiển kèm phát hiện trùng phím & nút khôi phục mặc định (`src/core/keybinds.ts`); khay phụ đề hình ảnh cho 4 cảnh báo (Bóng Mực xuất hiện + mũi tên chỉ hướng mép màn hình, gió, 10s cuối, đèn `< 30%`); tùy chọn Giảm chuyển động (tắt rung & chớp); cỡ chữ tối thiểu `18 px` ở `1280×720` và tùy chọn chữ lớn `×1.25`.
- **Đóng gói phát hành:** `scripts/package-release.mjs` tạo `dao-den-long-v1.0.0-web.tar.gz`, `Dockerfile` đa tầng chạy `run.mjs`, tài liệu đầy đủ và báo cáo Retro 4 phase.

## [0.3.0] — Phase 3: "Đèn cạn dầu" (Contract v1.2)
### Breaking Changes (Thay thế quy tắc cũ từ Phase 1–2)
- **Nhiên liệu đèn (`fuel` 0–100):** Đèn sáng hao `1.0/s`; tự tắt (`lantern_out`, `deposited = 0`, giữ `ever_lit = true`) khi `fuel <= 0`. Bấm Tương tác trên đèn sáng chưa đầy dầu sẽ châm `min(carried, ceil((100 - fuel)/10))` (`+10` fuel/đom đóm); đèn đầy dầu bị bỏ qua. Đèn đã tắt sau khi từng sáng chỉ cần `5` đom đóm để thắp lại.
- **Vùng an toàn & Bóng Mực `drain`:** Đèn có `fuel < 30` mất vùng an toàn `6 m`. Bóng Mực đang `wander` ưu tiên tiến tới đèn sáng có `fuel < 30` gần nhất để hút `5 fuel/s` (`drain`).
- **Luật thắng & Thời lượng Đêm:** Bỏ thắng sớm `all_lit`. Thời lượng Đêm 1/2/3 đổi thành `240 / 270 / 300 s`. Thắng (`dawn_survived`) khi sống hết giờ và có ít nhất `ceil(0.6 × tổng đèn)` đèn đang sáng (`3/5`, `4/6`, `5/7`).
- **Điểm số:** Đổi `+10` → **`+5`** mỗi đom đóm nạp; thắp lại `+40`; Tỏa Sáng trúng con đang `drain` tổng **`+15`**; bình minh thắng thưởng `50 + floor(fuel)` mỗi đèn sáng + `50 × flames`; **bỏ thưởng thời gian**.
- **Contract v1.2 Schema:** `player` thêm `capacity`; `lanterns[]` thêm `fuel`, `ever_lit`, `relit_count`; `shades[]` thêm trạng thái `drain`; `lantern_lit` thêm `relight`; thêm sự kiện `refuel`, `lantern_out`, `fuel_drain`; thay `all_lit` bằng `dawn_survived`.

### Added
- **Sức chứa tăng dần:** `10 + 2 × successful_lights` (tối đa `20`), reset đầu mỗi Đêm.
- **Chế độ mù màu:** Cài đặt `"Bảng màu dễ phân biệt"` (lưu `localStorage`), đổi màu Bóng Mực sang `#00B3FF`, cảnh báo `#FFFFFF` kèm `⚠`, cùng phân biệt hình học đèn tắt (xẹp 20% + vết rách) và đèn yếu (nhấp nháy 1 Hz).

## [0.2.0] — Phase 2: "Ba hòn đảo" (Contract v1.1)
- Chuẩn hóa số liệu và thứ tự 12 bước/tick; thêm Lướt (Dash), rơi `Y < -10` + hồi sinh, 3 bản đồ chuẩn (Đảo Bến, Đảo Cau, Đảo Chuông), Gió Lạc (`Drifters`), Bùa Gió (`Charms`), Pause (`state: "paused"`), Web Audio, lưu Cài đặt, HUD đầy đủ và màn Bình Minh.

## [0.1.0] — Phase 1: "Đảo Đèn Lồng" (Contract v1.0)
- Phiên bản đầu tiên Đêm 1 Đảo Bến với mô phỏng 60Hz tách rời renderer Three.js và CLI headless.
