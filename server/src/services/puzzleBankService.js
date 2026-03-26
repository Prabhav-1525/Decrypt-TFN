import fs from "node:fs";
import path from "node:path";
import { runProgram } from "./executionService.js";

const DEFAULT_PUZZLE_BANK_DIR = path.resolve(process.cwd(), "puzzle_bank");

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function isTextLike(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return [".txt", ".md", ".py", ".json", ".csv", ".js", ".ts", ".yaml", ".yml"].includes(ext);
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n").trim();
}

function compact(text, maxLength = 1200) {
  const value = `${text || ""}`.trim();
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

function findReadmeFile(files) {
  const readme = files.find((filePath) => /^readme(.*)\.(md|txt)$/i.test(path.basename(filePath)));
  return readme || null;
}

function expectedFilePriority(filePath) {
  const name = path.basename(filePath).toLowerCase();
  if (name === "solution.py") {
    return 1;
  }
  if (name.startsWith("solution.")) {
    return 2;
  }
  if (name.startsWith("organizer_solution")) {
    return 3;
  }
  if (name.startsWith("answer.")) {
    return 4;
  }
  if (name.startsWith("answer_")) {
    return 5;
  }
  if (name.startsWith("correct_moves")) {
    return 6;
  }
  return 99;
}

function collectFilesRecursive(baseDir) {
  const output = [];

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        output.push(full);
      }
    }
  }

  walk(baseDir);
  return output;
}

function chooseExpectedFile(files) {
  const candidates = files
    .filter((filePath) => isTextLike(filePath))
    .filter((filePath) => !/^readme(.*)\.(md|txt)$/i.test(path.basename(filePath)))
    .filter((filePath) => path.basename(filePath).toLowerCase() !== "verifier.py")
    .sort((a, b) => expectedFilePriority(a) - expectedFilePriority(b));

  return candidates[0] || null;
}

function normalizeContent(value) {
  return `${value || ""}`.replace(/\r\n/g, "\n").trim();
}

export function getDefaultPuzzleBankDir() {
  return DEFAULT_PUZZLE_BANK_DIR;
}

