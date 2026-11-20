import contract from '../core/contract';
import {
  ACTION_LABELS,
  ACTION_ORDER,
  DEFAULT_KEYBINDS,
  formatKeyCode,
  rebindAction,
  type ActionId
} from '../core/keybinds';
import { validatePlayerName, type LeaderboardEntry } from '../core/leaderboard';
import { NIGHT_MAPS, type NightNumber } from '../core/maps';
import type { HudState, Pos3, Snapshot } from '../core/types';
import type { GameSettings } from './settings';
import type { ProjectedPoint } from './scene';

const t = contract.tuning;

export interface NightClientStats {
  lit: number;
  relit: number;
  refuel: number;
  drainStun: number;
  hits: number;
}

export interface HUDCallbacks {
  onStartCampaign: (night: NightNumber) => void;
  onStartNight: () => void;
  onPause: () => void;
  onResume: () => void;
  onRestartNight: () => void;
  onNextNight: () => void;
  onBackToMenu: () => void;
  onSettingsChange: (s: GameSettings) => void;
  onSaveScore: (name: string) => Promise<LeaderboardEntry[]>;
  onLoadLeaderboard: () => Promise<LeaderboardEntry[]>;
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
  private controlsHintEl: HTMLElement;
  private promptEl: HTMLElement;
  private charmBannerEl: HTMLElement;
  private subtitleTrayEl: HTMLElement;
  private subShadeEl: HTMLElement;
  private subWindEl: HTMLElement;
  private subCountdownEl: HTMLElement;
  private subFuelEl: HTMLElement;
  private lanternArrowEl: HTMLElement;
  private shadeArrowEl: HTMLElement;
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
  private renderedCapacity = 0;

  private captureCleanup: (() => void) | null = null;
  private shadeAlertUntilMs = 0;
  private latestSpawnedShadeId: string | null = null;

