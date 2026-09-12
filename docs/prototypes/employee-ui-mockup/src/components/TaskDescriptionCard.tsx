import React from 'react';
import { User } from 'lucide-react';

interface TaskDescriptionCardProps {
  description: string;
  assignee: string;
  assigneeRole: string;
}

export const TaskDescriptionCard: React.FC<TaskDescriptionCardProps> = ({
  description,
  assignee,
  assigneeRole,
}) => {
  return (
    <div
      id="card-task-description"
      className="border border-slate-200/90 bg-white rounded-2xl p-5 shadow-2xs transition-all"
    >
      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
        MÔ TẢ NHIỆM VỤ
      </h3>

      <p className="text-[13px] text-slate-600 leading-relaxed">
        {description}
      </p>

      <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-500">
        <User className="w-4 h-4 text-slate-400 shrink-0" />
        <span>
          Người phụ trách:{' '}
          <strong className="font-bold text-slate-800">
            {assignee} ({assigneeRole})
          </strong>
        </span>
      </div>
    </div>
  );
};
