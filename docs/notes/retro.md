# Retrospective Tổng Hợp Dự Án — Đảo Đèn Lồng (Phases 1 → 4)

**Tác giả:** Lê Xuân Phúc (`2A202603655` · K5-L3A)  
**Sản phẩm:** Game sinh tồn 3D WebGL **Đảo Đèn Lồng v1.0.0** (`TypeScript + Three.js + Vite + Node.js`)

---

## 1. Tổng hợp Evaluation qua 4 Phase

| Phase | Mục tiêu chính | Kết quả đạt được | Hồi quy phase trước | Điều chỉnh chính |
|---|---|---|---|---|
| **Phase 1 (`tag: phase-1`)** | PRD-0 & Contract v1.0: Đảo Bến 60 Hz tách khỏi 3D | 60/60 unit + contract test, 13/13 `collect-proof`, Chrome WebGL OK | N/A | Chuyển dự án từ `Lab 12/` lên gốc repo; khớp lại 100% JSONL schema & `cam_yaw_deg` |
| **Phase 2 (`tag: phase-2`)** | Ticket-02 & Contract v1.1: 3 hòn đảo, Dash, rơi vực, Drifters, Charms, Pause, Audio | 67/67 test, 28/28 `collect-proof`, Night 3 `21,600` tick `137 ms`, `120 FPS` | Không hỏng (đồng bộ 18 thông số chuẩn mới và luật ưu tiên `no_flames > all_lit`) | Dời spawn Đêm 3 ra `(0,0,32)` khỏi Tháp chuông; vá lỗi rising-edge Pause/Resume trên trình duyệt |
| **Phase 3 (`tag: phase-3`)** | Ticket-03 & Contract v1.2: Đèn cạn dầu (`fuel 0–100`), `drain`, `dawn_survived`, sức chứa động, mù màu | 77/77 test, 33/33 `collect-proof` (17/17 event), Night 3 `18,000` tick `187 ms`, Chrome CLS `0.00` | Không hỏng; cập nhật tường minh các test bị luật mới thay thế (`ADR-001`, `CHANGELOG`) | Số nguyên `fuel60` triệt tiêu sai số float; sửa `all_lit` → `dawn_survived` |
| **Phase 4 (`tag: phase-4`)** | Ticket-04 & Contract v1.3: Benchmark, Soak test, Leaderboard lưu đĩa, 4 tính năng Accessibility, Release `v1.0.0` | 84/84 test, 36/36 `collect-proof`, Bench `796.6 FPS` (`p1_low 365.6`), Soak `0 crashes` (`1.05×` RSS), Chrome `1280×720` `0` lỗi | Không hỏng; mọi test Phase 1–3 đều còn hiệu lực & đạt | `THREE.InstancedMesh`; zero-alloc hot path + V8 deterministic flags; gộp máy chủ & CLI xuất điểm vào `scripts/run.mjs` |

---

## 2. Điều gì hiệu quả và không hiệu quả khi làm việc với AI

**Hiệu quả nhất:**
- **Tách lõi mô phỏng thuần (`src/core/`) khỏi giao diện (`src/client/`):** Mọi thay đổi quy tắc phức tạp qua 3 bản nâng cấp Contract (v1.0 → v1.3) đều kiểm chứng được tức thì qua headless Node CLI trong vài trăm mili-giây mà không phụ thuộc DOM/WebGL.
- **Một nguồn chân lý duy nhất (`game.contract.json` + `WORLD_CONFIG`):** Khi đề bài chuẩn hóa hoặc thay luật giữa các phase, AI không sửa sót hằng số rải rác giữa client, test và simulation.
- **Chốt kế hoạch + tiêu chí kiểm chứng *trước* khi sinh mã:** Khi bắt buộc chạy kiểm chứng tự động ở cuối mỗi bước, mọi lỗi schema, type và hồi quy bị chặn ngay trước khi commit.

**Không hiệu quả:**
- **Cho AI tự đoán định dạng khi chưa đọc trọn đặc tả (Phase 1 sớm):** Ở lượt đầu, AI tạo khung thư mục lồng (`Lab 12/`), tự bịa tên trường JSON (`stored`, `{x,y,z}`, thiếu dòng `end`), làm tốn một vòng refactor toàn bộ schema.
- **Chỉ tin vào unit test headless mà bỏ qua thao tác người chơi thật (Phase 2 & Phase 4):** Unit test giả lập từng frame không phát hiện lỗi giữ trạng thái nút Pause sau khi đóng modal hay lỗi modal cuộn dọc khi tăng cỡ chữ `×1.25` trên màn hình `1280×720`.

---

## 3. Các lần AI sai, cách phát hiện & cập nhật Harness

