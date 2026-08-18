import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { CardSprite } from './CardSprite';
import type { LastCombo } from '../net/pb';
import { sound } from '../audio/sound';
import { classifyCombo } from '../rules/cards';

export class PileView extends Container {
  private cardContainer: Container;
  private bannerContainer: Container;
  private bannerBg: Graphics;
  private bannerTitle: Text;
  private bannerSubtitle: Text;

  private currentCombo: LastCombo | null = null;
  private cardSprites: CardSprite[] = [];

  constructor() {
    super();

    this.cardContainer = new Container();
    this.addChild(this.cardContainer);

    this.bannerContainer = new Container();
    this.bannerBg = new Graphics();
    this.bannerContainer.addChild(this.bannerBg);

    const titleStyle = new TextStyle({
      fontFamily: 'system-ui, sans-serif',
      fontSize: 12,
      fontWeight: '800',
      fill: '#fde047',
      letterSpacing: 0.5,
    });
    this.bannerTitle = new Text({ text: '', style: titleStyle });
    this.bannerTitle.anchor.set(0.5, 0.5);
    this.bannerContainer.addChild(this.bannerTitle);

    const subtitleStyle = new TextStyle({
      fontFamily: 'system-ui, sans-serif',
      fontSize: 10,
      fontWeight: '600',
      fill: '#cbd5e1',
    });
    this.bannerSubtitle = new Text({ text: '', style: subtitleStyle });
    this.bannerSubtitle.anchor.set(0.5, 0.5);
    this.bannerContainer.addChild(this.bannerSubtitle);

    this.bannerContainer.visible = false;
    this.addChild(this.bannerContainer);
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

    // Clear previous card sprites
    for (const s of this.cardSprites) {
      this.cardContainer.removeChild(s);
      s.destroy();
    }
    this.cardSprites = [];

    const cards = combo.cards;
    const count = cards.length;
    const spacing = count > 1 ? Math.min(34, 150 / (count - 1)) : 0;
    const startX = -((count - 1) * spacing) / 2;

    sound.playCardSnap();

    for (let i = 0; i < count; i++) {
      const code = cards[i];
      const sprite = new CardSprite(code, true);

      // Random natural physical scatter
      const randomAngle = (Math.random() - 0.5) * 0.08;

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
      sprite.targetScale = 0.9;

      this.cardSprites.push(sprite);
      this.cardContainer.addChild(sprite);
    }

    // Format Combo Description Banner
    const classified = classifyCombo(cards);
    let comboName = combo.type ? combo.type.replace(/_/g, ' ').toUpperCase() : 'PLAY';
    if (classified) {
      if (classified.type === 'single') comboName = 'SINGLE';
      else if (classified.type === 'pair') comboName = 'PAIR';
      else if (classified.type === 'straight') comboName = 'STRAIGHT';
      else if (classified.type === 'flush') comboName = 'FLUSH';
      else if (classified.type === 'full_house') comboName = 'FULL HOUSE';
      else if (classified.type === 'quads') comboName = 'FOUR OF A KIND';
      else if (classified.type === 'straight_flush') comboName = 'STRAIGHT FLUSH';
    }

    this.bannerTitle.text = comboName;
    this.bannerSubtitle.text = playerName ? `Played by ${playerName}` : '';

    const bannerW = Math.max(130, this.bannerTitle.width + 36);
    const bannerH = 34;
    this.bannerBg.clear();
    this.bannerBg.roundRect(-bannerW / 2, -bannerH / 2, bannerW, bannerH, 8);
    this.bannerBg.fill({ color: 0x0f172a, alpha: 0.9 });
    this.bannerBg.stroke({ width: 1.2, color: 0xeab308, alpha: 0.85 });

    this.bannerTitle.position.set(0, -6);
    this.bannerSubtitle.position.set(0, 8);
    this.bannerContainer.position.set(0, 68);
    this.bannerContainer.visible = true;
  }

  public clearPile(): void {
    if (this.currentCombo === null && this.cardSprites.length === 0) return;

    this.currentCombo = null;
    this.bannerContainer.visible = false;

    // Animate cards fading away
    for (const sprite of this.cardSprites) {
      sprite.targetAlpha = 0;
      sprite.targetY = sprite.y - 40;
    }

    setTimeout(() => {
      for (const sprite of this.cardSprites) {
        this.cardContainer.removeChild(sprite);
        sprite.destroy();
      }
      this.cardSprites = [];
    }, 280);
  }

  public update(delta: number): void {
    for (const sprite of this.cardSprites) {
      sprite.update(delta);
    }
  }
}
