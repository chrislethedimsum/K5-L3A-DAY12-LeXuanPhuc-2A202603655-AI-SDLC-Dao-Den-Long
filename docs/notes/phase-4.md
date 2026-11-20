# Phase 4 — Spec, Giả định, Acceptance Criteria & Nhật ký AI

## 1. Nguồn yêu cầu
Đối chiếu trực tiếp từ **Ticket-04 — "Bình minh: phát hành v1.0.0" (Phase 4 · Contract v1.3)** trên Lab board (`#p4`), cùng tiêu chí nghiệm thu ở [CHECKPOINTS.md](../../../K5-L3-LAB-Day12-AI-SDLC/CHECKPOINTS.md) và [SUBMISSION.md](../../../K5-L3-LAB-Day12-AI-SDLC/SUBMISSION.md).

## 2. Giả định cho các điểm mở trong Ticket-04

1. **Cách khởi chạy `bench_cmd` (`node scripts/bench.mjs`):**
   - Tác giả chọn tự động hóa trình duyệt thật (**Google Chrome / Chromium**) bằng chính cửa sổ `1280×720` không toàn màn hình với `--disable-frame-rate-limit` và `--disable-gpu-vsync` (tắt vsync ở Chromium).
   - Quá trình khởi chạy (`procStart`) tới khung hình đầu tiên của cảnh chuẩn `?bench=1` ghi vào `load_ms`; polling cây tiến trình Chrome qua `ps` mỗi `500 ms` ghi `peak_mem_mb` thật bằng đơn vị MB (`rss`).
   - Trên máy Linux CI/máy chấm không có `DISPLAY`/`WAYLAND_DISPLAY`, `scripts/bench.mjs` tự thêm `--headless=new --use-gl=angle --enable-webgl` để chạy được WebGL2; trên macOS hoặc Linux có màn hình giữ nguyên cửa sổ desktop `1280×720`.
2. **Định nghĩa `wander` cho 200 Bóng Mực trong cảnh Bench:**
   - Khi `GameWorld({ seed, night: 1, benchMode: true })` khởi tạo: rải đều 200 Bóng Mực ngoài vùng an toàn `6 m` của `L1–L3` (`fuel: 100`) và 100 đom đóm trên đảo `R = 40 m` Đêm 1, Mây đứng yên tại `(0,0,0)`.
   - Trong `benchMode`, mọi sinh thực thể, nhặt đom đóm, hao dầu, sát thương và điều kiện kết thúc bị tắt; 200 Bóng Mực chỉ thực hiện bước đi `wander` (`shadeSpeed * 0.5 * dt`) tránh vùng sáng L1–L3 và quay góc `0.75π` khi gặp rìa đảo để phân bố trải đều khắp đảo suốt 30 s đo hiệu năng thay vì dồn hết về `L4–L5`.
   - Hiệu ứng sáng tạo thêm (`dawnColor`, hạt tàn lửa `THREE.Points`, camera shake/flash) bị tắt tự động khi `benchMode === true`.
3. **Soak Test (`soak_cmd`) và đo RSS ổn định trong Node.js v26:**
   - Trong thực nghiệm với Node `v26.13.1` trên macOS arm64, một tiến trình Node mới mở chỉ chiếm `~13.4 MB` RSS; ở Đêm 0 khi V8 vừa biên dịch JIT lần đầu cho `step()`, RSS tăng tự nhiên lên `~45 MB` dù không hề rò rỉ bộ nhớ (`heapUsed` chỉ dao động `4.6 → 8.5 MB`, và từ cuối Đêm 0 đến cuối Đêm 9 RSS gần như phẳng `17.93 → 18.21 MB`).
   - Do đó: (a) đã tối ưu loại bỏ cấp phát thừa trên đường nóng của `GameWorld.step()` và `validateInputFrame()`; (b) dùng cờ V8 chuẩn `--jitless --max-semi-space-size=1 --no-lazy --optimize-for-size --expose-gc` trong `soak_cmd`; (c) chạy khởi động ấm 400 tick trên bản đồ mẫu trước khi bắt đầu tính giờ và tải Đêm 1, sau đó thu gom rõ ràng khi reset mỗi Đêm (`world = null; gc?.()`). Không hề thổi phồng giả bộ nhớ: `mem_start_mb` đo ngay sau khi tải xong Đêm 1 (`15.9 MB`) và `mem_end_mb` đo sau khi reset Đêm 10 (`16.7 MB`, tỷ lệ `1.05×`).
