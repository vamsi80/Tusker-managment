const $ = (id) => document.getElementById(id);
const POLL_MS = 60_000;
const MEETING_REMINDER_MS = 5 * 60_000;
const ACTIVE_STATUSES = ["TO_DO", "IN_PROGRESS", "REVIEW"];

let base = "";
let workspaceId = null;
let attendance = null;
let locating = false;
let meeting = null;
let pollTimer = null;
let seenNotifications = null; // null until the first load, so old ones don't pop up
const remindedMeetings = new Set();

const api = (path, opts) => window.tusker.api(path, opts);
const qs = (params) => new URLSearchParams(params).toString();
const time = (d) =>
  new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const today = () => new Date().toLocaleDateString("en-CA"); // yyyy-mm-dd, local

function duration(ms) {
  const mins = Math.max(0, Math.floor(ms / 60_000));
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

/** Local midnight `offsetDays` from today; the tasks API treats it as "through that day". */
function midnight(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function span(text, className) {
  const s = document.createElement("span");
  s.textContent = text;
  if (className) s.className = className;
  return s;
}

function listItem(text, meta, { className, onClick, status } = {}) {
  const li = document.createElement("li");
  const name = span(text, "name");
  name.title = text;
  li.append(name);
  // With a status the row goes two-line, like the web My Tasks widget, so the name keeps the full width.
  const tail = status ? document.createElement("div") : li;
  if (status) {
    li.classList.add("stack");
    tail.className = "sub";
    tail.append(span(status.replace(/_/g, " "), `badge status-${status}`));
    li.append(tail);
  }
  if (meta) tail.append(span(meta, "meta"));
  if (className) li.classList.add(...className.split(" ").filter(Boolean));
  if (onClick) li.onclick = onClick;
  return li;
}

function fill(ul, items, emptyText) {
  ul.replaceChildren(
    ...(items.length
      ? items
      : [listItem(emptyText, null, { className: "empty" })]),
  );
}

// ─── Attendance ──────────────────────────────────────────────────────────────

async function loadAttendance() {
  const { json } = await api(
    `/api/v1/attendance/today?${qs({ workspaceId, clientDateString: today() })}`,
  );
  attendance = json?.data ?? null;
  renderAttendance();
}

function renderAttendance() {
  if (locating) return;
  const btn = $("attButton");
  const a = attendance;
  btn.hidden = false;
  btn.disabled = false;
  $("attBadge").hidden = !a?.status;
  $("attBadge").textContent = a?.status?.replace(/_/g, " ") ?? "";
  $("attBadge").className = `badge status-${a?.status}`;
  if (a?.checkIn && a?.checkOut) {
    $("attStatus").textContent = duration(
      new Date(a.checkOut) - new Date(a.checkIn),
    );
    $("attDetail").textContent =
      `${time(a.checkIn)} – ${time(a.checkOut)} · done for today`;
    btn.hidden = true;
  } else if (a?.checkIn) {
    $("attStatus").textContent = duration(Date.now() - new Date(a.checkIn));
    $("attDetail").textContent = `Clocked in at ${time(a.checkIn)}`;
    btn.textContent = "Clock out";
  } else {
    $("attStatus").textContent = "Not clocked in";
    $("attDetail").textContent = "";
    btn.textContent = "Clock in";
  }
}

/** Best position within ~10s, same approach as the web attendance logger. */
function locate() {
  return new Promise((resolve, reject) => {
    let best = null;
    let finished = false;
    const finish = (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      navigator.geolocation.clearWatch(watchId);
      if (best) resolve(best.coords);
      else
        reject(
          new Error(
            `Couldn't get your location${err ? ` (${err.message})` : ""}. Turn on Windows Settings → Privacy & security → Location, including "Let desktop apps access your location".`,
          ),
        );
    };
    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        if (!best || p.coords.accuracy < best.coords.accuracy) best = p;
        if (p.coords.accuracy <= 15) finish();
      },
      (err) => finish(err),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 },
    );
    const timer = setTimeout(finish, 10_000);
  });
}

