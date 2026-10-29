import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { useAuth } from "./AuthContext";
import type { School, SchoolInput } from "../lib/types";

type SchoolsContextValue = {
  schools: School[];
  loading: boolean;
  selectedSchoolId: number | null;
  setSelectedSchoolId: (id: number) => void;
  selectedSchool: School | null;
  createSchool: (input: SchoolInput) => Promise<void>;
  updateSchool: (id: number, input: Partial<SchoolInput>) => Promise<void>;
  deleteSchool: (id: number) => Promise<void>;
};

const SchoolsContext = createContext<SchoolsContextValue | null>(null);

export function SchoolsProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | null>(null);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await api.getSchools(token);
      setSchools(res.schools);
      setSelectedSchoolId((current) => current ?? res.schools[0]?.id ?? null);
    } catch {
      setSchools([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const selectedSchool = useMemo(
    () => schools.find((s) => s.id === selectedSchoolId) ?? null,
    [schools, selectedSchoolId]
  );

  const createSchool = async (input: SchoolInput) => {
    if (!token) return;
    await api.createSchool(token, input);
    await load();
  };

  const updateSchool = async (id: number, input: Partial<SchoolInput>) => {
    if (!token) return;
    await api.updateSchool(token, id, input);
    await load();
  };

  const deleteSchool = async (id: number) => {
    if (!token) return;
    await api.deleteSchool(token, id);
    if (selectedSchoolId === id) setSelectedSchoolId(null);
    await load();
  };

  const value = useMemo(
    () => ({
      schools,
      loading,
      selectedSchoolId,
      setSelectedSchoolId,
      selectedSchool,
      createSchool,
      updateSchool,
      deleteSchool,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [schools, loading, selectedSchoolId, selectedSchool]
  );

  return <SchoolsContext.Provider value={value}>{children}</SchoolsContext.Provider>;
}

export function useSchools() {
  const ctx = useContext(SchoolsContext);
  if (!ctx) throw new Error("useSchools must be used within SchoolsProvider");
  return ctx;
}
