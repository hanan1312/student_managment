import { Link, useParams } from "react-router-dom";
import { FileText } from "lucide-react";
import HiddenTab from "../components/HiddenTab";
import { useUiControl } from "../lib/uiControl";

// A tab added in التحكم: its title, its text, and links to the tabs it is related to (the one it
// follows and the ones that follow it).
export default function CustomTabPage() {
  const { key } = useParams();
  const ui = useUiControl();
  const tab = ui.config.customTabs.find((c) => c.key === key);
  if (!tab || !ui.isTabVisible(tab.key)) return <HiddenTab />;

  const parentKey = ui.config.tabs[tab.key]?.parent;
  const related = ui.tabs.filter(
    (t) =>
      (t.key === parentKey || ui.config.tabs[t.key]?.parent === tab.key) && t.key !== tab.key && ui.isTabVisible(t.key)
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
        <FileText size={15} className="text-brand-500" />
        <span className="font-medium text-slate-700">{ui.tabLabel(tab.key)}</span>
      </div>
      <div className="flex-1 space-y-4 overflow-auto px-4 py-6">
        <div className="max-w-3xl whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-5 text-sm leading-7 text-slate-700 shadow-sm">
          {tab.body.trim() || <span className="text-slate-400">لا يوجد محتوى بعد.</span>}
        </div>
        {related.length > 0 && (
          <div className="flex max-w-3xl flex-wrap items-center gap-2 text-sm">
            <span className="text-xs font-semibold text-slate-500">تبويبات مرتبطة:</span>
            {related.map((t) => (
              <Link
                key={t.key}
                to={t.path}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-600 hover:border-brand-300 hover:text-brand-700"
              >
                <t.icon size={14} />
                {t.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
