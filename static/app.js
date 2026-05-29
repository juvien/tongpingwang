const state = {
  user: null,
  profile: null,
  activities: [],
  selectedActivityId: null,
};

const authJump = document.getElementById("auth-jump");
const logoutButton = document.getElementById("logout-button");
const adminLink = document.getElementById("admin-link");
const registerForm = document.getElementById("register-form");
const loginForm = document.getElementById("login-form");
const profileForm = document.getElementById("profile-form");
const quizForm = document.getElementById("quiz-form");
const intentForm = document.getElementById("intent-form");
const leadForm = document.getElementById("lead-form");
const presaleForm = document.getElementById("presale-form");
const activityNoteForm = document.getElementById("activity-note-form");
const dashboardPanel = document.getElementById("dashboard-panel");
const activityGrid = document.getElementById("activity-grid");

document.querySelectorAll("[data-scroll]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector(button.dataset.scroll)?.scrollIntoView({ behavior: "smooth" });
  });
});

authJump.addEventListener("click", () => {
  document.getElementById("auth-panel")?.scrollIntoView({ behavior: "smooth" });
});

logoutButton.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  state.user = null;
  state.profile = null;
  syncAuthUI();
  toast("已退出登录");
});

document.querySelectorAll(".auth-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".auth-tab").forEach((el) => el.classList.remove("is-active"));
    tab.classList.add("is-active");
    const current = tab.dataset.authTab;
    registerForm.classList.toggle("hidden", current !== "register");
    loginForm.classList.toggle("hidden", current !== "login");
  });
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(registerForm);
  const payload = Object.fromEntries(formData.entries());
  const result = await api("/api/auth/register", "POST", payload, "register-message");
  if (result?.user) {
    state.user = result.user;
    await loadDashboard();
    syncAuthUI();
    toast("注册成功，欢迎加入同频局");
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const payload = Object.fromEntries(formData.entries());
  const result = await api("/api/auth/login", "POST", payload, "login-message");
  if (result?.user) {
    state.user = result.user;
    await loadDashboard();
    syncAuthUI();
    toast("登录成功");
  }
});

leadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(leadForm).entries());
  const result = await api("/api/leads", "POST", payload, "lead-message");
  if (result?.ok) {
    leadForm.reset();
    setMessage("lead-message", "报名已收到，我们会优先联系你。", true);
  }
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!ensureLogin("先注册或登录，再保存资料。")) return;
  const payload = serializeProfileForm();
  const result = await api("/api/profile", "POST", payload, "profile-message");
  if (result?.profile) {
    state.profile = result.profile;
    hydrateProfile(result.profile);
    syncDashboardState();
    setMessage("profile-message", "资料已保存，下一步去完成同频测试。", true);
  }
});

quizForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!ensureLogin("先注册或登录，再生成测试结果。")) return;
  const answers = Object.fromEntries(new FormData(quizForm).entries());
  const result = await api("/api/test", "POST", { answers }, "quiz-message");
  if (result?.result) {
    state.profile = state.profile || {};
    state.profile.test_result = result.result;
    renderResult(result.result);
    syncDashboardState();
    setMessage("quiz-message", "同频画像已生成。", true);
  }
});

intentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!ensureLogin("先注册或登录，再提交匹配意向。")) return;
  const payload = Object.fromEntries(new FormData(intentForm).entries());
  const result = await api("/api/match-intent", "POST", payload, "intent-message");
  if (result?.match_intent) {
    state.profile = state.profile || {};
    state.profile.match_intent = result.match_intent;
    setMessage("intent-message", "匹配意向已提交，运营会据此安排活动和撮合。", true);
  }
});

presaleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!ensureLogin("请先注册或登录，再生成早鸟记录。")) return;
  const payload = Object.fromEntries(new FormData(presaleForm).entries());
  payload.amount = Number(payload.amount);
  const result = await api("/api/presales", "POST", payload, "presale-message");
  if (result?.ok) {
    setMessage("presale-message", "早鸟记录已生成，客服会与你确认权益和支付方式。", true);
    await loadDashboard();
  }
});

activityNoteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!ensureLogin("请先注册或登录，再报名活动。")) return;
  const formData = new FormData(activityNoteForm);
  const activityId = formData.get("activity_id");
  const note = formData.get("note");
  const result = await api(`/api/activities/${activityId}/signup`, "POST", { note }, "activity-message");
  if (result?.ok) {
    setMessage("activity-message", "活动报名成功，运营会在社群里和你对接。", true);
    activityNoteForm.reset();
    activityNoteForm.classList.add("hidden");
    await loadDashboard();
  }
});

