import express from "express";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { signToken } from "../middleware/auth.js";
import { authenticateToken } from "../middleware/auth.js";
import { nowIso } from "../utils/time.js";
import { getDashboardSnapshot } from "../services/dashboardService.js";
import { logEvent } from "../services/puzzleService.js";

export function createAuthRouter(store) {
  const router = express.Router();

  function pruneAndRotateSessions(data, teamId) {
    const currentIso = nowIso();
    data.sessions = data.sessions.filter((session) => session.expires_at > currentIso && session.team_id !== teamId);
  }

  function revokeSession(data, tokenId) {
    data.sessions = data.sessions.filter((session) => session.token_id !== tokenId);
  }

  router.post("/login", (req, res) => {
    const { teamId, password } = req.body || {};

    if (!teamId || !password) {
      return res.status(400).json({ message: "Team ID and password are required." });
    }

    const db = store.read();
    const inputId = `${teamId}`.toLowerCase();
    const team = db.teams.find((t) => 
      !t.is_admin && 
      (t.team_id.toLowerCase() === inputId || t.team_name.toLowerCase() === inputId)
    );

    if (!team || !bcrypt.compareSync(password, team.password_hash)) {
      return res.status(401).json({ message: "Invalid team credentials. Try using your Team ID (e.g., T001) or Team Name." });
    }

    const tokenId = randomUUID();
    const token = signToken({ team_id: team.team_id, team_name: team.team_name, is_admin: false, token_id: tokenId });

    store.write((data) => {
      pruneAndRotateSessions(data, team.team_id);
      data.sessions.push({
        token_id: tokenId,
        team_id: team.team_id,
        created_at: nowIso(),
        expires_at: new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString()
      });
    });

    logEvent(store, "team_login", team.team_id);
    req.io.emit("dashboard:update", getDashboardSnapshot(store));

    return res.json({
      token,
      team: {
        team_id: team.team_id,
        team_name: team.team_name,
        is_admin: false
      }
    });
  });

  router.post("/admin-login", (req, res) => {
    const { teamId, password } = req.body || {};

    const db = store.read();
    const inputId = `${teamId}`.toLowerCase();
    const admin = db.teams.find((t) => 
      t.is_admin && 
      (t.team_id.toLowerCase() === inputId || t.team_name.toLowerCase() === inputId)
    );

    if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
      return res.status(401).json({ message: "Invalid admin credentials." });
    }

    const tokenId = randomUUID();
    const token = signToken({ team_id: admin.team_id, team_name: admin.team_name, is_admin: true, token_id: tokenId });

    store.write((data) => {
      pruneAndRotateSessions(data, admin.team_id);
      data.sessions.push({
        token_id: tokenId,
        team_id: admin.team_id,
        created_at: nowIso(),
        expires_at: new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString()
      });
    });

    logEvent(store, "admin_login", admin.team_id);

    return res.json({
      token,
      team: {
        team_id: admin.team_id,
        team_name: admin.team_name,
        is_admin: true
      }
    });
  });

  router.get("/validate", authenticateToken, (req, res) => {
    return res.json({
      ok: true,
      team: {
        team_id: req.user.team_id,
        team_name: req.user.team_name,
        is_admin: req.user.is_admin
      }
    });
  });

  router.post("/refresh", authenticateToken, (req, res) => {
    const tokenId = randomUUID();
    const token = signToken({
      team_id: req.user.team_id,
      team_name: req.user.team_name,
      is_admin: req.user.is_admin,
      token_id: tokenId
    });

    store.write((data) => {
      revokeSession(data, req.user.token_id);
      pruneAndRotateSessions(data, req.user.team_id);
      data.sessions.push({
        token_id: tokenId,
        team_id: req.user.team_id,
        created_at: nowIso(),
        expires_at: new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString()
      });
    });

    return res.json({ token });
  });

  router.post("/logout", authenticateToken, (req, res) => {
    store.write((data) => {
      revokeSession(data, req.user.token_id);
    });
    logEvent(store, req.user.is_admin ? "admin_logout" : "team_logout", req.user.team_id);
    return res.json({ ok: true });
  });

  return router;
}
