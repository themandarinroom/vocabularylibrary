// Triangular-lattice geometry shared by every Tarsia template.
//
// A slot is a cell (row, col) of a lattice of equilateral triangles with side 1. Columns step by half a side,
// so neighbouring cells in a row share a slanted edge. A cell is ▲ ("up") when (row + col) is even, ▼ otherwise.
//
// Edges are identified by the direction their outward normal points, in degrees clockwise from north:
//   ▲ edges face 300 (left), 60 (right), 180 (bottom)
//   ▼ edges face   0 (top),  120 (right), 240 (left)
// Two cells share an edge when one faces d and the other faces d + 180.
//
// Pieces use one canonical frame: at rotation 0 a piece is ▲ and its edges[0..2] face 300, 60, 180 (clockwise).
// Rotation k (0..5) turns it k × 60° clockwise, so edge i faces (UP_DIRS[i] + 60k) mod 360.
// Odd k points the piece down; six steps return it to where it started.

export const UP_DIRS = Object.freeze([300, 60, 180]);
export const DOWN_DIRS = Object.freeze([0, 120, 240]);
export const ROTATIONS = 6;
export const H = Math.sqrt(3) / 2; // height of a unit triangle

export const isUpCell = (row, col) => ((row + col) % 2 + 2) % 2 === 0;
export const slotId = (row, col) => `r${row}c${col}`;
export const slotDirs = up => up ? UP_DIRS : DOWN_DIRS;
export const opposite = dir => (dir + 180) % 360;
export const norm = rotation => ((rotation % ROTATIONS) + ROTATIONS) % ROTATIONS;
export const rotationIsUp = rotation => norm(rotation) % 2 === 0;

// The neighbouring cell across the edge facing `dir`.
export function neighbourCell(row, col, dir) {
  switch (dir) {
    case 300: case 240: return [row, col - 1];
    case 60: case 120: return [row, col + 1];
    case 180: return [row + 1, col];
    case 0: return [row - 1, col];
    default: throw new Error(`Not an edge direction: ${dir}`);
  }
}

// Direction that a piece's edge i faces at a rotation.
export const edgeDirection = (edgeIndex, rotation) => (UP_DIRS[edgeIndex] + 60 * norm(rotation)) % 360;

// Which of a piece's edges faces `dir` at this rotation (or -1 when the piece points the other way).
export function edgeIndexFacing(rotation, dir) {
  for (let i = 0; i < 3; i++) if (edgeDirection(i, rotation) === dir) return i;
  return -1;
}

// A rotation fits a slot when the piece points the same way (▲ in ▲, ▼ in ▼).
export const fitsSlot = (rotation, slotUp) => rotationIsUp(rotation) === slotUp;

// Centroid of a cell in side units (x right, y down). ▲ centroid is 2/3 of the way down its row; ▼ 1/3.
export function cellCentroid(row, col) {
  return { x: col / 2, y: row * H + (isUpCell(row, col) ? 2 * H / 3 : H / 3) };
}

// Corners of a cell, clockwise from the apex (▲) or the top-left corner (▼).
export function cellCorners(row, col) {
  const x = col / 2, top = row * H, bottom = top + H;
  return isUpCell(row, col)
    ? [{ x, y: top }, { x: x + 0.5, y: bottom }, { x: x - 0.5, y: bottom }]
    : [{ x: x - 0.5, y: top }, { x: x + 0.5, y: top }, { x, y: bottom }];
}

// End points of the edge of a cell that faces `dir`.
export function cellEdge(row, col, dir) {
  const [a, b, c] = cellCorners(row, col);
  if (isUpCell(row, col)) return dir === 300 ? [c, a] : dir === 60 ? [a, b] : [b, c];
  return dir === 0 ? [a, b] : dir === 120 ? [b, c] : [c, a];
}
