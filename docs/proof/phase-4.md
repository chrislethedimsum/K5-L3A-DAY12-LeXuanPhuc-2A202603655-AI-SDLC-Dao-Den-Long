# Bằng Chứng Kiểm Chứng — Phase 4: "Bình minh: phát hành v1.0.0" (Contract v1.3)

**Môi trường & Cấu hình máy đo:**
- **Hệ điều hành:** `macOS 15.7.8 (24G824)` (`arm64`)
- **CPU / RAM:** `Apple M4 Pro` · `24 GB` RAM (`25,769,803,776` bytes)
- **Runtime:** `Node.js v26.13.1` · `Google Chrome` (WebGL2 `ANGLE Metal Renderer: Apple M4 Pro`)

---

## 1. Bảng truy vết Yêu cầu → Bằng chứng (Ticket-04)

| Hạng mục Ticket-04 | Tiêu chuẩn | Bằng chứng chạy thật | Kết quả |
|---|---|---|---|
| **Contract v1.3** | `contract_version: "1.3"`, thêm `bench_cmd` & `soak_cmd`, không vỡ v1.0–v1.2 | [game.contract.json](../../game.contract.json) · [tests/unit/simulation.test.ts](../../tests/unit/simulation.test.ts) · [tests/contract/headless.test.ts](../../tests/contract/headless.test.ts) | **PASS** (6/6 test files · 84/84 tests) |
| **Chế độ Benchmark** | `node scripts/bench.mjs --seed 42 --duration 30 --out bench.json` (`avg_fps ≥ 60`, `p1_low_fps ≥ 30`, `load_ms ≤ 10000`) | [bench.json](../../bench.json) · [bench.png](../media/bench.png) | **PASS** (`avg_fps: 796.6`, `p1_low_fps: 365.6`, `frame_ms_p95: 2.5 ms`, `frames: 23899`, `load_ms: 1768 ms`, `peak_mem_mb: 805.8 MB`, `vsync_off: true`) |
| **Soak Test** | `node --jitless --max-semi-space-size=1 --no-lazy --optimize-for-size --expose-gc dist-headless/src/headless/soak.js --seed 7 --nights 10 --out soak.json` (`crashes = 0`, `mem_end_mb ≤ 1.2 × mem_start_mb`) | [soak.json](../../soak.json) · [soak-proof.json](soak-proof.json) · [soak-test.log](soak-test.log) | **PASS** (`nights: 10`, `crashes: 0`, `mem_start_mb: 15.9 MB → mem_end_mb: 16.7 MB` = `1.05×`, `duration_s: 0.3s`) |
| **Bảng xếp hạng cục bộ** | Nhập tên sau Bình Minh hoặc mọi màn thua, validate `3–12` ký tự, Top 10 giảm dần theo điểm + tiebreak sớm hơn, lưu đĩa, `--export-leaderboard out.json` | [tests/unit/phase4.test.ts](../../tests/unit/phase4.test.ts) · [leaderboard-export.json](leaderboard-export.json) · [leaderboard.png](../media/leaderboard.png) | **PASS** (đã test nhập `"Mây_Pro"` sau thua Đêm 2 qua Dawn timeout, reload trang vẫn giữ nguyên, xuất JSON chuẩn qua `--export-leaderboard`) |
| **4 tính năng Tiếp cận** | Đổi 9 phím + báo trùng + khôi phục mặc định; 4 phụ đề + mũi tên hướng Bóng Mực; Giảm chuyển động; UI `>= 18 px` ở `1280×720` + chữ lớn `×1.25` | [settings-accessibility.png](../media/settings-accessibility.png) · [gameplay.png](../media/gameplay.png) · [src/core/keybinds.ts](../../src/core/keybinds.ts) | **PASS** (kiểm chứng trực tiếp trên Chrome `1280×720`: báo trùng `Nhảy ← E`, gán `Nhảy = J` lưu qua reload, khôi phục mặc định, phụ đề `"👁 Bóng Mực vừa xuất hiện!"` + mũi tên `👁➤`, không tràn ngang; ghi nhận modal `×1.25` dùng `overflow-y: auto` cuộn dọc trong khung 720px) |
| **Hồi quy & Tính tất định Phase 1–3** | Giữ nguyên 100% logic Đêm 1–3 và byte-identical JSONL | [run-summary.json](run-summary.json) · [event-coverage.log](event-coverage.log) · [perf-headless.log](perf-headless.log) | **PASS** (36/36 `collect-proof.mjs`: SHA-256 giống nhau từng byte cả 3 Đêm, 17/17 event, Night 3 `18,000` tick hết `134 ms`) |
| **Clone sạch `<= 3` lệnh & Đóng gói** | Clone sạch chạy `npm ci && npm run build && npm start` + gói `.tar.gz` + `Dockerfile` | Bản clone tạm `/tmp/dao-den-long-phase4-check` & giải nén `/tmp/release-clean/dao-den-long-v1.0.0` | **PASS** (84/84 tests, `/api/health` trả `{"ok":true,"version":"1.0.0"}`, gói `dao-den-long-v1.0.0-web.tar.gz` `160.3 KB`) |
| **Sáng tạo không ảnh hưởng lõi** | `src/core/` tách biệt khỏi `src/client/`; hiệu ứng sáng tạo tắt khi `benchMode` | [tests/unit/phase4.test.ts](../../tests/unit/phase4.test.ts) | **PASS** |

