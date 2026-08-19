"use strict";
var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/domain/index.ts
var index_exports = {};
__export(index_exports, {
  BotEngine: () => BotEngine,
  CARD_3D: () => CARD_3D,
  CATEGORY_TIERS: () => CATEGORY_TIERS,
  CapsaGame: () => CapsaGame,
  Card: () => Card,
  CardCombo: () => CardCombo,
  Deck: () => Deck,
  Hand: () => Hand,
  PUBLIC_LOBBY_AUTOSTART_MS: () => PUBLIC_LOBBY_AUTOSTART_MS,
  PUBLIC_LOBBY_AUTOSTART_SECS: () => PUBLIC_LOBBY_AUTOSTART_SECS,
  Podium: () => Podium,
  RANK_10: () => RANK_10,
  RANK_2: () => RANK_2,
  RANK_3: () => RANK_3,
  RANK_4: () => RANK_4,
  RANK_5: () => RANK_5,
  RANK_6: () => RANK_6,
  RANK_7: () => RANK_7,
  RANK_8: () => RANK_8,
  RANK_9: () => RANK_9,
  RANK_A: () => RANK_A,
  RANK_J: () => RANK_J,
  RANK_K: () => RANK_K,
  RANK_NAMES: () => RANK_NAMES,
  RANK_Q: () => RANK_Q,
  Room: () => Room,
  RoomCode: () => RoomCode,
  STRAIGHT_PATTERNS: () => STRAIGHT_PATTERNS,
  SUIT_CLUBS: () => SUIT_CLUBS,
  SUIT_DIAMONDS: () => SUIT_DIAMONDS,
  SUIT_HEARTS: () => SUIT_HEARTS,
  SUIT_NAMES: () => SUIT_NAMES,
  SUIT_SPADES: () => SUIT_SPADES,
  SUIT_SYMBOLS: () => SUIT_SYMBOLS,
  Seat: () => Seat,
  TURN_TIMEOUT_MS: () => TURN_TIMEOUT_MS,
  TURN_TIMEOUT_SECS: () => TURN_TIMEOUT_SECS,
  Trick: () => Trick,
  TurnTimer: () => TurnTimer,
  parseJSON: () => parseJSON
});
module.exports = __toCommonJS(index_exports);

// src/domain/constants.ts
var SUIT_DIAMONDS = 0;
var SUIT_CLUBS = 1;
var SUIT_HEARTS = 2;
var SUIT_SPADES = 3;
var RANK_3 = 0;
var RANK_4 = 1;
var RANK_5 = 2;
var RANK_6 = 3;
var RANK_7 = 4;
var RANK_8 = 5;
var RANK_9 = 6;
var RANK_10 = 7;
var RANK_J = 8;
var RANK_Q = 9;
var RANK_K = 10;
var RANK_A = 11;
var RANK_2 = 12;
var CARD_3D = 0;
var SUIT_SYMBOLS = ["\u2666", "\u2663", "\u2665", "\u2660"];
var SUIT_NAMES = ["D", "C", "H", "S"];
var RANK_NAMES = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];
var CATEGORY_TIERS = {
  single: 0,
  pair: 0,
  straight: 1,
  flush: 2,
  full_house: 3,
  quads: 4,
  straight_flush: 5
};
var TURN_TIMEOUT_SECS = 60;
var TURN_TIMEOUT_MS = TURN_TIMEOUT_SECS * 1e3;
var PUBLIC_LOBBY_AUTOSTART_SECS = 30;
var PUBLIC_LOBBY_AUTOSTART_MS = PUBLIC_LOBBY_AUTOSTART_SECS * 1e3;
function parseJSON(val, fallback) {
  if (val === null || val === void 0) return fallback;
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch (e) {
      return fallback;
    }
  }
  if (Array.isArray(val) && val.length > 0 && typeof val[0] === "number") {
    try {
      let str = "";
      for (let i = 0; i < val.length; i++) {
        str += String.fromCharCode(val[i]);
      }
      return JSON.parse(str);
    } catch (e) {
      return fallback;
    }
  }
  if (typeof val === "object") {
    return val;
  }
  return fallback;
}

// src/domain/Card.ts
var Card = class _Card {
  constructor(code) {
    __publicField(this, "code");
    __publicField(this, "rank");
    __publicField(this, "suit");
    if (!Number.isInteger(code) || code < 0 || code > 51) {
      throw new Error(`Invalid card code: ${code}. Expected integer between 0 and 51.`);
    }
    this.code = code;
    this.rank = Math.floor(code / 4);
    this.suit = code % 4;
  }
  // --- Static Factories ---
  static fromCode(code) {
    return new _Card(code);
  }
  static fromRankSuit(rank, suit) {
    return new _Card(rank * 4 + suit);
  }
  static fromString(str) {
    const trimmed = str.trim();
    if (trimmed.length < 2) {
      throw new Error(`Invalid card string representation: "${str}"`);
    }
    let rankStr;
    let suitStr;
    if (trimmed.startsWith("10")) {
      rankStr = "10";
      suitStr = trimmed.substring(2);
    } else {
      rankStr = trimmed.substring(0, 1).toUpperCase();
      suitStr = trimmed.substring(1);
    }
    const rankIdx = RANK_NAMES.indexOf(rankStr);
    if (rankIdx === -1) {
      throw new Error(`Unknown card rank in string: "${rankStr}"`);
    }
    let suitIdx = SUIT_SYMBOLS.indexOf(suitStr);
    if (suitIdx === -1) {
      const upperSuit = suitStr.toUpperCase();
      suitIdx = SUIT_NAMES.indexOf(upperSuit);
    }
    if (suitIdx === -1) {
      throw new Error(`Unknown card suit in string: "${suitStr}"`);
    }
    return _Card.fromRankSuit(rankIdx, suitIdx);
  }
  static sort(cards) {
    return [...cards].sort((a, b) => a.compareTo(b));
  }
  static sortCodes(codes) {
    return [...codes].sort((a, b) => a - b);
  }
  // --- Getters & Queries ---
  get rankName() {
    return RANK_NAMES[this.rank];
  }
  get suitSymbol() {
    return SUIT_SYMBOLS[this.suit];
  }
  get name() {
    return `${this.rankName}${this.suitSymbol}`;
  }
  get isRed() {
    return this.suit === 0 || this.suit === 2;
  }
  get is3Diamonds() {
    return this.code === CARD_3D;
  }
  // --- Comparisons ---
  /**
   * Pure comparison for ascending power (Rank primary, Suit secondary).
   */
  compareTo(other) {
    return this.code - other.code;
  }
  equals(other) {
    return other != null && this.code === other.code;
  }
  isHigherThan(other) {
    return this.code > other.code;
  }
  hasSameRank(other) {
    return this.rank === other.rank;
  }
  hasSameSuit(other) {
    return this.suit === other.suit;
  }
  toString() {
    return this.name;
  }
};

