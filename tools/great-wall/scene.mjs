// Build the Great Wall: the storybook construction scene (SVG, 1000 × 640 viewBox).
// The landscape is drawn once; only the stone layer is redrawn as the wall grows.
// v0.2: softer layered landscape, bevelled sandstone blocks, a traditional watchtower and
// yellow dragon flags. Stone positions and sizes come unchanged from wall.mjs.
import { FOUNDATION, SLOTS, GROUND_Y, WALL_LEFT, WALL_RIGHT, COURSE_H } from './wall.mjs';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attributes = {}) => {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
};
const r1 = value => Math.round(value * 10) / 10;

// One sandstone block with a little thickness: lit top and left bevels, shaded bottom and right
// bevels, and a crisp outline. tone is 'new' (placed by the student) or 'built' (older masonry).
export function blockMarkup(x, y, w, h, tone = 'new', prefix = 'gw') {
  const x0 = x + 1.5, y0 = y + 1.5, x1 = x + w - 1.5, y1 = y + h - 1.5;
  const b = Math.min(5, h / 6), s = Math.min(7, h / 5);
  return `<g class="block ${tone}">`
    + `<rect class="stone ${tone === 'new' ? 'new' : 'built'}" x="${r1(x0)}" y="${r1(y0)}" width="${r1(x1 - x0)}" height="${r1(y1 - y0)}" rx="3" fill="url(#${prefix}-block-${tone})"/>`
    + `<path class="bevel-top" d="M${r1(x0 + 1)} ${r1(y0 + 1)}H${r1(x1 - 1)}L${r1(x1 - s)} ${r1(y0 + b)}H${r1(x0 + b)}Z"/>`
    + `<path class="bevel-left" d="M${r1(x0 + 1)} ${r1(y0 + 1)}L${r1(x0 + b)} ${r1(y0 + b)}V${r1(y1 - s)}L${r1(x0 + 1)} ${r1(y1 - 1)}Z"/>`
    + `<path class="bevel-bottom" d="M${r1(x0 + 1)} ${r1(y1 - 1)}L${r1(x0 + b)} ${r1(y1 - s)}H${r1(x1 - s)}L${r1(x1 - 1)} ${r1(y1 - 1)}Z"/>`
    + `<path class="bevel-right" d="M${r1(x1 - 1)} ${r1(y0 + 1)}V${r1(y1 - 1)}L${r1(x1 - s)} ${r1(y1 - s)}V${r1(y0 + b)}Z"/>`
    + `<rect class="glint" x="${r1(x0)}" y="${r1(y0)}" width="${r1(x1 - x0)}" height="${r1(y1 - y0)}" rx="3"/>`
    + `<rect class="block-outline" x="${r1(x0)}" y="${r1(y0)}" width="${r1(x1 - x0)}" height="${r1(y1 - y0)}" rx="3"/>`
    + '</g>';
}

// Running-bond courses of built blocks, clipped to [left, right).
function blockCourses(left, right, rows, prefix) {
  let out = '';
  for (const { y, h, start, width } of rows) {
    for (let x = start; x < right; x += width) {
      const a = Math.max(x, left), z = Math.min(x + width, right);
      if (z - a > 4) out += blockMarkup(a, y, z - a, h, 'built', prefix);
    }
  }
  return out;
}

// Fine mortar joints for the tower face (smaller courses than the wall, so it reads as a taller building).
function towerJoints(x, top, w, bottom, courseH = 31, joint = 46) {
  let lines = '';
  for (let row = 0, y = bottom - courseH; y > top + 2; row++, y -= courseH) {
    lines += `<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y}"/>`;
    for (let jx = x + (row % 2 ? joint / 2 : joint); jx < x + w - 4; jx += joint) lines += `<line x1="${jx}" y1="${y}" x2="${jx}" y2="${y + courseH}"/>`;
  }
  return `<g class="joints">${lines}</g>`;
}

