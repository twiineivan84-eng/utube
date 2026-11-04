import React, { useState, useEffect } from 'react';
import { Clock, Globe } from 'lucide-react';
import { getUgandaDateTimeParts, UGANDA_TIMEZONE_LABEL } from '../../utils/timezone';

interface UgandaClockProps {
  variant?: 'header' | 'dashboard' | 'compact';
  className?: string;
}

export const UgandaClock: React.FC<UgandaClockProps> = ({ variant = 'header', className = '' }) => {
  const [clockData, setClockData] = useState(() => getUgandaDateTimeParts(new Date()));

  useEffect(() => {
    // Update every 1000ms
    const timer = setInterval(() => {
      setClockData(getUgandaDateTimeParts(new Date()));
    }, 1000);

    // Guaranteed timer cleanup on component unmount
    return () => {
      clearInterval(timer);
    };
  }, []);

  if (variant === 'compact') {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-mono font-medium text-slate-700 ${className}`}
        title="Official East Africa Time (Africa/Kampala, UTC+03:00)"
      >
        <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
        <span className="font-semibold text-slate-900">{clockData.formattedTime}</span>
        <span className="text-[10px] text-blue-700 font-bold bg-blue-50 px-1 py-0.5 rounded border border-blue-200">
          {UGANDA_TIMEZONE_LABEL}
        </span>
      </div>
    );
  }

  if (variant === 'dashboard') {
    return (
      <div
        className={`bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex items-center justify-between ${className}`}
        title="Official SACCO Standard Time (Africa/Kampala, UTC+03:00)"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-wider font-bold text-slate-500">
                Official SACCO System Time
              </span>
              <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <div className="text-lg font-bold text-slate-900 font-mono tracking-tight flex items-baseline gap-2 mt-0.5">
              <span>{clockData.formattedTime}</span>
              <span className="text-xs font-semibold px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded font-sans">
                {UGANDA_TIMEZONE_LABEL}
              </span>
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="text-xs font-medium text-slate-800">
            {clockData.weekday}, {clockData.formattedDate}
          </div>
          <div className="text-[11px] text-slate-500 flex items-center justify-end gap-1 mt-0.5">
            <Globe className="w-3 h-3 text-slate-400" />
            <span>Africa/Kampala (UTC+03:00)</span>
          </div>
        </div>
      </div>
    );
  }

  // Default: Header variant
  return (
    <div
      className={`hidden lg:flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-50/80 hover:bg-slate-100 border border-slate-200 text-xs transition select-none ${className}`}
      title="Official SACCO Time • Africa/Kampala (EAT, UTC+03:00) • Real-Time Synchronized"
    >
      <div className="flex items-center gap-1.5 text-blue-700">
        <Clock className="w-3.5 h-3.5" />
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="font-mono font-bold text-slate-900 text-[13px] tracking-tight">
          {clockData.formattedTime}
        </span>
        <span className="px-1 py-0.2 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
          {UGANDA_TIMEZONE_LABEL}
        </span>
      </div>

      <span className="h-3 w-px bg-slate-300" />

      <div className="text-[11px] text-slate-600 font-medium">
        <span>{clockData.weekday}, {clockData.day} {clockData.monthStr} {clockData.year}</span>
      </div>
    </div>
  );
};
