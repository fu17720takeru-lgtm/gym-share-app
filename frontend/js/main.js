// ローカル開発: "http://localhost:8000"
// 本番（Railway URL に変更）: "https://your-app.up.railway.app"
const API = "http://localhost:8000";

// ─── ストレージ ───────────────────────────────────────────

function getToken() { return localStorage.getItem("token"); }
function getUsername() { return localStorage.getItem("username"); }

function saveAuth(token, username) {
  localStorage.setItem("token", token);
  localStorage.setItem("username", username);
}

function clearAuth() {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
}

// ─── API ヘルパー ─────────────────────────────────────────

async function api(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = "Bearer " + token;
  const res = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "エラーが発生しました" }));
    throw new Error(err.detail || "エラーが発生しました");
  }
  return res.json();
}

// ─── 起動 ────────────────────────────────────────────────

window.addEventListener("load", () => {
  if (getToken()) {
    showMainScreen();
  } else {
    document.getElementById("auth-screen").style.display = "";
  }
});

// ─── 認証 ────────────────────────────────────────────────

function switchTab(tab) {
  document.getElementById("login-form").style.display = tab === "login" ? "" : "none";
  document.getElementById("register-form").style.display = tab === "register" ? "" : "none";
  document.getElementById("tab-login").classList.toggle("active", tab === "login");
  document.getElementById("tab-register").classList.toggle("active", tab === "register");
  document.getElementById("auth-error").textContent = "";
}

async function doLogin(e) {
  e.preventDefault();
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value;
  try {
    const data = await api("POST", "/api/login", { username, password });
    saveAuth(data.token, data.username);
    showMainScreen();
  } catch (err) {
    document.getElementById("auth-error").textContent = err.message;
  }
}

async function doRegister(e) {
  e.preventDefault();
  const username = document.getElementById("reg-username").value.trim();
  const password = document.getElementById("reg-password").value;
  try {
    const data = await api("POST", "/api/register", { username, password });
    saveAuth(data.token, data.username);
    showMainScreen();
  } catch (err) {
    document.getElementById("auth-error").textContent = err.message;
  }
}

function logout() {
  clearAuth();
  location.reload();
}

// ─── メイン画面初期化 ─────────────────────────────────────

async function showMainScreen() {
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("main-screen").style.display = "";
  document.getElementById("home-username").textContent = getUsername();

  // 今日の日付をデフォルトに
  document.getElementById("workout-date").value = new Date().toISOString().slice(0, 10);

  await loadGroups();
  await loadStreak();
  showPage("home");
}

// ─── ページ遷移 ──────────────────────────────────────────

function showPage(name) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));

  const page = document.getElementById("page-" + name);
  if (page) page.classList.add("active");

  const navBtn = document.getElementById("nav-" + name);
  if (navBtn) navBtn.classList.add("active");

  if (name === "home") loadTimeline();
  if (name === "calendar") { calYear = new Date().getFullYear(); calMonth = new Date().getMonth(); renderCalendar(); }
  if (name === "add-workout") { document.getElementById("exercises-container").innerHTML = ""; addExerciseRow(); }
  if (name === "groups") loadGroupList();
  if (name === "ranking") loadRanking();
}

// ─── グループ共通 ──────────────────────────────────────────

let groups = [];

async function loadGroups() {
  try {
    groups = await api("GET", "/api/groups");
    updateGroupSelects();
  } catch (_) {}
}

function updateGroupSelects() {
  const selects = ["group-select-home", "group-select-calendar", "group-select-ranking"];
  selects.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">グループを選択</option>';
    groups.forEach(g => {
      const opt = document.createElement("option");
      opt.value = g.id;
      opt.textContent = g.name;
      sel.appendChild(opt);
    });
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
    else if (groups.length > 0) sel.value = groups[0].id;
  });
}

// ─── ホーム（タイムライン）─────────────────────────────────

async function loadTimeline() {
  const groupId = document.getElementById("group-select-home").value;
  const container = document.getElementById("timeline");
  container.innerHTML = '<p class="empty-msg">読み込み中...</p>';
  try {
    let workouts;
    if (groupId) {
      workouts = await api("GET", `/api/groups/${groupId}/workouts`);
    } else {
      workouts = await api("GET", "/api/workouts/me");
    }
    if (workouts.length === 0) {
      container.innerHTML = '<p class="empty-msg">まだ記録がありません。筋トレして記録しよう！</p>';
      return;
    }
    container.innerHTML = workouts.map(w => renderWorkoutCard(w)).join("");
  } catch (err) {
    container.innerHTML = `<p class="empty-msg">${err.message}</p>`;
  }
}

