import { cn } from 'cn';

/**
 * Progress ring for report numbers. One hue on a neutral track: the brand
 * green for normal values, red only when `alert` says the number needs action,
 * so colour on a report always means something.
 */
export function Ring({
  value,
  size = 72,
  stroke = 7,
  label,
  sublabel,
  alert = false,
  className,
}: {
  /** 0–100, or null when there is nothing to measure yet. */
  value: number | null;
  size?: number;
  stroke?: number;
  label?: string;
  sublabel?: string;
  alert?: boolean;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  const text = value === null ? '—' : `${Math.round(pct)}%`;

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${label ?? 'Progress'}: ${text}`}
        className="shrink-0 -rotate-90"
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={alert ? 'var(--danger)' : 'var(--primary)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          transform={`rotate(90 ${size / 2} ${size / 2})`}
          className="fill-foreground font-data font-semibold"
          style={{ fontSize: size * 0.22 }}
        >
          {text}
        </text>
      </svg>
      {label ? (
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{label}</p>
          {sublabel ? <p className="mt-0.5 text-xs text-muted-foreground">{sublabel}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
