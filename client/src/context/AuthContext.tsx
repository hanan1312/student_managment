import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError, setSessionExpiredHandler } from "../lib/api";
import type { User } from "../lib/types";

// Matches the margins presence.ts sizes its offline threshold around — not imported directly
// since client and server are separate bundles, just kept in step by convention.
const HEARTBEAT_INTERVAL_MS = 20_000;
const IDLE_AFTER_MS = 3 * 60_000;
const ACTIVITY_EVENTS = ["mousemove", "keydown", "scroll", "click", "touchstart"] as const;

type AuthContextValue = {
  user: User | null;
  token: string | null;
  loading: boolean;
  bootstrapping: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hasModule: (key: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "eduapp.auth";

function loadStored(): { user: User | null; token: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { user: null, token: null };
    const parsed = JSON.parse(raw);
    return { user: parsed.user ?? null, token: parsed.token ?? null };
  } catch {
    return { user: null, token: null };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const stored = loadStored();
  const [user, setUser] = useState<User | null>(stored.user);
  const [token, setToken] = useState<string | null>(stored.token);
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(Boolean(stored.token));
  const [error, setError] = useState<string | null>(null);

  const login = async (username: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.login(username, password);
      setUser(res.user);
      setToken(res.token);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: res.user, token: res.token }));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unable to reach the server";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    const outgoingToken = token;
    setUser(null);
    setToken(null);
    localStorage.removeItem(STORAGE_KEY);
    // Best-effort: if this fails (offline, server down) presence just self-corrects once
    // heartbeats stop arriving (see presence.ts's stale-heartbeat reconciliation).
    if (outgoingToken) api.logout(outgoingToken).catch(() => {});
  };

  useEffect(() => {
    setSessionExpiredHandler(() => {
      logout();
      setError("Your session has expired. Please sign in again.");
    });
    return () => setSessionExpiredHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-validate the stored token against the server on load, rather than trusting it
  // blindly — this also picks up a role/permissions change made since the last login.
  useEffect(() => {
    if (!stored.token) return;
    api
      .getMe(stored.token)
      .then((res) => {
        setUser(res.user);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ user: res.user, token: stored.token }));
      })
      .catch(() => {
        // A 401 already triggers the sessionExpiredHandler above; other failures
        // (e.g. offline) just fall back to the locally-cached user for this session.
      })
      .finally(() => setBootstrapping(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tracks real user activity (not just "tab is open") so the Control page's presence view
  // can tell idle apart from online — reported to the server on each heartbeat rather than
  // computed there, since the server has no visibility into mouse/keyboard events.
  const lastActivityRef = useRef(Date.now());
  useEffect(() => {
    const markActive = () => {
      lastActivityRef.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, markActive, { passive: true }));
    return () => ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, markActive));
  }, []);

  useEffect(() => {
    if (!token) return;
    const sendHeartbeat = () => {
      const idle = Date.now() - lastActivityRef.current > IDLE_AFTER_MS;
      api.heartbeat(token, idle).catch(() => {});
    };
    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [token]);

  const hasModule = (key: string) => user?.role === "admin" || Boolean(user?.modules?.includes(key));

  const value = useMemo(
    () => ({ user, token, loading, bootstrapping, error, login, logout, hasModule }),
    [user, token, loading, bootstrapping, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
