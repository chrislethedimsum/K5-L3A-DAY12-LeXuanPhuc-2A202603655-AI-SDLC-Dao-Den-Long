# Phase 3 — Spec, Acceptance Criteria & Thay đổi từ Phase 1–2

## 1. Nguồn yêu cầu
Đối chiếu trực tiếp từ **Ticket-03 — CHANGE REQUEST "Đèn cạn dầu" (Phase 3 · Contract v1.2)** trên Lab board (`#p3`). Quy tắc kiến trúc ghi tại [ADR 001](../adr/001-lantern-fuel-and-dawn-survival.md) và breaking changes tại [CHANGELOG.md](../../CHANGELOG.md).

## 2. Bảng các luật & test Phase 1–2 bị [THAY THẾ] bởi Ticket-03

| Quy tắc cũ (Phase 1–2) | Luật mới Ticket-03 (Contract v1.2) | Ảnh hưởng tới test cũ |
|---|---|---|
| Đèn sáng giữ nguyên vĩnh viễn (`lit: true`) | Đèn sáng có `fuel = 100`, hao `1.0/s`, tắt khi `fuel <= 0` (`lantern_out`), thắp lại tốn `5` đom đóm | Các test giữ đèn sáng lâu hoặc check `relight` được cập nhật thêm `fuel` / `relight_cost` |
| Đèn sáng không nhận tương tác | Bấm Tương tác trên đèn sáng chưa đầy dầu châm `used = min(carried, ceil((100 - fuel)/10))`; đầy dầu bị bỏ qua | Test tương tác đèn sáng cập nhật để kiểm tra `refuel` và bỏ qua khi `fuel == 100` |
| Mọi đèn sáng luôn tạo vùng an toàn `6 m` | Chỉ đèn sáng có `fuel >= 30` tạo vùng an toàn; `< 30` thu hút Bóng Mực `wander` vào trạng thái `drain` (`5 fuel/s`) | Các test safe-zone cập nhật phân biệt `fuel >= 30` vs `< 30` và thêm test đẩy Shade khi châm dầu lên `>= 30` |
| Thắng ngay khi thắp hết đèn (`all_lit`) | Không thắng sớm; thắng (`dawn_survived`) khi sống hết giờ `240/270/300s` và có `>= ceil(0.6 * total)` đèn sáng (`3/5`, `4/6`, `5/7`) | Cập nhật `win` fixture + các test kết thúc thắng từ `all_lit` sang `dawn_survived` |
| Điểm: `+10/mote`, `+100` thắp đèn, `+5` stun, `+floor(t)*2` | Điểm: `+5/mote`, `+100` lần đầu, `+40` thắp lại, `+15` stun con đang `drain` (`+5` thường), bình minh thắng `+50 + floor(fuel)` mỗi đèn sáng + `50*flames`, bỏ thưởng thời gian | Cập nhật toàn bộ assertion điểm ở `simulation.test.ts` và `smoke.mjs` kèm chú thích Ticket-03 |
| Sức chứa cố định `10` | Sức chứa `min(20, 10 + 2 * successful_lights)` mỗi Đêm (scenario đặt sẵn đèn không tính) | Bổ sung kiểm tra `player.capacity` trong snapshot và test tăng sức chứa |

