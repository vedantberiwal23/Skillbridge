/**
 * Modular Simulations Registry
 * Extracted from Desktop/blue-collar/simulations_modular
 */

export interface ModularSimulationItem {
  id: string;
  fileId: string;
  title: string;
  tradeId: 'hydraulics' | 'electrical' | 'mobile' | 'stationary' | 'automation';
  category: string;
  componentsCount: number;
  description: string;
  specSummary: string;
  tags: string[];
}

export const MODULAR_SIMULATIONS: ModularSimulationItem[] = [
  {
    id: 'sim-1570',
    fileId: '1570',
    title: 'Wet Fuel Bin HPU Unit',
    tradeId: 'hydraulics',
    category: 'Power Units',
    componentsCount: 180,
    description: 'Central hydraulic power unit with tandem directional valves, tank manifold, relief valve, and 5 work ports (P, T, A, B, Y).',
    specSummary: '2800x2000 SVG canvas with 180 vector components and high/low pressure state machine.',
    tags: ['HPU', 'Tandem Spool', 'Relief Valve', 'Manifold']
  },
  {
    id: 'sim-1379',
    fileId: '1379',
    title: 'External Gear Pump',
    tradeId: 'hydraulics',
    category: 'Pumps',
    componentsCount: 29,
    description: 'Positive displacement gear pump displacement mechanics showing gear meshing, suction chamber expansion, and pressure discharge.',
    specSummary: '29 vector components with rotary tooth clearance and volumetric flow arrows.',
    tags: ['Gear Pump', 'Positive Displacement', 'Suction']
  },
  {
    id: 'sim-1243',
    fileId: '1243',
    title: 'Pressure Drops with Relief Valve',
    tradeId: 'hydraulics',
    category: 'Pressure Control',
    componentsCount: 169,
    description: 'Multiple series restrictions with direct-acting relief bypass, demonstrating line delta-P and flow diversion.',
    specSummary: '169 vector elements with multi-stage Bourdon tube pressure readouts.',
    tags: ['Delta-P', 'Relief Valve', 'Series Orifices']
  },
  {
    id: 'sim-162',
    fileId: '162',
    title: 'Cross-Port Relief: Dynamic Braking',
    tradeId: 'mobile',
    category: 'Braking Circuits',
    componentsCount: 123,
    description: 'Dual anti-cavitation and cross-port relief manifold protecting hydrostatic drive motors during sudden deceleration.',
    specSummary: '123 components showing bidirectional relief thresholds and makeup check valves.',
    tags: ['Mobile Braking', 'Hydrostatic', 'Anti-Cavitation']
  },
  {
    id: 'sim-165',
    fileId: '165',
    title: 'High-Low Unloading Valve Circuit',
    tradeId: 'hydraulics',
    category: 'Energy Conservation',
    componentsCount: 59,
    description: 'Two-pump rapid-traverse system automatically unloading high-volume pump at preset clamping pressure.',
    specSummary: '59 components demonstrating differential area pilot unloader spool action.',
    tags: ['Unloading Valve', 'High-Low', 'Clamping']
  },
  {
    id: 'sim-1891',
    fileId: '1891',
    title: 'Balanced Vane Pump',
    tradeId: 'hydraulics',
    category: 'Pumps',
    componentsCount: 45,
    description: 'Double-lobed cam ring vane pump with hydraulically balanced diametrically opposed suction and pressure ports.',
    specSummary: '45 components with sliding vanes and rotor centrifugal extension mechanics.',
    tags: ['Vane Pump', 'Zero Shaft Radial Load', 'High Pressure']
  },
  {
    id: 'sim-1244',
    fileId: '1244',
    title: 'RH400 Excavator Boom Float Valve',
    tradeId: 'mobile',
    category: 'Implement Circuits',
    componentsCount: 204,
    description: 'Heavy hydraulic mining shovel pilot-operated boom float circuit allowing bucket to follow ground contours freely.',
    specSummary: '204 components modeling hydraulic detent pilot override and spool float bypass.',
    tags: ['Mining Shovel', 'Boom Float', 'Pilot Logic']
  },
  {
    id: 'sim-1080',
    fileId: '1080',
    title: 'Cooling Bed Hydraulic Walking Beam',
    tradeId: 'stationary',
    category: 'Steel Mill Machinery',
    componentsCount: 313,
    description: 'Synchronized multi-cylinder lifting and racking circuit for hot rolled steel bar transportation.',
    specSummary: '313 components showing flow divider accuracy and cylinder mechanical synchronization.',
    tags: ['Steel Mill', 'Walking Beam', 'Flow Divider']
  },
  {
    id: 'sim-1213',
    fileId: '1213',
    title: 'Daylight Press Multi-Ram Sequencing',
    tradeId: 'stationary',
    category: 'Presses',
    componentsCount: 258,
    description: 'High-tonnage hydraulic hot platen press with prefill valve gravity drop and high-pressure intensification.',
    specSummary: '258 components demonstrating prefill tank suction and decompression valving.',
    tags: ['Hydraulic Press', 'Prefill Valve', 'Decompression']
  }
];