| Phase | Sai sót của AI | Cách phát hiện | Bổ sung vào Harness / Quy trình |
|---|---|---|---|
| P1 | Đặt mã nguồn vào thư mục con `Lab 12/` & đoán sai schema Test Contract v1.0 | Kiểm tra `git status`, đọc đối chiếu từng dòng lab board `#p1` | Tạo `AGENTS.md` ghi rõ đường dẫn root và toàn bộ bất biến Contract JSONL |
| P2 | Spawn Đêm 3 đặt tại `(0,0,0)` trùng Tháp chuông `Y=6` gây rơi liên tục | Chạy benchmark Đêm 3 `21,600` tick phát hiện điểm & vị trí bất thường | Thêm `night3-terrain` vào bộ fixture kiểm chứng tự động `collect-proof.mjs` |
| P2 | Nút `"Tiếp tục"` trên web gửi lại `pause: true` không có rising edge nên game đóng băng | Mở trực tiếp bản build trên Chrome `1280×720`, bấm `P` rồi click `"Tiếp tục"` | Đưa bước "kiểm tra UI thật trên Chrome (Pause/Resume, Settings reload)" vào skill `verify-phase` |
| P3 | Tham chiếu sai biến `T` thay vì `t` trong `hud.ts`; lỗi tick-1 fuel decay trong test `refuel` | `npm run verify` (`tsc --noEmit` & `vitest`) chặn ngay trước khi sang bước sau | Giữ `npm run verify` bắt buộc chạy cả `tsc --noEmit` + `vitest` + `vite build` + `build:headless` |
| P4 | Lỗi RSS tăng ảo `13.4 → 47.5 MB` ở soak đầu tiên; quên `mkdirSync` trong test export leaderboard; `vitest` ban đầu bị thiếu bước chuẩn hóa `vsync_off` | Chạy thật `soak.js` sau Step 2 và đo RSS từng đêm thay vì đợi cuối phase | Ghi quy tắc zero-allocation hot path, `InstancedMesh`, cờ benchmark/soak chuẩn vào `AGENTS.md` |

---

## 4. Thành phần Harness giúp ích nhiều nhất

1. **[game.contract.json](../../game.contract.json) + `tests/contract/headless.test.ts`:** Là hàng rào bảo vệ mạnh nhất — bắt lỗi sai flag (`exit 2`), sai sticky input, sai kiểu snapshot hay mất tính tất định ngay lập tức.
2. **[scripts/collect-proof.mjs](../../scripts/collect-proof.mjs):** Gom toàn bộ 36 phép đo (unit test, 3 bản build, smoke, SHA-256 determinism 3 Đêm, bao phủ 17/17 event trên 19 fixture, perf Đêm 3, soak thresholds, leaderboard export) thành **1 lệnh duy nhất (~8 giây)** cho ra log chuẩn không phải copy tay.
3. **[AGENTS.md](../../AGENTS.md) & [.agents/skills/verify-phase/SKILL.md](../../.agents/skills/verify-phase/SKILL.md):** Ngắn (< 25 dòng) nhưng ngăn AI lặp lại lỗi cũ (không bỏ qua test cũ âm thầm, bắt buộc phân tách `benchMode` khỏi sáng tạo).
4. **[.github/workflows/ci.yml](../../.github/workflows/ci.yml):** Tự động xác nhận môi trường sạch Ubuntu khớp 100% kết quả máy cá nhân sau mỗi lần push.

---

## 5. Theo dõi Token & Chi phí AI

*(Ghi chú: công cụ IDE không xuất bộ đếm token thô cho từng turn, bảng dưới là ước tính trung thực dựa trên số lượt hội thoại, khối lượng file đọc/sinh và các lượt subagent browser qua 4 phase.)*

| Phase | Ước tính token | Phân bổ chính | Cách đã dùng để tiết kiệm |
|---|---:|---|---|
| **Phase 1** | ~75k (65k–85k) | Khung dự án, sửa schema v1.0, 60 test, kiểm thử Chrome đầu tiên | Tách `src/core/` gọn, gom tuning vào `game.contract.json`, giữ `AGENTS.md` dưới 25 dòng |
| **Phase 2** | ~80k (70k–90k) | `maps.ts` 3 đảo, `simulation.ts` 12 bước, Audio/HUD, 14 fixtures, 2 lượt Chrome | Kế thừa trực tiếp khung Phase 1; gộp 28 check vào 1 script `collect-proof.mjs`; giữ tab trình duyệt mở khi vá Pause |
| **Phase 3** | ~62k (55k–70k) | Luật `fuel60`/`drain`/`dawn_survived`, colorblind mode, ADR + CHANGELOG | Thiết kế `fuel60` nguyên ngay từ đầu để tránh sửa sai số thực; chỉ sửa đúng phần delta |
| **Phase 4** | ~95k (85k–110k) | `bench.mjs`, `soak.ts`, `InstancedMesh`, a11y + Leaderboard, 4 ảnh chụp, Retro & Release | Dùng micro-benchmark 2 giây tìm gốc RSS trước khi sửa mã; gộp tất cả 4 ảnh & test Chrome vào 1 phiên subagent |
| **Tổng cộng** | **~312k tokens** (~275k–355k) | Toàn bộ 4 phase từ PRD-0 tới Release `v1.0.0` | Không bao giờ sửa mù trên production UI trước khi `core` và headless contract xanh |

---

## 6. Nếu làm lại từ đầu sẽ thay đổi gì?

1. **Đọc & khóa Test Contract *trước tiên* trước dòng code đầu tiên:** Sẽ tránh hoàn toàn việc phải viết lại cấu trúc thư mục và JSONL schema ở Phase 1 (~30% công sức phase đầu).
2. **Thiết kế `THREE.InstancedMesh` và zero-allocation hot path ngay từ Phase 1:** Thay vì tạo từng `THREE.Group` cho thực thể rồi chuyển sang `InstancedMesh` ở Phase 4, thiết kế hướng dữ liệu (data-oriented) từ đầu giúp mặc định vừa mượt cho benchmark vừa ổn định bộ nhớ cho soak test.
3. **Chuẩn bị script kiểm thử tương tác bàn phím/giữ phím (e.g. Playwright nhỏ hoặc test harness E2E) bên cạnh DevTools thủ công:** Giúp tự động hóa test nhấn giữ di chuyển dài hạn trên trình duyệt thay vì phụ thuộc lệnh tap từng phím đơn lẻ.