  constructor(initialSettings: GameSettings, cb: HUDCallbacks) {
    this.settings = { ...initialSettings, keybinds: { ...initialSettings.keybinds } };
    this.cb = cb;

    this.root.innerHTML = `
      <div class="top-bar">
        <div class="hud-box flames-box">
          <span class="label">Ngọn Lửa</span>
          <div class="flames-dots" id="flames">●●●</div>
        </div>
        <div class="hud-box timer-box">
          <span class="label" id="night-label">Đêm 1 · Đảo Bến</span>
          <div class="timer-value" id="timer">04:00</div>
        </div>
        <div class="hud-box right-box">
          <div class="metric">
            <span class="label">Đèn lồng</span>
            <strong id="lanterns">0/5 (cần 3)</strong>
          </div>
          <div class="metric score">
            <span class="label">Điểm</span>
            <strong id="score">0</strong>
          </div>
          <button id="pause-btn" aria-label="Tạm dừng">Tạm dừng</button>
        </div>
      </div>

      <div class="center-alerts">
        <div class="subtitle-tray" id="subtitle-tray" role="status" aria-live="polite">
          <div class="subtitle-item shade" id="sub-shade" hidden></div>
          <div class="subtitle-item danger" id="sub-wind" hidden></div>
          <div class="subtitle-item danger" id="sub-countdown" hidden></div>
          <div class="subtitle-item" id="sub-fuel" hidden></div>
        </div>
        <div class="banner charm" id="charm-banner" hidden>Bùa Gió: 10.0s</div>
        <div class="banner prompt" id="deposit-prompt" hidden>E — Nạp ánh sáng (0/10)</div>
      </div>

      <div class="bottom-bar">
        <div class="controls-hint" id="controls-hint"></div>
        <div class="hud-box mote-bar-wrap">
          <span class="label" id="mote-label">Đom đóm (0/10)</span>
          <div class="mote-slots" id="mote-slots"></div>
        </div>
        <div class="skills-box">
          <button class="skill-btn" id="deposit-btn">E · Nạp</button>
          <button class="skill-btn" id="dash-btn">Shift · Lướt</button>
          <button class="skill-btn" id="pulse-btn">Q · Tỏa sáng (3)</button>
        </div>
      </div>

      <div id="lantern-arrow" hidden title="Đèn cần thắp/châm dầu">➤</div>
      <div id="shade-arrow" hidden title="Hướng Bóng Mực">👁➤</div>

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
    this.controlsHintEl = this.root.querySelector('#controls-hint')!;
    this.promptEl = this.root.querySelector('#deposit-prompt')!;
    this.charmBannerEl = this.root.querySelector('#charm-banner')!;
    this.subtitleTrayEl = this.root.querySelector('#subtitle-tray')!;
    this.subShadeEl = this.root.querySelector('#sub-shade')!;
    this.subWindEl = this.root.querySelector('#sub-wind')!;
    this.subCountdownEl = this.root.querySelector('#sub-countdown')!;
    this.subFuelEl = this.root.querySelector('#sub-fuel')!;
    this.lanternArrowEl = this.root.querySelector('#lantern-arrow')!;
    this.shadeArrowEl = this.root.querySelector('#shade-arrow')!;
    this.depositBtn = this.root.querySelector('#deposit-btn')!;
    this.pulseBtn = this.root.querySelector('#pulse-btn')!;
    this.dashBtn = this.root.querySelector('#dash-btn')!;
    this.modalVeil = this.root.querySelector('#modal-veil')!;
    this.modalTitle = this.root.querySelector('#modal-title')!;
    this.modalSub = this.root.querySelector('#modal-sub')!;
    this.modalBody = this.root.querySelector('#modal-body')!;
    this.modalExtra = this.root.querySelector('#modal-extra')!;
    this.modalActions = this.root.querySelector('#modal-actions')!;

    this.syncMoteSlotCount(t.carry_capacity);
    this.refreshControlLabels();

    this.root.querySelector<HTMLButtonElement>('#pause-btn')!.onclick = () => this.cb.onPause();
    this.depositBtn.onclick = () => this.cb.onDeposit();
    this.pulseBtn.onclick = () => this.cb.onPulse();
    this.dashBtn.onclick = () => this.cb.onDash();
  }

  private clearKeyCapture(): void {
    if (this.captureCleanup) {
      this.captureCleanup();
      this.captureCleanup = null;
    }
  }

  private refreshControlLabels(): void {
    const kb = this.settings.keybinds;
    const f = formatKeyCode;
    this.controlsHintEl.innerHTML =
      `${f(kb.moveUp)}${f(kb.moveLeft)}${f(kb.moveDown)}${f(kb.moveRight)} đi · Chuột xoay<br>` +
      `${f(kb.jump)} nhảy · ${f(kb.dash)} lướt · ${f(kb.interact)} nạp · ${f(kb.pulse)} tỏa · ${f(kb.pause)} dừng`;
    this.depositBtn.textContent = `${f(kb.interact)} · Nạp`;
  }

  notifyShadeSpawned(shadeId: string): void {
    this.latestSpawnedShadeId = shadeId;
    this.shadeAlertUntilMs = performance.now() + 3500;
  }

  resetNightOverlays(): void {
    this.latestSpawnedShadeId = null;
    this.shadeAlertUntilMs = 0;
    this.subShadeEl.hidden = true;
    this.subWindEl.hidden = true;
    this.subCountdownEl.hidden = true;
    this.subFuelEl.hidden = true;
    this.lanternArrowEl.hidden = true;
    this.shadeArrowEl.hidden = true;
  }

  private showModal(
    sub: string,
    title: string,
    body: string,
    buttons: { label: string; primary?: boolean; onClick: () => void }[],
    extraEl?: HTMLElement
  ): void {
    this.clearKeyCapture();
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
    this.clearKeyCapture();
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
      'Day 12 · AI SDLC · v1.0.0',
      'Đảo Đèn Lồng',
      'Đồng hành cùng Mây qua 3 đêm — Đảo Bến, Đảo Cau, Đảo Chuông — thắp đèn và giữ đảo sáng tới bình minh.',
      [
        { label: 'Bắt đầu hành trình (Đêm 1 → 3)', primary: true, onClick: () => this.cb.onStartCampaign(1) },
        { label: 'Bảng xếp hạng', onClick: () => void this.showLeaderboard(() => this.showMainMenu()) },
        { label: 'Cài đặt & Tiếp cận', onClick: () => this.showSettings(() => this.showMainMenu()) }
      ],
      extra
    );
  }

  async showLeaderboard(onClose: () => void): Promise<void> {
    const wrap = document.createElement('div');
    wrap.innerHTML = '<p>Đang tải bảng xếp hạng…</p>';
    this.showModal(
      'Top 10 chiến dịch',
      'Bảng xếp hạng',
      'Xếp theo tổng điểm các Đêm đã thắng giảm dần; bằng điểm ưu tiên người đạt trước.',
      [{ label: 'Quay lại', primary: true, onClick: onClose }],
      wrap
    );

    const entries = await this.cb.onLoadLeaderboard();
    if (this.modalVeil.hidden) return;
    if (entries.length === 0) {
      wrap.innerHTML = '<p>Chưa có kỷ lục nào được lưu. Hoàn thành Đêm 3 hoặc kết thúc lượt chơi để ghi danh!</p>';
      return;
    }

    const rows = entries
      .map(
        (e, i) => `
        <tr>
          <td>#${i + 1}</td>
          <td>${this.escapeHtml(e.name)}</td>
          <td><strong>${e.score}</strong></td>
          <td>${e.nights_won}/3</td>
          <td>${e.seed}</td>
          <td>${this.escapeHtml(e.achieved_at.replace('T', ' ').slice(0, 19))}</td>
        </tr>`
      )
      .join('');

    wrap.innerHTML = `
      <table class="leaderboard-table">
        <thead>
          <tr><th>#</th><th>Tên</th><th>Điểm</th><th>Đêm thắng</th><th>Seed</th><th>Thời gian</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  showNightIntro(night: NightNumber, totalScore: number): void {
    const m = NIGHT_MAPS[night];
    const needed = Math.ceil(t.win_ratio * m.lanterns.length);
    this.showModal(
      `${m.subtitle} · Điểm tích lũy: ${totalScore}`,
      m.name,
      `${m.elderLine} (Giữ ít nhất ${needed}/${m.lanterns.length} đèn sáng tới bình minh!)`,
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
      'Đồng hồ, nhiên liệu và mọi thực thể đã được giữ nguyên trạng thái.',
      [
        { label: 'Tiếp tục', primary: true, onClick: () => this.cb.onResume() },
        { label: 'Chơi lại Đêm', onClick: () => this.cb.onRestartNight() },
        { label: 'Cài đặt & Tiếp cận', onClick: () => this.showSettings(() => this.showPause()) },
        { label: 'Về menu', onClick: () => this.cb.onBackToMenu() }
      ]
    );
  }

