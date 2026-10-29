import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { useAuth } from "./AuthContext";
import { useSchools } from "./SchoolsContext";
import type { HrEmployee } from "../lib/types";

type HrEmployeesContextValue = {
  employees: HrEmployee[];
  loading: boolean;
  refresh: () => Promise<void>;
};

const HrEmployeesContext = createContext<HrEmployeesContextValue | null>(null);

export function HrEmployeesProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const { selectedSchoolId } = useSchools();
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!token || !selectedSchoolId) {
      setEmployees([]);
      return;
    }
    setLoading(true);
    try {
      const res = await api.getHrEmployees(token, { schoolId: selectedSchoolId });
      setEmployees(res.employees);
    } catch {
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedSchoolId]);

  const value = useMemo(() => ({ employees, loading, refresh: load }), [employees, loading]);

  return <HrEmployeesContext.Provider value={value}>{children}</HrEmployeesContext.Provider>;
}

export function useHrEmployees() {
  const ctx = useContext(HrEmployeesContext);
  if (!ctx) throw new Error("useHrEmployees must be used within HrEmployeesProvider");
  return ctx;
}
