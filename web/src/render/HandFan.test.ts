import { describe, test, expect, beforeEach } from 'bun:test';
import { HandFan } from './HandFan';

describe('HandFan Dynamic Card Selection Limits', () => {
  let handFan: HandFan;
  // Sample hand of 8 cards: 3♦ (0), 4♦ (4), 5♦ (8), 6♦ (12), 7♦ (16), 8♦ (20), 9♦ (24), 10♦ (28)
  const sampleCards = [0, 4, 8, 12, 16, 20, 24, 28];

  beforeEach(() => {
    handFan = new HandFan();
    handFan.setCards(sampleCards);
  });

  test('Fresh / empty pile (limit = 5): allows selecting up to 5 cards', () => {
    handFan.setMaxSelectionLimit(5);

    handFan.toggleCardSelection(0);
    handFan.toggleCardSelection(4);
    handFan.toggleCardSelection(8);
    handFan.toggleCardSelection(12);
    handFan.toggleCardSelection(16);

    expect(handFan.getSelectedCards()).toEqual([0, 4, 8, 12, 16]);

    // Attempting to select a 6th card is ignored
    handFan.toggleCardSelection(20);
    expect(handFan.getSelectedCards()).toEqual([0, 4, 8, 12, 16]);
  });

  test('Single pile (limit = 1): allows only 1 card selection and auto-replaces smoothly', () => {
    handFan.setMaxSelectionLimit(1);

    // Select first card
    handFan.toggleCardSelection(4);
    expect(handFan.getSelectedCards()).toEqual([4]);

    // Select second card -> auto-replaces to new card for seamless single-card mobile play
    handFan.toggleCardSelection(8);
    expect(handFan.getSelectedCards()).toEqual([8]);

    // Toggling the same card deselects it
    handFan.toggleCardSelection(8);
    expect(handFan.getSelectedCards()).toEqual([]);
  });

  test('Pair / double pile (limit = 2): allows only 2 cards selection and caps at 2', () => {
    handFan.setMaxSelectionLimit(2);

    handFan.toggleCardSelection(4);
    expect(handFan.getSelectedCards()).toEqual([4]);

    handFan.toggleCardSelection(8);
    expect(handFan.getSelectedCards()).toEqual([4, 8]);

    // Attempting to select 3rd card is rejected
    handFan.toggleCardSelection(12);
    expect(handFan.getSelectedCards()).toEqual([4, 8]);

    // Deselecting one allows choosing another
    handFan.toggleCardSelection(8);
    expect(handFan.getSelectedCards()).toEqual([4]);

    handFan.toggleCardSelection(16);
    expect(handFan.getSelectedCards()).toEqual([4, 16]);
  });

  test('Dynamically trimming selection when max limit is lowered', () => {
    handFan.setMaxSelectionLimit(5);
    handFan.setSelectedCards([0, 4, 8, 12, 16]);
    expect(handFan.getSelectedCards().length).toBe(5);

    // Table state updates to a Pair -> limit clamped to 2
    handFan.setMaxSelectionLimit(2);
    expect(handFan.getSelectedCards().length).toBe(2);
    expect(handFan.getSelectedCards()).toEqual([0, 4]);

    // Table state updates to Single -> limit clamped to 1
    handFan.setMaxSelectionLimit(1);
    expect(handFan.getSelectedCards().length).toBe(1);
    expect(handFan.getSelectedCards()).toEqual([0]);
  });
});
