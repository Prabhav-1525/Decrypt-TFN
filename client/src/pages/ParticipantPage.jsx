import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import ToolsPanel from "../components/ToolsPanel/ToolsPanel";

function formatTime(totalSeconds) {
  const safe = Math.max(totalSeconds, 0);
  const minutes = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (safe % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export default function ParticipantPage() {
  const navigate = useNavigate();
  const { auth, logout } = useAuth();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [answer, setAnswer] = useState("");
  const [submissionContent, setSubmissionContent] = useState("");
  const [assetPreview, setAssetPreview] = useState("");
  const [runOutput, setRunOutput] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [violations, setViolations] = useState(0);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [clipboardHistory, setClipboardHistory] = useState(() => {
    const saved = localStorage.getItem("clipboard-history");
    return saved ? JSON.parse(saved) : [];
  });
  const [hints, setHints] = useState([]);
  const [revealedHints, setRevealedHints] = useState([]);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("theme") === "dark");

  useEffect(() => {
    document.body.dataset.theme = darkMode ? "dark" : "light";
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  const loadStatus = useCallback(async () => {
    try {
      const response = await api.get("/team/status");
      setStatus(response.data);
      setViolations(response.data?.violation_profile?.count || 0);
      setHints(response.data?.puzzle?.hints || []);
      setRevealedHints(response.data?.hints_revealed || []);
      setError("");
    } catch (requestError) {
      if (requestError?.response?.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setError(requestError?.response?.data?.message || "Unable to load puzzle status.");
    } finally {
      setLoading(false);
    }
  }, [logout, navigate]);

  const reportViolation = useCallback(async (type, detail) => {
    try {
      await api.post("/team/violation", { type, detail });
    } catch {
      // Do not interrupt participant flow when event logging fails.
    }
  }, []);

  const refreshHints = useCallback(async () => {
    try {
      const response = await api.get("/team/hints");
      setHints(response.data?.hints || []);
      setRevealedHints(response.data?.revealed || []);
    } catch {
      // ignore
    }
  }, []);

  const handleRevealHint = async (index) => {
    try {
      const response = await api.post("/team/hints/reveal", { hintIndex: index });
      setFeedback(`Hint unlocked${response.data?.penalty_seconds ? ` (-${response.data.penalty_seconds}s)` : ""}`);
      await refreshHints();
      await loadStatus();
    } catch (requestError) {
      setFeedback(requestError?.response?.data?.message || "Unable to reveal hint.");
    }
  };

  const handleCopy = (value) => {
    if (!value) return;
    const next = [value, ...clipboardHistory.filter((item) => item !== value)].slice(0, 5);
    setClipboardHistory(next);
    localStorage.setItem("clipboard-history", JSON.stringify(next));
  };

  const handlePasteToField = (value) => {
    if (!value) return;
    setAnswer(value);
    setSubmissionContent(value);
  };

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  useEffect(() => {
    if (status?.assignment?.puzzle_id) {
      refreshHints();
    }
  }, [status?.assignment?.puzzle_id, refreshHints]);

  useEffect(() => {
    if (!status || status.completed || !status.assignment || status.assignment.status === "paused") {
      return undefined;
    }

    const ticker = setInterval(() => {
      setStatus((prev) => {
        if (!prev?.assignment) {
          return prev;
        }

        const nextRemaining = Math.max((prev.remaining_seconds || 0) - 1, 0);
        return {
          ...prev,
          remaining_seconds: nextRemaining
        };
      });
    }, 1000);

    return () => clearInterval(ticker);
  }, [status]);

  const lifelineRemainingSeconds = useMemo(() => {
    const unlock = status?.lifeline?.active_unlock_until;
    if (!unlock) {
      return 0;
    }
    const remaining = Math.ceil((new Date(unlock).getTime() - Date.now()) / 1000);
    return Math.max(remaining, 0);
  }, [status]);

  const lockEnforced = lifelineRemainingSeconds <= 0;
  const isSuspended = Boolean(status?.suspended);
  const isPaused = status?.assignment?.status === "paused";
  const remainingSeconds = status?.remaining_seconds || 0;
  const totalSeconds = status?.assignment?.time_limit_sec || remainingSeconds;
  const usedRatio = totalSeconds ? (totalSeconds - remainingSeconds) / totalSeconds : 0;

  useEffect(() => {
    const onFullscreenChange = () => {
      const isFullscreen = Boolean(document.fullscreenElement);
      setFullscreen(isFullscreen);
      if (!isFullscreen && lockEnforced) {
        setViolations((count) => count + 1);
        reportViolation("fullscreen_exit", "Participant exited fullscreen mode.");
      }
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [lockEnforced, reportViolation]);

  useEffect(() => {
    const beforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  useEffect(() => {
    if (!lockEnforced) {
      return undefined;
    }

    const prevent = (event, type, detail) => {
      event.preventDefault();
      setViolations((count) => count + 1);
      setFeedback("Browser restrictions are active. Use a lifeline to unlock temporarily.");
      reportViolation(type, detail);
    };

    const onContextMenu = (event) => prevent(event, "right_click", "Right click blocked.");
    const onCopy = (event) => prevent(event, "copy_attempt", "Copy operation blocked.");
    const onPaste = (event) => prevent(event, "paste_attempt", "Paste operation blocked.");
    const onBlur = () => {
      setViolations((count) => count + 1);
      setFeedback("Focus must remain on the puzzle window.");
      reportViolation("window_blur", "Window lost focus.");
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        setViolations((count) => count + 1);
        setFeedback("Tab switching detected. Please stay on this tab.");
        reportViolation("tab_switch", "Document became hidden.");
      }
    };

    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [lockEnforced, reportViolation]);

  const requestFullscreen = async () => {
    try {
      await document.documentElement.requestFullscreen();
      setFullscreen(true);
    } catch {
      setFeedback("Fullscreen request blocked by browser. Please allow it manually.");
    }
  };

  const handleAnswerSubmit = async (event) => {
    event.preventDefault();
    setFeedback("");

    try {
      const payload =
        status?.puzzle?.submission_mode === "file"
          ? {
              content: submissionContent
            }
          : {
              answer
            };

      const response = await api.post("/team/submit", payload);
      setFeedback(response.data.message);
      setAnswer("");
      await loadStatus();
    } catch (requestError) {
      setFeedback(requestError?.response?.data?.message || "Submission failed.");
    }
  };

  const runCode = async () => {
    setRunOutput("");
    try {
      const response = await api.post("/team/run-code", {
        content: submissionContent
      });
      const stdout = response.data?.details?.stdout || "";
      const stderr = response.data?.details?.stderr || "";
      setRunOutput(`STDOUT:\n${stdout || "(empty)"}\n\nSTDERR:\n${stderr || "(empty)"}`);
    } catch (requestError) {
      setRunOutput(requestError?.response?.data?.message || "Execution failed.");
    }
  };

  const loadAssetPreview = async (relativePath) => {
    try {
      const response = await api.get(`/team/asset?path=${encodeURIComponent(relativePath)}`);
      if (!response.data.is_text) {
        setAssetPreview(`Binary file: ${response.data.filename} (${response.data.relative_path})`);
        return;
      }
      setAssetPreview(`File: ${response.data.relative_path}\n\n${response.data.content}`);
    } catch (requestError) {
      setAssetPreview(requestError?.response?.data?.message || "Unable to load file preview.");
    }
  };

  const activateLifeline = async () => {
    setFeedback("");

    try {
      const response = await api.post("/team/lifeline");
      setFeedback(response.data.message);
      await loadStatus();
    } catch (requestError) {
      setFeedback(requestError?.response?.data?.message || "Unable to activate lifeline.");
    }
  };

  if (loading) {
    return (
      <main className="page-shell dashboard-page">
        <section className="card centered-card">Loading puzzle session...</section>
      </main>
    );
  }

  return (
    <main className="page-shell dashboard-page">
      <section className="top-bar">
        <div>
          <span className="eyebrow">Event Dashboard</span>
          <h1>{auth?.team?.team_name}</h1>
          <div className="timer-pill" style={{ color: usedRatio >= 0.9 ? 'var(--danger)' : usedRatio >= 0.75 ? 'var(--accent-secondary)' : 'var(--text-primary)' }}>
            Timer: {formatTime(remainingSeconds)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-muted" type="button" onClick={() => setDarkMode((v) => !v)}>
            {darkMode ? "Light Mode" : "Dark Mode"}
          </button>
          <button className="btn btn-outline" onClick={requestFullscreen}>
            {fullscreen ? "Fullscreen Active" : "Go Fullscreen"}
          </button>
          <button className="btn btn-muted" onClick={logout}>
            Logout
          </button>
        </div>
      </section>

      {error && <p className="error-text" style={{ marginBottom: '20px' }}>{error}</p>}

      {status?.completed ? (
        <section className="card success-card centered-card">
          <span className="eyebrow" style={{ color: 'var(--success)' }}>Event Completed</span>
          <h1>Congratulations!</h1>
          <p className="muted" style={{ maxWidth: '600px', margin: '0 auto 24px' }}>
            Excellent work. Your team has successfully finished all puzzles in this event.
          </p>
          <div className="stats-grid" style={{ width: '100%', maxWidth: '600px', margin: '0 auto' }}>
             <article className="card stat-card">
              <p className="label">Solved</p>
              <h2>{status?.stats?.solved_count || 0}</h2>
            </article>
            <article className="card stat-card">
              <p className="label">Attempts</p>
              <h2>{status?.stats?.attempts || 0}</h2>
            </article>
          </div>
        </section>
      ) : status?.suspended ? (
        <section className="card warning-card centered-card" style={{ padding: '32px' }}>
          <span className="eyebrow" style={{ color: 'var(--accent-secondary)' }}>Access Suspended</span>
          <h2>Anti-cheat policy enforced</h2>
          <p className="muted" style={{ maxWidth: '600px', margin: '12px auto' }}>
            Your session has been suspended due to repeated violations. You may resume after{" "}
            {status?.suspended_until ? new Date(status.suspended_until).toLocaleTimeString() : "the penalty period"}.
          </p>
          <p className="muted">Please keep the window focused and avoid restricted actions.</p>
        </section>
      ) : (
        <>
          <section className="stats-grid">
            <article className="card stat-card">
              <p className="label">Time Remaining</p>
              <h2 className={status?.remaining_seconds <= 60 ? "danger-text" : ""}>
                {formatTime(status?.remaining_seconds || 0)}
              </h2>
            </article>
            <article className="card stat-card">
              <p className="label">Lifelines Left</p>
              <h2>{status?.lifeline?.lifeline_remaining ?? 0}</h2>
            </article>
            <article className="card stat-card">
              <p className="label">Access Level</p>
              <h2 style={{ color: lockEnforced ? 'var(--accent-primary)' : 'var(--accent-primary)' }}>
                {lockEnforced ? "Standard" : `Unlocked (${formatTime(lifelineRemainingSeconds)})`}
              </h2>
            </article>
            <article className="card stat-card">
              <p className="label">Warnings</p>
              <h2 className={violations >= 3 ? "danger-text" : ""}>{violations}</h2>
            </article>
          </section>
          {Array.isArray(status?.progress_tiles) && (
            <section className="card progress-tracker">
              <span className="eyebrow">Progress Tracker</span>
              <div className="progress-tiles">
                {status.progress_tiles.map((tile) => (
                  <div
                    key={tile.puzzle_id}
                    className={`progress-tile ${tile.status}`}
                    title={tile.puzzle_type || "puzzle"}
                  >
                    <strong>{tile.puzzle_id}</strong>
                    <small className="muted">{tile.status}</small>
                  </div>
                ))}
              </div>
            </section>
          )}
          {isPaused && (
            <p className="info-text" style={{ marginBottom: '16px' }}>
              Timer paused by administrator. Please stand by.
            </p>
          )}

          <section className="card puzzle-card">
            <div className="card-header">
              <span className="eyebrow">Puzzle {status?.puzzle?.puzzle_id}</span>
              <h2 style={{ marginBottom: '16px' }}>{status?.puzzle?.title || "Current Task"}</h2>
              <pre className="asset-preview" style={{ marginBottom: '12px' }}>{status?.puzzle?.puzzle_text}</pre>
              <p className="muted" style={{ fontSize: '0.9rem' }}>Points Value: <span style={{ color: 'var(--accent-secondary)' }}>{status?.puzzle?.points}</span></p>
            </div>

            <ToolsPanel
              puzzle={status?.puzzle}
              onCopy={handleCopy}
              clipboardHistory={clipboardHistory}
              onPasteToField={handlePasteToField}
            />

            {hints?.length > 0 && (
              <section className="hints">
                <div className="utility-header">
                  <h3>Hints</h3>
                  <p className="muted">H1 free; further hints may apply time penalties.</p>
                </div>
                <div className="hints-grid">
                  {hints.map((hint, idx) => {
                    const unlocked = revealedHints.includes(idx);
                    return (
                      <div key={idx} className="hint-card">
                        <span className="eyebrow">H{idx + 1}</span>
                        {unlocked ? (
                          <p>{hint}</p>
                        ) : (
                          <button className="btn btn-outline" type="button" onClick={() => handleRevealHint(idx)}>
                            Reveal {idx === 0 ? "(free)" : "(penalty applies)"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <form onSubmit={handleAnswerSubmit} className="form-grid">
              {status?.puzzle?.submission_mode === "file" ? (
                <>
                  <p className="muted" style={{ fontSize: '0.9rem' }}>
                    Deployment Target: <span className="mono" style={{ color: 'var(--accent-violet)' }}>{status?.puzzle?.expected_file_name}</span>
                  </p>
                  <label>
                    <span className="eyebrow" style={{ fontSize: '0.7rem' }}>Compiler Output Ready</span>
                    <textarea
                      className="submission-textarea"
                      value={submissionContent}
                      onChange={(event) => setSubmissionContent(event.target.value)}
                      placeholder="// Write your solution logic here..."
                      disabled={(status?.remaining_seconds || 0) <= 0 || isSuspended || isPaused}
                      required
                    />
                  </label>
                </>
              ) : (
                <label>
                   <span className="eyebrow" style={{ fontSize: '0.7rem' }}>Passcode Entry</span>
                   <input
                     type="text"
                     className="mono"
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder="Enter decryption key..."
                    disabled={(status?.remaining_seconds || 0) <= 0 || isSuspended || isPaused}
                    required
                  />
                </label>
              )}
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {status?.puzzle?.submission_mode === "file" && status?.puzzle?.validation_mode === "output" && (
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={runCode}
                    disabled={(status?.remaining_seconds || 0) <= 0 || !submissionContent.trim() || isSuspended || isPaused}
                  >
                    Test Solution
                  </button>
                )}
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={(status?.remaining_seconds || 0) <= 0 || isSuspended || isPaused}
                >
                  Submit Answer
                </button>
                <button
                  className="btn btn-accent"
                  type="button"
                  onClick={activateLifeline}
                  disabled={(status?.lifeline?.lifeline_remaining || 0) <= 0 || !lockEnforced || isSuspended || isPaused}
                >
                  Unlock Temporarily (60s)
                </button>
              </div>
            </form>

            {runOutput && (
              <section className="asset-viewer" style={{ marginTop: '32px' }}>
                <span className="eyebrow">Execution Logs</span>
                <pre className="asset-preview" style={{ background: '#000', border: '1px solid var(--accent-violet)' }}>{runOutput}</pre>
              </section>
            )}

            {status?.puzzle?.asset_files?.length > 0 && (
              <section className="asset-viewer" style={{ marginTop: '32px' }}>
                <span className="eyebrow">Sector Files</span>
                <div className="asset-list">
                  {status.puzzle.asset_files.map((file) => (
                    <button
                      key={file.relative_path}
                      type="button"
                      className="btn btn-muted"
                      style={{ fontSize: '0.8rem', padding: '8px 16px' }}
                      onClick={() => loadAssetPreview(file.relative_path)}
                    >
                      {file.relative_path}
                    </button>
                  ))}
                </div>
                {assetPreview && (
                  <pre className="asset-preview" style={{ marginTop: '12px' }}>{assetPreview}</pre>
                )}
              </section>
            )}

            <div style={{ marginTop: '24px' }}>
              {feedback && <p className="info-text" style={{ padding: '12px', background: 'rgba(255, 188, 0, 0.1)', borderRadius: '8px' }}>{feedback}</p>}
              {violations >= 3 && <p className="error-text" style={{ marginTop: '12px', padding: '12px', background: 'rgba(255, 77, 77, 0.1)', borderRadius: '8px' }}>Multiple warnings detected. Please follow the fair play guidelines.</p>}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
