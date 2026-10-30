import { Navigate, useLocation } from "react-router-dom";
import { EyeOff } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useUiControl } from "../lib/uiControl";

// A tab hidden in التحكم: go to the first tab this user can open, or say it isn't available.
export default function HiddenTab() {
  const { hasModule } = useAuth();
  const ui = useUiControl();
  const { pathname } = useLocation();
  const fallback = ui.tabs.find(
    (t) => t.inNav && t.path !== pathname && ui.isTabVisible(t.key) && (t.custom || hasModule(t.key))
  );
  if (fallback) return <Navigate to={fallback.path} replace />;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <EyeOff size={22} />
      </span>
      <p className="text-sm font-medium text-slate-600">هذا القسم غير متاح حاليًا.</p>
    </div>
  );
}
