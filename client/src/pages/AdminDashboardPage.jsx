import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";

function formatTime(totalSeconds) {
  const safe = Math.max(totalSeconds, 0);
  const minutes = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (safe % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

const serverUrl = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";

export default function AdminDashboardPage() {
  const { logout } = useAuth();
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState("");
  const [importFeedback, setImportFeedback] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [replaceImported, setReplaceImported] = useState(true);
  const [replaceAllPuzzles, setReplaceAllPuzzles] = useState(true);
  const [timerInputs, setTimerInputs] = useState({});
  const [selectedTeams, setSelectedTeams] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [defaultPath, setDefaultPath] = useState("");

  const fetchOverview = async () => {
    try {
      const response = await api.get("/admin/overview");
      setSnapshot(response.data);
      setError("");
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Unable to load dashboard.");
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  useEffect(() => {
    const loadDefaultPath = async () => {
      try {
        const response = await api.get("/admin/puzzle-bank/default");
        setDefaultPath(response.data.defaultPath || "");
        if (!folderPath) {
          setFolderPath(response.data.defaultPath || "");
        }
      } catch {
        // ignore
      }
    };
    loadDefaultPath();
  }, [folderPath]);

  useEffect(() => {
    const socket = io(serverUrl, { transports: ["websocket"] });

    socket.on("dashboard:update", (data) => {
      setSnapshot(data);
    });

    socket.on("connect_error", () => {
      setError("Live updates disconnected. Refreshing every few seconds.");
    });

    const fallback = setInterval(fetchOverview, 5000);

    return () => {
      clearInterval(fallback);
      socket.disconnect();
    };
  }, []);

  const leaderboard = useMemo(() => snapshot?.leaderboard || [], [snapshot]);
  const teams = useMemo(() => snapshot?.teams || [], [snapshot]);

  const skipPuzzle = async (teamId) => {
    try {
      await api.post(`/admin/team/${teamId}/skip`);
      await fetchOverview();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Unable to skip puzzle.");
    }
  };

  const pauseTimer = async (teamId) => {
    try {
      await api.post(`/admin/team/${teamId}/pause`);
      await fetchOverview();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Unable to pause timer.");
    }
  };

  const resumeTimer = async (teamId) => {
    try {
      await api.post(`/admin/team/${teamId}/resume`);
      await fetchOverview();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Unable to resume timer.");
    }
  };

  const adjustTimer = async (teamId) => {
    const value = Number(timerInputs[teamId] || 0);
    try {
      await api.post(`/admin/team/${teamId}/timer`, { remainingSeconds: value });
      await fetchOverview();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Unable to adjust timer.");
    }
  };

  const syncPuzzleBank = async () => {
    setImportFeedback("");

    try {
      const response = await api.post("/admin/sync-puzzle-bank", {
        folderPath,
        replaceExistingFromSource: replaceImported,
        replaceAllPuzzles
      });
      setImportFeedback(response.data.message || "Puzzle bank sync completed.");
      await fetchOverview();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Unable to sync puzzle bank.");
    }
  };

  const toggleTeamSelection = (teamId) => {
    setSelectedTeams((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
    );
  };

  const bulkAction = async (action) => {
    const targets = selectedTeams;
    for (const teamId of targets) {
      // eslint-disable-next-line no-await-in-loop
      await action(teamId);
    }
    setSelectedTeams([]);
  };

  const filteredTeams = useMemo(() => {
    return teams.filter((team) => {
      const matchesSearch =
        !search ||
        team.team_name.toLowerCase().includes(search.toLowerCase()) ||
        team.team_id.toLowerCase().includes(search.toLowerCase());
      const status = team.assignment_status || (team.suspended_until ? "suspended" : "idle");
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [teams, search, statusFilter]);

  return (
    <main className="page-shell admin-page">
      <section className="top-bar">
        <div>
          <span className="eyebrow">Event Management</span>
          <h1>Admin Dashboard</h1>
        </div>
        <button className="btn btn-muted" onClick={logout}>
          Disconnect
        </button>
      </section>

      {error && <p className="error-text" style={{ marginBottom: '20px' }}>{error}</p>}

      <section className="card" style={{ marginBottom: '32px' }}>
        <span className="eyebrow">Puzzle Repository</span>
        <h2 style={{ marginBottom: '16px' }}>Bank Configuration</h2>
        <div className="form-grid">
          <input
            className="zip-path-input"
            type="text"
            value={folderPath}
            onChange={(event) => setFolderPath(event.target.value)}
            placeholder={defaultPath || "path/to/puzzle_bank"}
            style={{ width: '100%', maxWidth: '800px' }}
          />
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={replaceImported}
                onChange={(event) => setReplaceImported(event.target.checked)}
              />
              Update Active Source
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={replaceAllPuzzles}
                onChange={(event) => setReplaceAllPuzzles(event.target.checked)}
              />
              Reset All Progress
            </label>
          </div>
          <button className="btn btn-primary" onClick={syncPuzzleBank} style={{ width: 'fit-content' }}>
            Sync Puzzles
          </button>
        </div>
        {importFeedback && <p className="info-text" style={{ marginTop: '16px' }}>{importFeedback}</p>}
      </section>

      <section className="stats-grid">
        <article className="card stat-card">
          <p className="label">Active Teams</p>
          <h2>{snapshot?.teams?.length || 0}</h2>
        </article>
        <article className="card stat-card">
          <p className="label">Live Events</p>
          <h2>{snapshot?.recent_events?.length || 0}</h2>
        </article>
        <article className="card stat-card">
          <p className="label">System Updated</p>
          <h2>{snapshot?.updated_at ? new Date(snapshot.updated_at).toLocaleTimeString() : "-"}</h2>
        </article>
      </section>

      <section className="grid-two">
        <article className="card" style={{ padding: '24px' }}>
          <span className="eyebrow">Team Monitoring</span>
          <div style={{ display: 'flex', gap: '12px', margin: '12px 0', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Search team..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={{ padding: '8px 12px', minWidth: '200px' }}
            />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={{ padding: '8px 12px' }}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="suspended">Suspended</option>
              <option value="idle">Idle</option>
            </select>
            {selectedTeams.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span className="eyebrow">Bulk</span>
                <button className="btn btn-muted" onClick={() => bulkAction(skipPuzzle)} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                  Skip Selected
                </button>
                <button className="btn btn-muted" onClick={() => bulkAction(pauseTimer)} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                  Pause Selected
                </button>
                <button className="btn btn-outline" onClick={() => bulkAction(resumeTimer)} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                  Resume Selected
                </button>
              </div>
            )}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={selectedTeams.length > 0 && selectedTeams.length === filteredTeams.length && filteredTeams.length > 0}
                      onChange={(event) =>
                        setSelectedTeams(event.target.checked ? filteredTeams.map((team) => team.team_id) : [])
                      }
                    />
                  </th>
                  <th>Team</th>
                  <th>Puzzle</th>
                  <th>Time Left</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Lifelines</th>
                  <th>Violations</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTeams.map((team) => {
                  const isSuspended = Boolean(team.suspended_until && new Date(team.suspended_until).getTime() > Date.now());
                  return (
                  <tr key={team.team_id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedTeams.includes(team.team_id)}
                        onChange={() => toggleTeamSelection(team.team_id)}
                      />
                    </td>
                    <td>
                      <strong>{team.team_name}</strong>
                      <p className="muted mono" style={{ fontSize: '0.75rem' }}>{team.team_id}</p>
                    </td>
                    <td><span className="mono" style={{ color: 'var(--accent-secondary)' }}>{team.active_puzzle_id || "-"}</span></td>
                    <td><span className={team.remaining_seconds <= 60 ? "danger-text" : ""}>{formatTime(team.remaining_seconds)}</span></td>
                    <td>{isSuspended ? "Suspended" : team.assignment_status || "Idle"}</td>
                    <td>{team.attempts}</td>
                    <td>{team.lifeline_remaining}</td>
                    <td>{team.violation_count || 0}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button className="btn btn-muted" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => skipPuzzle(team.team_id)}>
                          Skip
                        </button>
                        <button
                          className="btn btn-muted"
                          style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                          onClick={() => pauseTimer(team.team_id)}
                          disabled={team.assignment_status !== "active"}
                        >
                          Pause
                        </button>
                        <button
                          className="btn btn-outline"
                          style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                          onClick={() => resumeTimer(team.team_id)}
                          disabled={team.assignment_status !== "paused"}
                        >
                          Resume
                        </button>
                        <input
                          type="number"
                          min="0"
                          placeholder="sec"
                          value={timerInputs[team.team_id] || ""}
                          style={{ width: '70px', padding: '6px' }}
                          onChange={(event) =>
                            setTimerInputs((prev) => ({
                              ...prev,
                              [team.team_id]: event.target.value
                            }))
                          }
                        />
                        <button className="btn btn-outline" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => adjustTimer(team.team_id)}>
                          Set
                        </button>
                      </div>
                    </td>
                  </tr>
                );
                })}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card" style={{ padding: '24px' }}>
          <span className="eyebrow">Global Leaderboard</span>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Team</th>
                  <th>Solved</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((team, index) => (
                  <tr key={team.team_id}>
                    <td><span className="mono" style={{ color: index === 0 ? 'var(--accent-secondary)' : 'inherit' }}>#{index + 1}</span></td>
                    <td><strong>{team.team_name}</strong></td>
                    <td>{team.solved_count}</td>
                    <td><span style={{ fontWeight: '600' }}>{team.score}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="card" style={{ marginTop: '24px', padding: '24px' }}>
        <span className="eyebrow">Activity Logs</span>
        <div style={{ maxHeight: '300px', overflowY: 'auto', marginTop: '16px', display: 'grid', gap: '8px' }}>
          {(snapshot?.recent_events || []).map((event) => (
            <article key={event.event_id} style={{ padding: '12px', background: 'rgba(20, 13, 26, 0.4)', borderRadius: '8px', border: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                 <p style={{ fontSize: '0.9rem' }}><strong>{event.team_id}</strong>: <span className="muted">{event.type}</span></p>
              </div>
              <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(event.timestamp).toLocaleTimeString()}</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
