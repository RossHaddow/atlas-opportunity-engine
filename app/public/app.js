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
let workBlockMinutes = "";
let dailyPlanMinutes = "";
let radarCandidates = [];
let radarRecommendationQueue = [];
let radarSourcePerformance = [];
let radarDiscoveryPlan = null;
let radarDiscoveryJobs = null;
let radarDiscoveryRuns = null;
let radarDiscoveryAdapter = null;
let radarDiscoveryAutonomy = null;
let radarAutotriage = null;
let radarPromotionQueue = null;
let radarResearchQueue = null;
let radarEvidenceCapture = null;
let radarResearchAssist = null;

const money = value => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
const dateOnly = value => value ? new Date(value).toLocaleDateString() : "—";
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));



async function loadUnifiedNextMoves() {
  const response = await fetch("/api/next-moves");
  if (!response.ok) throw new Error("Unable to load Atlas priority queue");
  const data = await response.json();
  const headline = document.getElementById("next-moves-headline");
  const root = document.getElementById("next-moves-list");
  if (headline) headline.textContent = data.headline || "";
  if (root) root.innerHTML = (data.moves || []).length ? data.moves.map((item,index)=>`
    <div class="next-move-row">
      <strong>${index+1}. ${escapeHtml(item.name)}</strong>
      <span class="next-move-source">${escapeHtml(item.source === "radar" ? "Opportunity Radar" : "Active Portfolio")} · ${escapeHtml(item.priority)}</span>
      <span>${escapeHtml(item.action || "")}</span>
      <small>${escapeHtml(item.reason || "")}</small>
    </div>`).join("") : '<div class="command-empty"><strong>No immediate moves.</strong><span>Atlas has no urgent portfolio or Radar actions.</span></div>';
}

