import { randomUUID } from "node:crypto";
import { getRemainingSeconds, nowIso } from "../utils/time.js";
import { evaluateSubmissionOutput, executeSubmissionPreview } from "./executionService.js";

function normalizeAnswer(answer) {
  return `${answer || ""}`.trim().toLowerCase();
}

function normalizeContent(value) {
  return `${value || ""}`.replace(/\r\n/g, "\n").trim();
}

function shuffleArray(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function getAssignmentRemainingSeconds(assignment) {
  if (!assignment) {
    return 0;
  }
  if (assignment.paused) {
    return Math.max(assignment.paused_remaining_sec ?? 0, 0);
  }
  return getRemainingSeconds(assignment.start_time, assignment.time_limit_sec);
}

function setAssignmentRemainingSeconds(assignment, newRemainingSeconds) {
  const sanitized = Math.max(Number(newRemainingSeconds) || 0, 0);
  if (assignment.paused) {
    assignment.paused_remaining_sec = sanitized;
    return;
  }

  const now = Date.now();
  const allowedMs = assignment.time_limit_sec * 1000;
  const startMs = now - (allowedMs - sanitized * 1000);
  assignment.start_time = new Date(startMs).toISOString();
}

export function logEvent(store, type, teamId, details = {}) {
  store.write((db) => {
    db.events.push({
      event_id: randomUUID(),
      timestamp: nowIso(),
      team_id: teamId,
      type,
      details
    });
  });
}

export function normalizeAssignments(store) {
  const db = store.read();
  const updates = [];

  for (const assignment of db.assignments) {
    if (assignment.paused === undefined) {
      assignment.paused = false;
      assignment.paused_remaining_sec = null;
      assignment.pause_started_at = null;
    }
    if (assignment.status !== "active" || assignment.paused) {
      continue;
    }
    const remaining = getAssignmentRemainingSeconds(assignment);
    if (remaining <= 0) {
      assignment.status = "expired";
      assignment.ended_at = nowIso();
      updates.push(assignment.team_id);
      db.events.push({
        event_id: randomUUID(),
        timestamp: nowIso(),
        team_id: assignment.team_id,
        type: "puzzle_expired",
        details: { puzzle_id: assignment.puzzle_id }
      });
    }
  }

  if (updates.length > 0) {
    store.persist();
  }

  return updates;
}

function getSolvedPuzzleIds(db, teamId) {
  return db.assignments
    .filter((a) => a.team_id === teamId && (a.status === "solved" || a.status === "expired" || a.status === "skipped"))
    .map((a) => a.puzzle_id);
}

function getActiveAssignment(db, teamId) {
  return db.assignments.find((a) => a.team_id === teamId && a.status === "active") || null;
}

export function assignNextPuzzle(store, teamId) {
  let db = store.read();
  const active = getActiveAssignment(db, teamId);
  if (active) {
    return active;
  }

  const triviaPuzzleIds = db.puzzles.filter((p) => `${p.puzzle_id || ""}`.startsWith("TRIVIA_")).map((p) => p.puzzle_id);
  if (triviaPuzzleIds.length > 0) {
    if (!Array.isArray(db.team_question_sets)) {
      store.write((data) => {
        data.team_question_sets = [];
      });
      db = store.read();
    }

    let teamQuestionSet = db.team_question_sets.find((set) => set.team_id === teamId) || null;
    if (!teamQuestionSet) {
      const selectedIds = shuffleArray(triviaPuzzleIds).slice(0, Math.min(3, triviaPuzzleIds.length));
      store.write((data) => {
        data.team_question_sets.push({
          team_id: teamId,
          puzzle_ids: selectedIds
        });
      });
      db = store.read();
      teamQuestionSet = db.team_question_sets.find((set) => set.team_id === teamId) || null;
    }
  }

  const unavailable = new Set(getSolvedPuzzleIds(db, teamId));
  const teamQuestionSet = Array.isArray(db.team_question_sets)
    ? db.team_question_sets.find((set) => set.team_id === teamId)
    : null;

  let available = db.puzzles.filter((p) => !unavailable.has(p.puzzle_id));
  if (teamQuestionSet?.puzzle_ids?.length) {
    const allowedIds = new Set(teamQuestionSet.puzzle_ids);
    available = available.filter((p) => allowedIds.has(p.puzzle_id));
  }

  if (available.length === 0) {
    return null;
  }

  const shuffled = [...available].sort(() => Math.random() - 0.5);
  const selected = shuffled[0];

  const assignment = {
    paused: false,
    paused_remaining_sec: null,
    pause_started_at: null,
    team_id: teamId,
    puzzle_id: selected.puzzle_id,
    start_time: nowIso(),
    time_limit_sec: selected.time_limit_sec,
    status: "active",
    ended_at: null
  };

  store.write((data) => {
    data.assignments.push(assignment);
    data.events.push({
      event_id: randomUUID(),
      timestamp: nowIso(),
      team_id: teamId,
      type: "puzzle_assigned",
      details: { puzzle_id: selected.puzzle_id }
    });
  });

  return assignment;
}

export function getCurrentPuzzleForTeam(store, teamId) {
  normalizeAssignments(store);
  const db = store.read();
  const active = getActiveAssignment(db, teamId);
  const assignment = active || assignNextPuzzle(store, teamId);

  if (!assignment) {
    return { completed: true };
  }

  const latestDb = store.read();
  const puzzle = latestDb.puzzles.find((p) => p.puzzle_id === assignment.puzzle_id);
  const lifeline = latestDb.lifelines.find((l) => l.team_id === teamId);

  return {
    completed: false,
    assignment,
    puzzle: {
      puzzle_id: puzzle.puzzle_id,
      puzzle_text: puzzle.puzzle_text,
      points: puzzle.points,
        submission_mode: puzzle.submission_mode || "text",
        validation_mode: puzzle.validation_mode || "content",
        expected_file_name: puzzle.expected_file_name || null,
        asset_files: []
      },
      remaining_seconds: getAssignmentRemainingSeconds(assignment),
      is_timer_paused: assignment.paused,
      paused_remaining_seconds: assignment.paused ? assignment.paused_remaining_sec : null,
      lifeline
    };
  }

export function submitAnswer(store, teamId, submissionPayload) {
  normalizeAssignments(store);
  const db = store.read();
  const assignment = getActiveAssignment(db, teamId);

  if (!assignment) {
    return { ok: false, message: "No active puzzle or puzzle time has expired." };
  }

  const puzzle = db.puzzles.find((p) => p.puzzle_id === assignment.puzzle_id);
  const answerSubmitted = submissionPayload?.answer || "";
  const submittedFilename = submissionPayload?.filename || "";
  const submittedContent = submissionPayload?.content || "";

  let isCorrect = false;

  if ((puzzle.submission_mode || "text") === "file") {
    if ((puzzle.validation_mode || "content") === "output") {
      const executionResult = evaluateSubmissionOutput({
        sourceRoot: puzzle.source_root,
        sourceFolder: puzzle.source_folder,
        expectedFileName: puzzle.expected_file_name,
        submittedFilename,
        submittedContent,
        expectedOutput: puzzle.expected_output
      });

      isCorrect = executionResult.ok;
    } else {
      const expectedName = `${puzzle.expected_file_name || ""}`.trim().toLowerCase();
      const normalizedSubmittedFilename = `${submittedFilename}`.trim().toLowerCase();
      const filenameMatches = !expectedName || expectedName === normalizedSubmittedFilename;
      const contentMatches = normalizeContent(submittedContent) === normalizeContent(puzzle.correct_answer);
      isCorrect = filenameMatches && contentMatches;
    }
  } else {
    isCorrect = normalizeAnswer(answerSubmitted) === normalizeAnswer(puzzle.correct_answer);
  }

  const storedSubmission =
    (puzzle.submission_mode || "text") === "file"
      ? JSON.stringify({
          filename: submittedFilename,
          content: submittedContent
        })
      : answerSubmitted;

  store.write((data) => {
    data.submissions.push({
      team_id: teamId,
      puzzle_id: assignment.puzzle_id,
      answer_submitted: storedSubmission,
      timestamp: nowIso(),
      result: isCorrect ? "correct" : "incorrect"
    });

    if (isCorrect) {
      const ref = data.assignments.find(
        (a) => a.team_id === teamId && a.puzzle_id === assignment.puzzle_id && a.status === "active"
      );
      if (ref) {
        ref.status = "solved";
        ref.ended_at = nowIso();
      }
    }

    data.events.push({
      event_id: randomUUID(),
      timestamp: nowIso(),
      team_id: teamId,
      type: "answer_submitted",
      details: {
        puzzle_id: assignment.puzzle_id,
        result: isCorrect ? "correct" : "incorrect"
      }
    });
  });

  if (!isCorrect) {
    if ((puzzle.submission_mode || "text") === "file") {
      return { ok: true, correct: false, message: "Incorrect file submission. Verify filename and content." };
    }
    return { ok: true, correct: false, message: "Incorrect answer. Please try again." };
  }

  const next = assignNextPuzzle(store, teamId);
  return {
    ok: true,
    correct: true,
    message: "Correct answer! Next puzzle assigned.",
    next_assigned: !!next
  };
}

export function useLifeline(store, teamId, durationSeconds = 60) {
  normalizeAssignments(store);

  let result = { ok: false, message: "Unable to activate lifeline." };

  store.write((db) => {
    const lifeline = db.lifelines.find((l) => l.team_id === teamId);
    if (!lifeline) {
      result = { ok: false, message: "Team lifeline profile missing." };
      return;
    }

    const now = Date.now();
    const unlockEndsAtMs = lifeline.active_unlock_until ? new Date(lifeline.active_unlock_until).getTime() : 0;

    if (unlockEndsAtMs > now) {
      result = {
        ok: false,
        message: "Lifeline is already active.",
        active_until: lifeline.active_unlock_until
      };
      return;
    }

    if (lifeline.lifeline_remaining <= 0) {
      result = { ok: false, message: "No lifelines remaining." };
      return;
    }

    lifeline.lifeline_remaining -= 1;
    lifeline.lifeline_used += 1;
    lifeline.active_unlock_until = new Date(now + durationSeconds * 1000).toISOString();

    db.events.push({
      event_id: randomUUID(),
      timestamp: nowIso(),
      team_id: teamId,
      type: "lifeline_used",
      details: { duration_seconds: durationSeconds }
    });

    result = {
      ok: true,
      message: "Lifeline activated.",
      active_until: lifeline.active_unlock_until,
      lifeline_remaining: lifeline.lifeline_remaining
    };
  });

  return result;
}

export function getTeamStatus(store, teamId) {
  const payload = getCurrentPuzzleForTeam(store, teamId);
  const db = store.read();
  const solvedCount = db.assignments.filter((a) => a.team_id === teamId && a.status === "solved").length;
  const attempts = db.submissions.filter((s) => s.team_id === teamId).length;

  return {
    ...payload,
    stats: {
      solved_count: solvedCount,
      attempts
    }
  };
}

function applyAntiCheatPolicy(store, teamId) {
  const db = store.read();
  const nowMs = Date.now();
  const windowMs = 10 * 60 * 1000;
  const recent = db.events.filter(
    (event) =>
      event.team_id === teamId &&
      event.type === "anti_cheat_violation" &&
      new Date(event.timestamp).getTime() >= nowMs - windowMs
  );

  const violationCount = recent.length;
  if (violationCount < 3) {
    return { penaltyApplied: false, violationCount };
  }

  const active = db.assignments.find((a) => a.team_id === teamId && a.status === "active");
  if (!active) {
    return { penaltyApplied: false, violationCount };
  }

  if (violationCount >= 5) {
    const result = skipCurrentPuzzle(store, teamId, {
      performed_by: "system",
      reason: "anti_cheat_penalty"
    });
    return { penaltyApplied: true, action: "skipped", violationCount, detail: result?.message };
  }

  const currentRemaining = getAssignmentRemainingSeconds(active);
  const penaltySeconds = Math.min(30 * (violationCount - 2), currentRemaining);
  setAssignmentRemainingSeconds(active, currentRemaining - penaltySeconds);
  store.write((data) => {
    const ref = data.assignments.find((a) => a.team_id === teamId && a.status === "active");
    if (ref) {
      ref.paused_remaining_sec = ref.paused ? getAssignmentRemainingSeconds(ref) : null;
    }
    data.events.push({
      event_id: randomUUID(),
      timestamp: nowIso(),
      team_id: teamId,
      type: "anti_cheat_penalty",
      details: {
        penalty_seconds: penaltySeconds,
        violation_count_window: violationCount
      }
    });
  });

  return { penaltyApplied: penaltySeconds > 0, action: "time_reduced", violationCount, penaltySeconds };
}

export function reportViolation(store, teamId, violation) {
  logEvent(store, "anti_cheat_violation", teamId, violation);
  return applyAntiCheatPolicy(store, teamId);
}

export function skipCurrentPuzzle(store, teamId, actor = null) {
  normalizeAssignments(store);

  let skippedPuzzleId = null;

  store.write((db) => {
    const current = db.assignments.find((a) => a.team_id === teamId && a.status === "active");
    if (!current) {
      return;
    }
    current.status = "skipped";
    current.ended_at = nowIso();
    skippedPuzzleId = current.puzzle_id;

    db.events.push({
      event_id: randomUUID(),
      timestamp: nowIso(),
      team_id: teamId,
      type: "puzzle_skipped_by_admin",
      details: {
        puzzle_id: current.puzzle_id,
        performed_by: actor?.team_id || null,
        reason: actor?.reason || "manual"
      }
    });
  });

  if (!skippedPuzzleId) {
    return { ok: false, message: "No active puzzle to skip." };
  }

  assignNextPuzzle(store, teamId);
  return { ok: true, message: `Puzzle ${skippedPuzzleId} skipped and next assigned.` };
}

export function adjustTimer(store, teamId, newRemainingSeconds, actor = null) {
  normalizeAssignments(store);
  let adjusted = false;

  store.write((db) => {
    const current = db.assignments.find((a) => a.team_id === teamId && a.status === "active");
    if (!current) {
      return;
    }

    setAssignmentRemainingSeconds(current, newRemainingSeconds);
    adjusted = true;

    db.events.push({
      event_id: randomUUID(),
      timestamp: nowIso(),
      team_id: teamId,
      type: "timer_adjusted_by_admin",
      details: {
        remaining_seconds: newRemainingSeconds,
        performed_by: actor?.team_id || null
      }
    });
  });

  if (!adjusted) {
    return { ok: false, message: "No active puzzle for this team." };
  }

  return { ok: true, message: "Timer adjusted successfully." };
}

export function pauseTimer(store, teamId, actor) {
  normalizeAssignments(store);
  let paused = false;
  store.write((db) => {
    const current = db.assignments.find((a) => a.team_id === teamId && a.status === "active");
    if (!current) {
      return;
    }
    current.paused = true;
    current.paused_remaining_sec = getAssignmentRemainingSeconds(current);
    current.pause_started_at = nowIso();
    paused = true;

    db.events.push({
      event_id: randomUUID(),
      timestamp: nowIso(),
      team_id: teamId,
      type: "timer_paused_by_admin",
      details: {
        remaining_seconds: current.paused_remaining_sec,
        performed_by: actor?.team_id || null
      }
    });
  });

  if (!paused) {
    return { ok: false, message: "No active puzzle for this team." };
  }

  return { ok: true, message: "Timer paused." };
}

export function resumeTimer(store, teamId, actor) {
  normalizeAssignments(store);
  let resumed = false;
  store.write((db) => {
    const current = db.assignments.find((a) => a.team_id === teamId && a.status === "active");
    if (!current || !current.paused) {
      return;
    }
    const remaining = getAssignmentRemainingSeconds(current);
    current.paused = false;
    current.paused_remaining_sec = null;
    current.pause_started_at = null;
    setAssignmentRemainingSeconds(current, remaining);
    resumed = true;

    db.events.push({
      event_id: randomUUID(),
      timestamp: nowIso(),
      team_id: teamId,
      type: "timer_resumed_by_admin",
      details: {
        remaining_seconds: remaining,
        performed_by: actor?.team_id || null
      }
    });
  });

  if (!resumed) {
    return { ok: false, message: "No paused timer for this team." };
  }

  return { ok: true, message: "Timer resumed." };
}

export function runCodePreview(store, teamId, content) {
  normalizeAssignments(store);
  const db = store.read();
  const assignment = db.assignments.find((a) => a.team_id === teamId && a.status === "active");

  if (!assignment) {
    return { ok: false, message: "No active puzzle or puzzle time has expired." };
  }

  const puzzle = db.puzzles.find((p) => p.puzzle_id === assignment.puzzle_id);
  if (!puzzle || (puzzle.submission_mode || "text") !== "file") {
    return { ok: false, message: "Code preview is only available for file-mode puzzles." };
  }

  return executeSubmissionPreview({
    sourceRoot: puzzle.source_root,
    sourceFolder: puzzle.source_folder,
    expectedFileName: puzzle.expected_file_name,
    submittedFilename: puzzle.expected_file_name,
    submittedContent: content
  });
}
