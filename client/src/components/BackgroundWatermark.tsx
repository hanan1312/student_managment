type Props = {
  src?: string | null;
  opacity?: number;
  className?: string;
};

export default function BackgroundWatermark({ src, opacity = 0.08, className = "" }: Props) {
  if (!src) return null;
  return (
    <div
      className={`pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <img
        src={src}
        alt=""
        className="animate-fade-in max-h-[min(60vh,640px)] max-w-[min(60vw,720px)] object-contain [image-rendering:auto] [filter:saturate(1.05)_contrast(1.02)]"
        style={{ opacity }}
        draggable={false}
      />
    </div>
  );
}
