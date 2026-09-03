import React from 'react';
import { FolderKanban } from 'lucide-react';

interface NodeInfoCardProps {
  title: string;
  codeTag: string;
}

export const NodeInfoCard: React.FC<NodeInfoCardProps> = ({ title, codeTag }) => {
  return (
    <div
      id="card-node-info"
      className="border border-amber-200/90 bg-amber-50/35 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-2xs transition-all"
    >
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-amber-100/80 text-amber-700 flex items-center justify-center shrink-0">
          <FolderKanban className="w-5 h-5 stroke-[1.8]" />
        </div>
        <div className="min-w-0">
          <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">
            TÊN NODE HIỆN TẠI
          </span>
          <h2 className="text-sm md:text-[15px] font-bold text-slate-800 mt-0.5 truncate">
            {title}
          </h2>
        </div>
      </div>

      <div className="shrink-0">
        <span
          id="tag-node-code"
          className="inline-block border border-amber-300 bg-white text-amber-800 text-xs px-2.5 py-1 rounded-md font-medium shadow-2xs"
        >
          {codeTag}
        </span>
      </div>
    </div>
  );
};
