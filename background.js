"use strict";

importScripts("lib/schedule-core.js", "lib/subscription-config.js", "lib/subscription-client.js");

const { STORAGE_KEY, ALARM_NAME } = SubscriptionConfig;

async function saveState(state) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

async function syncSubscription() {
  const saved = await chrome.storage.local.get(STORAGE_KEY);
  const state = saved[STORAGE_KEY];
  if (!state?.readToken || !state?.updateToken || !state?.endpoint) return { skipped: true, reason: "inactive" };
  if (Date.parse(state.expiresAt) <= Date.now()) {
    await chrome.storage.local.remove(STORAGE_KEY);
    return { skipped: true, reason: "expired" };
  }

  try {
    const endpoint = new URL(state.endpoint);
    if (endpoint.origin !== "https://byyt.ecnu.edu.cn" || endpoint.pathname !== "/student/for-std/course-table/get-data") {
      throw new Error("已保存的课表接口地址无效");
    }
    const response = await fetch(endpoint.href, {
      credentials: "include",
      headers: { "Accept": "application/json, text/plain, */*", "X-Requested-With": "XMLHttpRequest" }
    });
    if (!response.ok) throw new Error(`学校接口返回 HTTP ${response.status}`);
    const parsed = ScheduleCore.parseApiTimetable(await response.json());
    if (!parsed?.courses?.length) throw new Error("学校接口没有返回有效课程");
    const calendar = ScheduleCore.buildIcs(parsed.courses, {
      firstMonday: parsed.firstMonday || state.firstMonday,
      reminderMinutes: state.reminderMinutes,
      calendarName: state.calendarName,
      periodTimes: state.periodTimes || ScheduleCore.DEFAULT_PERIODS
    });
    const contentHash = await SubscriptionClient.fingerprintCalendar(calendar.content);
    if (contentHash === state.contentHash) {
      const unchanged = Object.assign({}, state, { lastCheckedAt: new Date().toISOString(), lastSyncError: "" });
      await saveState(unchanged);
      return { updated: false, state: unchanged };
    }
    const updated = await SubscriptionClient.updateFeed(state, calendar.content);
    updated.lastCheckedAt = updated.updatedAt;
    updated.lastSyncError = "";
    await saveState(updated);
    return { updated: true, state: updated };
  } catch (error) {
    const failed = Object.assign({}, state, {
      lastCheckedAt: new Date().toISOString(),
      lastSyncError: error?.message || String(error)
    });
    await saveState(failed);
    throw error;
  }
}

function ensureAlarm() {
  chrome.alarms.create(ALARM_NAME, { delayInMinutes: 10, periodInMinutes: 360 });
}

chrome.runtime.onInstalled.addListener(ensureAlarm);
chrome.runtime.onStartup.addListener(() => {
  ensureAlarm();
  syncSubscription().catch(() => {});
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) syncSubscription().catch(() => {});
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "SYNC_SUBSCRIPTION") return false;
  syncSubscription()
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});
