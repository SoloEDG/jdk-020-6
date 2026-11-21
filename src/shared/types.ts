export type ServiceKind = "baggage" | "fuel" | "clean";
export type VehicleKind = ServiceKind | "cargo";
export type FlightStatus =
  "scheduled" | "incoming" | "parked" | "departing" | "departed";
export interface Point {
  x: number;
  y: number;
}
export interface Flight {
  id: string;
  airline: string;
  from: string;
  destination: string;
  aircraft: string;
  size: "narrow" | "wide";
  arrival: number;
  deadline: number;
  passengers: number;
  status: FlightStatus;
  standId?: string;
  departureAt?: number;
  color: string;
}
export interface Stand extends Point {
  id: string;
  size: "narrow" | "wide";
  terminal: string;
}
export interface Service {
  id: string;
  flightId: string;
  kind: ServiceKind;
  status: "pending" | "travel" | "working" | "done";
  progress: number;
  duration: number;
  vehicleId?: string;
}
export interface Vehicle {
  id: string;
  kind: VehicleKind;
  status: "idle" | "travel" | "working" | "returning";
  position: Point;
  origin: Point;
  target: Point;
  progress: number;
  tripDuration: number;
  serviceId?: string;
  cargoFlightId?: string;
  liftCapacity?: number;
}
export type CargoClass = "GEN" | "PER" | "AVI" | "RFL" | "ROX";
export type CargoLocation =
  | { kind: "warehouse" }
  | { kind: "staging"; slot: number }
  | { kind: "loader"; vehicleId: string }
  | { kind: "hold"; compartment: string }
  | { kind: "done" };
export interface CargoBatch {
  id: string;
  flightId: string;
  inbound: boolean;
  destination: string;
  weight: number;
  cargoClass: CargoClass;
  revenue: number;
  plan: string | null;
  location: CargoLocation;
}
export type CargoMoveKind =
  | "unload"
  | "deliver"
  | "fetch"
  | "load"
  | "offload"
  | "return";
export interface CargoMove {
  id: string;
  flightId: string;
  batchId: string;
  kind: CargoMoveKind;
  to: CargoLocation;
  vehicleId: string;
  progress: number;
  duration: number;
}
export interface Event {
  id: number;
  time: number;
  text: string;
  tone: "info" | "success" | "warning";
}
export interface Shift {
  version: 2;
  time: number;
  paused: boolean;
  speed: 1 | 2 | 4;
  score: number;
  conflicts: number;
  cargoRevenue: number;
  flights: Flight[];
  stands: Stand[];
  services: Service[];
  vehicles: Vehicle[];
  cargo: CargoBatch[];
  cargoMoves: CargoMove[];
  events: Event[];
  selectedFlightId: string;
  selectedStandId?: string;
  selectedVehicleId?: string;
  nextEventId: number;
}
export type CommandResult = (state: Shift) => Shift;
