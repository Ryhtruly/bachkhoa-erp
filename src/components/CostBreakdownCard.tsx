import React from 'react';

interface CostBreakdownCardProps {
  taskCost: number;
  bonusRate: number;
  bonusAmount: number;
  totalEstimatedCost: number;
  currency: string;
}

export const CostBreakdownCard: React.FC<CostBreakdownCardProps> = ({
  taskCost,
  bonusRate,
  bonusAmount,
  totalEstimatedCost,
  currency,
}) => {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('vi-VN').format(val);
  };

  return (
    <div
      id="card-cost-breakdown"
      className="border border-amber-200/90 bg-amber-50/25 rounded-2xl p-5 shadow-2xs transition-all"
    >
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] font-bold inline-flex items-center justify-center shrink-0">
            đ
          </span>
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            CHI PHÍ & KHOÁN NHIỆM VỤ
          </h3>
        </div>
        <span className="italic text-[11px] text-slate-400 font-normal">
          Đơn vị: {currency}
        </span>
      </div>

      <div className="space-y-2.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-600 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block shrink-0" />
            Khoán nhiệm vụ
          </span>
          <span className="font-bold text-slate-800 text-sm">
            {formatCurrency(taskCost)}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-slate-600 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block shrink-0" />
            Thưởng hoàn thành đúng hạn
            <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5 rounded ml-1">
              +{bonusRate}%
            </span>
          </span>
          <span className="font-bold text-slate-800 text-sm">
            {formatCurrency(bonusAmount)}
          </span>
        </div>
      </div>

      <div className="border-t border-dashed border-amber-300/80 my-3.5" />

      <div className="flex items-end justify-between">
        <div>
          <span className="text-xs font-bold text-slate-800 block tracking-wide">
            TỔNG THANH TOÁN DỰ KIẾN
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">
            Sau khi hoàn thành và nghiệm thu
          </span>
        </div>
        <div className="text-right">
          <span className="text-lg md:text-xl font-bold text-slate-900">
            {formatCurrency(totalEstimatedCost)}
          </span>
          <span className="text-xs font-bold text-slate-700 ml-1">
            {currency}
          </span>
        </div>
      </div>
    </div>
  );
};
