# ADR 001: Mô hình nhiên liệu đèn (`fuel60`) và luật thắng sống sót tới bình minh (Phase 3)

- **Trạng thái:** Chấp thuận (Phase 3 · Ticket-03 · Contract v1.2)
- **Bối cảnh:** Ở Phase 1–2, đèn đã thắp sáng vĩnh viễn và ván chơi kết thúc ngay khi đủ 100% đèn (`all_lit`), khiến cuối Đêm thiếu áp lực bảo vệ ánh sáng. Ticket-03 đổi mục tiêu cốt lõi từ "thắp hết đèn sớm" sang **"giữ đảo sáng tới bình minh"**.

## Quyết định thiết kế

1. **Biểu diễn nhiên liệu bằng số nguyên `fuel60` (`0..6000` tương ứng `1/60` đơn vị fuel):**
   - Mỗi tick đang sáng trừ đúng `1` đơn vị (`1.0/s`), mỗi Bóng Mực ở trạng thái `drain` trừ `5` đơn vị (`5.0/s`), châm `used` đom đóm cộng `used * 600` (`10` fuel/đom đóm, trần `6000`).
   - *Lý do:* Tránh sai số dấu phẩy động khi cộng/trừ `1/60` qua hàng chục nghìn tick và đảm bảo ranh giới `fuel >= 30` (`fuel60 >= 1800`) cũng như `fuel <= 0` (`lantern_out`) hoàn toàn chính xác, tất định giữa các máy chấm. Chỉ chia `60` và làm tròn `1` chữ số thập phân khi xuất Snapshot/Event.

2. **Mô hình vòng đời đèn 3 trạng thái logic (`unlit` / `lit` / `relit` qua `everLit`):**
   - Đèn chưa từng thắp (`everLit = false`): cần `10` đom đóm; khi thắp `+100` điểm (`relight: false`).
   - Đèn đang sáng (`lit = true`): cho phép châm dầu khi `fuel60 < 6000`, bỏ qua hoàn toàn khi đầy dầu (`fuel60 === 6000`); nếu `fuel60 <= 0` ngay sau bước trừ dầu → tắt (`lit = false`, `deposited = 0`, `everLit = true`), phát `lantern_out`.
   - Đèn tắt nhưng `everLit = true`: thắp lại chỉ cần `5` đom đóm, tăng `relitCount` và thưởng `+40` điểm (`relight: true`). Cả thắp mới lẫn thắp lại đều tăng `successfulLights` giúp sức chứa Mây tăng `10 + 2 * successfulLights` (tối đa `20`).

3. **Vùng an toàn phụ thuộc nhiên liệu & Trạng thái `drain` của Bóng Mực:**
   - Chỉ đèn sáng có `fuel60 >= 1800` (`fuel >= 30`) mới tạo vùng an toàn `6m`. Đèn yếu (`fuel60 < 1800`) mất vùng an toàn và thu hút Bóng Mực đang `wander` lại hút dầu (`drain`, `<= 2m`), tạo vòng lặp risk-reward rõ rệt (phát `fuel_drain` mỗi 60 tick; Tỏa Sáng trúng con đang `drain` thưởng tổng `+15` điểm).

4. **Luật thắng `dawn_survived` thay thế `all_lit`:**
   - Thắp đủ đèn không kết thúc sớm. Chỉ kết thúc khi hết Ngọn Lửa (`no_flames`, ưu tiên cao nhất kể cả ở tick cuối) hoặc hết giờ Đêm (`240/270/300s`): đạt `litCount >= ceil(0.6 * totalLanterns)` → `won / dawn_survived` kèm thưởng `50 + floor(fuel)` mỗi đèn sáng + `50 * flames`; thiếu ngưỡng → `lost / dawn`.
