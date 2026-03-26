import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { seedData } from "./seed.js";
import { getServiceClient } from "../utils/supabase.js";

const LEGACY_JSON_FILE = path.resolve(process.cwd(), "src/data/db.json");
const DEFAULT_PUZZLE_ROOT = path.resolve(process.cwd(), "puzzle_bank");
const PUZZLE_ROOT_BASE = process.env.PUZZLE_ROOT_BASE
  ? path.resolve(process.env.PUZZLE_ROOT_BASE)
  : DEFAULT_PUZZLE_ROOT;
const SUPABASE_STATE_TABLE = process.env.SUPABASE_STATE_TABLE || "app_state";

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
        : path.resolve(PUZZLE_ROOT_BASE, puzzle.source_root)
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
    this.client = null;
  }

  async init() {
    this.client = getServiceClient();

    const existing = await this.client
      .from(SUPABASE_STATE_TABLE)
      .select("value")
      .eq("key", "state")
      .maybeSingle();

    if (existing.error && existing.error.code !== "PGRST116") {
      throw existing.error;
    }

    if (existing.data?.value) {
      this.db = normalizeData(existing.data.value);
    } else {
      const legacy = readLegacyJson();
      this.db = normalizeData(legacy || buildInitialData());
      await this.persist();
    }
  }

  async persist() {
    const { error } = await this.client.from(SUPABASE_STATE_TABLE).upsert({
      key: "state",
      value: this.db,
      updated_at: new Date().toISOString()
    });
    if (error) {
      console.error("Failed to persist state to Supabase:", error.message);
    }
  }

  read() {
    return this.db;
  }

  write(mutator) {
    mutator(this.db);
    void this.persist();
    return this.db;
  }
}
