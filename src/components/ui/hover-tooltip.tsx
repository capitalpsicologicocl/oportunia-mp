"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";

export function HoverTooltip({
  text,
  children,
  className,
}: {
  text: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

  if (!text.trim()) return <>{children}</>;

  function showTooltip() {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({
      top: rect.top,
      left: rect.left,
      width: Math.min(Math.max(rect.width, 200), 520),
    });
    setVisible(true);
  }

  return (
    <>
      <span
        ref={ref}
        title={text}
        className={`inline-block max-w-full ${className ?? ""}`}
        onMouseEnter={showTooltip}
        onMouseLeave={() => setVisible(false)}
        onFocus={showTooltip}
        onBlur={() => setVisible(false)}
      >
        {children}
      </span>
      {visible &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: "fixed",
              top: coords.top - 8,
              left: coords.left,
              width: coords.width,
              transform: "translateY(-100%)",
              zIndex: 9999,
            }}
            className="pointer-events-none rounded-lg border border-[#d4a017]/30 bg-[#11233d] px-3 py-2 text-xs leading-relaxed font-normal whitespace-normal break-words text-white shadow-xl"
          >
            {text}
          </div>,
          document.body
        )}
    </>
  );
}
