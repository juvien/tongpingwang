const state = {
  user: null,
  profile: null,
  activities: [],
  selectedActivityId: null,
  selectedActivity: null,
  socialUsers: [],
  relations: { incoming: [], outgoing: [], friends: [] },
  activeChatUser: null,
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
    image: "assets/activity-film-walk.jpg",
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
    image: "assets/activity-night-market.jpg",
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
    image: "assets/activity-livehouse.jpg",
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
const activityDrawer = document.getElementById("activity-drawer");
const scrollProgress = document.getElementById("scroll-progress");
const navLinks = Array.from(document.querySelectorAll(".site-nav a"));
const socialHub = document.getElementById("social-hub");
const socialSearchForm = document.getElementById("social-search-form");
const socialRefresh = document.getElementById("social-refresh");
const socialUserGrid = document.getElementById("social-user-grid");
const incomingRequests = document.getElementById("incoming-requests");
const outgoingRequests = document.getElementById("outgoing-requests");
const friendList = document.getElementById("friend-list");
const chatDrawer = document.getElementById("chat-drawer");
const chatMessages = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");

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

document.querySelectorAll("[data-password-toggle]").forEach((button) => {
  button.addEventListener("click", () => {
    const input = button.parentElement?.querySelector("input");
    if (!input) return;
    const visible = input.type === "text";
    input.type = visible ? "password" : "text";
    button.textContent = visible ? "显示" : "隐藏";
  });
});

document.querySelectorAll("[data-close-activity]").forEach((button) => {
  button.addEventListener("click", closeActivityDrawer);
});

document.querySelectorAll("[data-close-chat]").forEach((button) => {
  button.addEventListener("click", closeChatDrawer);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeActivityDrawer();
    closeChatDrawer();
  }
});

window.addEventListener("scroll", updateScrollState, { passive: true });

document.querySelectorAll(".thread-toggle").forEach((button) => {
  button.addEventListener("click", () => {
    updateThreadPreview(button.dataset.thread);
  });
});

authJump.addEventListener("click", () => {
  document.getElementById("auth-panel")?.scrollIntoView({ behavior: "smooth" });
});

socialSearchForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await loadSocialUsers(new URLSearchParams(new FormData(socialSearchForm)).toString());
});

socialRefresh?.addEventListener("click", async () => {
  await loadSocialHub();
});

chatForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(chatForm).entries());
  payload.receiver_id = Number(payload.receiver_id);
  const result = await api("/api/social/messages", "POST", payload, "chat-message");
  if (result?.message) {
    chatForm.body.value = "";
    await loadMessages(payload.receiver_id);
  }
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
    await loadSocialHub();
    syncAuthUI();
    updatePostLoginJourney(true);
    socialHub?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    await loadSocialHub();
    syncAuthUI();
    updatePostLoginJourney(false);
    socialHub?.scrollIntoView({ behavior: "smooth", block: "start" });
    toast("登录成功，已为你打开同频大厅");
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
  if (!state.user) {
    closeActivityDrawer();
    ensureLogin("请先注册或登录，再报名活动。");
    return;
  }
  const formData = new FormData(activityNoteForm);
  const activityId = formData.get("activity_id");
  const note = formData.get("note");
  const result = await api(`/api/activities/${activityId}/signup`, "POST", { note }, "activity-message");
  if (result?.ok) {
    setMessage("activity-message", "活动报名成功，运营会在社群里和你对接。", true);
    activityNoteForm.reset();
    setTimeout(closeActivityDrawer, 900);
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
    await loadSocialHub();
  }
  syncAuthUI();
  setupReveals();
  setupActiveNav();
  updateScrollState();
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
    card.tabIndex = 0;
    card.dataset.reveal = "";
    card.style.setProperty("--activity-position", tone.position);
    const imageSrc = activity.image || tone.image;
    card.innerHTML = `
      <img class="activity-card__image" src="${imageSrc}" alt="${activity.title}现场氛围图" />
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
      openActivityDrawer(activity, tone);
    });
    card.addEventListener("click", (event) => {
      if (event.target.closest(".activity-apply")) return;
      openActivityDrawer(activity, tone);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openActivityDrawer(activity, tone);
      }
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

async function loadSocialHub() {
  if (!state.user) return;
  await Promise.all([loadSocialUsers(), loadSocialRelations()]);
}

async function loadSocialUsers(queryString = "") {
  if (!state.user || !socialUserGrid) return;
  const suffix = queryString ? `?${queryString}` : "";
  socialUserGrid.innerHTML = `<div class="social-empty">正在整理同频用户…</div>`;
  const result = await getJson(`/api/social/users${suffix}`, () => getStaticSocialUsers(queryString));
  state.socialUsers = result.users || [];
  renderSocialUsers();
}

async function loadSocialRelations() {
  if (!state.user) return;
  const result = await getJson("/api/social/relations", getStaticRelations);
  state.relations = result || { incoming: [], outgoing: [], friends: [] };
  renderRelations();
}

function renderSocialUsers() {
  if (!socialUserGrid) return;
  if (!state.socialUsers.length) {
    socialUserGrid.innerHTML = `<div class="social-empty">暂时没有匹配用户。可以换个城市或兴趣关键词试试。</div>`;
    return;
  }
  socialUserGrid.innerHTML = "";
  state.socialUsers.forEach((user) => {
    const card = document.createElement("article");
    card.className = "social-card";
    const action = socialActionLabel(user.relation_status);
    card.innerHTML = `
      <div class="social-card__top">
        <span class="avatar-mark">${escapeHtml(user.name).slice(0, 1)}</span>
        <div>
          <h4>${escapeHtml(user.name)}</h4>
          <p>${escapeHtml(user.city)} · ${escapeHtml(user.favorite_scene || "城市现场")}</p>
        </div>
      </div>
      <p>${escapeHtml(user.bio)}</p>
      <div class="social-tags">${(user.interests || []).slice(0, 4).map((item) => `<span>${escapeHtml(item)}</span>`).join("") || `<span>${escapeHtml(user.primary_tags || "待完善")}</span>`}</div>
      <div class="social-card__result">
        <strong>${escapeHtml(user.test_title || "同频画像待生成")}</strong>
        <span>${socialRelationText(user.relation_status)}</span>
      </div>
      <button class="ghost-button social-action" type="button" ${action.disabled ? "disabled" : ""}>${action.label}</button>
    `;
    card.querySelector(".social-action").addEventListener("click", async () => {
      if (user.relation_status === "friend") {
        openChatDrawer(user);
        return;
      }
      if (user.relation_status === "none" || user.relation_status === "declined") {
        await requestFriend(user);
      }
    });
    socialUserGrid.appendChild(card);
  });
}

function renderRelations() {
  renderRelationList(incomingRequests, state.relations.incoming || [], "incoming");
  renderRelationList(outgoingRequests, state.relations.outgoing || [], "outgoing");
  renderRelationList(friendList, state.relations.friends || [], "friend");
}

function renderRelationList(container, users, type) {
  if (!container) return;
  if (!users.length) {
    container.innerHTML = `<p class="helper-copy">${type === "friend" ? "通过好友申请后，可以在这里开始聊天。" : "暂时没有新的申请。"}</p>`;
    return;
  }
  container.innerHTML = "";
  users.forEach((user) => {
    const item = document.createElement("article");
    item.className = "relation-item";
    item.innerHTML = `
      <span class="avatar-mark">${escapeHtml(user.name).slice(0, 1)}</span>
      <div>
        <strong>${escapeHtml(user.name)}</strong>
        <p>${escapeHtml(user.city)} · ${escapeHtml(user.primary_tags || "兴趣待完善")}</p>
      </div>
      <div class="relation-actions"></div>
    `;
    const actions = item.querySelector(".relation-actions");
    if (type === "incoming") {
      actions.innerHTML = `
        <button class="table-action" data-action="accept">通过</button>
        <button class="table-action" data-action="decline">拒绝</button>
      `;
      actions.querySelector('[data-action="accept"]').addEventListener("click", () => respondFriend(user.request_id, "accepted"));
      actions.querySelector('[data-action="decline"]').addEventListener("click", () => respondFriend(user.request_id, "declined"));
    } else if (type === "friend") {
      actions.innerHTML = `<button class="table-action" data-action="chat">聊天</button>`;
      actions.querySelector('[data-action="chat"]').addEventListener("click", () => openChatDrawer(user));
    } else {
      actions.innerHTML = `<span class="status-pill">等待回应</span>`;
    }
    container.appendChild(item);
  });
}

async function requestFriend(user) {
  const result = await api("/api/social/friends/request", "POST", {
    target_user_id: user.id,
    message: "你好，我在同频大厅看到你的兴趣，想先从轻松聊天开始认识一下。",
  });
  if (result?.ok) {
    toast(result.status === "friend" ? "你们已经成为好友，可以开始聊天" : "好友申请已发送");
    await loadSocialHub();
  }
}

async function respondFriend(requestId, status) {
  const result = await api("/api/social/friends/respond", "POST", { request_id: requestId, status });
  if (result?.ok) {
    toast(status === "accepted" ? "已通过申请，可以开始聊天" : "已拒绝申请");
    await loadSocialHub();
  }
}

async function openChatDrawer(user) {
  if (!chatDrawer) return;
  state.activeChatUser = user;
  document.getElementById("chat-title").textContent = `和 ${user.name} 聊天`;
  document.getElementById("chat-subtitle").textContent = `${user.city} · ${user.primary_tags || "共同兴趣"}。建议从共同场景开始，保持轻松和边界感。`;
  chatForm.receiver_id.value = user.id;
  setMessage("chat-message", "");
  chatDrawer.classList.remove("hidden");
  chatDrawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-drawer");
  await loadMessages(user.id);
  chatForm.body.focus();
}

function closeChatDrawer() {
  if (!chatDrawer || chatDrawer.classList.contains("hidden")) return;
  chatDrawer.classList.add("hidden");
  chatDrawer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-drawer");
}

async function loadMessages(userId) {
  const result = await getJson(`/api/social/messages?user_id=${userId}`, () => getStaticMessages(userId));
  renderMessages(result.messages || []);
}

function renderMessages(messages) {
  if (!chatMessages) return;
  if (!messages.length) {
    chatMessages.innerHTML = `<div class="social-empty">还没有消息。可以从共同兴趣或活动开始第一句话。</div>`;
    return;
  }
  chatMessages.innerHTML = messages
    .map((message) => {
      const mine = message.sender_id === state.user?.id;
      return `<div class="chat-bubble ${mine ? "is-mine" : ""}"><p>${escapeHtml(message.body)}</p><span>${formatTime(message.created_at)}</span></div>`;
    })
    .join("");
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function syncAuthUI() {
  const loggedIn = Boolean(state.user);
  document.body.classList.toggle("is-logged-in", loggedIn);
  dashboardPanel.classList.toggle("hidden", !loggedIn);
  postLoginJourney.classList.toggle("hidden", !loggedIn);
  socialHub?.classList.toggle("hidden", !loggedIn);
  logoutButton.classList.toggle("hidden", !loggedIn);
  adminLink.classList.toggle("hidden", !(loggedIn && state.user.role === "admin"));
  authJump.textContent = loggedIn ? "已登录" : "注册 / 登录";
  authJump.disabled = loggedIn;
}

function openActivityDrawer(activity, tone) {
  if (!activityDrawer) return;
  state.selectedActivity = activity;
  state.selectedActivityId = activity.id;
  document.getElementById("activity-drawer-kicker").textContent = `${activity.city} · ${activity.theme}`;
  document.getElementById("activity-drawer-title").textContent = activity.title;
  document.getElementById("activity-drawer-desc").textContent = activity.description;
  document.getElementById("activity-drawer-fit").textContent = tone.fit;
  document.getElementById("activity-drawer-value").textContent = tone.value;
  document.getElementById("activity-note-title").textContent = `报名活动：${activity.title}`;
  activityNoteForm.querySelector('input[name="activity_id"]').value = activity.id;
  document.getElementById("activity-drawer-meta").innerHTML = [activity.city, activity.date_label, activity.location, `¥${activity.price}`, `${activity.signup_count}/${activity.capacity} 已报名`]
    .map((item) => `<span>${item}</span>`)
    .join("");
  setMessage("activity-message", "");
  activityDrawer.classList.remove("hidden");
  activityDrawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("has-drawer");
  activityNoteForm.querySelector("textarea")?.focus();
}

function closeActivityDrawer() {
  if (!activityDrawer || activityDrawer.classList.contains("hidden")) return;
  activityDrawer.classList.add("hidden");
  activityDrawer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("has-drawer");
}

function updateScrollState() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const progress = max > 0 ? Math.min(100, Math.max(0, (window.scrollY / max) * 100)) : 0;
  if (scrollProgress) scrollProgress.style.width = `${progress}%`;
  document.body.classList.toggle("is-scrolled", window.scrollY > 90);
}

function setupReveals() {
  const targets = Array.from(
    document.querySelectorAll(".scene-band, .activities-section, .story-card, .promise-panel, .split-panel, .dashboard-grid, .form-section, .result-card, .support-section, [data-reveal]")
  );
  targets.forEach((target) => {
    if (!target.dataset.reveal) target.dataset.reveal = "";
  });
  if (!("IntersectionObserver" in window)) {
    targets.forEach((target) => target.classList.add("is-visible"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.12 }
  );
  targets.forEach((target) => observer.observe(target));
}

function setupActiveNav() {
  const sections = navLinks.map((link) => document.querySelector(link.getAttribute("href"))).filter(Boolean);
  if (!("IntersectionObserver" in window) || !sections.length) return;
  const observer = new IntersectionObserver(
    (entries) => {
      const active = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]?.target;
      if (!active) return;
      navLinks.forEach((link) => {
        link.classList.toggle("is-active", link.getAttribute("href") === `#${active.id}`);
      });
    },
    { rootMargin: "-38% 0px -48% 0px", threshold: [0.1, 0.35, 0.6] }
  );
  sections.forEach((section) => observer.observe(section));
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
      image: "assets/activity-film-walk.jpg",
      position: "58% center",
      fit: "适合慢热、喜欢边走边聊的人",
      value: "运营会安排轻任务破冰",
      cta: "预约一个不尴尬的散步位",
    };
  }
  if (title.includes("市集")) {
    return {
      image: "assets/activity-night-market.jpg",
      position: "46% center",
      fit: "适合喜欢热闹但不想硬聊的人",
      value: "先逛摊，再自然组队聊天",
      cta: "报名市集轻约会",
    };
  }
  if (title.includes("livehouse") || title.includes("演出")) {
    return {
      image: "assets/activity-livehouse.jpg",
      position: "72% center",
      fit: "适合靠歌单和现场感破冰的人",
      value: "演出前先组小队降低陌生感",
      cta: "加入演出预热小队",
    };
  }
  return {
    image: "assets/hero-v2.png",
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
    return { users: [], leads: [], activitySignups: [], presales: [], friendRequests: [], messages: [], currentUserEmail: null };
  }
  try {
    return normalizeStaticStore(JSON.parse(raw));
  } catch (error) {
    return { users: [], leads: [], activitySignups: [], presales: [], friendRequests: [], messages: [], currentUserEmail: null };
  }
}

