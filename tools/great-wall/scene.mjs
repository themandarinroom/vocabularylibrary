// Build the Great Wall: the watercolour construction scene (SVG, 1000 × 640 viewBox).
// The landscape is drawn once; only the stone layer is redrawn as the wall grows.
import { FOUNDATION, SLOTS, GROUND_Y, WALL_LEFT, WALL_RIGHT, COURSE_H } from './wall.mjs';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attributes = {}) => {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
};

const TOWER = { x: 70, w: 180, top: 230 };
const RIGHT_WALL = { x: WALL_RIGHT, top: GROUND_Y - 4 * COURSE_H };

function courseLines(x, y, w, h, offsetEvery = 2) {
  // Mortar lines for pre-built masonry (tower and existing wall), in running bond.
  let lines = '';
  for (let row = 0, top = GROUND_Y - COURSE_H; top >= y; row++, top -= COURSE_H) {
    lines += `<line x1="${x}" y1="${top}" x2="${x + w}" y2="${top}"/>`;
    const shift = row % offsetEvery ? 38 : 0;
    for (let bx = x + 75 - shift; bx < x + w; bx += 76) lines += `<line x1="${bx}" y1="${top}" x2="${bx}" y2="${top + COURSE_H}"/>`;
  }
  return `<g class="mortar">${lines}</g>`;
}

function battlements(x, w, top, merlonW, gap, h) {
  let out = '';
  for (let mx = x; mx + merlonW <= x + w + 0.5; mx += merlonW + gap) out += `<rect x="${mx}" y="${top - h}" width="${merlonW}" height="${h}" rx="3"/>`;
  return out;
}

export function sceneMarkup(prefix = 'gw') {
  const towerFace = `
    <g class="masonry old">
      <rect x="${TOWER.x}" y="${TOWER.top}" width="${TOWER.w}" height="${GROUND_Y - TOWER.top}" rx="4"/>
      ${battlements(TOWER.x - 6, TOWER.w + 12, TOWER.top, 34, 13, 34)}
      <rect x="${WALL_LEFT}" y="${GROUND_Y - 2 * COURSE_H}" width="75" height="${COURSE_H}"/>
      <rect x="${WALL_LEFT}" y="${GROUND_Y - 4 * COURSE_H}" width="75" height="${COURSE_H}"/>
    </g>
    ${courseLines(TOWER.x, TOWER.top, TOWER.w, 0)}
    <g class="tower-openings">
      <path d="M106 360 v-36 a20 20 0 0 1 40 0 v36 z"/><path d="M174 360 v-36 a20 20 0 0 1 40 0 v36 z"/>
      <path d="M128 575 v-70 a32 32 0 0 1 64 0 v70 z"/>
    </g>
    <g class="pavilion">
      <rect x="104" y="150" width="8" height="46"/><rect x="208" y="150" width="8" height="46"/><rect x="156" y="150" width="8" height="46"/>
      <path class="roof" d="M74 154 Q118 146 124 128 L196 128 Q202 146 246 154 Q206 150 160 150 Q114 150 74 154 z"/>
      <path class="roof-top" d="M120 130 L132 112 L188 112 L200 130 z"/>
      <rect x="98" y="194" width="124" height="8" class="floor"/>
    </g>`;
  const rightWall = `
    <g class="masonry old">
      <rect x="${RIGHT_WALL.x}" y="${RIGHT_WALL.top}" width="160" height="${GROUND_Y - RIGHT_WALL.top + 30}"/>
      ${battlements(RIGHT_WALL.x + 25, 140, RIGHT_WALL.top, 58, 42, 55)}
      <rect x="${WALL_RIGHT - 75}" y="${GROUND_Y - 2 * COURSE_H}" width="75" height="${COURSE_H}"/>
      <rect x="${WALL_RIGHT - 75}" y="${GROUND_Y - 4 * COURSE_H}" width="75" height="${COURSE_H}"/>
    </g>
    ${courseLines(RIGHT_WALL.x, RIGHT_WALL.top, 160, 0)}`;
  const foundation = FOUNDATION.map(stone => `<rect class="stone built" x="${stone.x + 1.5}" y="${stone.y + 1.5}" width="${stone.w - 3}" height="${stone.h - 3}" rx="5"/>`).join('');
  return `
  <defs>
    <linearGradient id="${prefix}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe6ef"/><stop offset=".55" stop-color="#f6ead2"/><stop offset="1" stop-color="#fbe2bf"/></linearGradient>
    <linearGradient id="${prefix}-stone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9c7a7"/><stop offset="1" stop-color="#b89f7c"/></linearGradient>
    <linearGradient id="${prefix}-old" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#cdb999"/><stop offset="1" stop-color="#a8906e"/></linearGradient>
    <linearGradient id="${prefix}-new" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8d5b0"/><stop offset="1" stop-color="#c7aa80"/></linearGradient>
    <filter id="${prefix}-wash" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".018" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="9"/></filter>
  </defs>
  <rect width="1000" height="640" fill="url(#${prefix}-sky)"/>
  <circle cx="800" cy="120" r="58" fill="#ffd98f" opacity=".75"/><circle cx="800" cy="120" r="90" fill="#ffe3a8" opacity=".25"/>
  <g filter="url(#${prefix}-wash)">
    <path d="M0 330 L90 250 L170 300 L260 210 L360 290 L450 230 L560 300 L650 220 L760 290 L860 240 L1000 300 V640 H0 z" fill="#a9c3c8" opacity=".55"/>
    <path d="M0 390 L120 300 L230 360 L330 290 L450 370 L560 300 L690 370 L800 310 L920 360 L1000 330 V640 H0 z" fill="#8fb19c" opacity=".6"/>
  </g>
  <g class="far-wall">
    <path d="M330 290 L380 318 L450 370 L505 335 L560 300 L620 337 L690 370 L745 336 L800 310 L860 336 L920 360" fill="none"/>
    <rect x="324" y="276" width="14" height="16"/><rect x="554" y="286" width="14" height="16"/><rect x="794" y="296" width="14" height="16"/><rect x="444" y="356" width="12" height="14"/>
  </g>
  <g filter="url(#${prefix}-wash)">
    <path d="M0 470 Q160 410 330 450 T680 440 T1000 430 V640 H0 z" fill="#7fa982" opacity=".75"/>
  </g>
  <path d="M0 ${GROUND_Y} Q300 560 520 ${GROUND_Y} T1000 ${GROUND_Y - 8} V640 H0 z" fill="#6f9a6c"/>
  <path d="M0 600 Q260 585 520 604 T1000 596 V640 H0 z" fill="#5d8a5d" opacity=".8"/>
  <g class="pines"><path d="M30 575 l18 -48 l18 48 z"/><path d="M955 560 l16 -44 l16 44 z"/><path d="M928 575 l13 -34 l13 34 z"/></g>
  ${towerFace}
  ${rightWall}
  <g class="foundation">${foundation}</g>
  <g class="stones"></g>
  <g class="celebration" hidden>
    <g class="flag"><line x1="160" y1="112" x2="160" y2="40"/><path d="M160 42 q26 6 46 0 q-6 12 0 24 q-20 6 -46 0 z"/></g>
    <g class="flag"><line x1="930" y1="320" x2="930" y2="258"/><path d="M930 260 q22 5 40 0 q-5 10 0 20 q-18 5 -40 0 z"/></g>
    <g class="banner"><rect x="330" y="40" width="440" height="78" rx="14"/><text x="550" y="94" text-anchor="middle" lang="zh-Hans">长城建好了！</text></g>
  </g>`;
}

