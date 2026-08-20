import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Target, Trophy, Award, CheckCircle2, Clock, Users, RefreshCw, TrendingUp } from 'lucide-react';
import { DatePicker, Badge, DataTable } from '../components/ui';
import { apiFetch } from '../lib/api';

const getCurrentMonth = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

export default function KPI() {
  const [kpiList, setKpiList] = useState([]);
  const [month, setMonth] = useState(getCurrentMonth);
  const [loading, setLoading] = useState(true);

  const fetchKpi = useCallback(async (selectedMonth) => {
    const targetMonth = selectedMonth || month;
    setLoading(true);
    try {
      const data = await apiFetch(`/api/kpi/scores?month=${targetMonth}`);
      setKpiList(data?.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    fetchKpi(month);
  }, [fetchKpi, month]);

  const handleMonthChange = (newMonth) => {
    if (newMonth) {
      setMonth(newMonth);
    }
  };

  const columns = useMemo(() => [
    {
      key: 'rank',
      label: 'HẠNG',
      width: 80,
      align: 'center',
      render: (_, __, index) => {
        if (index === 0) {
          return (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: '#fef3c7',
              color: '#b45309',
              fontWeight: 800,
              fontSize: '0.85rem',
            }}>
              <Trophy size={14} />
            </span>
          );
        }
        return (
          <span style={{ fontWeight: 700, color: 'var(--text-tertiary)', fontSize: '0.88rem' }}>
            #{index + 1}
          </span>
        );
      }
    },
    {
      key: 'employee',
      label: 'NHÂN SỰ',
      width: 220,
      render: (v, _, index) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ color: 'var(--text-primary)', fontSize: '0.92rem' }}>{v}</strong>
          {index === 0 && (
            <span style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 6,
              background: 'rgba(245, 158, 11, 0.15)',
              color: '#b45309'
            }}>
              Top 1
            </span>
          )}
        </div>
      )
    },
    {
      key: 'total_completed',
      label: 'SỐ HỒ SƠ HT (TARGET > 10)',
      width: 190,
      align: 'center',
      render: (v) => (
        <span style={{
          fontWeight: 700,
          fontSize: '0.95rem',
          color: Number(v) >= 10 ? '#10b981' : Number(v) > 0 ? '#3b82f6' : '#64748b'
        }}>
          {v}
        </span>
      )
    },
    {
      key: 'on_time_rate',
      label: 'TỶ LỆ ĐÚNG HẠN',
      width: 160,
      align: 'center',
      render: (v) => (
        <Badge variant={Number(v) >= 90 ? 'success' : Number(v) >= 75 ? 'warning' : 'danger'} dot>
          {v}%
        </Badge>
      )
    },
    {
      key: 'rejections',
      label: 'LỖI NỘP LẠI',
      width: 130,
      align: 'center',
      render: (v) => (
        <span style={{
          fontWeight: 600,
          color: Number(v) > 0 ? '#ef4444' : '#64748b'
        }}>
          {v}
        </span>
      )
    },
    {
      key: 'avg_time',
      label: 'TG XỬ LÝ TB (NGÀY)',
      width: 160,
      align: 'center',
      render: (v) => (
        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
          {v} ngày
        </span>
      )
    },
    {
      key: 'final_score',
      label: 'ĐIỂM KPI',
      width: 130,
      align: 'center',
      render: (v) => (
        <span style={{
          display: 'inline-block',
          padding: '4px 12px',
          borderRadius: 8,
          fontWeight: 800,
          fontSize: '0.95rem',
          color: Number(v) >= 95 ? '#065f46' : Number(v) >= 80 ? '#1e40af' : '#854d0e',
          background: Number(v) >= 95 ? 'rgba(16, 185, 129, 0.15)' : Number(v) >= 80 ? 'rgba(59, 130, 246, 0.15)' : 'rgba(245, 158, 11, 0.15)',
        }}>
          {v}
        </span>
      )
    },
    {
      key: 'performance',
      label: 'ĐÁNH GIÁ',
      width: 150,
      align: 'center',
      render: (v) => {
        const variant =
          v === 'Xuất sắc' ? 'success'
          : v === 'Tốt' ? 'primary'
          : v === 'Khá' ? 'warning'
          : v === 'Cần cố gắng' ? 'danger'
          : 'neutral';
        return <Badge variant={variant}>{v}</Badge>;
      }
    }
  ], []);

  const stats = useMemo(() => {
    if (!kpiList.length) return null;
    const totalEmps = kpiList.length;
    const avgOnTime = (kpiList.reduce((s, k) => s + Number(k.on_time_rate || 0), 0) / (totalEmps || 1)).toFixed(1);
    const topPerformer = [...kpiList].sort((a, b) => Number(b.final_score || 0) - Number(a.final_score || 0))[0];
    const totalTasksDone = kpiList.reduce((s, k) => s + Number(k.total_completed || 0), 0);
    return { totalEmps, avgOnTime, topPerformer, totalTasksDone };
  }, [kpiList]);

  return (
    <section className="tab-pane active" id="tab-kpi">
      <div className="card" style={{ padding: '24px', borderRadius: '14px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: 16
        }}>
          <div>
            <h3 style={{
              fontSize: '1.25rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              margin: 0,
              color: 'var(--text-primary)'
            }}>
              <Target color="var(--orange-500)" size={24} /> Bảng Điểm KPI Nhân Sự
            </h3>
            <p className="sub" style={{ margin: '4px 0 0 0', color: 'var(--text-tertiary)', fontSize: '0.88rem' }}>
              Thuật toán tự động chấm điểm hiệu suất thực hiện nhiệm vụ (Đúng hạn / Trễ hạn / Nghiệm thu).
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ margin: 0, whiteSpace: 'nowrap', fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
              Kỳ Đánh Giá:
            </label>
            <div style={{ width: '180px' }}>
              <DatePicker
                selectionMode="month"
                value={month}
                onChange={handleMonthChange}
                placeholder="Chọn tháng"
                dialogLabel="Chọn kỳ đánh giá KPI"
                clearable={false}
              />
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => fetchKpi(month)}
              title="Làm mới bảng điểm KPI"
              style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38, padding: '0 12px' }}
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>

        {/* Thẻ thống kê KPI tổng quan */}
        {stats && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16,
            marginBottom: 24
          }}>
            <div style={{
              background: 'var(--bg-secondary, #f8fafc)',
              border: '1px solid var(--border-color, #e2e8f0)',
              borderRadius: 12,
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 14
            }}>
              <div style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: 'rgba(99, 102, 241, 0.1)',
                color: '#6366f1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Users size={22} />
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Tổng nhân sự đánh giá
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
                  {stats.totalEmps} người
                </div>
              </div>
            </div>

            <div style={{
              background: 'var(--bg-secondary, #f8fafc)',
              border: '1px solid var(--border-color, #e2e8f0)',
              borderRadius: 12,
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 14
            }}>
              <div style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: 'rgba(16, 185, 129, 0.1)',
                color: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <CheckCircle2 size={22} />
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Hồ sơ hoàn thành
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#10b981', marginTop: 2 }}>
                  {stats.totalTasksDone} nhiệm vụ
                </div>
              </div>
            </div>

            <div style={{
              background: 'var(--bg-secondary, #f8fafc)',
              border: '1px solid var(--border-color, #e2e8f0)',
              borderRadius: 12,
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 14
            }}>
              <div style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: 'rgba(59, 130, 246, 0.1)',
                color: '#3b82f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Clock size={22} />
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Tỷ lệ đúng hạn TB
                </div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#3b82f6', marginTop: 2 }}>
                  {stats.avgOnTime}%
                </div>
              </div>
            </div>

            <div style={{
              background: 'var(--bg-secondary, #f8fafc)',
              border: '1px solid var(--border-color, #e2e8f0)',
              borderRadius: 12,
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 14
            }}>
              <div style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: 'rgba(245, 158, 11, 0.12)',
                color: '#d97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Trophy size={22} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Dẫn đầu tháng này
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#047857', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {stats.topPerformer?.employee || '—'} ({stats.topPerformer?.final_score || 0}đ)
                </div>
              </div>
            </div>
          </div>
        )}

        <DataTable
          columns={columns}
          data={kpiList}
          loading={loading}
          rowKey="employee"
          emptyText={`Chưa có dữ liệu KPI cho kỳ ${month}`}
          pageSize={15}
        />
      </div>
    </section>
  );
}
