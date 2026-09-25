const assert = require("node:assert/strict");
const core = require("../lib/schedule-core.js");
const payloads = require("../lib/mobile-payload.js");

const courses = [{
  title: "数据科学与工程理论基础",
  teachingCode: "202621152",
  weekSpec: "1~3,5~18周",
  weeks: core.parseWeekSpec("1~3,5~18周"),
  weekday: 1,
  startPeriod: 4,
  endPeriod: 5,
  location: "普陀校区 二附中实验楼"
}, {
  title: "机器学习",
  teachingCode: "202621165",
  weekSpec: "1~18周",
  weeks: core.parseWeekSpec("1~18周"),
  weekday: 4,
  startPeriod: 8,
  endPeriod: 9,
  location: "普陀校区 教书院"
}];

const payload = payloads.fromCourses(courses, {
  firstMonday: "2026-09-14",
  reminderMinutes: 15,
  calendarName: "华师大课表",
  periodTimes: core.DEFAULT_PERIODS
});
const encoded = payloads.encode(payload);
const decoded = payloads.decode(encoded);
const restored = payloads.toCourses(decoded, core.parseWeekSpec);

assert.equal(decoded.m, "2026-09-14");
assert.equal(decoded.r, 15);
assert.equal(decoded.n, "华师大课表");
assert.equal(restored.length, 2);
assert.deepEqual(restored[0].weeks, courses[0].weeks);
assert.equal(restored[1].location, courses[1].location);
assert.equal(decoded.v, 2);
assert.deepEqual(payloads.toPeriodTimes(decoded, {}), core.DEFAULT_PERIODS);
assert.ok(encoded.length < 2800, "QR payload must stay within a practical QR capacity");
assert.match(payloads.makeUrl("https://example.com/mobile/", payload), /^https:\/\/example\.com\/mobile\/#d=/);

const calendar = core.buildIcs(restored, {
  firstMonday: decoded.m,
  reminderMinutes: decoded.r,
  calendarName: decoded.n
});
assert.equal(calendar.eventCount, 35);
assert.match(calendar.content, /TRIGGER:-PT15M/);

const legacyPayload = {
  v: 1,
  m: "2026-09-14",
  r: 15,
  n: "华师大课表",
  c: [["机器学习", "202621165", "1~18周", 4, 8, 9, "普陀校区 教书院"]]
};
const legacyDecoded = payloads.decode(payloads.encode(legacyPayload));
assert.equal(legacyDecoded.v, 1);
assert.deepEqual(payloads.toPeriodTimes(legacyDecoded, core.DEFAULT_PERIODS), core.DEFAULT_PERIODS);

console.log("mobile payload tests passed");
