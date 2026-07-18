const STORAGE_KEY = "life-board-data";
const CATEGORIES = {
  task: { label: "やること", emoji: "✅", desc: "今日・今週やる具体的なタスク" },
  dream: { label: "夢", emoji: "🌟", desc: "いつか叶えたい大きなビジョン" },
  goal: { label: "目標", emoji: "🎯", desc: "期限や進捗のある中期的な目標" },
  note: { label: "メモ", emoji: "📝", desc: "アイデア・気づき・思いつき" },
  wish: { label: "やりたいこと", emoji: "💫", desc: "いつか試してみたいこと" },
};
const PRIORITY = { low: "低", medium: "中", high: "高" };
const ALL_CATS = Object.keys(CATEGORIES);

let state = load();
let view = "dashboard";
let search = "";
let statusFilter = "active";
let editingId = null;
let editingCat = "task";

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { items: [] };
    const p = JSON.parse(raw);
    return { items: Array.isArray(p.items) ? p.items : [] };
  } catch {
    return { items: [] };
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid() {
  return crypto.randomUUID();
}

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function isOverdue(item) {
  if (!item.dueDate || item.completed) return false;
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const d = new Date(item.dueDate);
  d.setHours(0, 0, 0, 0);
  return d < t;
}

function sortItems(items) {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });
}

