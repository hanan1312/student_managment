import { useEffect, useState } from "react";
import { api } from "./api";
import { useAuth } from "../context/AuthContext";
import type { Subject } from "./types";

// The full Time Table > Subjects catalog (unfiltered by level), shared by the Position tab's
// Teacher subject picker and the HR sidebar tree's per-subject grouping under the Teachers
// division, so both read the same live list instead of each fetching it separately. `refresh`
// lets a caller that just renamed/deleted a subject (e.g. the sidebar tree) pull the fresh list
// without waiting for a remount.
export function useSubjects(): { subjects: Subject[]; refresh: () => Promise<void> } {
  const { token } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const load = async () => {
    if (!token) return;
    try {
      const res = await api.getSubjects(token);
      setSubjects(res.subjects);
    } catch {
      setSubjects([]);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  return { subjects, refresh: load };
}
