"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import type { BoardRead } from "@/api/generated/model";
import { Badge } from "@/components/ui/badge";
import type {
  VirtualOfficeAgentStatus,
  VirtualOfficeAgentView,
  VirtualOfficeDerivedState,
  VirtualOfficeLane,
} from "@/lib/virtual-office";

type VirtualOfficeStageProps = {
  board?: Pick<
    BoardRead,
    "id" | "last_synced_at" | "name" | "slug" | "sync_source" | "sync_state" | "updated_at"
  > | null;
  boardKey?: string | null;
  derived: VirtualOfficeDerivedState;
  onSelectAgent: (agentId: string) => void;
  selectedAgentId: string | null;
};

type SceneDirection = "down" | "up" | "left" | "right";
type SceneRoom = "workspace" | "utility" | "lounge";

type SceneSlot = {
  dir: SceneDirection;
  room: SceneRoom;
  x: number;
  y: number;
};

type SceneAgent = SceneSlot & {
  agent: VirtualOfficeAgentView;
  bubble: string | null;
  characterIndex: number;
  highlighted: boolean;
  zIndex: number;
};

type FurnitureProp = {
  height: number;
  src: string;
  width: number;
  x: number;
  y: number;
  zIndex: number;
};

const SCENE_WIDTH = 768;
const SCENE_HEIGHT = 500;
const CHARACTER_FRAME_WIDTH = 16;
const CHARACTER_FRAME_HEIGHT = 32;
const CHARACTER_SCALE = 3;
const CHARACTER_ROWS = 3;
const CHARACTER_SHEETS = Array.from(
  { length: 6 },
  (_, index) => `/virtual-office/pixel-agents/characters/char_${index}.png`,
);

const LANE_ORDER: VirtualOfficeLane[] = ["lead", "research", "build", "review", "publish", "monitor"];

const ROOM_BY_LANE: Record<VirtualOfficeLane, SceneRoom> = {
  build: "workspace",
  lead: "workspace",
  monitor: "utility",
  publish: "lounge",
  research: "workspace",
  review: "lounge",
};

const LANE_SLOTS: Record<VirtualOfficeLane, SceneSlot[]> = {
  lead: [
    { dir: "up", room: "workspace", x: 112, y: 212 },
    { dir: "up", room: "workspace", x: 248, y: 212 },
    { dir: "right", room: "workspace", x: 176, y: 132 },
  ],
  research: [
    { dir: "up", room: "workspace", x: 112, y: 352 },
    { dir: "up", room: "workspace", x: 248, y: 352 },
    { dir: "down", room: "workspace", x: 192, y: 274 },
  ],
  build: [
    { dir: "down", room: "workspace", x: 66, y: 164 },
    { dir: "down", room: "workspace", x: 292, y: 164 },
    { dir: "down", room: "workspace", x: 66, y: 304 },
    { dir: "down", room: "workspace", x: 292, y: 304 },
    { dir: "right", room: "workspace", x: 188, y: 398 },
  ],
  monitor: [
    { dir: "down", room: "utility", x: 586, y: 126 },
    { dir: "left", room: "utility", x: 676, y: 126 },
    { dir: "down", room: "utility", x: 726, y: 102 },
  ],
  review: [
    { dir: "right", room: "lounge", x: 538, y: 318 },
    { dir: "left", room: "lounge", x: 630, y: 318 },
    { dir: "down", room: "lounge", x: 494, y: 390 },
  ],
  publish: [
    { dir: "down", room: "lounge", x: 690, y: 318 },
    { dir: "left", room: "lounge", x: 716, y: 390 },
    { dir: "down", room: "lounge", x: 610, y: 390 },
  ],
};

const ROOM_OVERFLOW: Record<
  SceneRoom,
  { cols: number; dir: SceneDirection; startX: number; startY: number; stepX: number; stepY: number }
> = {
  lounge: { cols: 3, dir: "down", startX: 500, startY: 258, stepX: 88, stepY: 84 },
  utility: { cols: 3, dir: "down", startX: 522, startY: 88, stepX: 74, stepY: 60 },
  workspace: { cols: 4, dir: "down", startX: 84, startY: 150, stepX: 76, stepY: 96 },
};

