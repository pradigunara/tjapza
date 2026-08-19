import { Container, Graphics, Text, TextStyle } from 'pixi.js';

export type SeatPosition = 'bottom' | 'top' | 'left' | 'right' | 'top_arc';

export class SeatView extends Container {
  public seatIndex: number;
  public isLocal: boolean;
  public positionType: SeatPosition = 'top';

  private avatarGlow: Graphics;
  private avatarCircle: Graphics;
  private avatarIconGfx: Graphics;
  private avatarText: Text;
  private nameContainer: Container;
  private nameBg: Graphics;
  private nameText: Text;

  private cardFanContainer: Container;
  private cardFanGraphics: Graphics;
  private countBadgeBg: Graphics;
  private countBadgeText: Text;

  private statusBadge: Container;
  private statusBg: Graphics;
  private statusText: Text;

  private rankBadge: Container;
  private rankBg: Graphics;
  private rankText: Text;

  private isTurn = false;
  private pulseTime = 0;
  private rank: number | null = null;
  private isBotPlayer = false;

  private turnBadge: Container;
  private turnBadgeBg: Graphics;
  private turnBadgeText: Text;

  constructor(seatIndex: number, isLocal = false) {
    super();
    this.seatIndex = seatIndex;
    this.isLocal = isLocal;

    // 1. Turn glow ring
    this.avatarGlow = new Graphics();
    this.addChild(this.avatarGlow);

    // 2. Avatar base & vector art
    this.avatarCircle = new Graphics();
    this.addChild(this.avatarCircle);

    this.avatarIconGfx = new Graphics();
    this.addChild(this.avatarIconGfx);

    const avatarTextStyle = new TextStyle({
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: 16,
      fontWeight: '800',
      fill: '#ffffff',
    });
    this.avatarText = new Text({ text: 'P', style: avatarTextStyle });
    this.avatarText.anchor.set(0.5, 0.5);
    this.addChild(this.avatarText);

    // 3. Name Tag
    this.nameContainer = new Container();
    this.nameBg = new Graphics();
    this.nameContainer.addChild(this.nameBg);

    const nameStyle = new TextStyle({
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: 11.5,
      fontWeight: '700',
      fill: '#f8fafc',
    });
    this.nameText = new Text({ text: `${seatIndex + 1} | Seat ${seatIndex + 1}`, style: nameStyle });
    this.nameText.anchor.set(0.5, 0.5);
    this.nameContainer.addChild(this.nameText);
    this.addChild(this.nameContainer);

    // 3b. Turn Indicator Pill
    this.turnBadge = new Container();
    this.turnBadgeBg = new Graphics();
    this.turnBadge.addChild(this.turnBadgeBg);

    const turnBadgeStyle = new TextStyle({
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: 9.5,
      fontWeight: '800',
      fill: '#0f172a',
      letterSpacing: 0.5,
    });
    this.turnBadgeText = new Text({ text: '▶ TURN', style: turnBadgeStyle });
    this.turnBadgeText.anchor.set(0.5, 0.5);
    this.turnBadge.addChild(this.turnBadgeText);
    this.turnBadge.visible = false;
    this.addChild(this.turnBadge);

    // 4. Opponent mini card fan & count badge
    this.cardFanContainer = new Container();
    this.cardFanGraphics = new Graphics();
    this.countBadgeBg = new Graphics();
    this.cardFanContainer.addChild(this.cardFanGraphics);
    this.cardFanContainer.addChild(this.countBadgeBg);

    const countStyle = new TextStyle({
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: 11,
      fontWeight: '800',
      fill: '#ffffff',
    });
    this.countBadgeText = new Text({ text: '13', style: countStyle });
    this.countBadgeText.anchor.set(0.5, 0.5);
    this.cardFanContainer.addChild(this.countBadgeText);
    this.addChild(this.cardFanContainer);

    // 5. Pass / Status Badge
    this.statusBadge = new Container();
    this.statusBg = new Graphics();
    this.statusBadge.addChild(this.statusBg);

    const statusStyle = new TextStyle({
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: 10,
      fontWeight: '800',
      fill: '#fca5a5',
    });
    this.statusText = new Text({ text: 'PASSED', style: statusStyle });
    this.statusText.anchor.set(0.5, 0.5);
    this.statusBadge.addChild(this.statusText);
    this.statusBadge.visible = false;
    this.addChild(this.statusBadge);

    // 6. Finish Rank Badge
    this.rankBadge = new Container();
    this.rankBg = new Graphics();
    this.rankBadge.addChild(this.rankBg);

    const rankStyle = new TextStyle({
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: 11,
      fontWeight: '800',
      fill: '#ffffff',
    });
    this.rankText = new Text({ text: '1st', style: rankStyle });
    this.rankText.anchor.set(0.5, 0.5);
    this.rankBadge.addChild(this.rankText);
    this.rankBadge.visible = false;
    this.addChild(this.rankBadge);

    this.drawAvatar(0x334155);
  }