// src/domain/Deck.ts
var Deck = class _Deck {
  constructor(cards) {
    __publicField(this, "cards");
    if (cards) {
      this.cards = cards;
    } else {
      this.cards = Array.from({ length: 52 }, (_, i) => new Card(i));
    }
  }
  static createStandard() {
    return new _Deck();
  }
  /**
   * Pure deterministic/injected shuffle or default random shuffle.
   */
  shuffle(randomFn = Math.random) {
    const arr = [...this.cards];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(randomFn() * (i + 1));
      const temp = arr[i];
      arr[i] = arr[j];
      arr[j] = temp;
    }
    return new _Deck(arr);
  }
  /**
   * Deal 52 cards equally among 4 seats.
   * Returns sorted hands and identifies which seat holds 3♦.
   */
  deal(playerCount = 4) {
    const hands = Array.from({ length: playerCount }, () => []);
    let startingSeat = 0;
    for (let i = 0; i < this.cards.length; i++) {
      const seat = i % playerCount;
      const card = this.cards[i];
      hands[seat].push(card);
      if (card.code === CARD_3D) {
        startingSeat = seat;
      }
    }
    for (let s = 0; s < playerCount; s++) {
      hands[s] = Card.sort(hands[s]);
    }
    return {
      hands,
      startingSeat
    };
  }
};

// src/domain/CardCombo.ts
var STRAIGHT_PATTERNS = [
  { order: 0, ranks: [0, 1, 2, 11, 12], topRank: 2, name: "A-2-3-4-5" },
  { order: 1, ranks: [0, 1, 2, 3, 12], topRank: 3, name: "2-3-4-5-6" },
  { order: 2, ranks: [0, 1, 2, 3, 4], topRank: 4, name: "3-4-5-6-7" },
  { order: 3, ranks: [1, 2, 3, 4, 5], topRank: 5, name: "4-5-6-7-8" },
  { order: 4, ranks: [2, 3, 4, 5, 6], topRank: 6, name: "5-6-7-8-9" },
  { order: 5, ranks: [3, 4, 5, 6, 7], topRank: 7, name: "6-7-8-9-10" },
  { order: 6, ranks: [4, 5, 6, 7, 8], topRank: 8, name: "7-8-9-10-J" },
  { order: 7, ranks: [5, 6, 7, 8, 9], topRank: 9, name: "8-9-10-J-Q" },
  { order: 8, ranks: [6, 7, 8, 9, 10], topRank: 10, name: "9-10-J-Q-K" },
  { order: 9, ranks: [7, 8, 9, 10, 11], topRank: 11, name: "10-J-Q-K-A" },
  { order: 10, ranks: [8, 9, 10, 11, 12], topRank: 12, name: "J-Q-K-A-2" }
];
var CardCombo = class _CardCombo {
  constructor(params) {
    __publicField(this, "type");
    __publicField(this, "cards");
    __publicField(this, "categoryTier");
    __publicField(this, "mainRank");
    __publicField(this, "suit");
    __publicField(this, "straightOrder");
    __publicField(this, "ranksDesc");
    this.type = params.type;
    this.cards = Card.sort(params.cards);
    this.categoryTier = params.categoryTier;
    this.mainRank = params.mainRank;
    this.suit = params.suit;
    this.straightOrder = params.straightOrder;
    this.ranksDesc = params.ranksDesc;
  }
  // --- Evaluation Factory ---
  static evaluate(input) {
    if (!input || input.length !== 1 && input.length !== 2 && input.length !== 5) {
      return null;
    }
    const cards = Card.sort(
      input.map((c) => typeof c === "number" ? new Card(c) : c)
    );
    const count = cards.length;
    if (count === 1) {
      const card = cards[0];
      return new _CardCombo({
        type: "single",
        cards,
        categoryTier: 0,
        mainRank: card.rank,
        suit: card.suit
      });
    }
    if (count === 2) {
      if (cards[0].rank === cards[1].rank) {
        return new _CardCombo({
          type: "pair",
          cards,
          categoryTier: 0,
          mainRank: cards[0].rank,
          suit: cards[1].suit
          // highest card suit in pair
        });
      }
      return null;
    }
    return _CardCombo.evaluate5Cards(cards);
  }
  static evaluate5Cards(cards) {
    const ranks = cards.map((c) => c.rank);
    const suits = cards.map((c) => c.suit);
    const rankCounts = {};
    for (const r of ranks) {
      rankCounts[r] = (rankCounts[r] || 0) + 1;
    }
    const counts = Object.values(rankCounts).sort((a, b) => b - a);
    const isFlush = suits.every((s) => s === suits[0]);
    const straightMatch = _CardCombo.findStraightPattern(ranks);
    if (isFlush && straightMatch) {
      const topCard = cards.find((c) => c.rank === straightMatch.topRank);
      return new _CardCombo({
        type: "straight_flush",
        cards,
        categoryTier: CATEGORY_TIERS.straight_flush,
        mainRank: straightMatch.topRank,
        suit: topCard.suit,
        straightOrder: straightMatch.order
      });
    }
    if (counts[0] === 4) {
      let quadRank = 0;
      for (const [rStr, cnt] of Object.entries(rankCounts)) {
        if (cnt === 4) quadRank = Number(rStr);
      }
      return new _CardCombo({
        type: "quads",
        cards,
        categoryTier: CATEGORY_TIERS.quads,
        mainRank: quadRank,
        suit: 0
        // rank is unique in single deck
      });
    }
    if (counts[0] === 3 && counts[1] === 2) {
      let tripleRank = 0;
      for (const [rStr, cnt] of Object.entries(rankCounts)) {
        if (cnt === 3) tripleRank = Number(rStr);
      }
      return new _CardCombo({
        type: "full_house",
        cards,
        categoryTier: CATEGORY_TIERS.full_house,
        mainRank: tripleRank,
        suit: 0
      });
    }
    if (isFlush) {
      const ranksDesc = [...ranks].reverse();
      return new _CardCombo({
        type: "flush",
        cards,
        categoryTier: CATEGORY_TIERS.flush,
        mainRank: ranksDesc[0],
        suit: suits[0],
        ranksDesc
      });
    }
    if (straightMatch) {
      const topCard = cards.find((c) => c.rank === straightMatch.topRank);
      return new _CardCombo({
        type: "straight",
        cards,
        categoryTier: CATEGORY_TIERS.straight,
        mainRank: straightMatch.topRank,
        suit: topCard.suit,
        straightOrder: straightMatch.order
      });
    }
    return null;
  }
  static findStraightPattern(sortedRanks) {
    for (const pattern of STRAIGHT_PATTERNS) {
      const pRanks = [...pattern.ranks].sort((a, b) => a - b);
      if (sortedRanks.every((r, idx) => r === pRanks[idx])) {
        return pattern;
      }
    }
    return null;
  }
  // --- Getters & Queries ---
  get cardCodes() {
    return this.cards.map((c) => c.code);
  }
  get cardCount() {
    return this.cards.length;
  }
  get is5CardCombo() {
    return this.cardCount === 5;
  }
  containsCardCode(code) {
    return this.cards.some((c) => c.code === code);
  }
  get description() {
    var _a, _b, _c, _d, _e;
    const mainRankName = (_a = RANK_NAMES[this.mainRank]) != null ? _a : "";
    const suitSymbol = (_b = SUIT_SYMBOLS[this.suit]) != null ? _b : "";
    switch (this.type) {
      case "single":
        return `${mainRankName}${suitSymbol}`;
      case "pair":
        return `Pair of ${mainRankName}s`;
      case "straight":
        return `Straight (${(_e = (_d = STRAIGHT_PATTERNS[(_c = this.straightOrder) != null ? _c : 0]) == null ? void 0 : _d.name) != null ? _e : mainRankName})`;
      case "flush":
        return `Flush (${suitSymbol})`;
      case "full_house":
        return `Full House (${mainRankName}s full)`;
      case "quads":
        return `Four of a Kind (${mainRankName}s)`;
      case "straight_flush":
        return `Straight Flush (${suitSymbol})`;
    }
  }
  // --- Power Comparison ---
  get power() {
    return this.calculatedPower;
  }
  /**
   * Pure power integer for ordering in SQLite moves table.
   */
  get calculatedPower() {
    var _a, _b;
    switch (this.type) {
      case "single":
        return this.cards[0].code;
      case "pair":
        return this.mainRank * 4 + this.suit;
      case "straight":
        return 1e7 + ((_a = this.straightOrder) != null ? _a : 0) * 4 + this.suit;
      case "flush": {
        const d = this.ranksDesc || [this.mainRank, 0, 0, 0, 0];
        const poly = d[0] * 28561 + d[1] * 2197 + d[2] * 169 + d[3] * 13 + d[4];
        return 2e7 + poly * 4 + this.suit;
      }
      case "full_house":
        return 3e7 + this.mainRank * 100;
      case "quads":
        return 4e7 + this.mainRank * 100;
      case "straight_flush":
        return 5e7 + ((_b = this.straightOrder) != null ? _b : 0) * 4 + this.suit;
    }
  }
  /**
   * Compare two combos: returns positive if this > other, negative if this < other, 0 if equal.
   */
  compareTo(other) {
    var _a, _b, _c, _d;
    if (this.type === "single" && other.type === "single") {
      if (this.mainRank !== other.mainRank) return this.mainRank - other.mainRank;
      return this.suit - other.suit;
    }
    if (this.type === "pair" && other.type === "pair") {
      if (this.mainRank !== other.mainRank) return this.mainRank - other.mainRank;
      return this.suit - other.suit;
    }
    if (this.is5CardCombo && other.is5CardCombo) {
      if (this.categoryTier !== other.categoryTier) {
        return this.categoryTier - other.categoryTier;
      }
      switch (this.type) {
        case "straight":
        case "straight_flush": {
          if (this.straightOrder !== other.straightOrder) {
            return ((_a = this.straightOrder) != null ? _a : 0) - ((_b = other.straightOrder) != null ? _b : 0);
          }
          return this.suit - other.suit;
        }
        case "flush": {
          const aRanks = this.ranksDesc || [];
          const bRanks = other.ranksDesc || [];
          for (let i = 0; i < 5; i++) {
            const diff = ((_c = aRanks[i]) != null ? _c : 0) - ((_d = bRanks[i]) != null ? _d : 0);
            if (diff !== 0) return diff;
          }
          return this.suit - other.suit;
        }
        case "full_house":
        case "quads":
          return this.mainRank - other.mainRank;
      }
    }
    return 0;
  }
  /**
   * Pure predicate: can this combo beat the target combo?
   */
  canBeat(target) {
    if (!target) return true;
    if (this.cardCount !== target.cardCount) return false;
    return this.compareTo(target) > 0;
  }
};

