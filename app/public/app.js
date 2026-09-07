const STATUSES = ["All", "Researching", "Testing", "Active", "Scaled", "Paused", "Killed"];
let opportunities = [];
let activeFilter = "All";
let launchTaskDraft = [];
let checkpointDraft = [];
let activeCheckpointWeek = 1;
let searchQuery = "";
let sortMode = "attention";
let editingOpportunityId = null;
let portfolioSummaryData = null;

const money = value => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
const dateOnly = value => value ? new Date(value).toLocaleDateString() : "—";
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));

function renderMetrics() {
  const revenue = opportunities.reduce((sum, item) => sum + Number(item.actual_revenue || 0), 0);
  const profit = opportunities.reduce((sum, item) => sum + Number(item.actual_profit || 0), 0);
  const average = opportunities.length ? opportunities.reduce((sum, item) => sum + Number(item.atlas_score || 0), 0) / opportunities.length : 0;
  const highest = opportunities.length ? Math.max(...opportunities.map(item => Number(item.atlas_score || 0))) : 0;
  document.getElementById("metrics").innerHTML = [
    ["Opportunities", opportunities.length], ["Revenue", money(revenue)], ["Profit", money(profit)],
    ["Average Score", average.toFixed(1)], ["Highest Score", highest]
  ].map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function renderFilters() {
  document.getElementById("filters").innerHTML = STATUSES.map(status => {
    const count = status === "All" ? opportunities.length : opportunities.filter(item => item.status === status).length;
    return `<button class="filter ${activeFilter === status ? "active" : ""}" data-status="${status}">${status} <span>${count}</span></button>`;
  }).join("");
  document.querySelectorAll(".filter").forEach(button => button.addEventListener("click", () => {
    activeFilter = button.dataset.status; renderFilters(); renderList();
  }));
}


function renderTestingPortfolio() {
  const summary = portfolioSummaryData || { active_tests: 0, visits: 0, favorites: 0, orders: 0, revenue: 0, cash_profit: 0, conversion_rate: 0, tests: [] };
  document.getElementById("test-portfolio-count").textContent = `${summary.active_tests} live test${summary.active_tests === 1 ? "" : "s"}`;
  document.getElementById("test-portfolio-metrics").innerHTML = [
    ["Visits", summary.visits],
    ["Favorites", summary.favorites],
    ["Orders", summary.orders],
    ["Conversion", `${Number(summary.conversion_rate || 0).toFixed(1)}%`],
    ["Test Revenue", money(summary.revenue)],
    ["Cash Profit", money(summary.cash_profit)]
  ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");

  document.getElementById("test-portfolio-list").innerHTML = summary.tests.length ? summary.tests.map(test => {
    const duration = test.days_remaining === null ? "Dates incomplete" : `${test.days_remaining} day${test.days_remaining === 1 ? "" : "s"} remaining`;
    const checkpoint = test.next_checkpoint_week ? `Week ${test.next_checkpoint_week} due ${dateOnly(test.next_checkpoint_date)}` : "All checkpoints complete";
    const healthClass = String(test.health_label || "Developing").toLowerCase().replace(/\s+/g, "-");
    const healthDetail = (test.health_warnings || [])[0] || (test.health_reasons || [])[0] || test.health_recommendation || "";
    return `<button class="test-product ${escapeHtml(test.attention_level || "normal")} health-${escapeHtml(healthClass)}" data-test-id="${test.id}">
      <div class="test-product-heading">
        <strong>${escapeHtml(test.name)}</strong>
        <span class="health-badge health-${escapeHtml(healthClass)}">${test.health_score}/100 · ${escapeHtml(test.health_label)} · ${escapeHtml(test.health_confidence)} confidence</span>
      </div>
      <div class="test-product-stats">
        <span><b>${test.visits}</b> visits</span><span><b>${test.favorites}</b> favorites</span><span><b>${test.orders}</b> orders</span>
        <span><b>${Number(test.conversion_rate || 0).toFixed(1)}%</b> conversion</span><span><b>${money(test.revenue)}</b> revenue</span><span><b>${duration}</b></span>
      </div>
      <small>${escapeHtml(healthDetail)}</small>
      <div class="intervention-panel">
        <div class="intervention-heading">
          <span class="intervention-label">${escapeHtml(test.intervention_diagnosis || "Insufficient Evidence")}</span>
          <span class="intervention-priority">${escapeHtml(test.intervention_priority || "Observe")}</span>
        </div>
        <strong>${escapeHtml(test.intervention_action || "Keep collecting data.")}</strong>
        <span>${escapeHtml(test.intervention_rationale || "")}</span>
        <span class="intervention-rule">Measure: ${escapeHtml(test.intervention_success_metric || "")}</span>
        <span class="intervention-rule">Test rule: ${escapeHtml(test.intervention_change_limit || "Change one variable at a time.")}</span>
        ${test.active_intervention
          ? `<div class="active-intervention"><b>ACTIVE TEST:</b> ${escapeHtml(test.active_intervention.action)}<br><span>Accepted ${dateOnly(test.active_intervention.accepted_at)} · baseline ${test.active_intervention.baseline.visits} visits / ${test.active_intervention.baseline.orders} orders</span></div>
             <span class="intervention-button complete-intervention" data-complete-intervention="${test.id}" data-intervention-id="${escapeHtml(test.active_intervention.id)}">Complete & evaluate intervention</span>`
          : `<span class="intervention-button accept-intervention" data-accept-intervention="${test.id}">Accept this intervention</span>`}
        ${test.last_intervention ? `<span class="intervention-history">Last result: <b>${escapeHtml(test.last_intervention.outcome)}</b> · ${Number(test.last_intervention.evaluation.delta_conversion_rate || 0).toFixed(1)} pts conversion · ${test.last_intervention.evaluation.delta_orders >= 0 ? "+" : ""}${test.last_intervention.evaluation.delta_orders} orders</span>` : ""}
      </div>
      <small class="test-next-action">${checkpoint} · ${escapeHtml(test.health_recommendation || test.next_action || "Review test")}</small>
    </button>`;
  }).join("") : '<p class="queue-clear">No products are currently in a 30-day test.</p>';

  document.querySelectorAll("[data-accept-intervention]").forEach(control => control.addEventListener("click", async event => {
    event.stopPropagation();
    const id = Number(control.dataset.acceptIntervention);
    control.textContent = "Accepting...";
    const response = await fetch(`/api/opportunities/${id}/interventions`, { method: "POST" });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      alert(body.error || "Could not accept intervention.");
    }
    await loadOpportunities();
  }));
  document.querySelectorAll("[data-complete-intervention]").forEach(control => control.addEventListener("click", async event => {
    event.stopPropagation();
    const id = Number(control.dataset.completeIntervention);
    const interventionId = control.dataset.interventionId;
    const notes = prompt("Optional result notes. What changed or what did you learn?", "") ?? "";
    control.textContent = "Evaluating...";
    const response = await fetch(`/api/opportunities/${id}/interventions/${encodeURIComponent(interventionId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes })
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      alert(body.error || "Could not complete intervention.");
    }
    await loadOpportunities();
  }));
  document.querySelectorAll("[data-test-id]").forEach(button => button.addEventListener("click", () => openExperiment(Number(button.dataset.testId))));
}

function renderAttentionQueue() {
  const priority = { urgent: 0, due: 1, normal: 2, none: 3 };
  const items = opportunities.filter(item => ["urgent", "due"].includes(item.attention_level)).sort((a, b) => priority[a.attention_level] - priority[b.attention_level]);
  document.getElementById("attention-count").textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;
  document.getElementById("attention-list").innerHTML = items.length ? items.map(item => `<button class="attention-item ${item.attention_level}" data-attention-id="${item.id}"><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.status)}</small></span><span>${escapeHtml(item.next_action)}</span></button>`).join("") : '<p class="queue-clear">Nothing urgent. Atlas has no overdue or incomplete actions.</p>';
  document.querySelectorAll("[data-attention-id]").forEach(button => button.addEventListener("click", () => {
    const item = opportunities.find(opportunity => Number(opportunity.id) === Number(button.dataset.attentionId));
    if (item?.status === "Testing") openExperiment(item.id);
    else { activeFilter = item?.status || "All"; searchQuery = item?.name.toLowerCase() || ""; document.getElementById("opportunity-search").value = item?.name || ""; renderFilters(); renderList(); }
  }));
}

function pausedNotice(item) {
  if (item.status !== "Paused") return "";
  const overdue = item.paused_review_overdue;
  const days = item.paused_review_days_remaining;
  const label = overdue ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue` : `${days} day${days === 1 ? "" : "s"} remaining`;
  return `<div class="pause-review ${overdue ? "overdue" : ""}"><strong>Paused review:</strong> ${dateOnly(item.paused_review_date)} · ${label}</div>`;
}

const fieldLabels = {
  demand_evidence: "demand evidence", offer: "product or offer", sales_channel: "sales channel",
  start_date: "start date", end_date: "end date", approved_budget: "approved budget", launch_tasks: "launch tasks"
};

function testingSummary(item) {
  if (item.status !== "Testing") return "";
  const missing = item.experiment_missing_fields || [];
  const warning = missing.length
    ? `<div class="experiment-warning"><strong>Setup incomplete:</strong> ${missing.map(field => fieldLabels[field] || field).join(", ")}</div>`
    : '<div class="experiment-ready"><strong>Experiment ready:</strong> all required setup information is recorded.</div>';
  const budget = item.experiment_budget_warning
    ? '<div class="experiment-warning"><strong>Approval required:</strong> budget exceeds the standard $25 limit.</div>' : "";
  const checkpointLabel = item.completed_checkpoints === 4
    ? '<div class="checkpoint-status complete"><strong>Weekly checkpoints:</strong> 4 of 4 complete</div>'
    : `<div class="checkpoint-status ${item.checkpoint_overdue ? "overdue" : ""}"><strong>Weekly checkpoints:</strong> ${item.completed_checkpoints} of 4 complete · Week ${item.next_checkpoint_week} ${item.checkpoint_overdue ? "overdue" : `due ${dateOnly(item.next_checkpoint_date)}`}</div>`;
  const termination = item.early_termination_recommended ? '<div class="experiment-warning"><strong>Atlas review needed:</strong> a checkpoint recommends early termination.</div>' : "";
  return `<div class="experiment-summary">
    <div class="progress-label"><span>Testing setup</span><strong>${item.experiment_progress}%</strong></div>
    <div class="progress"><span style="width:${item.experiment_progress}%"></span></div>
    ${warning}${budget}${checkpointLabel}${termination}
    <button class="workspace-button" data-id="${item.id}">Open Testing Workspace</button>
  </div>`;
}

function finalResultSummary(item) {
  if (!item.final_result || item.status === "Testing") return "";
  const result = item.final_result;
  return `<div class="final-result"><strong>${escapeHtml(result.decision)}</strong><span>Cash profit ${money(result.cash_profit)} · Labor-adjusted ${money(result.labor_adjusted_profit)}</span><small>Decided ${dateOnly(result.decided_at)}</small></div>`;
}

function blankCheckpoint(week) {
  return { week, completed: false, checkpoint_date: "", views: 0, visits: 0, favorites: 0, orders: 0, revenue: 0, expenses: 0, hours_worked: 0, customer_questions: 0, customer_feedback: "", major_problem: "", change_made: "", decision: "Continue", notes: "" };
}

function syncCheckpointTotals() {
  const total = field => checkpointDraft.reduce((sum, checkpoint) => sum + Number(checkpoint[field] || 0), 0);
  document.getElementById("hours_worked").value = total("hours_worked");
  document.getElementById("experiment_revenue").value = total("revenue");
  document.getElementById("experiment_expenses").value = total("expenses");
}

function checkpointDueDate(week) {
  const startValue = document.getElementById("start_date").value;
  if (!startValue) return "Set a start date";
  const date = new Date(`${startValue}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + (week === 4 ? 30 : week * 7));
  return date.toLocaleDateString();
}

function renderCheckpointTabs() {
  document.getElementById("checkpoint-tabs").innerHTML = checkpointDraft.map(checkpoint => `<button type="button" class="checkpoint-tab ${activeCheckpointWeek === checkpoint.week ? "active" : ""} ${checkpoint.completed ? "complete" : ""}" data-week="${checkpoint.week}">Week ${checkpoint.week}${checkpoint.completed ? " ✓" : ""}</button>`).join("");
  document.querySelectorAll(".checkpoint-tab").forEach(button => button.addEventListener("click", () => { activeCheckpointWeek = Number(button.dataset.week); renderCheckpointTabs(); renderCheckpointEditor(); }));
}

function renderCheckpointEditor() {
  const checkpoint = checkpointDraft.find(item => item.week === activeCheckpointWeek);
  const editor = document.getElementById("checkpoint-editor");
  editor.innerHTML = `<div class="checkpoint-heading"><div><h3>Week ${checkpoint.week} Check-In</h3><span>Expected by ${checkpointDueDate(checkpoint.week)}</span></div><label class="checkpoint-complete"><input type="checkbox" data-checkpoint="completed" ${checkpoint.completed ? "checked" : ""}> Mark complete</label></div>
    <div class="checkpoint-grid">
      <label>Checkpoint date<input type="date" data-checkpoint="checkpoint_date" value="${escapeHtml(checkpoint.checkpoint_date)}"></label>
      <label>Decision<select data-checkpoint="decision"><option ${checkpoint.decision === "Continue" ? "selected" : ""}>Continue</option><option ${checkpoint.decision === "Adjust" ? "selected" : ""}>Adjust</option><option ${checkpoint.decision === "Recommend Early Termination" ? "selected" : ""}>Recommend Early Termination</option></select></label>
      ${["views", "visits", "favorites", "orders", "revenue", "expenses", "hours_worked", "customer_questions"].map(field => `<label>${field.replaceAll("_", " ")}<input type="number" min="0" step="${["revenue", "expenses", "hours_worked"].includes(field) ? "0.25" : "1"}" data-checkpoint="${field}" value="${checkpoint[field]}"></label>`).join("")}
      <label class="full">Customer feedback<textarea data-checkpoint="customer_feedback">${escapeHtml(checkpoint.customer_feedback)}</textarea></label>
      <label class="full">Major problem found<textarea data-checkpoint="major_problem">${escapeHtml(checkpoint.major_problem)}</textarea></label>
      <label class="full">Change made<textarea data-checkpoint="change_made">${escapeHtml(checkpoint.change_made)}</textarea></label>
      <label class="full">Checkpoint notes<textarea data-checkpoint="notes">${escapeHtml(checkpoint.notes)}</textarea></label>
    </div>`;
  editor.querySelectorAll("[data-checkpoint]").forEach(input => input.addEventListener("input", () => {
    const field = input.dataset.checkpoint;
    checkpoint[field] = input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value || 0) : input.value;
    if (field === "completed" && checkpoint.completed && !checkpoint.checkpoint_date) {
      checkpoint.checkpoint_date = new Date().toISOString().slice(0, 10);
      renderCheckpointEditor();
    }
    syncCheckpointTotals();
    if (field === "completed") renderCheckpointTabs();
  }));
}

function renderList() {
  const attentionRank = { urgent: 0, due: 1, normal: 2, none: 3 };
  const statusRank = Object.fromEntries(STATUSES.slice(1).map((status, index) => [status, index]));
  const visible = opportunities.filter(item => (activeFilter === "All" || item.status === activeFilter) && (!searchQuery || [item.name, item.category, item.description, item.notes].some(value => String(value || "").toLowerCase().includes(searchQuery))));
  visible.sort((a, b) => {
    if (sortMode === "score") return Number(b.atlas_score) - Number(a.atlas_score);
    if (sortMode === "profit") return Number(b.actual_profit) - Number(a.actual_profit);
    if (sortMode === "status") return statusRank[a.status] - statusRank[b.status] || a.name.localeCompare(b.name);
    if (sortMode === "name") return a.name.localeCompare(b.name);
    return attentionRank[a.attention_level] - attentionRank[b.attention_level] || Number(b.atlas_score) - Number(a.atlas_score);
  });
  const list = document.getElementById("opportunity-list");
  if (!visible.length) { list.innerHTML = '<div class="card empty">No opportunities found.</div>'; return; }
  list.innerHTML = visible.map(item => `<article class="opportunity-card status-${item.status.toLowerCase()}">
    <div class="card-top"><div><span class="category">${escapeHtml(item.category)}</span><h3>${escapeHtml(item.name)}</h3></div><div class="score"><strong>${item.atlas_score}</strong><span>/100</span></div></div>
    <p>${escapeHtml(item.description)}</p>
    ${pausedNotice(item)}
    ${testingSummary(item)}
    ${finalResultSummary(item)}
    <div class="next-action ${item.attention_level}"><span>Next action</span><strong>${escapeHtml(item.next_action)}</strong>${item.next_action_date ? `<small>${dateOnly(item.next_action_date)}</small>` : ""}</div>
    <div class="details"><span><b>Startup:</b> ${money(item.startup_cost)}</span><span><b>Scalability:</b> ${escapeHtml(item.scalability)}</span><span><b>Revenue:</b> ${money(item.actual_revenue)}</span><span><b>Profit:</b> ${money(item.actual_profit)}</span></div>
    <div class="card-actions"><button class="secondary edit-button" data-edit-id="${item.id}">Edit Opportunity</button><label class="status-control">Status <select class="status-select" data-id="${item.id}">${STATUSES.slice(1).map(status => `<option ${item.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></label></div>
  </article>`).join("");
  document.querySelectorAll(".status-select").forEach(select => select.addEventListener("change", updateStatus));
  document.querySelectorAll(".workspace-button").forEach(button => button.addEventListener("click", () => openExperiment(Number(button.dataset.id))));
  document.querySelectorAll(".edit-button").forEach(button => button.addEventListener("click", () => beginEdit(Number(button.dataset.editId))));
}

function clearOpportunityForm() {
  editingOpportunityId = null;
  document.getElementById("opportunity-form").reset();
  document.getElementById("form-title").textContent = "Add Opportunity";
  document.getElementById("opportunity-submit").textContent = "Save Opportunity";
  document.getElementById("cancel-edit").classList.add("hidden");
}

function beginEdit(id) {
  const item = opportunities.find(opportunity => Number(opportunity.id) === id);
  if (!item) return;
  editingOpportunityId = id;
  const ids = ["name", "category", "description", "revenue_model", "startup_cost", "setup_time_hours", "ongoing_effort", "risk", "scalability", "confidence", "speed_to_revenue", "passivity", "atlas_fit", "notes"];
  ids.forEach(field => { document.getElementById(field).value = item[field] ?? ""; });
  document.getElementById("form-title").textContent = `Edit ${item.name}`;
  document.getElementById("opportunity-submit").textContent = "Update Opportunity";
  document.getElementById("cancel-edit").classList.remove("hidden");
  document.getElementById("form-card").classList.remove("hidden");
  document.getElementById("form-card").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderLaunchTasks() {
  const container = document.getElementById("launch-task-list");
  if (!launchTaskDraft.length) {
    container.innerHTML = '<p class="task-empty">No launch tasks recorded.</p>';
    return;
  }
  container.innerHTML = launchTaskDraft.map((task, index) => `<div class="task-row">
    <input type="checkbox" data-task-check="${index}" ${task.completed ? "checked" : ""}>
    <input value="${escapeHtml(task.text)}" data-task-text="${index}">
    <button type="button" class="danger" data-task-remove="${index}">Remove</button>
  </div>`).join("");
  container.querySelectorAll("[data-task-check]").forEach(input => input.addEventListener("change", () => { launchTaskDraft[Number(input.dataset.taskCheck)].completed = input.checked; }));
  container.querySelectorAll("[data-task-text]").forEach(input => input.addEventListener("input", () => { launchTaskDraft[Number(input.dataset.taskText)].text = input.value; }));
  container.querySelectorAll("[data-task-remove]").forEach(button => button.addEventListener("click", () => { launchTaskDraft.splice(Number(button.dataset.taskRemove), 1); renderLaunchTasks(); }));
}

function renderExperimentAlerts(item) {
  const missing = item.experiment_missing_fields || [];
  const alerts = [];
  if (missing.length) alerts.push(`<div class="experiment-warning"><strong>Required setup missing:</strong> ${missing.map(field => fieldLabels[field] || field).join(", ")}.</div>`);
  if (item.experiment_budget_warning) alerts.push('<div class="experiment-warning"><strong>Budget approval required:</strong> spending above $25 must be approved by Ross.</div>');
  document.getElementById("experiment-alerts").innerHTML = alerts.join("");
}

function renderDecisionPanel(item) {
  document.getElementById("decision-metrics").innerHTML = [
    ["Cash profit", money(item.cash_profit)],
    ["Labor cost", money(item.labor_cost)],
    ["Labor-adjusted profit", money(item.labor_adjusted_profit)],
    ["Failed tests after decision", item.projected_failed_test_count]
  ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");
  const state = item.decision_ready ? "Decision ready" : "Experiment still in progress";
  const scale = item.scaled_profitability_eligible ? '<p class="scale-eligible">Profitability standard met for a future Scaled review.</p>' : "";
  document.getElementById("atlas-recommendation").innerHTML = `<span>${state}</span><h3>Atlas recommends: ${escapeHtml(item.atlas_recommendation)}</h3><p>${escapeHtml(item.recommendation_rationale)}</p>${scale}`;
  const finalize = document.getElementById("finalize-decision");
  finalize.disabled = !item.decision_ready;
  if (["Move to Active", "Revise and Retest", "Pause", "Kill"].includes(item.atlas_recommendation)) document.getElementById("final_decision").value = item.atlas_recommendation;
}

function openExperiment(id) {
  const item = opportunities.find(opportunity => Number(opportunity.id) === id);
  if (!item || item.status !== "Testing") return;
  const experiment = item.experiment || {};
  document.getElementById("experiment-title").textContent = item.name;
  document.getElementById("experiment-opportunity-id").value = item.id;
  ["demand_evidence", "offer", "sales_channel", "start_date", "end_date", "approved_budget", "hours_worked", "customer_response"].forEach(field => {
    document.getElementById(field).value = experiment[field] ?? "";
  });
  document.getElementById("experiment_revenue").value = experiment.revenue ?? 0;
  document.getElementById("experiment_expenses").value = experiment.expenses ?? 0;
  document.getElementById("experiment_notes").value = experiment.notes ?? "";
  document.getElementById("budget_approval_confirmed").checked = Boolean(experiment.budget_approval_confirmed);
  document.getElementById("fair_test_exposure_met").checked = Boolean(experiment.fair_test_exposure_met);
  launchTaskDraft = (experiment.launch_tasks || []).map(task => ({ ...task }));
  checkpointDraft = [1, 2, 3, 4].map(week => ({ ...blankCheckpoint(week), ...((experiment.weekly_checkpoints || []).find(item => Number(item.week) === week) || {}) }));
  activeCheckpointWeek = Math.min(4, Math.max(1, item.next_checkpoint_week || 4));
  renderLaunchTasks(); renderCheckpointTabs(); renderCheckpointEditor(); syncCheckpointTotals(); renderExperimentAlerts(item); renderDecisionPanel(item);
  document.getElementById("experiment-save-status").textContent = "";
  document.getElementById("decision-status").textContent = "";
  document.getElementById("decision_summary").value = "";
  document.getElementById("override_reason").value = "";
  document.getElementById("experiment-dialog").showModal();
}

async function updateStatus(event) {
  const select = event.target;
  select.disabled = true;
  const response = await fetch(`/api/opportunities/${select.dataset.id}/status`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: select.value })
  });
  if (!response.ok) { const result = await response.json(); alert(result.error || "Unable to update status."); }
  await loadOpportunities();
}


async function loadCommandCenter() {
  const response = await fetch("/api/command-center");
  if (!response.ok) return;
  renderCommandCenter(await response.json());
}
function renderCommandCenter(data) {
  const q=s=>document.querySelector(s);
  if(!q("#commandHeadline")) return;
  q("#commandHeadline").textContent=data.headline;
  q("#commandUpdated").textContent=`Updated ${new Date(data.generated_at).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}`;
  q("#attentionCount").textContent=`${data.operating.needs_attention} open`;
  const cards=[
    ["Live Tests",data.portfolio.testing,"30-day experiments"],
    ["Needs Attention",data.operating.needs_attention,data.operating.health_at_risk?`${data.operating.health_at_risk} weak test(s)`:"Nothing urgent"],
    ["Active Interventions",data.operating.active_interventions,"One variable at a time"],
    ["Decision Ready",data.operating.decisions_ready,"30-day decisions"],
    ["Portfolio Revenue",`$${Number(data.money.total_revenue).toFixed(2)}`,"Recorded actual revenue"],
    ["Portfolio Profit",`$${Number(data.money.total_profit).toFixed(2)}`,"Recorded actual profit"]
  ];
  q("#commandKpis").innerHTML=cards.map(x=>`<div class="command-kpi"><span>${escapeHtml(x[0])}</span><strong>${escapeHtml(String(x[1]))}</strong><small>${escapeHtml(x[2])}</small></div>`).join("");
  q("#commandAttention").innerHTML=data.attention.length?data.attention.slice(0,6).map(item=>`<button class="command-item" data-command-open="${item.id}"><span class="command-priority priority-${String(item.priority).toLowerCase()}">${escapeHtml(item.priority)}</span><div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.action||"Review opportunity")}</span></div><small>${item.due_date?`Due ${escapeHtml(item.due_date)}`:escapeHtml(item.status)}</small></button>`).join(""):`<div class="command-empty"><strong>Nothing urgent.</strong><span>Atlas will surface work here when it needs you.</span></div>`;
  q("#commandMoves").innerHTML=data.next_moves.length?data.next_moves.map((item,i)=>`<button class="command-item" data-command-open="${item.id}"><span class="move-number">${i+1}</span><div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.action||"Review opportunity")}</span></div><small>${escapeHtml(item.due_date||item.priority)}</small></button>`).join(""):`<div class="command-empty"><strong>No queued moves.</strong><span>Portfolio is currently stable.</span></div>`;
  document.querySelectorAll("[data-command-open]").forEach(button=>button.addEventListener("click",()=>{const id=Number(button.dataset.commandOpen);const item=opportunities.find(o=>Number(o.id)===id);if(item?.status==="Testing")openExperiment(id);else if(item)openEdit(item);}));
}

async function loadOpportunities() {
  const [opportunityResponse, portfolioResponse] = await Promise.all([
    fetch("/api/opportunities"),
    fetch("/api/portfolio-summary")
  ]);
  opportunities = await opportunityResponse.json();
  portfolioSummaryData = portfolioResponse.ok ? await portfolioResponse.json() : null;
  opportunities.sort((a, b) => Number(b.atlas_score) - Number(a.atlas_score));
  renderMetrics(); renderFilters(); renderTestingPortfolio(); renderAttentionQueue(); renderList();
  await loadCommandCenter();
}

document.getElementById("toggle-form").addEventListener("click", () => { clearOpportunityForm(); document.getElementById("form-card").classList.toggle("hidden"); });
document.getElementById("cancel-edit").addEventListener("click", () => { clearOpportunityForm(); document.getElementById("form-card").classList.add("hidden"); });
document.getElementById("opportunity-search").addEventListener("input", event => { searchQuery = event.target.value.trim().toLowerCase(); renderList(); });
document.getElementById("opportunity-sort").addEventListener("change", event => { sortMode = event.target.value; renderList(); });
document.getElementById("start_date").addEventListener("change", () => renderCheckpointEditor());
document.getElementById("close-experiment").addEventListener("click", () => document.getElementById("experiment-dialog").close());
document.getElementById("add-launch-task").addEventListener("click", () => {
  const input = document.getElementById("new-launch-task");
  const text = input.value.trim();
  if (!text) return;
  launchTaskDraft.push({ id: `${Date.now()}`, text, completed: false }); input.value = ""; renderLaunchTasks();
});
function getExperimentPayload() {
  return {
    demand_evidence: document.getElementById("demand_evidence").value,
    offer: document.getElementById("offer").value,
    sales_channel: document.getElementById("sales_channel").value,
    start_date: document.getElementById("start_date").value,
    end_date: document.getElementById("end_date").value,
    approved_budget: document.getElementById("approved_budget").value,
    budget_approval_confirmed: document.getElementById("budget_approval_confirmed").checked,
    fair_test_exposure_met: document.getElementById("fair_test_exposure_met").checked,
    launch_tasks: launchTaskDraft,
    hours_worked: document.getElementById("hours_worked").value,
    revenue: document.getElementById("experiment_revenue").value,
    expenses: document.getElementById("experiment_expenses").value,
    customer_response: document.getElementById("customer_response").value,
    notes: document.getElementById("experiment_notes").value,
    weekly_checkpoints: checkpointDraft
  };
}

async function saveExperiment() {
  const id = document.getElementById("experiment-opportunity-id").value;
  const status = document.getElementById("experiment-save-status"); status.textContent = "Saving...";
  const response = await fetch(`/api/opportunities/${id}/experiment`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(getExperimentPayload()) });
  const result = await response.json();
  if (!response.ok) { status.textContent = result.error || "Unable to save."; return null; }
  status.textContent = "Saved"; await loadOpportunities();
  const refreshed = opportunities.find(item => Number(item.id) === Number(id));
  if (refreshed) { renderExperimentAlerts(refreshed); renderDecisionPanel(refreshed); }
  return refreshed;
}

document.getElementById("experiment-form").addEventListener("submit", async event => {
  event.preventDefault(); await saveExperiment();
});
document.getElementById("finalize-decision").addEventListener("click", async () => {
  const decisionStatus = document.getElementById("decision-status");
  const decision = document.getElementById("final_decision").value;
  const summary = document.getElementById("decision_summary").value;
  const overrideReason = document.getElementById("override_reason").value;
  decisionStatus.textContent = "Saving current results...";
  const refreshed = await saveExperiment();
  if (!refreshed) { decisionStatus.textContent = "Unable to save the experiment."; return; }
  if (!refreshed.decision_ready) { decisionStatus.textContent = "The experiment is not ready for a final decision."; return; }
  const response = await fetch(`/api/opportunities/${refreshed.id}/decision`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      decision,
      summary,
      override_reason: overrideReason
    })
  });
  const result = await response.json();
  if (!response.ok) { decisionStatus.textContent = result.error || "Unable to finalize the decision."; return; }
  decisionStatus.textContent = `Finalized: ${decision}`;
  document.getElementById("experiment-dialog").close();
  await loadOpportunities();
});
document.getElementById("opportunity-form").addEventListener("submit", async event => {
  event.preventDefault();
  const ids = ["name", "category", "description", "revenue_model", "startup_cost", "setup_time_hours", "ongoing_effort", "risk", "scalability", "confidence", "speed_to_revenue", "passivity", "atlas_fit", "notes"];
  const payload = Object.fromEntries(ids.map(id => [id, document.getElementById(id).value]));
  const endpoint = editingOpportunityId ? `/api/opportunities/${editingOpportunityId}` : "/api/opportunities";
  const response = await fetch(endpoint, { method: editingOpportunityId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!response.ok) { const result = await response.json(); alert(result.error || "Unable to add opportunity."); return; }
  clearOpportunityForm(); document.getElementById("form-card").classList.add("hidden"); await loadOpportunities();
});

loadOpportunities().catch(error => {
  console.error(error); document.getElementById("opportunity-list").innerHTML = '<div class="card empty">Unable to load opportunities.</div>';
});

