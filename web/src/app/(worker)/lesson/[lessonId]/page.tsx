import { notFound } from 'next/navigation';

import { LessonView } from '@/components/worker/lesson-view';
import { LESSONS_DATABASE } from '@/data/curriculum';

export default async function LessonPage({ params }: PageProps<'/lesson/[lessonId]'>) {
  const { lessonId } = await params;

  // Retrieve lesson from the industrial curriculum database, with safe fallback
  const lesson = LESSONS_DATABASE[lessonId] || LESSONS_DATABASE['lesson-hpu-startup'];

  if (!lesson) {
    notFound();
  }

  return <LessonView lesson={lesson} />;
}
