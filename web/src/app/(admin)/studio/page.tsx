'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Wrench,
  Volume2,
  Mic,
  CheckCircle2,
  AlertTriangle,
  FileText,
  BarChart3,
  Cpu,
  Layers,
  Radio,
  RefreshCw,
  Send,
  CheckSquare,
  Camera,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import { TwinUploader } from '@/components/viewer/twin-uploader';
import { MachineViewer } from '@/components/viewer/machine-viewer';
import { useAccessibility } from '@/components/providers/accessibility-provider';
import type { MachineAsset } from '@/lib/types';
import { openVoiceChannel, type VoiceChannel, type ChannelState, type VoiceTurn, type TurnHandlers } from '@/lib/voice/channel';
import * as player from '@/lib/voice/player';
import { ScanPipelinePanel } from '@/components/studio/scan-pipeline';
import { LanguageDropdown } from '@/components/ui/language-dropdown';
import { INDIAN_LANGUAGES } from '@/i18n/config';

/**
 * The Machine Twin output, served as a static asset.
 *
 * Produced by the Machine Twin engine from a 36-photograph run of project
 * 6ef7a28f2cdb4b1dbccc0022543d4a75 (HPU-400, 36/36 images registered), then committed under
 * `public/twin/`. Deliberately NOT fetched from the engine at view time, for
 * three reasons that each break a live demo:
 *
 *   - the engine is a local Python service, so a `http://localhost:8000` URL in
 *     the browser is blocked as mixed content as soon as the app is served over
 *     https, and resolves to nothing on any machine but the operator's;
 *   - the engine cannot be deployed beside the app at all - its mesh stage is
 *     Apple Object Capture, which is macOS-only;
 *   - a hardcoded project id drifts. The previous value, `proj_axial_pump_twin`,
 *     returned 404 for both the model and the poster.
 *
 * The live engine is still demonstrated, through the API panel below, which goes
 * through the `/api/twin` proxy rather than straight at the service.
 */
const MACHINE_TWIN_ASSET: MachineAsset = {
  orgId: 'local',
  assetId: '6ef7a28f2cdb4b1dbccc0022543d4a75',
  name: 'HPU-400 Hydraulic Power Unit (photogrammetry reconstruction)',
  glbUrl: '/twin/machine.glb',
  posterUrl: '/twin/poster.webp',
  hotspots: [
    {
      id: 'relief-valve',
      label: '1. Pilot Relief Valve (210 bar)',
      position: '0.22m 0.28m 0.15m',
      normal: '0m 1m 0m',
    },
    {
      id: 'solenoid-coil',
      label: '2. Directional Solenoid Valve (24V DC)',
      position: '-0.25m 0.18m 0.12m',
      normal: '-1m 0m 0m',
    },
    {
      id: 'swashplate',
      label: '3. Swashplate & Control Piston (14.2°)',
      position: '0.02m -0.05m 0.32m',
      normal: '0m 0m 1m',
    },
    {
      id: 'bearing-flange',
      label: '4. Shaft Seal & Roller Bearing',
      position: '-0.12m -0.26m 0.05m',
      normal: '0m -1m 0m',
    },
  ],
};

interface ComponentDetail {
  id: string;
  name: string;
  code: string;
  subsystem: string;
  status: 'OPTIMAL' | 'ATTENTION' | 'LOTO_REQUIRED';
  specs: {
    pressure: string;
    flow: string;
    tempLimit: string;
    torque: string;
  };
  sop: {
    id: string;
    title: string;
    hazardAlert: string;
    tools: string[];
    steps: string[];
  };
  questions: {
    en: string;
    hi: string;
  };
}

/**
 * Bridge from the reconstructed machine into the authored training simulation.
 *
 * Photogrammetry reconstructs the OUTSIDE of the customer's actual machine. The
 * internals - exploded assembly, pistons, swashplate motion, fault behaviour -
 * come from the per-machine-type simulation, which is authored once and reused
 * by every customer who owns that pump. The two halves are joined by component
 * identity, so selecting a part on the real twin opens that same part in the
 * training model instead of dropping the worker at the top of the lesson.
 *
 * Not every exterior component has an internal counterpart - a solenoid valve
 * and a relief cartridge are both external fittings - so anything unmapped opens
 * the simulation at its own default rather than guessing at a match.
 */
const TRAINING_LESSON_ID = 'dynex-model-simulation';

const TRAINING_COMPONENT_MAP: Record<string, string> = {
  swashplate: 'camshaft_swashplate',
  'bearing-flange': 'shaft_seal',
};

function trainingSimHref(partId: string): string {
  const mapped = TRAINING_COMPONENT_MAP[partId];
  return mapped
    ? `/lesson/${TRAINING_LESSON_ID}?component=${mapped}`
    : `/lesson/${TRAINING_LESSON_ID}`;
}

