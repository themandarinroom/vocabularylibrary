// Word Bank (Phase A: data interface only). Like the physical vocabulary cards: every field the Library has for
// the puzzle's own words, in Pinyin alphabetical order so the list reveals nothing about board positions.
// No penalty and no tracking for opening it.
export function wordBank(puzzle) {
  return puzzle.words
    .map(word => Object.freeze({ key: word.key, hanzi: word.hanzi, pinyin: word.pinyin, english: word.english, image: word.image || '' }))
    .sort((a, b) => a.pinyin.localeCompare(b.pinyin, 'en') || a.hanzi.localeCompare(b.hanzi, 'zh'));
}
