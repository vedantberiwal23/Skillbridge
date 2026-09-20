import type { DetailedHTMLProps, HTMLAttributes } from 'react';

/**
 * `<model-viewer>` is a custom element, so React needs to be told it exists.
 * React 19 resolves intrinsic elements through the `react` module's own JSX
 * namespace rather than the old global one.
 */
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & {
          src?: string;
          poster?: string;
          alt?: string;
          ar?: boolean;
          'camera-controls'?: boolean;
          'shadow-intensity'?: string;
          loading?: 'auto' | 'lazy' | 'eager';
          /** When the model is shown. 'auto' displays it as soon as it loads. */
          reveal?: 'auto' | 'interaction' | 'manual';
          'auto-rotate'?: string;
          bounds?: 'tight' | 'legacy';
          'camera-orbit'?: string;
          'min-camera-orbit'?: string;
          'max-camera-orbit'?: string;
          'camera-target'?: string;
          'field-of-view'?: string;
          'min-field-of-view'?: string;
          'max-field-of-view'?: string;
          'interpolation-decay'?: string | number;
        },
        HTMLElement
      >;
    }
  }
}

export {};
