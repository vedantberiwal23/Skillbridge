/**
 * Keep a full-screen WebGL canvas from crashing the tab.
 *
 * Both background shaders on the landing page ran an unconditional
 * requestAnimationFrame loop and never released their context on unmount. That
 * combination has two compounding failure modes, and Chrome hits both:
 *
 *   - a browser allows only a small number of live WebGL contexts per renderer
 *     (~16). Leaked ones are reclaimed by garbage collection, which is not
 *     prompt for GPU resources, so navigating on and off the page repeatedly
 *     exhausts the pool. The browser then force-loses the OLDEST contexts —
 *     which is why the sky stops moving and never comes back.
 *   - two full-screen fragment shaders rendering forever, including in a
 *     background tab and while scrolled out of view, is enough sustained GPU
 *     and memory pressure to take the renderer process down. The tab goes
 *     blank and Chrome restores it.
 *
 * So: pause when not visible, release deterministically, and recover if the
 * context is lost anyway rather than staying dead until a full reload.
 */

export interface GlLifecycle {
  /** True when the canvas is on screen, the tab is visible and the context is alive. */
  shouldRender: () => boolean;
  /** Call from the cleanup of the effect that created the context. */
  dispose: () => void;
}

export function attachGlLifecycle(
  canvas: HTMLCanvasElement,
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  onRestore?: () => void
): GlLifecycle {
  let onScreen = true;
  let lost = false;

  const visible = () => document.visibilityState === 'visible';

  // `preventDefault` is what makes a lost context restorable at all; without it
  // the browser never fires webglcontextrestored.
  const handleLost = (e: Event) => {
    e.preventDefault();
    lost = true;
  };
  const handleRestored = () => {
    lost = false;
    onRestore?.();
  };
  canvas.addEventListener('webglcontextlost', handleLost);
  canvas.addEventListener('webglcontextrestored', handleRestored);

  // Rendering a background that nobody can see is pure battery and GPU time.
  const observer =
    typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver((entries) => {
          onScreen = entries.some((entry) => entry.isIntersecting);
        })
      : null;
  observer?.observe(canvas);

  const onVisibility = () => {
    /* read through `visible()`; listener exists to wake the loop promptly */
  };
  document.addEventListener('visibilitychange', onVisibility);

  return {
    shouldRender: () => !lost && onScreen && visible(),
    dispose: () => {
      canvas.removeEventListener('webglcontextlost', handleLost);
      canvas.removeEventListener('webglcontextrestored', handleRestored);
      document.removeEventListener('visibilitychange', onVisibility);
      observer?.disconnect();
      // Hand the context back now rather than waiting for GC. This is the part
      // that stops repeated navigation from exhausting the pool.
      try {
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      } catch {
        /* nothing useful to do if the context is already gone */
      }
    },
  };
}