  public setPlayerInfo(
    name: string,
    isBot: boolean,
    connected: boolean,
    avatarChar?: string
  ): void {
    this.isBotPlayer = isBot;
    const seatNum = this.seatIndex + 1;
    const maxLen = this.positionType === 'top_arc' ? 10 : 12;
    let cleanName = name || (isBot ? 'Bot' : 'Player');

    if (cleanName.length > maxLen) {
      cleanName = cleanName.substring(0, maxLen - 1) + '…';
    }

    const displayName = isBot ? `${cleanName}` : (connected ? cleanName : `${cleanName} (Off)`);
    this.nameText.text = `${seatNum} | ${displayName}`;

    if (isBot) {
      this.avatarText.visible = false;
      this.avatarIconGfx.visible = true;
      this.drawBotIcon();
    } else {
      this.avatarIconGfx.visible = false;
      this.avatarText.visible = true;
      const initial = avatarChar || cleanName.substring(0, 1).toUpperCase() || 'P';
      this.avatarText.text = initial;
    }

    const bgColor = isBot ? 0x1e293b : this.isLocal ? 0x0369a1 : 0x065f46;
    this.drawAvatar(bgColor);
    this.relayout();
  }

  private drawBotIcon(): void {
    this.avatarIconGfx.clear();

    // Vector Robot Persona (No Emoji)
    // Head unit
    this.avatarIconGfx.roundRect(-8, -6, 16, 12, 3);
    this.avatarIconGfx.fill({ color: 0x334155 });
    this.avatarIconGfx.stroke({ width: 1.2, color: 0x38bdf8, alpha: 0.9 });

    // Glowing Cyan Visor / Eyes
    this.avatarIconGfx.roundRect(-5.5, -3, 11, 4, 1.5);
    this.avatarIconGfx.fill({ color: 0x38bdf8 });

    // Antenna
    this.avatarIconGfx.moveTo(0, -6);
    this.avatarIconGfx.lineTo(0, -10);
    this.avatarIconGfx.stroke({ width: 1.5, color: 0x38bdf8 });
    this.avatarIconGfx.circle(0, -11, 2);
    this.avatarIconGfx.fill({ color: 0xf59e0b });
  }

  public setCardCount(count: number): void {
    this.countBadgeText.text = String(count);

    if (this.isLocal) {
      this.cardFanContainer.visible = false;
    } else {
      this.cardFanContainer.visible = count > 0;
      this.drawMiniCardFan(count);
    }
  }

  public setIsTurn(isTurn: boolean): void {
    this.isTurn = isTurn;
    this.turnBadge.visible = isTurn && (this.rank === null);
    if (!isTurn) {
      this.avatarGlow.clear();
      this.nameBg.stroke({ width: 1, color: 0x334155, alpha: 0.8 });
    } else {
      this.statusBadge.visible = false;
      this.drawTurnBadge();
      this.nameBg.stroke({ width: 1.5, color: 0xf59e0b, alpha: 0.95 });
    }
  }

  private drawTurnBadge(): void {
    const w = 48;
    const h = 17;
    this.turnBadgeBg.clear();
    this.turnBadgeBg.roundRect(-w / 2, -h / 2, w, h, 8.5);
    this.turnBadgeBg.fill({ color: 0xf59e0b });
    this.turnBadgeBg.stroke({ width: 1, color: 0xffffff, alpha: 0.9 });
  }

  public setHasPassed(hasPassed: boolean): void {
    this.statusBadge.visible = hasPassed && (this.rank === null);
    if (hasPassed) {
      this.drawStatus('PASSED', 0xef4444);
      this.turnBadge.visible = false;
    }
  }

  public setRank(rank: number | null): void {
    this.rank = rank;
    if (rank !== null && rank > 0) {
      this.rankBadge.visible = true;
      this.statusBadge.visible = false;
      this.turnBadge.visible = false;
      this.cardFanContainer.visible = false;

      let rankLabel = '';
      let rankColor = 0xeab308;
      if (rank === 1) {
        rankLabel = '★ 1st Place';
        rankColor = 0xd97706;
      } else if (rank === 2) {
        rankLabel = '2nd Place';
        rankColor = 0x64748b;
      } else if (rank === 3) {
        rankLabel = '3rd Place';
        rankColor = 0x9a3412;
      } else {
        rankLabel = '4th Place';
        rankColor = 0x334155;
      }

      this.rankText.text = rankLabel;
      const w = Math.max(70, this.rankText.width + 16);
      this.rankBg.clear();
      this.rankBg.roundRect(-w / 2, -10, w, 20, 10);
      this.rankBg.fill({ color: rankColor });
      this.rankBg.stroke({ width: 1.2, color: 0xffffff, alpha: 0.85 });
    } else {
      this.rankBadge.visible = false;
    }
  }

  public layoutForPosition(type: SeatPosition): void {
    this.positionType = type;
    this.relayout();
  }

