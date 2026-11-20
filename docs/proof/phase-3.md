# Phase 3 — Bằng chứng kiểm chứng & Truy vết yêu cầu (Contract v1.2)

## 1. Bảng truy vết Yêu cầu → Bằng chứng

| Yêu cầu (Ticket-03 / Test Contract v1.2) | Cách kiểm chứng | Lệnh / Tệp bằng chứng | Kết quả |
|---|---|---|---|
| `game.contract.json` v1.2 đúng tuning mới & thời lượng `240/270/300s` | Unit test `contract` + `npm run build` | [game.contract.json](../../game.contract.json), [tests.log](tests.log) | **Đạt** |
| ADR giải thích thay đổi mô hình trạng thái đèn & luật thắng | Tài liệu kiến trúc | [ADR 001](../adr/001-lantern-fuel-and-dawn-survival.md) | **Đạt** |
| Changelog ghi rõ breaking changes Phase 3 | Changelog ở gốc repo | [CHANGELOG.md](../../CHANGELOG.md) | **Đạt** |
| Cập nhật test cũ kèm lý do (không skip âm thầm) + test mới Ticket-03 | 41 unit tests `simulation.test.ts` + 6 unit tests `phase3.test.ts` + 8 `phase2.test.ts` + 3 `safe-zones.test.ts` | [tests.log](tests.log), [smoke.log](smoke.log) | **Đạt (77/77 tests pass)** |
| Nhiên liệu `fuel60`, châm dầu `refuel`, tắt đèn `lantern_out`, thắp lại `5` đom đóm (`relight: true`) | Unit + scenarios CLI `refuel`, `lantern-out-relight` | [refuel.jsonl](refuel.jsonl), [lantern-out-relight.jsonl](lantern-out-relight.jsonl) | **Đạt** |
| Vùng an toàn mất khi `< 30`, Bóng Mực `wander -> drain`, `fuel_drain` mỗi 60 tick, `+15` pulse khi đang `drain` | Unit tests + scenario CLI `shade-drain` | [shade-drain.jsonl](shade-drain.jsonl) | **Đạt** |
| Luật thắng `dawn_survived` (`3/5`, `4/6`, `5/7`), không thắng sớm `all_lit`, `no_flames` ưu tiên tick cuối, sức chứa `10..20` | Unit tests + scenarios CLI `win`, `dawn-survived`, `capacity-growth` | [win.jsonl](win.jsonl), [dawn-survived.jsonl](dawn-survived.jsonl), [capacity-growth.jsonl](capacity-growth.jsonl) | **Đạt** |
| Bao phủ đủ 17 event Contract v1.2 & tất định 3 Đêm | Script kiểm tra trên 19 scenarios & 2 lần chạy mỗi Đêm | [event-coverage.log](event-coverage.log), [determinism-night1.log](determinism-night1.log), [determinism-night2.log](determinism-night2.log), [determinism-night3.log](determinism-night3.log) | **Đạt (17/17 events, SHA256 trùng 100%)** |
| Benchmark headless Đêm 3 `18,000` tick (`300s`) <= 30s | Đo thời gian CLI `18,000` ticks | [perf-headless.log](perf-headless.log) | **Đạt (`187 ms <= 30,000 ms`)** |
| Giao diện 3D: thanh dầu, nhấp nháy `1 Hz`, đèn tắt xẹp 20% + rách, chế độ mù màu (`#00B3FF`, `#FFFFFF` + `⚠`) lưu qua reload | Kiểm thử trực tiếp trên Chrome `1280×720` | Phiên kiểm thử Chrome (mục 2) | **Đạt (0 lỗi WebGL/JS)** |

---

## 2. Chi tiết số đo & Kiểm thử thực tế

- **`npm run verify`:**
  - `vitest run`: **5/5 test files passed (77/77 tests)** (`simulation.test.ts`: 41, `phase3.test.ts`: 6, `phase2.test.ts`: 8, `safe-zones.test.ts`: 3, `headless.test.ts`: 19).
  - `tsc --noEmit && vite build && npm run build:headless`: exit `0`.
- **`node scripts/collect-proof.mjs`:**
  - Tổng hợp tại [run-summary.json](run-summary.json): **33/33 checks status `0`**.
  - Determinism SHA256 (`1200` ticks, `--seed 42`):
    - Đêm 1: `ec26d2c4aedff77fabf7b69618d062ad8be0503b6430c0e578e4b9fab7358ad4` (`byte_identical=true`)
    - Đêm 2: `d600ccd639f99b904211c5e1c3f2335cac10fefd6bbee7dc22a60b73585817d0` (`byte_identical=true`)
    - Đêm 3: `977ce532265564d8b69b8955e3af7f63c1426af44573cd3feb5f2911b5b71964` (`byte_identical=true`)
  - Benchmark Đêm 3 (`18,000` ticks): **`187 ms`** (ngưỡng `<= 30,000 ms`).
- **Kiểm thử Chrome WebGL tại `1280×720` (`http://127.0.0.1:4173`):**
  - `0` lỗi WebGL, `0` lỗi JS runtime (chỉ có 404 tùy chọn cho `/favicon.ico`).
  - **Cài đặt mù màu (`#cb-toggle`):** Bật `"Bảng màu dễ phân biệt"`, reload trang (`ignoreCache: true`), mở lại Cài đặt xác nhận vẫn giữ trạng thái bật.
  - **Đêm 1 & Đêm 3 thực tế:** Đêm 1 hiển thị đúng `04:00`, `0/5 (cần 3)`, thanh đom đóm `0/10`, đèn tắt xẹp + vết rách dọc rõ ràng, 2 Bóng Mực xuất hiện sau 5s với viền và mắt xanh cyan `#00B3FF`; Pause (`Esc`) đóng băng đồng hồ (`03:37`) và `"Tiếp tục"` chạy tiếp (`03:34`). Đêm 3 hiển thị `05:00`, `0/7 (cần 5)`, biểu tượng cảnh báo `⚠ Cảnh báo: Gió mạnh sắp tới!`.
  - **Giới hạn ghi nhận trung thực:** Lệnh `evaluate_script` trong DevTools MCP hết hạn chờ xác nhận quyền người dùng (60s) nên không lấy được số đo `window.__DDL_FPS__` trực tiếp ở lượt Phase 3 này; trace hiệu năng DevTools `4.4s` trong cảnh Đêm 3 hoàn tất sạch với `CLS: 0.00`.
