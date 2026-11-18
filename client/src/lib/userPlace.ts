import { useAuth } from "../context/AuthContext";
import { useSchools } from "../context/SchoolsContext";

// The one value every school has, if they all share it (e.g. one إدارة for the whole app).
function shared(values: (string | null | undefined)[]): string {
  const set = new Set(values.map((v) => v?.trim()).filter((v): v is string => Boolean(v)));
  return set.size === 1 ? [...set][0] : "";
}

// The signed-in user's محافظة and إدارة تعليمية (المستخدمين), for the home page's welcome text and
// the top right of every printout. An account without them (e.g. the admin) takes the ones all
// schools share, if they share one.
export function useUserPlace(): { governorate: string; admin: string } {
  const { user } = useAuth();
  const { schools } = useSchools();
  return {
    governorate: user?.city_name?.trim() || shared(schools.map((s) => s.city_name)),
    admin: user?.education_admin_name?.trim() || shared(schools.map((s) => s.education_admin_name)),
  };
}
