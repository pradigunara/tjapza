import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { Card } from '../domain';
import { Theme, UI_FONT } from './theme';

export const CARD_WIDTH = 76;
export const CARD_HEIGHT = 108;
export const CARD_RADIUS = 7;

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

  // Smooth physics tween targets
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

    // 1. Drop Shadow
    this.shadowGraphics = new Graphics();
    this.addChild(this.shadowGraphics);

    // 2. Base card surface
    this.cardGraphics = new Graphics();
    this.addChild(this.cardGraphics);

    // 3. Selection / Hover glow
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
      if (e.pointerType === 'touch') {
        this.isHovered = false;
      }
      this.onCardClick?.(this);
    });

    this.on('pointerover', (e) => {
      // Ignore hover on touch devices to prevent sticky blue rings on mobile
      if (e.pointerType === 'touch') return;
      if (typeof window !== 'undefined' && window.matchMedia && !window.matchMedia('(hover: hover)').matches) return;
      this.isHovered = true;
      this.redrawBase();
    });

    this.on('pointerout', () => {
      this.isHovered = false;
      this.redrawBase();
    });

    this.on('pointerup', (e) => {
      if (e.pointerType === 'touch') {
        this.isHovered = false;
        this.redrawBase();
      }
    });

    this.on('pointerupoutside', () => {
      this.isHovered = false;
      this.redrawBase();
    });

    this.on('pointercancel', () => {
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
    this.targetAlpha = playable ? 1.0 : 0.42;
  }

  private updateVisibility(): void {
    this.frontContainer.visible = this.faceUp;
    this.backContainer.visible = !this.faceUp;
    this.redrawBase();
  }

  private redrawBase(): void {
    const isDesktopHover =
      this.isHovered &&
      (typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(hover: hover)').matches);

    // 1. Realistic Multi-pass Drop Shadow
    this.shadowGraphics.clear();
    const shadowOffset = this.selected ? 10 : isDesktopHover ? 5 : 2.5;
    const shadowAlpha = this.selected ? 0.45 : isDesktopHover ? 0.30 : 0.20;
    const blurSpread = this.selected ? 4 : 2;

    // Ambient soft blur layer
    this.shadowGraphics.roundRect(
      -blurSpread / 2,
      shadowOffset - blurSpread / 2,
      CARD_WIDTH + blurSpread,
      CARD_HEIGHT + blurSpread,
      CARD_RADIUS + 2
    );
    this.shadowGraphics.fill({ color: 0x000000, alpha: shadowAlpha * 0.5 });

    // Sharp contact shadow layer
    this.shadowGraphics.roundRect(0, shadowOffset, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
    this.shadowGraphics.fill({ color: 0x000000, alpha: shadowAlpha });

    // 2. Base Card Surface
    this.cardGraphics.clear();
    if (this.faceUp) {
      // Warm luxury ivory cardstock (#fdfcf9)
      this.cardGraphics.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
      this.cardGraphics.fill({ color: 0xfdfcf9 });
      this.cardGraphics.stroke({ width: 1, color: 0xd6d3cb });

      // Subtle inner guilloche pinstripe margin
      this.cardGraphics.roundRect(3, 3, CARD_WIDTH - 6, CARD_HEIGHT - 6, CARD_RADIUS - 2);
      this.cardGraphics.stroke({ width: 0.6, color: 0xe5e2da, alpha: 0.7 });
    } else {
      this.cardGraphics.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
      this.cardGraphics.fill({ color: Theme.cinnabar });
      this.cardGraphics.stroke({ width: 1.2, color: Theme.gold });
      this.cardGraphics.roundRect(5, 5, CARD_WIDTH - 10, CARD_HEIGHT - 10, CARD_RADIUS - 2);
      this.cardGraphics.stroke({ width: 0.8, color: Theme.gold, alpha: 0.7 });
    }

    // 3. Selection & Hover Rim Illumination
    this.selectionGlow.clear();
    if (this.selected) {
      // Outer soft aura
      this.selectionGlow.roundRect(-3, -3, CARD_WIDTH + 6, CARD_HEIGHT + 6, CARD_RADIUS + 3);
      this.selectionGlow.stroke({ width: 2, color: 0xfbbf24, alpha: 0.45 });

      // Crisp gold inner rim
      this.selectionGlow.roundRect(-1.5, -1.5, CARD_WIDTH + 3, CARD_HEIGHT + 3, CARD_RADIUS + 1.5);
      this.selectionGlow.stroke({ width: 2.5, color: 0xf59e0b, alpha: 0.95 });
    } else if (isDesktopHover && this.faceUp) {
      this.selectionGlow.roundRect(-1.5, -1.5, CARD_WIDTH + 3, CARD_HEIGHT + 3, CARD_RADIUS + 1.5);
      this.selectionGlow.stroke({ width: 2, color: Theme.cardHover, alpha: 0.8 });
    }
  }

  private buildFront(): void {
    const card = new Card(this.cardCode);
    const textColor = card.isRed ? '#b91c1c' : '#0f172a';

    const rankStyle = new TextStyle({
      fontFamily: UI_FONT,
      fontSize: 15.5,
      fontWeight: '800',
      fill: textColor,
      letterSpacing: -0.5,
    });

    const suitStyle = new TextStyle({
      fontFamily: UI_FONT,
      fontSize: 13,
      fontWeight: 'bold',
      fill: textColor,
    });

    // Top-Left corner
    this.topLeftRankText = new Text({ text: card.rankName, style: rankStyle });
    this.topLeftRankText.position.set(5.5, 3.5);
    this.frontContainer.addChild(this.topLeftRankText);

    this.topLeftSuitText = new Text({ text: card.suitSymbol, style: suitStyle });
    this.topLeftSuitText.position.set(5.5, 20.5);
    this.frontContainer.addChild(this.topLeftSuitText);

    // Bottom-Right corner (rotated 180°)
    this.bottomRightRankText = new Text({ text: card.rankName, style: rankStyle });
    this.bottomRightRankText.rotation = Math.PI;
    this.bottomRightRankText.position.set(CARD_WIDTH - 5.5, CARD_HEIGHT - 3.5);
    this.frontContainer.addChild(this.bottomRightRankText);

    this.bottomRightSuitText = new Text({ text: card.suitSymbol, style: suitStyle });
    this.bottomRightSuitText.rotation = Math.PI;
    this.bottomRightSuitText.position.set(CARD_WIDTH - 5.5, CARD_HEIGHT - 20.5);
    this.frontContainer.addChild(this.bottomRightSuitText);

    // Center Artwork Container
    this.centerArtContainer = new Container();
    this.centerArtContainer.position.set(CARD_WIDTH / 2, CARD_HEIGHT / 2);
    this.frontContainer.addChild(this.centerArtContainer);

    this.drawCenterArt(card, textColor);
  }

  private drawCenterArt(card: Card, textColor: string): void {
    this.centerArtContainer.removeChildren();

    const isFaceCard = card.rank === 8 || card.rank === 9 || card.rank === 10; // J=8, Q=9, K=10
    const isBigTwo = card.rank === 12; // Rank 2 (Supreme card)
    const isAce = card.rank === 11; // Rank Ace

    if (isFaceCard) {
      // Crisp Stylized Vector Court Card Heraldry (No Emojis!)
      const artGfx = new Graphics();
      const isRed = card.isRed;
      const primaryColor = isRed ? 0xb91c1c : 0x1e293b;
      const goldColor = 0xd97706;
      const lightBg = isRed ? 0xfef2f2 : 0xf8fafc;

      // Decorative court portrait inner frame
      artGfx.roundRect(-21, -26, 42, 52, 4);
      artGfx.fill({ color: lightBg });
      artGfx.stroke({ width: 1.2, color: primaryColor, alpha: 0.6 });

      // Inner ornate corner accents
      artGfx.rect(-19, -24, 4, 4);
      artGfx.rect(15, -24, 4, 4);
      artGfx.rect(-19, 20, 4, 4);
      artGfx.rect(15, 20, 4, 4);
      artGfx.fill({ color: goldColor, alpha: 0.75 });

      if (card.rank === 10) {
        // KING (K): Imperial sovereign crown and royal scepter
        // Crown Base
        artGfx.roundRect(-14, -14, 28, 6, 2);
        artGfx.fill({ color: goldColor });

        // Crown Peaks
        artGfx.moveTo(-14, -14);
        artGfx.lineTo(-14, -22);
        artGfx.lineTo(-7, -16);
        artGfx.lineTo(0, -24);
        artGfx.lineTo(7, -16);
        artGfx.lineTo(14, -22);
        artGfx.lineTo(14, -14);
        artGfx.closePath();
        artGfx.fill({ color: goldColor });

        // Crown Jewels / Ermine dots
        artGfx.circle(-7, -12, 1.2);
        artGfx.circle(0, -12, 1.4);
        artGfx.circle(7, -12, 1.2);
        artGfx.fill({ color: primaryColor });

        // Royal Crest / Mantle
        artGfx.roundRect(-10, -5, 20, 16, 3);
        artGfx.fill({ color: primaryColor });
        artGfx.stroke({ width: 1, color: goldColor, alpha: 0.8 });

        // Crown Cross Finial
        artGfx.rect(-1, -27, 2, 5);
        artGfx.rect(-2.5, -25.5, 5, 2);
        artGfx.fill({ color: goldColor });
      } else if (card.rank === 9) {
        // QUEEN (Q): Regal coronet / tiara and faceted jewel star
        // Tiara Arch
        artGfx.roundRect(-13, -13, 26, 5, 2);
        artGfx.fill({ color: goldColor });

        // Elegant Tiara Peaks
        artGfx.moveTo(-13, -13);
        artGfx.lineTo(-11, -21);
        artGfx.lineTo(-5, -16);
        artGfx.lineTo(0, -23);
        artGfx.lineTo(5, -16);
        artGfx.lineTo(11, -21);
        artGfx.lineTo(13, -13);
        artGfx.closePath();
        artGfx.fill({ color: goldColor });

        // Tiara Diamond Jewels
        artGfx.circle(-11, -21, 1.5);
        artGfx.circle(0, -23, 2);
        artGfx.circle(11, -21, 1.5);
        artGfx.fill({ color: primaryColor });

        // Queen Robe Motif
        artGfx.roundRect(-10, -5, 20, 16, 3);
        artGfx.fill({ color: primaryColor });
        artGfx.stroke({ width: 1, color: goldColor, alpha: 0.8 });
      } else {
        // JACK (J): Chivalric Knight helmet visor / warrior crest
        // Helmet Visor
        artGfx.roundRect(-12, -18, 24, 12, 3);
        artGfx.fill({ color: primaryColor });
        artGfx.stroke({ width: 1, color: goldColor });

        // Plume / Feather Crest
        artGfx.moveTo(0, -18);
        artGfx.bezierCurveTo(-8, -26, 0, -28, 4, -28);
        artGfx.bezierCurveTo(8, -25, 4, -19, 0, -18);
        artGfx.fill({ color: goldColor });

        // Visor eye slit
        artGfx.rect(-8, -13, 16, 2.5);
        artGfx.fill({ color: 0xfdfcf9 });

        // Shield Breastplate
        artGfx.moveTo(-11, -3);
        artGfx.lineTo(11, -3);
        artGfx.lineTo(8, 11);
        artGfx.lineTo(0, 15);
        artGfx.lineTo(-8, 11);
        artGfx.closePath();
        artGfx.fill({ color: primaryColor });
        artGfx.stroke({ width: 1, color: goldColor, alpha: 0.8 });
      }

      this.centerArtContainer.addChild(artGfx);

      // Embedded Center Suit on Court Card
      const courtSuitStyle = new TextStyle({
        fontSize: 14,
        fontWeight: 'bold',
        fill: isRed ? '#ffffff' : '#fbbf24',
      });
      const courtSuit = new Text({ text: card.suitSymbol, style: courtSuitStyle });
      courtSuit.anchor.set(0.5, 0.5);
      courtSuit.position.set(0, 3);
      this.centerArtContainer.addChild(courtSuit);
    } else if (isBigTwo) {
      // Supreme Big Two (2): Luxury Gold Filigree Star & Grand Suit
      const starGfx = new Graphics();
      const gold = 0xd97706;

      // Draw 5-pointed geometric vector star (no emoji!)
      const points = 5;
      const outerR = 6.5;
      const innerR = 3.2;
      const step = Math.PI / points;

      starGfx.moveTo(0, -18 - outerR);
      for (let i = 0; i < 2 * points; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = i * step - Math.PI / 2;
        starGfx.lineTo(Math.cos(angle) * r, -18 + Math.sin(angle) * r);
      }
      starGfx.closePath();
      starGfx.fill({ color: gold });
      starGfx.stroke({ width: 0.8, color: 0xfbbf24 });

      // Subtle gold rank underline
      starGfx.rect(-10, -8, 20, 1.2);
      starGfx.fill({ color: gold, alpha: 0.6 });

      this.centerArtContainer.addChild(starGfx);

      const suitStyle = new TextStyle({
        fontFamily: UI_FONT,
        fontSize: 34,
        fontWeight: 'bold',
        fill: textColor,
      });
      const centerSuit = new Text({ text: card.suitSymbol, style: suitStyle });
      centerSuit.anchor.set(0.5, 0.5);
      centerSuit.position.set(0, 7);
      this.centerArtContainer.addChild(centerSuit);
    } else if (isAce) {
      // Ace of Spades / Suits: Elegant large emblem
      const suitStyle = new TextStyle({
        fontFamily: UI_FONT,
        fontSize: 38,
        fontWeight: 'bold',
        fill: textColor,
      });
      const centerSuit = new Text({ text: card.suitSymbol, style: suitStyle });
      centerSuit.anchor.set(0.5, 0.5);
      centerSuit.position.set(0, 0);

      // Ornate Ace ring accent
      const aceRing = new Graphics();
      aceRing.circle(0, 0, 24);
      aceRing.stroke({ width: 0.8, color: card.isRed ? 0xfca5a5 : 0x94a3b8, alpha: 0.4 });

      this.centerArtContainer.addChild(aceRing);
      this.centerArtContainer.addChild(centerSuit);
    } else {
      // Standard Number Cards
      const suitStyle = new TextStyle({
        fontFamily: UI_FONT,
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
    const textColor = card.isRed ? '#b91c1c' : '#0f172a';

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

    // Outer gold pinstripe border
    pattern.roundRect(3.5, 3.5, CARD_WIDTH - 7, CARD_HEIGHT - 7, CARD_RADIUS - 2);
    pattern.stroke({ width: 1.2, color: 0xd97706, alpha: 0.85 });

    // Inner gold pinstripe border
    pattern.roundRect(6, 6, CARD_WIDTH - 12, CARD_HEIGHT - 12, CARD_RADIUS - 3);
    pattern.stroke({ width: 0.8, color: 0xb45309, alpha: 0.6 });

    // Casino Diamond Lattice Guilloche
    pattern.moveTo(CARD_WIDTH / 2, 14);
    pattern.lineTo(CARD_WIDTH - 14, CARD_HEIGHT / 2);
    pattern.lineTo(CARD_WIDTH / 2, CARD_HEIGHT - 14);
    pattern.lineTo(14, CARD_HEIGHT / 2);
    pattern.closePath();
    pattern.fill({ color: 0x1e293b });
    pattern.stroke({ width: 1.2, color: 0xf59e0b, alpha: 0.9 });

    // Concentric Inner Diamond
    pattern.moveTo(CARD_WIDTH / 2, 26);
    pattern.lineTo(CARD_WIDTH - 22, CARD_HEIGHT / 2);
    pattern.lineTo(CARD_WIDTH / 2, CARD_HEIGHT - 26);
    pattern.lineTo(22, CARD_HEIGHT / 2);
    pattern.closePath();
    pattern.stroke({ width: 0.8, color: 0xfbbf24, alpha: 0.5 });

    // Center Gold Rosette / Seal
    pattern.circle(CARD_WIDTH / 2, CARD_HEIGHT / 2, 7);
    pattern.fill({ color: 0xd97706 });
    pattern.circle(CARD_WIDTH / 2, CARD_HEIGHT / 2, 4);
    pattern.fill({ color: 0xfef08a });

    this.backContainer.addChild(pattern);
  }

  /**
   * Smooth physics lerp update called each frame
   */
  public update(delta: number): void {
    const factor = Math.min(1, 0.24 * delta);

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

