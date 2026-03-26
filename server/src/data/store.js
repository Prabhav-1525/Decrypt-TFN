import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import initSqlJs from "sql.js";
import { getDefaultPuzzleBankDir } from "../services/puzzleBankService.js";
import { seedData } from "./seed.js";

const JSON_FALLBACK_FILE = path.resolve(process.cwd(), "src/data/db.json");
const SQLITE_FILE = path.resolve(process.cwd(), "src/data/db.sqlite");
const WASM_PATH = path.resolve(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizePuzzlePaths(db) {
  const defaultRoot = getDefaultPuzzleBankDir();
  db.puzzles = (db.puzzles || []).map((puzzle) => {
    const root = puzzle.source_root || "";
    const looksMachineSpecific = root.includes("\\") || root.toLowerCase().includes(":\\");
    return {
      ...puzzle,
      source_root: looksMachineSpecific ? defaultRoot : root || defaultRoot
    };
  });
  return db;
}

function ensureLifelines(db) {
  const teamIds = db.teams.filter((t) => !t.is_admin).map((t) => t.team_id);
  for (const teamId of teamIds) {
    const existing = db.lifelines.find((l) => l.team_id === teamId);
    if (!existing) {
      db.lifelines.push({
        team_id: teamId,
        lifeline_remaining: 2,
        lifeline_used: 0,
        active_unlock_until: null
      });
    }
  }
}

function ensureViolations(db) {
  const teamIds = db.teams.filter((t) => !t.is_admin).map((t) => t.team_id);
  db.violations = db.violations || [];
  for (const teamId of teamIds) {
    const existing = db.violations.find((v) => v.team_id === teamId);
    if (!existing) {
      db.violations.push({
        team_id: teamId,
        count: 0,
        last_violation_at: null,
        last_penalty_at: null,
        suspended_until: null
      });
    }
  }
}

function normalizeData(db) {
  db.assignments = db.assignments || [];
  db.submissions = db.submissions || [];
  db.lifelines = db.lifelines || [];
  db.sessions = db.sessions || [];
  db.events = db.events || [];
  ensureLifelines(db);
  ensureViolations(db);
  return db;
}

function buildInitialData() {
  const initial = clone(seedData);
  initial.teams = initial.teams.map((team) => ({
    team_id: team.team_id,
    team_name: team.team_name,
    password_hash: bcrypt.hashSync(team.password, 10),
    is_admin: team.is_admin
  }));
  ensureLifelines(initial);
  ensureViolations(initial);
  return initial;
}

export class DataStore {
  constructor() {
    this.db = null;
    this.sqlite = null;
  }

  async init() {
    fs.mkdirSync(path.dirname(SQLITE_FILE), { recursive: true });
    const SQL = await initSqlJs({
      locateFile: () => WASM_PATH
    });

    const fileExists = fs.existsSync(SQLITE_FILE);
    const fileBuffer = fileExists ? fs.readFileSync(SQLITE_FILE) : null;
    this.sqlite = fileBuffer ? new SQL.Database(new Uint8Array(fileBuffer)) : new SQL.Database();

    this.sqlite.run("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)");

    const rowStmt = this.sqlite.prepare("SELECT value FROM kv WHERE key = 'db'");
    let loaded = null;
    if (rowStmt.step()) {
      loaded = JSON.parse(rowStmt.getAsObject().value);
    }
    rowStmt.free();

    if (!loaded && fs.existsSync(JSON_FALLBACK_FILE)) {
      const content = fs.readFileSync(JSON_FALLBACK_FILE, "utf8");
      loaded = JSON.parse(content);
    }

    this.db = normalizePuzzlePaths(normalizeData(loaded || buildInitialData()));
    this.persist();
  }

  persist() {
    const payload = JSON.stringify(this.db, null, 2);
    this.sqlite.run("INSERT OR REPLACE INTO kv(key, value) VALUES ('db', ?)", [payload]);
    const binary = this.sqlite.export();
    fs.writeFileSync(SQLITE_FILE, Buffer.from(binary));
  }

  read() {
    return this.db;
  }

  write(mutator) {
    mutator(this.db);
    this.persist();
    return this.db;
  }
}
