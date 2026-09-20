'use client';

import { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Maximize2, Minimize2 } from 'lucide-react';
import { useAccessibility } from '@/components/providers/accessibility-provider';
import type { MachineAsset } from '@/lib/types';

/**
 * The 3D machine viewer, and the anchor for "tap a part, ask about it".
 *
 * `<model-viewer>` rather than three.js/react-three-fiber: far smaller payload,
 * native GLB + Draco + KTX2, declarative hotspots, and AR on Android for free.
 * three.js is reserved for true simulation behaviour, which is roadmap.
 *
 * The performance budget is a hard constraint. The module is imported lazily so
 * none of it is fetched until a lesson that needs it actually opens, and on a
 * weak device or network the pre-rendered still is shown instead of live 3D.
 */

/** How long to wait for a model before showing the 2D path instead. */
/**
 * How long to wait for a model before falling back to the 2D path.
 *
 * Generous because the fallback is not free: it costs the worker the ability to
 * rotate the machine at all, so tripping early on a merely slow connection is
 * worse than waiting. A CAD assembly runs to several megabytes.
 */
const MODEL_LOAD_DEADLINE_MS = 20000;

export interface MachineViewerProps {
  asset: MachineAsset;
  /** Fired when a worker taps a component — carries the hotspot into the tutor. */
  onPartSelected?: (hotspotId: string) => void;
  selectedPartId?: string;
  autoRotate?: boolean;
}

