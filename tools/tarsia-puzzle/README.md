# Tarsia Puzzle — Phase A engine (Vocabulary Games)

Development only. Not linked from the website; no student page yet.

- `engine/`: a pure, DOM-free and seedable engine. The UI imports only `engine/index.mjs`.
  - `geometry.mjs`: the triangular lattice, edge directions and the six rotation states.
  - `templates.mjs`: shapes, defined as cell lists. Shared and boundary edges and the required word count are derived from them and validated.
  - `modes.mjs`: the five matching modes, the two levels and the learning intentions.
  - `generate.mjs`: builds and checks the solved puzzle, then picks the locked starting pieces and shuffles and rotates the rest.
  - `state.mjs`: rotate, place, move, remove and reset. These functions never modify the state they are given.
  - `validate.mjs`: edge matching and completion, decided by the rules, not by piece IDs.
  - `word-bank.mjs` and `completion.mjs`: the Word Bank data and the Evidence of Learning record.
- `../vocabulary-games-core/`: the published-vocabulary adapter (eligibility, merging sets, ambiguity checks). Its `shared/` folder is a byte-identical copy of the Production-locked data layer that Listening Core and Bingo Solo use.
- `../learning-record/`: the shared, game-agnostic completion-record contract. The PNG export interface is documented there and will be built in Phase B.
- `dev/`: the developer prototype (SVG, fixture vocabulary, optional read-only published vocabulary).

- `gesture.mjs`: tells a tap from a drag without using the DOM. Touch gets a 12 px allowance and a mouse 6 px. A tap must be released within 450 ms. Moving away and back counts as a drag, a long press does nothing, and a second finger cancels the press.

Rotation (approved): a tap turns a piece 60° in the tray, or 120° on the board so that it stays in its slot. A piece dropped onto a slot while pointing the wrong way is turned 60° clockwise and snapped in. That turn depends only on the piece's orientation and the slot's shape: the placement functions never see the vocabulary, so they cannot pick the matching orientation. Locked starting pieces cannot be moved or turned.

Tests: run `node --test tests/*.test.mjs` from the repository root (`tests/tarsia-engine.test.mjs`).
Prototype: serve the repository root and open `/tools/tarsia-puzzle/dev/` (for example `?level=master&mode=hanzi-english&seed=7`).

- `dev/report.html`: Phase B1 validation of real published vocabulary. It reads through the shared loader (read-only) and runs every set combination × mode with seeded generation. It also probes picture sizes and CORS. Options: `?titles=Countries I,Countries II,Countries III&seeds=500`.
- Prototype with published data: `dev/?source=published&sets=<id>,<id>&level=…&mode=…&seed=…`. Add `&panel=hide` to give the board the full width.

- **Student Setup (Phase B2):** `index.html`, `app.mjs`, `bootstrap.mjs` and `styles.css`. The styles are copied from Build the Great Wall, not imported. The setup rules live in `setup-model.mjs`, which uses no DOM and is tested. Shareable state: `?set=<id>,<id>&level=beginner|master&mode=<mode>`. Until the Phase B3 game screen exists, Start opens the engine prototype (`dev/`) with the chosen settings.

- **Revised v0.1 (B3.2):** students choose vocabulary, shape and matching mode independently.
  - Shapes (`STUDENT_TEMPLATES`): Small Triangle 4/3, Hexagon 6/6, Triangle 9/9, Extended Hexagon 10/11 (pieces/pairs). Locked starting pieces: none / 1 / 1 / 2. The 18-pair Large Triangle is kept in the engine but not offered.
  - `createStudentPuzzle` accepts any offered shape with any mode.
  - Workspace (`workspace.mjs`): labels are printed on the pieces (side A baseline towards its edge, side B top towards it) and turn with them. There is no upright correction; only the Word Bank is upright.
  - Measured label layout (`label-layout.mjs`): minimum 18 px Hanzi and 14 px Pinyin/English, nothing truncated.
  - Compact 68 px gameplay header. Drag & Drop by default, with an optional Tap-to-place mode (tap selects; the Turn button rotates).
  - `dev/sweep.mjs` measures every shape at the current viewport.

## Keyboard (Phase D1)

The whole puzzle can be finished with the keyboard alone, in Drag or Tap mode. Starting pieces are fixed, so they are not tab stops.

| Key | Where | What it does |
|---|---|---|
| Tab / Shift+Tab | anywhere | Moves between the controls, then each piece (tray first, then pieces on the board) |
| Enter or Space | a piece | Selects it. Focus moves to a space on the board, shown by a blue outline |
| ← ↑ → ↓ | a space | Moves to the nearest space in that direction. Stops at the edge of the board |
| Enter or Space | a space | Places the selected piece there. A wrong-way drop turns it automatically, based on geometry only |
| R | a piece, or a space while a piece is selected | Turns the piece: 60° in the tray, 120° on the board |
| Delete or Backspace | a piece on the board | Puts it back in the tray |
| Escape | while a piece is selected | Cancels the selection |
| Escape | completion panel | Closes the panel. **Learning record** reopens it |

- **Visual hint:** the hint line at the top of the tray appears only while keyboard focus is in the puzzle, and never covers the board.
- **Screen readers:**
  - every piece is read with all its labels, and pictures by their English meaning;
  - every space is read as "Space i of n, empty / has a piece";
  - after a placement the page says "Placed. X of N matches" (polite live region).
- **Completion panel:** while it is open it is modal, so everything behind it is inert.
- **Developer checks:**
  - `dev/keyboard-through.mjs` finishes a puzzle using only key events;
  - `dev/sweep.mjs` measures board, label and picture sizes.
