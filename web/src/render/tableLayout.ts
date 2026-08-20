import type { Graphics } from 'pixi.js';
import type { SeatPosition } from './SeatView';

export interface TableBounds {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}

export interface SeatPlacement {
  visible: boolean;
  layout: SeatPosition;
  x: number;
  y: number;
}

export interface TableLayout {
  width: number;
  height: number;
  isPortrait: boolean;
  isMobile: boolean;
  cx: number;
  cy: number;
  tableBounds: TableBounds;
  pile: { x: number; y: number };
  seats: SeatPlacement[];
}

const REL_POS_PORTRAIT: Array<{ layout: SeatPosition; xFrac: number; yOff: number } | null> = [
  null, // local player: HUD owns the turn; canvas seat is hidden
  { layout: 'top_arc', xFrac: 0.18, yOff: 16 },
  { layout: 'top_arc', xFrac: 0.5, yOff: 6 },
  { layout: 'top_arc', xFrac: 0.82, yOff: 16 },
];

export function computeTableLayout(
  width: number,
  height: number,
  localSeatIndex: number
): TableLayout {
  const cx = width / 2;
  const cy = height / 2;
  const isPortrait = height > width;
  const isMobile = width < 640;
  const local = ((localSeatIndex % 4) + 4) % 4;

  if (isPortrait) {
    const tableW = Math.min(width * 0.94, 400);
    const tableH = Math.min(height * 0.68, 560);
    const tableRadius = tableW * 0.38;
    const feltCy = Math.round(height * 0.39);
    const topArcY = Math.max(88, height * 0.1);
    const pileY = Math.round(height * 0.34);

    const seats: SeatPlacement[] = [0, 1, 2, 3].map((i) => {
      const relPos = (i - local + 4) % 4;
      const spec = REL_POS_PORTRAIT[relPos];
      if (!spec) {
        return { visible: false, layout: 'bottom', x: cx, y: height };
      }
      return {
        visible: true,
        layout: spec.layout,
        x: width * spec.xFrac,
        y: topArcY + spec.yOff,
      };
    });

    return {
      width,
      height,
      isPortrait,
      isMobile,
      cx,
      cy,
      tableBounds: {
        x: cx - tableW / 2,
        y: feltCy - tableH / 2,
        w: tableW,
        h: tableH,
        r: tableRadius,
      },
      pile: { x: cx, y: pileY },
      seats,
    };
  }

  const tableW = Math.min(width * 0.94, 1140);
  const tableH = Math.min(height * 0.88, 740);
  const tableRadius = Math.min(tableW, tableH) * 0.28;
  const seatMarginX = isMobile ? 35 : 70;
  const seatMarginY = isMobile ? 45 : 60;
  const localY = height - (isMobile ? 120 : 145);

  const landscapeByRel: SeatPlacement[] = [
    { visible: true, layout: 'bottom', x: cx, y: localY },
    { visible: true, layout: 'left', x: seatMarginX, y: cy - 20 },
    { visible: true, layout: 'top', x: cx, y: seatMarginY + 20 },
    { visible: true, layout: 'right', x: width - seatMarginX, y: cy - 20 },
  ];

  const seats: SeatPlacement[] = [0, 1, 2, 3].map((i) => {
    const relPos = (i - local + 4) % 4;
    return landscapeByRel[relPos];
  });

  return {
    width,
    height,
    isPortrait,
    isMobile,
    cx,
    cy,
    tableBounds: {
      x: cx - tableW / 2,
      y: cy - tableH / 2,
      w: tableW,
      h: tableH,
      r: tableRadius,
    },
    pile: { x: cx, y: cy - (isMobile ? 15 : 20) },
    seats,
  };
}

/** Felt, rail, and center-trick watermark. Positions come from `computeTableLayout`. */
export function drawTableFelt(g: Graphics, layout: TableLayout): void {
  const { width, height, cx, tableBounds, pile, isPortrait } = layout;
  const { w: tableW, h: tableH, r: tableRadius } = tableBounds;
  const feltCy = tableBounds.y + tableH / 2;

  g.clear();
  g.rect(0, 0, width, height);
  g.fill({ color: 0x05120d });

  if (isPortrait) {
    g.roundRect(cx - tableW / 2 - 4, feltCy - tableH / 2 - 4, tableW + 8, tableH + 8, tableRadius + 4);
    g.fill({ color: 0x0a1c14 });
    g.stroke({ width: 2, color: 0x143425 });

    g.roundRect(cx - tableW / 2, feltCy - tableH / 2, tableW, tableH, tableRadius);
    g.fill({ color: 0x07271a });
    g.stroke({ width: 2, color: 0xd97706, alpha: 0.75 });

    g.roundRect(cx - tableW / 2 + 6, feltCy - tableH / 2 + 6, tableW - 12, tableH - 12, tableRadius - 4);
    g.stroke({ width: 1, color: 0x104d33, alpha: 0.6 });

    g.circle(cx, pile.y, tableW * 0.26);
    g.fill({ color: 0x093020, alpha: 0.5 });
    g.stroke({ width: 1.2, color: 0x15803d, alpha: 0.35 });

    g.circle(cx, pile.y, tableW * 0.24);
    g.stroke({ width: 0.8, color: 0xd97706, alpha: 0.25 });
    return;
  }

  g.roundRect(cx - tableW / 2 - 6, feltCy - tableH / 2 - 6, tableW + 12, tableH + 12, tableRadius + 4);
  g.fill({ color: 0x0a1c14 });
  g.stroke({ width: 2, color: 0x143425 });

  g.roundRect(cx - tableW / 2, feltCy - tableH / 2, tableW, tableH, tableRadius);
  g.fill({ color: 0x07271a });
  g.stroke({ width: 3, color: 0xd97706, alpha: 0.8 });

  g.roundRect(cx - tableW / 2 + 8, feltCy - tableH / 2 + 8, tableW - 16, tableH - 16, tableRadius - 6);
  g.stroke({ width: 1, color: 0x104d33, alpha: 0.5 });

  const centerR = Math.min(tableW, tableH) * 0.24;
  g.circle(cx, feltCy, centerR);
  g.fill({ color: 0x093020, alpha: 0.5 });
  g.stroke({ width: 1.2, color: 0x15803d, alpha: 0.35 });

  g.circle(cx, feltCy, centerR - 6);
  g.stroke({ width: 0.8, color: 0xd97706, alpha: 0.25 });
}

export function pulseTurnGlow(
  g: Graphics,
  bounds: TableBounds,
  pulseTime: number,
  delta: number,
  isMyTurn: boolean
): number {
  if (isMyTurn && bounds.w > 0) {
    const next = pulseTime + 0.08 * delta;
    const glowAlpha = 0.5 + 0.45 * Math.sin(next * 3.5);
    const { x, y, w, h, r } = bounds;

    g.clear();
    g.roundRect(x - 8, y - 8, w + 16, h + 16, r + 6);
    g.stroke({ width: 4, color: 0xf59e0b, alpha: glowAlpha * 0.35 });
    g.roundRect(x - 1, y - 1, w + 2, h + 2, r + 1);
    g.stroke({ width: 3.5, color: 0xfbbf24, alpha: glowAlpha * 0.95 });
    g.roundRect(x + 6, y + 6, w - 12, h - 12, r - 4);
    g.stroke({ width: 1.5, color: 0xfde047, alpha: glowAlpha * 0.55 });
    return next;
  }

  if (pulseTime !== 0) {
    g.clear();
  }
  return 0;
}
