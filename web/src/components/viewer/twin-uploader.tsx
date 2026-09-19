'use client';

import { useCallback, useRef, useState } from 'react';
import { Box, FileUp, Loader2, TriangleAlert, Check } from 'lucide-react';
import { MachineViewer } from '@/components/viewer/machine-viewer';
import type { MachineAsset } from '@/lib/types';

/**
 * Upload a machine file and get a twin back.
 *
 * This is the organisation-facing path: an admin brings their own machine into
 * SkillBridge rather than picking from a generic catalogue. Everything here goes
 * through `/api/twin`, which carries the session and hides the engine's address —
 * the browser never talks to the Machine Twin service directly.
 *
 * Two kinds of input, two different stages, and the difference is not cosmetic:
 *
 *   CAD (.step/.gltf/...)  an assembly that already *states* its parts, so the
 *                          twin comes back separable - explode, hide, internals.
 *   Photographs / video    reconstructs the outside of the real machine, and
 *                          arrives as a single merged surface.
 *
 * So the stage is chosen from what was actually uploaded rather than guessed,
 * and the result says which it was.
 */

const CAD_EXTENSIONS = ['.step', '.stp', '.gltf', '.glb', '.obj'] as const;
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.heic', '.mp4', '.mov'] as const;

const ACCEPT = [...CAD_EXTENSIONS, ...IMAGE_EXTENSIONS].join(',');

/** Photogrammetry needs a real walk-around; below this it cannot reconstruct. */
const MIN_PHOTOS = 24;

type Phase = 'idle' | 'creating' | 'uploading' | 'processing' | 'done' | 'error';

interface ComponentSummary {
  stable_id: string;
  label: string;
  validation_status: string;
}

interface StageError {
  code?: string;
  message?: string;
  remediation?: string;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

function isCad(files: File[]): boolean {
  return files.some((f) => (CAD_EXTENSIONS as readonly string[]).includes(extensionOf(f.name)));
}

const PHASE_LABEL: Record<Phase, string> = {
  idle: '',
  creating: 'Creating machine record',
  uploading: 'Uploading',
  processing: 'Building the twin',
  done: 'Twin ready',
  error: 'Failed',
};

export function TwinUploader() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [detail, setDetail] = useState('');
  const [error, setError] = useState<StageError | null>(null);
  const [asset, setAsset] = useState<MachineAsset | null>(null);
  const [components, setComponents] = useState<ComponentSummary[]>([]);
  const [selected, setSelected] = useState<ComponentSummary | null>(null);
  const [sourceKind, setSourceKind] = useState<'cad' | 'photogrammetry' | null>(null);

  const reset = () => {
    setPhase('idle');
    setDetail('');
    setError(null);
    setAsset(null);
    setComponents([]);
    setSelected(null);
    setSourceKind(null);
  };

  const process = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    const cad = isCad(files);
    setSourceKind(cad ? 'cad' : 'photogrammetry');
    setError(null);
    setAsset(null);
    setComponents([]);
    setSelected(null);

    // Refuse an unreconstructable photo set here rather than after a minute of
    // feature matching. The engine enforces this too; this is just faster.
    if (!cad && files.length < MIN_PHOTOS) {
      setPhase('error');
      setError({
        code: 'INSUFFICIENT_IMAGE_COUNT',
        message: `Only ${files.length} photographs selected.`,
        remediation:
          `Photogrammetry needs at least ${MIN_PHOTOS}, and about 36 gives a reliable ` +
          'result. Walk a full circle around the machine taking one photograph every ' +
          '10 degrees, keeping the whole machine in frame.',
      });
      return;
    }