async function bootstrap() {
  await loadActivities();
  await loadSupport();
  const me = await fetch("/api/auth/me").then((res) => res.json());
  if (me.user) {
    state.user = me.user;
    await loadDashboard();
  }
  syncAuthUI();
}

async function loadDashboard() {
  const result = await fetch("/api/dashboard").then((res) => res.json());
  state.user = result.user;
  state.profile = result.profile || {};
  state.activitySignups = result.activity_signups || [];
  state.presales = result.presales || [];
  hydrateProfile(result.profile || {});
  renderResult(result.profile?.test_result || null);
  syncDashboardState();
}

async function loadActivities() {
  const result = await fetch("/api/activities").then((res) => res.json());
  state.activities = result.activities || [];
  activityGrid.innerHTML = "";
  state.activities.forEach((activity) => {
    const tone = activityTone(activity);
    const card = document.createElement("article");
    card.className = "activity-card";
    card.style.background = tone.background;
    card.innerHTML = `
      <div class="activity-meta">
        <span>${activity.city}</span>
        <span>${activity.theme}</span>
        <span>${activity.date_label}</span>
      </div>
      <div>
        <h3>${activity.title}</h3>
        <p>${activity.description}</p>
      </div>
      <div class="activity-tags">
        <span>${tone.fit}</span>
        <span>${tone.value}</span>
      </div>
      <div class="activity-meta">
        <span>${activity.location}</span>
        <span>¥${activity.price}</span>
        <span>${activity.signup_count}/${activity.capacity} 已报名</span>
      </div>
      <button class="ghost-button activity-apply">${tone.cta}</button>
    `;
    card.querySelector(".activity-apply").addEventListener("click", () => {
      if (!ensureLogin("请先注册或登录，再报名活动。")) return;
      document.getElementById("activity-note-title").textContent = `报名活动：${activity.title}`;
      activityNoteForm.querySelector('input[name="activity_id"]').value = activity.id;
      activityNoteForm.classList.remove("hidden");
      activityNoteForm.scrollIntoView({ behavior: "smooth" });
    });
    activityGrid.appendChild(card);
  });
}

async function loadSupport() {
  const result = await fetch("/api/support").then((res) => res.json());
  const support = result.support;
  document.getElementById("support-wechat").textContent = support.wechat;
  document.getElementById("support-hours").textContent = support.hours;
  document.getElementById("support-copy").textContent = support.message;
}

function syncAuthUI() {
  const loggedIn = Boolean(state.user);
  dashboardPanel.classList.toggle("hidden", !loggedIn);
  logoutButton.classList.toggle("hidden", !loggedIn);
  adminLink.classList.toggle("hidden", !(loggedIn && state.user.role === "admin"));
  authJump.textContent = loggedIn ? "已登录" : "注册 / 登录";
  authJump.disabled = loggedIn;
}

function syncDashboardState() {
  if (!state.user) return;
  document.getElementById("welcome-text").textContent = `你好，${state.user.name}`;
  document.getElementById("signup-count").textContent = String((state.activitySignups || []).length);
  document.getElementById("presale-count").textContent = String((state.presales || []).length);
  document.getElementById("review-pill").textContent = `资料审核：${humanReview(state.profile?.review_status)}`;
  document.getElementById("match-pill").textContent = `匹配进度：${humanMatch(state.profile?.match_status)}`;
  document.getElementById("result-title").textContent = state.profile?.test_result?.title || "未测试";
}

function hydrateProfile(profile) {
  if (!profile) return;
  profileForm.nickname.value = profile.nickname || "";
  profileForm.birth_year.value = profile.birth_year || "";
  profileForm.city.value = profile.city || state.user?.city || "";
  profileForm.bio.value = profile.bio || "";
  profileForm.communication_style.value = profile.communication_style || "slow-warm";
  profileForm.favorite_scene.value = profile.favorite_scene || "cafe";
  profileForm.availability.value = profile.availability || "weekday-night";
  profileForm.budget_preference.value = profile.budget_preference || "light";
  setChecked(profileForm, "goals", profile.goals || []);
  setChecked(profileForm, "interests", profile.interests || []);
  if (profile.test_answers) {
    Object.entries(profile.test_answers).forEach(([key, value]) => {
      if (quizForm[key]) quizForm[key].value = value;
    });
  }
  if (profile.match_intent) {
    Object.entries(profile.match_intent).forEach(([key, value]) => {
      if (intentForm[key]) intentForm[key].value = value;
    });
  }
}

