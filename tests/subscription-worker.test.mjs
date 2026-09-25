import assert from "node:assert/strict";
import { handleRequest } from "../worker/src/index.mjs";

class FakeKv {
  constructor() { this.values = new Map(); }
  async get(key, type) {
    const value = this.values.get(key) ?? null;
    return value && type === "json" ? JSON.parse(value) : value;
  }
  async put(key, value) { this.values.set(key, value); }
  async delete(key) { this.values.delete(key); }
}

const env = { CALENDAR_FEEDS: new FakeKv(), PUBLIC_BASE_URL: "https://calendar.example.com" };
const readToken = "a".repeat(43);
const updateToken = "b".repeat(43);
const extensionOrigin = `chrome-extension://${"a".repeat(32)}`;
const ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n";
const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

let response = await handleRequest(new Request("https://calendar.example.com/v1/feeds", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Origin": extensionOrigin },
  body: JSON.stringify({ readToken, updateToken, expiresAt, ics })
}), env);
assert.equal(response.status, 201);
assert.equal(response.headers.get("Access-Control-Allow-Origin"), extensionOrigin);
const created = await response.json();
assert.equal(created.readUrl, `https://calendar.example.com/v1/feeds/${readToken}.ics`);
const stored = [...env.CALENDAR_FEEDS.values.values()][0];
assert.ok(!stored.includes(readToken));
assert.ok(!stored.includes(updateToken));
assert.ok(!stored.includes("SESSION"));

response = await handleRequest(new Request("https://calendar.example.com/v1/feeds", {
  method: "OPTIONS",
  headers: { "Origin": "https://attacker.example" }
}), env);
assert.equal(response.status, 204);
assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);

response = await handleRequest(new Request(created.readUrl), env);
assert.equal(response.status, 200);
assert.equal(response.headers.get("Content-Type"), "text/calendar; charset=utf-8");
assert.equal(await response.text(), ics);

const changedIcs = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-CALNAME:新课表\r\nEND:VCALENDAR\r\n";
response = await handleRequest(new Request(`https://calendar.example.com/v1/feeds/${readToken}`, {
  method: "PUT",
  headers: { "Authorization": `Bearer ${updateToken}`, "Content-Type": "application/json" },
  body: JSON.stringify({ ics: changedIcs })
}), env);
assert.equal(response.status, 200);

response = await handleRequest(new Request(`https://calendar.example.com/v1/feeds/${readToken}`, {
  method: "DELETE",
  headers: { "Authorization": `Bearer ${updateToken}` }
}), env);
assert.equal(response.status, 200);
response = await handleRequest(new Request(created.readUrl), env);
assert.equal(response.status, 404);

console.log("subscription-worker tests passed");
