"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { buildPixelAgentSprite } from "@/lib/virtual-office-pixel";
import { buildVirtualOfficeLayout, type VirtualOfficeDerivedState } from "@/lib/virtual-office";

type PixelVirtualOfficeStageProps = {
  derived: VirtualOfficeDerivedState;
  onSelectAgent: (agentId: string) => void;
  selectedAgentId: string | null;
};

const laneLabels = {
  build: "BUILD BAY",
  lead: "LEAD DESK",
  monitor: "MONITOR",
  publish: "RELEASE",
  research: "RESEARCH",
  review: "REVIEW",
} as const;

const statusText = {
  checkpoint: "WAIT",
  delivering: "SEND",
  done: "DONE",
  error: "FAIL",
  idle: "IDLE",
  monitoring: "WATCH",
  retry: "RETRY",
  working: "WORK",
} as const;

function PixelSprite({
  mode = "panel",
  selected,
  sprite,
}: {
  mode?: "free" | "panel";
  selected: boolean;
  sprite: ReturnType<typeof buildPixelAgentSprite>;
}) {
  return (
    <div
      className={`${mode === "free" ? "pixel-sprite-free" : "pixel-sprite-frame"} ${selected ? "ring-2 ring-[#fff4a1]" : ""}`}
      style={{
        background: mode === "free" ? "transparent" : "rgba(8, 13, 23, 0.92)",
        borderColor: mode === "free" ? "transparent" : sprite.frame,
        boxShadow:
          mode === "free"
            ? `0 0 20px ${sprite.glow}`
            : `0 0 0 2px rgba(3,7,18,0.95), 0 0 24px ${sprite.glow}`,
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

export function PixelVirtualOfficeStage({
  derived,
  onSelectAgent,
  selectedAgentId,
}: PixelVirtualOfficeStageProps) {
  const [zoom, setZoom] = useState(1);
  const layout = useMemo(() => buildVirtualOfficeLayout(derived.agents), [derived.agents]);
  const focusedAgent =
    derived.agents.find((agent) => agent.id === selectedAgentId) ??
    derived.attention_agents[0] ??
    derived.agents[0] ??
    null;

  const selectedAgent = focusedAgent?.id ?? null;
  const handoffLine = useMemo(() => {
    if (!derived.handoff) return null;
    const from = layout.positionedAgents.find(
      (item) => item.agent.id === derived.handoff?.from_agent_id,
    );
    const to = layout.positionedAgents.find((item) => item.agent.id === derived.handoff?.to_agent_id);
    if (!from || !to) return null;
    return { from, to };
  }, [derived.handoff, layout.positionedAgents]);

  return (
    <section className="pixel-panel overflow-hidden">
      <div className="pixel-header flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="pixel-kicker">PIXEL VIRTUAL OFFICE</p>
          <h2 className="mt-2 font-mono text-2xl font-semibold uppercase tracking-[0.12em] text-[#f4f6ff]">
            Agent Floor
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="pixel-button"
            onClick={() => setZoom((current) => Math.max(0.75, Number((current - 0.1).toFixed(2))))}
          >
            -
          </button>
          <span className="pixel-chip">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="pixel-button"
            onClick={() => setZoom((current) => Math.min(1.5, Number((current + 0.1).toFixed(2))))}
          >
            +
          </button>
          <button type="button" className="pixel-button" onClick={() => setZoom(1)}>
            FIT
          </button>
        </div>
      </div>

      <div className="pixel-stage-shell">
        <div className="pixel-stage-grid" />

        <div className="absolute left-4 top-4 z-20 grid gap-3 md:max-w-[18rem]">
          <div className="pixel-subpanel">
            <p className="pixel-kicker">STATUS BUS</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="pixel-readout">
                <span>ACTIVE</span>
                <strong>{derived.signals.active_count}</strong>
              </div>
              <div className="pixel-readout">
                <span>ALERTS</span>
                <strong>{derived.signals.attention_count}</strong>
              </div>
              <div className="pixel-readout">
                <span>CHECKS</span>
                <strong>{derived.pipeline.quality_gate_status ?? "NONE"}</strong>
              </div>
              <div className="pixel-readout">
                <span>SCORE</span>
                <strong>
                  {derived.pipeline.score !== null ? `${derived.pipeline.score}` : "--"}
                </strong>
              </div>
            </div>
          </div>

          {focusedAgent ? (
            <div className="pixel-subpanel">
              <p className="pixel-kicker">FOCUS</p>
              <div className="mt-3 flex items-start gap-3">
                <PixelSprite selected sprite={buildPixelAgentSprite(focusedAgent)} />
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm font-semibold uppercase tracking-[0.08em] text-[#f4f6ff]">
                    {focusedAgent.name}
                  </p>
                  <p className="mt-1 text-xs text-[#95a3cf]">{focusedAgent.role}</p>
                  <p className="mt-3 text-xs uppercase tracking-[0.12em] text-[#a8f0d1]">
                    {statusText[focusedAgent.status]}
                  </p>
                  <p className="mt-2 text-xs text-[#cfd8f5]">
                    {focusedAgent.task_label ?? "No active assignment"}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {derived.attention_agents.length > 0 ? (
          <div className="absolute bottom-4 left-4 z-20 w-[min(100%-2rem,18rem)] pixel-subpanel">
            <p className="pixel-kicker">ATTENTION QUEUE</p>
            <div className="mt-3 space-y-2">
              {derived.attention_agents.slice(0, 4).map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => onSelectAgent(agent.id)}
                  className={`pixel-list-row ${selectedAgent === agent.id ? "pixel-list-row-active" : ""}`}
                >
                  <span className="truncate">{agent.name}</span>
                  <span>{statusText[agent.status]}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="relative min-h-[620px] overflow-hidden p-4">
          <div className="flex h-full items-center justify-center">
            <div
              className="relative transition-transform duration-200"
              style={{
                height: layout.stageH,
                transform: `scale(${zoom})`,
                transformOrigin: "center center",
                width: layout.stageW,
              }}
            >
              <div
                className="pixel-floor absolute"
                style={{
                  height: layout.floorH,
                  left: layout.floorX,
                  top: layout.floorY,
                  width: layout.floorW,
                }}
              >
                <div className="pixel-floor-grid" />
                {Object.entries(laneLabels).map(([lane, label]) => {
                  const anchor = layout.positionedAgents.find((item) => item.agent.lane === lane);
                  if (!anchor) return null;
                  return (
                    <div
                      key={lane}
                      className="pixel-lane-tag"
                      style={{
                        left: anchor.centerX - layout.floorX,
                        top: anchor.centerY - layout.floorY - 68,
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
                      stroke="#80f5ff"
                      strokeDasharray="8 6"
                      strokeWidth="3"
                    />
                  </svg>
                ) : null}

                {layout.positionedAgents.map((positionedAgent) => {
                  const sprite = buildPixelAgentSprite(positionedAgent.agent);
                  const selected = selectedAgent === positionedAgent.agent.id;
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
                      <PixelSprite mode="free" selected={selected} sprite={sprite} />
                      <span className="mt-2 max-w-[92px] truncate font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#f4f6ff]">
                        {positionedAgent.agent.name}
                      </span>
                      <span className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[#95a3cf]">
                        {statusText[positionedAgent.agent.status]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-4 right-4 z-20 pixel-subpanel w-[220px]">
          <div className="flex items-center justify-between gap-2">
            <p className="pixel-kicker">PIPELINE BUS</p>
            <Badge variant="outline" className="border-white/15 text-[#dce4ff]">
              {derived.pipeline.status}
            </Badge>
          </div>
          <div className="mt-3 space-y-2 font-mono text-xs uppercase tracking-[0.08em] text-[#cfd8f5]">
            <div className="flex items-center justify-between gap-3">
              <span>Step</span>
              <strong className="text-[#f4f6ff]">
                {derived.pipeline.current}/{derived.pipeline.total}
              </strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Phase</span>
              <strong className="text-[#f4f6ff]">{derived.pipeline.phase}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Retries</span>
              <strong className="text-[#f4f6ff]">{derived.pipeline.retries}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Gate</span>
              <strong className="text-[#f4f6ff]">
                {derived.pipeline.quality_gate_status ?? "NONE"}
              </strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
