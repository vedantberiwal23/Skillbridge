import { AssessmentView } from '@/components/worker/assessment-view';

export default async function AssessmentPage({
  params,
}: PageProps<'/assessment/[assessmentId]'>) {
  const { assessmentId } = await params;

  return <AssessmentView assessmentId={assessmentId} />;
}
