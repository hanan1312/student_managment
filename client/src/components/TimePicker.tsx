import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Clock } from "lucide-react";

const HOUR_VALUES = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12, clock-face order
const MINUTE_TICKS = Array.from({ length: 12 }, (_, i) => i * 5); // 00,05,...,55

const FACE_SIZE = 220;
const CENTER = FACE_SIZE / 2;
const NUMBER_RADIUS = 82;
const HIT_RADIUS = 18;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function parseValue(value: string): { hour12: number; minute: number; period: "AM" | "PM" } {
  const [hStr, mStr] = value.split(":");
  const h24 = Number(hStr) || 0;
  const minute = Number(mStr) || 0;
  const period: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  let hour12 = h24 % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, minute, period };
}

function toValue(hour12: number, minute: number, period: "AM" | "PM"): string {
  let h24 = hour12 % 12;
  if (period === "PM") h24 += 12;
  return `${pad(h24)}:${pad(minute)}`;
}

function formatDisplay(value: string): string {
  if (!value) return "--:-- --";
  const { hour12, minute, period } = parseValue(value);
  return `${pad(hour12)}:${pad(minute)} ${period}`;
}

// Angle convention throughout: 0deg = 12 o'clock position, increasing clockwise — matches how
// a real clock face reads, and how hour/minute values map onto it (30deg/hour, 6deg/minute).
function angleFor(value: number, unitsPerTurn: number): number {
  return (value % unitsPerTurn) * (360 / unitsPerTurn);
}

function pointToXY(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CENTER + radius * Math.sin(rad), y: CENTER - radius * Math.cos(rad) };
}

function xyToAngle(x: number, y: number): number {
  const dx = x - CENTER;
  const dy = CENTER - y;
  let angle = (Math.atan2(dx, dy) * 180) / Math.PI;
  if (angle < 0) angle += 360;
  return angle;
}

