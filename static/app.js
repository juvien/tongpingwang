const state = {
  user: null,
  profile: null,
  activities: [],
  selectedActivityId: null,
  staticMode: location.protocol === "file:" || location.hostname.endsWith("github.io"),
};

const staticStoreKey = "tongpin-static-demo";
const demoActivities = [
  {
    id: 1,
    title: "海盐胶片散步局",
    city: "上海",
    theme: "摄影漫步",
    date_label: "周六 14:00",
    location: "武康路口袋花园",
    price: 59,
    capacity: 18,
    signup_count: 7,
    description: "适合喜欢胶片、咖啡和慢节奏散步的同城认识活动，现场会有破冰卡和双人拍照任务。",
    hero_color: "#ff7d66",
  },
  {
    id: 2,
    title: "夜光市集轻约会",
    city: "杭州",
    theme: "市集社交",
    date_label: "周五 19:30",
    location: "天目里草坪",
    price: 49,
    capacity: 24,
    signup_count: 11,
    description: "围绕手作摊位、城市音乐和同频问答展开，适合第一次认识的人自然聊天。",
    hero_color: "#0f8f84",
  },
  {
    id: 3,
    title: "耳机共享 livehouse 预热局",
    city: "成都",
    theme: "演出前破冰",
    date_label: "周日 18:30",
    location: "东郊记忆南门",
    price: 39,
    capacity: 16,
    signup_count: 6,
    description: "用歌单和现场偏好破冰，先认识一小队愿意一起去现场的人。",
    hero_color: "#b9824b",
  },
];

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
const postLoginJourney = document.getElementById("post-login-journey");
const postLoginTitle = document.getElementById("post-login-title");
const postLoginSubtitle = document.getElementById("post-login-subtitle");
const threadPreview = document.getElementById("thread-preview");

const threadContent = {
  profile: {
    tab: "资料摘要",
    title: "先把边界和兴趣说清楚",
    body: "资料页会把你的兴趣、空闲时间、关系期待和安全边界整理成运营可读的邀请函。",
    metrics: [["8", "个兴趣标签"], ["4", "类关系期待"], ["1", "份安全边界"]],
  },
  test: {
    tab: "同频画像",
    title: "你更适合低压、可退出的白天局",
    body: "轻测试会把你的节奏翻译成可执行建议，比如先从摄影散步、市集巡游或展览书店开始。",
    metrics: [["3", "个推荐现场"], ["72%", "同频概率"], ["1", "个社群入口"]],
  },
  event: {
    tab: "活动建议",
    title: "把第一次开口放进真实现场",
    body: "城市活动会用小组制、破冰任务和人工提醒，降低陌生人第一次见面的尴尬感。",
    metrics: [["24", "人以内小局"], ["3", "个破冰任务"], ["12h", "内客服响应"]],
  },
};

document.querySelectorAll("[data-scroll]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector(button.dataset.scroll)?.scrollIntoView({ behavior: "smooth" });
  });
});

document.querySelectorAll(".thread-toggle").forEach((button) => {
  button.addEventListener("click", () => {
    updateThreadPreview(button.dataset.thread);
  });
});

authJump.addEventListener("click", () => {
  document.getElementById("auth-panel")?.scrollIntoView({ behavior: "smooth" });
});

