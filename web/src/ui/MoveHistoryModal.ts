import { Card } from '../domain';
import type { MoveRecord, SeatInfo } from '../net/pb';
import { escapeHtml } from './escape';
import { formatSeatLabel } from './seatLabel';
import { sound } from '../audio/sound';

export interface MoveHistoryModalOptions {
  container: HTMLElement;
  roomCode: string;
  seats: (SeatInfo | null)[];
  localSeatIndex: number;
  moves: MoveRecord[];
  onClose?: () => void;
}

export class MoveHistoryModal {
  private element: HTMLElement | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  public show(options: MoveHistoryModalOptions): void {
    this.close();

    const { container, roomCode, seats, localSeatIndex, moves, onClose } = options;

    const modalEl = document.createElement('div');
    modalEl.className = 'modal-backdrop move-history-backdrop';
    modalEl.id = 'move-history-modal';

    let contentHtml = '';

    if (moves.length === 0) {
      contentHtml = `
        <div class="move-history-empty">
          <div class="empty-icon">🃏</div>
          <p>No moves played yet in this match.</p>
          <span class="empty-sub">Plays and passes will be recorded here as the game progresses.</span>
        </div>
      `;
    } else {
      let currentTrickNumber = 1;
      let isFreshTrick = true;
      let trickHtml = '';

      for (let i = 0; i < moves.length; i++) {
        const move = moves[i];
        const sIndex = move.seat_index;
        const sInfo = seats[sIndex];
        const isLocal = sIndex === localSeatIndex;
        const seatLabel = formatSeatLabel(sIndex, sInfo, { you: isLocal });

        // Detect new trick divider:
        if (i > 0 && isFreshTrick && move.action === 'play') {
          currentTrickNumber++;
          trickHtml += `
            <div class="history-trick-divider">
              <span>Trick #${currentTrickNumber}</span>
            </div>
          `;
          isFreshTrick = false;
        } else if (i === 0 && move.action === 'play') {
          trickHtml += `
            <div class="history-trick-divider">
              <span>Opening Trick (#1)</span>
            </div>
          `;
          isFreshTrick = false;
        }

        if (move.action === 'play') {
          const cards = (move.cards || []).map((code) => new Card(code));

          const cardsHtml = cards
            .map((c) => {
              const colorClass = c.isRed ? 'card-red' : 'card-black';
              return `<span class="mini-card-chip ${colorClass}"><span class="chip-rank">${escapeHtml(c.rankName)}</span><span class="chip-suit">${escapeHtml(c.suitSymbol)}</span></span>`;
            })
            .join('');

          trickHtml += `
            <div class="history-row history-row-play ${isLocal ? 'is-local-player' : ''}">
              <div class="history-row-meta">
                <span class="history-move-num">#${i + 1}</span>
                <span class="history-player-name">${escapeHtml(seatLabel)}</span>
              </div>
              <div class="history-row-content">
                <div class="history-cards-group">${cardsHtml}</div>
              </div>
            </div>
          `;
        } else if (move.action === 'pass') {
          trickHtml += `
            <div class="history-row history-row-pass ${isLocal ? 'is-local-player' : ''}">
              <div class="history-row-meta">
                <span class="history-move-num">#${i + 1}</span>
                <span class="history-player-name">${escapeHtml(seatLabel)}</span>
              </div>
              <div class="history-row-content">
                <span class="history-pass-badge">PASSED</span>
              </div>
            </div>
          `;
          isFreshTrick = true;
        }
      }

      contentHtml = `<div class="move-history-list" id="move-history-scroll-list">${trickHtml}</div>`;
    }

    modalEl.innerHTML = `
      <div class="modal-card move-history-card">
        <div class="modal-header">
          <div>
            <h3>📜 Move History</h3>
            <div class="history-header-sub">
              <span>Room: <strong>${escapeHtml(roomCode)}</strong></span>
              <span class="history-move-count">${moves.length} move${moves.length === 1 ? '' : 's'}</span>
            </div>
          </div>
          <button class="modal-close" id="btn-close-move-history" aria-label="Close">✕</button>
        </div>
        <div class="modal-body move-history-body">
          ${contentHtml}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="btn-done-move-history">Close</button>
        </div>
      </div>
    `;

    container.appendChild(modalEl);
    this.element = modalEl;

    // Auto-scroll to bottom of move list
    const scrollList = modalEl.querySelector('#move-history-scroll-list');
    if (scrollList) {
      scrollList.scrollTop = scrollList.scrollHeight;
    }

    const handleClose = () => {
      sound.playClick();
      this.close();
      if (onClose) onClose();
    };

    modalEl.querySelector('#btn-close-move-history')?.addEventListener('click', handleClose);
    modalEl.querySelector('#btn-done-move-history')?.addEventListener('click', handleClose);

    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) {
        handleClose();
      }
    });

    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', this.keydownHandler);
  }

  public close(): void {
    if (this.keydownHandler) {
      window.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
      this.element = null;
    }
  }
}
