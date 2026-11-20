# Đảo Đèn Lồng — Đêm 1: Đảo Bến (Phase 1)

Game 3D góc nhìn thứ ba viết bằng **TypeScript + Three.js + Node.js**, tách hoàn toàn lõi mô phỏng tất định (`src/core/`) khỏi phần hiển thị 3D (`src/client/`) để chạy chung một logic cho cả bản chơi trình duyệt và chế độ headless theo **Test Contract v1.0**.

## Cài đặt và chạy game (tối đa 3 lệnh)

Yêu cầu **Node.js 22+** (hoạt động trên macOS và Linux):

```sh
npm ci
npm run build
npm run preview -- --port 4173 --host
```

Mở đường dẫn Local hiển thị trên terminal (thường là `http://localhost:4173`) bằng trình duyệt hỗ trợ WebGL.

## Điều khiển & Luật chơi

- **Di chuyển:** `WASD` hoặc phím mũi tên (theo hướng camera hiện tại)
- **Xoay camera:** Giữ và kéo chuột trái trên màn hình game
- **Nhảy:** `Space`
- **Nạp ánh sáng vào đèn:** `E` (hoặc bấm nút `E · Nạp đèn` trên HUD) khi đứng trong bán kính `2.5m` quanh đèn chưa thắp
- **Tỏa sáng (xua Bóng Mực):** `Q` hoặc `Shift` (hoặc bấm nút `Q · Tỏa sáng` trên HUD) — tốn `2` đom đóm, bán kính `6m`, đẩy lùi `4m`, làm choáng `2.5s`, hồi chiêu `3s`
- **Tạm dừng / Chơi lại:** `Esc` hoặc nút `Tạm dừng`; khi thắng/thua nhấn `Chơi lại`

### Thông số & Cách tính điểm (`game.contract.json`)
- Túi chứa tối đa `5` đom đóm; nhặt tự động trong bán kính `1.5m`.
- Có `5` Đèn Lồng Lớn (`L1`..`L5`), mỗi đèn cần `3` đom đóm để thắp sáng. Đèn đã thắp tạo vùng an toàn bán kính `5m` chặn Bóng Mực.
- Thời lượng Đêm 1: `180s`; Mây có `3` máu (`flames`), bị Bóng Mực chạm mất `1` lửa, rơi `floor(carried * 0.5)` đom đóm và bất tử `1.5s`.
- **Điểm số:** `+10` mỗi đom đóm nhặt được, `+100` mỗi đèn thắp sáng, `+25` mỗi Bóng Mực bị làm choáng. Khi thắng (`all_lit`), cộng thêm `floor(time_left_s) * 5` và `flames * 50`.

## Chạy Test & Chế độ Headless (Test Contract v1.0)

```sh
npm run verify
node scripts/collect-proof.mjs
```

Chạy riêng CLI headless (đầu ra JSONL đúng chuẩn Test Contract v1.0):

```sh
npm run build:headless
node dist-headless/src/headless/cli.js --seed 42 --night 1 --ticks 1200 --out trace.jsonl
node dist-headless/src/headless/cli.js --seed 42 --night 1 --scenario tests/fixtures/win.json --inputs tests/fixtures/win-inputs.json --ticks 120 --out win.jsonl
```

## Tài liệu & Bằng chứng Phase 1
- Hợp đồng kiểm thử: [game.contract.json](game.contract.json)
- Giả định, tiêu chí nghiệm thu & nhật ký AI/token: [docs/notes/phase-1.md](docs/notes/phase-1.md)
- Bảng truy vết yêu cầu & bằng chứng kiểm chứng: [docs/proof/phase-1.md](docs/proof/phase-1.md)
- Harness AI: [AGENTS.md](AGENTS.md) và [.agents/skills/verify-phase/SKILL.md](.agents/skills/verify-phase/SKILL.md)
