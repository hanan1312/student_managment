import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { useAuth } from "./AuthContext";
import type { SchoolSettings } from "../lib/types";
import { applyThemePalette } from "../lib/themePalettes";

type SettingsContextValue = {
  settings: SchoolSettings;
  loading: boolean;
  setSettings: (settings: SchoolSettings) => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [settings, setSettings] = useState<SchoolSettings>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api
      .getSettings(token)
      .then((res) => setSettings(res.settings))
      .catch(() => setSettings({}))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    applyThemePalette(settings.theme_palette);
  }, [settings.theme_palette]);

  const value = useMemo(() => ({ settings, loading, setSettings }), [settings, loading]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
