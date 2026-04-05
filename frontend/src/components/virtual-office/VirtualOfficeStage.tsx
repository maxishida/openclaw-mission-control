"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { buildVirtualOfficeLayout, type VirtualOfficeDerivedState } from "@/lib/virtual-office";

type VirtualOfficeStageProps = {
  derived: VirtualOfficeDerivedState;
  onSelectAgent: (agentId: string) => void;
  selectedAgentId: string | null;
};

const laneLabels = {
  build: "Build lane",
  lead: "Lead desk",
  monitor: "Monitor",
  publish: "Release desk",
  research: "Research",
  review: "Review desk",
} as const;

const statusLabel = (status: string) => {
  switch (status) {
    case "working":
      return "Working";
    case "delivering":
      return "Handoff";
    case "done":
      return "Done";
    case "checkpoint":
      return "Waiting";
    case "retry":
      return "Retry";
    case "error":
      return "Blocked";
    case "monitoring":
      return "Watching";
    default:
      return "Idle";
  }
};

const statusTone = (status: string) => {
  switch (status) {
    case "working":
      return {
        badge: "bg-sky-500/15 text-sky-100",
        border: "border-sky-400/35",
        glow: "shadow-[0_0_24px_rgba(56,189,248,0.28)]",
        dot: "#7cc4ff",
      };
    case "delivering":
      return {
        badge: "bg-cyan-500/15 text-cyan-100",
        border: "border-cyan-400/35",
        glow: "shadow-[0_0_24px_rgba(34,211,238,0.24)]",
        dot: "#9fd7ff",
      };
    case "done":
      return {
        badge: "bg-emerald-500/15 text-emerald-100",
        border: "border-emerald-400/35",
        glow: "shadow-[0_0_24px_rgba(34,197,94,0.24)]",
        dot: "#79cf9d",
      };
    case "checkpoint":
      return {
        badge: "bg-amber-500/15 text-amber-100",
        border: "border-amber-300/35",
        glow: "shadow-[0_0_24px_rgba(245,158,11,0.22)]",
        dot: "#dfc36f",
      };
    case "retry":
      return {
        badge: "bg-orange-500/15 text-orange-100",
        border: "border-orange-300/35",
        glow: "shadow-[0_0_24px_rgba(249,115,22,0.22)]",
        dot: "#e4a86a",
      };
    case "error":
      return {
        badge: "bg-rose-500/15 text-rose-100",
        border: "border-rose-300/35",
        glow: "shadow-[0_0_24px_rgba(244,63,94,0.24)]",
        dot: "#de7f79",
      };
    case "monitoring":
      return {
        badge: "bg-teal-500/15 text-teal-100",
        border: "border-teal-300/35",
        glow: "shadow-[0_0_24px_rgba(45,212,191,0.18)]",
        dot: "#89d0cc",
      };
    default:
      return {
        badge: "bg-white/8 text-slate-200",
        border: "border-white/10",
        glow: "",
        dot: "#96a3bd",
      };
  }
};

const signalTone = (accent: "info" | "warning" | "neutral" | "success") => {
  if (accent === "info") {
    return "border-sky-300/30 bg-sky-500/12 text-sky-100";
  }
  if (accent === "warning") {
    return "border-amber-300/30 bg-amber-500/12 text-amber-100";
  }
  if (accent === "success") {
    return "border-emerald-300/30 bg-emerald-500/12 text-emerald-100";
  }
  return "border-white/10 bg-white/6 text-slate-100";
};

