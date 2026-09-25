(function () {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const userAgent = navigator.userAgent || "";
  const isAndroid = /Android/i.test(userAgent);
  const isIos = /iPhone|iPad|iPod/i.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let calendarUrl = "";
  let calendarFile = null;

  function configurePlatform() {
    if (isAndroid) {
      document.title = "华师大课表 · Android 导入";
      $("#platformName").textContent = "ECNU → Android Calendar";
      $("#importButton").textContent = "添加到安卓日历";
      $("#downloadLink").textContent = "无法打开？直接下载 .ics 文件";
      $("#downloadLink").hidden = false;
      $("#importHint").textContent = "点击后请选择系统日历或支持 .ics 的日历应用。如果手机没有可用应用，会改为下载日历文件。Google Calendar 手机版暂不支持直接批量导入 .ics。🤖";
    } else if (isIos) {
      document.title = "华师大课表 · iPhone 导入";
      $("#platformName").textContent = "ECNU → iPhone Calendar";
      $("#importButton").textContent = "添加到 iPhone 日历";
      $("#importHint").textContent = "Safari 打开日历预览后，点击“全部添加”，再选择目标日历即可。苹果坚持要你最后点头，我们也只能尊重这份仪式感。🍎";
    } else {
      $("#platformName").textContent = "ECNU → Calendar";
      $("#importButton").textContent = "下载日历文件 (.ics)";
      $("#importHint").textContent = "下载后请使用系统日历或其他支持 .ics 的应用打开。";
    }
  }

  function downloadCalendar() {
    if (!calendarUrl) return;
    const link = document.createElement("a");
    link.href = calendarUrl;
    link.target = "_blank";
    link.download = calendarFile?.name || `华师大课表-${$("#firstMonday").textContent}.ics`;
    document.body.append(link);
    link.click();
    link.remove();
    $("#downloadLink").hidden = false;
  }

  function fail(message) {
    $("#loading").hidden = true;
    $("#result").hidden = true;
    $("#error").textContent = message;
    $("#error").hidden = false;
  }

  function readPayload() {
    const params = new URLSearchParams(location.hash.slice(1));
    const encoded = params.get("d");
    if (!encoded) throw new Error("这个二维码里没有找到课表。请回到电脑重新生成一次。 ");
    return MobilePayload.decode(encoded);
  }

  try {
    const payload = readPayload();
    const courses = MobilePayload.toCourses(payload, ScheduleCore.parseWeekSpec);
    const periodTimes = MobilePayload.toPeriodTimes(payload, ScheduleCore.DEFAULT_PERIODS);
    const calendar = ScheduleCore.buildIcs(courses, {
      firstMonday: payload.m,
      reminderMinutes: payload.r,
      calendarName: payload.n,
      periodTimes
    });
    if (!calendar.eventCount) throw new Error("课表中没有可导入的日程。 ");

    const filename = `华师大课表-${payload.m}.ics`;
    calendarFile = new File([calendar.content], filename, { type: "text/calendar;charset=utf-8" });
    calendarUrl = URL.createObjectURL(calendarFile);
    $("#downloadLink").href = calendarUrl;
    $("#downloadLink").download = filename;
    $("#courseCount").textContent = `${courses.length} 门`;
    $("#eventCount").textContent = `${calendar.eventCount} 个`;
    $("#calendarName").textContent = payload.n;
    $("#firstMonday").textContent = payload.m;
    $("#reminder").textContent = payload.r ? `${payload.r} 分钟` : "上课时";
    $("#loading").hidden = true;
    $("#result").hidden = false;
  } catch (error) {
    fail(error.message || "二维码解析失败，请回到电脑重新生成。 ");
  }

  configurePlatform();

  $("#importButton").addEventListener("click", async () => {
    if (!calendarUrl || !calendarFile) return;
    if (isAndroid && navigator.share && navigator.canShare?.({ files: [calendarFile] })) {
      try {
        await navigator.share({
          files: [calendarFile],
          title: "华师大课表",
          text: "请选择系统日历或支持 .ics 的应用打开"
        });
        $("#downloadLink").hidden = false;
        $("#importHint").textContent = "已打开系统应用选择器。若没有合适的日历应用，可点击下方链接下载 .ics 文件。";
        return;
      } catch (error) {
        if (error.name === "AbortError") return;
      }
    }
    downloadCalendar();
    if (isAndroid) {
      $("#importHint").textContent = "日历文件已下载。请在下载通知或文件管理器中点击它，并选择系统日历打开；Google Calendar 用户需在电脑网页版导入。";
    }
  });

  addEventListener("pagehide", () => {
    if (calendarUrl) URL.revokeObjectURL(calendarUrl);
  });
})();