function radarStageClass(stage) {
  return String(stage || "New").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function renderRadar() {
  const root = document.getElementById("radar-list");
  const summary = document.getElementById("radar-summary");
  if (!root || !summary) return;
  const active = radarCandidates.filter(item => !["Dismissed", "Promoted"].includes(item.stage));
  const ready = active.filter(item => item.stage === "Ready to Test").length;
  const recommended = active.filter(item => item.stage === "Atlas Recommended").length;
  const next = radarRecommendationQueue[0];
  summary.textContent = next ? `${active.length} active · Next: ${next.name}` : `${active.length} active · ${recommended} recommended · ${ready} ready to test`;
  const controllerRoot = document.getElementById("radar-discovery-controller");
  if (controllerRoot) {
    const nextSource = radarDiscoveryPlan?.next_source;
    controllerRoot.innerHTML = nextSource ? `
      <div class="radar-controller-card">
        <div>
          <span class="eyebrow">DISCOVERY CONTROLLER</span>
          <strong>Search next: ${escapeHtml(nextSource.source_name)}</strong>
          <small>${escapeHtml(nextSource.purpose || "")}</small>
        </div>
        <div class="radar-controller-metrics">
          <span>${escapeHtml(nextSource.cadence?.mode || "Explore")}</span>
          <span>Priority ${Number(nextSource.priority_score || 0)}</span>
          <span>${radarDiscoveryPlan.sources_due} source${radarDiscoveryPlan.sources_due === 1 ? "" : "s"} due</span>
          ${radarDiscoveryJobs?.jobs_ready ? `<span>${Number(radarDiscoveryJobs.jobs_ready)} job${Number(radarDiscoveryJobs.jobs_ready)===1?"":"s"} ready</span>` : ""}
          ${radarDiscoveryRuns?.run_count ? `<span>${Number(radarDiscoveryRuns.run_count)} run${Number(radarDiscoveryRuns.run_count)===1?"":"s"} tracked</span>` : ""}
          <span>${radarDiscoveryAdapter?.enabled ? (radarDiscoveryAdapter.provider === "openai_web_search" ? "OpenAI web search ready" : "Live adapter ready") : "External handoff mode"}</span>
        </div>
        ${radarDiscoveryJobs?.jobs?.[0] ? `<div class="radar-next-job"><small>Next query</small><strong>${escapeHtml(radarDiscoveryJobs.jobs[0].query || "")}</strong><span>${escapeHtml(radarDiscoveryJobs.jobs[0].adapter?.adapter_key || "")} · up to ${Number(radarDiscoveryJobs.jobs[0].max_candidates || 0)} candidates</span></div>` : ""}
        ${radarDiscoveryRuns?.run_count ? `<div class="radar-next-job"><small>Discovery Runner</small><strong>${Number(radarDiscoveryRuns.running || 0)} running · ${Number(radarDiscoveryRuns.completed || 0)} completed</strong><span>${Number(radarDiscoveryRuns.accepted_candidates || 0)} candidates accepted · ${Number(radarDiscoveryRuns.failed || 0)} failed</span></div>` : ""}
        <div class="radar-next-job"><small>Build 84 autonomous discovery</small><strong>${radarDiscoveryAutonomy?.enabled ? (radarDiscoveryAutonomy?.executable ? "Autonomous discovery active" : "Autonomy waiting for provider") : "Autonomous discovery off"}</strong><span>${escapeHtml(radarDiscoveryAutonomy?.guidance || radarDiscoveryAdapter?.guidance || "")}</span></div>
        <div class="radar-next-job"><small>Build 85 autonomous triage</small><strong>${radarAutotriage?.enabled ? `${Number(radarAutotriage?.counts?.promote || 0)} promote · ${Number(radarAutotriage?.counts?.research || 0)} research · ${Number(radarAutotriage?.counts?.suppress || 0)} suppressed` : "Automatic triage off"}</strong><span>${escapeHtml(radarAutotriage?.guidance || "")}</span></div>
        <div class="radar-next-job"><small>Build 86 promotion gate</small><strong>${Number(radarPromotionQueue?.counts?.pending || 0)} awaiting approval · ${Number(radarPromotionQueue?.counts?.deferred || 0)} deferred</strong><span>${escapeHtml(radarPromotionQueue?.guidance || "Explicit approval is required before a Radar candidate enters Researching.")}</span></div>
        <div class="radar-next-job"><small>Build 87 research action queue</small><strong>${Number(radarResearchQueue?.counts?.pending || 0)} pending · ${Number(radarResearchQueue?.counts?.deferred || 0)} deferred · ${Number(radarResearchQueue?.counts?.completed || 0)} completed</strong><span>${escapeHtml(radarResearchQueue?.guidance || "Research candidates receive one concrete validation task at a time.")}</span></div>
        <div class="radar-next-job"><small>Build 88 evidence capture + reassessment</small><strong>${Number(radarEvidenceCapture?.evidence_events || 0)} evidence event${Number(radarEvidenceCapture?.evidence_events || 0)===1?"":"s"} · ${Number(radarEvidenceCapture?.candidates_with_evidence || 0)} candidates with evidence</strong><span>${escapeHtml(radarEvidenceCapture?.guidance || "Record real validation evidence and Atlas immediately reassesses the candidate.")}</span></div>
        <div class="radar-next-job"><small>Build 89 research assist</small><strong>${Number(radarResearchAssist?.jobs_ready || 0)} research job${Number(radarResearchAssist?.jobs_ready || 0)===1?"":"s"} ready · ${radarResearchAssist?.enabled ? (radarResearchAssist?.executable ? "provider ready" : "waiting for provider") : "assist off"}</strong><span>${escapeHtml(radarResearchAssist?.guidance || "Atlas can prepare targeted research briefs from evidence gaps without auto-accepting findings as evidence.")}</span></div>
        <div class="radar-next-job"><small>Build 90 research execution + finding review</small><strong>${radarResearchAssist?.enabled && radarResearchAssist?.executable ? "Execution ready" : "Safe review mode"}</strong><span>Provider findings are staged for Accept / Reject review before any finding can become evidence.</span></div>
      </div>` : "";
  }

  const sourceRoot = document.getElementById("radar-source-performance");
  if (sourceRoot) {
    sourceRoot.innerHTML = radarSourcePerformance.length ? `
      <div class="radar-source-head"><strong>Discovery Sources</strong><span>${radarSourcePerformance.length} tracked</span></div>
      <div class="radar-source-grid">${radarSourcePerformance.slice(0,6).map(source => `
        <div class="radar-source-card">
          <strong>${escapeHtml(source.source_name)}</strong>
          <span>${escapeHtml(source.source_type)} · Yield ${Number(source.yield_score || 0)}</span>
          <small>${Number(source.candidates || 0)} candidates · ${Number(source.ready_or_promoted_rate_pct || 0)}% ready/promoted · avg ${Number(source.average_radar_score || 0).toFixed(1)}</small>
        </div>`).join("")}</div>` : "";
  }

  root.innerHTML = radarCandidates.length ? radarCandidates.map(item => `
    <article class="radar-candidate">
      <div class="radar-candidate-head">
        <div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.category)}</span></div>
        <div class="radar-score">${Number(item.radar_score || 0)}</div>
      </div>
      <p>${escapeHtml(item.description)}</p>
      <div class="radar-meta">
        <span class="radar-stage stage-${radarStageClass(item.stage)}">${escapeHtml(item.stage)}</span>
        <span>${(item.evidence || []).length} evidence item${(item.evidence || []).length === 1 ? "" : "s"} · ${escapeHtml(item.evidence_strength || "Unrated")} evidence</span>
        ${item.source ? `<span>Source: ${escapeHtml(item.source)}</span>` : ""}${item.review_cadence?.next_review_at ? `<span>Review ${item.review_cadence.due ? "due now" : `in ${Math.max(0,Number(item.review_cadence.days_until_review||0))}d`}</span>` : ""}${(item.duplicate_matches || []).length ? `<span class="radar-duplicate">${escapeHtml(item.duplicate_matches[0].level)}: ${escapeHtml(item.duplicate_matches[0].name)}</span>` : ""}
      </div>
      ${item.triage ? `<div class="radar-recommendation"><strong>Atlas triage: ${escapeHtml(String(item.triage.action || "research").toUpperCase())}</strong><span>${escapeHtml(item.triage.next_action || "")}</span><small>${escapeHtml(item.triage.reason || "")}</small></div>` : (item.recommendation ? `<div class="radar-recommendation"><strong>${escapeHtml(item.recommendation.ready ? "Ready to advance" : "Atlas next action")}</strong><span>${escapeHtml(item.recommendation.next_action || "")}</span><small>${escapeHtml(item.recommendation.reason || "")}</small></div>` : "")}
      ${item.research_action && item.triage?.action === "research" ? `<div class="radar-recommendation"><strong>Research task · ${escapeHtml(item.research_action.priority || "Medium")}</strong><span>${escapeHtml(item.research_action.task || "")}</span><small>Status: ${escapeHtml(item.research_action.state || "pending")}</small></div>` : ""}
      ${item.test_blueprint && item.triage?.action === "promote" ? `<div class="radar-recommendation"><small>Test blueprint: ${Number(item.test_blueprint.experiment_days || 30)} days · $${Number(item.test_blueprint.approved_budget || 0)} max · launch ≤ ${Number(item.test_blueprint.target_launch_days || 0)} days · ${Number(item.test_blueprint.weekly_hour_cap || 0)} hrs/week</small></div>` : ""}
      ${(item.research_assist_runs || []).length ? (() => { const run=item.research_assist_runs[item.research_assist_runs.length-1]; const pending=(run.findings || []).filter(f=>f.review_state==="pending"); return pending.length ? `<div class="radar-recommendation"><strong>Research findings awaiting review</strong>${pending.map(f=>`<span>${escapeHtml(f.text)} · ${escapeHtml(f.quality || "Medium")} · ${escapeHtml(f.source || f.source_url || "")}</span><small><button type="button" data-radar-finding-accept="${item.id}" data-finding-id="${escapeHtml(f.finding_id)}">Accept as evidence</button> <button type="button" class="secondary" data-radar-finding-reject="${item.id}" data-finding-id="${escapeHtml(f.finding_id)}">Reject finding</button></small>`).join("")}</div>` : ""; })() : ""}
      <div class="radar-actions">
        ${item.stage !== "Promoted" && item.stage !== "Dismissed" && item.triage?.action === "promote" ? `<button type="button" data-radar-approve="${item.id}">Approve → Researching</button><button type="button" class="secondary" data-radar-defer="${item.id}">Defer</button>` : ""}
        ${item.stage !== "Promoted" && item.stage !== "Dismissed" && item.triage?.action === "research" && item.research_action?.state !== "completed" ? `<button type="button" data-radar-research-complete="${item.id}">Complete research task</button><button type="button" class="secondary" data-radar-research-defer="${item.id}">Defer task</button>` : ""}
        ${item.stage !== "Promoted" && item.stage !== "Dismissed" && item.triage?.action === "research" && item.research_action?.state !== "completed" ? `<button type="button" class="secondary" data-radar-research-assist="${item.id}">Prepare research brief</button>` : ""}
        ${item.stage !== "Promoted" && item.stage !== "Dismissed" ? `<button type="button" class="secondary" data-radar-evidence="${item.id}">Add evidence</button>` : ""}
        ${item.stage !== "Promoted" && item.stage !== "Dismissed" && item.triage?.action !== "promote" ? `<button type="button" data-radar-promote="${item.id}">Promote to Researching</button>` : ""}
        ${item.stage !== "Promoted" && item.stage !== "Dismissed" ? `<button type="button" class="secondary" data-radar-dismiss="${item.id}">Dismiss</button>` : ""}
        ${item.promotion_review?.last_decision ? `<span>Promotion review: ${escapeHtml(item.promotion_review.last_decision)}</span>` : ""}
        ${item.stage === "Promoted" ? `<span>Portfolio #${Number(item.promoted_opportunity_id || 0)}</span>` : ""}
      </div>
    </article>`).join("") : '<div class="command-empty"><strong>No Radar candidates yet.</strong><span>Add ideas here before committing them to the active portfolio.</span></div>';

  root.querySelectorAll("[data-radar-approve]").forEach(button => button.addEventListener("click", async () => {
    const response = await fetch(`/api/radar/${button.dataset.radarApprove}/promotion-review`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({decision:"approve"}) });
    const result = await response.json();
    if (!response.ok) return alert(result.error || "Unable to approve promotion.");
    await Promise.all([loadRadar(), loadOpportunities(), loadUnifiedNextMoves()]);
  }));
  root.querySelectorAll("[data-radar-defer]").forEach(button => button.addEventListener("click", async () => {
    const response = await fetch(`/api/radar/${button.dataset.radarDefer}/promotion-review`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({decision:"defer"}) });
    const result = await response.json();
    if (!response.ok) return alert(result.error || "Unable to defer promotion.");
    await Promise.all([loadRadar(), loadUnifiedNextMoves()]);
  }));
  root.querySelectorAll("[data-radar-research-assist]").forEach(button => button.addEventListener("click", async () => {
    const execute = Boolean(radarResearchAssist?.enabled && radarResearchAssist?.executable);
    const response = await fetch(`/api/radar/${button.dataset.radarResearchAssist}/research-assist`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({execute}) });
    const result = await response.json();
    if (!response.ok) return alert(result.error || "Unable to run Research Assist.");
    if (!execute) return alert(`Research brief ready\n\nQuery: ${result.query}\n\nTask: ${result.task}\n\nExpected evidence: ${(result.expected_evidence_types || []).join(", ")}\n\n${result.guidance || ""}`);
    alert(`Research complete. ${Number(result.run?.findings?.length || 0)} finding(s) are waiting for your review.`);
    await loadRadar();
  }));
  root.querySelectorAll("[data-radar-finding-accept]").forEach(button => button.addEventListener("click", async () => {
    const response=await fetch(`/api/radar/${button.dataset.radarFindingAccept}/research-findings/${button.dataset.findingId}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({decision:"accept"})});
    const result=await response.json();
    if(!response.ok) return alert(result.error || "Unable to accept finding.");
    await Promise.all([loadRadar(),loadUnifiedNextMoves()]);
  }));
  root.querySelectorAll("[data-radar-finding-reject]").forEach(button => button.addEventListener("click", async () => {
    const response=await fetch(`/api/radar/${button.dataset.radarFindingReject}/research-findings/${button.dataset.findingId}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({decision:"reject"})});
    const result=await response.json();
    if(!response.ok) return alert(result.error || "Unable to reject finding.");
    await loadRadar();
  }));
  root.querySelectorAll("[data-radar-evidence]").forEach(button => button.addEventListener("click", async () => {
    const text = prompt("What evidence did you find? Record the concrete fact or signal.");
    if (!text || !text.trim()) return;
    const type = prompt("Evidence type (examples: direct_customer_request, competitor_sales, marketplace_activity, search_activity, survey_interest, comparable_product, signal)", "signal") || "signal";
    const quality = prompt("Evidence quality: Low, Medium, or High", "Medium") || "Medium";
    const source = prompt("Source or URL (optional)", "") || "";
    const response = await fetch(`/api/radar/${button.dataset.radarEvidence}/evidence`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({text:text.trim(), type:type.trim(), quality:quality.trim(), source:source.trim()}) });
    const result = await response.json();
    if (!response.ok) return alert(result.error || "Unable to add evidence.");
    await Promise.all([loadRadar(), loadUnifiedNextMoves()]);
  }));
  root.querySelectorAll("[data-radar-research-complete]").forEach(button => button.addEventListener("click", async () => {
    const response = await fetch(`/api/radar/${button.dataset.radarResearchComplete}/research-action`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({decision:"complete"}) });
    const result = await response.json();
    if (!response.ok) return alert(result.error || "Unable to complete research task.");
    await Promise.all([loadRadar(), loadUnifiedNextMoves()]);
  }));
  root.querySelectorAll("[data-radar-research-defer]").forEach(button => button.addEventListener("click", async () => {
    const response = await fetch(`/api/radar/${button.dataset.radarResearchDefer}/research-action`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({decision:"defer"}) });
    const result = await response.json();
    if (!response.ok) return alert(result.error || "Unable to defer research task.");
    await Promise.all([loadRadar(), loadUnifiedNextMoves()]);
  }));
  root.querySelectorAll("[data-radar-promote]").forEach(button => button.addEventListener("click", async () => {
    const response = await fetch(`/api/radar/${button.dataset.radarPromote}/promote`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({}) });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 409 && result.recommendation) return alert(`${result.error} Next: ${result.recommendation.next_action}`);
      return alert(result.error || "Unable to promote candidate.");
    }
    await Promise.all([loadRadar(), loadOpportunities(), loadUnifiedNextMoves()]);
  }));
  root.querySelectorAll("[data-radar-review]").forEach(button => button.addEventListener("click", async () => {
    const response = await fetch(`/api/radar/${button.dataset.radarReview}/review`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({})});
    const result = await response.json();
    if (!response.ok) return alert(result.error || "Unable to record Radar review.");
    await Promise.all([loadRadar(), loadUnifiedNextMoves()]);
  }));
  root.querySelectorAll("[data-radar-dismiss]").forEach(button => button.addEventListener("click", async () => {
    const response = await fetch(`/api/radar/${button.dataset.radarDismiss}`, { method: "PATCH", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ stage:"Dismissed" }) });
    const result = await response.json();
    if (!response.ok) return alert(result.error || "Unable to dismiss candidate.");
    await Promise.all([loadRadar(), loadUnifiedNextMoves()]);
  }));
}

async function loadRadar() {
  const response = await fetch("/api/radar");
  if (!response.ok) throw new Error("Unable to load Opportunity Radar");
  const data = await response.json();
  radarCandidates = data.candidates || [];
  radarRecommendationQueue = data.recommendation_queue || [];
  radarSourcePerformance = data.source_performance || [];
  radarDiscoveryPlan = data.discovery_plan || null;
  radarDiscoveryJobs = data.discovery_jobs || null;
  radarDiscoveryRuns = data.discovery_runs || null;
  radarDiscoveryAdapter = data.discovery_adapter || null;
  radarDiscoveryAutonomy = data.discovery_autonomy || null;
  radarAutotriage = data.autotriage || null;
  radarPromotionQueue = data.promotion_queue || null;
  radarResearchQueue = data.research_queue || null;
  radarEvidenceCapture = data.evidence_capture || null;
  radarResearchAssist = data.research_assist || null;
  renderRadar();
}

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
  const params = new URLSearchParams();
  if (workBlockMinutes) params.set("minutes", workBlockMinutes);
  if (dailyPlanMinutes) params.set("daily_minutes", dailyPlanMinutes);
  const response = await fetch(`/api/command-center${params.toString() ? `?${params}` : ""}`);
  if (!response.ok) return;
  renderCommandCenter(await response.json());
}
function openIntelligenceTarget(id) {
  const item = opportunities.find(opportunity => Number(opportunity.id) === Number(id));
  if (!item) return;
  if (item.status === "Testing") openExperiment(item.id);
  else beginEdit(item.id);
}

async function updateFocus(id, action, days = 1) {
  const reason = arguments[3] || "";
  const response = await fetch(`/api/opportunities/${id}/focus`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, days, reason })
  });
  const result = await response.json();
  if (!response.ok) { alert(result.error || "Unable to update focus."); return; }
  await loadOpportunities();
}

function renderIntelligenceCommand(data) {
  const top = data.top_focus;
  const topFocus = document.getElementById("topFocus");
  const queue = document.getElementById("intelligenceQueue");
  if (!topFocus || !queue) return;

  if (!top) {
    topFocus.innerHTML = '<div class="command-empty"><strong>No active focus.</strong><span>Atlas has no open priorities right now. Completed or deferred work will return automatically when its hold expires.</span></div>';
    queue.innerHTML = '<div class="command-empty"><strong>Queue clear.</strong><span>Add, reopen, or wait for deferred work to return.</span></div>';
    return;
  }

  const reasons = (top.reasons || []).slice(0, 3);
  const focus = top.focus || { status: "idle" };
  const active = focus.status === "active";
  topFocus.innerHTML = `<div class="top-focus-card">
    <div class="top-focus-score"><strong>${Number(top.work_priority_score || 0)}</strong><span>/100 priority</span></div>
    <div class="top-focus-body">
      <div class="top-focus-meta"><span>${escapeHtml(top.status)}</span><span>Atlas score ${Number(top.atlas_score || 0)}</span>${top.health_label ? `<span>${escapeHtml(top.health_label)} test</span>` : ""}${active ? '<span class="focus-active-pill">Focus active</span>' : ""}</div>
      <h4>${escapeHtml(top.name)}</h4>
      <p class="top-focus-recommendation">${escapeHtml(top.strategic_recommendation || top.recommendation || "Review opportunity")}</p>
      ${top.adaptive_next_action?.mode === "micro" ? `<div class="adaptive-next-action"><span>Do next · ${Number(top.adaptive_next_action.estimated_minutes || 15)} min</span><strong>${escapeHtml(top.adaptive_next_action.action)}</strong><small>${escapeHtml(top.adaptive_next_action.reason || "Atlas shrank this action based on recent execution friction.")}</small>${top.capacity_fit ? `<small>Capacity fit: ${escapeHtml(top.capacity_fit.label || "Learning")} · ${escapeHtml(top.capacity_fit.guidance || "")}</small>` : ""}</div>` : (top.capacity_fit?.estimated_minutes ? `<div class="adaptive-next-action"><span>Capacity fit</span><strong>${escapeHtml(top.capacity_fit.label || "Learning")}</strong><small>${escapeHtml(top.capacity_fit.guidance || "")}</small></div>` : "")}
      ${reasons.length ? `<ul>${reasons.map(reason => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>` : ""}
      <div class="focus-actions">
        <button type="button" data-intelligence-open="${top.id}">Open ${top.status === "Testing" ? "Testing Workspace" : "Opportunity"}</button>
        ${active ? `<button type="button" class="focus-complete" data-focus-complete="${top.id}">Complete for today</button>` : `<button type="button" class="focus-start" data-focus-start="${top.id}">Start focus</button>`}
        <select class="focus-defer-reason" data-focus-defer-reason="${top.id}" aria-label="Why defer this focus?">
          <option value="">Defer reason (optional)</option>
          <option value="timing">Bad timing / not today</option>
          <option value="capacity">Not enough time / energy</option>
          <option value="blocked">Blocked / waiting on something</option>
          <option value="too_big">Action is too big</option>
          <option value="unclear">Next step is unclear</option>
          <option value="low_priority">Does not feel worth prioritizing</option>
          <option value="other">Other</option>
        </select>
        <button type="button" class="focus-defer" data-focus-defer="${top.id}">Defer 1 day</button>
      </div>
      ${active && focus.started_at ? `<small class="focus-state-note">Started ${new Date(focus.started_at).toLocaleString()}</small>` : ""}
    </div>
  </div>`;

  const ranked = (data.intelligence || []).filter(item => Number(item.id) !== Number(top.id)).slice(0, 4);
  queue.innerHTML = ranked.length ? ranked.map((item, index) => `<button class="intelligence-row" data-intelligence-open="${item.id}">
    <span class="intelligence-rank">${index + 2}</span>
    <div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.adaptive_next_action?.mode === "micro" ? item.adaptive_next_action.action : (item.recommendation || "Review opportunity"))}</span></div>
    <div class="intelligence-row-score"><strong>${Number(item.work_priority_score || 0)}</strong><small>${escapeHtml(item.status)}</small></div>
  </button>`).join("") : '<div class="command-empty"><strong>No additional priorities.</strong><span>Your top focus is the only active item in the ranked queue.</span></div>';

  document.querySelectorAll("[data-intelligence-open]").forEach(button => button.addEventListener("click", () => openIntelligenceTarget(Number(button.dataset.intelligenceOpen))));
  document.querySelectorAll("[data-focus-start]").forEach(button => button.addEventListener("click", () => updateFocus(Number(button.dataset.focusStart), "start")));
  document.querySelectorAll("[data-focus-complete]").forEach(button => button.addEventListener("click", () => updateFocus(Number(button.dataset.focusComplete), "complete")));
  document.querySelectorAll("[data-focus-defer]").forEach(button => button.addEventListener("click", () => {
    const id = Number(button.dataset.focusDefer);
    const reason = document.querySelector(`[data-focus-defer-reason="${id}"]`)?.value || "";
    updateFocus(id, "defer", 1, reason);
  }));
}


async function startPlannedWorkBlock(item, metadata = {}) {
  if (!item?.id || !item?.action || !item?.estimated_minutes) return;
  const response = await fetch(`/api/opportunities/${item.id}/focus`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "start", planned_action: item.action, planned_minutes: item.estimated_minutes, ...metadata })
  });
  const result = await response.json();
  if (!response.ok) { alert(result.error || "Unable to start work block."); return; }
  await loadOpportunities();
}

function renderNextWorkBlock(data) {
  const root = document.getElementById("nextWorkBlock");
  const select = document.getElementById("workBlockMinutes");
  if (!root) return;
  const plan = data.next_work_block || {};
  if (select && !workBlockMinutes && plan.available_minutes) select.value = String(plan.available_minutes);
  const selected = plan.selected;
  if (!selected) { root.innerHTML = '<div class="command-empty"><strong>No executable block yet.</strong><span>Add or reopen an opportunity and Atlas will rank the best use of the time window.</span></div>'; return; }
  const alternatives = plan.alternatives || [];
  root.innerHTML = `<div class="work-block-primary"><div><span>${escapeHtml(plan.signal || "Next work block")}</span><strong>${escapeHtml(selected.name)}</strong><p>${escapeHtml(selected.action)}</p><small>${Number(selected.estimated_minutes || plan.available_minutes || 0)} min · ${escapeHtml(selected.fit_label || "Planned")} · priority ${Number(selected.work_priority_score || 0)}</small></div><button type="button" data-start-work-block="${selected.id}">Start this block</button></div>${alternatives.length ? `<div class="work-block-alternatives"><span>Alternatives</span>${alternatives.map(item => `<button type="button" data-start-work-block="${item.id}"><strong>${escapeHtml(item.name)}</strong><small>${Number(item.estimated_minutes || 0)} min · ${escapeHtml(item.fit_label || "Planned")}</small></button>`).join("")}</div>` : ""}`;
  const byId = new Map([selected, ...alternatives].map(item => [String(item.id), item]));
  root.querySelectorAll("[data-start-work-block]").forEach(button => button.addEventListener("click", () => startPlannedWorkBlock(byId.get(button.dataset.startWorkBlock))));
}


function renderDailyWorkPlan(data) {
  const root = document.getElementById("dailyWorkPlan");
  const select = document.getElementById("dailyPlanMinutes");
  if (!root) return;
  const plan = data.daily_work_plan || {};
  if (select && !dailyPlanMinutes && plan.total_minutes) select.value = String(plan.total_minutes);
  const blocks = plan.blocks || [];
  if (!blocks.length) {
    root.innerHTML = '<div class="command-empty"><strong>No executable daily plan yet.</strong><span>Atlas needs open work that fits the selected time window.</span></div>';
    return;
  }
  const execution = data.daily_plan_execution || {};
  const executionLine = Number(execution.plan_days || 0) ? `<div class="daily-plan-learning"><strong>${escapeHtml(execution.signal || "Daily-plan learning")}</strong><span>${execution.follow_through_pct == null ? "Learning" : `${Number(execution.follow_through_pct)}% follow-through`} · ${Number(execution.completed || 0)} completed / ${Number(execution.deferred || 0)} deferred</span><small>${escapeHtml(execution.guidance || "")}</small></div>` : `<div class="daily-plan-learning"><strong>Daily-plan baseline forming</strong><span>Start planned blocks to teach Atlas whether this daily sequence is realistic.</span></div>`;
  const adaptation = plan.adaptation || {};
  const adaptationLine = `<div class="daily-plan-learning"><strong>${escapeHtml(adaptation.label || "Plan sizing")}</strong><span>${Number(plan.planning_target_minutes || plan.total_minutes || 0)} min planning target · ${Number(plan.reserved_minutes || 0)} min reserved</span><small>${escapeHtml(adaptation.reason || "Atlas is learning how much of the available window to schedule.")}</small></div>`;
  const density = data.daily_plan_density_learning || {};
  const densityLine = `<div class="daily-plan-learning"><strong>${escapeHtml(density.signal || "Density baseline forming")}</strong><span>${density.best_density_pct ? `${Number(density.best_density_pct)}% leading density · ${escapeHtml(density.best_evidence || "Learning")}` : "Comparing 70% · 85% · 100% plan density"}</span><small>${escapeHtml(density.guidance || "Atlas is learning which planning density produces the best follow-through.")}</small></div>`;
  const densityController = data.daily_plan_density_controller || {};
  const controllerLine = `<div class="daily-plan-learning"><strong>${escapeHtml(densityController.stability || "Density controller learning")}</strong><span>${Number(densityController.density_pct || adaptation.density_pct || 100)}% applied density · ${escapeHtml(densityController.source || "rule_based")}</span><small>${escapeHtml(densityController.reason || "Atlas will adopt a learned planning density only when the evidence is deep enough and stable enough.")}</small></div>`;
  const timeWindow = data.daily_plan_time_window_learning || plan.time_window_learning || {};
  const timeWindowLine = `<div class="daily-plan-learning"><strong>${escapeHtml(timeWindow.signal || "Time-of-day baseline forming")}</strong><span>${timeWindow.preferred_label ? `${escapeHtml(timeWindow.preferred_label)} preferred · ${escapeHtml(timeWindow.preferred_evidence || "Learning")}` : "Comparing morning · afternoon · evening · late night"}</span><small>${escapeHtml(timeWindow.guidance || "Atlas is learning when planned work is most likely to get finished.")}</small></div>`;
  const timePriority = data.daily_plan_time_window_priority || plan.time_window_priority || {};
  const timePriorityLine = `<div class="daily-plan-learning"><strong>${escapeHtml(timePriority.signal || "Time-window priority learning")}</strong><span>${Number(timePriority.adjusted_count || 0) ? `${Number(timePriority.adjusted_count)} priority adjustment${Number(timePriority.adjusted_count) === 1 ? "" : "s"} · ${escapeHtml(timePriority.current_label || "Current window")}` : `${escapeHtml(timePriority.current_label || "Current window")} · Atlas Score unchanged`}</span><small>${escapeHtml(timePriority.guidance || "Atlas will only adjust planning order after an opportunity has established evidence in this same time window.")}</small></div>`;
  const workType = data.daily_plan_work_type_learning || plan.work_type_learning || {};
  const workTypeLine = `<div class="daily-plan-learning"><strong>${escapeHtml(workType.signal || "Work-type learning")}</strong><span>${Number(workType.adjusted_count || 0) ? `${Number(workType.adjusted_count)} evidence-backed task-type adjustment${Number(workType.adjusted_count) === 1 ? "" : "s"}` : "Research · creation · editing · setup · review · outreach"}</span><small>${escapeHtml(workType.guidance || "Atlas is learning which kinds of work fit this time window best.")}</small></div>`;
  const composition = data.daily_plan_composition_learning || plan.composition_learning || {};
  const compositionLine = `<div class="daily-plan-learning"><strong>${escapeHtml(composition.signal || "Plan-mix baseline forming")}</strong><span>${composition.preferred_mode ? `${escapeHtml(composition.preferred_mode)} mix · ${escapeHtml(composition.preferred_evidence || "Learning")}` : "Comparing focused plans · mixed work-type plans"}</span><small>${escapeHtml(composition.guidance || "Atlas is learning whether work-type continuity or variety produces better daily-plan follow-through.")}</small></div>`;
  const sequence = data.daily_plan_sequence_learning || plan.sequence_learning || {};
  const sequenceLine = `<div class="daily-plan-learning"><strong>${escapeHtml(sequence.signal || "Sequence baseline forming")}</strong><span>${Number(sequence.adjusted_positions || 0) || Number(sequence.adjusted_transitions || 0) ? `${Number(sequence.adjusted_positions || 0)} position fit${Number(sequence.adjusted_positions || 0) === 1 ? "" : "s"} · ${Number(sequence.adjusted_transitions || 0)} transition${Number(sequence.adjusted_transitions || 0) === 1 ? "" : "s"}` : "Learning first · middle · last placement and transitions"}</span><small>${escapeHtml(sequence.guidance || "Atlas is learning whether work type and task transitions affect follow-through by sequence position.")}</small></div>`;
  const depth = data.daily_plan_depth_learning || plan.depth_learning || {};
  const depthRecovery = data.daily_plan_depth_recovery_learning || plan.depth_recovery_learning || {};
  const depthController = data.daily_plan_depth_controller || plan.depth_controller || {};
  const depthLine = `<div class="daily-plan-learning"><strong>${escapeHtml(depth.signal || "Plan-depth baseline forming")}</strong><span>${depth.decay_active ? `${Number(depthController.max_blocks || depth.recommended_max_blocks || 5)} block cap · ${escapeHtml(depth.strength || "Established")}` : "Comparing blocks 1–2 with blocks 3+"}</span><small>${escapeHtml(depth.guidance || "Atlas is learning whether follow-through drops deeper into the Daily Work Plan.")}</small></div>`;
  const depthRecoveryLine = `<div class="daily-plan-learning"><strong>${escapeHtml(depthRecovery.signal || "Depth recovery baseline forming")}</strong><span>${depthRecovery.mode === "probe" ? "Controlled third-block recovery probe" : (depthRecovery.mode === "recovered" ? "Recent deep execution has rebounded" : (depthRecovery.mode === "protected" ? "Fatigue cap still protected" : "Watching recent recovery evidence"))}</span><small>${escapeHtml(depthRecovery.guidance || "Atlas is watching for evidence that plan depth can safely return toward normal.")}</small></div>`;
  const blockSize = data.daily_plan_block_size_learning || plan.block_size_learning || {};
  const blockSizeController = data.daily_plan_block_size_controller || plan.block_size_controller || {};
  const earlySize = blockSizeController.early || {};
  const deepSize = blockSizeController.deep || {};
  const blockSizeLine = `<div class="daily-plan-learning"><strong>${escapeHtml(blockSize.signal || "Block-size baseline forming")}</strong><span>${earlySize.active || deepSize.active ? `Early ${Number(earlySize.target_minutes || plan.normal_block_minutes || 30)} min · Deep ${Number(deepSize.target_minutes || plan.normal_block_minutes || 30)} min` : "Comparing short · standard · long blocks by plan depth"}</span><small>${escapeHtml(blockSize.guidance || "Atlas is learning whether shorter or longer work blocks execute better early versus deep in the Daily Work Plan.")}</small></div>`;
  const blockOutcome = data.daily_plan_block_size_outcome_learning || plan.block_size_outcome_learning || {};
  const blockOutcomeLine = `<div class="daily-plan-learning"><strong>${escapeHtml(blockOutcome.signal || "Block-outcome calibration forming")}</strong><span>${earlySize.outcome_active || deepSize.outcome_active ? `Actual-duration calibration active · Early ${Number(earlySize.target_minutes || 30)} min · Deep ${Number(deepSize.target_minutes || 30)} min` : "Comparing planned minutes · actual minutes · follow-through"}</span><small>${escapeHtml(blockOutcome.guidance || "Atlas is learning whether planned block durations match the time the work actually takes.")}</small></div>`;
  root.innerHTML = `<div class="daily-plan-summary"><strong>${escapeHtml(plan.signal || "Daily plan")}</strong><span>${Number(plan.utilization_pct || 0)}% scheduled · ${Number(plan.remaining_minutes || 0)} min unallocated</span></div>${adaptationLine}${densityLine}${controllerLine}${timeWindowLine}${timePriorityLine}${workTypeLine}${compositionLine}${sequenceLine}${depthLine}${depthRecoveryLine}${blockSizeLine}${blockOutcomeLine}${executionLine}<div class="daily-plan-blocks">${blocks.map(item => `<div class="daily-plan-block"><span class="move-number">${Number(item.sequence)}</span><div><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.action)}</p><small>${Number(item.planned_minutes || 0)} min · priority ${Number(item.work_priority_score || 0)}${item.time_window_fit?.score_adjustment ? ` · ${item.time_window_fit.score_adjustment > 0 ? "+" : ""}${Number(item.time_window_fit.score_adjustment)} ${escapeHtml(item.time_window_fit.label || "window")} fit` : ""}${item.work_type ? ` · ${escapeHtml(item.work_type.replaceAll("_", " "))}` : ""}${item.work_type_fit?.score_adjustment ? ` ${item.work_type_fit.score_adjustment > 0 ? "+" : ""}${Number(item.work_type_fit.score_adjustment)}` : ""}${item.composition_adjustment ? ` · mix ${item.composition_adjustment > 0 ? "+" : ""}${Number(item.composition_adjustment)}` : ""}${item.sequence_adjustment ? ` · sequence ${item.sequence_adjustment > 0 ? "+" : ""}${Number(item.sequence_adjustment)}` : ""}</small></div><button type="button" data-start-daily-block="${item.id}" data-sequence="${Number(item.sequence)}">Start</button></div>`).join("")}</div>`;
  const byId = new Map(blocks.map(item => [String(item.id), item]));
  root.querySelectorAll("[data-start-daily-block]").forEach(button => button.addEventListener("click", () => startPlannedWorkBlock(byId.get(button.dataset.startDailyBlock), { work_block_source: "daily_work_plan", plan_sequence: Number(button.dataset.sequence), plan_total_minutes: Number(plan.total_minutes || 0), plan_density_pct: Number(adaptation.density_pct || 100), plan_composition_mode: composition.mode || "learning" })));
}

function renderFocusReview(data) {
  const root = document.getElementById("focusReview");
  if (!root) return;
  const review = data.focus_execution || { started: 0, completed: 0, deferred: 0, focused_minutes: 0, active: 0, recent: [] };
  const stats = [
    ["Started", review.started || 0, review.active ? `${review.active} active now` : "focus sessions"],
    ["Completed", review.completed || 0, "finished today"],
    ["Deferred", review.deferred || 0, "moved intentionally"],
    ["Focused", `${Number(review.focused_minutes || 0)}m`, "tracked session time"]
  ];
  const recent = (review.recent || []).slice(0, 5);
  root.innerHTML = `<div class="focus-review-stats">${stats.map(item => `<div class="focus-review-stat"><span>${escapeHtml(item[0])}</span><strong>${escapeHtml(String(item[1]))}</strong><small>${escapeHtml(item[2])}</small></div>`).join("")}</div>
    <div class="focus-review-history">${recent.length ? recent.map(item => `<div class="focus-history-row"><div><strong>${escapeHtml(item.opportunity_name || "Opportunity")}</strong><span>${escapeHtml(item.event || "focus")} · ${escapeHtml(item.action || "Review opportunity")}</span></div><small>${item.duration_minutes ? `${Number(item.duration_minutes)}m · ` : ""}${item.defer_reason ? `${escapeHtml(item.defer_reason.replaceAll("_", " "))} · ` : ""}${new Date(item.at).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}</small></div>`).join("") : '<div class="focus-history-empty">No focus activity yet today. Start the Top Focus when you begin.</div>'}</div>`;
}

function renderFocusScorecard(data) {
  const root = document.getElementById("focusScorecard");
  if (!root) return;
  const card = data.focus_scorecard || {};
  const followThrough = card.follow_through_pct == null ? "—" : `${Number(card.follow_through_pct)}%`;
  const metrics = [
    ["Focus days", `${Number(card.active_days || 0)}/${Number(card.window_days || 7)}`, "days with recorded action"],
    ["Follow-through", followThrough, "completed vs deferred"],
    ["Focused", `${Number(card.focused_minutes || 0)}m`, "tracked in the last 7 days"],
    ["Completed", Number(card.completed || 0), `${Number(card.deferred || 0)} deferred`]
  ];
  const leaders = (card.top_opportunities || []).slice(0, 4);
  root.innerHTML = `<div class="focus-scorecard-summary"><div class="focus-scorecard-metrics">${metrics.map(item => `<div class="focus-scorecard-stat"><span>${escapeHtml(item[0])}</span><strong>${escapeHtml(String(item[1]))}</strong><small>${escapeHtml(item[2])}</small></div>`).join("")}</div><div class="focus-signal"><span>Execution signal</span><strong>${escapeHtml(card.signal || "No focus data yet")}</strong><p>${escapeHtml(card.guidance || "Start recording focus sessions so Atlas can learn from execution.")}</p></div></div>
    <div class="focus-scorecard-leaders"><h4>Where focus went</h4>${leaders.length ? leaders.map(item => `<div class="focus-leader-row"><div><strong>${escapeHtml(item.opportunity_name || "Opportunity")}</strong><span>${Number(item.completed || 0)} completed · ${Number(item.deferred || 0)} deferred</span></div><small>${Number(item.focused_minutes || 0)}m</small></div>`).join("") : '<div class="focus-history-empty">No 7-day focus history yet.</div>'}</div>`;
}

function renderFocusFriction(data) {
  const root = document.getElementById("focusFriction");
  if (!root) return;
  const friction = data.focus_friction || {};
  const reasons = (friction.reasons || []).slice(0, 5);
  const opportunities = (friction.opportunities || []).slice(0, 4);
  if (!Number(friction.reasoned_deferred || 0)) {
    root.innerHTML = '<div class="focus-history-empty">No diagnosed friction yet. Defer reasons are optional; choose one when it would help Atlas understand why work moved.</div>';
    return;
  }
  const effectiveness = data.resolution_effectiveness || {};
  const resolutionStrategy = data.resolution_strategy || {};
  const strategyByResponse = Object.fromEntries((resolutionStrategy.strategies || []).map(item => [item.response, item]));
  const resolutionTypes = (effectiveness.types || []).slice(0, 5);
  const successText = effectiveness.success_pct == null ? "Learning" : `${Number(effectiveness.success_pct)}%`;
  root.innerHTML = `<div class="friction-summary-grid">
    <div class="friction-signal"><span>Most common friction</span><strong>${escapeHtml(friction.dominant_label || "Mixed")}</strong><p>${Number(friction.reasoned_deferred || 0)} reasoned deferrals in the last ${Number(friction.window_days || 14)} days · ${Number(friction.unclassified_deferred || 0)} unclassified</p></div>
    <div class="friction-reasons">${reasons.map(item => `<div class="friction-reason-row"><span>${escapeHtml(item.label)}</span><strong>${Number(item.count || 0)}</strong></div>`).join("")}</div>
  </div>
  <div class="resolution-effectiveness"><div class="friction-signal"><span>Resolution effectiveness · ${Number(effectiveness.window_days || 30)} days</span><strong>${escapeHtml(successText)}</strong><p>${escapeHtml(effectiveness.signal || "Not enough resolution data")} · ${Number(effectiveness.completed || 0)} completed / ${Number(effectiveness.deferred || 0)} deferred</p><small>${escapeHtml(effectiveness.guidance || "Atlas will learn whether resolution actions work as outcomes accumulate.")}</small></div>${resolutionTypes.length ? `<div class="friction-reasons">${resolutionTypes.map(item => { const strategy = strategyByResponse[item.response] || {}; return `<div class="friction-reason-row"><span>${escapeHtml((item.response || "unknown").replaceAll("_", " "))}<small>${escapeHtml(strategy.label || "Keep learning")} · ${escapeHtml(strategy.evidence_level || "Insufficient")}${strategy.stability?.status ? ` · ${escapeHtml(strategy.stability.status === "held" ? "strategy held" : strategy.stability.status === "changed" ? "change accepted" : "stable")}` : ""}</small></span><strong>${item.success_pct == null ? "—" : `${Number(item.success_pct)}%`}</strong></div>`; }).join("")}</div>` : ""}</div>
  <div class="friction-opportunities">${opportunities.map(item => { const resolution = item.resolution || {}; return `<div class="friction-opportunity-row"><div><strong>${escapeHtml(item.name || "Opportunity")}</strong><span>${escapeHtml(item.signal || "Mixed execution friction")}</span><p>${escapeHtml(item.guidance || "")}</p>${resolution.available ? `<div class="friction-resolution"><b>${escapeHtml(resolution.label || "Resolve friction")}</b><span>${escapeHtml(resolution.action || "")}</span>${resolution.adaptive_strategy ? `<small>Adaptive strategy: ${escapeHtml(resolution.adaptive_strategy.label || "Keep learning")} · ${escapeHtml(resolution.adaptive_strategy.scope || "portfolio")} evidence${resolution.adaptive_strategy.stability?.status ? ` · ${escapeHtml(resolution.adaptive_strategy.stability.status === "held" ? "strategy held" : resolution.adaptive_strategy.stability.status === "changed" ? "change accepted" : "stable")}` : ""}</small>${resolution.adaptive_strategy.stability?.reason ? `<small>Stability: ${escapeHtml(resolution.adaptive_strategy.stability.reason)}</small>` : ""}` : ""}<button type="button" onclick="startFrictionResolution(${Number(item.id)})">Start resolution · ${Number(resolution.estimated_minutes || 10)}m</button></div>` : ""}</div><small>${Number(item.reasoned_deferred || 0)} reasoned</small></div>`; }).join("")}</div>`;
}

async function startFrictionResolution(id) {
  try {
    const res = await fetch(`/api/opportunities/${id}/friction-resolution`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error || "Could not start friction resolution.");
    await loadData();
  } catch (error) {
    alert(error.message);
  }
}

function renderAdaptiveActionLearning(data) {
  const root = document.getElementById("adaptiveActionLearning");
  if (!root) return;
  const learning = data.adaptive_action_learning || {};
  const micro = learning.micro || {};
  const standard = learning.standard || {};
  const pct = value => value == null ? "—" : `${Number(value)}%`;
  const lift = learning.micro_follow_through_lift_pct;
  const liftText = lift == null ? "Not comparable yet" : `${lift > 0 ? "+" : ""}${Number(lift)} pts vs standard`;
  const policy = data.adaptive_action_policy || {};
  const topStrategy = data.top_focus?.adaptive_strategy || {};
  const strategyScope = topStrategy.scope_label || (topStrategy.scope === "opportunity" ? "Opportunity-specific evidence" : "Portfolio fallback");
  const evidence = topStrategy.evidence || data.adaptive_strategy_evidence || {};
  const stability = topStrategy.stability || {};
  const effort = data.effort_calibration || {};
  const effortOverall = effort.overall || {};
  const effortModes = effort.modes || {};
  const effortLabel = effortOverall.adjustment_active ? `${Math.round(Number(effortOverall.calibration_factor || 1) * 100)}% of current estimate` : "Learning";
  const capacity = data.capacity_profile || {};
  const capacityLabel = capacity.active ? `${Number(capacity.typical_block_minutes || 0)}m typical block` : "Learning";
  const stabilityLabel = stability.held ? "Strategy held for stability" : (stability.previous_mode && stability.previous_mode !== stability.candidate_mode ? "Strategy change accepted" : "Strategy stable");
  const evidenceNeed = [
    Number(evidence.remaining_micro || 0) ? `${Number(evidence.remaining_micro)} micro` : "",
    Number(evidence.remaining_standard || 0) ? `${Number(evidence.remaining_standard)} standard` : ""
  ].filter(Boolean).join(" + ");
  root.innerHTML = `<div class="adaptive-learning-grid">
    <div class="adaptive-learning-stat"><span>Micro-actions</span><strong>${pct(micro.follow_through_pct)}</strong><small>${Number(micro.completed || 0)} completed · ${Number(micro.deferred || 0)} deferred</small></div>
    <div class="adaptive-learning-stat"><span>Standard actions</span><strong>${pct(standard.follow_through_pct)}</strong><small>${Number(standard.completed || 0)} completed · ${Number(standard.deferred || 0)} deferred</small></div>
    <div class="adaptive-learning-stat"><span>Micro lift</span><strong>${escapeHtml(liftText)}</strong><small>${micro.avg_resolution_minutes == null ? "No timing baseline" : `${Number(micro.avg_resolution_minutes)}m avg resolution`}</small></div>
    <div class="adaptive-learning-signal"><span>Learning signal</span><strong>${escapeHtml(learning.signal || "Not enough adaptive data")}</strong><p>${escapeHtml(learning.guidance || "Atlas will learn whether smaller actions improve execution as focus history grows.")}</p></div>
    <div class="adaptive-learning-signal adaptive-policy"><span>Current adaptive strategy · Portfolio</span><strong>${escapeHtml(policy.label || "Learn before changing strategy")}</strong><p>${escapeHtml(policy.guidance || "Atlas will keep learning before changing how it packages recommendations.")}</p></div>
    <div class="adaptive-learning-signal adaptive-policy"><span>Top Focus strategy · ${escapeHtml(strategyScope)}</span><strong>${escapeHtml(topStrategy.label || policy.label || "Learn before changing strategy")}</strong><p>${escapeHtml(topStrategy.guidance || policy.guidance || "Atlas will keep learning before changing how it packages recommendations.")}</p></div>
    <div class="adaptive-learning-signal adaptive-evidence"><span>Strategy evidence</span><strong>${escapeHtml(evidence.level || "Insufficient")} evidence</strong><p>${escapeHtml(`${Number(evidence.micro_resolved || 0)} micro + ${Number(evidence.standard_resolved || 0)} standard resolved.${evidenceNeed ? ` Need ${evidenceNeed} more for the next evidence tier.` : " Current evidence tier is fully supported."}`)}</p></div>
    <div class="adaptive-learning-signal adaptive-stability"><span>Strategy stability</span><strong>${escapeHtml(stabilityLabel)}</strong><p>${escapeHtml(stability.reason || "Atlas has not yet applied a prior opportunity-specific strategy that needs a stability guardrail.")}</p></div>
    <div class="adaptive-learning-signal adaptive-effort"><span>Effort calibration · ${Number(effort.window_days || 30)} days</span><strong>${escapeHtml(effortLabel)}</strong><p>${escapeHtml(effort.signal || "Not enough timing data")} · ${Number(effort.samples || 0)} timed outcomes · ${escapeHtml(effort.evidence_level || "Insufficient")} evidence.</p><small>Micro: ${Number(effortModes.micro?.samples || 0)} samples · Resolution: ${Number(effortModes.resolution?.samples || 0)} samples</small></div>
    <div class="adaptive-learning-signal adaptive-capacity"><span>Execution capacity · ${Number(capacity.window_days || 30)} days</span><strong>${escapeHtml(capacityLabel)}</strong><p>${escapeHtml(capacity.signal || "Not enough capacity data")} · ${Number(capacity.samples || 0)} timed outcomes · ${escapeHtml(capacity.evidence_level || "Insufficient")} evidence.</p><small>${escapeHtml(capacity.guidance || "Atlas will learn the size of focus blocks you realistically complete.")}</small></div>
  </div>`;
}

function renderRecommendationFeedback(data) {
  const root = document.getElementById("recommendationFeedback");
  if (!root) return;
  const rows = (data.recommendation_feedback || []).slice(0, 5);
  if (!rows.length) {
    root.innerHTML = '<div class="focus-history-empty">No recommendation feedback yet. Atlas will learn after focus actions are completed or deferred.</div>';
    return;
  }
  root.innerHTML = rows.map(item => {
    const adjustment = Number(item.priority_adjustment || 0);
    const change = adjustment > 0 ? `+${adjustment}` : String(adjustment);
    const follow = item.follow_through_pct == null ? "—" : `${Number(item.follow_through_pct)}%`;
    return `<div class="recommendation-feedback-row"><div><strong>${escapeHtml(item.name || "Opportunity")}</strong><span>${escapeHtml(item.signal || "Neutral")} · ${follow} follow-through · ${Number(item.completed || 0)} completed / ${Number(item.deferred || 0)} deferred</span><p>${escapeHtml(item.guidance || "")}</p></div><small class="feedback-adjustment ${adjustment > 0 ? "positive" : adjustment < 0 ? "negative" : "neutral"}">${escapeHtml(change)} priority</small></div>`;
  }).join("");
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
  renderIntelligenceCommand(data);
  renderNextWorkBlock(data);
  renderDailyWorkPlan(data);
  renderFocusReview(data);
  renderFocusScorecard(data);
  renderFocusFriction(data);
  renderAdaptiveActionLearning(data);
  renderRecommendationFeedback(data);
  q("#commandAttention").innerHTML=data.attention.length?data.attention.slice(0,6).map(item=>`<button class="command-item" data-command-open="${item.id}"><span class="command-priority priority-${String(item.priority).toLowerCase()}">${escapeHtml(item.priority)}</span><div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.action||"Review opportunity")}</span></div><small>${item.due_date?`Due ${escapeHtml(item.due_date)}`:escapeHtml(item.status)}</small></button>`).join(""):`<div class="command-empty"><strong>Nothing urgent.</strong><span>Atlas will surface work here when it needs you.</span></div>`;
  q("#commandMoves").innerHTML=data.next_moves.length?data.next_moves.map((item,i)=>`<button class="command-item" data-command-open="${item.id}"><span class="move-number">${i+1}</span><div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.action||"Review opportunity")}</span></div><small>${escapeHtml(item.due_date||item.priority)}</small></button>`).join(""):`<div class="command-empty"><strong>No queued moves.</strong><span>Portfolio is currently stable.</span></div>`;
  document.querySelectorAll("[data-command-open]").forEach(button=>button.addEventListener("click",()=>openIntelligenceTarget(Number(button.dataset.commandOpen))));
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

document.getElementById("planWorkBlock")?.addEventListener("click", async () => {
  workBlockMinutes = document.getElementById("workBlockMinutes")?.value || "30";
  await loadCommandCenter();
});
document.getElementById("planDailyWork")?.addEventListener("click", async () => {
  dailyPlanMinutes = document.getElementById("dailyPlanMinutes")?.value || "90";
  await loadCommandCenter();
});
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


const radarForm = document.getElementById("radar-form");
if (radarForm) radarForm.addEventListener("submit", async event => {
  event.preventDefault();
  const payload = {
    name: document.getElementById("radar-name").value,
    category: document.getElementById("radar-category").value,
    description: document.getElementById("radar-description").value,
    source: document.getElementById("radar-source").value,
    evidence: document.getElementById("radar-evidence").value.split(";").map(x => x.trim()).filter(Boolean).map(text => ({
      text,
      type: document.getElementById("radar-evidence-type").value,
      quality: document.getElementById("radar-evidence-quality").value,
      source: document.getElementById("radar-source").value
    })),
    income_potential: document.getElementById("radar-income").value,
    speed_to_revenue: document.getElementById("radar-speed").value,
    startup_cost_score: document.getElementById("radar-startup").value,
    ongoing_effort_score: document.getElementById("radar-effort").value,
    scalability_score: document.getElementById("radar-scale").value,
    automation_potential: document.getElementById("radar-automation").value,
    atlas_fit: document.getElementById("radar-fit").value,
    confidence: document.getElementById("radar-confidence").value
  };
  const response = await fetch("/api/radar", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 409 && (result.duplicate_matches || []).length) {
      const match = result.duplicate_matches[0];
      return alert(`${result.error} ${match.name} (${Math.round(Number(match.similarity || 0) * 100)}% similarity, ${match.source}).`);
    }
    return alert(result.error || "Unable to add Radar candidate.");
  }
  radarForm.reset();
  ["radar-income","radar-speed","radar-startup","radar-effort","radar-scale","radar-automation","radar-fit","radar-confidence"].forEach(id => document.getElementById(id).value = 5);
  await Promise.all([loadRadar(), loadUnifiedNextMoves()]);
});

Promise.all([loadRadar(), loadOpportunities(), loadUnifiedNextMoves()]).catch(error => {
  console.error(error); document.getElementById("opportunity-list").innerHTML = '<div class="card empty">Unable to load opportunities.</div>';
});


// Travel Build 8 — Core research, package optimization, shortlist & booking decision
let travelState = null;
let travelComparison = null;
let travelProviders = null;
function travelMoney(value) { return Number(value || 0).toLocaleString(undefined, { style: "currency", currency: travelState?.preferences?.currency || "USD", maximumFractionDigits: 0 }); }
function selectedTravelTrip() { const id=document.getElementById("travel-research-trip")?.value; return (travelState?.trips || []).find(trip => trip.id === id) || null; }
function renderTravelResearch() {
  const tripSelect = document.getElementById("travel-research-trip");
  if (!tripSelect || !travelState) return;
  const previous = tripSelect.value;
  tripSelect.innerHTML = (travelState.trips || []).map(trip => `<option value="${escapeHtml(trip.id)}">${escapeHtml(trip.name)} · ${escapeHtml(trip.status)}</option>`).join("");
  if ([...tripSelect.options].some(option => option.value === previous)) tripSelect.value = previous;
  const trip = selectedTravelTrip();
  const status = document.getElementById("travel-research-status");
  if (status) status.textContent = trip ? `${trip.destination_candidates?.length || 0} candidates · ${trip.budget?.target ? travelMoney(trip.budget.target) + " target" : "budget TBD"}` : "Create a trip first";
  const liveSelect=document.getElementById('travel-live-destination');
  if(liveSelect){const prior=liveSelect.value;liveSelect.innerHTML=(trip?.destination_candidates||[]).map(dest=>`<option value="${escapeHtml(dest.id)}">${escapeHtml(dest.name)}</option>`).join('');if([...liveSelect.options].some(option=>option.value===prior))liveSelect.value=prior;}
  renderTravelComparison(trip);
  renderTravelFlights(trip);
  renderTravelResorts(trip);
  renderTravelPackages(trip);
  renderTravelDecision(trip);
  renderTravelOperations(trip);
  renderPreDeparture(trip);
  renderTravelResilience(trip);
  renderTravelWrapUp(trip);
  renderLiveTravel(trip);
  renderTravelReview(trip);
  renderTravelScenarios(trip);
  renderTravelWatchlist(trip);
  renderTravelActions(trip);
  renderTravelReadiness(trip);
  renderTravelBookingExecution(trip);
}
function renderTravelFlights(trip){
  const destinationSelect=document.getElementById('travel-flight-destination'); const board=document.getElementById('travel-flight-board'); const summary=document.getElementById('travel-flight-summary');
  if(!destinationSelect||!board||!summary)return;
  const previous=destinationSelect.value; destinationSelect.innerHTML=(trip?.destination_candidates||[]).map(dest=>`<option value="${escapeHtml(dest.id)}">${escapeHtml(dest.name)}</option>`).join(''); if([...destinationSelect.options].some(o=>o.value===previous))destinationSelect.value=previous;
  if(!trip){summary.textContent='Choose a trip';board.innerHTML='<div class="command-empty"><span>Create or choose a trip first.</span></div>';return;}
  const destinationId=destinationSelect.value; let flights=(trip.flight_options||[]).filter(x=>!destinationId||x.destination_id===destinationId).sort((a,b)=>Number(b.score?.atlas_flight_score||0)-Number(a.score?.atlas_flight_score||0));
  summary.textContent=`${flights.length} option${flights.length===1?'':'s'} scored`;
  if(!flights.length){board.innerHTML='<div class="command-empty"><strong>No flight options yet.</strong><span>Add a flight to compare price, duration, stops, fees, and flexibility.</span></div>';return;}
  board.innerHTML=flights.map((f,index)=>`<div class="travel-compare-row ${index===0?'is-leader':''}"><div class="travel-compare-main"><strong>${index===0?'★ ':''}${escapeHtml(f.airline||'Flight option')} ${escapeHtml(f.origin_airport||'')} → ${escapeHtml(f.destination_airport||'')}</strong><small>${travelMoney(f.total_price)} · ${Number(f.total_travel_hours||0)}h · ${Number(f.layovers||0)} stop${Number(f.layovers||0)===1?'':'s'} · ${escapeHtml(f.cabin||'Economy')}${f.source?` · ${escapeHtml(f.source)}`:''}</small></div><div class="travel-compare-score">${Number(f.score?.atlas_flight_score||0)}<small>FLIGHT SCORE</small></div><div class="travel-compare-details">${f.live_data?'<span class="travel-chip">Live quote</span>':'<span class="travel-chip seed">Saved quote</span>'}${f.bags_included?'<span class="travel-chip">Bags included</span>':''}${f.changeable?'<span class="travel-chip">Changeable</span>':''}${(f.score?.warnings||[]).map(x=>`<span class="travel-chip warn">${escapeHtml(x)}</span>`).join('')}</div><div class="travel-compare-actions"><button type="button" data-flight-delete="${escapeHtml(f.id)}">Remove</button></div></div>`).join('');
  board.querySelectorAll('[data-flight-delete]').forEach(btn=>btn.addEventListener('click',()=>removeTravelFlight(trip.id,btn.dataset.flightDelete)));
}

function renderTravelResorts(trip){
  const destinationSelect=document.getElementById('travel-resort-destination'); const board=document.getElementById('travel-resort-board'); const summary=document.getElementById('travel-resort-summary');
  if(!destinationSelect||!board||!summary)return;
  const previous=destinationSelect.value; destinationSelect.innerHTML=(trip?.destination_candidates||[]).map(dest=>`<option value="${escapeHtml(dest.id)}">${escapeHtml(dest.name)}</option>`).join(''); if([...destinationSelect.options].some(o=>o.value===previous))destinationSelect.value=previous;
  if(!trip){summary.textContent='Choose a trip';board.innerHTML='<div class="command-empty"><span>Create or choose a trip first.</span></div>';return;}
  const destinationId=destinationSelect.value; const resorts=(trip.resort_options||[]).filter(x=>!destinationId||x.destination_id===destinationId).sort((a,b)=>Number(b.score?.atlas_resort_score||0)-Number(a.score?.atlas_resort_score||0));
  summary.textContent=`${resorts.length} option${resorts.length===1?'':'s'} scored`;
  if(!resorts.length){board.innerHTML='<div class="command-empty"><strong>No resort options yet.</strong><span>Add properties to compare total cost, reviews, beach, food, bars, rooms, pools, and fit.</span></div>';return;}
  board.innerHTML=resorts.map((r,index)=>`<div class="travel-compare-row ${index===0?'is-leader':''}"><div class="travel-compare-main"><strong>${index===0?'★ ':''}${escapeHtml(r.name||'Resort')}</strong><small>${travelMoney(r.total_stay_cost)} · ${Number(r.nights||0)} nights${r.room_category?` · ${escapeHtml(r.room_category)}`:''}${r.review_score?` · ${Number(r.review_score).toFixed(1)}/5 (${Number(r.review_count||0).toLocaleString()} reviews)`:''}${r.source?` · ${escapeHtml(r.source)}`:''}</small></div><div class="travel-compare-score">${Number(r.score?.atlas_resort_score||0)}<small>RESORT SCORE</small></div><div class="travel-compare-details">${r.live_data?'<span class="travel-chip">Live quote</span>':'<span class="travel-chip seed">Saved quote</span>'}${r.all_inclusive?'<span class="travel-chip">All-inclusive</span>':''}${r.adults_only?'<span class="travel-chip">Adults-only</span>':''}<span class="travel-chip">Beach ${Number(r.beach_score||0)}/10</span><span class="travel-chip">Food ${Number(r.food_score||0)}/10</span><span class="travel-chip">Bars ${Number(r.bar_score||0)}/10</span>${(r.score?.warnings||[]).map(x=>`<span class="travel-chip warn">${escapeHtml(x)}</span>`).join('')}</div><div class="travel-compare-actions"><button type="button" data-resort-delete="${escapeHtml(r.id)}">Remove</button></div></div>`).join('');
  board.querySelectorAll('[data-resort-delete]').forEach(btn=>btn.addEventListener('click',()=>removeTravelResort(trip.id,btn.dataset.resortDelete)));
}

async function renderTravelPackages(trip){
  const board=document.getElementById('travel-package-board'); const summary=document.getElementById('travel-package-summary');
  if(!board||!summary)return;
  if(!trip){summary.textContent='Choose a trip';board.innerHTML='<div class="command-empty"><span>Create or choose a trip first.</span></div>';return;}
  const transfer=Number(document.getElementById('travel-package-transfer')?.value||0); const activities=Number(document.getElementById('travel-package-activities')?.value||0); const other=Number(document.getElementById('travel-package-other')?.value||0);
  const params=new URLSearchParams({transfer_cost:String(transfer),activity_allowance:String(activities),other_costs:String(other),limit:'20'});
  try{
    const response=await fetch(`/api/travel/trips/${encodeURIComponent(trip.id)}/packages?${params}`); const result=await response.json(); if(!response.ok)throw new Error(result.error||'Unable to optimize packages.');
    summary.textContent=`${result.count||0} package${result.count===1?'':'s'} evaluated${result.leader?` · leader ${Number(result.leader.score?.atlas_package_score||0)}/100`:''}`;
    if(!result.packages?.length){const missing=[...(result.missing?.destinations_without_flights||[]).map(x=>`${x}: add flight`),...(result.missing?.destinations_without_resorts||[]).map(x=>`${x}: add resort`)];board.innerHTML=`<div class="command-empty"><strong>No complete packages yet.</strong><span>${escapeHtml(missing.join(' · ')||'Add a destination with at least one flight and one resort.')}</span></div>`;return;}
    const decision=trip.booking_decision||{};
    const shortlisted=new Set(decision.shortlist_package_ids||[]); const preferred=decision.preferred_package_id||'';
    board.innerHTML=result.packages.map((pkg,index)=>{const delta=pkg.score?.budget_delta;const isShort=shortlisted.has(pkg.id);const isPreferred=preferred===pkg.id;return `<div class="travel-compare-row ${index===0?'is-leader':''}"><div class="travel-compare-main"><strong>${isPreferred?'✓ ':index===0?'★ ':''}${escapeHtml(pkg.destination?.name||'Destination')} · ${escapeHtml(pkg.resort?.name||'Resort')}</strong><small>${travelMoney(pkg.total_cost)} total · ${escapeHtml(pkg.flight?.airline||'Flight')} ${escapeHtml(pkg.flight?.origin_airport||'')} → ${escapeHtml(pkg.flight?.destination_airport||'')} · ${Number(pkg.flight?.total_travel_hours||0)}h</small></div><div class="travel-compare-score">${Number(pkg.score?.atlas_package_score||0)}<small>PACKAGE SCORE</small></div><div class="travel-compare-details">${delta!==null?`<span class="travel-chip ${delta<0?'warn':''}">${delta>=0?travelMoney(delta)+' under':travelMoney(Math.abs(delta))+' over'} budget</span>`:''}<span class="travel-chip">Destination ${Number(pkg.destination?.score?.atlas_fit||0)}</span><span class="travel-chip">Flight ${Number(pkg.flight?.score?.atlas_flight_score||0)}</span><span class="travel-chip">Resort ${Number(pkg.resort?.score?.atlas_resort_score||0)}</span>${pkg.live_data?'<span class="travel-chip">All pricing live</span>':'<span class="travel-chip seed">Mixed / saved pricing</span>'}${isShort?'<span class="travel-chip">Shortlisted</span>':''}${isPreferred?'<span class="travel-chip">Preferred package</span>':''}${(pkg.score?.warnings||[]).map(x=>`<span class="travel-chip warn">${escapeHtml(x)}</span>`).join('')}</div><div class="travel-compare-actions"><button type="button" data-package-shortlist="${escapeHtml(pkg.id)}">${isShort?'Remove shortlist':'Shortlist'}</button><button type="button" data-package-prefer="${escapeHtml(pkg.id)}">${isPreferred?'Preferred ✓':'Lock preferred'}</button></div></div>`}).join('');
    board.querySelectorAll('[data-package-shortlist]').forEach(btn=>btn.addEventListener('click',()=>updateTravelDecision(trip.id,{toggle_shortlist_package_id:btn.dataset.packageShortlist,package_assumptions:travelPackageAssumptions()})));
    board.querySelectorAll('[data-package-prefer]').forEach(btn=>btn.addEventListener('click',()=>updateTravelDecision(trip.id,{preferred_package_id:btn.dataset.packagePrefer,package_assumptions:travelPackageAssumptions()})));
  }catch(error){summary.textContent='Optimizer unavailable';board.innerHTML=`<div class="command-empty"><span>${escapeHtml(error.message)}</span></div>`;}
}

function travelPackageAssumptions(){return {transfer_cost:Number(document.getElementById('travel-package-transfer')?.value||0),activity_allowance:Number(document.getElementById('travel-package-activities')?.value||0),other_costs:Number(document.getElementById('travel-package-other')?.value||0)};}

async function updateTravelDecision(tripId,payload){
  const response=await fetch(`/api/travel/trips/${encodeURIComponent(tripId)}/decision`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const result=await response.json(); if(!response.ok)return alert(result.error||'Unable to update trip decision.');
  await loadTravel(); const select=document.getElementById('travel-research-trip'); if(select)select.value=tripId; renderTravelResearch();
}

async function renderTravelDecision(trip){
  const shortlist=document.getElementById('travel-shortlist-board'); const verification=document.getElementById('travel-verification-board'); const summary=document.getElementById('travel-decision-summary'); const book=document.getElementById('travel-book-package');
  if(!shortlist||!verification||!summary||!book)return;
  if(!trip){summary.textContent='Choose a trip';shortlist.innerHTML='<div class="command-empty"><span>Choose a trip first.</span></div>';verification.innerHTML='';book.disabled=true;return;}
  try{
    const response=await fetch(`/api/travel/trips/${encodeURIComponent(trip.id)}/decision`); const result=await response.json(); if(!response.ok)throw new Error(result.error||'Unable to load booking decision.');
    summary.textContent=`${result.shortlist?.length||0} shortlisted · ${result.verification_complete_count||0}/${result.verification_required_count||0} checks · ${result.ready_to_book?'Ready to book':trip.status}`;
    shortlist.innerHTML=result.shortlist?.length?result.shortlist.map(pkg=>`<div class="travel-compare-row ${result.preferred?.id===pkg.id?'is-leader':''}"><div class="travel-compare-main"><strong>${result.preferred?.id===pkg.id?'✓ ':''}${escapeHtml(pkg.destination?.name||'Destination')} · ${escapeHtml(pkg.resort?.name||'Resort')}</strong><small>${travelMoney(pkg.total_cost)} · ${escapeHtml(pkg.flight?.airline||'Flight')} · ${Number(pkg.score?.atlas_package_score||0)}/100</small></div><div class="travel-compare-actions"><button type="button" data-decision-prefer="${escapeHtml(pkg.id)}">${result.preferred?.id===pkg.id?'Preferred ✓':'Lock preferred'}</button></div></div>`).join(''):'<div class="command-empty"><strong>No shortlisted packages yet.</strong><span>Use Shortlist in the Package Optimizer above.</span></div>';
    verification.innerHTML=(result.verification||[]).map(item=>`<label class="travel-compare-row"><input type="checkbox" data-verification-id="${escapeHtml(item.id)}" ${item.complete?'checked':''}><div class="travel-compare-main"><strong>${escapeHtml(item.label)}</strong><small>${item.complete?'Verified':'Required before booking'}</small></div></label>`).join('');
    shortlist.querySelectorAll('[data-decision-prefer]').forEach(btn=>btn.addEventListener('click',()=>updateTravelDecision(trip.id,{preferred_package_id:btn.dataset.decisionPrefer})));
    verification.querySelectorAll('[data-verification-id]').forEach(box=>box.addEventListener('change',()=>updateTravelDecision(trip.id,{verification_item:{id:box.dataset.verificationId,complete:box.checked}})));
    book.disabled=!result.ready_to_book; book.textContent=result.ready_to_book?'Mark preferred package booked':'Complete verification to book';
  }catch(error){summary.textContent='Decision unavailable';shortlist.innerHTML=`<div class="command-empty"><span>${escapeHtml(error.message)}</span></div>`;verification.innerHTML='';book.disabled=true;}
}

function renderTravelComparison(trip) {
  const board=document.getElementById("travel-comparison-board"); const brief=document.getElementById("travel-research-brief");
  if (!board || !brief) return;
  if (!trip) { brief.innerHTML='<span>Create or choose a trip to begin research.</span>'; board.innerHTML=''; return; }
  const candidates=[...(trip.destination_candidates || [])].sort((a,b)=>Number(b.score?.atlas_fit||0)-Number(a.score?.atlas_fit||0));
  if (!candidates.length) { brief.innerHTML='<strong>No destination research yet.</strong><small>Add at least two candidates for a useful side-by-side comparison.</small>'; board.innerHTML=''; return; }
  const leader=candidates[0]; const second=candidates[1]; const gap=second ? Number(leader.score?.atlas_fit||0)-Number(second.score?.atlas_fit||0) : null;
  const strong=Object.entries(leader.score?.components || {}).filter(([,v])=>Number(v)>=8).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k])=>k.replaceAll('_',' '));
  brief.innerHTML=`<strong>${escapeHtml(leader.name)} currently leads at ${Number(leader.score?.atlas_fit||0)}/100.</strong><small>${gap!==null ? `${gap}-point lead. ` : ''}${strong.length ? `Strengths: ${escapeHtml(strong.join(', '))}. ` : ''}${leader.score?.warnings?.length ? `Watch: ${escapeHtml(leader.score.warnings.join(' '))}` : 'No major score warnings.'}</small>`;
  board.innerHTML=candidates.map((dest,index)=>{
    const delta=Number(dest.estimated_total_cost||0)-Number(trip.budget?.target||0); const completeness=[dest.name,Number(dest.estimated_total_cost)>0,Number(dest.flight_hours)>0,dest.weather_score!==undefined,dest.lodging_fit_score!==undefined,dest.experience_fit_score!==undefined,dest.simplicity_score!==undefined,dest.traits&&Object.keys(dest.traits).length].filter(Boolean).length/8*100;
    const strengths=Object.entries(dest.score?.components||{}).filter(([,v])=>Number(v)>=8).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k])=>k.replaceAll('_',' '));
    return `<div class="travel-compare-row ${index===0?'is-leader':''}"><div class="travel-compare-main"><strong>${index===0?'★ ':''}${escapeHtml(dest.name)}</strong><small>${dest.estimated_total_cost?travelMoney(dest.estimated_total_cost):'Cost TBD'}${dest.flight_hours?` · ${Number(dest.flight_hours)}h · ${Number(dest.layovers||0)} layover${Number(dest.layovers||0)===1?'':'s'}`:''}</small></div><div class="travel-compare-score">${Number(dest.score?.atlas_fit||0)}<small>ATLAS FIT</small></div><div class="travel-compare-details"><span class="travel-chip">${Math.round(completeness)}% researched</span>${trip.budget?.target&&dest.estimated_total_cost?`<span class="travel-chip ${delta>0?'warn':''}">${delta<=0?travelMoney(Math.abs(delta))+' under':travelMoney(delta)+' over'} budget</span>`:''}${dest.research_type==='seed_estimate'?'<span class="travel-chip seed">Seed estimate</span>':dest.research_type==='live_snapshot'?`<span class="travel-chip">Live snapshot · ${escapeHtml(dest.live_research?.freshness?.label||'current')}</span>`:''}${strengths.map(x=>`<span class="travel-chip">${escapeHtml(x)}</span>`).join('')}${(dest.score?.warnings||[]).map(x=>`<span class="travel-chip warn">${escapeHtml(x)}</span>`).join('')}</div><div class="travel-compare-actions"><button type="button" data-travel-delete="${escapeHtml(dest.id)}">Remove</button></div></div>`;
  }).join('');
  board.querySelectorAll('[data-travel-delete]').forEach(button=>button.addEventListener('click',()=>removeTravelDestination(trip.id,button.dataset.travelDelete)));
}
function renderTravel() {
  if (!travelState) return;
  const summary = travelState.summary || {};
  const summaryEl = document.getElementById("travel-summary"); if (summaryEl) summaryEl.textContent = `${summary.active_trip_count || 0} active · ${summary.trip_count || 0} total`;
  const statuses = document.getElementById("travel-statuses"); if (statuses) statuses.innerHTML = (travelState.statuses || []).map(status => `<span class="travel-status-pill">${escapeHtml(status)}: ${Number(summary.status_counts?.[status] || 0)}</span>`).join("");
  const prefs = travelState.preferences || {}; const setValue=(id,value)=>{const el=document.getElementById(id);if(el)el.value=value??"";};
  setValue("travel-home-airport",prefs.home_airport||"MSP"); setValue("travel-max-flight",prefs.preferred_max_flight_hours??7); setValue("travel-max-layovers",prefs.preferred_max_layovers??1);
  const checks={"travel-pref-all-inclusive":"all_inclusive","travel-pref-adults-only":"adults_only","travel-pref-beach":"beach","travel-pref-relaxation":"relaxation"}; Object.entries(checks).forEach(([id,key])=>{const el=document.getElementById(id);if(el)el.checked=Boolean(prefs.preferences?.[key]);});
  const list=document.getElementById("travel-trip-list"); if(list) list.innerHTML=(travelState.trips||[]).length?travelState.trips.map(trip=>{const destinations=trip.destination_candidates||[];return `<article class="travel-trip"><div class="travel-trip-head"><div><strong>${escapeHtml(trip.name)}</strong><span>${escapeHtml(trip.status)} · ${escapeHtml(trip.origin_airport||"")}${trip.dates?.start?` · ${escapeHtml(trip.dates.start)}`:""}</span></div><div class="travel-trip-budget">${trip.budget?.target?`${travelMoney(trip.budget.target)} target`:"No budget yet"}</div></div>${destinations.length?`<div class="travel-destinations">${destinations.map(dest=>`<div class="travel-destination"><strong>${escapeHtml(dest.name)}</strong><b>${Number(dest.score?.atlas_fit||0)}/100</b><small>${dest.estimated_total_cost?travelMoney(dest.estimated_total_cost):"Cost TBD"}${dest.flight_hours?` · ${Number(dest.flight_hours)}h flight`:""}${dest.source?` · ${escapeHtml(dest.source)}`:''}${dest.score?.warnings?.length?` · ${escapeHtml(dest.score.warnings.join(" "))}`:""}</small></div>`).join("")}</div>`:`<div class="command-empty"><span>No destination candidates scored yet.</span></div>`}</article>`;}).join(""):'<div class="command-empty"><strong>No trips yet.</strong><span>Create a trip to start comparing destinations.</span></div>';
  renderTravelResearch();
  renderTravelIntelligence();
}
async function loadTravel() { const response=await fetch("/api/travel"); if(!response.ok)throw new Error("Unable to load Travel"); travelState=await response.json(); renderTravel(); }
async function loadTravelProviders(){const response=await fetch('/api/travel/providers');if(!response.ok)throw new Error('Unable to load travel providers');travelProviders=await response.json();const summary=document.getElementById('travel-live-provider-summary');if(summary)summary.textContent=`${travelProviders.ready_count||0}/${travelProviders.total_count||0} provider connections ready`;const panel=document.getElementById('travel-provider-status');if(panel)panel.innerHTML=(travelProviders.providers||[]).map(item=>`<span class="travel-provider-pill ${item.configured?'ready':'off'}"><strong>${escapeHtml(item.kind)}</strong> ${item.configured?escapeHtml(item.provider||'Ready'):'Not connected'}</span>`).join('');return travelProviders;}

const travelTripForm=document.getElementById("travel-trip-form"); if(travelTripForm)travelTripForm.addEventListener("submit",async event=>{event.preventDefault();const response=await fetch("/api/travel/trips",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:document.getElementById("travel-name").value,status:document.getElementById("travel-status").value,budget:{target:document.getElementById("travel-budget").value},dates:{start:document.getElementById("travel-start").value,end:document.getElementById("travel-end").value}})});const result=await response.json();if(!response.ok)return alert(result.error||"Unable to create trip.");travelTripForm.reset();await loadTravel();const select=document.getElementById('travel-research-trip');if(select){select.value=result.id;renderTravelResearch();}});
const travelPreferencesForm=document.getElementById("travel-preferences-form"); if(travelPreferencesForm)travelPreferencesForm.addEventListener("submit",async event=>{event.preventDefault();const response=await fetch("/api/travel/preferences",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({home_airport:document.getElementById("travel-home-airport").value,preferred_max_flight_hours:document.getElementById("travel-max-flight").value,preferred_max_layovers:document.getElementById("travel-max-layovers").value,preferences:{all_inclusive:document.getElementById("travel-pref-all-inclusive").checked,adults_only:document.getElementById("travel-pref-adults-only").checked,beach:document.getElementById("travel-pref-beach").checked,relaxation:document.getElementById("travel-pref-relaxation").checked}})});const result=await response.json();if(!response.ok)return alert(result.error||"Unable to save travel preferences.");await loadTravel();});
const travelResearchTrip=document.getElementById('travel-research-trip'); if(travelResearchTrip)travelResearchTrip.addEventListener('change',()=>renderTravelResearch());
const travelDestinationForm=document.getElementById('travel-destination-form'); if(travelDestinationForm)travelDestinationForm.addEventListener('submit',async event=>{event.preventDefault();const trip=selectedTravelTrip();if(!trip)return alert('Create or select a trip first.');const payload={name:document.getElementById('travel-destination-name').value,estimated_total_cost:document.getElementById('travel-destination-cost').value,flight_hours:document.getElementById('travel-destination-flight').value,layovers:document.getElementById('travel-destination-layovers').value,weather_score:document.getElementById('travel-destination-weather').value,lodging_fit_score:document.getElementById('travel-destination-lodging').value,experience_fit_score:document.getElementById('travel-destination-experience').value,simplicity_score:document.getElementById('travel-destination-simplicity').value,traits:{all_inclusive:document.getElementById('travel-dest-all-inclusive').checked,adults_only:document.getElementById('travel-dest-adults-only').checked,beach:document.getElementById('travel-dest-beach').checked,relaxation:document.getElementById('travel-dest-relaxation').checked,nightlife:document.getElementById('travel-dest-nightlife').checked,nature:document.getElementById('travel-dest-nature').checked},notes:document.getElementById('travel-destination-notes').value};const response=await fetch(`/api/travel/trips/${encodeURIComponent(trip.id)}/destinations`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok)return alert(result.error||'Unable to add destination.');const keep=trip.id;travelDestinationForm.reset();['travel-destination-weather','travel-destination-lodging','travel-destination-experience','travel-destination-simplicity'].forEach(id=>document.getElementById(id).value=7);document.getElementById('travel-destination-layovers').value=0;await loadTravel();document.getElementById('travel-research-trip').value=keep;renderTravelResearch();});

const travelAutoResearchButton=document.getElementById('travel-auto-research'); if(travelAutoResearchButton)travelAutoResearchButton.addEventListener('click',async()=>{const trip=selectedTravelTrip();if(!trip)return alert('Create or select a trip first.');const status=document.getElementById('travel-auto-status');travelAutoResearchButton.disabled=true;if(status)status.textContent='Generating…';try{const response=await fetch(`/api/travel/trips/${encodeURIComponent(trip.id)}/research`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({limit:Number(document.getElementById('travel-auto-count')?.value||6),replace_seeded:true})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to generate destination research.');await loadTravel();document.getElementById('travel-research-trip').value=trip.id;renderTravelResearch();if(status)status.textContent=`${result.research?.candidate_count||0} candidates generated · estimates, not live quotes`; }catch(error){if(status)status.textContent=error.message;}finally{travelAutoResearchButton.disabled=false;}});
const travelLiveSnapshotForm=document.getElementById('travel-live-snapshot-form');if(travelLiveSnapshotForm)travelLiveSnapshotForm.addEventListener('submit',async event=>{event.preventDefault();const trip=selectedTravelTrip();const destinationId=document.getElementById('travel-live-destination')?.value;if(!trip||!destinationId)return alert('Choose a trip and destination first.');const status=document.getElementById('travel-live-status');const payload={provider:document.getElementById('travel-live-provider').value,source:document.getElementById('travel-live-provider').value,total_cost:document.getElementById('travel-live-total').value,flight_hours:document.getElementById('travel-live-flight-hours').value,weather_score:document.getElementById('travel-live-weather').value,availability:document.getElementById('travel-live-availability').value,captured_at:new Date().toISOString(),live_data:true};if(status)status.textContent='Applying provider snapshot…';const response=await fetch(`/api/travel/trips/${encodeURIComponent(trip.id)}/destinations/${encodeURIComponent(destinationId)}/live-research`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok){if(status)status.textContent=result.error||'Unable to apply snapshot.';return;}await loadTravel();document.getElementById('travel-research-trip').value=trip.id;renderTravelResearch();if(status)status.textContent=`Updated ${result.destination?.name||'destination'} from ${result.destination?.source||'provider'} · Atlas Fit ${result.destination?.score?.atlas_fit||0}/100`;});

const travelFlightDestination=document.getElementById('travel-flight-destination'); if(travelFlightDestination)travelFlightDestination.addEventListener('change',()=>renderTravelFlights(selectedTravelTrip()));
const travelFlightForm=document.getElementById('travel-flight-form'); if(travelFlightForm)travelFlightForm.addEventListener('submit',async event=>{event.preventDefault();const trip=selectedTravelTrip();if(!trip)return alert('Choose a trip first.');const destinationId=document.getElementById('travel-flight-destination').value;const payload={destination_id:destinationId,destination_airport:document.getElementById('travel-flight-airport').value,airline:document.getElementById('travel-flight-airline').value,total_price:document.getElementById('travel-flight-price').value,total_travel_hours:document.getElementById('travel-flight-hours').value,layovers:document.getElementById('travel-flight-layovers').value,cabin:document.getElementById('travel-flight-cabin').value,baggage_fees:document.getElementById('travel-flight-bag-fees').value,seat_fees:document.getElementById('travel-flight-seat-fees').value,bags_included:document.getElementById('travel-flight-bags-included').checked,changeable:document.getElementById('travel-flight-changeable').checked,refundable:document.getElementById('travel-flight-refundable').checked,live_data:document.getElementById('travel-flight-live').checked,source:document.getElementById('travel-flight-source').value,captured_at:new Date().toISOString()};const response=await fetch(`/api/travel/trips/${encodeURIComponent(trip.id)}/flights`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok)return alert(result.error||'Unable to add flight.');await loadTravel();document.getElementById('travel-research-trip').value=trip.id;renderTravelResearch();});
async function removeTravelFlight(tripId,flightId){if(!confirm('Remove this flight option?'))return;const response=await fetch(`/api/travel/trips/${encodeURIComponent(tripId)}/flights/${encodeURIComponent(flightId)}`,{method:'DELETE'});if(!response.ok){const result=await response.json();return alert(result.error||'Unable to remove flight.');}await loadTravel();document.getElementById('travel-research-trip').value=tripId;renderTravelResearch();}

async function removeTravelDestination(tripId,destinationId){if(!confirm('Remove this destination candidate?'))return;const response=await fetch(`/api/travel/trips/${encodeURIComponent(tripId)}/destinations/${encodeURIComponent(destinationId)}`,{method:'DELETE'});if(!response.ok){const result=await response.json();return alert(result.error||'Unable to remove destination.');}await loadTravel();document.getElementById('travel-research-trip').value=tripId;renderTravelResearch();}
Promise.all([loadTravel(),loadTravelProviders()]).catch(error=>{console.error(error);const el=document.getElementById("travel-trip-list");if(el)el.innerHTML='<div class="command-empty"><span>Unable to load Travel.</span></div>';});


const travelResortDestination=document.getElementById('travel-resort-destination'); if(travelResortDestination)travelResortDestination.addEventListener('change',()=>renderTravelResorts(selectedTravelTrip()));
const travelResortForm=document.getElementById('travel-resort-form'); if(travelResortForm)travelResortForm.addEventListener('submit',async event=>{event.preventDefault();const trip=selectedTravelTrip();if(!trip)return alert('Choose a trip first.');const payload={destination_id:document.getElementById('travel-resort-destination').value,name:document.getElementById('travel-resort-name').value,room_category:document.getElementById('travel-resort-room').value,total_stay_cost:document.getElementById('travel-resort-total').value,nights:document.getElementById('travel-resort-nights').value,taxes_fees:document.getElementById('travel-resort-taxes').value,resort_fees:document.getElementById('travel-resort-fees').value,all_inclusive:document.getElementById('travel-resort-ai').checked,adults_only:document.getElementById('travel-resort-adults').checked,quiet_relaxation:document.getElementById('travel-resort-relax').checked,live_data:document.getElementById('travel-resort-live').checked,beach_score:document.getElementById('travel-resort-beach').value,pool_score:document.getElementById('travel-resort-pools').value,food_score:document.getElementById('travel-resort-food').value,bar_score:document.getElementById('travel-resort-bars').value,room_score:document.getElementById('travel-resort-room-score').value,location_score:document.getElementById('travel-resort-location').value,review_score:document.getElementById('travel-resort-review').value,review_count:document.getElementById('travel-resort-review-count').value,restaurant_count:document.getElementById('travel-resort-restaurants').value,bar_count:document.getElementById('travel-resort-bar-count').value,source:document.getElementById('travel-resort-source').value,captured_at:new Date().toISOString()};const response=await fetch(`/api/travel/trips/${encodeURIComponent(trip.id)}/resorts`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok)return alert(result.error||'Unable to add resort.');await loadTravel();document.getElementById('travel-research-trip').value=trip.id;renderTravelResearch();});
async function removeTravelResort(tripId,resortId){if(!confirm('Remove this resort option?'))return;const response=await fetch(`/api/travel/trips/${encodeURIComponent(tripId)}/resorts/${encodeURIComponent(resortId)}`,{method:'DELETE'});if(!response.ok){const result=await response.json();return alert(result.error||'Unable to remove resort.');}await loadTravel();document.getElementById('travel-research-trip').value=tripId;renderTravelResearch();}



async function renderTravelOperations(trip){
  const summary=document.getElementById('travel-operations-summary'); const confirmations=document.getElementById('travel-confirmation-board'); const payments=document.getElementById('travel-payment-board'); const readiness=document.getElementById('travel-readiness-board'); const notes=document.getElementById('travel-itinerary-notes'); const start=document.getElementById('travel-start-trip');
  if(!summary||!confirmations||!payments||!readiness||!notes||!start)return;
  if(!trip){summary.textContent='Choose a trip';confirmations.innerHTML=payments.innerHTML=readiness.innerHTML='';start.disabled=true;return;}
  try{
    const response=await fetch(`/api/travel/trips/${encodeURIComponent(trip.id)}/operations`); const result=await response.json(); if(!response.ok)throw new Error(result.error||'Unable to load trip operations.');
    summary.textContent=`${result.readiness_percent||0}% ready · ${result.confirmations?.length||0} confirmations · ${travelMoney(result.payment_summary?.paid||0)} paid · ${trip.status}`;
    confirmations.innerHTML=result.confirmations?.length?result.confirmations.map(item=>`<div class="travel-compare-row"><div class="travel-compare-main"><strong>${escapeHtml(item.name||item.type)}</strong><small>${escapeHtml(item.type)}${item.confirmation_number?` · #${escapeHtml(item.confirmation_number)}`:''}${item.provider?` · ${escapeHtml(item.provider)}`:''}${item.date?` · ${escapeHtml(item.date)}`:''}</small></div><div class="travel-compare-actions"><button type="button" data-confirmation-delete="${escapeHtml(item.id)}">Remove</button></div></div>`).join(''):'<div class="command-empty"><span>No confirmations saved yet.</span></div>';
    payments.innerHTML=result.payments?.length?result.payments.map(item=>`<div class="travel-compare-row"><div class="travel-compare-main"><strong>${escapeHtml(item.label)}</strong><small>${travelMoney(item.amount)}${item.due_date?` · due ${escapeHtml(item.due_date)}`:''}</small></div><div class="travel-compare-details"><span class="travel-chip">${escapeHtml(item.status)}</span></div><div class="travel-compare-actions">${item.status!=='paid'?`<button type="button" data-payment-paid="${escapeHtml(item.id)}">Mark paid</button>`:''}<button type="button" data-payment-delete="${escapeHtml(item.id)}">Remove</button></div></div>`).join(''):'<div class="command-empty"><span>No payment records saved yet.</span></div>';
    readiness.innerHTML=(result.readiness_tasks||[]).map(item=>`<label class="travel-compare-row"><input type="checkbox" data-readiness-id="${escapeHtml(item.id)}" ${item.complete?'checked':''}><div class="travel-compare-main"><strong>${escapeHtml(item.label)}</strong><small>${item.complete?'Ready':'Required before travel'}</small></div></label>`).join('');
    notes.value=result.operations?.itinerary_notes||'';
    start.disabled=!result.ready_to_travel; start.textContent=result.ready_to_travel?'Start trip · move to Traveling':`Readiness ${result.readiness_percent||0}% · complete required items`;
    confirmations.querySelectorAll('[data-confirmation-delete]').forEach(btn=>btn.addEventListener('click',()=>updateTravelOperations(trip.id,{confirmation:{id:btn.dataset.confirmationDelete,delete:true}})));
    payments.querySelectorAll('[data-payment-delete]').forEach(btn=>btn.addEventListener('click',()=>updateTravelOperations(trip.id,{payment:{id:btn.dataset.paymentDelete,delete:true}})));
    payments.querySelectorAll('[data-payment-paid]').forEach(btn=>btn.addEventListener('click',()=>{const item=(result.payments||[]).find(x=>x.id===btn.dataset.paymentPaid);if(item)updateTravelOperations(trip.id,{payment:{...item,status:'paid'}});}));
    readiness.querySelectorAll('[data-readiness-id]').forEach(box=>box.addEventListener('change',()=>updateTravelOperations(trip.id,{readiness_task:{id:box.dataset.readinessId,complete:box.checked}})));
  }catch(error){summary.textContent='Operations unavailable';readiness.innerHTML=`<div class="command-empty"><span>${escapeHtml(error.message)}</span></div>`;start.disabled=true;}
}

async function updateTravelOperations(tripId,payload){
  const response=await fetch(`/api/travel/trips/${encodeURIComponent(tripId)}/operations`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); const result=await response.json(); if(!response.ok)return alert(result.error||'Unable to update trip operations.');
  await loadTravel(); const select=document.getElementById('travel-research-trip'); if(select)select.value=tripId; renderTravelResearch();
}

const travelPackageRefresh=document.getElementById('travel-package-refresh'); if(travelPackageRefresh)travelPackageRefresh.addEventListener('click',()=>renderTravelPackages(selectedTravelTrip()));
['travel-package-transfer','travel-package-activities','travel-package-other'].forEach(id=>{const el=document.getElementById(id);if(el)el.addEventListener('change',()=>renderTravelPackages(selectedTravelTrip()));});

const travelBookPackage=document.getElementById('travel-book-package'); if(travelBookPackage)travelBookPackage.addEventListener('click',async()=>{const trip=selectedTravelTrip();if(!trip)return;const response=await fetch(`/api/travel/trips/${encodeURIComponent(trip.id)}/book`,{method:'POST'});const result=await response.json();if(!response.ok)return alert(result.error||'Trip is not ready to book.');await loadTravel();document.getElementById('travel-research-trip').value=trip.id;renderTravelResearch();});


const travelConfirmationForm=document.getElementById('travel-confirmation-form'); if(travelConfirmationForm)travelConfirmationForm.addEventListener('submit',async event=>{event.preventDefault();const trip=selectedTravelTrip();if(!trip)return alert('Choose a trip first.');await updateTravelOperations(trip.id,{confirmation:{type:document.getElementById('travel-confirmation-type').value,name:document.getElementById('travel-confirmation-name').value,confirmation_number:document.getElementById('travel-confirmation-number').value,provider:document.getElementById('travel-confirmation-provider').value,date:document.getElementById('travel-confirmation-date').value,location:document.getElementById('travel-confirmation-location').value}});travelConfirmationForm.reset();});
const travelPaymentForm=document.getElementById('travel-payment-form'); if(travelPaymentForm)travelPaymentForm.addEventListener('submit',async event=>{event.preventDefault();const trip=selectedTravelTrip();if(!trip)return alert('Choose a trip first.');await updateTravelOperations(trip.id,{payment:{label:document.getElementById('travel-payment-label').value,amount:document.getElementById('travel-payment-amount').value,due_date:document.getElementById('travel-payment-due').value,status:document.getElementById('travel-payment-status').value}});travelPaymentForm.reset();});
const travelSaveItinerary=document.getElementById('travel-save-itinerary'); if(travelSaveItinerary)travelSaveItinerary.addEventListener('click',async()=>{const trip=selectedTravelTrip();if(!trip)return;await updateTravelOperations(trip.id,{itinerary_notes:document.getElementById('travel-itinerary-notes').value});});
const travelStartTrip=document.getElementById('travel-start-trip'); if(travelStartTrip)travelStartTrip.addEventListener('click',async()=>{const trip=selectedTravelTrip();if(!trip)return;const response=await fetch(`/api/travel/trips/${encodeURIComponent(trip.id)}/start-travel`,{method:'POST'});const result=await response.json();if(!response.ok)return alert(result.error||'Trip is not ready to start.');await loadTravel();document.getElementById('travel-research-trip').value=trip.id;renderTravelResearch();});



async function renderPreDeparture(trip){
  const summary=document.getElementById('travel-predeparture-summary'),score=document.getElementById('travel-predeparture-score'),checklist=document.getElementById('travel-predeparture-checklist'),blockers=document.getElementById('travel-predeparture-blockers'),docs=document.getElementById('travel-predeparture-documents'),packing=document.getElementById('travel-predeparture-packing'),notes=document.getElementById('travel-predeparture-notes');
  if(!summary||!score||!checklist||!blockers||!docs||!packing||!notes)return;
  if(!trip){summary.textContent='Choose a trip';score.innerHTML=checklist.innerHTML=blockers.innerHTML='';return;}
  try{
    const response=await fetch(`/api/travel/trips/${encodeURIComponent(trip.id)}/pre-departure`),result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to load pre-departure readiness.');
    const countdown=result.days_until_departure===null?'date TBD':result.days_until_departure<0?`${Math.abs(result.days_until_departure)} day(s) past start`:result.days_until_departure===0?'departing today':`${result.days_until_departure} day(s) to departure`;
    summary.textContent=`${result.readiness_score}% ready · ${countdown} · ${result.ready_to_depart?'CLEARED':'not cleared'}`;
    score.innerHTML=`<div class="travel-compare-row ${result.ready_to_depart?'is-leader':''}"><div class="travel-compare-main"><strong>${result.ready_to_depart?'✓ Ready to depart':'Departure clearance in progress'}</strong><small>Operations ${result.operations_readiness_percent}% · ${result.confirmation_summary.total} confirmation(s) · ${result.payment_summary.planned_blockers} payment blocker(s)</small></div><div class="travel-compare-score">${result.readiness_score}<small>READY</small></div></div>`;
    checklist.innerHTML=(result.checklist||[]).map(item=>`<label class="travel-compare-row"><input type="checkbox" data-predeparture-id="${escapeHtml(item.id)}" ${item.complete?'checked':''} ${trip.status!=='Booked'?'disabled':''}><div class="travel-compare-main"><strong>${escapeHtml(item.label)}</strong><small>${item.complete?'Complete':'Required for departure clearance'}</small></div></label>`).join('');
    blockers.innerHTML=result.blockers?.length?`<div class="command-empty"><strong>${result.blockers.length} blocker${result.blockers.length===1?'':'s'} remaining</strong><span>${result.blockers.map(escapeHtml).join(' · ')}</span></div>`:'<div class="travel-compare-row is-leader"><div class="travel-compare-main"><strong>No departure blockers</strong><small>Atlas has the required readiness evidence.</small></div></div>';
    docs.value=result.pre_departure?.document_notes||'';packing.value=result.pre_departure?.packing_notes||'';notes.value=result.pre_departure?.departure_notes||'';
    checklist.querySelectorAll('[data-predeparture-id]').forEach(box=>box.addEventListener('change',()=>updatePreDeparture(trip.id,{checklist_item:{id:box.dataset.predepartureId,complete:box.checked}})));
  }catch(error){summary.textContent='Pre-departure unavailable';blockers.innerHTML=`<div class="command-empty"><span>${escapeHtml(error.message)}</span></div>`;}
}
async function updatePreDeparture(tripId,payload){const response=await fetch(`/api/travel/trips/${encodeURIComponent(tripId)}/pre-departure`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),result=await response.json();if(!response.ok)return alert(result.error||'Unable to update pre-departure readiness.');await loadTravel();const select=document.getElementById('travel-research-trip');if(select)select.value=tripId;renderTravelResearch();}
const travelPreDepartureSave=document.getElementById('travel-predeparture-save');if(travelPreDepartureSave)travelPreDepartureSave.addEventListener('click',()=>{const trip=selectedTravelTrip();if(!trip)return;updatePreDeparture(trip.id,{document_notes:document.getElementById('travel-predeparture-documents').value,packing_notes:document.getElementById('travel-predeparture-packing').value,departure_notes:document.getElementById('travel-predeparture-notes').value});});


async function renderTravelResilience(trip){
  const summary=document.getElementById('travel-resilience-summary'),next=document.getElementById('travel-resilience-next'),board=document.getElementById('travel-resilience-board'),contacts=document.getElementById('travel-resilience-contacts'),notes=document.getElementById('travel-resilience-notes');
  if(!summary||!next||!board||!contacts||!notes)return;
  if(!trip){summary.textContent='Choose a trip';next.innerHTML=board.innerHTML=contacts.innerHTML='';return;}
  try{
    const response=await fetch(`/api/travel/trips/${encodeURIComponent(trip.id)}/resilience`),result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to load trip resilience.');
    summary.textContent=trip.status==='Traveling'?`${result.active_count} active · ${result.resolved_count} resolved · ${String(result.stability||'stable').replace('_',' ')}`:`${trip.status} · resilience tools activate while Traveling`;
    next.innerHTML=result.next_action?`<div class="travel-compare-row ${result.next_action.severity==='critical'?'is-leader':''}"><div class="travel-compare-main"><strong>What now: ${escapeHtml(result.next_action.title)}</strong><small>${escapeHtml(result.next_action.guidance)}</small></div><div class="travel-compare-details"><span class="travel-chip">${escapeHtml(result.next_action.severity)}</span><span class="travel-chip">${escapeHtml(result.next_action.source_status)}</span></div></div>`:'<div class="command-empty"><strong>No active disruption</strong><span>Atlas has no recovery action queued.</span></div>';
    board.innerHTML=(result.disruptions||[]).length?result.disruptions.map(item=>`<div class="travel-compare-row"><div class="travel-compare-main"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.type)} · ${escapeHtml(item.severity)} · ${escapeHtml(item.status)}${item.provider?` · ${escapeHtml(item.provider)}`:''}</small>${item.current_situation?`<small>${escapeHtml(item.current_situation)}</small>`:''}${item.recovery_plan?`<small>Recovery: ${escapeHtml(item.recovery_plan)}</small>`:''}</div><div class="travel-compare-actions">${item.status!=='resolved'?`<button type="button" data-resilience-resolve="${escapeHtml(item.id)}">Resolve</button>`:''}<button type="button" data-resilience-delete="${escapeHtml(item.id)}">Remove</button></div></div>`).join(''):'<div class="command-empty"><span>No disruptions logged.</span></div>';
    contacts.innerHTML=(result.emergency_contacts||[]).length?result.emergency_contacts.map(item=>`<div class="travel-compare-row"><div class="travel-compare-main"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.name||'')}${item.phone?` · ${escapeHtml(item.phone)}`:''}${item.email?` · ${escapeHtml(item.email)}`:''}</small></div><div class="travel-compare-actions"><button type="button" data-resilience-contact-delete="${escapeHtml(item.id)}">Remove</button></div></div>`).join(''):'<div class="command-empty"><span>No emergency or recovery contacts saved.</span></div>';
    notes.value=result.trip_resilience?.recovery_notes||'';
    board.querySelectorAll('[data-resilience-resolve]').forEach(btn=>btn.addEventListener('click',()=>{const item=result.disruptions.find(x=>x.id===btn.dataset.resilienceResolve);if(item)updateTravelResilience(trip.id,{disruption:{...item,status:'resolved'}});}));
    board.querySelectorAll('[data-resilience-delete]').forEach(btn=>btn.addEventListener('click',()=>updateTravelResilience(trip.id,{disruption:{id:btn.dataset.resilienceDelete,delete:true}})));
    contacts.querySelectorAll('[data-resilience-contact-delete]').forEach(btn=>btn.addEventListener('click',()=>updateTravelResilience(trip.id,{emergency_contact:{id:btn.dataset.resilienceContactDelete,delete:true}})));
  }catch(error){summary.textContent='Resilience unavailable';next.innerHTML=`<div class="command-empty"><span>${escapeHtml(error.message)}</span></div>`;}
}
async function updateTravelResilience(tripId,payload){const response=await fetch(`/api/travel/trips/${encodeURIComponent(tripId)}/resilience`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),result=await response.json();if(!response.ok)return alert(result.error||'Unable to update trip resilience.');await loadTravel();const select=document.getElementById('travel-research-trip');if(select)select.value=tripId;renderTravelResearch();}
const resilienceForm=document.getElementById('travel-resilience-form');if(resilienceForm)resilienceForm.addEventListener('submit',async e=>{e.preventDefault();const trip=selectedTravelTrip();if(!trip)return;await updateTravelResilience(trip.id,{disruption:{title:document.getElementById('travel-resilience-title').value,type:document.getElementById('travel-resilience-type').value,severity:document.getElementById('travel-resilience-severity').value,provider:document.getElementById('travel-resilience-provider').value,current_situation:document.getElementById('travel-resilience-situation').value,recovery_plan:document.getElementById('travel-resilience-plan').value}});resilienceForm.reset();});
const resilienceContactForm=document.getElementById('travel-resilience-contact-form');if(resilienceContactForm)resilienceContactForm.addEventListener('submit',async e=>{e.preventDefault();const trip=selectedTravelTrip();if(!trip)return;await updateTravelResilience(trip.id,{emergency_contact:{label:document.getElementById('travel-resilience-contact-label').value,name:document.getElementById('travel-resilience-contact-name').value,phone:document.getElementById('travel-resilience-contact-phone').value,email:document.getElementById('travel-resilience-contact-email').value}});resilienceContactForm.reset();});
const resilienceSave=document.getElementById('travel-resilience-save-notes');if(resilienceSave)resilienceSave.addEventListener('click',()=>{const trip=selectedTravelTrip();if(trip)updateTravelResilience(trip.id,{recovery_notes:document.getElementById('travel-resilience-notes').value});});


async function renderTravelWrapUp(trip){
  const summary=document.getElementById('travel-wrap-up-summary'),score=document.getElementById('travel-wrap-up-score'),checklist=document.getElementById('travel-wrap-up-checklist'),blockers=document.getElementById('travel-wrap-up-blockers'),board=document.getElementById('travel-wrap-up-board'),notes=document.getElementById('travel-wrap-up-notes');
  if(!summary||!score||!checklist||!blockers||!board||!notes)return;
  if(!trip){summary.textContent='Choose a trip';score.innerHTML=checklist.innerHTML=blockers.innerHTML=board.innerHTML='';return;}
  try{
    const response=await fetch(`/api/travel/trips/${encodeURIComponent(trip.id)}/wrap-up`),result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to load trip wrap-up.');
    summary.textContent=`${result.closure_score}/100 closure · ${result.active_disruption_count} active disruptions · ${result.open_money_item_count} open follow-ups`;
    score.innerHTML=`<div class="travel-compare-row ${result.ready_to_complete?'is-leader':''}"><div class="travel-compare-main"><strong>${result.ready_to_complete?'Ready to complete':'Closure still in progress'}</strong><small>${result.checklist_complete_count}/${result.checklist_required_count} checklist items complete</small></div><div class="travel-compare-score">${result.closure_score}<small>CLOSURE</small></div></div>`;
    checklist.innerHTML=result.trip_wrap_up.checklist.map(item=>`<label class="travel-compare-row"><input type="checkbox" data-wrap-check="${escapeHtml(item.id)}" ${item.complete?'checked':''}><div class="travel-compare-main"><strong>${escapeHtml(item.label)}</strong><small>${item.complete?'Complete':'Still needed'}</small></div></label>`).join('');
    blockers.innerHTML=result.blockers.length?result.blockers.map(item=>`<div class="travel-compare-row"><div class="travel-compare-main"><strong>Blocker</strong><small>${escapeHtml(item)}</small></div></div>`).join(''):'<div class="command-empty"><span>No closure blockers.</span></div>';
    board.innerHTML=result.money_items.length?result.money_items.map(item=>`<div class="travel-compare-row"><div class="travel-compare-main"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.type)} · ${escapeHtml(item.status)}${item.provider?` · ${escapeHtml(item.provider)}`:''}${item.follow_up_date?` · follow up ${escapeHtml(item.follow_up_date)}`:''}${item.reference?` · ${escapeHtml(item.reference)}`:''}</small></div><div class="travel-compare-details"><span class="travel-chip">${travelMoney(item.amount)}</span></div><div class="travel-compare-actions">${item.status!=='resolved'?`<button type="button" data-wrap-resolve="${escapeHtml(item.id)}">Resolve</button>`:''}<button type="button" data-wrap-delete="${escapeHtml(item.id)}">Remove</button></div></div>`).join(''):'<div class="command-empty"><span>No refunds, credits, claims, or reimbursements logged.</span></div>';
    notes.value=result.trip_wrap_up.closure_notes||'';
    checklist.querySelectorAll('[data-wrap-check]').forEach(el=>el.addEventListener('change',()=>updateTravelWrapUp(trip.id,{checklist_item:{id:el.dataset.wrapCheck,complete:el.checked}})));
    board.querySelectorAll('[data-wrap-resolve]').forEach(btn=>btn.addEventListener('click',()=>{const item=result.money_items.find(x=>x.id===btn.dataset.wrapResolve);if(item)updateTravelWrapUp(trip.id,{money_item:{...item,status:'resolved'}});}));
    board.querySelectorAll('[data-wrap-delete]').forEach(btn=>btn.addEventListener('click',()=>updateTravelWrapUp(trip.id,{money_item:{id:btn.dataset.wrapDelete,delete:true}})));
  }catch(error){summary.textContent='Wrap-up unavailable';blockers.innerHTML=`<div class="command-empty"><span>${escapeHtml(error.message)}</span></div>`;}
}
async function updateTravelWrapUp(tripId,payload){const response=await fetch(`/api/travel/trips/${encodeURIComponent(tripId)}/wrap-up`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),result=await response.json();if(!response.ok)return alert(result.error||'Unable to update trip wrap-up.');await loadTravel();const select=document.getElementById('travel-research-trip');if(select)select.value=tripId;renderTravelResearch();}
const travelWrapMoneyForm=document.getElementById('travel-wrap-up-money-form');if(travelWrapMoneyForm)travelWrapMoneyForm.addEventListener('submit',async e=>{e.preventDefault();const trip=selectedTravelTrip();if(!trip)return;await updateTravelWrapUp(trip.id,{money_item:{label:document.getElementById('travel-wrap-up-money-label').value,type:document.getElementById('travel-wrap-up-money-type').value,amount:document.getElementById('travel-wrap-up-money-amount').value,status:document.getElementById('travel-wrap-up-money-status').value,provider:document.getElementById('travel-wrap-up-money-provider').value,follow_up_date:document.getElementById('travel-wrap-up-money-followup').value,reference:document.getElementById('travel-wrap-up-money-reference').value}});travelWrapMoneyForm.reset();});
const travelWrapSave=document.getElementById('travel-wrap-up-save-notes');if(travelWrapSave)travelWrapSave.addEventListener('click',()=>{const trip=selectedTravelTrip();if(trip)updateTravelWrapUp(trip.id,{closure_notes:document.getElementById('travel-wrap-up-notes').value});});

async function renderLiveTravel(trip){
  const summary=document.getElementById('travel-live-summary'),next=document.getElementById('travel-live-next'),today=document.getElementById('travel-live-today'),expenses=document.getElementById('travel-live-expenses'),issues=document.getElementById('travel-live-issues'),notes=document.getElementById('travel-live-notes');
  if(!summary||!next||!today||!expenses||!issues||!notes)return;
  if(!trip){summary.textContent='Choose a trip';next.innerHTML=today.innerHTML=expenses.innerHTML=issues.innerHTML='';return;}
  try{
    const response=await fetch(`/api/travel/trips/${encodeURIComponent(trip.id)}/live`),result=await response.json(); if(!response.ok)throw new Error(result.error||'Unable to load live trip.');
    summary.textContent=trip.status==='Traveling'?`${result.today_items.length} today · ${travelMoney(result.expense_total)} spent · ${result.open_issue_count} open issues`:`${trip.status} · Live mode starts when Traveling`;
    next.innerHTML=result.next_up?`<div class="travel-compare-row"><div class="travel-compare-main"><strong>Next up: ${escapeHtml(result.next_up.title)}</strong><small>${escapeHtml(result.next_up.date)} ${escapeHtml(result.next_up.time||'')} · ${escapeHtml(result.next_up.location||'Location TBD')}</small></div><div class="travel-compare-details"><span class="travel-chip">${escapeHtml(result.next_up.type)}</span></div></div>`:'<div class="command-empty"><span>No upcoming itinerary item.</span></div>';
    today.innerHTML=result.today_items.length?result.today_items.map(item=>`<div class="travel-compare-row"><div class="travel-compare-main"><strong>${escapeHtml(item.time||'Any time')} · ${escapeHtml(item.title)}</strong><small>${escapeHtml(item.location||item.type)}</small></div><div class="travel-compare-actions">${item.status==='planned'?`<button type="button" data-live-done="${escapeHtml(item.id)}">Done</button>`:''}<button type="button" data-live-item-delete="${escapeHtml(item.id)}">Remove</button></div></div>`).join(''):'<div class="command-empty"><span>Nothing scheduled for today.</span></div>';
    expenses.innerHTML=result.live_trip.expenses.length?result.live_trip.expenses.map(item=>`<div class="travel-compare-row"><div class="travel-compare-main"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.category)}${item.date?` · ${escapeHtml(item.date)}`:''}</small></div><div class="travel-compare-details"><span class="travel-chip">${travelMoney(item.amount)}</span></div><div class="travel-compare-actions"><button type="button" data-live-expense-delete="${escapeHtml(item.id)}">Remove</button></div></div>`).join(''):'<div class="command-empty"><span>No trip expenses logged.</span></div>';
    issues.innerHTML=result.live_trip.issues.length?result.live_trip.issues.map(item=>`<div class="travel-compare-row"><div class="travel-compare-main"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.severity)} · ${escapeHtml(item.status)}</small></div><div class="travel-compare-actions">${item.status==='open'?`<button type="button" data-live-issue-resolve="${escapeHtml(item.id)}">Resolve</button>`:''}<button type="button" data-live-issue-delete="${escapeHtml(item.id)}">Remove</button></div></div>`).join(''):'<div class="command-empty"><span>No issues logged.</span></div>';
    notes.value=result.live_trip.day_notes||'';
    today.querySelectorAll('[data-live-done]').forEach(btn=>btn.addEventListener('click',()=>{const item=result.live_trip.itinerary.find(x=>x.id===btn.dataset.liveDone);if(item)updateLiveTravel(trip.id,{itinerary_item:{...item,status:'done'}});}));
    today.querySelectorAll('[data-live-item-delete]').forEach(btn=>btn.addEventListener('click',()=>updateLiveTravel(trip.id,{itinerary_item:{id:btn.dataset.liveItemDelete,delete:true}})));
    expenses.querySelectorAll('[data-live-expense-delete]').forEach(btn=>btn.addEventListener('click',()=>updateLiveTravel(trip.id,{expense:{id:btn.dataset.liveExpenseDelete,delete:true}})));
    issues.querySelectorAll('[data-live-issue-resolve]').forEach(btn=>btn.addEventListener('click',()=>{const item=result.live_trip.issues.find(x=>x.id===btn.dataset.liveIssueResolve);if(item)updateLiveTravel(trip.id,{issue:{...item,status:'resolved'}});}));
    issues.querySelectorAll('[data-live-issue-delete]').forEach(btn=>btn.addEventListener('click',()=>updateLiveTravel(trip.id,{issue:{id:btn.dataset.liveIssueDelete,delete:true}})));
  }catch(error){summary.textContent='Live trip unavailable';next.innerHTML=`<div class="command-empty"><span>${escapeHtml(error.message)}</span></div>`;}
}
async function updateLiveTravel(tripId,payload){const response=await fetch(`/api/travel/trips/${encodeURIComponent(tripId)}/live`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),result=await response.json();if(!response.ok)return alert(result.error||'Unable to update live trip.');await loadTravel();const select=document.getElementById('travel-research-trip');if(select)select.value=tripId;renderTravelResearch();}
const liveItineraryForm=document.getElementById('travel-live-itinerary-form');if(liveItineraryForm)liveItineraryForm.addEventListener('submit',async e=>{e.preventDefault();const trip=selectedTravelTrip();if(!trip)return;await updateLiveTravel(trip.id,{itinerary_item:{title:document.getElementById('travel-live-title').value,type:document.getElementById('travel-live-type').value,date:document.getElementById('travel-live-date').value,time:document.getElementById('travel-live-time').value,location:document.getElementById('travel-live-location').value}});liveItineraryForm.reset();});
const liveExpenseForm=document.getElementById('travel-live-expense-form');if(liveExpenseForm)liveExpenseForm.addEventListener('submit',async e=>{e.preventDefault();const trip=selectedTravelTrip();if(!trip)return;await updateLiveTravel(trip.id,{expense:{label:document.getElementById('travel-live-expense-label').value,amount:document.getElementById('travel-live-expense-amount').value,category:document.getElementById('travel-live-expense-category').value,date:document.getElementById('travel-live-expense-date').value}});liveExpenseForm.reset();});
const liveIssueForm=document.getElementById('travel-live-issue-form');if(liveIssueForm)liveIssueForm.addEventListener('submit',async e=>{e.preventDefault();const trip=selectedTravelTrip();if(!trip)return;await updateLiveTravel(trip.id,{issue:{title:document.getElementById('travel-live-issue-title').value,severity:document.getElementById('travel-live-issue-severity').value}});liveIssueForm.reset();});
const liveSaveNotes=document.getElementById('travel-live-save-notes');if(liveSaveNotes)liveSaveNotes.addEventListener('click',()=>{const trip=selectedTravelTrip();if(trip)updateLiveTravel(trip.id,{day_notes:document.getElementById('travel-live-notes').value});});


function travelListInput(value){return String(value||'').split(';').map(x=>x.trim()).filter(Boolean);}
function travelBoolInput(value){return value==='yes'?true:value==='no'?false:null;}
async function renderTravelReview(trip){
  const summary=document.getElementById('travel-review-summary'),spend=document.getElementById('travel-review-spend-summary'),learning=document.getElementById('travel-learning-board');
  if(!summary||!spend||!learning)return;
  if(!trip){summary.textContent='Choose a trip';spend.innerHTML=learning.innerHTML='';return;}
  try{
    const response=await fetch(`/api/travel/trips/${encodeURIComponent(trip.id)}/review`),result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to load review.');
    summary.textContent=`${trip.status} · ${result.review.ratings.overall||0}/10 overall${result.review.completed_at?' · review complete':''}`;
    const r=result.review;
    const set=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v??'';};
    set('travel-review-overall',r.ratings.overall||'');set('travel-review-spend',r.actual_total_spend||'');set('travel-review-destination',r.ratings.destination||'');set('travel-review-flight',r.ratings.flight||'');set('travel-review-resort',r.ratings.resort||'');set('travel-review-value',r.ratings.value||'');set('travel-review-loved',(r.loved||[]).join('; '));set('travel-review-disliked',(r.disliked||[]).join('; '));set('travel-review-worth',(r.worth_it||[]).join('; '));set('travel-review-avoid',(r.avoid_repeat||[]).join('; '));set('travel-review-notes',r.notes||'');
    set('travel-review-repeat',r.would_repeat_trip===true?'yes':r.would_repeat_trip===false?'no':'');set('travel-review-return',r.would_return_destination===true?'yes':r.would_return_destination===false?'no':'');
    const variance=result.budget_variance;spend.innerHTML=`<div class="travel-compare-row"><div class="travel-compare-main"><strong>${travelMoney(result.actual_total_spend)} final spend</strong><small>${result.derived_spend!==result.actual_total_spend?`Atlas-derived baseline ${travelMoney(result.derived_spend)} · `:''}${result.budget_target?`${travelMoney(Math.abs(variance||0))} ${variance>0?'over':'under'} budget`:'No target budget'}</small></div></div>`;
    learning.innerHTML=result.learning_suggestions.length?result.learning_suggestions.map(item=>`<label class="travel-compare-row"><input type="checkbox" data-learning-id="${escapeHtml(item.id)}"><div class="travel-compare-main"><strong>${escapeHtml(item.type==='avoid_destination'?`Avoid ${item.value}`:`Prefer ${item.key.replaceAll('_',' ')}`)}</strong><small>${escapeHtml(item.reason)}</small></div></label>`).join(''):'<div class="command-empty"><span>No new preference changes suggested from this review.</span></div>';
  }catch(error){summary.textContent='Review unavailable';learning.innerHTML=`<div class="command-empty"><span>${escapeHtml(error.message)}</span></div>`;}
}
async function saveTravelReview(tripId,payload){const response=await fetch(`/api/travel/trips/${encodeURIComponent(tripId)}/review`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),result=await response.json();if(!response.ok)return alert(result.error||'Unable to save review.');await loadTravel();const select=document.getElementById('travel-research-trip');if(select)select.value=tripId;renderTravelResearch();}
const travelReviewForm=document.getElementById('travel-review-form');if(travelReviewForm)travelReviewForm.addEventListener('submit',async e=>{e.preventDefault();const trip=selectedTravelTrip();if(!trip)return;await saveTravelReview(trip.id,{ratings:{overall:document.getElementById('travel-review-overall').value,destination:document.getElementById('travel-review-destination').value,flight:document.getElementById('travel-review-flight').value,resort:document.getElementById('travel-review-resort').value,value:document.getElementById('travel-review-value').value},actual_total_spend:document.getElementById('travel-review-spend').value,loved:travelListInput(document.getElementById('travel-review-loved').value),disliked:travelListInput(document.getElementById('travel-review-disliked').value),worth_it:travelListInput(document.getElementById('travel-review-worth').value),avoid_repeat:travelListInput(document.getElementById('travel-review-avoid').value),would_repeat_trip:travelBoolInput(document.getElementById('travel-review-repeat').value),would_return_destination:travelBoolInput(document.getElementById('travel-review-return').value),notes:document.getElementById('travel-review-notes').value});});
const travelCompleteTrip=document.getElementById('travel-complete-trip');if(travelCompleteTrip)travelCompleteTrip.addEventListener('click',async()=>{const trip=selectedTravelTrip();if(!trip)return;const response=await fetch(`/api/travel/trips/${encodeURIComponent(trip.id)}/complete`,{method:'POST'}),result=await response.json();if(!response.ok)return alert(result.error||'Trip is not ready to complete.');await loadTravel();document.getElementById('travel-research-trip').value=trip.id;renderTravelResearch();});
const travelApplyLearning=document.getElementById('travel-apply-learning');if(travelApplyLearning)travelApplyLearning.addEventListener('click',async()=>{const trip=selectedTravelTrip();if(!trip)return;const ids=[...document.querySelectorAll('[data-learning-id]:checked')].map(x=>x.dataset.learningId);if(!ids.length)return alert('Select at least one learning suggestion.');const response=await fetch(`/api/travel/trips/${encodeURIComponent(trip.id)}/apply-learning`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({suggestion_ids:ids})}),result=await response.json();if(!response.ok)return alert(result.error||'Unable to apply learning.');await loadTravel();document.getElementById('travel-research-trip').value=trip.id;renderTravelResearch();});



async function renderTravelScenarios(trip){
  const summary=document.getElementById('travel-scenario-summary'),board=document.getElementById('travel-scenario-board');
  if(!summary||!board)return;
  const budget=document.getElementById('travel-scenario-budget'); if(budget&&trip?.budget?.target&&!budget.value)budget.placeholder=String(trip.budget.target);
  if(!trip){summary.textContent='Choose a trip';board.innerHTML='<div class="command-empty"><span>Create or choose a trip first.</span></div>';return;}
  try{
    const response=await fetch(`/api/travel/trips/${encodeURIComponent(trip.id)}/scenarios`),result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to load scenarios.');
    summary.textContent=`${result.count||0} scenario${result.count===1?'':'s'}${result.leader?` · leader ${Number(result.leader.score?.atlas_scenario_score||0)}/100`:''}${result.score_gap!==null?` · ${result.score_gap} pt gap`:''}`;
    if(!result.scenarios?.length){board.innerHTML='<div class="command-empty"><strong>No scenarios yet.</strong><span>Create two or more what-if versions to compare cost, travel burden, destination fit, and lodging quality.</span></div>';return;}
    board.innerHTML=result.scenarios.map(item=>{const delta=item.score?.budget_delta;return `<div class="travel-compare-row ${item.rank===1?'is-leader':''}"><div class="travel-compare-main"><strong>${item.rank===1?'★ ':''}${escapeHtml(item.name)}</strong><small>${escapeHtml(item.destination)} · ${travelMoney(item.total_cost)} total · ${Number(item.nights||0)} nights · ${Number(item.flight_hours||0)}h · ${Number(item.layovers||0)} stop${Number(item.layovers||0)===1?'':'s'}</small></div><div class="travel-compare-score">${Number(item.score?.atlas_scenario_score||0)}<small>SCENARIO SCORE</small></div><div class="travel-compare-details">${delta!==null?`<span class="travel-chip ${delta<0?'warn':''}">${delta>=0?travelMoney(delta)+' under':travelMoney(Math.abs(delta))+' over'} budget</span>`:''}${(item.badges||[]).map(x=>`<span class="travel-chip">${escapeHtml(x)}</span>`).join('')}${(item.score?.warnings||[]).map(x=>`<span class="travel-chip warn">${escapeHtml(x)}</span>`).join('')}</div><div class="travel-compare-actions"><button type="button" data-scenario-delete="${escapeHtml(item.id)}">Remove</button></div></div>`}).join('');
    board.querySelectorAll('[data-scenario-delete]').forEach(btn=>btn.addEventListener('click',()=>removeTravelScenario(trip.id,btn.dataset.scenarioDelete)));
  }catch(error){summary.textContent='Scenario planner unavailable';board.innerHTML=`<div class="command-empty"><span>${escapeHtml(error.message)}</span></div>`;}
}
async function removeTravelScenario(tripId,scenarioId){const response=await fetch(`/api/travel/trips/${encodeURIComponent(tripId)}/scenarios/${encodeURIComponent(scenarioId)}`,{method:'DELETE'}),result=await response.json();if(!response.ok)return alert(result.error||'Unable to remove scenario.');await loadTravel();document.getElementById('travel-research-trip').value=tripId;renderTravelResearch();}
const travelScenarioForm=document.getElementById('travel-scenario-form');if(travelScenarioForm)travelScenarioForm.addEventListener('submit',async e=>{e.preventDefault();const trip=selectedTravelTrip();if(!trip)return alert('Create or choose a trip first.');const payload={name:document.getElementById('travel-scenario-name').value,destination:document.getElementById('travel-scenario-destination').value,budget_target:document.getElementById('travel-scenario-budget').value||trip.budget?.target,flight_total:document.getElementById('travel-scenario-flight-cost').value,lodging_total:document.getElementById('travel-scenario-lodging-cost').value,taxes_fees:document.getElementById('travel-scenario-fees').value,other_costs:document.getElementById('travel-scenario-other').value,flight_hours:document.getElementById('travel-scenario-flight-hours').value,layovers:document.getElementById('travel-scenario-layovers').value,lodging_score:document.getElementById('travel-scenario-lodging-score').value,nights:document.getElementById('travel-scenario-nights').value,notes:document.getElementById('travel-scenario-notes').value};const response=await fetch(`/api/travel/trips/${encodeURIComponent(trip.id)}/scenarios`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),result=await response.json();if(!response.ok)return alert(result.error||'Unable to create scenario.');const keep=trip.id;travelScenarioForm.reset();document.getElementById('travel-scenario-layovers').value=0;document.getElementById('travel-scenario-lodging-score').value=8;document.getElementById('travel-scenario-nights').value=7;await loadTravel();document.getElementById('travel-research-trip').value=keep;renderTravelResearch();});

async function renderTravelIntelligence(){
  const summary=document.getElementById('travel-intelligence-summary'),metrics=document.getElementById('travel-intelligence-metrics'),signals=document.getElementById('travel-intelligence-signals'),recommendations=document.getElementById('travel-intelligence-recommendations');
  if(!summary||!metrics||!signals||!recommendations)return;
  const params=new URLSearchParams({limit:'5'}); const budget=document.getElementById('travel-intelligence-budget')?.value; const travelers=document.getElementById('travel-intelligence-travelers')?.value;
  if(budget)params.set('budget',budget); if(travelers)params.set('travelers',travelers);
  try{
    const response=await fetch(`/api/travel/intelligence?${params}`),result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to load travel intelligence.');
    summary.textContent=`${result.completed_trip_count} completed · ${result.reviewed_trip_count} reviewed · ${result.history_confidence} confidence`;
    if(!budget&&result.next_trip_profile?.budget){const el=document.getElementById('travel-intelligence-budget');if(el)el.placeholder=String(result.next_trip_profile.budget);} if(!travelers&&result.next_trip_profile?.travelers){const el=document.getElementById('travel-intelligence-travelers');if(el)el.placeholder=String(result.next_trip_profile.travelers);}
    const m=result.metrics||{}; const variance=Number(m.average_budget_variance||0);
    metrics.innerHTML=`<div class="travel-compare-row"><div class="travel-compare-main"><strong>${travelMoney(m.average_actual_spend)} average actual spend</strong><small>${m.average_budget_target?`${travelMoney(m.average_budget_target)} average target · ${travelMoney(Math.abs(variance))} ${variance>0?'over':'under'} budget on average`:'Complete trips to establish budget history'}</small></div><div class="travel-compare-score">${Number(m.average_overall_rating||0).toFixed(1)}<small>AVG / 10</small></div></div><div class="travel-compare-row"><div class="travel-compare-main"><strong>Destination ${Number(m.average_destination_rating||0).toFixed(1)} · Flight ${Number(m.average_flight_rating||0).toFixed(1)} · Resort ${Number(m.average_resort_rating||0).toFixed(1)}</strong><small>${m.return_destination_rate===null?'Return rate TBD':`${m.return_destination_rate}% would return`} · ${m.repeat_trip_rate===null?'Repeat rate TBD':`${m.repeat_trip_rate}% would repeat trip`}</small></div></div>`;
    const sig=result.learned_signals||{}; const chips=(label,items)=>items?.length?`<div class="travel-compare-row"><div class="travel-compare-main"><strong>${label}</strong><small>${items.map(x=>`${escapeHtml(x.label)} ×${x.count}`).join(' · ')}</small></div></div>`:'';
    signals.innerHTML=chips('Loved repeatedly',sig.loved)+chips('Worth the money',sig.worth_it)+chips('Recurring dislikes',sig.disliked)+chips('Never repeat',sig.avoid_repeat)||'<div class="command-empty"><span>Complete and review trips to build personal travel signals.</span></div>';
    recommendations.innerHTML=(result.recommendations||[]).map((item,index)=>`<div class="travel-compare-row ${index===0?'is-leader':''}"><div class="travel-compare-main"><strong>${index===0?'★ ':''}${escapeHtml(item.name)}</strong><small>${travelMoney(item.estimated_total_cost)} planning estimate · ${Number(item.flight_hours||0)}h flight · ${escapeHtml((item.reasons||[]).join(' · ')||'Saved-preference match')}</small></div><div class="travel-compare-score">${Number(item.intelligence_score||0)}<small>INTEL SCORE</small></div><div class="travel-compare-details"><span class="travel-chip">Atlas Fit ${Number(item.score?.atlas_fit||0)}</span><span class="travel-chip">${escapeHtml(result.history_confidence)} history confidence</span>${item.prior_visits?`<span class="travel-chip">${item.prior_visits} prior visit${item.prior_visits===1?'':'s'}</span>`:'<span class="travel-chip seed">New to your history</span>'}</div></div>`).join('')||'<div class="command-empty"><span>No recommendations available.</span></div>';
  }catch(error){summary.textContent='Intelligence unavailable';recommendations.innerHTML=`<div class="command-empty"><span>${escapeHtml(error.message)}</span></div>`;}
}
const travelIntelligenceRefresh=document.getElementById('travel-intelligence-refresh');if(travelIntelligenceRefresh)travelIntelligenceRefresh.addEventListener('click',()=>renderTravelIntelligence());


async function renderTravelWatchlist(trip){
  const summary=document.getElementById('travel-watch-summary'),board=document.getElementById('travel-watch-board'),scenarioSelect=document.getElementById('travel-watch-scenario');
  if(!summary||!board||!scenarioSelect)return;
  const previous=scenarioSelect.value; scenarioSelect.innerHTML=(trip?.scenario_plans||[]).map(item=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.name||item.destination||'Scenario')}</option>`).join(''); if([...scenarioSelect.options].some(o=>o.value===previous))scenarioSelect.value=previous;
  if(!trip){summary.textContent='Choose a trip';board.innerHTML='<div class="command-empty"><span>Create or choose a trip first.</span></div>';return;}
  try{
    const response=await fetch(`/api/travel/trips/${encodeURIComponent(trip.id)}/watchlist`),result=await response.json(); if(!response.ok)throw new Error(result.error||'Unable to load watchlist.');
    summary.textContent=`${result.active_count||0} active · ${result.target_hit_count||0} target hit · ${result.recheck_due_count||0} recheck due`;
    if(!result.watches?.length){board.innerHTML='<div class="command-empty"><strong>No watched scenarios yet.</strong><span>Add a scenario with a target total to start tracking quote movement and freshness.</span></div>';return;}
    board.innerHTML=result.watches.map(item=>{const status=(item.status||'watching').replaceAll('_',' ');const change=item.change_amount;const age=item.age_hours;return `<div class="travel-compare-row ${item.target_hit?'is-leader':''}"><div class="travel-compare-main"><strong>${item.target_hit?'★ ':''}${escapeHtml(item.label)}</strong><small>${escapeHtml(item.scenario?.destination||'Scenario unavailable')} · current ${travelMoney(item.current_total)} · target ${travelMoney(item.target_total)}${change===null?'':` · ${change>0?'+':''}${travelMoney(change)} since last check`}</small></div><div class="travel-compare-score">${item.target_hit?'HIT':item.recheck_due?'DUE':'OK'}<small>${escapeHtml(status.toUpperCase())}</small></div><div class="travel-compare-details"><span class="travel-chip ${item.target_hit?'':'seed'}">${item.target_delta===null?'No target delta':item.target_delta>=0?`${travelMoney(item.target_delta)} below target`:`${travelMoney(Math.abs(item.target_delta))} above target`}</span><span class="travel-chip ${item.live_data?'':'seed'}">${item.live_data?'Live provider':'Saved/manual'}${item.source?` · ${escapeHtml(item.source)}`:''}</span>${age===null?'<span class="travel-chip warn">Never rechecked</span>':`<span class="travel-chip ${item.recheck_due?'warn':''}">${age}h old</span>`}</div><div class="travel-compare-actions"><button type="button" data-watch-check="${escapeHtml(item.id)}">Record recheck</button><button type="button" data-watch-pause="${escapeHtml(item.id)}" data-watch-paused="${item.paused?'1':'0'}">${item.paused?'Resume':'Pause'}</button><button type="button" data-watch-delete="${escapeHtml(item.id)}">Remove</button></div></div>`}).join('');
    board.querySelectorAll('[data-watch-check]').forEach(btn=>btn.addEventListener('click',()=>recheckTravelWatch(trip.id,btn.dataset.watchCheck)));
    board.querySelectorAll('[data-watch-pause]').forEach(btn=>btn.addEventListener('click',()=>toggleTravelWatch(trip.id,btn.dataset.watchPause,btn.dataset.watchPaused==='1')));
    board.querySelectorAll('[data-watch-delete]').forEach(btn=>btn.addEventListener('click',()=>removeTravelWatch(trip.id,btn.dataset.watchDelete)));
  }catch(error){summary.textContent='Watchlist unavailable';board.innerHTML=`<div class="command-empty"><span>${escapeHtml(error.message)}</span></div>`;}
}
async function recheckTravelWatch(tripId,watchId){const total=prompt('Current total trip price?');if(!total)return;const source=prompt('Source (provider/site or Manual recheck)?','Manual recheck')||'Manual recheck';const live=confirm('Is this price from a live provider/source checked right now?');const response=await fetch(`/api/travel/trips/${encodeURIComponent(tripId)}/watchlist/${encodeURIComponent(watchId)}/check`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({total_cost:total,source,live_data:live})}),result=await response.json();if(!response.ok)return alert(result.error||'Unable to record recheck.');renderTravelWatchlist(selectedTravelTrip());}
async function toggleTravelWatch(tripId,watchId,paused){const response=await fetch(`/api/travel/trips/${encodeURIComponent(tripId)}/watchlist/${encodeURIComponent(watchId)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({paused:!paused})}),result=await response.json();if(!response.ok)return alert(result.error||'Unable to update watch.');await loadTravel();document.getElementById('travel-research-trip').value=tripId;renderTravelResearch();}
async function removeTravelWatch(tripId,watchId){const response=await fetch(`/api/travel/trips/${encodeURIComponent(tripId)}/watchlist/${encodeURIComponent(watchId)}`,{method:'DELETE'}),result=await response.json();if(!response.ok)return alert(result.error||'Unable to remove watch.');await loadTravel();document.getElementById('travel-research-trip').value=tripId;renderTravelResearch();}
const travelWatchForm=document.getElementById('travel-watch-form');if(travelWatchForm)travelWatchForm.addEventListener('submit',async e=>{e.preventDefault();const trip=selectedTravelTrip();if(!trip)return alert('Create or choose a trip first.');const payload={scenario_id:document.getElementById('travel-watch-scenario').value,target_total:document.getElementById('travel-watch-target').value,label:document.getElementById('travel-watch-label').value,notes:document.getElementById('travel-watch-notes').value};const response=await fetch(`/api/travel/trips/${encodeURIComponent(trip.id)}/watchlist`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),result=await response.json();if(!response.ok)return alert(result.error||'Unable to add watch.');const keep=trip.id;travelWatchForm.reset();await loadTravel();document.getElementById('travel-research-trip').value=keep;renderTravelResearch();});


async function renderTravelActions(trip){
  const summary=document.getElementById('travel-action-summary'),next=document.getElementById('travel-action-next'),board=document.getElementById('travel-action-board');
  if(!summary||!next||!board)return;
  if(!trip){summary.textContent='Choose a trip';next.innerHTML='<div class="command-empty"><span>Create or choose a trip first.</span></div>';board.innerHTML='';return;}
  try{
    const response=await fetch(`/api/travel/trips/${encodeURIComponent(trip.id)}/actions`),result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to load travel actions.');
    summary.textContent=`${result.open_count||0} open · ${result.urgent_count||0} urgent · ${result.high_count||0} high`;
    const top=result.next_action;
    next.innerHTML=top?`<div class="travel-compare-row is-leader"><div class="travel-compare-main"><strong>★ ${escapeHtml(top.title)}</strong><small>${escapeHtml(top.detail)} ${escapeHtml(top.recommended_action||'')}</small></div><div class="travel-compare-score">${escapeHtml((top.priority||'').toUpperCase())}<small>NEXT ACTION</small></div></div>`:'<div class="command-empty"><strong>No open travel actions.</strong><span>Your active watchlist does not currently require attention.</span></div>';
    if(!result.actions?.length){board.innerHTML='<div class="command-empty"><span>No watchlist actions have been generated yet.</span></div>';return;}
    board.innerHTML=result.actions.map(item=>`<div class="travel-compare-row ${item.priority==='urgent'&&!item.acknowledged&&!item.snoozed?'is-leader':''}"><div class="travel-compare-main"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)} · ${escapeHtml(item.recommended_action||'')}</small></div><div class="travel-compare-score">${escapeHtml((item.priority||'').toUpperCase())}<small>${item.acknowledged?'DONE':item.snoozed?'SNOOZED':'OPEN'}</small></div><div class="travel-compare-details"><span class="travel-chip ${item.live_data?'':'seed'}">${item.live_data?'Live-backed':'Saved/manual'}</span>${item.source?`<span class="travel-chip">${escapeHtml(item.source)}</span>`:''}${item.snoozed?`<span class="travel-chip warn">Until ${escapeHtml(item.snoozed_until)}</span>`:''}</div><div class="travel-compare-actions"><button type="button" data-action-ack="${escapeHtml(item.id)}" data-action-done="${item.acknowledged?'1':'0'}">${item.acknowledged?'Reopen':'Acknowledge'}</button><button type="button" data-action-snooze="${escapeHtml(item.id)}">Snooze 24h</button></div></div>`).join('');
    board.querySelectorAll('[data-action-ack]').forEach(btn=>btn.addEventListener('click',()=>updateTravelActionUI(trip.id,btn.dataset.actionAck,{acknowledged:btn.dataset.actionDone!=='1'})));
    board.querySelectorAll('[data-action-snooze]').forEach(btn=>btn.addEventListener('click',()=>{const until=new Date(Date.now()+24*60*60*1000).toISOString();updateTravelActionUI(trip.id,btn.dataset.actionSnooze,{snoozed_until:until});}));
  }catch(error){summary.textContent='Action queue unavailable';next.innerHTML=`<div class="command-empty"><span>${escapeHtml(error.message)}</span></div>`;board.innerHTML='';}
}
async function updateTravelActionUI(tripId,actionId,payload){const response=await fetch(`/api/travel/trips/${encodeURIComponent(tripId)}/actions/${encodeURIComponent(actionId)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),result=await response.json();if(!response.ok)return alert(result.error||'Unable to update travel action.');renderTravelActions(selectedTravelTrip());}


