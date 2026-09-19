/**
 * Industrial Curriculum & Lesson Knowledge Base
 * Industrial maintenance curriculum for the demo vertical: hydraulics,
 * electrical and machine operation. Third-party content provenance and
 * attribution are recorded in README.md, not here.
 */

export interface SimulationConfig {
  type: 'hpu' | 'relief-valve' | 'directional-valve' | 'pump' | 'electrical' | 'mobile-brakes' | 'plc' | 'crescent-pump' | 'cylinder-circuit' | 'exploded-pump-3d';
  title: string;
  defaultPressurePsi: number;
  reliefSettingPsi: number;
  components: Array<{
    id: string;
    label: string;
    description: string;
    safetyRule: string;
  }>;
}

export interface LessonContent {
  lessonId: string;
  tradeId: string;
  title: string;
  subtitle: string;
  estimatedMinutes: number;
  objectives: string[];
  summary: string;
  procedureSteps: Array<{
    step: number;
    title: string;
    instruction: string;
    safetyCaution?: string;
  }>;
  simulationConfig: SimulationConfig;
}

export interface CurriculumModule {
  id: string;
  lessonId: string;
  title: string;
  meta: string;
  status: 'completed' | 'in-progress' | 'pending';
}

export interface CurriculumStage {
  seq: number;
  title: string;
  description: string;
  items: CurriculumModule[];
}

export interface TradeTrack {
  id: string;
  name: string;
  digitalTwin: string;
  industry: string;
  description: string;
  stages: CurriculumStage[];
}