  showSettings(onClose: () => void): void {
    const box = document.createElement('div');
    const keyRows = ACTION_ORDER.map(
      (action) => `
      <div class="keybind-row">
        <span>${ACTION_LABELS[action]}</span>
        <button type="button" class="keybind-btn" data-action="${action}">${this.escapeHtml(formatKeyCode(this.settings.keybinds[action]))}</button>
      </div>`
    ).join('');

    box.innerHTML = `
      <label class="setting-row">
        <span>Âm lượng: <strong id="vol-val">${Math.round(this.settings.volume * 100)}%</strong></span>
        <input id="vol-slider" type="range" min="0" max="1" step="0.05" value="${this.settings.volume}">
      </label>
      <label class="setting-row">
        <span>Độ nhạy chuột: <strong id="sens-val">${this.settings.sensitivity.toFixed(1)}x</strong></span>
        <input id="sens-slider" type="range" min="0.3" max="2.0" step="0.1" value="${this.settings.sensitivity}">
      </label>
      <label class="setting-row setting-toggle">
        <span>Bảng màu dễ phân biệt</span>
        <input id="cb-toggle" type="checkbox" ${this.settings.colorblind ? 'checked' : ''}>
      </label>
      <label class="setting-row setting-toggle">
        <span>Giảm chuyển động (tắt rung & chớp)</span>
        <input id="rm-toggle" type="checkbox" ${this.settings.reducedMotion ? 'checked' : ''}>
      </label>
      <label class="setting-row setting-toggle">
        <span>Chữ lớn (×1.25)</span>
        <input id="lt-toggle" type="checkbox" ${this.settings.largeText ? 'checked' : ''}>
      </label>
      <div class="section-heading">Phím điều khiển</div>
      <div class="keybind-grid">${keyRows}</div>
      <div class="keybind-error" id="keybind-error" hidden></div>
      <div class="keybind-tools">
        <button type="button" id="reset-keys-btn">Khôi phục mặc định</button>
      </div>
    `;

    const volSlider = box.querySelector<HTMLInputElement>('#vol-slider')!;
    const sensSlider = box.querySelector<HTMLInputElement>('#sens-slider')!;
    const cbToggle = box.querySelector<HTMLInputElement>('#cb-toggle')!;
    const rmToggle = box.querySelector<HTMLInputElement>('#rm-toggle')!;
    const ltToggle = box.querySelector<HTMLInputElement>('#lt-toggle')!;
    const errEl = box.querySelector<HTMLElement>('#keybind-error')!;

    const emitSettings = () => {
      this.refreshControlLabels();
      this.cb.onSettingsChange({ ...this.settings, keybinds: { ...this.settings.keybinds } });
    };

    volSlider.oninput = () => {
      this.settings.volume = Number(volSlider.value);
      box.querySelector('#vol-val')!.textContent = `${Math.round(this.settings.volume * 100)}%`;
      emitSettings();
    };
    sensSlider.oninput = () => {
      this.settings.sensitivity = Number(sensSlider.value);
      box.querySelector('#sens-val')!.textContent = `${this.settings.sensitivity.toFixed(1)}x`;
      emitSettings();
    };
    cbToggle.onchange = () => {
      this.settings.colorblind = cbToggle.checked;
      emitSettings();
    };
    rmToggle.onchange = () => {
      this.settings.reducedMotion = rmToggle.checked;
      emitSettings();
    };
    ltToggle.onchange = () => {
      this.settings.largeText = ltToggle.checked;
      emitSettings();
    };

    let activeBtn: HTMLButtonElement | null = null;
    const onCaptureKey = (e: KeyboardEvent) => {
      if (!activeBtn) return;
      e.preventDefault();
      e.stopPropagation();
      const action = activeBtn.dataset.action as ActionId;
      const res = rebindAction(this.settings.keybinds, action, e.code);
      activeBtn.classList.remove('listening');
      if (!res.ok) {
        activeBtn.textContent = formatKeyCode(this.settings.keybinds[action]);
        errEl.hidden = false;
        errEl.textContent = `Phím ${formatKeyCode(e.code)} đang được dùng cho “${res.conflictLabel}”. Hãy chọn phím khác.`;
      } else {
        this.settings.keybinds = res.binds;
        activeBtn.textContent = formatKeyCode(e.code);
        errEl.hidden = true;
        emitSettings();
      }
      activeBtn = null;
      window.removeEventListener('keydown', onCaptureKey, true);
    };

    box.querySelectorAll<HTMLButtonElement>('.keybind-btn').forEach((btn) => {
      btn.onclick = () => {
        if (activeBtn && activeBtn !== btn) {
          const prevAction = activeBtn.dataset.action as ActionId;
          activeBtn.textContent = formatKeyCode(this.settings.keybinds[prevAction]);
          activeBtn.classList.remove('listening');
        }
        errEl.hidden = true;
        activeBtn = btn;
        btn.classList.add('listening');
        btn.textContent = 'Nhấn phím…';
        window.removeEventListener('keydown', onCaptureKey, true);
        window.addEventListener('keydown', onCaptureKey, true);
      };
    });

    box.querySelector<HTMLButtonElement>('#reset-keys-btn')!.onclick = () => {
      if (activeBtn) {
        activeBtn.classList.remove('listening');
        activeBtn = null;
      }
      window.removeEventListener('keydown', onCaptureKey, true);
      errEl.hidden = true;
      this.settings.keybinds = { ...DEFAULT_KEYBINDS };
      box.querySelectorAll<HTMLButtonElement>('.keybind-btn').forEach((b) => {
        const act = b.dataset.action as ActionId;
        b.textContent = formatKeyCode(this.settings.keybinds[act]);
      });
      emitSettings();
    };

    this.showModal(
      'Tùy chỉnh & Khả năng tiếp cận',
      'Cài đặt',
      'Mọi thiết lập được lưu tự động. Bấm vào ô phím để đổi phím điều khiển.',
      [{ label: 'Quay lại', primary: true, onClick: onClose }],
      box
    );

    this.captureCleanup = () => {
      window.removeEventListener('keydown', onCaptureKey, true);
    };
  }

