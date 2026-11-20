# Phase 1 — Bằng chứng kiểm chứng & Truy vết yêu cầu

## 1. Bảng truy vết Yêu cầu → Bằng chứng

| Yêu cầu (PRD-0 / Test Contract v1.0) | Cách kiểm chứng | Lệnh / Tệp bằng chứng | Kết quả |
|---|---|---|---|
| `game.contract.json` ở gốc repo, đúng schema v1.0 & tuning khớp code | Unit test `contract` + build | [game.contract.json](../../game.contract.json), [tests.log](tests.log) | **Đạt** |
| Logic 60Hz, XZ distance, tách khỏi DOM/WebGL | `tsc -p tsconfig.headless.json` + 39 unit tests + 2 safe-zone tests | [tests.log](tests.log), [smoke.log](smoke.log) | **Đạt (60/60 tests pass)** |
| Input `frames` sticky, `cam_yaw_deg`, rising-edge `jump`/`interact`/`pulse` | Unit + contract headless tests | [tests.log](tests.log), `tests/contract/headless.test.ts` | **Đạt** |
| Scenario patching (`L1..L5`, `motes`, `shades`, `time_left_s`), không emit event/điểm lúc khởi tạo | Unit tests + 6 scenario headless runs | [win.jsonl](win.jsonl), [dawn.jsonl](dawn.jsonl), [hit.jsonl](hit.jsonl), [pulse.jsonl](pulse.jsonl), [spawn.jsonl](spawn.jsonl), [pickup.jsonl](pickup.jsonl) | **Đạt** |
| Đầy đủ 7 event (`mote_picked`, `deposit`, `lantern_lit`, `pulse`, `player_hit`, `shade_spawned`, `game_over`) + `snapshot` + `end` | Script kiểm tra coverage trên output `.jsonl` | [event-coverage.log](event-coverage.log) | **Đạt (7/7 events)** |
| Tính tất định cùng `--seed` | Chạy 2 lần `--seed 42 --night 1 --ticks 1200` và so sánh byte-to-byte | [determinism.log](determinism.log), [seed42-a.jsonl](seed42-a.jsonl), [seed42-b.jsonl](seed42-b.jsonl) | **Đạt (SHA256 trùng khớp 100%)** |
| Sai định dạng JSON / flag / tick giảm / unknown key thoát mã `2` | 14 contract test cases + smoke checks | [tests.log](tests.log), [smoke.log](smoke.log) | **Đạt** |
| Build client 3D & typecheck toàn dự án | `npm run build` (`tsc --noEmit && vite build && npm run build:headless`) | [browser-build.log](browser-build.log) | **Đạt** |
| Chơi thử game 3D trên trình duyệt WebGL (start, di chuyển, nhảy, Bóng Mực, thua/chơi lại, Esc pause/resume, HUD responsive) | Chạy `npm run preview` và kiểm thử thực tế trên Chrome (xem mục 2) | Phiên kiểm thử Chrome trên `http://127.0.0.1:4173` | **Đạt (0 lỗi WebGL/JS)** |

---

## 2. Chi tiết kết quả chạy thực tế

- **`npm run verify`:**
  - `vitest run`: **3/3 test files passed (60/60 tests)** (`tests/unit/simulation.test.ts`: 39, `tests/unit/safe-zones.test.ts`: 2, `tests/contract/headless.test.ts`: 19).
  - `tsc --noEmit && vite build && npm run build:headless`: **exit 0**, tạo `dist/` và `dist-headless/`.
- **`node scripts/collect-proof.mjs`:**
  - Chế độ `full` ([run-summary.json](run-summary.json)): **13/13 checks status `0`**.
  - Determinism SHA256 (`seed42-a.jsonl` == `seed42-b.jsonl`): `a852062675aeda9ef3fa271247a509fbe9964d91501684c8cbdb11b986c74575`.
- **Kiểm thử giao diện 3D trên Chrome (`http://127.0.0.1:4173`):**
  - Không có lỗi WebGL hoặc runtime JS trong DevTools Console.
  - Màn hình mở đầu hiển thị đủ tiêu đề, thông số HUD (`Ngọn lửa`, `Đom đóm`, `Đèn đã thắp`, `Trước bình minh`, `Điểm`), nút `Bắt đầu đêm hành trình`.
  - Khi chơi: đồng hồ đếm ngược, điều khiển `W`/`D`/`Space` di chuyển & nhảy, Đảo Bến + Mây đội nón lá + 5 Đèn Lồng + đom đóm + Bóng Mực render rõ ràng.
  - Bóng Mực chạm làm giảm lửa (`●●●` → `○○○`) và hiện hộp thoại kết thúc kèm nút `Chơi lại`; nhấn `Esc` tạm dừng đúng và `Tiếp tục hành trình` chạy tiếp bình thường.
  - Bố cục hiển thị gọn trên cả desktop và viewport `1280x720`, không chồng lấn chữ.