---

## 2. Kết quả Benchmark & Soak Test thật

### `bench.json` (Chạy trực tiếp `node scripts/bench.mjs --seed 42 --duration 30 --out bench.json`)
```json
{
  "contract_version": "1.3",
  "avg_fps": 796.6,
  "p1_low_fps": 365.6,
  "frame_ms_p95": 2.5,
  "frames": 23899,
  "load_ms": 1768,
  "peak_mem_mb": 805.8,
  "vsync_off": true,
  "renderer": "Three.js r170 / WebGL2 (ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro, Unspecified Version))",
  "os": "macOS 15.7.8 (arm64)"
}
```

### `soak.json` (Chạy trực tiếp `npm run soak`)
```json
{
  "nights": 10,
  "crashes": 0,
  "results": [
    "lost", "lost", "lost", "lost", "lost",
    "lost", "lost", "lost", "lost", "lost"
  ],
  "mem_start_mb": 15.9,
  "mem_end_mb": 16.7,
  "duration_s": 0.3
}
```
*(Bản chạy trong `collect-proof.mjs` ghi `docs/proof/soak-proof.json` đạt `16.3 → 18.2 MB`, tỷ lệ `1.117× ≤ 1.2×`, `crashes: 0`.)*

---

## 3. Kiểm chứng Trình duyệt Chrome (`1280×720`)

- **Console & Mạng:** `0` lỗi JS/WebGL, `0` warning, `0` lỗi tải tài nguyên (`GET /`, JS, CSS, `/api/leaderboard` đều `200`, `0` lỗi 404 favicon).
- **Trải nghiệm & Tiếp cận đã thử:**
  - Thử xung đột phím `Nhảy → E`: báo `"Phím E đang được dùng cho “Tương tác (Nạp/Châm dầu)”. Hãy chọn phím khác."` và giữ nguyên `Space`.
  - Gán `Nhảy → J`, bật `"Giảm chuyển động"` và `"Chữ lớn (×1.25)"`, F5 reload → kiểm tra lại vẫn giữ đúng; bấm `"Khôi phục mặc định"` trở lại `Space`.
  - Chơi thử Đêm 1: hiển thị đồng thời phụ đề `"👁 Bóng Mực vừa xuất hiện!"` và mũi tên `👁➤` ở mép màn hình chỉ hướng Bóng Mực.
  - Chơi Đêm 2 đến hết giờ Bình Minh (`0/6` đèn) → màn `"Ánh sáng tạm tắt"` cho nhập `"Mây_Pro"` → lưu điểm → `"Xem bảng xếp hạng"` hiển thị `#1 Mây_Pro (0 · 0/3 · seed 42)` và giữ nguyên sau reload.
  - Mở `?bench=1&seed=42&duration=4`: xác nhận `POST /__bench_result` nhận `avg_fps: 120`, `p1_low_fps: 106.4`, `frame_ms_p95: 9.3`, hiển thị đủ 200 Bóng Mực + 100 đom đóm + 3 đèn L1–L3 sáng.

---

## 4. Kiểm tra Bảo mật & Sạch sẽ trước phát hành

- Quét workspace: không có file `.env*`.
- Quét lịch sử/mã nguồn (`git grep`): `NO_SECRETS_FOUND`.
- Toàn bộ file harness AI (`AGENTS.md`, `.agents/skills/verify-phase/SKILL.md`, `.github/workflows/ci.yml`) còn nguyên vẹn và được cập nhật xuyên suốt `phase-1` → `phase-4`.
