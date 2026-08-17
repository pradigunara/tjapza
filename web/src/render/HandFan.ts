import { Container } from 'pixi.js';
import { CardSprite, CARD_WIDTH, CARD_HEIGHT } from './CardSprite';
import { sortCards } from '../rules/cards';
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

  // Drag select tracking
  private isPointerDown = false;
  private dragVisitedCards = new Set<number>();

  constructor() {
    super();
    this.setupKeyboardShortcuts();
    this.setupDragSelection();
  }

  public setCards(cards: number[]): void {
    const sorted = sortCards(cards);
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
    this.selectedCards = new Set(cards);
    for (const sprite of this.cardSprites) {
      sprite.setSelected(this.selectedCards.has(sprite.cardCode));
    }
    this.onSelectionChanged?.(this.getSelectedCards());
  }

  public clearSelection(): void {
    this.selectedCards.clear();
    for (const sprite of this.cardSprites) {
      sprite.setSelected(false);
    }
    this.onSelectionChanged?.([]);
  }

  public toggleCardSelection(cardCode: number): void {
    sound.playClick();
    if (this.selectedCards.has(cardCode)) {
      this.selectedCards.delete(cardCode);
    } else {
      this.selectedCards.add(cardCode);
    }

    const sprite = this.cardSprites.find((s) => s.cardCode === cardCode);
    if (sprite) {
      sprite.setSelected(this.selectedCards.has(cardCode));
    }

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

    const isMobile = this.viewWidth < 600;
    const maxSpread = Math.min(this.viewWidth * (isMobile ? 0.92 : 0.75), count * (isMobile ? 36 : 52));
    const cardSpacing = count > 1 ? maxSpread / (count - 1) : 0;

    const centerX = this.viewWidth / 2;
    const baseY = this.viewHeight - (isMobile ? 80 : 110);
    const startX = centerX - maxSpread / 2;

    const maxAngle = Math.min(0.24, 0.032 * (count - 1));
    const angleStep = count > 1 ? (maxAngle * 2) / (count - 1) : 0;

    for (let i = 0; i < count; i++) {
      const sprite = this.cardSprites[i];
      const t = count > 1 ? (i - (count - 1) / 2) : 0;
      const angle = t * angleStep;

      // Subtle arc curve: middle cards slightly higher
      const arcOffset = Math.abs(t) * (isMobile ? 1.8 : 2.6);

      sprite.targetX = startX + i * cardSpacing;
      sprite.targetY = baseY + arcOffset;
      sprite.targetRotation = angle;
      sprite.targetScale = isMobile ? 0.85 : 1.0;
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
      }
    });
  }

  private setupDragSelection(): void {
    this.eventMode = 'static';

    this.on('pointerdown', () => {
      this.isPointerDown = true;
      this.dragVisitedCards.clear();
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('pointerup', () => {
        this.isPointerDown = false;
        this.dragVisitedCards.clear();
      });
    }

    // Touch / swipe across cards to toggle selection
    this.on('pointermove', (e) => {
      if (!this.isPointerDown) return;
      const local = this.toLocal(e.global);
      // Find card under pointer
      for (let i = this.cardSprites.length - 1; i >= 0; i--) {
        const sprite = this.cardSprites[i];
        const dx = Math.abs(local.x - sprite.x);
        const dy = Math.abs(local.y - sprite.y);
        if (dx < CARD_WIDTH / 2 && dy < CARD_HEIGHT / 2) {
          if (!this.dragVisitedCards.has(sprite.cardCode)) {
            this.dragVisitedCards.add(sprite.cardCode);
            this.toggleCardSelection(sprite.cardCode);
          }
          break;
        }
      }
    });
  }

  public update(delta: number): void {
    for (const sprite of this.cardSprites) {
      sprite.update(delta);
    }
  }
}
