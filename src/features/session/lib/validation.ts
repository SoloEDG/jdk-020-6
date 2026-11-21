import type { Shift } from "../../../shared/types";
import { cargoClasses, cargoSpecs, classesClash, stagingSlots } from "../../cargo";
const serviceKinds = ["fuel", "baggage", "clean"];
const vehicleKinds = [...serviceKinds, "cargo"];
const flightStates = [
  "scheduled",
  "incoming",
  "parked",
  "departing",
  "departed",
];
const serviceStates = ["pending", "travel", "working", "done"];
const vehicleStates = ["idle", "travel", "working", "returning"];
const moveKinds = ["unload", "deliver", "fetch", "load", "offload", "return"];
const classIds = Object.keys(cargoClasses);
type Row = Record<string, unknown>;
function row(value: unknown): value is Row {
  return typeof value === "object" && value !== null;
}
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
function point(value: unknown): boolean {
  return row(value) && finite(value.x) && finite(value.y);
}
function unique(values: Row[]): boolean {
  return (
    values.every((x) => text(x.id)) &&
    new Set(values.map((x) => x.id)).size === values.length
  );
}
function collection(value: unknown, length: number): value is Row[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every(row) &&
    unique(value)
  );
}
function locationShape(value: unknown): value is Row {
  if (!row(value) || !text(value.kind)) return false;
  switch (value.kind) {
    case "warehouse":
    case "done":
      return true;
    case "staging":
      return (
        Number.isInteger(value.slot) &&
        (value.slot as number) >= 0 &&
        (value.slot as number) < stagingSlots
      );
    case "loader":
      return text(value.vehicleId);
    case "hold":
      return text(value.compartment);
    default:
      return false;
  }
}
export function validShift(value: unknown): value is Shift {
  if (
    !row(value) ||
    value.version !== 2 ||
    !finite(value.time) ||
    value.time < 0 ||
    !finite(value.score) ||
    !finite(value.conflicts) ||
    value.conflicts < 0 ||
    !finite(value.cargoRevenue) ||
    value.cargoRevenue < 0 ||
    typeof value.paused !== "boolean" ||
    ![1, 2, 4].includes(value.speed as number) ||
    !finite(value.nextEventId)
  )
    return false;
  if (
    !collection(value.flights, 6) ||
    !collection(value.stands, 6) ||
    !collection(value.vehicles, 8) ||
    !collection(value.services, 18) ||
    !Array.isArray(value.cargo) ||
    value.cargo.length > 60 ||
    !value.cargo.every(row) ||
    !unique(value.cargo as Row[]) ||
    !Array.isArray(value.cargoMoves) ||
    value.cargoMoves.length > 2 ||
    !value.cargoMoves.every(row) ||
    !unique(value.cargoMoves as Row[]) ||
    !Array.isArray(value.events) ||
    value.events.length > 30
  )
    return false;
  const flights = value.flights,
    stands = value.stands,
    vehicles = value.vehicles,
    services = value.services,
    cargo = value.cargo,
    cargoMoves = value.cargoMoves;
  const flightIds = new Set(flights.map((x) => x.id)),
    standIds = new Set(stands.map((x) => x.id)),
    vehicleIds = new Set(vehicles.map((x) => x.id)),
    serviceIds = new Set(services.map((x) => x.id)),
    batchIds = new Set(cargo.map((x) => x.id));
  if (
    !flights.every(
      (f) =>
        text(f.airline) &&
        text(f.from) &&
        text(f.destination) &&
        text(f.aircraft) &&
        ["narrow", "wide"].includes(f.size as string) &&
        flightStates.includes(f.status as string) &&
        finite(f.arrival) &&
        finite(f.deadline) &&
        finite(f.passengers) &&
        f.passengers > 0 &&
        text(f.color) &&
        (f.departureAt === undefined || finite(f.departureAt)) &&
        (f.standId === undefined || standIds.has(f.standId)),
    )
  )
    return false;
  if (
    !stands.every(
      (s) =>
        point(s) &&
        ["narrow", "wide"].includes(s.size as string) &&
        text(s.terminal),
    )
  )
    return false;
  if (
    !vehicles.every(
      (v) =>
        vehicleKinds.includes(v.kind as string) &&
        vehicleStates.includes(v.status as string) &&
        point(v.position) &&
        point(v.origin) &&
        point(v.target) &&
        finite(v.progress) &&
        v.progress >= 0 &&
        v.progress <= 100 &&
        finite(v.tripDuration) &&
        v.tripDuration > 0 &&
        (v.serviceId === undefined ||
          (v.kind !== "cargo" && serviceIds.has(v.serviceId))) &&
        (v.kind === "cargo"
          ? finite(v.liftCapacity) && v.liftCapacity > 0
          : v.liftCapacity === undefined) &&
        (v.cargoFlightId === undefined ||
          (v.kind === "cargo" &&
            flightIds.has(v.cargoFlightId) &&
            ["travel", "working", "returning"].includes(v.status as string))),
    )
  )
    return false;
  if (
    !services.every(
      (s) =>
        flightIds.has(s.flightId) &&
        serviceKinds.includes(s.kind as string) &&
        serviceStates.includes(s.status as string) &&
        finite(s.progress) &&
        s.progress >= 0 &&
        s.progress <= 100 &&
        finite(s.duration) &&
        s.duration > 0 &&
        (s.vehicleId === undefined || vehicleIds.has(s.vehicleId)),
    )
  )
    return false;
  if (
    !flights.every((f) =>
      serviceKinds.every(
        (k) =>
          services.filter((t) => t.flightId === f.id && t.kind === k).length ===
          1,
      ),
    )
  )
    return false;
  const occupied = flights
    .filter((f) => f.status !== "departed" && f.standId !== undefined)
    .map((f) => f.standId);
  if (new Set(occupied).size !== occupied.length) return false;
  if (
    !flights.every(
      (f) =>
        !["parked", "departing", "departed"].includes(f.status as string) ||
        (standIds.has(f.standId) &&
          (f.size === "narrow" ||
            stands.find((s) => s.id === f.standId)?.size === "wide")),
    )
  )
    return false;
  if (
    !services.every((s) => {
      if (s.status === "pending")
        return s.progress === 0 && s.vehicleId === undefined;
      const v = vehicles.find((x) => x.id === s.vehicleId);
      if (!v || v.kind !== s.kind) return false;
      if (s.status === "done") return s.progress === 100;
      return (
        v.serviceId === s.id &&
        v.status === s.status &&
        flights.find((f) => f.id === s.flightId)?.status === "parked"
      );
    })
  )
    return false;
  if (
    !vehicles.every((v) => {
      if (!["travel", "working"].includes(v.status as string)) return true;
      if (v.kind === "cargo") return text(v.cargoFlightId);
      return services.some(
        (s) =>
          s.id === v.serviceId &&
          s.vehicleId === v.id &&
          s.status === v.status,
      );
    })
  )
    return false;
  if (
    !flights.every(
      (f) =>
        services.filter(
          (t) =>
            t.flightId === f.id &&
            ["travel", "working"].includes(t.status as string),
        ).length +
          vehicles.filter(
            (v) =>
              v.cargoFlightId === f.id &&
              ["travel", "working"].includes(v.status as string),
          ).length <=
        2,
    )
  )
    return false;
  if (
    !flights.every(
      (f) =>
        !["departing", "departed"].includes(f.status as string) ||
        services
          .filter((t) => t.flightId === f.id)
          .every((t) => t.status === "done"),
    )
  )
    return false;
  const flightById = (id: unknown) => flights.find((f) => f.id === id),
    compIds = (flightId: unknown) => {
      const f = flightById(flightId);
      return f
        ? cargoSpecs[f.size as "narrow" | "wide"].compartments.map((c) => c.id)
        : [];
    };
  if (
    !cargo.every((b) => {
      const f = flightById(b.flightId);
      if (
        !f ||
        typeof b.inbound !== "boolean" ||
        !text(b.destination) ||
        !finite(b.weight) ||
        b.weight <= 0 ||
        b.weight > 10000 ||
        !classIds.includes(b.cargoClass as string) ||
        !finite(b.revenue) ||
        b.revenue < 0 ||
        !(b.plan === null || compIds(b.flightId).includes(b.plan as string)) ||
        !locationShape(b.location)
      )
        return false;
      const loc = b.location as Row;
      if (b.inbound && loc.kind === "warehouse") return false;
      if (!b.inbound && loc.kind === "done") return false;
      if (loc.kind === "staging") return f.status === "parked";
      if (loc.kind === "loader") {
        const v = vehicles.find((x) => x.id === loc.vehicleId);
        return (
          f.status === "parked" &&
          !!v &&
          v.kind === "cargo" &&
          v.status === "working" &&
          v.cargoFlightId === b.flightId &&
          (b.weight as number) <= (v.liftCapacity as number)
        );
      }
      if (loc.kind === "hold")
        return (
          ["scheduled", "incoming", "parked"].includes(f.status as string) &&
          compIds(b.flightId).includes(loc.compartment as string)
        );
      return true;
    })
  )
    return false;
  if (
    !flights.every((f) => {
      const staged = cargo.filter(
          (b) => b.flightId === f.id && (b.location as Row).kind === "staging",
        ),
        slots = staged.map((b) => (b.location as Row).slot as number);
      if (new Set(slots).size !== slots.length) return false;
      return staged.every((a) =>
        staged.every(
          (b) =>
            a === b ||
            Math.abs(
              ((a.location as Row).slot as number) -
                ((b.location as Row).slot as number),
            ) !== 1 ||
            !classesClash(
              a.cargoClass as never,
              b.cargoClass as never,
            ),
        ),
      );
    })
  )
    return false;
  if (
    !cargoMoves.every((m) => {
      const b = cargo.find((x) => x.id === m.batchId),
        v = vehicles.find((x) => x.id === m.vehicleId),
        f = flightById(m.flightId);
      if (
        !b ||
        !v ||
        !f ||
        b.flightId !== m.flightId ||
        !moveKinds.includes(m.kind as string) ||
        !locationShape(m.to) ||
        !finite(m.progress) ||
        m.progress < 0 ||
        m.progress > 100 ||
        !finite(m.duration) ||
        m.duration <= 0
      )
        return false;
      const loc = b.location as Row,
        to = m.to as Row;
      if (
        loc.kind !== "loader" ||
        loc.vehicleId !== m.vehicleId ||
        v.cargoFlightId !== m.flightId ||
        v.status !== "working"
      )
        return false;
      if (to.kind === "hold" && !compIds(m.flightId).includes(to.compartment as string))
        return false;
      if (to.kind === "staging") {
        const clashWithBatch = cargo.some(
          (x) =>
            x.flightId === m.flightId &&
            (x.location as Row).kind === "staging" &&
            (x.location as Row).slot === to.slot,
        );
        const clashWithMove = cargoMoves.some(
          (x) =>
            x !== m &&
            x.flightId === m.flightId &&
            (x.to as Row).kind === "staging" &&
            (x.to as Row).slot === to.slot,
        );
        if (clashWithBatch || clashWithMove) return false;
      }
      return true;
    })
  )
    return false;
  if (
    !cargo.every((b) => {
      const loc = b.location as Row;
      if (loc.kind !== "loader") return true;
      return cargoMoves.some(
        (m) => m.batchId === b.id && m.vehicleId === loc.vehicleId,
      );
    })
  )
    return false;
  if (new Set(cargoMoves.map((m) => m.batchId)).size !== cargoMoves.length)
    return false;
  if (
    !value.events.every(
      (e) =>
        row(e) &&
        finite(e.id) &&
        finite(e.time) &&
        text(e.text) &&
        ["info", "success", "warning"].includes(e.tone as string),
    )
  )
    return false;
  const events = value.events as Row[];
  if (
    new Set(events.map((e) => e.id)).size !== events.length ||
    events.some((e) => (e.id as number) >= (value.nextEventId as number))
  )
    return false;
  return (
    flightIds.has(value.selectedFlightId) &&
    (value.selectedStandId === undefined ||
      standIds.has(value.selectedStandId)) &&
    (value.selectedVehicleId === undefined ||
      vehicleIds.has(value.selectedVehicleId)) &&
    batchIds.size === cargo.length
  );
}
