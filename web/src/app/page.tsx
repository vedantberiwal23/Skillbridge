'use client';

import React, { useState, useEffect, useRef } from 'react';
import { MachineViewer } from '@/components/viewer/machine-viewer';
import { useAccessibility } from '@/components/providers/accessibility-provider';
import type { MachineAsset } from '@/lib/types';

// Sample machine asset for the industrial maintenance vertical
const SAMPLE_MACHINE_ASSET: MachineAsset = {
  orgId: 'org_tata_motors_pune',
  assetId: 'asset_hydraulic_pump_a10v',
  name: 'Rexroth A10VSO Variable Displacement Axial Piston Pump',
  glbUrl: 'https://modelviewer.dev/shared-assets/models/glTF-Sample-Assets/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb',
  posterUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80',
  hotspots: [
    {
      id: 'relief-valve',
      label: 'Pressure Relief Valve (SOP §4.2)',
      position: '0.15m 0.22m 0.18m',
      normal: '0m 1m 0m',
    },
    {
      id: 'solenoid-coil',
      label: 'Directional Solenoid Valve 24V DC',
      position: '-0.2m 0.1m 0.15m',
      normal: '-1m 0m 0m',
    },
    {
      id: 'swashplate',
      label: 'Swashplate & Control Piston',
      position: '0.05m -0.08m 0.22m',
      normal: '0m 0m 1m',
    },
    {
      id: 'bearing-flange',
      label: 'Shaft Seal & Roller Bearing',
      position: '-0.02m -0.22m 0.05m',
      normal: '0m -1m 0m',
    },
  ],
};

const PART_DATA: Record<
  string,
  {
    name: string;
    tag: string;
    sop: string;
    defaultQuestionEn: string;
    defaultQuestionHi: string;
    answerEn: string;
    answerHi: string;
    safetyHazard: string;
  }
