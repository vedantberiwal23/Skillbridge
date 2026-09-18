/**
 * Microphone capture as raw PCM for the voice service.
 *
 * MediaRecorder cannot do this: it only produces compressed webm/opus, and only
 * in finished blobs. saaras:v3-realtime wants linear16 WHILE the worker is still
 * talking. So the audio graph is tapped directly and 16 kHz mono 16-bit frames
 * are emitted every 50 ms.
 *
 * Browser-only. Import from client components.
 */

const TARGET_RATE = 16000;

/**
 * 50 ms at 16 kHz. Sarvam suggests ~100 ms; this frame is the buffering delay
 * between a syllable and the recogniser seeing it, and it is paid on the FIRST
 * word — the one the worker is watching for.
 */
const FRAME_SAMPLES = 800;

/** A second of perfect digital zeros means the device is not listening. */
const SILENT_FRAMES = 20;

/**
 * The tap runs on the audio thread so a busy React render cannot drop frames.
 * Inlined as a blob so it cannot go missing from public/ when the build moves.
 */
const WORKLET = `
class Tap extends AudioWorkletProcessor {
  constructor () { super(); this.buf = []; this.n = 0 }
  process (inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch && ch.length) {
      this.buf.push(new Float32Array(ch))
      this.n += ch.length
      if (this.n >= 320) {
        const out = new Float32Array(this.n)
        let o = 0
        for (const b of this.buf) { out.set(b, o); o += b.length }
        this.port.postMessage(out, [out.buffer])
        this.buf = []; this.n = 0
      }
    }
    return true
  }
}
registerProcessor('skillbridge-voice-tap', Tap)
`;

function floatToPcm16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** Linear resample; only runs when the browser refuses a 16 kHz context (Safari). */
function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

function base64FromInt16(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let bin = '';
  // chunked: fromCharCode.apply on a large array overflows the stack
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return btoa(bin);
}

export interface MicOptions {
  /** One 50 ms base64 PCM16 frame, plus a 0..1 level for a meter. */
  onFrame: (b64: string, level: number) => void;
  onError?: (code: 'mic_disconnected') => void;
  /** The device delivered a full second of digital silence (e.g. a virtual driver). */
  onSilent?: (deviceLabel: string) => void;
  deviceId?: string;
}

export interface Mic {
  readonly label: string;
  stop(): void;
}

/**
 * Open the microphone. Call from the button-down handler.
 *
 * Everything after getUserMedia can throw with the mic ALREADY open, which
 * would leave the browser's recording indicator lit with no way to turn it off.
 * Every failure path releases the stream before rethrowing.
 */
export async function startMic({ onFrame, onError, onSilent, deviceId }: MicOptions): Promise<Mic> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('this browser cannot record audio');

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      channelCount: 1,
      // The reply plays through the speaker while the mic may be open for the
      // next question, so echo cancellation is not optional.
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const release = () => stream.getTracks().forEach((t) => t.stop());
  const label = stream.getAudioTracks()[0]?.label ?? '';

  let stopped = false;
  let ended = false;
  for (const track of stream.getAudioTracks()) {
    track.addEventListener('ended', () => {
      if (ended || stopped) return;
      ended = true;
      onError?.('mic_disconnected');
    });
  }

  let ctx: AudioContext;
  let source: MediaStreamAudioSourceNode;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    try {
      ctx = new Ctx({ sampleRate: TARGET_RATE });
    } catch {
      ctx = new Ctx();
    }
    // iOS suspends new contexts until a gesture; the press IS the gesture, but
    // resume must be awaited or the first frames are silence.
    if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);
    source = ctx.createMediaStreamSource(stream);
  } catch (e) {
    release();
    throw e;
  }

  const rate = ctx.sampleRate;
  let carry = new Float32Array(0);
  let zeroFrames = 0;
  let silenceChecked = false;

  const consume = (samples: Float32Array) => {
    if (stopped) return;
    const merged = new Float32Array(carry.length + samples.length);
    merged.set(carry, 0);
    merged.set(samples, carry.length);

    const ready = resample(merged, rate, TARGET_RATE);
    const usable = Math.floor(ready.length / FRAME_SAMPLES) * FRAME_SAMPLES;
    if (!usable) {
      carry = merged;
      return;
    }
    // Measure the leftover in the SOURCE rate, or the carry drifts and audio is
    // slowly lost.
    carry = merged.slice(Math.min(Math.round(usable * (rate / TARGET_RATE)), merged.length));

    for (let off = 0; off < usable; off += FRAME_SAMPLES) {
      const slice = ready.subarray(off, off + FRAME_SAMPLES);
      let sum = 0;
      let peak = 0;
      for (let i = 0; i < slice.length; i++) {
        sum += slice[i] * slice[i];
        peak = Math.max(peak, Math.abs(slice[i]));
      }
      if (!silenceChecked) {
        if (peak === 0) zeroFrames++;
        else silenceChecked = true;
        if (zeroFrames >= SILENT_FRAMES) {
          silenceChecked = true;
          onSilent?.(label || 'microphone');
        }
      }
      onFrame(base64FromInt16(floatToPcm16(slice)), Math.min(1, Math.sqrt(sum / slice.length) * 4));
    }
  };

  let node: AudioNode;
  let workletUrl: string | null = null;
  // A worklet is not PULLED unless the graph reaches a destination — without
  // this there are no frames at all. The gain is zero so the worker does not
  // hear their own voice echoed back.
  const sink = () => {
    const mute = ctx.createGain();
    mute.gain.value = 0;
    node.connect(mute).connect(ctx.destination);
  };

  try {
    if (!ctx.audioWorklet) throw new Error('no audioWorklet');
    workletUrl = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
    await ctx.audioWorklet.addModule(workletUrl);
    const worklet = new AudioWorkletNode(ctx, 'skillbridge-voice-tap');
    worklet.port.onmessage = (e: MessageEvent<Float32Array>) => consume(e.data);
    node = worklet;
    source.connect(node);
    sink();
  } catch {
    try {
      // Deprecated but present in the older WebViews a phone may land on.
      const sp = ctx.createScriptProcessor(4096, 1, 1);
      sp.onaudioprocess = (ev) => consume(new Float32Array(ev.inputBuffer.getChannelData(0)));
      node = sp;
      source.connect(node);
      sink();
    } catch {
      release();
      void ctx.close().catch(() => undefined);
      if (workletUrl) URL.revokeObjectURL(workletUrl);
      throw new Error('this browser cannot capture audio');
    }
  }

  return {
    label,
    stop() {
      if (stopped) return;
      stopped = true;
      try {
        node.disconnect();
        source.disconnect();
      } catch {
        /* best effort */
      }
      release();
      void ctx.close().catch(() => undefined);
      if (workletUrl) URL.revokeObjectURL(workletUrl);
    },
  };
}
