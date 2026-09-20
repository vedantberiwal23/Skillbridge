'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Camera, Check, Layers, Loader2, Upload } from 'lucide-react';
import type { MachineAsset } from '@/lib/types';

/**
 * The Studio's photogrammetry scanner, driven by the real Machine Twin engine
 * through `/api/twin`.
 *
 * Everything on screen comes from the engine: the capability report, the upload,
 * each stage's outcome, the coverage it measured, the geometry it wrote. The
 * engine runs a whole stage per request and reports no progress inside one, so
 * this shows what can actually be known — which stage is running, for how long
 * (a real clock), and the real upload percentage — and never a made-up bar.
 */

type StepKey = 'create' | 'upload' | 'reconstruct' | 'author';
type StepState = 'queued' | 'running' | 'done' | 'skipped' | 'failed';

interface StageError {
  code: string;
  message: string;
  remediation?: string;
}

interface StepStatus {
  state: StepState;
  startedAt?: number;
  durationMs?: number;
  note?: string;
  error?: StageError;
}

interface Coverage {
  status: string;
  fraction: number;
  registered: number;
  total: number;
  recommendation: string;
}

interface Lod {
  id: string;
  lod: number;
  vertex_count: number;
  face_count: number;
  source: string;
  validation_status: string;
  meta?: { size_bytes?: number | null };
}

interface Component {
  id: string;
  stable_id: string;
  label: string;
  category: string;
  validation_status: string;
}

interface CapabilityReport {
  mesh_provider: string | null;
  capabilities: Record<string, { status: string; version?: string | null; remediation?: string }>;
}

const STEPS: { key: StepKey; title: string; detail: string }[] = [
  { key: 'create', title: 'Create machine project', detail: 'Registers the machine with the twin engine' },
  { key: 'upload', title: 'Upload & ingest photos', detail: 'Originals stored write-once; videos split into frames' },
  { key: 'reconstruct', title: 'Reconstruct 3D mesh', detail: 'Camera poses + coverage check, then mesh' },
  { key: 'author', title: 'Author browser model', detail: 'Clean, decimate to LODs, export GLB + poster' },
];

const QUEUED: Record<StepKey, StepStatus> = {
  create: { state: 'queued' },
  upload: { state: 'queued' },
  reconstruct: { state: 'queued' },
  author: { state: 'queued' },
};

/** Tools the reconstruction and authoring stages shell out to. */
const REQUIRED_TOOLS = ['colmap', 'blender'];

const fmtBytes = (n?: number | null) =>
  n == null ? '—' : n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

const fmtSecs = (ms: number) => `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;

/** A failed stage comes back as `{ detail: StageError }`; anything else is a plain error. */
function toStageError(status: number, body: unknown): StageError {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (detail && typeof detail === 'object' && 'message' in detail) return detail as StageError;
  const error = (body as { error?: unknown } | null)?.error;
  if (status === 401 || status === 403) {
    return { code: 'FORBIDDEN', message: 'Your account cannot run scans.', remediation: 'Sign in as a manager or admin.' };
  }
  if (status === 502) {
    return {
      code: 'ENGINE_UNREACHABLE',
      message: 'The Machine Twin engine is not reachable.',
      remediation: 'Start it (make dev in machine-twin/) and check MACHINE_TWIN_URL.',
    };
  }
  return { code: `HTTP_${status}`, message: typeof error === 'string' ? error : typeof detail === 'string' ? detail : `Request failed (${status}).` };
}

async function twin<T>(query: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/twin?${query}`, { credentials: 'same-origin', ...init });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) throw toStageError(res.status, body);
  return body as T;
}