  private drawAvatar(bgColor: number): void {
    const radius = this.positionType === 'top_arc' ? 20 : 23;
    this.avatarCircle.clear();

    // Outer shadow rim
    this.avatarCircle.circle(0, 1, radius + 1);
    this.avatarCircle.fill({ color: 0x000000, alpha: 0.35 });

    // Inner avatar fill
    this.avatarCircle.circle(0, 0, radius);
    this.avatarCircle.fill({ color: bgColor });

    // Beveled metallic border
    const strokeColor = this.isLocal ? 0x38bdf8 : this.isBotPlayer ? 0x64748b : 0x34d399;
    this.avatarCircle.stroke({ width: 2, color: strokeColor, alpha: 0.85 });
  }

  private drawMiniCardFan(count: number): void {
    this.cardFanGraphics.clear();
    const fanCount = Math.min(count, 4);
    const cardW = 11;
    const cardH = 16;
    const spacing = 4;
    const totalW = (fanCount - 1) * spacing + cardW;
    const startX = -totalW / 2;

    for (let i = 0; i < fanCount; i++) {
      const x = startX + i * spacing;
      this.cardFanGraphics.roundRect(x, 0, cardW, cardH, 2);
      this.cardFanGraphics.fill({ color: 0x0f172a });
      this.cardFanGraphics.stroke({ width: 0.8, color: 0xd97706, alpha: 0.85 });
    }

    // Badge color: alert red if <= 3 cards
    const isDanger = count <= 3 && count > 0;
    const badgeColor = isDanger ? 0xdc2626 : 0x0f172a;

    this.countBadgeBg.clear();
    this.countBadgeBg.roundRect(-13, 8, 26, 15, 7.5);
    this.countBadgeBg.fill({ color: badgeColor });
    this.countBadgeBg.stroke({ width: 1, color: isDanger ? 0xfca5a5 : 0x475569, alpha: 0.9 });
    this.countBadgeText.position.set(0, 15.5);
  }

  private drawStatus(text: string, color: number): void {
    this.statusText.text = text;
    const w = this.statusText.width + 14;
    const h = 20;
    this.statusBg.clear();
    this.statusBg.roundRect(-w / 2, -h / 2, w, h, 10);
    this.statusBg.fill({ color: 0x0f172a, alpha: 0.92 });
    this.statusBg.stroke({ width: 1.2, color: color, alpha: 0.9 });
  }

  private relayout(): void {
    const textW = Math.max(64, this.nameText.width + 16);
    const textH = 21;

    this.nameBg.clear();
    this.nameBg.roundRect(-textW / 2, -textH / 2, textW, textH, 6);
    this.nameBg.fill({ color: 0x0f172a, alpha: 0.88 });
    this.nameBg.stroke({ width: this.isTurn ? 1.5 : 1, color: this.isTurn ? 0xf59e0b : 0x334155, alpha: 0.85 });

    if (this.positionType === 'top_arc') {
      // Clean top arc layout for mobile portrait
      this.nameContainer.position.set(0, -28);
      this.cardFanContainer.position.set(0, 28);
      this.statusBadge.position.set(0, 48);
      this.turnBadge.position.set(0, 48);
      this.rankBadge.position.set(0, 28);
    } else if (this.positionType === 'top') {
      this.nameContainer.position.set(0, 32);
      this.cardFanContainer.position.set(0, 64);
      this.statusBadge.position.set(0, 88);
      this.turnBadge.position.set(0, 88);
      this.rankBadge.position.set(0, 64);
    } else if (this.positionType === 'left') {
      this.nameContainer.position.set(0, 32);
      this.cardFanContainer.position.set(48, 0);
      this.statusBadge.position.set(0, -32);
      this.turnBadge.position.set(0, -32);
      this.rankBadge.position.set(48, 0);
    } else if (this.positionType === 'right') {
      this.nameContainer.position.set(0, 32);
      this.cardFanContainer.position.set(-48, 0);
      this.statusBadge.position.set(0, -32);
      this.turnBadge.position.set(0, -32);
      this.rankBadge.position.set(-48, 0);
    } else {
      // Bottom (Local Player)
      this.nameContainer.position.set(0, -32);
      this.statusBadge.position.set(0, -56);
      this.turnBadge.position.set(0, -56);
      this.rankBadge.position.set(0, -32);
    }
  }

  public update(delta: number): void {
    if (this.isTurn) {
      this.pulseTime += 0.08 * delta;
      const glowAlpha = 0.50 + 0.45 * Math.sin(this.pulseTime * 3.5);
      const radius = (this.positionType === 'top_arc' ? 20 : 23) + 5;

      this.avatarGlow.clear();
      // Outer soft aura
      this.avatarGlow.circle(0, 0, radius + 3);
      this.avatarGlow.stroke({ width: 2, color: 0xf59e0b, alpha: glowAlpha * 0.4 });
      // Sharp inner aura ring
      this.avatarGlow.circle(0, 0, radius);
      this.avatarGlow.stroke({ width: 2.5, color: 0xfbbf24, alpha: glowAlpha });
    }
  }
}

