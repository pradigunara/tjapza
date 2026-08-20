/**
 * HUD Notification Toast System
 */

import { escapeHtml } from './escape';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  timerId: ReturnType<typeof setTimeout> | null;
}

const MAX_VISIBLE_TOASTS = 2;

export class ToastManager {
  private container: HTMLElement | null = null;
  private toasts: ToastItem[] = [];

  private ensureContainer(): HTMLElement {
    if (!this.container || !document.body.contains(this.container)) {
      let el = document.getElementById('tjapza-toasts');
      if (!el) {
        el = document.createElement('div');
        el.id = 'tjapza-toasts';
        el.className = 'tjapza-toast-container';
        document.body.appendChild(el);
      }
      this.container = el;
    }
    return this.container;
  }

  public show(message: string, type: ToastType = 'info', durationMs = 3000): void {
    if (!message) return;
    const lower = message.toLowerCase();
    // Ignore internal SDK request cancellation / aborts
    if (lower.includes('autocancelled') || lower.includes('request was cancelled') || lower.includes('abort')) {
      return;
    }

    // De-duplicate if identical message is already visible
    const existing = this.toasts.find((t) => t.message === message && t.type === type);
    if (existing) {
      if (existing.timerId) clearTimeout(existing.timerId);
      existing.timerId = setTimeout(() => {
        this.dismiss(existing.id);
      }, durationMs);
      const existingEl = document.getElementById(existing.id);
      if (existingEl) {
        existingEl.classList.remove('fade-out');
        existingEl.classList.add('visible');
      }
      return;
    }

    const container = this.ensureContainer();

    // Enforce max 3 stacks: evict oldest toast(s) immediately if at or above capacity
    while (this.toasts.length >= MAX_VISIBLE_TOASTS) {
      const oldest = this.toasts[0];
      if (oldest) {
        this.dismissImmediate(oldest.id);
      }
    }

    const id = 'toast_' + Math.random().toString(36).substring(2, 9);
    const toastItem: ToastItem = { id, message, type, timerId: null };

    const toastEl = document.createElement('div');
    toastEl.id = id;
    toastEl.className = `tjapza-toast tjapza-toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d4af37" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    } else if (type === 'warning') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    } else {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }

    toastEl.innerHTML = `
      <span class="tjapza-toast-icon">${iconSvg}</span>
      <span class="tjapza-toast-msg">${escapeHtml(message)}</span>
    `;

    container.appendChild(toastEl);
    this.toasts.push(toastItem);

    // Trigger enter animation
    requestAnimationFrame(() => {
      toastEl.classList.add('visible');
    });

    // Auto dismiss
    toastItem.timerId = setTimeout(() => {
      this.dismiss(id);
    }, durationMs);
  }

  public dismissImmediate(id: string): void {
    const itemIdx = this.toasts.findIndex((t) => t.id === id);
    if (itemIdx !== -1) {
      const item = this.toasts[itemIdx];
      if (item.timerId) clearTimeout(item.timerId);
      this.toasts.splice(itemIdx, 1);
    }
    const el = document.getElementById(id);
    if (el) {
      el.remove();
    }
  }

  public dismiss(id: string): void {
    const item = this.toasts.find((t) => t.id === id);
    if (item && item.timerId) {
      clearTimeout(item.timerId);
    }
    const el = document.getElementById(id);
    if (!el) {
      this.toasts = this.toasts.filter((t) => t.id !== id);
      return;
    }
    el.classList.remove('visible');
    el.classList.add('fade-out');
    setTimeout(() => {
      el.remove();
      this.toasts = this.toasts.filter((t) => t.id !== id);
    }, 280);
  }

  public clear(): void {
    for (const t of this.toasts) {
      if (t.timerId) clearTimeout(t.timerId);
    }
    this.toasts = [];
    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  public getActiveCount(): number {
    return this.toasts.length;
  }

  public success(msg: string, duration = 3000): void {
    this.show(msg, 'success', duration);
  }

  public error(msg: string, duration = 3500): void {
    this.show(msg, 'error', duration);
  }

  public warning(msg: string, duration = 3200): void {
    this.show(msg, 'warning', duration);
  }

  public info(msg: string, duration = 2800): void {
    this.show(msg, 'info', duration);
  }
}

export const toast = new ToastManager();
