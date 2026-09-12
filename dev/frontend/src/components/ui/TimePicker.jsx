import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Clock, X } from 'lucide-react';

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const PERIODS = ['SA', 'CH']; // Sáng (AM), Chiều (PM)

function parseTime(val) {
  if (!val || typeof val !== 'string') return null;
  const match = val.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

function format24(h, m) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function TimePicker({
  value = '',
  onChange,
  placeholder = 'Chọn giờ',
  disabled = false,
  clearable = false,
  format = '12', // '12' (SA/CH) or '24'
  className = '',
  ariaLabel = 'Chọn giờ',
  placement = 'auto',
}) {
  const is12Hour = format === '12';
  const parsed = useMemo(() => parseTime(value), [value]);

  const selectedPeriod = useMemo(() => {
    if (!parsed) return 'SA';
    return parsed.h >= 12 ? 'CH' : 'SA';
  }, [parsed]);

  const selectedHour = useMemo(() => {
    if (!parsed) return is12Hour ? 12 : 0;
    if (!is12Hour) return parsed.h;
    if (parsed.h === 0) return 12;
    return parsed.h > 12 ? parsed.h - 12 : parsed.h;
  }, [parsed, is12Hour]);

  const selectedMinute = useMemo(() => {
    if (!parsed) return 0;
    return parsed.m;
  }, [parsed]);

  const [open, setOpen] = useState(false);
  const [actualPlacement, setActualPlacement] = useState(placement === 'top' ? 'top' : 'bottom');
  const [horizontalPlacement, setHorizontalPlacement] = useState('left');
  const [horizontalOffset, setHorizontalOffset] = useState(0);

  const rootRef = useRef(null);
  const popoverRef = useRef(null);
  const hourListRef = useRef(null);
  const minuteListRef = useRef(null);

  // Position calculation matching DatePicker
  useLayoutEffect(() => {
    if (!open) return undefined;

    const updatePlacement = () => {
      if (!rootRef.current || !popoverRef.current) return;
      const rect = rootRef.current.getBoundingClientRect();
      const popoverRect = popoverRef.current.getBoundingClientRect();
      const measuredHeight = popoverRect.height || 260;
      const measuredWidth = popoverRect.width || (is12Hour ? 240 : 180);

      if (placement === 'top') {
        setActualPlacement('top');
      } else if (placement === 'bottom') {
        setActualPlacement('bottom');
      } else {
        const gap = 8;
        const spaceBelow = window.innerHeight - rect.bottom - gap;
        const spaceAbove = rect.top - gap;
        const fitsBelow = spaceBelow >= measuredHeight;
        const fitsAbove = spaceAbove >= measuredHeight;

        if (!fitsBelow && fitsAbove && spaceBelow < 200) {
          setActualPlacement('top');
        } else if (!fitsBelow && !fitsAbove) {
          setActualPlacement(spaceBelow >= spaceAbove ? 'bottom' : 'top');
        } else {
          setActualPlacement('bottom');
        }
      }

      const viewportGutter = 16;
      const shouldAlignRight = rect.left + measuredWidth > window.innerWidth - viewportGutter;
      setHorizontalPlacement(shouldAlignRight ? 'right' : 'left');
      setHorizontalOffset(
        shouldAlignRight
          ? Math.max(0, rect.right - (window.innerWidth - viewportGutter))
          : 0
      );
    };

    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);
    return () => {
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
    };
  }, [open, placement, is12Hour]);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  // Auto-scroll selected items into view when opened
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      hourListRef.current?.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' });
      minuteListRef.current?.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' });
    }, 50);
    return () => clearTimeout(timer);
  }, [open]);

  const handleSelectHour = (hour) => {
    let nextH = hour;
    if (is12Hour) {
      if (selectedPeriod === 'CH') {
        nextH = hour === 12 ? 12 : hour + 12;
      } else {
        nextH = hour === 12 ? 0 : hour;
      }
    }
    onChange?.(format24(nextH, selectedMinute));
  };

  const handleSelectMinute = (minute) => {
    let currentH = parsed ? parsed.h : 0;
    onChange?.(format24(currentH, minute));
  };

  const handleSelectPeriod = (period) => {
    if (!is12Hour) return;
    let h12 = selectedHour;
    let nextH;
    if (period === 'CH') {
      nextH = h12 === 12 ? 12 : h12 + 12;
    } else {
      nextH = h12 === 12 ? 0 : h12;
    }
    onChange?.(format24(nextH, selectedMinute));
  };

  const handleSelectNow = () => {
    const now = new Date();
    onChange?.(format24(now.getHours(), now.getMinutes()));
    setOpen(false);
  };

  const displayValue = useMemo(() => {
    if (!parsed) return placeholder;
    if (is12Hour) {
      const h12 = parsed.h === 0 ? 12 : (parsed.h > 12 ? parsed.h - 12 : parsed.h);
      const period = parsed.h >= 12 ? 'CH' : 'SA';
      return `${String(h12).padStart(2, '0')} : ${String(parsed.m).padStart(2, '0')}  ${period}`;
    }
    return format24(parsed.h, parsed.m);
  }, [parsed, is12Hour, placeholder]);

  return (
    <div className={`time-picker${className ? ` ${className}` : ''}`} ref={rootRef}>
      <button
        type="button"
        className={`time-picker__trigger${open ? ' time-picker__trigger--open' : ''}`}
        disabled={disabled}
        onClick={() => setOpen(prev => !prev)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Clock size={16} />
        <span>{displayValue}</span>
      </button>

      {value && clearable && !disabled && (
        <button
          type="button"
          className="time-picker__clear"
          onClick={() => onChange?.('')}
          aria-label="Xóa giờ đã chọn"
        >
          <X size={14} />
        </button>
      )}

      {open && (
        <div
          ref={popoverRef}
          className={`time-picker__popover${actualPlacement === 'top' ? ' time-picker__popover--top' : ''}${horizontalPlacement === 'right' ? ' time-picker__popover--right' : ''}`}
          style={horizontalPlacement === 'right'
            ? { '--time-picker-popover-right-offset': `${horizontalOffset}px` }
            : undefined}
          role="dialog"
          aria-label={ariaLabel}
        >
          <div className={`time-picker__header${is12Hour ? ' time-picker__header--3col' : ' time-picker__header--2col'}`}>
            <span>GIỜ</span>
            <span>PHÚT</span>
            {is12Hour && <span>BUỔI</span>}
          </div>

          <div className={`time-picker__body${is12Hour ? ' time-picker__body--3col' : ' time-picker__body--2col'}`}>
            {/* Hours Column */}
            <div className="time-picker__column" ref={hourListRef}>
              {(is12Hour ? HOURS_12 : HOURS_24).map((h) => {
                const isSelected = parsed && selectedHour === h;
                const hStr = String(h).padStart(2, '0');
                return (
                  <button
                    type="button"
                    key={h}
                    className={`time-picker__item${isSelected ? ' is-selected' : ''}`}
                    onClick={() => handleSelectHour(h)}
                    aria-pressed={isSelected}
                    aria-label={`Giờ ${hStr}`}
                  >
                    {hStr}
                  </button>
                );
              })}
            </div>

            {/* Minutes Column */}
            <div className="time-picker__column" ref={minuteListRef}>
              {MINUTES.map((m) => {
                const isSelected = parsed && selectedMinute === m;
                const mStr = String(m).padStart(2, '0');
                return (
                  <button
                    type="button"
                    key={m}
                    className={`time-picker__item${isSelected ? ' is-selected' : ''}`}
                    onClick={() => handleSelectMinute(m)}
                    aria-pressed={isSelected}
                    aria-label={`Phút ${mStr}`}
                  >
                    {mStr}
                  </button>
                );
              })}
            </div>

            {/* Period Column (12h mode) */}
            {is12Hour && (
              <div className="time-picker__column time-picker__column--period">
                {PERIODS.map((p) => {
                  const isSelected = parsed && selectedPeriod === p;
                  return (
                    <button
                      type="button"
                      key={p}
                      className={`time-picker__item${isSelected ? ' is-selected' : ''}`}
                      onClick={() => handleSelectPeriod(p)}
                      aria-pressed={isSelected}
                      aria-label={`Buổi ${p}`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="time-picker__footer">
            <button
              type="button"
              className="time-picker__now-btn"
              onClick={handleSelectNow}
            >
              Bây giờ
            </button>
            <button
              type="button"
              className="time-picker__confirm-btn"
              onClick={() => setOpen(false)}
            >
              Xác nhận
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
