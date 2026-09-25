const assert = require("node:assert/strict");
const client = require("../lib/subscription-client.js");

assert.equal(client.TOKEN_BYTES, 32);
const first = client.generateToken();
const second = client.generateToken();
assert.match(first, /^[A-Za-z0-9_-]{43}$/);
assert.notEqual(first, second);

const ics = "BEGIN:VCALENDAR\r\nDTSTAMP:20260922T010000Z\r\nEND:VCALENDAR\r\n";
const sameCalendar = "BEGIN:VCALENDAR\r\nDTSTAMP:20260922T020000Z\r\nEND:VCALENDAR\r\n";

(async () => {
  assert.equal(await client.fingerprintCalendar(ics), await client.fingerprintCalendar(sameCalendar));
  let createBody;
  const created = await client.createFeed("https://calendar.example.com/", ics, "2027-01-01T00:00:00.000Z", async (_url, options) => {
    createBody = JSON.parse(options.body);
    return new Response(JSON.stringify({
      readUrl: `https://calendar.example.com/v1/feeds/${createBody.readToken}.ics`,
      expiresAt: "2027-01-01T00:00:00.000Z",
      updatedAt: "2026-09-22T00:00:00.000Z"
    }), { status: 201, headers: { "Content-Type": "application/json" } });
  });
  assert.notEqual(createBody.readToken, createBody.updateToken);
  assert.equal(Buffer.from(createBody.readToken.replace(/-/g, "+").replace(/_/g, "/"), "base64").length, 32);
  assert.equal(created.serviceBaseUrl, "https://calendar.example.com");
  assert.match(created.readUrl, /\.ics$/);
  assert.ok(created.contentHash);
  console.log("subscription-client tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
