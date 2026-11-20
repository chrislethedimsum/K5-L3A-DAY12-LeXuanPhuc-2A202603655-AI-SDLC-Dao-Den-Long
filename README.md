# Đảo Đèn Lồng — Đèn cạn dầu (Phase 3)

Game 3D góc nhìn thứ ba viết bằng **TypeScript + Three.js + Node.js**, tách hoàn toàn lõi mô phỏng 60Hz tất định (`src/core/`) khỏi phần hiển thị 3D (`src/client/`). Từ Phase 3 (**Ticket-03 · Contract v1.2**), mục tiêu chuyển sang **giữ đảo sáng tới bình minh** với cơ chế nhiên liệu đèn, Bóng Mực hút dầu (`drain`), sức chứa tăng dần và chế độ dễ phân biệt (mù màu).

## Cài đặt và chạy game (tối đa 3 lệnh)

Yêu cầu **Node.js 22+** (macOS hoặc Linux):

```sh
npm ci
npm run build
npm run preview -- --port 4173 --host
```

Mở đường dẫn Local hiển thị trên terminal (thường là `http://localhost:4173`) bằng trình duyệt hỗ trợ WebGL.

## Điều khiển & Luật chơi Phase 3 (Contract v1.2)

- **Di chuyển:** `WASD` hoặc phím mũi tên (xoay camera bằng giữ kéo chuột trái)
- **Nhảy / Lướt:** `Space` (`7.0 m/s`, `-20 m/s²`) · `Shift`/`L` (`14 m/s` trong `0.2 s`, hồi `1.5 s`)
- **Nạp / Thắp lại / Châm dầu (`E`):**
  - Đèn chưa từng thắp: cần `10` đom đóm; thắp lại đèn đã tắt (`ever_lit`): cần `5` đom đóm.
  - Đèn đang sáng chưa đầy dầu: châm `used = min(carried, ceil((100 - fuel) / 10))` (`+10` fuel/đom đóm); đèn đầy dầu (`100`) bị bỏ qua.
- **Tỏa Sáng (`Q`):** tốn `3` đom đóm, bán kính 3D `5 m` từ `y + 0.8 m`, đẩy `4 m` trong `15` tick đầu, choáng `120` tick, hồi `3 s`.
- **Tạm dừng & Cài đặt (`Esc`/`P`):** dừng mô phỏng; chỉnh âm lượng, độ nhạy chuột và bật/tắt **"Bảng màu dễ phân biệt"** (lưu tự động qua `localStorage`).

### Cơ chế cốt lõi & Điểm số (`game.contract.json` v1.2)
- **Nhiên liệu đèn (`0..100`):** Hao `1.0/s` (tính theo `1/60` nguyên); khi `<= 0` đèn tắt (`lantern_out`), `deposited = 0`. Đèn có `fuel < 30` mất vùng an toàn `6 m`, nhấp nháy `1 Hz` và thu hút Bóng Mực `wander` lại hút `5 fuel/s` (`drain`).
- **Luật thắng mới (`dawn_survived`):** Không còn thắng sớm. Sống hết Đêm (`240 / 270 / 300 s`) và giữ sáng ít nhất `ceil(0.6 × tổng đèn)` (`3/5` Đêm 1, `4/6` Đêm 2, `5/7` Đêm 3).
- **Sức chứa tăng dần:** `10 + 2 × successful_lights` (tối đa `20`, đặt lại mỗi Đêm).
- **Điểm chuẩn hóa:** `+5` mỗi đom đóm nạp/châm · `+100` thắp lần đầu · `+40` thắp lại · `+15` Tỏa Sáng trúng Bóng Mực đang `drain` (`+5` thường) · thắng bình minh thưởng `50 + floor(fuel)` mỗi đèn sáng + `50 × flames`.
- **Chế độ mù màu:** Đổi viền/mắt Bóng Mực sang `#00B3FF`, cảnh báo `#FFFFFF` kèm `⚠`; đèn tắt xẹp `20%` kèm vết rách phân biệt không cần màu.

## Chạy Test & Chế độ Headless (Contract v1.2)

```sh
npm run verify
node scripts/collect-proof.mjs
```

Chạy riêng CLI headless (`--night 1 | 2 | 3`):

```sh
npm run build:headless
node dist-headless/src/headless/cli.js --seed 42 --night 1 --ticks 1200 --out trace.jsonl
node dist-headless/src/headless/cli.js --seed 42 --night 1 --scenario tests/fixtures/shade-drain.json --inputs tests/fixtures/shade-drain-inputs.json --ticks 120 --out drain.jsonl
```

## Tài liệu & Kiến trúc
- Hợp đồng kiểm thử v1.2: [game.contract.json](game.contract.json)
- Ghi chú quyết định kiến trúc: [docs/adr/001-lantern-fuel-and-dawn-survival.md](docs/adr/001-lantern-fuel-and-dawn-survival.md)
- Changelog các thay đổi phá vỡ tương thích: [CHANGELOG.md](CHANGELOG.md)
- Spec, lý do cập nhật test cũ & nhật ký AI/token: [docs/notes/phase-3.md](docs/notes/phase-3.md)
- Bảng truy vết bằng chứng Phase 3: [docs/proof/phase-3.md](docs/proof/phase-3.md)
- Harness AI: [AGENTS.md](AGENTS.md) và [.agents/skills/verify-phase/SKILL.md](.agents/skills/verify-phase/SKILL.md)