async function renderTravelReadiness(trip){
  const summary=document.getElementById('travel-readiness-summary'),next=document.getElementById('travel-readiness-next'),board=document.getElementById('travel-booking-readiness-board');
  if(!summary||!next||!board)return;
  if(!trip){summary.textContent='Choose a trip';next.innerHTML='<div class="command-empty"><span>Create or choose a trip first.</span></div>';board.innerHTML='';return;}
  try{
    const response=await fetch(`/api/travel/trips/${encodeURIComponent(trip.id)}/readiness`),result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to load booking readiness.');
    summary.textContent=`${result.book_now_count||0} book now · ${result.verify_now_count||0} verify · ${result.recheck_now_count||0} recheck`;
    const leader=result.leader;
    const decisionLabel={book_now:'BOOK',verify_now:'VERIFY',recheck_now:'RECHECK',consider_now:'CONSIDER',wait:'WAIT',paused:'PAUSED'};
    next.innerHTML=leader?`<div class="travel-compare-row ${leader.decision==='book_now'?'is-leader':''}"><div class="travel-compare-main"><strong>${escapeHtml(leader.label||leader.scenario_name||leader.destination||'Top watched scenario')}</strong><small>${escapeHtml(leader.recommendation)}</small></div><div class="travel-compare-score">${escapeHtml(decisionLabel[leader.decision]||leader.decision)}<small>${Number(leader.readiness_score||0)}% READY</small></div><div class="travel-compare-details"><span class="travel-chip ${leader.live_verified?'':'seed'}">${leader.live_verified?'Live verified':'Needs live verification'}</span><span class="travel-chip ${leader.fresh_quote?'':'warn'}">${leader.fresh_quote?'Fresh quote':'Recheck needed'}</span>${leader.target_hit?'<span class="travel-chip">Target hit</span>':'<span class="travel-chip seed">Target not hit</span>'}</div></div>`:'<div class="command-empty"><strong>No booking candidate yet.</strong><span>Add a saved scenario to the watchlist first.</span></div>';
    board.innerHTML=(result.candidates||[]).length?result.candidates.map(item=>`<div class="travel-compare-row ${item.decision==='book_now'?'is-leader':''}"><div class="travel-compare-main"><strong>${escapeHtml(item.label||item.scenario_name||item.destination||'Watched scenario')}</strong><small>${travelMoney(item.current_total)}${item.target_total?` · target ${travelMoney(item.target_total)}`:''} · ${escapeHtml(item.recommendation)}</small></div><div class="travel-compare-score">${Number(item.readiness_score||0)}<small>READINESS</small></div><div class="travel-compare-details"><span class="travel-chip">${escapeHtml(decisionLabel[item.decision]||item.decision)}</span>${item.within_trip_budget?'<span class="travel-chip">Within trip budget</span>':'<span class="travel-chip warn">Over trip budget</span>'}${item.open_actions?.length?`<span class="travel-chip warn">${item.open_actions.length} open action${item.open_actions.length===1?'':'s'}</span>`:''}${(item.blockers||[]).map(x=>`<span class="travel-chip warn">${escapeHtml(x)}</span>`).join('')}</div></div>`).join(''):'<div class="command-empty"><span>No watched scenarios yet.</span></div>';
  }catch(error){summary.textContent='Readiness unavailable';next.innerHTML=`<div class="command-empty"><span>${escapeHtml(error.message)}</span></div>`;board.innerHTML='';}
}