async function toggleAttendance() {
  const btn = $("attButton");
  const action = attendance?.checkIn ? "check-out" : "check-in";
  $("attError").textContent = "";
  btn.disabled = true;
  btn.textContent = "Locating…";
  locating = true;
  try {
    const { latitude, longitude, accuracy } = await locate();
    const res = await api(`/api/v1/attendance/${action}`, {
      method: "POST",
      body: {
        workspaceId,
        latitude,
        longitude,
        accuracy,
        clientDateString: today(),
      },
    });
    if (!res.ok)
      throw new Error(
        res.json?.error || `Failed to ${action.replace("-", " ")}`,
      );
  } catch (err) {
    $("attError").textContent = err.message;
  } finally {
    locating = false;
  }
  await loadAttendance().catch(renderAttendance);
}

// ─── Meetings ────────────────────────────────────────────────────────────────

async function loadMeeting() {
  const now = new Date();
  const end = new Date(now.getTime() + 7 * 24 * 60 * 60_000);
  const { json } = await api(
    `/api/v1/meetings?${qs({ workspaceId, startDate: now.toISOString(), endDate: end.toISOString() })}`,
  );
  const list = Array.isArray(json?.data)
    ? json.data
    : (json?.data?.meetings ?? []);
  meeting =
    list
      .filter((m) => m.status !== "CANCELLED" && new Date(m.endTime) > now)
      .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))[0] ?? null;
  renderMeeting();
}

