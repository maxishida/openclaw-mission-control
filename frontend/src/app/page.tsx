"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/auth/clerk";
import { LandingHero } from "@/components/organisms/LandingHero";
import { LandingShell } from "@/components/templates/LandingShell";

export default function Page() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/dashboard");
    }
  }, [isLoaded, isSignedIn, router]);

  if (isLoaded && isSignedIn) {
    return null;
  }

  return (
    <LandingShell>
      <LandingHero />
    </LandingShell>
  );
}
