import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PRIVATE_HOST_CODE,
  PrivateHostError,
  apiUrlIsSelf,
  isBrowserDirectUrl,
  isLoopbackHost,
  isPrivateHostError,
  isPrivateOrLocalHost,
  normalizeApiBase,
  openaiHeaders,
  parseApiUrl,
} from "./openai-url.ts";

describe("parseApiUrl", () => {
  it("rejects an empty address", () => {
    assert.throws(() => parseApiUrl("  "), /Enter an OpenAI-compatible/);
  });

  it("assumes http when the protocol is omitted", () => {
    const url = parseApiUrl("127.0.0.1:1234/v1");
    assert.equal(url.protocol, "http:");
    assert.equal(url.hostname, "127.0.0.1");
    assert.equal(url.port, "1234");
  });

  it("rejects non-http schemes", () => {
    assert.throws(() => parseApiUrl("ftp://example.com/v1"), /must be http/);
  });
});

describe("normalizeApiBase", () => {
  it("appends /v1 when missing", () => {
    assert.equal(normalizeApiBase("https://api.openai.com"), "https://api.openai.com/v1");
  });

  it("does not double /v1", () => {
    assert.equal(normalizeApiBase("https://api.openai.com/v1/"), "https://api.openai.com/v1");
  });

  it("keeps an existing /api/v1 prefix", () => {
    assert.equal(normalizeApiBase("https://openrouter.ai/api/v1"), "https://openrouter.ai/api/v1");
  });

  it("strips accidental chat/completions or models suffixes", () => {
    assert.equal(
      normalizeApiBase("https://api.openai.com/v1/chat/completions"),
      "https://api.openai.com/v1",
    );
    assert.equal(normalizeApiBase("http://127.0.0.1:8080/v1/models"), "http://127.0.0.1:8080/v1");
  });
});

describe("host classification", () => {
  it("treats loopback aliases as local", () => {
    assert.equal(isLoopbackHost("localhost"), true);
    assert.equal(isLoopbackHost("127.0.0.1"), true);
    assert.equal(isLoopbackHost("[::1]"), true);
    assert.equal(isLoopbackHost("host.docker.internal"), true);
    assert.equal(isLoopbackHost("api.openai.com"), false);
  });

  it("treats RFC1918, link-local, and CGNAT as private", () => {
    assert.equal(isPrivateOrLocalHost("10.0.0.8"), true);
    assert.equal(isPrivateOrLocalHost("192.168.1.20"), true);
    assert.equal(isPrivateOrLocalHost("172.16.0.2"), true);
    assert.equal(isPrivateOrLocalHost("172.31.255.1"), true);
    assert.equal(isPrivateOrLocalHost("169.254.1.1"), true);
    assert.equal(isPrivateOrLocalHost("100.64.0.1"), true);
    assert.equal(isPrivateOrLocalHost("edge.local"), true);
    assert.equal(isPrivateOrLocalHost("macstudio"), true);
    assert.equal(isPrivateOrLocalHost("edge.lan"), true);
    assert.equal(isPrivateOrLocalHost("box.tail1234.ts.net"), true);
    assert.equal(isPrivateOrLocalHost("::ffff:192.168.1.9"), true);
    assert.equal(isPrivateOrLocalHost("api.openai.com"), false);
    assert.equal(isPrivateOrLocalHost("8.8.8.8"), false);
    assert.equal(isPrivateOrLocalHost("172.32.0.1"), false);
  });

  it("routes LAN URLs to the browser and public URLs to the proxy", () => {
    assert.equal(isBrowserDirectUrl("http://127.0.0.1:8080/v1"), true);
    assert.equal(isBrowserDirectUrl("http://192.168.1.50:11434/v1"), true);
    assert.equal(isBrowserDirectUrl("http://macstudio:8080/v1"), true);
    assert.equal(isBrowserDirectUrl("http://edge.lan:1234/v1"), true);
    assert.equal(isBrowserDirectUrl("https://api.x.ai/v1"), false);
    assert.equal(isBrowserDirectUrl("not a url"), false);
  });

  it("does not treat this process as the API when window is missing", () => {
    assert.equal(apiUrlIsSelf("http://127.0.0.1:8080"), false);
  });
});

describe("isPrivateHostError", () => {
  it("matches the proxy code and the legacy message", () => {
    assert.equal(isPrivateHostError(new PrivateHostError()), true);
    assert.equal(isPrivateHostError({ code: PRIVATE_HOST_CODE, message: "nope" }), true);
    assert.equal(
      isPrivateHostError(new Error("That host resolves to a private address and cannot be proxied.")),
      true,
    );
    assert.equal(isPrivateHostError(new Error("Unauthorized")), false);
  });
});

describe("openaiHeaders", () => {
  it("omits Authorization when the key is blank", () => {
    assert.deepEqual(openaiHeaders(""), { "Content-Type": "application/json" });
    assert.deepEqual(openaiHeaders("  "), { "Content-Type": "application/json" });
    assert.deepEqual(openaiHeaders(), { "Content-Type": "application/json" });
  });

  it("sends a bearer token when a key is present", () => {
    assert.equal(openaiHeaders(" sk-test ").Authorization, "Bearer sk-test");
  });
});
