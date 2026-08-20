import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock3,
  ExternalLink,
  Filter,
  LocateFixed,
  RefreshCw,
  Search,
  UserRound,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { apiFetch, getAccessToken } from '../lib/api';
import AvatarImage from '../components/AvatarImage';
import { WORKFLOW_NODE_STATUS_LABELS } from '../components/contracts/workflowLabels';
import './contractTimeline.css';

const DAY_MS = 24 * 60 * 60 * 1000;
const TREE_WIDTH = 292;
const MIN_PIXELS_PER_DAY = 12;
const MAX_PIXELS_PER_DAY = 72;
const DEFAULT_PIXELS_PER_DAY = 28;

const STATUS_LABELS = {
  overdue: 'Có Node trễ hạn',
  running: 'Đang vận hành',
  completed: 'Đã hoàn thành',
  cancelled: 'Đã hủy',
  unscheduled: 'Chưa có lịch',
};

const NODE_TYPE_LABELS = {
  legal: 'Pháp lý',
  survey: 'Đo vẽ',
  shared: 'Dùng chung',
};

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value, amount) {
  return new Date(value.getTime() + amount * DAY_MS);
}

function differenceInDays(left, right) {
  return (left.getTime() - right.getTime()) / DAY_MS;
}

function formatDateTime(value) {
  const date = parseDate(value);
  if (!date) return 'Chưa xác định';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDate(value) {
  const date = parseDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function formatDuration(daysValue, hoursValue) {
  const days = Math.max(0, Number(daysValue) || 0);
  const hours = Math.max(0, Number(hoursValue) || 0);
  const parts = [];
  if (days) parts.push(`${days} ngày`);
  if (hours) parts.push(`${hours} giờ`);
  return parts.length ? parts.join(' ') : 'Chưa đặt thời hạn';
}

export function timelineMilestones(node) {
  return [
    ['Sẵn sàng', node.ready_at],
    ['Bắt đầu', node.started_at],
    ...((node.submissions || []).map((item) => [`Nộp #${item.attempt_no}`, item.submitted_at])),
    ['Hoàn tất', node.completed_at],
    ['Hạn xử lý', node.deadline_at],
  ].filter(([, value]) => Boolean(value)).map(([label, value]) => ({ label, value }));
}

function nodeStatusClass(node) {
  if (node.is_overdue) return 'overdue';
  if (node.status === 'accepted') return 'completed';
  if (['in_progress', 'submitted', 'rework_required', 'blocked'].includes(node.status)) return 'running';
  return 'waiting';
}

function nodeStatusLabel(node) {
  if (node.is_overdue) return 'Trễ hạn';
  return WORKFLOW_NODE_STATUS_LABELS[node.status] || node.status || 'Chưa xác định';
}

function buildTimelineRange(contracts) {
  const dates = [new Date()];
  contracts.forEach((contract) => contract.service_lines.forEach((line) => line.nodes.forEach((node) => {
    const start = parseDate(node.display_start);
    const end = parseDate(node.display_end);
    if (start) dates.push(start);
    if (end) dates.push(end);
  })));
  const minDate = new Date(Math.min(...dates.map((date) => date.getTime())));
  const maxDate = new Date(Math.max(...dates.map((date) => date.getTime())));
  const start = new Date(minDate.getFullYear(), minDate.getMonth() - 1, 1);
  let end = new Date(maxDate.getFullYear(), maxDate.getMonth() + 2, 1);
  const minimumEnd = new Date(start.getFullYear(), start.getMonth() + 12, 1);
  if (end < minimumEnd) end = minimumEnd;
  return { start, end };
}

function buildMonths(rangeStart, rangeEnd) {
  const months = [];
  let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  while (cursor < rangeEnd) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const visibleStart = cursor < rangeStart ? rangeStart : cursor;
    const visibleEnd = next > rangeEnd ? rangeEnd : next;
    months.push({
      key: `${cursor.getFullYear()}-${cursor.getMonth()}`,
      label: `Tháng ${cursor.getMonth() + 1}/${cursor.getFullYear()}`,
      start: visibleStart,
      days: Math.max(1, differenceInDays(visibleEnd, visibleStart)),
    });
    cursor = next;
  }
  return months;
}

function buildScaleTicks(rangeStart, rangeEnd, pixelsPerDay) {
  const stepDays = pixelsPerDay >= 48 ? 1 : pixelsPerDay >= 20 ? 7 : 14;
  const ticks = [];
  let cursor = new Date(rangeStart);
  while (cursor < rangeEnd) {
    const next = addDays(cursor, stepDays);
    const visibleEnd = next > rangeEnd ? rangeEnd : next;
    ticks.push({
      key: cursor.toISOString(),
      start: cursor,
      days: differenceInDays(visibleEnd, cursor),
      label: stepDays === 1
        ? `${cursor.getDate()}`
        : `${cursor.getDate()}/${cursor.getMonth() + 1}`,
    });
    cursor = next;
  }
  return ticks;
}

function assignLanes(nodes) {
  return nodes.map((node, sequenceIndex) => {
    const start = parseDate(node.display_start);
    const end = parseDate(node.display_end);
    return {
      ...node,
      _start: start,
      _end: end,
      _scheduled: Boolean(start && end),
      lane: sequenceIndex,
      laneCount: nodes.length,
    };
  });
}

function RealAvatar({ assignee, size = 24 }) {
  return (
    <AvatarImage
      className="contract-timeline__avatar"
      src={assignee?.avatar_url}
      name={assignee?.full_name || 'Nhân viên'}
      title={assignee?.full_name || 'Nhân viên'}
      style={{ width: size, height: size }}
    />
  );
}

function AvatarGroup({ assignees = [], compact = false }) {
  const visible = assignees.slice(0, 3);
  if (!visible.length) return <span className="contract-timeline__unassigned"><UserRound size={13} /> Chưa giao</span>;
  return (
    <span className="contract-timeline__avatars" aria-label={`${assignees.length} người phụ trách`}>
      {visible.map((assignee) => <RealAvatar key={`${assignee.employee_id}-${assignee.role_code}`} assignee={assignee} size={compact ? 22 : 28} />)}
      {assignees.length > 3 && <span className="contract-timeline__avatar-more">+{assignees.length - 3}</span>}
    </span>
  );
}

function NodeTooltip({ hover }) {
  if (!hover) return null;
  const { node, contract, serviceLine, x, y } = hover;
  const left = Math.min(x + 16, window.innerWidth - 340);
  const top = Math.min(y + 16, window.innerHeight - 270);
  return createPortal(
    <div className="contract-timeline__tooltip" style={{ left: Math.max(12, left), top: Math.max(12, top) }}>
      <div className="contract-timeline__tooltip-head">
        <span className={`contract-timeline__status-dot is-${nodeStatusClass(node)}`} />
        <div><strong>{node.name}</strong><span>{node.node_code} · {NODE_TYPE_LABELS[node.node_type] || 'Dùng chung'}</span></div>
      </div>
      <dl>
        <div><dt>Hợp đồng</dt><dd>{contract.id}</dd></div>
        <div><dt>Hạng mục</dt><dd>{serviceLine.name}</dd></div>
        <div><dt>Trạng thái</dt><dd>{nodeStatusLabel(node)}</dd></div>
        <div><dt>Thời lượng Node</dt><dd>{formatDuration(node.duration_days, node.duration_hours)}</dd></div>
        <div><dt>Thời gian</dt><dd>{node.started_at ? `${formatDate(node.display_start)} → ${formatDate(node.display_end)}` : 'Chưa bắt đầu'}</dd></div>
        <div><dt>Hạn xử lý</dt><dd>{node.started_at ? formatDateTime(node.deadline_at) : 'Tính từ lúc nhân viên bắt đầu'}</dd></div>
        {timelineMilestones(node).map((milestone) => <div key={milestone.label}><dt>{milestone.label}</dt><dd>{formatDateTime(milestone.value)}</dd></div>)}
        {serviceLine.has_draft && (
          <div><dt>Bản sửa tạm #{serviceLine.draft_revision_no}</dt><dd>{formatDuration(node.draft_duration_days, node.draft_duration_hours)}</dd></div>
        )}
      </dl>
      <div className="contract-timeline__tooltip-people">
        {node.assignees.length ? node.assignees.map((assignee) => (
          <div key={`${assignee.employee_id}-${assignee.role_code}`}>
            <RealAvatar assignee={assignee} size={26} />
            <span><strong>{assignee.full_name}</strong><small>{assignee.role_code === 'MAIN' ? 'Phụ trách chính' : assignee.role_code === 'ASSISTANT' ? 'Phối hợp' : assignee.role_code}</small></span>
          </div>
        )) : <span className="contract-timeline__muted">Chưa phân công nhân viên</span>}
      </div>
    </div>,
    document.body,
  );
}

function NodeDetailModal({ selection, onClose, onNavigate }) {
  if (!selection) return null;
  const { node, contract, serviceLine } = selection;
  return createPortal(
    <div className="contract-timeline__modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="contract-timeline__modal" role="dialog" aria-modal="true" aria-labelledby="timeline-node-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="contract-timeline__modal-close" type="button" onClick={onClose} aria-label="Đóng"><X size={20} /></button>
        <div className="contract-timeline__modal-eyebrow"><span className={`contract-timeline__status-dot is-${nodeStatusClass(node)}`} /> {node.node_code} · Chỉ xem</div>
        <h2 id="timeline-node-title">{node.name}</h2>
        <p className="contract-timeline__modal-context">{contract.id} · {serviceLine.name}</p>
        <div className="contract-timeline__modal-grid">
          <div><span>Trạng thái</span><strong>{nodeStatusLabel(node)}</strong></div>
          <div><span>Nhóm nghiệp vụ</span><strong>{NODE_TYPE_LABELS[node.node_type] || 'Dùng chung'}</strong></div>
          <div><span>Thời lượng Node</span><strong>{formatDuration(node.duration_days, node.duration_hours)}</strong></div>
          <div><span>Bắt đầu</span><strong>{node.started_at ? formatDateTime(node.started_at) : 'Chưa bắt đầu'}</strong></div>
          <div><span>Kết thúc / hiện tại</span><strong>{node.started_at ? formatDateTime(node.display_end) : '—'}</strong></div>
          <div className="is-wide"><span>Deadline</span><strong className={node.is_overdue ? 'is-danger' : ''}>{node.started_at ? formatDateTime(node.deadline_at) : 'Sẽ tính khi nhân viên bắt đầu'}</strong></div>
          {serviceLine.has_draft && <div className="is-wide"><span>Bản sửa tạm #{serviceLine.draft_revision_no}</span><strong>{formatDuration(node.draft_duration_days, node.draft_duration_hours)}</strong></div>}
        </div>
        <div className="contract-timeline__modal-section">
          <h3>Các mốc thực tế</h3>
          {timelineMilestones(node).map((milestone) => <div className="contract-timeline__person" key={milestone.label}><span><strong>{milestone.label}</strong><small>{formatDateTime(milestone.value)}</small></span></div>)}
        </div>
        <div className="contract-timeline__modal-section">
          <h3>Người phụ trách</h3>
          {node.assignees.length ? node.assignees.map((assignee) => (
            <div className="contract-timeline__person" key={`${assignee.employee_id}-${assignee.role_code}`}>
              <RealAvatar assignee={assignee} size={38} />
              <span><strong>{assignee.full_name}</strong><small>{assignee.role_code === 'MAIN' ? 'Phụ trách chính' : assignee.role_code === 'ASSISTANT' ? 'Phối hợp' : assignee.role_code}</small></span>
            </div>
          )) : <div className="contract-timeline__empty-person"><UserRound size={18} /> Chưa phân công</div>}
        </div>
        <footer>
          <button type="button" className="contract-timeline__secondary-button" onClick={onClose}>Đóng</button>
          <button type="button" className="contract-timeline__primary-button" onClick={() => onNavigate(selection)}><ExternalLink size={17} /> Đi tới chi tiết Node</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

export default function ContractTimeline() {
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [nodeTypeFilter, setNodeTypeFilter] = useState('all');
  const [pixelsPerDay, setPixelsPerDay] = useState(DEFAULT_PIXELS_PER_DAY);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [hover, setHover] = useState(null);
  const [selection, setSelection] = useState(null);
  const [visibleRangeLabel, setVisibleRangeLabel] = useState('');
  const [viewportWidth, setViewportWidth] = useState(0);
  const scrollRef = useRef(null);
  const zoomRef = useRef(DEFAULT_PIXELS_PER_DAY);
  const realtimeRefreshRef = useRef(null);

  const loadTimeline = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/contracts/timeline');
      setContracts(response?.data || []);
    } catch (requestError) {
      setError(requestError.message || 'Không tải được dữ liệu timeline.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { loadTimeline(); }, [loadTimeline]);

  useEffect(() => {
    let disposed = false;
    let abortController = null;

    const refreshFromRealtime = () => {
      window.clearTimeout(realtimeRefreshRef.current);
      realtimeRefreshRef.current = window.setTimeout(() => {
        loadTimeline({ silent: true });
      }, 150);
    };

    const subscribe = async () => {
      while (!disposed) {
        abortController = new AbortController();
        try {
          const token = getAccessToken();
          if (!token) return;
          const response = await fetch('/api/contracts/timeline/events', {
            headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
            cache: 'no-store',
            signal: abortController.signal,
          });
          if (response.status === 401 || response.status === 403) return;
          if (!response.ok || !response.body) throw new Error('Không kết nối được Timeline Realtime');

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          while (!disposed) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split('\n\n');
            buffer = blocks.pop() || '';
            if (blocks.some((block) => block.includes('event: timeline-change'))) {
              refreshFromRealtime();
            }
          }
        } catch (streamError) {
          if (disposed || streamError?.name === 'AbortError') return;
        }
        if (!disposed) await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }
    };

    subscribe();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') loadTimeline({ silent: true });
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshWhenVisible);
    return () => {
      disposed = true;
      window.clearTimeout(realtimeRefreshRef.current);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshWhenVisible);
      abortController?.abort();
    };
  }, [loadTimeline]);

  const filteredContracts = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('vi');
    return contracts.reduce((result, contract) => {
      if (statusFilter !== 'all' && contract.timeline_status !== statusFilter) return result;
      const contractMatches = !keyword || `${contract.id} ${contract.customer_name}`.toLocaleLowerCase('vi').includes(keyword);
      const serviceLines = contract.service_lines.reduce((lineResult, line) => {
        const lineMatches = contractMatches || !keyword || `${line.name} ${line.package || ''}`.toLocaleLowerCase('vi').includes(keyword);
        const nodes = line.nodes.filter((node) => nodeTypeFilter === 'all' || node.node_type === nodeTypeFilter);
        if ((lineMatches || nodes.some((node) => `${node.name} ${node.node_code}`.toLocaleLowerCase('vi').includes(keyword))) && nodes.length) {
          lineResult.push({ ...line, nodes });
        }
        return lineResult;
      }, []);
      if (serviceLines.length) result.push({ ...contract, service_lines: serviceLines });
      return result;
    }, []);
  }, [contracts, nodeTypeFilter, search, statusFilter]);

  const timelineRange = useMemo(() => buildTimelineRange(contracts), [contracts]);
  const totalDays = Math.max(1, differenceInDays(timelineRange.end, timelineRange.start));
  const timelineViewportWidth = Math.max(760, viewportWidth - TREE_WIDTH);
  const timelineWidth = Math.max(timelineViewportWidth, totalDays * pixelsPerDay);
  const months = useMemo(() => buildMonths(timelineRange.start, timelineRange.end), [timelineRange]);
  const scaleTicks = useMemo(
    () => buildScaleTicks(timelineRange.start, timelineRange.end, pixelsPerDay),
    [pixelsPerDay, timelineRange],
  );
  const todayOffset = differenceInDays(startOfDay(new Date()), timelineRange.start) * pixelsPerDay;

  const updateVisibleRange = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    // Cột cây sticky che phần bên trái; scrollLeft chính là số pixel đã dịch
    // trên trục thời gian, không cộng/trừ thêm chiều rộng cột cây.
    const trackScroll = Math.max(0, element.scrollLeft);
    const visibleTrackWidth = Math.max(1, element.clientWidth - TREE_WIDTH);
    const from = addDays(timelineRange.start, trackScroll / zoomRef.current);
    const unclampedTo = addDays(timelineRange.start, (trackScroll + visibleTrackWidth) / zoomRef.current);
    const to = unclampedTo > timelineRange.end ? timelineRange.end : unclampedTo;
    const format = (date) => `tháng ${date.getMonth() + 1}/${date.getFullYear()}`;
    setVisibleRangeLabel(`Từ ${format(from)} → ${format(to)}`);
  }, [timelineRange]);

  useEffect(() => {
    zoomRef.current = pixelsPerDay;
    requestAnimationFrame(updateVisibleRange);
  }, [pixelsPerDay, updateVisibleRange]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      setViewportWidth(entries[0]?.contentRect?.width || element.clientWidth);
      updateVisibleRange();
    });
    observer.observe(element);
    setViewportWidth(element.clientWidth);
    return () => observer.disconnect();
  }, [updateVisibleRange]);

  const changeZoom = (nextValue) => {
    const element = scrollRef.current;
    const next = Math.max(MIN_PIXELS_PER_DAY, Math.min(MAX_PIXELS_PER_DAY, nextValue));
    if (!element || next === pixelsPerDay) return;
    const viewportWidth = Math.max(1, element.clientWidth - TREE_WIDTH);
    const centerDay = (Math.max(0, element.scrollLeft) + viewportWidth / 2) / pixelsPerDay;
    setPixelsPerDay(next);
    requestAnimationFrame(() => {
      element.scrollLeft = Math.max(0, centerDay * next - viewportWidth / 2);
      updateVisibleRange();
    });
  };

  const goToToday = () => {
    const element = scrollRef.current;
    if (!element) return;
    const viewportWidth = Math.max(1, element.clientWidth - TREE_WIDTH);
    element.scrollTo({ left: Math.max(0, todayOffset - viewportWidth / 2), behavior: 'smooth' });
  };

  const toggleContract = (contractId) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(contractId)) next.delete(contractId);
      else next.add(contractId);
      return next;
    });
  };

  const navigateToNode = ({ contract, serviceLine, node }) => {
    setSelection(null);
    window.dispatchEvent(new CustomEvent('bachkhoa:timeline-open-node', {
      detail: {
        contractId: contract.id,
        serviceLineId: serviceLine.id,
        nodeKey: node.node_key,
        nonce: Date.now(),
      },
    }));
  };

  const renderServiceLine = (contract, serviceLine) => {
    const bars = assignLanes(serviceLine.nodes);
    const laneCount = Math.max(1, serviceLine.nodes.length);
    const rowHeight = Math.max(88, 24 + laneCount * 52);
    const unscheduledCount = bars.filter((node) => !node._scheduled).length;
    return (
      <div className="contract-timeline__service-row" style={{ height: rowHeight }} key={serviceLine.id}>
        <div className="contract-timeline__service-cell" style={{ width: TREE_WIDTH }}>
          <span className="contract-timeline__tree-branch" />
          <div className="contract-timeline__service-icon">{serviceLine.name?.slice(0, 1) || 'H'}</div>
          <div className="contract-timeline__service-copy">
            <strong title={serviceLine.name}>{serviceLine.name}</strong>
            <span>{serviceLine.package || 'Hạng mục hợp đồng'}</span>
            {serviceLine.has_draft && <small className="is-draft">Đang sửa tạm Revision {serviceLine.draft_revision_no}</small>}
            {unscheduledCount > 0 && <small><Clock3 size={11} /> {unscheduledCount} Node chưa bắt đầu</small>}
          </div>
        </div>
        <div
          className={`contract-timeline__track${pixelsPerDay < 20 ? ' is-compact' : ''}`}
          style={{
            left: TREE_WIDTH,
            width: timelineWidth,
            '--timeline-day': `${pixelsPerDay}px`,
            '--timeline-major': `${pixelsPerDay * 7}px`,
            '--timeline-lane': '52px',
          }}
        >
          {todayOffset >= 0 && todayOffset <= timelineWidth && <span className="contract-timeline__today-line" style={{ left: todayOffset }} />}
          {bars.map((node) => {
            const top = 15 + node.lane * 52;
            if (!node._scheduled) {
              return (
                <button
                  type="button"
                  key={node.id}
                  className="contract-timeline__node-bar is-unscheduled"
                  style={{ left: 14, top, width: 190 }}
                  onMouseEnter={(event) => setHover({ node, contract, serviceLine, x: event.clientX, y: event.clientY })}
                  onMouseMove={(event) => setHover((current) => current ? { ...current, x: event.clientX, y: event.clientY } : current)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => { setHover(null); setSelection({ node, contract, serviceLine }); }}
                >
                  <span className="contract-timeline__node-name">{node.node_code} · {node.name}</span>
                  <span className="contract-timeline__no-schedule"><Clock3 size={12} /> {formatDuration(node.duration_days, node.duration_hours)}</span>
                </button>
              );
            }
            const left = Math.max(0, differenceInDays(node._start, timelineRange.start) * pixelsPerDay);
            const durationWidth = Math.max(34, differenceInDays(node._end, node._start) * pixelsPerDay);
            const width = Math.min(durationWidth, timelineWidth - left);
            return (
              <button
                type="button"
                key={node.id}
                className={`contract-timeline__node-bar is-${nodeStatusClass(node)}`}
                style={{ left, top, width: Math.max(20, width) }}
                onMouseEnter={(event) => setHover({ node, contract, serviceLine, x: event.clientX, y: event.clientY })}
                onMouseMove={(event) => setHover((current) => current ? { ...current, x: event.clientX, y: event.clientY } : current)}
                onMouseLeave={() => setHover(null)}
                onClick={() => { setHover(null); setSelection({ node, contract, serviceLine }); }}
              >
                <span className="contract-timeline__node-name">{node.name}</span>
                <AvatarGroup assignees={node.assignees} compact />
                {node.is_overdue && <AlertTriangle className="contract-timeline__node-alert" size={14} />}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <section className="contract-timeline-page">
      <header className="contract-timeline__title-bar">
        <div className="contract-timeline__title-group">
          <span>Quản lý Timeline</span>
          <strong>{filteredContracts.length}</strong>
        </div>
      </header>

      <div className="contract-timeline__toolbar">
        <div className="contract-timeline__search"><Search size={17} /><input aria-label="Tìm kiếm Timeline" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm hợp đồng, khách hàng, hạng mục..." /></div>
        <div className="contract-timeline__select"><Filter size={16} /><select aria-label="Lọc theo trạng thái" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Tất cả trạng thái</option><option value="running">Đang vận hành</option><option value="overdue">Có Node trễ hạn</option><option value="completed">Đã hoàn thành</option><option value="cancelled">Đã hủy</option><option value="unscheduled">Chưa có lịch</option></select></div>
        <div className="contract-timeline__select"><select aria-label="Lọc theo loại Node" value={nodeTypeFilter} onChange={(event) => setNodeTypeFilter(event.target.value)}><option value="all">Tất cả loại Node</option><option value="survey">Đo vẽ</option><option value="legal">Pháp lý</option><option value="shared">Dùng chung</option></select></div>
        <div className="contract-timeline__toolbar-spacer" />
        <span className="contract-timeline__range-label"><CalendarDays size={16} /> {visibleRangeLabel || 'Đang xác định khung thời gian'}</span>
        <button type="button" className="contract-timeline__icon-button" onClick={() => changeZoom(pixelsPerDay - 4)} disabled={pixelsPerDay <= MIN_PIXELS_PER_DAY} title="Thu nhỏ trục thời gian"><ZoomOut size={18} /></button>
        <input className="contract-timeline__zoom-range" aria-label="Mức phóng đại thời gian" type="range" min={MIN_PIXELS_PER_DAY} max={MAX_PIXELS_PER_DAY} value={pixelsPerDay} onChange={(event) => changeZoom(Number(event.target.value))} />
        <button type="button" className="contract-timeline__icon-button" onClick={() => changeZoom(pixelsPerDay + 4)} disabled={pixelsPerDay >= MAX_PIXELS_PER_DAY} title="Phóng to trục thời gian"><ZoomIn size={18} /></button>
        <button type="button" className="contract-timeline__today-button" onClick={goToToday}><LocateFixed size={16} /> Hiện tại</button>
      </div>

      <div className="contract-timeline__legend">
        <span><i className="is-completed" /> Hoàn thành</span><span><i className="is-running" /> Đang xử lý</span><span><i className="is-overdue" /> Trễ hạn</span><span><i className="is-waiting" /> Chưa bắt đầu / khác</span>
      </div>

      <div className="contract-timeline__board" ref={scrollRef} onScroll={updateVisibleRange}>
        <div className="contract-timeline__canvas" style={{ width: TREE_WIDTH + timelineWidth }}>
          <div className="contract-timeline__axis-row">
            <div className="contract-timeline__axis-tree" style={{ width: TREE_WIDTH }}><span>HỢP ĐỒNG / HẠNG MỤC</span><small>{filteredContracts.length} hợp đồng</small></div>
            <div
              className={`contract-timeline__axis${pixelsPerDay < 20 ? ' is-compact' : ''}`}
              style={{
                left: TREE_WIDTH,
                width: timelineWidth,
                '--timeline-day': `${pixelsPerDay}px`,
                '--timeline-major': `${pixelsPerDay * 7}px`,
              }}
            >
              {months.map((month) => <div className="contract-timeline__month" key={month.key} style={{ left: differenceInDays(month.start, timelineRange.start) * pixelsPerDay, width: month.days * pixelsPerDay }}>{month.label}</div>)}
              {scaleTicks.map((tick) => <div className="contract-timeline__scale-tick" key={tick.key} style={{ left: differenceInDays(tick.start, timelineRange.start) * pixelsPerDay, width: Math.max(1, tick.days * pixelsPerDay) }}>{tick.label}</div>)}
              {todayOffset >= 0 && todayOffset <= timelineWidth && <span className="contract-timeline__today-axis" style={{ left: todayOffset }}>Hôm nay</span>}
            </div>
          </div>

          {loading && <div className="contract-timeline__state"><RefreshCw className="is-spinning" size={24} /> Đang tải timeline...</div>}
          {!loading && error && <div className="contract-timeline__state is-error"><AlertTriangle size={24} /><strong>Không tải được Timeline</strong><span>{error}</span><button type="button" onClick={loadTimeline}>Thử lại</button></div>}
          {!loading && !error && !filteredContracts.length && <div className="contract-timeline__state"><CalendarDays size={28} /><strong>Không có dữ liệu phù hợp</strong><span>Hãy đổi bộ lọc hoặc thiết lập lịch cho Node trong Hạng mục.</span></div>}

          {!loading && !error && filteredContracts.map((contract) => {
            const isCollapsed = collapsed.has(contract.id);
            return (
              <React.Fragment key={contract.id}>
                <div className="contract-timeline__contract-row">
                  <button type="button" className="contract-timeline__contract-cell" style={{ width: TREE_WIDTH }} onClick={() => toggleContract(contract.id)}>
                    {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                    <span><strong>{contract.id}</strong><small>{contract.customer_name}</small></span>
                    <em className={`is-${contract.timeline_status}`}>{STATUS_LABELS[contract.timeline_status] || contract.timeline_status}</em>
                  </button>
                  <div className="contract-timeline__contract-track" style={{ left: TREE_WIDTH, width: timelineWidth }} />
                </div>
                {!isCollapsed && contract.service_lines.map((serviceLine) => renderServiceLine(contract, serviceLine))}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <NodeTooltip hover={hover} />
      <NodeDetailModal selection={selection} onClose={() => setSelection(null)} onNavigate={navigateToNode} />
    </section>
  );
}
