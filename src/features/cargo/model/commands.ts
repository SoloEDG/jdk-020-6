import type { Shift } from "../../../shared/types";
import { copyShift, record } from "../../../shared/document";
import { cargoSpecs } from "./data";
import { shortId } from "../lib/plan";
export function standWorkLoad(state: Shift, flightId: string): number {
  return (
    state.services.filter(
      (t) =>
        t.flightId === flightId &&
        (t.status === "travel" || t.status === "working"),
    ).length +
    state.vehicles.filter(
      (v) =>
        v.cargoFlightId === flightId &&
        (v.status === "travel" || v.status === "working"),
    ).length
  );
}
export function setPlan(
  state: Shift,
  flightId: string,
  batchId: string,
  compartment: string | null,
): Shift {
  const f = state.flights.find((x) => x.id === flightId);
  if (
    !f ||
    (f.status !== "scheduled" && f.status !== "incoming" && f.status !== "parked")
  )
    return state;
  const s = copyShift(state),
    b = s.cargo.find((x) => x.id === batchId && x.flightId === flightId);
  if (!b || b.inbound || b.plan === compartment) return state;
  const spec = cargoSpecs[f.size];
  if (compartment && !spec.compartments.some((c) => c.id === compartment))
    return state;
  b.plan = compartment;
  const label = compartment
      ? (spec.compartments.find((c) => c.id === compartment)?.label ?? compartment)
      : "",
    rework =
      b.location.kind === "hold" && b.location.compartment !== compartment;
  record(
    s,
    compartment
      ? `${shortId(b)} 计划装入${label}${rework ? " · 已装货，需卸回调整" : ""}`
      : `${shortId(b)} 已拉货${rework ? " · 已装货，需卸回移出" : ""}`,
    rework ? "warning" : "info",
  );
  return s;
}
export function dispatchLoader(
  state: Shift,
  flightId: string,
  vehicleId: string,
): Shift {
  const s = copyShift(state),
    f = s.flights.find((x) => x.id === flightId),
    v = s.vehicles.find((x) => x.id === vehicleId),
    stand = s.stands.find((x) => x.id === f?.standId);
  if (
    !f ||
    f.status !== "parked" ||
    !v ||
    v.kind !== "cargo" ||
    v.status !== "idle" ||
    !stand ||
    standWorkLoad(s, flightId) >= 2
  ) {
    s.conflicts++;
    s.score -= 10;
    record(s, "装载车不可用，或机位的两个服务位均已占用", "warning");
    return s;
  }
  v.status = "travel";
  v.cargoFlightId = flightId;
  v.origin = { ...v.position };
  v.target = { x: stand.x + 42, y: stand.y + 22 };
  v.progress = 0;
  v.tripDuration =
    5 + Math.hypot(v.target.x - v.origin.x, v.target.y - v.origin.y) / 50;
  record(s, `${v.id} → ${flightId} · 货运装卸（起重 ≤${v.liftCapacity}kg）`);
  return s;
}
