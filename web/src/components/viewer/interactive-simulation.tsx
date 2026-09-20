'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { SimulationConfig } from '@/data/curriculum';

/**
 * three.js is ~600 KB and reaches one lesson. Loaded on demand, not in the shell.
 *
 * Statically imported it landed in the bundle for every worker — including the
 * 2D/accessibility path, which renders no 3D at all, and everyone who never
 * opens this lesson. `ssr: false` because it touches WebGL on mount, and the
 * placeholder keeps the panel's height so the page does not jump when it lands.
 */
const ExplodedPump3D = dynamic(
  () => import('./exploded-pump-3d').then((m) => m.ExplodedPump3D),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] items-center justify-center text-sm text-slate-400">
        Loading 3D model…
      </div>
    ),
  }
);

function makeSpurGearPath(cx: number, cy: number, rootR: number, tipR: number, numTeeth: number) {
  const pts: string[] = [];
  const dt = (2 * Math.PI) / numTeeth;
  for (let i = 0; i < numTeeth; i++) {
    const a = i * dt;
    const a0 = a - dt * 0.28;
    const a1 = a - dt * 0.12;
    const a2 = a + dt * 0.12;
    const a3 = a + dt * 0.28;
    pts.push(`${i === 0 ? 'M' : 'L'} ${(cx + rootR * Math.cos(a0)).toFixed(1)} ${(cy + rootR * Math.sin(a0)).toFixed(1)}`);
    pts.push(`L ${(cx + tipR * Math.cos(a1)).toFixed(1)} ${(cy + tipR * Math.sin(a1)).toFixed(1)}`);
    pts.push(`L ${(cx + tipR * Math.cos(a2)).toFixed(1)} ${(cy + tipR * Math.sin(a2)).toFixed(1)}`);
    pts.push(`L ${(cx + rootR * Math.cos(a3)).toFixed(1)} ${(cy + rootR * Math.sin(a3)).toFixed(1)}`);
  }
  return pts.join(' ') + ' Z';
}

function makeInternalRingGearPath(cx: number, cy: number, rootR: number, tipR: number, numTeeth: number) {
  const pts: string[] = [];
  const dt = (2 * Math.PI) / numTeeth;
  for (let i = 0; i < numTeeth; i++) {
    const a = i * dt;
    const a0 = a - dt * 0.28;
    const a1 = a - dt * 0.12;
    const a2 = a + dt * 0.12;
    const a3 = a + dt * 0.28;
    pts.push(`${i === 0 ? 'M' : 'L'} ${(cx + rootR * Math.cos(a0)).toFixed(1)} ${(cy + rootR * Math.sin(a0)).toFixed(1)}`);
    pts.push(`L ${(cx + tipR * Math.cos(a1)).toFixed(1)} ${(cy + tipR * Math.sin(a1)).toFixed(1)}`);
    pts.push(`L ${(cx + tipR * Math.cos(a2)).toFixed(1)} ${(cy + tipR * Math.sin(a2)).toFixed(1)}`);
    pts.push(`L ${(cx + rootR * Math.cos(a3)).toFixed(1)} ${(cy + rootR * Math.sin(a3)).toFixed(1)}`);
  }
  return pts.join(' ') + ' Z';
}

const PINION_GEAR_PATH = makeSpurGearPath(0, 0, 60, 92, 14);
const INTERNAL_RING_GEAR_PATH = makeInternalRingGearPath(0, 0, 148, 122, 18);

interface InteractiveSimulationProps {
  config: SimulationConfig;
  onSelectComponent?: (componentId: string, label: string) => void;
  selectedComponentId?: string | null;
}

