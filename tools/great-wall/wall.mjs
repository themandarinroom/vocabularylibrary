// Build the Great Wall: the predefined construction layout and its structural rules (pure).
// Coordinates are SVG user units in the scene's 1000 × 640 viewBox. Ground level is y = 575.
//
// The wall section runs between the watchtower (left) and the existing wall (right), in running bond:
//   foundation (pre-built):  row 0 = 4 full stones, row 1 = 3 stones bonded into the tower and wall
//   new work (10 stones):    row 2 = 4 stones, row 3 = 3 stones, then 3 battlement stones (merlons)
// A stone may only be placed once every stone it rests on is in place, so nothing can float,
// overlap or be unreachable, and any order of legal placements ends in the same complete section.

export const GROUND_Y = 575;
export const COURSE_H = 50;
export const WALL_LEFT = 250;
export const WALL_RIGHT = 850;
export const BRICK_W = 150;
const courseTop = row => GROUND_Y - (row + 1) * COURSE_H;

export const FOUNDATION = Object.freeze([
  ...[0, 1, 2, 3].map(i => Object.freeze({ id: `f0-${i}`, x: WALL_LEFT + i * BRICK_W, y: courseTop(0), w: BRICK_W, h: COURSE_H })),
  ...[0, 1, 2].map(i => Object.freeze({ id: `f1-${i}`, x: WALL_LEFT + 75 + i * BRICK_W, y: courseTop(1), w: BRICK_W, h: COURSE_H }))
]);

const brick = (id, row, x, needs) => Object.freeze({ id, kind: 'stone', row, x, y: courseTop(row), w: BRICK_W, h: COURSE_H, needs: Object.freeze(needs) });
const MERLON_W = 100, MERLON_H = 55;
const merlon = (id, centre, needs) => Object.freeze({ id, kind: 'battlement', row: 4, x: centre - MERLON_W / 2, y: courseTop(3) - MERLON_H, w: MERLON_W, h: MERLON_H, needs: Object.freeze(needs) });

export const SLOTS = Object.freeze([
  brick('s1', 2, 250, []), brick('s2', 2, 400, []), brick('s3', 2, 550, []), brick('s4', 2, 700, []),
  brick('s5', 3, 325, ['s1', 's2']), brick('s6', 3, 475, ['s2', 's3']), brick('s7', 3, 625, ['s3', 's4']),
  merlon('m1', 400, ['s5']), merlon('m2', 550, ['s6']), merlon('m3', 700, ['s7'])
]);
export const TARGET_BRICKS = SLOTS.length; // 10
const byId = new Map(SLOTS.map(slot => [slot.id, slot]));

export function slotById(id) { return byId.get(id) || null; }
export function isLegal(placed, id) {
  const slot = byId.get(id);
  return Boolean(slot) && !placed.includes(id) && slot.needs.every(need => placed.includes(need));
}
export function legalSlots(placed) { return SLOTS.filter(slot => isLegal(placed, slot.id)).map(slot => slot.id); }
export function placeStone(placed, id) {
  if (!isLegal(placed, id)) throw new Error('That stone cannot go there yet.');
  return Object.freeze([...placed, id]);
}
export const isComplete = placed => placed.length === TARGET_BRICKS && SLOTS.every(slot => placed.includes(slot.id));
