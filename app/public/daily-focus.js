async function loadDailyFocus() {
  const panel = document.getElementById("daily-focus");
  if (!panel) return;
  const response = await fetch("/api/daily-focus");
  if (!response.ok) {
    panel.classList.add("daily-focus-error");
    document.getElementById("dailyFocusHeadline").textContent = "Today’s plan is unavailable";
    document.getElementById("dailyFocusPrimary").innerHTML = '<p class="daily-focus-empty">Atlas could not load the Daily Focus plan.</p>';
    return;
  }
  renderDailyFocus(await response.json());
}

function dailyFocusControls(item) {
  if (!item) return "";
  return `<div class="daily-focus-controls" data-focus-controls="${Number(item.id)}">
    <button type="button" data-focus-status="Completed" data-focus-id="${Number(item.id)}">Completed</button>
    <button type="button" data-focus-status="Blocked" data-focus-id="${Number(item.id)}">Blocked</button>
    <button type="button" data-focus-status="Deferred" data-focus-id="${Number(item.id)}">Defer</button>
  </div>`;
}

function dailyFocusAction(item, label) {
  if (!item) return "";
  const blocked = item.execution_status === "Blocked";
  return `<div class="daily-focus-action-wrap ${blocked ? "is-blocked" : ""}">
    <button type="button" class="daily-focus-action" data-focus-open="${Number(item.id)}">
      <span class="daily-focus-action-label">${escapeHtml(label)}</span>
      <strong>${escapeHtml(item.name || "Opportunity")}</strong>
      <span>${escapeHtml(item.action || item.recommendation || "Review opportunity")}</span>
      <small>Priority ${Number(item.priority_score || item.work_priority_score || 0)}/100 · ${escapeHtml(item.status || "")}${blocked ? " · BLOCKED" : ""}</small>
      ${blocked && item.execution_note ? `<small class="daily-focus-note">${escapeHtml(item.execution_note)}</small>` : ""}
    </button>
    ${dailyFocusControls(item)}
  </div>`;
}

function historyItems(items, label) {
  if (!(items || []).length) return "";
  return `<div class="daily-focus-history"><strong>${escapeHtml(label)}</strong>${items.map(item => `<span>${escapeHtml(item.name || "Opportunity")}</span>`).join("")}</div>`;
}

async function updateDailyFocusStatus(id, status) {
  let note = "";
  if (status === "Blocked") note = prompt("What is blocking this move?", "") ?? "";
  if (status === "Deferred") note = prompt("Optional: why are you deferring this today?", "") ?? "";
  const response = await fetch(`/api/daily-focus/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, note })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    alert(result.error || "Unable to update Today’s Plan.");
    return;
  }
  renderDailyFocus(result.plan);
  if (typeof loadOpportunities === "function") await loadOpportunities();
}

function renderDailyFocus(data) {
  const headline = document.getElementById("dailyFocusHeadline");
  const meta = document.getElementById("dailyFocusMeta");
  const primary = document.getElementById("dailyFocusPrimary");
  const supporting = document.getElementById("dailyFocusSupporting");
  const defer = document.getElementById("dailyFocusDefer");
  const rules = document.getElementById("dailyFocusRules");
  if (!headline || !primary) return;

  headline.textContent = data.headline || "Today’s Atlas plan";
  meta.textContent = `${Number(data.queue_size || 0)} active opportunities · ${Number(data.urgent_count || 0)} urgent`;
  primary.innerHTML = data.primary_objective
    ? dailyFocusAction(data.primary_objective, "Primary objective")
    : '<p class="daily-focus-empty">No active objective. The portfolio is clear.</p>';
  supporting.innerHTML = (data.supporting_moves || []).length
    ? data.supporting_moves.map((item, index) => dailyFocusAction(item, `Move ${index + 2}`)).join("")
    : '<p class="daily-focus-empty">No supporting moves needed today.</p>';
  defer.innerHTML = (data.defer || []).length
    ? data.defer.slice(0, 5).map(item => `<div class="daily-focus-defer-item"><strong>${escapeHtml(item.name || "Opportunity")}</strong><span>${escapeHtml(item.reason || item.recommendation || "Defer for now")}</span></div>`).join("")
    : '<p class="daily-focus-empty">Nothing needs to be deliberately deferred.</p>';
  defer.innerHTML += historyItems(data.completed_today, "Completed today") + historyItems(data.deferred_today, "Deferred today");
  rules.innerHTML = `<span><strong>Capacity:</strong> ${escapeHtml(data.capacity_rule || "Maximum three moves today.")}</span><span><strong>Stop rule:</strong> ${escapeHtml(data.stop_rule || "Finish, block, or defer the primary objective before expanding the day.")}</span>`;

  document.querySelectorAll("[data-focus-open]").forEach(button => button.addEventListener("click", () => {
    const id = Number(button.dataset.focusOpen);
    const commandButton = document.querySelector(`[data-command-open="${id}"]`);
    if (commandButton) return commandButton.click();
    const cardButton = document.querySelector(`[data-id="${id}"]`);
    if (cardButton) cardButton.click();
  }));
  document.querySelectorAll("[data-focus-status]").forEach(button => button.addEventListener("click", event => {
    event.stopPropagation();
    button.disabled = true;
    updateDailyFocusStatus(Number(button.dataset.focusId), button.dataset.focusStatus).catch(error => {
      console.error(error);
      button.disabled = false;
    });
  }));
}

loadDailyFocus().catch(error => {
  console.error("Unable to load Daily Focus", error);
  const headline = document.getElementById("dailyFocusHeadline");
  if (headline) headline.textContent = "Today’s plan is unavailable";
});
