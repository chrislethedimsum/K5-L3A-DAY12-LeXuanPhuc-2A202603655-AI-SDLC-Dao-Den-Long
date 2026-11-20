import contract from '../core/contract';
import { NIGHT_MAPS, type NightNumber } from '../core/maps';
import type { HudState, Pos3, Snapshot } from '../core/types';
import type { GameSettings } from './settings';
import type { ProjectedPoint } from './scene';

const t = contract.tuning;

export interface HUDCallbacks {
  onStartCampaign: (night: NightNumber) => void;
  onStartNight: () => void;
  onPause: () => void;
  onResume: () => void;
  onRestartNight: () => void;
  onNextNight: () => void;
  onBackToMenu: () => void;
  onSettingsChange: (s: GameSettings) => void;
  onDeposit: () => void;
  onPulse: () => void;
  onDash: () => void;
}

export class HUD {
  private root = document.querySelector<HTMLDivElement>('#hud')!;
  private flamesEl: HTMLElement;
  private timerEl: HTMLElement;
  private lanternsEl: HTMLElement;
  private scoreEl: HTMLElement;
  private moteSlotsEl: HTMLElement;
  private promptEl: HTMLElement;
  private charmBannerEl: HTMLElement;
  private windBannerEl: HTMLElement;
  private arrowEl: HTMLElement;
  private depositBtn: HTMLButtonElement;
  private pulseBtn: HTMLButtonElement;
  private dashBtn: HTMLButtonElement;
  private modalVeil: HTMLElement;
  private modalTitle: HTMLElement;
  private modalSub: HTMLElement;
  private modalBody: HTMLElement;
  private modalExtra: HTMLElement;
  private modalActions: HTMLElement;
  private settings: GameSettings;
  private cb: HUDCallbacks;

  constructor(initialSettings: GameSettings, cb: HUDCallbacks) {
    this.settings = { ...initialSettings };
    this.cb = cb;

    this.root.innerHTML = `
      <div class="top-bar">
        <div class="hud-box flames-box">
          <span class="label">Ngọn Lửa</span>
          <div class="flames-dots" id="flames">●●●</div>
        </div>
        <div class="hud-box timer-box">
          <span class="label" id="night-label">Đêm 1 · Đảo Bến</span>
          <div class="timer-value" id="timer">05:00</div>
        </div>
        <div class="hud-box right-box">
          <div class="metric">
            <span class="label">Đèn lồng</span>
            <strong id="lanterns">0/5</strong>
          </div>
          <div class="metric score">
            <span class="label">Điểm</span>
            <strong id="score">0</strong>
          </div>
          <button id="pause-btn" aria-label="Tạm dừng">Tạm dừng</button>
        </div>
      </div>

      <div class="center-alerts">
        <div class="banner charm" id="charm-banner" hidden>Bùa Gió: 10.0s</div>
        <div class="banner wind" id="wind-banner" hidden>Cảnh báo gió mạnh!</div>
        <div class="banner prompt" id="deposit-prompt" hidden>E — Nạp ánh sáng (0/10)</div>
      </div>

      <div class="bottom-bar">
        <div class="controls-hint">
          WASD / ↑↓←→ di chuyển · Kéo chuột xoay<br>
          Space nhảy · Shift lướt · E nạp đèn · Q tỏa sáng · Esc/P tạm dừng
        </div>
        <div class="hud-box mote-bar-wrap">
          <span class="label" id="mote-label">Đom đóm (0/10)</span>
          <div class="mote-slots" id="mote-slots"></div>
        </div>
        <div class="skills-box">
          <button class="skill-btn" id="deposit-btn">E · Nạp đèn</button>
          <button class="skill-btn" id="dash-btn">Shift · Lướt</button>
          <button class="skill-btn" id="pulse-btn">Q · Tỏa sáng (3)</button>
        </div>
      </div>

      <div id="lantern-arrow" hidden>➤</div>

      <div class="veil" id="modal-veil">
        <section class="modal" role="dialog" aria-modal="true">
          <div class="subtitle" id="modal-sub"></div>
          <h2 id="modal-title"></h2>
          <p id="modal-body"></p>
          <div id="modal-extra"></div>
          <div class="modal-actions" id="modal-actions"></div>
        </section>
      </div>
    `;

    this.flamesEl = this.root.querySelector('#flames')!;
    this.timerEl = this.root.querySelector('#timer')!;
    this.lanternsEl = this.root.querySelector('#lanterns')!;
    this.scoreEl = this.root.querySelector('#score')!;
    this.moteSlotsEl = this.root.querySelector('#mote-slots')!;
    this.promptEl = this.root.querySelector('#deposit-prompt')!;
    this.charmBannerEl = this.root.querySelector('#charm-banner')!;
    this.windBannerEl = this.root.querySelector('#wind-banner')!;
    this.arrowEl = this.root.querySelector('#lantern-arrow')!;
    this.depositBtn = this.root.querySelector('#deposit-btn')!;
    this.pulseBtn = this.root.querySelector('#pulse-btn')!;
    this.dashBtn = this.root.querySelector('#dash-btn')!;
    this.modalVeil = this.root.querySelector('#modal-veil')!;
    this.modalTitle = this.root.querySelector('#modal-title')!;
    this.modalSub = this.root.querySelector('#modal-sub')!;
    this.modalBody = this.root.querySelector('#modal-body')!;
    this.modalExtra = this.root.querySelector('#modal-extra')!;
    this.modalActions = this.root.querySelector('#modal-actions')!;

    for (let i = 0; i < t.carry_capacity; i++) {
      const slot = document.createElement('div');
      slot.className = 'mote-slot';
      this.moteSlotsEl.appendChild(slot);
    }

    this.root.querySelector<HTMLButtonElement>('#pause-btn')!.onclick = () => this.cb.onPause();
    this.depositBtn.onclick = () => this.cb.onDeposit();
    this.pulseBtn.onclick = () => this.cb.onPulse();
    this.dashBtn.onclick = () => this.cb.onDash();
  }