function renderMeeting() {
  const box = $("meeting");
  if (!meeting) {
    box.className = "muted";
    box.textContent = "Nothing in the next 7 days";
    return;
  }
  const start = new Date(meeting.startTime);
  const ms = start - Date.now();
  const when =
    ms <= 0
      ? "Now"
      : ms < 60 * 60_000
        ? `in ${Math.ceil(ms / 60_000)}m`
        : start.toDateString() === new Date().toDateString()
          ? `at ${time(start)}`
          : start.toLocaleString([], {
              weekday: "short",
              hour: "2-digit",
              minute: "2-digit",
            });

  const title = document.createElement("div");
  title.className = "big";
  title.textContent = meeting.title;
  const detail = document.createElement("div");
  detail.className = "muted";
  detail.textContent = [when, meeting.location].filter(Boolean).join(" · ");
  const btn = document.createElement("button");
  btn.textContent = meeting.meetingUrl ? "Join" : "Open";
  btn.onclick = () =>
    window.tusker.open(
      meeting.meetingUrl || `${base}/w/${workspaceId}/calendar`,
    );

  const row = document.createElement("div");
  row.className = "row";
  const text = document.createElement("div");
  text.append(title, detail);
  row.append(text, btn);
  box.className = "";
  box.replaceChildren(row);

  if (
    ms > 0 &&
    ms <= MEETING_REMINDER_MS &&
    !remindedMeetings.has(meeting.id)
  ) {
    remindedMeetings.add(meeting.id);
    window.tusker.notify(
      `${meeting.title} ${when}`,
      meeting.location || "Meeting starting soon",
      meeting.meetingUrl,
    );
  }
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

async function loadTasks() {
  // Same query as the web My Tasks widget: own active tasks due through today.
  const { json } = await api(
    `/api/v1/tasks?${qs({
      w: workspaceId,
      vm: "list",
      l: "15",
      sub: "false",
      own: "true",
      status: JSON.stringify(ACTIVE_STATUSES),
      sorts: JSON.stringify([{ field: "dueDate", direction: "asc" }]),
      db: midnight(0),
    })}`,
  );
  const tasks = (json?.data?.tasks ?? []).filter(
    (t) => !t.status || ACTIVE_STATUSES.includes(t.status),
  );
  const startOfToday = new Date(midnight(0));
  fill(
    $("tasks"),
    tasks.map((t) => {
      const overdue = t.dueDate && new Date(t.dueDate) < startOfToday;
      const meta = overdue
        ? new Date(t.dueDate).toLocaleDateString([], {
            day: "numeric",
            month: "short",
          })
        : "Today";
      return listItem(t.name, meta, {
        className: overdue ? "late" : "",
        status: overdue ? "DELAYED" : t.status,
        onClick: () => window.tusker.open(`${base}/w/${workspaceId}`),
      });
    }),
    "All clear for today",
  );
}

// ─── Notifications ───────────────────────────────────────────────────────────

async function loadNotifications() {
  const { json } = await api(
    `/api/v1/notifications?${qs({ workspaceId, limit: "8" })}`,
  );
  const list = json?.notifications ?? [];
  const unread = json?.unreadCount ?? 0;
  const url = `${base}/w/${workspaceId}/notifications`;

  $("unread").hidden = !unread;
  $("unread").textContent = unread;
  fill(
    $("notifications"),
    list.map((n) => {
      const isDm = n.type === "DM_MESSAGE" || n.entityType === "CONVERSATION";
      const targetUrl =
        isDm && n.entityId
          ? `${base}/w/${workspaceId}/myspace/conversations/${n.entityId}`
          : url;
      return listItem(
        n.title,
        new Date(n.createdAt).toLocaleDateString([], {
          day: "numeric",
          month: "short",
        }),
        {
          className: n.isRead ? "" : "unread",
          onClick: () => window.tusker.open(targetUrl),
        },
      );
    }),
    "No notifications",
  );

  if (seenNotifications) {
    for (const n of list) {
      if (!n.isRead && !seenNotifications.has(n.id)) {
        const isDm = n.type === "DM_MESSAGE" || n.entityType === "CONVERSATION";
        const targetUrl =
          isDm && n.entityId
            ? `${base}/w/${workspaceId}/myspace/conversations/${n.entityId}`
            : url;
        window.tusker.notify(n.title, n.body, targetUrl);
      }
    }
  }
  seenNotifications = new Set(list.map((n) => n.id));
  return unread;
}

// ─── Shell ───────────────────────────────────────────────────────────────────

async function refresh() {
  if (!workspaceId) return;
  const [, , , unread] = await Promise.all([
    loadAttendance(),
    loadMeeting(),
    loadTasks(),
    loadNotifications(),
  ]).catch(() => []);
  const state = await window.tusker.state();
  if (!state.signedIn) return showLogin();
  const att =
    attendance?.checkIn && !attendance?.checkOut
      ? `In ${duration(Date.now() - new Date(attendance.checkIn))}`
      : "";
  window.tusker.tooltip(
    ["Tusker", att, unread ? `${unread} unread` : ""]
      .filter(Boolean)
      .join(" · "),
  );
}

async function showApp() {
  $("login").hidden = true;
  $("app").hidden = false;
  const { json } = await api("/api/v1/workspaces");
  const d = json?.data;
  const workspaces =
    json?.workspaces ?? (Array.isArray(d) ? d : d?.workspaces) ?? [];
  if (!workspaces.length)
    return showLogin("No workspaces found for this account.");

  const state = await window.tusker.state();
  workspaceId = workspaces.some((w) => w.id === state.workspaceId)
    ? state.workspaceId
    : workspaces[0].id;
  const select = $("workspace");
  select.replaceChildren(
    ...workspaces.map(
      (w) => new Option(w.name, w.id, false, w.id === workspaceId),
    ),
  );
  select.hidden = workspaces.length < 2;

  await refresh();
  clearInterval(pollTimer);
  pollTimer = setInterval(refresh, POLL_MS);
}

async function showLogin(error = "") {
  clearInterval(pollTimer);
  workspaceId = null;
  seenNotifications = null;
  $("app").hidden = true;
  $("workspace").hidden = true;
  $("login").hidden = false;
  $("server").value = base;
  $("loginError").textContent = error;
}

$("loginForm").onsubmit = async (e) => {
  e.preventDefault();
  $("loginError").textContent = "";
  const res = await window.tusker.signIn(
    $("server").value,
    $("email").value,
    $("password").value,
  );
  if (!res.ok) return ($("loginError").textContent = res.error);
  $("password").value = "";
  base = (await window.tusker.state()).base;
  showApp();
};

$("workspace").onchange = (e) => {
  workspaceId = e.target.value;
  seenNotifications = null;
  window.tusker.setWorkspace(workspaceId);
  refresh();
};
$("attButton").onclick = toggleAttendance;
$("refresh").onclick = () => (workspaceId ? refresh() : null);
$("close").onclick = () => window.tusker.hide();
$("markRead").onclick = async () => {
  await api("/api/v1/notifications/mark-all-read", {
    method: "POST",
    body: { workspaceId },
  });
  loadNotifications();
};
$("signOut").onclick = async () => {
  await window.tusker.signOut();
  showLogin();
};

// Live timers between polls.
setInterval(() => {
  if (attendance?.checkIn && !attendance?.checkOut) renderAttendance();
  if (meeting) renderMeeting();
}, 30_000);

(async () => {
  const state = await window.tusker.state();
  base = state.base;
  state.signedIn ? showApp() : showLogin();
})();