const OFFICE_PROPS: FurnitureProp[] = [
  { height: 48, src: "/virtual-office/pixel-agents/furniture/BOOKSHELF/BOOKSHELF.png", width: 96, x: 46, y: 34, zIndex: 12 },
  { height: 48, src: "/virtual-office/pixel-agents/furniture/BOOKSHELF/BOOKSHELF.png", width: 96, x: 146, y: 34, zIndex: 12 },
  { height: 48, src: "/virtual-office/pixel-agents/furniture/BOOKSHELF/BOOKSHELF.png", width: 96, x: 246, y: 34, zIndex: 12 },
  { height: 144, src: "/virtual-office/pixel-agents/furniture/DESK/DESK_FRONT.png", width: 216, x: 42, y: 116, zIndex: 28 },
  { height: 144, src: "/virtual-office/pixel-agents/furniture/DESK/DESK_FRONT.png", width: 216, x: 178, y: 116, zIndex: 28 },
  { height: 144, src: "/virtual-office/pixel-agents/furniture/DESK/DESK_FRONT.png", width: 216, x: 42, y: 256, zIndex: 28 },
  { height: 144, src: "/virtual-office/pixel-agents/furniture/DESK/DESK_FRONT.png", width: 216, x: 178, y: 256, zIndex: 28 },
  { height: 96, src: "/virtual-office/pixel-agents/furniture/PC/PC_FRONT_ON_1.png", width: 48, x: 96, y: 116, zIndex: 20 },
  { height: 96, src: "/virtual-office/pixel-agents/furniture/PC/PC_FRONT_ON_2.png", width: 48, x: 232, y: 116, zIndex: 20 },
  { height: 96, src: "/virtual-office/pixel-agents/furniture/PC/PC_FRONT_ON_3.png", width: 48, x: 96, y: 256, zIndex: 20 },
  { height: 96, src: "/virtual-office/pixel-agents/furniture/PC/PC_FRONT_ON_1.png", width: 48, x: 232, y: 256, zIndex: 20 },
  { height: 72, src: "/virtual-office/pixel-agents/furniture/WOODEN_CHAIR/WOODEN_CHAIR_FRONT.png", width: 36, x: 106, y: 196, zIndex: 18 },
  { height: 72, src: "/virtual-office/pixel-agents/furniture/WOODEN_CHAIR/WOODEN_CHAIR_FRONT.png", width: 36, x: 242, y: 196, zIndex: 18 },
  { height: 72, src: "/virtual-office/pixel-agents/furniture/WOODEN_CHAIR/WOODEN_CHAIR_FRONT.png", width: 36, x: 106, y: 336, zIndex: 18 },
  { height: 72, src: "/virtual-office/pixel-agents/furniture/WOODEN_CHAIR/WOODEN_CHAIR_FRONT.png", width: 36, x: 242, y: 336, zIndex: 18 },
  { height: 96, src: "/virtual-office/pixel-agents/furniture/LARGE_PLANT/LARGE_PLANT.png", width: 64, x: 20, y: 350, zIndex: 24 },
  { height: 96, src: "/virtual-office/pixel-agents/furniture/LARGE_PLANT/LARGE_PLANT.png", width: 64, x: 312, y: 350, zIndex: 24 },
  { height: 48, src: "/virtual-office/pixel-agents/furniture/BOOKSHELF/BOOKSHELF.png", width: 96, x: 468, y: 52, zIndex: 12 },
  { height: 96, src: "/virtual-office/pixel-agents/furniture/LARGE_PLANT/LARGE_PLANT.png", width: 64, x: 700, y: 42, zIndex: 22 },
  { height: 96, src: "/virtual-office/pixel-agents/furniture/LARGE_PLANT/LARGE_PLANT.png", width: 64, x: 424, y: 306, zIndex: 22 },
  { height: 96, src: "/virtual-office/pixel-agents/furniture/LARGE_PLANT/LARGE_PLANT.png", width: 64, x: 678, y: 308, zIndex: 22 },
  { height: 48, src: "/virtual-office/pixel-agents/furniture/BOOKSHELF/BOOKSHELF.png", width: 96, x: 604, y: 240, zIndex: 12 },
  { height: 96, src: "/virtual-office/pixel-agents/furniture/SMALL_PAINTING/SMALL_PAINTING.png", width: 48, x: 548, y: 226, zIndex: 13 },
  { height: 96, src: "/virtual-office/pixel-agents/furniture/CUSHIONED_CHAIR/CUSHIONED_CHAIR_FRONT.png", width: 48, x: 502, y: 296, zIndex: 18 },
  { height: 96, src: "/virtual-office/pixel-agents/furniture/CUSHIONED_CHAIR/CUSHIONED_CHAIR_FRONT.png", width: 48, x: 628, y: 296, zIndex: 18 },
  { height: 96, src: "/virtual-office/pixel-agents/furniture/COFFEE_TABLE/COFFEE_TABLE.png", width: 96, x: 558, y: 294, zIndex: 18 },
];

