import type { ClientEngineAPI, MenuItem, MenuPage } from '../../../../shared/GameInterfaces.ts';

import { K } from '../../../../shared/Keys.ts';
import { formatMoney, toBuyImpulse } from '../../Defs.ts';
import { buyMenuItems } from '../../entity/Player.ts';

import MenuCommon from './MenuCommon.ts';
import type HellwaveHUD from '../HUD.ts';

// How long purchase feedback (e.g. "bought Heavy Armor!") stays visible before fading, ticked
// down in `tick()` every HUD frame regardless of whether the buy page itself is open.
const FEEDBACK_DURATION_SECONDS = 3.0;

// Buy-menu row layout, shared between the `VerticalLayout` config and the focus-marker
// `customDraw` below so the two stay in sync.
const BUY_MENU_START_Y = 70;
const BUY_MENU_SPACING = 8;
const BUY_MENU_CURSOR_X = 40;
const BUY_MENU_LABEL_X = 70;

/**
 * The hellwave buy menu ('hellwave_buy'), a real `MenuPage` on the stack rather than a manually
 * drawn HUD overlay (see plans/hellwave-buy-menu-mouse.md for why it's built this way). One
 * instance is owned by each live `HellwaveHUD` (a fresh HUD is constructed on every map load) --
 * holds a plain reference back to its owner to read `inventory`/clientdata/`stats`-derived state,
 * the same "hold a reference to the owner, read its public state directly" shape `EntityWrapper<T>`
 * already uses server-side, just without the `WeakRef`: a HUD instance has a simple one-map-load
 * lifetime, with no serialization/recycling concern to guard against.
 */
export default class HellwaveBuyMenu {
  // Whichever instance is currently live -- the `hw_buymenu` command is registered once,
  // statically (see `Init`), not per-instance, so its handler needs a way to reach whichever
  // HUD/BuyMenu pair is currently active.
  static #active: HellwaveBuyMenu | null = null;

  readonly #hud: HellwaveHUD;
  readonly #engine: ClientEngineAPI;

  #actions: Map<number, MenuItem> = new Map();
  #moneyLabel: MenuItem | null = null;
  #feedbackLabel: MenuItem | null = null;
  #feedbackExpiry = -Infinity;

  constructor(hud: HellwaveHUD, engine: ClientEngineAPI) {
    this.#hud = hud;
    this.#engine = engine;
  }

