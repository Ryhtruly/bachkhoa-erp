import React from 'react';

/**
 * Badge — Nhãn trạng thái dùng chung
 *
 * Props:
 *   children: string
 *   variant?: 'success'|'danger'|'warning'|'info'|'neutral'|'orange'
 *   dot?: boolean   — hiển thị chấm tròn trước text
 *   size?: 'sm'|'md'
 *
 * Hoặc dùng presets:
 *   statusMap: Record<string, variant> để map tự động
 */
export function Badge({ children, variant = 'neutral', dot = false, size = 'md' }) {
  return (
    <span className={`badge badge--${variant} badge--${size}`}>
      {dot && <span className="badge__dot" />}
      {children}
    </span>
  );
}


/**
 * StatusBadge — Badge tự động map trạng thái theo domain
 * Đã có preset cho: hồ sơ, hợp đồng, lead pipeline
 *
 * Props:
 *   status: string
 *   domain?: 'hoso' | 'hopdong' | 'lead' | 'default'
 */
const STATUS_MAPS = {
  hoso: {
    'Hoàn thành': 'success',
    'Nộp thành công - Chờ kết quả': 'success',
    'Đang xử lý': 'info',
    'Mới tiếp nhận': 'info',
    'Sắp đến hạn': 'warning',
    'Trễ hạn': 'danger',
    'Đã hủy': 'neutral',
  },
  hopdong: {
    'Đã tất toán': 'success',
    'Chờ thanh toán': 'warning',
    'Còn nợ': 'warning',
    'Quá hạn': 'danger',
  },
  lead: {
    'Chốt': 'success',
    'Đàm phán': 'info',
    'Báo giá': 'warning',
    'Tiếp cận': 'neutral',
    'Từ chối': 'danger',
  },
};

export function StatusBadge({ status, domain = 'default' }) {
  const map = STATUS_MAPS[domain] ?? {};
  const variant = map[status] ?? 'neutral';
  return <Badge variant={variant} dot>{status || '—'}</Badge>;
}


/**
 * WarningBadge — Badge cảnh báo deadline
 */
export function WarningBadge({ warning }) {
  const variantMap = {
    'Hoàn thành': 'success',
    'Trong hạn': 'info',
    'Sắp đến hạn': 'warning',
    'Trễ hạn': 'danger',
    'Chưa có deadline': 'neutral',
  };
  return <Badge variant={variantMap[warning] ?? 'neutral'} dot>{warning || '—'}</Badge>;
}


/**
 * Tag — Nhãn nhỏ không có trạng thái (VD: loại dịch vụ, phòng ban)
 */
export function Tag({ children, color }) {
  return (
    <span
      className="tag"
      style={color ? { background: color + '22', color } : undefined}
    >
      {children}
    </span>
  );
}
