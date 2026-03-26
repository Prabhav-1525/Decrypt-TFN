import { randomUUID } from "node:crypto";
import { getRemainingSeconds, nowIso } from "../utils/time.js";
import { DEFAULT_HINT_PENALTIES, getPuzzleHints, getToolConfigForPuzzle } from "../config/toolConfig.js";
import { evaluateSubmissionOutput, executeSubmissionPreview } from "./executionService.js";

const VIOLATION_THRESHOLD = 3;
const VIOLATION_LOCK_SECONDS = 300;

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

function getViolationProfile(db, teamId) {
  if (!Array.isArray(db.violations)) {
    db.violations = [];
  }
  let profile = db.violations.find((v) => v.team_id === teamId);
  if (!profile) {
    profile = {
      team_id: teamId,
      count: 0,
      last_violation_at: null,
      last_penalty_at: null,
      suspended_until: null
    };
    db.violations.push(profile);
  }
  return profile;
}

function getRemainingSecondsForAssignment(assignment) {
  if (!assignment) {
    return 0;
  }
  if (assignment.status === "paused") {
    return Math.max(assignment.paused_remaining_sec || 0, 0);
  }
  return getRemainingSeconds(assignment.start_time, assignment.time_limit_sec);
}

export function normalizeAssignments(store) {
  const db = store.read();
  const updates = [];

  for (const assignment of db.assignments) {
    if (assignment.status !== "active") {
      continue;
    }
    const remaining = getRemainingSecondsForAssignment(assignment);
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
    .filter((a) => a.team_id === teamId && (a.status === "solved" || a.status === "expired" || a.status === "skipped" || a.status === "forfeited"))
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

  const violationProfile = getViolationProfile(db, teamId);
  if (violationProfile?.suspended_until && new Date(violationProfile.suspended_until).getTime() > Date.now()) {
    return null;
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
  const violationProfile = getViolationProfile(db, teamId);
  const suspended =
    violationProfile?.suspended_until &&
    new Date(violationProfile.suspended_until).getTime() > Date.now();
  const active = getActiveAssignment(db, teamId);
  const assignment = active || assignNextPuzzle(store, teamId);

  if (!assignment) {
    if (suspended) {
      return {
        completed: false,
        suspended: true,
        suspended_until: violationProfile.suspended_until
      };
    }
    return { completed: true };
  }

  const latestDb = store.read();
  const puzzle = latestDb.puzzles.find((p) => p.puzzle_id === assignment.puzzle_id);
  const lifeline = latestDb.lifelines.find((l) => l.team_id === teamId);

  const toolConfig = getToolConfigForPuzzle(puzzle || {});
  const hints = getPuzzleHints(puzzle || {});

  return {
    completed: false,
    assignment,
    puzzle: {
      puzzle_id: puzzle?.puzzle_id || assignment.puzzle_id,
      puzzle_text: puzzle?.puzzle_text || "",
      points: puzzle?.points,
      submission_mode: puzzle?.submission_mode || "text",
      validation_mode: puzzle?.validation_mode || "content",
      expected_file_name: puzzle?.expected_file_name || null,
      asset_files: [],
      puzzle_type: puzzle?.puzzle_type || null,
      toolConfig,
      hints,
      hint_penalties: puzzle?.hint_penalties || DEFAULT_HINT_PENALTIES
    },
    remaining_seconds: getRemainingSecondsForAssignment(assignment),
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
  const violationProfile = getViolationProfile(db, teamId);
  const activePuzzleId = payload?.assignment?.puzzle_id;
  const hintState = activePuzzleId ? getHintState(db, teamId, activePuzzleId) : null;

  const progressTiles = db.puzzles.map((puzzle) => {
    const assignment = db.assignments.find((a) => a.team_id === teamId && a.puzzle_id === puzzle.puzzle_id);
    let status = "pending";
    if (assignment?.status === "solved") status = "solved";
    else if (assignment?.status === "active") status = "active";
    else if (assignment?.status === "expired") status = "expired";
    else if (assignment?.status === "forfeited") status = "forfeited";
    else if (assignment?.status === "skipped") status = "skipped";
    return {
      puzzle_id: puzzle.puzzle_id,
      title: puzzle.title || puzzle.puzzle_id,
      status,
      puzzle_type: puzzle.puzzle_type || null
    };
  });

  return {
    ...payload,
    stats: {
      solved_count: solvedCount,
      attempts
    },
    progress_tiles: progressTiles,
    violation_profile: violationProfile,
    hints_revealed: hintState?.revealed || []
  };
}

function getHintState(db, teamId, puzzleId) {
  if (!Array.isArray(db.hint_reveals)) {
    db.hint_reveals = [];
  }
  let state = db.hint_reveals.find((h) => h.team_id === teamId && h.puzzle_id === puzzleId);
  if (!state) {
    state = {
      team_id: teamId,
      puzzle_id: puzzleId,
      revealed: []
    };
    db.hint_reveals.push(state);
  }
  return state;
}

export function getHintsForTeam(store, teamId) {
  normalizeAssignments(store);
  const db = store.read();
  const assignment = getActiveAssignment(db, teamId);
  if (!assignment) {
    return { ok: false, message: "No active puzzle." };
  }

  const puzzle = db.puzzles.find((p) => p.puzzle_id === assignment.puzzle_id);
  const hints = getPuzzleHints(puzzle);
  const state = getHintState(db, teamId, assignment.puzzle_id);
  return {
    ok: true,
    hints,
    revealed: state.revealed,
    penalties: puzzle.hint_penalties || DEFAULT_HINT_PENALTIES
  };
}

export function revealHint(store, teamId, hintIndex) {
  normalizeAssignments(store);
  const db = store.read();
  const assignment = getActiveAssignment(db, teamId);
  if (!assignment) {
    return { ok: false, message: "No active puzzle." };
  }

  const puzzle = db.puzzles.find((p) => p.puzzle_id === assignment.puzzle_id);
  const hints = getPuzzleHints(puzzle);
  if (hintIndex < 0 || hintIndex >= hints.length) {
    return { ok: false, message: "Invalid hint index." };
  }

  let appliedPenalty = 0;
  let hintText = hints[hintIndex];

  store.write((data) => {
    const state = getHintState(data, teamId, assignment.puzzle_id);
    if (state.revealed.includes(hintIndex)) {
      hintText = hints[hintIndex];
      return;
    }

    state.revealed.push(hintIndex);
    const penalties = puzzle.hint_penalties || DEFAULT_HINT_PENALTIES;
    appliedPenalty = penalties[hintIndex] || 0;

    if (appliedPenalty > 0) {
      // Shift start time earlier to reduce remaining time.
      const startMs = new Date(assignment.start_time).getTime();
      assignment.start_time = new Date(startMs - appliedPenalty * 1000).toISOString();
    }

    data.events.push({
      event_id: randomUUID(),
      timestamp: nowIso(),
      team_id: teamId,
      type: "hint_revealed",
      details: { puzzle_id: assignment.puzzle_id, hint_index: hintIndex, penalty_seconds: appliedPenalty }
    });
  });

  return {
    ok: true,
    hint: hintText,
    penalty_seconds: appliedPenalty
  };
}

export function getNotepad(store, teamId) {
  const db = store.read();
  const note = db.notepads?.find((n) => n.team_id === teamId);
  return {
    ok: true,
    content: note?.content || "",
    updated_at: note?.updated_at || null
  };
}

export function saveNotepad(store, teamId, content) {
  const normalized = `${content || ""}`;
  store.write((db) => {
    if (!Array.isArray(db.notepads)) {
      db.notepads = [];
    }
    let note = db.notepads.find((n) => n.team_id === teamId);
    if (!note) {
      note = { team_id: teamId, content: "", updated_at: null };
      db.notepads.push(note);
    }
    note.content = normalized;
    note.updated_at = nowIso();
  });
  return { ok: true };
}

function applyViolationPenalty(store, teamId) {
  normalizeAssignments(store);
  let forfeited = false;
  store.write((db) => {
    const profile = getViolationProfile(db, teamId);
    profile.count = 0;
    profile.last_penalty_at = nowIso();
    profile.suspended_until = new Date(Date.now() + VIOLATION_LOCK_SECONDS * 1000).toISOString();

    const assignment = db.assignments.find((a) => a.team_id === teamId && (a.status === "active" || a.status === "paused"));
    if (assignment) {
      assignment.status = "forfeited";
      assignment.ended_at = nowIso();
      forfeited = true;
      db.events.push({
        event_id: randomUUID(),
        timestamp: nowIso(),
        team_id: teamId,
        type: "puzzle_forfeited_due_to_violation",
        details: { puzzle_id: assignment.puzzle_id }
      });
    }
  });

  if (forfeited) {
    assignNextPuzzle(store, teamId);
  }
}

export function reportViolation(store, teamId, violation) {
  const now = nowIso();
  let thresholdReached = false;
  store.write((db) => {
    const profile = getViolationProfile(db, teamId);
    profile.count += 1;
    profile.last_violation_at = now;
    if (profile.count >= VIOLATION_THRESHOLD) {
      thresholdReached = true;
    }
  });

  logEvent(store, "anti_cheat_violation", teamId, { ...violation, threshold: VIOLATION_THRESHOLD });

  if (thresholdReached) {
    applyViolationPenalty(store, teamId);
  }
}

export function skipCurrentPuzzle(store, teamId, actorId = null) {
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
      details: { puzzle_id: current.puzzle_id, performed_by: actorId }
    });
  });

  if (!skippedPuzzleId) {
    return { ok: false, message: "No active puzzle to skip." };
  }

  assignNextPuzzle(store, teamId);
  return { ok: true, message: `Puzzle ${skippedPuzzleId} skipped and next assigned.` };
}

