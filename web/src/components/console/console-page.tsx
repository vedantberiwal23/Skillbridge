import { Loader2 } from 'lucide-react';

/** Page frame shared by every console screen. */
export function ConsolePage({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8">{children}</main>;
}

export function ConsoleHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="font-data text-xs uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</p>
        ) : null}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function ConsoleLoading() {
  return (
    <ConsolePage>
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground" aria-busy>
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
    </ConsolePage>
  );
}

export function ConsoleError({ message }: { message: string }) {
  return (
    <ConsolePage>
      <p role="alert" className="rounded-xl border border-danger/30 bg-danger-muted px-4 py-3 text-sm text-danger">
        {message}
      </p>
    </ConsolePage>
  );
}

export function ConsoleEmpty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <ConsolePage>
      <div className="mx-auto mt-10 max-w-md rounded-2xl border border-dashed border-border px-6 py-10 text-center">
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
        {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
      </div>
    </ConsolePage>
  );
}

/** Primary and secondary console buttons, so every screen's actions look the same. */
export const btn = {
  primary:
    'inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-5 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-60',
  secondary:
    'inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-5 text-base font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60',
  ghost:
    'inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-base font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60',
  danger:
    'inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-base font-medium text-danger transition-colors hover:bg-danger-muted disabled:opacity-60',
};

export const inputClass =
  'h-11 w-full rounded-xl border border-border bg-card px-4 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-primary';

/** The one card style for console sections: title row, optional actions, body. */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  ...rest
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={`rounded-2xl border border-border bg-card ${className ?? ''}`} {...rest}>
      {title ? (
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}
