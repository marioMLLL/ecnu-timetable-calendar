(function (root, factory) {
  const api = factory(
    typeof module === "object" && module.exports ? require("lz-string") : root.LZString
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MobilePayload = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (LZString) {
  "use strict";

  const VERSION = 2;
  const SUPPORTED_VERSIONS = new Set([1, VERSION]);

  function validatePayload(payload) {
    if (!payload || !SUPPORTED_VERSIONS.has(payload.v) || !Array.isArray(payload.c)) {
      throw new Error("二维码中的课表格式不受支持");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.m || "")) {
      throw new Error("二维码中缺少有效的第 1 周周一日期");
    }
    if (!payload.c.length || payload.c.length > 100) {
      throw new Error("二维码中的课程数量异常");
    }
    return payload;
  }

  function fromCourses(courses, settings) {
    const options = settings || {};
    return validatePayload({
      v: VERSION,
      m: String(options.firstMonday || ""),
      r: Math.max(0, Math.min(1440, Number(options.reminderMinutes) || 0)),
      n: String(options.calendarName || "华师大课表").slice(0, 40),
      c: courses.map((course) => [
        String(course.title || "未命名课程"),
        String(course.teachingCode || ""),
        String(course.weekSpec || ""),
        Number(course.weekday),
        Number(course.startPeriod),
        Number(course.endPeriod),
        String(course.location || ""),
        String(course.seriesKey || "")
      ]),
      p: Array.from({ length: 14 }, (_, index) => {
        const times = options.periodTimes?.[index + 1];
        return Array.isArray(times) ? [String(times[0] || ""), String(times[1] || "")] : null;
      })
    });
  }

  function encode(payload) {
    if (!LZString) throw new Error("课表压缩组件未加载");
    return LZString.compressToEncodedURIComponent(JSON.stringify(validatePayload(payload)));
  }

  function decode(encoded) {
    if (!LZString) throw new Error("课表解压组件未加载");
    const json = LZString.decompressFromEncodedURIComponent(String(encoded || ""));
    if (!json) throw new Error("二维码中的课表数据无效或不完整");
    try {
      return validatePayload(JSON.parse(json));
    } catch (error) {
      if (error.message?.includes("二维码")) throw error;
      throw new Error("二维码中的课表数据无法解析");
    }
  }

  function toCourses(payload, parseWeekSpec) {
    return validatePayload(payload).c.map((item) => {
      if (!Array.isArray(item) || item.length < 7) throw new Error("二维码中的课程记录不完整");
      return {
        title: String(item[0] || "未命名课程"),
        teachingCode: String(item[1] || ""),
        weekSpec: String(item[2] || ""),
        weeks: parseWeekSpec(String(item[2] || "")),
        weekday: Number(item[3]),
        startPeriod: Number(item[4]),
        endPeriod: Number(item[5]),
        location: String(item[6] || ""),
        seriesKey: String(item[7] || "")
      };
    });
  }

  function toPeriodTimes(payload, defaultPeriods) {
    validatePayload(payload);
    const result = Object.assign({}, defaultPeriods || {});
    if (payload.v < 2 || !Array.isArray(payload.p)) return result;
    payload.p.slice(0, 14).forEach((times, index) => {
      if (!Array.isArray(times) || !/^\d{2}:\d{2}$/.test(times[0] || "") || !/^\d{2}:\d{2}$/.test(times[1] || "")) return;
      result[index + 1] = [times[0], times[1]];
    });
    return result;
  }

  function makeUrl(baseUrl, payload) {
    return `${String(baseUrl).replace(/#.*$/, "")}#d=${encode(payload)}`;
  }

  return { VERSION, validatePayload, fromCourses, encode, decode, toCourses, toPeriodTimes, makeUrl };
});
