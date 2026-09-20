import { notFound } from 'next/navigation';

import { LessonView } from '@/components/worker/lesson-view';
import { LESSONS_DATABASE } from '@/data/curriculum';

export default async function LessonPage({ params }: PageProps<'/lesson/[lessonId]'>) {
  const { lessonId } = await params;

  /**
   * No silent fallback.
   *
   * This used to resolve an unknown id to `lesson-hpu-startup`, so a link with
   * a typo — and there were three — opened the hydraulic power unit lesson
   * while claiming to be about mobile brakes or circuit breakers. Wrong content
   * presented as the right content is worse than a missing page, and it hid the
   * broken links instead of surfacing them.
   */
  const lesson = LESSONS_DATABASE[lessonId];

  if (!lesson) {
    notFound();
  }

  return <LessonView lesson={lesson} />;
}
