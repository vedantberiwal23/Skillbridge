'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

const SUPPORTED = [...CAD_EXTENSIONS, ...IMAGE_EXTENSIONS] as readonly string[];

/**
 * The file dialog is deliberately NOT restricted to those extensions.
 *
 * macOS resolves an `accept` list into system file types, and it recognises
 * neither `.step` nor `.gltf` - so Finder greys those files out and an admin
 * simply cannot pick the CAD file they were asked for. The browser never sees
 * it, so there is nothing to report either.
 *
 * Validation happens below instead, where an unsupported file produces a message
 * naming what is supported rather than a dialog that silently refuses to select.
 */

const TRANSPARENT_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

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

/** Self-contained mesh formats the browser can render with no backend at all. */
const BROWSER_RENDERABLE = ['.glb', '.gltf'] as const;

/**
 * Read the part names out of a glTF or GLB in the browser.
 *
 * A GLB is a 12-byte header followed by a JSON chunk; a .gltf is that JSON
 * directly. Either way the node names are right there, so a CAD assembly can be
 * listed and rendered without the engine ever being involved. That matters
 * because the engine is a local service: it is not reachable from a deployed
 * app, and a model the browser can already draw should not depend on it.
 */
async function readGltfParts(file: File): Promise<string[]> {
  try {
    let json: { nodes?: { name?: string }[] };
    if (file.name.toLowerCase().endsWith('.glb')) {
      const buffer = await file.arrayBuffer();
      const view = new DataView(buffer);
      if (view.getUint32(0, true) !== 0x46546c67) return [];
      const jsonLength = view.getUint32(12, true);
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
    } else {
      json = JSON.parse(await file.text());
    }
    return (json.nodes ?? [])
      .map((node) => node.name ?? '')
      .filter((name) => name.startsWith('SKB_COMPONENT_'));
  } catch {
    return [];
  }
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

export interface TwinUploaderProps {
  /**
   * Called once a twin exists. The Studio uses it to make the uploaded machine
   * the one on screen — and therefore the one the voice tutor is asked about.
   * Without it an admin uploads a compressor, asks "what is this?", and is
   * answered about whichever machine the viewer still holds.
   */
  onTwinReady?: (asset: MachineAsset) => void;
}

export function TwinUploader({ onTwinReady }: TwinUploaderProps = {}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [detail, setDetail] = useState('');
  const [error, setError] = useState<StageError | null>(null);
  const [asset, setAsset] = useState<MachineAsset | null>(null);
  // Read through a ref so the upload callback does not have to list it as a
  // dependency and be rebuilt on every render.
  const onTwinReadyRef = useRef(onTwinReady);
  useEffect(() => {
    onTwinReadyRef.current = onTwinReady;
  }, [onTwinReady]);
  const [components, setComponents] = useState<ComponentSummary[]>([]);
  const [selected, setSelected] = useState<ComponentSummary | null>(null);
  const [sourceKind, setSourceKind] = useState<'cad' | 'photogrammetry' | null>(null);
  /** True when the model was rendered in the browser without the engine. */
  const [localOnly, setLocalOnly] = useState(false);

  const reset = () => {
    setPhase('idle');
    setDetail('');
    setError(null);
    setAsset(null);
    setComponents([]);
    setSelected(null);
    setSourceKind(null);
    setLocalOnly(false);
  };

  const process = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    const unsupported = files.filter(
      (file) => !SUPPORTED.includes(extensionOf(file.name))
    );
    if (unsupported.length > 0) {
      setPhase('error');
      setError({
        code: 'UNSUPPORTED_FILE_TYPE',
        message: `Cannot read ${unsupported.map((f) => f.name).join(', ')}.`,
        remediation:
          `CAD: ${CAD_EXTENSIONS.join(' ')}. ` +
          `Capture: ${IMAGE_EXTENSIONS.join(' ')}.`,
      });
      return;
    }

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

    // The engine adds levels of detail, a poster and a stored project. None of
    // that is needed to *show* a self-contained model, so when it cannot be
    // reached - which is the normal case on a deployed app, since it is a local
    // service - a glTF or GLB is rendered directly instead of failing.
    const renderable =
      files.length === 1 &&
      (BROWSER_RENDERABLE as readonly string[]).includes(extensionOf(files[0].name));

    let engineUp = false;
    try {
      const probe = await fetch('/api/twin?action=capabilities');
      engineUp = probe.ok;
    } catch {
      engineUp = false;
    }

    if (!engineUp) {
      if (!renderable) {
        setPhase('error');
        setError({
          code: 'ENGINE_UNAVAILABLE',
          message: 'The Machine Twin engine is not reachable from here.',
          remediation:
            'STEP files and photo reconstruction are processed by the engine. ' +
            'Upload a .glb or .gltf to view it directly in the browser, or run ' +
            'the engine locally for the full pipeline.',
        });
        return;
      }

      setPhase('processing');
      setDetail('Reading the assembly');
      const parts = await readGltfParts(files[0]);
      setComponents(
        parts.map((stableId) => ({
          stable_id: stableId,
          label: 'unknown_component',
          validation_status: 'review_required',
        }))
      );
      const localAsset: MachineAsset = {
        orgId: 'local',
        assetId: `local-preview-${Date.now()}`,
        name: files[0].name,
        // Object URL: the file never leaves the browser on this path.
        glbUrl: URL.createObjectURL(files[0]),
        // No poster exists on this path - the engine renders those. A transparent
        // pixel keeps the 2D fallback from showing a broken image if the model
        // itself fails to load.
        posterUrl: TRANSPARENT_PIXEL,
        hotspots: [],
      };
      setAsset(localAsset);
      onTwinReadyRef.current?.(localAsset);
      setLocalOnly(true);
      setPhase('done');
      setDetail('');
      return;
    }

    try {
      setLocalOnly(false);
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
      if (!createRes.ok) {
        // Say which hop failed and what the server actually returned. "Could not
        // create the machine record" told an operator nothing they could act on.
        const body = await createRes.text().catch(() => '');
        setPhase('error');
        setError({
          code: createRes.status === 502 ? 'ENGINE_UNREACHABLE' : `HTTP_${createRes.status}`,
          message:
            createRes.status === 502
              ? 'The app reached the server, but the server could not reach the Machine Twin engine.'
              : `Creating the machine record failed (HTTP ${createRes.status}). ${body.slice(0, 160)}`,
          remediation:
            createRes.status === 502
              ? 'The engine is a local service. Run it alongside the app, or upload a ' +
                '.glb / .gltf to view it directly in the browser instead.'
              : 'Check you are signed in as an admin and try again.',
        });
        return;
      }
      const project = await createRes.json();

      setPhase('uploading');
      const form = new FormData();
      for (const file of files) form.append('files', file);
      const uploadRes = await fetch(`/api/twin?action=upload&projectId=${project.id}`, {
        method: 'POST',
        body: form,
      });
      if (!uploadRes.ok) {
        const body = await uploadRes.text().catch(() => '');
        setPhase('error');
        setError({
          code: `HTTP_${uploadRes.status}`,
          message: `The upload was rejected (HTTP ${uploadRes.status}). ${body.slice(0, 160)}`,
          remediation: 'Check the file is one of the listed formats and not corrupt.',
        });
        return;
      }

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

      const builtAsset: MachineAsset = {
        orgId: 'local',
        assetId: project.id,
        name: project.name,
        glbUrl: `/api/twin?action=model&projectId=${project.id}&lod=0`,
        posterUrl: `/api/twin?action=poster&projectId=${project.id}`,
        // Hotspots need reviewed components with 3D positions; a fresh twin has
        // none, so the tutor is asked about the machine as a whole.
        hotspots: [],
      };
      setAsset(builtAsset);
      onTwinReadyRef.current?.(builtAsset);
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
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Box className="h-4 w-4 text-primary" />
              Bring your own machine
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Upload a CAD assembly for a part-separated twin, or a photo walk-around
              to reconstruct the machine as it actually stands.
            </p>
          </div>
          {phase !== 'idle' && (
            <button
              type="button"
              onClick={reset}
              className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-muted"
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
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted px-4 py-6 text-sm text-foreground transition hover:border-primary/40 hover:bg-card disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : (
            <FileUp className="h-5 w-5 text-primary" />
          )}
          <span>
            {busy ? PHASE_LABEL[phase] : 'Choose files'}
            {busy && detail ? <span className="text-muted-foreground"> &middot; {detail}</span> : null}
          </span>
        </button>

        <p className="mt-2 text-[11px] text-muted-foreground">
          CAD: {CAD_EXTENSIONS.join(' ')} &middot; Capture: {MIN_PHOTOS}+ photographs, or a
          walk-around video
        </p>

        {phase === 'error' && error && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-muted p-3">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div className="min-w-0">
              {error.code && (
                <div className="font-mono text-[11px] uppercase tracking-wide text-warning">
                  {error.code}
                </div>
              )}
              <p className="text-xs text-warning">{error.message}</p>
              {error.remediation && (
                <p className="mt-1.5 text-xs text-warning">{error.remediation}</p>
              )}
            </div>
          </div>
        )}

        {phase === 'done' && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-success/40 bg-success-muted p-3 text-xs text-success">
            <Check className="h-4 w-4 shrink-0 text-success" />
            <span>
              {components.length} component{components.length === 1 ? '' : 's'} &middot;{' '}
              {localOnly
                ? 'rendered in your browser — levels of detail and a stored twin need the engine'
                : sourceKind === 'cad'
                ? 'from the assembly’s own part structure'
                  : 'reconstructed from photographs — a scan is one merged surface, so parts need review'}
            </span>
          </div>
        )}
      </div>

      {asset && (
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 mb-4 border-b border-border">
            <div>
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <span>3D Machine Twin Assembly</span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                360° interactive view &bull; use controls or gestures to zoom into components
              </p>
            </div>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-muted text-primary border border-border self-start sm:self-auto">
              {asset.name}
            </span>
          </div>

          <div className="w-full rounded-xl overflow-hidden shadow-inner min-h-[420px] sm:min-h-[640px]">
            <MachineViewer asset={asset} onPartSelected={() => undefined} />
          </div>

          {components.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
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
                        ? 'border-primary/40 bg-accent text-primary'
                        : 'border-border bg-muted text-foreground hover:border-border'
                    }`}
                  >
                    {component.stable_id.replace('SKB_COMPONENT_', '')}
                  </button>
                ))}
              </div>

              {selected && (
                <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 rounded-xl border border-border bg-muted p-3 text-xs">
                  <dt className="text-muted-foreground">ID</dt>
                  <dd className="font-mono text-foreground">{selected.stable_id}</dd>
                  <dt className="text-muted-foreground">Label</dt>
                  <dd className="text-foreground">{selected.label}</dd>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="text-warning">{selected.validation_status}</dd>
                </dl>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