  /**
   * Register the buy menu as a real page on the menu stack -- instead of a manually drawn
   * overlay -- so it gets mouse click/hover, cursor handling, and Escape/Back navigation for
   * free from the same pipeline the main menu already uses. Opened by the `hw_buymenu` client
   * command (see `Init`) whenever the server confirms we're in a buyzone; closed either by the
   * player (Escape/Back, purely local) or reactively if the server later says we've left the
   * zone. The server has no notion of "menu open" at all -- purchases carry their own dedicated
   * impulse range (`toBuyImpulse`/`fromBuyImpulse` in Defs.ts) and are validated independently
   * each time one lands, so this page can freely open/close without any server round-trip.
   */
  register(): void {
    const { Action, Label, MenuPage: MenuPageClass, VerticalLayout } = this.#engine.Menu;
    const viewport = MenuCommon.getViewport(this.#engine);

    this.#moneyLabel = new Label({ label: '' });
    this.#feedbackLabel = new Label({ label: '', visible: false });

    const items: MenuItem[] = [
      new Label({ label: 'Available for purchase:' }),
      this.#moneyLabel,
    ];

    for (const impulse of Object.keys(buyMenuItems)) {
      const action = new Action({
        label: '',
        action: (): void => { this.#engine.AppendConsoleText(`impulse ${toBuyImpulse(Number(impulse))}\n`); },
      });
      this.#actions.set(Number(impulse), action);
      items.push(action);
    }

    // Below the list, not above it -- so a purchase confirmation/rejection message never
    // shifts the row positions the player is currently looking at.
    items.push(this.#feedbackLabel);

    const page = new MenuPageClass({
      // The built-in blinking cursor glyph is drawn via `customDraw` below instead -- see there
      // for why.
      layout: new VerticalLayout({
        startY: BUY_MENU_START_Y, spacing: BUY_MENU_SPACING, labelX: BUY_MENU_LABEL_X, cursorX: BUY_MENU_CURSOR_X, showCursor: false,
      }),
      items,
      // Hellwave is always coop-shaped, even solo -- other players, monsters, and the round
      // timer must keep running while one player is shopping, unlike the classic single-player
      // pause-on-menu behavior every other page keeps by default.
      pausesGame: false,
      onEnter: (): void => {
        this.#refreshActions();
        this.#refreshMoneyLabel();
        this.#hud.setBuyMenuBlur(true);
      },
      onExit: (): void => { this.#hud.setBuyMenuBlur(false); },
      onEscape: (): void => { this.#engine.Menu.Pop(); },
      // `VerticalLayout`'s own cursor (code 12/13) draws whatever a font's low-range "graphics"
      // cells happen to contain -- not guaranteed to look like a selection indicator at all. Draw
      // a plain printable `>` next to the focused row instead, computed fresh every frame directly
      // from `page.cursor`/`page.items` so it's always in sync without a separate refresh hook.
      customDraw: (page: MenuPage): void => {
        page.layout?.draw(page.items, page.cursor);

        const { Menu } = this.#engine;
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
          const impulseId = key - 48; // key - '0'
          const action = this.#actions.get(impulseId);

          // Rows are always shown now, even when unaffordable/unbuyable (dimmed via `enabled`)
          // -- the numeric shortcut has to respect that the same way a click already does.
          if (action?.enabled) {
            this.#engine.AppendConsoleText(`impulse ${toBuyImpulse(impulseId)}\n`);
          }

          return true;
        }

        return defaultHandleInput(key);
      },
      viewport,
    });

    this.#engine.Menu.RegisterPage('hellwave_buy', page);
    HellwaveBuyMenu.#active = this;
  }

  /**
   * Clear this instance's claim on the "currently active" slot the `hw_buymenu` command reads --
   * called from `HellwaveHUD.shutdown()`.
   */
  dispose(): void {
    if (HellwaveBuyMenu.#active === this) {
      HellwaveBuyMenu.#active = null;
    }
  }

  isOpen(): boolean {
    return this.#engine.Menu.IsOpen('hellwave_buy');
  }

  /**
   * Refresh the buy menu's rows and balance label -- only meaningful (and only does work) while
   * the menu is actually open, called both on the periodic clientdata sync and on the immediate
   * `MONEY_UPDATE` event a purchase fires, whichever lands first.
   */
  refreshIfOpen(): void {
    if (!this.isOpen()) {
      return;
    }

    this.#refreshActions();
    this.#refreshMoneyLabel();
  }

  /**
   * Show purchase feedback (e.g. "bought Heavy Armor!") for a few seconds -- ticked down in
   * `tick()`, which runs every HUD frame regardless of whether the buy page itself is visible.
   */
  showFeedback(message: string): void {
    const feedbackLabel = this.#feedbackLabel;

    if (feedbackLabel === null) {
      return;
    }

    feedbackLabel.label = message;
    feedbackLabel.visible = true;
    this.#feedbackExpiry = this.#engine.CL.gametime + FEEDBACK_DURATION_SECONDS;
  }

  /**
   * Tick down purchase feedback visibility. Called every HUD frame, not just while the buy page
   * is open.
   */
  tick(gametime: number): void {
    const feedbackLabel = this.#feedbackLabel;

    if (feedbackLabel !== null && feedbackLabel.visible && gametime >= this.#feedbackExpiry) {
      feedbackLabel.visible = false;
    }
  }

  /**
   * Refresh every row's label and enabled state. Rows are always shown -- items the player can't
   * currently afford or buy (e.g. armor/ammo already at cap) stay visible but dimmed (`Action`'s
   * own `enabled`-gated draw/activation), so the full catalog is always visible as a reference.
   */
  #refreshActions(): void {
    const currentMoney = this.#hud.inventory.money[0] ?? 0;
    const availabilityContext = this.#hud.getBuyAvailabilityContext();

    for (const [impulse, item] of Object.entries(buyMenuItems)) {
      const action = this.#actions.get(Number(impulse))!;
      const buyable = item.available?.(availabilityContext) ?? true;

      action.enabled = buyable && item.cost <= currentMoney;
      action.label = `[${impulse}] ${formatMoney(item.cost).padStart(5)} - ${item.label}`;
    }
  }

  #refreshMoneyLabel(): void {
    this.#moneyLabel!.label = `Balance: ${formatMoney(this.#hud.inventory.money[0] ?? 0)}`;
  }

  static Init(engineAPI: ClientEngineAPI): void {
    engineAPI.RegisterCommand('hw_buymenu', (): void => {
      const active = HellwaveBuyMenu.#active;

      if (active !== null && active.#hud.isInBuyzone() && !engineAPI.Menu.IsOpen('hellwave_buy')) {
        engineAPI.Menu.Open('hellwave_buy');
      }
    });
  }

  static Shutdown(engineAPI: ClientEngineAPI): void {
    engineAPI.UnregisterCommand('hw_buymenu');
  }
}
