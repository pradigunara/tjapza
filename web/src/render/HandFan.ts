import { Container } from 'pixi.js';
import { CardSprite } from './CardSprite';
import { Card } from '../domain';
import { sound } from '../audio/sound';

export class HandFan extends Container {
  public cardSprites: CardSprite[] = [];
  public rawCards: number[] = [];
  private selectedCards = new Set<number>();
  private playableSet: Set<number> | null = null;

  // Viewport dimensions
  private viewWidth = 1000;
  private viewHeight = 700;

  // Callbacks
  public onSelectionChanged?: (selected: number[]) => void;
  public onPlayRequested?: () => void;
  public onPassRequested?: () => void;
  public onHintRequested?: () => void;

  constructor() {
    super();
    this.setupKeyboardShortcuts();
  }

  public setCards(cards: number[]): void {
    const sorted = Card.sortCodes(cards);
    this.rawCards = sorted;

    // Remove old sprites not in new list
    const newCardSet = new Set(sorted);
    const existingSprites = new Map<number, CardSprite>();

    for (const sprite of this.cardSprites) {
      if (newCardSet.has(sprite.cardCode)) {
        existingSprites.set(sprite.cardCode, sprite);
      } else {
        this.removeChild(sprite);
        sprite.destroy();
      }
    }

    // Clean up selection set for cards no longer in hand
    for (const code of this.selectedCards) {
      if (!newCardSet.has(code)) {
        this.selectedCards.delete(code);
      }
    }

    // Build or reuse sprites in sorted order
    const nextSprites: CardSprite[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const code = sorted[i];
      let sprite = existingSprites.get(code);
      if (!sprite) {
        sprite = new CardSprite(code, true);
        sprite.onCardClick = (s) => this.toggleCardSelection(s.cardCode);
        this.addChild(sprite);
        // Start new cards below screen for enter slide
        sprite.x = this.viewWidth / 2;
        sprite.y = this.viewHeight + 100;
      }
      sprite.setSelected(this.selectedCards.has(code));
      if (this.playableSet !== null) {
        sprite.setPlayable(this.playableSet.has(code));
      } else {
        sprite.setPlayable(true);
      }
      nextSprites.push(sprite);
      // Ensure proper z-index ordering
      this.addChild(sprite);
    }

    this.cardSprites = nextSprites;
    this.relayoutCards();
  }

  public getSelectedCards(): number[] {
    return Array.from(this.selectedCards).sort((a, b) => a - b);
  }

  public setSelectedCards(cards: number[]): void {
    this.selectedCards = new Set(cards.slice(0, 5));
    for (const sprite of this.cardSprites) {
      sprite.setSelected(this.selectedCards.has(sprite.cardCode));
    }
    this.relayoutCards();
    this.onSelectionChanged?.(this.getSelectedCards());
  }

  public clearSelection(): void {
    this.selectedCards.clear();
    for (const sprite of this.cardSprites) {
      sprite.setSelected(false);
    }
    this.relayoutCards();
    this.onSelectionChanged?.([]);
  }

