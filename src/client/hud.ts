import contract from '../core/contract';
import type { HudState, Snapshot } from '../core/types';

const t = contract.tuning;

export class HUD {
  private root = document.querySelector<HTMLDivElement>('#hud')!;
  private stats: HTMLElement;
  private hint: HTMLElement;
  private panel: HTMLElement;
  private title: HTMLElement;
  private description: HTMLElement;
  private start: HTMLButtonElement;
  private pulse: HTMLButtonElement;
  private deposit: HTMLButtonElement;
  private hasEnded = false;

  constructor(onStart: () => void, onPause: () => void, onPulse: () => void, onInteract: () => void) {
    this.root.innerHTML = `<header><div class="identity"><h1>Đảo Đèn Lồng</h1><span>Đêm 1 · Đảo Bến</span></div><button id="pause" aria-label="Tạm dừng trò chơi">Tạm dừng</button></header><section id="stats" aria-label="Trạng thái trò chơi"></section><p id="hint" role="status" aria-live="polite"></p><footer><p>WASD / ↑↓←→ di chuyển · Kéo chuột xoay góc nhìn<br>Space nhảy · E nạp đèn · Q / Shift tỏa sáng · Esc tạm dừng</p><div class="actions"><button id="deposit">E · Nạp đèn</button><button id="pulse">Q · Tỏa sáng</button></div></footer><div class="veil" id="panel"><section class="intro" role="dialog" aria-modal="true" aria-labelledby="panel-title"><div class="lantern-mark" aria-hidden="true">✧</div><h2 id="panel-title">Mang ánh sáng<br>về Đảo Bến.</h2><p id="description">Cùng Mây nhặt đom đóm, thắp sáng năm đèn lồng trước bình minh. Mỗi đèn cần ${t.lantern_cost} đom đóm. Ánh đèn đã thắp sẽ che chở bạn khỏi Bóng Mực.</p><p class="tip">Tỏa sáng đẩy lùi Bóng Mực, nhưng tiêu tốn ${t.pulse_cost} đom đóm. Hãy dành ánh sáng đúng lúc.</p><button id="start">Bắt đầu đêm hành trình</button></section></div>`;
    this.stats = this.root.querySelector('#stats')!;
    this.hint = this.root.querySelector('#hint')!;
    this.panel = this.root.querySelector('#panel')!;
    this.title = this.root.querySelector('#panel-title')!;
    this.description = this.root.querySelector('#description')!;
    this.start = this.root.querySelector('#start')!;
    this.pulse = this.root.querySelector('#pulse')!;
    this.deposit = this.root.querySelector('#deposit')!;
    this.start.onclick = onStart;
    this.root.querySelector<HTMLButtonElement>('#pause')!.onclick = onPause;
    this.pulse.onclick = onPulse;
    this.deposit.onclick = onInteract;
    this.start.focus();
  }

  hide(): void {
    this.panel.hidden = true;
    this.hasEnded = false;
  }

  pause(): void {
    this.title.textContent = 'Một nhịp nghỉ giữa đêm.';
    this.description.textContent = 'Thời gian đang dừng. Trở lại khi bạn sẵn sàng.';
    this.start.textContent = 'Tiếp tục hành trình';
    this.panel.hidden = false;
    this.start.focus();
  }

  update(s: Snapshot, hud: HudState): void {
    const p = s.player;
    const lit = s.lanterns.filter((l) => l.lit).length;
    const seconds = Math.ceil(s.time_left_s);

    this.stats.innerHTML = `<div><span>Ngọn lửa</span><strong aria-label="${p.flames} máu">${'●'.repeat(p.flames)}<i>${'○'.repeat(t.flames - p.flames)}</i></strong></div><div><span>Đom đóm</span><strong>${p.carried}<small> / ${t.carry_capacity}</small></strong></div><div><span>Đèn đã thắp</span><strong>${lit}<small> / ${s.lanterns.length}</small></strong></div><div><span>Trước bình minh</span><strong>${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}</strong></div><div><span>Điểm</span><strong>${s.score}</strong></div>`;

    const near = s.lanterns
      .filter((l) => !l.lit && Math.hypot(l.pos[0] - p.pos[0], l.pos[2] - p.pos[2]) <= t.interact_radius)
      .sort((a, b) => Math.hypot(a.pos[0] - p.pos[0], a.pos[2] - p.pos[2]) - Math.hypot(b.pos[0] - p.pos[0], b.pos[2] - p.pos[2]))[0];

    const msg = near
      ? `${near.id} · ${near.deposited}/${t.lantern_cost} đom đóm. ${p.carried ? 'Nhấn E để nạp ánh sáng.' : 'Hãy nhặt thêm đom đóm.'}`
      : p.carried === t.carry_capacity
        ? 'Túi ánh sáng đã đầy. Hãy tìm một đèn lồng chưa sáng.'
        : 'Nhặt đom đóm phát sáng quanh đảo. Đến gần đèn rồi nhấn E.';

    if (this.hint.textContent !== msg) this.hint.textContent = msg;

    this.deposit.disabled = !near || p.carried === 0 || s.state !== 'playing';
    this.pulse.disabled = p.carried < t.pulse_cost || hud.pulse_cooldown_left_s > 0 || s.state !== 'playing';
    this.pulse.textContent =
      hud.pulse_cooldown_left_s > 0
        ? `Hồi sáng ${hud.pulse_cooldown_left_s.toFixed(1)}s`
        : `Q · Tỏa sáng (${t.pulse_cost})`;

    if (s.state !== 'playing' && !this.hasEnded) {
      this.hasEnded = true;
      this.title.textContent = s.state === 'won' ? 'Đảo Bến đã bừng sáng.' : 'Ánh sáng sẽ trở lại.';
      this.description.textContent = `${
        s.state === 'won'
          ? 'Bạn đã dẫn ánh sáng về cả năm đèn lồng.'
          : hud.reason === 'dawn'
            ? 'Bình minh đã đến trước khi các đèn được thắp.'
            : 'Mây đã hết ngọn lửa. Dùng vùng sáng để tránh Bóng Mực nhé.'
      } Điểm của bạn: ${s.score}.`;
      this.start.textContent = 'Chơi lại';
      this.panel.hidden = false;
      this.start.focus();
    }
  }
}
