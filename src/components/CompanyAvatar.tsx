const AVATAR_COLORS = [
  "bg-brand-500",
  "bg-amber-500",
  "bg-teal-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-lime-500",
  "bg-orange-500",
];

// Deterministic (not random) so a given company always gets the same color
// across page loads/renders -- there are no real company logos here, so
// this is just a stable, recognizable stand-in.
function colorForTicker(ticker: string): string {
  let hash = 0;
  for (let i = 0; i < ticker.length; i++) hash = (hash * 31 + ticker.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}

export function CompanyAvatar({
  name,
  ticker,
  className = "h-12 w-12 text-xl",
}: {
  name: string;
  ticker: string;
  className?: string;
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-xl font-bold text-white ${colorForTicker(ticker)} ${className}`}
      aria-hidden
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
