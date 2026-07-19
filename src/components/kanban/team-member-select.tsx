"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface OrgUser {
  id: string;
  nombre: string;
  activo: boolean;
}

interface TeamMemberSelectProps {
  value: string | null;
  displayName?: string | null;
  onChange: (userId: string | null, nombre: string | null) => void;
  label?: string;
  compact?: boolean;
}

export function TeamMemberSelect({
  value,
  displayName,
  onChange,
  label = "Responsable interno",
  compact = false,
}: TeamMemberSelectProps) {
  const [members, setMembers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((data: { users?: OrgUser[] }) => {
        setMembers((data.users ?? []).filter((u) => u.activo));
      })
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, []);

  const selectedMember = members.find((m) => m.id === value);
  const triggerLabel = selectedMember
    ? `@${selectedMember.nombre}`
    : displayName?.trim()
      ? displayName
      : "Sin asignar";

  return (
    <div className={compact ? "min-w-0" : "space-y-1"}>
      {!compact && <Label>{label}</Label>}
      <Select
        value={value ?? "none"}
        disabled={loading}
        onValueChange={(v) => {
          if (v === "none") {
            onChange(null, null);
            return;
          }
          const member = members.find((m) => m.id === v);
          onChange(v, member?.nombre ?? null);
        }}
      >
        <SelectTrigger className={compact ? "h-8 text-xs" : undefined}>
          <SelectValue placeholder={loading ? "Cargando…" : compact ? "Resp." : "Sin asignar"}>
            {loading ? "…" : triggerLabel}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Sin asignar</SelectItem>
          {members.map((member) => (
            <SelectItem key={member.id} value={member.id}>
              @{member.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