export function syncPuzzlesFromFolder(store, folderPath, options = {}) {
  const sourceRoot = path.resolve(folderPath || DEFAULT_PUZZLE_BANK_DIR);
  if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) {
    return {
      ok: false,
      message: `Puzzle folder not found: ${sourceRoot}`,
      imported_count: 0,
      skipped_count: 0
    };
  }

  const shouldReplace = Boolean(options.replaceExistingFromSource);
  const replaceAllPuzzles = Boolean(options.replaceAllPuzzles);
  const currentDb = store.read();

  const existingIds = new Set(currentDb.puzzles.map((p) => p.puzzle_id));
  const existingSourceFolders = new Set(
    currentDb.puzzles.filter((p) => p.source_folder).map((p) => `${p.source_root || ""}::${p.source_folder}`)
  );

  const imported = [];
  const skipped = [];
  const folders = fs
    .readdirSync(sourceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  let counter = 1;
  for (const folder of folders) {
    const key = `${sourceRoot}::${folder}`;
    if (!shouldReplace && existingSourceFolders.has(key)) {
      skipped.push({ folder, reason: "already_imported" });
      continue;
    }

    const folderAbs = path.join(sourceRoot, folder);
    const files = collectFilesRecursive(folderAbs);

    const readmeFile = findReadmeFile(files);
    const expectedFile = chooseExpectedFile(files);

    if (!readmeFile) {
      skipped.push({ folder, reason: "missing_readme" });
      continue;
    }

    if (!expectedFile) {
      skipped.push({ folder, reason: "missing_solution_file" });
      continue;
    }

    while (existingIds.has(`FB${counter.toString().padStart(3, "0")}`)) {
      counter += 1;
    }

    const puzzleId = `FB${counter.toString().padStart(3, "0")}`;
    counter += 1;
    existingIds.add(puzzleId);

    const expectedRelative = toPosixPath(path.relative(folderAbs, expectedFile));
    const referenceExecution = runProgram({
      cwd: folderAbs,
      relativePath: expectedRelative
    });

    const validationMode = referenceExecution.ok ? "output" : "content";
    const expectedOutput = referenceExecution.ok ? `${referenceExecution.stdout || ""}` : null;
    const assetFiles = files
      .map((filePath) => {
        const relativePath = toPosixPath(path.relative(folderAbs, filePath));
        const filename = path.basename(filePath);
        const stat = fs.statSync(filePath);
        return {
          filename,
          relative_path: relativePath,
          size: stat.size,
          is_text: isTextLike(filePath),
          is_reference: relativePath === expectedRelative,
          is_readme: relativePath === toPosixPath(path.relative(folderAbs, readmeFile))
        };
      })
      .sort((a, b) => a.relative_path.localeCompare(b.relative_path));

    imported.push({
      puzzle_id: puzzleId,
      puzzle_text: compact(readText(readmeFile)),
      correct_answer: normalizeContent(readText(expectedFile)),
      validation_mode: validationMode,
      expected_output: expectedOutput,
      time_limit_sec: 420,
      points: 150,
      submission_mode: "file",
      expected_file_name: expectedRelative,
      source_folder: folder,
      source_root: sourceRoot,
      asset_files: assetFiles
    });
  }

  store.write((db) => {
    if (replaceAllPuzzles) {
      db.puzzles = [];
      db.assignments = [];
      db.submissions = [];
      db.team_question_sets = [];
      db.sessions = [];
    }

    if (shouldReplace) {
      db.puzzles = db.puzzles.filter((p) => p.source_root !== sourceRoot);
    }
    db.puzzles.push(...imported);
  });

  return {
    ok: true,
    message: `Synced ${imported.length} puzzle(s), skipped ${skipped.length}.`,
    imported_count: imported.length,
    skipped_count: skipped.length,
    imported_folders: imported.map((p) => p.source_folder),
    skipped,
    source_root: sourceRoot
  };
}

export function readPuzzleAssetForTeam(store, teamId, relativePath) {
  const db = store.read();
  const active = db.assignments.find(
    (a) => a.team_id === teamId && (a.status === "active" || a.status === "paused")
  );
  if (!active) {
    return { ok: false, message: "No active puzzle." };
  }

  const puzzle = db.puzzles.find((p) => p.puzzle_id === active.puzzle_id);
  
  // Trivia puzzles (questions from QUESTIONS.md) do not have accessible assets
  if (puzzle?.puzzle_id.startsWith("TRIVIA_")) {
    return { ok: false, message: "This puzzle does not expose file assets." };
  }
  
  if (!puzzle?.source_root || !puzzle?.source_folder) {
    return { ok: false, message: "Current puzzle does not expose file assets." };
  }

  const target = path.normalize(relativePath || "");
  if (!target || target.startsWith("..") || path.isAbsolute(target)) {
    return { ok: false, message: "Invalid file path." };
  }

  const puzzleBase = path.join(puzzle.source_root, puzzle.source_folder);
  const absolute = path.join(puzzleBase, target);
  const resolvedBase = path.resolve(puzzleBase);
  const resolvedFile = path.resolve(absolute);

  if (!resolvedFile.startsWith(resolvedBase)) {
    return { ok: false, message: "Path traversal blocked." };
  }

  if (!fs.existsSync(resolvedFile) || !fs.statSync(resolvedFile).isFile()) {
    return { ok: false, message: "File not found in puzzle assets." };
  }

  const isText = isTextLike(resolvedFile);
  return {
    ok: true,
    filename: path.basename(resolvedFile),
    relative_path: toPosixPath(target),
    is_text: isText,
    content: isText ? fs.readFileSync(resolvedFile, "utf8") : null,
    content_base64: isText ? null : fs.readFileSync(resolvedFile).toString("base64")
  };
}
