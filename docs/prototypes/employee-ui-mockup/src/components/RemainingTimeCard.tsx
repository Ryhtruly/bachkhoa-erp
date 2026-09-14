import React from 'react';
import { Clock } from 'lucide-react';

interface RemainingTimeCardProps {
  remainingTime: string;
  onTimeStatus: string;
}

export const RemainingTimeCard: React.FC<RemainingTimeCardProps> = ({
  remainingTime,
  onTimeStatus,
}) => {
  return (
    <div
      id="card-remaining-time"
      className="border border-amber-200/90 bg-amber-50/35 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-2xs transition-all"
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-amber-100/80 text-amber-700 flex items-center justify-center shrink-0">
          <Clock className="w-5 h-5 stroke-[1.8]" />
        </div>
        <div className="min-w-0">
          <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">
            THỜI GIAN CÒN LẠI
          </span>
          <div className="text-base md:text-lg font-bold text-slate-800 mt-0.5">
            {remainingTime}
          </div>
        </div>
      </div>

      <div className="shrink-0">
        <span
          id="badge-ontime-status"
          className="inline-block bg-amber-100/90 text-amber-800 text-xs font-semibold px-3 py-1 rounded-md border border-amber-200 shadow-2xs"
        >
          {onTimeStatus}
        </span>
      </div>
    </div>
  );
};
