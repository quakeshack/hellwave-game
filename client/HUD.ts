import type { ClientEdict } from '../../../shared/GameInterfaces.ts';

import Q from '../../../shared/Q.ts';
import Vector from '../../../shared/Vector.ts';

import { MessageBag, Q1HUD } from '../../id1/client/HUD.ts';
import { clientEvent, clientEventName, colors, contentShift, formatMoney } from '../Defs.ts';
import { buyMenuItems } from '../entity/Player.ts';
import { phases } from '../Phases.ts';

import type { ClientGameAPI } from './ClientAPI.ts';
import { HellwaveStatsInfo } from './Sync.ts';

type MoneyBalanceState = [number | null, number | null, number];

class HellwaveMessageBag extends MessageBag {
  protected override _offset: [number, number] = [0, -64];
}

/**
 * Calculate a readable player-name scale from the camera distance.
 * @returns HUD name scale clamped between near and far bounds.
 */
function calculatePlayerNameScale(distance: number): number {
  const nearDistance = 64.0;
  const farDistance = 512.0;
  const maxScale = 2.0;
  const minScale = 0.25;

  if (distance <= nearDistance) {
    return maxScale;
  }

  if (distance >= farDistance) {
    return minScale;
  }

  const distanceFraction = (distance - nearDistance) / (farDistance - nearDistance);

  return maxScale - distanceFraction * (maxScale - minScale);
}

export default class HellwaveHUD extends Q1HUD {
  declare protected readonly game: ClientGameAPI;
  declare protected stats: HellwaveStatsInfo | null;

  inventory: { money: MoneyBalanceState } = {
    /** Current account balance [new balance, old balance, timestamp]. */
    money: [null, null, -Infinity],
  };

  protected override _newStats(): HellwaveStatsInfo {
    return new HellwaveStatsInfo(this.engine);
  }

  protected override _newMessageBag(): MessageBag {
    return new HellwaveMessageBag(this.engine, this.sbar);
  }

  override get hudStats(): HellwaveStatsInfo {
    return super.hudStats as HellwaveStatsInfo;
  }

  protected override _subscribeToEvents(): void {
    super._subscribeToEvents();

    this.engine.eventBus.subscribe(clientEventName(clientEvent.STATS_UPDATED), (slot: string, value: number | string): void => {
      if (slot !== 'phase') {
        return;
      }

      this.engine.ContentShift(contentShift.info, new Vector(...this.engine.IndexToRGB(colors.HUD_CSHIFT_BONUSFLASH)), 0.2);

      switch (value) {
        case phases.quiet:
          this.game.sfx.phase.quiet[Math.floor(Math.random() * this.game.sfx.phase.quiet.length)]?.play();
          break;

        case phases.normal:
          this.game.sfx.phase.normal[Math.floor(Math.random() * this.game.sfx.phase.normal.length)]?.play();
          break;

        default:
          break;
      }
    });

    this.engine.eventBus.subscribe(clientEventName(clientEvent.MONEY_UPDATE), (newBalance: number): void => {
      this.inventory.money = [newBalance, this.inventory.money[0], this.engine.CL.gametime];
    });
  }

  protected override _drawStatusBar(): void {
    if (this.game.clientdata.spectating) {
      const message = 'Spectating... Waiting for next round';
      const x = this.sbar.alignCenterHorizontally(16 * message.length);

      this.sbar.drawString(x, -24, message, 2.0);
      return;
    }

    super._drawStatusBar();
  }

  override draw(): void {
    super.draw();

    this.#drawAccountBalance();
    this.#drawRoundStats();
    this.#drawBuyMenu();
    this.#drawPlayerNames();
  }

  #drawPlayerNames(): void {
    const entities = this.engine.GetVisibleEntities((entity: ClientEdict): boolean => entity.classname === 'player');

    for (const entity of entities) {
      const playerName = this.#getPlayerName(entity);

      if (playerName === null) {
        continue;
      }

      const distance = entity.origin.distanceTo(this.engine.CL.vieworigin);

      if (distance > 512.0) {
        continue;
      }

      const coordinates = this.engine.WorldToScreen(entity.origin.copy().add(new Vector(0.0, 0.0, 24.0)));

      if (coordinates === null) {
        continue;
      }

      const scale = calculatePlayerNameScale(distance);
      const x = coordinates[0] - (playerName.length * 16 * scale) / 2;
      const y = coordinates[1] - 48 * scale;

      this.engine.DrawString(x, y, playerName, 2.0 * scale, new Vector(0.7, 0.7, 0.7));
    }
  }

  #getPlayerName(entity: ClientEdict | null): string | null {
    if (entity === null) {
      return null;
    }

    const scoreIndex = entity.num - 1;

    if (scoreIndex < 0 || scoreIndex >= this.engine.CL.maxclients) {
      return null;
    }

    if (entity.num === this.engine.CL.entityNum) {
      return null;
    }

    const score = this.engine.CL.score(scoreIndex);

    return score.isActive && score.name !== '' ? score.name : null;
  }

  #drawBuyMenu(): void {
    if (this.game.clientdata.buyzone === 0) {
      return;
    }

    if (this.game.clientdata.buyzone === 1 || this.game.clientdata.buyzone === 2) {
      this.sbar.drawString(-16 * 10, -48, 'Buyzone!', 2.0, new Vector(0.0, 1.0, 0.0));
    }

    if (this.game.clientdata.buyzone !== 2) {
      return;
    }

    const startY = -48 - 16 * 16;
    const currentMoney = this.inventory.money[0] ?? 0;

    this.sbar.drawString(0, startY, 'Available for purchase:', 2.0);

    for (const [impulse, item] of Object.entries(buyMenuItems)) {
      if (item.cost > currentMoney) {
        continue;
      }

      this.sbar.drawString(
        0,
        startY + 24 + 16 * Number(impulse),
        `[${impulse}] ${formatMoney(item.cost).padStart(5)} - ${item.label}`,
        2.0,
      );
    }
  }

  #drawAccountBalance(): void {
    const stats = this.hudStats;

    if (stats.phase !== phases.quiet || this.inventory.money[0] === null) {
      return;
    }

    const color = new Vector(1.0, 1.0, 1.0);
    const newBalance = this.inventory.money[0] ?? 0;
    const oldBalance = this.inventory.money[1] ?? 0;
    const colorComponent = Math.min(1.0, Math.max(0.0, (this.engine.CL.gametime - this.inventory.money[2]) / 3.0));

    if (newBalance > oldBalance) {
      color[0] = color[2] = colorComponent;
    } else if (newBalance < oldBalance) {
      color[1] = color[2] = colorComponent;
    }

    this.sbar.drawString(0, -48, formatMoney(newBalance), 2.0, color);
  }

  #drawRoundStats(): void {
    const stats = this.hudStats;

    if (stats.phase === phases.quiet) {
      const roundString = `${stats.round_current} / ${stats.round_total}`;

      this.sbar.drawString(this.sbar.width - roundString.length * 16, -48, roundString, 2.0);
      this.sbar.drawString(this.sbar.alignCenterHorizontally(16 * 7), -80, Q.secsToTime(stats.phase_ending_time - this.engine.CL.gametime), 2.0);
      return;
    }

    if (stats.phase === phases.normal || stats.phase === phases.action) {
      const waveString = `${stats.monsters_killed} / ${stats.round_monsters_limit}`;

      this.sbar.drawString(this.sbar.width - waveString.length * 16, -48, waveString, 2.0);
    }

    this.sbar.drawString(0, -48, stats.phase === null ? '' : phases[stats.phase], 2.0);
  }
}
