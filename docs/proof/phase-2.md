# Phase 2 — Bằng chứng kiểm chứng & Đo đạc (Contract v1.1)

## 1. Bảng truy vết Yêu cầu → Bằng chứng

| Yêu cầu (Ticket-02 / Test Contract v1.1) | Cách kiểm chứng | Lệnh / Tệp bằng chứng | Kết quả |
|---|---|---|---|
| `game.contract.json` v1.1 khớp 100% số chuẩn Phần 1 & 4 | Unit test `contract` + `npm run build` | [game.contract.json](../../game.contract.json), [tests.log](tests.log) | **Đạt** |
| Hồi quy Phase 1 với số chuẩn (tick order, XZ/3D, deposit, pulse, safe zones, 3 kết thúc, validation exit `2`) | 37 unit tests `simulation.test.ts` + 3 tests `safe-zones.test.ts` | [tests.log](tests.log), [smoke.log](smoke.log) | **Đạt (67/67 tests pass)** |
| 3 bản đồ chuẩn (Đảo Bến `40m`, Đảo Cau 2 đảo + cầu tre + 2 bục nhảy, Đảo Chuông 3 tầng + 2 dốc + tháp chuông + gió mạnh) | 8 unit tests `phase2.test.ts` + scenarios CLI + kiểm thử hình ảnh 3D | [tests.log](tests.log), [launchpad.jsonl](launchpad.jsonl), [night3-terrain.jsonl](night3-terrain.jsonl) | **Đạt** |
| Đầy đủ scenario headless cho mọi tính năng mới (`dash`, `fall`, `launchpad`, `night3-terrain`, `drifter`, `charm`, `pause`, `safe-push`) | Chạy CLI thực tế trên 14 fixtures (6 Phase 1 + 8 Phase 2) | [dash.jsonl](dash.jsonl), [fall.jsonl](fall.jsonl), [launchpad.jsonl](launchpad.jsonl), [night3-terrain.jsonl](night3-terrain.jsonl), [drifter.jsonl](drifter.jsonl), [charm.jsonl](charm.jsonl), [pause.jsonl](pause.jsonl), [safe-push.jsonl](safe-push.jsonl) | **Đạt (14/14 scenarios pass)** |
| Đủ 14 loại event Contract v1.0 + v1.1, 5 trạng thái Bóng Mực, `end` record | Script kiểm tra event coverage | [event-coverage.log](event-coverage.log) | **Đạt (14/14 events)** |
| Tính tất định byte-identical cho cả Đêm 1, 2, 3 (`--seed 42`) | Chạy 2 lần mỗi Đêm (`1200` ticks) và so SHA256 | [determinism-night1.log](determinism-night1.log), [determinism-night2.log](determinism-night2.log), [determinism-night3.log](determinism-night3.log) | **Đạt (SHA256 trùng khớp 100%)** |
| Headless Đêm 3 đầy đủ `21,600` tick xong trong `<= 30s` | Đo thời gian thực thi CLI với `21,600` ticks | [perf-headless.log](perf-headless.log) | **Đạt (`137 ms <= 30,000 ms`)** |
| Giao diện 3D, bảng màu chuẩn, Web Audio, lưu Cài đặt, HUD đầy đủ, Pause/Resume, FPS `>= 30` ở `1280×720` | Chạy bản build `npm run preview` trên Chrome `1280×720` | Phiên kiểm thử Chrome (xem mục 2) | **Đạt (`120 FPS`, 0 lỗi WebGL/JS)** |

---

## 2. Chi tiết số đo & Kiểm thử thực tế

- **Vitest + TypeScript + Vite build (`npm run verify`):**
  - `vitest run`: **4/4 test files passed (67/67 tests)** (`simulation.test.ts`: 37, `phase2.test.ts`: 8, `safe-zones.test.ts`: 3, `headless.test.ts`: 19).
  - `tsc --noEmit && vite build && npm run build:headless`: exit `0`.
- **Automated Proof Runner (`node scripts/collect-proof.mjs`):**
  - Tổng hợp trong [run-summary.json](run-summary.json): **28/28 checks status `0`**.
  - Determinism SHA256 (`1200` ticks, `--seed 42`):
    - Đêm 1: `70738816a98032f9c6fbe412f60cc7bda0dbade090f16dc59a1e458cf861b2b3` (`byte_identical=true`)
    - Đêm 2: `7394ea40ff0c63d417dba581c56e3239e0ef6baa4d52e4e692dc7906d48936fa` (`byte_identical=true`)
    - Đêm 3: `14f803af44b79d800343b737e735f8d854420b65be61c10e6c5bb52b90ba6694` (`byte_identical=true`)
  - Benchmark Đêm 3 (`21,600` ticks): **`137 ms`** (ngưỡng yêu cầu `<= 30,000 ms`).
- **Kiểm thử Chrome WebGL tại `1280×720` (`http://127.0.0.1:4173`):**
  - **Cấu hình đo & Hiệu năng (`window.__DDL_FPS__`):** Đo trong cảnh 3D Đêm 3 (nhiều hình học nhất: 3 tầng, 2 dốc, tháp chuông, 7 đèn, đom đóm, Bóng Mực, Gió Lạc) đạt **120 FPS trung bình** (`avgMs: 8.35 ms` trên >49,000 frame), vượt xa ngưỡng `>= 30 FPS`.
  - **Lỗi Console:** `0` lỗi WebGL, `0` lỗi JS runtime (chỉ có 404 tùy chọn cho `/favicon.ico`).
  - **Menu & Lưu Cài đặt:** Chỉnh âm lượng `35%`, độ nhạy `1.6x` → lưu vào `localStorage` (`dao_den_long_settings_v1`) → sau reload trang vẫn giữ nguyên `35%` và `1.6x`.
  - **Ba Đêm & HUD:** Xác nhận hiển thị Đêm 1 (`Đảo Bến`, `0/5`), Đêm 2 (`Đảo Cau`, cầu tre + 2 bục nhảy + Bùa Gió + Gió Lạc, `0/6`), Đêm 3 (`Đảo Chuông`, 3 tầng + 2 dốc + bục nhảy + tháp chuông, `0/7`), thanh 10 ô đom đóm, hồi chiêu Lướt/Tỏa Sáng, mũi tên chỉ đèn ngoài màn hình (`#lantern-arrow`).
  - **Pause & Resume:** Xác nhận `P` và `Esc` đóng băng đồng hồ (`04:49 -> 04:49`, `05:18 -> 05:18`), bấm `"Tiếp tục"` hoặc nhấn `Esc` lại mở khóa đồng hồ và điều khiển `Shift` Lướt bình thường trên cả Đêm 1 và Đêm 2.
