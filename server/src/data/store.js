import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import initSqlJs from "sql.js";
import { seedData } from "./seed.js";

const DEFAULT_DB_FILE = path.resolve(process.cwd(), "src/data/db.sqlite");
const LEGACY_JSON_FILE = path.resolve(process.cwd(), "src/data/db.json");
const DEFAULT_PUZZLE_ROOT = path.resolve(process.cwd(), "puzzle_bank");
const CUSTOM_PUZZLE_ROOT_BASE = process.env.PUZZLE_ROOT_BASE
  ? path.resolve(process.env.PUZZLE_ROOT_BASE)
  : DEFAULT_PUZZLE_ROOT;
const SQLJS_WASM_DIR = process.env.SQLJS_WASM_DIR
  ? path.resolve(process.env.SQLJS_WASM_DIR)
  : path.resolve(process.cwd(), "node_modules/sql.js/dist");
let cachedSqlModule = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

function normalizePuzzleSources(db) {
  db.puzzles = db.puzzles.map((puzzle) => {
    const sanitizedRoot = puzzle.source_root
      ? path.isAbsolute(puzzle.source_root)
        ? puzzle.source_root
        : path.resolve(CUSTOM_PUZZLE_ROOT_BASE, puzzle.source_root)
      : DEFAULT_PUZZLE_ROOT;
    return {
      ...puzzle,
      source_root: sanitizedRoot
    };
  });
}

function normalizeAssignmentsState(db) {
  db.assignments = db.assignments.map((assignment) => ({
    ...assignment,
    paused: assignment.paused ?? false,
    paused_remaining_sec: assignment.paused_remaining_sec ?? null,
    pause_started_at: assignment.pause_started_at ?? null
  }));
}

function normalizeSessions(db) {
  db.sessions = db.sessions.map((session) => ({
    refresh_token: session.refresh_token || null,
    refresh_expires_at: session.refresh_expires_at || null,
    ...session
  }));
}

function normalizeData(db) {
  db.assignments = db.assignments || [];
  db.submissions = db.submissions || [];
  db.lifelines = db.lifelines || [];
  db.sessions = db.sessions || [];
  db.events = db.events || [];
  db.team_question_sets = db.team_question_sets || [];
  normalizePuzzleSources(db);
  normalizeAssignmentsState(db);
  normalizeSessions(db);
  ensureLifelines(db);
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
  return initial;
}

function readLegacyJson() {
  if (!fs.existsSync(LEGACY_JSON_FILE)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(LEGACY_JSON_FILE, "utf8"));
    return parsed;
  } catch {
    return null;
  }
}

export class DataStore {
  constructor() {
    this.db = null;
    this.sqlite = null;
    this.dbFile = process.env.DB_FILE_PATH ? path.resolve(process.env.DB_FILE_PATH) : DEFAULT_DB_FILE;
  }

  async init() {
    fs.mkdirSync(path.dirname(this.dbFile), { recursive: true });
    if (!cachedSqlModule) {
      cachedSqlModule = await initSqlJs({
        locateFile: (file) => path.resolve(SQLJS_WASM_DIR, file)
      });
    }
    const SQL = cachedSqlModule;
    const hasFile = fs.existsSync(this.dbFile);
    const fileBuffer = hasFile ? fs.readFileSync(this.dbFile) : null;
    this.sqlite = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database();

    this.sqlite.run("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    const existing = this.sqlite.exec("SELECT value FROM kv WHERE key = 'state' LIMIT 1");

    if (existing.length && existing[0].values.length) {
      const parsed = JSON.parse(existing[0].values[0][0]);
      this.db = normalizeData(parsed);
    } else {
      const legacy = readLegacyJson();
      this.db = normalizeData(legacy || buildInitialData());
    }
    this.persist();
  }

  persist() {
    const payload = JSON.stringify(this.db);
    const stmt = this.sqlite.prepare(
      "INSERT INTO kv (key, value) VALUES ('state', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    );
    stmt.run([payload]);
    stmt.free();
    const serialized = Buffer.from(this.sqlite.export());
    fs.writeFileSync(this.dbFile, serialized);
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
