import { describe, test, expect, beforeEach, afterEach } from 'bun:test';

// Minimal mock DOM for headless Bun test environment
class MockElement {
  id: string = '';
  className: string = '';
  private _innerHTML: string = '';
  textContent: string = '';
  classList = {
    add: (c: string) => {},
    remove: (c: string) => {}
  };
  children: MockElement[] = [];
  parentNode: MockElement | null = null;

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

  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
      this.parentNode = null;
    }
  }
}

const mockDoc = {
  body: new MockElement(),
  getElementById(id: string): MockElement | null {
    if (id === 'tjapza-toasts') {
      return this.body.children.find((c) => c.id === 'tjapza-toasts') || null;
    }
    const findInTree = (el: MockElement): MockElement | null => {
      if (el.id === id) return el;
      for (const child of el.children) {
        const found = findInTree(child);
        if (found) return found;
      }
      return null;
    };
    return findInTree(this.body);
  },
  createElement(tag: string): MockElement {
    return new MockElement();
  }
};

(globalThis as any).document = mockDoc;
(globalThis as any).requestAnimationFrame = (cb: () => void) => { cb(); return 0; };

import { ToastManager } from './toast';

describe('ToastManager Notification System', () => {
  let tm: ToastManager;

  beforeEach(() => {
    mockDoc.body.innerHTML = '';
    tm = new ToastManager();
  });

  afterEach(() => {
    tm.clear();
    mockDoc.body.innerHTML = '';
  });

  test('caps visible toasts to a maximum of 2 stacks', () => {
    tm.show('Message 1', 'info');
    tm.show('Message 2', 'success');

    expect(tm.getActiveCount()).toBe(2);
    const container = mockDoc.getElementById('tjapza-toasts');
    expect(container?.children.length).toBe(2);

    // Add 3rd and 4th toasts
    tm.show('Message 3', 'warning');
    tm.show('Message 4', 'error');

    // Count should be strictly capped at 2
    expect(tm.getActiveCount()).toBe(2);
    expect(container?.children.length).toBe(2);
  });

  test('deduplicates identical message and type without increasing stack size', () => {
    tm.show('Hand record not found.', 'error');
    tm.show('Hand record not found.', 'error');
    tm.show('Hand record not found.', 'error');

    expect(tm.getActiveCount()).toBe(1);
    const container = mockDoc.getElementById('tjapza-toasts');
    expect(container?.children.length).toBe(1);
  });

  test('dismisses toast by ID cleanly', () => {
    tm.show('Temporary notice', 'info');
    expect(tm.getActiveCount()).toBe(1);

    tm.clear();
    expect(tm.getActiveCount()).toBe(0);
    const container = mockDoc.getElementById('tjapza-toasts');
    expect(container?.children.length).toBe(0);
  });
});
