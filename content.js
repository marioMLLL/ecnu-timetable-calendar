(function () {
  "use strict";

  if (globalThis.__ECNU_TIMETABLE_READER_LOADED__) return;
  globalThis.__ECNU_TIMETABLE_READER_LOADED__ = true;

  const DAY_MAP = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };

  function isVisible(element) {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 2 && rect.height > 2;
  }

  function findHeaders() {
    const headers = [];
    for (const element of document.querySelectorAll("th,td,div,span")) {
      const text = ScheduleCore.normalizeText(element.textContent);
      const match = text.match(/^星期([一二三四五六日天])$/);
      if (!match || !isVisible(element)) continue;
      const rect = element.getBoundingClientRect();
      headers.push({ weekday: DAY_MAP[match[1]], center: rect.left + rect.width / 2, element });
    }
    const unique = new Map();
    for (const header of headers) if (!unique.has(header.weekday)) unique.set(header.weekday, header);
    return [...unique.values()].sort((a, b) => a.weekday - b.weekday);
  }

  function nearestWeekday(element, headers) {
    const explicit = element.closest("[data-weekday],[data-day]");
    if (explicit) {
      const value = Number(explicit.dataset.weekday || explicit.dataset.day);
      if (value >= 1 && value <= 7) return value;
    }
    const rect = element.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    let best = null;
    for (const header of headers) {
      const distance = Math.abs(header.center - center);
      if (!best || distance < best.distance) best = { weekday: header.weekday, distance };
    }
    return best ? best.weekday : 0;
  }

  function parsePeriodTimes() {
    const result = Object.assign({}, ScheduleCore.DEFAULT_PERIODS);
    const elements = document.querySelectorAll("th,td,div,span");
    for (const element of elements) {
      const text = ScheduleCore.normalizeText(element.textContent).replace(/\n/g, " ");
      const match = text.match(/^第\s*(\d{1,2})\s*节\s*(\d{1,2}:\d{2})\s*[~-]\s*(\d{1,2}:\d{2})$/);
      if (match && isVisible(element)) result[Number(match[1])] = [match[2].padStart(5, "0"), match[3].padStart(5, "0")];
    }
    return result;
  }

  function findCourseElements() {
    const selector = "td,article,section,li,div";
    const candidates = [...document.querySelectorAll(selector)].filter((element) => {
      if (!isVisible(element)) return false;
      const text = ScheduleCore.normalizeText(element.innerText || element.textContent);
      return text.length >= 12 && text.length <= 800 && /教学班代码/.test(text) && /周/.test(text) && /\d+\s*[~～—－至-]\s*\d+\s*节/.test(text);
    });
    return candidates.filter((element) => !candidates.some((other) => other !== element && element.contains(other)));
  }

  function scanSchedule() {
    const apiJson = document.documentElement?.getAttribute("data-ecnu-timetable-api");
    if (apiJson) {
      try {
        const parsed = ScheduleCore.parseApiTimetable(JSON.parse(apiJson));
        if (parsed?.courses?.length) {
          return Object.assign(parsed, { periodTimes: parsePeriodTimes(), pageTitle: document.title });
        }
      } catch (_error) {
        // Fall through to DOM parsing when the captured response is incomplete.
      }
    }

    const headers = findHeaders();
    if (headers.length < 5) throw new Error("没有找到星期列。请切换到“我的课表”的课表视图后重试。");
    const courses = [];
    const seen = new Set();
    const occurrenceCounts = new Map();
    for (const element of findCourseElements()) {
      const parsed = ScheduleCore.parseCourseText(element.innerText || element.textContent);
      if (!parsed || !parsed.weeks.length) continue;
      parsed.weekday = nearestWeekday(element, headers);
      if (!parsed.weekday) continue;
      const seriesBase = parsed.teachingCode || parsed.title;
      const occurrenceIndex = occurrenceCounts.get(seriesBase) || 0;
      occurrenceCounts.set(seriesBase, occurrenceIndex + 1);
      parsed.seriesKey = `dom:${seriesBase}:${occurrenceIndex}`;
      const key = [parsed.title, parsed.teachingCode, parsed.weekday, parsed.weekSpec, parsed.startPeriod, parsed.endPeriod].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      courses.push(parsed);
    }
    courses.sort((a, b) => a.weekday - b.weekday || a.startPeriod - b.startPeriod || a.title.localeCompare(b.title, "zh-CN"));
    if (!courses.length) throw new Error("没有识别到课程。请等待课表加载完成，并保持在“课表”标签页。");
    return { courses, periodTimes: parsePeriodTimes(), pageTitle: document.title, source: "dom" };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "SCAN_SCHEDULE") return false;
    try {
      sendResponse({ ok: true, data: scanSchedule() });
    } catch (error) {
      sendResponse({ ok: false, error: error.message || String(error) });
    }
    return false;
  });
})();