function filtered() {
  let items = state.items;
  if (view !== "all" && view !== "dashboard") {
    items = items.filter((i) => i.category === view);
  }
  if (statusFilter === "active") items = items.filter((i) => !i.completed);
  else if (statusFilter === "done") items = items.filter((i) => i.completed);
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    items = items.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        (i.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  }
  return sortItems(items);
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function renderNav() {
  const counts = { all: state.items.length };
  ALL_CATS.forEach((c) => {
    counts[c] = state.items.filter((i) => i.category === c).length;
  });
  document.getElementById("nav").innerHTML = `
    <button class="nav-btn ${view === "dashboard" ? "active" : ""}" data-view="dashboard"><span>🏠</span> ダッシュボード</button>
    <button class="nav-btn ${view === "all" ? "active" : ""}" data-view="all"><span>📋</span> すべて <span class="count">${counts.all}</span></button>
    ${ALL_CATS.map(
      (c) =>
        `<button class="nav-btn ${view === c ? "active" : ""}" data-view="${c}"><span>${CATEGORIES[c].emoji}</span> ${CATEGORIES[c].label} <span class="count">${counts[c]}</span></button>`
    ).join("")}
  `;
  document.querySelectorAll(".nav-btn").forEach(
    (btn) => (btn.onclick = () => {
      view = btn.dataset.view;
      render();
    })
  );
}

function cardHTML(item) {
  const meta = CATEGORIES[item.category];
  const overdue = isOverdue(item);
  const showProgress = item.category === "goal" || item.category === "dream";
  const showCheck = item.category === "task" || item.category === "goal";
  return `<article class="item-card ${item.completed ? "completed" : ""} ${item.pinned ? "pinned" : ""} ${overdue ? "overdue" : ""}">
    <div class="card-header">
      ${showCheck ? `<input type="checkbox" ${item.completed ? "checked" : ""} data-toggle="${item.id}" style="margin-top:.2rem;accent-color:var(--accent)" aria-label="完了にする" />` : ""}
      <h4 class="card-title ${item.completed ? "done" : ""}">${esc(item.title)}</h4>
    </div>
    <div class="card-meta">
      <span class="badge">${meta.emoji} ${meta.label}</span>
      <span class="badge priority-${item.priority}">優先度: ${PRIORITY[item.priority] || "中"}</span>
      ${item.dueDate ? `<span class="badge ${overdue ? "overdue" : ""}">📅 ${fmtDate(item.dueDate)}${overdue ? "（期限切れ）" : ""}</span>` : ""}
      ${item.pinned ? `<span class="badge">📌 ピン留め</span>` : ""}
      ${(item.tags || []).map((t) => `<span class="badge">#${esc(t)}</span>`).join("")}
    </div>
    ${item.description ? `<p class="card-desc">${esc(item.description)}</p>` : ""}
    ${showProgress ? `<div><div style="display:flex;justify-content:space-between;font-size:.78rem;color:var(--text-muted)"><span>進捗</span><span>${item.progress || 0}%</span></div><div class="progress-bar"><div class="progress-fill" style="width:${item.progress || 0}%"></div></div></div>` : ""}
    <div class="card-actions">
      <button class="icon-btn" data-pin="${item.id}">${item.pinned ? "📌 解除" : "📌 固定"}</button>
      <button class="icon-btn" data-edit="${item.id}">✏️ 編集</button>
      <button class="icon-btn" data-del="${item.id}">🗑️ 削除</button>
    </div>
  </article>`;
}

function renderMain() {
  const title =
    view === "dashboard"
      ? "ダッシュボード"
      : view === "all"
        ? "すべて"
        : CATEGORIES[view].label;
  const desc =
    view === "dashboard"
      ? "今日の全体像をひと目で確認"
      : view === "all"
        ? "カテゴリをまたいで一覧表示"
        : CATEGORIES[view].desc;
  const active = state.items.filter((i) => !i.completed);
  const stats = {
    total: state.items.length,
    active: active.length,
    done: state.items.filter((i) => i.completed).length,
    dreams: state.items.filter((i) => i.category === "dream").length,
    overdue: active.filter(isOverdue).length,
  };

  let body = "";
  if (view === "dashboard") {
    body += `<div class="stats-row">
      <div class="stat-card"><div class="label">登録数</div><div class="value">${stats.total}</div></div>
      <div class="stat-card"><div class="label">進行中</div><div class="value">${stats.active}</div></div>
      <div class="stat-card"><div class="label">完了</div><div class="value">${stats.done}</div></div>
      <div class="stat-card"><div class="label">夢</div><div class="value">${stats.dreams}</div></div>
      <div class="stat-card"><div class="label">期限切れ</div><div class="value">${stats.overdue}</div></div>
    </div>`;
    let any = false;
    ALL_CATS.forEach((cat) => {
      const items = sortItems(
        state.items.filter((i) => i.category === cat && !i.completed)
      ).slice(0, 3);
      if (!items.length) return;
      any = true;
      body += `<section class="dashboard-section"><h3>${CATEGORIES[cat].emoji} ${CATEGORIES[cat].label}</h3><div class="cards-grid">${items.map(cardHTML).join("")}</div></section>`;
    });
    if (!any) {
      body += `<div class="empty-state"><h3>はじめましょう</h3><p>「＋ 新規追加」から、やることや夢を登録してみてください。</p></div>`;
    }
  } else {
    const items = filtered();
    body = items.length
      ? `<div class="cards-grid">${items.map(cardHTML).join("")}</div>`
      : `<div class="empty-state"><h3>項目がありません</h3><p>${search ? "検索条件に一致する項目がありません。" : "「＋ 追加」ボタンから新しい項目を作成できます。"}</p></div>`;
  }

  body += `<footer class="site-footer">Life Board — データはこのブラウザに保存されます</footer>`;

  document.getElementById("main").innerHTML = `
    <div class="topbar">
      <div><h2>${title}</h2><p>${desc}</p></div>
      <div class="toolbar">
        <input class="search-input" type="search" placeholder="検索..." value="${esc(search)}" id="search" />
        <select class="filter-select" id="status">
          <option value="active" ${statusFilter === "active" ? "selected" : ""}>未完了</option>
          <option value="all" ${statusFilter === "all" ? "selected" : ""}>すべて</option>
          <option value="done" ${statusFilter === "done" ? "selected" : ""}>完了済み</option>
        </select>
        ${view !== "dashboard" && view !== "all" ? `<button class="primary-btn" id="btn-add-cat">＋ 追加</button>` : ""}
      </div>
    </div>${body}`;

  document.getElementById("search").oninput = (e) => {
    search = e.target.value;
    renderMain();
    bindCards();
  };
  document.getElementById("status").onchange = (e) => {
    statusFilter = e.target.value;
    renderMain();
    bindCards();
  };
  const addBtn = document.getElementById("btn-add-cat");
  if (addBtn) {
    addBtn.onclick = () => openModal(null, ALL_CATS.includes(view) ? view : "task");
  }
  bindCards();
}

function bindCards() {
  document.querySelectorAll("[data-toggle]").forEach(
    (el) => (el.onchange = () => toggle(el.dataset.toggle))
  );
  document.querySelectorAll("[data-pin]").forEach(
    (el) => (el.onclick = () => pin(el.dataset.pin))
  );
  document.querySelectorAll("[data-edit]").forEach(
    (el) => (el.onclick = () => openModal(el.dataset.edit))
  );
  document.querySelectorAll("[data-del]").forEach(
    (el) => (el.onclick = () => del(el.dataset.del))
  );
}

function render() {
  renderNav();
  renderMain();
}

function openModal(id, cat) {
  editingId = id;
  editingCat = cat || "task";
  const item = id ? state.items.find((i) => i.id === id) : null;
  if (item) editingCat = item.category;
  document.getElementById("modal-title").textContent =
    (id ? "編集" : "新規追加") +
    " — " +
    CATEGORIES[editingCat].emoji +
    " " +
    CATEGORIES[editingCat].label;
  document.getElementById("f-title").value = item?.title || "";
  document.getElementById("f-desc").value = item?.description || "";
  document.getElementById("f-tags").value = (item?.tags || []).join(", ");
  document.getElementById("f-pinned").checked = item?.pinned || false;

  const extra = document.getElementById("f-extra");
  extra.innerHTML = "";
  if (editingCat === "task" || editingCat === "goal") {
    extra.innerHTML += `<label>優先度<select id="f-priority">${Object.entries(PRIORITY)
      .map(
        ([k, v]) =>
          `<option value="${k}" ${(item?.priority || "medium") === k ? "selected" : ""}>${v}</option>`
      )
      .join("")}</select></label>`;
    extra.innerHTML += `<label>期限<input type="date" id="f-due" value="${item?.dueDate || ""}" /></label>`;
  }
  if (editingCat === "goal" || editingCat === "dream") {
    extra.innerHTML += `<label>進捗 (%)<input type="number" id="f-progress" min="0" max="100" value="${item?.progress || 0}" /></label>`;
  }
  document.getElementById("modal").classList.add("open");
}

function closeModal() {
  document.getElementById("modal").classList.remove("open");
  editingId = null;
}

document.getElementById("form").onsubmit = (e) => {
  e.preventDefault();
  const title = document.getElementById("f-title").value.trim();
  if (!title) return;
  const now = new Date().toISOString();
  const item = {
    id: editingId || uid(),
    category: editingCat,
    title,
    description: document.getElementById("f-desc").value.trim(),
    tags: document.getElementById("f-tags")
      .value.split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    pinned: document.getElementById("f-pinned").checked,
    priority: document.getElementById("f-priority")?.value || "medium",
    dueDate: document.getElementById("f-due")?.value || null,
    progress: Number(document.getElementById("f-progress")?.value || 0),
    completed: editingId
      ? state.items.find((i) => i.id === editingId)?.completed || false
      : false,
    createdAt: editingId
      ? state.items.find((i) => i.id === editingId)?.createdAt || now
      : now,
    updatedAt: now,
  };
  const idx = state.items.findIndex((i) => i.id === item.id);
  if (idx >= 0) state.items[idx] = item;
  else state.items.push(item);
  save();
  closeModal();
  render();
};

function toggle(id) {
  const i = state.items.find((x) => x.id === id);
  if (i) {
    i.completed = !i.completed;
    i.updatedAt = new Date().toISOString();
    save();
    render();
  }
}

function pin(id) {
  const i = state.items.find((x) => x.id === id);
  if (i) {
    i.pinned = !i.pinned;
    i.updatedAt = new Date().toISOString();
    save();
    render();
  }
}

function del(id) {
  if (!confirm("この項目を削除しますか？")) return;
  state.items = state.items.filter((i) => i.id !== id);
  save();
  render();
}

document.getElementById("btn-new").onclick = () => openModal(null, "task");
document.getElementById("btn-cancel").onclick = closeModal;
document.getElementById("modal").onclick = (e) => {
  if (e.target.id === "modal") closeModal();
};
document.getElementById("btn-export").onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "life-board-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
};
document.getElementById("btn-import").onclick = () =>
  document.getElementById("file-import").click();
document.getElementById("file-import").onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (
        confirm(
          "インポート: " + (data.items?.length || 0) + " 件で上書きします。よろしいですか？"
        )
      ) {
        state = { items: data.items || [] };
        save();
        render();
      }
    } catch {
      alert("ファイルの読み込みに失敗しました。");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
};

render();
