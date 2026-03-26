import jwt from "jsonwebtoken";
import { nowIso } from "../utils/time.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-key";
const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_TTL || "2h";

export function signToken(payload, options = {}) {
  const expiresIn = options.expiresIn || ACCESS_TOKEN_EXPIRES_IN;
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

export function authenticateToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing authentication token." });
  }

  const token = header.split(" ")[1];

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    const store = req.store;
    if (store) {
      const db = store.read();
      const currentIso = nowIso();
      const session = db.sessions.find(
        (entry) =>
          entry.token_id === payload.token_id &&
          entry.team_id === payload.team_id &&
          entry.expires_at > currentIso
      );

      if (!session) {
        return res.status(401).json({ message: "Session expired. Please log in again." });
      }
    }

    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) {
    return res.status(403).json({ message: "Admin access required." });
  }
  return next();
}
