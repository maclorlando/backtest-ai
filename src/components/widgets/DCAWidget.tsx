"use client";
import React from "react";
import { IconTrendingUp, IconCalendar } from "@tabler/icons-react";

interface DCAWidgetProps {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  capital: number;
  setCapital: (capital: number) => void;
  periodicity: "daily" | "weekly" | "monthly" | "yearly";
  setPeriodicity: (periodicity: "daily" | "weekly" | "monthly" | "yearly") => void;
  loading: boolean;
  error: string | null;
}

export default function DCAWidget({
  enabled,
  setEnabled,
  capital,
  setCapital,
  periodicity,
  setPeriodicity,
  loading,
  error,
}: DCAWidgetProps) {
  const periodicityOptions = [
    { value: "daily", label: "Daily", description: "Every day" },
    { value: "weekly", label: "Weekly", description: "Every week" },
    { value: "monthly", label: "Monthly", description: "Every month" },
    { value: "yearly", label: "Yearly", description: "Every year" },
  ] as const;

  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-blue-500/20 rounded-lg">
          <IconTrendingUp size={20} className="text-blue-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-[rgb(var(--fg-primary))]">
            Dollar Cost Averaging (DCA)
          </h3>
          <p className="text-sm text-[rgb(var(--fg-secondary))]">
            Simulate periodic investments over time
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* DCA Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-[rgb(var(--fg-primary))]">
              Enable DCA Strategy
            </label>
            <p className="text-xs text-[rgb(var(--fg-secondary))]">
              Invest a fixed amount at regular intervals
            </p>
          </div>
          <button
            onClick={() => setEnabled(!enabled)}
            disabled={loading}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              enabled ? "bg-blue-500" : "bg-gray-600"
            } ${loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {enabled && (
          <>
            {/* DCA Capital Input */}
            <div>
              <label className="block text-sm font-medium text-[rgb(var(--fg-primary))] mb-2">
                DCA Amount ($)
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={capital}
                  onChange={(e) => setCapital(Math.max(0, parseFloat(e.target.value) || 0))}
                  disabled={loading}
                  placeholder="100"
                  min="0"
                  step="0.01"
                  className="input w-full pl-8"
                />
                <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                  <span className="text-gray-400 text-sm">$</span>
                </div>
              </div>
              <p className="text-xs text-[rgb(var(--fg-secondary))] mt-1">
                Amount to invest at each interval
              </p>
            </div>

            {/* Periodicity Selection */}
            <div>
              <label className="block text-sm font-medium text-[rgb(var(--fg-primary))] mb-2">
                Investment Frequency
              </label>
              <div className="grid grid-cols-2 gap-2">
                {periodicityOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setPeriodicity(option.value)}
                    disabled={loading}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      periodicity === option.value
                        ? "border-blue-500 bg-blue-500/10 text-blue-400"
                        : "border-gray-600 bg-gray-800/50 text-[rgb(var(--fg-secondary))] hover:border-gray-500"
                    } ${loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <div className="flex items-center gap-2">
                      <IconCalendar size={16} />
                      <div>
                        <div className="font-medium text-sm">{option.label}</div>
                        <div className="text-xs opacity-75">{option.description}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* DCA Summary */}
            <div className="p-3 bg-blue-900/20 border border-blue-700 rounded-lg">
              <div className="text-sm font-semibold text-blue-300 mb-2">DCA Strategy Summary</div>
              <div className="text-xs text-blue-200 space-y-1">
                <div>• Invest ${capital.toFixed(2)} {periodicity}</div>
                <div>• Strategy: Dollar Cost Averaging</div>
                <div>• Reduces impact of market volatility</div>
              </div>
            </div>
          </>
        )}

        {error && (
          <div className="p-3 bg-red-900/20 border border-red-700 rounded-lg text-red-300 text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
