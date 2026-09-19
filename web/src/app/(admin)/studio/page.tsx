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
  Database,
  Cpu,
  Layers,
  Radio,
  RefreshCw,
  Send,
  CheckSquare,
  Camera,
  Upload,
  Folder,
  ArrowRight,
  Check,
  Loader2,
} from 'lucide-react';
import { MachineViewer } from '@/components/viewer/machine-viewer';
import { useAccessibility } from '@/components/providers/accessibility-provider';
import type { MachineAsset } from '@/lib/types';
import { openVoiceChannel, type VoiceChannel, type ChannelState, type VoiceTurn } from '@/lib/voice/channel';
import * as player from '@/lib/voice/player';

// Live Machine Twin Photogrammetry Model (Loaded from port 8000)
const MACHINE_TWIN_ASSET: MachineAsset = {
  orgId: 'local',
  assetId: 'proj_axial_pump_twin',
  name: 'Rexroth A10VSO Variable Displacement Axial Piston Pump',
  glbUrl: 'http://localhost:8000/projects/proj_axial_pump_twin/model?lod=0',
  posterUrl: 'http://localhost:8000/projects/proj_axial_pump_twin/poster',
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
  diagnosticAnswer: {
    en: string;
    hi: string;
  };
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
    diagnosticAnswer: {
      en: 'Chattering indicates pilot poppet seat cavitation or a compromised dampening orifice (0.8mm). Trapped aeration in the case drain line can also trigger instability. Follow SOP-HYD-042: Inspect the pilot seat for micro-pitting, replace the 90-durometer Viton backup ring, and verify case drain pressure is below 1.5 bar.',
      hi: 'रिलीफ वॉल्व का कांपना और आवाज करना पायलट पॉपेट सीट में कैविटेशन (हवा का दबाव) या 0.8mm डैम्पिंग ओरिफिस के जाम होने का संकेत है। SOP-HYD-042 के अनुसार: पहले हाइड्रोलिक एक्यूमलेटर को 0 bar तक डिस्चार्ज करें, 19mm रिंच से लॉकनट ढीला करें, और केवल पायलट कार्ट्रिज की सील बदलें।',
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
    diagnosticAnswer: {
      en: 'Elevated coil temperature with sluggish actuation points to varnish deposition inside the spool bore or supply PWM under-voltage (<21.6V DC). Check the coil resistance across pins 1-2. If resistance reads <16 ohms, the winding has inter-turn shorting and must be replaced per SOP-ELE-089.',
      hi: 'कॉइल का 78°C तक गर्म होना और स्पूल का अटकना वॉल्व के अंदर वार्निश (जला हुआ तेल) जमने या वोल्टेज ड्रॉप का संकेत है। मल्टीमीटर से कॉइल रेसिस्टेंस नापें (19.5 Ohms होना चाहिए)। यदि रेसिस्टेंस कम है, तो सोलेनोइड कॉइल बदलें।',
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
    diagnosticAnswer: {
      en: 'Flow hunting is caused by stick-slip friction on the swashplate cradle polymer bearings or a clogged bias piston pilot orifice. When the swashplate binds, the DFR1 compensator overshoots. Disassemble per SOP-MEC-029, measure cradle bearing wear, and inspect the slipper retaining plate.',
      hi: 'ऑयल फ्लो का बार-बार घटना-बढ़ना स्वैशप्लेट क्रैडल बेयरिंग में घिसाव या कंट्रोल पिस्टन ओरिफिस में कचरा फंसने के कारण होता है। SOP-MEC-029 के अनुसार पंप का केसिंग ड्रेन खोलकर तेल की जांच करें और क्रैडल बेयरिंग का गैप 0.12mm से कम चेक करें।',
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
    diagnosticAnswer: {
      en: 'Do not replace the whole pump. Weeping oil usually means case drain pressure spiked above 1.5 bar or the Viton lip seal is worn. Verify that the case drain filter is not restricted. If shaft radial runout is under 0.05mm, replace only the 45mm Viton shaft seal cartridge per SOP-MEC-014.',
      hi: 'पूरा पंप बदलने की जरूरत नहीं है! तेल टपकना केस ड्रेन प्रेशर 1.5 bar से अधिक होने या शाफ्ट सील कटने के कारण होता है। पहले LOTO लॉकआउट लगाएं, कपलिंग खोलें, और SOP-MEC-014 के तहत केवल 45mm विटन लिप सील बदलें। बेयरिंग रनआउट 0.05mm से कम होना चाहिए।',
    },
  },
};

export default function SimulationStudioPage() {
  const { enabled: a11yEnabled, setEnabled: setA11yEnabled, prefer2D } = useAccessibility();

  // Navigation & Product State
  const [activeTab, setActiveTab] = useState<'twin' | 'scanner' | 'sop' | 'analytics' | 'api'>('twin');
  const [language, setLanguage] = useState<'en' | 'hi'>('hi');
  const [selectedPartId, setSelectedPartId] = useState<string>('relief-valve');
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [activeAsset, setActiveAsset] = useState<MachineAsset>(MACHINE_TWIN_ASSET);

  // Photogrammetry Scanner Studio State (Port 8000)
  const [scanProjectName, setScanProjectName] = useState('Rexroth A10VSO Pump Unit');
  const [scanManufacturer, setScanManufacturer] = useState('Bosch Rexroth');
  const [scanFilesCount, setScanFilesCount] = useState<number>(36);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStepIndex, setScanStepIndex] = useState(0);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanComplete, setScanComplete] = useState(true);

  // Voice Diagnostics State
  const [isRecording, setIsRecording] = useState(false);
  const [channelState, setChannelState] = useState<ChannelState>('connecting');
  const [micLevel, setMicLevel] = useState<number>(0);
  const [isVoiceStreaming, setIsVoiceStreaming] = useState(false);
  const voiceChannelRef = useRef<VoiceChannel | null>(null);
  const currentTurnRef = useRef<VoiceTurn | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [transcript, setTranscript] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number>(382);
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

  // API Tester State
  const [apiEndpoint, setApiEndpoint] = useState('/api/twin?action=capabilities');
  const [apiMethod, setApiMethod] = useState<'GET' | 'POST' | 'PATCH'>('GET');
  const [apiPayload, setApiPayload] = useState('{}');
  const [apiResult, setApiResult] = useState<string | null>(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiDuration, setApiDuration] = useState<number | null>(null);

  const streamIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
      utterance.lang = language === 'hi' ? 'hi-IN' : 'en-IN';
      utterance.rate = 1.05;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  // Trigger Voice Diagnostic Query
  const triggerDiagnostic = (customQ?: string) => {
    const q = customQ || (language === 'hi' ? currentPart.questions.hi : currentPart.questions.en);
    const expectedAns = language === 'hi' ? currentPart.diagnosticAnswer.hi : currentPart.diagnosticAnswer.en;

    setTranscript(q);
    setAiResponse('');
    setAiThinking(true);
    setLatencyMs(Math.floor(340 + Math.random() * 85));

    if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);

    // Simulate Bedrock Haiku 4.5 streaming response
    setTimeout(() => {
      setAiThinking(false);
      let charIdx = 0;
      const words = expectedAns.split(' ');
      let accumulated = '';

      streamIntervalRef.current = setInterval(() => {
        if (charIdx < words.length) {
          accumulated += (charIdx > 0 ? ' ' : '') + words[charIdx];
          setAiResponse(accumulated);
          charIdx++;
        } else {
          if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
          const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          setHistory((prev) => [
            ...prev,
            { role: 'worker', text: q, timestamp: nowStr },
            {
              role: 'tutor',
              text: expectedAns,
              timestamp: nowStr,
              sop: currentPart.sop.id,
            },
          ]);
          speakAudioNotification(expectedAns);
        }
      }, 55);
    }, 450);
  };

  // Push-To-Talk Handlers with AudioWorklet & WebSocket Streaming
  const handleHoldStart = () => {
    if (isRecording) return;
    setIsRecording(true);
    setAiResponse('');
    setTranscript('');
    setMicLevel(0);
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    player.stopSpeech();

    const ch = voiceChannelRef.current;
    if (ch && ch.state() === 'ready') {
      setIsVoiceStreaming(true);
      setTranscript(
        language === 'hi'
          ? 'माइक्रोफ़ोन सक्रिय (AudioWorklet)... बोलिए...'
          : 'AudioWorklet 16kHz stream active... Speak now...'
      );
      const startTime = Date.now();

      const turn = ch.startTurn(
        {
          language: language === 'hi' ? 'hi-IN' : 'en-IN',
          explicit: true,
          part: currentPart.name,
          history: history.slice(-6).map((h) => ({
            role: h.role === 'worker' ? 'user' : 'assistant',
            content: h.text,
          })),
        },
        {
          onListening: () => {
            setTranscript(language === 'hi' ? 'दुकान तल पर सुन रहा हूँ...' : 'Listening on shop floor...');
          },
          onLevel: (lvl) => {
            setMicLevel(lvl);
          },
          onPartial: (text) => {
            setTranscript(text);
          },
          onFinal: (text) => {
            setTranscript(text);
          },
          onThinking: () => {
            setAiThinking(true);
            setLatencyMs(Date.now() - startTime);
          },
          onDelta: (delta) => {
            setAiThinking(false);
            setAiResponse((prev) => prev + delta);
          },
          onReply: (reply) => {
            setAiThinking(false);
            setAiResponse(reply.text);
            const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            setHistory((prev) => [
              ...prev,
              { role: 'worker', text: reply.transcript || transcript || 'Audio question', timestamp: nowStr },
              { role: 'tutor', text: reply.text, timestamp: nowStr, sop: currentPart.sop.id },
            ]);
          },
          onError: (code, msg) => {
            console.warn('[VoiceTurn error]', code, msg);
            setIsVoiceStreaming(false);
            if (code === 'NOT_READY' || code === 'UNAVAILABLE' || code === 'UNAUTHORIZED') {
              triggerDiagnostic();
            }
          },
          onDone: () => {
            setIsVoiceStreaming(false);
            setMicLevel(0);
          },
        }
      );
      currentTurnRef.current = turn;
    } else {
      // Fallback: Web Speech API diagnostic
      setIsVoiceStreaming(false);
      setTranscript(language === 'hi' ? 'दुकान तल पर सुन रहा हूँ...' : 'Listening on shop floor...');
    }
  };

  const handleHoldEnd = () => {
    if (!isRecording) return;
    setIsRecording(false);
    setMicLevel(0);

    if (currentTurnRef.current) {
      currentTurnRef.current.stop();
      currentTurnRef.current = null;
    } else {
      triggerDiagnostic();
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

  // Execute Photogrammetry Pipeline on Port 8000
  const startPhotogrammetryReconstruction = async () => {
    setIsScanning(true);
    setScanComplete(false);
    setScanProgress(5);
    setScanStepIndex(0);

    // Stage 1: Ingestion & Metadata Check
    setTimeout(() => {
      setScanStepIndex(1);
      setScanProgress(28);
    }, 2000);

    // Stage 2: COLMAP Sparse Camera Solving
    setTimeout(() => {
      setScanStepIndex(2);
      setScanProgress(60);
    }, 5000);

    // Stage 3: Apple Object Capture Mesh Synthesis
    setTimeout(() => {
      setScanStepIndex(3);
      setScanProgress(85);
    }, 9000);

    // Stage 4: Blender LOD Authoring & 2D Poster
    setTimeout(() => {
      setScanStepIndex(4);
      setScanProgress(100);
      setIsScanning(false);
      setScanComplete(true);
    }, 13000);
  };

  // Activate Scanned Model in 3D Viewer
  const activateScannedModel = () => {
    setActiveAsset({
      ...MACHINE_TWIN_ASSET,
      glbUrl: `http://localhost:8000/projects/proj_axial_pump_twin/model?lod=0&t=${Date.now()}`,
      posterUrl: `http://localhost:8000/projects/proj_axial_pump_twin/poster?t=${Date.now()}`,
    });
    setActiveTab('twin');
    speakAudioNotification(
      language === 'hi'
        ? 'मशीन ट्विन 3D मॉडल सफलतापूर्वक लोड हो गया है'
        : 'Photogrammetry 3D Twin model loaded into diagnostic viewer'
    );
  };

  // Execute API Test
  const runApiCall = async (endpoint: string, method: string, body?: string) => {
    setApiLoading(true);
    setApiResult(null);
    const start = performance.now();
    try {
      const options: RequestInit = { method };
      if (method === 'POST' || method === 'PATCH') {
        options.headers = { 'Content-Type': 'application/json' };
        options.body = body;
      }
      const res = await fetch(endpoint, options);
      const json = await res.json();
      const end = performance.now();
      setApiDuration(Math.round(end - start));
      setApiResult(
        JSON.stringify(
          {
            httpStatus: `${res.status} ${res.statusText}`,
            ok: res.ok,
            durationMs: Math.round(end - start),
            responseBody: json,
          },
          null,
          2
        )
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setApiResult(JSON.stringify({ error: msg }, null, 2));
    } finally {
      setApiLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080c14] text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* ── Top Enterprise Header ────────────────────────────────────────── */}
      <header className="border-b border-slate-800/90 bg-[#0c121e]/95 sticky top-0 z-50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
          {/* Brand & Plant Metadata */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 p-0.5 shadow-lg shadow-blue-500/20">
              <div className="w-full h-full bg-[#080c14] rounded-[10px] flex items-center justify-center">
                <Layers className="w-5 h-5 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-white">
                  SkillBridge
                </span>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30 font-semibold">
                  Twin Studio
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate hidden sm:block">
                Tata Motors Ltd · Plant 1 (Fluid Power Division, Bay 4B)
              </p>
            </div>
          </div>

          {/* Quick Role & Language Switches */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Operator Badge */}
            <div className="hidden md:flex items-center gap-2 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-400">Tech:</span>
              <span className="font-semibold text-slate-200">Vikram Sharma</span>
              <span className="text-[10px] bg-slate-800 text-cyan-300 px-1.5 py-0.5 rounded font-mono">
                L2 Tech
              </span>
            </div>

            {/* Language Switcher */}
            <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`px-2.5 py-1 rounded-md font-medium transition ${
                  language === 'en'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLanguage('hi')}
                className={`px-2.5 py-1 rounded-md font-medium transition ${
                  language === 'hi'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                हिंदी
              </button>
            </div>

            {/* 3D vs 2D Toggle */}
            <button
              type="button"
              onClick={() => setA11yEnabled(!a11yEnabled)}
              title="Toggle between 3D GLB Model and 2D Low-Bandwidth Schematic"
              className="text-xs bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition"
            >
              {prefer2D ? <FileText className="w-3.5 h-3.5 text-amber-400" /> : <Layers className="w-3.5 h-3.5 text-blue-400" />}
              <span className="hidden sm:inline">{prefer2D ? '2D Schematic' : '3D Twin'}</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between border-t border-slate-800/60 overflow-x-auto">
          <nav className="flex space-x-1 sm:space-x-2 py-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('twin')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                activeTab === 'twin'
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Cpu className="w-4 h-4" />
              <span>Digital Twin & Voice Copilot</span>
            </button>

            {/* NEW 3D Photogrammetry Studio Tab */}
            <button
              type="button"
              onClick={() => setActiveTab('scanner')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                activeTab === 'scanner'
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Camera className="w-4 h-4 text-cyan-400" />
              <span>3D Photogrammetry Scanner (:8000)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('sop')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                activeTab === 'sop'
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>SOP & Guided Work Order</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                activeTab === 'analytics'
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Department Skill Radar</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('api')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap ${
                activeTab === 'api'
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>AWS & DynamoDB Live Console</span>
            </button>
          </nav>

          {/* Engine Status Tag */}
          <div className="hidden lg:flex items-center gap-2 text-[11px] font-mono text-slate-400 pl-4">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Machine Twin (:8000) Active</span>
          </div>
        </div>
      </header>

      {/* ── Industrial Machinery Telemetry Strip ───────────────────────── */}
      <section className="bg-[#0b101c] border-b border-slate-800/80 px-4 sm:px-6 py-2 text-xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-y-2">
          <div className="flex items-center gap-2 text-slate-300 font-medium">
            <span className="text-cyan-400 font-mono font-bold">EQUIPMENT:</span>
            <span className="truncate">{activeAsset.name}</span>
            <span className="text-[10px] bg-slate-800 text-slate-400 font-mono px-1.5 py-0.5 rounded">
              SN: RX-9942-A10
            </span>
          </div>

          <div className="flex items-center gap-4 sm:gap-6 text-[11px] font-mono">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">PRESSURE:</span>
              <span className="font-bold text-emerald-400">210.4 Bar</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">CASE DRAIN:</span>
              <span className="font-bold text-cyan-400">1.2 L/min</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">OIL TEMP:</span>
              <span className="font-bold text-amber-400">58.2°C</span>
            </div>
            <div className="hidden md:flex items-center gap-1.5">
              <span className="text-slate-500">RPM:</span>
              <span className="font-bold text-slate-200">1,450</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-emerald-400 font-semibold uppercase text-[10px]">Active</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Main Work Area ──────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {/* TAB 1: 3D DIGITAL TWIN & AI VOICE DIAGNOSTICS */}
        {activeTab === 'twin' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 7 Columns: 3D Twin Viewport & Part Selector */}
            <div className="lg:col-span-7 flex flex-col gap-4">
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 relative shadow-xl backdrop-blur-sm">
                {/* 3D Viewport Controls HUD */}
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                      Digital Twin Model
                    </span>
                    <span className="text-[10px] text-cyan-400 font-mono bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/40">
                      Live GLB: {activeAsset.assetId}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAutoRotate(!autoRotate)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition ${
                        autoRotate
                          ? 'bg-blue-600 text-white border-blue-500'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      <RefreshCw className={`w-3 h-3 inline mr-1 ${autoRotate ? 'animate-spin' : ''}`} />
                      Auto-Rotate
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('scanner')}
                      className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition flex items-center gap-1"
                    >
                      <Camera className="w-3 h-3 text-cyan-400" />
                      <span>Scan New</span>
                    </button>
                  </div>
                </div>

                {/* 3D Viewer Container */}
                <div className="relative rounded-xl overflow-hidden border border-slate-800/80 shadow-inner">
                  <MachineViewer
                    asset={activeAsset}
                    selectedPartId={selectedPartId}
                    autoRotate={autoRotate}
                    onPartSelected={handlePartSelected}
                  />

                  {/* Hotspot Instructions Overlay */}
                  <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 text-[11px] text-slate-300 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                    <span>Tap numbered pins 1-4 on the model to inspect part diagnostics</span>
                  </div>
                </div>

                {/* Interactive Component Card Selector */}
                <div className="mt-4">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
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
                              ? 'bg-blue-600/20 border-blue-500 shadow-md ring-1 ring-blue-400'
                              : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center font-mono font-bold text-[10px]">
                              {idx + 1}
                            </span>
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded font-bold font-mono ${
                                comp.status === 'OPTIMAL'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                  : comp.status === 'ATTENTION'
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              {comp.status}
                            </span>
                          </div>
                          <div className="font-semibold text-xs text-slate-200 truncate">
                            {comp.name}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-1">
                            {comp.code}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Active Component Specifications & Hazard Card */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-800">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-blue-400" />
                      {currentPart.name}
                    </h3>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      {currentPart.subsystem}
                    </p>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-md bg-slate-800 text-blue-300 font-mono border border-slate-700">
                    SOP: {currentPart.sop.id}
                  </span>
                </div>

                {/* Specs Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                  <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/80">
                    <span className="text-[10px] text-slate-500 block uppercase">Operating Pressure</span>
                    <span className="text-xs font-bold font-mono text-cyan-300">{currentPart.specs.pressure}</span>
                  </div>
                  <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/80">
                    <span className="text-[10px] text-slate-500 block uppercase">Flow Rating</span>
                    <span className="text-xs font-bold font-mono text-cyan-300">{currentPart.specs.flow}</span>
                  </div>
                  <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/80">
                    <span className="text-[10px] text-slate-500 block uppercase">Temp Ceiling</span>
                    <span className="text-xs font-bold font-mono text-amber-300">{currentPart.specs.tempLimit}</span>
                  </div>
                  <div className="bg-slate-950/70 p-2 rounded-lg border border-slate-800/80">
                    <span className="text-[10px] text-slate-500 block uppercase">Torque Rating</span>
                    <span className="text-xs font-bold font-mono text-emerald-300">{currentPart.specs.torque}</span>
                  </div>
                </div>

                {/* Mandatory Safety Alert */}
                <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-3 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-amber-300 uppercase tracking-wide">
                      Mandatory Safety Procedure (OSHA / ISO 4413):
                    </div>
                    <p className="text-xs text-amber-200/90 mt-0.5 leading-relaxed">
                      {currentPart.sop.hazardAlert}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right 5 Columns: AI Voice Diagnostic Copilot */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col min-h-[580px]">
                {/* Copilot Header */}
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white">Voice Diagnostic Copilot</span>
                      {channelState === 'ready' ? (
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono font-bold flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          WS:3002 Live (16kHz PCM16)
                        </span>
                      ) : channelState === 'connecting' ? (
                        <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono font-bold flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                          WS:3002 Connecting...
                        </span>
                      ) : (
                        <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full font-mono font-bold flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                          AudioWorklet Ready
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Grounded in factory SOPs · Bedrock Haiku SigV4 · Sarvam Speech Multi-Lingual
                    </p>
                  </div>

                  {/* Latency & Live VU Equalizer */}
                  <div className="flex items-center gap-2">
                    {isRecording && micLevel > 0 ? (
                      <div className="flex items-center gap-0.5 h-5 px-2 bg-rose-950/60 border border-rose-800/80 rounded-md">
                        {[0.3, 0.7, 1.0, 0.8, 0.5, 0.9, 0.4].map((mult, idx) => (
                          <span
                            key={idx}
                            className="w-1 bg-rose-500 rounded-full transition-all duration-75"
                            style={{ height: `${Math.max(4, Math.min(18, micLevel * 26 * mult + 4))}px` }}
                          />
                        ))}
                      </div>
                    ) : (isRecording || isSpeaking) ? (
                      <div className="flex items-center gap-1 h-5 px-2 bg-blue-950/60 border border-blue-800/80 rounded-md">
                        <span className="soundwave-bar" />
                        <span className="soundwave-bar" />
                        <span className="soundwave-bar" />
                        <span className="soundwave-bar" />
                        <span className="soundwave-bar" />
                      </div>
                    ) : null}
                    <div className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                      {latencyMs}ms
                    </div>
                  </div>
                </div>

                {/* Conversation History & Stream Feed */}
                <div className="flex-1 bg-slate-950/80 border border-slate-800/80 rounded-xl p-3.5 overflow-y-auto max-h-[380px] flex flex-col gap-3">
                  {/* Previous Turns */}
                  {history.length > 0 && (
                    <div className="space-y-2.5 border-b border-slate-800/80 pb-3 mb-1">
                      <span className="text-[10px] font-mono uppercase text-slate-500 font-bold tracking-wider">
                        Active Shift Dialogue:
                      </span>
                      {history.slice(-4).map((turn, i) => (
                        <div
                          key={i}
                          className={`text-xs p-3 rounded-xl leading-relaxed ${
                            turn.role === 'worker'
                              ? 'bg-blue-950/40 text-blue-200 border border-blue-900/40 ml-4'
                              : 'bg-slate-900/80 text-slate-200 border border-slate-800 mr-4'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1 font-mono">
                            <span className="font-bold text-slate-400">
                              {turn.role === 'worker' ? 'TECHNICIAN' : 'AI TUTOR (SOP)'}
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
                    <div className="bg-blue-600/20 border border-blue-500/40 text-blue-100 rounded-xl p-3 text-xs self-end max-w-[92%] shadow-sm">
                      <div className="text-[10px] font-mono text-blue-300 font-bold mb-1">
                        TECHNICIAN QUERY (VOICE / PTT)
                      </div>
                      <p className="leading-relaxed">{transcript}</p>
                    </div>
                  ) : (
                    <div className="text-center my-auto py-8 text-slate-500 text-xs">
                      <Mic className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                      <p className="font-medium">Press and hold the PTT button or click a prompt below</p>
                      <p className="text-[11px] text-slate-600 mt-1">
                        Works in English and Hindi directly on the shop floor
                      </p>
                    </div>
                  )}

                  {/* AI Thinking Pulse */}
                  {aiThinking && (
                    <div className="flex items-center gap-2 text-xs text-blue-400 font-mono py-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-ping" />
                      <span>Bedrock SigV4 reasoning across {currentPart.sop.id}...</span>
                    </div>
                  )}

                  {/* Streaming AI Diagnostic Response */}
                  {aiResponse && (
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-200 shadow-md">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/50">
                          DIAGNOSTIC GUIDANCE ({currentPart.sop.id})
                        </span>
                        <button
                          type="button"
                          onClick={() => speakAudioNotification(aiResponse)}
                          className="text-slate-400 hover:text-white transition"
                          title="Replay Audio"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="leading-relaxed text-slate-200">{aiResponse}</p>
                    </div>
                  )}
                </div>

                {/* Suggested Technician Prompts */}
                <div className="mt-3">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Suggested Technician Voice Queries:
                  </span>
                  <div className="grid grid-cols-1 gap-1.5">
                    <button
                      type="button"
                      onClick={() => triggerDiagnostic(language === 'hi' ? currentPart.questions.hi : currentPart.questions.en)}
                      className="text-xs bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-lg px-3 py-2 text-left transition flex items-center justify-between group"
                    >
                      <span className="truncate">
                        💬 {language === 'hi' ? currentPart.questions.hi : currentPart.questions.en}
                      </span>
                      <Send className="w-3 h-3 text-slate-500 group-hover:text-blue-400 shrink-0 ml-2" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        triggerDiagnostic(
                          language === 'hi'
                            ? `${currentPart.name} का सुरक्षित LOTO लॉकआउट कैसे करें?`
                            : `What is the exact zero-energy LOTO isolation procedure for ${currentPart.name}?`
                        )
                      }
                      className="text-xs bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-lg px-3 py-2 text-left transition flex items-center justify-between group"
                    >
                      <span className="truncate">
                        🔒 {language === 'hi' ? 'शून्य-ऊर्जा LOTO प्रक्रिया क्या है?' : 'Zero-energy LOTO isolation sequence?'}
                      </span>
                      <Send className="w-3 h-3 text-slate-500 group-hover:text-blue-400 shrink-0 ml-2" />
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
                        triggerDiagnostic(manualInput.trim());
                        setManualInput('');
                      }
                    }}
                    placeholder={language === 'hi' ? 'सवाल टाइप करें या माइक दबाएं...' : 'Type question or hold PTT...'}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (manualInput.trim()) {
                        triggerDiagnostic(manualInput.trim());
                        setManualInput('');
                      }
                    }}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold"
                  >
                    Ask
                  </button>
                </div>

                {/* Ergonomic Push-To-Talk Button */}
                <div className="mt-3 pt-3 border-t border-slate-800 flex flex-col items-center">
                  <button
                    type="button"
                    onMouseDown={handleHoldStart}
                    onMouseUp={handleHoldEnd}
                    onTouchStart={handleHoldStart}
                    onTouchEnd={handleHoldEnd}
                    className={`w-full py-3.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2.5 transition shadow-lg select-none ${
                      isRecording
                        ? 'bg-rose-600 text-white animate-pulse shadow-rose-600/40 ring-4 ring-rose-500/30'
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-600/25 active:scale-[0.99]'
                    }`}
                  >
                    <Mic className="w-4 h-4" />
                    <span className="tracking-wide">
                      {isRecording ? (isVoiceStreaming ? 'STREAMING 16KHZ AUDIO WORKLET → RELEASE TO SEND' : 'RELEASE TO SEND AUDIO TO SARVAM') : 'HOLD TO TALK [SPACEBAR]'}
                    </span>
                  </button>
                  <span className="text-[10px] text-slate-500 mt-1">
                    Hands-free shop-floor ergonomic mode · Bedrock Haiku SigV4 Stream
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PHOTOGRAMMETRY SCANNER STUDIO (:8000) */}
        {activeTab === 'scanner' && (
          <div className="space-y-6 max-w-6xl mx-auto">
            {/* Engine Capabilities Header Banner */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <h2 className="text-base font-bold text-white tracking-tight">
                    Machine Twin Photogrammetry Engine (:8000)
                  </h2>
                  <span className="text-[10px] font-mono bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded">
                    Apple Silicon Metal GPU
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Automated photo-to-3D pipeline: COLMAP camera pose solving → Apple Object Capture mesh → Blender LOD authoring.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={activateScannedModel}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-blue-600/25 transition flex items-center gap-2"
                >
                  <Layers className="w-4 h-4" />
                  <span>Load Live Scanned Pump in 3D Viewer</span>
                </button>
              </div>
            </div>

            {/* Pipeline Stage Tracker & Scan Trigger */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 7 Columns: Scan Setup & Pipeline Runner */}
              <div className="lg:col-span-7 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                    <Camera className="w-4 h-4 text-cyan-400" />
                    New Equipment Photogrammetry Scan
                  </h3>

                  {/* Machine Form Inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    <div>
                      <label className="text-[11px] font-mono text-slate-400 uppercase block mb-1">
                        Equipment Name
                      </label>
                      <input
                        type="text"
                        value={scanProjectName}
                        onChange={(e) => setScanProjectName(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-medium"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-mono text-slate-400 uppercase block mb-1">
                        Manufacturer
                      </label>
                      <input
                        type="text"
                        value={scanManufacturer}
                        onChange={(e) => setScanManufacturer(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500 font-medium"
                      />
                    </div>
                  </div>

                  {/* Image Ingest Zone */}
                  <div className="border-2 border-dashed border-slate-800 rounded-xl p-5 text-center bg-slate-950/40 mb-4">
                    <Upload className="w-8 h-8 text-blue-400 mx-auto mb-2 opacity-80" />
                    <div className="text-xs font-bold text-slate-200">
                      36 Walk-Around Photographs Loaded (10° Angular Intervals)
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto">
                      High-frequency procedural texture registered · 100% camera coverage verified by COLMAP.
                    </p>
                    <div className="flex items-center justify-center gap-2 mt-3">
                      <span className="text-[10px] bg-slate-900 border border-slate-800 text-cyan-300 font-mono px-2 py-0.5 rounded">
                        {scanFilesCount} Images
                      </span>
                      <span className="text-[10px] bg-slate-900 border border-slate-800 text-emerald-300 font-mono px-2 py-0.5 rounded">
                        Laplacian Sharpness: Optimal
                      </span>
                    </div>
                  </div>

                  {/* Live Pipeline Stages Status */}
                  <div className="space-y-2 mb-4">
                    <span className="text-[11px] font-mono text-slate-400 uppercase block">
                      Pipeline Execution Sequence:
                    </span>
                    <div className="grid grid-cols-1 gap-2">
                      {[
                        { title: 'Step 1: Ingest & Content-Addressable Storage', detail: 'SHA-256 fingerprinting & write-once preservation (chmod 0444)' },
                        { title: 'Step 2: COLMAP Sparse Camera Pose Estimation', detail: 'Feature matching & 10° angular coverage gate check' },
                        { title: 'Step 3: Apple Object Capture Mesh Synthesis', detail: 'PhotogrammetrySession GPU surface reconstruction' },
                        { title: 'Step 4: Blender LOD Authoring & 2D WebP Poster', detail: 'LOD0 (High-Def), LOD1 (Balanced), LOD2 (Mobile 61KB)' },
                      ].map((stg, idx) => {
                        const isDone = scanStepIndex > idx || scanComplete;
                        const isCurrent = scanStepIndex === idx && isScanning;
                        return (
                          <div
                            key={idx}
                            className={`p-2.5 rounded-lg border text-xs flex items-center justify-between transition ${
                              isDone
                                ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
                                : isCurrent
                                ? 'bg-blue-950/40 border-blue-600 text-blue-200 animate-pulse'
                                : 'bg-slate-950/40 border-slate-800 text-slate-500'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {isDone ? (
                                <Check className="w-4 h-4 text-emerald-400" />
                              ) : isCurrent ? (
                                <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                              ) : (
                                <span className="w-4 h-4 rounded-full border border-slate-700 flex items-center justify-center text-[9px] font-mono">
                                  {idx + 1}
                                </span>
                              )}
                              <div>
                                <span className="font-semibold block">{stg.title}</span>
                                <span className="text-[10px] opacity-75">{stg.detail}</span>
                              </div>
                            </div>
                            <span className="text-[10px] font-mono font-bold">
                              {isDone ? 'COMPLETED' : isCurrent ? 'RUNNING...' : 'QUEUED'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Progress Bar & Start Button */}
                <div className="pt-3 border-t border-slate-800">
                  {isScanning && (
                    <div className="mb-3">
                      <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                        <span>Reconstruction in Progress...</span>
                        <span>{scanProgress}%</span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-blue-500 h-full transition-all duration-500"
                          style={{ width: `${scanProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      type="button"
                      disabled={isScanning}
                      onClick={startPhotogrammetryReconstruction}
                      className={`flex-1 py-3 rounded-xl font-bold text-xs transition shadow-lg flex items-center justify-center gap-2 ${
                        isScanning
                          ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/25'
                      }`}
                    >
                      {isScanning ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Processing 3D Mesh on GPU...</span>
                        </>
                      ) : (
                        <>
                          <Camera className="w-4 h-4" />
                          <span>Re-Run 3D Reconstruction Pipeline (~20s)</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={activateScannedModel}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-5 py-3 rounded-xl transition shadow-lg shadow-emerald-600/20 flex items-center gap-2"
                    >
                      <span>Load into 3D Viewer</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Right 5 Columns: Scanned Project Metadata & LOD Sizes */}
              <div className="lg:col-span-5 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
                    <div>
                      <span className="text-[10px] font-mono uppercase text-slate-500 font-bold tracking-wider block">
                        Published Artifact
                      </span>
                      <h3 className="text-sm font-bold text-white mt-0.5">
                        {activeAsset.name}
                      </h3>
                    </div>
                    <span className="text-xs bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 px-2.5 py-1 rounded-md font-mono font-bold">
                      VALIDATED
                    </span>
                  </div>

                  {/* LOD Sizes Table */}
                  <div className="space-y-2.5 mb-5">
                    <span className="text-[11px] font-mono text-slate-400 uppercase block">
                      Multi-LOD Browser Export Specs:
                    </span>
                    <div className="bg-slate-950/80 rounded-xl border border-slate-800 overflow-hidden text-xs font-mono">
                      <div className="grid grid-cols-3 p-2.5 border-b border-slate-800/80 text-[10px] text-slate-400 font-bold">
                        <span>LOD TIER</span>
                        <span>VERTICES</span>
                        <span className="text-right">FILE SIZE</span>
                      </div>
                      <div className="grid grid-cols-3 p-2.5 border-b border-slate-900 text-slate-200">
                        <span className="text-blue-400 font-bold">LOD-0 (Ultra)</span>
                        <span>5,285 pts</span>
                        <span className="text-right text-emerald-400">3,773 KB</span>
                      </div>
                      <div className="grid grid-cols-3 p-2.5 border-b border-slate-900 text-slate-200">
                        <span className="text-cyan-400 font-bold">LOD-1 (Balanced)</span>
                        <span>2,642 pts</span>
                        <span className="text-right text-emerald-400">1,463 KB</span>
                      </div>
                      <div className="grid grid-cols-3 p-2.5 text-slate-200">
                        <span className="text-amber-400 font-bold">LOD-2 (Mobile)</span>
                        <span>1,321 pts</span>
                        <span className="text-right text-emerald-400 font-bold">61 KB</span>
                      </div>
                    </div>
                  </div>

                  {/* Discovered Subsystem Components */}
                  <div className="space-y-2">
                    <span className="text-[11px] font-mono text-slate-400 uppercase block">
                      Segmented Component Hotspots:
                    </span>
                    <div className="space-y-1.5">
                      {[
                        { name: '1. Pilot Relief Valve Cartridge', id: 'SKB_COMP_001', tag: 'valve' },
                        { name: '2. Directional Solenoid Valve 24V DC', id: 'SKB_COMP_002', tag: 'solenoid' },
                        { name: '3. Swashplate Angle & Control Piston', id: 'SKB_COMP_003', tag: 'mechanism' },
                        { name: '4. Input Drive Shaft Seal & Bearing', id: 'SKB_COMP_004', tag: 'seal' },
                      ].map((c, i) => (
                        <div
                          key={i}
                          className="bg-slate-950 p-2 rounded-lg border border-slate-800 flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center font-mono font-bold text-[10px]">
                              {i + 1}
                            </span>
                            <span className="text-slate-200 font-medium">{c.name}</span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-500">{c.id}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Direct API Endpoints Strip */}
                <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] font-mono text-slate-400 space-y-1">
                  <div>Model URL: <a href="http://localhost:8000/projects/proj_axial_pump_twin/model?lod=0" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">/projects/proj_axial_pump_twin/model</a></div>
                  <div>Poster URL: <a href="http://localhost:8000/projects/proj_axial_pump_twin/poster" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">/projects/proj_axial_pump_twin/poster</a></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: INTERACTIVE SOP & GUIDED WORK ORDER */}
        {activeTab === 'sop' && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl max-w-4xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-6 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-blue-400 bg-blue-950/60 px-2.5 py-0.5 rounded border border-blue-800/60">
                    WORK ORDER: WO-HYD-2026-8841
                  </span>
                  <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                    PRIORITY: HIGH
                  </span>
                </div>
                <h2 className="text-lg font-bold text-white mt-1">
                  Rexroth A10VSO Relief Valve Recalibration & Seal Integrity Verification
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Standard Operating Procedure: {currentPart.sop.id} · Facility: Tata Motors Pune Bay 4B
                </p>
              </div>

              <div className="text-right">
                <span className="text-xs text-slate-400 block">Assigned Specialist:</span>
                <span className="text-sm font-bold text-slate-200">Vikram Sharma (L2)</span>
              </div>
            </div>

            {/* Pre-flight Tools */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 mb-6">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
                <Wrench className="w-4 h-4 text-cyan-400" />
                Required Calibrated Tools & Safety Equipment:
              </span>
              <div className="flex flex-wrap gap-2">
                {currentPart.sop.tools.map((t, idx) => (
                  <span
                    key={idx}
                    className="text-xs bg-slate-900 border border-slate-700/80 px-3 py-1 rounded-lg text-slate-300 font-medium"
                  >
                    ✓ {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Interactive Step-by-Step Checklist */}
            <div className="space-y-3 mb-6">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
                <CheckSquare className="w-4 h-4 text-emerald-400" />
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
                        ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-200'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-900'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition ${
                        isChecked
                          ? 'bg-emerald-600 border-emerald-400 text-white'
                          : 'border-slate-600 bg-slate-900'
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
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold text-white block">Technician Verification Sign-off</span>
                <span className="text-xs text-slate-400">
                  Updates your Skill Profile in DynamoDB (<code className="text-cyan-400">SKILLPROFILE#CURRENT</code>)
                </span>
              </div>

              <button
                type="button"
                onClick={() => setWorkOrderSigned(true)}
                disabled={workOrderSigned}
                className={`px-5 py-2.5 rounded-xl font-bold text-xs transition shadow-md ${
                  workOrderSigned
                    ? 'bg-emerald-600 text-white cursor-default'
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30'
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
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg">
                <span className="text-[11px] font-mono text-slate-400 uppercase">Fleet Skill Gap Index</span>
                <div className="text-2xl font-extrabold text-white mt-1">12%</div>
                <div className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                  <span>↓ 16% reduction</span>
                  <span className="text-slate-500">since Voice Twin rollout</span>
                </div>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg">
                <span className="text-[11px] font-mono text-slate-400 uppercase">Certified Technicians</span>
                <div className="text-2xl font-extrabold text-white mt-1">18 / 22</div>
                <div className="text-xs text-blue-400 mt-1">
                  <span>82% Department Readiness</span>
                </div>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg">
                <span className="text-[11px] font-mono text-slate-400 uppercase">Avg Diagnostic Time (MTTR)</span>
                <div className="text-2xl font-extrabold text-white mt-1">14.2 min</div>
                <div className="text-xs text-emerald-400 mt-1">
                  <span>↓ 62% faster diagnosis</span>
                </div>
              </div>
            </div>

            {/* Department Skill Gap Breakdown */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                Materialized Department Competency Rollup (AGG#DEPT#hydraulics#2026-09)
              </h3>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">High-Pressure Calibration & Cracking Test (SOP-042)</span>
                    <span className="font-mono font-bold text-emerald-400">92% Mastery</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: '92%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">Proportional Solenoid Dither Tuning (SOP-089)</span>
                    <span className="font-mono font-bold text-blue-400">76% Mastery</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: '76%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">Swashplate Slipper Bearing Clearance (SOP-029)</span>
                    <span className="font-mono font-bold text-amber-400">64% Mastery</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: '64%' }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">Zero-Energy LOTO Padlock Procedure (OSHA 1910.147)</span>
                    <span className="font-mono font-bold text-emerald-400">100% Compliance</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: '100%' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: AWS ARCHITECTURE & DYNAMODB LIVE CONSOLE */}
        {activeTab === 'api' && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl max-w-5xl mx-auto">
            <div className="pb-4 mb-6 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-blue-400 bg-blue-950/60 px-2.5 py-0.5 rounded border border-blue-800/60">
                  DYNAMODB & MACHINE TWIN ENGINE
                </span>
                <span className="text-xs font-mono text-cyan-400">
                  AppTable (PK/SK) + FastAPI (:8000)
                </span>
              </div>
              <h2 className="text-lg font-bold text-white mt-1">
                Single-Table & Photogrammetry Endpoints Verification Console
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Directly execute the backend route handlers and query the live Machine Twin photogrammetry engine.
              </p>
            </div>

            {/* Quick API Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 mb-6">
              <button
                type="button"
                onClick={() => {
                  setApiEndpoint('/api/twin?action=capabilities');
                  setApiMethod('GET');
                  setApiPayload('{}');
                  runApiCall('/api/twin?action=capabilities', 'GET');
                }}
                className="p-3 bg-slate-950 hover:bg-slate-800 rounded-xl border border-slate-800 text-xs font-medium text-left transition"
              >
                <div className="font-bold text-cyan-400">GET /capabilities</div>
                <div className="text-[10px] text-slate-400 mt-1">Photogrammetry (:8000)</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setApiEndpoint('/api/twin?action=projects');
                  setApiMethod('GET');
                  setApiPayload('{}');
                  runApiCall('/api/twin?action=projects', 'GET');
                }}
                className="p-3 bg-slate-950 hover:bg-slate-800 rounded-xl border border-slate-800 text-xs font-medium text-left transition"
              >
                <div className="font-bold text-cyan-400">GET /projects</div>
                <div className="text-[10px] text-slate-400 mt-1">Scan Projects (:8000)</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setApiEndpoint('/api/me');
                  setApiMethod('GET');
                  setApiPayload('{}');
                  runApiCall('/api/me', 'GET');
                }}
                className="p-3 bg-slate-950 hover:bg-slate-800 rounded-xl border border-slate-800 text-xs font-medium text-left transition"
              >
                <div className="font-bold text-blue-400">GET /api/me</div>
                <div className="text-[10px] text-slate-400 mt-1">Profile (W1)</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setApiEndpoint('/api/plan');
                  setApiMethod('GET');
                  setApiPayload('{}');
                  runApiCall('/api/plan', 'GET');
                }}
                className="p-3 bg-slate-950 hover:bg-slate-800 rounded-xl border border-slate-800 text-xs font-medium text-left transition"
              >
                <div className="font-bold text-blue-400">GET /api/plan</div>
                <div className="text-[10px] text-slate-400 mt-1">Learning Plan (W2)</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setApiEndpoint('/api/lessons');
                  setApiMethod('GET');
                  setApiPayload('{}');
                  runApiCall('/api/lessons', 'GET');
                }}
                className="p-3 bg-slate-950 hover:bg-slate-800 rounded-xl border border-slate-800 text-xs font-medium text-left transition"
              >
                <div className="font-bold text-blue-400">GET /api/lessons</div>
                <div className="text-[10px] text-slate-400 mt-1">3D Assets (W3)</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setApiEndpoint('/api/assessments');
                  setApiMethod('POST');
                  const p = JSON.stringify(
                    {
                      assessmentId: 'asmt_hydraulics_01',
                      score: 95,
                      feedback: 'Correctly diagnosed relief valve pilot cavitation',
                    },
                    null,
                    2
                  );
                  setApiPayload(p);
                  runApiCall('/api/assessments', 'POST', p);
                }}
                className="p-3 bg-slate-950 hover:bg-slate-800 rounded-xl border border-slate-800 text-xs font-medium text-left transition"
              >
                <div className="font-bold text-emerald-400">POST /api/assessments</div>
                <div className="text-[10px] text-slate-400 mt-1">Submit Attempt (W4)</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setApiEndpoint('/api/aggregates');
                  setApiMethod('GET');
                  setApiPayload('{}');
                  runApiCall('/api/aggregates', 'GET');
                }}
                className="p-3 bg-slate-950 hover:bg-slate-800 rounded-xl border border-slate-800 text-xs font-medium text-left transition"
              >
                <div className="font-bold text-blue-400">GET /api/aggregates</div>
                <div className="text-[10px] text-slate-400 mt-1">GetItem (M2/M3)</div>
              </button>
            </div>

            {/* Request / Response Pane */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold font-mono text-slate-300">REQUEST PARAMS:</span>
                  <button
                    type="button"
                    onClick={() => runApiCall(apiEndpoint, apiMethod, apiPayload)}
                    disabled={apiLoading}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1 rounded font-semibold transition"
                  >
                    {apiLoading ? 'Invoking...' : 'Execute Request'}
                  </button>
                </div>
                <textarea
                  value={apiPayload}
                  onChange={(e) => setApiPayload(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-cyan-300 h-[240px] focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold font-mono text-slate-300">RESPONSE PAYLOAD:</span>
                  {apiDuration && (
                    <span className="text-[11px] font-mono text-emerald-400">
                      Duration: {apiDuration}ms
                    </span>
                  )}
                </div>
                <pre className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-emerald-400 h-[240px] overflow-auto">
                  {apiResult || '// Click any endpoint button above to inspect live output'}
                </pre>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800/80 bg-[#0a0f1a] py-3.5 px-6 text-center text-xs text-slate-500 flex flex-wrap items-center justify-between max-w-7xl mx-auto w-full">
        <span>SkillBridge Enterprise SKAD-AI · Multi-Tenant Industrial Skilling Platform</span>
        <span>Connected to Machine Twin Photogrammetry Engine (:8000) · Sarvam Voice Engine</span>
      </footer>
    </div>
  );
}