export const TRADES_CATALOG: Record<string, TradeTrack> = {
  hydraulics: {
    id: 'hydraulics',
    name: 'Hydraulics Maintenance Technician',
    digitalTwin: 'HPU-400 Industrial Hydraulic Unit',
    industry: 'Heavy Manufacturing, Steel Plants, Mobile Machinery',
    description: 'Master power unit startup, pressure relief valve calibration, spool sequencing, and leak diagnostics.',
    stages: [
      {
        seq: 1,
        title: 'Foundations & Plant Safety',
        description: 'Build core SOP knowledge, fluid safety protocols, and machine pre-checks.',
        items: [
          {
            id: 'h-1-1',
            lessonId: 'lesson-hpu-overview',
            title: 'How the hydraulic power unit works',
            meta: 'Completed',
            status: 'completed',
          },
          {
            id: 'h-1-2',
            lessonId: 'lesson-hpu-startup',
            title: 'Safe start-up procedure',
            meta: 'Resume ~15 mins',
            status: 'in-progress',
          },
          {
            id: 'h-1-3',
            lessonId: 'lesson-relief-valve',
            title: 'Pressure relief valve calibration & cracking pressure',
            meta: '15 mins',
            status: 'pending',
          },
          {
            id: 'h-1-4',
            lessonId: 'lesson-directional-valve',
            title: 'Directional control valve spool operation',
            meta: '20 mins',
            status: 'pending',
          },
        ],
      },
      {
        seq: 2,
        title: 'Shop-Floor Operations',
        description: 'Master active line operation, reservoir maintenance, and fluid filtration.',
        items: [
          {
            id: 'h-2-1',
            lessonId: 'lesson-hpu-overview',
            title: 'Daily reservoir fluid level & temperature inspection',
            meta: '10 mins',
            status: 'pending',
          },
          {
            id: 'h-2-2',
            lessonId: 'lesson-hpu-startup',
            title: 'Return line filter differential pressure check',
            meta: '12 mins',
            status: 'pending',
          },
          {
            id: 'h-2-3',
            lessonId: 'lesson-directional-valve',
            title: 'Directional control valve manual override',
            meta: '18 mins',
            status: 'pending',
          },
          {
            id: 'h-2-4',
            lessonId: 'lesson-hpu-startup',
            title: 'Hose assembly & crimp joint integrity testing',
            meta: '15 mins',
            status: 'pending',
          },
        ],
      },
      {
        seq: 3,
        title: 'Diagnostics & Troubleshooting',
        description: 'Go deeper into pressure drop isolation, seal bypass, and pump cavitation.',
        items: [
          {
            id: 'h-3-1',
            lessonId: 'lesson-pressure-loss',
            title: 'Finding a pressure loss & pump cavitation',
            meta: '20 mins',
            status: 'pending',
          },
          {
            id: 'h-3-2',
            lessonId: 'lesson-relief-valve',
            title: 'Cavitation & aeration acoustic detection',
            meta: '15 mins',
            status: 'pending',
          },
          {
            id: 'h-3-3',
            lessonId: 'lesson-directional-valve',
            title: 'Cylinder piston bypass & internal leakage analysis',
            meta: '25 mins',
            status: 'pending',
          },
        ],
      },
    ],
  },
  electrical: {
    id: 'electrical',
    name: 'Industrial Electrical Technician',
    digitalTwin: 'MCC-300 Motor Control Center',
    industry: 'Automation Plants, Substations, Distribution Paneling',
    description: 'Master 3-phase plant circuits, lockout/tagout (LOTO), diode bridges, and PLC bus troubleshooting.',
    stages: [
      {
        seq: 1,
        title: 'Electrical Safety & Circuit Protection',
        description: 'Zero energy verification, arc flash prevention, and fuse/breaker sizing.',
        items: [
          {
            id: 'e-1-1',
            lessonId: 'lesson-electrical-safety',
            title: 'Fuses & circuit breakers: thermal-magnetic trip curves',
            meta: '15 mins',
            status: 'in-progress',
          },
          {
            id: 'e-1-2',
            lessonId: 'lesson-electrical-safety',
            title: 'Lockout/Tagout (LOTO) and zero-potential verification',
            meta: '20 mins',
            status: 'pending',
          },
        ],
      },
      {
        seq: 2,
        title: 'Power Electronics & Control Relays',
        description: 'Solid-state switching, rectifier diode bridges, and contactor interlocking.',
        items: [
          {
            id: 'e-2-1',
            lessonId: 'lesson-electrical-safety',
            title: 'Industrial diode bridge rectification & testing',
            meta: '15 mins',
            status: 'pending',
          },
          {
            id: 'e-2-2',
            lessonId: 'lesson-electrical-safety',
            title: 'Motor starter contactors & thermal overload relays',
            meta: '25 mins',
            status: 'pending',
          },
        ],
      },
      {
        seq: 3,
        title: 'Fieldbus & Diagnostics',
        description: 'CAN bus communication, signal degradation, and insulation resistance testing.',
        items: [
          {
            id: 'e-3-1',
            lessonId: 'lesson-electrical-safety',
            title: 'CAN Bus differential signal troubleshooting',
            meta: '30 mins',
            status: 'pending',
          },
          {
            id: 'e-3-2',
            lessonId: 'lesson-electrical-safety',
            title: 'Megohmmeter insulation resistance (Megger) testing',
            meta: '20 mins',
            status: 'pending',
          },
        ],
      },
    ],
  },
  mobile: {
    id: 'mobile',
    name: 'Mobile Equipment Technician',
    digitalTwin: 'Cat 385C / PC210 Hydraulic Excavator',
    industry: 'Mining, Earthmoving, Construction Equipment',
    description: 'Operate hydrostatic travel drives, pilot controllers, cross-port relief braking, and air brake boosters.',
    stages: [
      {
        seq: 1,
        title: 'Mobile Braking & Air Systems',
        description: 'Air brake governors, spring brake chambers, and pneumatic safety checks.',
        items: [
          {
            id: 'm-1-1',
            lessonId: 'lesson-mobile-brakes',
            title: 'Air brake compressor & dual reservoir charging',
            meta: '15 mins',
            status: 'in-progress',
          },
          {
            id: 'm-1-2',
            lessonId: 'lesson-relief-valve',
            title: 'Cross-port relief valve braking & anti-cavitation',
            meta: '20 mins',
            status: 'pending',
          },
        ],
      },
      {
        seq: 2,
        title: 'Hydrostatic Track Drives',
        description: 'Closed-loop pump/motor hydrostatic transmission and flushing valves.',
        items: [
          {
            id: 'm-2-1',
            lessonId: 'lesson-hpu-overview',
            title: 'Closed-loop swashplate servo angle control',
            meta: '25 mins',
            status: 'pending',
          },
          {
            id: 'm-2-2',
            lessonId: 'lesson-pressure-loss',
            title: 'Charge pump pressure relief & hot oil shuttle valve',
            meta: '20 mins',
            status: 'pending',
          },
        ],
      },
      {
        seq: 3,
        title: 'Implement & Boom Hydraulics',
        description: 'Load-sensing sectional valves, counterbalance valves, and cylinder holding.',
        items: [
          {
            id: 'm-3-1',
            lessonId: 'lesson-directional-valve',
            title: 'Counterbalance valve load-holding & pilot ratio',
            meta: '25 mins',
            status: 'pending',
          },
        ],
      },
    ],
  },
  stationary: {
    id: 'stationary',
    name: 'Stationary Machinery Operator',
    digitalTwin: 'Continuous Caster & Hydraulic Press Unit',
    industry: 'Steel Mills, Foundries, Extrusion Lines',
    description: 'Operate multi-cylinder daylight presses, continuous casters, and central hydraulic power units.',
    stages: [
      {
        seq: 1,
        title: 'Stationary Plant Safety & Interlocks',
        description: 'Hydraulic accumulator dumps, safety gate interlocks, and emergency stop circuits.',
        items: [
          {
            id: 's-1-1',
            lessonId: 'lesson-hpu-startup',
            title: 'Central hydraulic power unit pre-start verification',
            meta: '15 mins',
            status: 'in-progress',
          },
        ],
      },
      {
        seq: 2,
        title: 'Press & Caster Sequencing',
        description: 'Multi-ram synchronizing valves, prefill valves, and decompression stages.',
        items: [
          {
            id: 's-2-1',
            lessonId: 'lesson-directional-valve',
            title: 'High-speed prefill valve & decompression cycle',
            meta: '20 mins',
            status: 'pending',
          },
        ],
      },
      {
        seq: 3,
        title: 'Process Troubleshooting',
        description: 'Proportional valve null shift, accumulator nitrogen charge, and contamination tracking.',
        items: [
          {
            id: 's-3-1',
            lessonId: 'lesson-pressure-loss',
            title: 'Hydraulic accumulator bladder nitrogen precharge check',
            meta: '20 mins',
            status: 'pending',
          },
        ],
      },
    ],
  },
  automation: {
    id: 'automation',
    name: 'Automation & PLC Specialist',
    digitalTwin: 'Rockwell / Siemens S7-1500 Controller',
    industry: 'Packaging, Robotics, Automated Assembly',
    description: 'Program industrial ladder logic, diagnose 24VDC I/O cards, and integrate safety circuits.',
    stages: [
      {
        seq: 1,
        title: 'PLC Architecture & I/O Modules',
        description: 'Sink/source digital wiring, analog scaling (4-20mA), and power supplies.',
        items: [
          {
            id: 'a-1-1',
            lessonId: 'lesson-plc-basics',
            title: 'Programmable Logic Controller (PLC) hardware setup',
            meta: '15 mins',
            status: 'in-progress',
          },
        ],
      },
      {
        seq: 2,
        title: 'Ladder Logic & Sequencing',
        description: 'Bit instructions, timers, counters, and state-machine sequencing.',
        items: [
          {
            id: 'a-2-1',
            lessonId: 'lesson-plc-basics',
            title: 'Start/Stop seal-in logic & emergency interlocks',
            meta: '20 mins',
            status: 'pending',
          },
        ],
      },
      {
        seq: 3,
        title: 'Fault Isolation & Communications',
        description: 'EtherNet/IP network packet loss, forced I/O audits, and safety PLC diagnostics.',
        items: [
          {
            id: 'a-3-1',
            lessonId: 'lesson-plc-basics',
            title: 'Industrial network communication diagnostics',
            meta: '25 mins',
            status: 'pending',
          },
        ],
      },
    ],
  },
};

