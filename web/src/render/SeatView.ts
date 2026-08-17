import { Container, Graphics, Text, TextStyle } from 'pixi.js';

export type SeatPosition = 'bottom' | 'top' | 'left' | 'right';

export class SeatView extends Container {
  public seatIndex: number;
  public isLocal: boolean;
  public positionType: SeatPosition = 'top';

  private avatarGlow: Graphics;
  private avatarCircle: Graphics;
  private avatarText: Text;
  private nameContainer: Container;
  private nameBg: Graphics;
  private nameText: Text;
  private tagText: Text;

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

  constructor(seatIndex: number, isLocal = false) {
    super();
    this.seatIndex = seatIndex;
    this.isLocal = isLocal;

    // 1. Turn glow ring
    this.avatarGlow = new Graphics();
    this.addChild(this.avatarGlow);

    // 2. Avatar base
    this.avatarCircle = new Graphics();
    this.addChild(this.avatarCircle);

    const avatarTextStyle = new TextStyle({
      fontFamily: 'system-ui, sans-serif',
      fontSize: 18,
      fontWeight: 'bold',
      fill: '#ffffff',
    });
    this.avatarText = new Text({ text: 'P', style: avatarTextStyle });
    this.avatarText.anchor.set(0.5, 0.5);
    this.addChild(this.avatarText);

    // 3. Name & Role Tag
    this.nameContainer = new Container();
    this.nameBg = new Graphics();
    this.nameContainer.addChild(this.nameBg);

    const nameStyle = new TextStyle({
      fontFamily: 'system-ui, sans-serif',
      fontSize: 13,
      fontWeight: '700',
      fill: '#f8fafc',
    });
    this.nameText = new Text({ text: `Seat ${seatIndex + 1}`, style: nameStyle });
    this.nameText.anchor.set(0.5, 0.5);
    this.nameContainer.addChild(this.nameText);

    const tagStyle = new TextStyle({
      fontFamily: 'system-ui, sans-serif',
      fontSize: 10,
      fontWeight: 'bold',
      fill: '#94a3b8',
    });
    this.tagText = new Text({ text: '', style: tagStyle });
    this.tagText.anchor.set(0.5, 0.5);
    this.nameContainer.addChild(this.tagText);

    this.addChild(this.nameContainer);

    // 4. Opponent mini card fan & count badge
    this.cardFanContainer = new Container();
    this.cardFanGraphics = new Graphics();
    this.countBadgeBg = new Graphics();
    this.cardFanContainer.addChild(this.cardFanGraphics);
    this.cardFanContainer.addChild(this.countBadgeBg);

    const countStyle = new TextStyle({
      fontFamily: 'system-ui, sans-serif',
      fontSize: 12,
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
      fontFamily: 'system-ui, sans-serif',
      fontSize: 11,
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
      fontFamily: 'system-ui, sans-serif',
      fontSize: 12,
      fontWeight: '800',
      fill: '#ffffff',
    });
    this.rankText = new Text({ text: '👑 1st', style: rankStyle });
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
    const cleanName = name.length > 10 ? name.substring(0, 9) + '…' : name;
    this.nameText.text = isBot ? `${cleanName}` : (connected ? cleanName : `${cleanName} (Off)`);
    this.tagText.text = '';

    const initial = isBot ? '🤖' : (avatarChar || name.substring(0, 1).toUpperCase() || 'P');
    this.avatarText.text = initial;

    const bgColor = isBot ? 0x475569 : this.isLocal ? 0x0284c7 : 0x059669;
    this.drawAvatar(bgColor);
    this.relayout();
  }

  public setCardCount(count: number): void {
    this.countBadgeText.text = String(count);

    if (this.isLocal) {
      // Local player has hand fan, hide mini card fan
      this.cardFanContainer.visible = false;
    } else {
      this.cardFanContainer.visible = count > 0;
      this.drawMiniCardFan(count);
    }
  }

  public setIsTurn(isTurn: boolean): void {
    this.isTurn = isTurn;
    if (!isTurn) {
      this.avatarGlow.clear();
    }
  }

  public setHasPassed(hasPassed: boolean): void {
    this.statusBadge.visible = hasPassed && (this.rank === null);
    if (hasPassed) {
      this.drawStatus('PASSED', 0xef4444);
    }
  }

