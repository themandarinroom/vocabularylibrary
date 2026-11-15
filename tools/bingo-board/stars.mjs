export const INITIAL_STARS = 5;
export function loseStar(stars) {
  if (!Number.isInteger(stars) || stars < 0 || stars > INITIAL_STARS) throw new Error('Invalid Learning Stars.');
  const remaining = Math.max(0, stars - 1);
  return { stars: remaining, practice: remaining === 0 };
}
