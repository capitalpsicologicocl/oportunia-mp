"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

const PRIMARY_NAV = [
  { href: "/compra-agil", label: "Compra Ágil" },
  { href: "/licitaciones", label: "Licitaciones" },
  { href: "/kanban", label: "Kanban" },
] as const;

const MORE_NAV = [
  { href: "/bandeja", label: "Bandeja" },
  { href: "/crm/archivo", label: "Archivo CRM" },
  { href: "/historial", label: "Descartadas" },
  { href: "/ajustes", label: "Ajustes" },
] as const;

function isNavActive(pathname: string, href: string): boolean {
  if (href === "/compra-agil") {
    return pathname === "/compra-agil" || pathname.startsWith("/compra-agil/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function navLinkClass(active: boolean): string {
  return cn(
    "relative whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all",
    active
      ? "bg-[#d4a017] text-[#11233d] shadow-sm"
      : "text-white/90 hover:bg-white/15 hover:text-white"
  );
}

export function AppNav({
  unreadCount,
  userName,
}: {
  unreadCount: number;
  userName?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreActive = MORE_NAV.some((item) => isNavActive(pathname, item.href));

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <nav className="flex shrink-0 items-center gap-1">
      {PRIMARY_NAV.map((item) => (
        <Link key={item.href} href={item.href} className={navLinkClass(isNavActive(pathname, item.href))}>
          {item.label}
        </Link>
      ))}

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className={cn(
            "inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-all",
            moreActive || menuOpen
              ? "bg-white/15 text-white"
              : "text-white/90 hover:bg-white/15 hover:text-white"
          )}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          <Menu className="size-4" />
          Más
          <ChevronDown className={cn("size-3.5 transition-transform", menuOpen && "rotate-180")} />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full z-30 mt-1 min-w-[160px] rounded-lg border border-white/10 bg-[#11233d] py-1 shadow-xl">
            {MORE_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  "relative block px-4 py-2 text-sm transition-colors hover:bg-white/10",
                  isNavActive(pathname, item.href) ? "bg-[#d4a017]/20 text-[#d4a017]" : "text-white/90"
                )}
              >
                {item.label}
                {item.href === "/bandeja" && unreadCount > 0 && (
                  <span className="ml-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      <Link
        href="/perfil"
        className={cn(
          "ml-1 flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-white/20 px-3 py-2 text-sm font-medium transition-all",
          pathname === "/perfil"
            ? "border-[#d4a017] bg-[#d4a017]/20 text-white"
            : "text-white/90 hover:border-white/40 hover:bg-white/10 hover:text-white"
        )}
      >
        <span className="flex size-6 items-center justify-center rounded-full bg-[#d4a017] text-xs font-bold text-[#11233d]">
          {(userName?.[0] ?? "U").toUpperCase()}
        </span>
        <span className="hidden max-w-[140px] truncate lg:inline">{userName ?? "Perfil"}</span>
      </Link>

      <button
        type="button"
        onClick={handleLogout}
        disabled={loggingOut}
        title="Cerrar sesión"
        className="ml-0.5 inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-medium text-white/80 transition-all hover:bg-white/10 hover:text-white disabled:opacity-50"
      >
        <LogOut className="size-4" />
        <span className="hidden sm:inline">{loggingOut ? "…" : "Salir"}</span>
      </button>
    </nav>
  );
}
