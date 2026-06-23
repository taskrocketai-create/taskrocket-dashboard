"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface Props { className?: string; label?: string; }

export default function SignOutButton({ className, label = "Sign out" }: Props) {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className={className}
      style={{
        background: "none",
        border: "1px solid rgba(255,255,255,0.2)",
        borderRadius: "6px",
        padding: "6px 12px",
        cursor: "pointer",
        fontSize: "13px",
        color: "rgba(255,255,255,0.6)",
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}
