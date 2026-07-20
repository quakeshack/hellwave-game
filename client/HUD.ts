import { serializableObject } from '../../id1/helper/MiscHelpers.ts';
import type { ClientEdict, ClientEngineAPI, MenuItem, MenuPage, PostProcessStack } from '../../../shared/GameInterfaces.ts';

import { K } from '../../../shared/Keys.ts';
import Q from '../../../shared/Q.ts';
import Vector from '../../../shared/Vector.ts';

import { MessageBag, Q1HUD } from '../../id1/client/HUD.ts';
import { clientEvent, clientEventName, colors, contentShift, formatMoney, toBuyImpulse } from '../Defs.ts';
import { buyMenuItems } from '../entity/Player.ts';
import { phaseLabels, phases } from '../Phases.ts';

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

const gameoverPostProcessStack = [
  { id: 'color-grade', settings: { saturation: 0.0, tintColor: new Vector(1.0, 0.0, 0.0), tintStrength: 1.0, pulsePeriod: 1.0, pulseStrength: 0.5 } },
  { id: 'blur', settings: { radius: 3.0 } },
] as PostProcessStack;

const buymenuPostProcessStack = [
  { id: 'color-grade', settings: { saturation: 0.3 } },
  { id: 'blur', settings: { radius: 8 } },
] as PostProcessStack;

// Buy-menu row layout, shared between the `VerticalLayout` config and the focus-marker
// `customDraw` below so the two stay in sync.
const BUY_MENU_START_Y = 40;
const BUY_MENU_SPACING = 4;
const BUY_MENU_CURSOR_X = 24;

@serializableObject
export default class HellwaveHUD extends Q1HUD {
  declare protected readonly game: ClientGameAPI;
  declare protected stats: HellwaveStatsInfo | null;

  inventory: { money: MoneyBalanceState } = {
    /** Current account balance [new balance, old balance, timestamp]. */
    money: [null, null, -Infinity],
  };

  #buyMenuActions: Map<number, MenuItem> = new Map();
  #buyMoneyLabel: MenuItem | null = null;
  #buyFeedbackLabel: MenuItem | null = null;
  #buyFeedbackExpiry = -Infinity;

  // Whichever instance is currently live -- a fresh `HellwaveHUD` is constructed on every map
  // load (see `ClientGameAPI`), but the `hw_buymenu` command is only ever registered once (see
  // `Init`), so its handler needs a way to reach the live instance's clientdata.
  static #activeHUD: HellwaveHUD | null = null;

  override init(): void {
    super.init();

    HellwaveHUD.#activeHUD = this;
  }

  override shutdown(): void {
    super.shutdown();

    if (HellwaveHUD.#activeHUD === this) {
      HellwaveHUD.#activeHUD = null;
    }
  }

  protected override _newStats(): HellwaveStatsInfo {
    return new HellwaveStatsInfo(this.engine);
  }

  protected override _newMessageBag(): MessageBag {
    return new HellwaveMessageBag(this.engine, this.sbar);
  }

