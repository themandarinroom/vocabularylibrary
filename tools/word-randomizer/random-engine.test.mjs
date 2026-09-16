import test from "node:test";
import assert from "node:assert/strict";
import { DRAW_MODES, RandomSelectionEngine } from "./random-engine.mjs";

const words = [{ drawKey: "pets::dog", chinese: "狗" }, { drawKey: "pets::cat", chinese: "猫" }, { drawKey: "pets::rabbit", chinese: "兔子" }];

test("no-repeat draws every item exactly once and then completes", () => {
  const engine = new RandomSelectionEngine(words, { random: () => 0, mode: DRAW_MODES.NO_REPEAT });
  const draws = [engine.draw(), engine.draw(), engine.draw()];
  assert.equal(new Set(draws.map((item) => item.drawKey)).size, 3);
  assert.equal(engine.isComplete, true); assert.equal(engine.remainingCount, 0); assert.equal(engine.draw(), null);
});

test("shuffleAgain starts a clean no-repeat round with the same items", () => {
  const engine = new RandomSelectionEngine(words, { random: () => 0 });
  words.forEach(() => engine.draw()); engine.shuffleAgain();
  assert.equal(engine.history.length, 0); assert.equal(engine.remainingCount, words.length); assert.equal(engine.isComplete, false);
});

test("allow-repeats retains the full pool and records repeated history", () => {
  const engine = new RandomSelectionEngine(words, { random: () => 0, mode: DRAW_MODES.ALLOW_REPEATS });
  const first = engine.draw(); const second = engine.draw();
  assert.equal(first.drawKey, second.drawKey); assert.equal(engine.remainingCount, words.length);
  assert.deepEqual(engine.history.map((item) => item.drawKey), ["pets::dog", "pets::dog"]); assert.equal(engine.isComplete, false);
});

test("setMode resets history and round state", () => {
  const engine = new RandomSelectionEngine(words, { random: () => 0 }); engine.draw(); engine.setMode(DRAW_MODES.ALLOW_REPEATS);
  assert.equal(engine.history.length, 0); assert.equal(engine.mode, DRAW_MODES.ALLOW_REPEATS); assert.equal(engine.remainingCount, words.length);
});
