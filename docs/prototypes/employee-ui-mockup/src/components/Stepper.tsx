import React from 'react';
import { ProcessStep } from '../types/process';

interface StepperProps {
  steps: ProcessStep[];
  activeNodeId: string;
  onSelectStep: (nodeId: string) => void;
}

export const Stepper: React.FC<StepperProps> = ({
  steps,
  activeNodeId,
  onSelectStep,
}) => {
  return (
    <div
      id="stepper-container"
      className="border border-slate-200/90 bg-slate-50/50 rounded-2xl p-2.5 sm:p-3 mb-6 flex items-center justify-between gap-1 sm:gap-2 overflow-x-auto scrollbar-none"
    >
      {steps.map((step, idx) => {
        const isActive = step.id === activeNodeId;
        const isCurrentActive = step.status === 'active' || isActive;

        return (
          <React.Fragment key={step.id}>
            <button
              id={`step-item-${step.id}`}
              onClick={() => onSelectStep(step.id)}
              className={`text-left transition-all cursor-pointer select-none shrink-0 ${
                isActive
                  ? 'border-2 border-emerald-500 rounded-xl bg-white px-3 py-2 sm:px-3.5 sm:py-2.5 shadow-xs'
                  : 'border border-slate-200 hover:border-slate-300 rounded-xl bg-white px-3 py-2 sm:px-3.5 sm:py-2.5 hover:bg-slate-50/80'
              }`}
            >
              <div className="flex items-center gap-2.5 sm:gap-3">
                {/* Step Circle */}
                <div
                  className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                    isActive
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
                >
                  {step.order}
                </div>

                {/* Step Text Info */}
                <div className="flex flex-col min-w-0 pr-1">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider leading-none ${
                      isActive ? 'text-emerald-700' : 'text-slate-400 font-medium'
                    }`}
                  >
                    {step.statusLabel}
                  </span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span
                      className={`text-xs sm:text-sm font-bold leading-none ${
                        isActive ? 'text-slate-900' : 'text-slate-700'
                      }`}
                    >
                      {step.code}
                    </span>
                    {isActive && (
                      <span
                        className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 inline-block animate-pulse"
                        title="Đang trong tiến trình"
                      />
                    )}
                  </div>
                </div>

                {/* Right Badge / Label */}
                {step.id === 'K01' ? (
                  <div className="border border-emerald-200 bg-emerald-50/80 text-emerald-800 rounded-lg px-2 py-1 text-[11px] font-medium leading-tight text-center shrink-0 ml-1">
                    <div>Khảo sát</div>
                    <div>đo</div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 font-normal shrink-0 ml-2 whitespace-nowrap">
                    {step.badgeText}
                  </div>
                )}
              </div>
            </button>

            {/* Separator chevron */}
            {idx < steps.length - 1 && (
              <span
                className="text-slate-400 font-light text-base px-1 shrink-0 select-none"
                aria-hidden="true"
              >
                &gt;
              </span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