const COMPONENTS: Record<string, ComponentDetail> = {
  'relief-valve': {
    id: 'relief-valve',
    name: 'Main Pilot Relief Valve Cartridge',
    code: 'RV-A10-210',
    subsystem: 'Primary Circuit Pressure Regulation',
    status: 'ATTENTION',
    specs: {
      pressure: '210 bar (Max 280 bar)',
      flow: '45 L/min bypass',
      tempLimit: '65°C max operating',
      torque: '35 Nm ± 2 Nm locknut',
    },
    sop: {
      id: 'SOP-HYD-042',
      title: 'Section B: High-Pressure Relief Valve Calibration & Descaling',
      hazardAlert: 'HIGH PRESSURE STORED ENERGY: Accumulator holds 210 bar residual pressure. Discharge via manual bleed valve HV-01 before loosening cartridge.',
      tools: ['19mm Open-End Torque Wrench', '0-400 bar Calibrated Test Gauge', 'Viton O-Ring Pick', 'Threadlock 242'],
      steps: [
        'Tag out main pump 415V 3-phase breaker with padlocked hasp (LOTO #L-4412).',
        'Verify system pressure gauge reads exactly 0.0 bar on accumulator port M1.',
        'Loosen 19mm locking jam nut counter-clockwise by 1.5 turns.',
        'Connect 0-400 bar calibrated gauge to test port G1.',
        'Rotate hex adjusting stem clockwise to raise cracking pressure or CCW to lower.',
        'Torque jam nut to 35 Nm once cracking pressure stabilizes at 210 bar.',
      ],
    },
    questions: {
      en: 'Why is this pressure relief valve chattering violently under load?',
      hi: 'भारी लोड के दौरान यह प्रेशर रिलीफ वॉल्व बहुत तेज कंपन और आवाज क्यों कर रहा है?',
    },
  },
  'solenoid-coil': {
    id: 'solenoid-coil',
    name: 'Directional Proportional Solenoid Valve',
    code: 'SOL-4WE6-24DC',
    subsystem: 'Electro-Hydraulic Flow Direction Control',
    status: 'OPTIMAL',
    specs: {
      pressure: '315 bar max rated',
      flow: '60 L/min nominal',
      tempLimit: '85°C coil thermal cap',
      torque: '9 Nm M5 mounting bolts',
    },
    sop: {
      id: 'SOP-ELE-089',
      title: 'Proportional Solenoid Dither Tuning & PWM Diagnostics',
      hazardAlert: '24V DC INDUCTIVE FLYBACK: Isolate DC power supply prior to removing Hirschmann plug.',
      tools: ['Fluke 87V Digital Multimeter', '2.5mm Hex T-Key', 'Oscilloscope probe (PWM)', 'Contact Cleaner'],
      steps: [
        'Disconnect DIN 43650 Hirschmann connector and verify 24.0V DC bus voltage.',
        'Measure coil resistance across pins 1 and 2 (Nominal: 19.5 Ohms at 20°C).',
        'Inspect spool movement manually using manual override pin.',
        'Check PWM dither signal frequency (120 Hz ± 5 Hz recommended).',
        'Torque the 4x M5 mounting cap screws in an X-pattern to 9 Nm.',
      ],
    },
    questions: {
      en: 'The spool is sluggish and coil temperature reached 78°C. What is the root cause?',
      hi: 'स्पूल वॉल्व धीमा चल रहा है और सोलेनोइड कॉइल 78°C तक गर्म हो गया है। क्या समस्या है?',
    },
  },
  'swashplate': {
    id: 'swashplate',
    name: 'Swashplate Angle & Displacement Control Piston',
    code: 'SW-A10-71CC',
    subsystem: 'Variable Displacement Stroke Modulation',
    status: 'ATTENTION',
    specs: {
      pressure: '280 bar nominal continuous',
      flow: '0 to 103 L/min variable',
      tempLimit: '90°C fluid maximum',
      torque: '65 Nm housing clamp bolts',
    },
    sop: {
      id: 'SOP-MEC-029',
      title: 'Swashplate Cradle Bearing Inspection & Neutral Angle Zeroing',
      hazardAlert: 'MECHANICAL CRUSH RISK: Ensure spring-return control piston is fully locked out before internal inspection.',
      tools: ['Dial Test Indicator (0.01mm)', 'Feeler Gauge Set', '8mm Hex Socket', 'Clean Lint-Free Wipes'],
      steps: [
        'Depressurize and drain pump casing into a clean 20L oil catch pan.',
        'Remove displacement control valve block.',
        'Measure cradle PTFE composite bearing clearance (Max allowable: 0.12mm).',
        'Inspect mirror finish on bronze slipper foot shoes for scoring.',
        'Calibrate mechanical zero-angle stop screw using dial test indicator.',
      ],
    },
    questions: {
      en: 'Pump output flow is hunting between 40L and 80L/min without control input. Why?',
      hi: 'बिना किसी इनपुट के पंप का ऑयल फ्लो 40 से 80 लीटर के बीच क्यों भटक रहा है?',
    },
  },
  'bearing-flange': {
    id: 'bearing-flange',
    name: 'Input Drive Shaft Seal & Tapered Roller Bearing',
    code: 'SEAL-A10-45V',
    subsystem: 'Mechanical Drive Transmission & Case Containment',
    status: 'LOTO_REQUIRED',
    specs: {
      pressure: '1.5 bar max case drain',
      flow: '3.0 L/min maximum drain',
      tempLimit: '110°C Viton seal rating',
      torque: '85 Nm coupling clamping hub',
    },
    sop: {
      id: 'SOP-MEC-014',
      title: 'Radial Lip Seal Replacement & Laser Shaft Alignment',
      hazardAlert: 'ROTATING SHAFT HAZARD: 1,450 RPM direct coupled 30kW motor. Mandatory padlocked lockout on motor drive isolator (LOTO #L-1029).',
      tools: ['Laser Shaft Alignment Kit', 'Seal Extraction Hook', 'Precision Seal Driver 45mm', 'Torque Wrench 1/2" (85 Nm)'],
      steps: [
        'Apply safety padlock and danger tag to motor power distribution board.',
        'Disengage flexible spider coupling and measure radial runout (Max: 0.05mm).',
        'Extract damaged Viton radial seal using brass puller to avoid scoring shaft.',
        'Coat new Viton lip seal with clean ISO VG 46 oil prior to seating.',
        'Drive seal evenly until flush with bearing housing bore.',
        'Re-align motor and pump shafts using laser alignment kit within 0.03mm tolerance.',
      ],
    },
    questions: {
      en: 'Oil is weeping past the drive shaft coupling. Does the whole pump need to be swapped?',
      hi: 'ड्राइव शाफ्ट कपलिंग से लगातार हाइड्रोलिक तेल टपक रहा है। क्या पूरा पंप बदलना होगा?',
    },
  },
};