  public setRank(rank: number | null): void {
    this.rank = rank;
    if (rank !== null && rank > 0) {
      this.rankBadge.visible = true;
      this.statusBadge.visible = false;
      this.cardFanContainer.visible = false;

      let rankLabel = '';
      let rankColor = 0xeab308;
      if (rank === 1) {
        rankLabel = '👑 1st Place';
        rankColor = 0xeab308;
      } else if (rank === 2) {
        rankLabel = '🥈 2nd Place';
        rankColor = 0x94a3b8;
      } else if (rank === 3) {
        rankLabel = '🥉 3rd Place';
        rankColor = 0xb45309;
      } else {
        rankLabel = '4th Place';
        rankColor = 0x64748b;
      }

      this.rankText.text = rankLabel;
      this.rankBg.clear();
      this.rankBg.roundRect(-45, -12, 90, 24, 12);
      this.rankBg.fill({ color: rankColor });
      this.rankBg.stroke({ width: 1.5, color: 0xffffff, alpha: 0.8 });
    } else {
      this.rankBadge.visible = false;
    }
  }

  public layoutForPosition(type: SeatPosition): void {
    this.positionType = type;
    this.relayout();
  }

  private drawAvatar(bgColor: number): void {
    this.avatarCircle.clear();
    this.avatarCircle.circle(0, 0, 24);
    this.avatarCircle.fill({ color: bgColor });
    this.avatarCircle.stroke({ width: 2, color: 0xffffff, alpha: 0.6 });
  }

  private drawMiniCardFan(count: number): void {
    this.cardFanGraphics.clear();
    const fanCards = Math.min(5, Math.max(1, count));
    const cardW = 14;
    const cardH = 20;
    const spacing = 7;
    const startX = -((fanCards - 1) * spacing) / 2;

    for (let i = 0; i < fanCards; i++) {
      const x = startX + i * spacing;
      this.cardFanGraphics.roundRect(x - cardW / 2, -cardH / 2, cardW, cardH, 2);
      this.cardFanGraphics.fill({ color: 0x1e293b });
      this.cardFanGraphics.stroke({ width: 1, color: 0xd97706 });
    }

    // Badge color: alert red if <= 3 cards
    const isDanger = count <= 3 && count > 0;
    const badgeColor = isDanger ? 0xef4444 : 0x0f172a;

    this.countBadgeBg.clear();
    this.countBadgeBg.roundRect(-14, 10, 28, 16, 8);
    this.countBadgeBg.fill({ color: badgeColor });
    this.countBadgeBg.stroke({ width: 1.2, color: isDanger ? 0xfca5a5 : 0x475569 });

    this.countBadgeText.position.set(0, 18);
  }

  private drawStatus(text: string, color: number): void {
    this.statusText.text = text;
    this.statusBg.clear();
    this.statusBg.roundRect(-30, -10, 60, 20, 10);
    this.statusBg.fill({ color: 0x0f172a, alpha: 0.85 });
    this.statusBg.stroke({ width: 1.5, color });
  }

  private relayout(): void {
    const isTop = this.positionType === 'top';
    const isLeft = this.positionType === 'left';
    const isRight = this.positionType === 'right';

    // Position Name Box
    const nameW = 100;
    const nameH = 24;
    this.nameBg.clear();
    this.nameBg.roundRect(-nameW / 2, -nameH / 2, nameW, nameH, 12);
    this.nameBg.fill({ color: 0x0f172a, alpha: 0.85 });
    this.nameBg.stroke({ width: 1.2, color: 0x334155 });

    if (isTop) {
      this.nameContainer.position.set(0, 36);
      this.cardFanContainer.position.set(0, 72);
      this.statusBadge.position.set(0, -32);
      this.rankBadge.position.set(0, 70);
    } else if (isLeft) {
      this.nameContainer.position.set(0, 36);
      this.cardFanContainer.position.set(48, 0);
      this.statusBadge.position.set(0, -32);
      this.rankBadge.position.set(0, 64);
    } else if (isRight) {
      this.nameContainer.position.set(0, 36);
      this.cardFanContainer.position.set(-48, 0);
      this.statusBadge.position.set(0, -32);
      this.rankBadge.position.set(0, 64);
    } else {
      // Bottom local seat
      this.nameContainer.position.set(0, -36);
      this.statusBadge.position.set(0, -64);
      this.rankBadge.position.set(0, -64);
    }
  }

  public update(delta: number): void {
    if (this.isTurn && this.rank === null) {
      this.pulseTime += 0.08 * delta;
      const alpha = 0.5 + 0.5 * Math.sin(this.pulseTime * 4);
      const ringScale = 1.0 + 0.08 * Math.sin(this.pulseTime * 4);

      this.avatarGlow.clear();
      this.avatarGlow.circle(0, 0, 27 * ringScale);
      this.avatarGlow.stroke({ width: 3.5, color: 0xf59e0b, alpha });
    }
  }
}
