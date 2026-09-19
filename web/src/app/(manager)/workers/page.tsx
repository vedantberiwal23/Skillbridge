import { WorkerFileDashboard } from '@/components/worker/worker-file-dashboard';

export const metadata = {
  title: 'Worker Qualification Dossier & Management Console | SkillBridge',
  description: 'Manage worker personnel files, track trade competency metrics, verify SOP executions, and log supervisory sign-offs.',
};

export default function ManagerWorkersPage() {
  return <WorkerFileDashboard initialWorkerId="u-ravi" isManagerView={true} />;
}
