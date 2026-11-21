import type { Shift, Vehicle } from "../../../shared/types";
import { copyShift, record } from "../../../shared/document";
import { moveDuration, moveLabels, nextMoveFor, pendingCargoMoves } from "./moves";
import { locationLabel, shortId } from "../lib/plan";
function sendBack(v: Vehicle): void {
  v.status = "returning";
  v.origin = { ...v.position };
  v.target = { x: 850, y: 510 };
  v.progress = 0;
  v.tripDuration = 10;
}
export function advanceCargo(state: Shift, seconds: number): Shift {
  const s = copyShift(state);
  for (const v of s.vehicles) {
    if (v.kind !== "cargo") continue;
    if (v.status === "idle") {
      if (v.cargoFlightId) v.cargoFlightId = undefined;
      continue;
    }
    if (v.status !== "working" || !v.cargoFlightId) continue;
    const f = s.flights.find((x) => x.id === v.cargoFlightId);
    if (!f || f.status !== "parked") {
      sendBack(v);
      continue;
    }
    const active = s.cargoMoves.find((m) => m.vehicleId === v.id);
    if (active) {
      active.progress = Math.min(
        100,
        active.progress + (seconds / active.duration) * 100,
      );
      if (active.progress >= 100) {
        const batch = s.cargo.find((b) => b.id === active.batchId);
        if (batch) {
          batch.location = active.to;
          record(
            s,
            `${v.id} ${moveLabels[active.kind]} ${shortId(batch)} → ${locationLabel(s, batch)}`,
          );
        }
        s.cargoMoves = s.cargoMoves.filter((m) => m.id !== active.id);
        if (
          s.cargoMoves.every((m) => m.flightId !== f.id) &&
          pendingCargoMoves(s, f.id).length === 0
        )
          record(s, `${f.id} 货运装卸完成，舱单与实际一致`, "success");
      }
      continue;
    }
    const next = nextMoveFor(s, f.id, v);
    if (!next) {
      const remaining = pendingCargoMoves(s, f.id);
      if (remaining.length) {
        const heavy = remaining.every(
          (m) => m.batch.weight > (v.liftCapacity ?? 0),
        );
        record(
          s,
          heavy
            ? `${v.id} 无法承担剩余货物（超出起重能力），返回车场`
            : `${v.id} 暂无可执行装卸（场地或舱位受限），返回车场`,
          "warning",
        );
      }
      sendBack(v);
      continue;
    }
    const batch = s.cargo.find((b) => b.id === next.move.batch.id);
    if (!batch) continue;
    batch.location = { kind: "loader", vehicleId: v.id };
    s.cargoMoves.push({
      id: `mv-${batch.id}`,
      flightId: f.id,
      batchId: batch.id,
      kind: next.move.kind,
      to: next.to,
      vehicleId: v.id,
      progress: 0,
      duration: moveDuration(next.move.kind, batch.weight),
    });
  }
  return s;
}