  private buildResultExtra(
    totalCampaignScore: number,
    nightsWon: number,
    seed: number,
    stats: NightClientStats,
    showLeaderboardForm: boolean,
    reopenFn: () => void
  ): HTMLElement {
    const wrap = document.createElement('div');
    const chips = document.createElement('div');
    chips.className = 'stats-chips';
    chips.innerHTML = `
      <span class="stat-chip">Thắp: ${stats.lit}</span>
      <span class="stat-chip">Thắp lại: ${stats.relit}</span>
      <span class="stat-chip">Châm dầu: ${stats.refuel}</span>
      <span class="stat-chip">Phá hút: ${stats.drainStun}</span>
      <span class="stat-chip">Trúng đòn: ${stats.hits}</span>
    `;
    wrap.appendChild(chips);

    if (showLeaderboardForm) {
      const form = document.createElement('form');
      form.className = 'lb-form';
      form.innerHTML = `
        <input id="lb-name" type="text" maxlength="12" autocomplete="off" placeholder="Tên (3–12 ký tự)" aria-label="Tên lưu bảng xếp hạng" />
        <button type="submit" id="lb-save-btn">Lưu điểm (${totalCampaignScore})</button>
      `;
      const msg = document.createElement('div');
      msg.className = 'lb-msg';
      msg.hidden = true;

      const input = form.querySelector<HTMLInputElement>('#lb-name')!;
      const saveBtn = form.querySelector<HTMLButtonElement>('#lb-save-btn')!;
      let saved = false;

      form.onsubmit = async (ev) => {
        ev.preventDefault();
        if (saved) return;
        const v = validatePlayerName(input.value);
        if (!v.valid) {
          msg.hidden = false;
          msg.className = 'lb-msg error';
          msg.textContent = v.reason ?? 'Tên không hợp lệ.';
          return;
        }
        saveBtn.disabled = true;
        try {
          await this.cb.onSaveScore(v.trimmed);
          saved = true;
          input.disabled = true;
          msg.hidden = false;
          msg.className = 'lb-msg ok';
          msg.textContent = `Đã lưu "${v.trimmed}" (${totalCampaignScore} điểm · ${nightsWon}/3 Đêm · seed ${seed})!`;
        } catch (err) {
          saveBtn.disabled = false;
          msg.hidden = false;
          msg.className = 'lb-msg error';
          msg.textContent = err instanceof Error ? err.message : 'Không thể lưu điểm.';
        }
      };

      const viewBtnWrap = document.createElement('div');
      viewBtnWrap.className = 'modal-actions';
      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.textContent = 'Xem bảng xếp hạng';
      viewBtn.onclick = () => void this.showLeaderboard(reopenFn);
      viewBtnWrap.appendChild(viewBtn);

      wrap.append(form, msg, viewBtnWrap);
    }

    return wrap;
  }

