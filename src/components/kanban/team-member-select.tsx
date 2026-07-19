"use client";

import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface OrgUser {
  id: string;
  nombre: string;
  activo: boolean;
}

interface TeamMemberSelectProps {
  value: string | null;
  displayName?: string | null;
  onChange: (userId: string | null, display: string | null) => void;
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
  const [mode, setMode] = useState<"none" | "member" | "custom">("none");
  const [customText, setCustomText] = useState("");

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((data: { users?: OrgUser[] }) => {
        setMembers((data.users ?? []).filter((u) => u.activo));
      })
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (value && members.some((m) => m.id === value)) {
      setMode("member");
      setCustomText("");
      return;
    }
    const display = displayName?.trim() ?? "";
    if (display && !value) {
      setMode("custom");
      setCustomText(display.startsWith("@") ? display.slice(1) : display);
      return;
    }
    setMode("none");
    setCustomText("");
  }, [value, displayName, members]);

  const selectedMember = members.find((m) => m.id === value);
  const triggerLabel = selectedMember
    ? `@${selectedMember.nombre}`
    : mode === "custom" && customText
      ? customText
      : displayName?.trim()
        ? displayName
        : "Sin asignar";

  function handleSelectChange(v: string | null) {
    if (v === "none" || !v) {
      setMode("none");
      setCustomText("");
      onChange(null, null);
      return;
    }
    if (v === "custom") {
      setMode("custom");
      onChange(null, customText.trim() || null);
      return;
    }
    const member = members.find((m) => m.id === v);
    setMode("member");
    setCustomText("");
    onChange(v, member?.nombre ?? null);
  }

  function handleCustomTextChange(text: string) {
    setCustomText(text);
    onChange(null, text.trim() || null);
  }

  const selectValue = mode === "member" && value ? value : mode === "custom" ? "custom" : "none";

  return (
    <div className={compact ? "min-w-0 space-y-1" : "space-y-1"}>
      {!compact && <Label>{label}</Label>}
      <Select
        value={selectValue}
        disabled={loading}
        onValueChange={handleSelectChange}
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
          <SelectItem value="custom">Otro (escribir nombre)</SelectItem>
        </SelectContent>
      </Select>
      {mode === "custom" && (
        <Input
          value={customText}
          placeholder="Nombre del responsable externo"
          className={compact ? "h-8 text-xs" : undefined}
          onChange={(e) => handleCustomTextChange(e.target.value)}
        />
      )}
    </div>
  );
}