async function renderTravelBookingExecution(trip){
  const summary=document.getElementById('travel-booking-execution-summary'),next=document.getElementById('travel-booking-execution-next'),board=document.getElementById('travel-booking-execution-board'),start=document.getElementById('travel-booking-start'),finalize=document.getElementById('travel-booking-finalize');
  if(!summary||!next||!board)return;
  if(!trip){summary.textContent='Choose a trip';next.innerHTML='<div class="command-empty"><span>Create or choose a trip first.</span></div>';board.innerHTML='';if(start)start.disabled=true;if(finalize)finalize.disabled=true;return;}
  try{
    const response=await fetch(`/api/travel/trips/${encodeURIComponent(trip.id)}/booking-execution`),result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to load booking execution.');
    summary.textContent=result.started?`${result.checklist_complete_count}/${result.checklist_required_count} final checks · ${result.final_quote_verified?'live quote verified':'quote verification needed'}`:'Not started';
    const candidate=result.candidate;
    next.innerHTML=result.started?`<div class="travel-compare-row ${result.can_finalize?'is-leader':''}"><div class="travel-compare-main"><strong>${escapeHtml(result.execution.decision_snapshot?.label||candidate?.label||'Booking workflow')}</strong><small>${result.can_finalize?'All gates complete — ready to finalize.':escapeHtml(result.blockers?.[0]||'Complete final booking checks.')}</small></div><div class="travel-compare-score">${result.checklist_percent}%<small>${result.can_finalize?'FINALIZE':'IN PROGRESS'}</small></div></div>`:(candidate?`<div class="travel-compare-row"><div class="travel-compare-main"><strong>${escapeHtml(candidate.label||candidate.scenario_name||'Top booking candidate')}</strong><small>${escapeHtml(candidate.recommendation||'')}</small></div><div class="travel-compare-score">${Number(candidate.readiness_score||0)}<small>${escapeHtml((candidate.decision||'').replaceAll('_',' ').toUpperCase())}</small></div></div>`:'<div class="command-empty"><span>No BOOK/VERIFY workflow is active. Use Build 16 to create a ready candidate.</span></div>');
    if(!result.started){board.innerHTML='<div class="command-empty"><span>Start the top BOOK or VERIFY recommendation to open final checks.</span></div>';if(start)start.disabled=!candidate||!['book_now','verify_now'].includes(candidate.decision);if(finalize)finalize.disabled=true;return;}
    const q=result.execution.final_quote||{},p=result.execution.purchase||{};
    board.innerHTML=`<div class="travel-compare-row"><div class="travel-compare-main"><strong>Final quote · ${travelMoney(q.total_cost)}</strong><small>${escapeHtml(q.source||'No source')} · ${result.final_quote_verified?'fresh live-backed':'verification required'}</small></div><div class="travel-compare-actions"><button type="button" data-booking-quote="1">Update final quote</button></div></div>${(result.execution.checklist||[]).map(item=>`<div class="travel-compare-row"><div class="travel-compare-main"><strong>${escapeHtml(item.label)}</strong><small>${item.complete?'Complete':'Required before final booking'}</small></div><div class="travel-compare-actions"><button type="button" data-booking-check="${escapeHtml(item.id)}" data-complete="${item.complete?'1':'0'}">${item.complete?'Reopen':'Mark complete'}</button></div></div>`).join('')}<div class="travel-compare-row"><div class="travel-compare-main"><strong>Purchase confirmation</strong><small>${p.confirmation_number?`${escapeHtml(p.provider||'Provider')} · ${escapeHtml(p.confirmation_number)} · ${escapeHtml(p.payment_status)}`:'Confirmation number and payment status still required.'}</small></div><div class="travel-compare-actions"><button type="button" data-booking-purchase="1">Record purchase</button></div></div>`;
    board.querySelector('[data-booking-quote]')?.addEventListener('click',()=>updateBookingQuote(trip.id,q));
    board.querySelectorAll('[data-booking-check]').forEach(btn=>btn.addEventListener('click',()=>updateBookingExecutionUI(trip.id,{checklist_item:{id:btn.dataset.bookingCheck,complete:btn.dataset.complete!=='1'}})));
    board.querySelector('[data-booking-purchase]')?.addEventListener('click',()=>recordBookingPurchase(trip.id,p,q));
    if(start)start.disabled=true;if(finalize)finalize.disabled=!result.can_finalize;
  }catch(error){summary.textContent='Booking execution unavailable';next.innerHTML=`<div class="command-empty"><span>${escapeHtml(error.message)}</span></div>`;board.innerHTML='';}
}
async function updateBookingExecutionUI(tripId,payload){const response=await fetch(`/api/travel/trips/${encodeURIComponent(tripId)}/booking-execution`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),result=await response.json();if(!response.ok)return alert(result.error||'Unable to update booking execution.');await loadTravel();document.getElementById('travel-research-trip').value=tripId;renderTravelResearch();}
async function updateBookingQuote(tripId,current){const total=prompt('Exact final total price?',current.total_cost||'');if(!total)return;const source=prompt('Live provider/site source?',current.source||'')||'';const live=confirm('Is this exact quote from a live source checked right now?');return updateBookingExecutionUI(tripId,{final_quote:{total_cost:total,source,live_data:live,captured_at:new Date().toISOString()}});}
async function recordBookingPurchase(tripId,current,quote){const provider=prompt('Booking provider?',current.provider||quote.source||'')||'';const confirmation=prompt('Confirmation number?',current.confirmation_number||'')||'';if(!confirmation)return;const amount=prompt('Amount paid now?',current.amount_paid||quote.total_cost||0);const paid=confirm('Was the payment fully paid now? Click Cancel if it is scheduled/pending instead.');return updateBookingExecutionUI(tripId,{purchase:{provider,confirmation_number:confirmation,amount_paid:amount,payment_status:paid?'paid':'scheduled',booked_at:new Date().toISOString()}});}
const travelBookingStart=document.getElementById('travel-booking-start');if(travelBookingStart)travelBookingStart.addEventListener('click',async()=>{const trip=selectedTravelTrip();if(!trip)return;const ready=await fetch(`/api/travel/trips/${encodeURIComponent(trip.id)}/readiness`).then(r=>r.json());if(!ready.leader)return alert('No booking candidate is ready.');const response=await fetch(`/api/travel/trips/${encodeURIComponent(trip.id)}/booking-execution/start`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({watch_id:ready.leader.watch_id})}),result=await response.json();if(!response.ok)return alert(result.error||'Unable to start booking workflow.');await loadTravel();document.getElementById('travel-research-trip').value=trip.id;renderTravelResearch();});
const travelBookingFinalize=document.getElementById('travel-booking-finalize');if(travelBookingFinalize)travelBookingFinalize.addEventListener('click',async()=>{const trip=selectedTravelTrip();if(!trip)return;const response=await fetch(`/api/travel/trips/${encodeURIComponent(trip.id)}/booking-execution/finalize`,{method:'POST'}),result=await response.json();if(!response.ok)return alert(result.error||'Booking is not ready to finalize.');await loadTravel();document.getElementById('travel-research-trip').value=trip.id;renderTravelResearch();});