  showNightResult(
    night: NightNumber,
    won: boolean,
    reason: string | null,
    nightScore: number,
    totalCampaignScore: number,
    nightsWon: number,
    seed: number,
    stats: NightClientStats
  ): void {
    const reopen = () =>
      this.showNightResult(night, won, reason, nightScore, totalCampaignScore, nightsWon, seed, stats);

    if (won && night === 3) {
      this.showModal(
        'Hoàn thành cả 3 Đêm!',
        'Bình Minh',
        `Bạn đã giữ đảo sáng tới bình minh qua Đảo Bến, Đảo Cau và Đảo Chuông. Điểm Đêm 3: ${nightScore} · Tổng điểm chiến dịch: ${totalCampaignScore}.`,
        [
          { label: 'Chơi lại từ Đêm 1', primary: true, onClick: () => this.cb.onStartCampaign(1) },
          { label: 'Về menu', onClick: () => this.cb.onBackToMenu() }
        ],
        this.buildResultExtra(totalCampaignScore, nightsWon, seed, stats, true, reopen)
      );
      return;
    }

    if (won) {
      this.showModal(
        `Sống sót tới bình minh · Đêm ${night}`,
        `${NIGHT_MAPS[night].name} đã rạng sáng`,
        `Điểm Đêm ${night}: ${nightScore} · Tổng điểm hiện tại: ${totalCampaignScore}.`,
        [
          { label: `Sang Đêm ${night + 1}`, primary: true, onClick: () => this.cb.onNextNight() },
          { label: 'Chơi lại Đêm', onClick: () => this.cb.onRestartNight() },
          { label: 'Về menu', onClick: () => this.cb.onBackToMenu() }
        ],
        this.buildResultExtra(totalCampaignScore, nightsWon, seed, stats, false, reopen)
      );
    } else {
      const msg =
        reason === 'dawn'
          ? 'Bình minh đã đến nhưng số đèn đang sáng chưa đủ ngưỡng yêu cầu.'
          : 'Mây đã mất hết Ngọn Lửa.';
      this.showModal(
        `Đêm ${night} · ${NIGHT_MAPS[night].name}`,
        'Ánh sáng tạm tắt',
        `${msg} Điểm Đêm ${night}: ${nightScore} · Tổng điểm Đêm đã thắng: ${totalCampaignScore}.`,
        [
          { label: 'Chơi lại Đêm', primary: true, onClick: () => this.cb.onRestartNight() },
          { label: 'Về menu', onClick: () => this.cb.onBackToMenu() }
        ],
        this.buildResultExtra(totalCampaignScore, nightsWon, seed, stats, true, reopen)
      );
    }
  }

