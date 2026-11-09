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
      // The opacity sits on the wrapper: the image's fade-in animation ends at opacity 1 and would
      // override it on the image itself.
      style={{ opacity }}
      aria-hidden="true"
    >
      <img
        src={src}
        alt=""
        className="animate-fade-in max-h-[min(60vh,640px)] max-w-[min(60vw,720px)] object-contain [image-rendering:auto] [filter:saturate(1.05)_contrast(1.02)]"
        draggable={false}
      />
    </div>
  );
}
