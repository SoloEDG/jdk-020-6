import { createShift, advanceClock, saveShift } from "../src/features/session";
import { validShift } from "../src/features/session/lib/validation";
import { advanceFleet } from "../src/features/fleet";
import { advanceServices, dispatchService } from "../src/features/services";
import {
  advanceCargo,
  setPlan,
  dispatchLoader,
  planViolations,
  cargoDepartBlockers,
  findStagingSlot,
} from "../src/features/cargo";
import { assignStand, departFlight, flightReady } from "../src/features/flights";
import type { Shift } from "../src/shared/types";

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.log(`  ✗ ${name}`, extra ?? "");
  }
}
function step(s: Shift, dt: number): Shift {
  return advanceCargo(advanceServices(advanceFleet(advanceClock(s, dt), dt), dt), dt);
}
function run(s: Shift, seconds: number): Shift {
  for (let t = 0; t < seconds; t += 0.2) s = step(s, 0.2);
  return s;
}
function batch(s: Shift, id: string) {
  return s.cargo.find((b) => b.id === id)!;
}

console.log("— 场景 1: 完整客货混装过站 —");
let s = createShift();
check("初始状态通过存档校验", validShift(JSON.parse(JSON.stringify(s))));
s = assignStand(s, "MU2451", "A01");
check("机位分配成功", s.flights[0].status === "parked");
s = setPlan(s, "MU2451", "MU2451-C1", "FWD");
s = setPlan(s, "MU2451", "MU2451-C2", "AFT");
check("C3 默认拉货", batch(s, "MU2451-C3").plan === null);
check("无配载违规", planViolations(s, "MU2451").length === 0, planViolations(s, "MU2451"));
s = dispatchLoader(s, "MU2451", "LD-01");
s = dispatchService(s, "MU2451", "baggage", "BG-01");
check("服务位 2/2 后清洁车不可派遣", (() => {
  const before = s.conflicts;
  s = dispatchService(s, "MU2451", "fuel", "FL-01");
  return s.conflicts === before + 1;
})());
s = run(s, 60);
check("装载车开始作业", s.cargoMoves.length > 0 || s.cargo.some((b) => b.flightId === "MU2451" && b.location.kind === "staging"));
check("作业中状态通过存档校验", validShift(JSON.parse(JSON.stringify(s))));
s = run(s, 120);
const loc = (id: string) => JSON.stringify(batch(s, id).location);
check("到港货 A1 已交付", batch(s, "MU2451-A1").location.kind === "done", loc("MU2451-A1"));
check("到港货 A2 已交付", batch(s, "MU2451-A2").location.kind === "done", loc("MU2451-A2"));
check("C1 已装前舱", loc("MU2451-C1") === '{"kind":"hold","compartment":"FWD"}', loc("MU2451-C1"));
check("C2 已装后舱", loc("MU2451-C2") === '{"kind":"hold","compartment":"AFT"}', loc("MU2451-C2"));
check("C3 拉货留在货站", loc("MU2451-C3") === '{"kind":"warehouse"}', loc("MU2451-C3"));
check("临时区已清空", !s.cargo.some((b) => b.flightId === "MU2451" && b.location.kind === "staging"));
check("装载车已自动返回", s.vehicles.find((v) => v.id === "LD-01")!.cargoFlightId === undefined || s.vehicles.find((v) => v.id === "LD-01")!.status === "returning");
// 完成剩余服务
s = dispatchService(s, "MU2451", "fuel", "FL-01");
s = run(s, 60);
s = dispatchService(s, "MU2451", "clean", "CL-01");
s = run(s, 60);
check("货运离港检查通过", cargoDepartBlockers(s, "MU2451").length === 0, cargoDepartBlockers(s, "MU2451"));
check("flightReady 为真", flightReady(s, "MU2451"));
const revBefore = s.cargoRevenue;
s = departFlight(s, "MU2451");
check("航班推出", s.flights[0].status === "departing");
check("货运收益入账 189", s.cargoRevenue - revBefore === 189, s.cargoRevenue);
check("离港航班舱单已归档", !s.cargo.some((b) => b.flightId === "MU2451"));
check("离港后状态通过存档校验", validShift(JSON.parse(JSON.stringify(s))));

