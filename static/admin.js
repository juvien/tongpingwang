const adminState = {
  me: null,
  lastQuery: "",
  refreshTimer: null,
};

const adminMetrics = document.getElementById("admin-metrics");
const adminUsersBody = document.getElementById("admin-users-body");
const adminLeadsBody = document.getElementById("admin-leads-body");
const adminPresalesBody = document.getElementById("admin-presales-body");
const adminStatus = document.getElementById("admin-status");
const adminUpdatedAt = document.getElementById("admin-updated-at");
const adminLogout = document.getElementById("admin-logout");
const adminRefresh = document.getElementById("admin-refresh");
const adminContent = document.getElementById("admin-content");
const adminLoginPanel = document.getElementById("admin-login-panel");
const adminLoginForm = document.getElementById("admin-login-form");

adminLogout.addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/";
});

adminRefresh.addEventListener("click", async () => {
  await refreshAllAdminData();
});

adminLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("admin-login-message", "正在切换管理员账号…");
  const payload = Object.fromEntries(new FormData(adminLoginForm).entries());
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) {
    setMessage("admin-login-message", "管理员账号或密码不正确。");
    return;
  }
  setMessage("admin-login-message", "切换成功。", true);
  await bootstrapAdmin();
});

document.getElementById("admin-filter-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const query = new URLSearchParams();
  Object.entries(Object.fromEntries(formData.entries())).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  adminState.lastQuery = query.toString();
  await loadUsers(adminState.lastQuery);
});

async function bootstrapAdmin() {
  const me = await fetch("/api/auth/me").then((res) => res.json());
  if (!me.user || me.user.role !== "admin") {
    adminState.me = null;
    adminContent.classList.add("hidden");
    adminLoginPanel.classList.remove("hidden");
    adminStatus.textContent = me.user
      ? `当前登录身份是 ${me.user.name}（普通用户），请切换到管理员账号查看后台。`
      : "当前还没有管理员权限，请先登录管理员账号。";
    return;
  }
  adminState.me = me.user;
  adminLoginPanel.classList.add("hidden");
  adminContent.classList.remove("hidden");
  adminStatus.textContent = `已登录管理员：${me.user.name}，后台会自动刷新最新注册、线索和付费记录。`;
  await refreshAllAdminData();
  ensureRefreshTimer();
}

async function loadOverview() {
  const result = await fetch("/api/admin/overview").then((res) => res.json());
  const overview = result.overview || {};
  adminMetrics.innerHTML = "";
  [
    ["普通用户", overview.users || 0],
    ["待审核资料", overview.pending_reviews || 0],
    ["候选匹配中", overview.matched_users || 0],
    ["活动报名", overview.activity_signups || 0],
    ["预售记录", overview.presales || 0],
    ["线索报名", overview.leads || 0],
  ].forEach(([label, value]) => {
    const card = document.createElement("article");
    card.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
    adminMetrics.appendChild(card);
  });
}

async function loadUsers(queryString) {
  const suffix = queryString ? `?${queryString}` : "";
  const result = await fetch(`/api/admin/users${suffix}`).then((res) => res.json());
  adminUsersBody.innerHTML = "";
  if (!(result.users || []).length) {
    adminUsersBody.innerHTML = `<tr><td colspan="7" class="table-empty">暂时没有匹配的注册用户。</td></tr>`;
    return;
  }
  (result.users || []).forEach((user) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>
        <strong>${user.nickname || user.name}</strong><br />
        <span>${user.email}</span>
      </td>
      <td>${user.city}</td>
      <td>${user.primary_tags || "未填写"}</td>
      <td>${humanReview(user.review_status)}</td>
      <td>${humanMatch(user.match_status)}</td>
      <td>${formatDate(user.created_at)}</td>
      <td>
        <button class="table-action" data-action="review" data-id="${user.id}" data-value="approved">通过</button>
        <button class="table-action" data-action="review" data-id="${user.id}" data-value="flagged">复核</button>
        <button class="table-action" data-action="match" data-id="${user.id}" data-value="shortlisted">候选</button>
        <button class="table-action" data-action="match" data-id="${user.id}" data-value="invited">已邀请</button>
      </td>
    `;
    row.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", async () => {
        const type = button.dataset.action;
        const userId = button.dataset.id;
        const value = button.dataset.value;
        const endpoint = type === "review" ? "review" : "match-status";
        const payload = type === "review" ? { review_status: value } : { match_status: value };
        await fetch(`/api/admin/users/${userId}/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        await Promise.all([loadOverview(), loadUsers(queryString)]);
        updateRefreshStamp();
      });
    });
    adminUsersBody.appendChild(row);
  });
}

async function loadLeads() {
  const result = await fetch("/api/admin/leads").then((res) => res.json());
  adminLeadsBody.innerHTML = "";
  if (!(result.leads || []).length) {
    adminLeadsBody.innerHTML = `<tr><td colspan="5" class="table-empty">暂时还没有新的报名线索。</td></tr>`;
    return;
  }
  (result.leads || []).forEach((lead) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><strong>${lead.name}</strong></td>
      <td>${lead.city}</td>
      <td>${lead.contact}</td>
      <td>${lead.interest_note || "未备注"}</td>
      <td>${formatDate(lead.created_at)}</td>
    `;
    adminLeadsBody.appendChild(row);
  });
}

async function loadPresales() {
  const result = await fetch("/api/admin/presales").then((res) => res.json());
  adminPresalesBody.innerHTML = "";
  if (!(result.presales || []).length) {
    adminPresalesBody.innerHTML = `<tr><td colspan="6" class="table-empty">暂时还没有会员预售记录。</td></tr>`;
    return;
  }
  (result.presales || []).forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><strong>${item.name}</strong><br /><span>${item.email}</span></td>
      <td>${item.city}</td>
      <td>${item.plan_name}</td>
      <td>¥${item.amount}</td>
      <td>${item.status}</td>
      <td>${formatDate(item.created_at)}</td>
    `;
    adminPresalesBody.appendChild(row);
  });
}

async function refreshAllAdminData() {
  if (!adminState.me) return;
  adminRefresh.disabled = true;
  adminStatus.textContent = `已登录管理员：${adminState.me.name}，正在同步最新数据…`;
  await Promise.all([
    loadOverview(),
    loadUsers(adminState.lastQuery),
    loadLeads(),
    loadPresales(),
  ]);
  updateRefreshStamp();
  adminRefresh.disabled = false;
  adminStatus.textContent = `已登录管理员：${adminState.me.name}，后台会自动刷新最新注册、线索和付费记录。`;
}

function ensureRefreshTimer() {
  if (adminState.refreshTimer) return;
  adminState.refreshTimer = window.setInterval(() => {
    if (document.hidden || !adminState.me) return;
    refreshAllAdminData();
  }, 12000);
}

function updateRefreshStamp() {
  adminUpdatedAt.textContent = `最近刷新：${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`;
}

function humanReview(status) {
  return {
    pending: "待审核",
    approved: "已通过",
    flagged: "需复核",
  }[status] || status;
}

function humanMatch(status) {
  return {
    new: "未开始",
    shortlisted: "候选池",
    invited: "已邀请",
    active: "匹配中",
    hold: "暂缓",
  }[status] || status;
}

function formatDate(value) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function setMessage(id, text, success = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.style.color = success ? "var(--success)" : "var(--muted)";
}

window.addEventListener("focus", () => {
  if (adminState.me) refreshAllAdminData();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && adminState.me) refreshAllAdminData();
});

bootstrapAdmin();
