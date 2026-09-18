'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, ArrowRight } from 'lucide-react';

import { GlobeSection } from '@/components/visual/globe-section';
import { TRADES_CATALOG, type TradeTrack } from '@/data/curriculum';

/**
 * One label per category, reused everywhere a trade is shown. Keeping this
 * in one map is what stops five different screens from calling the same
 * trade five different things.
 */
const CATEGORY_META: Record<string, { label: string }> = {
  hydraulics: { label: 'Hydraulics' },
  electrical: { label: 'Electrical' },
  mobile: { label: 'Mechanical' },
  stationary: { label: 'Safety' },
  automation: { label: 'Automation' },
};

function moduleCount(trade: TradeTrack): number {
  return trade.stages.reduce((sum, stage) => sum + stage.items.length, 0);
}

function estimatedHours(trade: TradeTrack): number {
  // ~15 min/module is the average lesson length across curriculum.ts.
  return Math.round((moduleCount(trade) * 15) / 60);
}

export default function LearnPage() {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const trades = Object.values(TRADES_CATALOG);

  const filtered = useMemo(() => {
    return trades.filter((trade) => {
      const matchesCategory = !activeCategory || trade.id === activeCategory;
      const matchesQuery =
        query.trim().length === 0 ||
        trade.name.toLowerCase().includes(query.toLowerCase()) ||
        trade.description.toLowerCase().includes(query.toLowerCase());
      return matchesCategory && matchesQuery;
    });
  }, [trades, activeCategory, query]);

  return (
    <>
    <main className="mx-auto flex max-w-lg flex-col gap-6 px-4 pt-8 pb-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">What do you want to learn?</h1>
      </div>

      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search skills, courses..."
          className="h-12 w-full rounded-xl border border-border bg-card pl-11 pr-4 text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
        />
      </div>

      {/* Category tabs — an underline, not a row of coloured pills. Five
          filter states don't need five accent colours to be legible; they
          need to look like part of the page, not a component-library demo. */}
      <div className="-mx-5 flex gap-5 overflow-x-auto border-b border-border px-5">
        <CategoryTab
          label="All"
          active={activeCategory === null}
          onClick={() => setActiveCategory(null)}
        />
        {trades.map((trade) => {
          const meta = CATEGORY_META[trade.id];
          return (
            <CategoryTab
              key={trade.id}
              label={meta?.label ?? trade.name}
              active={activeCategory === trade.id}
              onClick={() => setActiveCategory(trade.id)}
            />
          );
        })}
      </div>

      <div className="flex flex-col divide-y divide-border">
        {filtered.length === 0 ? (
          <p className="py-10 text-center text-base text-muted-foreground">
            No courses match &ldquo;{query}&rdquo;.
          </p>
        ) : (
          filtered.map((trade) => <CourseCard key={trade.id} trade={trade} />)
        )}
      </div>
    </main>

    {/* Full-bleed statement section — deliberately breaks out of the app's
        max-w-lg mobile column, same component used on /welcome. The globe
        animation itself only mounts at >=768px (see GlobeSection); on a
        phone this renders as a static dark banner with the heading. */}
    <GlobeSection
      eyebrow="Coverage"
      heading="Five trades, trained end to end, on one platform"
    />
    </>
  );
}

function CategoryTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap border-b-2 py-3 text-sm font-medium transition-colors ${
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

function CourseCard({ trade }: { trade: TradeTrack }) {
  const modules = moduleCount(trade);
  const hours = estimatedHours(trade);

  return (
    <Link href={`/learn/${trade.id}`} className="group flex items-start gap-3 py-5">
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold text-foreground">{trade.name}</p>
        <p className="font-data mt-1 text-xs uppercase tracking-wide text-muted-foreground">
          Beginner · {hours}h · {modules} lessons
        </p>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {trade.description}
        </p>
      </div>
      <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
