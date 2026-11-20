# Credits

- **Đề bài & Bối cảnh gốc:** Đảo Đèn Lồng (Mây, Đảo Bến, Đảo Cau, Đảo Chuông, Ông Đăng, Đom Đóm, Đèn Lồng Lớn, Bóng Mực, Gió Lạc, Bùa Gió) thuộc bài lab **Day 12 — AI SDLC**.
- **Đồ họa 3D & Hiệu ứng:** Toàn bộ mô hình 3D (Mây áo `#E8E2D0` & khăn `#C8102E`, 3 bản đồ Đêm 1–3, cầu tre, bục nhảy, tháp chuông, đèn lồng & vết rách, đom đóm & Bóng Mực qua `THREE.InstancedMesh`, Gió Lạc, Bùa Gió, lá bay báo gió, hạt tàn lửa và chuyển sắc bình minh) được dựng bằng hình học Three.js thuần trong `src/client/scene.ts`, không dùng asset 3D/texture bên ngoài.
- **Icon ứng dụng:** SVG nhúng trực tiếp (data URI) trong `index.html`.
- **Âm thanh:** Toàn bộ nhạc nền đêm và hiệu ứng âm thanh tổng hợp trực tiếp bằng Web Audio API trong `src/client/audio.ts`, không dùng file âm thanh ngoài.
- **Thư viện & Công cụ:**
  - `three` (MIT License)
  - `vite` (MIT License)
  - `typescript` (Apache-2.0 License)
  - `vitest` (MIT License)
  - `tsx` (MIT License)
  - Font hệ thống (`system-ui`, `Georgia`) không tải font ngoài.
- **Công cụ AI hỗ trợ:** Antigravity (Google DeepMind / Gemini) và Claude được sử dụng cho phân tích yêu cầu, lập kế hoạch, viết mã, đối chiếu hợp đồng kiểm thử, review và tổng hợp kiểm chứng dưới sự kiểm tra và nghiệm thu trực tiếp của tác giả (**LeXuanPhuc · 2A202603655**).
