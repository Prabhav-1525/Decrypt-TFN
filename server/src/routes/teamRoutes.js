import express from "express";
import {
  getTeamStatus,
  reportViolation,
  runCodePreview,
  submitAnswer,
  useLifeline,
  getHintsForTeam,
  revealHint,
  getNotepad,
  saveNotepad
} from "../services/puzzleService.js";
import { getDashboardSnapshot } from "../services/dashboardService.js";
import { readPuzzleAssetForTeam } from "../services/puzzleBankService.js";

export function createTeamRouter(store) {
  const router = express.Router();

  router.get("/status", (req, res) => {
    const teamId = req.user.team_id;
    const status = getTeamStatus(store, teamId);
    return res.json(status);
  });

  router.post("/submit", (req, res) => {
    const teamId = req.user.team_id;
    const { answer, filename, content } = req.body || {};
    const status = getTeamStatus(store, teamId);
    const expectedFileName = status?.puzzle?.expected_file_name;

    const hasTextAnswer = Boolean(answer && `${answer}`.trim());
    const hasFileSubmission = Boolean((filename && `${filename}`.trim() && content !== undefined) || content !== undefined);

    if (!hasTextAnswer && !hasFileSubmission) {
      return res.status(400).json({ message: "Submit either an answer or a file payload." });
    }

    const result = submitAnswer(store, teamId, {
      answer,
      filename: filename || expectedFileName,
      content
    });
    req.io.emit("dashboard:update", getDashboardSnapshot(store));

    if (!result.ok) {
      return res.status(400).json(result);
    }

    return res.json(result);
  });

  router.post("/run-code", (req, res) => {
    const teamId = req.user.team_id;
    const { content } = req.body || {};

    if (content === undefined) {
      return res.status(400).json({ message: "content is required." });
    }

    const result = runCodePreview(store, teamId, content);
    if (!result.ok) {
      return res.status(400).json(result);
    }

    return res.json(result);
  });

  router.get("/asset", (req, res) => {
    const teamId = req.user.team_id;
    const relativePath = `${req.query.path || ""}`;

    if (!relativePath.trim()) {
      return res.status(400).json({ message: "path query parameter is required." });
    }

    const result = readPuzzleAssetForTeam(store, teamId, relativePath);
    if (!result.ok) {
      return res.status(400).json({ message: result.message });
    }

    return res.json(result);
  });

  router.post("/lifeline", (req, res) => {
    const teamId = req.user.team_id;
    const result = useLifeline(store, teamId, 60);
    req.io.emit("dashboard:update", getDashboardSnapshot(store));

    if (!result.ok) {
      return res.status(400).json(result);
    }

    return res.json(result);
  });

  router.post("/violation", (req, res) => {
    const teamId = req.user.team_id;
    const { type, detail } = req.body || {};
    reportViolation(store, teamId, {
      type: type || "unknown",
      detail: detail || ""
    });
    req.io.emit("dashboard:update", getDashboardSnapshot(store));
    return res.json({ ok: true });
  });

  router.get("/hints", (req, res) => {
    const teamId = req.user.team_id;
    const result = getHintsForTeam(store, teamId);
    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.json(result);
  });

  router.post("/hints/reveal", (req, res) => {
    const teamId = req.user.team_id;
    const { hintIndex } = req.body || {};
    const result = revealHint(store, teamId, Number(hintIndex));
    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.json(result);
  });

  router.get("/notepad", (req, res) => {
    const teamId = req.user.team_id;
    const result = getNotepad(store, teamId);
    return res.json(result);
  });

  router.put("/notepad", (req, res) => {
    const teamId = req.user.team_id;
    const { content } = req.body || {};
    const result = saveNotepad(store, teamId, content || "");
    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.json(result);
  });

  return router;
}
