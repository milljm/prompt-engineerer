import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isPinnedToBottom, pinToBottom } from "./scroll.ts";

describe("isPinnedToBottom", () => {
  it("is true at the bottom and within slop", () => {
    assert.equal(isPinnedToBottom({ scrollHeight: 400, scrollTop: 280, clientHeight: 120 }), true);
    assert.equal(
      isPinnedToBottom({ scrollHeight: 400, scrollTop: 250, clientHeight: 120 }, 40),
      true,
    );
  });

  it("is false when the user has scrolled up", () => {
    assert.equal(isPinnedToBottom({ scrollHeight: 400, scrollTop: 0, clientHeight: 120 }), false);
    assert.equal(isPinnedToBottom({ scrollHeight: 400, scrollTop: 100, clientHeight: 120 }), false);
  });
});

describe("pinToBottom", () => {
  it("sets scrollTop to scrollHeight", () => {
    const el = { scrollHeight: 880, scrollTop: 12 };
    pinToBottom(el);
    assert.equal(el.scrollTop, 880);
  });
});
