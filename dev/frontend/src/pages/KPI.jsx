import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Target, RefreshCw, TrendingUp, Award } from 'lucide-react';
import { DatePicker, Badge, DataTable } from '../components/ui';
import { apiFetch } from '../lib/api';

const getCurrentMonth = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const normalizeKpiScore = (value) => Math.min(100, Math.max(0, Number(value || 0)));

export default function KPI() {
  const [kpiList, setKpiList] = useState([]);
  const [month, setMonth] = useState(getCurrentMonth);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchKpi = useCallback(async (selectedMonth) => {
    const targetMonth = selectedMonth || month;
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch(`/api/kpi/scores?month=${targetMonth}`);
      setKpiList(data?.data || []);
    } catch (err) {
      console.error(err);
      setKpiList([]);
      setError('Không tải được dữ liệu KPI');
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

  const rankedKpiList = useMemo(() => {
    if (!kpiList.length) return [];

    // Clone and sort with tie-breaking criteria
    const sorted = [...kpiList].sort((a, b) => {
      const scoreA = normalizeKpiScore(a.final_score);
      const scoreB = normalizeKpiScore(b.final_score);
      if (scoreB !== scoreA) return scoreB - scoreA;

      const tasksA = Number(a.total_completed || 0);
      const tasksB = Number(b.total_completed || 0);
      if (tasksB !== tasksA) return tasksB - tasksA;

      const onTimeA = Number(a.on_time_rate || 0);
      const onTimeB = Number(b.on_time_rate || 0);
      if (onTimeB !== onTimeA) return onTimeB - onTimeA;

      const rejA = Number(a.rejections || 0);
      const rejB = Number(b.rejections || 0);
      if (rejA !== rejB) return rejA - rejB;

      const timeA = Number(a.avg_time || 0);
      const timeB = Number(b.avg_time || 0);
      if (timeA !== timeB) return timeA - timeB;

      return (a.employee || '').localeCompare(b.employee || '', 'vi');
    });

    // Assign standard competition rank with 0-score exclusion
    let currentRank = 1;
    return sorted.map((item, i) => {
      const score = normalizeKpiScore(item.final_score);
      const tasks = Number(item.total_completed || 0);

      // Nếu chưa có hoạt động / điểm = 0 và nhiệm vụ = 0 -> Chưa xếp hạng
      if (score === 0 && tasks === 0) {
        return {
          ...item,
          rank: null,
          isTop1: false,
        };
      }

      if (i > 0) {
        const prev = sorted[i - 1];
        const previousScore = normalizeKpiScore(prev.final_score);
        const isTied = previousScore === score
          && Number(prev.total_completed || 0) === tasks
          && Number(prev.on_time_rate || 0) === Number(item.on_time_rate || 0)
          && Number(prev.rejections || 0) === Number(item.rejections || 0)
          && Number(prev.avg_time || 0) === Number(item.avg_time || 0);

        if (!isTied) {
          currentRank = i + 1;
        }
      } else {
        currentRank = 1;
      }

      return {
        ...item,
        rank: currentRank,
        isTop1: currentRank === 1 && score > 0,
      };
    });
  }, [kpiList]);

  const columns = useMemo(() => [
    {
      key: 'rank',
      label: 'HẠNG',
      width: 80,
      align: 'center',
      render: (_, row) => {
        if (row.rank === null || row.rank === undefined) {
          return <span className="kpi-rank kpi-rank--muted">—</span>;
        }
        return <span className={`kpi-rank ${row.rank === 1 && row.isTop1 ? 'kpi-rank--leader' : ''}`}>#{row.rank}</span>;
      }
    },
    {
      key: 'employee',
      label: 'NHÂN SỰ',
      width: 220,
      render: (v, row) => (
        <div className="kpi-employee">
          <strong className="kpi-employee__name">{v}</strong>
          {row.isTop1 && (
            <span className="kpi-leader-badge">Dẫn đầu</span>
          )}
        </div>
      )
    },
    {
      key: 'total_completed',
      label: <span title="Số hồ sơ hoàn thành; mốc tham chiếu là trên 10 hồ sơ">SỐ HỒ SƠ HT</span>,
      width: 190,
      align: 'center',
      render: (v) => <span className={`kpi-completion ${Number(v) >= 10 ? 'kpi-completion--strong' : Number(v) > 0 ? 'kpi-completion--active' : 'kpi-completion--muted'}`}>{v}</span>
    },
    {
      key: 'on_time_rate',
      label: 'TỶ LỆ ĐÚNG HẠN',
      width: 160,
      align: 'center',
      render: (v) => v == null ? (
        <span className="kpi-completion kpi-completion--muted">—</span>
      ) : (
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
          color: Number(v) > 0 ? '#ef4444' : 'var(--text-tertiary)'
        }}>
          {v}
        </span>
      )
    },
    {
      key: 'avg_time',
      label: <span title="Thời gian xử lý trung bình, tính theo ngày">TG XỬ LÝ TB</span>,
      width: 160,
      align: 'center',
      render: (v) => <span className="kpi-average-time">{v} ngày</span>
    },
    {
      key: 'final_score',
      label: 'ĐIỂM KPI',
      width: 130,
      align: 'center',
      render: (v) => {
        const score = Math.min(100, Math.max(0, Number(v || 0)));
        const level = score >= 95 ? 'excellent' : score >= 80 ? 'good' : 'attention';
        return <span className={`kpi-score kpi-score--${level}`}>{score}</span>;
      }
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
    if (!rankedKpiList.length) return null;
    const totalEmps = rankedKpiList.length;
    const totalTasksDone = rankedKpiList.reduce((s, k) => s + Number(k.total_completed || 0), 0);
    const activeEmps = rankedKpiList.filter(k => Number(k.total_completed || 0) > 0);
    const avgOnTime = activeEmps.length > 0
      ? (activeEmps.reduce((s, k) => s + Number(k.on_time_rate || 0), 0) / activeEmps.length).toFixed(1)
      : null;

    const topPerformers = rankedKpiList.filter(k => k.isTop1);
    return { totalEmps, avgOnTime, topPerformers, totalTasksDone };
  }, [rankedKpiList]);

  const analytics = useMemo(() => {
    if (!rankedKpiList.length) return null;
    const activeEmps = rankedKpiList.filter(k => Number(k.total_completed || 0) > 0);
    const goodOrAboveCount = activeEmps.filter(k => ['Xuất sắc', 'Tốt'].includes(k.performance)).length;
    const goodOrAbovePercent = activeEmps.length > 0
      ? Math.round((goodOrAboveCount / activeEmps.length) * 100)
      : 0;
    const perfectOnTimeCount = activeEmps.filter(k => Number(k.on_time_rate || 0) === 100).length;
    const avgProcessTime = activeEmps.length > 0
      ? (activeEmps.reduce((s, k) => s + Number(k.avg_time || 0), 0) / activeEmps.length).toFixed(1)
      : '0.0';

    const topScorers = activeEmps.slice(0, 5);

    return {
      activeEmpsCount: activeEmps.length,
      goodOrAboveCount,
      goodOrAbovePercent,
      perfectOnTimeCount,
      avgProcessTime,
      topScorers
    };
  }, [rankedKpiList]);

  return (
    <section className="tab-pane active kpi-page card kpi-card" id="tab-kpi">
      <div className="kpi-header">
          <div className="kpi-heading">
            <span className="kpi-header__eyebrow">Hiệu suất nhân sự</span>
            <h3>
              <Target aria-hidden="true" size={20} /> Bảng Điểm KPI Nhân Sự
            </h3>
            <p className="kpi-header__description">
              Đánh giá theo hồ sơ hoàn thành, đúng hạn, nộp lại và thời gian xử lý.
            </p>
          </div>

          <div className="kpi-toolbar__controls">
            <label>
              Kỳ đánh giá:
            </label>
            <div className="kpi-toolbar__date">
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
              aria-label="Làm mới bảng điểm KPI"
            >
              <RefreshCw aria-hidden="true" size={15} />
            </button>
          </div>
        </div>

        {error && (
          <div className="kpi-error" role="alert">
            <strong>{error}</strong>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => fetchKpi(month)}
            >
              Thử lại
            </button>
          </div>
        )}

        {stats && (
          <div className="kpi-summary" aria-label="Tổng quan KPI">
            <div className="kpi-summary__item">
              <span className="kpi-summary__label">Nhân sự đánh giá</span>
              <strong className="kpi-summary__value">{stats.totalEmps}</strong>
              <span className="kpi-summary__unit">người</span>
            </div>
            <div className="kpi-summary__item">
              <span className="kpi-summary__label">Hồ sơ hoàn thành</span>
              <strong className="kpi-summary__value">{stats.totalTasksDone}</strong>
              <span className="kpi-summary__unit">nhiệm vụ</span>
            </div>
            <div className="kpi-summary__item">
              <span className="kpi-summary__label">Đúng hạn trung bình</span>
              <strong className="kpi-summary__value">
                {stats.avgOnTime == null ? '—' : `${stats.avgOnTime}%`}
              </strong>
              <span className="kpi-summary__unit">trên nhân sự có phát sinh</span>
            </div>
            <div className="kpi-summary__item kpi-summary__item--leader">
              <span className="kpi-summary__label">Dẫn đầu kỳ</span>
              <strong className="kpi-summary__leader">
                {stats.topPerformers.length > 0 ? (
                  stats.topPerformers.length === 1
                    ? `${stats.topPerformers[0].employee} (${normalizeKpiScore(stats.topPerformers[0].final_score)}đ)`
                    : `Đồng hạng 1: ${stats.topPerformers.map(p => p.employee).join(', ')} (${normalizeKpiScore(stats.topPerformers[0].final_score)}đ)`
                ) : 'Chưa có dữ liệu'}
              </strong>
            </div>
          </div>
        )}

        <div className="responsive-table-shell kpi-table-shell">
          <p className="responsive-table-hint" role="note">
            Vuốt ngang để xem đầy đủ các chỉ số trên màn hình hẹp.
          </p>
          <DataTable
            columns={columns}
            data={rankedKpiList}
            loading={loading}
            rowKey="employee"
            emptyText={`Chưa có dữ liệu KPI cho kỳ ${month}`}
            pageSize={10}
          />
        </div>

        {analytics && analytics.topScorers.length > 0 && (
          <div className="kpi-analytics-grid" aria-label="Phân tích hiệu suất nhân sự">
            <div className="kpi-analytics-card">
              <div className="kpi-analytics-card__head">
                <span className="kpi-analytics-card__title">
                  <TrendingUp size={15} /> Xếp hạng & Điểm KPI
                </span>
                <span className="kpi-analytics-card__subtitle">Thang điểm 100</span>
              </div>
              <div className="kpi-bars-list">
                {analytics.topScorers.map((emp) => {
                  const score = normalizeKpiScore(emp.final_score);
                  const fillClass = score >= 90 ? 'is-excellent' : score >= 80 ? 'is-good' : score > 0 ? 'is-normal' : 'is-muted';
                  return (
                    <div key={emp.employee} className="kpi-bar-row">
                      <div className="kpi-bar-row__info">
                        <span className="kpi-bar-row__name">
                          {emp.rank ? `#${emp.rank} ` : ''}{emp.employee}
                        </span>
                        <span className="kpi-bar-row__score">
                          <strong>{score}</strong>/100 {emp.performance && emp.performance !== 'Chưa đánh giá' ? `• ${emp.performance}` : ''}
                        </span>
                      </div>
                      <div className="kpi-bar-track">
                        <div
                          className={`kpi-bar-fill ${fillClass}`}
                          style={{ width: `${Math.min(100, Math.max(score > 0 ? 6 : 0, score))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="kpi-analytics-card">
              <div className="kpi-analytics-card__head">
                <span className="kpi-analytics-card__title">
                  <Award size={15} /> Phân bổ hiệu suất & Tốc độ
                </span>
                <span className="kpi-analytics-card__subtitle">
                  {month ? `Tháng ${Number(month.split('-')[1])}/${month.split('-')[0]}` : ''}
                </span>
              </div>
              <div className="kpi-insights-list">
                <div className="kpi-insight-metric">
                  <span className="kpi-insight-metric__label">Đạt loại Tốt & Xuất sắc</span>
                  <div className="kpi-insight-metric__val">
                    {analytics.activeEmpsCount > 0 ? (
                      <>
                        <strong>{analytics.goodOrAboveCount}</strong> / {analytics.activeEmpsCount} nhân sự có phát sinh
                        <span className="kpi-insight-badge">{analytics.goodOrAbovePercent}%</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </div>
                </div>
                <div className="kpi-insight-metric">
                  <span className="kpi-insight-metric__label">Đúng hạn tuyệt đối (100%)</span>
                  <div className="kpi-insight-metric__val">
                    {analytics.activeEmpsCount > 0 ? (
                      <>
                        <strong>{analytics.perfectOnTimeCount}</strong> / {analytics.activeEmpsCount} nhân sự có phát sinh
                      </>
                    ) : (
                      '—'
                    )}
                  </div>
                </div>
                <div className="kpi-insight-metric">
                  <span className="kpi-insight-metric__label">Thời gian xử lý trung bình</span>
                  <div className="kpi-insight-metric__val">
                    <strong>{analytics.avgProcessTime}</strong> ngày / nhiệm vụ
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
    </section>
  );
}
