const assert = require("node:assert/strict");
const core = require("../lib/schedule-core.js");

assert.deepEqual(core.DEFAULT_PERIODS, {
  1: ["08:00", "08:45"],
  2: ["08:50", "09:35"],
  3: ["09:50", "10:35"],
  4: ["10:40", "11:25"],
  5: ["11:30", "12:15"],
  6: ["13:00", "13:45"],
  7: ["13:50", "14:35"],
  8: ["14:50", "15:35"],
  9: ["15:40", "16:25"],
  10: ["16:30", "17:15"],
  11: ["18:00", "18:45"],
  12: ["18:50", "19:35"],
  13: ["19:40", "20:25"],
  14: ["20:30", "21:15"]
});

assert.deepEqual(core.parseWeekSpec("1~3,5~18周"), [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
assert.deepEqual(core.parseWeekSpec("1-9周单"), [1, 3, 5, 7, 9]);
assert.deepEqual(core.parseWeekSpec("2~10双周"), [2, 4, 6, 8, 10]);
assert.deepEqual(core.parseWeekSpec("3~5(单),6~12周"), [3, 5, 6, 7, 8, 9, 10, 11, 12]);

const course = core.parseCourseText("数据科学与工程理论基础\n教学班代码：202621152\n(1~3,5~18周) (4-5节) 普陀校区 二附中实验楼 黄定江(20170121)");
assert.equal(course.title, "数据科学与工程理论基础");
assert.equal(course.teachingCode, "202621152");
assert.equal(course.startPeriod, 4);
assert.equal(course.endPeriod, 5);
assert.match(course.location, /普陀校区/);
assert.ok(!course.location.includes("黄定江"));
assert.equal(core.dateFromMonday("2026-09-21", 1, 4), "20260924");
assert.equal(core.dateFromMonday("2026-09-21", 2, 1), "20260928");

course.weekday = 1;
const calendar = core.buildIcs([course], { firstMonday: "2026-09-21", reminderMinutes: 15 });
assert.equal(calendar.eventCount, 17);
assert.match(calendar.content, /DTSTART;TZID=Asia\/Shanghai:20260921T104000/);
assert.match(calendar.content, /DTEND;TZID=Asia\/Shanghai:20260921T121500/);
assert.match(calendar.content, /TRIGGER:-PT15M/);
assert.match(calendar.content, /BEGIN:VTIMEZONE/);
assert.match(calendar.content, /TZID:Asia\/Shanghai/);
assert.match(calendar.content, /X-MICROSOFT-CDO-BUSYSTATUS:BUSY/);
assert.match(calendar.content, /LOCATION:华东师范大学普陀校区 二附中实验楼/);
const unfoldedCalendar = calendar.content.replace(/\r\n /g, "");
assert.match(unfoldedCalendar, /GEO:31\.229186;121\.404683/);
assert.match(unfoldedCalendar, /X-APPLE-STRUCTURED-LOCATION;VALUE=URI;X-ADDRESS="华东师范大学普陀校区 二附中实验楼"/);
assert.match(unfoldedCalendar, /X-TITLE="华东师范大学普陀校区 二附中实验楼":geo:31\.227350,121\.409334/);
assert.match(unfoldedCalendar, /URL:https:\/\/maps\.apple\.com\/\?q=/);
assert.match(unfoldedCalendar, /&ll=31\.227350%2C121\.409334/);
assert.ok(!calendar.content.includes("20261012T104000"), "第 4 周不应生成事件");

const stableOriginal = core.buildIcs([{ ...course, weeks: [1], seriesKey: "api:lesson-1:0" }], { firstMonday: "2026-09-21" });
const stableMoved = core.buildIcs([{
  ...course,
  weeks: [1],
  weekday: 3,
  startPeriod: 8,
  endPeriod: 9,
  seriesKey: "api:lesson-1:0"
}], { firstMonday: "2026-09-21" });
assert.equal(stableOriginal.content.match(/UID:([^\r\n]+)/)[1], stableMoved.content.match(/UID:([^\r\n]+)/)[1], "调课后 UID 应保持稳定");

const locationCases = [
  ["闵行校区 第一教学楼", "华东师范大学闵行校区 第一教学楼"],
  ["普陀校区 教书院", "华东师范大学普陀校区 田家炳教育书院"],
  ["普陀校区 田家炳教育书院", "华东师范大学普陀校区 田家炳教育书院"],
  ["华东师范大学普陀校区 文附楼", "华东师范大学普陀校区 文附楼"],
  ["临港校区 滴水湖国际软件学院", "华东师范大学临港校区 滴水湖国际软件学院"],
  ["上海图书馆", "上海图书馆"]
];
for (const [location, expected] of locationCases) {
  const result = core.buildIcs([{
    ...course,
    weeks: [1],
    location
  }], { firstMonday: "2026-09-21", reminderMinutes: 15 });
  assert.match(result.content, new RegExp(`LOCATION:${expected}`));
}

const minhangCalendar = core.buildIcs([{
  ...course,
  weeks: [1],
  location: "闵行校区 第一教学楼"
}], { firstMonday: "2026-09-21" }).content.replace(/\r\n /g, "");
assert.match(minhangCalendar, /GEO:31\.031821;121\.449914/);
assert.match(minhangCalendar, /geo:31\.029830,121\.454488/);

function eventGeoFor(location) {
  const content = core.buildIcs([{
    ...course,
    weeks: [1],
    location
  }], { firstMonday: "2026-09-21" }).content.replace(/\r\n /g, "");
  return content.match(/GEO:([^\r\n]+)/)?.[1] || "";
}

function eventAppleGeoFor(location) {
  const content = core.buildIcs([{
    ...course,
    weeks: [1],
    location
  }], { firstMonday: "2026-09-21" }).content.replace(/\r\n /g, "");
  const match = content.match(/X-APPLE-STRUCTURED-LOCATION[^\r\n]*:geo:([\d.]+),([\d.]+)/);
  return match ? `${match[1]},${match[2]}` : "";
}

// Apple Maps in mainland China consumes GCJ-02 coordinates. Keep the
// standards-compliant GEO value in WGS 84, but verify the Apple-only field
// against coordinates returned by Amap's official coordinate picker.
assert.equal(eventGeoFor("普陀校区 教书院"), "31.232833;121.401968");
assert.equal(eventAppleGeoFor("普陀校区 教书院"), "31.230999,121.406620");
assert.equal(eventAppleGeoFor("普陀校区 文附楼"), "31.226580,121.408581");
assert.equal(eventAppleGeoFor("普陀校区 小教楼"), "31.226574,121.407391");

assert.notEqual(
  eventAppleGeoFor("普陀校区 小教楼"),
  eventAppleGeoFor("普陀校区 干训楼"),
  "普陀校区不同楼宇不应共用校区中心坐标"
);
assert.equal(eventGeoFor("普陀校区 未收录教学楼"), "");

// Every precise location shipped by the extension is checked against an exact
// POI returned by Amap's official coordinate picker. These are building names
// only; no personal classroom numbers are stored in the table or the test.
const verifiedAmapGeos = [
  ["普陀校区 二附中实验楼", "31.227350,121.409334"],
  ["普陀校区 田家炳教育书院", "31.230999,121.406620"],
  ["普陀校区 干训楼", "31.230136,121.406214"],
  ["普陀校区 文史楼", "31.228777,121.408641"],
  ["普陀校区 文附楼", "31.226580,121.408581"],
  ["普陀校区 小教楼", "31.226574,121.407391"],
  ["普陀校区 科学会堂", "31.226774,121.406615"],
  ["普陀校区 文科大楼", "31.226903,121.408200"],
  ["普陀校区 软件学院", "31.226434,121.405412"],
  ["普陀校区 计算机楼", "31.226112,121.405118"],
  ["普陀校区 理科大楼", "31.227623,121.403497"],
  ["普陀校区 中学校长培训中心", "31.226290,121.406797"],
  ["普陀校区 图书馆", "31.228318,121.406582"],
  ["普陀校区 体育馆", "31.227350,121.409334"],
  ["普陀校区 教师教育学院", "31.229489,121.406644"],
  ["普陀校区 地理馆", "31.226591,121.403859"],
  ["普陀校区 大学生活动中心", "31.229936,121.405295"],
  ["普陀校区 办公楼", "31.227715,121.406809"],
  ["普陀校区 思群堂", "31.228307,121.408283"],
  ["普陀校区 逸夫楼", "31.226330,121.406811"],
  ["闵行校区 第一教学楼", "31.029830,121.454488"],
  ["闵行校区 第二教学楼", "31.030898,121.454659"],
  ["闵行校区 第三教学楼", "31.028924,121.450612"],
  ["闵行校区 第四教学楼", "31.029538,121.450449"],
  ["闵行校区 实验A楼", "31.032751,121.453067"],
  ["闵行校区 实验B楼", "31.033163,121.452216"],
  ["闵行校区 实验C楼", "31.033402,121.451403"],
  ["闵行校区 实验D楼", "31.033376,121.450307"],
  ["闵行校区 图书馆", "31.029628,121.452455"],
  ["闵行校区 外语楼", "31.027334,121.455329"],
  ["闵行校区 资环楼", "31.031943,121.450828"],
  ["闵行校区 生物实验站", "31.034426,121.452321"],
  ["闵行校区 生命科学学院", "31.031365,121.450228"],
  ["闵行校区 化学楼", "31.030685,121.450099"],
  ["闵行校区 物理楼", "31.026340,121.451571"],
  ["闵行校区 数学楼", "31.028123,121.451214"],
  ["闵行校区 金融与统计学院", "31.027922,121.454822"],
  ["闵行校区 统计楼", "31.027790,121.451575"],
  ["闵行校区 信息技术楼", "31.026914,121.451320"],
  ["闵行校区 艺术学院", "31.032108,121.453423"],
  ["闵行校区 传播学院", "31.031775,121.453823"],
  ["闵行校区 艺术传播楼", "31.031787,121.453374"],
  ["闵行校区 办公楼", "31.026270,121.455615"],
  ["闵行校区 学生活动中心", "31.033473,121.454517"],
  ["闵行校区 校医院", "31.033639,121.449625"],
  ["闵行校区 河口海岸大楼A楼", "31.025134,121.451198"],
  ["闵行校区 河口海岸大楼B楼", "31.025134,121.451198"],
  ["闵行校区 河口海岸大楼", "31.025134,121.451198"],
  ["闵行校区 人文大楼", "31.028796,121.454556"],
  ["闵行校区 法商北楼", "31.027965,121.455016"],
  ["临港校区 滴水湖国际软件学院", "30.900120,121.923109"],
  ["临港校区 临港软件园", "30.901236,121.926067"]
];
for (const [location, expectedGeo] of verifiedAmapGeos) {
  assert.equal(eventAppleGeoFor(location), expectedGeo, `${location} 应使用高德核验坐标`);
  assert.notEqual(eventGeoFor(location), "", `${location} 应同时生成标准 WGS 84 GEO`);
}
assert.equal(eventGeoFor("闵行校区 未收录教学楼"), "");
assert.equal(eventGeoFor("临港校区 未收录建筑"), "");
assert.equal(eventAppleGeoFor("普陀校区"), "31.227938,121.404680");
assert.equal(eventAppleGeoFor("闵行校区"), "31.031449,121.453720");
assert.equal(eventAppleGeoFor("临港校区"), "30.871973,121.916241");

for (const location of [
  "普陀校区 外语学院",
  "普陀校区 河口海岸大楼",
  "闵行校区 图文信息大楼",
  "闵行校区 数统楼",
  "闵行校区 理科实验大楼",
  "闵行校区 综合实验大楼"
]) {
  assert.equal(eventGeoFor(location), "", `${location} 没有可靠高德 POI 时不应猜测坐标`);
}

const unknownBuildingCalendar = core.buildIcs([{
  ...course,
  weeks: [1],
  location: "闵行校区 未收录教学楼"
}], { firstMonday: "2026-09-21" }).content.replace(/\r\n /g, "");
assert.doesNotMatch(unknownBuildingCalendar, /GEO:/);
assert.doesNotMatch(unknownBuildingCalendar, /X-APPLE-STRUCTURED-LOCATION/);
assert.match(unknownBuildingCalendar, /URL:https:\/\/maps\.apple\.com\/\?q=/);

const externalCalendar = core.buildIcs([{
  ...course,
  weeks: [1],
  location: "上海图书馆"
}], { firstMonday: "2026-09-21" }).content.replace(/\r\n /g, "");
assert.doesNotMatch(externalCalendar, /X-APPLE-STRUCTURED-LOCATION/);
assert.match(externalCalendar, /URL:https:\/\/maps\.apple\.com\/\?q=/);

const apiResult = core.parseApiTimetable({
  currentWeek: 2,
  weekIndices: [1, 2, 3, 4, 5, 6],
  lessons: [{
    id: 893117,
    code: "202620333",
    nameZh: "教育原理-2026秋",
    course: { nameZh: "教育原理" },
    semester: { startDate: "2026-09-14" },
    scheduleText: { dateTimePlaceText: { textZh: "3~5(单),6~12周 星期一 6~8节 普陀校区 文附楼; \n4周 星期六 6~8节 普陀校区 文附楼" } }
  }]
});
assert.equal(apiResult.source, "api");
assert.equal(apiResult.firstMonday, "2026-09-14");
assert.equal(apiResult.currentWeek, 2);
assert.equal(apiResult.courses.length, 2);
assert.deepEqual(apiResult.courses[0].weeks, [3, 5, 6, 7, 8, 9, 10, 11, 12]);
assert.equal(apiResult.courses[1].weekday, 6);
assert.equal(apiResult.courses[1].location, "普陀校区 文附楼");
assert.equal(apiResult.courses[0].seriesKey, "api:893117:0");
assert.equal(apiResult.courses[1].seriesKey, "api:893117:1");

console.log("schedule-core tests passed");