function renderWorkoutCard(w) {
  const chips = w.exercises.map(ex =>
    `<span class="exercise-chip">${ex.exercise}${ex.weight ? ` ${ex.weight}kg` : ""}</span>`
  ).join("");
  return `
    <div class="workout-card">
      <div class="workout-card-header">
        <span class="workout-user">👤 ${w.username}</span>
        <span class="workout-date">${w.date}</span>
      </div>
      ${w.memo ? `<p class="workout-memo">${w.memo}</p>` : ""}
      <div class="exercise-chips">${chips}</div>
      <div class="workout-actions">
        <button class="action-btn ${w.liked ? "liked" : ""}" onclick="toggleLike(${w.id}, this)">
          ❤️ ${w.reaction_count}
        </button>
        <button class="action-btn" onclick="openComments(${w.id})">
          💬 ${w.comment_count}
        </button>
      </div>
    </div>
  `;
}

async function toggleLike(workoutId, btn) {
  try {
    const res = await api("POST", `/api/workouts/${workoutId}/reactions`);
    btn.classList.toggle("liked", res.liked);
    const count = parseInt(btn.textContent.match(/\d+/)[0]);
    btn.innerHTML = `❤️ ${res.liked ? count + 1 : count - 1}`;
  } catch (_) {}
}

// ─── コメント ─────────────────────────────────────────────

let activeWorkoutId = null;

async function openComments(workoutId) {
  activeWorkoutId = workoutId;
  const list = document.getElementById("comment-list");
  list.innerHTML = "";
  try {
    const comments = await api("GET", `/api/workouts/${workoutId}/comments`);
    if (comments.length === 0) {
      list.innerHTML = '<p class="empty-msg" style="padding:8px">まだコメントはありません</p>';
    } else {
      list.innerHTML = comments.map(c => `
        <div class="comment-item">
          <div class="comment-user">${c.username}</div>
          <div class="comment-text">${c.content}</div>
        </div>
      `).join("");
    }
  } catch (_) {}
  document.getElementById("comment-input").value = "";
  openModal("comment-modal");
}

async function submitComment(e) {
  e.preventDefault();
  const content = document.getElementById("comment-input").value.trim();
  if (!content || !activeWorkoutId) return;
  try {
    await api("POST", `/api/workouts/${activeWorkoutId}/comments`, { content });
    document.getElementById("comment-input").value = "";
    await openComments(activeWorkoutId);
    loadTimeline();
  } catch (_) {}
}

// ─── ストリーク ───────────────────────────────────────────

async function loadStreak() {
  try {
    const res = await api("GET", "/api/me/streak");
    const badge = document.getElementById("streak-badge");
    if (res.streak > 0) {
      badge.textContent = `🔥 ${res.streak}日連続`;
      badge.style.display = "";
    } else {
      badge.style.display = "none";
    }
  } catch (_) {}
}

// ─── カレンダー ───────────────────────────────────────────

let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calWorkoutDates = new Set();
let calEventDates = {};

async function loadCalendar() {
  const groupId = document.getElementById("group-select-calendar").value;
  calWorkoutDates = new Set();
  calEventDates = {};

  try {
    const workouts = groupId
      ? await api("GET", `/api/groups/${groupId}/workouts`)
      : await api("GET", "/api/workouts/me");
    workouts.forEach(w => calWorkoutDates.add(w.date));
  } catch (_) {}

  if (groupId) {
    try {
      const events = await api("GET", `/api/groups/${groupId}/events`);
      events.forEach(ev => {
        if (!calEventDates[ev.date]) calEventDates[ev.date] = [];
        calEventDates[ev.date].push(ev);
      });
    } catch (_) {}
  }

  renderCalendar();
}

function renderCalendar() {
  const label = document.getElementById("cal-month-label");
  label.textContent = `${calYear}年${calMonth + 1}月`;

  const grid = document.getElementById("calendar-grid");
  const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
  let html = dayNames.map(d => `<div class="cal-day-header">${d}</div>`).join("");

  const first = new Date(calYear, calMonth, 1);
  const last = new Date(calYear, calMonth + 1, 0);
  const today = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < first.getDay(); i++) {
    const d = new Date(calYear, calMonth, -first.getDay() + i + 1);
    html += `<div class="cal-day other-month">${d.getDate()}</div>`;
  }

  for (let day = 1; day <= last.getDate(); day++) {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    let cls = "cal-day";
    if (dateStr === today) cls += " today";
    if (calWorkoutDates.has(dateStr)) cls += " has-workout";
    if (calEventDates[dateStr]) cls += " has-event";
    html += `<div class="${cls}" onclick="showDayDetail('${dateStr}')">${day}</div>`;
  }

  const remaining = 7 - ((first.getDay() + last.getDate()) % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      html += `<div class="cal-day other-month">${i}</div>`;
    }
  }

  grid.innerHTML = html;
  renderEventList();
}

