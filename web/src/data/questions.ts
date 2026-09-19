/**
 * Industrial Diagnostic Assessment Question Bank
 * Diagnostic question bank for the demo vertical. Third-party content
 * provenance and attribution are recorded in README.md, not here.
 */

export interface DiagnosticQuestion {
  id: string;
  tradeId: 'hydraulics' | 'electrical' | 'mobile' | 'stationary' | 'automation';
  topic: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  safetyRef: string;
}

export const TECHNICAL_QUESTIONS: DiagnosticQuestion[] = [
  // -------------------------------------------------------------
  // HYDRAULICS QUESTIONS
  // -------------------------------------------------------------
  {
    id: 'hyd-q1',
    tradeId: 'hydraulics',
    topic: 'Closed Loop Hydrostatics',
    prompt: 'In a closed loop hydrostatic drive system, how is the hydraulic motor reversed without an external directional control valve?',
    options: [
      'By swapping the inlet and outlet flow directions via the over-center variable pump swashplate.',
      'By reversing the mechanical rotation direction of the electric prime mover.',
      'By manually opening the cross-port hot oil shuttle valve.',
      'By venting the charge pump pressure relief valve to reservoir.'
    ],
    correctIndex: 0,
    explanation: 'Closed-loop hydrostatic pumps use over-center swashplates that tilt past neutral, reversing fluid discharge between ports A and B without stopping or reversing the prime mover.',
    safetyRef: 'ISO 4413 §6.3: Hydrostatic Transmission Control Protocols'
  },
  {
    id: 'hyd-q2',
    tradeId: 'hydraulics',
    topic: 'Pressure Relief Valves',
    prompt: 'What occurs when system pressure reaches the "cracking pressure" of a direct-acting pressure relief valve?',
    options: [
      'The poppet begins to lift from its seat, allowing a minor pilot bypass of fluid to tank.',
      'The valve opens completely to divert 100% of maximum pump displacement immediately.',
      'The spring tension relaxes automatically to lock the downstream actuators.',
      'The valve body vents air bubbles into the reservoir return line.'
    ],
    correctIndex: 0,
    explanation: 'Cracking pressure is the threshold where hydraulic force first overcomes spring preload. Full-flow relief pressure is higher due to spring rate compression (pressure override).',
    safetyRef: 'Plant Safety SOP: PRV-04 Calibration Standards'
  },
  {
    id: 'hyd-q3',
    tradeId: 'hydraulics',
    topic: 'Fluid Power Basics',
    prompt: 'When hydraulic oil passes through a series of restrictions in a single pipeline, what happens to the fluid pressure immediately after each restriction?',
    options: [
      'The pressure value decreases after each restriction due to flow energy loss converted into heat.',
      'The pressure value increases steadily after each restriction due to mass accumulation.',
      'The pressure remains identical across all points in the series circuit.',
      'The pressure drops to full absolute vacuum after the second restriction.'
    ],
    correctIndex: 0,
    explanation: 'Each orifice or valve restriction creates a pressure drop (delta-P) where potential pressure energy is dissipated as frictional heat into the fluid.',
    safetyRef: 'Bernoulli Fluid Continuity and Orifice Equations'
  },
  {
    id: 'hyd-q4',
    tradeId: 'hydraulics',
    topic: 'Directional Control Valves',
    prompt: 'In a 4-way, 3-position (4/3) Tandem Center directional control valve in neutral position, what are the port connections?',
    options: [
      'Pump (P) connects directly to Tank (T), while work ports (A and B) are blocked.',
      'All ports (P, T, A, B) are interconnected and open to tank.',
      'All ports (P, T, A, B) are completely blocked and dead-headed.',
      'Pump (P) connects to Port A, while Port B connects to Tank (T).'
    ],
    correctIndex: 0,
    explanation: 'Tandem center allows the pump to circulate back to tank at low standby pressure (<50 PSI) while holding the cylinder or hydraulic actuator securely locked.',
    safetyRef: 'ANSI/(NFPA) T3.5.1M Hydraulic Valve Standards'
  },
  {
    id: 'hyd-q5',
    tradeId: 'hydraulics',
    topic: 'Diagnostics & Troubleshooting',
    prompt: 'During an HPU inspection, you measure a temperature 22°C hotter on the relief valve tank return line compared to the main oil reservoir. What does this diagnose?',
    options: [
      'The relief valve is leaking or blowing by continuously under load, bypassing high-pressure fluid to tank.',
      'The electric motor cooling fan is running in reverse rotation.',
      'The return filter element is ruptured and flowing with zero restriction.',
      'The reservoir oil level is overfilled past the sight glass.'
    ],
    correctIndex: 0,
    explanation: 'Continuous fluid throttling across a relief valve seat converts all hydraulic horsepower into pure heat (1 HP = 2544 BTU/hr), resulting in extreme localized pipe heating.',
    safetyRef: 'Thermal Diagnostics SOP: Diagnostic IR Standards'
  },

  // -------------------------------------------------------------
  // ELECTRICAL QUESTIONS
  // -------------------------------------------------------------
  {
    id: 'elec-q1',
    tradeId: 'electrical',
    topic: 'Circuit Protection & Fuses',
    prompt: 'Why must you never replace a fast-acting semiconductor fuse with a standard slow-blow (time-delay) fuse in an industrial motor drive?',
    options: [
      'A slow-blow fuse will not clear short-circuit faults fast enough to protect sensitive power transistors (IGBTs).',
      'A slow-blow fuse will cause continuous nuisance tripping during steady-state motor run.',
      'A slow-blow fuse generates high-frequency harmonic distortion across the plant grid.',
      'A slow-blow fuse reverses the 3-phase supply voltage sequence.'
    ],
    correctIndex: 0,
    explanation: 'Semiconductor fast-acting fuses clear in fractions of a millisecond to protect solid-state silicon from catastrophic thermal destruction during fault currents.',
    safetyRef: 'NFPA 70E: Electrical Safety in the Workplace §130'
  },
  {
    id: 'elec-q2',
    tradeId: 'electrical',
    topic: 'Lockout / Tagout (LOTO)',
    prompt: 'What is the mandatory final step before touching conductors during a Lockout/Tagout (LOTO) zero-energy verification?',
    options: [
      'Test your multimeter on a known live voltage source, measure Phase-to-Phase and Phase-to-Ground, then retest the meter on live source.',
      'Visually inspect that the disconnect switch handle is in the OFF position and proceed.',
      'Touch the conductors briefly with the back of your glove to test for induction.',
      'Turn off the building main lighting switch.'
    ],
    correctIndex: 0,
    explanation: 'The Live-Dead-Live test rule is mandatory: verify your meter works on a known source, verify zero voltage on target circuit, re-verify meter on known source to prove it did not fail dead.',
    safetyRef: 'OSHA 1910.147 / NFPA 70E Article 120.1'
  },
  {
    id: 'elec-q3',
    tradeId: 'electrical',
    topic: 'Industrial Fieldbus & CAN Bus',
    prompt: 'What component terminates the physical ends of a high-speed CAN Bus network to prevent signal reflections?',
    options: [
      'A 120-ohm terminating resistor between CAN-High and CAN-Low lines at both ends.',
      'A 10-microfarad ceramic capacitor connected to chassis ground.',
      'A fast-recovery clamping diode to suppress inductive kickback.',
      'A 415V thermal magnetic circuit breaker.'
    ],
    correctIndex: 0,
    explanation: 'CAN networks require two 120-ohm termination resistors at the extreme ends of the trunk line (giving an equivalent 60-ohm bus resistance) to match cable characteristic impedance.',
    safetyRef: 'ISO 11898-2 Physical Layer Standards'
  },
  {
    id: 'elec-q4',
    tradeId: 'electrical',
    topic: 'Power Electronics',
    prompt: 'In a 3-phase full-wave bridge rectifier, how many power diodes are required to convert 3-phase AC into continuous DC?',
    options: [
      '6 power diodes (three top positive diodes, three bottom negative diodes).',
      '4 power diodes arranged in an H-bridge configuration.',
      '3 power diodes, one connected in series with each phase line.',
      '12 power diodes arranged in a parallel cascade.'
    ],
    correctIndex: 0,
    explanation: 'A 3-phase bridge rectifier uses 6 diodes (2 per phase leg) to conduct whichever phase is most positive to the positive rail, and whichever is most negative to the return rail.',
    safetyRef: 'IEEE 519 Industrial Power Electronics Guide'
  },

  // -------------------------------------------------------------
  // MOBILE EQUIPMENT QUESTIONS
  // -------------------------------------------------------------
  {
    id: 'mob-q1',
    tradeId: 'mobile',
    topic: 'Air Brake Systems',
    prompt: 'On heavy mobile equipment, what safety event occurs if air system pressure drops below approximately 45 PSI (3.1 bar)?',
    options: [
      'The spring parking brake chambers automatically trigger and mechanically clamp the brakes.',
      'The compressor unloader valve opens completely to vent all remaining air.',
      'The hydraulic swashplate shifts to 100% full displacement forward travel.',
      'The steering orbital valve locks the front axle in place.'
    ],
    correctIndex: 0,
    explanation: 'Heavy vehicle spring brakes require air pressure to hold powerful mechanical springs compressed. If air pressure is lost, the springs expand and mechanically lock the brakes.',
    safetyRef: 'FMVSS 121 Heavy Vehicle Air Brake Standards'
  },
  {
    id: 'mob-q2',
    tradeId: 'mobile',
    topic: 'Cross-Port Relief',
    prompt: 'What is the primary function of cross-port relief valves installed across a hydraulic travel or swing motor?',
    options: [
      'To cushion sudden inertia stops and prevent pressure spikes and motor cavitation during braking.',
      'To increase engine fuel efficiency during continuous high-speed transit.',
      'To bypass warm fluid into the hydraulic oil cooler radiator.',
      'To pre-lubricate the swing bearing gear teeth.'
    ],
    correctIndex: 0,
    explanation: 'When the directional valve closes on a high-inertia load (like a rotating excavator superstructure), cross-port relief valves dissipate the kinetic energy without rupturing hoses.',
    safetyRef: 'ISO 6015 Earthmoving Machinery Hydraulic Standards'
  },

  // -------------------------------------------------------------
  // AUTOMATION & PLC QUESTIONS
  // -------------------------------------------------------------
  {
    id: 'auto-q1',
    tradeId: 'automation',
    topic: 'PLC Hardware & I/O',
    prompt: 'What is the purpose of optical isolation on industrial PLC 24VDC digital input cards?',
    options: [
      'To electrically decouple field wiring spikes and ground loops from sensitive internal microprocessor logic.',
      'To speed up signal transmission using infrared fiber optic laser pulses.',
      'To illuminate the cabinet interior during maintenance shifts.',
      'To step down 415VAC industrial line voltage down to 24VDC.'
    ],
    correctIndex: 0,
    explanation: 'Optocouplers use an internal LED and phototransistor to pass signals across an air gap, protecting the CPU from voltage spikes up to several thousand volts.',
    safetyRef: 'IEC 61131-2 Industrial Controller Requirements'
  },
  {
    id: 'auto-q2',
    tradeId: 'automation',
    topic: 'Ladder Logic',
    prompt: 'In standard industrial ladder logic, what is a "seal-in" (holding) contact circuit used for?',
    options: [
      'To maintain motor coil energization after a momentary start pushbutton is released.',
      'To seal hydraulic hose crimps using ultrasonic vibration pulses.',
      'To permanently bypass the emergency stop pushbutton during testing.',
      'To calibrate 4-20mA analog temperature transmitter scaling.'
    ],
    correctIndex: 0,
    explanation: 'A seal-in contact is placed in parallel with the momentary START pushbutton so that once the output coil energizes, its own auxiliary contact keeps the rung energized.',
    safetyRef: 'NFPA 79 Electrical Standard for Industrial Machinery'
  }
];

export function getQuestionsForTrade(tradeId: string): DiagnosticQuestion[] {
  const filtered = TECHNICAL_QUESTIONS.filter((q) => q.tradeId === tradeId);
  return filtered.length > 0 ? filtered : TECHNICAL_QUESTIONS.filter((q) => q.tradeId === 'hydraulics');
}
