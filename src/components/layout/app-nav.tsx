"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/compra-agil", label: "Compra Ágil" },
  { href: "/licitaciones", label: "Licitaciones" },
  { href: "/kanban", label: "Kanban" },
  { href: "/historial", label: "Historial" },
  { href: "/bandeja", label: "Bandeja" },
  { href: "/crm/archivo", label: "Archivo CRM" },
  { href: "/ajustes", label: "Ajustes" },
] as const;

function isNavActive(pathname: string, href: string): boolean {
  if (href === "/compra-agil") {
    return pathname === "/" || pathname === "/compra-agil" || pathname.startsWith("/compra-agil/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNav({
  unreadCount,
  userName,
}: {
  unreadCount: number;
  userName?: string;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-1.5">
      {NAV_ITEMS.map((item) => {
        const active = isNavActive(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "relative rounded-lg px-3.5 py-2 text-sm font-medium transition-all",
              active
                ? "bg-[#d4a017] text-[#11233d] shadow-sm"
                : "text-white/90 hover:bg-white/15 hover:text-white"
            )}
          >
            {item.label}
            {item.href === "/bandeja" && unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
        );
      })}

      <Link
        href="/perfil"
        className={cn(
          "ml-1 flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm font-medium transition-all",
          pathname === "/perfil"
            ? "border-[#d4a017] bg-[#d4a017]/20 text-white"
            : "text-white/90 hover:border-white/40 hover:bg-white/10 hover:text-white"
        )}
      >
        <span className="flex size-6 items-center justify-center rounded-full bg-[#d4a017] text-xs font-bold text-[#11233d]">
          {(userName?.[0] ?? "U").toUpperCase()}
        </span>
        <span className="hidden max-w-[120px] truncate sm:inline">{userName ?? "Perfil"}</span>
      </Link>
    </nav>
  );
}