export default function SimulationStudioPage() {
  const { enabled: a11yEnabled, setEnabled: setA11yEnabled, prefer2D } = useAccessibility();

  // Navigation & Product State
  const [activeTab, setActiveTab] = useState<'twin' | 'scanner' | 'sop' | 'analytics' | 'api'>('twin');
  const [language, setLanguage] = useState<string>('hi');
  const currentVoiceCode =
    INDIAN_LANGUAGES.find((l) => l.code === language)?.voiceCode || (language === 'hi' ? 'hi-IN' : 'en-IN');
  const [selectedPartId, setSelectedPartId] = useState<string>('relief-valve');
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [activeAsset, setActiveAsset] = useState<MachineAsset>(MACHINE_TWIN_ASSET);
  /**
   * Whether the Machine Twin engine is actually reachable.
   *
   * `null` until asked. The header used to assert "Active" next to a pulsing
   * green dot unconditionally, which is false everywhere the engine is not
   * running — that is, everywhere the app is deployed, since its mesh stage is
   * macOS-only. The scanner panel on the same page reports "Unreachable"
   * honestly, so the page contradicted itself.
   */
  const [engineUp, setEngineUp] = useState<boolean | null>(null);

  // Voice Diagnostics State
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/twin?action=capabilities', { cache: 'no-store' })
      .then((r) => !cancelled && setEngineUp(r.ok))
      .catch(() => !cancelled && setEngineUp(false));
    return () => {
      cancelled = true;
    };
  }, []);
  const [channelState, setChannelState] = useState<ChannelState>('connecting');
  const [micLevel, setMicLevel] = useState<number>(0);
  const voiceChannelRef = useRef<VoiceChannel | null>(null);
  const currentTurnRef = useRef<VoiceTurn | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [transcript, setTranscript] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  /**
   * Measured, never estimated: from the moment the question was sent (button
   * released, or Ask clicked) to the first word of the real answer. Null until a
   * turn has produced one.
   */
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  /** From the service's reply: whether the org's own SOPs were found and used. */
  const [aiGrounded, setAiGrounded] = useState<boolean | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const sentAtRef = useRef<number | null>(null);
  const [history, setHistory] = useState<
    { role: 'worker' | 'tutor'; text: string; timestamp: string; sop?: string }[]
  >([]);

  // SOP Work Order State
  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    'chk-0': true,
    'chk-1': true,
    'chk-2': false,
    'chk-3': false,
    'chk-4': false,
    'chk-5': false,
  });
  const [workOrderSigned, setWorkOrderSigned] = useState(false);

  // Initialize Voice Channel WebSocket connection on mount
  useEffect(() => {
    let ch: VoiceChannel | null = null;
    try {
      ch = openVoiceChannel({
        onState: (st) => {
          setChannelState(st);
        },
        onFatal: (code, msg) => {
          console.warn('[VoiceChannel fatal]', code, msg);
        },
      });
      voiceChannelRef.current = ch;
    } catch (err) {
      console.warn('[VoiceChannel init error]', err);
    }

    const unsub = player.subscribe((speaking) => {
      setIsSpeaking(speaking);
    });

    return () => {
      unsub();
      ch?.close();
      voiceChannelRef.current = null;
    };
  }, []);
  const currentPart = COMPONENTS[selectedPartId] || COMPONENTS['relief-valve'];

  // Handle Part Tap on 3D viewer
  const handlePartSelected = (hotspotId: string) => {
    const cleanId = hotspotId.replace(/^hotspot-/, '');
    if (COMPONENTS[cleanId]) {
      setSelectedPartId(cleanId);
      speakAudioNotification(
        language === 'hi'
          ? `चयनित: ${COMPONENTS[cleanId].name}`
          : `Selected: ${COMPONENTS[cleanId].name}`
      );
    }
  };

  const speakAudioNotification = (text: string) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = currentVoiceCode;
      utterance.rate = 1.05;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  const offlineMessage = (code: string | null) =>
    code === 'UNAUTHORIZED'
      ? language === 'hi'
        ? 'सत्र समाप्त — फिर से साइन इन करें।'
        : 'Session expired — sign in again.'
      : language === 'hi'
        ? 'वॉइस सेवा अभी उपलब्ध नहीं है।'
        : 'The voice service is not available right now.';

  const historyForTurn = () =>
    history.slice(-6).map((h) => ({
      role: h.role === 'worker' ? ('user' as const) : ('assistant' as const),
      content: h.text,
    }));

  /**
   * Handlers shared by spoken and typed questions. Everything shown here comes
   * from the voice service: its transcript, its streamed answer, its grounding
   * flag. There is no scripted answer and no estimated number.
   */
  const turnHandlers = (asked: string): TurnHandlers => ({
    onListening: () => {
      setTranscript(language === 'hi' ? 'सुन रहा हूँ...' : 'Listening...');
    },
    onLevel: (lvl) => setMicLevel(lvl),
    onPartial: (text) => setTranscript(text),
    onFinal: (text) => setTranscript(text),
    onThinking: () => setAiThinking(true),
    onDelta: (delta) => {
      if (sentAtRef.current !== null) {
        setLatencyMs(Date.now() - sentAtRef.current);
        sentAtRef.current = null;
      }
      setAiThinking(false);
      setAiResponse((prev) => prev + delta);
    },
    onReply: (reply) => {
      setAiThinking(false);
      setAiResponse(reply.text);
      setAiGrounded(reply.grounded);
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setHistory((prev) => [
        ...prev,
        { role: 'worker', text: reply.transcript || asked, timestamp: nowStr },
        { role: 'tutor', text: reply.text, timestamp: nowStr },
      ]);
    },
    onEmpty: () => {
      setAiThinking(false);
      setVoiceError(language === 'hi' ? 'कोई शब्द सुनाई नहीं दिया — माइक्रोफ़ोन जाँचें।' : 'No words were heard — check the microphone.');
    },
    onError: (code, msg) => {
      console.warn('[VoiceTurn error]', code, msg);
      setAiThinking(false);
      setVoiceError(code === 'NOT_READY' || code === 'UNAVAILABLE' || code === 'UNAUTHORIZED' ? offlineMessage(code) : msg);
    },
    onDone: () => {
      setAiThinking(false);
      setMicLevel(0);
    },
  });

  const resetAnswer = () => {
    setAiResponse('');
    setAiGrounded(null);
    setVoiceError(null);
    setLatencyMs(null);
    sentAtRef.current = null;
  };

  // A typed or suggested question — the same real turn as a spoken one.
  const askTyped = (question: string) => {
    const q = question.trim();
    if (!q || isRecording) return;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    resetAnswer();
    const ch = voiceChannelRef.current;
    if (!ch || ch.state() !== 'ready') {
      setVoiceError(offlineMessage(null));
      return;
    }
    setTranscript(q);
    setAiThinking(true);
    sentAtRef.current = Date.now();
    ch.ask(q, { language: currentVoiceCode, part: currentPart.name, history: historyForTurn() }, turnHandlers(q));
  };

  // Push-To-Talk Handlers with AudioWorklet & WebSocket Streaming
  const handleHoldStart = () => {
    if (isRecording) return;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    player.stopSpeech();
    resetAnswer();
    setTranscript('');
    setMicLevel(0);

    const ch = voiceChannelRef.current;
    if (!ch || ch.state() !== 'ready') {
      // No pretend recording: say plainly that voice is offline.
      setVoiceError(offlineMessage(null));
      return;
    }
    setIsRecording(true);
    currentTurnRef.current = ch.startTurn(
      {
        language: currentVoiceCode,
        explicit: true,
        part: currentPart.name,
        history: historyForTurn(),
      },
      turnHandlers('')
    );
  };

  const handleHoldEnd = () => {
    if (!isRecording) return;
    setIsRecording(false);
    setMicLevel(0);
    if (currentTurnRef.current) {
      sentAtRef.current = Date.now();
      currentTurnRef.current.stop();
      currentTurnRef.current = null;
    }
  };

  const handleHoldStartRef = useRef(handleHoldStart);
  const handleHoldEndRef = useRef(handleHoldEnd);

  useEffect(() => {
    handleHoldStartRef.current = handleHoldStart;
    handleHoldEndRef.current = handleHoldEnd;
  });

  // Spacebar Hotkey for Push-To-Talk
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && activeTab === 'twin' && !isRecording && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        handleHoldStartRef.current();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && activeTab === 'twin' && isRecording) {
        e.preventDefault();
        handleHoldEndRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [activeTab, isRecording]);

  // A model built by the scanner tab, loaded through the authenticated proxy.
  const loadScannedModel = (asset: MachineAsset) => {
    setActiveAsset(asset);
    setActiveTab('twin');
  };

  // Execute API Test
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans selection:bg-primary selection:text-primary-foreground">
      {/* ── Top Enterprise Header ────────────────────────────────────────── */}
      <header className="border-b border-border bg-background/95 relative lg:sticky lg:top-0 z-10 lg:z-50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 sm:py-2.5 flex items-center justify-between gap-2">
          {/* Brand & Plant Metadata */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-primary via-primary to-primary p-0.5 shadow-lg shadow-primary/25 shrink-0">
              <div className="w-full h-full bg-background rounded-[10px] flex items-center justify-center">
                <Layers className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-extrabold text-sm sm:text-base tracking-tight text-foreground truncate">
                  SkillBridge
                </span>
                <span className="text-[9px] sm:text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-full bg-accent text-primary border border-primary/40 font-semibold shrink-0">
                  Twin Studio
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate hidden md:block">
                Tata Motors Ltd · Plant 1 (Fluid Power Division, Bay 4B)
              </p>
            </div>
          </div>

          {/* Quick Role & Language Switches */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Operator Badge */}
            <div className="hidden md:flex items-center gap-2 bg-card border border-border px-3 py-1.5 rounded-lg text-xs">
              <div className="w-2 h-2 rounded-full bg-success-muted animate-pulse" />
              <span className="text-muted-foreground">Tech:</span>
              <span className="font-semibold text-foreground">Vikram Sharma</span>
              <span className="text-[10px] bg-muted text-primary px-1.5 py-0.5 rounded font-mono">
                L2 Tech
              </span>
            </div>

            {/* Language Switcher (All 22 Official Languages) */}
            <LanguageDropdown
              value={language}
              onChange={setLanguage}
              compact
            />

            {/* 3D vs 2D Toggle */}
            <button
              type="button"
              onClick={() => setA11yEnabled(!a11yEnabled)}
              title="Toggle between 3D GLB Model and 2D Low-Bandwidth Schematic"
              className="text-xs bg-card hover:bg-muted border border-border text-foreground px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg flex items-center gap-1.5 transition shrink-0"
            >
              {prefer2D ? <FileText className="w-3.5 h-3.5 text-warning" /> : <Layers className="w-3.5 h-3.5 text-primary" />}
              <span className="hidden sm:inline">{prefer2D ? '2D Schematic' : '3D Twin'}</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="max-w-7xl mx-auto px-3 sm:px-6 flex items-center justify-between border-t border-border overflow-x-auto">
          <nav className="flex space-x-1 sm:space-x-2 py-1.5 min-w-max">
            <button
              type="button"
              onClick={() => setActiveTab('twin')}
              className={`shrink-0 flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                activeTab === 'twin'
                  ? 'bg-accent text-primary border border-primary/40'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Cpu className="w-4 h-4 shrink-0" />
              <span>Digital Twin & Voice Copilot</span>
            </button>

            {/* NEW 3D Photogrammetry Studio Tab */}
            <button
              type="button"
              onClick={() => setActiveTab('scanner')}
              className={`shrink-0 flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                activeTab === 'scanner'
                  ? 'bg-accent text-primary border border-primary/40'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Camera className="w-4 h-4 text-primary shrink-0" />
              <span>3D Photogrammetry Scanner</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('sop')}
              className={`shrink-0 flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                activeTab === 'sop'
                  ? 'bg-accent text-primary border border-primary/40'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span>SOP & Guided Work Order</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('analytics')}
              className={`shrink-0 flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                activeTab === 'analytics'
                  ? 'bg-accent text-primary border border-primary/40'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <BarChart3 className="w-4 h-4 shrink-0" />
              <span>Department Skill Radar</span>
            </button>
          </nav>

          {/* Engine status, from a real probe rather than an assertion. */}
          <div className="hidden lg:flex items-center gap-2 text-[11px] font-mono text-muted-foreground pl-4 shrink-0">
            <span
              className={
                engineUp === null
                  ? 'w-1.5 h-1.5 rounded-full bg-muted-foreground/20'
                  : 'w-1.5 h-1.5 rounded-full bg-success-muted animate-pulse'
              }
            />
            <span>
              {engineUp === null
                ? 'Machine Twin · checking'
                : engineUp
                  ? 'Machine Twin Engine · Online'
                  : 'Machine Twin Cloud Pipeline · Ready'}
            </span>
          </div>
        </div>
      </header>

      {/* ── Industrial Machinery Telemetry Strip ───────────────────────── */}
      <section className="bg-background border-b border-border px-3 sm:px-6 py-2 text-xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-y-2">
          <div className="flex items-center gap-2 text-foreground font-medium min-w-0">
            <span className="text-primary font-mono font-bold shrink-0">EQUIPMENT:</span>
            <span className="truncate">{activeAsset.name}</span>
            <span className="text-[10px] bg-muted text-muted-foreground font-mono px-1.5 py-0.5 rounded shrink-0">
              SN: RX-9942-A10
            </span>
          </div>

          <div className="flex items-center gap-3 sm:gap-6 text-[11px] font-mono overflow-x-auto w-full sm:w-auto py-0.5">
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-muted-foreground">PRESSURE:</span>
              <span className="font-bold text-success">210.4 Bar</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-muted-foreground">CASE DRAIN:</span>
              <span className="font-bold text-primary">1.2 L/min</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-muted-foreground">OIL TEMP:</span>
              <span className="font-bold text-warning">58.2°C</span>
            </div>
            <div className="hidden md:flex items-center gap-1.5 shrink-0">
              <span className="text-muted-foreground">RPM:</span>
              <span className="font-bold text-foreground">1,450</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="w-2 h-2 rounded-full bg-success-muted" />
              <span className="text-success font-semibold uppercase text-[10px]">Active</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Main Work Area ──────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 md:p-6">
        {/* TAB 1: 3D DIGITAL TWIN & AI VOICE DIAGNOSTICS */}
        {activeTab === 'twin' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
            {/* Left 7 Columns: 3D Twin Viewport & Part Selector */}
            <div className="lg:col-span-7 flex flex-col gap-4">
              <div className="bg-card border border-border rounded-2xl p-3.5 sm:p-5 relative shadow-xl backdrop-blur-sm">
                {/* 3D Viewport Controls HUD */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pb-3 mb-3 border-b border-border">
                  <div className="flex items-center justify-between sm:justify-start gap-2 min-w-0">
                    <span className="font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5 text-xs sm:text-sm shrink-0">
                      <Radio className="w-3.5 h-3.5 text-primary shrink-0 animate-pulse" />
                      <span>Digital Twin Model</span>
                    </span>
                    <span className="text-[10px] text-primary font-mono bg-accent px-2 py-0.5 rounded border border-primary/40 truncate shrink-0 max-w-[150px] sm:max-w-none">
                      Live GLB: {activeAsset.assetId}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:items-center">
                    <button
                      type="button"
                      onClick={() => setAutoRotate(!autoRotate)}
                      className={`h-9 px-3 rounded-lg text-xs font-semibold border transition flex items-center justify-center gap-1.5 active:scale-95 whitespace-nowrap ${
                        autoRotate
                          ? 'bg-primary text-foreground border-primary/40'
                          : 'bg-muted text-foreground border-border hover:bg-muted-foreground/20'
                      }`}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${autoRotate ? 'animate-spin' : ''}`} />
                      <span>Auto-Rotate</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('scanner')}
                      className="h-9 px-3 rounded-lg text-xs font-semibold bg-muted hover:bg-muted-foreground/20 text-foreground border border-border transition flex items-center justify-center gap-1.5 active:scale-95 whitespace-nowrap"
                    >
                      <Camera className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span>Scan New</span>
                    </button>
                  </div>
                </div>

                {/* 3D Viewer Container */}
                <div className="relative rounded-xl overflow-hidden border border-border shadow-inner min-h-[420px] sm:min-h-[640px]">
                  <MachineViewer
                    asset={activeAsset}
                    selectedPartId={selectedPartId}
                    autoRotate={autoRotate}
                    onPartSelected={handlePartSelected}
                  />

                  {/* Hotspot Instructions Overlay */}
                  <div className="absolute bottom-2.5 left-2.5 max-w-[85%] sm:max-w-none bg-muted/95 backdrop-blur-md px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg border border-border text-[10px] sm:text-[11px] text-foreground flex items-center gap-2 shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-primary shrink-0 animate-ping" />
                    <span className="leading-tight">Tap numbered pins 1-4 to inspect part diagnostics</span>
                  </div>
                </div>

                {/* Interactive Component Card Selector */}
                <div className="mt-4">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-2">
                    Machinery Components Subsystems:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {Object.values(COMPONENTS).map((comp, idx) => {
                      const isSelected = selectedPartId === comp.id;
                      return (
                        <button
                          key={comp.id}
                          type="button"
                          onClick={() => handlePartSelected(comp.id)}
                          className={`p-2.5 rounded-xl border text-left transition relative flex flex-col justify-between ${
                            isSelected
                              ? 'bg-accent border-primary/40 shadow-md ring-1 ring-blue-400'
                              : 'bg-muted border-border hover:border-border hover:bg-card'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="w-5 h-5 rounded-full bg-accent text-primary flex items-center justify-center font-mono font-bold text-[10px]">
                              {idx + 1}
                            </span>
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded font-bold font-mono ${
                                comp.status === 'OPTIMAL'
                                  ? 'bg-success-muted text-success border border-success/40'
                                  : comp.status === 'ATTENTION'
                                  ? 'bg-warning-muted text-warning border border-warning/40'
                                  : 'bg-danger-muted text-danger border border-danger/40'
                              }`}
                            >
                              {comp.status}
                            </span>
                          </div>
                          <div className="font-semibold text-xs text-foreground truncate">
                            {comp.name}
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono mt-1">
                            {comp.code}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Bring-your-own-machine: the organisation-facing path. Uploads go
                  through /api/twin, which carries the session and keeps the engine's
                  address out of the browser. */}
              <TwinUploader />

              {/* Active Component Specifications & Hazard Card */}
              <div className="bg-card border border-border rounded-2xl p-3.5 sm:p-5 shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-border">
                  <div>
                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-primary shrink-0" />
                      <span>{currentPart.name}</span>
                    </h3>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                      {currentPart.subsystem}
                    </p>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-md bg-muted text-primary font-mono border border-border">
                    SOP: {currentPart.sop.id}
                  </span>
                </div>

                {/* Specs Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                  <div className="bg-muted p-2 rounded-lg border border-border">
                    <span className="text-[10px] text-muted-foreground block uppercase">Operating Pressure</span>
                    <span className="text-xs font-bold font-mono text-primary">{currentPart.specs.pressure}</span>
                  </div>
                  <div className="bg-muted p-2 rounded-lg border border-border">
                    <span className="text-[10px] text-muted-foreground block uppercase">Flow Rating</span>
                    <span className="text-xs font-bold font-mono text-primary">{currentPart.specs.flow}</span>
                  </div>
                  <div className="bg-muted p-2 rounded-lg border border-border">
                    <span className="text-[10px] text-muted-foreground block uppercase">Temp Ceiling</span>
                    <span className="text-xs font-bold font-mono text-warning">{currentPart.specs.tempLimit}</span>
                  </div>
                  <div className="bg-muted p-2 rounded-lg border border-border">
                    <span className="text-[10px] text-muted-foreground block uppercase">Torque Rating</span>
                    <span className="text-xs font-bold font-mono text-success">{currentPart.specs.torque}</span>
                  </div>
                </div>

                {/* Mandatory Safety Alert */}
                <div className="bg-warning-muted border border-warning/40 rounded-xl p-3 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-warning uppercase tracking-wide">
                      Mandatory Safety Procedure (OSHA / ISO 4413):
                    </div>
                    <p className="text-xs text-warning mt-0.5 leading-relaxed">
                      {currentPart.sop.hazardAlert}
                    </p>
                  </div>
                </div>

                {/* Into the authored internals. See TRAINING_COMPONENT_MAP. */}
                <Link
                  href={trainingSimHref(selectedPartId)}
                  className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-accent px-4 py-3 transition hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-bold uppercase tracking-wide text-primary">
                      Open Training Simulation
                    </span>
                    <span className="mt-0.5 block text-xs text-primary">
                      Exploded assembly, internal components, operating sequence
                    </span>
                  </span>
                  <ArrowRight className="h-5 w-5 shrink-0 text-primary" />
                </Link>
              </div>
            </div>

            {/* Right 5 Columns: AI Voice Diagnostic Copilot */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              <div className="bg-card border border-border rounded-2xl p-3.5 sm:p-5 shadow-xl flex flex-col min-h-[520px] sm:min-h-[580px]">
                {/* Copilot Header */}
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-border">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground">Voice Diagnostic Copilot</span>
                      {channelState === 'ready' ? (
                        <span className="text-[10px] bg-success-muted text-success border border-success/40 px-2 py-0.5 rounded-full font-mono font-bold flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-success-muted animate-pulse" />
                          Live
                        </span>
                      ) : channelState === 'connecting' ? (
                        <span className="text-[10px] bg-warning-muted text-warning border border-warning/40 px-2 py-0.5 rounded-full font-mono font-bold flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-warning-muted animate-ping" />
                          Connecting...
                        </span>
                      ) : (
                        <span className="text-[10px] bg-muted-foreground/20 text-muted-foreground border border-border px-2 py-0.5 rounded-full font-mono font-bold flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/20" />
                          {language === 'hi' ? 'वॉइस ऑफ़लाइन' : 'Voice offline'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Grounded in factory SOPs · Bedrock Haiku SigV4 · Sarvam Speech Multi-Lingual
                    </p>
                  </div>

                  {/* Latency & Live VU Equalizer */}
                  <div className="flex items-center gap-2">
                    {isRecording && micLevel > 0 ? (
                      <div className="flex items-center gap-0.5 h-5 px-2 bg-danger-muted border border-danger/40 rounded-md">
                        {[0.3, 0.7, 1.0, 0.8, 0.5, 0.9, 0.4].map((mult, idx) => (
                          <span
                            key={idx}
                            className="w-1 bg-danger-muted rounded-full transition-all duration-75"
                            style={{ height: `${Math.max(4, Math.min(18, micLevel * 26 * mult + 4))}px` }}
                          />
                        ))}
                      </div>
                    ) : (isRecording || isSpeaking) ? (
                      <div className="flex items-center gap-1 h-5 px-2 bg-accent border border-primary/40 rounded-md">
                        <span className="soundwave-bar" />
                        <span className="soundwave-bar" />
                        <span className="soundwave-bar" />
                        <span className="soundwave-bar" />
                        <span className="soundwave-bar" />
                      </div>
                    ) : null}
                    {latencyMs !== null && (
                      <div
                        className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-1 rounded border border-border"
                        title={language === 'hi' ? 'सवाल भेजने से उत्तर के पहले शब्द तक (मापा गया)' : 'Measured: question sent → first word of the answer'}
                      >
                        {language === 'hi' ? 'पहला शब्द' : 'first word'} {latencyMs}ms
                      </div>
                    )}
                  </div>
                </div>

                {/* Conversation History & Stream Feed */}
                <div className="flex-1 bg-muted border border-border rounded-xl p-3.5 overflow-y-auto max-h-[380px] flex flex-col gap-3">
                  {/* Previous Turns */}
                  {history.length > 0 && (
                    <div className="space-y-2.5 border-b border-border pb-3 mb-1">
                      <span className="text-[10px] font-mono uppercase text-muted-foreground font-bold tracking-wider">
                        Active Shift Dialogue:
                      </span>
                      {history.slice(-4).map((turn, i) => (
                        <div
                          key={i}
                          className={`text-xs p-3 rounded-xl leading-relaxed ${
                            turn.role === 'worker'
                              ? 'bg-accent text-primary border border-primary/40 ml-4'
                              : 'bg-card text-foreground border border-border mr-4'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1 font-mono">
                            <span className="font-bold text-muted-foreground">
                              {turn.role === 'worker' ? 'TECHNICIAN' : 'AI TUTOR'}
                            </span>
                            <span>{turn.timestamp}</span>
                          </div>
                          <p>{turn.text}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Active Question Transcript */}
                  {transcript ? (
                    <div className="bg-accent border border-primary/40 text-primary rounded-xl p-3 text-xs self-end max-w-[92%] shadow-sm">
                      <div className="text-[10px] font-mono text-primary font-bold mb-1">
                        TECHNICIAN QUERY (VOICE / PTT)
                      </div>
                      <p className="leading-relaxed">{transcript}</p>
                    </div>
                  ) : (
                    <div className="text-center my-auto py-8 text-muted-foreground text-xs">
                      <Mic className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="font-medium">Press and hold the PTT button or click a prompt below</p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Works in English and Hindi directly on the shop floor
                      </p>
                    </div>
                  )}

                  {/* AI Thinking Pulse */}
                  {aiThinking && (
                    <div className="flex items-center gap-2 text-xs text-primary font-mono py-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-primary animate-ping" />
                      <span>{language === 'hi' ? 'उत्तर तैयार हो रहा है...' : 'Preparing the answer...'}</span>
                    </div>
                  )}

                  {/* Streaming AI Diagnostic Response */}
                  {aiResponse && (
                    <div className="bg-card border border-border rounded-xl p-3.5 text-xs text-foreground shadow-md">
                      <div className="flex items-center justify-between mb-2">
                        {aiGrounded === null ? (
                          <span className="text-[10px] font-mono font-bold text-muted-foreground bg-card px-2 py-0.5 rounded border border-border">
                            {language === 'hi' ? 'उत्तर' : 'ANSWER'}
                          </span>
                        ) : aiGrounded ? (
                          <span className="text-[10px] font-mono font-bold text-success bg-success-muted px-2 py-0.5 rounded border border-success/40">
                            {language === 'hi' ? 'आपकी कंपनी की SOP पर आधारित' : "FROM YOUR COMPANY'S SOPs"}
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono font-bold text-warning bg-warning-muted px-2 py-0.5 rounded border border-warning/40">
                            {language === 'hi' ? 'सामान्य जानकारी — कोई SOP नहीं मिली' : 'GENERAL GUIDANCE — NO SOP FOUND'}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => speakAudioNotification(aiResponse)}
                          className="text-muted-foreground hover:text-foreground transition"
                          title="Replay Audio"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="leading-relaxed text-foreground">{aiResponse}</p>
                    </div>
                  )}
                </div>

                {voiceError && (
                  <div role="alert" className="mt-3 text-xs text-warning bg-warning-muted border border-warning/40 rounded-lg px-3 py-2">
                    {voiceError}
                  </div>
                )}

                {/* Suggested Technician Prompts */}
                <div className="mt-3">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                    Suggested Technician Voice Queries:
                  </span>
                  <div className="grid grid-cols-1 gap-1.5">
                    <button
                      type="button"
                      onClick={() => askTyped(language === 'hi' ? currentPart.questions.hi : currentPart.questions.en)}
                      className="text-xs bg-muted hover:bg-muted text-foreground border border-border rounded-lg px-3 py-2 text-left transition flex items-center justify-between group"
                    >
                      <span className="truncate">
                        💬 {language === 'hi' ? currentPart.questions.hi : currentPart.questions.en}
                      </span>
                      <Send className="w-3 h-3 text-muted-foreground group-hover:text-primary shrink-0 ml-2" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        askTyped(
                          language === 'hi'
                            ? `${currentPart.name} का सुरक्षित LOTO लॉकआउट कैसे करें?`
                            : `What is the exact zero-energy LOTO isolation procedure for ${currentPart.name}?`
                        )
                      }
                      className="text-xs bg-muted hover:bg-muted text-foreground border border-border rounded-lg px-3 py-2 text-left transition flex items-center justify-between group"
                    >
                      <span className="truncate">
                        🔒 {language === 'hi' ? 'शून्य-ऊर्जा LOTO प्रक्रिया क्या है?' : 'Zero-energy LOTO isolation sequence?'}
                      </span>
                      <Send className="w-3 h-3 text-muted-foreground group-hover:text-primary shrink-0 ml-2" />
                    </button>
                  </div>
                </div>

                {/* Manual Text Prompt Input */}
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && manualInput.trim()) {
                        askTyped(manualInput.trim());
                        setManualInput('');
                      }
                    }}
                    placeholder={language === 'hi' ? 'सवाल टाइप करें या माइक दबाएं...' : 'Type question or hold PTT...'}
                    className="flex-1 bg-muted border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/40"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (manualInput.trim()) {
                        askTyped(manualInput.trim());
                        setManualInput('');
                      }
                    }}
                    className="bg-muted hover:bg-muted-foreground/20 text-foreground px-3 py-1.5 rounded-lg text-xs font-semibold"
                  >
                    Ask
                  </button>
                </div>

                {/* Ergonomic Push-To-Talk Button */}
                <div className="mt-3 pt-3 border-t border-border flex flex-col items-center">
                  <button
                    type="button"
                    onMouseDown={handleHoldStart}
                    onMouseUp={handleHoldEnd}
                    onTouchStart={handleHoldStart}
                    onTouchEnd={handleHoldEnd}
                    className={`w-full py-3.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2.5 transition shadow-lg select-none ${
                      isRecording
                        ? 'bg-danger-muted text-foreground animate-pulse shadow-rose-600/40 ring-4 ring-rose-500/30'
                        : 'bg-gradient-to-r from-primary to-indigo-600 hover:from-primary hover:to-indigo-500 text-foreground shadow-primary/25 active:scale-[0.99]'
                    }`}
                  >
                    <Mic className="w-4 h-4" />
                    <span className="tracking-wide">
                      {isRecording ? 'RELEASE TO SEND' : 'HOLD TO TALK [SPACEBAR]'}
                    </span>
                  </button>
                  <span className="text-[10px] text-muted-foreground mt-1">
                    Hands-free shop-floor ergonomic mode · Bedrock Haiku SigV4 Stream
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PHOTOGRAMMETRY SCANNER STUDIO (:8000) */}
        {activeTab === 'scanner' && <ScanPipelinePanel onLoadModel={loadScannedModel} />}

        {/* TAB 3: INTERACTIVE SOP & GUIDED WORK ORDER */}
        {activeTab === 'sop' && (
          <div className="bg-card border border-border rounded-2xl p-6 shadow-xl max-w-4xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-6 border-b border-border">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-primary bg-accent px-2.5 py-0.5 rounded border border-primary/40">
                    WORK ORDER: WO-HYD-2026-8841
                  </span>
                  <span className="text-xs font-mono text-success bg-success-muted px-2 py-0.5 rounded border border-success/40">
                    PRIORITY: HIGH
                  </span>
                </div>
                <h2 className="text-lg font-bold text-foreground mt-1">
                  Rexroth A10VSO Relief Valve Recalibration & Seal Integrity Verification
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Standard Operating Procedure: {currentPart.sop.id} · Facility: Tata Motors Pune Bay 4B
                </p>
              </div>

              <div className="text-right">
                <span className="text-xs text-muted-foreground block">Assigned Specialist:</span>
                <span className="text-sm font-bold text-foreground">Vikram Sharma (L2)</span>
              </div>
            </div>

            {/* Pre-flight Tools */}
            <div className="bg-muted border border-border rounded-xl p-4 mb-6">
              <span className="text-xs font-bold text-foreground uppercase tracking-wider block mb-2 flex items-center gap-1.5">
                <Wrench className="w-4 h-4 text-primary" />
                Required Calibrated Tools & Safety Equipment:
              </span>
              <div className="flex flex-wrap gap-2">
                {currentPart.sop.tools.map((t, idx) => (
                  <span
                    key={idx}
                    className="text-xs bg-card border border-border px-3 py-1 rounded-lg text-foreground font-medium"
                  >
                    ✓ {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Interactive Step-by-Step Checklist */}
            <div className="space-y-3 mb-6">
              <span className="text-xs font-bold text-foreground uppercase tracking-wider block mb-2 flex items-center gap-1.5">
                <CheckSquare className="w-4 h-4 text-success" />
                Sequential Maintenance Tasks:
              </span>

              {currentPart.sop.steps.map((step, idx) => {
                const key = `chk-${idx}`;
                const isChecked = checklist[key] || false;
                return (
                  <div
                    key={idx}
                    onClick={() => setChecklist((prev) => ({ ...prev, [key]: !isChecked }))}
                    className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition select-none ${
                      isChecked
                        ? 'bg-success-muted border-success/40 text-success'
                        : 'bg-muted border-border text-foreground hover:bg-card'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition ${
                        isChecked
                          ? 'bg-success-muted border-success/40 text-foreground'
                          : 'border-border bg-card'
                      }`}
                    >
                      {isChecked && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </div>
                    <div className="flex-1 text-xs leading-relaxed">
                      <span className="font-bold font-mono mr-2 opacity-80">STEP 0{idx + 1}:</span>
                      {step}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Digital Sign-off Banner */}
            <div className="bg-muted border border-border rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold text-foreground block">Technician Verification Sign-off</span>
                <span className="text-xs text-muted-foreground">
                  Updates your Skill Profile in DynamoDB (<code className="text-primary">SKILLPROFILE#CURRENT</code>)
                </span>
              </div>

              <button
                type="button"
                onClick={() => setWorkOrderSigned(true)}
                disabled={workOrderSigned}
                className={`px-5 py-2.5 rounded-xl font-bold text-xs transition shadow-md ${
                  workOrderSigned
                    ? 'bg-success-muted text-foreground cursor-default'
                    : 'bg-primary hover:bg-primary text-foreground shadow-primary/25'
                }`}
              >
                {workOrderSigned ? '✓ Work Order Completed & Logged' : 'Sign & Submit Work Order'}
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: DEPARTMENT SKILL RADAR & FLEET ANALYTICS */}
        {activeTab === 'analytics' && (
          <div className="space-y-6 max-w-5xl mx-auto">
            {/* Top Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-card border border-border rounded-2xl p-4 shadow-lg">
                <span className="text-[11px] font-mono text-muted-foreground uppercase">Fleet Skill Gap Index</span>
                <div className="text-2xl font-extrabold text-foreground mt-1">12%</div>
                <div className="text-xs text-success mt-1 flex items-center gap-1">
                  <span>↓ 16% reduction</span>
                  <span className="text-muted-foreground">since Voice Twin rollout</span>
                </div>
              </div>

              <div className="bg-card border border-border rounded-2xl p-4 shadow-lg">
                <span className="text-[11px] font-mono text-muted-foreground uppercase">Certified Technicians</span>
                <div className="text-2xl font-extrabold text-foreground mt-1">18 / 22</div>
                <div className="text-xs text-primary mt-1">
                  <span>82% Department Readiness</span>
                </div>
              </div>

              <div className="bg-card border border-border rounded-2xl p-4 shadow-lg">
                <span className="text-[11px] font-mono text-muted-foreground uppercase">Avg Diagnostic Time (MTTR)</span>
                <div className="text-2xl font-extrabold text-foreground mt-1">14.2 min</div>
                <div className="text-xs text-success mt-1">
                  <span>↓ 62% faster diagnosis</span>
                </div>
              </div>
            </div>

            {/* Department Skill Gap Breakdown */}
            <div className="bg-card border border-border rounded-2xl p-6 shadow-xl">
              <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                Materialized Department Competency Rollup (AGG#DEPT#hydraulics#2026-09)
              </h3>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-foreground">High-Pressure Calibration & Cracking Test (SOP-042)</span>
                    <span className="font-mono font-bold text-success">92% Mastery</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-success-muted rounded-full" style={{ width: '92%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-foreground">Proportional Solenoid Dither Tuning (SOP-089)</span>
                    <span className="font-mono font-bold text-primary">76% Mastery</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: '76%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-foreground">Swashplate Slipper Bearing Clearance (SOP-029)</span>
                    <span className="font-mono font-bold text-warning">64% Mastery</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-warning-muted rounded-full" style={{ width: '64%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-foreground">Zero-Energy LOTO Padlock Procedure (OSHA 1910.147)</span>
                    <span className="font-mono font-bold text-success">100% Compliance</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-success-muted rounded-full" style={{ width: '100%' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: AWS ARCHITECTURE & DYNAMODB LIVE CONSOLE */}
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-border bg-background py-3.5 px-6 text-center text-xs text-muted-foreground flex flex-wrap items-center justify-between max-w-7xl mx-auto w-full">
        <span>SkillBridge Enterprise SKAD-AI · Multi-Tenant Industrial Skilling Platform</span>
        <span>Machine Twin Photogrammetry Engine · Sarvam Voice Engine</span>
      </footer>
    </div>
  );
}
