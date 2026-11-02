import { Star } from "lucide-react";

export default function StarRating({ value }: { value: number }) {
  return (
    <span
      className="inline-flex flex-wrap items-center gap-2"
      aria-label={`${value.toFixed(1)} out of 5 stars`}
    >
      <span className="inline-flex gap-0.5" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => (
          <span className="relative inline-block size-4" key={index}>
            <Star className="size-4 text-slate-300" />
            <span
              className="absolute inset-y-0 left-0 overflow-hidden"
              style={{
                width: `${Math.max(0, Math.min(1, value - index)) * 100}%`,
              }}
            >
              <Star className="size-4 max-w-none fill-amber-400 text-amber-400" />
            </span>
          </span>
        ))}
      </span>
      <span className="text-sm font-semibold text-slate-800" aria-hidden="true">
        {value.toFixed(1)}/5
      </span>
    </span>
  );
}