  private showModal(sub: string, title: string, body: string, buttons: { label: string; primary?: boolean; onClick: () => void }[], extraEl?: HTMLElement): void {
    this.modalSub.textContent = sub;
    this.modalTitle.textContent = title;
    this.modalBody.textContent = body;
    this.modalExtra.innerHTML = '';
    if (extraEl) this.modalExtra.appendChild(extraEl);
    this.modalActions.innerHTML = '';
    buttons.forEach((b, idx) => {
      const btn = document.createElement('button');
      btn.textContent = b.label;
      if (b.primary) btn.className = 'primary';
      btn.onclick = b.onClick;
      this.modalActions.appendChild(btn);
      if (idx === 0) btn.focus();
    });
    this.modalVeil.hidden = false;
  }

  hideModal(): void {
    this.modalVeil.hidden = true;
  }

  showMainMenu(): void {
    const extra = document.createElement('div');
    extra.className = 'night-picks';
    for (const n of [1, 2, 3] as NightNumber[]) {
      const btn = document.createElement('button');
      btn.textContent = `Đêm ${n}: ${NIGHT_MAPS[n].name}`;
      btn.onclick = () => this.cb.onStartCampaign(n);
      extra.appendChild(btn);
    }
    this.showModal(
      'Day 12 · AI SDLC',
      'Đảo Đèn Lồng',
      'Đồng hành cùng Mây qua 3 đêm — Đảo Bến, Đảo Cau, Đảo Chuông — thu thập đom đóm, né Bóng Mực và Gió Lạc để thắp sáng biển mây.',
      [
        { label: 'Bắt đầu hành trình (Đêm 1 → 3)', primary: true, onClick: () => this.cb.onStartCampaign(1) },
        { label: 'Cài đặt', onClick: () => this.showSettings(() => this.showMainMenu()) }
      ],
      extra
    );
  }

  showNightIntro(night: NightNumber, totalScore: number): void {
    const m = NIGHT_MAPS[night];
    this.showModal(
      `${m.subtitle} · Điểm tích lũy: ${totalScore}`,
      m.name,
      m.elderLine,
      [
        { label: `Bắt đầu Đêm ${night}`, primary: true, onClick: () => this.cb.onStartNight() },
        { label: 'Về menu', onClick: () => this.cb.onBackToMenu() }
      ]
    );
  }