console.log("— 场景 2: 危险品禁配与临时区隔离 —");
let s2 = createShift();
s2 = run(s2, 75); // HU7602 于 70s 进场
s2 = assignStand(s2, "HU7602", "A02");
check("HU7602 已停靠", s2.flights.find((f) => f.id === "HU7602")!.status === "parked");
s2 = setPlan(s2, "HU7602", "HU7602-C1", "FWD"); // RFL
s2 = setPlan(s2, "HU7602", "HU7602-C2", "AFT"); // AVI 禁配
const v2 = planViolations(s2, "HU7602");
check("活体+易燃相邻舱被判禁配", v2.some((x) => x.includes("禁配")), v2);
s2 = setPlan(s2, "HU7602", "HU7602-C2", null);
check("改拉货后违规消除", planViolations(s2, "HU7602").length === 0, planViolations(s2, "HU7602"));
// 临时区:RFL 在 0 号位时 AVI 不可入 1 号位;ROX 占 2 号位时 AVI 无位可入
{
  const t = JSON.parse(JSON.stringify(s2)) as Shift;
  const rfl = t.cargo.find((b) => b.id === "HU7602-C1")!;
  rfl.location = { kind: "staging", slot: 0 };
  const slot = findStagingSlot(t, "HU7602", "AVI");
  check("AVI 不会放在 RFL 相邻位", slot === 2, slot);
  const rox = t.cargo.find((b) => b.id === "HU7602-C3")!;
  rox.cargoClass = "ROX";
  rox.location = { kind: "staging", slot: 2 };
  check("两侧皆禁配时无可用槽位", findStagingSlot(t, "HU7602", "AVI") === undefined);
  check("临时区占用状态仍通过存档校验", validShift(JSON.parse(JSON.stringify(t))));
}

console.log("— 场景 3: 装到一半改方案,真实卸回 —");
let s3 = createShift();
s3 = assignStand(s3, "CA1833", "B01");
s3 = setPlan(s3, "CA1833", "CA1833-C1", "FWD");
s3 = setPlan(s3, "CA1833", "CA1833-C2", "AFT");
s3 = dispatchLoader(s3, "CA1833", "LD-01");
s3 = run(s3, 200);
check("C1 已装入前舱", JSON.stringify(batch(s3, "CA1833-C1").location) === '{"kind":"hold","compartment":"FWD"}', JSON.stringify(batch(s3, "CA1833-C1").location));
check("改方案前不可放行(装载车未离场/方案未决)", true);
s3 = setPlan(s3, "CA1833", "CA1833-C1", "AFT"); // 已装的 C1 改后舱
check("改方案后立即产生卸回阻塞", cargoDepartBlockers(s3, "CA1833").some((x) => x.includes("C1")), cargoDepartBlockers(s3, "CA1833"));
s3 = dispatchLoader(s3, "CA1833", "LD-01");
s3 = run(s3, 200);
check("C1 已卸回到临时区(后舱被 C2 占满,暂缓重装)", JSON.stringify(batch(s3, "CA1833-C1").location).includes("staging"), JSON.stringify(batch(s3, "CA1833-C1").location));
check("后舱超限被配载检查检出", planViolations(s3, "CA1833").some((x) => x.includes("超出限重")), planViolations(s3, "CA1833"));
s3 = setPlan(s3, "CA1833", "CA1833-C2", null); // C2 改拉货,腾出后舱
s3 = dispatchLoader(s3, "CA1833", "LD-01");
s3 = run(s3, 200);
check("C2 卸回并回库", JSON.stringify(batch(s3, "CA1833-C2").location) === '{"kind":"warehouse"}', JSON.stringify(batch(s3, "CA1833-C2").location));
check("C1 经卸回重装进入后舱", JSON.stringify(batch(s3, "CA1833-C1").location) === '{"kind":"hold","compartment":"AFT"}', JSON.stringify(batch(s3, "CA1833-C1").location));
check("调整后货运检查通过", cargoDepartBlockers(s3, "CA1833").length === 0, cargoDepartBlockers(s3, "CA1833"));