> = {
  'relief-valve': {
    name: 'Pressure Relief Valve',
    tag: 'Hydraulic Pressure Circuit',
    sop: 'SOP-HYD-042: Section B (Pressure Calibration)',
    defaultQuestionEn: 'Why is this pressure relief valve chattering under high load?',
    defaultQuestionHi: 'उच्च दबाव पर यह प्रेशर रिलीफ वॉल्व आवाज क्यों कर रहा है?',
    answerEn:
      'The pressure relief valve chatters when the pilot orifice is partially clogged with varnish or the main spring has lost tension. Follow LOTO protocol, bleed the system pressure to 0 bar, and inspect the pilot poppet seat for cavitation pitting.',
    answerHi:
      'जब पायलट ओरिफिस में कचरा आ जाता है या स्प्रिंग की टेंशन कम हो जाती है, तो रिलीफ वॉल्व चैटरिंग करता है। पहले LOTO प्रोटोकॉल का पालन करें, प्रेशर को 0 bar पर लाएं, और पॉकेट सीट की जांच करें।',
    safetyHazard: 'HIGH PRESSURE: Depressurize accumulator to 0 bar before loosening the cartridge.',
  },
  'solenoid-coil': {
    name: 'Directional Solenoid Valve (24V DC)',
    tag: 'Electrical Control Circuit',
    sop: 'SOP-ELEC-118: Solenoid Inspection & Resistance Test',
    defaultQuestionEn: 'The solenoid is energizing but the spool is not shifting. How do I test it?',
    defaultQuestionHi: 'सोलेनोइड को करंट मिल रहा है लेकिन स्पूल नहीं घूम रहा, कैसे टेस्ट करें?',
    answerEn:
      'Check resistance across the coil pins using a multimeter (normal is 18–24 Ohms). If coil resistance is normal, mechanical contamination is jamming the spool. De-energize the VFD and use a manual override pin to check spool travel.',
    answerHi:
      'मल्टीमीटर से कॉइल का रेजिस्टेंस चेक करें (18-24 Ohms होना चाहिए)। अगर रेजिस्टेंस सही है तो स्पूल में कचरा फंसा हो सकता है। मैन्युअल ओवरराइड पिन दबाकर स्पूल की मूवमेंट देखें।',
    safetyHazard: 'ELECTRICAL HAZARD: Disconnect 24V supply and verify with multimeter before contact.',
  },
  swashplate: {
    name: 'Swashplate & Control Piston',
    tag: 'Mechanical Displacement Unit',
    sop: 'SOP-HYD-085: Variable Displacement Overhaul',
    defaultQuestionEn: 'What causes the swashplate angle to stick at minimum displacement?',
    defaultQuestionHi: 'स्वैशप्लेट मिनिमम एंगल पर क्यों अटक जाता है?',
    answerEn:
      'A sticking swashplate typically indicates scoring on the bronze cradle bearings or insufficient bias spring pressure. Check case drain flow — excessive leakage past the control piston prevents swashplate repositioning.',
    answerHi:
      'स्वैशप्लेट का अटकना क्रैडल बेयरिंग में घिसाव या बायस स्प्रिंग में खराबी दर्शाता है। केस ड्रेन फ्लो चेक करें, ज्यादा लीकेज होने पर कंट्रोल पिस्टन एंगल नहीं बदल पाता।',
    safetyHazard: 'PINCH POINT: Keep fingers clear of swashplate cradle during manual stroking test.',
  },
  'bearing-flange': {
    name: 'Shaft Seal & Roller Bearing',
    tag: 'Drive Assembly',
    sop: 'SOP-MEC-014: Shaft Seal Replacement & Alignment',
    defaultQuestionEn: 'Oil is weeping from the shaft coupling. Does the pump need replacement?',
    defaultQuestionHi: 'शाफ्ट सील से तेल टपक रहा है, क्या पूरी मोटर बदलनी पड़ेगी?',
    answerEn:
      'Weeping oil indicates high case pressure or a hardened Viton lip seal. Check that case drain pressure does not exceed 1.5 bar. If bearing runout is within 0.05mm, you can replace the radial lip seal without replacing the entire pump.',
    answerHi:
      'तेल टपकने का मतलब है कि केस प्रेशर 1.5 bar से ज्यादा हो गया है या सील कट गई है। अगर बेयरिंग में प्ले 0.05mm से कम है, तो केवल रेडियल लिप सील बदलकर काम हो जाएगा।',
    safetyHazard: 'ROTATING MACHINERY: Ensure motor breaker is locked out with padlocked hasp.',
  },
};

