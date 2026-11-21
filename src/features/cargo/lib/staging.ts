import type { CargoClass, Shift } from "../../../shared/types";
import { classesClash, stagingSlots } from "../model/data";
export interface SlotUse {
  slot: number;
  cargoClass: CargoClass;
}
export function stagingOccupancy(state: Shift, flightId: string): SlotUse[] {
  const used: SlotUse[] = [];
  for (const b of state.cargo) {
    if (b.flightId !== flightId) continue;
    if (b.location.kind === "staging")
      used.push({ slot: b.location.slot, cargoClass: b.cargoClass });
  }
  for (const m of state.cargoMoves) {
    if (m.flightId !== flightId || m.to.kind !== "staging") continue;
    const b = state.cargo.find((x) => x.id === m.batchId);
    if (b) used.push({ slot: m.to.slot, cargoClass: b.cargoClass });
  }
  return used;
}
export function findStagingSlot(
  state: Shift,
  flightId: string,
  cls: CargoClass,
): number | undefined {
  const used = stagingOccupancy(state, flightId);
  for (let slot = 0; slot < stagingSlots; slot++) {
    if (used.some((u) => u.slot === slot)) continue;
    const clash = used.some(
      (u) => Math.abs(u.slot - slot) === 1 && classesClash(u.cargoClass, cls),
    );
    if (!clash) return slot;
  }
  return undefined;
}