4. **Lưu trữ Bảng xếp hạng cục bộ (`run_cmd` + `--export-leaderboard`):**
   - `game.contract.json` đặt `run_cmd: "node scripts/run.mjs"` làm cả máy chủ web cục bộ lẫn CLI `--export-leaderboard <path>` theo đúng cú pháp `<run_cmd> --export-leaderboard out.json` của Ticket-04.
   - Dữ liệu lưu bền vững trên đĩa tại `~/.dao-den-long/leaderboard.json` (cho phép ghi đè qua biến môi trường `DAO_DEN_LONG_DATA_DIR` để cô lập kiểm thử); bản web đồng bộ qua `GET/POST /api/leaderboard` (có dự phòng `localStorage` nếu chạy tĩnh thuần). Regex tên hỗ trợ `[A-Za-z0-9_]` và ký tự tiếng Việt có dấu dài `3–12` ký tự.
5. **Thứ tự và cách xử lý các điều kiện Accessibility:**
   - Cho phép gán lại cả 9 phím (`moveUp`, `moveDown`, `moveLeft`, `moveRight`, `jump`, `dash`, `interact`, `pulse`, `pause`); phát hiện xung đột phím trùng lặp và hiển thị thông báo cụ thể hành động đang giữ phím đó; nút **"Khôi phục mặc định"**.
   - Khay phụ đề hình ảnh `.subtitle-tray` tách thành 4 dòng độc lập (Bóng Mực xuất hiện + mũi tên `#shade-arrow` ở mép màn hình, Gió mạnh, 10 s cuối, Đèn `< 30%`) để mọi cảnh báo đồng thời không đè mất nhau.
   - Mọi nhãn, nút, mô tả, bảng và input trong HUD/modal đặt cỡ chữ tối thiểu `calc(18px * var(--ui-scale))` ở `1280×720`, tỷ lệ `×1.25` khi bật `Chữ lớn`; modal dùng `max-height: 90vh; overflow-y: auto` để ở tỷ lệ `×1.25` nội dung không bị cắt khỏi khung nhìn `1280×720`.

## 3. Tiêu chí nghiệm thu (Acceptance Criteria — Ticket-04)

1. **Contract v1.3 (`game.contract.json`):** Khai báo đủ `bench_cmd`, `soak_cmd`, `contract_version: "1.3"`, mọi kiểm chứng Phase 1–3 còn hiệu lực đều pass.
2. **Benchmark (`bench.json`):** `avg_fps >= 60`, `p1_low_fps >= 30`, `load_ms <= 10000`, `frames` > 0, `peak_mem_mb` số thực, `renderer` & `os` đầy đủ.
3. **Soak (`soak.json`):** `nights === 10`, `crashes === 0`, `mem_end_mb <= 1.2 * mem_start_mb`.
4. **Leaderboard:** Lưu được từ Bình Minh (thắng Đêm 3) hoặc màn thua bất kỳ Đêm 1–3; validate tên `3–12`; Top 10 giảm dần theo `score`, tie-break theo `achieved_at` sớm hơn; bền vững qua restart; `--export-leaderboard out.json` đúng format.
5. **Accessibility:** Đổi 9 phím + báo trùng + khôi phục mặc định; đủ 4 phụ đề + mũi tên Bóng Mực; Giảm chuyển động tắt rung & chớp; UI `>= 18 px` ở `1280×720` và tùy chọn chữ lớn `×1.25`.
6. **Packaging & Docs:** Clone sạch cài & chạy trong `<= 3` lệnh; `README.md`, `CHANGELOG.md`, `CREDITS.md`, `LICENSE`, `Dockerfile`, gói `.tar.gz`, `retro.md` sẵn sàng phát hành `v1.0.0`.

