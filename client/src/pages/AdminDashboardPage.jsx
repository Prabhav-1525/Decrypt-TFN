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
  const [filterTerm, setFilterTerm] = useState("");
  const [selectedTeams, setSelectedTeams] = useState([]);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [bulkTimerSeconds, setBulkTimerSeconds] = useState("");
  const [actionFeedback, setActionFeedback] = useState("");

  const fetchOverview = async () => {
    try {
      const response = await api.get("/admin/overview");
      setSnapshot(response.data);
      setError("");
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Unable to load dashboard.");
    }
  };

  const fetchConfig = async () => {
    try {
      const response = await api.get("/admin/config");
      if (!folderPath && response.data?.puzzle_bank_default_path) {
        setFolderPath(response.data.puzzle_bank_default_path);
      }
    } catch {
      // non-blocking
    }
  };

  useEffect(() => {
    fetchOverview();
    fetchConfig();
  }, []);

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
  const filteredTeams = useMemo(() => {
    if (!filterTerm.trim()) return teams;
    const needle = filterTerm.toLowerCase();
    return teams.filter(
      (team) =>
        team.team_name.toLowerCase().includes(needle) ||
        team.team_id.toLowerCase().includes(needle) ||
        (team.active_puzzle_id || "").toLowerCase().includes(needle)
    );
  }, [teams, filterTerm]);

  const skipPuzzle = async (teamId) => {
    try {
      await api.post(`/admin/team/${teamId}/skip`);
      await fetchOverview();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Unable to skip puzzle.");
    }
  };

  const pauseTeam = async (teamId) => {
    try {
      await api.post(`/admin/team/${teamId}/pause`);
      await fetchOverview();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Unable to pause timer.");
    }
  };

  const resumeTeam = async (teamId) => {
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

  const toggleSelectTeam = (teamId) => {
    setSelectedTeams((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
    );
  };

  const selectAllVisible = (teamList) => {
    const allIds = teamList.map((t) => t.team_id);
    setSelectedTeams(allIds);
  };

  const clearSelection = () => setSelectedTeams([]);

  const bulkAction = async (action) => {
    if (!selectedTeams.length) {
      setError("Select at least one team for bulk actions.");
      return;
    }

    setActionFeedback("");
    try {
      const response = await api.post("/admin/bulk", {
        teamIds: selectedTeams,
        action,
        remainingSeconds: Number(bulkTimerSeconds) || 0
      });
      setActionFeedback(`Bulk ${action} completed for ${selectedTeams.length} team(s).`);
      await fetchOverview();
      clearSelection();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Bulk action failed.");
    }
  };

  const loadDetail = async (teamId) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const response = await api.get(`/admin/team/${teamId}/detail`);
      setDetail(response.data);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || "Unable to load team details.");
    } finally {
      setDetailLoading(false);
    }
  };

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
            placeholder="Path to puzzle_bank (leave blank to use default)"
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
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', margin: '12px 0' }}>
            <input
              type="text"
              placeholder="Filter by team, ID, or puzzle..."
              value={filterTerm}
              onChange={(event) => setFilterTerm(event.target.value)}
              style={{ padding: '8px', minWidth: '240px' }}
            />
            <button className="btn btn-outline" onClick={() => selectAllVisible(filteredTeams)}>Select Visible</button>
            <button className="btn btn-muted" onClick={clearSelection}>Clear Selection</button>
            <span className="muted" style={{ fontSize: '0.85rem' }}>Selected: {selectedTeams.length}</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <button className="btn btn-outline" onClick={() => bulkAction("pause")} disabled={!selectedTeams.length}>Pause Selected</button>
            <button className="btn btn-outline" onClick={() => bulkAction("resume")} disabled={!selectedTeams.length}>Resume Selected</button>
            <button className="btn btn-outline" onClick={() => bulkAction("skip")} disabled={!selectedTeams.length}>Skip Selected</button>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="number"
                min="0"
                placeholder="sec"
                value={bulkTimerSeconds}
                onChange={(event) => setBulkTimerSeconds(event.target.value)}
                style={{ width: '90px', padding: '6px' }}
              />
              <button className="btn btn-primary" onClick={() => bulkAction("timer")} disabled={!selectedTeams.length}>
                Set Timer Selected
              </button>
            </div>
          </div>
          {actionFeedback && <p className="info-text" style={{ marginBottom: '12px' }}>{actionFeedback}</p>}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={filteredTeams.length > 0 && selectedTeams.length === filteredTeams.length}
                      onChange={(event) => (event.target.checked ? selectAllVisible(filteredTeams) : clearSelection())}
                    />
                  </th>
                  <th>Team</th>
                  <th>Puzzle</th>
                  <th>Time Left</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Lifelines</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTeams.map((team) => (
                  <tr key={team.team_id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedTeams.includes(team.team_id)}
                        onChange={() => toggleSelectTeam(team.team_id)}
                      />
                    </td>
                    <td>
                      <strong>{team.team_name}</strong>
                      <p className="muted mono" style={{ fontSize: '0.75rem' }}>{team.team_id}</p>
                    </td>
                    <td><span className="mono" style={{ color: 'var(--accent-secondary)' }}>{team.active_puzzle_id || "-"}</span></td>
                    <td>
                      <span className={team.remaining_seconds <= 60 && !team.is_timer_paused ? "danger-text" : ""}>
                        {team.is_timer_paused ? "Paused" : formatTime(team.remaining_seconds)}
                      </span>
                    </td>
                    <td>{team.is_timer_paused ? "Paused" : "Active"}</td>
                    <td>{team.attempts}</td>
                    <td>{team.lifeline_remaining}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button className="btn btn-muted" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => skipPuzzle(team.team_id)}>
                          Skip
                        </button>
                        {team.is_timer_paused ? (
                          <button className="btn btn-outline" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => resumeTeam(team.team_id)}>
                            Resume
                          </button>
                        ) : (
                          <button className="btn btn-outline" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => pauseTeam(team.team_id)}>
                            Pause
                          </button>
                        )}
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
                        <button className="btn btn-muted" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => loadDetail(team.team_id)}>
                          Drilldown
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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

      {(detailLoading || detail) && (
        <section className="card" style={{ marginTop: '24px', padding: '24px' }}>
          <span className="eyebrow">Team Drilldown</span>
          {detailLoading && <p className="muted">Loading team insights...</p>}
          {detail && (
            <div className="grid-two" style={{ marginTop: '12px' }}>
              <div>
                <h3>{detail.team.team_name} <span className="mono muted">({detail.team.team_id})</span></h3>
                <p className="muted">Lifelines: {detail.lifeline?.lifeline_remaining ?? 0} remaining, used {detail.lifeline?.lifeline_used ?? 0}</p>
                <h4 style={{ marginTop: '12px' }}>Recent Assignments</h4>
                <ul className="muted" style={{ maxHeight: '160px', overflowY: 'auto' }}>
                  {detail.assignments.map((assignment) => (
                    <li key={`${assignment.puzzle_id}-${assignment.start_time}`}>
                      {assignment.puzzle_id} — {assignment.status} — {new Date(assignment.start_time).toLocaleTimeString()}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>Recent Submissions</h4>
                <ul className="muted" style={{ maxHeight: '140px', overflowY: 'auto' }}>
                  {detail.submissions.map((submission) => (
                    <li key={submission.timestamp}>
                      {submission.puzzle_id}: {submission.result} at {new Date(submission.timestamp).toLocaleTimeString()}
                    </li>
                  ))}
                </ul>
                <h4 style={{ marginTop: '12px' }}>Events</h4>
                <ul className="muted" style={{ maxHeight: '140px', overflowY: 'auto' }}>
                  {detail.events.map((event) => (
                    <li key={event.event_id || event.timestamp}>
                      {event.type} at {new Date(event.timestamp).toLocaleTimeString()}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
