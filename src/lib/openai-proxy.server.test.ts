import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { proxyErrorResponse, resolveProxyBase, upstreamHeaders } from "./openai-proxy.server.ts";

describe("resolveProxyBase", () => {
  it("refuses to proxy loopback and LAN addresses", async () => {
    await assert.rejects(resolveProxyBase("http://127.0.0.1:8080/v1"), /Local API addresses/);
    await assert.rejects(resolveProxyBase("http://192.168.0.10/v1"), /Local API addresses/);
    await assert.rejects(resolveProxyBase("http://localhost:11434"), /Local API addresses/);
  });
});

describe("proxyErrorResponse", () => {
  it("maps validation errors to 400", async () => {
    const res = proxyErrorResponse(new Error("Enter an OpenAI-compatible API address"));
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /Enter an OpenAI/);
  });

  it("maps unknown failures to 502", async () => {
    const res = proxyErrorResponse(new Error("socket hang up"));
    assert.equal(res.status, 502);
  });
});

describe("upstreamHeaders", () => {
  it("forwards a trimmed API key", () => {
    assert.equal(upstreamHeaders(" abc ").Authorization, "Bearer abc");
  });
});