function renderEventList() {
  const container = document.getElementById("calendar-events");
  const allEvents = Object.values(calEventDates).flat();
  if (allEvents.length === 0) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = "<h4 style='margin-bottom:8px'>予定イベント</h4>" +
    allEvents.sort((a, b) => a.date.localeCompare(b.date)).map(ev => renderEventCard(ev)).join("");
}

function showDayDetail(dateStr) {
  const events = calEventDates[dateStr] || [];
  const container = document.getElementById("calendar-events");
  if (events.length > 0) {
    container.innerHTML = `<h4 style='margin-bottom:8px'>${dateStr} のイベント</h4>` +
      events.map(ev => renderEventCard(ev)).join("");
    container.scrollIntoView({ behavior: "smooth" });
  }
}

function renderEventCard(ev) {
  const goingSelected = ev.my_status === "going" ? "selected" : "";
  const notSelected = ev.my_status === "not_going" ? "selected" : "";
  return `
    <div class="event-card">
      <div class="event-title">${ev.title}</div>
      <div class="event-meta">${ev.date}${ev.location ? " · " + ev.location : ""} · 参加${ev.going_count}人</div>
      <div class="event-respond">
        <button class="${goingSelected}" onclick="respondEvent(${ev.id}, 'going', this)">参加する</button>
        <button class="${notSelected}" onclick="respondEvent(${ev.id}, 'not_going', this)">不参加</button>
      </div>
    </div>
  `;
}

async function respondEvent(eventId, status, btn) {
  try {
    await api("POST", `/api/events/${eventId}/respond`, { status });
    btn.parentElement.querySelectorAll("button").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
  } catch (_) {}
}

function changeMonth(delta) {
  calMonth += delta;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
}

// ─── 記録追加 ────────────────────────────────────────────

function addExerciseRow() {
  const container = document.getElementById("exercises-container");
  const row = document.createElement("div");
  row.className = "exercise-row";
  row.innerHTML = `
    <input class="input" type="text" placeholder="種目名" required />
    <input class="input num-input" type="number" placeholder="セット" min="1" />
    <input class="input num-input" type="number" placeholder="回数" min="1" />
    <input class="input num-input" type="number" placeholder="kg" min="0" step="0.5" />
    <button type="button" class="remove-btn" onclick="this.parentElement.remove()">×</button>
  `;
  container.appendChild(row);
}

async function submitWorkout(e) {
  e.preventDefault();
  const date = document.getElementById("workout-date").value;
  const memo = document.getElementById("workout-memo").value.trim();

  const exercises = [];
  document.querySelectorAll(".exercise-row").forEach(row => {
    const inputs = row.querySelectorAll("input");
    const exercise = inputs[0].value.trim();
    if (!exercise) return;
    exercises.push({
      exercise,
      sets: inputs[1].value ? parseInt(inputs[1].value) : null,
      reps: inputs[2].value ? parseInt(inputs[2].value) : null,
      weight: inputs[3].value ? parseFloat(inputs[3].value) : null,
    });
  });

  try {
    await api("POST", "/api/workouts", { date, memo, exercises });
    alert("記録しました！");
    document.getElementById("workout-memo").value = "";
    document.getElementById("exercises-container").innerHTML = "";
    addExerciseRow();
    await loadStreak();
    showPage("home");
  } catch (err) {
    alert(err.message);
  }
}

// ─── グループ ─────────────────────────────────────────────

let activeGroupId = null;

async function loadGroupList() {
  await loadGroups();
  document.getElementById("group-detail").style.display = "none";
  document.getElementById("group-list").style.display = "";
  const container = document.getElementById("group-list");
  if (groups.length === 0) {
    container.innerHTML = '<p class="empty-msg">グループに参加していません</p>';
    return;
  }
  container.innerHTML = groups.map(g => `
    <div class="group-card" onclick="openGroupDetail(${g.id}, '${g.name}', '${g.invite_code}')">
      <div>
        <div class="group-name">${g.name}</div>
        <div class="group-meta">メンバー ${g.member_count}人</div>
      </div>
      <span style="color:#ccc">›</span>
    </div>
  `).join("");
}

