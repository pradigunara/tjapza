import { describe, test, expect } from 'bun:test';
import { computeTableLayout } from './tableLayout';

describe('computeTableLayout', () => {
  test('landscape desktop: classic 4-side seats, pile near center', () => {
    const layout = computeTableLayout(1000, 700, 0);
    expect(layout.isPortrait).toBe(false);
    expect(layout.isMobile).toBe(false);
    expect(layout.seats).toHaveLength(4);
    expect(layout.seats.every((s) => s.visible)).toBe(true);

    expect(layout.seats[0].layout).toBe('bottom');
    expect(layout.seats[1].layout).toBe('left');
    expect(layout.seats[2].layout).toBe('top');
    expect(layout.seats[3].layout).toBe('right');

    expect(layout.seats[0].x).toBe(500);
    expect(layout.seats[2].x).toBe(500);
    expect(layout.seats[1].x).toBeLessThan(layout.seats[3].x);
    expect(layout.pile.x).toBe(500);
    expect(layout.pile.y).toBe(350 - 20);
  });

  test('landscape rotates around local seat', () => {
    const layout = computeTableLayout(1000, 700, 2);
    expect(layout.seats[2].layout).toBe('bottom');
    expect(layout.seats[3].layout).toBe('left');
    expect(layout.seats[0].layout).toBe('top');
    expect(layout.seats[1].layout).toBe('right');
  });

  test('portrait hides the local canvas seat and arcs the other three', () => {
    const layout = computeTableLayout(390, 844, 0);
    expect(layout.isPortrait).toBe(true);
    expect(layout.isMobile).toBe(true);

    expect(layout.seats[0].visible).toBe(false);
    expect(layout.seats[1].visible).toBe(true);
    expect(layout.seats[2].visible).toBe(true);
    expect(layout.seats[3].visible).toBe(true);

    expect(layout.seats[1].layout).toBe('top_arc');
    expect(layout.seats[2].layout).toBe('top_arc');
    expect(layout.seats[3].layout).toBe('top_arc');
    expect(layout.seats[2].x).toBeCloseTo(195);
    expect(layout.seats[1].x).toBeLessThan(layout.seats[2].x);
    expect(layout.seats[3].x).toBeGreaterThan(layout.seats[2].x);
  });

  test('portrait local seat 1 hides seat 1 and puts seat 2 on the left arc', () => {
    const layout = computeTableLayout(390, 844, 1);
    expect(layout.seats[1].visible).toBe(false);
    expect(layout.seats[2].layout).toBe('top_arc');
    expect(layout.seats[2].x).toBeCloseTo(390 * 0.18);
    expect(layout.seats[3].x).toBeCloseTo(390 * 0.5);
    expect(layout.seats[0].x).toBeCloseTo(390 * 0.82);
  });

  test('landscape mobile uses tighter seat margins', () => {
    const desktop = computeTableLayout(1000, 700, 0);
    const mobile = computeTableLayout(600, 360, 0);
    expect(mobile.isPortrait).toBe(false);
    expect(mobile.isMobile).toBe(true);
    expect(mobile.seats[1].x).toBe(35);
    expect(desktop.seats[1].x).toBe(70);
    expect(mobile.seats[0].y).toBeGreaterThan(mobile.pile.y);
  });
});
