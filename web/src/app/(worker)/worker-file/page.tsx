import { WorkerFileDashboard } from '@/components/worker/worker-file-dashboard';

export const metadata = {
  title: 'Worker Qualification File & Dossier | SkillBridge',
  description: 'Official worker training dossier, competency matrix, hands-on SOP execution history, and verified industrial credentials.',
};

export default function WorkerFilePage() {
  return <WorkerFileDashboard initialWorkerId="u-ravi" isManagerView={false} />;
}
