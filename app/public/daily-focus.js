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

function dailyFocusAction(item, label) {
  if (!item) return "";
  return `<button type="button" class="daily-focus-action" data-focus-open="${Number(item.id)}">
    <span class="daily-focus-action-label">${escapeHtml(label)}</span>
    <strong>${escapeHtml(item.name || "Opportunity")}</strong>
    <span>${escapeHtml(item.recommendation || item.action || "Review opportunity")}</span>
    <small>Priority ${Number(item.work_priority_score || 0)}/100 · ${escapeHtml(item.status || "")}</small>
  </button>`;
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
    ? data.defer.slice(0, 5).map(item => `<div class="daily-focus-defer-item"><strong>${escapeHtml(item.name || "Opportunity")}</strong><span>${escapeHtml(item.recommendation || "Defer for now")}</span></div>`).join("")
    : '<p class="daily-focus-empty">Nothing needs to be deliberately deferred.</p>';
  rules.innerHTML = `<span><strong>Capacity:</strong> ${escapeHtml(data.capacity_rule || "Maximum three moves today.")}</span><span><strong>Stop rule:</strong> ${escapeHtml(data.stop_rule || "Finish, block, or defer the primary objective before expanding the day.")}</span>`;

  document.querySelectorAll("[data-focus-open]").forEach(button => button.addEventListener("click", () => {
    const id = Number(button.dataset.focusOpen);
    const commandButton = document.querySelector(`[data-command-open="${id}"]`);
    if (commandButton) return commandButton.click();
    const cardButton = document.querySelector(`[data-id="${id}"]`);
    if (cardButton) cardButton.click();
  }));
}

loadDailyFocus().catch(error => {
  console.error("Unable to load Daily Focus", error);
  const headline = document.getElementById("dailyFocusHeadline");
  if (headline) headline.textContent = "Today’s plan is unavailable";
});
