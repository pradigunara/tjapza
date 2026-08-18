import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Card } from '../domain';

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

  // Text & Art elements
  private topLeftRankText!: Text;
  private topLeftSuitText!: Text;
  private bottomRightRankText!: Text;
  private bottomRightSuitText!: Text;
  private centerArtContainer!: Container;

  // Smooth tween targets
  public targetX = 0;
  public targetY = 0;
  public targetRotation = 0;
  public targetScale = 1;
  public targetAlpha = 1;
  public selectionLift = 24;

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
    const shadowOffset = this.selected ? 12 : this.isHovered ? 6 : 3;
    const shadowAlpha = this.selected ? 0.4 : this.isHovered ? 0.28 : 0.18;
    this.shadowGraphics.roundRect(1, shadowOffset, CARD_WIDTH - 2, CARD_HEIGHT - 2, CARD_RADIUS);
    this.shadowGraphics.fill({ color: 0x000000, alpha: shadowAlpha });

    // Redraw card body
    this.cardGraphics.clear();
    if (this.faceUp) {
      // Crisp linen cardstock with subtle inner bevel
      this.cardGraphics.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
      this.cardGraphics.fill({ color: 0xffffff });
      this.cardGraphics.stroke({ width: 1.2, color: 0xd1d5db });

      // Subtle inner filigree border
      this.cardGraphics.roundRect(3.5, 3.5, CARD_WIDTH - 7, CARD_HEIGHT - 7, CARD_RADIUS - 2);
      this.cardGraphics.stroke({ width: 0.8, color: 0xe2e8f0, alpha: 0.8 });
    } else {
      // Luxury casino midnight navy back surface
      this.cardGraphics.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
      this.cardGraphics.fill({ color: 0x0f172a });
      this.cardGraphics.stroke({ width: 1.5, color: 0x334155 });
    }

    // Redraw selection glow
    this.selectionGlow.clear();
    if (this.selected) {
      this.selectionGlow.roundRect(-2.5, -2.5, CARD_WIDTH + 5, CARD_HEIGHT + 5, CARD_RADIUS + 2);
      this.selectionGlow.stroke({ width: 3.5, color: 0xf59e0b });
    } else if (this.isHovered && this.faceUp) {
      this.selectionGlow.roundRect(-1.5, -1.5, CARD_WIDTH + 3, CARD_HEIGHT + 3, CARD_RADIUS + 1);
      this.selectionGlow.stroke({ width: 2, color: 0x60a5fa, alpha: 0.85 });
    }
  }

  private buildFront(): void {
    const card = new Card(this.cardCode);
    const textColor = card.isRed ? '#dc2626' : '#0f172a';

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

    // Top-Left corner
    this.topLeftRankText = new Text({ text: card.rankName, style: rankStyle });
    this.topLeftRankText.position.set(6, 4);
    this.frontContainer.addChild(this.topLeftRankText);

    this.topLeftSuitText = new Text({ text: card.suitSymbol, style: suitStyle });
    this.topLeftSuitText.position.set(6, 22);
    this.frontContainer.addChild(this.topLeftSuitText);

    // Bottom-Right corner (rotated 180°)
    this.bottomRightRankText = new Text({ text: card.rankName, style: rankStyle });
    this.bottomRightRankText.rotation = Math.PI;
    this.bottomRightRankText.position.set(CARD_WIDTH - 6, CARD_HEIGHT - 4);
    this.frontContainer.addChild(this.bottomRightRankText);

    this.bottomRightSuitText = new Text({ text: card.suitSymbol, style: suitStyle });
    this.bottomRightSuitText.rotation = Math.PI;
    this.bottomRightSuitText.position.set(CARD_WIDTH - 6, CARD_HEIGHT - 22);
    this.frontContainer.addChild(this.bottomRightSuitText);

    // Center Artwork Container
    this.centerArtContainer = new Container();
    this.centerArtContainer.position.set(CARD_WIDTH / 2, CARD_HEIGHT / 2);
    this.frontContainer.addChild(this.centerArtContainer);

    this.drawCenterArt(card, textColor);
  }

  private drawCenterArt(card: Card, textColor: string): void {
    // Remove old children in center
    this.centerArtContainer.removeChildren();

    const isFaceCard = card.rank === 8 || card.rank === 9 || card.rank === 10; // J=8, Q=9, K=10
    const isBigTwo = card.rank === 12; // Rank 2 (Supreme card!)

    if (isFaceCard) {
      // Regal Court Card Artwork
      const artGfx = new Graphics();
      const frameColor = textColor === '#dc2626' ? 0xdc2626 : 0x1e293b;

      // Decorative court inner frame
      artGfx.roundRect(-22, -26, 44, 52, 4);
      artGfx.fill({ color: 0xf8fafc, alpha: 0.95 });
      artGfx.stroke({ width: 1.2, color: frameColor, alpha: 0.7 });

      // Crown / Regal Iconography
      const crownStyle = new TextStyle({
        fontSize: 22,
      });
      const crownIcon = card.rank === 10 ? '👑' : card.rank === 9 ? '👸' : '⚔️';
      const crownText = new Text({ text: crownIcon, style: crownStyle });
      crownText.anchor.set(0.5, 0.5);
      crownText.position.set(0, -6);

      // Micro suit icon at bottom of court card
      const suitStyle = new TextStyle({
        fontSize: 13,
        fontWeight: 'bold',
        fill: textColor,
      });
      const subSuit = new Text({ text: card.suitSymbol, style: suitStyle });
      subSuit.anchor.set(0.5, 0.5);
      subSuit.position.set(0, 16);

      this.centerArtContainer.addChild(artGfx);
      this.centerArtContainer.addChild(crownText);
      this.centerArtContainer.addChild(subSuit);
    } else if (isBigTwo) {
      // Big Two (Supreme 2s) with gold star crest
      const starStyle = new TextStyle({
        fontSize: 13,
      });
      const star = new Text({ text: '⭐', style: starStyle });
      star.anchor.set(0.5, 0.5);
      star.position.set(0, -18);

      const suitStyle = new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 34,
        fontWeight: 'bold',
        fill: textColor,
      });
      const centerSuit = new Text({ text: card.suitSymbol, style: suitStyle });
      centerSuit.anchor.set(0.5, 0.5);
      centerSuit.position.set(0, 6);

      this.centerArtContainer.addChild(star);
      this.centerArtContainer.addChild(centerSuit);
    } else {
      // Standard Number Cards
      const suitStyle = new TextStyle({
        fontFamily: 'system-ui, sans-serif',
        fontSize: 32,
        fontWeight: 'bold',
        fill: textColor,
      });
      const centerSuit = new Text({ text: card.suitSymbol, style: suitStyle });
      centerSuit.anchor.set(0.5, 0.5);
      centerSuit.position.set(0, 0);

      this.centerArtContainer.addChild(centerSuit);
    }
  }

  private updateFrontContent(): void {
    const card = new Card(this.cardCode);
    const textColor = card.isRed ? '#dc2626' : '#0f172a';

    this.topLeftRankText.text = card.rankName;
    this.topLeftRankText.style.fill = textColor;

    this.topLeftSuitText.text = card.suitSymbol;
    this.topLeftSuitText.style.fill = textColor;

    this.bottomRightRankText.text = card.rankName;
    this.bottomRightRankText.style.fill = textColor;

    this.bottomRightSuitText.text = card.suitSymbol;
    this.bottomRightSuitText.style.fill = textColor;

    this.drawCenterArt(card, textColor);
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

    // Center luxury casino medallion
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

    // Apply tactile selection lift and subtle scale pop
    const effectiveTargetY = this.selected ? this.targetY - this.selectionLift : this.targetY;
    const effectiveScale = this.selected ? this.targetScale * 1.03 : this.targetScale;

    this.x += (this.targetX - this.x) * factor;
    this.y += (effectiveTargetY - this.y) * factor;
    this.rotation += (this.targetRotation - this.rotation) * factor;

    const curScale = this.scale.x;
    const nextScale = curScale + (effectiveScale - curScale) * factor;
    this.scale.set(nextScale, nextScale);

    this.alpha += (this.targetAlpha - this.alpha) * factor;
  }
}
