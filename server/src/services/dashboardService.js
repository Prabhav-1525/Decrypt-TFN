import { getAssignmentRemainingSeconds, normalizeAssignments } from "./puzzleService.js";

export function getDashboardSnapshot(store) {
  normalizeAssignments(store);
  const db = store.read();

  const teams = db.teams
    .filter((team) => !team.is_admin)
    .map((team) => {
      const activeAssignment = db.assignments.find((a) => a.team_id === team.team_id && a.status === "active") || null;
      const activePuzzle = activeAssignment
        ? db.puzzles.find((p) => p.puzzle_id === activeAssignment.puzzle_id) || null
        : null;

      const lifeline = db.lifelines.find((l) => l.team_id === team.team_id);
      const solved = db.assignments.filter((a) => a.team_id === team.team_id && a.status === "solved");
      const attempts = db.submissions.filter((s) => s.team_id === team.team_id);

      return {
        team_id: team.team_id,
        team_name: team.team_name,
        active_puzzle_id: activePuzzle ? activePuzzle.puzzle_id : null,
        active_puzzle_text: activePuzzle ? activePuzzle.puzzle_text : null,
        remaining_seconds: activeAssignment ? getAssignmentRemainingSeconds(activeAssignment) : 0,
        is_timer_paused: activeAssignment?.paused || false,
        attempts: attempts.length,
        solved_count: solved.length,
        score: solved.reduce((sum, assignment) => {
          const puzzle = db.puzzles.find((p) => p.puzzle_id === assignment.puzzle_id);
          return sum + (puzzle?.points || 0);
        }, 0),
        lifeline_remaining: lifeline?.lifeline_remaining ?? 0,
        lifeline_used: lifeline?.lifeline_used ?? 0
      };
    });

  const leaderboard = [...teams].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (b.solved_count !== a.solved_count) {
      return b.solved_count - a.solved_count;
    }
    return a.attempts - b.attempts;
  });

  return {
    updated_at: new Date().toISOString(),
    teams,
    leaderboard,
    recent_events: db.events.slice(-25).reverse()
  };
}