export const LESSONS_DATABASE: Record<string, LessonContent> = {
  'lesson-hpu-overview': {
    lessonId: 'lesson-hpu-overview',
    tradeId: 'hydraulics',
    title: 'How the hydraulic power unit works',
    subtitle: 'Principles of hydraulic power generation, circulation, and filtration',
    estimatedMinutes: 15,
    objectives: [
      'Understand how mechanical prime mover power converts to fluid power.',
      'Trace fluid flow from the reservoir through the pump, relief valve, and return filter.',
      'Identify critical components: Reservoir, Sight Glass, Suction Strainer, Gear Pump, Relief Valve, Filter.',
      'Explain the role of the pressure relief valve in preventing catastrophic over-pressurization.'
    ],
    summary: 'The hydraulic power unit (HPU) turns motor rotation into fluid flow under pressure. Fluid is drawn from the reservoir, pushed through the system by the pump, and returns through the filter. The relief valve caps system pressure so nothing downstream sees more than it is rated for.',
    procedureSteps: [
      {
        step: 1,
        title: 'Visual Inspection of Reservoir Fluid',
        instruction: 'Inspect the fluid level at the sight glass. The fluid level must sit in the top third of the indicator with the system shut down and all actuators fully retracted.',
        safetyCaution: 'Never start an HPU with fluid below the minimum level. Doing so introduces air, causing instantaneous cavitation and pump failure.'
      },
      {
        step: 2,
        title: 'Verify Suction Line Isolation Valve',
        instruction: 'Check that the suction ball valve from the reservoir to the pump intake is wired fully OPEN.',
        safetyCaution: 'Starting a pump against a closed suction valve will destroy pump rotating group within 15 seconds.'
      },
      {
        step: 3,
        title: 'Check Pressure Relief Valve Setting',
        instruction: 'Verify that the relief valve adjuster locknut is secure and set to plant baseline (1800 PSI).',
      },
      {
        step: 4,
        title: 'Return Filter Differential Indicator',
        instruction: 'Examine the return filter visual pop-up gauge. The pin should be green (clean element).',
      }
    ],
    simulationConfig: {
      type: 'hpu',
      title: 'HPU-400 Fluid Power Generator',
      defaultPressurePsi: 0,
      reliefSettingPsi: 1800,
      components: [
        { id: 'reservoir', label: 'Reservoir Tank', description: 'Stores 120 liters of ISO VG 46 anti-wear hydraulic oil, dissipates heat, and de-aerates returning fluid.', safetyRule: 'Monitor temperature gauge; oil must remain below 60°C.' },
        { id: 'pump', label: 'Gear Pump', description: 'Positive displacement pump generating 24 L/min flow at 1450 RPM prime mover rotation.', safetyRule: 'Listen for gravel-like rattling sound indicating aeration or cavitation.' },
        { id: 'relief', label: 'Pressure Relief Valve', description: 'Direct-acting spring-loaded safety valve that diverts excess pump volume back to reservoir when line pressure exceeds spring tension.', safetyRule: 'Never bottom out the adjustment screw; keep locked at 1800 PSI.' },
        { id: 'filter', label: '10-Micron Return Filter', description: 'Captures particulate contamination before fluid re-enters reservoir.', safetyRule: 'Replace filter element when differential indicator pops red.' },
        { id: 'gauge', label: 'System Pressure Gauge', description: 'Glycerin-filled Bourdon tube gauge measuring pump line pressure in PSI / bar.', safetyRule: 'Ensure needle stabilizes smoothly without violent needle chatter.' }
      ]
    }
  },
  'lesson-hpu-startup': {
    lessonId: 'lesson-hpu-startup',
    tradeId: 'hydraulics',
    title: 'Safe start-up procedure',
    subtitle: 'Standard Operating Procedure (SOP) for commissioning hydraulic power systems',
    estimatedMinutes: 15,
    objectives: [
      'Execute plant SOP checklist before energizing pump prime mover.',
      'Perform jog-test to verify clockwise electric motor rotation.',
      'Confirm relief valve unloading during cold-fluid circulation.',
      'Verify operating pressure stabilization and absence of high-pressure fluid leaks.'
    ],
    summary: 'Start-up follows the exact order in your plant SOP. Confirm the protective coupling guard is secured, check fluid level at the sight glass, verify the relief valve setting, then jog the motor and observe gauge stabilization before applying work load.',
    procedureSteps: [
      {
        step: 1,
        title: 'Confirm Mechanical Coupling Guard',
        instruction: 'Ensure the steel protective shroud over the motor-pump shaft coupling is securely fastened with all 4 bolts.',
        safetyCaution: 'Exposed rotating shaft couplings can catch loose clothing or gloves instantly.'
      },
      {
        step: 2,
        title: 'Jog Motor for Rotation Check',
        instruction: 'Press motor START and immediately press STOP within 1 second. Verify the motor fan spins in the direction indicated by the housing arrow.',
        safetyCaution: 'Reverse rotation for more than 5 seconds will seize the pump bushings.'
      },
      {
        step: 3,
        title: 'Cold Start Low-Pressure Circulation',
        instruction: 'Run motor with directional control valves in neutral center for 3 minutes to circulate oil through return filter without load.',
      },
      {
        step: 4,
        title: 'Verify Line Pressure Stabilization',
        instruction: 'Observe main pressure gauge. In neutral center, line pressure should read tank return pressure (<50 PSI). Shift valve to verify relief at 1800 PSI.',
      }
    ],
    simulationConfig: {
      type: 'hpu',
      title: 'HPU-400 Standard Start-up Routine',
      defaultPressurePsi: 0,
      reliefSettingPsi: 1800,
      components: [
        { id: 'motor', label: '3-Phase Electric Motor', description: '7.5 kW 415V induction motor spinning at 1450 RPM.', safetyRule: 'Verify thermal overload reset is clear before energizing.' },
        { id: 'pump', label: 'Hydraulic Pump', description: 'Displaces 16cc per revolution into high-pressure manifold.', safetyRule: 'Do not run dry.' },
        { id: 'relief', label: 'Relief Valve', description: 'Protects entire plant line from over-pressure.', safetyRule: 'Verify vent line is unobstructed.' },
        { id: 'reservoir', label: 'Oil Reservoir', description: 'Maintains fluid volume and thermal balance.', safetyRule: 'Clean breather cap monthly to prevent vacuum.' },
        { id: 'gauge', label: 'Pressure Gauge', description: 'Reads working system pressure.', safetyRule: 'Check calibration tag date.' }
      ]
    }
  },
  'lesson-relief-valve': {
    lessonId: 'lesson-relief-valve',
    tradeId: 'hydraulics',
    title: 'Pressure relief valve calibration & cracking pressure',
    subtitle: 'Direct-acting and pilot-operated relief valve mechanics and adjustment',
    estimatedMinutes: 15,
    objectives: [
      'Differentiate cracking pressure from full-flow relief pressure.',
      'Adjust relief valve spring tension using calibrated gauge readouts.',
      'Detect relief valve seat erosion and thermal bypass overheating.'
    ],
    summary: 'A direct-acting relief valve uses a spring pushing against a poppet or ball. When hydraulic pressure acting on the poppet area exceeds spring force, the poppet lifts (cracking pressure) and allows oil to bypass into the tank return line, capping line pressure.',
    procedureSteps: [
      {
        step: 1,
        title: 'Install Calibrated Test Gauge',
        instruction: 'Connect a 0-3000 PSI test gauge into the pump test port quick-disconnect fitting.',
        safetyCaution: 'Relieve all trapped residual hydraulic pressure before disconnecting fittings.'
      },
      {
        step: 2,
        title: 'Dead-Head Cylinder at Stroke End',
        instruction: 'Actuate the directional control valve to full stroke extension to force all pump flow across the relief valve.',
      },
      {
        step: 3,
        title: 'Adjust Spring Preload Screw',
        instruction: 'Loosen jam nut. Turn adjustment screw clockwise to raise relief pressure or counter-clockwise to lower it. Set to exactly 1800 PSI.',
      },
      {
        step: 4,
        title: 'Lock Jam Nut & Record Baseline',
        instruction: 'Tighten locknut with 17mm wrench while holding adjustment screw in place. Confirm needle does not drift.',
      }
    ],
    simulationConfig: {
      type: 'relief-valve',
      title: 'Direct-Acting Relief Valve Simulator',
      defaultPressurePsi: 1200,
      reliefSettingPsi: 1800,
      components: [
        { id: 'poppet', label: 'Hardened Steel Poppet', description: 'Mates with valve seat to seal high pressure from tank port.', safetyRule: 'Inspect for wire drawing grooves.' },
        { id: 'spring', label: 'Compression Spring', description: 'Provides calibrated opposing mechanical force.', safetyRule: 'Replace if free length shows fatigue.' },
        { id: 'screw', label: 'Adjustment Screw', description: 'Compresses spring to calibrate relief pressure threshold.', safetyRule: 'Never exceed manufacturer max turns.' },
        { id: 'tank_port', label: 'Tank Return Port (T)', description: 'Directs bypassed hot fluid back to reservoir.', safetyRule: 'Ensure tank line backpressure is under 30 PSI.' }
      ]
    }
  },
  'lesson-directional-valve': {
    lessonId: 'lesson-directional-valve',
    tradeId: 'hydraulics',
    title: 'Directional control valve spool operation',
    subtitle: 'Spool center types, solenoid actuation, and hydraulic cylinder sequencing',
    estimatedMinutes: 20,
    objectives: [
      'Understand 4-way, 3-position (4/3) directional control valve flow paths.',
      'Compare Open Center, Closed Center, and Tandem Center spools.',
      'Diagnose internal spool leakage and actuator drift.'
    ],
    summary: 'Directional control valves direct hydraulic fluid flow from the pump port (P) to actuator work ports (A or B), while simultaneously routing exhaust fluid from the opposite work port back to the tank (T).',
    procedureSteps: [
      {
        step: 1,
        title: 'Identify Spool Center Position',
        instruction: 'Examine the valve schematic symbol on the nameplate. Verify P-to-T bypass in tandem center.',
      },
      {
        step: 2,
        title: 'Energize Solenoid A (Extend Stroke)',
        instruction: 'Apply 24VDC control signal to Solenoid A. Spool shifts right: Port P connects to A, Port B connects to T. Cylinder piston extends.',
      },
      {
        step: 3,
        title: 'De-energize to Spring Center (Neutral)',
        instruction: 'Remove control signal. Centering springs return spool to center. Work ports A and B are blocked; cylinder holds position.',
      },
      {
        step: 4,
        title: 'Energize Solenoid B (Retract Stroke)',
        instruction: 'Apply 24VDC to Solenoid B. Spool shifts left: Port P connects to B, Port A connects to T. Cylinder retracts.',
      }
    ],
    simulationConfig: {
      type: 'directional-valve',
      title: '4/3 Tandem Center Directional Valve & Actuator',
      defaultPressurePsi: 500,
      reliefSettingPsi: 1800,
      components: [
        { id: 'spool', label: 'Machined Valve Spool', description: 'Precision ground sliding spool with metering notches.', safetyRule: 'Clean fluid is mandatory; 5-micron clearance.' },
        { id: 'solenoid_a', label: 'Solenoid Coil A', description: 'Electromagnetic actuator shifting spool for extend stroke.', safetyRule: 'Do not energize coil off the armature (burnout).' },
        { id: 'solenoid_b', label: 'Solenoid Coil B', description: 'Electromagnetic actuator shifting spool for retract stroke.', safetyRule: 'Check 24VDC power supply voltage stability.' },
        { id: 'cylinder', label: 'Double-Acting Hydraulic Cylinder', description: 'Converts fluid pressure into mechanical linear thrust.', safetyRule: 'Ensure piston rod is free of burs and galling.' }
      ]
    }
  },
  'lesson-pressure-loss': {
    lessonId: 'lesson-pressure-loss',
    tradeId: 'hydraulics',
    title: 'Finding a pressure loss & pump cavitation',
    subtitle: 'Systematic troubleshooting methodology for low pressure faults',
    estimatedMinutes: 20,
    objectives: [
      'Differentiate between lack of fluid flow vs lack of resistance (pressure).',
      'Diagnose aeration vs cavitation using acoustic and visual cues.',
      'Check internal relief valve blow-by using thermal temperature differentials.'
    ],
    summary: 'Low pressure usually means fluid is going somewhere it should not (internal bypass), or the pump is not displacing enough volume. Follow the 5-step isolation SOP: check filter indicator, verify relief valve seat, touch tank return line for overheating, and inspect pump intake.',
    procedureSteps: [
      {
        step: 1,
        title: 'Verify Reservoir Level & Air Ingress',
        instruction: 'Check oil sight glass for white milky foaming indicating aerated oil drawn into suction intake.',
      },
      {
        step: 2,
        title: 'Thermal Bypass Test on Relief Valve',
        instruction: 'Use an infrared thermometer to measure relief valve tank line pipe temperature. If the tank line is significantly hotter than the reservoir (>15°C difference), the relief valve is blowing by continuously.',
      },
      {
        step: 3,
        title: 'Pump Case Drain Flow Test',
        instruction: 'Measure case drain leakage volume. Excessive flow indicates worn pump gear faces or scored piston shoes.',
      }
    ],
    simulationConfig: {
      type: 'hpu',
      title: 'Pressure Loss & Fault Diagnostics Simulator',
      defaultPressurePsi: 400,
      reliefSettingPsi: 1800,
      components: [
        { id: 'relief', label: 'Relief Valve (Worn Seat)', description: 'Simulates seat blow-by causing low line pressure.', safetyRule: 'Clean seat or replace cartridge.' },
        { id: 'pump', label: 'Pump', description: 'Supplying volumetric flow.', safetyRule: 'Check intake strainer for metal shavings.' },
        { id: 'gauge', label: 'Diagnostic Pressure Gauge', description: 'Shows pressure drop under load.', safetyRule: 'Compare against baseline commissioning curve.' }
      ]
    }
  },
  'lesson-electrical-safety': {
    lessonId: 'lesson-electrical-safety',
    tradeId: 'electrical',
    title: 'Fuses & circuit breakers: thermal-magnetic trip curves',
    subtitle: 'Overcurrent protection, short-circuit interruption, and arc flash safety',
    estimatedMinutes: 15,
    objectives: [
      'Differentiate overload current from instantaneous short-circuit current.',
      'Interpret time-current trip curves for motor branch circuit protection.',
      'Follow NFPA 70E electrical PPE requirements.'
    ],
    summary: 'Thermal-magnetic circuit breakers protect industrial cables and switchgear. The bimetallic strip bends under sustained overload, while the electromagnetic coil trips instantaneously during short circuits.',
    procedureSteps: [
      {
        step: 1,
        title: 'Verify Zero Energy State',
        instruction: 'Perform Lockout/Tagout (LOTO). Use a CAT IV 600V digital multimeter to test Phase-to-Phase and Phase-to-Ground voltage to confirm zero energy.',
        safetyCaution: 'Always test meter on known energized source before and after zero-energy check.'
      },
      {
        step: 2,
        title: 'Inspect Breaker Trip Indicator',
        instruction: 'Examine breaker handle position (Mid-trip vs OFF). Do not reset breaker without determining fault cause.',
      }
    ],
    simulationConfig: {
      type: 'electrical',
      title: 'Motor Control Circuit Breaker Simulator',
      defaultPressurePsi: 0,
      reliefSettingPsi: 0,
      components: [
        { id: 'breaker', label: '3-Pole Molded Case Breaker', description: 'Thermal-magnetic protection rated 63A.', safetyRule: 'Wear safety glasses and arc rated faceshield.' },
        { id: 'multimeter', label: 'Digital Multimeter', description: 'Measures 415VAC true-RMS voltage.', safetyRule: 'Ensure leads are undamaged.' },
        { id: 'diode_bridge', label: '3-Phase Diode Rectifier Bridge', description: '6-diode full-wave rectifier converting 415VAC to smooth 580VDC bus.', safetyRule: 'Wait 5 mins for DC capacitors to discharge before servicing.' }
      ]
    }
  },
  'lesson-mobile-brakes': {
    lessonId: 'lesson-mobile-brakes',
    tradeId: 'mobile',
    title: 'Air brake compressor & dual reservoir charging',
    subtitle: 'Pneumatic-hydraulic brake booster and safety circuit charging',
    estimatedMinutes: 15,
    objectives: [
      'Monitor dual air brake compressor cut-in (100 PSI) and cut-out (125 PSI) pressures.',
      'Test spring parking brake emergency application upon air loss.'
    ],
    summary: 'Mobile industrial equipment relies on dual pneumatic-hydraulic circuits. The engine compressor fills the primary and secondary reservoirs through the unloader valve and air dryer.',
    procedureSteps: [
      {
        step: 1,
        title: 'Air Build-up Time Test',
        instruction: 'Run engine at 1200 RPM. Measure time for pressure to rise from 85 PSI to 100 PSI (must be under 45 seconds).',
      }
    ],
    simulationConfig: {
      type: 'mobile-brakes',
      title: 'Mobile Air Brake & Accumulator Simulator',
      defaultPressurePsi: 110,
      reliefSettingPsi: 125,
      components: [
        { id: 'compressor', label: 'Reciprocating Air Compressor', description: 'Pumps compressed air into wet tank.', safetyRule: 'Inspect cooling lines.' },
        { id: 'governor', label: 'Air Governor', description: 'Controls compressor unloader valve.', safetyRule: 'Verify cut-out pressure at 125 PSI.' },
        { id: 'air_tank', label: 'Dual Air Reservoirs', description: 'Stores 60 liters of dry compressed air for brake chambers.', safetyRule: 'Drain moisture condensate daily.' }
      ]
    }
  },
  'lesson-plc-basics': {
    lessonId: 'lesson-plc-basics',
    tradeId: 'automation',
    title: 'Programmable Logic Controller (PLC) hardware setup',
    subtitle: '24VDC optical isolation, power rail wiring, and rack diagnostics',
    estimatedMinutes: 15,
    objectives: [
      'Trace sink vs source input circuit wiring to inductive proximity sensors.',
      'Check CPU fault LEDs and communication bus heartbeat.'
    ],
    summary: 'Industrial PLCs monitor shop-floor sensors and actuate solenoids, contactors, and variable frequency drives (VFDs) through optically isolated I/O cards.',
    procedureSteps: [
      {
        step: 1,
        title: 'Power Rail Voltage Check',
        instruction: 'Measure 24VDC power supply output. Voltage must remain between 23.8V and 24.5V under full I/O load.',
      }
    ],
    simulationConfig: {
      type: 'plc',
      title: 'PLC CPU & I/O Rack Simulator',
      defaultPressurePsi: 24,
      reliefSettingPsi: 24,
      components: [
        { id: 'cpu', label: 'PLC CPU Module', description: 'Executes ladder scan cycle every 5 milliseconds.', safetyRule: 'Backup program before firmware updates.' },
        { id: 'input_card', label: '16-Point 24VDC Input Card', description: 'Optical isolation for proximity switches and pushbuttons.', safetyRule: 'Check fuse on common rail.' },
        { id: 'ladder_rung', label: 'Ladder Logic Program Rung', description: 'Real-time boolean state machine with seal-in holding contact.', safetyRule: 'Ensure E-stop is hardwired outside PLC software.' }
      ]
    }
  },
  'crescent-pump-simulation': {
    lessonId: 'crescent-pump-simulation',
    tradeId: 'hydraulics',
    title: 'Crescent Internal Gear Pump',
    subtitle: 'Meshing internal gears, crescent seal pocket isolation, and positive displacement',
    estimatedMinutes: 15,
    objectives: [
      'Analyze fluid intake into expanding gear cavities between the inner spur pinion and outer ring gear.',
      'Understand how the crescent divider separates low-pressure suction from high-pressure discharge.',
      'Observe volumetric flow rate scaling with rotational shaft speed (RPM).',
      'Diagnose cavitation and inlet vacuum loss caused by restricted suction ports.'
    ],
    summary: 'The internal crescent gear pump uses an externally driven pinion gear to rotate an internally toothed outer ring gear. Fluid enters through the suction port, expands into the opening gear teeth, is carried across the crescent stationary seal in sealed pockets, and is squeezed into the discharge line as the teeth re-mesh.',
    procedureSteps: [
      {
        step: 1,
        title: 'Inspect Suction Line Priming',
        instruction: 'Verify pump housing is primed with hydraulic fluid to avoid dry running on startup.',
        safetyCaution: 'Never run a crescent gear pump dry; metal-to-metal galling occurs in under 20 seconds.'
      },
      {
        step: 2,
        title: 'Verify Rotational Direction',
        instruction: 'Confirm drive motor rotation matches the inlet-to-crescent arrow direction.',
        safetyCaution: 'Reversed rotation pressurizes the shaft lip seal, causing catastrophic blow-out and oil spill.'
      },
      {
        step: 3,
        title: 'Monitor Flow vs RPM Telemetry',
        instruction: 'Adjust shaft speed from 600 to 1800 RPM and verify linear GPM delivery across discharge line.'
      }
    ],
    simulationConfig: {
      type: 'crescent-pump',
      title: 'Crescent Internal Gear Pump Digital Twin',
      defaultPressurePsi: 1200,
      reliefSettingPsi: 2000,
      components: [
        { id: 'inlet_port', label: 'Inlet Suction Port', description: 'Low pressure intake drawing fluid from reservoir with moving flow arrows.', safetyRule: 'Prevent suction line restrictions.' },
        { id: 'pinion_gear', label: 'Drive Pinion (Inner Gear)', description: 'Keyed shaft spur gear driven directly by prime mover.', safetyRule: 'Check coupling alignment.' },
        { id: 'ring_gear', label: 'Internal Ring Gear (Outer Gear)', description: 'Idler gear driven by inner pinion teeth.', safetyRule: 'Inspect tooth flank clearances.' },
        { id: 'crescent_seal', label: 'Crescent Sealing Partition', description: 'Stationary machined crescent that seals the fluid pockets between inner and outer gears.', safetyRule: 'Excessive wear across crescent tip causes internal slip.' },
        { id: 'outlet_port', label: 'Outlet Discharge Port', description: 'High pressure fluid chamber directing flow into the circuit.', safetyRule: 'Ensure downstream relief valve is installed.' }
      ]
    }
  },
  'force-pressure-area': {
    lessonId: 'force-pressure-area',
    tradeId: 'hydraulics',
    title: 'Force = Pressure × Area (Hydraulic Actuator Circuit)',
    subtitle: 'Fluid pressure generation, double-acting cylinder force, and fault diagnostics',
    estimatedMinutes: 20,
    objectives: [
      'Apply Pascal’s principle: Force (lbs) = Pressure (PSI) × Piston Area (in²).',
      'Calculate system line pressure generated by a 15,000 lbs load against a 10 in² cylinder piston (1500 PSI).',
      'Trace fluid paths: High-pressure red fluid in cap chamber and low-pressure blue return fluid from rod chamber.',
      'Simulate component wear: Compare normal operation against cylinder piston seal leakage and pump gear wear.'
    ],
    summary: 'Hydraulic systems transmit power by pushing fluid into actuators under load. The pump does not produce pressure—it produces flow; pressure is the resistance to flow caused by the load. Here, a 10 GPM gear pump feeds a 10 in² cylinder lifting a 15,000 lbs load, creating exactly 1500 PSI.',
    procedureSteps: [
      {
        step: 1,
        title: 'Verify Piston Bore & Area',
        instruction: 'Measure cylinder bore. An area of 10 in² produces 15,000 lbs force at 1500 PSI line pressure.',
        safetyCaution: 'Check rated cylinder barrel pressure before operating above 2000 PSI.'
      },
      {
        step: 2,
        title: 'Monitor Gauge Response Under Load',
        instruction: 'Engage pump and verify pressure rises until it overcomes static breakaway resistance of the 15,000 lbs load.'
      },
      {
        step: 3,
        title: 'Perform Damage Simulation',
        instruction: 'Switch damage mode to Cylinder to observe internal piston bypass and pressure loss, then to Pump to observe volumetric slip.'
      }
    ],
    simulationConfig: {
      type: 'cylinder-circuit',
      title: 'Hydraulic Force & Cylinder Circuit Digital Twin',
      defaultPressurePsi: 1500,
      reliefSettingPsi: 2500,
      components: [
        { id: 'gear_pump', label: 'External Gear Pump (10 GPM)', description: 'Positive displacement pump with dual meshing gears supplying constant fluid flow.', safetyRule: 'Inspect gear face clearance.' },
        { id: 'pressure_gauge', label: 'Bourdon Line Pressure Gauge', description: 'Glycerin-filled analog gauge showing 1500 PSI corresponding to the 15,000 lbs load.', safetyRule: 'Replace if dial pointer sticks.' },
        { id: 'hydraulic_cylinder', label: 'Double-Acting Cylinder (10 in² Area)', description: 'Translates fluid pressure in cap chamber into 15,000 lbs linear thrust.', safetyRule: 'Inspect rod chrome for scoring.' },
        { id: 'load_block', label: 'Work Load (15,000 lbs)', description: 'Heavy steel load guided along horizontal ways.', safetyRule: 'Keep personnel clear of pinch zones.' },
        { id: 'return_line', label: 'Low-Pressure Return Line', description: 'Carries unpressurized blue fluid from rod-end chamber back to reservoir tank.', safetyRule: 'Ensure return backpressure is below 50 PSI.' }
      ]
    }
  },
  'dynex-model-simulation': {
    lessonId: 'dynex-model-simulation',
    tradeId: 'hydraulics',
    title: 'Dynex Checkball Piston Pump (3D Exploded View)',
    subtitle: 'Interactive 3D assembly, axial plunger check valves, and overhaul inspection',
    estimatedMinutes: 20,
    objectives: [
      'Inspect 3D mechanical relationships between the rotating wobble plate, holddown plate, and axial pistons.',
      'Trace fluid intake through hollow pistons with integrated inlet ball check valves.',
      'Understand how cover ball check valves isolate each individual piston chamber up to 10,000 PSI (700 bar).',
      'Execute overhaul inspection for swashplate spalling, checkball seat wear, and shaft seal condition.'
    ],
    summary: 'The Dynex checkball piston pump is a positive displacement pump designed for extreme pressures (up to 10,000 PSI) and contaminated or low-lubricity fluids. Unlike conventional swashplate pumps with valve plates, checkball pumps use individual suction check valves in each piston and discharge check valves in the head cover, ensuring bi-directional rotation and exceptional contamination tolerance.',
    procedureSteps: [
      {
        step: 1,
        title: 'Explode Pump Assembly',
        instruction: 'Use the Explode View slider to separate the front drive shaft, pump body, rotating group, cylinder barrel, and full flow cover.',
        safetyCaution: 'Do not drop precision-ground checkballs or scratch piston slipper faces during disassembly.'
      },
      {
        step: 2,
        title: 'Inspect Camshaft & Swashplate Angle',
        instruction: 'Rotate 3D view to examine the hardened swashplate wobble face for micro-grooving or pitting.',
        safetyCaution: 'Scored swashplates cause catastrophic slipper shoe separation at high operating RPM.'
      },
      {
        step: 3,
        title: 'Check Inlet & Discharge Check Valves',
        instruction: 'Verify seating of inlet ball check valves inside the pistons and cover ball check valves in the manifold cover.',
      }
    ],
    simulationConfig: {
      type: 'exploded-pump-3d',
      title: 'Dynex Checkball Piston Pump 3D Digital Twin',
      defaultPressurePsi: 5000,
      reliefSettingPsi: 10000,
      components: [
        { id: 'shaft_retaining_ring', label: 'Shaft Retaining Ring', description: 'External carbon steel snap ring locating the drive shaft within the front radial bearing.', safetyRule: 'Always use calibrated retaining ring pliers; never over-expand.' },
        { id: 'bearing_retaining_ring', label: 'Bearing Retaining Ring', description: 'Internal housing snap ring securing the front bearing outer race against axial pushout.', safetyRule: 'Ensure snap ring is fully seated in housing groove.' },
        { id: 'ball_bearing', label: 'Ball Bearing (Front Shaft)', description: 'Deep groove radial ball bearing supporting shaft overhung mechanical loads from drive couplings.', safetyRule: 'Inspect for spalling, raceway brinelling, or cage fatigue.' },
        { id: 'shaft_seal', label: 'High-Pressure Shaft Seal', description: 'Spring-energized fluorocarbon double-lip seal preventing fluid leakage and air ingress.', safetyRule: 'Lubricate seal lip with clean hydraulic oil before installation.' },
        { id: 'tapered_roller_bearing', label: 'Tapered Roller Thrust Bearing', description: 'Heavy-duty tapered roller bearing absorbing high axial thrust loads generated by the reciprocating pistons.', safetyRule: 'Verify bearing preload endplay during reassembly.' },
        { id: 'camshaft_swashplate', label: 'Camshaft & Swashplate', description: 'Hardened steel drive shaft with integral fixed-angle wobble swashplate face driving piston strokes.', safetyRule: 'Inspect polished wobble surface for galling or heat discoloration.' },
        { id: 'holddown_plate', label: 'Holddown Plate & Slippers', description: 'Precision bronze holddown plate retaining bronze piston slipper feet securely against the swashplate.', safetyRule: 'Check slipper pocket clearance; excess play causes shoe detachment.' },
        { id: 'piston_inlet_check_valve', label: 'Piston with Inlet Check Valve', description: 'Hollow hardened steel plunger containing an internal ball check valve that draws fluid during suction stroke.', safetyRule: 'Ultrasonically clean checkball cavities; trapped contamination prevents sealing.' },
        { id: 'barrel', label: 'Cylinder Barrel Block', description: 'High-tensile ductile iron block precision bored for reciprocating piston plungers.', safetyRule: 'Measure cylinder bore clearance with precision bore micrometer.' },
        { id: 'cover_ball_check_valves', label: 'Cover Ball Check Valves', description: 'High-pressure outlet check valves with stainless steel balls and return springs sealing against discharge manifold.', safetyRule: 'Inspect checkball seats for wire-drawing erosion under high pressure.' },
        { id: 'full_flow_cover', label: 'Full Flow Cover & Manifold', description: 'Heavy cast-iron end cover collecting discharge flow from all pistons into a unified high-pressure port.', safetyRule: 'Torque cover hex bolts in cross-pattern to manufacturer specifications.' },
        { id: 'inlet', label: 'Suction Inlet Port', description: 'Low-pressure inlet port flooding the pump casing to supply piston check valves.', safetyRule: 'Maintain positive suction head to avoid pump cavitation.' },
        { id: 'outlet', label: 'High-Pressure Outlet Port', description: 'Rated up to 10,000 PSI (700 bar) delivering pulse-free positive displacement flow.', safetyRule: 'Use high-pressure rated 4-spiral hydraulic hoses.' }
      ]
    }
  }
};

// Aliases for direct navigation by numeric IDs and session slugs
LESSONS_DATABASE['1221'] = LESSONS_DATABASE['crescent-pump-simulation'];
LESSONS_DATABASE['1379'] = LESSONS_DATABASE['force-pressure-area'];
LESSONS_DATABASE['686'] = LESSONS_DATABASE['force-pressure-area'];
LESSONS_DATABASE['gear-pump-simulation'] = LESSONS_DATABASE['force-pressure-area'];
LESSONS_DATABASE['hydraulic-cylinder-circuit'] = LESSONS_DATABASE['force-pressure-area'];
LESSONS_DATABASE['crescent-pump'] = LESSONS_DATABASE['crescent-pump-simulation'];
LESSONS_DATABASE['2236'] = LESSONS_DATABASE['dynex-model-simulation'];
LESSONS_DATABASE['checkball-piston-pump'] = LESSONS_DATABASE['dynex-model-simulation'];
LESSONS_DATABASE['dynex-checkball-pump'] = LESSONS_DATABASE['dynex-model-simulation'];
