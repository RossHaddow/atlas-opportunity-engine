function buildDailyFocus(queue = [], now = Date.now()) {
  const generated = new Date(now);
  const generatedFor = generated.toISOString().slice(0, 10);
  const source = (Array.isArray(queue) ? queue : [])
    .filter(item => item && item.status !== "Killed")
    .map(item => {
      const state = item.daily_focus_state && item.daily_focus_state.date === generatedFor
        ? item.daily_focus_state
        : null;
      return { ...item, execution_state: state };
    });

  const completedToday = source.filter(item => item.execution_state?.status === "Completed");
  const deferredToday = source.filter(item => item.execution_state?.status === "Deferred");
  const ranked = source
    .filter(item => !["Completed", "Deferred"].includes(item.execution_state?.status))
    .sort((a, b) => Number(b.work_priority_score || 0) - Number(a.work_priority_score || 0) || Number(b.atlas_score || 0) - Number(a.atlas_score || 0));

  const primary = ranked[0] || null;
  const supporting = ranked.slice(1, 3);
  const defer = ranked
    .slice(3)
    .filter(item => Number(item.work_priority_score || 0) < 60 || ["Researching", "Paused"].includes(item.status))
    .slice(0, 3)
    .map(item => ({
      id: item.id,
      name: item.name,
      status: item.status,
      reason: item.status === "Paused"
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
    execution_updated_at: item.execution_state?.updated_at || null
  }) : null;

  const primaryMove = move(primary);
  const supportingMoves = supporting.map(move);
  const urgentCount = ranked.filter(item => Number(item.work_priority_score || 0) >= 85).length;

  return {
    generated_at: generated.toISOString(),
    generated_for: generatedFor,
    mode: "daily-focus",
    capacity_rule: "Finish the primary objective before expanding the work queue; cap the day at three meaningful Atlas moves.",
    headline: primaryMove
      ? `${primaryMove.execution_status === "Blocked" ? "Blocked: " : "Today's highest-leverage move is "}${primaryMove.name}.`
      : completedToday.length || deferredToday.length
        ? "Today's active Atlas plan is clear."
        : "No active Atlas opportunities need focus today.",
    primary_objective: primaryMove,
    supporting_moves: supportingMoves,
    defer,
    completed_today: completedToday.map(move),
    deferred_today: deferredToday.map(move),
    queue_size: ranked.length,
    urgent_count: urgentCount,
    stop_rule: primaryMove
      ? "Do not start lower-ranked Atlas work until the primary objective is completed, blocked, or deliberately deferred."
      : "No Atlas work needs to be forced today."
  };
}

module.exports = { buildDailyFocus };