// Triangular flag with flame-shaped red edging (pole edge at x = 0), corners (0,0), (96,50), (0,64).
function flameEdge(from, to, teeth, depth) {
  const dx = to[0] - from[0], dy = to[1] - from[1], len = Math.hypot(dx, dy);
  const nx = dy / len, ny = -dx / len; // outward normal for this winding
  const at = t => [from[0] + dx * t, from[1] + dy * t];
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const [px, py] = at((i + 0.7) / teeth), [ex, ey] = at((i + 1) / teeth), [cx, cy] = at((i + 0.35) / teeth);
    d += `Q${r1(cx + nx * depth * 0.9)} ${r1(cy + ny * depth * 0.9)} ${r1(px + nx * depth)} ${r1(py + ny * depth)}`
      + `Q${r1(px + nx * depth * 0.2)} ${r1(py + ny * depth * 0.2)} ${r1(ex)} ${r1(ey)}`;
  }
  return d;
}
const FLAG_EDGE = `M0 0${flameEdge([0, 0], [96, 50], 9, 6)}${flameEdge([96, 50], [0, 64], 8, 6)}Z`;

// Original simplified vector interpretation of a Qing-style yellow dragon banner.
function flagDefs(prefix) {
  return `
    <g id="${prefix}-dragon-flag">
      <path class="flag-edge" d="${FLAG_EDGE}"/>
      <path class="flag-field" d="M1 5 L84 49 L1 58 Z"/>
      <path class="flag-fold" d="M1 5 L84 49 L60 40 Q30 30 1 26 Z"/>
      <g class="dragon" transform="translate(3 3) scale(.94)">
        <path class="dragon-cloud" d="M27 13 q3 -3 6 0 q3 -3 6 0 M47 41 q2.5 -2.5 5 0 q2.5 -2.5 5 0 M9 47 q2.5 -2.5 5 0"/>
        <path class="dragon-body" d="M18 26 C22 16 29 16 32 24 C35 32 41 32 44 26 C47 21 53 24 56 31 Q59 38 67 43"/>
        <path class="dragon-scales" d="M18 26 C22 16 29 16 32 24 C35 32 41 32 44 26 C47 21 53 24 56 31 Q59 38 67 43"/>
        <path class="dragon-legs" d="M23 19 L19 12 l-2 -1 m2 1 l0 -2.5 m0 2.5 l2 -1.5 M31 28 L28 35 l-2.5 0 m2.5 0 l0 2.5 m0 -2.5 l2.5 1 M43 29 L45 36 l-2 1 m2 -1 l1.5 2 m-1.5 -2 l2.5 0 M54 27 L58 21 l-0.5 -2.5 m0.5 2.5 l2 -1.5 m-2 1.5 l2.5 1"/>
        <path class="dragon-mane" d="M16 19 q4 -6 10 -5 M18 22 q5 -3 10 -1 M17 27 q4 1 6 5"/>
        <path class="dragon-head" d="M5 24 Q6 18 13 18 Q20 18 21 24 Q20 30 13 30 L8 30 Q5 29 5 24 Z M6 28 L1 31 L9 30 Z"/>
        <path class="dragon-horn" d="M12 18 L14 11 M15 18 L19 12"/>
        <path class="dragon-whisker" d="M5 23 Q0 19 3 13 M6 26 Q1 26 0 22"/>
        <circle class="dragon-eye" cx="10.5" cy="22" r="1.5"/>
        <circle class="dragon-pearl" cx="5" cy="40" r="2.8"/>
      </g>
    </g>`;
}
const flag = (prefix, poleX, base, top, scale) => `
    <g class="flag">
      <line class="flag-pole" x1="${poleX}" y1="${base}" x2="${poleX}" y2="${top - 3}"/>
      <circle class="flag-finial" cx="${poleX}" cy="${top - 5}" r="${r1(3.6 * scale)}"/>
      <g transform="translate(${poleX + 1.5} ${top}) scale(${scale})"><use class="cloth" href="#${prefix}-dragon-flag"/></g>
    </g>`;

const TOWER = { x: 70, w: 180 };
const RIGHT_WALL = { x: WALL_RIGHT, top: GROUND_Y - 4 * COURSE_H };
const ROOF = 'M70 136 Q96 156 114 153 L206 153 Q224 156 250 136 Q214 134 196 104 L124 104 Q106 134 70 136 Z';