function renderResult(result) {
  if (!result || !result.title) return;
  document.getElementById("result-archetype").textContent = result.archetype;
  document.getElementById("result-heading").textContent = `${result.title}：把心动放进适合你的节奏里`;
  document.getElementById("result-summary").textContent = result.summary;
  document.getElementById("result-match").textContent = result.best_match;
  document.getElementById("result-title").textContent = result.title;
  const list = document.getElementById("result-suggestions");
  list.innerHTML = "";
  (result.suggestions || []).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  });
}

function activityTone(activity) {
  const title = `${activity.title}${activity.theme}`;
  if (title.includes("胶片") || title.includes("摄影") || title.includes("散步")) {
    return {
      background: "linear-gradient(155deg, #3b183f, #147d75)",
      fit: "适合慢热、喜欢边走边聊的人",
      value: "运营会安排轻任务破冰",
      cta: "预约一个不尴尬的散步位",
    };
  }
  if (title.includes("市集")) {
    return {
      background: "linear-gradient(155deg, #ef6f61, #8c3f61)",
      fit: "适合喜欢热闹但不想硬聊的人",
      value: "先逛摊，再自然组队聊天",
      cta: "报名市集轻约会",
    };
  }
  if (title.includes("livehouse") || title.includes("演出")) {
    return {
      background: "linear-gradient(155deg, #191724, #b9824b)",
      fit: "适合靠歌单和现场感破冰的人",
      value: "演出前先组小队降低陌生感",
      cta: "加入演出预热小队",
    };
  }
  return {
    background: `linear-gradient(155deg, ${activity.hero_color}, rgba(25, 23, 36, 0.95))`,
    fit: "适合想先从活动搭子开始的人",
    value: "小组制活动，节奏更友好",
    cta: "报名这个城市局",
  };
}

function setChecked(form, name, values) {
  form.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
    input.checked = values.includes(input.value);
  });
}

function serializeProfileForm() {
  const formData = new FormData(profileForm);
  return {
    nickname: formData.get("nickname"),
    birth_year: Number(formData.get("birth_year")) || null,
    city: formData.get("city"),
    bio: formData.get("bio"),
    goals: formData.getAll("goals"),
    interests: formData.getAll("interests"),
    communication_style: formData.get("communication_style"),
    favorite_scene: formData.get("favorite_scene"),
    availability: formData.get("availability"),
    budget_preference: formData.get("budget_preference"),
  };
}

async function api(url, method, payload, messageId) {
  setMessage(messageId, "处理中…");
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) {
    setMessage(messageId, humanError(result.error || "请求失败"));
    return null;
  }
  setMessage(messageId, "");
  return result;
}

function ensureLogin(message) {
  if (state.user) return true;
  toast(message);
  document.getElementById("auth-panel")?.scrollIntoView({ behavior: "smooth" });
  return false;
}

function humanReview(status) {
  return {
    pending: "待审核",
    approved: "已通过",
    flagged: "需人工复核",
  }[status] || "待完善";
}

function humanMatch(status) {
  return {
    new: "未开始",
    shortlisted: "已加入候选池",
    invited: "已邀请进群 / 活动",
    active: "已进入撮合",
    hold: "暂缓",
  }[status] || "未开始";
}

function humanError(code) {
  return {
    missing_fields: "请把必填项补全。",
    weak_password: "密码至少需要 6 位。",
    email_exists: "这个邮箱已经注册过了。",
    invalid_credentials: "邮箱或密码不正确。",
    auth_required: "需要先登录。",
    already_signed: "你已经报名过这个活动了。",
    invalid_presale: "请选择有效的早鸟权益。",
  }[code] || "请求没有成功，请再试一次。";
}

function setMessage(id, text, success = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.style.color = success ? "var(--success)" : "var(--muted)";
}

function toast(text) {
  const id = `toast-${Date.now()}`;
  const box = document.createElement("div");
  box.id = id;
  box.textContent = text;
  Object.assign(box.style, {
    position: "fixed",
    right: "18px",
    bottom: "18px",
    background: "rgba(31, 34, 51, 0.92)",
    color: "white",
    padding: "12px 16px",
    borderRadius: "14px",
    zIndex: "99",
    boxShadow: "0 12px 24px rgba(0,0,0,.18)",
  });
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 2200);
}

bootstrap();
