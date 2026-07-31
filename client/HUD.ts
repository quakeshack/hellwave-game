import { serializableObject } from '../../id1/helper/MiscHelpers.ts';
import type { ClientEdict, ClientEngineAPI, PostProcessStack } from '../../../shared/GameInterfaces.ts';

import Q from '../../../shared/Q.ts';
import Vector from '../../../shared/Vector.ts';

import { MessageBag, Q1HUD } from '../../id1/client/HUD.ts';
import { clientEvent, clientEventName, colors, contentShift, formatMoney } from '../Defs.ts';
import type { BuyMenuAvailabilityContext } from '../entity/Player.ts';
import { phaseLabels, phases } from '../Phases.ts';

import type { ClientGameAPI } from './ClientAPI.ts';
import HellwaveBuyMenu from './menu/BuyMenu.ts';
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

const gameoverPostProcessStack = [
  { id: 'color-grade', settings: { saturation: 0.0, tintColor: new Vector(1.0, 0.0, 0.0), tintStrength: 1.0, pulsePeriod: 1.0, pulseStrength: 0.5 } },
  { id: 'blur', settings: { radius: 3.0 } },
] as PostProcessStack;

const buymenuPostProcessStack = [
  { id: 'color-grade', settings: { saturation: 0.3 } },
  { id: 'blur', settings: { radius: 8 } },
] as PostProcessStack;

@serializableObject
export default class HellwaveHUD extends Q1HUD {
  declare protected readonly game: ClientGameAPI;
  declare protected stats: HellwaveStatsInfo | null;

  inventory: { money: MoneyBalanceState } = {
    /** Current account balance [new balance, old balance, timestamp]. */
    money: [null, null, -Infinity],
  };

  // Assigned in `_subscribeToEvents()`, which the base class's `init()` always calls before
  // anything else on this instance can run.
  #buyMenu!: HellwaveBuyMenu;

  override shutdown(): void {
    super.shutdown();

    this.#buyMenu.dispose();
  }

  protected override _newStats(): HellwaveStatsInfo {
    return new HellwaveStatsInfo(this.engine);
  }

  protected override _newMessageBag(): MessageBag {
    return new HellwaveMessageBag(this.engine, this.sbar);
  }

  protected override _subscribeToEvents(): void {
    super._subscribeToEvents();

    this.#buyMenu = new HellwaveBuyMenu(this, this.engine);
    this.#buyMenu.register();

    this.engine.eventBus.subscribe('client.clientdata.field-changed', (field: string, value: number | string | boolean | null): void => {
      switch (field) {
        // Opening the buy menu is handled by the `hw_buymenu` command (see
        // `HellwaveBuyMenu.Init`) -- the server only tells us whether the player is physically in
        // a buyzone. The only thing this needs to react to is an *involuntary* close: leaving the
        // zone, or the round moving on, while the menu happens to be showing.
        case 'buyzone': {
          console.assert(typeof value === 'number' && value >= -1 && value <= 1);
          const buyzone = value as -1 | 0 | 1;

          if (buyzone !== 1 && this.#buyMenu.isOpen()) {
            this.engine.Menu.Pop();
          }
          break;
        }

        case 'money':
          console.assert(typeof value === 'number');
          this.inventory.money = [value as number, this.inventory.money[0], this.engine.CL.gametime];
          this.#buyMenu.refreshIfOpen();
          break;

        default:
          break;
      }
    });

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

        case phases.gameover:
          this.engine.PostProcess.setStack(gameoverPostProcessStack);
          return;

        default:
          break;
      }

      this.engine.PostProcess.clearStack();
    });

    this.engine.eventBus.subscribe(clientEventName(clientEvent.MONEY_UPDATE), (newBalance: number): void => {
      this.inventory.money = [newBalance, this.inventory.money[0], this.engine.CL.gametime];
      this.#buyMenu.refreshIfOpen();
    });

    this.engine.eventBus.subscribe(clientEventName(clientEvent.BUY_MESSAGE), (message: string): void => {
      this.#buyMenu.showFeedback(message);
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
    this.#drawBuyzonePrompt();
    this.#buyMenu.tick(this.engine.CL.gametime);
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

  /**
   * Whether the player is currently standing in a buyzone, per the last-synced clientdata --
   * used by `HellwaveBuyMenu`'s `hw_buymenu` command handler, which can't read `game.clientdata`
   * directly since `game` is protected.
   * @returns Whether the player is currently in a buyzone.
   */
  isInBuyzone(): boolean {
    return this.game.clientdata.buyzone === 1;
  }

  /**
   * Snapshot of the clientdata fields a `BuyMenuItem.available()` predicate may inspect (e.g.
   * armor/ammo caps) -- lets `HellwaveBuyMenu` gray out already-maxed items without a server
   * round-trip. `game.clientdata` itself is protected.
   * @returns Current armor value and shell ammo count.
   */
  getBuyAvailabilityContext(): BuyMenuAvailabilityContext {
    return { armorvalue: this.game.clientdata.armorvalue, ammo_shells: this.game.clientdata.ammo_shells };
  }

  /**
   * Toggle the buy-menu blur/desaturate post-process stack -- called by `HellwaveBuyMenu`'s page
   * on `onEnter`/`onExit`. Not applied over the game-over color-grade stack, which already owns
   * the screen at that point.
   */
  setBuyMenuBlur(active: boolean): void {
    if (this.stats?.phase === phases.gameover) {
      return;
    }

    if (active) {
      this.engine.PostProcess.setStack(buymenuPostProcessStack);
    } else {
      this.engine.PostProcess.clearStack();
    }
  }

  #drawBuyzonePrompt(): void {
    if (this.game.clientdata.buyzone === 1) {
      this.sbar.drawString(-16 * 10, -48, 'Buyzone!', 2.0, new Vector(0.0, 1.0, 0.0));
    }
  }

  #drawAccountBalance(): void {
    if (this.stats!.phase !== phases.quiet || this.inventory.money[0] === null) {
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
    if (this.stats!.phase === phases.quiet) {
      const roundString = `${this.stats!.round_current} / ${this.stats!.round_total}`;

      this.sbar.drawString(this.sbar.width - roundString.length * 16, -48, roundString, 2.0);
      this.sbar.drawString(this.sbar.alignCenterHorizontally(16 * 7), -80, Q.secsToTime(this.stats!.phase_ending_time - this.engine.CL.gametime), 2.0);
      return;
    }

    if (this.stats!.phase === phases.normal || this.stats!.phase === phases.action) {
      const waveString = `${this.stats!.monsters_killed} / ${this.stats!.round_monsters_limit}`;

      this.sbar.drawString(this.sbar.width - waveString.length * 16, -48, waveString, 2.0);
    }

    this.sbar.drawString(0, -48, phaseLabels[this.stats!.phase!] ?? '', 2.0);
  }

  static override Init(engineAPI: ClientEngineAPI): void {
    super.Init(engineAPI);

    HellwaveBuyMenu.Init(engineAPI);
  }

  static override Shutdown(engineAPI: ClientEngineAPI): void {
    super.Shutdown(engineAPI);

    HellwaveBuyMenu.Shutdown(engineAPI);
  }
}