export function VirtualOfficeStage({
  derived,
  onSelectAgent,
  selectedAgentId,
}: VirtualOfficeStageProps) {
  const [zoom, setZoom] = useState(1);
  const layout = useMemo(() => buildVirtualOfficeLayout(derived.agents), [derived.agents]);
  const focusedAgent =
    derived.agents.find((agent) => agent.id === selectedAgentId) ??
    derived.attention_agents[0] ??
    derived.agents[0] ??
    null;
  const selectedAgent = focusedAgent?.id ?? null;

  const minimapViewport = useMemo(() => {
    const width = 170 / zoom;
    const height = 104 / zoom;
    const x = (layout.stageW - width) / 2;
    const y = (layout.stageH - height) / 2;
    return { height, width, x, y };
  }, [layout.stageH, layout.stageW, zoom]);

  return (
    <section className="galaxy-card rounded-[32px] p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
            Virtual Office
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Live board choreography</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-sky-300/30 hover:bg-white/10"
            onClick={() => setZoom((current) => Math.max(0.7, Number((current - 0.1).toFixed(2))))}
          >
            -
          </button>
          <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs font-medium text-slate-200">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-sky-300/30 hover:bg-white/10"
            onClick={() => setZoom((current) => Math.min(1.55, Number((current + 0.1).toFixed(2))))}
          >
            +
          </button>
          <button
            type="button"
            className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-fuchsia-300/30 hover:bg-white/10"
            onClick={() => setZoom(1)}
          >
            Fit
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-[28px] border border-white/10 bg-[#080b18]/80 p-3">
        <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(125,55,200,0.18),_transparent_34%),linear-gradient(180deg,_rgba(19,24,35,0.98),_rgba(10,14,24,0.98))]">
          <div className="absolute left-3 top-3 z-20 flex max-w-[min(100%,24rem)] flex-col gap-3">
            <div className="rounded-[20px] border border-white/10 bg-[#0b111a]/80 px-4 py-3 shadow-[0_18px_38px_rgba(0,0,0,0.2)] backdrop-blur-xl">
              <p className="text-[10px] uppercase tracking-[0.26em] text-slate-500">Live Signals</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className={`rounded-2xl border px-3 py-2 ${signalTone("info")}`}>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Active</p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {derived.signals.active_count}
                  </p>
                </div>
                <div className={`rounded-2xl border px-3 py-2 ${signalTone("warning")}`}>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Attention</p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {derived.signals.attention_count}
                  </p>
                </div>
                <div className={`rounded-2xl border px-3 py-2 ${signalTone("neutral")}`}>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Watching</p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {derived.signals.watching_count}
                  </p>
                </div>
                <div className={`rounded-2xl border px-3 py-2 ${signalTone("success")}`}>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Handoffs</p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {derived.signals.delivery_count}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-300">
                <span>{derived.signals.completed_count} tasks complete</span>
                <span>
                  {derived.handoff
                    ? `${derived.handoff.from} -> ${derived.handoff.to}`
                    : "No active handoff"}
                </span>
              </div>
            </div>

            {focusedAgent ? (
              <div
                className={`rounded-[20px] border bg-[#0b111a]/80 px-4 py-3 shadow-[0_18px_38px_rgba(0,0,0,0.2)] backdrop-blur-xl ${statusTone(focusedAgent.status).border}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.26em] text-slate-500">
                    <span>{focusedAgent.glyph}</span>
                    <span>Focused agent</span>
                  </div>
                  <Badge className={statusTone(focusedAgent.status).badge}>
                    {statusLabel(focusedAgent.status)}
                  </Badge>
                </div>
                <p className="mt-3 text-lg font-semibold text-white">{focusedAgent.name}</p>
                <p className="mt-1 text-sm text-slate-300">{focusedAgent.role}</p>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  {focusedAgent.task_label
                    ? `${statusLabel(focusedAgent.status)} around ${focusedAgent.task_label}.`
                    : "Standing by for the next board instruction."}
                </p>
                {focusedAgent.deliver_to ? (
                  <p className="mt-3 text-xs text-cyan-100">
                    Route: <span className="font-semibold">{focusedAgent.deliver_to}</span>
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {derived.attention_agents.length > 0 ? (
            <div className="absolute bottom-3 left-3 z-20 w-[min(100%-1.5rem,19rem)] rounded-[20px] border border-amber-300/25 bg-[rgba(20,16,10,0.72)] px-3 py-3 shadow-[0_18px_38px_rgba(0,0,0,0.2)] backdrop-blur-xl">
              <p className="text-[10px] uppercase tracking-[0.26em] text-slate-500">
                Attention Queue
              </p>
              <div className="mt-3 space-y-2">
                {derived.attention_agents.slice(0, 4).map((agent) => {
                  const tone = statusTone(agent.status);
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => onSelectAgent(agent.id)}
                      className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left transition hover:translate-x-0.5 ${tone.border} ${tone.glow} ${
                        selectedAgent === agent.id ? "bg-white/10" : "bg-white/[0.03]"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="text-base">{agent.glyph}</span>
                        <span className="truncate text-sm font-medium text-white">{agent.name}</span>
                      </span>
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-200">
                        {statusLabel(agent.status)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="relative min-h-[540px] overflow-hidden">
            <div className="absolute inset-0 opacity-35">
              <div className="galaxy-grid h-full w-full" />
            </div>

            <div className="absolute inset-0 flex items-center justify-center p-10">
              <div
                className="relative"
                style={{
                  height: layout.stageH,
                  transform: `scale(${zoom})`,
                  transformOrigin: "center center",
                  transition: "transform 220ms ease",
                  width: layout.stageW,
                }}
              >
                <div
                  className="absolute rounded-[38px] border border-white/10 bg-[linear-gradient(180deg,rgba(21,31,48,0.92),rgba(11,16,27,0.94))] shadow-[0_20px_60px_rgba(4,8,26,0.46)]"
                  style={{
                    height: layout.floorH,
                    left: layout.floorX,
                    top: layout.floorY,
                    width: layout.floorW,
                  }}
                >
                  <div className="absolute inset-5 rounded-[30px] border border-dashed border-white/10" />
                  <div className="absolute inset-x-10 top-[24%] h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
                  <div className="absolute inset-x-10 top-[56%] h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
                  <div className="absolute left-[33%] top-8 bottom-8 w-px bg-gradient-to-b from-transparent via-white/12 to-transparent" />
                  <div className="absolute left-[66%] top-8 bottom-8 w-px bg-gradient-to-b from-transparent via-white/12 to-transparent" />

                  {Object.entries(laneLabels).map(([lane, label]) => {
                    const anchor = layout.positionedAgents.find(
                      (item) => item.agent.lane === lane,
                    );
                    if (!anchor) return null;
                    return (
                      <div
                         key={lane}
                         className="absolute -translate-x-1/2 rounded-full border border-white/10 bg-[#0d1220]/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400"
                         style={{
                          left: anchor.centerX - layout.floorX,
                          top: anchor.centerY - layout.floorY - 62,
                         }}
                       >
                         {label}
                       </div>
                    );
                  })}
                </div>

                {layout.positionedAgents.map((positionedAgent) => {
                  const tone = statusTone(positionedAgent.agent.status);
                  return (
                    <button
                      key={positionedAgent.agent.id}
                      type="button"
                      onClick={() => onSelectAgent(positionedAgent.agent.id)}
                      className={`absolute flex h-[88px] w-[88px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-[26px] border bg-[#0d1322]/90 text-center transition duration-300 hover:-translate-y-[calc(50%+2px)] hover:border-fuchsia-300/35 ${
                        tone.border
                      } ${tone.glow} ${selectedAgent === positionedAgent.agent.id ? "ring-2 ring-fuchsia-300/35" : ""}`}
                      style={{
                        left: positionedAgent.centerX,
                        top: positionedAgent.centerY,
                      }}
                    >
                      <span className="text-2xl">{positionedAgent.agent.glyph}</span>
                      <span className="mt-1 max-w-[72px] truncate text-[11px] font-semibold text-white">
                        {positionedAgent.agent.name}
                      </span>
                      <span className="mt-1 text-[9px] uppercase tracking-[0.24em] text-slate-400">
                        {statusLabel(positionedAgent.agent.status)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="absolute bottom-3 right-3 z-20 rounded-[18px] border border-white/10 bg-[#141a25]/92 px-3 py-3 shadow-[0_18px_38px_rgba(0,0,0,0.2)]">
              <p className="mb-2 text-[10px] uppercase tracking-[0.24em] text-slate-500">Mini map</p>
              <svg width="186" height="120" role="img" aria-label="Virtual office minimap">
                <rect
                  x="8"
                  y="8"
                  width="170"
                  height="104"
                  rx="14"
                  fill="#0f1724"
                  stroke="rgba(255,255,255,0.08)"
                />
                <rect
                  x={8 + (layout.floorX / layout.stageW) * 170}
                  y={8 + (layout.floorY / layout.stageH) * 104}
                  width={(layout.floorW / layout.stageW) * 170}
                  height={(layout.floorH / layout.stageH) * 104}
                  rx="9"
                  fill="#293549"
                  stroke="rgba(255,255,255,0.18)"
                />
                {layout.positionedAgents.map((positionedAgent) => (
                  <circle
                    key={positionedAgent.agent.id}
                    cx={8 + (positionedAgent.centerX / layout.stageW) * 170}
                    cy={8 + (positionedAgent.centerY / layout.stageH) * 104}
                    r={selectedAgent === positionedAgent.agent.id ? 3.6 : 2.5}
                    fill={statusTone(positionedAgent.agent.status).dot}
                  />
                ))}
                <rect
                  x={8 + (minimapViewport.x / layout.stageW) * 170}
                  y={8 + (minimapViewport.y / layout.stageH) * 104}
                  width={(minimapViewport.width / layout.stageW) * 170}
                  height={(minimapViewport.height / layout.stageH) * 104}
                  rx="6"
                  fill="none"
                  stroke="#7be0b7"
                  strokeWidth="1.2"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
