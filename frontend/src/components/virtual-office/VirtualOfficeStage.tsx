"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { buildPixelAgentSprite } from "@/lib/virtual-office-pixel";
import { buildVirtualOfficeLayout, type VirtualOfficeDerivedState } from "@/lib/virtual-office";

type VirtualOfficeStageProps = {
  boardKey?: string | null;
  derived: VirtualOfficeDerivedState;
  onSelectAgent: (agentId: string) => void;
  selectedAgentId: string | null;
};

type LayoutPreset = "atlas" | "broadcast" | "lab";

const STORAGE_KEY_PREFIX = "prompthub.virtual-office.layout";

const laneLabels = {
  build: "Build bay",
  lead: "Lead desk",
  monitor: "Control room",
  publish: "Release booth",
  research: "Research pod",
  review: "Review station",
} as const;

const OFFICE_LAYOUT_PRESETS: Record<
  LayoutPreset,
  {
    accent: string;
    floor: string;
    glow: string;
    label: string;
    line: string;
    panel: string;
    tag: string;
    furniture: Array<{
      h: number;
      rotate?: number;
      tone: "plant" | "rack" | "screen" | "seat";
      w: number;
      x: number;
      y: number;
    }>;
  }
> = {
  atlas: {
    accent: "#a8f0d1",
    floor:
      "linear-gradient(180deg, rgba(19,31,54,0.96) 0%, rgba(11,18,31,0.98) 100%), repeating-linear-gradient(90deg, rgba(255,255,255,0.02) 0 30px, transparent 30px 60px)",
    glow: "0 0 42px rgba(125, 221, 182, 0.14)",
    label: "Atlas grid",
    line: "rgba(168,240,209,0.24)",
    panel: "rgba(8, 15, 29, 0.78)",
    tag: "#a8f0d1",
    furniture: [
      { h: 48, tone: "rack", w: 124, x: 42, y: 38 },
      { h: 44, tone: "screen", w: 88, x: 208, y: 52 },
      { h: 40, tone: "seat", w: 58, x: 560, y: 56 },
      { h: 38, tone: "plant", w: 42, x: 734, y: 72 },
      { h: 48, tone: "rack", w: 124, x: 640, y: 344 },
      { h: 44, rotate: -2, tone: "screen", w: 88, x: 132, y: 332 },
    ],
  },
  broadcast: {
    accent: "#fff4a1",
    floor:
      "linear-gradient(180deg, rgba(42,19,48,0.96) 0%, rgba(20,10,26,0.98) 100%), repeating-linear-gradient(0deg, rgba(255,255,255,0.02) 0 34px, transparent 34px 68px)",
    glow: "0 0 52px rgba(255, 190, 120, 0.14)",
    label: "Broadcast lounge",
    line: "rgba(255,244,161,0.22)",
    panel: "rgba(22, 11, 29, 0.8)",
    tag: "#fff4a1",
    furniture: [
      { h: 52, tone: "screen", w: 104, x: 96, y: 66 },
      { h: 52, rotate: 1, tone: "rack", w: 128, x: 272, y: 54 },
      { h: 40, tone: "plant", w: 40, x: 458, y: 60 },
      { h: 46, tone: "seat", w: 64, x: 658, y: 66 },
      { h: 52, tone: "screen", w: 102, x: 732, y: 320 },
      { h: 40, tone: "plant", w: 40, x: 210, y: 344 },
    ],
  },
  lab: {
    accent: "#7cc4ff",
    floor:
      "linear-gradient(180deg, rgba(14,24,32,0.97) 0%, rgba(7,13,20,0.99) 100%), radial-gradient(circle at top left, rgba(124,196,255,0.08), transparent 40%)",
    glow: "0 0 56px rgba(124, 196, 255, 0.12)",
    label: "Operator lab",
    line: "rgba(124,196,255,0.22)",
    panel: "rgba(8, 14, 22, 0.82)",
    tag: "#7cc4ff",
    furniture: [
      { h: 48, tone: "rack", w: 120, x: 60, y: 50 },
      { h: 42, tone: "screen", w: 86, x: 232, y: 58 },
      { h: 42, tone: "seat", w: 62, x: 408, y: 62 },
      { h: 42, tone: "screen", w: 84, x: 604, y: 56 },
      { h: 42, tone: "plant", w: 38, x: 760, y: 52 },
      { h: 48, tone: "rack", w: 120, x: 660, y: 344 },
    ],
  },
};

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
        glow: "shadow-[0_0_26px_rgba(56,189,248,0.28)]",
      };
    case "delivering":
      return {
        badge: "bg-cyan-500/15 text-cyan-100",
        border: "border-cyan-400/35",
        glow: "shadow-[0_0_26px_rgba(34,211,238,0.22)]",
      };
    case "done":
      return {
        badge: "bg-emerald-500/15 text-emerald-100",
        border: "border-emerald-400/35",
        glow: "shadow-[0_0_26px_rgba(34,197,94,0.22)]",
      };
    case "checkpoint":
      return {
        badge: "bg-amber-500/15 text-amber-100",
        border: "border-amber-300/35",
        glow: "shadow-[0_0_26px_rgba(245,158,11,0.22)]",
      };
    case "retry":
      return {
        badge: "bg-orange-500/15 text-orange-100",
        border: "border-orange-300/35",
        glow: "shadow-[0_0_26px_rgba(249,115,22,0.22)]",
      };
    case "error":
      return {
        badge: "bg-rose-500/15 text-rose-100",
        border: "border-rose-300/35",
        glow: "shadow-[0_0_26px_rgba(244,63,94,0.24)]",
      };
    case "monitoring":
      return {
        badge: "bg-teal-500/15 text-teal-100",
        border: "border-teal-300/35",
        glow: "shadow-[0_0_26px_rgba(45,212,191,0.18)]",
      };
    default:
      return {
        badge: "bg-white/8 text-slate-200",
        border: "border-white/10",
        glow: "",
      };
  }
};

