import Q from '../../../shared/Q.mjs';
import Vector from '../../../shared/Vector.mjs';

import { buyMenuItems } from '../entity/Player.mjs';
import { clientEvent, clientEventName, colors, contentShift, formatMoney } from '../Defs.mjs';
import { phases } from '../GameManager.mjs';
import { MessageBag, Q1HUD } from '../../../game/id1/client/HUD.mjs';
import { HellwaveStatsInfo } from './Sync.mjs';
import { ClientGameAPI } from '../main.mjs';

class HellwaveMessageBag extends MessageBag {
  _offset = [0, -64];
}

export default class HellwaveHUD extends Q1HUD {
  _newStats() {
    return new HellwaveStatsInfo(this.engine);
  }

  _newMessageBag() {
    return new HellwaveMessageBag(this.engine, this.sbar);
  }

  _subscribeToEvents() {
    super._subscribeToEvents();

    this.engine.eventBus.subscribe(clientEventName(clientEvent.STATS_UPDATED), (slot, value) => {
      const game = /** @type {ClientGameAPI} */ (this.game);

      if (slot === 'phase') {
        this.engine.ContentShift(contentShift.info, this.engine.IndexToRGB(colors.HUD_CSHIFT_BONUSFLASH), 0.2);

        switch (value) {
          case phases.quiet:
            game.sfx.phase.quiet[Math.floor(Math.random() * game.sfx.phase.quiet.length)].play();
            break;

          case phases.normal:
            game.sfx.phase.normal[Math.floor(Math.random() * game.sfx.phase.normal.length)].play();
            break;
        }
      }
    });

    this.engine.eventBus.subscribe(clientEventName(clientEvent.MONEY_UPDATE), (newBalance) => {
      this.inventory.money = [newBalance, this.inventory.money[0], this.engine.CL.gametime];
    });
  }

  inventory = {
    /** @type {number[]} current account balance */
    money: [null, null, -Infinity],
  };

  _drawStatusBar() {
    if (this.game.clientdata.spectating) {
      const msg = 'Spectating... Waiting for next round';
      const x = this.sbar.alignCenterHorizontally(16 * msg.length);
      this.sbar.drawString(x, -24, msg, 2.0);
      return;
    }

    super._drawStatusBar();
  }

  draw() {
    super.draw();

    this.#drawAccountBalance();
    this.#drawRoundStats();
    this.#drawBuyMenu();
  }

  #drawBuyMenu() {
    if (this.game.clientdata.buyzone === 0) {
      return; // not in a buyzone
    }

    if (this.game.clientdata.buyzone === 1 || this.game.clientdata.buyzone === 2) {
      this.sbar.drawString(-16 * 10, -48, 'Buyzone!', 2.0, new Vector(0.0, 1.0, 0.0));
    }

    if (this.game.clientdata.buyzone === 2) {
      const startY = -48 - 16 * 16;
      this.sbar.drawString(0, startY, 'Available for purchase:', 2.0);

      for (const [impulse, item] of Object.entries(buyMenuItems)) {
        if (item.cost <= this.inventory.money[0]) {
          this.sbar.drawString(0, startY + 24 + 16 * +impulse, `[${impulse}] ${formatMoney(item.cost).padStart(5)} - ${item.label}`, 2.0);
        }
      }
    }
  }

  #drawAccountBalance() {
    if (this.inventory.money === null) {
      return; // no money to display
    }

    const stats = /** @type {HellwaveStatsInfo} */ (this.stats);

    if (stats.phase !== phases.quiet) {
      return; // only show money in quiet phase
    }

    const color = new Vector(1.0, 1.0, 1.0);

    if (this.inventory.money[0] !== null) {
      const newBalance = this.inventory.money[0] || 0;
      const oldBalance = this.inventory.money[1] || 0;
      const colorComponent = Math.min(1.0, Math.max(0.0, (this.engine.CL.gametime - this.inventory.money[2]) / 3.0));
      if (newBalance > oldBalance) {
        color[0] = color[2] = colorComponent;
      } else if (newBalance < oldBalance) {
        color[1] = color[2] = colorComponent;
      }
      this.sbar.drawString(0, -48, formatMoney(newBalance), 2.0, color);
    }
  }

  #drawRoundStats() {
    const stats = /** @type {HellwaveStatsInfo} */ (this.stats);

    // in quiet phase, we show the timer
    if (stats.phase === phases.quiet) {
      const roundString = `${stats.round_current} / ${stats.round_total}`;
      this.sbar.drawString(this.sbar.width - roundString.length * 16, -48, roundString, 2.0);

      this.sbar.drawString(this.sbar.alignCenterHorizontally(16 * 7), -80, Q.secsToTime(stats.phase_ending_time - this.engine.CL.gametime), 2.0);
    } else {
      if (stats.phase === phases.normal || stats.phase === phases.action) {
        const waveString = `${stats.monsters_killed} / ${stats.round_monsters_limit}`;
        this.sbar.drawString(this.sbar.width - waveString.length * 16, -48, waveString, 2.0);
      }

      this.sbar.drawString(0, -48, phases[stats.phase] || '', 2.0);
    }
  }
};
