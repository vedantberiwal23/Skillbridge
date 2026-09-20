'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, CheckCircle2, Circle, PlayCircle, Bookmark } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { TRADES_CATALOG, LESSONS_DATABASE } from '@/data/curriculum';

function moduleMinutes(lessonId: string): number {
  return LESSONS_DATABASE[lessonId]?.estimatedMinutes ?? 15;
}

export default function CourseDetailPage({ params }: PageProps<'/learn/[tradeId]'>) {
  const { tradeId } = use(params);
  const trade = TRADES_CATALOG[tradeId];
  const [saved, setSaved] = useState(false);

  if (!trade) notFound();

  const allModules = trade.stages.flatMap((stage) => stage.items);
  const totalMinutes = allModules.reduce((sum, m) => sum + moduleMinutes(m.lessonId), 0);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  // "What you'll learn" — the objectives of the first lesson in each stage
  // read like a course-level summary, since each stage is built around one.
  const learnPoints = trade.stages
    .map((stage) => LESSONS_DATABASE[stage.items[0]?.lessonId]?.objectives?.[0])
    .filter((point): point is string => Boolean(point));

  return (
    <main className="mx-auto w-full max-w-2xl pb-8">
      <div className="flex items-center gap-3 px-4 pt-6">
        <Link
          href="/learn"
          aria-label="Back to Learn"
          className="-m-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-6" />
        </Link>
      </div>

      {/* ---- Hero ---- */}
      <div className="px-4 pt-2">
        <h1 className="text-2xl font-semibold leading-tight text-foreground">{trade.name}</h1>
        <p className="mt-1.5 text-sm font-medium text-muted-foreground">
          Beginner · {hours}h {minutes > 0 ? `${minutes}m` : ''} · {allModules.length} lessons
        </p>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">{trade.description}</p>

        <div className="mt-5 flex items-center gap-3">
          <Button
            nativeButton={false}
            render={<Link href={`/lesson/${allModules[0]?.lessonId}`} />}
            size="xl"
            className="flex-1"
          >
            Start Course
          </Button>
          <Button
            variant="outline"
            size="icon-lg"
            aria-pressed={saved}
            aria-label={saved ? 'Saved' : 'Save course'}
            onClick={() => setSaved((s) => !s)}
          >
            <Bookmark className={saved ? 'size-5 fill-primary text-primary' : 'size-5'} />
          </Button>
        </div>
      </div>

      {/* ---- What you'll learn ---- */}
      {learnPoints.length > 0 ? (
        <section className="mt-8 px-4">
          <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
            What you&rsquo;ll learn
          </h2>
          <ul className="mt-3 flex flex-col divide-y divide-border">
            {learnPoints.map((point) => (
              <li key={point} className="py-2.5 text-base leading-relaxed text-foreground">
                {point}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ---- Course content ---- */}
      <section className="mt-8 px-4">
        <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          Course content
        </h2>
        <div className="mt-3 flex flex-col gap-2">
          {allModules.map((module, index) => {
            const isDone = module.status === 'completed';
            return (
              <Link key={module.id} href={`/lesson/${module.lessonId}`}>
                <div className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40">
                  {isDone ? (
                    <CheckCircle2 className="size-5 shrink-0 text-success" />
                  ) : module.status === 'in-progress' ? (
                    <PlayCircle className="size-5 shrink-0 text-primary" />
                  ) : (
                    <Circle className="size-5 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-base font-medium ${
                        isDone ? 'text-muted-foreground line-through' : 'text-foreground'
                      }`}
                    >
                      {String(index + 1).padStart(2, '0')} — {module.title}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {moduleMinutes(module.lessonId)} min
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
