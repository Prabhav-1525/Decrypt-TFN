import { createContext, useContext, useEffect, useMemo, useState } from "react";
import api, { setAuthToken } from "../services/api";

const AuthContext = createContext(null);

const STORAGE_KEY = "puzzle-platform-auth";
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;
const AUTO_REFRESH_BUFFER_MS = 2 * 60 * 1000;

function buildAuthState(data) {
  return {
    token: data.token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    refresh_expires_at: data.refresh_expires_at,
    team: data.team
  };
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const [isAuthChecked, setIsAuthChecked] = useState(false);

  useEffect(() => {
    let active = true;

    const refreshIfNeeded = async () => {
      if (!auth?.token) {
        if (active) {
          setIsAuthChecked(true);
        }
        return;
      }

      setAuthToken(auth.token);
      const now = Date.now();
      const expiresAt = auth.expires_at ? new Date(auth.expires_at).getTime() : 0;
      const shouldRefresh = auth.refresh_token && expiresAt > 0 && expiresAt - now < REFRESH_THRESHOLD_MS;

      try {
        if (shouldRefresh) {
          const response = await api.post("/auth/refresh", { refreshToken: auth.refresh_token });
          const nextAuth = buildAuthState(response.data);
          if (active) {
            setAuth(nextAuth);
            setAuthToken(nextAuth.token);
          }
        } else {
          await api.get("/auth/validate");
        }
      } catch {
        if (active) {
          setAuth(null);
        }
      } finally {
        if (active) {
          setIsAuthChecked(true);
        }
      }
    };

    refreshIfNeeded();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (auth?.token) {
      setAuthToken(auth.token);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
      return;
    }

    setAuthToken(null);
    localStorage.removeItem(STORAGE_KEY);
  }, [auth]);

  useEffect(() => {
    if (!auth?.expires_at || !auth?.refresh_token) {
      return undefined;
    }

    const expiresMs = new Date(auth.expires_at).getTime();
    const refreshAfter = Math.max(expiresMs - Date.now() - AUTO_REFRESH_BUFFER_MS, 0);
    if (refreshAfter <= 0) {
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        const response = await api.post("/auth/refresh", { refreshToken: auth.refresh_token });
        setAuth(buildAuthState(response.data));
      } catch {
        setAuth(null);
      }
    }, refreshAfter);

    return () => clearTimeout(timer);
  }, [auth?.expires_at, auth?.refresh_token]);

  const loginTeam = async (teamId, password, isAdmin = false) => {
    const endpoint = isAdmin ? "/auth/admin-login" : "/auth/login";
    const response = await api.post(endpoint, { teamId, password });
    setAuth(buildAuthState(response.data));
    return response.data;
  };

  const logout = async () => {
    try {
      if (auth?.token) {
        setAuthToken(auth.token);
        await api.post("/auth/logout", { refreshToken: auth?.refresh_token });
      }
    } catch {
      // ignore logout errors for client hygiene
    } finally {
      setAuth(null);
    }
  };

  const refreshSession = async () => {
    if (!auth?.refresh_token) return null;
    const response = await api.post("/auth/refresh", { refreshToken: auth.refresh_token });
    const next = buildAuthState(response.data);
    setAuth(next);
    return next;
  };

  const value = useMemo(
    () => ({
      auth,
      loginTeam,
      logout,
      refreshSession,
      isAuthenticated: Boolean(auth?.token),
      isAdmin: Boolean(auth?.team?.is_admin),
      isAuthChecked
    }),
    [auth, isAuthChecked]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
