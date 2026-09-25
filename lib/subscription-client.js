(function (root, factory) {
  const api = factory(root.crypto);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.SubscriptionClient = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (cryptoApi) {
  "use strict";

  const TOKEN_BYTES = 32;

  function normalizeBaseUrl(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function bytesToBase64Url(bytes) {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const encoded = typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(bytes).toString("base64");
    return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function generateToken() {
    if (!cryptoApi?.getRandomValues) throw new Error("当前环境无法生成安全随机令牌");
    return bytesToBase64Url(cryptoApi.getRandomValues(new Uint8Array(TOKEN_BYTES)));
  }

  async function sha256(value) {
    if (!cryptoApi?.subtle) throw new Error("当前环境不支持安全哈希");
    const digest = await cryptoApi.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function canonicalCalendarContent(ics) {
    return String(ics || "")
      .replace(/^DTSTAMP:[^\r\n]*$/gm, "DTSTAMP:")
      .replace(/^LAST-MODIFIED:[^\r\n]*$/gm, "LAST-MODIFIED:");
  }

  async function fingerprintCalendar(ics) {
    return sha256(canonicalCalendarContent(ics));
  }

  async function parseResponse(response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `订阅服务返回 HTTP ${response.status}`);
    return data;
  }

  async function createFeed(baseUrl, ics, expiresAt, fetchImpl) {
    const serviceBaseUrl = normalizeBaseUrl(baseUrl);
    const readToken = generateToken();
    const updateToken = generateToken();
    const request = fetchImpl || fetch;
    const response = await request(`${serviceBaseUrl}/v1/feeds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readToken, updateToken, expiresAt, ics })
    });
    const data = await parseResponse(response);
    return {
      serviceBaseUrl,
      readToken,
      updateToken,
      readUrl: data.readUrl || `${serviceBaseUrl}/v1/feeds/${readToken}.ics`,
      expiresAt: data.expiresAt || expiresAt,
      updatedAt: data.updatedAt || new Date().toISOString(),
      contentHash: await fingerprintCalendar(ics)
    };
  }

  async function updateFeed(state, ics, fetchImpl) {
    const request = fetchImpl || fetch;
    const response = await request(`${normalizeBaseUrl(state.serviceBaseUrl)}/v1/feeds/${encodeURIComponent(state.readToken)}`, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${state.updateToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ ics })
    });
    const data = await parseResponse(response);
    return Object.assign({}, state, {
      updatedAt: data.updatedAt || new Date().toISOString(),
      contentHash: await fingerprintCalendar(ics)
    });
  }

  async function deleteFeed(state, fetchImpl) {
    const request = fetchImpl || fetch;
    const response = await request(`${normalizeBaseUrl(state.serviceBaseUrl)}/v1/feeds/${encodeURIComponent(state.readToken)}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${state.updateToken}` }
    });
    return parseResponse(response);
  }

  return { TOKEN_BYTES, normalizeBaseUrl, generateToken, sha256, fingerprintCalendar, createFeed, updateFeed, deleteFeed };
});
