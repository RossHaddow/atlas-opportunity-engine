function executionStateFor(item, generatedFor) {
  return item.daily_focus_state && item.daily_focus_state.date === generatedFor ? item.daily_focus_state : null;
}

function executionHistory(item) {
  return Array.isArray(item.daily_focus_history) ? item.daily_focus_history : [];
}

function executionPattern(item) {
  const history = executionHistory(item).slice(-30);
  const counts = history.reduce((result, entry) => {
    const status = String(entry?.status || "");
    if (status === "Completed") result.completed += 1;
    if (status === "Blocked") result.blocked += 1;
    if (status === "Deferred") result.deferred += 1;
    return result;
  }, { completed: 0, blocked: 0, deferred: 0 });
  const friction = counts.blocked + counts.deferred;
  let signal = "Normal";
  if (counts.blocked >= 3) signal = "Recurring blocker";
  else if (counts.deferred >= 3) signal = "Repeatedly deferred";
  else if (friction >= 4) signal = "Execution friction";
  else if (counts.completed >= 5 && friction === 0) signal = "Reliable finisher";
  return { ...counts, samples: history.length, friction, signal };
}

function adaptiveCapacity(queue = []) {
  const patterns = (Array.isArray(queue) ? queue : [])
    .filter(item => item && item.status !== "Killed")
    .map(executionPattern);
  const completed = patterns.reduce((sum, item) => sum + item.completed, 0);
  const blocked = patterns.reduce((sum, item) => sum + item.blocked, 0);
  const deferred = patterns.reduce((sum, item) => sum + item.deferred, 0);
  const friction = blocked + deferred;
  const total = completed + friction;
  const completionRate = total ? Math.round((completed / total) * 100) : null;
  const recurringFriction = patterns.some(item => item.signal === "Recurring blocker" || item.signal === "Repeatedly deferred");

  if (total < 5) return { capacity: 3, confidence: "learning", completion_rate: completionRate, samples: total, reason: "Atlas is keeping the three-move default until it has at least five execution outcomes." };
  if (completionRate < 50 || (recurringFriction && completionRate < 65)) return { capacity: 1, confidence: "adaptive", completion_rate: completionRate, samples: total, reason: "Execution friction is high, so Atlas is protecting focus with one meaningful move today." };
  if (completionRate < 75 || recurringFriction) return { capacity: 2, confidence: "adaptive", completion_rate: completionRate, samples: total, reason: "Execution history supports two meaningful moves without overloading the day." };
  return { capacity: 3, confidence: "adaptive", completion_rate: completionRate, samples: total, reason: "Completion history supports the full three-move daily capacity." };
}

function buildExecutionLearning(queue = []) {
  const patterns = (Array.isArray(queue) ? queue : [])
    .filter(item => item && item.status !== "Killed")
    .map(item => ({ id: item.id, name: item.name, status: item.status, ...executionPattern(item) }));
  const blocked = patterns.filter(item => item.blocked >= 2).sort((a, b) => b.blocked - a.blocked || b.friction - a.friction);
  const deferred = patterns.filter(item => item.deferred >= 2).sort((a, b) => b.deferred - a.deferred || b.friction - a.friction);
  const completed = patterns.reduce((sum, item) => sum + item.completed, 0);
  const friction = patterns.reduce((sum, item) => sum + item.friction, 0);
  const total = completed + friction;
  const capacity = adaptiveCapacity(queue);
  return {
    patterns,
    recurring_blockers: blocked.slice(0, 5),
    repeated_deferrals: deferred.slice(0, 5),
    completion_rate: total ? Math.round((completed / total) * 100) : null,
    adaptive_capacity: capacity,
    recommendation: blocked.length
      ? `Resolve the recurring blocker on ${blocked[0].name} before giving it another priority slot.`
      : deferred.length
        ? `Re-scope or consciously park ${deferred[0].name}; repeated deferral is consuming planning attention.`
        : capacity.reason
  };
}

function buildDailyFocus(queue = [], now = Date.now()) {
  const generated = new Date(now);
  const generatedFor = generated.toISOString().slice(0, 10);
  const source = (Array.isArray(queue) ? queue : [])
    .filter(item => item && item.status !== "Killed")
    .map(item => ({ ...item, execution_state: executionStateFor(item, generatedFor), execution_pattern: executionPattern(item) }));

  const completedToday = source.filter(item => item.execution_state?.status === "Completed");
  const deferredToday = source.filter(item => item.execution_state?.status === "Deferred");
  const ranked = source
    .filter(item => !["Completed", "Deferred"].includes(item.execution_state?.status))
    .sort((a, b) => Number(b.work_priority_score || 0) - Number(a.work_priority_score || 0) || Number(b.atlas_score || 0) - Number(a.atlas_score || 0));

  const capacity = adaptiveCapacity(source);
  const primary = ranked[0] || null;
  const supporting = ranked.slice(1, capacity.capacity);
  const defer = ranked.slice(capacity.capacity).slice(0, 5).map(item => ({
    id: item.id,
    name: item.name,
    status: item.status,
    reason: capacity.capacity < 3
      ? `Held outside today's ${capacity.capacity}-move capacity based on execution history.`
      : item.status === "Paused"
        ? "Paused work should stay parked until its review date unless new evidence changes the case."
        : Number(item.work_priority_score || 0) < 60
          ? "Higher-priority work should be completed first."
          : "Keep this in the queue, but do not let it displace today's top moves."
  }));

  const move = item => item ? ({
    id: item.id,
    name: item.name,
    status: item.status,
    priority_score: Number(item.work_priority_score || 0),
    action: item.recommendation || "Review opportunity",
    reasons: Array.isArray(item.reasons) ? item.reasons.slice(0, 3) : [],
    due_date: item.next_action_date || null,
    health_label: item.health_label || null,
    execution_status: item.execution_state?.status || "Open",
    execution_note: item.execution_state?.note || "",
    execution_updated_at: item.execution_state?.updated_at || null,
    execution_pattern: item.execution_pattern
  }) : null;

  const primaryMove = move(primary);
  const urgentCount = ranked.filter(item => Number(item.work_priority_score || 0) >= 85).length;
  const learning = buildExecutionLearning(source);

  return {
    generated_at: generated.toISOString(),
    generated_for: generatedFor,
    mode: "daily-focus",
    daily_capacity: capacity.capacity,
    capacity_confidence: capacity.confidence,
    capacity_reason: capacity.reason,
    capacity_rule: `Atlas has set today's capacity at ${capacity.capacity} meaningful move${capacity.capacity === 1 ? "" : "s"}. Finish the primary objective before expanding the work queue.`,
    headline: primaryMove ? `${primaryMove.execution_status === "Blocked" ? "Blocked: " : "Today's highest-leverage move is "}${primaryMove.name}.` : completedToday.length || deferredToday.length ? "Today's active Atlas plan is clear." : "No active Atlas opportunities need focus today.",
    primary_objective: primaryMove,
    supporting_moves: supporting.map(move),
    defer,
    completed_today: completedToday.map(move),
    deferred_today: deferredToday.map(move),
    queue_size: ranked.length,
    urgent_count: urgentCount,
    execution_learning: learning,
    stop_rule: primaryMove ? `Do not start work outside today's ${capacity.capacity}-move capacity until the primary objective is completed, blocked, or deliberately deferred.` : "No Atlas work needs to be forced today."
  };
}

module.exports = { buildDailyFocus, buildExecutionLearning, executionPattern, adaptiveCapacity };