// Draws every new-stone position: placed stones, highlighted legal spots (when a stone is in hand)
// and faint outlines of spots that are not reachable yet.
export function renderStones(group, { placed, legal, justPlaced = null, onPick = () => {} }) {
  group.replaceChildren();
  for (const slot of SLOTS) {
    const isPlaced = placed.includes(slot.id), isLegal = legal.includes(slot.id);
    const kindLabel = slot.kind === 'battlement' ? 'battlement stone' : 'wall stone';
    if (isPlaced) {
      const g = svgEl('g', { class: `stone-group${slot.id === justPlaced ? ' drop' : ''}`, 'data-slot': slot.id });
      g.append(svgEl('rect', { class: 'stone new', x: slot.x + 1.5, y: slot.y + 1.5, width: slot.w - 3, height: slot.h - 3, rx: 5 }),
        svgEl('line', { class: 'stone-shine', x1: slot.x + 10, y1: slot.y + 8, x2: slot.x + slot.w - 14, y2: slot.y + 8 }));
      group.append(g);
    } else if (isLegal) {
      const g = svgEl('g', { class: 'slot legal', 'data-slot': slot.id, role: 'button', tabindex: '0',
        'aria-label': `Build here: ${kindLabel}, row ${slot.row + 1}` });
      g.append(svgEl('rect', { class: 'hit', x: slot.x - 6, y: slot.y - 8, width: slot.w + 12, height: slot.h + 16, rx: 10 }),
        svgEl('rect', { class: 'glow', x: slot.x + 3, y: slot.y + 3, width: slot.w - 6, height: slot.h - 6, rx: 7 }));
      const plus = svgEl('text', { x: slot.x + slot.w / 2, y: slot.y + slot.h / 2 + 11, 'text-anchor': 'middle', class: 'plus', 'aria-hidden': 'true' });
      plus.textContent = '+';
      g.append(plus);
      const pick = event => { event.preventDefault(); onPick(slot.id); };
      g.addEventListener('click', pick);
      g.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') pick(event); });
      group.append(g);
    } else {
      group.append(svgEl('rect', { class: 'slot empty', x: slot.x + 4, y: slot.y + 4, width: slot.w - 8, height: slot.h - 8, rx: 6, 'aria-hidden': 'true' }));
    }
  }
}
