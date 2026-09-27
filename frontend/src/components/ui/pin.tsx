"use client";

import { useRef } from "react";
import { cn } from "./base";

// Four masked boxes for the transaction PIN, with auto-advance and paste support.
export function PinInput({ value, onChange, autoFocus, invalid }: { value: string; onChange: (v: string) => void; autoFocus?: boolean; invalid?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(4, " ").slice(0, 4).split("");

  const set = (i: number, ch: string) => {
    const arr = value.padEnd(4, " ").slice(0, 4).split("");
    arr[i] = ch || " ";
    onChange(arr.join("").replace(/ /g, ""));
  };

  return (
    <div className="flex gap-2.5">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="password"
          inputMode="numeric"
          maxLength={1}
          autoFocus={autoFocus && i === 0}
          value={d.trim()}
          aria-label={`PIN digit ${i + 1}`}
          onChange={(e) => {
            const ch = e.target.value.replace(/\D/g, "").slice(-1);
            set(i, ch);
            if (ch && i < 3) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !digits[i].trim() && i > 0) refs.current[i - 1]?.focus();
          }}
          onPaste={(e) => {
            const t = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
            if (t) {
              e.preventDefault();
              onChange(t);
              refs.current[Math.min(3, t.length)]?.focus();
            }
          }}
          className={cn(
            "h-12 w-12 rounded-xl border bg-surface text-center text-lg font-semibold text-ink transition focus:outline-none focus:ring-4",
            invalid ? "border-danger focus:ring-danger/15" : "border-line focus:border-brand focus:ring-brand/10",
          )}
        />
      ))}
    </div>
  );
}
