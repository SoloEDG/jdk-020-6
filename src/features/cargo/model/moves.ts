import type {
  CargoBatch,
  CargoLocation,
  CargoMoveKind,
  Shift,
  Vehicle,
} from "../../../shared/types";
import { cargoSpecs } from "./data";
import { findStagingSlot } from "../lib/staging";
export interface DerivedMove {
  batch: CargoBatch;
  kind: CargoMoveKind;
}
export const moveLabels: Record<CargoMoveKind, string> = {
  unload: "卸机",
  deliver: "提走",
  fetch: "出库",
  load: "装机",
  offload: "卸回",
  return: "回库",
};
export function moveDuration(kind: CargoMoveKind, weight: number): number {
  return kind === "deliver" || kind === "return"
    ? 6
    : Math.round((5 + weight / 350) * 10) / 10;
}
export function pendingCargoMoves(state: Shift, flightId: string): DerivedMove[] {
  const batches = state.cargo.filter(
      (b) => b.flightId === flightId && b.location.kind !== "loader",
    ),
    inbound = batches.filter((b) => b.inbound),
    outbound = batches.filter((b) => !b.inbound),
    list: DerivedMove[] = [];
  const push = (batch: CargoBatch, kind: CargoMoveKind) =>
    list.push({ batch, kind });
  for (const b of inbound) if (b.location.kind === "staging") push(b, "deliver");
  for (const b of outbound)
    if (b.location.kind === "staging" && !b.plan) push(b, "return");
  for (const b of outbound)
    if (b.location.kind === "hold" && b.plan !== b.location.compartment)
      push(b, "offload");
  for (const b of inbound) if (b.location.kind === "hold") push(b, "unload");
  for (const b of outbound)
    if (b.location.kind === "staging" && b.plan) push(b, "load");
  for (const b of outbound)
    if (b.location.kind === "warehouse" && b.plan) push(b, "fetch");
  return list;
}
export function moveTarget(
  state: Shift,
  flightId: string,
  move: DerivedMove,
): CargoLocation | undefined {
  const f = state.flights.find((x) => x.id === flightId);
  if (!f) return undefined;
  switch (move.kind) {
    case "deliver":
      return { kind: "done" };
    case "return":
      return { kind: "warehouse" };
    case "unload":
    case "offload":
    case "fetch": {
      const slot = findStagingSlot(state, flightId, move.batch.cargoClass);
      return slot === undefined ? undefined : { kind: "staging", slot };
    }
    case "load": {
      const spec = cargoSpecs[f.size],
        comp = spec.compartments.find((c) => c.id === move.batch.plan);
      if (!comp || move.batch.weight > comp.maxPiece) return undefined;
      const inHold = state.cargo
          .filter(
            (b) =>
              b.flightId === flightId &&
              b.location.kind === "hold" &&
              b.location.compartment === comp.id,
          )
          .reduce((n, b) => n + b.weight, 0),
        incoming = state.cargoMoves
          .filter(
            (m) =>
              m.flightId === flightId &&
              m.to.kind === "hold" &&
              m.to.compartment === comp.id,
          )
          .reduce(
            (n, m) =>
              n + (state.cargo.find((b) => b.id === m.batchId)?.weight ?? 0),
            0,
          );
      if (inHold + incoming + move.batch.weight > comp.maxWeight)
        return undefined;
      return { kind: "hold", compartment: comp.id };
    }
  }
}
export function nextMoveFor(
  state: Shift,
  flightId: string,
  vehicle: Vehicle,
): { move: DerivedMove; to: CargoLocation } | undefined {
  for (const move of pendingCargoMoves(state, flightId)) {
    if (move.batch.weight > (vehicle.liftCapacity ?? 0)) continue;
    const to = moveTarget(state, flightId, move);
    if (to) return { move, to };
  }
  return undefined;
}