export default function SimulationStudioPage() {
  const { enabled: a11yEnabled, setEnabled: setA11yEnabled, prefer2D } = useAccessibility();
  const [activeTab, setActiveTab] = useState<'demo' | 'api'>('demo');
  const [language, setLanguage] = useState<'en' | 'hi'>('hi');
  const [selectedPartId, setSelectedPartId] = useState<string>('relief-valve');

  // Voice Tutor State
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [aiThinking, setAiThinking] = useState(false);
  const [aiResponse, setAiResponse] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [history, setHistory] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);

  // API Tester State
  const [apiEndpoint, setApiEndpoint] = useState('/api/me');
  const [apiMethod, setApiMethod] = useState<'GET' | 'POST' | 'PATCH'>('GET');
  const [apiPayload, setApiPayload] = useState('{}');
  const [apiResult, setApiResult] = useState<string | null>(null);
  const [apiLoading, setApiLoading] = useState(false);

  const streamIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const part = PART_DATA[selectedPartId] || PART_DATA['relief-valve'];

  // Handle Part Tap on 3D viewer
  const handlePartSelected = (hotspotId: string) => {
    const cleanId = hotspotId.replace(/^hotspot-/, '');
    if (PART_DATA[cleanId]) {
      setSelectedPartId(cleanId);
      // Speak audio feedback on tap
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    }
  };

  // Play spoken reply
  const speakText = (text: string, lang: 'en' | 'hi') => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
      utterance.rate = 1.0;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  // Trigger question simulation
  const handleAskQuestion = (customQ?: string) => {
    const q = customQ || (language === 'hi' ? part.defaultQuestionHi : part.defaultQuestionEn);
    const expectedAnswer = language === 'hi' ? part.answerHi : part.answerEn;

    setTranscript(q);
    setAiResponse('');
    setAiThinking(true);

    if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);

    setTimeout(() => {
      setAiThinking(false);
      let charIndex = 0;
      const words = expectedAnswer.split(' ');
      let currentOutput = '';

      streamIntervalRef.current = setInterval(() => {
        if (charIndex < words.length) {
          currentOutput += (charIndex > 0 ? ' ' : '') + words[charIndex];
          setAiResponse(currentOutput);
          charIndex++;
        } else {
          if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
          setHistory((prev) => [
            ...prev,
            { role: 'user', text: q },
            { role: 'assistant', text: expectedAnswer },
          ]);
          speakText(expectedAnswer, language);
        }
      }, 70);
    }, 600);
  };

  // Push-To-Talk Button Press
  const handleHoldStart = () => {
    setIsRecording(true);
    setTranscript(language === 'hi' ? 'सुन रहा हूँ...' : 'Listening to your question...');
    setAiResponse('');
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  };

  const handleHoldEnd = () => {
    if (!isRecording) return;
    setIsRecording(false);
    handleAskQuestion();
  };

  // Run API test
  const runApiTest = async (endpoint: string, method: string, body?: string) => {
    setApiLoading(true);
    setApiResult(null);
    try {
      const options: RequestInit = { method };
      if (method === 'POST' || method === 'PATCH') {
        options.headers = { 'Content-Type': 'application/json' };
        options.body = body;
      }
      const res = await fetch(endpoint, options);
      const json = await res.json();
      setApiResult(
        JSON.stringify(
          {
            status: `${res.status} ${res.statusText}`,
            ok: res.ok,
            data: json,
          },
          null,
          2
        )
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setApiResult(JSON.stringify({ error: message }, null, 2));
    } finally {
      setApiLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/30">
            SB
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight text-white flex items-center gap-2">
              SkillBridge
              <span className="text-xs font-mono bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full">
                Interactive Studio
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Voice-First Vocational Skilling · Industrial Maintenance Twin
            </p>
          </div>
        </div>

        {/* Studio Controls */}
        <div className="flex items-center gap-3">
          {/* Tab Switcher */}
          <div className="bg-slate-800 p-1 rounded-lg flex text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('demo')}
              className={`px-3 py-1.5 rounded-md transition ${
                activeTab === 'demo' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              🎙️ 3D & Voice Tutor
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('api')}
              className={`px-3 py-1.5 rounded-md transition ${
                activeTab === 'api' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              ⚡ Backend API Tester
            </button>
          </div>

          {/* Language Toggle */}
          <div className="bg-slate-800 p-1 rounded-lg flex text-xs font-medium">
            <button
              type="button"
              onClick={() => setLanguage('hi')}
              className={`px-2.5 py-1 rounded transition ${
                language === 'hi' ? 'bg-amber-600 text-white' : 'text-slate-400'
              }`}
            >
              हिन्दी
            </button>
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`px-2.5 py-1 rounded transition ${
                language === 'en' ? 'bg-amber-600 text-white' : 'text-slate-400'
              }`}
            >
              EN
            </button>
          </div>

          {/* 3D vs 2D Fallback */}
          <button
            type="button"
            onClick={() => setA11yEnabled(!a11yEnabled)}
            className="text-xs border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg text-slate-300 transition"
          >
            {prefer2D ? '🖼️ 2D Schematic' : '📦 3D Model'}
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {activeTab === 'demo' ? (
          <>
            {/* Left Column: 3D Machine Viewer (7 cols) */}
            <section className="lg:col-span-7 flex flex-col gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-xs font-mono text-blue-400 uppercase tracking-wider font-semibold">
                      Shop Floor Digital Twin
                    </span>
                    <h2 className="text-lg font-bold text-white mt-0.5">
                      {SAMPLE_MACHINE_ASSET.name}
                    </h2>
                  </div>
                  <span className="bg-emerald-500/10 text-emerald-400 text-xs font-mono border border-emerald-500/20 px-2.5 py-1 rounded-full">
                    SOP Active
                  </span>
                </div>

                {/* 3D Model / Fallback Viewer */}
                <div className="rounded-xl overflow-hidden border border-slate-800 shadow-inner bg-slate-950 relative">
                  <MachineViewer
                    asset={SAMPLE_MACHINE_ASSET}
                    onPartSelected={handlePartSelected}
                  />

                  {/* On-screen instruction helper */}
                  <div className="absolute bottom-3 left-3 bg-slate-900/90 backdrop-blur border border-slate-700/60 px-3 py-1.5 rounded-lg text-xs text-slate-300 shadow flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                    <span>Tap any blue hotspot marker to ask about that part</span>
                  </div>
                </div>

                {/* Hotspot Quick Selectors */}
                <div className="mt-4">
                  <div className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">
                    Click Component Hotspot:
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {SAMPLE_MACHINE_ASSET.hotspots.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => handlePartSelected(h.id)}
                        className={`text-xs px-2.5 py-2 rounded-lg border text-left transition font-medium truncate ${
                          selectedPartId === h.id
                            ? 'bg-blue-600 border-blue-400 text-white shadow-md shadow-blue-600/30'
                            : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        {h.label.split('(')[0]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Safety & SOP Card */}
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3 text-amber-200 text-xs">
                <span className="text-xl">⚠️</span>
                <div>
                  <strong className="font-semibold block text-amber-300">
                    Mandatory Safety Procedure ({part.sop}):
                  </strong>
                  <p className="mt-0.5">{part.safetyHazard}</p>
                </div>
              </div>
            </section>

            {/* Right Column: Voice-First AI Tutor Interaction Panel (5 cols) */}
            <section className="lg:col-span-5 flex flex-col gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col h-full">
                {/* Active Part Context */}
                <div className="border-b border-slate-800 pb-3 mb-4">
                  <div className="text-xs text-slate-400 font-mono flex items-center justify-between">
                    <span>ACTIVE COMPONENT</span>
                    <span className="text-blue-400 font-semibold">{part.tag}</span>
                  </div>
                  <h3 className="text-base font-bold text-white mt-1 flex items-center gap-2">
                    🎯 {part.name}
                  </h3>
                  <div className="text-xs text-slate-400 mt-1 italic">
                    Grounded in: {part.sop}
                  </div>
                </div>

                {/* Conversation Output Box */}
                <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-4 overflow-y-auto min-h-[220px] max-h-[340px] flex flex-col gap-3 font-sans">
                  {history.length > 0 && (
                    <div className="space-y-2 border-b border-slate-800/80 pb-3 mb-1">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-semibold">
                        Previous Session Activity
                      </div>
                      {history.slice(-4).map((turn, i) => (
                        <div
                          key={i}
                          className={`text-xs p-2.5 rounded-lg leading-relaxed ${
                            turn.role === 'user'
                              ? 'bg-blue-950/30 text-blue-200 border border-blue-900/30 ml-4'
                              : 'bg-slate-900/50 text-slate-300 border border-slate-800 mr-4'
                          }`}
                        >
                          <span className="font-mono font-bold text-[9px] block text-slate-500 mb-1">
                            {turn.role === 'user' ? 'YOU (WORKER)' : 'AI TUTOR (GROUNDED)'}
                          </span>
                          {turn.text}
                        </div>
                      ))}
                    </div>
                  )}

                  {transcript ? (
                    <div className="bg-blue-600/20 border border-blue-500/30 text-blue-200 rounded-xl p-3 text-sm self-end max-w-[90%]">
                      <div className="text-[10px] font-mono text-blue-300 font-bold mb-1">
                        YOU (WORKER)
                      </div>
                      {transcript}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 text-center my-auto">
                      Hold the microphone button below or click a suggested prompt to ask a question
                      about the selected component.
                    </div>
                  )}

                  {aiThinking && (
                    <div className="flex items-center gap-2 text-xs text-blue-400 font-mono py-1">
                      <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                      Bedrock Claude Haiku 4.5 analyzing org SOP...
                    </div>
                  )}

                  {aiResponse && (
                    <div className="bg-slate-900 border border-slate-800 text-slate-200 rounded-xl p-3 text-sm self-start max-w-[95%] shadow-sm">
                      <div className="text-[10px] font-mono text-emerald-400 font-bold mb-1 flex items-center justify-between">
                        <span>AI TUTOR (GROUNDED IN SOP)</span>
                        {isSpeaking && (
                          <span className="animate-pulse text-xs">🔊 Speaking...</span>
                        )}
                      </div>
                      <p className="leading-relaxed">{aiResponse}</p>
                    </div>
                  )}
                </div>

                {/* Suggested Prompts */}
                <div className="mt-3">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Suggested Technician Questions:
                  </span>
                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleAskQuestion(language === 'hi' ? part.defaultQuestionHi : part.defaultQuestionEn)}
                      className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/70 rounded-lg px-3 py-2 text-left transition truncate"
                    >
                      💬 {language === 'hi' ? part.defaultQuestionHi : part.defaultQuestionEn}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleAskQuestion(
                          language === 'hi'
                            ? 'इस हिस्से का LOTO लॉकआउट टैगआउट कैसे करना है?'
                            : 'What is the step-by-step LOTO procedure for isolating this part?'
                        )
                      }
                      className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/70 rounded-lg px-3 py-2 text-left transition truncate"
                    >
                      🔒 {language === 'hi' ? 'LOTO प्रक्रिया क्या है?' : 'What is the step-by-step LOTO procedure?'}
                    </button>
                  </div>
                </div>

                {/* Push-To-Talk Voice Interaction Controls */}
                <div className="mt-4 pt-4 border-t border-slate-800 flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onMouseDown={handleHoldStart}
                    onMouseUp={handleHoldEnd}
                    onTouchStart={handleHoldStart}
                    onTouchEnd={handleHoldEnd}
                    className={`w-full py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-3 transition shadow-lg select-none ${
                      isRecording
                        ? 'bg-rose-600 text-white animate-pulse shadow-rose-600/40 ring-4 ring-rose-500/30'
                        : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30 active:scale-[0.98]'
                    }`}
                  >
                    <span className="text-xl">{isRecording ? '⏹️' : '🎙️'}</span>
                    <span>
                      {isRecording
                        ? 'Release to Send Audio...'
                        : 'HOLD TO ASK (PUSH-TO-TALK)'}
                    </span>
                  </button>
                  <span className="text-[11px] text-slate-400">
                    Hands-free shop-floor ergonomic mode · Streams via App Runner WebSocket
                  </span>
                </div>
              </div>
            </section>
          </>
        ) : (
          /* Backend API Simulator Tab (12 cols) */
          <section className="lg:col-span-12 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col gap-6">
            <div>
              <h2 className="text-xl font-bold text-white">Next.js 16 CRUD & Auth API Tester</h2>
              <p className="text-sm text-slate-400 mt-1">
                Directly invoke the six implemented CRUD handlers conforming to single-table access patterns.
              </p>
            </div>

            {/* Quick API Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              <button
                type="button"
                onClick={() => {
                  setApiEndpoint('/api/me');
                  setApiMethod('GET');
                  setApiPayload('{}');
                  runApiTest('/api/me', 'GET');
                }}
                className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 text-xs font-medium text-left transition"
              >
                <div className="font-bold text-blue-400">GET /api/me</div>
                <div className="text-[11px] text-slate-400 mt-1">Profile & Settings (W1)</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setApiEndpoint('/api/plan');
                  setApiMethod('GET');
                  setApiPayload('{}');
                  runApiTest('/api/plan', 'GET');
                }}
                className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 text-xs font-medium text-left transition"
              >
                <div className="font-bold text-blue-400">GET /api/plan</div>
                <div className="text-[11px] text-slate-400 mt-1">Learning Plan (W2)</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setApiEndpoint('/api/lessons');
                  setApiMethod('GET');
                  setApiPayload('{}');
                  runApiTest('/api/lessons', 'GET');
                }}
                className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 text-xs font-medium text-left transition"
              >
                <div className="font-bold text-blue-400">GET /api/lessons</div>
                <div className="text-[11px] text-slate-400 mt-1">Lessons & 3D Assets (W3)</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setApiEndpoint('/api/assessments');
                  setApiMethod('POST');
                  const payload = JSON.stringify(
                    {
                      assessmentId: 'asmt_hydraulics_01',
                      score: 95,
                      feedback: 'Correctly identified pilot valve cavitation hazard',
                    },
                    null,
                    2
                  );
                  setApiPayload(payload);
                  runApiTest('/api/assessments', 'POST', payload);
                }}
                className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 text-xs font-medium text-left transition"
              >
                <div className="font-bold text-emerald-400">POST /api/assessments</div>
                <div className="text-[11px] text-slate-400 mt-1">Submit Attempt (W4)</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setApiEndpoint('/api/aggregates?deptId=dept_maintenance');
                  setApiMethod('GET');
                  setApiPayload('{}');
                  runApiTest('/api/aggregates?deptId=dept_maintenance', 'GET');
                }}
                className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 text-xs font-medium text-left transition"
              >
                <div className="font-bold text-purple-400">GET /api/aggregates</div>
                <div className="text-[11px] text-slate-400 mt-1">Single GetItem Rollup (M2/M3)</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setApiEndpoint('/api/invites');
                  setApiMethod('PATCH');
                  const payload = JSON.stringify(
                    {
                      code: 'DEMO1234',
                      name: 'Ramesh Kumar',
                      password: 'StrongPassword123!',
                      phone: '+919876543210',
                    },
                    null,
                    2
                  );
                  setApiPayload(payload);
                  runApiTest('/api/invites', 'PATCH', payload);
                }}
                className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 text-xs font-medium text-left transition"
              >
                <div className="font-bold text-amber-400">PATCH /api/invites</div>
                <div className="text-[11px] text-slate-400 mt-1">Redeem & Provision (A4)</div>
              </button>
            </div>

            {/* Request Builder & Response Display */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs bg-slate-800 px-2.5 py-1 rounded text-blue-400 font-bold">
                    {apiMethod}
                  </span>
                  <input
                    type="text"
                    value={apiEndpoint}
                    onChange={(e) => setApiEndpoint(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded text-xs font-mono text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => runApiTest(apiEndpoint, apiMethod, apiPayload)}
                    disabled={apiLoading}
                    className="bg-blue-600 hover:bg-blue-500 px-4 py-1.5 rounded text-xs font-semibold text-white transition disabled:opacity-50"
                  >
                    {apiLoading ? 'Testing...' : 'Send'}
                  </button>
                </div>
                {(apiMethod === 'POST' || apiMethod === 'PATCH') && (
                  <textarea
                    rows={8}
                    value={apiPayload}
                    onChange={(e) => setApiPayload(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded p-3 text-xs font-mono text-slate-300 w-full"
                    placeholder="Request JSON Payload"
                  />
                )}
              </div>

              {/* Response Viewer */}
              <div className="flex flex-col">
                <div className="text-xs font-mono text-slate-400 mb-1">
                  API Response:
                </div>
                <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-emerald-400 overflow-auto h-[220px]">
                  {apiResult || '// Click any endpoint button above to test'}
                </pre>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/50 py-3 px-6 text-center text-xs text-slate-500">
        SkillBridge · Multi-Tenant Multilingual Vocational SaaS · First Commit Hackathon (WeMakeDevs x AWS)
      </footer>
    </div>
  );
}