export function MachineViewer({
  asset,
  onPartSelected,
  selectedPartId,
  autoRotate = false,
}: MachineViewerProps) {
  const { prefer2D } = useAccessibility();
  const [ready, setReady] = useState(false);
  // Keyed by URL rather than a boolean, so switching lessons clears the failure
  // by derivation. Resetting it in an effect would be a setState-in-effect,
  // which this codebase lints against.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = failedUrl === asset.glbUrl;
  const viewerRef = useRef<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const handleZoomIn = () => {
    const element = viewerRef.current as (HTMLElement & { zoom?: (step: number) => void }) | null;
    if (element?.zoom) {
      element.zoom(1);
    }
  };

  const handleZoomOut = () => {
    const element = viewerRef.current as (HTMLElement & { zoom?: (step: number) => void }) | null;
    if (element?.zoom) {
      element.zoom(-1);
    }
  };

  const handleReset = () => {
    const element = viewerRef.current as (HTMLElement & {
      cameraOrbit?: string;
      jumpCameraToGoal?: () => void;
      resetTurntableRotation?: () => void;
    }) | null;
    if (element) {
      element.cameraOrbit = 'auto auto 70%';
      element.jumpCameraToGoal?.();
      element.resetTurntableRotation?.();
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  useEffect(() => {
    if (prefer2D) return;
    let cancelled = false;
    void import('@google/model-viewer').then(
      () => {
        if (!cancelled) setReady(true);
      },
      () => {
        if (!cancelled) setFailedUrl(asset.glbUrl);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [prefer2D, asset.glbUrl]);

  /**
   * Fall back to 2D if the model errors OR simply never arrives.
   *
   * Two reasons this is a deadline and not just an error listener:
   * <model-viewer> dispatches a plain CustomEvent('error') that React's
   * synthetic onError does not cover and that can fire before a listener
   * attaches; and on a 2g connection the realistic failure is not an error at
   * all, it is a fetch that never finishes. Either way the worker must end up
   * with the tappable list rather than an empty frame — the hotspots are
   * positioned against the mesh, so no mesh means no tap-a-part.
   */
  useEffect(() => {
    const element = viewerRef.current;
    if (!element) return;

    const url = asset.glbUrl;
    const fail = () => setFailedUrl(url);

    const timer = setTimeout(() => {
      if (!(element as HTMLElement & { loaded?: boolean }).loaded) fail();
    }, MODEL_LOAD_DEADLINE_MS);

    const onLoad = () => clearTimeout(timer);
    element.addEventListener('error', fail);
    element.addEventListener('load', onLoad);

    return () => {
      clearTimeout(timer);
      element.removeEventListener('error', fail);
      element.removeEventListener('load', onLoad);
    };
  }, [ready, asset.glbUrl]);

  // A model that 404s or times out must not strand the worker: <model-viewer>
  // positions hotspots against the loaded mesh, so without one they collapse to
  // zero size and "tap a part" silently stops working. Falling back to the 2D
  // list keeps the interaction alive on a flaky network, which is the normal
  // case here — not an edge case.
  if (prefer2D || failed || !ready) {
    return (
      <div className="machine-viewer machine-viewer--fallback">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset.posterUrl} alt={asset.name} loading="lazy" className="max-h-[480px] rounded-lg object-contain shadow-md mx-auto" />
        {/* Say which view this is. A poster and a loaded model look the same
            until someone tries to drag one, and "it will not move" is a far
            worse thing to discover than "this is the 2D view". */}
        {!prefer2D && (
          <p className="mt-2 text-xs text-muted-foreground">
            Showing the 2D view &mdash; the 3D model could not be loaded. The parts below
            are still tappable.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 mt-4 w-full max-w-md mx-auto">
          {asset.hotspots.map((hotspot, idx) => (
            <button
              key={hotspot.id}
              type="button"
              onClick={() => onPartSelected?.(hotspot.id)}
              className={`text-xs px-3 py-2 rounded-lg font-medium border text-left transition ${
                selectedPartId === hotspot.id
                  ? 'bg-blue-600 text-white border-blue-400 shadow-sm'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <span className="font-bold mr-1.5 opacity-70">#{idx + 1}</span>
              {hotspot.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  /*
   * `loading="eager"`, not the default lazy: lazy defers the fetch until the
   * element intersects the viewport, and inside a tab panel or below the fold
   * that often never fires - so the model never starts loading, the deadline
   * above trips, and the worker is handed the static poster with no way to
   * rotate it. The library itself is still imported on demand, which is where
   * the payload saving actually comes from.
   */
  return (
    <div ref={containerRef} className="relative w-full group">
      <model-viewer
        className="machine-viewer"
        src={asset.glbUrl}
        poster={asset.posterUrl}
        alt={asset.name}
        camera-controls
        auto-rotate={autoRotate ? '' : undefined}
        shadow-intensity="1"
        loading="eager"
        reveal="auto"
        bounds="tight"
        camera-orbit="0deg 75deg 70%"
        min-camera-orbit="auto auto 5%"
        max-camera-orbit="auto auto 160%"
        interpolation-decay="150"
        ref={viewerRef}
      >
        {asset.hotspots.map((hotspot, idx) => {
          const isSelected = selectedPartId === hotspot.id;
          return (
            <button
              key={hotspot.id}
              type="button"
              slot={`hotspot-${hotspot.id}`}
              data-position={hotspot.position}
              data-normal={hotspot.normal}
              className={`hotspot-pin ${isSelected ? 'active' : ''}`}
              onClick={() => onPartSelected?.(hotspot.id)}
              aria-label={hotspot.label}
            >
              <span className="text-xs font-bold">{idx + 1}</span>
              <span className="hotspot-annotation">{hotspot.label}</span>
            </button>
          );
        })}
      </model-viewer>

      {/* Floating Viewport HUD Controls */}
      <div className="absolute top-3 right-3 flex items-center gap-1 bg-card/90 backdrop-blur-md p-1.5 rounded-xl border border-border shadow-lg z-10">
        <button
          type="button"
          onClick={handleZoomIn}
          title="Zoom In (+)"
          aria-label="Zoom In"
          className="p-1.5 rounded-lg hover:bg-muted text-foreground transition flex items-center justify-center cursor-pointer"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          title="Zoom Out (-)"
          aria-label="Zoom Out"
          className="p-1.5 rounded-lg hover:bg-muted text-foreground transition flex items-center justify-center cursor-pointer"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleReset}
          title="Reset Camera & Center"
          aria-label="Reset Camera"
          className="p-1.5 rounded-lg hover:bg-muted text-foreground transition flex items-center justify-center cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <div className="h-4 w-px bg-border mx-0.5" />
        <button
          type="button"
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          className="p-1.5 rounded-lg hover:bg-muted text-foreground transition flex items-center justify-center cursor-pointer"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Interaction hint overlay */}
      <div className="absolute bottom-3 right-3 hidden sm:flex items-center gap-1.5 bg-card/85 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-border/80 text-[10px] text-muted-foreground pointer-events-none">
        <span>Scroll to Zoom · Drag to Orbit</span>
      </div>
    </div>
  );
}