const statusLabel = (status: VirtualOfficeAgentStatus) => {
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

const statusBadgeTone = (status: VirtualOfficeAgentStatus) => {
  switch (status) {
    case "working":
      return "border-sky-300/30 bg-sky-500/10 text-sky-100";
    case "delivering":
      return "border-cyan-300/30 bg-cyan-500/10 text-cyan-100";
    case "done":
      return "border-emerald-300/30 bg-emerald-500/10 text-emerald-100";
    case "checkpoint":
      return "border-amber-300/30 bg-amber-500/10 text-amber-100";
    case "retry":
      return "border-orange-300/30 bg-orange-500/10 text-orange-100";
    case "error":
      return "border-rose-300/30 bg-rose-500/10 text-rose-100";
    case "monitoring":
      return "border-teal-300/30 bg-teal-500/10 text-teal-100";
    default:
      return "border-white/10 bg-white/6 text-slate-200";
  }
};

const bubbleTone = (status: VirtualOfficeAgentStatus) => {
  switch (status) {
    case "checkpoint":
      return "prompthub-office-bubble--checkpoint";
    case "error":
      return "prompthub-office-bubble--error";
    case "retry":
      return "prompthub-office-bubble--retry";
    case "delivering":
      return "prompthub-office-bubble--handoff";
    default:
      return "";
  }
};

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const resolveBubble = (agent: VirtualOfficeAgentView) => {
  if (agent.status === "checkpoint") return "Waiting on checkpoint";
  if (agent.status === "error") return "Needs operator input";
  if (agent.status === "retry") return "Reworking current pass";
  if (agent.status === "delivering" && agent.deliver_to) return `Handoff to ${agent.deliver_to}`;
  if (agent.status === "working" && agent.task_label) return agent.task_label;
  if (agent.status === "monitoring") return "Watching live signals";
  return null;
};

const resolveCharacterPose = (status: VirtualOfficeAgentStatus, direction: SceneDirection, tick: number) => {
  const row = direction === "down" ? 0 : direction === "up" ? 1 : 2;
  const flip = direction === "left";

  if (status === "working") return { flip, frame: tick % 2 === 0 ? 3 : 4, row };
  if (status === "monitoring" || status === "checkpoint") {
    return { flip, frame: tick % 2 === 0 ? 5 : 6, row };
  }
  if (status === "delivering") return { flip, frame: [0, 1, 2, 1][tick % 4], row };
  if (status === "retry") return { flip, frame: [0, 1, 2, 1][tick % 4], row };
  return { flip, frame: 1, row };
};

const buildOverflowSlot = (room: SceneRoom, index: number): SceneSlot => {
  const config = ROOM_OVERFLOW[room];
  const column = index % config.cols;
  const row = Math.floor(index / config.cols);

  return {
    dir: config.dir,
    room,
    x: config.startX + column * config.stepX,
    y: config.startY + row * config.stepY,
  };
};

const buildSceneAgents = (
  agents: VirtualOfficeAgentView[],
  selectedAgentId: string | null,
  highlightIds: Set<string>,
) => {
  const grouped = new Map<VirtualOfficeLane, VirtualOfficeAgentView[]>();
  LANE_ORDER.forEach((lane) => grouped.set(lane, []));
  agents.forEach((agent) => grouped.get(agent.lane)?.push(agent));

  const positioned: SceneAgent[] = [];

  LANE_ORDER.forEach((lane) => {
    const laneAgents = grouped.get(lane) ?? [];
    const presetSlots = LANE_SLOTS[lane];
    const room = ROOM_BY_LANE[lane];

    laneAgents.forEach((agent, index) => {
      const slot = presetSlots[index] ?? buildOverflowSlot(room, index - presetSlots.length);
      positioned.push({
        agent,
        bubble: highlightIds.has(agent.id) ? resolveBubble(agent) : agent.status === "delivering" ? resolveBubble(agent) : null,
        characterIndex: hashString(`${agent.id}:${agent.name}:${agent.role}`) % CHARACTER_SHEETS.length,
        highlighted: agent.id === selectedAgentId,
        zIndex: 30 + Math.round(slot.y),
        ...slot,
      });
    });
  });

  return positioned.sort((left, right) => left.zIndex - right.zIndex);
};

function PixelProp({ height, src, width, x, y, zIndex }: FurnitureProp) {
  return (
    <div
      className="prompthub-office-prop"
      style={{
        height,
        left: x,
        top: y,
        width,
        zIndex,
      }}
    >
      <Image
        alt=""
        aria-hidden
        draggable={false}
        height={height}
        sizes={`${width}px`}
        src={src}
        width={width}
      />
    </div>
  );
}

function PixelCharacter({
  sceneAgent,
  tick,
  onSelectAgent,
}: {
  onSelectAgent: (agentId: string) => void;
  sceneAgent: SceneAgent;
  tick: number;
}) {
  const { flip, frame, row } = resolveCharacterPose(sceneAgent.agent.status, sceneAgent.dir, tick);
  const bubbleBelow = sceneAgent.y < 112;

  return (
    <button
      className={`prompthub-office-agent prompthub-office-agent--${sceneAgent.agent.status} ${
        sceneAgent.highlighted ? "prompthub-office-agent--selected" : ""
      }`}
      style={{
        left: sceneAgent.x,
        top: sceneAgent.y,
        zIndex: sceneAgent.zIndex,
      }}
      title={sceneAgent.agent.name}
      type="button"
      onClick={() => onSelectAgent(sceneAgent.agent.id)}
    >
      {sceneAgent.bubble ? (
        <div
          className={`prompthub-office-bubble ${bubbleTone(sceneAgent.agent.status)} ${
            bubbleBelow ? "prompthub-office-bubble--below" : ""
          }`}
        >
          {sceneAgent.bubble}
        </div>
      ) : null}
      <div className="prompthub-office-agent-shadow" />
      <div
        className="prompthub-office-agent-sheet"
        style={{
          backgroundImage: `url(${CHARACTER_SHEETS[sceneAgent.characterIndex]})`,
          backgroundPosition: `-${frame * CHARACTER_FRAME_WIDTH * CHARACTER_SCALE}px -${
            row * CHARACTER_FRAME_HEIGHT * CHARACTER_SCALE
          }px`,
          backgroundSize: `${CHARACTER_FRAME_WIDTH * 7 * CHARACTER_SCALE}px ${
            CHARACTER_FRAME_HEIGHT * CHARACTER_ROWS * CHARACTER_SCALE
          }px`,
          transform: flip ? "scaleX(-1)" : undefined,
        }}
      />
    </button>
  );
}

export function VirtualOfficeStage({
  board,
  derived,
  onSelectAgent,
  selectedAgentId,
}: VirtualOfficeStageProps) {
  const [zoom, setZoom] = useState(1);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTick((current) => (current + 1) % 8);
    }, 260);

    return () => window.clearInterval(interval);
  }, []);

  const focusedAgent =
    derived.agents.find((agent) => agent.id === selectedAgentId) ??
    derived.attention_agents[0] ??
    derived.agents[0] ??
    null;
  const highlightIds = useMemo(() => {
    const ids = new Set<string>();
    if (focusedAgent) ids.add(focusedAgent.id);
    derived.attention_agents.slice(0, 2).forEach((agent) => ids.add(agent.id));
    return ids;
  }, [derived.attention_agents, focusedAgent]);

  const sceneAgents = useMemo(
    () => buildSceneAgents(derived.agents, focusedAgent?.id ?? null, highlightIds),
    [derived.agents, focusedAgent?.id, highlightIds],
  );

  const handoffLine = useMemo(() => {
    if (!derived.handoff) return null;
    const from = sceneAgents.find((agent) => agent.agent.id === derived.handoff?.from_agent_id);
    const to = sceneAgents.find((agent) => agent.agent.id === derived.handoff?.to_agent_id);
    if (!from || !to) return null;
    return { from, to };
  }, [derived.handoff, sceneAgents]);

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
            onClick={() => setZoom((current) => Math.max(0.75, Number((current - 0.1).toFixed(2))))}
          >
            -
          </button>
          <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs font-medium text-slate-200">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-sky-300/30 hover:bg-white/10"
            onClick={() => setZoom((current) => Math.min(1.45, Number((current + 0.1).toFixed(2))))}
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
        <div className="prompthub-office-shell">
          <div className="prompthub-office-topbar">
            <div className="prompthub-office-chipbar">
              <div className="prompthub-office-chip">
                <span>Active</span>
                <strong>{derived.signals.active_count}</strong>
              </div>
              <div className="prompthub-office-chip">
                <span>Attention</span>
                <strong>{derived.signals.attention_count}</strong>
              </div>
              <div className="prompthub-office-chip">
                <span>Handoffs</span>
                <strong>{derived.signals.delivery_count}</strong>
              </div>
            </div>

            <div className="prompthub-office-sync">
              {board?.name ? <span className="truncate text-slate-200">{board.name}</span> : null}
              <Badge variant="outline" className="border-white/15 text-slate-200">
                {board?.sync_source ?? "mission_control"}
              </Badge>
              <Badge variant="outline" className="border-white/15 text-slate-200">
                {board?.sync_state ?? "healthy"}
              </Badge>
            </div>
          </div>

          <div className="flex justify-center px-2 py-2 md:px-4">
            <div
              className="relative transition-transform duration-200"
              style={{
                height: SCENE_HEIGHT,
                transform: `scale(${zoom})`,
                transformOrigin: "center center",
                width: SCENE_WIDTH,
              }}
            >
              <div className="prompthub-office-scene">
                <div className="prompthub-office-room prompthub-office-room--workspace" />
                <div className="prompthub-office-room prompthub-office-room--utility" />
                <div className="prompthub-office-room prompthub-office-room--lounge" />
                <div className="prompthub-office-divider prompthub-office-divider--vertical" />
                <div className="prompthub-office-divider prompthub-office-divider--horizontal" />

                <div className="prompthub-office-plaque" style={{ left: 72, top: 34 }}>
                  Workroom
                </div>
                <div className="prompthub-office-plaque" style={{ left: 474, top: 32 }}>
                  Relay
                </div>
                <div className="prompthub-office-plaque" style={{ left: 554, top: 208 }}>
                  Review Lounge
                </div>

                {OFFICE_PROPS.map((prop) => (
                  <PixelProp key={`${prop.src}-${prop.x}-${prop.y}`} {...prop} />
                ))}

                {handoffLine ? (
                  <svg className="pointer-events-none absolute inset-0 z-[34] h-full w-full overflow-visible">
                    <line
                      x1={handoffLine.from.x}
                      x2={handoffLine.to.x}
                      y1={handoffLine.from.y - 28}
                      y2={handoffLine.to.y - 28}
                      stroke="#80f5ff"
                      strokeDasharray="8 8"
                      strokeLinecap="round"
                      strokeWidth="3"
                    />
                  </svg>
                ) : null}

                {sceneAgents.map((sceneAgent) => (
                  <PixelCharacter
                    key={sceneAgent.agent.id}
                    sceneAgent={sceneAgent}
                    tick={tick}
                    onSelectAgent={onSelectAgent}
                  />
                ))}
              </div>
            </div>
          </div>

          {focusedAgent ? (
            <div className="prompthub-office-footer">
              <div className="prompthub-office-focus">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                      Selected Agent
                    </p>
                    <p className="mt-2 text-lg font-semibold text-white">{focusedAgent.name}</p>
                    <p className="mt-1 text-sm text-slate-300">{focusedAgent.role}</p>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${statusBadgeTone(focusedAgent.status)}`}
                  >
                    {statusLabel(focusedAgent.status)}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  {resolveBubble(focusedAgent) ?? "Standing by for the next board instruction."}
                </p>
              </div>

              <div className="prompthub-office-runtime">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                  Runtime
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="prompthub-office-runtime-pill">
                    Step {derived.pipeline.current}/{derived.pipeline.total}
                  </span>
                  {derived.pipeline.phase ? (
                    <span className="prompthub-office-runtime-pill">{derived.pipeline.phase}</span>
                  ) : null}
                  {derived.pipeline.quality_gate_status ? (
                    <span className="prompthub-office-runtime-pill">
                      Gate {derived.pipeline.quality_gate_status}
                    </span>
                  ) : null}
                  {derived.handoff ? (
                    <span className="prompthub-office-runtime-pill">
                      {derived.handoff.from} {"->"} {derived.handoff.to}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="prompthub-office-footer">
              <div className="prompthub-office-empty">No live agents on this board yet.</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