  private setSubtitle(el: HTMLElement, text: string | null): void {
    if (!text) {
      if (!el.hidden) el.hidden = true;
      return;
    }
    if (el.hidden) el.hidden = false;
    if (el.textContent !== text) el.textContent = text;
  }

  private positionEdgeArrow(el: HTMLElement, pos: Pos3, projectFn: (pos: Pos3) => ProjectedPoint): void {
    const proj = projectFn(pos);
    if (proj.onScreen) {
      el.hidden = true;
      return;
    }
    let nx = proj.inFront ? proj.x : -proj.x;
    let ny = proj.inFront ? proj.y : -proj.y;
    const mag = Math.hypot(nx, ny) || 1;
    nx /= mag;
    ny /= mag;
    const sx = innerWidth / 2 + nx * (innerWidth / 2 - 48);
    const sy = innerHeight / 2 - ny * (innerHeight / 2 - 72);
    const deg = (Math.atan2(-ny, nx) * 180) / Math.PI;
    el.hidden = false;
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;
    el.style.transform = `rotate(${deg}deg)`;
  }

  private syncMoteSlotCount(cap: number): void {
    if (this.renderedCapacity === cap) return;
    this.renderedCapacity = cap;
    this.moteSlotsEl.innerHTML = '';
    for (let i = 0; i < cap; i++) {
      const slot = document.createElement('div');
      slot.className = 'mote-slot';
      this.moteSlotsEl.appendChild(slot);
    }
  }

