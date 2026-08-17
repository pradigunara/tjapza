import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { getRank, getSuit, RANK_NAMES, SUIT_SYMBOLS } from '../rules/cards';

export const CARD_WIDTH = 76;
export const CARD_HEIGHT = 108;
export const CARD_RADIUS = 8;

export class CardSprite extends Container {
  public cardCode: number;
  public faceUp: boolean;
  public selected = false;
  public isPlayable = true;
  public isHovered = false;

  // Visual containers
  private shadowGraphics: Graphics;
  private cardGraphics: Graphics;
  private selectionGlow: Graphics;
  private frontContainer: Container;
  private backContainer: Container;

  // Text elements
  private topLeftRankText!: Text;
  private topLeftSuitText!: Text;
  private bottomRightRankText!: Text;
  private bottomRightSuitText!: Text;
  private centerSuitText!: Text;

  // Smooth tween targets
  public targetX = 0;
  public targetY = 0;
  public targetRotation = 0;
  public targetScale = 1;
  public targetAlpha = 1;

  public onCardClick?: (card: CardSprite) => void;

  constructor(cardCode: number, faceUp = true) {
    super();
    this.cardCode = cardCode;
    this.faceUp = faceUp;

    // Anchor at center of card
    this.pivot.set(CARD_WIDTH / 2, CARD_HEIGHT / 2);

    // 1. Shadow
    this.shadowGraphics = new Graphics();
    this.addChild(this.shadowGraphics);

    // 2. Base card surface
    this.cardGraphics = new Graphics();
    this.addChild(this.cardGraphics);

    // 3. Selection outline
    this.selectionGlow = new Graphics();
    this.addChild(this.selectionGlow);

    // 4. Front & Back containers
    this.frontContainer = new Container();
    this.backContainer = new Container();
    this.addChild(this.frontContainer);
    this.addChild(this.backContainer);

    this.buildFront();
    this.buildBack();
    this.redrawBase();

    // Enable PixiJS v8 interaction
    this.eventMode = 'static';
    this.cursor = 'pointer';

    this.on('pointerdown', (e) => {
      e.stopPropagation();
      this.onCardClick?.(this);
    });

    this.on('pointerover', () => {
      this.isHovered = true;
      this.redrawBase();
    });

    this.on('pointerout', () => {
      this.isHovered = false;
      this.redrawBase();
    });

    this.updateVisibility();
  }

  public setCardCode(code: number): void {
    if (this.cardCode !== code) {
      this.cardCode = code;
      this.updateFrontContent();
    }
  }

  public setFaceUp(faceUp: boolean): void {
    if (this.faceUp !== faceUp) {
      this.faceUp = faceUp;
      this.updateVisibility();
    }
  }

  public setSelected(selected: boolean): void {
    if (this.selected !== selected) {
      this.selected = selected;
      this.redrawBase();
    }
  }

  public setPlayable(playable: boolean): void {
    this.isPlayable = playable;
    this.targetAlpha = playable ? 1.0 : 0.45;
  }

  private updateVisibility(): void {
    this.frontContainer.visible = this.faceUp;
    this.backContainer.visible = !this.faceUp;
    this.redrawBase();
  }

  private redrawBase(): void {
    // Redraw shadow
    this.shadowGraphics.clear();
    const shadowOffset = this.selected ? 10 : this.isHovered ? 6 : 3;
    const shadowAlpha = this.selected ? 0.35 : this.isHovered ? 0.28 : 0.18;
    this.shadowGraphics.roundRect(1, shadowOffset, CARD_WIDTH - 2, CARD_HEIGHT - 2, CARD_RADIUS);
    this.shadowGraphics.fill({ color: 0x000000, alpha: shadowAlpha });

    // Redraw card body
    this.cardGraphics.clear();
    if (this.faceUp) {
      // Crisp front surface
      this.cardGraphics.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
      this.cardGraphics.fill({ color: 0xffffff });
      this.cardGraphics.stroke({ width: 1.2, color: 0xd1d5db });
    } else {
      // Ornate back surface
      this.cardGraphics.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
      this.cardGraphics.fill({ color: 0x0f172a });
      this.cardGraphics.stroke({ width: 1.5, color: 0x334155 });
    }

    // Redraw selection glow
    this.selectionGlow.clear();
    if (this.selected) {
      this.selectionGlow.roundRect(-2, -2, CARD_WIDTH + 4, CARD_HEIGHT + 4, CARD_RADIUS + 2);
      this.selectionGlow.stroke({ width: 3, color: 0xf59e0b });
    } else if (this.isHovered && this.faceUp) {
      this.selectionGlow.roundRect(-1, -1, CARD_WIDTH + 2, CARD_HEIGHT + 2, CARD_RADIUS + 1);
      this.selectionGlow.stroke({ width: 1.5, color: 0x60a5fa, alpha: 0.8 });
    }
  }