function normalizeStaticStore(data) {
  return {
    users: data.users || [],
    leads: data.leads || [],
    activitySignups: data.activitySignups || [],
    presales: data.presales || [],
    friendRequests: data.friendRequests || [],
    messages: data.messages || [],
    currentUserEmail: data.currentUserEmail || null,
  };
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

function getStaticSocialUsers(queryString = "") {
  const data = loadStaticStore();
  const current = data.users.find((item) => item.email === data.currentUserEmail);
  if (!current) return { users: [] };
  const query = new URLSearchParams(queryString);
  const search = (query.get("search") || "").trim();
  const city = (query.get("city") || "").trim();
  const tag = (query.get("tag") || "").trim();
  const relations = staticRelationMap(data, current.email);
  const users = data.users
    .filter((item) => item.email !== current.email && item.role !== "admin")
    .filter((item) => {
      const profile = item.profile || {};
      const haystack = [item.name, item.city, profile.bio, profile.primary_tags, ...(profile.interests || [])].join(" ");
      if (search && !haystack.includes(search)) return false;
      if (city && !item.city.includes(city)) return false;
      if (tag && !(profile.primary_tags || "").includes(tag)) return false;
      return true;
    })
    .map((item) => staticSocialUser(item, relations[item.email] || "none"));
  return { users };
}

function getStaticRelations() {
  const data = loadStaticStore();
  const current = data.users.find((item) => item.email === data.currentUserEmail);
  if (!current) return { incoming: [], outgoing: [], friends: [] };
  const userByEmail = Object.fromEntries(data.users.map((item) => [item.email, item]));
  const incoming = [];
  const outgoing = [];
  const friends = [];
  data.friendRequests.forEach((request) => {
    if (request.status === "pending" && request.addressee_email === current.email && userByEmail[request.requester_email]) {
      incoming.push({ ...staticSocialUser(userByEmail[request.requester_email], "incoming"), request_id: request.id });
    }
    if (request.status === "pending" && request.requester_email === current.email && userByEmail[request.addressee_email]) {
      outgoing.push({ ...staticSocialUser(userByEmail[request.addressee_email], "requested"), request_id: request.id });
    }
    if (request.status === "accepted" && (request.requester_email === current.email || request.addressee_email === current.email)) {
      const otherEmail = request.requester_email === current.email ? request.addressee_email : request.requester_email;
      if (userByEmail[otherEmail]) friends.push({ ...staticSocialUser(userByEmail[otherEmail], "friend"), request_id: request.id });
    }
  });
  return { incoming, outgoing, friends };
}

function getStaticMessages(userId) {
  const data = loadStaticStore();
  const current = data.users.find((item) => item.email === data.currentUserEmail);
  const other = data.users.find((item) => item.id === Number(userId));
  if (!current || !other) return { messages: [] };
  return {
    messages: data.messages.filter(
      (item) =>
        (item.sender_email === current.email && item.receiver_email === other.email) ||
        (item.sender_email === other.email && item.receiver_email === current.email)
    ),
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
  if (url === "/api/social/friends/request") {
    const target = data.users.find((item) => item.id === Number(payload.target_user_id));
    if (!target || target.email === user.email) return { error: "invalid_target" };
    const existing = data.friendRequests.find(
      (item) =>
        (item.requester_email === user.email && item.addressee_email === target.email) ||
        (item.requester_email === target.email && item.addressee_email === user.email)
    );
    if (existing) {
      if (existing.status === "accepted") return { ok: true, status: "friend" };
      if (existing.requester_email === target.email && existing.status === "pending") {
        existing.status = "accepted";
        existing.updated_at = new Date().toISOString();
        saveStaticStore(data);
        return { ok: true, status: "friend" };
      }
      existing.status = "pending";
      existing.message = payload.message || "";
      existing.updated_at = new Date().toISOString();
    } else {
      data.friendRequests.push({
        id: Date.now(),
        requester_email: user.email,
        addressee_email: target.email,
        status: "pending",
        message: payload.message || "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
    saveStaticStore(data);
    return { ok: true, status: "requested" };
  }
  if (url === "/api/social/friends/respond") {
    const request = data.friendRequests.find((item) => item.id === Number(payload.request_id) && item.addressee_email === user.email);
    if (!request) return { error: "request_not_found" };
    request.status = payload.status;
    request.updated_at = new Date().toISOString();
    saveStaticStore(data);
    return { ok: true, status: payload.status };
  }
  if (url === "/api/social/messages") {
    const receiver = data.users.find((item) => item.id === Number(payload.receiver_id));
    if (!receiver) return { error: "user_not_found" };
    const friends = staticRelationMap(data, user.email);
    if (friends[receiver.email] !== "friend") return { error: "not_friends" };
    const message = {
      id: Date.now(),
      sender_id: user.id,
      receiver_id: receiver.id,
      sender_email: user.email,
      receiver_email: receiver.email,
      body: payload.body || "",
      created_at: new Date().toISOString(),
    };
    data.messages.push(message);
    saveStaticStore(data);
    return { message };
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

function staticSocialUser(user, relationStatus) {
  const profile = user.profile || {};
  return {
    id: user.id,
    request_id: null,
    name: profile.nickname || user.name,
    city: profile.city || user.city,
    bio: profile.bio || "这个用户还没有写自我介绍，可以先从兴趣标签开始破冰。",
    interests: profile.interests || [],
    primary_tags: profile.primary_tags || (profile.interests || []).slice(0, 3).join(","),
    favorite_scene: profile.favorite_scene || "城市现场",
    test_title: profile.test_result?.title || "同频画像待生成",
    review_status: profile.review_status || "pending",
    relation_status: relationStatus,
  };
}

function staticRelationMap(data, currentEmail) {
  const relations = {};
  data.friendRequests.forEach((request) => {
    if (request.requester_email !== currentEmail && request.addressee_email !== currentEmail) return;
    const otherEmail = request.requester_email === currentEmail ? request.addressee_email : request.requester_email;
    if (request.status === "accepted") relations[otherEmail] = "friend";
    else if (request.status === "pending" && request.requester_email === currentEmail) relations[otherEmail] = "requested";
    else if (request.status === "pending" && request.addressee_email === currentEmail) relations[otherEmail] = "incoming";
    else if (!relations[otherEmail]) relations[otherEmail] = request.status;
  });
  return relations;
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
    invalid_target: "不能向这个用户发送申请。",
    user_not_found: "没有找到这个用户。",
    invalid_friend_status: "好友申请状态不正确。",
    request_not_found: "没有找到这条好友申请。",
    not_friends: "通过好友申请后才能聊天。",
    empty_message: "消息内容不能为空。",
  }[code] || "请求没有成功，请再试一次。";
}

function socialActionLabel(status) {
  if (status === "friend") return { label: "打开聊天", disabled: false };
  if (status === "requested") return { label: "已发送申请", disabled: true };
  if (status === "incoming") return { label: "去右侧回应", disabled: true };
  return { label: "申请认识", disabled: false };
}

function socialRelationText(status) {
  return {
    friend: "已成为好友",
    requested: "等待对方回应",
    incoming: "对方想认识你",
    declined: "可以重新申请",
  }[status] || "还没有建立连接";
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