export function InteractiveSimulation({
  config,
  onSelectComponent,
  selectedComponentId,
}: InteractiveSimulationProps) {
  // Common interactive state
  const [userSelectedCompId, setUserSelectedCompId] = useState<string | null>(null);
  const activeCompId =
    userSelectedCompId || selectedComponentId || config.components[0]?.id || 'pump';

  // 1. Hydraulics Simulation State
  const [motorRunning, setMotorRunning] = useState(false);
  const [reliefSettingPsi, setReliefSettingPsi] = useState(config.reliefSettingPsi || 1800);
  const [valvePosition, setValvePosition] = useState<'neutral' | 'extend' | 'retract'>('neutral');
  const [cylinderPos, setCylinderPos] = useState(30);

  // 2. Electrical Simulation State
  const [breakerClosed, setBreakerClosed] = useState(true);
  const [testLeadPoint, setTestLeadPoint] = useState<'L1-L2' | 'L1-N' | 'DC-Bus'>('L1-L2');
  const [loadAmps, setLoadAmps] = useState(28);

  // 3. Mobile Brakes Simulation State
  const [engineRpm, setEngineRpm] = useState(1200);
  const [airPressurePsi, setAirPressurePsi] = useState(115);
  const [parkingBrakeEngaged, setParkingBrakeEngaged] = useState(false);
  const [footBrakePct, setFootBrakePct] = useState(0);

  // 4. PLC Automation State
  const [plcPower, setPlcPower] = useState(true);
  const [startBtnPressed, setStartBtnPressed] = useState(false);
  const [stopBtnPressed, setStopBtnPressed] = useState(false);
  const [proxSensorActive, setProxSensorActive] = useState(false);
  const [motorRunOutput, setMotorRunOutput] = useState(false);

  // 5. Crescent Internal Gear Pump Simulation State
  const [crescentRunning, setCrescentRunning] = useState(true);
  const [crescentRpm, setCrescentRpm] = useState(1200);
  const [crescentDirection, setCrescentDirection] = useState<'cw' | 'ccw'>('cw');
  const [crescentCavitation, setCrescentCavitation] = useState(false);
  const [crescentAngle, setCrescentAngle] = useState(0);

  // 6. Hydraulic Actuator & Cylinder Circuit Simulation State
  const [damageMode, setDamageMode] = useState<'fixed' | 'cylinder' | 'pump'>('fixed');
  const [unitSystem, setUnitSystem] = useState<'US' | 'Metric' | 'Bar'>('US');
  const [circuitLoadLbs, setCircuitLoadLbs] = useState(15000);
  const [circuitStrokeState, setCircuitStrokeState] = useState<'extend' | 'neutral' | 'retract'>('neutral');
  const [circuitCylinderPos, setCircuitCylinderPos] = useState(45);
  const [circuitPumpRunning, setCircuitPumpRunning] = useState(true);
  const [gearAngle, setGearAngle] = useState(0);

  // Hydraulics cylinder stroke animation
  useEffect(() => {
    if (config.type !== 'hpu' && config.type !== 'directional-valve' && config.type !== 'relief-valve' && config.type !== 'pump') {
      return;
    }
    if (!motorRunning || valvePosition === 'neutral') return;

    const interval = setInterval(() => {
      setCylinderPos((prev) => {
        if (valvePosition === 'extend') {
          return Math.min(100, prev + 3);
        } else {
          return Math.max(0, prev - 3);
        }
      });
    }, 50);

    return () => clearInterval(interval);
  }, [config.type, motorRunning, valvePosition]);

  // Mobile Air Compressor charging animation
  useEffect(() => {
    if (config.type !== 'mobile-brakes') return;

    const interval = setInterval(() => {
      setAirPressurePsi((prev) => {
        // Governor unloader cut-out at 125 PSI, cut-in at 100 PSI
        if (prev < 125) {
          return Math.min(125, prev + (engineRpm > 1000 ? 1 : 0.4));
        }
        return prev;
      });
    }, 200);

    return () => clearInterval(interval);
  }, [config.type, engineRpm]);

  // Continuous real-time gear rotation animation loop (NOT STATIC!)
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      if (crescentRunning && config.type === 'crescent-pump') {
        const rpmFactor = (crescentRpm / 1200) * (crescentDirection === 'cw' ? 1 : -1);
        setCrescentAngle((prev) => (prev + dt * 140 * rpmFactor) % 360);
      }

      if (circuitPumpRunning && (config.type === 'cylinder-circuit' || config.type === 'pump')) {
        const speed = damageMode === 'pump' ? 45 : 150;
        setGearAngle((prev) => (prev + dt * speed) % 360);
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [crescentRunning, crescentRpm, crescentDirection, circuitPumpRunning, damageMode, config.type]);

  // Cylinder stroke & fault drift loop for cylinder-circuit
  useEffect(() => {
    if (config.type !== 'cylinder-circuit') return;
    if (!circuitPumpRunning && damageMode !== 'cylinder') return;

    const interval = setInterval(() => {
      setCircuitCylinderPos((prev) => {
        if (damageMode === 'cylinder') {
          // Internal piston bypass seal leakage causes load to slip backward!
          return Math.max(10, prev - 0.8);
        }
        if (damageMode === 'pump') {
          // Pump slippage stalls movement
          return prev;
        }
        if (circuitStrokeState === 'extend') {
          return Math.min(88, prev + 2.5);
        } else if (circuitStrokeState === 'retract') {
          return Math.max(12, prev - 2.5);
        }
        return prev;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [config.type, circuitPumpRunning, circuitStrokeState, damageMode]);

  // Dynamic system pressure calculation for Cylinder Circuit
  // Cylinder area is 10 in² (64.5 cm²)
  const cylinderAreaSqIn = 10;
  let calculatedCircuitPsi = 0;
  let pumpGpm = 10;
  if (circuitPumpRunning) {
    if (damageMode === 'fixed') {
      calculatedCircuitPsi = circuitLoadLbs / cylinderAreaSqIn;
      pumpGpm = 10;
    } else if (damageMode === 'cylinder') {
      // Piston seal bypass: pressure bleeds off
      calculatedCircuitPsi = Math.round((circuitLoadLbs / cylinderAreaSqIn) * 0.52);
      pumpGpm = 10;
    } else if (damageMode === 'pump') {
      // Pump gear clearances worn: slip increases with load, pressure collapses
      calculatedCircuitPsi = Math.min(420, Math.round((circuitLoadLbs / cylinderAreaSqIn) * 0.28));
      pumpGpm = 2.4;
    }
  }

  // Display conversions for Unit System
  const displayLoad =
    unitSystem === 'US'
      ? `${circuitLoadLbs.toLocaleString()} lbs`
      : unitSystem === 'Metric'
        ? `${Math.round(circuitLoadLbs * 0.453592).toLocaleString()} kg`
        : `${(circuitLoadLbs * 0.00444822).toFixed(1)} kN`;

  const displayArea =
    unitSystem === 'US' ? 'Area = 10 in²' : 'Area = 64.5 cm²';

  const displayPressure =
    unitSystem === 'US'
      ? `${Math.round(calculatedCircuitPsi)} psi`
      : `${(calculatedCircuitPsi * 0.0689476).toFixed(1)} bar`;

  const displayPumpFlow =
    unitSystem === 'US'
      ? `Pump ${pumpGpm.toFixed(0)} gpm`
      : `Pump ${(pumpGpm * 3.78541).toFixed(1)} lpm`;

  // Bourdon gauge needle angle: 0 PSI = -120 deg, 1500 PSI = 0 deg, 3000 PSI = +120 deg
  const circuitGaugeAngle = Math.min(125, Math.max(-125, -120 + (calculatedCircuitPsi / 3000) * 240));

  // Dynamic system pressure calculation for Hydraulics
  let calculatedPsi = 0;
  if (motorRunning) {
    if (valvePosition === 'neutral') {
      calculatedPsi = 35;
    } else if (
      (valvePosition === 'extend' && cylinderPos >= 100) ||
      (valvePosition === 'retract' && cylinderPos <= 0)
    ) {
      calculatedPsi = reliefSettingPsi;
    } else {
      calculatedPsi = Math.min(650, reliefSettingPsi);
    }
  }

  const isReliefBypassing = motorRunning && calculatedPsi >= reliefSettingPsi;
  const activeComponent = config.components.find((c) => c.id === activeCompId) || config.components[0];

  const handleSelect = (comp: { id: string; label: string }) => {
    setUserSelectedCompId(comp.id);
    onSelectComponent?.(comp.id, comp.label);
  };

  if (config.type === 'exploded-pump-3d') {
    return (
      <div className="flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <ExplodedPump3D
          onSelectComponent={onSelectComponent}
          selectedComponentId={selectedComponentId || userSelectedCompId}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
      {/* Top Simulation Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 bg-slate-50/70 px-6 py-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#0B57D0]">
            Interactive 3D Digital Twin &bull; Real-Time Telemetry
          </span>
          <h3 className="text-base font-bold text-slate-900 mt-0.5">
            {config.title}
          </h3>
        </div>

        {/* Dynamic Metric Display based on Simulation Type */}
        {config.type === 'electrical' ? (
          <div className="flex items-center gap-3 bg-white px-3.5 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="text-right">
              <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                Multimeter Reading
              </span>
              <span className="text-base font-mono font-bold text-blue-600">
                {!breakerClosed
                  ? '0.0 VAC (Zero Energy)'
                  : testLeadPoint === 'L1-L2'
                    ? '415.4 VAC True-RMS'
                    : testLeadPoint === 'L1-N'
                      ? '239.8 VAC'
                      : '582.0 VDC (Rectified)'}
              </span>
            </div>
            <div className="h-7 w-[1px] bg-slate-200" />
            <div className="text-right">
              <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                Load Current
              </span>
              <span className="text-sm font-mono text-slate-700">
                {breakerClosed ? `${loadAmps} A` : '0.0 A'}
              </span>
            </div>
          </div>
        ) : config.type === 'mobile-brakes' ? (
          <div className="flex items-center gap-3 bg-white px-3.5 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="text-right">
              <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                Reservoir Air
              </span>
              <span className="text-base font-mono font-bold text-blue-600">
                {Math.round(airPressurePsi)} PSI
              </span>
            </div>
            <div className="h-7 w-[1px] bg-slate-200" />
            <div className="text-right">
              <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                Governor Status
              </span>
              <span className="text-sm font-mono text-slate-700">
                {airPressurePsi >= 125 ? 'Unloaded (Cut-Out)' : 'Pumping (Cut-In)'}
              </span>
            </div>
          </div>
        ) : config.type === 'plc' ? (
          <div className="flex items-center gap-3 bg-white px-3.5 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="text-right">
              <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                24VDC Bus
              </span>
              <span className="text-base font-mono font-bold text-emerald-600">
                {plcPower ? '24.1 VDC' : '0.0 VDC'}
              </span>
            </div>
            <div className="h-7 w-[1px] bg-slate-200" />
            <div className="text-right">
              <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                Motor Coil (Q:0/0)
              </span>
              <span className={`text-sm font-mono font-bold ${motorRunOutput ? 'text-emerald-600' : 'text-slate-400'}`}>
                {motorRunOutput ? 'ENERGIZED' : 'OFF'}
              </span>
            </div>
          </div>
        ) : config.type === 'crescent-pump' ? (
          <div className="flex items-center gap-3 bg-white px-3.5 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="text-right">
              <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                Shaft Speed & Delivery
              </span>
              <span className="text-base font-mono font-bold text-blue-600">
                {crescentRunning ? `${crescentRpm} RPM • ${(crescentRpm * 0.012).toFixed(1)} GPM` : '0 RPM • IDLE'}
              </span>
            </div>
            <div className="h-7 w-[1px] bg-slate-200" />
            <div className="text-right">
              <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                Inlet Vacuum
              </span>
              <span className={`text-sm font-mono font-bold ${crescentCavitation ? 'text-red-600' : 'text-emerald-600'}`}>
                {crescentCavitation ? '-18 inHg (CAVITATING)' : '-3.5 inHg (NORMAL)'}
              </span>
            </div>
          </div>
        ) : config.type === 'cylinder-circuit' ? (
          <div className="flex items-center gap-3 bg-white px-3.5 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="text-right">
              <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                Line Pressure
              </span>
              <span className={`text-base font-mono font-bold ${damageMode === 'fixed' ? 'text-blue-600' : 'text-amber-600'}`}>
                {displayPressure}
              </span>
            </div>
            <div className="h-7 w-[1px] bg-slate-200" />
            <div className="text-right">
              <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                Health Status
              </span>
              <span className={`text-sm font-mono font-bold ${damageMode === 'fixed' ? 'text-emerald-600' : 'text-red-600'}`}>
                {damageMode === 'fixed' ? 'NORMAL' : damageMode === 'cylinder' ? 'SEAL BYPASS' : 'GEAR WEAR'}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 bg-white px-3.5 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
            <div className="text-right">
              <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                System Pressure
              </span>
              <span
                className={`text-base font-mono font-bold ${
                  calculatedPsi > 1500
                    ? 'text-red-600'
                    : calculatedPsi > 400
                      ? 'text-blue-600'
                      : 'text-slate-600'
                }`}
              >
                {calculatedPsi} PSI
              </span>
            </div>
            <div className="h-7 w-[1px] bg-slate-200" />
            <div className="text-right">
              <span className="text-[10px] font-semibold uppercase text-slate-400 block">
                Metric
              </span>
              <span className="text-sm font-mono text-slate-700">
                {Math.round(calculatedPsi * 0.06895)} bar
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Main Simulation Viewport (Vector Schematics) */}
      <div className="relative bg-[#0F172A] p-6 sm:p-8 select-none overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(#1E293B_1px,transparent_1px)] [background-size:16px_16px] opacity-60" />

        {/* -------------------------------------------------------------
           TYPE 0A: CRESCENT INTERNAL GEAR PUMP DIGITAL TWIN
           ------------------------------------------------------------- */}
        {config.type === 'crescent-pump' ? (
          <div className="relative z-10 mx-auto max-w-2xl bg-white rounded-xl border border-slate-300 p-4 sm:p-6 shadow-md select-none">
            <svg viewBox="0 0 760 540" className="w-full h-auto">
              {/* Labels matching reference screenshot */}
              <text x="145" y="306" fill="#1E293B" fontSize="22" fontWeight="bold" textAnchor="end">
                Inlet
              </text>
              <text x="435" y="18" fill="#1E293B" fontSize="22" fontWeight="bold" textAnchor="middle">
                Outlet
              </text>

              {/* -------------------------------------------------------------
                 LAYER 1: OUTER CASING CASTING & MOUNTING FEET
                 ------------------------------------------------------------- */}
              {/* Mounting Feet */}
              <path
                d="M 325 440 L 295 500 L 240 500 M 455 440 L 485 500 L 540 500"
                fill="none"
                stroke="#7E8890"
                strokeWidth="24"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Outer Casing Body with Contoured Flanges */}
              <path
                d="
                  M 380 32
                  L 485 32
                  C 495 85, 520 140, 545 180
                  A 175 175 0 0 1 455 445
                  A 175 175 0 0 1 290 435
                  C 255 415, 230 380, 160 380
                  L 160 225
                  C 230 225, 255 190, 290 170
                  A 175 175 0 0 1 380 32
                  Z
                "
                fill="#7E8890"
                stroke="#525C65"
                strokeWidth="3"
                strokeLinejoin="round"
              />

              {/* Inner Chamfer Bevel Ring */}
              <circle cx="390" cy="275" r="158" fill="#9DA7AF" stroke="#68737D" strokeWidth="2" />
              <circle cx="390" cy="275" r="148" fill="#F8FAFC" />

              {/* -------------------------------------------------------------
                 LAYER 2: UNDERLYING FLUID CHAMBERS (Magenta, Blue, Red)
                 ------------------------------------------------------------- */}
              {/* Suction Inlet & Chamber (Magenta #FF00BF) */}
              <path
                d="
                  M 160 230
                  L 265 230
                  A 148 148 0 0 1 390 423
                  L 390 275
                  L 250 275
                  L 250 375
                  L 160 375
                  Z
                "
                fill="#FF00BF"
              />

              {/* Crescent Outer Tooth Channel (Deep Blue #0010E0) */}
              <path
                d="
                  M 380 423
                  A 148 148 0 0 0 538 275
                  L 485 275
                  A 95 95 0 0 1 380 370
                  Z
                "
                fill="#0010E0"
              />

              {/* Discharge Chamber & Outlet Throat (Vivid Red #E60000) */}
              <path
                d="
                  M 538 275
                  A 148 148 0 0 0 390 127
                  L 380 32
                  L 485 32
                  L 485 145
                  A 148 148 0 0 1 538 275
                  Z
                "
                fill="#E60000"
              />

              {/* -------------------------------------------------------------
                 LAYER 3: STATIONARY MACHINED CRESCENT SEAL (Hotspot)
                 ------------------------------------------------------------- */}
              <g
                onClick={() => handleSelect({ id: 'crescent_seal', label: 'Crescent Sealing Partition' })}
                className="cursor-pointer"
              >
                <path
                  d="M 382 342 A 94 94 0 0 1 482 268 A 22 22 0 0 1 509 303 A 122 122 0 0 0 379 397 A 30 30 0 0 1 382 342 Z"
                  fill="#8E98A0"
                  stroke="#555E66"
                  strokeWidth="2.5"
                />
              </g>

              {/* -------------------------------------------------------------
                 LAYER 4: ROTATING GEARS (Pinion & Internal Ring Gear)
                 ------------------------------------------------------------- */}
              {/* Outer Internal Ring Gear (Rotates around casing center 390, 275) */}
              <g
                transform={`translate(390, 275) rotate(${crescentAngle * (14 / 18)})`}
                onClick={() => handleSelect({ id: 'ring_gear', label: 'Internal Ring Gear (Outer Gear)' })}
                className="cursor-pointer"
              >
                <path d={INTERNAL_RING_GEAR_PATH} fill="#CBD5E1" stroke="#5A646E" strokeWidth="2" />
                {/* Embedded White Motion Arrows inside Outer Tooth Cavities */}
                {[...Array(18)].map((_, i) => {
                  const a = (i * 360) / 18;
                  return (
                    <g key={i} transform={`rotate(${a})`}>
                      <polygon points="132,-5 138,0 132,5 134,0" fill="#FFFFFF" />
                    </g>
                  );
                })}
              </g>

              {/* Inner Drive Pinion Spur Gear (Rotates around offset center 390, 246) */}
              <g
                transform={`translate(390, 246) rotate(${crescentAngle})`}
                onClick={() => handleSelect({ id: 'pinion_gear', label: 'Drive Pinion (Inner Gear)' })}
                className="cursor-pointer"
              >
                <path d={PINION_GEAR_PATH} fill="#B0B8C0" stroke="#555E66" strokeWidth="2.5" />
                {/* Embedded White Motion Arrows inside Inner Tooth Cavities */}
                {[...Array(14)].map((_, i) => {
                  const a = (i * 360) / 14;
                  return (
                    <g key={i} transform={`rotate(${a})`}>
                      <polygon points="76,-4 82,0 76,4 78,0" fill="#FFFFFF" />
                    </g>
                  );
                })}
                {/* Solid Keyed Drive Hub */}
                <circle cx="0" cy="0" r="24" fill="#7E8890" stroke="#475569" strokeWidth="2" />
                <rect x="14" y="-5" width="8" height="10" rx="1" fill="#475569" />
              </g>

              {/* -------------------------------------------------------------
                 LAYER 5: CASING OUTER FLANGE OVERLAY & FLOW DIRECTION ARROWS
                 ------------------------------------------------------------- */}
              {/* Retaining Ring Bezel to cleanly crop gear perimeter */}
              <circle cx="390" cy="275" r="148" fill="none" stroke="#7E8890" strokeWidth="8" />

              {/* Large White Block Arrow in Inlet Throat */}
              <polygon
                points="175,302 215,302 215,290 238,302 215,314 215,302"
                fill="#FFFFFF"
              />

              {/* Large White Block Arrow in Outlet Throat */}
              <polygon
                points="432,68 432,45 422,45 432,28 442,45 432,45"
                fill="#FFFFFF"
              />
            </svg>
          </div>
        ) : config.type === 'cylinder-circuit' ? (
          /* -------------------------------------------------------------
             TYPE 0B: HYDRAULIC ACTUATOR & CYLINDER CIRCUIT (Image 2)
             ------------------------------------------------------------- */
          <div className="relative z-10 mx-auto max-w-3xl bg-white rounded-xl border border-slate-300 p-4 sm:p-6 shadow-md select-none overflow-hidden">
            <svg viewBox="0 0 820 460" className="w-full h-auto">
              {/* Settings Button in Top-Left */}
              <rect x="14" y="14" width="60" height="24" rx="4" fill="#2563EB" />
              <text x="44" y="30" fill="#FFFFFF" fontSize="11" fontWeight="bold" textAnchor="middle">
                Settings
              </text>

              {/* Area Leader Line Callout (Top Left of Cylinder) */}
              <line x1="175" y1="62" x2="255" y2="92" stroke="#475569" strokeWidth="1.5" />
              <text x="175" y="55" fill="#0F172A" fontSize="14" fontWeight="bold" textAnchor="middle">
                {displayArea}
              </text>

              {/* Pressure Gauge Dial (Bourdon Tube) */}
              <g
                onClick={() => handleSelect({ id: 'pressure_gauge', label: 'Bourdon Line Pressure Gauge' })}
                className="cursor-pointer"
              >
                <text x="195" y="100" fill="#0F172A" fontSize="14" fontWeight="bold" textAnchor="middle">
                  {displayPressure}
                </text>
                {/* Gauge Face Bezel */}
                <circle cx="195" cy="140" r="26" fill="#FFFFFF" stroke="#475569" strokeWidth="3" />
                {/* Gauge Dial Tick Marks */}
                <line x1="195" y1="117" x2="195" y2="123" stroke="#475569" strokeWidth="2" />
                <line x1="174" y1="126" x2="178" y2="130" stroke="#475569" strokeWidth="1.5" />
                <line x1="216" y1="126" x2="212" y2="130" stroke="#475569" strokeWidth="1.5" />
                <line x1="171" y1="140" x2="177" y2="140" stroke="#475569" strokeWidth="1.5" />
                <line x1="219" y1="140" x2="213" y2="140" stroke="#475569" strokeWidth="1.5" />
                {/* Dynamic Needle Rotating with Pressure */}
                <line
                  x1="195"
                  y1="140"
                  x2="195"
                  y2="119"
                  stroke="#DC2626"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  transform={`rotate(${circuitGaugeAngle} 195 140)`}
                />
                <circle cx="195" cy="140" r="3.5" fill="#0F172A" />
              </g>

              {/* High Pressure Supply Line from Pump to Cylinder Cap End */}
              <path
                d="M 132.5 270 L 132.5 205 L 280 205 L 280 127"
                fill="none"
                stroke="#DC2626"
                strokeWidth="16"
                strokeLinejoin="round"
              />
              {/* Pipe Outline for Crisp Contrast */}
              <path
                d="M 124.5 270 L 124.5 197 L 288 197 L 288 127"
                fill="none"
                stroke="#991B1B"
                strokeWidth="2"
              />
              <path
                d="M 140.5 270 L 140.5 213 L 272 213 L 272 127"
                fill="none"
                stroke="#991B1B"
                strokeWidth="2"
              />

              {/* Gauge Vertical Tee Tap */}
              <line x1="195" y1="205" x2="195" y2="166" stroke="#DC2626" strokeWidth="4" />

              {/* White Flow Arrows in High Pressure Pipe */}
              <polygon points="132.5,248 132.5,236 128,240 132.5,230 137,240 132.5,236" fill="#FFFFFF" />
              <polygon points="220,205 232,205 228,200.5 238,205 228,209.5 232,205" fill="#FFFFFF" />

              {/* Hydraulic Cylinder Barrel (Hotspot) */}
              <g
                onClick={() => handleSelect({ id: 'hydraulic_cylinder', label: 'Double-Acting Cylinder (10 in² Area)' })}
                className="cursor-pointer"
              >
                {/* Outer Cylinder Housing */}
                <rect x="255" y="45" width="250" height="82" rx="4" fill="#CBD5E1" stroke="#64748B" strokeWidth="4" />
                {/* Cap End Cushion Stop Blocks */}
                <rect x="268" y="55" width="20" height="12" fill="#000000" />
                <rect x="268" y="105" width="20" height="12" fill="#000000" />
                {/* Rod End Cushion Stop Blocks */}
                <rect x="485" y="55" width="20" height="12" fill="#000000" />
                <rect x="485" y="105" width="20" height="12" fill="#000000" />

                {/* Cap End Pressurized Fluid (Red) */}
                <rect
                  x="268"
                  y="55"
                  width={20 + (circuitCylinderPos / 100) * 110}
                  height="62"
                  fill="#DC2626"
                />

                {/* Piston Head with Dual Black O-Ring Seals */}
                <g transform={`translate(${20 + (circuitCylinderPos / 100) * 110} 0)`}>
                  <rect x="268" y="51" width="26" height="70" rx="2" fill="#E2E8F0" stroke="#475569" strokeWidth="2" />
                  <circle cx="281" cy="55" r="3" fill="#000000" />
                  <circle cx="281" cy="117" r="3" fill="#000000" />
                </g>

                {/* Rod End Return Fluid (Blue) */}
                <rect
                  x={294 + (circuitCylinderPos / 100) * 110}
                  y="55"
                  width={Math.max(0, 211 - (circuitCylinderPos / 100) * 110)}
                  height="62"
                  fill="#1D4ED8"
                />

                {/* Solid Polished Chrome Piston Rod */}
                <rect
                  x={294 + (circuitCylinderPos / 100) * 110}
                  y="74"
                  width={140}
                  height="24"
                  fill="#E2E8F0"
                  stroke="#94A3B8"
                  strokeWidth="2"
                />
              </g>

              {/* Work Load Block (Hotspot) */}
              <g
                onClick={() => handleSelect({ id: 'load_block', label: 'Work Load (15,000 lbs)' })}
                className="cursor-pointer"
                transform={`translate(${(circuitCylinderPos / 100) * 110} 0)`}
              >
                {/* Rod End Flange Coupler */}
                <rect x="434" y="60" width="18" height="52" rx="2" fill="#CBD5E1" stroke="#475569" strokeWidth="2" />
                {/* Steel Load Block */}
                <rect x="452" y="32" width="105" height="110" rx="2" fill="#CBD5E1" stroke="#475569" strokeWidth="2.5" />
                {/* Metallic Reflection Gloss Lines */}
                <line x1="472" y1="35" x2="532" y2="139" stroke="#FFFFFF" strokeWidth="4" opacity="0.6" />
                <line x1="492" y1="35" x2="547" y2="120" stroke="#FFFFFF" strokeWidth="2.5" opacity="0.4" />
                <text x="504" y="76" fill="#0F172A" fontSize="14" fontWeight="bold" textAnchor="middle">
                  Load
                </text>
                <text x="504" y="98" fill="#0F172A" fontSize="14" fontWeight="bold" textAnchor="middle">
                  {displayLoad}
                </text>
              </g>

              {/* Ground Way Line & Machine Bed Hatches */}
              <line x1="450" y1="142" x2="780" y2="142" stroke="#000000" strokeWidth="2" />
              {[...Array(18)].map((_, i) => (
                <line
                  key={i}
                  x1={460 + i * 18}
                  y1="142"
                  x2={446 + i * 18}
                  y2="162"
                  stroke="#000000"
                  strokeWidth="1.5"
                />
              ))}

              {/* Blue Return Line Dropping Down to Tank (Hotspot) */}
              <g
                onClick={() => handleSelect({ id: 'return_line', label: 'Low-Pressure Return Line' })}
                className="cursor-pointer"
              >
                {/* Brass Port Nut */}
                <rect x="475.5" y="127" width="15" height="6" fill="#F59E0B" stroke="#B45309" strokeWidth="1" />
                {/* Blue Fluid Pipe */}
                <rect x="475" y="133" width="16" height="295" fill="#1D4ED8" stroke="#1E40AF" strokeWidth="2" />
                {/* Downward White Flow Arrows */}
                <polygon points="483,180 483,195 479,190 483,200 487,190 483,195" fill="#FFFFFF" />
                <polygon points="483,280 483,295 479,290 483,300 487,290 483,295" fill="#FFFFFF" />
                <polygon points="483,380 483,395 479,390 483,400 487,390 483,395" fill="#FFFFFF" />
                {/* Return Tank Open Pan */}
                <rect x="468" y="428" width="30" height="20" fill="#94A3B8" stroke="#475569" strokeWidth="2" />
                <rect x="470" y="434" width="26" height="12" fill="#1D4ED8" />
              </g>

              {/* Bottom Left: External Gear Pump (Hotspot) */}
              <g
                onClick={() => handleSelect({ id: 'gear_pump', label: 'External Gear Pump (10 GPM)' })}
                className="cursor-pointer"
              >
                {/* Pump Rating Label */}
                <text x="180" y="335" fill="#0F172A" fontSize="14" fontWeight="bold">
                  Pump
                </text>
                <text x="180" y="358" fill="#0F172A" fontSize="14" fontWeight="bold">
                  {displayPumpFlow}
                </text>

                {/* Pump Casing */}
                <rect x="90" y="270" width="85" height="135" rx="18" fill="#E2E8F0" stroke="#64748B" strokeWidth="4" />
                <circle cx="100" cy="282" r="3.5" fill="#475569" />
                <circle cx="165" cy="282" r="3.5" fill="#475569" />
                <circle cx="100" cy="392" r="3.5" fill="#475569" />
                <circle cx="165" cy="392" r="3.5" fill="#475569" />

                {/* Suction Reservoir Tank at Bottom Left */}
                <rect x="117" y="428" width="31" height="20" fill="#94A3B8" stroke="#475569" strokeWidth="2" />
                <rect x="119" y="434" width="27" height="12" fill="#E000B0" />
                {/* Magenta Suction Pipe */}
                <rect x="124.5" y="390" width="16" height="40" fill="#E000B0" stroke="#475569" strokeWidth="2" />
                <polygon points="132.5,420 132.5,404 127.5,410 132.5,398 137.5,410 132.5,404" fill="#FFFFFF" />

                {/* Left Gear (Rotates CW) */}
                <g transform={`rotate(${gearAngle} 118 338)`}>
                  {[...Array(8)].map((_, i) => (
                    <polygon
                      key={i}
                      points="114,316 122,316 120,328 116,328"
                      fill="#64748B"
                      stroke="#334155"
                      strokeWidth="1.5"
                      transform={`rotate(${(i * 360) / 8} 118 338)`}
                    />
                  ))}
                  <circle cx="118" cy="338" r="16" fill="#94A3B8" stroke="#475569" strokeWidth="2" />
                  <circle cx="118" cy="338" r="5" fill="#334155" />
                </g>

                {/* Right Gear (Rotates CCW, Meshing with Left Gear) */}
                <g transform={`rotate(${-gearAngle + 22.5} 147 338)`}>
                  {[...Array(8)].map((_, i) => (
                    <polygon
                      key={i}
                      points="143,316 151,316 149,328 145,328"
                      fill="#64748B"
                      stroke="#334155"
                      strokeWidth="1.5"
                      transform={`rotate(${(i * 360) / 8} 147 338)`}
                    />
                  ))}
                  <circle cx="147" cy="338" r="16" fill="#94A3B8" stroke="#475569" strokeWidth="2" />
                  <circle cx="147" cy="338" r="5" fill="#334155" />
                </g>
              </g>

              {/* Damage Injection: Cylinder Piston Bypass Leaking Effect */}
              {damageMode === 'cylinder' && (
                <g transform={`translate(${20 + (circuitCylinderPos / 100) * 110} 0)`}>
                  <path
                    d="M 288 64 L 305 64 M 288 85 L 305 85 M 288 106 L 305 106"
                    stroke="#F59E0B"
                    strokeWidth="3"
                    strokeDasharray="4 3"
                  />
                  <text x="315" y="42" fill="#DC2626" fontSize="11" fontWeight="bold" fontFamily="monospace">
                    BYPASS LEAKAGE
                  </text>
                </g>
              )}

              {/* Bottom Centered Damage & Units Bar (Matching Image 2) */}
              <g transform="translate(325 392)">
                <rect x="0" y="0" width="186" height="52" rx="8" fill="#4B6EB5" stroke="#3B5998" strokeWidth="2" />
                {/* Damage Header & Buttons */}
                <text x="48" y="14" fill="#FFFFFF" fontSize="11" fontWeight="bold" textAnchor="middle">
                  Damage:
                </text>
                <g transform="translate(6 20)">
                  <rect
                    x="0"
                    y="0"
                    width="26"
                    height="20"
                    rx="3"
                    fill={damageMode === 'fixed' ? '#4ADE80' : '#E2E8F0'}
                    stroke="#1E293B"
                    strokeWidth="1"
                    className="cursor-pointer"
                    onClick={() => setDamageMode('fixed')}
                  />
                  <text x="13" y="13" fill="#0F172A" fontSize="9" fontWeight="bold" textAnchor="middle" className="cursor-pointer" onClick={() => setDamageMode('fixed')}>
                    Fixed
                  </text>

                  <rect
                    x="29"
                    y="0"
                    width="32"
                    height="20"
                    rx="3"
                    fill={damageMode === 'cylinder' ? '#F87171' : '#E2E8F0'}
                    stroke="#1E293B"
                    strokeWidth="1"
                    className="cursor-pointer"
                    onClick={() => setDamageMode('cylinder')}
                  />
                  <text x="45" y="13" fill="#0F172A" fontSize="8" fontWeight="bold" textAnchor="middle" className="cursor-pointer" onClick={() => setDamageMode('cylinder')}>
                    Cylinder
                  </text>

                  <rect
                    x="64"
                    y="0"
                    width="24"
                    height="20"
                    rx="3"
                    fill={damageMode === 'pump' ? '#F87171' : '#E2E8F0'}
                    stroke="#1E293B"
                    strokeWidth="1"
                    className="cursor-pointer"
                    onClick={() => setDamageMode('pump')}
                  />
                  <text x="76" y="13" fill="#0F172A" fontSize="8" fontWeight="bold" textAnchor="middle" className="cursor-pointer" onClick={() => setDamageMode('pump')}>
                    Pump
                  </text>
                </g>

                {/* Vertical Divider */}
                <line x1="97" y1="4" x2="97" y2="48" stroke="#3B5998" strokeWidth="1.5" />

                {/* Units Header & Buttons */}
                <text x="140" y="14" fill="#FFFFFF" fontSize="11" fontWeight="bold" textAnchor="middle">
                  Units
                </text>
                <g transform="translate(103 20)">
                  <rect
                    x="0"
                    y="0"
                    width="24"
                    height="20"
                    rx="3"
                    fill={unitSystem === 'US' ? '#4ADE80' : '#E2E8F0'}
                    stroke="#1E293B"
                    strokeWidth="1"
                    className="cursor-pointer"
                    onClick={() => setUnitSystem('US')}
                  />
                  <text x="12" y="13" fill="#0F172A" fontSize="9" fontWeight="bold" textAnchor="middle" className="cursor-pointer" onClick={() => setUnitSystem('US')}>
                    US
                  </text>

                  <rect
                    x="27"
                    y="0"
                    width="28"
                    height="20"
                    rx="3"
                    fill={unitSystem === 'Metric' ? '#4ADE80' : '#E2E8F0'}
                    stroke="#1E293B"
                    strokeWidth="1"
                    className="cursor-pointer"
                    onClick={() => setUnitSystem('Metric')}
                  />
                  <text x="41" y="13" fill="#0F172A" fontSize="8" fontWeight="bold" textAnchor="middle" className="cursor-pointer" onClick={() => setUnitSystem('Metric')}>
                    Metric
                  </text>

                  <rect
                    x="58"
                    y="0"
                    width="20"
                    height="20"
                    rx="3"
                    fill={unitSystem === 'Bar' ? '#4ADE80' : '#E2E8F0'}
                    stroke="#1E293B"
                    strokeWidth="1"
                    className="cursor-pointer"
                    onClick={() => setUnitSystem('Bar')}
                  />
                  <text x="68" y="13" fill="#0F172A" fontSize="8" fontWeight="bold" textAnchor="middle" className="cursor-pointer" onClick={() => setUnitSystem('Bar')}>
                    Bar
                  </text>
                </g>
              </g>
            </svg>
          </div>
        ) : config.type === 'electrical' ? (
          <div className="relative z-10 mx-auto max-w-2xl bg-[#0B1120] rounded-xl border border-slate-800 p-4 shadow-inner">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
              <span className="font-semibold text-slate-200">
                MCC-300: 415V 3-Phase Main Distribution & Rectifier Bridge
              </span>
              <span className={breakerClosed ? 'text-emerald-400 font-mono' : 'text-red-400 font-mono'}>
                {breakerClosed ? 'BREAKER CLOSED' : 'LOTO LOCKED OPEN'}
              </span>
            </div>

            <svg viewBox="0 0 720 340" className="w-full h-auto">
              {/* 3-Phase Lines Incoming */}
              <text x="30" y="70" fill="#EF4444" fontSize="12" fontWeight="bold">L1 (Red)</text>
              <text x="30" y="130" fill="#F59E0B" fontSize="12" fontWeight="bold">L2 (Yel)</text>
              <text x="30" y="190" fill="#3B82F6" fontSize="12" fontWeight="bold">L3 (Blu)</text>

              <line x1="90" y1="65" x2="180" y2="65" stroke="#EF4444" strokeWidth="4" />
              <line x1="90" y1="125" x2="180" y2="125" stroke="#F59E0B" strokeWidth="4" />
              <line x1="90" y1="185" x2="180" y2="185" stroke="#3B82F6" strokeWidth="4" />

              {/* 3-Pole Circuit Breaker (Hotspot) */}
              <g
                onClick={() => handleSelect({ id: 'breaker', label: '3-Pole Molded Case Breaker' })}
                className="cursor-pointer"
              >
                <rect
                  x="180"
                  y="40"
                  width="100"
                  height="180"
                  rx="8"
                  fill="#1E293B"
                  stroke={activeCompId === 'breaker' ? '#38BDF8' : '#64748B'}
                  strokeWidth={activeCompId === 'breaker' ? 3 : 1.5}
                />
                <text x="230" y="75" fill="#94A3B8" fontSize="11" textAnchor="middle" fontWeight="bold">
                  63A BREAKER
                </text>
                {/* Breaker Contacts */}
                <line x1="200" y1="65" x2={breakerClosed ? '260' : '250'} y2={breakerClosed ? '65' : '50'} stroke="#EF4444" strokeWidth="3" />
                <line x1="200" y1="125" x2={breakerClosed ? '260' : '250'} y2={breakerClosed ? '125' : '110'} stroke="#F59E0B" strokeWidth="3" />
                <line x1="200" y1="185" x2={breakerClosed ? '260' : '250'} y2={breakerClosed ? '185' : '170'} stroke="#3B82F6" strokeWidth="3" />
                <text x="230" y="205" fill={breakerClosed ? '#34D399' : '#F87171'} fontSize="10" textAnchor="middle" fontWeight="bold">
                  {breakerClosed ? 'CLOSED (ON)' : 'OPEN (TRIPPED)'}
                </text>
              </g>

              {/* Lines from Breaker to Diode Bridge */}
              <line x1="280" y1="65" x2="380" y2="65" stroke={breakerClosed ? '#EF4444' : '#475569'} strokeWidth="4" />
              <line x1="280" y1="125" x2="380" y2="125" stroke={breakerClosed ? '#F59E0B' : '#475569'} strokeWidth="4" />
              <line x1="280" y1="185" x2="380" y2="185" stroke={breakerClosed ? '#3B82F6' : '#475569'} strokeWidth="4" />

              {/* 3-Phase Diode Rectifier Bridge (Hotspot) */}
              <g
                onClick={() => handleSelect({ id: 'diode_bridge', label: '3-Phase Diode Rectifier Bridge' })}
                className="cursor-pointer"
              >
                <rect
                  x="380"
                  y="40"
                  width="150"
                  height="180"
                  rx="8"
                  fill="#1E293B"
                  stroke={activeCompId === 'diode_bridge' ? '#38BDF8' : '#64748B'}
                  strokeWidth={activeCompId === 'diode_bridge' ? 3 : 1.5}
                />
                <text x="455" y="70" fill="#94A3B8" fontSize="11" textAnchor="middle" fontWeight="bold">
                  6-DIODE BRIDGE
                </text>
                {/* Diode Glyphs */}
                <polygon points="410,95 430,85 410,75" fill="#38BDF8" />
                <line x1="430" y1="75" x2="430" y2="95" stroke="#38BDF8" strokeWidth="2" />
                <polygon points="470,95 490,85 470,75" fill="#38BDF8" />
                <line x1="490" y1="75" x2="490" y2="95" stroke="#38BDF8" strokeWidth="2" />

                <polygon points="410,155 430,145 410,135" fill="#38BDF8" />
                <line x1="430" y1="135" x2="430" y2="155" stroke="#38BDF8" strokeWidth="2" />
                <polygon points="470,155 490,145 470,135" fill="#38BDF8" />
                <line x1="490" y1="135" x2="490" y2="155" stroke="#38BDF8" strokeWidth="2" />
                <text x="455" y="205" fill="#94A3B8" fontSize="10" textAnchor="middle">
                  AC to DC
                </text>
              </g>

              {/* DC Bus Output */}
              <line x1="530" y1="75" x2="650" y2="75" stroke={breakerClosed ? '#DC2626' : '#475569'} strokeWidth="5" />
              <line x1="530" y1="175" x2="650" y2="175" stroke={breakerClosed ? '#1E40AF' : '#475569'} strokeWidth="5" />
              <text x="660" y="80" fill="#DC2626" fontSize="12" fontWeight="bold">+580V DC</text>
              <text x="660" y="180" fill="#1E40AF" fontSize="12" fontWeight="bold">- 0V DC</text>

              {/* Digital Multimeter (Hotspot) */}
              <g
                onClick={() => handleSelect({ id: 'multimeter', label: 'Digital Multimeter' })}
                className="cursor-pointer"
              >
                <rect
                  x="260"
                  y="245"
                  width="180"
                  height="75"
                  rx="8"
                  fill="#0F172A"
                  stroke={activeCompId === 'multimeter' ? '#38BDF8' : '#F59E0B'}
                  strokeWidth="2"
                />
                <rect x="275" y="255" width="150" height="30" rx="4" fill="#1E293B" />
                <text x="350" y="276" fill="#34D399" fontSize="14" textAnchor="middle" fontFamily="monospace" fontWeight="bold">
                  {!breakerClosed
                    ? '0.00 V'
                    : testLeadPoint === 'L1-L2'
                      ? '415.4 VAC'
                      : testLeadPoint === 'L1-N'
                        ? '239.8 VAC'
                        : '582.0 VDC'}
                </text>
                <text x="350" y="308" fill="#F59E0B" fontSize="10" textAnchor="middle" fontWeight="bold">
                  TRUE-RMS MULTIMETER ({testLeadPoint})
                </text>
              </g>
            </svg>
          </div>
        ) : config.type === 'mobile-brakes' ? (
          /* -------------------------------------------------------------
             TYPE 2: MOBILE AIR BRAKE SIMULATION SCHEMATIC
             ------------------------------------------------------------- */
          <div className="relative z-10 mx-auto max-w-2xl bg-[#0B1120] rounded-xl border border-slate-800 p-4 shadow-inner">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
              <span className="font-semibold text-slate-200">
                Heavy Excavator Pneumatic Brake Circuit
              </span>
              <span className="font-mono text-emerald-400">
                {airPressurePsi < 100 ? 'PRESSURE WARNING (<100 PSI)' : 'NORMAL OPERATING RANGE'}
              </span>
            </div>

            <svg viewBox="0 0 720 320" className="w-full h-auto">
              {/* Air Compressor (Hotspot) */}
              <g
                onClick={() => handleSelect({ id: 'compressor', label: 'Reciprocating Air Compressor' })}
                className="cursor-pointer"
              >
                <rect
                  x="60"
                  y="120"
                  width="90"
                  height="80"
                  rx="8"
                  fill="#1E293B"
                  stroke={activeCompId === 'compressor' ? '#38BDF8' : '#64748B'}
                  strokeWidth={activeCompId === 'compressor' ? 3 : 1.5}
                />
                <circle cx="105" cy="150" r="18" fill="#334155" />
                <polygon points="105,138 97,152 113,152" fill="#38BDF8" />
                <text x="105" y="188" fill="#94A3B8" fontSize="11" textAnchor="middle" fontWeight="bold">
                  COMPRESSOR
                </text>
              </g>

              {/* Line from compressor to unloader governor */}
              <line x1="150" y1="160" x2="220" y2="160" stroke="#38BDF8" strokeWidth="5" />

              {/* Air Governor (Hotspot) */}
              <g
                onClick={() => handleSelect({ id: 'governor', label: 'Air Governor' })}
                className="cursor-pointer"
              >
                <rect
                  x="220"
                  y="130"
                  width="70"
                  height="60"
                  rx="6"
                  fill="#1E293B"
                  stroke={activeCompId === 'governor' ? '#38BDF8' : '#64748B'}
                  strokeWidth={activeCompId === 'governor' ? 3 : 1.5}
                />
                <text x="255" y="155" fill="#E2E8F0" fontSize="10" textAnchor="middle" fontWeight="bold">
                  GOVERNOR
                </text>
                <text x="255" y="175" fill="#94A3B8" fontSize="9" textAnchor="middle">
                  125 PSI
                </text>
              </g>

              {/* Line to Dual Air Tanks */}
              <line x1="290" y1="160" x2="360" y2="160" stroke="#38BDF8" strokeWidth="5" />

              {/* Dual Air Tanks (Hotspot) */}
              <g
                onClick={() => handleSelect({ id: 'air_tank', label: 'Dual Air Reservoirs' })}
                className="cursor-pointer"
              >
                {/* Primary Tank */}
                <rect
                  x="360"
                  y="90"
                  width="130"
                  height="60"
                  rx="16"
                  fill="#1E293B"
                  stroke={activeCompId === 'air_tank' ? '#38BDF8' : '#64748B'}
                  strokeWidth={activeCompId === 'air_tank' ? 3 : 1.5}
                />
                <text x="425" y="125" fill="#E2E8F0" fontSize="11" textAnchor="middle" fontWeight="bold">
                  PRIMARY TANK
                </text>
                <text x="425" y="140" fill="#38BDF8" fontSize="10" textAnchor="middle" fontFamily="monospace">
                  {Math.round(airPressurePsi)} PSI
                </text>

                {/* Secondary Tank */}
                <rect
                  x="360"
                  y="170"
                  width="130"
                  height="60"
                  rx="16"
                  fill="#1E293B"
                  stroke={activeCompId === 'air_tank' ? '#38BDF8' : '#64748B'}
                  strokeWidth={activeCompId === 'air_tank' ? 3 : 1.5}
                />
                <text x="425" y="205" fill="#E2E8F0" fontSize="11" textAnchor="middle" fontWeight="bold">
                  SECONDARY TANK
                </text>
                <text x="425" y="220" fill="#38BDF8" fontSize="10" textAnchor="middle" fontFamily="monospace">
                  {Math.round(airPressurePsi)} PSI
                </text>
              </g>

              {/* Line to Spring Brake Chamber */}
              <line x1="490" y1="120" x2="570" y2="120" stroke="#38BDF8" strokeWidth="5" />

              {/* Spring Brake Chamber */}
              <g className="cursor-pointer">
                <rect x="570" y="90" width="80" height="70" rx="8" fill="#1E293B" stroke="#64748B" strokeWidth="1.5" />
                {/* Spring inside */}
                <path
                  d="M 585 125 L 595 115 L 605 135 L 615 115 L 625 125"
                  stroke={parkingBrakeEngaged ? '#EF4444' : '#34D399'}
                  strokeWidth="3"
                  fill="none"
                />
                <text x="610" y="175" fill="#94A3B8" fontSize="10" textAnchor="middle" fontWeight="bold">
                  BRAKE CHAMBER
                </text>
                <text x="610" y="190" fill={parkingBrakeEngaged ? '#EF4444' : '#34D399'} fontSize="9" textAnchor="middle" fontWeight="bold">
                  {parkingBrakeEngaged ? 'PARK APPLIED' : 'RELEASED'}
                </text>
              </g>
            </svg>
          </div>
        ) : config.type === 'plc' ? (
          /* -------------------------------------------------------------
             TYPE 3: PLC AUTOMATION & LADDER LOGIC SCHEMATIC
             ------------------------------------------------------------- */
          <div className="relative z-10 mx-auto max-w-2xl bg-[#0B1120] rounded-xl border border-slate-800 p-4 shadow-inner">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
              <span className="font-semibold text-slate-200">
                S7-1500 / CompactLogix 24VDC Controller & Real-Time Rung
              </span>
              <span className="font-mono text-emerald-400">
                CPU SCAN: 3.8 ms &bull; RUN MODE
              </span>
            </div>

            <svg viewBox="0 0 720 310" className="w-full h-auto">
              {/* Power Rails */}
              <line x1="60" y1="40" x2="60" y2="260" stroke="#38BDF8" strokeWidth="4" />
              <line x1="660" y1="40" x2="660" y2="260" stroke="#94A3B8" strokeWidth="4" />
              <text x="50" y="35" fill="#38BDF8" fontSize="11" fontWeight="bold">+24V</text>
              <text x="650" y="35" fill="#94A3B8" fontSize="11" fontWeight="bold">0V COM</text>

              {/* Rung 0001: Start/Stop Seal-in Circuit (Hotspot) */}
              <g
                onClick={() => handleSelect({ id: 'ladder_rung', label: 'Ladder Logic Program Rung' })}
                className="cursor-pointer"
              >
                {/* Main Rung Line */}
                <line x1="60" y1="90" x2="160" y2="90" stroke={motorRunOutput || startBtnPressed ? '#34D399' : '#38BDF8'} strokeWidth="3" />

                {/* Start Contact [ ] (I:0/0) */}
                <rect x="160" y="75" width="40" height="30" fill="#1E293B" stroke="#64748B" rx="4" />
                <text x="180" y="85" fill="#94A3B8" fontSize="9" textAnchor="middle">I:0/0</text>
                <text x="180" y="98" fill={startBtnPressed ? '#34D399' : '#E2E8F0'} fontSize="11" textAnchor="middle" fontWeight="bold">
                  {startBtnPressed ? '[■]' : '[ ]'}
                </text>

                {/* Line from Start to Stop */}
                <line x1="200" y1="90" x2="300" y2="90" stroke={motorRunOutput || startBtnPressed ? '#34D399' : '#475569'} strokeWidth="3" />

                {/* Stop Contact [/] (I:0/1) */}
                <rect x="300" y="75" width="40" height="30" fill="#1E293B" stroke="#64748B" rx="4" />
                <text x="320" y="85" fill="#94A3B8" fontSize="9" textAnchor="middle">I:0/1</text>
                <text x="320" y="98" fill={stopBtnPressed ? '#EF4444' : '#34D399'} fontSize="11" textAnchor="middle" fontWeight="bold">
                  {stopBtnPressed ? '[ ]' : '[/]'}
                </text>

                {/* Line from Stop to Output Coil */}
                <line x1="340" y1="90" x2="520" y2="90" stroke={motorRunOutput ? '#34D399' : '#475569'} strokeWidth="3" />

                {/* Output Coil ( ) (Q:0/0) */}
                <circle
                  cx="545"
                  cy="90"
                  r="18"
                  fill="#1E293B"
                  stroke={motorRunOutput ? '#34D399' : '#64748B'}
                  strokeWidth="2"
                />
                <text x="545" y="94" fill={motorRunOutput ? '#34D399' : '#E2E8F0'} fontSize="10" textAnchor="middle" fontWeight="bold">
                  ( )
                </text>
                <text x="545" y="125" fill="#94A3B8" fontSize="10" textAnchor="middle">
                  Q:0/0 MOTOR
                </text>

                {/* Complete Rung to 0V Common */}
                <line x1="565" y1="90" x2="660" y2="90" stroke="#475569" strokeWidth="3" />

                {/* Seal-in Branch below Start Button */}
                <line x1="140" y1="90" x2="140" y2="150" stroke={motorRunOutput ? '#34D399' : '#475569'} strokeWidth="2.5" />
                <line x1="140" y1="150" x2="160" y2="150" stroke={motorRunOutput ? '#34D399' : '#475569'} strokeWidth="2.5" />
                <rect x="160" y="135" width="40" height="30" fill="#1E293B" stroke="#64748B" rx="4" />
                <text x="180" y="145" fill="#94A3B8" fontSize="9" textAnchor="middle">Q:0/0</text>
                <text x="180" y="158" fill={motorRunOutput ? '#34D399' : '#E2E8F0'} fontSize="11" textAnchor="middle" fontWeight="bold">
                  {motorRunOutput ? '[■]' : '[ ]'}
                </text>
                <line x1="200" y1="150" x2="220" y2="150" stroke={motorRunOutput ? '#34D399' : '#475569'} strokeWidth="2.5" />
                <line x1="220" y1="150" x2="220" y2="90" stroke={motorRunOutput ? '#34D399' : '#475569'} strokeWidth="2.5" />
              </g>

              {/* PLC CPU & Input Card (Hotspot) */}
              <g
                onClick={() => handleSelect({ id: 'cpu', label: 'PLC CPU Module' })}
                className="cursor-pointer"
              >
                <rect
                  x="120"
                  y="200"
                  width="480"
                  height="80"
                  rx="8"
                  fill="#1E293B"
                  stroke={activeCompId === 'cpu' ? '#38BDF8' : '#64748B'}
                  strokeWidth={activeCompId === 'cpu' ? 3 : 1.5}
                />
                <text x="200" y="235" fill="#E2E8F0" fontSize="12" fontWeight="bold">
                  CPU 1515-2 PN
                </text>
                <text x="200" y="255" fill="#34D399" fontSize="10" fontFamily="monospace">
                  RUN &bull; ETH/IP CONNECTED
                </text>
                {/* Input LED status dots */}
                <circle cx="400" cy="235" r="5" fill={startBtnPressed ? '#34D399' : '#334155'} />
                <text x="400" y="255" fill="#94A3B8" fontSize="9" textAnchor="middle">I:0/0</text>

                <circle cx="440" cy="235" r="5" fill={stopBtnPressed ? '#EF4444' : '#334155'} />
                <text x="440" y="255" fill="#94A3B8" fontSize="9" textAnchor="middle">I:0/1</text>

                <circle cx="480" cy="235" r="5" fill={proxSensorActive ? '#34D399' : '#334155'} />
                <text x="480" y="255" fill="#94A3B8" fontSize="9" textAnchor="middle">I:0/2</text>

                <circle cx="530" cy="235" r="6" fill={motorRunOutput ? '#34D399' : '#334155'} />
                <text x="530" y="255" fill="#94A3B8" fontSize="9" textAnchor="middle">Q:0/0</text>
              </g>
            </svg>
          </div>
        ) : (
          /* -------------------------------------------------------------
             DEFAULT / HYDRAULICS SIMULATION SCHEMATIC (HPU & Circuit)
             ------------------------------------------------------------- */
          <div className="relative z-10 mx-auto max-w-2xl bg-[#0B1120] rounded-xl border border-slate-800 p-4 shadow-inner">
            <svg viewBox="0 0 760 380" className="w-full h-auto">
              {/* Suction Line: Tank to Pump */}
              <path
                d="M 120 280 L 120 180 L 190 180"
                stroke={motorRunning ? '#F59E0B' : '#475569'}
                strokeWidth="6"
                fill="none"
              />

              {/* Pressure Line (P): Pump to DCV & Relief */}
              <path
                d="M 270 180 L 370 180 L 370 140 L 460 140"
                stroke={motorRunning ? '#EF4444' : '#475569'}
                strokeWidth="6"
                fill="none"
              />

              {/* Relief Line: P branch down to Relief Valve & Tank */}
              <path
                d="M 370 180 L 370 250 L 460 250"
                stroke={motorRunning ? '#EF4444' : '#475569'}
                strokeWidth="5"
                fill="none"
              />
              <path
                d="M 520 250 L 580 250 L 580 290 L 160 290"
                stroke={isReliefBypassing ? '#3B82F6' : '#334155'}
                strokeWidth="5"
                fill="none"
              />

              {/* Work Line A: DCV to Cylinder Bottom */}
              <path
                d="M 510 120 L 510 70 L 610 70"
                stroke={
                  valvePosition === 'extend' && motorRunning
                    ? '#EF4444'
                    : valvePosition === 'retract' && motorRunning
                      ? '#3B82F6'
                      : '#475569'
                }
                strokeWidth="5"
                fill="none"
              />

              {/* Work Line B: DCV to Cylinder Top */}
              <path
                d="M 540 120 L 540 90 L 690 90"
                stroke={
                  valvePosition === 'retract' && motorRunning
                    ? '#EF4444'
                    : valvePosition === 'extend' && motorRunning
                      ? '#3B82F6'
                      : '#475569'
                }
                strokeWidth="5"
                fill="none"
              />

              {/* Tank Return Line */}
              <path
                d="M 530 160 L 530 200 L 260 200 L 260 280 L 160 280"
                stroke={motorRunning && valvePosition === 'neutral' ? '#3B82F6' : '#475569'}
                strokeWidth="5"
                fill="none"
              />

              {/* Reservoir */}
              <g onClick={() => handleSelect({ id: 'reservoir', label: 'Reservoir Tank' })} className="cursor-pointer">
                <rect
                  x="60"
                  y="240"
                  width="120"
                  height="100"
                  rx="8"
                  fill="#1E293B"
                  stroke={activeCompId === 'reservoir' ? '#38BDF8' : '#64748B'}
                  strokeWidth={activeCompId === 'reservoir' ? 3 : 1.5}
                />
                <rect x="70" y="270" width="100" height="60" rx="4" fill="#0369A1" opacity="0.35" />
                <rect x="155" y="260" width="8" height="60" rx="2" fill="#E2E8F0" opacity="0.8" />
                <rect x="157" y="280" width="4" height="35" rx="1" fill="#38BDF8" />
                <text x="120" y="325" fill="#94A3B8" fontSize="11" textAnchor="middle" fontWeight="bold">
                  RESERVOIR
                </text>
              </g>

              {/* Pump & Motor */}
              <g onClick={() => handleSelect({ id: 'pump', label: 'Gear Pump' })} className="cursor-pointer">
                <rect x="180" y="150" width="45" height="60" rx="6" fill="#334155" stroke="#64748B" strokeWidth="1.5" />
                <text x="202" y="185" fill="#E2E8F0" fontSize="10" textAnchor="middle" fontWeight="bold">M</text>
                <rect x="225" y="176" width="12" height="8" fill="#94A3B8" />
                <circle
                  cx="255"
                  cy="180"
                  r="22"
                  fill="#1E293B"
                  stroke={activeCompId === 'pump' ? '#38BDF8' : '#64748B'}
                  strokeWidth={activeCompId === 'pump' ? 3 : 1.5}
                />
                <polygon points="255,164 246,180 264,180" fill="#38BDF8" />
                <text x="255" y="218" fill="#94A3B8" fontSize="11" textAnchor="middle" fontWeight="bold">PUMP</text>
              </g>

              {/* Pressure Gauge */}
              <g onClick={() => handleSelect({ id: 'gauge', label: 'System Pressure Gauge' })} className="cursor-pointer">
                <line x1="330" y1="180" x2="330" y2="135" stroke="#94A3B8" strokeWidth="2.5" />
                <circle
                  cx="330"
                  cy="115"
                  r="22"
                  fill="#FFFFFF"
                  stroke={activeCompId === 'gauge' ? '#38BDF8' : '#475569'}
                  strokeWidth={activeCompId === 'gauge' ? 3 : 2}
                />
                <line
                  x1="330"
                  y1="115"
                  x2={330 + 16 * Math.cos(((calculatedPsi / 2500) * 180 - 180) * (Math.PI / 180))}
                  y2={115 + 16 * Math.sin(((calculatedPsi / 2500) * 180 - 180) * (Math.PI / 180))}
                  stroke="#DC2626"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <circle cx="330" cy="115" r="3" fill="#1E293B" />
                <text x="330" y="80" fill="#94A3B8" fontSize="10" textAnchor="middle" fontWeight="bold">GAUGE</text>
              </g>

              {/* Relief Valve */}
              <g onClick={() => handleSelect({ id: 'relief', label: 'Pressure Relief Valve' })} className="cursor-pointer">
                <rect
                  x="460"
                  y="225"
                  width="60"
                  height="50"
                  rx="6"
                  fill="#1E293B"
                  stroke={activeCompId === 'relief' ? '#38BDF8' : '#64748B'}
                  strokeWidth={activeCompId === 'relief' ? 3 : 1.5}
                />
                <path d="M 475 250 L 485 242 L 495 258 L 505 250" stroke="#F59E0B" strokeWidth="2" fill="none" />
                <text x="490" y="290" fill="#94A3B8" fontSize="11" textAnchor="middle" fontWeight="bold">RELIEF VALVE</text>
              </g>

              {/* DCV Spool */}
              <g onClick={() => handleSelect({ id: 'spool', label: 'Directional Control Valve' })} className="cursor-pointer">
                <rect
                  x="460"
                  y="115"
                  width="95"
                  height="55"
                  rx="6"
                  fill="#1E293B"
                  stroke={activeCompId === 'spool' ? '#38BDF8' : '#64748B'}
                  strokeWidth={activeCompId === 'spool' ? 3 : 1.5}
                />
                <rect x="465" y="122" width="28" height="40" fill={valvePosition === 'extend' ? '#1D4ED8' : '#0F172A'} stroke="#475569" />
                <rect x="493" y="122" width="28" height="40" fill={valvePosition === 'neutral' ? '#1D4ED8' : '#0F172A'} stroke="#475569" />
                <rect x="521" y="122" width="28" height="40" fill={valvePosition === 'retract' ? '#1D4ED8' : '#0F172A'} stroke="#475569" />
                <text x="507" y="186" fill="#94A3B8" fontSize="11" textAnchor="middle" fontWeight="bold">4/3 DCV SPOOL</text>
              </g>

              {/* Cylinder */}
              <g onClick={() => handleSelect({ id: 'cylinder', label: 'Double-Acting Cylinder' })} className="cursor-pointer">
                <rect
                  x="610"
                  y="55"
                  width="90"
                  height="50"
                  rx="4"
                  fill="#1E293B"
                  stroke={activeCompId === 'cylinder' ? '#38BDF8' : '#64748B'}
                  strokeWidth={activeCompId === 'cylinder' ? 3 : 1.5}
                />
                <rect x={612 + (cylinderPos / 100) * 45} y="58" width="8" height="44" fill="#38BDF8" />
                <rect x={620 + (cylinderPos / 100) * 45} y="75" width="45" height="10" fill="#E2E8F0" />
                <text x="655" y="122" fill="#94A3B8" fontSize="11" textAnchor="middle" fontWeight="bold">
                  CYLINDER ({Math.round(cylinderPos)}%)
                </text>
              </g>
            </svg>
          </div>
        )}
      </div>

      {/* Interactive Control Decks per Simulation Type */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 p-6 bg-slate-50/70 border-b border-slate-200/80">
        {config.type === 'crescent-pump' ? (
          <>
            {/* Control 1: Prime Mover Speed & State */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  1. Shaft Speed (RPM)
                </label>
                <span className="text-xs font-mono font-bold text-[#0B57D0]">
                  {crescentRpm} RPM
                </span>
              </div>
              <input
                type="range"
                min="300"
                max="1800"
                step="50"
                value={crescentRpm}
                onChange={(e) => setCrescentRpm(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#0B57D0] mb-3"
              />
              <button
                type="button"
                onClick={() => setCrescentRunning(!crescentRunning)}
                className={`w-full rounded-lg py-2 px-3 text-xs font-bold transition-all ${
                  crescentRunning ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
                }`}
              >
                {crescentRunning ? 'Stop Motor (IDLE)' : 'Start Prime Mover (RUN)'}
              </button>
            </div>

            {/* Control 2: Rotation Direction */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-2">
                2. Drive Rotation Direction
              </label>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setCrescentDirection('cw')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg ${
                    crescentDirection === 'cw' ? 'bg-[#0B57D0] text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Clockwise (Forward)
                </button>
                <button
                  type="button"
                  onClick={() => setCrescentDirection('ccw')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg ${
                    crescentDirection === 'ccw' ? 'bg-[#0B57D0] text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Reverse (CCW)
                </button>
              </div>
              <span className="text-[11px] text-slate-500 block">
                {crescentDirection === 'cw' ? 'Normal inlet-to-outlet flow' : 'Caution: Reversed suction polarity'}
              </span>
            </div>

            {/* Control 3: Suction Restriction & Cavitation */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-2">
                3. Suction Line Restriction
              </label>
              <button
                type="button"
                onClick={() => setCrescentCavitation(!crescentCavitation)}
                className={`w-full py-2.5 px-3 text-xs font-bold rounded-lg transition-all ${
                  crescentCavitation ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {crescentCavitation ? 'Clean Suction Strainer (Normal)' : 'Clog Suction Strainer (Cavitate)'}
              </button>
              <span className={`text-[11px] font-semibold mt-2 block ${crescentCavitation ? 'text-red-600' : 'text-slate-500'}`}>
                {crescentCavitation ? 'Vapor bubbles imploding across gear teeth!' : 'Suction line free of restriction (-3.5 inHg)'}
              </span>
            </div>
          </>
        ) : config.type === 'cylinder-circuit' ? (
          <>
            {/* Control 1: Applied Work Load (P = F / A) */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  1. Work Load Weight
                </label>
                <span className="text-xs font-mono font-bold text-[#0B57D0]">
                  {circuitLoadLbs.toLocaleString()} lbs
                </span>
              </div>
              <input
                type="range"
                min="5000"
                max="25000"
                step="1000"
                value={circuitLoadLbs}
                onChange={(e) => setCircuitLoadLbs(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#0B57D0]"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                <span>5,000 lbs</span>
                <span>15,000 (Target)</span>
                <span>25,000 lbs</span>
              </div>
              <span className="text-[11px] text-slate-600 font-mono mt-2 block">
                P = {circuitLoadLbs.toLocaleString()} lbs ÷ 10 in² = {Math.round(calculatedCircuitPsi)} PSI
              </span>
            </div>

            {/* Control 2: Directional Valve Spool Position & Pump Power */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-2">
                2. Cylinder Motion & Pump
              </label>
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                {(['extend', 'neutral', 'retract'] as const).map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => setCircuitStrokeState(pos)}
                    className={`rounded-lg py-1.5 text-xs font-bold capitalize transition-colors ${
                      circuitStrokeState === pos ? 'bg-[#0B57D0] text-white shadow-xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {pos === 'neutral' ? 'Hold' : pos}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setCircuitPumpRunning(!circuitPumpRunning)}
                className={`w-full py-1.5 rounded-lg text-xs font-bold transition-all mb-1 ${
                  circuitPumpRunning ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {circuitPumpRunning ? 'Pump Running (10 GPM)' : 'Pump Stopped (0 GPM)'}
              </button>
              <span className="text-[11px] text-slate-500 block">
                Cylinder: {Math.round(circuitCylinderPos)}% stroke &bull; {circuitPumpRunning ? 'Pressurized' : 'Unpowered'}
              </span>
            </div>

            {/* Control 3: Damage Injection & Health State */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-2">
                3. Component Damage Injection
              </label>
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                <button
                  type="button"
                  onClick={() => setDamageMode('fixed')}
                  className={`rounded-lg py-2 text-xs font-bold transition-all ${
                    damageMode === 'fixed' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Fixed
                </button>
                <button
                  type="button"
                  onClick={() => setDamageMode('cylinder')}
                  className={`rounded-lg py-2 text-xs font-bold transition-all ${
                    damageMode === 'cylinder' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Cylinder
                </button>
                <button
                  type="button"
                  onClick={() => setDamageMode('pump')}
                  className={`rounded-lg py-2 text-xs font-bold transition-all ${
                    damageMode === 'pump' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Pump
                </button>
              </div>
              <span className="text-[11px] text-slate-500 block">
                {damageMode === 'fixed'
                  ? 'Healthy: 100% hold capacity & 1500 PSI'
                  : damageMode === 'cylinder'
                    ? 'Piston seal leaking: Fluid bypasses, load slips!'
                    : 'Pump slip: Flow drops to 2.4 GPM, cannot hold load'}
              </span>
            </div>
          </>
        ) : config.type === 'electrical' ? (
          <>
            {/* Control 1: Breaker ON/OFF */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-2">
                1. Main Breaker Handle
              </label>
              <button
                type="button"
                onClick={() => setBreakerClosed(!breakerClosed)}
                className={`w-full rounded-lg py-2.5 px-4 text-xs font-bold transition-all shadow-xs ${
                  breakerClosed
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                {breakerClosed ? 'Open Breaker (LOTO Lockout)' : 'Close Breaker (Energize 415V)'}
              </button>
              <span className="text-[11px] text-slate-500 mt-2 block">
                Status: {breakerClosed ? '415VAC Energized' : 'Zero Energy State'}
              </span>
            </div>

            {/* Control 2: Multimeter Test Points */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-2">
                2. Multimeter Probe Points
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['L1-L2', 'L1-N', 'DC-Bus'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setTestLeadPoint(p)}
                    className={`rounded-lg py-2 text-xs font-bold transition-colors ${
                      testLeadPoint === p ? 'bg-[#0B57D0] text-white shadow-xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-slate-500 mt-2 block">
                Lead: CAT IV 600V Calibrated
              </span>
            </div>

            {/* Control 3: Load Simulation */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  3. Motor Current Load
                </label>
                <span className="text-xs font-mono font-bold text-[#0B57D0]">{loadAmps} A</span>
              </div>
              <input
                type="range"
                min="0"
                max="65"
                value={loadAmps}
                onChange={(e) => setLoadAmps(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#0B57D0]"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Rated: 63A Breaker Trip Curve
              </span>
            </div>
          </>
        ) : config.type === 'mobile-brakes' ? (
          <>
            {/* Control 1: Engine Throttle */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-2">
                1. Diesel Engine Throttle
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEngineRpm(650)}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg ${engineRpm === 650 ? 'bg-[#0B57D0] text-white' : 'bg-slate-100 text-slate-700'}`}
                >
                  Low Idle (650)
                </button>
                <button
                  type="button"
                  onClick={() => setEngineRpm(1200)}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg ${engineRpm === 1200 ? 'bg-[#0B57D0] text-white' : 'bg-slate-100 text-slate-700'}`}
                >
                  High (1200)
                </button>
              </div>
              <span className="text-[11px] text-slate-500 mt-2 block">
                Compressor Build Time: 42s
              </span>
            </div>

            {/* Control 2: Parking Brake Knob */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-2">
                2. Yellow Diamond Parking Knob
              </label>
              <button
                type="button"
                onClick={() => setParkingBrakeEngaged(!parkingBrakeEngaged)}
                className={`w-full py-2.5 px-4 text-xs font-bold rounded-lg transition-all ${
                  parkingBrakeEngaged ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-800'
                }`}
              >
                {parkingBrakeEngaged ? 'PULL OUT: Emergency Park' : 'PUSH IN: Brakes Released'}
              </button>
              <span className="text-[11px] text-slate-500 mt-2 block">
                Spring Brake: {parkingBrakeEngaged ? 'Mechanical Lock' : 'Held Off by Air'}
              </span>
            </div>

            {/* Control 3: Service Brake Pedal */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  3. Service Treadle Pedal
                </label>
                <span className="text-xs font-mono font-bold text-[#0B57D0]">{footBrakePct}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={footBrakePct}
                onChange={(e) => setFootBrakePct(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#0B57D0]"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Modulates dual-circuit treadle valve
              </span>
            </div>
          </>
        ) : config.type === 'plc' ? (
          <>
            {/* Control 1: Power & Stop */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-2">
                1. 24VDC Rack Power
              </label>
              <button
                type="button"
                onClick={() => {
                  const next = !plcPower;
                  setPlcPower(next);
                  if (!next) setMotorRunOutput(false);
                }}
                className={`w-full py-2.5 px-4 text-xs font-bold rounded-lg transition-all ${
                  plcPower ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {plcPower ? 'Power Supply ON (24VDC)' : 'Power Supply OFF'}
              </button>
            </div>

            {/* Control 2: Field Input Pushbuttons */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-2">
                2. Operator Pushbuttons
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onMouseDown={() => {
                    setStartBtnPressed(true);
                    if (plcPower) setMotorRunOutput(true);
                  }}
                  onMouseUp={() => setStartBtnPressed(false)}
                  className="flex-1 py-2 text-xs font-bold bg-emerald-600 text-white rounded-lg active:scale-95 transition-transform"
                >
                  Hold START (I:0/0)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStopBtnPressed(true);
                    setMotorRunOutput(false);
                    setTimeout(() => setStopBtnPressed(false), 800);
                  }}
                  className="flex-1 py-2 text-xs font-bold bg-red-600 text-white rounded-lg active:scale-95 transition-transform"
                >
                  STOP (I:0/1)
                </button>
              </div>
            </div>

            {/* Control 3: Proximity Sensor Trigger */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-2">
                3. Inductive Proximity Sensor
              </label>
              <button
                type="button"
                onClick={() => {
                  const next = !proxSensorActive;
                  setProxSensorActive(next);
                  if (next && plcPower) setMotorRunOutput(true);
                }}
                className={`w-full py-2 text-xs font-bold rounded-lg transition-all ${
                  proxSensorActive ? 'bg-[#0B57D0] text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {proxSensorActive ? 'Target Detected (I:0/2 ACTIVE)' : 'No Target Detected'}
              </button>
            </div>
          </>
        ) : (
          /* Default Hydraulics Controls */
          <>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-2">
                1. Prime Mover (Electric Motor)
              </label>
              <button
                type="button"
                onClick={() => setMotorRunning(!motorRunning)}
                className={`w-full rounded-lg py-2.5 px-4 text-xs font-bold transition-all shadow-xs ${
                  motorRunning ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {motorRunning ? 'Stop Motor (OFF)' : 'Start Motor (1450 RPM)'}
              </button>
              <span className="text-[11px] text-slate-500 mt-2 block">
                Status: {motorRunning ? 'Pumping ISO VG 46 Oil' : 'Idle & Depressurized'}
              </span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  2. Relief Valve Setting
                </label>
                <span className="text-xs font-mono font-bold text-[#0B57D0]">
                  {reliefSettingPsi} PSI
                </span>
              </div>
              <input
                type="range"
                min="600"
                max="2500"
                step="50"
                value={reliefSettingPsi}
                onChange={(e) => setReliefSettingPsi(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#0B57D0]"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                <span>600 PSI</span>
                <span>1800 (Plant Spec)</span>
                <span>2500 PSI</span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-2">
                3. DCV Spool Position
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['extend', 'neutral', 'retract'] as const).map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => setValvePosition(pos)}
                    className={`rounded-lg py-2 text-xs font-bold capitalize transition-colors ${
                      valvePosition === pos ? 'bg-[#0B57D0] text-white shadow-xs' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-slate-500 mt-2 block">
                Cylinder: {Math.round(cylinderPos)}% stroke
              </span>
            </div>
          </>
        )}
      </div>

      {/* Selected Component Inspector Card */}
      {activeComponent && (
        <div className="p-6 bg-white flex flex-col sm:flex-row items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#0B57D0] border border-blue-200/80 font-bold text-lg shadow-2xs">
              <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-base font-bold text-slate-900">
                  {activeComponent.label}
                </h4>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-[#0B57D0]">
                  Selected Hotspot
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed max-w-xl">
                {activeComponent.description}
              </p>
              <div className="mt-2.5 flex items-center gap-2 text-xs font-semibold text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5 border border-amber-200/60 inline-flex">
                <span className="size-1.5 rounded-full bg-amber-600" />
                <span>Safety Rule: {activeComponent.safetyRule}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onSelectComponent?.(activeComponent.id, activeComponent.label)}
            className="rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 whitespace-nowrap transition-colors"
          >
            Ask Voice Tutor About This &rarr;
          </button>
        </div>
      )}
    </div>
  );
}
