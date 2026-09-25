(function () {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const dayNames = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const COURSE_TABLE_API_PATH = "/student/for-std/course-table/get-data";
  const MOBILE_IMPORT_URL = "https://mariomlll.github.io/ecnu-timetable-calendar/mobile/";
  const SUBSCRIPTION_SERVICE_URL = SubscriptionConfig.SERVICE_BASE_URL;
  const SUBSCRIPTION_STORAGE_KEY = SubscriptionConfig.STORAGE_KEY;
  const platformName = navigator.userAgentData?.platform || navigator.platform || "";
  const isWindows = /win/i.test(platformName);
  const isMac = /mac/i.test(platformName);
  const platformCopy = isWindows ? {
    subtitle: "ECNU → Outlook / Windows 日历",
    importButton: "导入到 Outlook / 系统日历",
    ready: "课程已经读取，可以导入到 Outlook / 系统日历。",
    success: "已交给 Windows 默认日历应用。若新 Outlook 没有打开，请使用“添加日历 → 从文件上传”。",
    tip: "先读取并预览课程；准备完成后可用 Outlook 或 Windows 默认日历打开。"
  } : isMac ? {
    subtitle: "ECNU → macOS Calendar",
    importButton: "导入到 macOS 日历",
    ready: "课程已经读取，可以导入到 macOS 日历。",
    success: "已交给 macOS 日历，请在系统窗口中确认导入。",
    tip: "先读取并预览课程；日历准备完成后，再点击导入到 macOS 日历。"
  } : {
    subtitle: "ECNU → 系统日历",
    importButton: "导入到系统日历",
    ready: "课程已经读取，可以导入到系统日历。",
    success: "已交给系统默认日历应用，请在应用窗口中确认导入。",
    tip: "先读取并预览课程；日历准备完成后，再点击导入到系统日历。"
  };
  let scanResult = null;
  let pendingDownloadId = null;
  let lastCalendarContent = "";
  let subscriptionState = null;

  function localDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function setStatus(message, isError) {
    $("#status").textContent = message;
    $("#status").classList.toggle("error", Boolean(isError));
  }

  function setSubscriptionStatus(message, isError) {
    $("#subscriptionStatus").textContent = message || "";
    $("#subscriptionStatus").classList.toggle("error", Boolean(isError));
  }

  function isoDateInShanghai(dateValue) {
    const date = new Date(dateValue);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(date);
  }

  function suggestedExpiryDate() {
    if (!scanResult?.courses?.length || !$("#firstMonday").value) {
      const fallback = new Date();
      fallback.setMonth(fallback.getMonth() + 6);
      return localDateString(fallback);
    }
    let maxOffset = 0;
    for (const course of scanResult.courses) {
      const lastWeek = Math.max(...course.weeks);
      maxOffset = Math.max(maxOffset, (lastWeek - 1) * 7 + course.weekday - 1);
    }
    const [year, month, day] = $("#firstMonday").value.split("-").map(Number);
    const expiry = new Date(Date.UTC(year, month - 1, day + maxOffset + 14));
    return expiry.toISOString().slice(0, 10);
  }

  function expiryIsoValue() {
    const value = $("#subscriptionExpiry").value;
    if (!value) throw new Error("请选择订阅自动删除日期");
    return new Date(`${value}T23:59:59+08:00`).toISOString();
  }

  function renderSubscription() {
    const active = Boolean(subscriptionState?.readUrl);
    $("#subscriptionInactive").hidden = active;
    $("#subscriptionActive").hidden = !active;
    if (!active) {
      $("#createSubscription").disabled = !lastCalendarContent;
      return;
    }
    $("#subscriptionExpiry").value = isoDateInShanghai(subscriptionState.expiresAt);
    $("#subscriptionUrl").value = subscriptionState.readUrl;
    const expiry = isoDateInShanghai(subscriptionState.expiresAt);
    const updated = subscriptionState.updatedAt ? new Date(subscriptionState.updatedAt).toLocaleString("zh-CN") : "尚未同步";
    $("#subscriptionMeta").textContent = `自动删除：${expiry} · 上次更新：${updated}`;
    if (subscriptionState.lastSyncError) setSubscriptionStatus(`上次同步失败：${subscriptionState.lastSyncError}`, true);
  }

  function renderPreview() {
    const courses = scanResult.courses;
    const events = courses.reduce((total, course) => total + course.weeks.length, 0);
    $("#summary").textContent = `识别到 ${courses.length} 门课`;
    $("#eventSummary").textContent = `${events} 个日程`;
    $("#courseList").replaceChildren(...courses.map((course) => {
      const row = document.createElement("div");
      row.className = "course";
      const day = document.createElement("div");
      day.className = "day";
      day.textContent = dayNames[course.weekday];
      const detail = document.createElement("div");
      const title = document.createElement("b");
      title.textContent = course.title;
      const meta = document.createElement("small");
      meta.textContent = `${course.weekSpec} · 第${course.startPeriod}-${course.endPeriod}节${course.location ? ` · ${course.location}` : ""}`;
      detail.append(title, meta);
      row.append(day, detail);
      return row;
    }));
    $("#preview").hidden = false;
    $("#actions").hidden = false;
    $("#export").disabled = true;
    $("#qr").disabled = false;
    $("#qrPanel").hidden = true;
    $("#subscriptionExpiry").value = suggestedExpiryDate();
    $("#createSubscription").disabled = false;
  }

  async function injectAndFindFrames(tabId) {
    const options = { target: { tabId, allFrames: true } };
    await chrome.scripting.executeScript({
      ...options,
      files: ["api-hook.js"],
      world: "MAIN"
    });
    const coreFrames = await chrome.scripting.executeScript({
      ...options,
      files: ["lib/schedule-core.js"]
    });
    const contentFrames = await chrome.scripting.executeScript({
      ...options,
      files: ["content.js"]
    });
    return [...new Set([...coreFrames, ...contentFrames].map((item) => item.frameId))];
  }

  async function fetchScheduleDirectly(tabId) {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: "MAIN",
      args: [COURSE_TABLE_API_PATH],
      func: async (apiPath) => {
        try {
          const observed = performance.getEntriesByType("resource")
            .map((entry) => entry.name)
            .filter((name) => name.includes(apiPath))
            .at(-1);
          if (!observed) throw new Error("尚未发现课表接口请求");
          const candidate = new URL(observed);
          if (candidate.origin !== "https://byyt.ecnu.edu.cn" || candidate.pathname !== apiPath) {
            throw new Error("课表接口地址校验失败");
          }
          const response = await fetch(candidate.href, {
            method: "GET",
            credentials: "include",
            headers: { "Accept": "application/json, text/plain, */*", "X-Requested-With": "XMLHttpRequest" }
          });
          if (!response.ok) throw new Error(`接口返回 HTTP ${response.status}`);
          const data = await response.json();
          if (!data || !Array.isArray(data.lessons)) throw new Error("接口响应中没有课程数据");
          return {
            ok: true,
            endpoint: candidate.href,
            data: {
              currentWeek: data.currentWeek,
              weekIndices: data.weekIndices,
              lessons: data.lessons.map((lesson) => ({
                id: lesson.id,
                code: lesson.code,
                nameZh: lesson.nameZh,
                course: { nameZh: lesson.course?.nameZh || "" },
                semester: { startDate: lesson.semester?.startDate || "" },
                scheduleText: {
                  dateTimePlaceText: {
                    textZh: lesson.scheduleText?.dateTimePlaceText?.textZh || ""
                  }
                }
              }))
            }
          };
        } catch (error) {
          return { ok: false, error: error.message || String(error) };
        }
      }
    });
    const success = results.find((item) => item.result?.ok && item.result.data?.lessons?.length);
    return success?.result || { ok: false, error: results.map((item) => item.result?.error).filter(Boolean)[0] || "接口请求失败" };
  }

  async function readFromFrames(tabId, frameIds) {
    const failures = [];
    for (const frameId of frameIds) {
      try {
        const response = await chrome.tabs.sendMessage(
          tabId,
          { type: "SCAN_SCHEDULE" },
          { frameId }
        );
        if (response?.ok && response.data?.courses?.length) return response.data;
        if (response?.error) failures.push(response.error);
      } catch (error) {
        failures.push(error.message || String(error));
      }
    }
    const usefulFailure = failures.find((message) => /没有找到|没有识别/.test(message));
    throw new Error(usefulFailure || "读取脚本未能连接到课表内容，请确认当前页面已显示课程表。");
  }

  async function scan() {
    pendingDownloadId = null;
    lastCalendarContent = "";
    renderSubscription();
    chrome.storage.local.remove("pendingDownloadId");
    $("#export").textContent = "正在读取课程…";
    $("#actions").hidden = true;
    $("#qrPanel").hidden = true;
    $("#scan").disabled = true;
    $("#export").disabled = true;
    setStatus("正在读取课表…");
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !/^https:\/\/byyt\.ecnu\.edu\.cn\//.test(tab.url || "")) {
        throw new Error("请先在当前标签页打开华师大学生管理系统课表。 ");
      }

      const direct = await fetchScheduleDirectly(tab.id);
      if (direct.ok) {
        const parsed = ScheduleCore.parseApiTimetable(direct.data);
        if (!parsed?.courses?.length) throw new Error("接口响应存在，但没有解析出有效课程。");
        scanResult = Object.assign(parsed, { periodTimes: ScheduleCore.DEFAULT_PERIODS, endpoint: direct.endpoint });
        if (scanResult.firstMonday) $("#firstMonday").value = scanResult.firstMonday;
        renderPreview();
        const weekText = scanResult.currentWeek ? `，当前为第 ${scanResult.currentWeek} 周` : "";
        await prepareCalendarDownload(`课程已读取；第 1 周周一为 ${scanResult.firstMonday}${weekText}。`);
        return;
      }

      let frameIds = [];
      try {
        frameIds = await injectAndFindFrames(tab.id);
      } catch (error) {
        throw new Error(`无法读取页面：${error.message || String(error)}`);
      }
      if (!frameIds.length) throw new Error("没有找到可读取的课表页面框架。");
      scanResult = await readFromFrames(tab.id, frameIds);
      if (scanResult.firstMonday) $("#firstMonday").value = scanResult.firstMonday;
      renderPreview();
      if (scanResult.source === "api") {
        const weekText = scanResult.currentWeek ? `，当前为第 ${scanResult.currentWeek} 周` : "";
        await prepareCalendarDownload(`课程已读取；第 1 周周一为 ${scanResult.firstMonday}${weekText}。`);
      } else {
        await prepareCalendarDownload("课程已从页面读取。 ");
      }
    } catch (error) {
      scanResult = null;
      $("#preview").hidden = true;
      $("#actions").hidden = true;
      $("#qr").disabled = true;
      $("#qrPanel").hidden = true;
      $("#export").textContent = platformCopy.importButton;
      setStatus(error.message || String(error), true);
    } finally {
      $("#scan").disabled = false;
    }
  }

  async function saveSettings() {
    await chrome.storage.local.set({
      firstMonday: $("#firstMonday").value,
      reminderMinutes: Number($("#reminder").value),
      calendarName: $("#calendarName").value.trim() || "华师大课表"
    });
  }

  function subscriptionStateForCurrentScan(baseState) {
    return Object.assign({}, baseState, {
      endpoint: scanResult?.endpoint || baseState.endpoint || "",
      firstMonday: $("#firstMonday").value,
      reminderMinutes: Number($("#reminder").value),
      calendarName: $("#calendarName").value.trim() || "华师大课表",
      periodTimes: scanResult?.periodTimes || ScheduleCore.DEFAULT_PERIODS
    });
  }

  async function syncCurrentSubscription(content, announce) {
    if (!subscriptionState?.readUrl) return;
    const contentHash = await SubscriptionClient.fingerprintCalendar(content);
    subscriptionState = subscriptionStateForCurrentScan(subscriptionState);
    if (contentHash !== subscriptionState.contentHash) {
      subscriptionState = await SubscriptionClient.updateFeed(subscriptionState, content);
      if (announce) setSubscriptionStatus("订阅已更新，日历应用会在下次刷新时同步。", false);
    } else if (announce) {
      setSubscriptionStatus("课表没有变化，无需上传。", false);
    }
    subscriptionState.lastCheckedAt = new Date().toISOString();
    subscriptionState.lastSyncError = "";
    await chrome.storage.local.set({ [SUBSCRIPTION_STORAGE_KEY]: subscriptionState });
    renderSubscription();
  }

  async function createSubscription(replaceExisting) {
    if (!lastCalendarContent || !scanResult?.courses?.length) throw new Error("请先读取并预览课程");
    if (replaceExisting && subscriptionState?.readUrl) {
      await SubscriptionClient.deleteFeed(subscriptionState);
      subscriptionState = null;
      await chrome.storage.local.remove(SUBSCRIPTION_STORAGE_KEY);
      renderSubscription();
    }
    const created = await SubscriptionClient.createFeed(
      SUBSCRIPTION_SERVICE_URL,
      lastCalendarContent,
      expiryIsoValue()
    );
    subscriptionState = subscriptionStateForCurrentScan(created);
    subscriptionState.lastCheckedAt = subscriptionState.updatedAt;
    subscriptionState.lastSyncError = "";
    await chrome.storage.local.set({ [SUBSCRIPTION_STORAGE_KEY]: subscriptionState });
    renderSubscription();
    setSubscriptionStatus("私人订阅已创建。请将订阅地址添加到日历应用，不要公开分享。", false);
  }

  async function revokeSubscription() {
    if (!subscriptionState?.readUrl) return;
    await SubscriptionClient.deleteFeed(subscriptionState);
    subscriptionState = null;
    await chrome.storage.local.remove(SUBSCRIPTION_STORAGE_KEY);
    renderSubscription();
    setSubscriptionStatus("订阅已撤销，原地址现在无法读取课表。", false);
  }

  function waitForDownload(downloadId) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => finish(new Error("日历文件生成超时")), 15000);
      const listener = (delta) => {
        if (delta.id !== downloadId || !delta.state) return;
        if (delta.state.current === "complete") finish();
        if (delta.state.current === "interrupted") finish(new Error("日历文件生成被中断"));
      };
      function finish(error) {
        clearTimeout(timeout);
        chrome.downloads.onChanged.removeListener(listener);
        if (error) reject(error);
        else resolve();
      }
      chrome.downloads.onChanged.addListener(listener);
      chrome.downloads.search({ id: downloadId }, (items) => {
        if (chrome.runtime.lastError) return;
        if (items[0]?.state === "complete") finish();
        if (items[0]?.state === "interrupted") finish(new Error("日历文件生成被中断"));
      });
    });
  }

  async function prepareCalendarDownload(confirmedMessage) {
    if (!$("#firstMonday").value) {
      throw new Error("请先填写第 1 周周一日期。");
    }
    await saveSettings();
    const result = ScheduleCore.buildIcs(scanResult.courses, {
      firstMonday: $("#firstMonday").value,
      reminderMinutes: Number($("#reminder").value),
      calendarName: $("#calendarName").value.trim() || "华师大课表",
      periodTimes: scanResult.periodTimes
    });
    if (!result.eventCount) {
      throw new Error("没有可导出的日程，请检查课程周次与节次。");
    }
    lastCalendarContent = result.content;
    renderSubscription();
    if (subscriptionState?.readUrl) {
      try {
        await syncCurrentSubscription(result.content, false);
      } catch (error) {
        setSubscriptionStatus(`课程已读取，但订阅同步失败：${error.message || String(error)}`, true);
      }
    }

    const dataUrl = `data:text/calendar;charset=utf-8,${encodeURIComponent(result.content)}`;
    $("#export").disabled = true;
    $("#export").textContent = "正在准备日历…";
    setStatus(`${confirmedMessage} 正在准备 ${result.eventCount} 个日程…`, false);
    const downloadId = await new Promise((resolve, reject) => {
      chrome.downloads.download({
        url: dataUrl,
        filename: `华师大课表-${$("#firstMonday").value}.ics`,
        conflictAction: "uniquify",
        saveAs: false
      }, (id) => {
        if (chrome.runtime.lastError || typeof id !== "number") {
          reject(new Error(chrome.runtime.lastError?.message || "生成日历文件失败"));
        } else {
          resolve(id);
        }
      });
    });
    pendingDownloadId = downloadId;
    await chrome.storage.local.set({ pendingDownloadId });
    await waitForDownload(downloadId);
    $("#export").disabled = false;
    $("#export").textContent = platformCopy.importButton;
    setStatus(`${confirmedMessage} 日历已准备好。`, false);
  }

  async function exportCalendar() {
    if (pendingDownloadId === null) {
      setStatus("请先点击“读取并预览课程”。", true);
      return;
    }
    try {
      await chrome.downloads.open(pendingDownloadId);
      setStatus(platformCopy.success, false);
      pendingDownloadId = null;
      await chrome.storage.local.remove("pendingDownloadId");
      $("#export").disabled = true;
      $("#export").textContent = "请重新读取课程";
    } catch (error) {
      setStatus(`暂时无法打开日历：${error.message || String(error)}`, true);
    }
  }

  async function showQrCode() {
    if (!scanResult?.courses?.length) {
      setStatus("请先点击“读取并预览课程”。", true);
      return;
    }
    try {
      if (!$("#firstMonday").value) throw new Error("请先填写第 1 周周一日期。");
      await saveSettings();
      const payload = MobilePayload.fromCourses(scanResult.courses, {
        firstMonday: $("#firstMonday").value,
        reminderMinutes: Number($("#reminder").value),
        calendarName: $("#calendarName").value.trim() || "华师大课表",
        periodTimes: scanResult.periodTimes
      });
      const importUrl = MobilePayload.makeUrl(MOBILE_IMPORT_URL, payload);
      const code = qrcode(0, "L");
      code.addData(importUrl, "Byte");
      code.make();
      $("#qrImage").src = code.createDataURL(5, 12);
      $("#qrPanel").hidden = false;
      requestAnimationFrame(() => $("#qrPanel").scrollIntoView({ behavior: "smooth", block: "center" }));
      setStatus(`手机导入二维码已生成（${importUrl.length} 个字符）。`, false);
    } catch (error) {
      $("#qrPanel").hidden = true;
      setStatus(`二维码生成失败：${error.message || String(error)}`, true);
    }
  }

  function invalidatePreparedCalendar() {
    $("#qrPanel").hidden = true;
    if (pendingDownloadId === null) return;
    pendingDownloadId = null;
    chrome.storage.local.remove("pendingDownloadId");
    $("#export").disabled = true;
    $("#export").textContent = "请重新读取课程";
    setStatus("设置已修改，请重新读取并预览课程。", false);
  }

  $("#platformSubtitle").textContent = platformCopy.subtitle;
  $("#platformTip").textContent = platformCopy.tip;
  $("#export").textContent = platformCopy.importButton;

  chrome.storage.local.get(["firstMonday", "reminderMinutes", "calendarName", "pendingDownloadId"]).then((saved) => {
    $("#firstMonday").value = saved.firstMonday || localDateString(new Date());
    $("#reminder").value = String(saved.reminderMinutes ?? 15);
    $("#calendarName").value = saved.calendarName || "华师大课表";
    if (typeof saved.pendingDownloadId === "number") {
      chrome.downloads.search({ id: saved.pendingDownloadId }, (items) => {
        if (items[0]?.state === "complete") {
          pendingDownloadId = saved.pendingDownloadId;
          $("#actions").hidden = false;
          $("#export").disabled = false;
          $("#export").textContent = platformCopy.importButton;
          setStatus(platformCopy.ready, false);
        } else if (!items.length || items[0]?.state === "interrupted") {
          chrome.storage.local.remove("pendingDownloadId");
        }
      });
    }
  });
  chrome.storage.local.get(SUBSCRIPTION_STORAGE_KEY).then((saved) => {
    subscriptionState = saved[SUBSCRIPTION_STORAGE_KEY] || null;
    if (subscriptionState && Date.parse(subscriptionState.expiresAt) <= Date.now()) {
      subscriptionState = null;
      chrome.storage.local.remove(SUBSCRIPTION_STORAGE_KEY);
    }
    if (!$("#subscriptionExpiry").value) $("#subscriptionExpiry").value = suggestedExpiryDate();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const maximum = new Date();
    maximum.setDate(maximum.getDate() + 400);
    $("#subscriptionExpiry").min = localDateString(tomorrow);
    $("#subscriptionExpiry").max = localDateString(maximum);
    renderSubscription();
  });
  $("#scan").addEventListener("click", scan);
  $("#export").addEventListener("click", exportCalendar);
  $("#qr").addEventListener("click", showQrCode);
  $("#createSubscription").addEventListener("click", async () => {
    try {
      $("#createSubscription").disabled = true;
      setSubscriptionStatus("正在创建私人订阅…", false);
      await createSubscription(false);
    } catch (error) {
      setSubscriptionStatus(error.message || String(error), true);
    } finally {
      if (!subscriptionState) $("#createSubscription").disabled = !lastCalendarContent;
    }
  });
  $("#copySubscription").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(subscriptionState.readUrl);
      setSubscriptionStatus("订阅地址已复制。请把它作为“网络日历”添加，不要发给其他人。", false);
    } catch (error) {
      setSubscriptionStatus(`复制失败：${error.message || String(error)}`, true);
    }
  });
  $("#syncSubscription").addEventListener("click", async () => {
    try {
      setSubscriptionStatus("正在检查课表更新…", false);
      if (lastCalendarContent && scanResult) {
        await syncCurrentSubscription(lastCalendarContent, true);
      } else {
        const response = await chrome.runtime.sendMessage({ type: "SYNC_SUBSCRIPTION" });
        if (!response?.ok) throw new Error(response?.error || "后台同步失败");
        const saved = await chrome.storage.local.get(SUBSCRIPTION_STORAGE_KEY);
        subscriptionState = saved[SUBSCRIPTION_STORAGE_KEY] || subscriptionState;
        renderSubscription();
        setSubscriptionStatus(response.result?.updated ? "订阅已更新。" : "课表没有变化。", false);
      }
    } catch (error) {
      setSubscriptionStatus(`同步失败：${error.message || String(error)}。如果登录已过期，请先打开学校课表。`, true);
    }
  });
  $("#regenerateSubscription").addEventListener("click", async () => {
    if (!confirm("重新生成后，原订阅地址会立即失效，你需要在日历应用中替换地址。继续吗？")) return;
    try {
      setSubscriptionStatus("正在撤销旧地址并生成新令牌…", false);
      await createSubscription(true);
    } catch (error) {
      setSubscriptionStatus(`重新生成失败：${error.message || String(error)}`, true);
    }
  });
  $("#revokeSubscription").addEventListener("click", async () => {
    if (!confirm("撤销后，已添加到日历应用的订阅地址将失效。继续吗？")) return;
    try {
      setSubscriptionStatus("正在撤销订阅…", false);
      await revokeSubscription();
    } catch (error) {
      setSubscriptionStatus(`撤销失败：${error.message || String(error)}`, true);
    }
  });
  $("#firstMonday").addEventListener("change", invalidatePreparedCalendar);
  $("#reminder").addEventListener("change", invalidatePreparedCalendar);
  $("#calendarName").addEventListener("input", invalidatePreparedCalendar);
})();