  update(s: Snapshot, hud: HudState, totalScore: number, projectFn: (pos: Pos3) => ProjectedPoint): void {
    const p = s.player;
    const kb = this.settings.keybinds;
    this.root.querySelector('#night-label')!.textContent = `Đêm ${s.night} · ${NIGHT_MAPS[s.night].name}`;
    this.flamesEl.innerHTML = `${'●'.repeat(p.flames)}<span class="empty">${'○'.repeat(t.flames - p.flames)}</span>`;

    const secs = Math.ceil(s.time_left_s);
    const timeText = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    const inDangerTime = s.time_left_s <= 30 && s.state === 'playing';
    this.timerEl.textContent = inDangerTime && this.settings.colorblind ? `⚠ ${timeText}` : timeText;
    this.timerEl.classList.toggle('danger', inDangerTime);

    const litCount = s.lanterns.filter((l) => l.lit).length;
    const needed = Math.ceil(t.win_ratio * s.lanterns.length);
    this.lanternsEl.textContent = `${litCount}/${s.lanterns.length} (cần ${needed})`;
    this.scoreEl.textContent = `${totalScore + s.score}`;

    this.syncMoteSlotCount(p.capacity);
    this.root.querySelector('#mote-label')!.textContent = `Đom đóm (${p.carried}/${p.capacity})`;
    const slots = this.moteSlotsEl.children;
    for (let i = 0; i < slots.length; i++) {
      slots[i].classList.toggle('filled', i < p.carried);
    }

    const nearEligible = s.lanterns
      .filter(
        (l) =>
          (!l.lit || l.fuel < t.fuel_max) &&
          Math.hypot(l.pos[0] - p.pos[0], l.pos[2] - p.pos[2]) <= t.interact_radius &&
          Math.abs(l.pos[1] - p.pos[1]) <= 2.0
      )
      .sort(
        (a, b) =>
          Math.hypot(a.pos[0] - p.pos[0], a.pos[2] - p.pos[2]) -
            Math.hypot(b.pos[0] - p.pos[0], b.pos[2] - p.pos[2]) || a.id.localeCompare(b.id)
      )[0];

    const interactKey = formatKeyCode(kb.interact);
    if (nearEligible && s.state === 'playing') {
      this.promptEl.hidden = false;
      if (nearEligible.lit) {
        this.promptEl.textContent = `${interactKey} — Châm dầu (${Math.round(nearEligible.fuel)}%)`;
      } else if (nearEligible.ever_lit) {
        this.promptEl.textContent = `${interactKey} — Thắp lại (${nearEligible.deposited}/${t.relight_cost})`;
      } else {
        this.promptEl.textContent = `${interactKey} — Nạp (${nearEligible.deposited}/${t.lantern_cost})`;
      }
    } else {
      this.promptEl.hidden = true;
    }

    this.charmBannerEl.hidden = hud.charm_s <= 0;
    if (hud.charm_s > 0) this.charmBannerEl.textContent = `Bùa Gió: ${hud.charm_s.toFixed(1)}s`;

    // All 4 accessibility visual subtitles (independent rows so none overwrite each other)
    const now = performance.now();
    const shadeSpawnActive = s.state === 'playing' && now < this.shadeAlertUntilMs;
    this.setSubtitle(this.subShadeEl, shadeSpawnActive ? '👁 Bóng Mực vừa xuất hiện!' : null);

    const warnPrefix = this.settings.colorblind ? '⚠ ' : '';
    const windSub =
      s.state === 'playing' && hud.wind_active
        ? `${warnPrefix}💨 Gió mạnh đang thổi (${hud.wind_dir_deg}°)!`
        : s.state === 'playing' && hud.wind_warning
          ? `${warnPrefix}💨 Gió mạnh sắp thổi!`
          : null;
    this.setSubtitle(this.subWindEl, windSub);

    const final10Sub =
      s.state === 'playing' && secs > 0 && secs <= 10
        ? `${warnPrefix}⏱ Còn ${secs} giây cuối trước bình minh!`
        : null;
    this.setSubtitle(this.subCountdownEl, final10Sub);

    const lowFuelLanterns = s.lanterns
      .filter((l) => l.lit && l.fuel < t.low_fuel_threshold)
      .sort((a, b) => a.fuel - b.fuel);
    const lowFuelSub =
      s.state === 'playing' && lowFuelLanterns.length > 0
        ? `${warnPrefix}🏮 Đèn ${lowFuelLanterns.map((l) => l.id).join(', ')} sắp cạn dầu (${Math.round(lowFuelLanterns[0].fuel)}%)!`
        : null;
    this.setSubtitle(this.subFuelEl, lowFuelSub);
    this.subtitleTrayEl.hidden = !shadeSpawnActive && !windSub && !final10Sub && !lowFuelSub;

    this.depositBtn.disabled = !nearEligible || p.carried === 0 || s.state !== 'playing';
    this.dashBtn.disabled = (hud.dash_cd_s > 0 && hud.charm_s <= 0) || s.state !== 'playing';
    this.dashBtn.textContent =
      hud.dash_cd_s > 0 && hud.charm_s <= 0
        ? `Lướt ${hud.dash_cd_s.toFixed(1)}s`
        : `${formatKeyCode(kb.dash)} · Lướt`;
    this.pulseBtn.disabled = p.carried < t.pulse_cost || hud.pulse_cd_s > 0 || s.state !== 'playing';
    this.pulseBtn.textContent =
      hud.pulse_cd_s > 0
        ? `Tỏa sáng ${hud.pulse_cd_s.toFixed(1)}s`
        : `${formatKeyCode(kb.pulse)} · Tỏa (${t.pulse_cost})`;

    // Edge arrow to nearest priority lantern
    const priorityTarget =
      s.lanterns
        .filter((l) => !l.lit || l.fuel < t.low_fuel_threshold)
        .sort(
          (a, b) =>
            Math.hypot(a.pos[0] - p.pos[0], a.pos[2] - p.pos[2]) -
            Math.hypot(b.pos[0] - p.pos[0], b.pos[2] - p.pos[2])
        )[0] ?? null;
    if (priorityTarget && s.state === 'playing') {
      this.positionEdgeArrow(this.lanternArrowEl, priorityTarget.pos, projectFn);
    } else {
      this.lanternArrowEl.hidden = true;
    }

    // Edge arrow for spawned / nearest chasing Shade (visual accessibility indicator)
    const alertShade =
      s.state === 'playing'
        ? ((now < this.shadeAlertUntilMs && this.latestSpawnedShadeId
            ? s.shades.find((sh) => sh.id === this.latestSpawnedShadeId)
            : null) ??
            s.shades
              .filter((sh) => sh.state === 'chase' || sh.state === 'drain')
              .sort(
                (a, b) =>
                  Math.hypot(a.pos[0] - p.pos[0], a.pos[2] - p.pos[2]) -
                  Math.hypot(b.pos[0] - p.pos[0], b.pos[2] - p.pos[2])
              )[0] ??
            null)
        : null;
    if (alertShade) {
      this.positionEdgeArrow(this.shadeArrowEl, alertShade.pos, projectFn);
    } else {
      this.shadeArrowEl.hidden = true;
    }
  }
}
