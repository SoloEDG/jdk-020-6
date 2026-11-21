import type { CargoBatch, CargoClass, Flight } from "../../../shared/types";
export interface CompartmentSpec {
  id: string;
  label: string;
  maxWeight: number;
  maxPiece: number;
  arm: number;
}
export interface CargoSpec {
  compartments: CompartmentSpec[];
  baseWeight: number;
  baseArm: number;
  envelope: [number, number];
}
export const cargoSpecs: Record<Flight["size"], CargoSpec> = {
  narrow: {
    baseWeight: 36000,
    baseArm: 15.4,
    envelope: [14.9, 16.1],
    compartments: [
      { id: "FWD", label: "前舱", maxWeight: 3400, maxPiece: 2000, arm: 8 },
      { id: "AFT", label: "后舱", maxWeight: 2400, maxPiece: 2000, arm: 22 },
    ],
  },
  wide: {
    baseWeight: 110000,
    baseArm: 15.2,
    envelope: [14.8, 15.6],
    compartments: [
      { id: "FWD", label: "前舱", maxWeight: 6000, maxPiece: 5000, arm: 9 },
      { id: "MID", label: "中舱", maxWeight: 5000, maxPiece: 5000, arm: 15 },
      { id: "AFT", label: "后舱", maxWeight: 4000, maxPiece: 5000, arm: 21 },
    ],
  },
};
export const cargoClasses: Record<
  CargoClass,
  { label: string; rate: number; color: string; dangerous?: boolean }
> = {
  GEN: { label: "普货", rate: 3, color: "#7d9187" },
  PER: { label: "鲜活", rate: 5, color: "#5d9b84" },
  AVI: { label: "活体", rate: 7, color: "#b78a40" },
  RFL: { label: "易燃", rate: 10, color: "#c75448", dangerous: true },
  ROX: { label: "氧化", rate: 10, color: "#8a5fa8", dangerous: true },
};
export const incompatiblePairs: [CargoClass, CargoClass][] = [
  ["RFL", "ROX"],
  ["AVI", "RFL"],
  ["AVI", "ROX"],
];
export function classesClash(a: CargoClass, b: CargoClass): boolean {
  return incompatiblePairs.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a),
  );
}
export const stagingSlots = 4;
export function revenueFor(weight: number, cls: CargoClass): number {
  return Math.round((weight * cargoClasses[cls].rate) / 100);
}
interface BatchSeed {
  id: string;
  inbound: boolean;
  destination: string;
  weight: number;
  cls: CargoClass;
  hold?: string;
}
const manifests: Record<string, BatchSeed[]> = {
  MU2451: [
    { id: "C1", inbound: false, destination: "CTU", weight: 1300, cls: "GEN" },
    { id: "C2", inbound: false, destination: "CTU", weight: 1500, cls: "RFL" },
    { id: "C3", inbound: false, destination: "CTU", weight: 900, cls: "ROX" },
    { id: "A1", inbound: true, destination: "SHA", weight: 800, cls: "PER", hold: "AFT" },
    { id: "A2", inbound: true, destination: "SHA", weight: 500, cls: "GEN", hold: "FWD" },
  ],
  CZ3088: [
    { id: "C1", inbound: false, destination: "PEK", weight: 3000, cls: "GEN" },
    { id: "C2", inbound: false, destination: "PEK", weight: 2600, cls: "PER" },
    { id: "C3", inbound: false, destination: "PEK", weight: 1500, cls: "AVI" },
    { id: "C4", inbound: false, destination: "PEK", weight: 2900, cls: "RFL" },
    { id: "A1", inbound: true, destination: "SHA", weight: 2200, cls: "GEN", hold: "FWD" },
    { id: "A2", inbound: true, destination: "SHA", weight: 1300, cls: "PER", hold: "AFT" },
  ],
  CA1833: [
    { id: "C1", inbound: false, destination: "XMN", weight: 1100, cls: "GEN" },
    { id: "C2", inbound: false, destination: "XMN", weight: 1400, cls: "PER" },
    { id: "C3", inbound: false, destination: "XMN", weight: 800, cls: "AVI" },
    { id: "A1", inbound: true, destination: "SHA", weight: 600, cls: "GEN", hold: "AFT" },
  ],
  HU7602: [
    { id: "C1", inbound: false, destination: "HGH", weight: 1600, cls: "RFL" },
    { id: "C2", inbound: false, destination: "HGH", weight: 700, cls: "AVI" },
    { id: "C3", inbound: false, destination: "HGH", weight: 500, cls: "GEN" },
    { id: "A1", inbound: true, destination: "SHA", weight: 900, cls: "PER", hold: "FWD" },
  ],
  MF8219: [
    { id: "C1", inbound: false, destination: "SHA", weight: 1200, cls: "GEN" },
    { id: "C2", inbound: false, destination: "SHA", weight: 1000, cls: "PER" },
    { id: "A1", inbound: true, destination: "SHA", weight: 500, cls: "GEN", hold: "FWD" },
    { id: "A2", inbound: true, destination: "SHA", weight: 400, cls: "AVI", hold: "AFT" },
  ],
  "3U8866": [
    { id: "C1", inbound: false, destination: "SZX", weight: 2800, cls: "GEN" },
    { id: "C2", inbound: false, destination: "SZX", weight: 2400, cls: "RFL" },
    { id: "C3", inbound: false, destination: "SZX", weight: 2200, cls: "ROX" },
    { id: "C4", inbound: false, destination: "SZX", weight: 1500, cls: "PER" },
    { id: "C5", inbound: false, destination: "SZX", weight: 3600, cls: "GEN" },
    { id: "A1", inbound: true, destination: "SHA", weight: 1800, cls: "GEN", hold: "FWD" },
    { id: "A2", inbound: true, destination: "SHA", weight: 1200, cls: "PER", hold: "AFT" },
  ],
};
export function initialCargo(flights: Flight[]): CargoBatch[] {
  return flights.flatMap((f) =>
    (manifests[f.id] ?? []).map((seed) => ({
      id: `${f.id}-${seed.id}`,
      flightId: f.id,
      inbound: seed.inbound,
      destination: seed.destination,
      weight: seed.weight,
      cargoClass: seed.cls,
      revenue: revenueFor(seed.weight, seed.cls),
      plan: null,
      location: seed.inbound
        ? { kind: "hold" as const, compartment: seed.hold ?? "FWD" }
        : { kind: "warehouse" as const },
    })),
  );
}
