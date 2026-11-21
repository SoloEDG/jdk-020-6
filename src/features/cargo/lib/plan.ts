import type { CargoBatch, Shift } from "../../../shared/types";
import { cargoSpecs, classesClash } from "../model/data";
export function shortId(batch: CargoBatch): string {
  return batch.id.split("-")[1] ?? batch.id;
}
export function compartmentLabel(state: Shift, flightId: string, id: string): string {
  const f = state.flights.find((x) => x.id === flightId);
  if (!f) return id;
  return (
    cargoSpecs[f.size].compartments.find((c) => c.id === id)?.label ?? id
  );
}
export function locationLabel(state: Shift, b: CargoBatch): string {
  switch (b.location.kind) {
    case "warehouse":
      return "货站";
    case "staging":
      return `临时区${b.location.slot + 1}号位`;
    case "loader":
      return `${b.location.vehicleId}上`;
    case "hold":
      return compartmentLabel(state, b.flightId, b.location.compartment);
    case "done":
      return "已交付";
  }
}
export function plannedCG(state: Shift, flightId: string): number {
  const f = state.flights.find((x) => x.id === flightId);
  if (!f) return 0;
  const spec = cargoSpecs[f.size],
    planned = state.cargo.filter(
      (b) => b.flightId === flightId && !b.inbound && b.plan,
    );
  const moment = planned.reduce(
      (n, b) =>
        n +
        b.weight *
          (spec.compartments.find((c) => c.id === b.plan)?.arm ?? spec.baseArm),
      spec.baseWeight * spec.baseArm,
    ),
    total = planned.reduce((n, b) => n + b.weight, spec.baseWeight);
  return moment / total;
}
export function planViolations(state: Shift, flightId: string): string[] {
  const f = state.flights.find((x) => x.id === flightId);
  if (!f) return [];
  const spec = cargoSpecs[f.size],
    planned = state.cargo.filter(
      (b) => b.flightId === flightId && !b.inbound && b.plan,
    ),
    out: string[] = [];
  for (const c of spec.compartments) {
    const inComp = planned.filter((b) => b.plan === c.id),
      w = inComp.reduce((n, b) => n + b.weight, 0);
    if (w > c.maxWeight)
      out.push(`${c.label}计划 ${w}kg，超出限重 ${c.maxWeight}kg`);
    for (const b of inComp)
      if (b.weight > c.maxPiece)
        out.push(
          `${shortId(b)} ${b.weight}kg 超过${c.label}单件上限 ${c.maxPiece}kg`,
        );
  }
  for (let i = 0; i < spec.compartments.length; i++)
    for (let j = i; j < spec.compartments.length && j <= i + 1; j++)
      for (const a of planned.filter((b) => b.plan === spec.compartments[i].id))
        for (const b of planned.filter(
          (x) => x.plan === spec.compartments[j].id,
        )) {
          if (a === b) continue;
          if (classesClash(a.cargoClass, b.cargoClass))
            out.push(
              `禁配：${shortId(a)} 与 ${shortId(b)} 不得同舱或相邻舱`,
            );
        }
  const cg = plannedCG(state, flightId);
  if (planned.length && (cg < spec.envelope[0] || cg > spec.envelope[1]))
    out.push(
      `重心 ${cg.toFixed(2)}m 超出包线 ${spec.envelope[0]}–${spec.envelope[1]}m`,
    );
  const maxLift = Math.max(
    ...state.vehicles.filter((v) => v.kind === "cargo").map((v) => v.liftCapacity ?? 0),
  );
  for (const b of planned)
    if (b.weight > maxLift)
      out.push(`${shortId(b)} ${b.weight}kg 超出全部装载车起重能力`);
  return out;
}
export function cargoDepartBlockers(state: Shift, flightId: string): string[] {
  const f = state.flights.find((x) => x.id === flightId);
  if (!f || f.status !== "parked") return [];
  const out: string[] = [...planViolations(state, flightId)];
  for (const b of state.cargo.filter((x) => x.flightId === flightId)) {
    const id = shortId(b);
    if (b.inbound) {
      if (b.location.kind !== "done")
        out.push(`到港货 ${id} 未交付（当前在${locationLabel(state, b)}）`);
    } else if (b.plan) {
      if (b.location.kind !== "hold" || b.location.compartment !== b.plan)
        out.push(
          `${id} 应装${compartmentLabel(state, flightId, b.plan)}，实际在${locationLabel(state, b)}`,
        );
    } else if (b.location.kind !== "warehouse")
      out.push(`${id} 已拉货，需从${locationLabel(state, b)}移出`);
  }
  if (state.cargoMoves.some((m) => m.flightId === flightId))
    out.push("装卸作业仍在进行");
  const loader = state.vehicles.find(
    (v) =>
      v.cargoFlightId === flightId &&
      (v.status === "travel" || v.status === "working"),
  );
  if (loader) out.push(`${loader.id} 尚未离开机位`);
  return out;
}