  showPause(): void {
    this.showModal(
      'Tạm dừng',
      'Một nhịp nghỉ giữa đêm',
      'Đồng hồ, hồi chiêu và mọi thực thể đã được giữ nguyên trạng thái.',
      [
        { label: 'Tiếp tục', primary: true, onClick: () => this.cb.onResume() },
        { label: 'Chơi lại Đêm', onClick: () => this.cb.onRestartNight() },
        { label: 'Cài đặt', onClick: () => this.showSettings(() => this.showPause()) },
        { label: 'Về menu', onClick: () => this.cb.onBackToMenu() }
      ]
    );
  }

  showSettings(onClose: () => void): void {
    const box = document.createElement('div');
    box.innerHTML = `
      <label class="setting-row">
        <span>Âm lượng: <strong id="vol-val">${Math.round(this.settings.volume * 100)}%</strong></span>
        <input id="vol-slider" type="range" min="0" max="1" step="0.05" value="${this.settings.volume}">
      </label>
      <label class="setting-row">
        <span>Độ nhạy chuột: <strong id="sens-val">${this.settings.sensitivity.toFixed(1)}x</strong></span>
        <input id="sens-slider" type="range" min="0.3" max="2.0" step="0.1" value="${this.settings.sensitivity}">
      </label>
    `;
    const volSlider = box.querySelector<HTMLInputElement>('#vol-slider')!;
    const sensSlider = box.querySelector<HTMLInputElement>('#sens-slider')!;
    volSlider.oninput = () => {
      this.settings.volume = Number(volSlider.value);
      box.querySelector('#vol-val')!.textContent = `${Math.round(this.settings.volume * 100)}%`;
      this.cb.onSettingsChange({ ...this.settings });
    };
    sensSlider.oninput = () => {
      this.settings.sensitivity = Number(sensSlider.value);
      box.querySelector('#sens-val')!.textContent = `${this.settings.sensitivity.toFixed(1)}x`;
      this.cb.onSettingsChange({ ...this.settings });
    };

    this.showModal('Tùy chỉnh', 'Cài đặt', 'Thiết lập được lưu tự động cho các lần mở game sau.', [
      { label: 'Quay lại', primary: true, onClick: onClose }
    ], box);
  }

  showNightResult(night: NightNumber, won: boolean, reason: string | null, nightScore: number, totalScore: number): void {
    if (won && night === 3) {
      this.showModal(
        'Hoàn thành cả 3 Đêm!',
        'Bình Minh',
        `Toàn bộ Đảo Bến, Đảo Cau và Đảo Chuông đã bừng sáng. Điểm Đêm 3: ${nightScore} · Tổng điểm chiến dịch: ${totalScore}.`,
        [
          { label: 'Chơi lại từ Đêm 1', primary: true, onClick: () => this.cb.onStartCampaign(1) },
          { label: 'Về menu', onClick: () => this.cb.onBackToMenu() }
        ]
      );
      return;
    }

    if (won) {
      this.showModal(
        `Hoàn thành Đêm ${night}`,
        `${NIGHT_MAPS[night].name} đã rạng sáng`,
        `Điểm Đêm ${night}: ${nightScore} · Tổng điểm hiện tại: ${totalScore}.`,
        [
          { label: `Sang Đêm ${night + 1}`, primary: true, onClick: () => this.cb.onNextNight() },
          { label: 'Chơi lại Đêm', onClick: () => this.cb.onRestartNight() },
          { label: 'Về menu', onClick: () => this.cb.onBackToMenu() }
        ]
      );
    } else {
      const msg = reason === 'dawn' ? 'Bình minh đã đến trước khi thắp đủ đèn.' : 'Mây đã mất hết Ngọn Lửa.';
      this.showModal(
        `Đêm ${night} · ${NIGHT_MAPS[night].name}`,
        'Ánh sáng tạm tắt',
        `${msg} Điểm Đêm: ${nightScore}.`,
        [
          { label: 'Chơi lại Đêm', primary: true, onClick: () => this.cb.onRestartNight() },
          { label: 'Về menu', onClick: () => this.cb.onBackToMenu() }
        ]
      );
    }
  }

