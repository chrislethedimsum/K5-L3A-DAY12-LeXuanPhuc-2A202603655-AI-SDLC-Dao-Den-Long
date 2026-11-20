# Đảo Đèn Lồng — Ba hòn đảo (Phase 2)

Game 3D góc nhìn thứ ba viết bằng **TypeScript + Three.js + Node.js**, tách hoàn toàn lõi mô phỏng 60Hz tất định (`src/core/`) khỏi phần hiển thị 3D (`src/client/`) để chạy chung một logic cho cả chiến dịch **3 Đêm (Đảo Bến · Đảo Cau · Đảo Chuông)** và chế độ headless theo **Test Contract v1.1**.

## Cài đặt và chạy game (tối đa 3 lệnh)

Yêu cầu **Node.js 22+** (chạy trên macOS và Linux):

```sh
npm ci
npm run build
npm run preview -- --port 4173 --host
```

Mở địa chỉ Local hiển thị trên terminal (thường là `http://localhost:4173`) bằng trình duyệt hỗ trợ WebGL.

## Điều khiển & Tính năng Phase 2

- **Di chuyển:** `WASD` hoặc phím mũi tên (theo hướng camera)
- **Xoay camera:** Giữ và kéo chuột trái trên màn hình game (chỉnh độ nhạy & âm lượng trong **Cài đặt**, tự động lưu `localStorage`)
- **Nhảy:** `Space` (`7.0 m/s`, trọng lực `-20 m/s²`)
- **Lướt (mới):** `Shift` hoặc `L` (`14 m/s` trong `0.2 s`, hồi chiêu `1.5 s`, giữ nguyên độ cao khi lướt trên không)
- **Nạp đèn:** `E` (hoặc nút trên HUD) khi đứng trong `2.0 m` quanh đèn chưa sáng
- **Tỏa Sáng:** `Q` (hoặc nút trên HUD) — tốn `3` đom đóm, bán kính 3D `5.0 m` từ `y + 0.8 m`, đẩy lùi `4 m` trong `15` tick đầu, làm choáng `2.0 s` (`120` tick), hồi chiêu `3.0 s`
- **Tạm dừng:** `Esc` hoặc `P` (dừng toàn bộ mô phỏng, cho phép Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu)

### Ba Đêm, Kẻ địch & Cách tính điểm (`game.contract.json` v1.1)
- **Đêm 1 — Đảo Bến (`300s`):** Đảo tròn `40 m`, `5` đèn (`L1..L5`). Rơi khỏi đảo (`Y < -10`) mất `1` Ngọn Lửa, mất toàn bộ đom đóm và hồi sinh sau `60` tick.
- **Đêm 2 — Đảo Cau (`330s`):** Hai đảo `28 m` nối bằng cầu tre + `2` bục nhảy + `Bùa Gió` (`C1`, chạy `7.2 m/s` và Lướt `0` hồi chiêu trong `600` tick) + `Gió Lạc` (cướp tối đa `3` đom đóm khi mang `>= 5`) + `6` đèn (`L1..L6`).
- **Đêm 3 — Đảo Chuông (`360s`):** Đảo `45 m` gồm `3` tầng (`Y=0/3/6`), `2` dốc `30°`/`150°`, bục nhảy lên tầng 2, Tháp chuông, gió mạnh định kỳ mỗi `30 s`, `2` Bùa Gió + Gió Lạc + `7` đèn (`L1..L7`). Thắng Đêm 3 mở màn hình **Bình Minh**.
- **Thông số & Điểm chuẩn hóa:** Sức chứa `10` đom đóm, chi phí thắp đèn `10` đom đóm, vùng an toàn đèn sáng `6.0 m`. Cộng `+10` mỗi đom đóm **nạp vào đèn**, `+100` mỗi đèn thắp, `+5` mỗi Bóng Mực trúng Tỏa Sáng; khi thắng cộng `floor(time_left_s) × 2 + flames × 50`. Tổng điểm chiến dịch cộng dồn các Đêm đã thắng.

## Chạy Test & Chế độ Headless (Test Contract v1.1)

```sh
npm run verify
node scripts/collect-proof.mjs
```

Chạy riêng CLI headless (`--night 1 | 2 | 3`):

```sh
npm run build:headless
node dist-headless/src/headless/cli.js --seed 42 --night 1 --ticks 1200 --out trace.jsonl
node dist-headless/src/headless/cli.js --seed 42 --night 3 --scenario tests/fixtures/night3-terrain.json --inputs tests/fixtures/night3-terrain-inputs.json --ticks 120 --out night3.jsonl
```

## Tài liệu & Bằng chứng
- Hợp đồng kiểm thử v1.1: [game.contract.json](game.contract.json)
- Spec, tiêu chí nghiệm thu, thay đổi từ Phase 1 & nhật ký AI/token: [docs/notes/phase-2.md](docs/notes/phase-2.md)
- Bảng truy vết bằng chứng & kết quả đo đạc Phase 2: [docs/proof/phase-2.md](docs/proof/phase-2.md)
- Tài liệu Phase 1: [docs/notes/phase-1.md](docs/notes/phase-1.md), [docs/proof/phase-1.md](docs/proof/phase-1.md)
- Harness AI: [AGENTS.md](AGENTS.md) và [.agents/skills/verify-phase/SKILL.md](.agents/skills/verify-phase/SKILL.md)
