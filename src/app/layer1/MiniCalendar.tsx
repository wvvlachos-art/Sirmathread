"use client";

import { useState } from "react";

// European-style mini calendar: week starts Monday, dates shown DD/MM/YYYY.
// `value` and `onChange` use ISO yyyy-mm-dd (what the database expects).

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function MiniCalendar({
  value,
  onChange,
  minDate,
  maxDate,
}: {
  value: string;
  onChange: (isoDate: string) => void;
  minDate?: string; // ISO yyyy-mm-dd; days before this are disabled
  maxDate?: string; // ISO yyyy-mm-dd; days after this are disabled
}) {
  const selected = value || iso(new Date());
  const selDate = new Date(selected + "T00:00:00");
  const [view, setView] = useState(new Date(selDate.getFullYear(), selDate.getMonth(), 1));

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = view.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const today = iso(new Date());

  return (
    <div className="rounded-md border border-hairline bg-paper p-2">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setView(new Date(year, month - 1, 1))}
          className="rounded px-2 py-0.5 text-ink hover:bg-paper-surface"
        >
          ‹
        </button>
        <span className="brand-serif text-sm text-ink">{monthLabel}</span>
        <button
          type="button"
          onClick={() => setView(new Date(year, month + 1, 1))}
          className="rounded px-2 py-0.5 text-ink hover:bg-paper-surface"
        >
          ›
        </button>
      </div>
      <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] text-muted">
        {WEEKDAYS.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const cellIso = iso(new Date(year, month, d));
          const isSel = cellIso === selected;
          const isToday = cellIso === today;
          const disabled = (minDate ? cellIso < minDate : false) || (maxDate ? cellIso > maxDate : false);
          return (
            <button
              type="button"
              key={i}
              disabled={disabled}
              onClick={() => !disabled && onChange(cellIso)}
              className={`h-7 rounded text-xs ${
                disabled
                  ? "cursor-not-allowed text-hairline"
                  : isSel
                    ? "bg-oxblood font-medium text-paper"
                    : isToday
                      ? "bg-paper-surface text-ink"
                      : "text-ink hover:bg-paper-surface"
              }`}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}