export function adjustTimer(store, teamId, newRemainingSeconds, actorId = null) {
  normalizeAssignments(store);
  let adjusted = false;

  store.write((db) => {
    const current = db.assignments.find((a) => a.team_id === teamId && (a.status === "active" || a.status === "paused"));
    if (!current) {
      return;
    }

    const now = Date.now();
    const allowedMs = current.time_limit_sec * 1000;
    const startMs = now - (allowedMs - newRemainingSeconds * 1000);
    current.start_time = new Date(startMs).toISOString();
    current.status = "active";
    delete current.paused_remaining_sec;
    delete current.paused_at;
    adjusted = true;

    db.events.push({
      event_id: randomUUID(),
      timestamp: nowIso(),
      team_id: teamId,
      type: "timer_adjusted_by_admin",
      details: { remaining_seconds: newRemainingSeconds, performed_by: actorId }
    });
  });

  if (!adjusted) {
    return { ok: false, message: "No active puzzle for this team." };
  }

  return { ok: true, message: "Timer adjusted successfully." };
}

export function pauseTimer(store, teamId, actorId = null) {
  normalizeAssignments(store);
  let paused = false;
  store.write((db) => {
    const current = db.assignments.find((a) => a.team_id === teamId && a.status === "active");
    if (!current) {
      return;
    }
    const remaining = getRemainingSecondsForAssignment(current);
    current.status = "paused";
    current.paused_remaining_sec = remaining;
    current.paused_at = nowIso();
    paused = true;
    db.events.push({
      event_id: randomUUID(),
      timestamp: nowIso(),
      team_id: teamId,
      type: "timer_paused_by_admin",
      details: { remaining_seconds: remaining, performed_by: actorId }
    });
  });

  if (!paused) {
    return { ok: false, message: "No active puzzle for this team." };
  }
  return { ok: true, message: "Timer paused." };
}

export function resumeTimer(store, teamId, actorId = null) {
  normalizeAssignments(store);
  let resumed = false;
  store.write((db) => {
    const current = db.assignments.find((a) => a.team_id === teamId && a.status === "paused");
    if (!current) {
      return;
    }
    const remaining = getRemainingSecondsForAssignment(current);
    const now = Date.now();
    const allowedMs = current.time_limit_sec * 1000;
    const startMs = now - (allowedMs - remaining * 1000);
    current.start_time = new Date(startMs).toISOString();
    current.status = "active";
    delete current.paused_remaining_sec;
    delete current.paused_at;
    resumed = true;
    db.events.push({
      event_id: randomUUID(),
      timestamp: nowIso(),
      team_id: teamId,
      type: "timer_resumed_by_admin",
      details: { remaining_seconds: remaining, performed_by: actorId }
    });
  });

  if (!resumed) {
    return { ok: false, message: "No paused puzzle for this team." };
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