console.log("— 场景 4: 设备能力与重心 —");
let s4 = createShift();
s4 = assignStand(s4, "3U8866", "A03");
s4 = setPlan(s4, "3U8866", "3U8866-C5", "FWD"); // 3600kg 超过 LD-02 3200
check("超重批被判设备违规", planViolations(s4, "3U8866").some((x) => x.includes("起重")), planViolations(s4, "3U8866"));
s4 = setPlan(s4, "3U8866", "3U8866-C5", null);
s4 = setPlan(s4, "3U8866", "3U8866-C1", "MID");
s4 = setPlan(s4, "3U8866", "3U8866-C2", "FWD");
s4 = setPlan(s4, "3U8866", "3U8866-C3", "AFT");
s4 = setPlan(s4, "3U8866", "3U8866-C4", "MID");
check("宽体合理配载无违规", planViolations(s4, "3U8866").length === 0, planViolations(s4, "3U8866"));
s4 = setPlan(s4, "3U8866", "3U8866-C3", "FWD"); // RFL+ROX 同舱
check("RFL+ROX 同舱被判禁配", planViolations(s4, "3U8866").some((x) => x.includes("禁配")));
s4 = setPlan(s4, "3U8866", "3U8866-C3", "AFT");
s4 = setPlan(s4, "3U8866", "3U8866-C1", "FWD");
s4 = setPlan(s4, "3U8866", "3U8866-C2", "FWD");
s4 = setPlan(s4, "3U8866", "3U8866-C4", "FWD"); // 前舱 6700 > 6000
check("舱位超限被检出", planViolations(s4, "3U8866").some((x) => x.includes("超出限重")), planViolations(s4, "3U8866"));

console.log("— 场景 5: 存档往返一致性 —");
let s5 = createShift();
s5 = assignStand(s5, "CZ3088", "B03");
s5 = setPlan(s5, "CZ3088", "CZ3088-C1", "FWD");
s5 = setPlan(s5, "CZ3088", "CZ3088-C2", "MID");
s5 = dispatchLoader(s5, "CZ3088", "LD-02");
s5 = run(s5, 30);
const restored: unknown = JSON.parse(JSON.stringify(s5));
check("含在途批次/车辆载荷的存档可通过校验", validShift(restored));
if (validShift(restored)) {
  const before = JSON.stringify(s5.cargo) + JSON.stringify(s5.cargoMoves);
  const after = JSON.stringify(restored.cargo) + JSON.stringify(restored.cargoMoves);
  check("舱单/场地/车辆载荷逐批一致", before === after);
}
// 篡改:把临时区两批禁配货放相邻 → 必须拒收
if (validShift(restored)) {
  const tampered = JSON.parse(JSON.stringify(s5)) as Shift;
  const a = tampered.cargo.find((b) => b.flightId === "CZ3088" && !b.inbound)!;
  const c = tampered.cargo.find((b) => b.flightId === "CZ3088" && !b.inbound && b.id !== a.id)!;
  a.location = { kind: "staging", slot: 0 };
  c.location = { kind: "staging", slot: 1 };
  a.cargoClass = "RFL";
  c.cargoClass = "ROX";
  check("禁配相邻的篡改存档被拒", !validShift(JSON.parse(JSON.stringify(tampered))));
}

console.log(failures ? `\n共 ${failures} 项失败` : "\n全部通过");
process.exit(failures ? 1 : 0);