export function sceneMarkup(prefix = 'gw') {
  const P = prefix;
  const courseY = row => GROUND_Y - (row + 1) * COURSE_H;
  // Mountains: lighter, cooler and less saturated the further away they are.
  const ranges = `
    <path d="M0 270 C60 250 110 196 170 192 C230 188 262 236 318 228 C380 220 410 160 476 156 C546 152 580 214 642 210 C702 206 744 172 806 176 C866 180 906 222 1000 214 V640 H0 Z" fill="url(#${P}-range1)"/>
    <path d="M0 300 C80 276 128 238 196 240 C262 242 304 286 372 278 C442 270 486 230 562 234 C638 238 684 282 760 274 C832 266 884 240 1000 262 V640 H0 Z" fill="url(#${P}-range2)"/>
    <path d="M0 260 H1000 V330 H0 Z" fill="url(#${P}-mist)"/>
    <path d="M0 346 C90 316 170 300 260 312 C340 322 400 300 480 292 C570 284 640 322 720 318 C800 314 870 296 1000 300 V640 H0 Z" fill="url(#${P}-range3)"/>
    <g class="far-wall">
      <path d="M262 314 C340 324 400 302 480 294 C570 286 640 324 720 320 C800 316 870 298 1000 302"/>
      <path class="far-tower" d="M474 280 h13 v-4 h-3 v-3 h-2 v3 h-3 v-3 h-2 v3 h-3 v4 Z M473 280 h15 v14 h-15 Z"/>
      <path class="far-tower" d="M714 306 h12 v-4 h-2.5 v-3 h-2 v3 h-3 v-3 h-2 v3 h-2.5 v4 Z M713 306 h14 v13 h-14 Z"/>
      <path class="far-tower" d="M904 296 h10 v-3 h-2 v-2 h-2 v2 h-2 v-2 h-2 v2 h-2 v3 Z M903 296 h12 v11 h-12 Z"/>
    </g>
    <path d="M0 330 H1000 V380 H0 Z" fill="url(#${P}-mist)" opacity=".5"/>
    <path d="M0 420 C120 384 240 392 360 410 C470 428 560 388 680 392 C800 396 880 414 1000 402 V640 H0 Z" fill="url(#${P}-range4)"/>`;

  const tiles = Array.from({ length: 15 }, (_, i) => {
    const top = 126 + i * 5, bottom = 76 + i * 12;
    return `<path d="M${top} 104 Q${r1((top + bottom) / 2 + (i - 7) * 1.5)} 134 ${bottom} 156"/>`;
  }).join('');
  const tower = `
    <g class="watchtower">
      <g class="pavilion">
        <rect class="pavilion-wall" x="100" y="146" width="120" height="58"/>
        <rect class="pavilion-beam" x="98" y="146" width="124" height="7"/>
        <rect class="pavilion-window" x="118" y="166" width="16" height="20" rx="2"/><rect class="pavilion-window" x="186" y="166" width="16" height="20" rx="2"/>
        <path class="pavilion-door" d="M150 204 v-26 a10 10 0 0 1 20 0 v26 z"/>
        <path class="roof" d="${ROOF}"/>
        <g clip-path="url(#${P}-roof-clip)" class="roof-tiles">${tiles}</g>
        <path class="roof-eave" d="M72 136 Q96 158 114 156 L206 156 Q224 158 248 136"/>
        <path class="roof-ridge" d="M118 105 L202 105 L206 98 Q160 95 114 98 Z"/>
        <path class="roof-ornament" d="M116 100 Q108 99 108 92 Q112 96 119 97 Z M204 100 Q212 99 212 92 Q208 96 201 97 Z"/>
        <g class="tile-ends">${Array.from({ length: 14 }, (_, i) => `<circle cx="${117 + i * 7}" cy="155" r="2.2"/>`).join('')}</g>
      </g>
      <rect class="tower-body" x="${TOWER.x}" y="236" width="${TOWER.w}" height="${GROUND_Y - 236}" fill="url(#${P}-tower)"/>
      ${towerJoints(TOWER.x, 236, TOWER.w, GROUND_Y - 27)}
      <rect class="tower-shade" x="${TOWER.x + TOWER.w - 16}" y="236" width="16" height="${GROUND_Y - 236}"/>
      <rect class="tower-light" x="${TOWER.x}" y="236" width="6" height="${GROUND_Y - 236}"/>
      <g class="tower-top">
        <rect class="parapet" x="66" y="200" width="188" height="28" fill="url(#${P}-tower)"/>
        ${[66, 106, 146, 186, 226].map(mx => `<rect class="merlon" x="${mx}" y="178" width="28" height="24" rx="1.5" fill="url(#${P}-tower)"/><rect class="merlon-cap" x="${mx}" y="178" width="28" height="4" rx="1.5"/>`).join('')}
        ${[97, 137, 177, 217].map(lx => `<rect class="loophole" x="${lx}" y="208" width="7" height="9" rx="1"/>`).join('')}
        <rect class="parapet-shade" x="66" y="222" width="188" height="6"/>
        <rect class="cornice" x="60" y="228" width="200" height="11" rx="2"/>
        <rect class="cornice-shadow" x="70" y="239" width="180" height="6"/>
      </g>
      <g class="tower-openings">
        ${[[104, 362], [176, 362]].map(([wx, wy]) => `<path class="arch-ring" d="M${wx} ${wy} v-38 a20 20 0 0 1 40 0 v38"/><path class="window" d="M${wx} ${wy} v-38 a20 20 0 0 1 40 0 v38 z"/><rect class="sill" x="${wx - 6}" y="${wy}" width="52" height="7" rx="2"/>`).join('')}
        <path class="arch-ring door-ring" d="M126 ${GROUND_Y - 27} v-58 a34 34 0 0 1 68 0 v58"/>
        <path class="door" d="M126 ${GROUND_Y} v-85 a34 34 0 0 1 68 0 v85 z" fill="url(#${P}-door)"/>
        <path class="voussoirs" d="M126 ${GROUND_Y - 85} l-8 -3 M136 ${GROUND_Y - 109} l-6 -6 M160 ${GROUND_Y - 119} v-9 M184 ${GROUND_Y - 109} l6 -6 M194 ${GROUND_Y - 85} l8 -3"/>
        <rect class="keystone" x="154" y="${GROUND_Y - 129}" width="12" height="12" rx="2"/>
      </g>
      <g class="plinth">${blockCourses(60, 260, [{ y: GROUND_Y - 27, h: 27, start: 60, width: 50 }], P)}</g>
    </g>`;

  const bonded = [courseY(1), courseY(3)].map(y => blockMarkup(WALL_LEFT, y, 75, COURSE_H, 'built', P) + blockMarkup(WALL_RIGHT - 75, y, 75, COURSE_H, 'built', P)).join('');
  const rightWall = `
    <g class="right-wall">
      ${blockCourses(RIGHT_WALL.x, 1000, [0, 1, 2, 3].map(row => ({ y: courseY(row), h: COURSE_H, start: row % 2 ? RIGHT_WALL.x - 75 : RIGHT_WALL.x, width: 150 })), P)}
      ${blockMarkup(866, RIGHT_WALL.top - 55, 66, 55, 'built', P)}${blockMarkup(962, RIGHT_WALL.top - 55, 66, 55, 'built', P)}
    </g>`;
  const foundation = FOUNDATION.map(stone => blockMarkup(stone.x, stone.y, stone.w, stone.h, 'built', P)).join('');
  const trees = `
    <g class="trees">
      <path class="trunk" d="M30 578 v-26"/>
      <path class="tree-dark" d="M8 560 C2 540 14 522 30 524 C36 506 60 512 60 530 C72 538 66 560 52 562 C44 572 18 572 8 560 Z"/>
      <path class="tree-light" d="M16 552 C14 540 24 532 34 536 C40 526 54 530 52 542 C46 548 30 552 16 552 Z"/>
    </g>`;

  return `
  <defs>
    <linearGradient id="${P}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4e3e8"/><stop offset=".5" stop-color="#e8eee9"/><stop offset="1" stop-color="#f3ebdb"/></linearGradient>
    <linearGradient id="${P}-range1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c3d1d8"/><stop offset=".35" stop-color="#d9e2e3"/><stop offset="1" stop-color="#e6ebe7"/></linearGradient>
    <linearGradient id="${P}-range2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fb3b9"/><stop offset=".3" stop-color="#bccacb"/><stop offset="1" stop-color="#d9e1dc"/></linearGradient>
    <linearGradient id="${P}-range3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#86a096"/><stop offset=".35" stop-color="#a2b5aa"/><stop offset="1" stop-color="#bac7bb"/></linearGradient>
    <linearGradient id="${P}-range4" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7f9882"/><stop offset="1" stop-color="#94a893"/></linearGradient>
    <linearGradient id="${P}-mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f6f2" stop-opacity="0"/><stop offset=".55" stop-color="#f4f6f2" stop-opacity=".75"/><stop offset="1" stop-color="#f4f6f2" stop-opacity="0"/></linearGradient>
    <linearGradient id="${P}-ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8aa186"/><stop offset="1" stop-color="#768e72"/></linearGradient>
    <linearGradient id="${P}-front" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f876b"/><stop offset="1" stop-color="#617a5f"/></linearGradient>
    <linearGradient id="${P}-block-new" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#efdcb6"/><stop offset="1" stop-color="#dcc196"/></linearGradient>
    <linearGradient id="${P}-block-built" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dcc7a3"/><stop offset="1" stop-color="#c9b089"/></linearGradient>
    <linearGradient id="${P}-tower" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e2c9a0"/><stop offset=".7" stop-color="#d6ba8f"/><stop offset="1" stop-color="#c7a97f"/></linearGradient>
    <linearGradient id="${P}-door" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2e28"/><stop offset="1" stop-color="#5a473b"/></linearGradient>
    <linearGradient id="${P}-cast" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5b4632" stop-opacity=".28"/><stop offset="1" stop-color="#5b4632" stop-opacity="0"/></linearGradient>
    <clipPath id="${P}-roof-clip"><path d="${ROOF}"/></clipPath>
    ${flagDefs(P)}
  </defs>
  <rect width="1000" height="640" fill="url(#${P}-sky)"/>
  <g class="sun"><circle cx="800" cy="118" r="88" fill="#f8ecd0" opacity=".45"/><circle cx="800" cy="118" r="50" fill="#f6e1b2" opacity=".85"/></g>
  <g class="clouds"><path d="M560 92 q14 -20 36 -10 q16 -16 36 0 q24 -2 20 16 h-100 q-6 -6 8 -6 z"/><path d="M300 140 q10 -14 26 -7 q12 -11 26 0 q18 -1 14 12 h-72 q-4 -5 6 -5 z"/></g>
  <g class="landscape">${ranges}</g>
  <path d="M0 ${GROUND_Y} Q300 560 520 ${GROUND_Y} T1000 ${GROUND_Y - 8} V640 H0 z" fill="url(#${P}-ground)"/>
  ${trees}
  ${tower}
  ${rightWall}
  <g class="bonded">${bonded}</g>
  <g class="foundation">${foundation}</g>
  <g class="stones" data-prefix="${P}"></g>
  <rect class="tower-cast" x="${WALL_LEFT}" y="${courseY(3)}" width="22" height="${4 * COURSE_H}" fill="url(#${P}-cast)" pointer-events="none"/>
  <path class="front-grass" d="M0 600 Q260 586 520 602 T1000 596 V640 H0 z" fill="url(#${P}-front)" pointer-events="none"/>
  <g class="celebration" hidden>
    ${flag(P, 160, 98, 10, 1.15)}
    ${flag(P, 896, RIGHT_WALL.top - 54, 240, 1)}
  </g>`;
}

// Draws every new-stone position: placed stones, highlighted legal spots (when a stone is in hand)
// and faint outlines of spots that are not reachable yet.
export function renderStones(group, { placed, legal, justPlaced = null, onPick = () => {} }) {
  const prefix = group.getAttribute('data-prefix') || 'gw';
  group.replaceChildren();
  for (const slot of SLOTS) {
    const isPlaced = placed.includes(slot.id), isLegal = legal.includes(slot.id);
    const kindLabel = slot.kind === 'battlement' ? 'battlement stone' : 'wall stone';
    if (isPlaced) {
      const g = svgEl('g', { class: `stone-group${slot.id === justPlaced ? ' drop' : ''}`, 'data-slot': slot.id });
      g.insertAdjacentHTML('beforeend', blockMarkup(slot.x, slot.y, slot.w, slot.h, 'new', prefix));
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