  update(s: Snapshot, hud: HudState, totalScore: number, projectFn: (pos: Pos3) => ProjectedPoint): void {
    const p = s.player;
    this.root.querySelector('#night-label')!.textContent = `Đêm ${s.night} · ${NIGHT_MAPS[s.night].name}`;
    this.flamesEl.innerHTML = `${'●'.repeat(p.flames)}<span class="empty">${'○'.repeat(t.flames - p.flames)}</span>`;

    const secs = Math.ceil(s.time_left_s);
    this.timerEl.textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    this.timerEl.classList.toggle('danger', s.time_left_s <= 30 && s.state === 'playing');

    const litCount = s.lanterns.filter((l) => l.lit).length;
    this.lanternsEl.textContent = `${litCount}/${s.lanterns.length}`;
    this.scoreEl.textContent = `${totalScore + s.score}`;

    this.root.querySelector('#mote-label')!.textContent = `Đom đóm (${p.carried}/${t.carry_capacity})`;
    const slots = this.moteSlotsEl.children;
    for (let i = 0; i < slots.length; i++) {
      slots[i].classList.toggle('filled', i < p.carried);
    }

    const nearUnlit = s.lanterns
      .filter((l) => !l.lit && Math.hypot(l.pos[0] - p.pos[0], l.pos[2] - p.pos[2]) <= t.interact_radius && Math.abs(l.pos[1] - p.pos[1]) <= 2.0)
      .sort((a, b) => Math.hypot(a.pos[0] - p.pos[0], a.pos[2] - p.pos[2]) - Math.hypot(b.pos[0] - p.pos[0], b.pos[2] - p.pos[2]) || a.id.localeCompare(b.id))[0];

    if (nearUnlit && s.state === 'playing') {
      this.promptEl.hidden = false;
      this.promptEl.textContent = `E — Nạp ánh sáng (${nearUnlit.deposited}/${t.lantern_cost})`;
    } else {
      this.promptEl.hidden = true;
    }

    this.charmBannerEl.hidden = hud.charm_s <= 0;
    if (hud.charm_s > 0) this.charmBannerEl.textContent = `Bùa Gió đang kích hoạt (${hud.charm_s.toFixed(1)}s)`;

    this.windBannerEl.hidden = !hud.wind_warning && !hud.wind_active;
    if (hud.wind_active) this.windBannerEl.textContent = `Gió mạnh đang thổi (${hud.wind_dir_deg}°)`;
    else if (hud.wind_warning) this.windBannerEl.textContent = 'Cảnh báo: Gió mạnh sắp tới!';

    this.depositBtn.disabled = !nearUnlit || p.carried === 0 || s.state !== 'playing';
    this.dashBtn.disabled = (hud.dash_cd_s > 0 && hud.charm_s <= 0) || s.state !== 'playing';
    this.dashBtn.textContent = hud.dash_cd_s > 0 && hud.charm_s <= 0 ? `Lướt ${hud.dash_cd_s.toFixed(1)}s` : 'Shift · Lướt';
    this.pulseBtn.disabled = p.carried < t.pulse_cost || hud.pulse_cd_s > 0 || s.state !== 'playing';
    this.pulseBtn.textContent = hud.pulse_cd_s > 0 ? `Tỏa sáng ${hud.pulse_cd_s.toFixed(1)}s` : `Q · Tỏa sáng (${t.pulse_cost})`;

    // Off-screen arrow to nearest unlit lantern
    const nearestUnlit = s.lanterns
      .filter((l) => !l.lit)
      .sort((a, b) => Math.hypot(a.pos[0] - p.pos[0], a.pos[2] - p.pos[2]) - Math.hypot(b.pos[0] - p.pos[0], b.pos[2] - p.pos[2]))[0];

    if (nearestUnlit && s.state === 'playing') {
      const proj = projectFn(nearestUnlit.pos);
      if (!proj.onScreen) {
        let nx = proj.inFront ? proj.x : -proj.x;
        let ny = proj.inFront ? proj.y : -proj.y;
        const mag = Math.hypot(nx, ny) || 1;
        nx /= mag;
        ny /= mag;
        const sx = innerWidth / 2 + nx * (innerWidth / 2 - 48);
        const sy = innerHeight / 2 - ny * (innerHeight / 2 - 64);
        const deg = (Math.atan2(-ny, nx) * 180) / Math.PI;
        this.arrowEl.hidden = false;
        this.arrowEl.style.left = `${sx}px`;
        this.arrowEl.style.top = `${sy}px`;
        this.arrowEl.style.transform = `rotate(${deg}deg)`;
      } else {
        this.arrowEl.hidden = true;
      }
    } else {
      this.arrowEl.hidden = true;
    }
  }
}
