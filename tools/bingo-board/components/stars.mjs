import { INITIAL_STARS } from '../stars.mjs';
import { el } from './dom.mjs';
export function renderStars(container, count) {
  container.setAttribute('aria-label', `${count} of ${INITIAL_STARS} Learning Stars remaining`);
  container.replaceChildren(...Array.from({ length: INITIAL_STARS }, (_, i) => el('span', {
    className: i < count ? 'star filled' : 'star empty', 'aria-hidden': 'true'
  }, i < count ? '★' : '☆')));
}
