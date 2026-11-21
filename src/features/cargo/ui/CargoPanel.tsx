import type { Shift } from "../../../shared/types";
import { cargoClasses, cargoSpecs, stagingSlots } from "../model/data";
import {
  cargoDepartBlockers,
  compartmentLabel,
  locationLabel,
  planViolations,
  plannedCG,
  shortId,
} from "../lib/plan";
import { moveLabels, pendingCargoMoves } from "../model/moves";
import { standWorkLoad } from "../model/commands";
export function CargoPanel({
  state,
  onPlan,
  onLoader,
}: {
  state: Shift;
  onPlan: (batchId: string, compartment: string | null) => void;
  onLoader: (vehicleId: string) => void;
}) {
  const f = state.flights.find((x) => x.id === state.selectedFlightId);
  if (!f) return null;
  const spec = cargoSpecs[f.size],
    batches = state.cargo.filter((b) => b.flightId === f.id),
    outbound = batches.filter((b) => !b.inbound),
    inbound = batches.filter((b) => b.inbound),
    planned = outbound.filter((b) => b.plan),
    left = outbound.filter((b) => !b.plan),
    plannedRevenue = planned.reduce((n, b) => n + b.revenue, 0),
    leftRevenue = left.reduce((n, b) => n + b.revenue, 0),
    violations = planViolations(state, f.id),
    blockers = cargoDepartBlockers(state, f.id),
    moves = state.cargoMoves.filter((m) => m.flightId === f.id),
    pending = pendingCargoMoves(state, f.id),
    loaders = state.vehicles.filter((v) => v.kind === "cargo"),
    editable =
      f.status === "scheduled" ||
      f.status === "incoming" ||
      f.status === "parked",
    cg = plannedCG(state, f.id),
    cgOk =
      planned.length > 0 &&
      cg >= spec.envelope[0] &&
      cg <= spec.envelope[1];
  const pct = (v: number) =>
      `${Math.min(100, Math.max(0, ((v - 13) / 4) * 100))}%`,
    compPlanned = (id: string) =>
      planned.filter((b) => b.plan === id).reduce((n, b) => n + b.weight, 0),
    compActual = (id: string) =>
      batches
        .filter(
          (b) => b.location.kind === "hold" && b.location.compartment === id,
        )
        .reduce((n, b) => n + b.weight, 0),
    staged = (slot: number) =>
      batches.find(
        (b) => b.location.kind === "staging" && b.location.slot === slot,
      ),
    busy = standWorkLoad(state, f.id);
  if (f.status === "departed" || f.status === "departing")
    return (
      <div className="cargo-panel">
        <div className="subheading">
          <h3>货运舱单</h3>
          <span>CARGO MANIFEST</span>
        </div>
        <p className="staging-note">货运已随航班结算，舱单归档。</p>
      </div>
    );
  return (
    <div className="cargo-panel">
      <div className="subheading">
        <h3>货运舱单</h3>
        <span>CARGO MANIFEST</span>
      </div>
      <div className="cargo-revenue">
        <div>
          <span>配载收益</span>
          <b>+{plannedRevenue}</b>
        </div>
        <div>
          <span>拉货 {left.length} 批</span>
          <b className="lost">-{leftRevenue}</b>
        </div>
      </div>
      <div className="cg-track" title={`重心包线 ${spec.envelope[0]}–${spec.envelope[1]}m`}>
        <i
          className="cg-envelope"
          style={{
            left: pct(spec.envelope[0]),
            width: `calc(${pct(spec.envelope[1])} - ${pct(spec.envelope[0])})`,
          }}
        />
        {planned.length > 0 && (
          <b
            className={`cg-marker ${cgOk ? "" : "out"}`}
            style={{ left: pct(cg) }}
          />
        )}
      </div>
      <div className="cg-scale">
        <span>13m</span>
        <span className={planned.length && !cgOk ? "warning-text" : ""}>
          {planned.length ? `重心 ${cg.toFixed(2)}m` : "未配载 · 重心 —"}
        </span>
        <span>17m</span>
      </div>
      {spec.compartments.map((c) => {
        const p = compPlanned(c.id),
          a = compActual(c.id);
        return (
          <div className="comp-row" key={c.id}>
            <span>{c.label}</span>
            <div className="comp-track">
              <i
                className={p > c.maxWeight ? "over" : ""}
                style={{ width: `${Math.min(100, (p / c.maxWeight) * 100)}%` }}
              />
              <b style={{ width: `${Math.min(100, (a / c.maxWeight) * 100)}%` }} />
            </div>
            <span>
              {p}/{c.maxWeight}
            </span>
          </div>
        );
      })}
      {violations.length > 0 && (
        <div className="cargo-violations">
          {violations.map((v) => (
            <p key={v}>⚠ {v}</p>
          ))}
        </div>
      )}
      <div className="cargo-list">
        {outbound.map((b) => (
          <div className="cargo-row" key={b.id}>
            <i
              className="cls-dot"
              style={{ background: cargoClasses[b.cargoClass].color }}
              title={cargoClasses[b.cargoClass].label}
            />
            <div className="cargo-main">
              <strong>
                {shortId(b)} → {b.destination} · {b.weight}kg
              </strong>
              <span>
                {cargoClasses[b.cargoClass].label}
                {cargoClasses[b.cargoClass].dangerous ? " · 危险品" : ""} · 收益{" "}
                {b.revenue} · {locationLabel(state, b)}
              </span>
            </div>
            <select
              aria-label={`${shortId(b)} 配载舱位`}
              value={b.plan ?? ""}
              disabled={!editable}
              onChange={(e) => onPlan(b.id, e.target.value || null)}
            >
              <option value="">拉货</option>
              {spec.compartments.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        ))}
        {inbound.map((b) => (
          <div className="cargo-row inbound" key={b.id}>
            <i
              className="cls-dot"
              style={{ background: cargoClasses[b.cargoClass].color }}
            />
            <div className="cargo-main">
              <strong>
                {shortId(b)} 到港 · {b.weight}kg
              </strong>
              <span>
                {cargoClasses[b.cargoClass].label} · {locationLabel(state, b)}
              </span>
            </div>
            <em className="inbound-tag">卸</em>
          </div>
        ))}
      </div>
      <div className="staging">
        <div className="staging-head">
          <span>临时区 · 到港离港共享场地</span>
          <span>
            {
              batches.filter((b) => b.location.kind === "staging").length
            }
            /{stagingSlots} 位
          </span>
        </div>
        <div className="staging-slots">
          {Array.from({ length: stagingSlots }, (_, i) => {
            const b = staged(i);
            return (
              <span
                key={i}
                className={`slot ${b ? "occupied" : ""}`}
                style={
                  b
                    ? {
                        background: cargoClasses[b.cargoClass].color,
                        borderColor: cargoClasses[b.cargoClass].color,
                      }
                    : undefined
                }
                title={b ? `${shortId(b)} · ${cargoClasses[b.cargoClass].label}` : "空位"}
              >
                {b ? shortId(b) : "·"}
              </span>
            );
          })}
        </div>
        <p className="staging-note">禁配货不相邻堆放 · 易燃/氧化/活体互为禁配</p>
      </div>
      <div className="cargo-ops">
        {moves.map((m) => {
          const b = batches.find((x) => x.id === m.batchId);
          return (
            <div className="move-row" key={m.id}>
              {m.vehicleId} {moveLabels[m.kind]} {b ? shortId(b) : ""} ·{" "}
              {Math.floor(m.progress)}%
              <div className="task-track">
                <i style={{ width: `${m.progress}%` }} />
              </div>
            </div>
          );
        })}
        {pending.length > 0 && (
          <p className="pending-note">
            待办 {pending.length} 项：
            {pending
              .slice(0, 4)
              .map((m) => `${moveLabels[m.kind]}${shortId(m.batch)}`)
              .join(" · ")}
            {pending.length > 4 ? " …" : ""}
          </p>
        )}
        {f.status === "parked" && (
          <div className="loader-buttons">
            {loaders.map((v) => {
              const atStand = v.cargoFlightId === f.id && v.status !== "idle";
              return (
                <button
                  key={v.id}
                  disabled={v.status !== "idle" || busy >= 2}
                  title={
                    v.status !== "idle"
                      ? "车辆作业中"
                      : busy >= 2
                        ? "机位服务位已满"
                        : `派遣 ${v.id} 到 ${f.standId}`
                  }
                  onClick={() => onLoader(v.id)}
                >
                  {v.id} ≤{v.liftCapacity}kg
                  <small>
                    {atStand
                      ? v.status === "travel"
                        ? "前往机位"
                        : "作业中"
                      : v.status === "idle"
                        ? "待命 · 派遣"
                        : "返回车场"}
                  </small>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {f.status === "parked" &&
        (blockers.length ? (
          <div className="depart-check blocked">
            <strong>离港货运检查未通过</strong>
            {blockers.slice(0, 4).map((b) => (
              <p key={b}>· {b}</p>
            ))}
            {blockers.length > 4 && <p>· 等 {blockers.length} 项</p>}
          </div>
        ) : (
          <div className="depart-check ok">
            ✓ 舱单与实际装载一致，货运满足放行条件
          </div>
        ))}
    </div>
  );
}