/** XHR, not fetch: it is the only browser API that reports real upload progress. */
function uploadWithProgress(projectId: string, files: File[], onProgress: (pct: number) => void) {
  return new Promise<{ asset: unknown; derived: unknown[]; warnings: string[] }[]>((resolve, reject) => {
    const form = new FormData();
    for (const f of files) form.append('files', f, f.name);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/twin?action=upload&projectId=${encodeURIComponent(projectId)}`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as never);
      else reject(toStageError(xhr.status, body));
    };
    xhr.onerror = () => reject(toStageError(502, null));
    xhr.send(form);
  });
}

export function ScanPipelinePanel({ onLoadModel }: { onLoadModel: (asset: MachineAsset) => void }) {
  const [name, setName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [caps, setCaps] = useState<CapabilityReport | null>(null);
  const [capsError, setCapsError] = useState<StageError | null>(null);

  const [steps, setSteps] = useState<Record<StepKey, StepStatus>>(QUEUED);
  const [running, setRunning] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [projectId, setProjectId] = useState<string | null>(null);
  const [builtName, setBuiltName] = useState('');
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [imageCount, setImageCount] = useState<number | null>(null);
  const [meshProvider, setMeshProvider] = useState<string | null>(null);
  const [lods, setLods] = useState<Lod[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  // The engine's own report of what this host can run — before anyone uploads.
  useEffect(() => {
    let live = true;
    twin<CapabilityReport>('action=capabilities')
      .then((r) => live && setCaps(r))
      .catch((e: StageError) => live && setCapsError(e));
    return () => {
      live = false;
    };
  }, []);

  // A real clock for the stage in flight. The engine gives no percentage inside
  // a stage, so elapsed time is the honest thing to show.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [running]);

  const missingTools = caps
    ? REQUIRED_TOOLS.filter((k) => caps.capabilities[k] && caps.capabilities[k].status !== 'available')
    : [];
  const engineReady = Boolean(caps && caps.mesh_provider && missingTools.length === 0);

  const set = (key: StepKey, patch: StepStatus) => setSteps((prev) => ({ ...prev, [key]: patch }));

  /** Run one step, timing it with the real clock; a failure stops the run. */
  async function step<T>(key: StepKey, work: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    setNow(startedAt);
    set(key, { state: 'running', startedAt });
    try {
      const out = await work();
      set(key, { state: 'done', durationMs: Date.now() - startedAt });
      return out;
    } catch (e) {
      set(key, { state: 'failed', durationMs: Date.now() - startedAt, error: e as StageError });
      throw e;
    }
  }

  const runScan = async () => {
    if (running || !files.length || !name.trim()) return;
    setRunning(true);
    setSteps(QUEUED);
    setUploadPct(null);
    setProjectId(null);
    setCoverage(null);
    setImageCount(null);
    setMeshProvider(null);
    setLods([]);
    setComponents([]);
    setWarnings([]);
    try {
      const project = await step('create', () =>
        twin<{ id: string; name: string }>('action=create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), manufacturer: manufacturer.trim() || null }),
        })
      );
      setProjectId(project.id);
      setBuiltName(project.name);

      const ingested = await step('upload', () => uploadWithProgress(project.id, files, setUploadPct));
      const frames = ingested.reduce((n, r) => n + (r.derived?.length ?? 0), 0);
      setWarnings(ingested.flatMap((r) => r.warnings ?? []));
      setSteps((prev) => ({
        ...prev,
        upload: { ...prev.upload, note: `${ingested.length} file(s) stored${frames ? `, ${frames} video frame(s) extracted` : ''}` },
      }));

      const rec = await step('reconstruct', () =>
        twin<{ state: string; image_count: number; coverage: Coverage | null; mesh_provider: string | null }>(
          `action=stage&stage=reconstruct&projectId=${encodeURIComponent(project.id)}`,
          { method: 'POST' }
        )
      );
      setCoverage(rec.coverage);
      setImageCount(rec.image_count);
      setMeshProvider(rec.mesh_provider);
      if (rec.state === 'skipped') setSteps((prev) => ({ ...prev, reconstruct: { ...prev.reconstruct, state: 'skipped', note: 'inputs unchanged — previous result reused' } }));

      const authored = await step('author', () =>
        twin<{ state: string; lods: Lod[]; components: Component[] }>(
          `action=stage&stage=author&projectId=${encodeURIComponent(project.id)}`,
          { method: 'POST' }
        )
      );
      setLods([...authored.lods].sort((a, b) => a.lod - b.lod));
      setComponents(authored.components);
      if (authored.state === 'skipped') setSteps((prev) => ({ ...prev, author: { ...prev.author, state: 'skipped', note: 'inputs unchanged — previous result reused' } }));
    } catch {
      /* the failed step carries its own error; later steps stay queued */
    } finally {
      setRunning(false);
    }
  };

  const built = Boolean(projectId && lods.length);
  const loadBuilt = () => {
    if (!projectId || !built) return;
    onLoadModel({
      orgId: '',
      assetId: projectId,
      name: builtName,
      // Through the authenticated proxy; project ids are unique, so no cache-buster.
      glbUrl: `/api/twin?action=model&projectId=${encodeURIComponent(projectId)}&lod=0`,
      posterUrl: `/api/twin?action=poster&projectId=${encodeURIComponent(projectId)}`,
      // Hotspots come from reviewed components, and a fresh scan has none yet.
      hotspots: [],
    });
  };

  const doneCount = STEPS.filter(({ key }) => steps[key].state === 'done' || steps[key].state === 'skipped').length;
  const current = STEPS.find(({ key }) => steps[key].state === 'running');
  const failed = STEPS.find(({ key }) => steps[key].state === 'failed');
  // Whole steps completed, plus the real upload fraction while uploading.
  const progress =
    ((doneCount + (current?.key === 'upload' && uploadPct !== null ? uploadPct / 100 : 0)) / STEPS.length) * 100;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Engine status — from the engine's own capability report */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                engineReady ? 'bg-emerald-400' : caps ? 'bg-amber-400' : capsError ? 'bg-rose-500' : 'bg-slate-500 animate-pulse'
              }`}
            />
            <h2 className="text-base font-bold text-white tracking-tight">Machine Twin Photogrammetry Engine</h2>
            <span
              data-testid="engine-status"
              className="text-[10px] font-mono bg-slate-950 text-slate-300 border border-slate-800 px-2 py-0.5 rounded"
            >
              {capsError
                ? 'Unreachable'
                : !caps
                  ? 'Checking…'
                  : engineReady
                    ? `Ready · mesh: ${caps.mesh_provider}`
                    : 'Not ready on this host'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Photos → camera poses + coverage check → mesh → browser-ready GLB with levels of detail.
          </p>
          {capsError && <p className="text-[11px] text-rose-300 mt-1">{capsError.message} {capsError.remediation}</p>}
          {caps && !engineReady && (
            <ul className="text-[11px] text-amber-300 mt-1 space-y-0.5">
              {!caps.mesh_provider && <li>No mesh backend available on this host.</li>}
              {missingTools.map((k) => (
                <li key={k}>
                  {k}: {caps.capabilities[k]!.status}
                  {caps.capabilities[k]!.remediation ? ` — ${caps.capabilities[k]!.remediation}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={loadBuilt}
          disabled={!built}
          className="bg-blue-600 enabled:hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-lg transition flex items-center gap-2"
        >
          <Layers className="w-4 h-4" />
          <span>Load scanned model in 3D viewer</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Setup & pipeline */}
        <div className="lg:col-span-7 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Camera className="w-4 h-4 text-cyan-400" />
              New equipment scan
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <label className="block">
                <span className="text-[11px] font-mono text-slate-400 uppercase block mb-1">Equipment name</span>
                <input
                  type="text"
                  value={name}
                  disabled={running}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Hydraulic power unit, bay 4"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-medium"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-mono text-slate-400 uppercase block mb-1">Manufacturer (optional)</span>
                <input
                  type="text"
                  value={manufacturer}
                  disabled={running}
                  onChange={(e) => setManufacturer(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-medium"
                />
              </label>
            </div>

            <button
              type="button"
              disabled={running}
              onClick={() => fileInput.current?.click()}
              className="w-full border-2 border-dashed border-slate-800 enabled:hover:border-blue-600 rounded-xl p-5 text-center bg-slate-950/40 mb-4 transition"
            >
              <Upload className="w-8 h-8 text-blue-400 mx-auto mb-2 opacity-80" />
              <div className="text-xs font-bold text-slate-200">
                {files.length
                  ? `${files.length} file(s) selected · ${fmtBytes(files.reduce((n, f) => n + f.size, 0))}`
                  : 'Choose walk-around photos or a video'}
              </div>
              <p className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto">
                Overlapping photos from all sides work best. The engine checks coverage and stops if it is not enough.
              </p>
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              data-testid="scan-files"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />

            <div className="space-y-2 mb-4">
              <span className="text-[11px] font-mono text-slate-400 uppercase block">Pipeline</span>
              {STEPS.map((stg, idx) => {
                const st = steps[stg.key];
                const elapsed = st.state === 'running' && st.startedAt ? now - st.startedAt : st.durationMs;
                return (
                  <div
                    key={stg.key}
                    data-testid={`step-${stg.key}`}
                    data-state={st.state}
                    className={`p-2.5 rounded-lg border text-xs transition ${
                      st.state === 'done' || st.state === 'skipped'
                        ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
                        : st.state === 'running'
                          ? 'bg-blue-950/40 border-blue-600 text-blue-200'
                          : st.state === 'failed'
                            ? 'bg-rose-950/30 border-rose-800/60 text-rose-200'
                            : 'bg-slate-950/40 border-slate-800 text-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {st.state === 'done' || st.state === 'skipped' ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : st.state === 'running' ? (
                          <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                        ) : st.state === 'failed' ? (
                          <AlertTriangle className="w-4 h-4 text-rose-400" />
                        ) : (
                          <span className="w-4 h-4 rounded-full border border-slate-700 flex items-center justify-center text-[9px] font-mono">
                            {idx + 1}
                          </span>
                        )}
                        <div>
                          <span className="font-semibold block">{stg.title}</span>
                          <span className="text-[10px] opacity-75">{st.note ?? stg.detail}</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-right shrink-0">
                        {st.state === 'running'
                          ? stg.key === 'upload' && uploadPct !== null
                            ? `UPLOADING ${uploadPct}%`
                            : `RUNNING · ${fmtSecs(elapsed ?? 0)}`
                          : st.state === 'queued'
                            ? 'QUEUED'
                            : `${st.state.toUpperCase()}${elapsed != null ? ` · ${fmtSecs(elapsed)}` : ''}`}
                      </span>
                    </div>
                    {st.error && (
                      <div className="mt-2 text-[11px] text-rose-200">
                        <span className="font-mono font-bold">{st.error.code}</span> — {st.error.message}
                        {st.error.remediation && <div className="text-rose-300/80 mt-0.5">{st.error.remediation}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800">
            {(running || doneCount > 0 || failed) && (
              <div className="mb-3">
                <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                  <span data-testid="scan-summary">
                    {failed
                      ? `Stopped at: ${failed.title}`
                      : current
                        ? `Step ${STEPS.indexOf(current) + 1} of ${STEPS.length}: ${current.title}`
                        : doneCount === STEPS.length
                          ? 'All steps complete'
                          : `${doneCount} of ${STEPS.length} steps complete`}
                  </span>
                  <span>
                    {doneCount}/{STEPS.length}
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className={`${failed ? 'bg-rose-500' : 'bg-blue-500'} h-full transition-all duration-300`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                disabled={running || !files.length || !name.trim()}
                onClick={runScan}
                data-testid="run-scan"
                className="flex-1 py-3 rounded-xl font-bold text-xs transition shadow-lg flex items-center justify-center gap-2 bg-blue-600 enabled:hover:bg-blue-500 text-white disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed"
              >
                {running ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Running…</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
                    <span>{!name.trim() ? 'Name the equipment to start' : !files.length ? 'Choose photos to start' : 'Run 3D reconstruction'}</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={loadBuilt}
                disabled={!built}
                className="bg-emerald-600 enabled:hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold text-xs px-5 py-3 rounded-xl transition shadow-lg flex items-center gap-2"
              >
                <span>Load into 3D viewer</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Results — only what this run actually produced */}
        <div
          data-testid="scan-results"
          className="lg:col-span-5 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col gap-5"
        >
          {!projectId ? (
            <div className="my-auto text-center text-xs text-slate-500 py-10">
              <Layers className="w-8 h-8 mx-auto mb-2 text-slate-600" />
              No scan run yet in this session. Results appear here as each step finishes.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <span className="text-[10px] font-mono uppercase text-slate-500 font-bold tracking-wider block">
                    Project {projectId}
                  </span>
                  <h3 className="text-sm font-bold text-white mt-0.5">{builtName}</h3>
                </div>
                {lods[0] && (
                  <span className="text-[10px] bg-slate-950 text-slate-300 border border-slate-700 px-2.5 py-1 rounded-md font-mono font-bold uppercase">
                    {lods[0].validation_status.replace(/_/g, ' ')}
                  </span>
                )}
              </div>

              {warnings.length > 0 && (
                <ul className="text-[11px] text-amber-300 space-y-0.5">
                  {warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}

              {coverage && (
                <div data-testid="coverage" className="text-xs">
                  <span className="text-[11px] font-mono text-slate-400 uppercase block mb-1">Capture coverage</span>
                  <div className="bg-slate-950/80 rounded-xl border border-slate-800 p-3 font-mono text-slate-200">
                    {Math.round(coverage.fraction * 100)}% registered ({coverage.registered}/{coverage.total} images) ·{' '}
                    {coverage.status}
                    {imageCount !== null && <div className="text-slate-400 mt-1">{imageCount} image(s) used</div>}
                    {meshProvider && <div className="text-slate-400">mesh backend: {meshProvider}</div>}
                    {coverage.recommendation && <div className="text-amber-300 mt-1">{coverage.recommendation}</div>}
                  </div>
                </div>
              )}

              {lods.length > 0 && (
                <div data-testid="lods">
                  <span className="text-[11px] font-mono text-slate-400 uppercase block mb-1">Levels of detail</span>
                  <div className="bg-slate-950/80 rounded-xl border border-slate-800 overflow-hidden text-xs font-mono">
                    <div className="grid grid-cols-3 p-2.5 border-b border-slate-800/80 text-[10px] text-slate-400 font-bold">
                      <span>LOD</span>
                      <span>VERTICES</span>
                      <span className="text-right">FILE SIZE</span>
                    </div>
                    {lods.map((l) => (
                      <div key={l.id} className="grid grid-cols-3 p-2.5 border-b border-slate-900 last:border-0 text-slate-200">
                        <span>LOD-{l.lod}</span>
                        <span>{l.vertex_count.toLocaleString()}</span>
                        <span className="text-right">{fmtBytes(l.meta?.size_bytes)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Geometry source: {lods[0]!.source}</p>
                </div>
              )}

              {lods.length > 0 && (
                <div>
                  <span className="text-[11px] font-mono text-slate-400 uppercase block mb-1">Components found</span>
                  {components.length ? (
                    <div className="space-y-1.5">
                      {components.map((c) => (
                        <div
                          key={c.id}
                          className="bg-slate-950 p-2 rounded-lg border border-slate-800 flex items-center justify-between text-xs"
                        >
                          <span className="text-slate-200">{c.label}</span>
                          <span className="text-[10px] font-mono text-slate-500">
                            {c.stable_id} · {c.validation_status.replace(/_/g, ' ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">None separated — parts are labelled in review.</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