  private buildFront(): void {
    const rank = getRank(this.cardCode);
    const suit = getSuit(this.cardCode);
    const isRed = suit === 0 || suit === 2; // Diamonds or Hearts
    const textColor = isRed ? '#dc2626' : '#0f172a';

    const rankStyle = new TextStyle({
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: 16,
      fontWeight: '800',
      fill: textColor,
    });

    const suitStyle = new TextStyle({
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: 14,
      fontWeight: 'bold',
      fill: textColor,
    });

    const centerSuitStyle = new TextStyle({
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: 34,
      fontWeight: 'bold',
      fill: textColor,
    });

    // Top-Left corner
    this.topLeftRankText = new Text({ text: RANK_NAMES[rank], style: rankStyle });
    this.topLeftRankText.position.set(6, 4);
    this.frontContainer.addChild(this.topLeftRankText);

    this.topLeftSuitText = new Text({ text: SUIT_SYMBOLS[suit], style: suitStyle });
    this.topLeftSuitText.position.set(6, 22);
    this.frontContainer.addChild(this.topLeftSuitText);

    // Bottom-Right corner (rotated 180°)
    this.bottomRightRankText = new Text({ text: RANK_NAMES[rank], style: rankStyle });
    this.bottomRightRankText.rotation = Math.PI;
    this.bottomRightRankText.position.set(CARD_WIDTH - 6, CARD_HEIGHT - 4);
    this.frontContainer.addChild(this.bottomRightRankText);

    this.bottomRightSuitText = new Text({ text: SUIT_SYMBOLS[suit], style: suitStyle });
    this.bottomRightSuitText.rotation = Math.PI;
    this.bottomRightSuitText.position.set(CARD_WIDTH - 6, CARD_HEIGHT - 22);
    this.frontContainer.addChild(this.bottomRightSuitText);

    // Center large suit glyph
    this.centerSuitText = new Text({ text: SUIT_SYMBOLS[suit], style: centerSuitStyle });
    this.centerSuitText.anchor.set(0.5, 0.5);
    this.centerSuitText.position.set(CARD_WIDTH / 2, CARD_HEIGHT / 2);
    this.frontContainer.addChild(this.centerSuitText);
  }

  private updateFrontContent(): void {
    const rank = getRank(this.cardCode);
    const suit = getSuit(this.cardCode);
    const isRed = suit === 0 || suit === 2;
    const textColor = isRed ? '#dc2626' : '#0f172a';

    const rankName = RANK_NAMES[rank];
    const suitSym = SUIT_SYMBOLS[suit];

    this.topLeftRankText.text = rankName;
    this.topLeftRankText.style.fill = textColor;

    this.topLeftSuitText.text = suitSym;
    this.topLeftSuitText.style.fill = textColor;

    this.bottomRightRankText.text = rankName;
    this.bottomRightRankText.style.fill = textColor;

    this.bottomRightSuitText.text = suitSym;
    this.bottomRightSuitText.style.fill = textColor;

    this.centerSuitText.text = suitSym;
    this.centerSuitText.style.fill = textColor;
  }

  private buildBack(): void {
    const pattern = new Graphics();

    // Outer gold border inside card
    pattern.roundRect(4, 4, CARD_WIDTH - 8, CARD_HEIGHT - 8, CARD_RADIUS - 2);
    pattern.stroke({ width: 1.5, color: 0xd97706 });

    // Inner gold border
    pattern.roundRect(7, 7, CARD_WIDTH - 14, CARD_HEIGHT - 14, CARD_RADIUS - 4);
    pattern.stroke({ width: 1, color: 0xb45309 });

    // Center diamond pattern
    pattern.moveTo(CARD_WIDTH / 2, 18);
    pattern.lineTo(CARD_WIDTH - 16, CARD_HEIGHT / 2);
    pattern.lineTo(CARD_WIDTH / 2, CARD_HEIGHT - 18);
    pattern.lineTo(16, CARD_HEIGHT / 2);
    pattern.closePath();
    pattern.fill({ color: 0x1e293b });
    pattern.stroke({ width: 1.2, color: 0xf59e0b });

    // Inner decorative crosshatch
    const centerStyle = new TextStyle({
      fontFamily: 'serif',
      fontSize: 20,
      fontWeight: 'bold',
      fill: '#fbbf24',
    });
    const emblem = new Text({ text: '🎴', style: centerStyle });
    emblem.anchor.set(0.5, 0.5);
    emblem.position.set(CARD_WIDTH / 2, CARD_HEIGHT / 2);

    this.backContainer.addChild(pattern);
    this.backContainer.addChild(emblem);
  }

  /**
   * Smooth physics lerp update called each frame
   */
  public update(delta: number): void {
    const factor = Math.min(1, 0.22 * delta);

    // Apply selection lift (-24px when selected)
    const effectiveTargetY = this.selected ? this.targetY - 24 : this.targetY;

    this.x += (this.targetX - this.x) * factor;
    this.y += (effectiveTargetY - this.y) * factor;
    this.rotation += (this.targetRotation - this.rotation) * factor;

    const curScale = this.scale.x;
    const nextScale = curScale + (this.targetScale - curScale) * factor;
    this.scale.set(nextScale, nextScale);

    this.alpha += (this.targetAlpha - this.alpha) * factor;
  }
}