logoutButton.addEventListener("click", async () => {
  if (state.staticMode) {
    const data = loadStaticStore();
    data.currentUserEmail = null;
    saveStaticStore(data);
  } else {
    await fetch("/api/auth/logout", { method: "POST" });
  }
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
    updatePostLoginJourney(true);
    postLoginJourney?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    updatePostLoginJourney(false);
    postLoginJourney?.scrollIntoView({ behavior: "smooth", block: "start" });
    toast("登录成功，已为你打开下一步页面");
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
  const me = await getJson("/api/auth/me", getStaticMe);
  if (me.user) {
    state.user = me.user;
    await loadDashboard();
  }
  syncAuthUI();
}

async function loadDashboard() {
  const result = await getJson("/api/dashboard", getStaticDashboard);
  state.user = result.user;
  state.profile = result.profile || {};
  state.activitySignups = result.activity_signups || [];
  state.presales = result.presales || [];
  hydrateProfile(result.profile || {});
  renderResult(result.profile?.test_result || null);
  syncDashboardState();
  updatePostLoginJourney(false);
}

async function loadActivities() {
  const result = await getJson("/api/activities", () => ({ activities: demoActivities }));
  state.activities = result.activities || [];
  activityGrid.innerHTML = "";
  state.activities.forEach((activity) => {
    const tone = activityTone(activity);
    const card = document.createElement("article");
    card.className = "activity-card";
    card.style.setProperty("--activity-position", tone.position);
    card.innerHTML = `
      <img class="activity-card__image" src="static/assets/hero-v2.png" alt="${activity.title}现场氛围图" />
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
  const result = await getJson("/api/support", () => ({
    support: {
      wechat: "TongPinClub",
      hours: "每日 12:00 - 22:00",
      message: "添加客服后备注“同频局”，我们会把你拉入对应城市的兴趣社群。",
    },
  }));
  const support = result.support;
  document.getElementById("support-wechat").textContent = support.wechat;
  document.getElementById("support-hours").textContent = support.hours;
  document.getElementById("support-copy").textContent = support.message;
}

function syncAuthUI() {
  const loggedIn = Boolean(state.user);
  dashboardPanel.classList.toggle("hidden", !loggedIn);
  postLoginJourney.classList.toggle("hidden", !loggedIn);
  logoutButton.classList.toggle("hidden", !loggedIn);
  adminLink.classList.toggle("hidden", !(loggedIn && state.user.role === "admin"));
  authJump.textContent = loggedIn ? "已登录" : "注册 / 登录";
  authJump.disabled = loggedIn;
}

function updatePostLoginJourney(isNewUser) {
  if (!state.user) return;
  const name = state.user.name || "你";
  if (isNewUser) {
    postLoginTitle.textContent = `${name}，欢迎你加入同频局。先完成这三步，我们就能开始给你精准匹配。`;
    postLoginSubtitle.textContent = "你刚完成注册，建议先完善资料和测试，再去报名城市现场。";
    return;
  }
  postLoginTitle.textContent = `${name}，欢迎回来，今天继续推进你的同频进度。`;
  postLoginSubtitle.textContent = "先补全资料和测试，再去活动区挑一个你愿意参加的场景。";
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
      position: "58% center",
      fit: "适合慢热、喜欢边走边聊的人",
      value: "运营会安排轻任务破冰",
      cta: "预约一个不尴尬的散步位",
    };
  }
  if (title.includes("市集")) {
    return {
      position: "46% center",
      fit: "适合喜欢热闹但不想硬聊的人",
      value: "先逛摊，再自然组队聊天",
      cta: "报名市集轻约会",
    };
  }
  if (title.includes("livehouse") || title.includes("演出")) {
    return {
      position: "72% center",
      fit: "适合靠歌单和现场感破冰的人",
      value: "演出前先组小队降低陌生感",
      cta: "加入演出预热小队",
    };
  }
  return {
    position: "center",
    fit: "适合想先从活动搭子开始的人",
    value: "小组制活动，节奏更友好",
    cta: "报名这个城市局",
  };
}

function updateThreadPreview(key) {
  const content = threadContent[key] || threadContent.test;
  document.querySelectorAll(".thread-steps article").forEach((article) => {
    const button = article.querySelector(".thread-toggle");
    const active = button?.dataset.thread === key;
    article.classList.toggle("is-active", active);
    if (button) button.textContent = active ? "×" : "+";
  });
  if (!threadPreview) return;
  threadPreview.querySelector(".preview-tabs").innerHTML = `
    <span class="${content.tab === "资料摘要" ? "is-active" : ""}">资料摘要</span>
    <span class="${content.tab === "同频画像" ? "is-active" : ""}">同频画像</span>
    <span class="${content.tab === "活动建议" ? "is-active" : ""}">活动建议</span>
  `;
  threadPreview.querySelector(".preview-card").innerHTML = `
    <small>Engagement signal</small>
    <strong>${content.title}</strong>
    <p>${content.body}</p>
  `;
  threadPreview.querySelector(".preview-metrics").innerHTML = content.metrics
    .map(([value, label]) => `<span><strong>${value}</strong>${label}</span>`)
    .join("");
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
  try {
    if (state.staticMode) {
      const localResult = localApi(url, payload);
      if (localResult?.error) {
        setMessage(messageId, humanError(localResult.error));
        return null;
      }
      setMessage(messageId, "");
      return localResult;
    }
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
  } catch (error) {
    state.staticMode = true;
    const localResult = localApi(url, payload);
    if (localResult?.error) {
      setMessage(messageId, humanError(localResult.error));
      return null;
    }
    setMessage(messageId, "");
    return localResult;
  }
}

async function getJson(url, fallbackFactory) {
  try {
    if (state.staticMode) return fallbackFactory();
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    state.staticMode = true;
    return fallbackFactory();
  }
}

function loadStaticStore() {
  const raw = localStorage.getItem(staticStoreKey);
  if (!raw) {
    return { users: [], leads: [], activitySignups: [], presales: [], currentUserEmail: null };
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    return { users: [], leads: [], activitySignups: [], presales: [], currentUserEmail: null };
  }
}

function saveStaticStore(data) {
  localStorage.setItem(staticStoreKey, JSON.stringify(data));
}

function getStaticMe() {
  const data = loadStaticStore();
  const user = data.users.find((item) => item.email === data.currentUserEmail);
  return { user: user ? publicUser(user) : null };
}

function getStaticDashboard() {
  const data = loadStaticStore();
  const user = data.users.find((item) => item.email === data.currentUserEmail);
  if (!user) return { user: null, profile: {}, activity_signups: [], presales: [] };
  return {
    user: publicUser(user),
    profile: user.profile || {},
    activity_signups: data.activitySignups.filter((item) => item.user_email === user.email),
    presales: data.presales.filter((item) => item.user_email === user.email),
  };
}

function localApi(url, payload) {
  const data = loadStaticStore();
  if (url === "/api/auth/register") {
    if (!payload.name || !payload.email || !payload.password || !payload.city) return { error: "missing_fields" };
    if (payload.password.length < 6) return { error: "weak_password" };
    let user = data.users.find((item) => item.email === payload.email);
    if (!user) {
      user = {
        id: Date.now(),
        name: payload.name,
        email: payload.email,
        city: payload.city,
        role: "user",
        password: payload.password,
        profile: { city: payload.city, review_status: "pending", match_status: "new" },
      };
      data.users.push(user);
    }
    data.currentUserEmail = user.email;
    saveStaticStore(data);
    return { user: publicUser(user) };
  }
  if (url === "/api/auth/login") {
    const user = data.users.find((item) => item.email === payload.email && item.password === payload.password);
    if (!user) return { error: "invalid_credentials" };
    data.currentUserEmail = user.email;
    saveStaticStore(data);
    return { user: publicUser(user) };
  }
  if (url === "/api/leads") {
    data.leads.push({ ...payload, id: Date.now(), created_at: new Date().toISOString() });
    saveStaticStore(data);
    return { ok: true };
  }

  const user = data.users.find((item) => item.email === data.currentUserEmail);
  if (!user) return { error: "auth_required" };

  if (url === "/api/profile") {
    user.profile = {
      ...(user.profile || {}),
      ...payload,
      primary_tags: (payload.interests || []).slice(0, 3).join(","),
      updated_at: new Date().toISOString(),
      review_status: "pending",
      match_status: "new",
    };
    saveStaticStore(data);
    return { profile: user.profile };
  }
  if (url === "/api/test") {
    const result = summarizeLocalResult(payload.answers || {}, user.profile?.interests || []);
    user.profile = { ...(user.profile || {}), test_answers: payload.answers || {}, test_result: result };
    saveStaticStore(data);
    return { result };
  }
  if (url === "/api/match-intent") {
    user.profile = { ...(user.profile || {}), match_intent: payload, match_status: "shortlisted" };
    saveStaticStore(data);
    return { match_intent: payload };
  }
  if (url === "/api/presales") {
    data.presales.push({ ...payload, id: Date.now(), user_email: user.email, status: "intent_confirmed" });
    saveStaticStore(data);
    return { ok: true };
  }
  if (url.includes("/api/activities/") && url.endsWith("/signup")) {
    const activityId = Number(url.split("/")[3]);
    const exists = data.activitySignups.some((item) => item.user_email === user.email && item.activity_id === activityId);
    if (!exists) {
      data.activitySignups.push({ id: Date.now(), user_email: user.email, activity_id: activityId, note: payload.note || "" });
    }
    saveStaticStore(data);
    return { ok: true };
  }
  return { ok: true };
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, city: user.city, role: user.role };
}

function summarizeLocalResult(answers, interests) {
  const picks = interests.length ? interests.slice(0, 3) : ["同城活动", "轻松聊天", "共同兴趣"];
  const scene = answers.scene || "cafe";
  if (scene === "exhibition" || scene === "bookstore") {
    return {
      archetype: "Harbor",
      title: "安静靠岸型",
      summary: "你更适合从轻松陪伴开始，先建立安全感，再慢慢进入更深的连接。",
      best_match: "适合和会认真回复、愿意约白天局的人建立关系。",
      suggestions: [`优先尝试 ${picks[0]} 相关活动。`, "破冰时先聊最近一次线下体验。", "首次见面尽量选择公开场合。"],
    };
  }
  return {
    archetype: "Vinyl",
    title: "氛围唱片型",
    summary: "你在场景感和情绪共振里最容易心动，线下活动和圈层共同体验会更有效。",
    best_match: "适合配对愿意一起逛展、看演出、参加主题局的人。",
    suggestions: [`优先尝试 ${picks[0]} 相关活动。`, "用共同兴趣开场会比硬聊关系更自然。", "把第一次见面放进具体场景里。"],
  };
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
    borderRadius: "8px",
    zIndex: "99",
    boxShadow: "0 12px 24px rgba(0,0,0,.18)",
  });
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 2200);
}

updateThreadPreview("test");
bootstrap();
