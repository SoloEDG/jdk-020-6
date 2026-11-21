import type { Shift } from "../../../shared/types";
import { copyShift, record } from "../../../shared/document";
import { flightReady } from "../lib/readiness";
export function assignStand(state: Shift, id: string, standId: string): Shift {
  const s = copyShift(state),
    f = s.flights.find((x) => x.id === id),
    stand = s.stands.find((x) => x.id === standId);
  if (!f || !stand) return state;
  const occupied = s.flights.some(
    (x) => x.standId === standId && x.status !== "departed",
  );
  if (
    f.status !== "incoming" ||
    occupied ||
    (f.size === "wide" && stand.size !== "wide")
  ) {
    s.conflicts++;
    s.score -= 10;
    record(s, "机位指令冲突：请检查尺寸、占用与航班状态", "warning");
    return s;
  }
  f.standId = standId;
  f.status = "parked";
  s.selectedStandId = standId;
  record(s, `${id} 已停靠 ${standId}，可开始保障`, "success");
  return s;
}
export function departFlight(state: Shift, id: string): Shift {
  const s = copyShift(state),
    f = s.flights.find((x) => x.id === id);
  if (!f) return state;
  if (f.status !== "parked" || !flightReady(s, id)) {
    record(s, "离港未获许可：请先完成全部地勤与货运任务", "warning");
    return s;
  }
  f.status = "departing";
  f.departureAt = s.time;
  const delay = Math.max(0, s.time - f.deadline);
  const points = Math.max(20, 120 - Math.floor(delay));
  const loaded = s.cargo.filter(
      (b) =>
        b.flightId === id &&
        !b.inbound &&
        b.plan !== null &&
        b.location.kind === "hold" &&
        b.location.compartment === b.plan,
    ),
    revenue = loaded.reduce((n, b) => n + b.revenue, 0),
    left = s.cargo.filter((b) => b.flightId === id && !b.inbound).length - loaded.length;
  s.score += points + revenue;
  s.cargoRevenue += revenue;
  s.cargo = s.cargo.filter((b) => b.flightId !== id);
  s.cargoMoves = s.cargoMoves.filter((m) => m.flightId !== id);
  record(
    s,
    `${id} 获准推出 · +${points} 分 · 货运收益 +${revenue}${left ? ` · 拉货 ${left} 批` : ""}`,
    "success",
  );
  return s;
}
export function selectFlight(state: Shift, id: string): Shift {
  return {
    ...state,
    selectedFlightId: id,
    selectedStandId: state.flights.find((f) => f.id === id)?.standId,
  };
}
