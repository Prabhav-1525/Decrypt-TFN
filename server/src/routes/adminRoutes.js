import express from "express";
import { getDashboardSnapshot } from "../services/dashboardService.js";
import { adjustTimer, pauseTimer, resumeTimer, skipCurrentPuzzle } from "../services/puzzleService.js";
import { getDefaultPuzzleBankDir, syncPuzzlesFromFolder } from "../services/puzzleBankService.js";

export function createAdminRouter(store) {
  const router = express.Router();

  router.get("/config", (_req, res) => {
    return res.json({
      puzzle_bank_default_path: getDefaultPuzzleBankDir(),
      storage: "sqlite"
    });
  });

  router.get("/overview", (_req, res) => {
    return res.json(getDashboardSnapshot(store));
  });

  router.get("/leaderboard", (_req, res) => {
    const snapshot = getDashboardSnapshot(store);
    return res.json({
      updated_at: snapshot.updated_at,
      leaderboard: snapshot.leaderboard
    });
  });

  router.post("/team/:teamId/skip", (req, res) => {
    const { teamId } = req.params;
    const result = skipCurrentPuzzle(store, teamId, { team_id: req.user?.team_id });
    req.io.emit("dashboard:update", getDashboardSnapshot(store));

    if (!result.ok) {
      return res.status(400).json(result);
    }

    return res.json(result);
  });

  router.post("/team/:teamId/timer", (req, res) => {
    const { teamId } = req.params;
    const { remainingSeconds } = req.body || {};

    if (typeof remainingSeconds !== "number" || remainingSeconds < 0) {
      return res.status(400).json({ message: "remainingSeconds must be a non-negative number." });
    }

    const result = adjustTimer(store, teamId, remainingSeconds, { team_id: req.user?.team_id });
    req.io.emit("dashboard:update", getDashboardSnapshot(store));

    if (!result.ok) {
      return res.status(400).json(result);
    }

    return res.json(result);
  });

  router.post("/team/:teamId/pause", (req, res) => {
    const { teamId } = req.params;
    const result = pauseTimer(store, teamId, { team_id: req.user?.team_id });
    req.io.emit("dashboard:update", getDashboardSnapshot(store));

    if (!result.ok) {
      return res.status(400).json(result);
    }

    return res.json(result);
  });

  router.post("/team/:teamId/resume", (req, res) => {
    const { teamId } = req.params;
    const result = resumeTimer(store, teamId, { team_id: req.user?.team_id });
    req.io.emit("dashboard:update", getDashboardSnapshot(store));

    if (!result.ok) {
      return res.status(400).json(result);
    }

    return res.json(result);
  });

  router.get("/team/:teamId/detail", (req, res) => {
    const { teamId } = req.params;
    const db = store.read();
    const team = db.teams.find((t) => t.team_id === teamId && !t.is_admin);

    if (!team) {
      return res.status(404).json({ message: "Team not found." });
    }

    const assignments = db.assignments
      .filter((a) => a.team_id === teamId)
      .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
      .slice(0, 15);
    const submissions = db.submissions
      .filter((s) => s.team_id === teamId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 25);
    const events = db.events
      .filter((e) => e.team_id === teamId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 50);
    const lifeline = db.lifelines.find((l) => l.team_id === teamId) || null;

    return res.json({
      team: {
        team_id: team.team_id,
        team_name: team.team_name
      },
      lifeline,
      assignments,
      submissions,
      events
    });
  });

  router.post("/bulk", (req, res) => {
    const { teamIds, action, remainingSeconds } = req.body || {};
    if (!Array.isArray(teamIds) || teamIds.length === 0) {
      return res.status(400).json({ message: "teamIds must be a non-empty array." });
    }

    const results = [];
    for (const teamId of teamIds) {
      let result = { ok: false, message: "Unsupported action." };
      if (action === "skip") {
        result = skipCurrentPuzzle(store, teamId, { team_id: req.user?.team_id, reason: "bulk" });
      } else if (action === "pause") {
        result = pauseTimer(store, teamId, { team_id: req.user?.team_id });
      } else if (action === "resume") {
        result = resumeTimer(store, teamId, { team_id: req.user?.team_id });
      } else if (action === "timer") {
        result = adjustTimer(store, teamId, Number(remainingSeconds) || 0, { team_id: req.user?.team_id });
      }
      results.push({ teamId, ...result });
    }

    req.io.emit("dashboard:update", getDashboardSnapshot(store));
    return res.json({ ok: true, results });
  });

  router.post("/sync-puzzle-bank", (req, res) => {
    const { folderPath, replaceExistingFromSource, replaceAllPuzzles } = req.body || {};

    const result = syncPuzzlesFromFolder(store, `${folderPath || ""}`.trim() || getDefaultPuzzleBankDir(), {
      replaceExistingFromSource: Boolean(replaceExistingFromSource),
      replaceAllPuzzles: Boolean(replaceAllPuzzles)
    });

    if (!result.ok) {
      return res.status(400).json(result);
    }

    req.io.emit("dashboard:update", getDashboardSnapshot(store));
    return res.json(result);
  });

  return router;
}
