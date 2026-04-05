"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Search, X } from "lucide-react";

import { SignedIn, useAuth } from "@/auth/clerk";

import { ApiError } from "@/api/mutator";
import {
  type getMeApiV1UsersMeGetResponse,
  useGetMeApiV1UsersMeGet,
} from "@/api/generated/users/users";
import { BrandMark } from "@/components/atoms/BrandMark";
import { OrgSwitcher } from "@/components/organisms/OrgSwitcher";
import { UserMenu } from "@/components/organisms/UserMenu";
import { isOnboardingComplete } from "@/lib/onboarding";

export function DashboardShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const isOnboardingPath = pathname === "/onboarding";
  const [sidebarState, setSidebarState] = useState({ open: false, path: pathname });
  // Close sidebar on navigation using React's "store info from previous
  // renders" pattern — conditional setState during render resets immediately
  // without extra commits, avoiding both set-state-in-effect and refs rules.
  if (sidebarState.path !== pathname) {
    setSidebarState({ open: false, path: pathname });
  }
  const sidebarOpen = sidebarState.open;

  const meQuery = useGetMeApiV1UsersMeGet<
    getMeApiV1UsersMeGetResponse,
    ApiError
  >({
    query: {
      enabled: Boolean(isSignedIn) && !isOnboardingPath,
      retry: false,
      refetchOnMount: "always",
    },
  });
  const profile = meQuery.data?.status === 200 ? meQuery.data.data : null;
  const displayName = profile?.name ?? profile?.preferred_name ?? "Operator";
  const displayEmail = profile?.email ?? "";

  useEffect(() => {
    if (!isSignedIn || isOnboardingPath) return;
    if (!profile) return;
    if (!isOnboardingComplete(profile)) {
      router.replace("/onboarding");
    }
  }, [isOnboardingPath, isSignedIn, profile, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== "openclaw_org_switch" || !event.newValue) return;
      window.location.reload();
    };

    window.addEventListener("storage", handleStorage);

    let channel: BroadcastChannel | null = null;
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel("org-switch");
      channel.onmessage = () => {
        window.location.reload();
      };
    }

    return () => {
      window.removeEventListener("storage", handleStorage);
      channel?.close();
    };
  }, []);

  const toggleSidebar = useCallback(
    () => setSidebarState((prev) => ({ open: !prev.open, path: pathname })),
    [pathname],
  );

  // Dismiss sidebar on Escape
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarState((prev) => ({ ...prev, open: false }));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  return (
    <div
      className="galaxy-shell min-h-screen text-strong"
      data-sidebar={sidebarOpen ? "open" : "closed"}
    >
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#090b16]/50 backdrop-blur-2xl">
        <div className="flex items-center gap-4 px-4 py-4 md:px-6">
          <div className="flex min-w-0 items-center md:w-[260px]">
            {isSignedIn ? (
              <button
                type="button"
                className="mr-3 rounded-2xl border border-white/10 bg-white/5 p-2 text-slate-200 transition hover:border-fuchsia-400/30 hover:bg-fuchsia-500/10 md:hidden"
                onClick={toggleSidebar}
                aria-label="Toggle navigation"
              >
                {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            ) : null}
            <div className="rounded-[26px] border border-white/10 bg-white/5 px-4 py-3 shadow-[0_18px_45px_rgba(3,7,24,0.28)] backdrop-blur-xl">
              <BrandMark />
            </div>
          </div>
          <SignedIn>
            <div className="hidden min-w-0 flex-1 items-center gap-4 md:flex">
              <div className="hidden xl:block">
                <OrgSwitcher />
              </div>
              <label className="galaxy-search flex h-12 flex-1 items-center gap-3 rounded-[20px] px-4 text-sm text-slate-200">
                <Search className="h-4 w-4 shrink-0 text-violet-200/80" />
                <input
                  type="search"
                  placeholder="Search boards, agents, approvals, signals..."
                  aria-label="Search"
                  className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-400"
                />
              </label>
            </div>
          </SignedIn>
          <SignedIn>
            <div className="ml-auto flex items-center gap-3">
              <div className="galaxy-chip hidden rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-violet-100 xl:block">
                Galaxy relay online
              </div>
              <div className="hidden text-right lg:block">
                <p className="text-sm font-semibold text-slate-50">
                  {displayName}
                </p>
                <p className="text-xs text-slate-400">Command operator</p>
              </div>
              <UserMenu displayName={displayName} displayEmail={displayEmail} />
            </div>
          </SignedIn>
        </div>
      </header>

      {/* Mobile sidebar overlay */}
      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-40 bg-[#03040c]/70 backdrop-blur-sm md:hidden"
          onClick={toggleSidebar}
          aria-hidden="true"
          data-cy="sidebar-backdrop"
        />
      ) : null}

      <div className="grid min-h-[calc(100vh-80px)] grid-cols-1 md:grid-cols-[260px_1fr]">
        {children}
      </div>
    </div>
  );
}
