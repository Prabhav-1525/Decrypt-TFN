import express from "express";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { authenticateToken, signToken } from "../middleware/auth.js";
import { nowIso } from "../utils/time.js";
import { getDashboardSnapshot } from "../services/dashboardService.js";
import { logEvent } from "../services/puzzleService.js";

const ACCESS_TOKEN_TTL_MINUTES = Number(process.env.ACCESS_TOKEN_TTL_MINUTES || 120);
const ACCESS_TOKEN_TTL_MS = ACCESS_TOKEN_TTL_MINUTES * 60 * 1000;
const REFRESH_TOKEN_TTL_HOURS = Number(process.env.REFRESH_TOKEN_TTL_HOURS || 48);
const REFRESH_TOKEN_TTL_MS = REFRESH_TOKEN_TTL_HOURS * 60 * 60 * 1000;

function buildSessionPayload(team, tokenId, expiresAt, refreshToken, refreshExpiresAt) {
  const token = signToken(
    { team_id: team.team_id, team_name: team.team_name, is_admin: team.is_admin, token_id: tokenId },
    { expiresIn: `${Math.floor(ACCESS_TOKEN_TTL_MS / 1000)}s` }
  );

  return {
    token,
    refresh_token: refreshToken,
    expires_at: expiresAt,
    refresh_expires_at: refreshExpiresAt,
    team: {
      team_id: team.team_id,
      team_name: team.team_name,
      is_admin: team.is_admin
    }
  };
}

export function createAuthRouter(store) {
  const router = express.Router();

  function resetSessionsForTeam(data, teamId) {
    const currentIso = nowIso();
    // Enforce single active session per team while pruning expired records
    data.sessions = data.sessions.filter(
      (session) => session.refresh_expires_at > currentIso && session.team_id !== teamId
    );
  }

  function createSession(team) {
    const tokenId = randomUUID();
    const refreshToken = randomUUID();
    const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_MS).toISOString();
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString();

    store.write((data) => {
      resetSessionsForTeam(data, team.team_id);
      data.sessions.push({
        token_id: tokenId,
        team_id: team.team_id,
        created_at: nowIso(),
        expires_at: expiresAt,
        refresh_token: refreshToken,
        refresh_expires_at: refreshExpiresAt
      });
    });

    return buildSessionPayload(team, tokenId, expiresAt, refreshToken, refreshExpiresAt);
  }

  function refreshSession(team, existingRefreshToken) {
    const tokenId = randomUUID();
    const newRefreshToken = randomUUID();
    const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_MS).toISOString();
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString();

    store.write((data) => {
      data.sessions = data.sessions.map((session) => {
        if (session.refresh_token !== existingRefreshToken || session.team_id !== team.team_id) {
          return session;
        }
        return {
          ...session,
          token_id: tokenId,
          expires_at: expiresAt,
          refresh_token: newRefreshToken,
          refresh_expires_at: refreshExpiresAt
        };
      });
    });

    return buildSessionPayload(team, tokenId, expiresAt, newRefreshToken, refreshExpiresAt);
  }

  router.post("/login", (req, res) => {
    const { teamId, password } = req.body || {};

    if (!teamId || !password) {
      return res.status(400).json({ message: "Team ID and password are required." });
    }

    const db = store.read();
    const inputId = `${teamId}`.toLowerCase();
    const team = db.teams.find(
      (t) => !t.is_admin && (t.team_id.toLowerCase() === inputId || t.team_name.toLowerCase() === inputId)
    );

    if (!team || !bcrypt.compareSync(password, team.password_hash)) {
      return res
        .status(401)
        .json({ message: "Invalid team credentials. Try using your Team ID (e.g., T001) or Team Name." });
    }

    const sessionPayload = createSession(team);
    logEvent(store, "team_login", team.team_id);
    req.io.emit("dashboard:update", getDashboardSnapshot(store));
    return res.json(sessionPayload);
  });

  router.post("/admin-login", (req, res) => {
    const { teamId, password } = req.body || {};

    const db = store.read();
    const inputId = `${teamId}`.toLowerCase();
    const admin = db.teams.find(
      (t) => t.is_admin && (t.team_id.toLowerCase() === inputId || t.team_name.toLowerCase() === inputId)
    );

    if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
      return res.status(401).json({ message: "Invalid admin credentials." });
    }

    const sessionPayload = createSession(admin);
    logEvent(store, "admin_login", admin.team_id);
    return res.json(sessionPayload);
  });

  router.post("/refresh", (req, res) => {
    const { refreshToken } = req.body || {};
    if (!refreshToken) {
      return res.status(400).json({ message: "refreshToken is required." });
    }
    const db = store.read();
    const currentIso = nowIso();
    const session = db.sessions.find(
      (entry) => entry.refresh_token === refreshToken && entry.refresh_expires_at > currentIso
    );

    if (!session) {
      return res.status(401).json({ message: "Refresh token expired. Please log in again." });
    }

    const team = db.teams.find((t) => t.team_id === session.team_id);
    if (!team) {
      return res.status(401).json({ message: "Account not found." });
    }

    const payload = refreshSession(team, refreshToken);
    return res.json(payload);
  });

  router.post("/logout", authenticateToken, (req, res) => {
    const { refreshToken } = req.body || {};
    const tokenId = req.user.token_id;
    const teamId = req.user.team_id;

    store.write((data) => {
      data.sessions = data.sessions.filter(
        (session) =>
          !(
            session.team_id === teamId &&
            (session.token_id === tokenId || (refreshToken && session.refresh_token === refreshToken))
          )
      );
    });

    logEvent(store, req.user.is_admin ? "admin_logout" : "team_logout", req.user.team_id);
    req.io.emit("dashboard:update", getDashboardSnapshot(store));
    return res.json({ ok: true });
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

  return router;
}