const signalTone = (accent: "info" | "warning" | "neutral" | "success") => {
  if (accent === "info") return "border-sky-300/30 bg-sky-500/12 text-sky-100";
  if (accent === "warning") return "border-amber-300/30 bg-amber-500/12 text-amber-100";
  if (accent === "success") return "border-emerald-300/30 bg-emerald-500/12 text-emerald-100";
  return "border-white/10 bg-white/6 text-slate-100";
};

const getAgentBubble = (status: string, taskLabel?: string | null, deliverTo?: string | null) => {
  if (status === "checkpoint") return "Waiting on checkpoint";
  if (status === "error") return "Needs operator input";
  if (status === "retry") return "Reworking current pass";
  if (status === "delivering" && deliverTo) return `Route to ${deliverTo}`;
  if (status === "working" && taskLabel) return taskLabel;
  if (status === "monitoring") return "Watching live signals";
  return null;
};

const resolveStoredPreset = (value: string | null | undefined): LayoutPreset =>
  value && Object.prototype.hasOwnProperty.call(OFFICE_LAYOUT_PRESETS, value)
    ? (value as LayoutPreset)
    : "atlas";

function PixelSprite({
  selected,
  sprite,
}: {
  selected: boolean;
  sprite: ReturnType<typeof buildPixelAgentSprite>;
}) {
  return (
    <div
      className={`pixel-sprite-frame ${selected ? "ring-2 ring-[#fff4a1]" : ""}`}
      style={{
        background: sprite.background,
        borderColor: sprite.frame,
        boxShadow: `0 0 0 2px rgba(3,7,18,0.95), 0 0 24px ${sprite.glow}`,
      }}
    >
      <div
        className="grid"
        style={{
          gap: 1,
          gridTemplateColumns: `repeat(${sprite.size}, minmax(0, 1fr))`,
        }}
      >
        {sprite.cells.map((cell, index) => (
          <span
            key={index}
            className="h-2.5 w-2.5"
            style={{
              background: cell,
              boxShadow: cell === "transparent" ? "none" : "inset 0 0 0 1px rgba(255,255,255,0.08)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function VirtualOfficeStage({
  boardKey,
  derived,
  onSelectAgent,
  selectedAgentId,
}: VirtualOfficeStageProps) {
  const normalizedBoardKey = boardKey || "global";
  const [zoom, setZoom] = useState(1);
  const [layoutState, setLayoutState] = useState<{
    boardKey: string;
    preset: LayoutPreset;
  }>(() => ({
    boardKey: normalizedBoardKey,
    preset:
      typeof window !== "undefined"
        ? resolveStoredPreset(
            window.localStorage.getItem(`${STORAGE_KEY_PREFIX}:${normalizedBoardKey}`),
          )
        : "atlas",
  }));
  const layout = useMemo(() => buildVirtualOfficeLayout(derived.agents), [derived.agents]);

  if (layoutState.boardKey !== normalizedBoardKey) {
    const storedValue =
      typeof window !== "undefined"
        ? window.localStorage.getItem(`${STORAGE_KEY_PREFIX}:${normalizedBoardKey}`)
        : null;
    setLayoutState({
      boardKey: normalizedBoardKey,
      preset: resolveStoredPreset(storedValue),
    });
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storageKey = `${STORAGE_KEY_PREFIX}:${layoutState.boardKey}`;
    window.localStorage.setItem(storageKey, layoutState.preset);
  }, [layoutState]);

  const focusedAgent =
    derived.agents.find((agent) => agent.id === selectedAgentId) ??
    derived.attention_agents[0] ??
    derived.agents[0] ??
    null;
  const selectedAgent = focusedAgent?.id ?? null;
  const layoutPreset = layoutState.preset;
  const preset = OFFICE_LAYOUT_PRESETS[layoutPreset];
  const handoffLine = useMemo(() => {
    if (!derived.handoff) return null;
    const from = layout.positionedAgents.find((item) => item.agent.id === derived.handoff?.from_agent_id);
    const to = layout.positionedAgents.find((item) => item.agent.id === derived.handoff?.to_agent_id);
    if (!from || !to) return null;
    return { from, to };
  }, [derived.handoff, layout.positionedAgents]);

  return (
    <section className="galaxy-card rounded-[32px] p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
            Virtual Office
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Prompthub pixel floor</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-sky-300/30 hover:bg-white/10"
            onClick={() => setZoom((current) => Math.max(0.72, Number((current - 0.1).toFixed(2))))}
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
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] uppercase tracking-[0.26em] text-slate-500">Live Signals</p>
                <Badge variant="outline" className="border-white/15 text-slate-300">
                  {preset.label}
                </Badge>
              </div>
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
                  {derived.handoff ? `${derived.handoff.from} -> ${derived.handoff.to}` : "No active handoff"}
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
                <div className="mt-3 flex items-start gap-3">
                  <PixelSprite selected sprite={buildPixelAgentSprite(focusedAgent)} />
                  <div className="min-w-0">
                    <p className="text-lg font-semibold text-white">{focusedAgent.name}</p>
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
                </div>
              </div>
            ) : null}
          </div>

          {derived.attention_agents.length > 0 ? (
            <div className="absolute bottom-3 left-3 z-20 w-[min(100%-1.5rem,19rem)] rounded-[20px] border border-amber-300/25 bg-[rgba(20,16,10,0.72)] px-3 py-3 shadow-[0_18px_38px_rgba(0,0,0,0.2)] backdrop-blur-xl">
              <p className="text-[10px] uppercase tracking-[0.26em] text-slate-500">Attention Queue</p>
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

          <div className="relative min-h-[620px] overflow-hidden">
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
                  className="absolute overflow-hidden rounded-[38px] border"
                  style={{
                    background: preset.floor,
                    borderColor: preset.line,
                    boxShadow: preset.glow,
                    height: layout.floorH,
                    left: layout.floorX,
                    top: layout.floorY,
                    width: layout.floorW,
                  }}
                >
                  <div className="pixel-floor-grid absolute inset-0 opacity-70" />
                  <div
                    className="absolute inset-5 rounded-[30px] border"
                    style={{ borderColor: preset.line }}
                  />
                  <div className="pixel-office-beam absolute inset-x-10 top-[23%]" />
                  <div className="pixel-office-beam absolute inset-x-10 top-[54%]" />
                  <div
                    className="absolute left-[32%] top-8 bottom-8 w-px"
                    style={{ background: `linear-gradient(180deg, transparent, ${preset.line}, transparent)` }}
                  />
                  <div
                    className="absolute left-[66%] top-8 bottom-8 w-px"
                    style={{ background: `linear-gradient(180deg, transparent, ${preset.line}, transparent)` }}
                  />

                  {preset.furniture.map((piece, index) => (
                    <div
                      key={`${layoutPreset}-${index}`}
                      className={`pixel-furniture pixel-furniture-${piece.tone}`}
                      style={{
                        height: piece.h,
                        left: piece.x,
                        top: piece.y,
                        transform: piece.rotate ? `rotate(${piece.rotate}deg)` : undefined,
                        width: piece.w,
                      }}
                    />
                  ))}

                  {Object.entries(laneLabels).map(([lane, label]) => {
                    const anchor = layout.positionedAgents.find((item) => item.agent.lane === lane);
                    if (!anchor) return null;
                    return (
                      <div
                        key={lane}
                        className="absolute -translate-x-1/2 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em]"
                        style={{
                          background: preset.panel,
                          borderColor: preset.line,
                          color: preset.tag,
                          left: anchor.centerX - layout.floorX,
                          top: anchor.centerY - layout.floorY - 70,
                        }}
                      >
                        {label}
                      </div>
                    );
                  })}

                  {handoffLine ? (
                    <svg className="absolute inset-0 h-full w-full overflow-visible">
                      <line
                        x1={handoffLine.from.centerX - layout.floorX}
                        y1={handoffLine.from.centerY - layout.floorY}
                        x2={handoffLine.to.centerX - layout.floorX}
                        y2={handoffLine.to.centerY - layout.floorY}
                        stroke={preset.accent}
                        strokeDasharray="8 7"
                        strokeWidth="3"
                      />
                    </svg>
                  ) : null}

                  {layout.positionedAgents.map((positionedAgent) => {
                    const sprite = buildPixelAgentSprite(positionedAgent.agent);
                    const selected = selectedAgent === positionedAgent.agent.id;
                    const bubble = getAgentBubble(
                      positionedAgent.agent.status,
                      positionedAgent.agent.task_label,
                      positionedAgent.agent.deliver_to,
                    );
                    return (
                      <button
                        key={positionedAgent.agent.id}
                        type="button"
                        onClick={() => onSelectAgent(positionedAgent.agent.id)}
                        className={`pixel-agent-node ${selected ? "pixel-agent-node-active" : ""}`}
                        style={{
                          left: positionedAgent.centerX - layout.floorX,
                          top: positionedAgent.centerY - layout.floorY,
                        }}
                      >
                        {bubble ? (
                          <span className="pixel-speech-bubble max-w-[130px] truncate">{bubble}</span>
                        ) : null}
                        <PixelSprite selected={selected} sprite={sprite} />
                        <span className="mt-2 max-w-[92px] truncate font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#f4f6ff]">
                          {positionedAgent.agent.name}
                        </span>
                        <span className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[#95a3cf]">
                          {statusLabel(positionedAgent.agent.status)}
                        </span>
                        <span className="pixel-agent-shadow" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="absolute bottom-3 right-3 z-20 w-[240px] rounded-[20px] border border-white/10 bg-[#141a25]/92 px-3 py-3 shadow-[0_18px_38px_rgba(0,0,0,0.2)]">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Room layout</p>
                <Badge variant="outline" className="border-white/15 text-slate-300">
                  Persistent
                </Badge>
              </div>
              <div className="mt-3 grid gap-2">
                {(Object.entries(OFFICE_LAYOUT_PRESETS) as Array<[LayoutPreset, (typeof OFFICE_LAYOUT_PRESETS)[LayoutPreset]]>).map(
                  ([presetKey, presetValue]) => (
                    <button
                      key={presetKey}
                      type="button"
                      onClick={() =>
                        setLayoutState((current) => ({
                          ...current,
                          preset: presetKey,
                        }))
                      }
                      className={`pixel-select-card ${layoutPreset === presetKey ? "pixel-select-card-active" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#f4f6ff]">
                          {presetValue.label}
                        </span>
                        <span
                          className="pixel-roster-swatch"
                          style={{ background: presetValue.accent, borderColor: presetValue.line }}
                        />
                      </div>
                    </button>
                  ),
                )}
              </div>
              <div className="mt-3 rounded-[16px] border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                Checkpoints, retries and handoffs surface as speech bubbles directly on the floor.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