    try {
      setPhase('creating');
      setDetail(files[0].name);
      const createRes = await fetch('/api/twin?action=create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: files[0].name.replace(/\.[^.]+$/, ''),
          machine_type: cad ? 'cad_assembly' : 'photogrammetry_capture',
        }),
      });
      if (!createRes.ok) throw new Error('Could not create the machine record.');
      const project = await createRes.json();

      setPhase('uploading');
      const form = new FormData();
      for (const file of files) form.append('files', file);
      const uploadRes = await fetch(`/api/twin?action=upload&projectId=${project.id}`, {
        method: 'POST',
        body: form,
      });
      if (!uploadRes.ok) throw new Error('Upload failed.');

      setPhase('processing');
      setDetail(cad ? 'Reading the assembly' : 'Solving camera positions');

      // CAD states its parts; photographs have to be reconstructed first. The
      // photogrammetry route runs two stages, so failures are reported against
      // whichever one actually stopped.
      const stages = cad ? ['cad'] : ['reconstruct', 'author'];
      for (const stage of stages) {
        if (stage === 'author') setDetail('Authoring the model');
        const stageRes = await fetch(
          `/api/twin?action=stage&projectId=${project.id}&stage=${stage}`,
          { method: 'POST' }
        );
        const outcome = await stageRes.json();
        if (!stageRes.ok) {
          // The engine returns a structured cause and a fix; surface both rather
          // than collapsing them into "something went wrong".
          setPhase('error');
          setError(outcome?.detail ?? { message: outcome?.error ?? 'The stage failed.' });
          return;
        }
      }

      const componentRes = await fetch(`/api/twin?action=components&projectId=${project.id}`);
      const parts: ComponentSummary[] = componentRes.ok ? await componentRes.json() : [];
      setComponents(parts);

      setAsset({
        orgId: 'local',
        assetId: project.id,
        name: project.name,
        glbUrl: `/api/twin?action=model&projectId=${project.id}&lod=0`,
        posterUrl: `/api/twin?action=poster&projectId=${project.id}`,
        hotspots: [],
      });
      setPhase('done');
      setDetail('');
    } catch (err) {
      setPhase('error');
      setError({ message: err instanceof Error ? err.message : 'Unexpected failure.' });
    }
  }, []);

  const busy = phase === 'creating' || phase === 'uploading' || phase === 'processing';

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-white">
              <Box className="h-4 w-4 text-blue-400" />
              Bring your own machine
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Upload a CAD assembly for a part-separated twin, or a photo walk-around
              to reconstruct the machine as it actually stands.
            </p>
          </div>
          {phase !== 'idle' && (
            <button
              type="button"
              onClick={reset}
              className="shrink-0 rounded-md border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
            >
              Start over
            </button>
          )}
        </div>

        <input
          ref={inputRef}
          id="twin-upload"
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            void process(files);
          }}
        />

        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 bg-slate-950/60 px-4 py-6 text-sm text-slate-300 transition hover:border-blue-500/60 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
          ) : (
            <FileUp className="h-5 w-5 text-blue-400" />
          )}
          <span>
            {busy ? PHASE_LABEL[phase] : 'Choose files'}
            {busy && detail ? <span className="text-slate-500"> &middot; {detail}</span> : null}
          </span>
        </button>

        <p className="mt-2 text-[11px] text-slate-500">
          CAD: {CAD_EXTENSIONS.join(' ')} &middot; Capture: {MIN_PHOTOS}+ photographs, or a
          walk-around video
        </p>

        {phase === 'error' && error && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-950/30 p-3">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div className="min-w-0">
              {error.code && (
                <div className="font-mono text-[11px] uppercase tracking-wide text-amber-300">
                  {error.code}
                </div>
              )}
              <p className="text-xs text-amber-100">{error.message}</p>
              {error.remediation && (
                <p className="mt-1.5 text-xs text-amber-200/80">{error.remediation}</p>
              )}
            </div>
          </div>
        )}

        {phase === 'done' && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3 text-xs text-emerald-200">
            <Check className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>
              {components.length} component{components.length === 1 ? '' : 's'} &middot;{' '}
              {sourceKind === 'cad'
                ? 'from the assembly’s own part structure'
                : 'reconstructed from photographs — a scan is one merged surface, so parts need review'}
            </span>
          </div>
        )}
      </div>

      {asset && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
          <MachineViewer asset={asset} onPartSelected={() => undefined} />

          {components.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Components ({components.length})
              </h4>
              <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
                {components.map((component) => (
                  <button
                    key={component.stable_id}
                    type="button"
                    onClick={() => setSelected(component)}
                    className={`rounded-md border px-2 py-1 font-mono text-[10px] transition ${
                      selected?.stable_id === component.stable_id
                        ? 'border-blue-400 bg-blue-950/60 text-blue-200'
                        : 'border-slate-700 bg-slate-950/60 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    {component.stable_id.replace('SKB_COMPONENT_', '')}
                  </button>
                ))}
              </div>

              {selected && (
                <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs">
                  <dt className="text-slate-500">ID</dt>
                  <dd className="font-mono text-slate-200">{selected.stable_id}</dd>
                  <dt className="text-slate-500">Label</dt>
                  <dd className="text-slate-200">{selected.label}</dd>
                  <dt className="text-slate-500">Status</dt>
                  <dd className="text-amber-300">{selected.validation_status}</dd>
                </dl>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
