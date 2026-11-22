# Build the Great Wall 听词筑长城 — v0.1 (Solo)

A listening game for Prep–Year 6. Hear a Chinese word, choose the answer, earn a stone and build a section of the
Great Wall. Ten stones complete the wall and open one of five mystery-box videos. No sign-in, nothing saved or uploaded.

- **Entry:** `tools/great-wall/` (optional `?set=<published set id>&level=easy|medium|challenge`).
- **Vocabulary:** published Vocabulary Library sets, read anonymously through `../listening-core/` (a byte-identical
  copy of Bingo Solo's Production-locked data layer). Look-alike Chinese entries are asked once.
- **Levels:** Easy 2, Medium 3, Challenge 4 choices; a level needs that many different words.
- **Audio:** Teacher Voice first, AI Voice as fallback (Bingo Solo's iPad-tested order and timing). The next word's
  recording is looked up in advance so it can start inside the student's tap.
- **Answers:** pictures when the target and its distractors all have their own picture; otherwise Chinese characters.
  No Pinyin during questions.
- **Wall:** fixed layout in `wall.mjs`; a stone can only go where every stone beneath it is already built.
- **Rewards:** `rewards.mjs` + `media/` (see `media/CREDITS.md`); placeholders until licensed clips are added.

`../listening-core/` (`rounds.mjs`, `vocabulary.mjs`, `audio-player.mjs`, `library.mjs`) has no Great Wall rules and is
meant for future listening games (Picture Puzzle, Mandarin Maze).

Tests: `node --test tests/*.test.mjs` (from the repository root).
