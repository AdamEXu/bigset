"use client";

import { useId } from "react";
import {
  REASONING_LEVELS,
  REASONING_LEVEL_LABELS,
  type ReasoningLevel,
} from "@/lib/backend";

interface ReasoningSliderProps {
  value: ReasoningLevel;
  /** False when the level is the provider/role default rather than a choice. */
  overridden: boolean;
  /** Called with a level to pin it, or null to return the role to auto. */
  onChange: (level: ReasoningLevel | null) => void;
  disabled?: boolean;
  /** Shown in place of the control when the provider has no reasoning knob. */
  unsupportedReason?: string;
}

/**
 * Discrete slider over the canonical reasoning scale.
 *
 * "Auto" is deliberately not a stop on the track — it is a mode. The thumb
 * always sits on the level that will actually be used, so an auto role still
 * shows where it landed; moving the thumb pins that choice, and "Reset to auto"
 * hands the role back to the provider/role default.
 */
export function ReasoningSlider({
  value,
  overridden,
  onChange,
  disabled = false,
  unsupportedReason,
}: ReasoningSliderProps) {
  const id = useId();
  const index = Math.max(0, REASONING_LEVELS.indexOf(value));
  const max = REASONING_LEVELS.length - 1;
  const progress = max === 0 ? 0 : (index / max) * 100;

  if (unsupportedReason) {
    return (
      <p style={{ fontSize: "12px", color: "var(--muted)", paddingBottom: "16px" }}>
        {unsupportedReason}
      </p>
    );
  }

  return (
    <div style={{ paddingBottom: "16px", opacity: disabled ? 0.5 : 1 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "12px",
          marginBottom: "8px",
        }}
      >
        <label htmlFor={id} style={{ fontSize: "12px", color: "var(--muted)" }}>
          Reasoning effort
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--foreground)" }}>
            {REASONING_LEVEL_LABELS[value]}
          </span>
          {overridden ? (
            <button
              type="button"
              onClick={() => onChange(null)}
              disabled={disabled}
              style={{
                fontSize: "12px",
                color: "var(--link)",
                textDecoration: "underline",
                textDecorationColor: "var(--link-decoration)",
                textUnderlineOffset: "2px",
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              Reset to auto
            </button>
          ) : (
            <span
              style={{
                fontSize: "11px",
                fontWeight: 500,
                color: "var(--muted)",
                border: "1px solid var(--border)",
                borderRadius: "999px",
                padding: "1px 8px",
              }}
            >
              Auto
            </span>
          )}
        </div>
      </div>

      <input
        id={id}
        type="range"
        min={0}
        max={max}
        step={1}
        value={index}
        disabled={disabled}
        aria-valuetext={REASONING_LEVEL_LABELS[value]}
        onChange={(event) =>
          onChange(REASONING_LEVELS[Number(event.target.value)])
        }
        style={{
          width: "100%",
          height: "4px",
          borderRadius: "999px",
          appearance: "none",
          WebkitAppearance: "none",
          accentColor: "var(--accent)",
          cursor: disabled ? "not-allowed" : "pointer",
          background: `linear-gradient(to right, var(--accent) ${progress}%, var(--border) ${progress}%)`,
        }}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "6px",
          fontSize: "11px",
          color: "var(--muted)",
        }}
      >
        {REASONING_LEVELS.map((level) => (
          <span
            key={level}
            style={{
              color: level === value ? "var(--foreground)" : undefined,
              fontWeight: level === value ? 500 : undefined,
            }}
          >
            {REASONING_LEVEL_LABELS[level]}
          </span>
        ))}
      </div>
    </div>
  );
}
