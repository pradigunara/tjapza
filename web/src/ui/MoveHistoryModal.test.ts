import { describe, test, expect, beforeEach, afterEach } from 'bun:test';

class MockElement {
  id: string = '';
  className: string = '';
  private _innerHTML: string = '';
  textContent: string = '';
  classList = {
    add: (c: string) => {},
    remove: (c: string) => {},
  };
  children: MockElement[] = [];
  parentNode: MockElement | null = null;
  scrollTop: number = 0;
  scrollHeight: number = 100;
  listeners: Record<string, ((e: any) => void)[]> = {};

  get innerHTML(): string {
    return this._innerHTML;
  }

  set innerHTML(val: string) {
    this._innerHTML = val;
    if (val === '') {
      this.children = [];
    }
  }

  contains(child: MockElement | null): boolean {
    if (!child) return false;
    if (child === this) return true;
    return this.children.some((c) => c.contains(child));
  }

  appendChild(child: MockElement) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child: MockElement) {
    this.children = this.children.filter((c) => c !== child);
    child.parentNode = null;
    return child;
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  addEventListener(event: string, handler: (e: any) => void) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
  }

  querySelector(selector: string): MockElement | null {
    if (selector.startsWith('#')) {
      const id = selector.substring(1);
      const find = (el: MockElement): MockElement | null => {
        if (el.id === id) return el;
        for (const c of el.children) {
          const res = find(c);
          if (res) return res;
        }
        return null;
      };
      return find(this);
    }
    return this.children[0] || null;
  }
}

const mockDoc = {
  body: new MockElement(),
  getElementById(id: string): MockElement | null {
    const find = (el: MockElement): MockElement | null => {
      if (el.id === id) return el;
      for (const c of el.children) {
        const res = find(c);
        if (res) return res;
      }
      return null;
    };
    return find(this.body);
  },
  createElement(tag: string): MockElement {
    return new MockElement();
  },
};

(globalThis as any).document = mockDoc;
(globalThis as any).window = {
  addEventListener: () => {},
  removeEventListener: () => {},
};

import { MoveHistoryModal } from './MoveHistoryModal';
import type { MoveRecord } from '../net/pb';

describe('MoveHistoryModal Component', () => {
  let modal: MoveHistoryModal;
  let container: MockElement;

  beforeEach(() => {
    modal = new MoveHistoryModal();
    container = new MockElement();
  });

  afterEach(() => {
    modal.close();
  });

  test('renders empty state when no moves have occurred', () => {
    modal.show({
      container: container as any,
      roomCode: 'TEST99',
      seats: [{ id: '1', name: 'Alice', is_bot: false, connected: true, user_id: 'u1' }, null, null, null],
      localSeatIndex: 0,
      moves: [],
    });

    expect(container.children.length).toBe(1);
    const modalEl = container.children[0];
    expect(modalEl.innerHTML).toContain('No moves played yet in this match.');
    expect(modalEl.innerHTML).toContain('TEST99');
  });

  test('renders move records with correct card chips and combo names', () => {
    const moves: MoveRecord[] = [
      {
        id: 'm1',
        game_id: 'g1',
        seat_index: 0,
        action: 'play',
        cards: [0], // 3♦ (Diamonds -> red)
        combo_type: 'single',
        combo_power: 0,
        created: '2026-01-01T00:00:00Z',
        collectionId: '',
        collectionName: '',
        updated: '',
      },
      {
        id: 'm2',
        game_id: 'g1',
        seat_index: 1,
        action: 'pass',
        cards: [],
        combo_type: '',
        combo_power: 0,
        created: '2026-01-01T00:00:01Z',
        collectionId: '',
        collectionName: '',
        updated: '',
      },
      {
        id: 'm3',
        game_id: 'g1',
        seat_index: 2,
        action: 'play',
        cards: [51], // 2♠
        combo_type: 'single',
        combo_power: 51,
        created: '2026-01-01T00:00:02Z',
        collectionId: '',
        collectionName: '',
        updated: '',
      },
    ];

    modal.show({
      container: container as any,
      roomCode: 'PLAY88',
      seats: [
        { id: '1', name: 'Alice', is_bot: false, connected: true, user_id: 'u1' },
        { id: '2', name: 'Bob', is_bot: true, connected: true, user_id: null },
        { id: '3', name: 'Charlie', is_bot: false, connected: true, user_id: 'u3' },
        null,
      ],
      localSeatIndex: 0,
      moves,
    });

    const modalEl = container.children[0];
    expect(modalEl.innerHTML).toContain('1 | Alice (You)');
    expect(modalEl.innerHTML).toContain('2 | Bob');
    expect(modalEl.innerHTML).toContain('3 | Charlie');
    expect(modalEl.innerHTML).toContain('PASSED');
    expect(modalEl.innerHTML).toContain('card-red'); // 3♦
    expect(modalEl.innerHTML).toContain('card-black'); // 2♠
    expect(modalEl.innerHTML).toContain('3 moves');
  });

  test('closes modal on close()', () => {
    modal.show({
      container: container as any,
      roomCode: 'CLOSE1',
      seats: [],
      localSeatIndex: 0,
      moves: [],
    });

    expect(container.children.length).toBe(1);
    modal.close();
    expect(container.children.length).toBe(0);
  });
});