function AnalogClockFace({
  mode,
  hour12,
  minute,
  onPick,
  onRelease,
}: {
  mode: "hour" | "minute";
  hour12: number;
  minute: number;
  onPick: (value: number) => void;
  onRelease: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);

  const valueFromPointer = (clientX: number, clientY: number): number => {
    const rect = svgRef.current!.getBoundingClientRect();
    const scale = FACE_SIZE / rect.width;
    const x = (clientX - rect.left) * scale;
    const y = (clientY - rect.top) * scale;
    const angle = xyToAngle(x, y);
    if (mode === "hour") {
      const raw = Math.round(angle / 30) % 12;
      return raw === 0 ? 12 : raw;
    }
    return Math.round(angle / 6) % 60;
  };

  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragging(true);
    onPick(valueFromPointer(e.clientX, e.clientY));
  };
  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragging) return;
    onPick(valueFromPointer(e.clientX, e.clientY));
  };
  const handlePointerUp = () => {
    setDragging(false);
    onRelease();
  };

  const current = mode === "hour" ? hour12 === 12 ? 0 : hour12 : minute;
  const unitsPerTurn = mode === "hour" ? 12 : 60;
  const handAngle = angleFor(current, unitsPerTurn);
  const handTip = pointToXY(handAngle, NUMBER_RADIUS);
  const ticks = mode === "hour" ? HOUR_VALUES : MINUTE_TICKS;
  // Only highlights a tick label when the minute lands exactly on one of the 5-minute marks —
  // a dragged, in-between minute just shows the hand pointing between two labels instead.
  const activeValue = mode === "hour" ? hour12 : minute % 5 === 0 ? minute : -1;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${FACE_SIZE} ${FACE_SIZE}`}
      width={FACE_SIZE}
      height={FACE_SIZE}
      className="touch-none select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <circle cx={CENTER} cy={CENTER} r={CENTER - 2} className="fill-slate-50" stroke="#e2e8f0" />
      <line
        x1={CENTER}
        y1={CENTER}
        x2={handTip.x}
        y2={handTip.y}
        stroke="currentColor"
        strokeWidth={2}
        className="text-brand-500"
      />
      <circle cx={handTip.x} cy={handTip.y} r={16} className="fill-brand-600/90" />
      <circle cx={CENTER} cy={CENTER} r={4} className="fill-brand-700" />
      {ticks.map((v) => {
        const angle = angleFor(mode === "hour" ? (v === 12 ? 0 : v) : v, unitsPerTurn);
        const { x, y } = pointToXY(angle, NUMBER_RADIUS);
        const isActive = v === activeValue;
        return (
          <g key={v}>
            <circle cx={x} cy={y} r={HIT_RADIUS} className="fill-transparent" />
            <text
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="central"
              className={`pointer-events-none select-none text-[15px] font-medium ${
                isActive ? "fill-white" : "fill-slate-600"
              }`}
            >
              {mode === "minute" ? pad(v) : v}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function TimePicker({
  value,
  onChange,
  className = "",
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [mode, setMode] = useState<"hour" | "minute">("hour");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const { hour12, minute, period } = parseValue(value || "00:00");

  useEffect(() => {
    if (!open) return;
    const closeIfOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", closeIfOutside);
    return () => document.removeEventListener("mousedown", closeIfOutside);
  }, [open]);

  const openPicker = () => {
    if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    setMode("hour");
    setOpen(true);
  };

  const set = (next: Partial<{ hour12: number; minute: number; period: "AM" | "PM" }>) => {
    onChange(toValue(next.hour12 ?? hour12, next.minute ?? minute, next.period ?? period));
  };

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        onClick={openPicker}
        disabled={disabled}
        className={`flex items-center justify-between gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-sm text-slate-700 outline-none transition hover:border-brand-300 focus:border-brand-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 disabled:hover:border-slate-200 ${className}`}
      >
        <span>{formatDisplay(value)}</span>
        <Clock size={13} className="shrink-0 text-slate-400" />
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ position: "fixed", top: rect.bottom + 6, left: rect.left }}
            className="animate-scale-in z-50 w-[260px] origin-top-left rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl ring-1 ring-black/5"
          >
            <div className="mb-3 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setMode("hour")}
                className={`rounded-lg px-2.5 py-1.5 text-2xl font-semibold transition ${
                  mode === "hour" ? "bg-brand-600 text-white" : "text-slate-400 hover:bg-slate-100"
                }`}
              >
                {pad(hour12)}
              </button>
              <span className="text-2xl font-semibold text-slate-300">:</span>
              <button
                type="button"
                onClick={() => setMode("minute")}
                className={`rounded-lg px-2.5 py-1.5 text-2xl font-semibold transition ${
                  mode === "minute" ? "bg-brand-600 text-white" : "text-slate-400 hover:bg-slate-100"
                }`}
              >
                {pad(minute)}
              </button>
              <div className="ml-1 flex flex-col overflow-hidden rounded-lg border border-slate-200 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => set({ period: "AM" })}
                  className={`px-2 py-1 transition ${period === "AM" ? "bg-brand-600 text-white" : "text-slate-400 hover:bg-slate-50"}`}
                >
                  AM
                </button>
                <button
                  type="button"
                  onClick={() => set({ period: "PM" })}
                  className={`px-2 py-1 transition ${period === "PM" ? "bg-brand-600 text-white" : "text-slate-400 hover:bg-slate-50"}`}
                >
                  PM
                </button>
              </div>
            </div>

            <div className="flex justify-center">
              <AnalogClockFace
                mode={mode}
                hour12={hour12}
                minute={minute}
                onPick={(v) => set(mode === "hour" ? { hour12: v === 0 ? 12 : v } : { minute: v })}
                onRelease={() => {
                  if (mode === "hour") setMode("minute");
                }}
              />
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:-translate-y-0.5"
              >
                Done
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
