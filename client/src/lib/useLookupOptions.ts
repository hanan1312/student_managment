import { useEffect, useState } from "react";
import { api } from "./api";
import { useAuth } from "../context/AuthContext";
import type { HrLookupItem } from "./types";

// A generic hr_lookup_items category (Country/Area/Education/University/Bank/Department/...).
// `perSchool` categories (e.g. "outside_employee", "message") are scoped to the given school;
// every other category is global, matching server/src/routes/hrConfiguration.ts's GET handler.
// `refresh` lets a caller that just renamed/deleted an item (e.g. the sidebar tree) pull the
// fresh list without waiting for a remount.
export function useLookupOptions(
  category: string,
  schoolId: number | null,
  perSchool = false
): { options: HrLookupItem[]; refresh: () => Promise<void> } {
  const { token } = useAuth();
  const [options, setOptions] = useState<HrLookupItem[]>([]);
  const load = async () => {
    if (!token) return;
    try {
      const res = await api.getHrLookup(token, category as any, perSchool ? schoolId ?? undefined : undefined);
      setOptions(res.items);
    } catch {
      setOptions([]);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, category, schoolId, perSchool]);
  return { options, refresh: load };
}