// src/domain/Hand.ts
var Hand = class _Hand {
  constructor(cards = []) {
    __publicField(this, "cards");
    this.cards = Card.sort(
      cards.map((c) => typeof c === "number" ? new Card(c) : c)
    );
  }
  static fromCodes(codes) {
    return new _Hand(codes);
  }
  // --- Getters & Queries ---
  get size() {
    return this.cards.length;
  }
  get isEmpty() {
    return this.cards.length === 0;
  }
  get cardCodes() {
    return this.cards.map((c) => c.code);
  }
  containsCode(code) {
    return this.cards.some((c) => c.code === code);
  }
  hasCards(subset) {
    const codes = subset.map((c) => typeof c === "number" ? c : c.code);
    const handCounts = {};
    for (const c of this.cards) {
      handCounts[c.code] = (handCounts[c.code] || 0) + 1;
    }
    for (const code of codes) {
      if (!handCounts[code] || handCounts[code] <= 0) return false;
      handCounts[code]--;
    }
    return true;
  }
  // --- Pure Transformations ---
  remove(toRemove) {
    const removeCodes = new Set(
      toRemove.map((c) => typeof c === "number" ? c : c.code)
    );
    return new _Hand(this.cards.filter((c) => !removeCodes.has(c.code)));
  }
  add(toAdd) {
    return new _Hand([...this.cards, ...toAdd.map((c) => typeof c === "number" ? new Card(c) : c)]);
  }
  // --- Combo Finders ---
  findSingles() {
    return this.cards.map((c) => CardCombo.evaluate([c])).filter(Boolean);
  }
  findPairs() {
    const combos = [];
    const rankGroups = this.groupByRank();
    for (const cards of Object.values(rankGroups)) {
      if (cards.length >= 2) {
        for (let i = 0; i < cards.length; i++) {
          for (let j = i + 1; j < cards.length; j++) {
            const combo = CardCombo.evaluate([cards[i], cards[j]]);
            if (combo) combos.push(combo);
          }
        }
      }
    }
    return combos.sort((a, b) => a.compareTo(b));
  }
  findStraights() {
    const rankGroups = this.groupByRank();
    const combos = [];
    for (const pattern of STRAIGHT_PATTERNS) {
      const [r0, r1, r2, r3, r4] = pattern.ranks;
      if (rankGroups[r0] && rankGroups[r1] && rankGroups[r2] && rankGroups[r3] && rankGroups[r4]) {
        for (const c0 of rankGroups[r0]) {
          for (const c1 of rankGroups[r1]) {
            for (const c2 of rankGroups[r2]) {
              for (const c3 of rankGroups[r3]) {
                for (const c4 of rankGroups[r4]) {
                  const combo = CardCombo.evaluate([c0, c1, c2, c3, c4]);
                  if (combo && (combo.type === "straight" || combo.type === "straight_flush")) {
                    combos.push(combo);
                  }
                }
              }
            }
          }
        }
      }
    }
    return combos.sort((a, b) => a.compareTo(b));
  }
  findFlushes() {
    const suitGroups = { 0: [], 1: [], 2: [], 3: [] };
    for (const c of this.cards) {
      suitGroups[c.suit].push(c);
    }
    const combos = [];
    for (const cards of Object.values(suitGroups)) {
      if (cards.length >= 5) {
        const combinations = this.getKCombinations(cards, 5);
        for (const set of combinations) {
          const combo = CardCombo.evaluate(set);
          if (combo && (combo.type === "flush" || combo.type === "straight_flush")) {
            combos.push(combo);
          }
        }
      }
    }
    return combos.sort((a, b) => a.compareTo(b));
  }
  findFullHouses() {
    const rankGroups = this.groupByRank();
    const triples = [];
    const pairs = [];
    for (const cards of Object.values(rankGroups)) {
      if (cards.length >= 3) {
        triples.push(...this.getKCombinations(cards, 3));
      }
      if (cards.length >= 2) {
        pairs.push(...this.getKCombinations(cards, 2));
      }
    }
    const combos = [];
    for (const t of triples) {
      for (const p of pairs) {
        if (t[0].rank !== p[0].rank) {
          const combo = CardCombo.evaluate([...t, ...p]);
          if (combo && combo.type === "full_house") {
            combos.push(combo);
          }
        }
      }
    }
    return combos.sort((a, b) => a.compareTo(b));
  }
  findQuads() {
    const rankGroups = this.groupByRank();
    const quads = [];
    for (const cards of Object.values(rankGroups)) {
      if (cards.length === 4) {
        quads.push(cards);
      }
    }
    const combos = [];
    for (const q of quads) {
      for (const kicker of this.cards) {
        if (kicker.rank !== q[0].rank) {
          const combo = CardCombo.evaluate([...q, kicker]);
          if (combo && combo.type === "quads") {
            combos.push(combo);
          }
        }
      }
    }
    return combos.sort((a, b) => a.compareTo(b));
  }
  findStraightFlushes() {
    const suitGroups = { 0: [], 1: [], 2: [], 3: [] };
    for (const c of this.cards) {
      suitGroups[c.suit].push(c);
    }
    const combos = [];
    for (const cards of Object.values(suitGroups)) {
      if (cards.length >= 5) {
        const hand = new _Hand(cards);
        const rankGroups = hand.groupByRank();
        for (const pattern of STRAIGHT_PATTERNS) {
          const [r0, r1, r2, r3, r4] = pattern.ranks;
          if (rankGroups[r0] && rankGroups[r1] && rankGroups[r2] && rankGroups[r3] && rankGroups[r4]) {
            for (const c0 of rankGroups[r0]) {
              for (const c1 of rankGroups[r1]) {
                for (const c2 of rankGroups[r2]) {
                  for (const c3 of rankGroups[r3]) {
                    for (const c4 of rankGroups[r4]) {
                      const combo = CardCombo.evaluate([c0, c1, c2, c3, c4]);
                      if (combo && combo.type === "straight_flush") {
                        combos.push(combo);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    return combos.sort((a, b) => a.compareTo(b));
  }
  findAllCombos() {
    return [
      ...this.findSingles(),
      ...this.findPairs(),
      ...this.findStraights(),
      ...this.findFlushes(),
      ...this.findFullHouses(),
      ...this.findQuads(),
      ...this.findStraightFlushes()
    ];
  }
  findPlayableCombos(lastCombo, mustContain3D = false) {
    let candidates;
    if (!lastCombo) {
      candidates = this.findAllCombos();
    } else {
      switch (lastCombo.type) {
        case "single":
          candidates = this.findSingles();
          break;
        case "pair":
          candidates = this.findPairs();
          break;
        default:
          candidates = [
            ...this.findStraights(),
            ...this.findFlushes(),
            ...this.findFullHouses(),
            ...this.findQuads(),
            ...this.findStraightFlushes()
          ];
          break;
      }
    }
    return candidates.filter((c) => {
      if (mustContain3D && !c.containsCardCode(CARD_3D)) return false;
      return lastCombo ? c.canBeat(lastCombo) : true;
    });
  }
  /**
   * Pure greedy partition of hand into disjoint combos with minimal turns.
   */
  decompose() {
    let remainingHand = new _Hand(this.cards);
    const chosenCombos = [];
    const fiveCardFinders = [
      () => remainingHand.findStraightFlushes(),
      () => remainingHand.findQuads(),
      () => remainingHand.findFullHouses(),
      () => remainingHand.findFlushes(),
      () => remainingHand.findStraights()
    ];
    for (const finder of fiveCardFinders) {
      let combos = finder();
      while (combos.length > 0) {
        const best = combos[0];
        chosenCombos.push(best);
        remainingHand = remainingHand.remove(best.cards);
        combos = finder();
      }
    }
    const rankGroups = remainingHand.groupByRank();
    for (const [, rCards] of Object.entries(rankGroups)) {
      if (rCards.length >= 2) {
        const pairCards = [rCards[0], rCards[1]];
        const pairCombo = CardCombo.evaluate(pairCards);
        if (pairCombo) {
          chosenCombos.push(pairCombo);
          remainingHand = remainingHand.remove(pairCards);
        }
      }
    }
    for (const c of remainingHand.cards) {
      const single = CardCombo.evaluate([c]);
      if (single) chosenCombos.push(single);
    }
    return chosenCombos;
  }
  // --- Private Helpers ---
  groupByRank() {
    const groups = {};
    for (const c of this.cards) {
      if (!groups[c.rank]) groups[c.rank] = [];
      groups[c.rank].push(c);
    }
    return groups;
  }
  getKCombinations(arr, k) {
    if (k === 0) return [[]];
    if (arr.length < k) return [];
    const head = arr[0];
    const tail = arr.slice(1);
    const withHead = this.getKCombinations(tail, k - 1).map((c) => [head, ...c]);
    const withoutHead = this.getKCombinations(tail, k);
    return [...withHead, ...withoutHead];
  }
};

// src/domain/Trick.ts
var Trick = class _Trick {
  constructor(params = {}) {
    __publicField(this, "lastCombo");
    __publicField(this, "leaderSeatIndex");
    __publicField(this, "passedSeats");
    __publicField(this, "passCount");
    __publicField(this, "lastPlaySeatIndex");
    var _a, _b, _c, _d, _e;
    this.lastCombo = (_a = params.lastCombo) != null ? _a : null;
    this.leaderSeatIndex = (_b = params.leaderSeatIndex) != null ? _b : 0;
    this.passedSeats = params.passedSeats ? [...params.passedSeats] : [];
    this.passCount = (_c = params.passCount) != null ? _c : 0;
    this.lastPlaySeatIndex = (_e = (_d = params.lastPlaySeatIndex) != null ? _d : params.trickWinnerSeat) != null ? _e : this.leaderSeatIndex;
  }
  static createFresh(leaderSeatIndex) {
    return new _Trick({
      lastCombo: null,
      leaderSeatIndex,
      passedSeats: [],
      passCount: 0,
      lastPlaySeatIndex: leaderSeatIndex
    });
  }
  // --- Queries ---
  get isFresh() {
    return this.lastCombo === null;
  }
  get trickWinnerSeat() {
    return this.lastCombo ? this.lastPlaySeatIndex : this.leaderSeatIndex;
  }
  hasPlayerPassed(seatIndex) {
    return this.passedSeats.includes(seatIndex);
  }
  isPlayerEligible(seatIndex, counts) {
    return counts[seatIndex] > 0 && !this.hasPlayerPassed(seatIndex);
  }
  canPlay(combo, seatIndex) {
    if (this.hasPlayerPassed(seatIndex)) return false;
    if (!this.lastCombo) return true;
    return combo.canBeat(this.lastCombo);
  }
  /**
   * Pure algorithm finding the next eligible active player clockwise in this trick.
   * Returns -1 if all other eligible players have passed (concluding the trick).
   */
  findNextSeat(counts, currentSeat, totalSeats = 4) {
    const winnerSeat = this.trickWinnerSeat;
    for (let i = 1; i <= totalSeats; i++) {
      const s = (currentSeat + i) % totalSeats;
      if (s === winnerSeat) {
        return -1;
      }
      if (counts[s] > 0 && !this.passedSeats.includes(s)) {
        return s;
      }
    }
    return -1;
  }
  // --- Pure State Transitions ---
  applyPlay(combo, seatIndex) {
    return new _Trick({
      lastCombo: combo,
      leaderSeatIndex: this.leaderSeatIndex,
      passedSeats: this.passedSeats,
      // retain previously passed seats within the trick
      passCount: this.passCount,
      lastPlaySeatIndex: seatIndex
    });
  }
  applyPass(seatIndex) {
    const nextPassed = this.passedSeats.includes(seatIndex) ? this.passedSeats : [...this.passedSeats, seatIndex];
    return new _Trick({
      lastCombo: this.lastCombo,
      leaderSeatIndex: this.leaderSeatIndex,
      passedSeats: nextPassed,
      passCount: this.passCount + 1,
      lastPlaySeatIndex: this.lastPlaySeatIndex
    });
  }
  reset(newLeaderSeatIndex) {
    return _Trick.createFresh(newLeaderSeatIndex);
  }
};

// src/domain/BotEngine.ts
var BotEngine = class _BotEngine {
  static decideMove(params) {
    const { hand, trick, isOpeningMove = false, counts = [13, 13, 13, 13] } = params;
    if (hand.isEmpty) {
      return { action: "pass", cards: [] };
    }
    const isEndgame = counts.some((cnt) => cnt > 0 && cnt <= 3);
    if (isOpeningMove) {
      return _BotEngine.decideOpeningMove(hand);
    }
    if (trick.isFresh) {
      return _BotEngine.decideFreshLead(hand, isEndgame);
    }
    return _BotEngine.decideBeatMove(hand, trick.lastCombo, isEndgame);
  }
  // --- Private Decision Strategies ---
  static decideOpeningMove(hand) {
    const fiveCardCombos = [
      ...hand.findStraightFlushes(),
      ...hand.findQuads(),
      ...hand.findFullHouses(),
      ...hand.findFlushes(),
      ...hand.findStraights()
    ];
    const opening5 = fiveCardCombos.find((c) => c.containsCardCode(CARD_3D));
    if (opening5) {
      return { action: "play", cards: opening5.cards, combo: opening5 };
    }
    const pairs = hand.findPairs();
    const openingPair = pairs.find((c) => c.containsCardCode(CARD_3D));
    if (openingPair) {
      return { action: "play", cards: openingPair.cards, combo: openingPair };
    }
    const card3D = hand.cards.find((c) => c.code === CARD_3D) || hand.cards[0];
    const combo = CardCombo.evaluate([card3D]);
    return { action: "play", cards: [card3D], combo };
  }
  static decideFreshLead(hand, isEndgame) {
    const partitioned = hand.decompose();
    const fiveCard = partitioned.find((c) => c.is5CardCombo);
    if (fiveCard) {
      return { action: "play", cards: fiveCard.cards, combo: fiveCard };
    }
    const pairs = partitioned.filter((c) => c.type === "pair");
    const safePairs = isEndgame ? pairs : pairs.filter((c) => c.mainRank < RANK_2);
    if (safePairs.length > 0) {
      const lowestPair = safePairs[0];
      return { action: "play", cards: lowestPair.cards, combo: lowestPair };
    }
    const singles = partitioned.filter((c) => c.type === "single");
    const safeSingles = isEndgame ? singles : singles.filter((c) => c.mainRank < RANK_2);
    if (safeSingles.length > 0) {
      const lowestSingle = safeSingles[0];
      return { action: "play", cards: lowestSingle.cards, combo: lowestSingle };
    }
    if (partitioned.length > 0) {
      const fallback = partitioned[0];
      return { action: "play", cards: fallback.cards, combo: fallback };
    }
    const firstCard = hand.cards[0];
    const combo = CardCombo.evaluate([firstCard]);
    return { action: "play", cards: [firstCard], combo };
  }
  static decideBeatMove(hand, lastCombo, isEndgame) {
    if (lastCombo.type === "single") {
      const singles = hand.findSingles();
      const beating = singles.filter((c) => c.canBeat(lastCombo));
      if (beating.length === 0) {
        return { action: "pass", cards: [] };
      }
      const non2Beating = beating.filter((c) => c.mainRank < RANK_2);
      if (non2Beating.length > 0) {
        const chosen = non2Beating[0];
        return { action: "play", cards: chosen.cards, combo: chosen };
      }
      if (isEndgame || lastCombo.mainRank === 11) {
        const chosen = beating[0];
        return { action: "play", cards: chosen.cards, combo: chosen };
      }
      return { action: "pass", cards: [] };
    }
    if (lastCombo.type === "pair") {
      const pairs = hand.findPairs();
      const beating = pairs.filter((c) => c.canBeat(lastCombo));
      if (beating.length === 0) {
        return { action: "pass", cards: [] };
      }
      const non2Beating = beating.filter((c) => c.mainRank < RANK_2);
      if (non2Beating.length > 0) {
        const chosen = non2Beating[0];
        return { action: "play", cards: chosen.cards, combo: chosen };
      }
      if (isEndgame) {
        const chosen = beating[0];
        return { action: "play", cards: chosen.cards, combo: chosen };
      }
      return { action: "pass", cards: [] };
    }
    if (lastCombo.is5CardCombo) {
      const all5Combos = [
        ...hand.findStraights(),
        ...hand.findFlushes(),
        ...hand.findFullHouses(),
        ...hand.findQuads(),
        ...hand.findStraightFlushes()
      ];
      const beating = all5Combos.filter((c) => c.canBeat(lastCombo)).sort((a, b) => a.compareTo(b));
      if (beating.length > 0) {
        const chosen = beating[0];
        return { action: "play", cards: chosen.cards, combo: chosen };
      }
      return { action: "pass", cards: [] };
    }
    return { action: "pass", cards: [] };
  }
};

// src/domain/CapsaGame.ts
var CapsaGame = class _CapsaGame {
  constructor(params = {}) {
    __publicField(this, "id");
    __publicField(this, "status");
    __publicField(this, "seats");
    __publicField(this, "counts");
    __publicField(this, "hands");
    __publicField(this, "turnIndex");
    __publicField(this, "leaderIndex");
    __publicField(this, "trick");
    __publicField(this, "winnerRanks");
    __publicField(this, "roomCode");
    __publicField(this, "isPublic");
    var _a, _b, _c, _d, _e, _f, _g;
    this.id = (_a = params.id) != null ? _a : "";
    this.status = (_b = params.status) != null ? _b : "waiting";
    this.seats = params.seats ? [...params.seats] : [];
    this.counts = params.counts ? [...params.counts] : [13, 13, 13, 13];
    this.hands = params.hands;
    this.turnIndex = (_c = params.turnIndex) != null ? _c : 0;
    this.leaderIndex = (_d = params.leaderIndex) != null ? _d : 0;
    this.trick = (_e = params.trick) != null ? _e : Trick.createFresh(this.turnIndex);
    this.winnerRanks = params.winnerRanks ? [...params.winnerRanks] : [];
    this.roomCode = (_f = params.roomCode) != null ? _f : "";
    this.isPublic = (_g = params.isPublic) != null ? _g : false;
  }
  // --- Queries ---
  get isOpeningMove() {
    return this.trick.lastCombo === null && this.counts.length === 4 && this.counts[0] === 13 && this.counts[1] === 13 && this.counts[2] === 13 && this.counts[3] === 13;
  }
  get isFinished() {
    return this.status === "finished";
  }
  get activePlayerCount() {
    return this.counts.filter((c) => c > 0).length;
  }
  get isCurrentTurnBot() {
    var _a;
    return Boolean((_a = this.seats[this.turnIndex]) == null ? void 0 : _a.isBot);
  }
  static findNextActiveSeat(counts, fromSeat) {
    var _a;
    for (let i = 1; i <= 4; i++) {
      const s = (fromSeat + i) % 4;
      if (((_a = counts[s]) != null ? _a : 0) > 0) return s;
    }
    return fromSeat;
  }
  findNextActiveSeat(fromSeat) {
    return _CapsaGame.findNextActiveSeat(this.counts, fromSeat);
  }
  // --- Self-Healing & Deterministic State Reconciliation ---
  static reconcile(game) {
    var _a, _b, _c;
    let current = game;
    const reasons = [];
    const maxPasses = 10;
    for (let pass = 0; pass < maxPasses; pass++) {
      let passMutated = false;
      if (current.counts.length === 4 && current.counts.every((c) => c === 13) && current.winnerRanks.length === 0 && !current.trick.isFresh) {
        current = new _CapsaGame(__spreadProps(__spreadValues({}, current), {
          trick: Trick.createFresh(current.leaderIndex)
        }));
        reasons.push("Invariant I5 (Opening Guard): Reset non-fresh trick on opening game state");
        passMutated = true;
      }
      if (current.status === "playing") {
        const activeSeats = [0, 1, 2, 3].filter((s) => {
          var _a2;
          return ((_a2 = current.counts[s]) != null ? _a2 : 0) > 0;
        });
        if (activeSeats.length <= 1) {
          let newWinnerRanks = [...current.winnerRanks];
          for (let s = 0; s < 4; s++) {
            if (((_a = current.counts[s]) != null ? _a : 0) === 0 && !newWinnerRanks.includes(s)) {
              newWinnerRanks.push(s);
            }
          }
          if (activeSeats.length === 1 && !newWinnerRanks.includes(activeSeats[0])) {
            newWinnerRanks.push(activeSeats[0]);
          }
          current = new _CapsaGame(__spreadProps(__spreadValues({}, current), {
            status: "finished",
            winnerRanks: newWinnerRanks
          }));
          reasons.push("Invariant I4 (Endgame Auto-Resolution): Resolved endgame status to finished");
          passMutated = true;
        }
      }
      if (current.status === "playing" && current.trick.lastCombo !== null) {
        const activeSeats = [0, 1, 2, 3].filter((s) => {
          var _a2;
          return ((_a2 = current.counts[s]) != null ? _a2 : 0) > 0;
        });
        const trickWinner = current.trick.lastPlaySeatIndex >= 0 ? current.trick.lastPlaySeatIndex : current.leaderIndex;
        const activeOpponents = activeSeats.filter((s) => s !== trickWinner);
        const allOpponentsPassed = activeOpponents.length > 0 && activeOpponents.every((s) => current.trick.passedSeats.includes(s));
        if (allOpponentsPassed) {
          const nextLeader = ((_b = current.counts[trickWinner]) != null ? _b : 0) > 0 ? trickWinner : _CapsaGame.findNextActiveSeat(current.counts, trickWinner);
          current = new _CapsaGame(__spreadProps(__spreadValues({}, current), {
            turnIndex: nextLeader,
            leaderIndex: nextLeader,
            trick: Trick.createFresh(nextLeader)
          }));
          reasons.push(`Invariant I2 (Trick Conclusion): Concluded trick, awarded lead to seat ${nextLeader}`);
          passMutated = true;
        }
      }
      if (current.trick.isFresh && (current.trick.passedSeats.length > 0 || current.trick.passCount > 0)) {
        current = new _CapsaGame(__spreadProps(__spreadValues({}, current), {
          trick: Trick.createFresh(current.leaderIndex)
        }));
        reasons.push("Invariant I3 (Fresh Lead Sanitization): Cleared stale pass records on fresh trick");
        passMutated = true;
      }
      if (current.status === "playing" && ((_c = current.counts[current.turnIndex]) != null ? _c : 0) === 0) {
        const nextActive = _CapsaGame.findNextActiveSeat(current.counts, current.turnIndex);
        const newLeader = current.trick.isFresh ? nextActive : current.leaderIndex;
        current = new _CapsaGame(__spreadProps(__spreadValues({}, current), {
          turnIndex: nextActive,
          leaderIndex: newLeader,
          trick: current.trick.isFresh ? Trick.createFresh(newLeader) : current.trick
        }));
        reasons.push(`Invariant I1 (Active Seat Integrity): Advanced turn from empty seat ${current.turnIndex} to active seat ${nextActive}`);
        passMutated = true;
      }
      if (!passMutated) {
        break;
      }
    }
    return {
      game: current,
      healed: reasons.length > 0,
      reasons
    };
  }
  reconcile() {
    return _CapsaGame.reconcile(this);
  }
  // --- Validation ---
  canPlay(cardsInput, seatIndex, handCards) {
    if (this.status !== "playing" || this.turnIndex !== seatIndex) return false;
    if (this.counts[seatIndex] <= 0) return false;
    if (this.trick.hasPlayerPassed(seatIndex)) return false;
    const cards = Card.sort(cardsInput.map((c) => typeof c === "number" ? new Card(c) : c));
    const combo = CardCombo.evaluate(cards);
    if (!combo) return false;
    if (this.isOpeningMove && !combo.containsCardCode(CARD_3D)) {
      return false;
    }
    if (handCards) {
      const hand = new Hand(handCards);
      if (!hand.hasCards(cards)) return false;
    }
    return this.trick.canPlay(combo, seatIndex);
  }
  canPass(seatIndex) {
    if (this.status !== "playing" || this.turnIndex !== seatIndex) return false;
    if (this.isOpeningMove) return false;
    if (this.trick.isFresh) return false;
    if (this.trick.hasPlayerPassed(seatIndex)) return false;
    return true;
  }
  // --- Pure State Transitions ---
  applyPlay(cardsInput, seatIndex) {
    const cards = Card.sort(cardsInput.map((c) => typeof c === "number" ? new Card(c) : c));
    const combo = CardCombo.evaluate(cards);
    if (!combo) throw new Error("Invalid combo played");
    const newCounts = [...this.counts];
    newCounts[seatIndex] -= cards.length;
    const newWinnerRanks = [...this.winnerRanks];
    let newStatus = this.status;
    if (newCounts[seatIndex] === 0 && !newWinnerRanks.includes(seatIndex)) {
      newWinnerRanks.push(seatIndex);
    }
    const activeSeats = newCounts.map((cnt, s) => cnt > 0 ? s : -1).filter((s) => s !== -1);
    if (activeSeats.length <= 1) {
      if (activeSeats.length === 1 && !newWinnerRanks.includes(activeSeats[0])) {
        newWinnerRanks.push(activeSeats[0]);
      }
      newStatus = "finished";
    }
    if (newStatus === "finished") {
      return new _CapsaGame(__spreadProps(__spreadValues({}, this), {
        status: "finished",
        counts: newCounts,
        winnerRanks: newWinnerRanks,
        trick: this.trick.applyPlay(combo, seatIndex)
      }));
    }
    const updatedTrick = this.trick.applyPlay(combo, seatIndex);
    const nextTurn = updatedTrick.findNextSeat(newCounts, seatIndex);
    if (nextTurn === -1) {
      const newLeader = newCounts[seatIndex] > 0 ? seatIndex : this.findNextActiveSeat(seatIndex);
      return new _CapsaGame(__spreadProps(__spreadValues({}, this), {
        counts: newCounts,
        winnerRanks: newWinnerRanks,
        turnIndex: newLeader,
        leaderIndex: newLeader,
        trick: Trick.createFresh(newLeader)
      }));
    }
    return new _CapsaGame(__spreadProps(__spreadValues({}, this), {
      counts: newCounts,
      winnerRanks: newWinnerRanks,
      turnIndex: nextTurn,
      trick: updatedTrick
    }));
  }
  applyPass(seatIndex) {
    const updatedTrick = this.trick.applyPass(seatIndex);
    const nextTurn = updatedTrick.findNextSeat(this.counts, seatIndex);
    if (nextTurn === -1) {
      const trickWinner = updatedTrick.trickWinnerSeat;
      const newLeader = this.counts[trickWinner] > 0 ? trickWinner : this.findNextActiveSeat(trickWinner);
      return new _CapsaGame(__spreadProps(__spreadValues({}, this), {
        turnIndex: newLeader,
        leaderIndex: newLeader,
        trick: Trick.createFresh(newLeader)
      }));
    }
    return new _CapsaGame(__spreadProps(__spreadValues({}, this), {
      turnIndex: nextTurn,
      trick: updatedTrick
    }));
  }
  applyBotTurn(botHandCards) {
    const hand = new Hand(botHandCards);
    const decision = BotEngine.decideMove({
      hand,
      trick: this.trick,
      isOpeningMove: this.isOpeningMove,
      counts: this.counts,
      seatIndex: this.turnIndex
    });
    if (decision.action === "play") {
      const nextGame = this.applyPlay(decision.cards, this.turnIndex);
      return {
        nextGame,
        action: "play",
        cards: decision.cards,
        combo: decision.combo
      };
    } else {
      const nextGame = this.applyPass(this.turnIndex);
      return {
        nextGame,
        action: "pass",
        cards: []
      };
    }
  }
};

// src/domain/TurnTimer.ts
var TurnTimer = class _TurnTimer {
  constructor(startedAt = Date.now(), durationMs = TURN_TIMEOUT_MS) {
    __publicField(this, "startedAtMs");
    __publicField(this, "durationMs");
    if (typeof startedAt === "string") {
      const parsed = Date.parse(startedAt);
      this.startedAtMs = isNaN(parsed) ? Date.now() : parsed;
    } else if (startedAt instanceof Date) {
      this.startedAtMs = startedAt.getTime();
    } else {
      this.startedAtMs = startedAt;
    }
    this.durationMs = durationMs;
  }
  getElapsedMs(nowMs = Date.now()) {
    return Math.max(0, nowMs - this.startedAtMs);
  }
  getRemainingMs(nowMs = Date.now()) {
    return Math.max(0, this.durationMs - this.getElapsedMs(nowMs));
  }
  getRemainingSecs(nowMs = Date.now()) {
    return Math.ceil(this.getRemainingMs(nowMs) / 1e3);
  }
  getElapsedSecs(nowMs = Date.now()) {
    return Math.floor(this.getElapsedMs(nowMs) / 1e3);
  }
  getProgress(nowMs = Date.now()) {
    if (this.durationMs <= 0) return 1;
    return Math.min(1, Math.max(0, this.getElapsedMs(nowMs) / this.durationMs));
  }
  isExpired(nowMs = Date.now()) {
    return this.getRemainingMs(nowMs) <= 0;
  }
  getStatusColor(nowMs = Date.now()) {
    const secs = this.getRemainingSecs(nowMs);
    if (secs <= 10) return "#ef4444";
    if (secs <= 25) return "#f59e0b";
    return "#22c55e";
  }
  static createDefault() {
    return new _TurnTimer(Date.now(), TURN_TIMEOUT_MS);
  }
};

// src/domain/RoomCode.ts
var _RoomCode = class _RoomCode {
  constructor(code) {
    __publicField(this, "value");
    const cleaned = _RoomCode.clean(code);
    this.value = cleaned;
  }
  static clean(input) {
    return (input || "").trim().toUpperCase();
  }
  static isValid(code) {
    const cleaned = _RoomCode.clean(code);
    if (cleaned.length !== _RoomCode.CODE_LENGTH) return false;
    for (let i = 0; i < cleaned.length; i++) {
      if (_RoomCode.CHARSET.indexOf(cleaned[i]) === -1) {
        return false;
      }
    }
    return true;
  }
  static generate(randomFn = Math.random) {
    let code = "";
    for (let i = 0; i < _RoomCode.CODE_LENGTH; i++) {
      const idx = Math.floor(randomFn() * _RoomCode.CHARSET.length);
      code += _RoomCode.CHARSET.charAt(idx);
    }
    return new _RoomCode(code);
  }
  toString() {
    return this.value;
  }
};
// Unambiguous character set (omits 0, O, 1, I, L)
__publicField(_RoomCode, "CHARSET", "ABCDEFGHJKMNPQRSTUVWXYZ23456789");
__publicField(_RoomCode, "CODE_LENGTH", 6);
var RoomCode = _RoomCode;

// src/domain/Seat.ts
var Seat = class _Seat {
  constructor(props) {
    __publicField(this, "index");
    __publicField(this, "userId");
    __publicField(this, "name");
    __publicField(this, "isBot");
    __publicField(this, "connected");
    __publicField(this, "cardCount");
    __publicField(this, "isHuman");
    __publicField(this, "isOccupied");
    __publicField(this, "isReady");
    __publicField(this, "initial");
    var _a, _b, _c, _d, _e;
    this.index = props.index;
    this.userId = (_b = (_a = props.userId) != null ? _a : props.user_id) != null ? _b : null;
    const isBot = Boolean((_c = props.isBot) != null ? _c : props.is_bot);
    this.name = (props.name || "").trim() || (isBot ? `Bot ${props.index + 1}` : `Seat ${props.index + 1}`);
    this.isBot = isBot;
    this.connected = props.connected !== void 0 ? Boolean(props.connected) : true;
    this.cardCount = (_e = (_d = props.cardCount) != null ? _d : props.card_count) != null ? _e : 13;
    this.isHuman = !this.isBot && this.userId !== null;
    this.isOccupied = this.isBot || this.userId !== null;
    this.isReady = this.isBot || this.connected && this.userId !== null;
    this.initial = this.name.charAt(0).toUpperCase() || "?";
  }
  toJSON() {
    return {
      user_id: this.userId,
      name: this.name,
      is_bot: this.isBot,
      connected: this.connected
    };
  }
  withCardCount(count) {
    return new _Seat({
      index: this.index,
      userId: this.userId,
      name: this.name,
      isBot: this.isBot,
      connected: this.connected,
      cardCount: count
    });
  }
  withConnection(connected) {
    return new _Seat({
      index: this.index,
      userId: this.userId,
      name: this.name,
      isBot: this.isBot,
      connected,
      cardCount: this.cardCount
    });
  }
  static createEmpty(index) {
    return new _Seat({
      index,
      userId: null,
      name: `Seat ${index + 1}`,
      isBot: false,
      connected: false,
      cardCount: 0
    });
  }
  static createBot(index, name) {
    return new _Seat({
      index,
      userId: null,
      name: name != null ? name : `Bot ${index + 1}`,
      isBot: true,
      connected: true,
      cardCount: 13
    });
  }
};

// src/domain/Room.ts
var Room = class _Room {
  constructor(props) {
    __publicField(this, "id");
    __publicField(this, "code");
    __publicField(this, "isPublic");
    __publicField(this, "status");
    __publicField(this, "seats");
    __publicField(this, "hostSeatIndex");
    __publicField(this, "humanCount");
    __publicField(this, "botCount");
    __publicField(this, "isFull");
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
    this.id = (_a = props.id) != null ? _a : "";
    this.code = props.code instanceof RoomCode ? props.code : new RoomCode(props.code);
    this.isPublic = Boolean(props.isPublic);
    this.status = (_b = props.status) != null ? _b : "waiting";
    const rawSeats = (_c = props.seats) != null ? _c : [];
    this.seats = [];
    let host = -1;
    let humans = 0;
    let bots = 0;
    for (let i = 0; i < 4; i++) {
      const s = rawSeats[i];
      let seatInstance;
      if (s instanceof Seat) {
        seatInstance = s;
      } else if (s != null && typeof s === "object") {
        const obj = s;
        seatInstance = new Seat({
          index: (_d = obj.index) != null ? _d : i,
          userId: (_f = (_e = obj.userId) != null ? _e : obj.user_id) != null ? _f : null,
          name: (_g = obj.name) != null ? _g : "",
          isBot: (_i = (_h = obj.isBot) != null ? _h : obj.is_bot) != null ? _i : false,
          connected: obj.connected !== void 0 ? Boolean(obj.connected) : true,
          cardCount: (_k = (_j = obj.cardCount) != null ? _j : obj.card_count) != null ? _k : 13
        });
      } else {
        seatInstance = Seat.createEmpty(i);
      }
      this.seats.push(seatInstance);
      if (seatInstance.isHuman && seatInstance.connected && host === -1) {
        host = i;
      }
      if (seatInstance.isHuman && seatInstance.connected) {
        humans++;
      }
      if (seatInstance.isBot) {
        bots++;
      }
    }
    this.hostSeatIndex = host;
    this.humanCount = humans;
    this.botCount = bots;
    this.isFull = humans + bots === 4;
  }
  isHost(seatIndex) {
    return this.hostSeatIndex === seatIndex;
  }
  get occupiedCount() {
    return this.seats.filter((s) => s.isOccupied).length;
  }
  get firstAvailableSeatIndex() {
    for (let i = 0; i < this.seats.length; i++) {
      if (!this.seats[i].isOccupied) {
        return i;
      }
    }
    return -1;
  }
  canStart(requestingSeatIndex) {
    if (this.status !== "waiting") {
      return { allowed: false, reason: "Game has already started" };
    }
    if (this.hostSeatIndex !== requestingSeatIndex) {
      return { allowed: false, reason: "Only the room host can start the match" };
    }
    if (this.humanCount === 0) {
      return { allowed: false, reason: "At least one human player is required" };
    }
    return { allowed: true };
  }
  withFilledBots() {
    const nextSeats = this.seats.map((s, idx) => {
      if (!s.isOccupied) {
        return Seat.createBot(idx);
      }
      return s;
    });
    return new _Room({
      id: this.id,
      code: this.code,
      isPublic: this.isPublic,
      status: this.status,
      seats: nextSeats
    });
  }
};

// src/domain/Podium.ts
var Podium = class _Podium {
  constructor(winnerRanks = [], counts = [0, 0, 0, 0], seats = []) {
    __publicField(this, "winnerRanks");
    __publicField(this, "counts");
    __publicField(this, "seats");
    this.winnerRanks = [...winnerRanks];
    this.counts = [...counts];
    this.seats = [...seats];
  }
  getRank(seatIndex) {
    const idx = this.winnerRanks.indexOf(seatIndex);
    if (idx !== -1) {
      return idx + 1;
    }
    return 4;
  }
  static getMedal(rank) {
    switch (rank) {
      case 1:
        return "\u{1F947}";
      case 2:
        return "\u{1F948}";
      case 3:
        return "\u{1F949}";
      default:
        return "\u{1F4A9}";
    }
  }
  static getTitle(rank) {
    switch (rank) {
      case 1:
        return "1st Place (Winner)";
      case 2:
        return "2nd Place (Runner-up)";
      case 3:
        return "3rd Place";
      default:
        return "4th Place (Last)";
    }
  }
  /**
   * Calculates Capsa Banting point penalty:
   * - 1..7 cards: 1x penalty per card
   * - 8..9 cards: 2x penalty per card (Double)
   * - 10..12 cards: 3x penalty per card (Triple)
   * - 13 cards (Dragon penalty): 4x penalty per card (Quadruple = 52 pts)
   */
  static calculatePenalty(cardsLeft) {
    if (cardsLeft <= 0) return 0;
    if (cardsLeft < 8) return cardsLeft;
    if (cardsLeft < 10) return cardsLeft * 2;
    if (cardsLeft < 13) return cardsLeft * 3;
    return cardsLeft * 4;
  }
  getStandings() {
    var _a;
    const standings = [];
    for (let rank = 1; rank <= 4; rank++) {
      const seatIdx = this.winnerRanks[rank - 1];
      if (seatIdx !== void 0 && seatIdx >= 0) {
        const seat = this.seats[seatIdx];
        const cardsLeft = (_a = this.counts[seatIdx]) != null ? _a : 0;
        standings.push({
          seatIndex: seatIdx,
          rank,
          name: seat ? seat.name : `Seat ${seatIdx + 1}`,
          isBot: seat ? seat.isBot : false,
          cardsLeft,
          scorePenalty: _Podium.calculatePenalty(cardsLeft),
          medal: _Podium.getMedal(rank),
          title: _Podium.getTitle(rank)
        });
      }
    }
    return standings;
  }
};
