export const DRAW_MODES = Object.freeze({
  NO_REPEAT: "no-repeat",
  ALLOW_REPEATS: "allow-repeats"
});

function cloneItems(items) {
  if (!Array.isArray(items)) throw new TypeError("items must be an array");
  return items.map((item) => ({ ...item }));
}

export class RandomSelectionEngine {
  #items = [];
  #remaining = [];
  #history = [];
  #mode;
  #random;

  constructor(items = [], { mode = DRAW_MODES.NO_REPEAT, random = Math.random } = {}) {
    if (!Object.values(DRAW_MODES).includes(mode)) throw new TypeError("Unknown draw mode");
    if (typeof random !== "function") throw new TypeError("random must be a function");
    this.#mode = mode;
    this.#random = random;
    this.setItems(items);
  }

  get mode() { return this.#mode; }
  get size() { return this.#items.length; }
  get remainingCount() { return this.#mode === DRAW_MODES.NO_REPEAT ? this.#remaining.length : this.#items.length; }
  get isComplete() { return this.#mode === DRAW_MODES.NO_REPEAT && this.#items.length > 0 && this.#remaining.length === 0; }
  get history() { return [...this.#history]; }

  setItems(items) {
    this.#items = cloneItems(items);
    this.reset();
  }

  setMode(mode) {
    if (!Object.values(DRAW_MODES).includes(mode)) throw new TypeError("Unknown draw mode");
    this.#mode = mode;
    this.reset();
  }

  draw() {
    const source = this.#mode === DRAW_MODES.NO_REPEAT ? this.#remaining : this.#items;
    if (!source.length) return null;
    const index = Math.min(source.length - 1, Math.floor(this.#random() * source.length));
    const item = this.#mode === DRAW_MODES.NO_REPEAT ? source.splice(index, 1)[0] : source[index];
    this.#history.push(item);
    return item;
  }

  reset() {
    this.#remaining = [...this.#items];
    this.#history = [];
  }

  shuffleAgain() { this.reset(); }
}