  protected override _subscribeToEvents(): void {
    super._subscribeToEvents();

    this.#registerBuyMenu();

    this.engine.eventBus.subscribe('client.clientdata.field-changed', (field: string, value: number | string | boolean | null): void => {
      switch (field) {
        // Opening the buy menu is handled by the `hw_buymenu` command (see `Init`) -- the server
        // only tells us whether the player is physically in a buyzone. The only thing this needs
        // to react to is an *involuntary* close: leaving the zone, or the round moving on, while
        // the menu happens to be showing.
        case 'buyzone': {
          console.assert(typeof value === 'number' && value >= -1 && value <= 1);
          const buyzone = value as -1 | 0 | 1;

          if (buyzone !== 1 && this.engine.Menu.IsOpen('hellwave_buy')) {
            this.engine.Menu.Pop();
          }
          break;
        }

        case 'money':
          console.assert(typeof value === 'number');
          this.inventory.money = [value as number, this.inventory.money[0], this.engine.CL.gametime];
          this.#refreshBuyMenuIfOpen();
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
      this.#refreshBuyMenuIfOpen();
    });

    this.engine.eventBus.subscribe(clientEventName(clientEvent.BUY_MESSAGE), (message: string): void => {
      const feedbackLabel = this.#buyFeedbackLabel;

      if (feedbackLabel === null) {
        return;
      }

      feedbackLabel.label = message;
      feedbackLabel.visible = true;
      this.#buyFeedbackExpiry = this.engine.CL.gametime + 3.0;
    });
  }

  /**
   * Refresh the buy menu's rows and balance label -- only meaningful (and only does work) while
   * the menu is actually open, called both on the periodic clientdata sync and on the immediate
   * `MONEY_UPDATE` event a purchase fires, whichever lands first.
   */
  #refreshBuyMenuIfOpen(): void {
    if (!this.engine.Menu.IsOpen('hellwave_buy')) {
      return;
    }

    this.#refreshBuyMenuActions();
    this.#refreshBuyMoneyLabel();
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

  /**
   * Register the buy menu as a real page on the menu stack -- instead of a manually drawn
   * overlay -- so it gets mouse click/hover, cursor handling, and Escape/Back navigation for
   * free from the same pipeline the main menu already uses. Opened by the `hw_buymenu` client
   * command (see `Init`) whenever the server confirms we're in a buyzone; closed
   * either by the player (Escape/Back, purely local) or reactively if the server later says
   * we've left the zone. The server has no notion of "menu open" at all -- purchases carry their
   * own dedicated impulse range (`toBuyImpulse`/`fromBuyImpulse` in Defs.ts) and are validated
   * independently each time one lands, so this page can freely open/close without any
   * server round-trip.
   */
  #registerBuyMenu(): void {
    const { Action, Label, MenuPage, VerticalLayout } = this.engine.Menu;

    this.#buyMoneyLabel = new Label({ label: '' });
    this.#buyFeedbackLabel = new Label({ label: '', visible: false });

    const items: MenuItem[] = [
      new Label({ label: 'Available for purchase:' }),
      this.#buyMoneyLabel,
      this.#buyFeedbackLabel,
    ];

    for (const impulse of Object.keys(buyMenuItems)) {
      const action = new Action({
        label: '',
        visible: false,
        action: (): void => { this.engine.AppendConsoleText(`impulse ${toBuyImpulse(Number(impulse))}\n`); },
      });
      this.#buyMenuActions.set(Number(impulse), action);
      items.push(action);
    }

    const page = new MenuPage({
      // The built-in blinking cursor glyph is drawn via `customDraw` below instead -- see there
      // for why.
      layout: new VerticalLayout({
        startY: BUY_MENU_START_Y, spacing: BUY_MENU_SPACING, labelX: 40, cursorX: BUY_MENU_CURSOR_X, showCursor: false,
      }),
      items,
      // Hellwave is always coop-shaped, even solo -- other players, monsters, and the round
      // timer must keep running while one player is shopping, unlike the classic single-player
      // pause-on-menu behavior every other page keeps by default.
      pausesGame: false,
      onEnter: (): void => {
        this.#refreshBuyMenuActions();
        this.#refreshBuyMoneyLabel();
        this.#updateBuyzonePostProcess(true);
      },
      onExit: (): void => { this.#updateBuyzonePostProcess(false); },
      onEscape: (): void => { this.engine.Menu.Pop(); },
      // `VerticalLayout`'s own cursor (code 12/13) draws whatever a font's low-range "graphics"
      // cells happen to contain -- not guaranteed to look like a selection indicator at all. Draw
      // a plain printable `>` next to the focused row instead, computed fresh every frame directly
      // from `page.cursor`/`page.items` so it's always in sync without a separate refresh hook.
      customDraw: (page: MenuPage): void => {
        page.layout?.draw(page.items, page.cursor);

        const { Menu } = this.engine;
        let y = BUY_MENU_START_Y;

        for (const [index, item] of page.items.entries()) {
          if (!item.visible) {
            continue;
          }

          if (index === page.cursor && item.focusable) {
            Menu.PrintWhite(BUY_MENU_CURSOR_X, y, '>');
          }

          y += item.getHeight() + BUY_MENU_SPACING;
        }
      },
      customHandleInput: (key: K, _page: MenuPage, defaultHandleInput: (key: K) => boolean): boolean => {
        if (key >= (49 as K) && key <= (57 as K)) { // '1'-'9'
          this.engine.AppendConsoleText(`impulse ${toBuyImpulse(key - 48)}\n`); // key - '0'
          return true;
        }

        return defaultHandleInput(key);
      },
    });

    this.engine.Menu.RegisterPage('hellwave_buy', page);
  }

  #refreshBuyMenuActions(): void {
    const currentMoney = this.inventory.money[0] ?? 0;

    for (const [impulse, item] of Object.entries(buyMenuItems)) {
      const action = this.#buyMenuActions.get(Number(impulse))!;
      action.visible = item.cost <= currentMoney;
      action.label = `[${impulse}] ${formatMoney(item.cost).padStart(5)} - ${item.label}`;
    }
  }

  #refreshBuyMoneyLabel(): void {
    this.#buyMoneyLabel!.label = `Balance: ${formatMoney(this.inventory.money[0] ?? 0)}`;
  }

  #drawBuyMenu(): void {
    // Purchase feedback (e.g. "bought Heavy Armor!") persists for a few seconds, ticked here
    // since this runs every frame regardless of whether the buy menu page itself is visible.
    const feedbackLabel = this.#buyFeedbackLabel;

    if (feedbackLabel !== null && feedbackLabel.visible && this.engine.CL.gametime >= this.#buyFeedbackExpiry) {
      feedbackLabel.visible = false;
    }

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

  #updateBuyzonePostProcess(buyMenuOpen: boolean): void {
    if (this.stats?.phase !== phases.gameover) {
      if (buyMenuOpen) {
        this.engine.PostProcess.setStack(buymenuPostProcessStack);
      } else {
        this.engine.PostProcess.clearStack();
      }
    }
  }

  static override Init(engineAPI: ClientEngineAPI): void {
    super.Init(engineAPI);

    // Registered once here rather than per-instance -- a fresh `HellwaveHUD` is constructed on
    // every map load (see `ClientGameAPI`), and `Cmd.AddCommand` asserts when a command name is
    // already registered. `#activeHUD` (kept current by `init`/`shutdown`) lets this single,
    // long-lived handler still read whichever instance is actually live.
    engineAPI.RegisterCommand('hw_buymenu', (): void => {
      const activeHUD = HellwaveHUD.#activeHUD;

      if (activeHUD !== null && activeHUD.game.clientdata.buyzone === 1 && !engineAPI.Menu.IsOpen('hellwave_buy')) {
        engineAPI.Menu.Open('hellwave_buy');
      }
    });
  }

  static override Shutdown(engineAPI: ClientEngineAPI): void {
    super.Shutdown(engineAPI);

    engineAPI.UnregisterCommand('hw_buymenu');
  }
}
