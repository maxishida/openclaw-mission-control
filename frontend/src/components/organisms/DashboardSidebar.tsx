"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Bot,
  Boxes,
  CheckCircle2,
  Folder,
  Building2,
  LayoutGrid,
  Network,
  Settings,
  Sparkles,
  Store,
  Tags,
} from "lucide-react";

import { useAuth } from "@/auth/clerk";
import { ApiError } from "@/api/mutator";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import {
  type healthzHealthzGetResponse,
  useHealthzHealthzGet,
} from "@/api/generated/default/default";
import { cn } from "@/lib/utils";

export function DashboardSidebar() {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const healthQuery = useHealthzHealthzGet<healthzHealthzGetResponse, ApiError>(
    {
      query: {
        refetchInterval: 30_000,
        refetchOnMount: "always",
        retry: false,
      },
      request: { cache: "no-store" },
    },
  );

  const okValue = healthQuery.data?.data?.ok;
  const systemStatus: "unknown" | "operational" | "degraded" =
    okValue === true
      ? "operational"
      : okValue === false
        ? "degraded"
        : healthQuery.isError
          ? "degraded"
          : "unknown";
  const statusLabel =
    systemStatus === "operational"
      ? "All systems operational"
      : systemStatus === "unknown"
        ? "System status unavailable"
        : "System degraded";
  const navItemClass = (active: boolean) =>
    cn(
      "group flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-sm font-medium transition duration-300",
      active
        ? "border-fuchsia-400/35 bg-fuchsia-500/14 text-slate-50 shadow-[0_0_28px_rgba(109,13,170,0.16)]"
        : "border-transparent bg-white/0 text-slate-300 hover:border-white/10 hover:bg-white/5 hover:text-white",
    );

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-[280px] -translate-x-full flex-col border-r border-white/10 bg-[#090c18]/88 pt-20 shadow-[0_24px_90px_rgba(2,4,14,0.78)] backdrop-blur-2xl transition-transform duration-300 ease-out [[data-sidebar=open]_&]:translate-x-0 md:relative md:inset-auto md:z-auto md:w-[260px] md:translate-x-0 md:pt-0 md:shadow-none md:transition-none">
      <div className="galaxy-grid galaxy-noise absolute inset-0 opacity-35" aria-hidden="true" />
      <div className="relative flex-1 px-3 py-5">
        <p className="px-3 text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
          Navigation
        </p>
        <nav className="mt-3 space-y-4 text-sm">
          <div>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              Overview
            </p>
            <div className="mt-1 space-y-1">
              <Link
                href="/dashboard"
                className={navItemClass(pathname === "/dashboard")}
              >
                <BarChart3 className="h-4 w-4 text-violet-200 transition group-hover:text-white" />
                Dashboard
              </Link>
              <Link
                href="/activity"
                className={navItemClass(pathname.startsWith("/activity"))}
              >
                <Activity className="h-4 w-4 text-sky-200 transition group-hover:text-white" />
                Live feed
              </Link>
              <Link
                href="/virtual-office"
                className={navItemClass(pathname.startsWith("/virtual-office"))}
              >
                <Sparkles className="h-4 w-4 text-fuchsia-200 transition group-hover:text-white" />
                Virtual Office
              </Link>
            </div>
          </div>

          <div>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              Boards
            </p>
            <div className="mt-1 space-y-1">
              <Link
                href="/board-groups"
                className={navItemClass(pathname.startsWith("/board-groups"))}
              >
                <Folder className="h-4 w-4 text-violet-200 transition group-hover:text-white" />
                Board groups
              </Link>
              <Link
                href="/boards"
                className={navItemClass(pathname.startsWith("/boards"))}
              >
                <LayoutGrid className="h-4 w-4 text-cyan-200 transition group-hover:text-white" />
                Boards
              </Link>
              <Link
                href="/tags"
                className={navItemClass(pathname.startsWith("/tags"))}
              >
                <Tags className="h-4 w-4 text-fuchsia-200 transition group-hover:text-white" />
                Tags
              </Link>
              <Link
                href="/approvals"
                className={navItemClass(pathname.startsWith("/approvals"))}
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-200 transition group-hover:text-white" />
                Approvals
              </Link>
              {isAdmin ? (
                <Link
                  href="/custom-fields"
                  className={navItemClass(pathname.startsWith("/custom-fields"))}
                >
                  <Settings className="h-4 w-4 text-slate-200 transition group-hover:text-white" />
                  Custom fields
                </Link>
              ) : null}
            </div>
          </div>

          <div>
            {isAdmin ? (
              <>
                <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Skills
                </p>
                <div className="mt-1 space-y-1">
                  <Link
                    href="/skills/marketplace"
                    className={navItemClass(
                      pathname === "/skills" || pathname.startsWith("/skills/marketplace"),
                    )}
                  >
                    <Store className="h-4 w-4 text-violet-200 transition group-hover:text-white" />
                    Marketplace
                  </Link>
                  <Link
                    href="/skills/packs"
                    className={navItemClass(pathname.startsWith("/skills/packs"))}
                  >
                    <Boxes className="h-4 w-4 text-cyan-200 transition group-hover:text-white" />
                    Packs
                  </Link>
                </div>
              </>
            ) : null}
          </div>

          <div>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              Administration
            </p>
            <div className="mt-1 space-y-1">
              <Link
                href="/organization"
                className={navItemClass(pathname.startsWith("/organization"))}
              >
                <Building2 className="h-4 w-4 text-slate-200 transition group-hover:text-white" />
                Organization
              </Link>
              {isAdmin ? (
                <Link
                  href="/gateways"
                  className={navItemClass(pathname.startsWith("/gateways"))}
                >
                  <Network className="h-4 w-4 text-fuchsia-200 transition group-hover:text-white" />
                  Gateways
                </Link>
              ) : null}
              {isAdmin ? (
                <Link
                  href="/agents"
                  className={navItemClass(pathname.startsWith("/agents"))}
                >
                  <Bot className="h-4 w-4 text-violet-200 transition group-hover:text-white" />
                  Agents
                </Link>
              ) : null}
            </div>
          </div>
        </nav>
      </div>
      <div className="relative border-t border-white/10 p-4">
        <div className="galaxy-subcard rounded-2xl px-3 py-3 text-xs text-slate-300">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
            Fleet status
          </p>
          <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              systemStatus === "operational" && "bg-emerald-500",
              systemStatus === "degraded" && "bg-rose-500",
              systemStatus === "unknown" && "bg-slate-300",
            )}
          />
          {statusLabel}
        </div>
        </div>
      </div>
    </aside>
  );
}
