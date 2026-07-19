"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const IDLE_MS = 60 * 60 * 1000;
const REFRESH_EVERY_MS = 5 * 60 * 1000;

/** Renueva cookie con actividad; cierra sesión tras 60 min sin uso. */
export function SessionActivity() {
  const router = useRouter();
  const lastRefresh = useRef(Date.now());
  const lastActivity = useRef(Date.now());

  useEffect(() => {
    let mounted = true;

    async function refreshSession() {
      try {
        const res = await fetch("/api/auth/refresh", { method: "POST" });
        if (!res.ok && mounted) {
          await fetch("/api/auth/logout", { method: "POST" });
          router.replace("/login?reason=timeout");
          router.refresh();
        }
      } catch {
        /* red en siguiente navegación */
      }
    }

    function onActivity() {
      lastActivity.current = Date.now();
      if (Date.now() - lastRefresh.current >= REFRESH_EVERY_MS) {
        lastRefresh.current = Date.now();
        void refreshSession();
      }
    }

    void refreshSession();
    lastRefresh.current = Date.now();

    const events = ["mousedown", "keydown", "scroll", "touchstart"] as const;
    for (const ev of events) {
      window.addEventListener(ev, onActivity, { passive: true });
    }

    const idleTimer = window.setInterval(() => {
      if (Date.now() - lastActivity.current >= IDLE_MS) {
        void (async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          if (mounted) {
            router.replace("/login?reason=timeout");
            router.refresh();
          }
        })();
      }
    }, 60_000);

    return () => {
      mounted = false;
      for (const ev of events) {
        window.removeEventListener(ev, onActivity);
      }
      window.clearInterval(idleTimer);
    };
  }, [router]);

  return null;
}
