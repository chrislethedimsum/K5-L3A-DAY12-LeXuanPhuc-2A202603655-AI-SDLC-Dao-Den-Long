# Changelog

## [0.3.0] — Phase 3: "Đèn cạn dầu" (Contract v1.2)
### Breaking Changes (Thay thế quy tắc cũ từ Phase 1–2)
- **Nhiên liệu đèn (`fuel` 0–100):** Đèn sáng hao `1.0/s`; tự tắt (`lantern_out`, `deposited = 0`, giữ `ever_lit = true`) khi `fuel <= 0`. Bấm Tương tác trên đèn sáng chưa đầy dầu sẽ châm `min(carried, ceil((100 - fuel)/10))` (`+10` fuel/đom đóm); đèn đầy dầu bị bỏ qua. Đèn đã tắt sau khi từng sáng chỉ cần `5` đom đóm để thắp lại.
- **Vùng an toàn & Bóng Mực `drain`:** Đèn có `fuel < 30` mất vùng an toàn `6 m`. Bóng Mực đang `wander` ưu tiên tiến tới đèn sáng có `fuel < 30` gần nhất để hút `5 fuel/s` (`drain`).
- **Luật thắng & Thời lượng Đêm:** Bỏ thắng sớm `all_lit`. Thời lượng Đêm 1/2/3 đổi thành `240 / 270 / 300 s`. Thắng (`dawn_survived`) khi sống hết giờ và có ít nhất `ceil(0.6 × tổng đèn)` đèn đang sáng (`3/5`, `4/6`, `5/7`).
- **Điểm số:** Đổi `+10` → **`+5`** mỗi đom đóm nạp; thắp lại `+40`; Tỏa Sáng trúng con đang `drain` tổng **`+15`**; bình minh thắng thưởng `50 + floor(fuel)` mỗi đèn sáng + `50 × flames`; **bỏ thưởng thời gian**.
- **Contract v1.2 Schema:** `player` thêm `capacity`; `lanterns[]` thêm `fuel`, `ever_lit`, `relit_count`; `shades[]` thêm trạng thái `drain`; `lantern_lit` thêm `relight`; thêm sự kiện `refuel`, `lantern_out`, `fuel_drain`; thay `all_lit` bằng `dawn_survived`.

### Added
- **Sức chứa tăng dần:** `10 + 2 × successful_lights` (tối đa `20`), reset đầu mỗi Đêm.
- **Chế độ mù màu:** Cài đặt `"Bảng màu dễ phân biệt"` (lưu `localStorage`), đổi màu Bóng Mực sang `#00B3FF`, cảnh báo `#FFFFFF` kèm `⚠`, cùng phân biệt hình học đèn tắt (xẹp 20% + vết rách) và đèn yếu (nhấp nháy 1 Hz).

## [0.2.0] — Phase 2: "Ba hòn đảo" (Contract v1.1)
- Chuẩn hóa số liệu và thứ tự 12 bước/tick; thêm Lướt (Dash), rơi `Y < -10` + hồi sinh, 3 bản đồ chuẩn (Đảo Bến, Đảo Cau, Đảo Chuông), Gió Lạc (`Drifters`), Bùa Gió (`Charms`), Pause (`state: "paused"`), Web Audio, lưu Cài đặt, HUD đầy đủ và màn Bình Minh.

## [0.1.0] — Phase 1: "Đảo Đèn Lồng" (Contract v1.0)
- Phiên bản đầu tiên Đêm 1 Đảo Bến với mô phỏng 60Hz tách rời renderer Three.js và CLI headless.
