import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { DataStore } from "./data/store.js";
import { authenticateToken, requireAdmin } from "./middleware/auth.js";
import { createAuthRouter } from "./routes/authRoutes.js";
import { createTeamRouter } from "./routes/teamRoutes.js";
import { createAdminRouter } from "./routes/adminRoutes.js";
import { getDashboardSnapshot } from "./services/dashboardService.js";
import { normalizeAssignments } from "./services/puzzleService.js";
import { getDefaultPuzzleBankDir, syncPuzzlesFromFolder } from "./services/puzzleBankService.js";
import { loadQuestionsAsPuzzles } from "./services/questionsService.js";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*"
  }
});

const store = new DataStore();
await store.init();

// Sync puzzles from folder
const syncResult = syncPuzzlesFromFolder(store, getDefaultPuzzleBankDir(), {
  replaceExistingFromSource: true
});
if (!syncResult.ok) {
  console.log(`Puzzle bank sync skipped: ${syncResult.message}`);
} else {
  console.log(syncResult.message);
}

// Load questions from QUESTIONS.md and add as trivia puzzles
const questionPuzzles = loadQuestionsAsPuzzles(getDefaultPuzzleBankDir());
if (questionPuzzles.length > 0) {
  store.write((db) => {
    // Remove any existing trivia puzzles
    db.puzzles = db.puzzles.filter((p) => !p.puzzle_id.startsWith("TRIVIA_"));
    // Add new trivia puzzles
    db.puzzles.push(...questionPuzzles);
  });
  console.log(`Loaded ${questionPuzzles.length} trivia question(s) from QUESTIONS.md`);
}

app.use(cors());
app.use(express.json());
app.use((req, _res, next) => {
  req.io = io;
  req.store = store;
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "puzzle-platform-api" });
});

app.use("/api/auth", createAuthRouter(store));
app.use("/api/team", authenticateToken, createTeamRouter(store));
app.use("/api/admin", authenticateToken, requireAdmin, createAdminRouter(store));

io.on("connection", (socket) => {
  socket.emit("dashboard:update", getDashboardSnapshot(store));
});

setInterval(() => {
  const updates = normalizeAssignments(store);
  if (updates.length > 0) {
    io.emit("dashboard:update", getDashboardSnapshot(store));
  }
}, 1000);

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`Puzzle platform server listening on port ${PORT}`);
});