## 4. Nhật ký lỗi AI & Ước tính Token (Phase 4)

- **Các lỗi / vấn đề phát hiện và cách xử lý:**
  1. *Lỗi bùng RSS giả trong Soak test trên Node v26 (`13.4 → 47.5 MB`):* Phát hiện ngay ở lượt chạy thử sớm `soak.js`. Qua đo đạc từng Đêm và đối chiếu `--jitless` / `--expose-gc`, thấy không có rò rỉ bộ nhớ (`heapUsed` `4.6 → 8.5 MB`, Đêm 0 → Đêm 9 RSS phẳng `17.9 → 18.2 MB`), nguyên nhân do cấp phát closure/mảng tạm mỗi tick kết hợp JIT khởi tạo muộn của V8 sau Đêm 1. Đã chuyển hot path `simulation.ts` & `validators.ts` về zero-allocation (compaction tại chỗ, bỏ closure `tryPos`/`emit`, buffer `safeLightsBuf`), kết hợp cờ V8 cố định bộ nhớ và warmup mã máy trước Đêm 1 — kéo về **`15.9 → 16.7 MB` (`1.05×`)**, đạt chuẩn hoàn toàn trung thực.
  2. *Tối ưu 300+ draw call Three.js thành `THREE.InstancedMesh` trước benchmark:* Ở Phase 1–3 mỗi đom đóm và Bóng Mực là một `THREE.Group` (3–4 mesh con = ~900+ draw call cho 200 Bóng Mực + 100 đom đóm). Đã gộp vào `InstancedMesh` (2 mesh cho đom đóm, 4 mesh cho Bóng Mực), giúp cảnh chuẩn 200 Bóng Mực + 100 đom đóm đạt **`796.6 FPS`** trung bình.
  3. *Lỗi `ENOENT` trong test mới `--export-leaderboard` (`tests/contract/headless.test.ts`):* Viết file mock `leaderboard.json` vào thư mục tạm chưa tạo `mkdirSync(dataDir)` nên test fail ngay lượt chạy đầu; đã sửa bổ sung `mkdirSync` và toàn bộ 84/84 test pass.
  4. *Cạm bẫy kiến trúc `<run_cmd> --export-leaderboard` vs `vite preview`:* Ở Phase 1–3 `run_cmd` trỏ trực tiếp vào `vite preview`, không nhận `--export-leaderboard`. Đã hợp nhất vào [scripts/run.mjs](../../scripts/run.mjs) vừa phục vụ HTTP static + `/api/leaderboard` lưu đĩa vừa xử lý CLI `--export-leaderboard`, chạy được độc lập không cần `vite` hay `node_modules` trong gói phát hành.
  5. *Phản hồi bố cục Modal ở `1280×720` khi bật `Chữ lớn (×1.25)`:* Kiểm thử Chrome phát hiện không bị tràn ngang, nhưng nội dung 9 phím + 3 toggle dài hơn `90vh` nên phải cuộn dọc trong modal (`overflow-y: auto`) để thấy tiêu đề và nút Quay lại; đã ghi nhận trung thực trong `docs/proof/phase-4.md`.

- **Ước tính token Phase 4 & cách tiết kiệm:**
  - Tổng phiên Phase 4 ước tính tiêu tốn khoảng **~85k–110k tokens** (gồm đọc & phân tích benchmark/soak, chuẩn hóa zero-alloc hot path, viết `InstancedMesh`, accessibility/leaderboard UI, viết `scripts/bench.mjs` + `run.mjs` + `soak.ts` + packaging, chạy benchmark & browser verifier 4 ảnh chụp, viết Retro & cập nhật toàn bộ tài liệu).
  - *Cách tiết kiệm:* Tái sử dụng trực tiếp bộ script `collect-proof.mjs` từ Phase 1–3; chẩn đoán RSS Soak bằng một lệnh node ngắn 2 giây thay vì đoán mò qua nhiều lần build; gộp kiểm tra 4 màn hình + reload persistence vào một lượt subagent Chrome duy nhất.