  public toggleCardSelection(cardCode: number): void {
    if (this.selectedCards.has(cardCode)) {
      this.selectedCards.delete(cardCode);
    } else {
      // Big Two combo limit: cap selection at 5 cards maximum
      if (this.selectedCards.size >= 5) {
        return;
      }
      this.selectedCards.add(cardCode);
    }

    sound.playClick();
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(10); } catch (_) {}
    }

    const sprite = this.cardSprites.find((s) => s.cardCode === cardCode);
    if (sprite) {
      sprite.setSelected(this.selectedCards.has(cardCode));
    }

    this.relayoutCards();
    this.onSelectionChanged?.(this.getSelectedCards());
  }

  public setPlayableFilter(playableCards: Set<number> | null): void {
    this.playableSet = playableCards;
    for (const sprite of this.cardSprites) {
      if (playableCards === null) {
        sprite.setPlayable(true);
      } else {
        sprite.setPlayable(playableCards.has(sprite.cardCode));
      }
    }
  }

  public resize(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
    this.relayoutCards();
  }

  private relayoutCards(): void {
    const count = this.cardSprites.length;
    if (count === 0) return;

    const isPortrait = this.viewHeight > this.viewWidth;
    const isMobile = this.viewWidth < 640;
    const centerX = this.viewWidth / 2;
    const sideMargin = isPortrait ? 24 : isMobile ? 32 : 56;

    // Use 2-tier fan on mobile portrait when holding more than 7 cards
    const useTwoTier = isPortrait && count > 7;

    if (useTwoTier) {
      const topCount = Math.ceil(count / 2);
      const bottomCount = count - topCount;

      // Strict left-to-right z-ordering:
      // Right cards always stay above left cards so left cards never cover their right neighbors when selected
      for (let i = 0; i < count; i++) {
        this.addChild(this.cardSprites[i]);
      }

      // 1. Top / Back Row (Lower value cards 0..topCount-1)
      const topScale = 0.80;
      const topHalfW = (76 * topScale) / 2;
      const topMaxSpread = Math.max(0, this.viewWidth - 2 * (sideMargin + topHalfW));
      const topSpread = Math.min(
        topMaxSpread,
        topCount * 42 * topScale
      );
      const topSpacing = topCount > 1 ? topSpread / (topCount - 1) : 0;
      const topStartX = centerX - topSpread / 2;
      const topBaseY = this.viewHeight - 176;
      const topAngleStep = topCount > 1 ? (0.12 * 2) / (topCount - 1) : 0;

      for (let i = 0; i < topCount; i++) {
        const sprite = this.cardSprites[i];
        const t = topCount > 1 ? (i - (topCount - 1) / 2) : 0;
        const angle = t * topAngleStep;
        const arcOffset = Math.abs(t) * 1.2;

        sprite.targetX = topStartX + i * topSpacing;
        sprite.targetY = topBaseY + arcOffset;
        sprite.targetRotation = angle;
        sprite.targetScale = topScale;
        sprite.selectionLift = 18;
      }

      // 2. Bottom / Front Row (Higher value cards topCount..count-1)
      const bottomScale = 0.84;
      const bottomHalfW = (76 * bottomScale) / 2;
      const bottomMaxSpread = Math.max(0, this.viewWidth - 2 * (sideMargin + bottomHalfW));
      const bottomSpread = Math.min(
        bottomMaxSpread,
        bottomCount * 46 * bottomScale
      );
      const bottomSpacing = bottomCount > 1 ? bottomSpread / (bottomCount - 1) : 0;
      const bottomStartX = centerX - bottomSpread / 2;
      const bottomBaseY = this.viewHeight - 110;
      const bottomAngleStep = bottomCount > 1 ? (0.12 * 2) / (bottomCount - 1) : 0;

      for (let j = 0; j < bottomCount; j++) {
        const sprite = this.cardSprites[topCount + j];
        const t = bottomCount > 1 ? (j - (bottomCount - 1) / 2) : 0;
        const angle = t * bottomAngleStep;
        const arcOffset = Math.abs(t) * 1.2;

        sprite.targetX = bottomStartX + j * bottomSpacing;
        sprite.targetY = bottomBaseY + arcOffset;
        sprite.targetRotation = angle;
        sprite.targetScale = bottomScale;
        sprite.selectionLift = 12; // Modest lift to prevent obscuring upper tier
      }
    } else {
      // Single row fan for landscape / desktop or <= 7 cards
      for (let i = 0; i < count; i++) {
        this.addChild(this.cardSprites[i]);
      }

      const cardScale = isPortrait ? 0.80 : isMobile ? 0.86 : 1.0;
      const halfW = (76 * cardScale) / 2;
      const maxAllowedSpread = Math.max(0, this.viewWidth - 2 * (sideMargin + halfW));
      const maxSpread = Math.min(
        maxAllowedSpread,
        count * (isPortrait ? 34 : isMobile ? 40 : 48) * cardScale
      );
      const cardSpacing = count > 1 ? maxSpread / (count - 1) : 0;

      const baseY = this.viewHeight - (isPortrait ? 110 : isMobile ? 95 : 115);
      const startX = centerX - maxSpread / 2;

      const maxAngle = isPortrait ? Math.min(0.16, 0.02 * (count - 1)) : Math.min(0.24, 0.032 * (count - 1));
      const angleStep = count > 1 ? (maxAngle * 2) / (count - 1) : 0;

      for (let i = 0; i < count; i++) {
        const sprite = this.cardSprites[i];
        const t = count > 1 ? (i - (count - 1) / 2) : 0;
        const angle = t * angleStep;
        const arcOffset = Math.abs(t) * (isPortrait ? 1.4 : 2.2);

        sprite.targetX = startX + i * cardSpacing;
        sprite.targetY = baseY + arcOffset;
        sprite.targetRotation = angle;
        sprite.targetScale = cardScale;
        sprite.selectionLift = isPortrait ? 18 : 24;
      }
    }
  }

  private setupKeyboardShortcuts(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', (e) => {
      // Don't intercept when user is typing in an input / textarea
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea') return;

      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        this.onPlayRequested?.();
      } else if (e.code === 'KeyP') {
        e.preventDefault();
        this.onPassRequested?.();
      } else if (e.code === 'KeyD' || e.code === 'Escape') {
        e.preventDefault();
        this.clearSelection();
      } else if (e.code === 'KeyH') {
        e.preventDefault();
        this.onHintRequested?.();
      } else if (e.code === 'KeyS') {
        e.preventDefault();
        this.setCards(this.rawCards);
      }
    });
  }

  public update(delta: number): void {
    for (const sprite of this.cardSprites) {
      sprite.update(delta);
    }
  }
}
