"use client";
import React from "react";
import { format, subYears } from "date-fns";

interface DateRangeWidgetProps {
  start: string;
  setStart: (start: string) => void;
  end: string;
  setEnd: (end: string) => void;
}

export default function DateRangeWidget({
  start,
  setStart,
  end,
  setEnd
}: DateRangeWidgetProps) {
  const presets = [
    { label: "1M", years: 1/12 },
    { label: "3M", years: 0.25 },
    { label: "6M", years: 0.5 },
    { label: "1Y", years: 1 },
    { label: "2Y", years: 2 },
    { label: "3Y", years: 3 },
    { label: "5Y", years: 5 },
  ];

  const applyPreset = (years: number) => {
    const now = new Date();
    setEnd(format(now, "yyyy-MM-dd"));
    setStart(format(subYears(now, years), "yyyy-MM-dd"));
  };

  // Calculate min and max dates (Alchemy API fetches in 365-day chunks)
  const now = new Date();
  const maxDate = format(now, "yyyy-MM-dd");
  const minDate = format(subYears(now, 10), "yyyy-MM-dd"); // Allow up to 10 years back (fetched in chunks)

  return (
    <div className="card widget-compact">
      <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))] mb-4">Date Range</h3>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[rgb(var(--fg-secondary))] mb-2">Start Date</label>
          <input
            type="date"
            value={start}
            min={minDate}
            max={maxDate}
            onChange={(e) => setStart(e.target.value)}
            className="input w-full"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-[rgb(var(--fg-secondary))] mb-2">End Date</label>
          <input
            type="date"
            value={end}
            min={minDate}
            max={maxDate}
            onChange={(e) => setEnd(e.target.value)}
            className="input w-full"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-[rgb(var(--fg-secondary))] mb-2">Quick Presets</label>
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => applyPreset(preset.years)}
                className="badge hover:bg-[rgb(var(--bg-tertiary))] cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-[rgb(var(--fg-secondary))] mt-2">
            📊 Longer ranges are automatically fetched in 365-day chunks for optimal performance
          </p>
        </div>
      </div>
    </div>
  );
}
