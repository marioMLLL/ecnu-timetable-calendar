(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ScheduleCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_PERIODS = {
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
  };

  function amapPoint(latitude, longitude, radius) {
    return { amapLatitude: latitude, amapLongitude: longitude, radius };
  }

  function amapBuilding(pattern, latitude, longitude, radius) {
    return { pattern, ...amapPoint(latitude, longitude, radius) };
  }

  // Coordinates below were selected from exact POIs in Amap's official
  // coordinate picker on 2026-09-26. Amap returns GCJ-02; geoForLocation()
  // converts each point to WGS 84 for the standard ICS GEO property while the
  // Apple-specific field and Apple Maps URL keep the mainland-China GCJ-02
  // coordinate. Unknown or ambiguous POIs are deliberately omitted.
  const CAMPUS_GEO = {
    putuo: amapPoint("31.227938", "121.404680", 500),
    minhang: amapPoint("31.031449", "121.453720", 800),
    // Amap currently labels this POI as “华东师范大学临港校区(建设中)”.
    lingang: amapPoint("30.871973", "121.916241", 1500)
  };

  // Patterns deliberately stop at the building name: classroom numbers are
  // never stored in this table.
  const BUILDING_GEO = {
    putuo: [
      amapBuilding(/二附中实验楼/, "31.227350", "121.409334", 40),
      amapBuilding(/田家炳(?:教育书院|楼)/, "31.230999", "121.406620", 40),
      amapBuilding(/干训楼/, "31.230136", "121.406214", 40),
      amapBuilding(/文史楼/, "31.228777", "121.408641", 40),
      amapBuilding(/文附楼/, "31.226580", "121.408581", 40),
      amapBuilding(/小教楼/, "31.226574", "121.407391", 40),
      amapBuilding(/科学会堂/, "31.226774", "121.406615", 40),
      amapBuilding(/文科大楼/, "31.226903", "121.408200", 40),
      amapBuilding(/软件学院/, "31.226434", "121.405412", 40),
      amapBuilding(/计算机楼/, "31.226112", "121.405118", 40),
      amapBuilding(/理科大楼/, "31.227623", "121.403497", 40),
      amapBuilding(/(?:教育部)?中学校长培训中心/, "31.226290", "121.406797", 40),
      amapBuilding(/图书馆/, "31.228318", "121.406582", 45),
      amapBuilding(/体育馆/, "31.227350", "121.409334", 45),
      amapBuilding(/教师教育学院/, "31.229489", "121.406644", 40),
      amapBuilding(/地理馆/, "31.226591", "121.403859", 45),
      amapBuilding(/大学生活动中心/, "31.229936", "121.405295", 40),
      amapBuilding(/办公楼/, "31.227715", "121.406809", 40),
      amapBuilding(/(?:大礼堂|思群堂)/, "31.228307", "121.408283", 45),
      amapBuilding(/逸夫楼/, "31.226330", "121.406811", 40)
    ],
    minhang: [
      amapBuilding(/(?:第一教学楼|一教楼?)/, "31.029830", "121.454488", 45),
      amapBuilding(/(?:第二教学楼|二教楼?)/, "31.030898", "121.454659", 45),
      amapBuilding(/(?:第三教学楼|三教楼?)/, "31.028924", "121.450612", 45),
      amapBuilding(/(?:第四教学楼|四教楼?)/, "31.029538", "121.450449", 45),
      amapBuilding(/(?:实验A楼|实验楼A座|实验A座)/, "31.032751", "121.453067", 45),
      amapBuilding(/(?:实验B楼|实验楼B座|实验B座)/, "31.033163", "121.452216", 45),
      amapBuilding(/(?:实验C楼|实验楼C座|实验C座)/, "31.033402", "121.451403", 45),
      amapBuilding(/(?:实验D楼|实验楼D座|实验D座)/, "31.033376", "121.450307", 45),
      amapBuilding(/图书馆主楼|图书馆/, "31.029628", "121.452455", 70),
      amapBuilding(/(?:外语学院|外语楼)/, "31.027334", "121.455329", 45),
      amapBuilding(/(?:资源与环境楼|资源与环境科学学院|资环楼)/, "31.031943", "121.450828", 50),
      amapBuilding(/(?:生物实验室|生物实验站|生物楼|生科楼)/, "31.034426", "121.452321", 50),
      amapBuilding(/(?:生物科学技术学院|生命科学学院)/, "31.031365", "121.450228", 55),
      amapBuilding(/(?:化学系|化学馆|化学楼)/, "31.030685", "121.450099", 50),
      amapBuilding(/(?:物理学系|物理楼)/, "31.026340", "121.451571", 50),
      amapBuilding(/(?:数学系|数学楼)/, "31.028123", "121.451214", 50),
      amapBuilding(/金融与统计学院/, "31.027922", "121.454822", 50),
      amapBuilding(/统计楼/, "31.027790", "121.451575", 50),
      amapBuilding(/(?:信息科学技术学院|信息技术楼|信息楼)/, "31.026914", "121.451320", 55),
      amapBuilding(/(?:艺术学院|美术学院)/, "31.032108", "121.453423", 50),
      amapBuilding(/传播学院/, "31.031775", "121.453823", 50),
      amapBuilding(/(?:艺术传播楼|艺术传媒楼|艺传楼)/, "31.031787", "121.453374", 75),
      amapBuilding(/(?:行政楼|办公楼)/, "31.026270", "121.455615", 50),
      amapBuilding(/(?:大学生活动中心|学生活动中心)/, "31.033473", "121.454517", 55),
      amapBuilding(/校医院/, "31.033639", "121.449625", 55),
      amapBuilding(/河口海岸大楼\s*A楼/, "31.025134", "121.451198", 70),
      amapBuilding(/河口海岸大楼\s*B楼/, "31.025134", "121.451198", 70),
      amapBuilding(/河口海岸大楼/, "31.025134", "121.451198", 70),
      amapBuilding(/(?:人文楼|人文大楼)/, "31.028796", "121.454556", 55),
      amapBuilding(/法商(?:北楼|南楼|楼)/, "31.027965", "121.455016", 70)
    ],
    lingang: [
      amapBuilding(/滴水湖国际软件学院/, "30.900120", "121.923109", 70),
      amapBuilding(/临港软件园/, "30.901236", "121.926067", 180)
    ]
  };

  function normalizeText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[（]/g, "(")
      .replace(/[）]/g, ")")
      .replace(/[～—－至]/g, "~")
      .replace(/，/g, ",")
      .replace(/[ \t]+/g, " ")
      .replace(/\s*\n\s*/g, "\n")
      .trim();
  }

  function parseWeekSpec(spec) {
    const weeks = [];
    const value = normalizeText(spec).replace(/第/g, "");
    for (const token of value.split(/[,、]/)) {
      let parity = null;
      if (/单/.test(token)) parity = 1;
      if (/双/.test(token)) parity = 0;
      const part = token.replace(/[()周单双]/g, "").trim();
      if (!part) continue;
      const range = part.match(/^(\d{1,2})\s*[~-]\s*(\d{1,2})$/);
      if (range) {
        const start = Number(range[1]);
        const end = Number(range[2]);
        for (let week = start; week <= end && week <= 30; week += 1) {
          if (parity === null || week % 2 === parity) weeks.push(week);
        }
      } else if (/^\d{1,2}$/.test(part)) {
        const week = Number(part);
        if (parity === null || week % 2 === parity) weeks.push(week);
      }
    }
    return [...new Set(weeks)]
      .filter((week) => week > 0)
      .sort((a, b) => a - b);
  }

  function parseApiTimetable(data) {
    if (!data || !Array.isArray(data.lessons)) return null;
    const dayMap = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
    const courses = [];
    const seen = new Set();
    let firstMonday = "";

    for (const lesson of data.lessons) {
      if (!firstMonday && lesson.semester?.startDate) firstMonday = lesson.semester.startDate;
      const title = lesson.course?.nameZh || lesson.nameZh || "未命名课程";
      const scheduleText = lesson.scheduleText?.dateTimePlaceText?.textZh || "";
      let scheduleIndex = 0;
      for (const rawPart of scheduleText.split(/[;；\n]+/)) {
        const part = normalizeText(rawPart).replace(/\n/g, " ");
        if (!part) continue;
        const seriesKey = `api:${lesson.id || lesson.code || title}:${scheduleIndex}`;
        scheduleIndex += 1;
        const match = part.match(/^(.+?周)\s*星期([一二三四五六日天])\s*(\d{1,2})\s*[~-]\s*(\d{1,2})\s*节\s*(.*)$/);
        if (!match) continue;
        const weeks = parseWeekSpec(match[1]);
        const course = {
          title,
          teachingCode: lesson.code || "",
          weekSpec: match[1],
          weeks,
          weekday: dayMap[match[2]],
          startPeriod: Number(match[3]),
          endPeriod: Number(match[4]),
          location: match[5].trim(),
          seriesKey,
          rawText: part
        };
        const key = [lesson.id || lesson.code || title, course.weekday, course.weekSpec, course.startPeriod, course.endPeriod, course.location].join("|");
        if (!weeks.length || seen.has(key)) continue;
        seen.add(key);
        courses.push(course);
      }
    }
    courses.sort((a, b) => a.weekday - b.weekday || a.startPeriod - b.startPeriod || a.title.localeCompare(b.title, "zh-CN"));
    return {
      courses,
      firstMonday,
      currentWeek: Number(data.currentWeek) || null,
      source: "api"
    };
  }

  function parseCourseText(rawText) {
    const text = normalizeText(rawText);
    const schedule = text.match(/\(([^()]*?周[^()]*)\)\s*\(\s*(\d{1,2})\s*[~-]\s*(\d{1,2})\s*节?\s*\)/);
    if (!schedule) return null;

    const codeMatch = text.match(/教学班代码\s*[:：]?\s*([A-Za-z0-9_-]+)/);
    const codeIndex = text.search(/教学班代码/);
    let title = codeIndex >= 0 ? text.slice(0, codeIndex) : text.slice(0, schedule.index);
    title = title.split("\n").map((item) => item.trim()).filter(Boolean)[0] || "未命名课程";

    const afterSchedule = text.slice((schedule.index || 0) + schedule[0].length).trim();
    const location = afterSchedule
      .replace(/^[,，;；\s]+/, "")
      .replace(/\s+[\u3400-\u9fff·]{2,12}\s*\([^()]{2,30}\)\s*$/, "")
      .replace(/\s*\([^()]{2,30}\)\s*$/, "")
      .trim();

    return {
      title,
      teachingCode: codeMatch ? codeMatch[1] : "",
      weekSpec: schedule[1],
      weeks: parseWeekSpec(schedule[1]),
      startPeriod: Number(schedule[2]),
      endPeriod: Number(schedule[3]),
      location,
      rawText: text
    };
  }

  function dateFromMonday(firstMonday, week, weekday) {
    const parts = String(firstMonday).split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) throw new Error("第 1 周周一日期无效");
    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    date.setUTCDate(date.getUTCDate() + (week - 1) * 7 + (weekday - 1));
    return date.toISOString().slice(0, 10).replace(/-/g, "");
  }

  function escapeIcs(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/\r?\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  function qualifyCampusLocation(value) {
    let location = String(value || "").trim();
    location = location
      .replace(/田家炳教书院/g, "田家炳教育书院")
      .replace(/(^|\s)教书院/g, "$1田家炳教育书院");
    if (/^华东师范大学/.test(location)) return location;
    if (/^华师大/.test(location)) return location.replace(/^华师大/, "华东师范大学");
    if (/^(普陀校区|闵行校区|临港校区)/.test(location)) return `华东师范大学${location}`;
    return location;
  }

  function escapeIcsParameter(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, "\\\"")
      .replace(/\r?\n/g, " ");
  }

  function campusKeyForLocation(location) {
    if (/普陀校区|中山北路校区/.test(location)) return "putuo";
    if (/闵行校区/.test(location)) return "minhang";
    if (/临港校区|滴水湖国际软件学院|临港软件园/.test(location)) return "lingang";
    return "";
  }

  function transformLatitude(x, y) {
    let value = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    value += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
    value += (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3;
    value += (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) * 2 / 3;
    return value;
  }

  function transformLongitude(x, y) {
    let value = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    value += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
    value += (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3;
    value += (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3;
    return value;
  }

  function wgs84ToGcj02(latitude, longitude) {
    const earthRadius = 6378245;
    const eccentricity = 0.006693421622965943;
    const radianLatitude = latitude / 180 * Math.PI;
    let magic = Math.sin(radianLatitude);
    magic = 1 - eccentricity * magic * magic;
    const squareRootMagic = Math.sqrt(magic);
    const latitudeOffset = transformLatitude(longitude - 105, latitude - 35) * 180
      / ((earthRadius * (1 - eccentricity)) / (magic * squareRootMagic) * Math.PI);
    const longitudeOffset = transformLongitude(longitude - 105, latitude - 35) * 180
      / (earthRadius / squareRootMagic * Math.cos(radianLatitude) * Math.PI);
    return [latitude + latitudeOffset, longitude + longitudeOffset];
  }

  function gcj02ToWgs84(latitude, longitude) {
    let wgsLatitude = latitude;
    let wgsLongitude = longitude;
    // Iteration converges to sub-metre precision for the Shanghai campuses.
    for (let index = 0; index < 4; index += 1) {
      const [convertedLatitude, convertedLongitude] = wgs84ToGcj02(wgsLatitude, wgsLongitude);
      wgsLatitude -= convertedLatitude - latitude;
      wgsLongitude -= convertedLongitude - longitude;
    }
    return [wgsLatitude, wgsLongitude];
  }

  function calendarGeoFromAmap(point) {
    if (!point) return null;
    const amapLatitude = Number(point.amapLatitude);
    const amapLongitude = Number(point.amapLongitude);
    const [wgsLatitude, wgsLongitude] = gcj02ToWgs84(amapLatitude, amapLongitude);
    return {
      latitude: wgsLatitude.toFixed(6),
      longitude: wgsLongitude.toFixed(6),
      appleLatitude: point.amapLatitude,
      appleLongitude: point.amapLongitude,
      radius: point.radius
    };
  }

  function geoForLocation(location) {
    const campusKey = campusKeyForLocation(location);
    if (campusKey) {
      const building = BUILDING_GEO[campusKey].find((item) => item.pattern.test(location));
      if (building) return calendarGeoFromAmap(building);
      const compactLocation = location.replace(/\s+/g, "");
      if (/^(?:华东师范大学|华师大)?(?:普陀校区|中山北路校区|闵行校区|临港校区)$/.test(compactLocation)) {
        return calendarGeoFromAmap(CAMPUS_GEO[campusKey]);
      }
      return null;
    }

    // Preserve support for a bare, unambiguous ECNU building name without
    // risking a same-name building from another campus.
    const matches = Object.values(BUILDING_GEO)
      .flat()
      .filter((item) => item.pattern.test(location));
    return matches.length === 1 ? calendarGeoFromAmap(matches[0]) : null;
  }

  function appleMapsUrl(location, geo) {
    const query = encodeURIComponent(location);
    const center = geo ? `&ll=${geo.appleLatitude}%2C${geo.appleLongitude}` : "";
    return `https://maps.apple.com/?q=${query}${center}`;
  }

  function foldIcsLine(line) {
    const output = [];
    let current = "";
    let bytes = 0;
    for (const char of line) {
      const size = new TextEncoder().encode(char).length;
      if (bytes + size > 73 && current) {
        output.push(current);
        current = " " + char;
        bytes = 1 + size;
      } else {
        current += char;
        bytes += size;
      }
    }
    output.push(current);
    return output.join("\r\n");
  }

  function makeUid(course, week, weekday, date) {
    const base = course.seriesKey
      ? [course.seriesKey, week].join("-")
      : [course.teachingCode || course.title, week, weekday, date, course.startPeriod].join("-");
    let hash = 0;
    for (let index = 0; index < base.length; index += 1) hash = (hash * 31 + base.charCodeAt(index)) >>> 0;
    return `ecnu-${hash.toString(16)}@byyt-calendar`;
  }

  function buildIcs(courses, options) {
    const settings = Object.assign({
      firstMonday: "",
      reminderMinutes: 15,
      calendarName: "华师大课表",
      timezone: "Asia/Shanghai",
      periodTimes: DEFAULT_PERIODS
    }, options || {});
    const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//ECNU//Timetable Calendar Exporter//ZH-CN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${escapeIcs(settings.calendarName)}`,
      `X-WR-TIMEZONE:${settings.timezone}`
    ];
    if (settings.timezone === "Asia/Shanghai") {
      lines.push(
        "BEGIN:VTIMEZONE",
        "TZID:Asia/Shanghai",
        "X-LIC-LOCATION:Asia/Shanghai",
        "BEGIN:STANDARD",
        "TZOFFSETFROM:+0800",
        "TZOFFSETTO:+0800",
        "TZNAME:CST",
        "DTSTART:19700101T000000",
        "END:STANDARD",
        "END:VTIMEZONE"
      );
    }
    let eventCount = 0;

    for (const course of courses) {
      const startTime = settings.periodTimes[course.startPeriod];
      const endTime = settings.periodTimes[course.endPeriod];
      if (!startTime || !endTime || !course.weekday || !course.weeks.length) continue;
      for (const week of course.weeks) {
        const date = dateFromMonday(settings.firstMonday, week, course.weekday);
        const location = qualifyCampusLocation(course.location);
        const geo = geoForLocation(location);
        const description = [
          course.teachingCode ? `教学班代码：${course.teachingCode}` : "",
          `教学周：第${week}周（${course.weekSpec}）`,
          `节次：第${course.startPeriod}-${course.endPeriod}节`
        ].filter(Boolean).join("\n");
        lines.push(
          "BEGIN:VEVENT",
          `UID:${makeUid(course, week, course.weekday, date)}`,
          `DTSTAMP:${now}`,
          `DTSTART;TZID=${settings.timezone}:${date}T${startTime[0].replace(":", "")}00`,
          `DTEND;TZID=${settings.timezone}:${date}T${endTime[1].replace(":", "")}00`,
          `SUMMARY:${escapeIcs(course.title)}`,
          `LOCATION:${escapeIcs(location)}`,
          `DESCRIPTION:${escapeIcs(description)}`,
          "STATUS:CONFIRMED",
          "TRANSP:OPAQUE",
          "X-MICROSOFT-CDO-BUSYSTATUS:BUSY"
        );
        if (location) lines.push(`URL:${appleMapsUrl(location, geo)}`);
        if (geo) {
          const parameterLocation = escapeIcsParameter(location);
          lines.push(
            `GEO:${geo.latitude};${geo.longitude}`,
            `X-APPLE-STRUCTURED-LOCATION;VALUE=URI;X-ADDRESS="${parameterLocation}";X-APPLE-RADIUS=${geo.radius};X-TITLE="${parameterLocation}":geo:${geo.appleLatitude},${geo.appleLongitude}`
          );
        }
        if (Number(settings.reminderMinutes) >= 0) {
          lines.push(
            "BEGIN:VALARM",
            `TRIGGER:-PT${Math.round(Number(settings.reminderMinutes))}M`,
            "ACTION:DISPLAY",
            `DESCRIPTION:${escapeIcs(course.title)} 即将开始`,
            "END:VALARM"
          );
        }
        lines.push("END:VEVENT");
        eventCount += 1;
      }
    }
    lines.push("END:VCALENDAR");
    return { content: lines.map(foldIcsLine).join("\r\n") + "\r\n", eventCount };
  }

  return { DEFAULT_PERIODS, normalizeText, parseWeekSpec, parseCourseText, parseApiTimetable, dateFromMonday, buildIcs };
});
