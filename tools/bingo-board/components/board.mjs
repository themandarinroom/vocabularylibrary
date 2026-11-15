import { el } from './dom.mjs';
export function renderBoard(container, state, entries, onAnswer) {
  container.style.setProperty('--board-size', state.size);
  container.replaceChildren(...state.board.map((key, index) => {
    const entry = entries.get(key), marked = state.marked.includes(key), complete = state.completion.includes(index);
    return el('button', { type: 'button', className: `bingo-cell${marked ? ' marked' : ''}${complete ? ' complete' : ''}`,
      disabled: marked || state.status !== 'playing', 'data-entry-key': key,
      'aria-label': `${entry.chinese}${state.showPinyin && entry.pinyin ? `, ${entry.pinyin}` : ''}${marked ? ', correctly marked' : ''}`,
      onclick: () => onAnswer(key) },
      el('span', { className: 'hanzi', lang: 'zh-Hans' }, entry.chinese),
      state.showPinyin ? el('span', { className: 'pinyin', lang: 'zh-Latn-pinyin' }, entry.pinyin) : null,
      marked ? el('span', { className: 'check', 'aria-hidden': 'true' }, '✓') : null);
  }));
}