## 3. Acceptance Criteria — Ticket-03
1. **Nhiên liệu & Độ chính xác (`fuel60`):** Tính nội bộ bằng `1/60` nguyên (`0..6000`); xuất 1 chữ số thập phân (`0` khi tắt); đầy dầu không phát `refuel` và không cộng điểm; tắt đèn phát `lantern_out`, đặt `deposited = 0`, giữ `ever_lit = true`.
2. **Bóng Mực hút dầu (`drain`):** Chỉ `wander` chọn đèn sáng `fuel < 30` gần nhất (tie id nhỏ hơn); đứng `<= 2m` hút `5/s` (cộng dồn nhiều con), phát `fuel_drain` mỗi 60 tick; chuyển `chase` khi Mây vào `<= 6m`, `stunned` khi trúng Tỏa Sáng (`+15` điểm), `wander` nếu đèn tắt/được châm `>= 30`/xa `> 2m`. Châm lên `>= 30` đẩy Shade trong `6m` ra trong `<= 30` tick không gây sát thương.
3. **Luật thắng `dawn_survived`:** Thời lượng `240/270/300s`; không kết thúc sớm khi đủ đèn; `no_flames` luôn ưu tiên trước kể cả ở tick cuối; sống hết giờ và đủ `ceil(0.6 * total)` đèn → `dawn_survived`, ngược lại → `dawn`.
4. **Sức chứa tăng dần:** `10 + 2 * successful_lights`, trần `20`, reset đầu mỗi Đêm, hiển thị `carried / capacity`.
5. **Điểm mới:** Đúng bảng điểm mục 5; tổng điểm chiến dịch cộng dồn qua các Đêm thắng.
6. **Chế độ mù màu & Phân biệt không cần màu:** Cài đặt `"Bảng màu dễ phân biệt"` lưu `localStorage`, đổi viền/mắt Bóng Mực sang `#00B3FF`, cảnh báo `#FFFFFF` kèm `⚠`. Đèn tắt xẹp 20% + vết rách; đèn yếu `< 30` nhấp nháy `1 Hz`.

## 4. Nhật ký sử dụng AI, Lỗi phát hiện & Token

- **Các lỗi đã phát hiện & cách khắc phục:**
  1. *Lỗi tham chiếu biến `T` thay vì `t` trong `src/client/hud.ts`:* Khi thêm kiểm tra `fuel_max` và `low_fuel_threshold` vào prompt `E` và mũi tên ưu tiên đèn yếu, viết nhầm `T.fuel_max`; phát hiện ngay ở `tsc --noEmit` của `npm run verify` và sửa về `t.fuel_max` / `t.low_fuel_threshold`.
  2. *Chi tiết hành vi hao nhiên liệu tick 1 khi test châm dầu (`L1` full):* Khi `L1` bắt đầu ở `fuel: 100` (`6000`), bước 2 của tick 1 giảm `L1` xuống `5999/60` (`99.983`), khiến `ceil((100 - fuel)/10) = 1` ở bước 5 và làm `L1` vẫn nhận 1 đom đóm nếu đứng ngay tại `(0,0,0)`. Đã tách test trong `tests/unit/phase3.test.ts` và `tests/fixtures/refuel.json` để kiểm chứng rõ ràng công thức `ceil((100 - fuel)/10)` và hành vi đẩy Bóng Mực khi châm lên `>= 30`.
  3. *Giới hạn `evaluate_script` khi kiểm thử trình duyệt Phase 3:* Trong phiên kiểm thử Chrome `1280×720`, lệnh `evaluate_script` chờ quyền người dùng nên không đọc trực tiếp được `window.__DDL_FPS__`; đã ghi nhận trung thực trong `docs/proof/phase-3.md` thay vì suy đoán số FPS, đồng thời xác nhận trực quan qua ảnh chụp màn hình, DevTools Performance trace (`CLS: 0.00`) và 0 lỗi WebGL/JS.
- **Ước tính token & cách tiết kiệm:**
  - Phiên Phase 3 ước tính tiêu tốn khoảng **~55k–70k tokens** (ngắn hơn Phase 2 nhờ kiến trúc `src/core/` và `collect-proof.mjs` đã chuẩn hóa từ trước).
  - *Cách tiết kiệm:* Giữ nguyên khung `maps.ts` & `simulation.ts`, dùng số nguyên `fuel60` sạch lỗi số thực ngay từ lần viết đầu tiên, gom toàn bộ kiểm chứng headless qua `collect-proof.mjs` chạy trong một lượt duy nhất.