async function openGroupDetail(groupId, name, inviteCode) {
  activeGroupId = groupId;
  document.getElementById("group-list").style.display = "none";
  document.getElementById("group-detail").style.display = "";
  document.getElementById("group-detail-name").textContent = name;
  document.getElementById("group-invite-code").textContent = inviteCode;

  try {
    const members = await api("GET", `/api/groups/${groupId}/members`);
    document.getElementById("group-members-list").innerHTML = members.map(m => `
      <div class="member-row">
        <span class="member-name">👤 ${m.username}</span>
        <span class="member-role">${m.role === "owner" ? "オーナー" : "メンバー"}</span>
      </div>
    `).join("");
  } catch (_) {}

  await loadGroupEvents(groupId);
}

async function loadGroupEvents(groupId) {
  try {
    const events = await api("GET", `/api/groups/${groupId}/events`);
    const container = document.getElementById("group-events-list");
    if (events.length === 0) {
      container.innerHTML = '<p class="empty-msg" style="padding:8px 0">イベントはありません</p>';
    } else {
      container.innerHTML = events.map(ev => renderEventCard(ev)).join("");
    }
  } catch (_) {}
}

function closeGroupDetail() {
  activeGroupId = null;
  document.getElementById("group-detail").style.display = "none";
  document.getElementById("group-list").style.display = "";
}

async function createGroup(e) {
  e.preventDefault();
  const name = document.getElementById("new-group-name").value.trim();
  const description = document.getElementById("new-group-desc").value.trim();
  try {
    const g = await api("POST", "/api/groups", { name, description });
    closeAllModals();
    document.getElementById("new-group-name").value = "";
    document.getElementById("new-group-desc").value = "";
    await loadGroupList();
    alert(`グループ「${g.name}」を作成しました\n招待コード: ${g.invite_code}`);
  } catch (err) {
    alert(err.message);
  }
}

async function joinGroup(e) {
  e.preventDefault();
  const invite_code = document.getElementById("join-invite-code").value.trim();
  try {
    const res = await api("POST", "/api/groups/join", { invite_code });
    closeAllModals();
    document.getElementById("join-invite-code").value = "";
    await loadGroupList();
    alert(res.message);
  } catch (err) {
    alert(err.message);
  }
}

async function createEvent(e) {
  e.preventDefault();
  if (!activeGroupId) return;
  const title = document.getElementById("event-title").value.trim();
  const date = document.getElementById("event-date").value;
  const location = document.getElementById("event-location").value.trim();
  const description = document.getElementById("event-desc").value.trim();
  try {
    await api("POST", `/api/groups/${activeGroupId}/events`, { title, date, location, description });
    closeAllModals();
    document.getElementById("event-title").value = "";
    document.getElementById("event-date").value = "";
    document.getElementById("event-location").value = "";
    document.getElementById("event-desc").value = "";
    await loadGroupEvents(activeGroupId);
  } catch (err) {
    alert(err.message);
  }
}

// ─── ランキング ───────────────────────────────────────────

async function loadRanking() {
  const groupId = document.getElementById("group-select-ranking").value;
  const container = document.getElementById("ranking-list");
  if (!groupId) {
    container.innerHTML = '<p class="empty-msg">グループを選択してください</p>';
    return;
  }
  try {
    const ranking = await api("GET", `/api/groups/${groupId}/ranking`);
    const medals = ["gold", "silver", "bronze"];
    container.innerHTML = ranking.map((r, i) => {
      const medalCls = medals[i] || "";
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`;
      return `
        <div class="rank-row">
          <div class="rank-num ${medalCls}">${medal}</div>
          <div class="rank-name">${r.username}</div>
          <div class="rank-count">${r.workout_count}回</div>
        </div>
      `;
    }).join("");
    if (ranking.length === 0) {
      container.innerHTML = '<p class="empty-msg">記録がありません</p>';
    }
  } catch (err) {
    container.innerHTML = `<p class="empty-msg">${err.message}</p>`;
  }
}

// ─── モーダル ─────────────────────────────────────────────

function openModal(id) {
  document.getElementById("modal-backdrop").style.display = "";
  document.getElementById(id).style.display = "";
}

function closeAllModals() {
  document.getElementById("modal-backdrop").style.display = "none";
  document.querySelectorAll(".modal").forEach(m => (m.style.display = "none"));
}
