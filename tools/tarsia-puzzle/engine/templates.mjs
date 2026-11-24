// Puzzle templates: a shape is only a list of lattice cells plus its supported starting-piece configurations.
// Everything else (orientation, shared edges, boundary edges, piece and word counts) is derived and validated,
// so a new template needs no engine change.
import { isUpCell, slotId, slotDirs, neighbourCell, opposite, cellCentroid } from './geometry.mjs';

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

// Verified against TarsiaPuzzle_11words.pdf: 2 rows × 5, ▲▼▲▼▲ over ▼▲▼▲▼; 10 pieces, 11 shared edges, 8 boundary.
const HEXAGON_10 = {
  id: 'hexagon-10', name: 'Long hexagon', shape: 'long-hexagon',
  cells: [...range(0, 4).map(c => [0, c]), ...range(0, 4).map(c => [1, c])],
  startingConfigurations: [
    // Decision D2 default: the two centre pieces, adjacent, show one finished match.
    { id: 'centre-pair', name: 'Centre pair (adjacent)', slots: ['r0c2', 'r1c2'] },
    { id: 'separated', name: 'Separated pair', slots: ['r0c1', 'r1c3'] }
  ]
};

// Verified against TarsiaPuzzle_18words_Countries.pdf: side-4 triangle, rows of 1/3/5/7; 16 pieces, 18 shared, 12 boundary.
const TRIANGLE_16 = {
  id: 'triangle-16', name: 'Triangle', shape: 'triangle',
  cells: range(0, 3).flatMap(r => range(4 - r, 4 + r).map(c => [r, c])),
  startingConfigurations: [
    // The centre ▲ is the only slot whose three edges all meet neighbours and it sits on the board's centroid.
    { id: 'centre', name: 'Centre piece', slots: ['r2c4'] },
    { id: 'apex', name: 'Top corner', slots: ['r0c4'] }
  ]
};

export const TEMPLATES = Object.freeze([HEXAGON_10, TRIANGLE_16]);

export class TemplateError extends Error {}

// Validates a template definition and derives its topology. Throws TemplateError with every problem found.
export function compileTemplate(definition) {
  const problems = [];
  if (!definition || typeof definition.id !== 'string' || !definition.id) throw new TemplateError('A template needs an id.');
  const cells = Array.isArray(definition.cells) ? definition.cells : [];
  if (!cells.length) problems.push('it has no cells');
  const slots = [], byId = new Map();
  for (const cell of cells) {
    if (!Array.isArray(cell) || cell.length !== 2 || !cell.every(Number.isInteger)) { problems.push(`invalid cell ${JSON.stringify(cell)}`); continue; }
    const [row, col] = cell, id = slotId(row, col);
    if (byId.has(id)) { problems.push(`cell ${id} appears twice (overlapping slots)`); continue; }
    const slot = Object.freeze({ id, row, col, up: isUpCell(row, col), dirs: slotDirs(isUpCell(row, col)), centroid: cellCentroid(row, col) });
    byId.set(id, slot); slots.push(slot);
  }
  // Shared edges: each counted once, from the slot listed first.
  const internalEdges = [], boundaryEdges = [], neighbours = new Map(slots.map(s => [s.id, []]));
  const order = new Map(slots.map((s, i) => [s.id, i]));
  for (const slot of slots) for (const dir of slot.dirs) {
    const other = byId.get(slotId(...neighbourCell(slot.row, slot.col, dir)));
    if (!other) { boundaryEdges.push(Object.freeze({ slot: slot.id, dir })); continue; }
    if (other.up === slot.up || !other.dirs.includes(opposite(dir))) problems.push(`slots ${slot.id} and ${other.id} do not share an edge correctly`);
    neighbours.get(slot.id).push(other.id);
    if (order.get(slot.id) < order.get(other.id)) internalEdges.push(Object.freeze({ a: slot.id, aDir: dir, b: other.id, bDir: opposite(dir) }));
  }
  // Connected board.
  if (slots.length) {
    const seen = new Set([slots[0].id]), queue = [slots[0].id];
    while (queue.length) for (const next of neighbours.get(queue.shift())) if (!seen.has(next)) { seen.add(next); queue.push(next); }
    if (seen.size !== slots.length) problems.push('its slots are not all connected');
  }
  if (slots.length && !internalEdges.length) problems.push('it has no shared edges, so no words to match');
  if (3 * slots.length !== 2 * internalEdges.length + boundaryEdges.length) problems.push('edge counts are inconsistent');
  const configs = Array.isArray(definition.startingConfigurations) ? definition.startingConfigurations : [];
  const configIds = new Set();
  for (const config of configs) {
    if (!config?.id || configIds.has(config.id)) problems.push('a starting configuration has a missing or repeated id');
    configIds.add(config?.id);
    const ids = Array.isArray(config?.slots) ? config.slots : [];
    if (!ids.length) problems.push(`starting configuration ${config?.id} has no slots`);
    if (new Set(ids).size !== ids.length) problems.push(`starting configuration ${config?.id} repeats a slot`);
    if (ids.length >= slots.length) problems.push(`starting configuration ${config?.id} leaves nothing to solve`);
    for (const id of ids) if (!byId.has(id)) problems.push(`starting configuration ${config?.id} names unknown slot ${id}`);
  }
  if (problems.length) throw new TemplateError(`Template ${definition.id} is invalid: ${problems.join('; ')}.`);
  return Object.freeze({
    id: definition.id, name: definition.name || definition.id, shape: definition.shape || 'custom',
    slots: Object.freeze(slots), slotById: byId,
    internalEdges: Object.freeze(internalEdges), boundaryEdges: Object.freeze(boundaryEdges),
    pieceCount: slots.length,
    requiredPairs: internalEdges.length, // derived from topology, never hard-coded
    startingConfigurations: Object.freeze(configs.map(c => Object.freeze({ ...c, slots: Object.freeze([...c.slots]) })))
  });
}

const compiled = new Map();
export function getTemplate(id) {
  if (!compiled.has(id)) {
    const definition = TEMPLATES.find(t => t.id === id);
    if (!definition) throw new TemplateError(`Unknown template: ${id}`);
    compiled.set(id, compileTemplate(definition));
  }
  return compiled.get(id);
}
export const templateLabel = template => `${template.name} · ${template.pieceCount} pieces`;
