import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { CardSprite } from './CardSprite';
import type { LastCombo } from '../net/pb';
import { sound } from '../audio/sound';
import { CardCombo } from '../domain';

export class PileView extends Container {
  private cardContainer: Container;
  private bannerContainer: Container;
  private bannerBg: Graphics;
  private bannerTitle: Text;
  private bannerSubtitle: Text;

  private currentCombo: LastCombo | null = null;
  private cardSprites: CardSprite[] = [];
  private retiringSprites: CardSprite[] = [];
  private clearTimer: number | null = null;

  constructor() {
    super();

    this.cardContainer = new Container();
    this.addChild(this.cardContainer);

    this.bannerContainer = new Container();
    this.bannerBg = new Graphics();
    this.bannerContainer.addChild(this.bannerBg);

    const titleStyle = new TextStyle({
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: 12,
      fontWeight: '800',
      fill: '#fde047',
      letterSpacing: 0.8,
    });
    this.bannerTitle = new Text({ text: '', style: titleStyle });
    this.bannerTitle.anchor.set(0.5, 0.5);
    this.bannerContainer.addChild(this.bannerTitle);

    const subtitleStyle = new TextStyle({
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: 10,
      fontWeight: '600',
      fill: '#94a3b8',
    });
    this.bannerSubtitle = new Text({ text: '', style: subtitleStyle });
    this.bannerSubtitle.anchor.set(0.5, 0.5);
    this.bannerContainer.addChild(this.bannerSubtitle);

    this.bannerContainer.visible = false;
    this.addChild(this.bannerContainer);
  }

  private purgeAllCardSprites(): void {
    if (this.clearTimer !== null) {
      clearTimeout(this.clearTimer);
      this.clearTimer = null;
    }
    while (this.cardContainer.children.length > 0) {
      const child = this.cardContainer.children[0];
      this.cardContainer.removeChild(child);
      child.destroy();
    }
    this.cardSprites = [];
    this.retiringSprites = [];
  }

  public setCombo(
    combo: LastCombo | null,
    playerName?: string,
    originPos?: { x: number; y: number }
  ): void {
    if (!combo || !combo.cards || combo.cards.length === 0) {
      this.clearPile();
      return;
    }

    // Check if same combo
    const sameCards =
      this.currentCombo &&
      this.currentCombo.cards.length === combo.cards.length &&
      this.currentCombo.cards.every((c, i) => c === combo.cards[i]);

    if (sameCards) return;

    this.currentCombo = combo;
    this.purgeAllCardSprites();

    const cards = combo.cards;
    const count = cards.length;
    const spacing = count > 1 ? Math.min(36, 160 / (count - 1)) : 0;
    const startX = -((count - 1) * spacing) / 2;

    sound.playCardSnap();

    for (let i = 0; i < count; i++) {
      const code = cards[i];
      const sprite = new CardSprite(code, true);

      // Subtle natural physical scatter
      const randomAngle = (Math.random() - 0.5) * 0.06;

      if (originPos) {
        const localOrigin = this.toLocal(originPos);
        sprite.x = localOrigin.x;
        sprite.y = localOrigin.y;
        sprite.scale.set(0.7);
      } else {
        sprite.x = startX + i * spacing;
        sprite.y = -20;
        sprite.scale.set(0.85);
      }

      sprite.targetX = startX + i * spacing;
      sprite.targetY = 0;
      sprite.targetRotation = randomAngle;
      sprite.targetScale = 0.92;

      this.cardSprites.push(sprite);
      this.cardContainer.addChild(sprite);
    }

    // Format Combo Description Banner
    const classified = CardCombo.evaluate(cards);
    const comboName = classified
      ? classified.type.replace(/_/g, ' ').toUpperCase()
      : combo.type ? combo.type.replace(/_/g, ' ').toUpperCase() : 'PLAY';

    this.bannerTitle.text = comboName;
    this.bannerSubtitle.text = playerName ? `Played by ${playerName}` : '';

    const bannerW = Math.max(136, this.bannerTitle.width + 36);
    const bannerH = 34;
    this.bannerBg.clear();
    // Frosted glass background with gold rim
    this.bannerBg.roundRect(-bannerW / 2, -bannerH / 2, bannerW, bannerH, 8);
    this.bannerBg.fill({ color: 0x0f172a, alpha: 0.92 });
    this.bannerBg.stroke({ width: 1.2, color: 0xd97706, alpha: 0.8 });

    this.bannerTitle.position.set(0, -6);
    this.bannerSubtitle.position.set(0, 8);
    this.bannerContainer.position.set(0, 70);
    this.bannerContainer.visible = true;
  }

  public clearPile(): void {
    if (this.currentCombo === null && this.cardSprites.length === 0 && this.retiringSprites.length === 0) return;

    if (this.clearTimer !== null) {
      clearTimeout(this.clearTimer);
      this.clearTimer = null;
    }

    this.currentCombo = null;
    this.bannerContainer.visible = false;

    // Clean up any previously retiring sprites
    for (const old of this.retiringSprites) {
      this.cardContainer.removeChild(old);
      old.destroy();
    }

    this.retiringSprites = [...this.cardSprites];
    this.cardSprites = [];

    for (const sprite of this.retiringSprites) {
      sprite.targetAlpha = 0;
      sprite.targetY = sprite.y - 35;
    }

    this.clearTimer = window.setTimeout(() => {
      this.clearTimer = null;
      for (const sprite of this.retiringSprites) {
        this.cardContainer.removeChild(sprite);
        sprite.destroy();
      }
      this.retiringSprites = [];
    }, 260);
  }

  public update(delta: number): void {
    for (const sprite of this.cardSprites) {
      sprite.update(delta);
    }
    for (const sprite of this.retiringSprites) {
      sprite.update(delta);
    }
  }
}

