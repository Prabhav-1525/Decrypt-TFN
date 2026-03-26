import { createContext, useContext, useEffect, useMemo, useState } from "react";
import api, { setAuthToken } from "../services/api";

const AuthContext = createContext(null);

const STORAGE_KEY = "puzzle-platform-auth";

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const [isAuthChecked, setIsAuthChecked] = useState(false);

  useEffect(() => {
    let active = true;

    const validate = async () => {
      if (!auth?.token) {
        if (active) {
          setIsAuthChecked(true);
        }
        return;
      }

      setAuthToken(auth.token);

      try {
        const response = await api.get("/auth/validate");
        const refresh = await api.post("/auth/refresh");
        if (active) {
          setAuth({
            token: refresh.data.token,
            team: response.data.team
          });
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

    validate();
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

  const loginTeam = async (teamId, password, isAdmin = false) => {
    const endpoint = isAdmin ? "/auth/admin-login" : "/auth/login";
    const response = await api.post(endpoint, { teamId, password });
    setAuth({
      token: response.data.token,
      team: response.data.team
    });
    return response.data;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // best-effort
    }
    setAuth(null);
  };

  const value = useMemo(
    () => ({
      auth,
      loginTeam,
      logout,
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
