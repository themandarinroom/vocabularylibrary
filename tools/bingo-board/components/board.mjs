import { el } from './dom.mjs';
import { cellParts, tonelessPinyin } from '../display.mjs';
// v0.1.1: what each cell shows follows the Visual / English / Hanzi / Pinyin options. Positions, keys and the
// tap handler are unchanged, so toggling options never changes the board, the answer checks or the stars.
export function renderBoard(container, state, entries, onAnswer, { display, images = new Map(), onImageError = () => {} } = {}) {
  container.style.setProperty('--board-size', state.size);
  const shown = new Set(Object.keys(display).filter(name => display[name]));
  container.className = `bingo-board ${[...shown].map(name => `show-${name}`).join(' ')}`;
  container.replaceChildren(...state.board.map((key, index) => {
    const entry = entries.get(key), marked = state.marked.includes(key), complete = state.completion.includes(index);
    const image = images.get(key), parts = cellParts(display, Boolean(image)), pinyin = tonelessPinyin(entry.pinyin);
    const spoken = [entry.chinese, parts.includes('english') && entry.english, parts.includes('pinyin') && pinyin].filter(Boolean).join(', ');
    const node = {
      visual: () => el('img', { className: 'visual', src: image, alt: '', loading: 'eager', decoding: 'async', draggable: false,
        referrerPolicy: 'no-referrer', onerror: () => onImageError(key) }),
      english: () => entry.english ? el('span', { className: 'english', lang: 'en' }, entry.english) : null,
      hanzi: () => el('span', { className: 'hanzi', lang: 'zh-Hans' }, entry.chinese),
      pinyin: () => pinyin ? el('span', { className: 'pinyin', lang: 'zh-Latn-pinyin' }, pinyin) : null
    };
    let content = parts.map(part => node[part]()).filter(Boolean);
    if (!content.length) content = [node.hanzi()];                       // e.g. English only and this word has no meaning
    return el('button', { type: 'button', className: `bingo-cell${marked ? ' marked' : ''}${complete ? ' complete' : ''}`, 'data-parts': content.length,
      disabled: marked || state.status !== 'playing', 'data-entry-key': key,
      'aria-label': `${spoken}${marked ? ', correctly marked' : ''}`,
      onclick: () => onAnswer(key) },
      ...content,
      marked ? el('span', { className: 'check', 'aria-hidden': 'true' }, '✓') : null);
  }));
}
