import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';

const MONTH_NAMES = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4',
  'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8',
  'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
];
const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

function parseDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function parseMonth(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

function formatIsoDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatIsoMonth(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function isSameDay(left, right) {
  return left
    && right
    && left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

export default function DatePicker({
  value = '',
  onChange,
  placeholder = 'Chọn ngày',
  selectionMode = 'day',
  disabled = false,
  clearable = true,
  className = '',
  dialogLabel,
  placement = 'auto',
}) {
  const isMonthMode = selectionMode === 'month';
  const selectedDate = useMemo(
    () => isMonthMode ? parseMonth(value) : parseDate(value),
    [isMonthMode, value]
  );
  const today = useMemo(() => new Date(), []);
  const initialDate = selectedDate || today;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(isMonthMode ? 'months' : 'days');
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());
  const [actualPlacement, setActualPlacement] = useState(placement === 'top' ? 'top' : 'bottom');
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    if (placement === 'top') {
      setActualPlacement('top');
      return;
    }
    if (placement === 'bottom') {
      setActualPlacement('bottom');
      return;
    }
    if (rootRef.current) {
      const rect = rootRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 330 && rect.top > 300) {
        setActualPlacement('top');
      } else {
        setActualPlacement('bottom');
      }
    }
  }, [open, placement]);

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

  useEffect(() => {
    if (!selectedDate) return;
    setViewYear(selectedDate.getFullYear());
    setViewMonth(selectedDate.getMonth());
  }, [selectedDate]);

  useEffect(() => {
    setMode(isMonthMode ? 'months' : 'days');
  }, [isMonthMode]);

  const firstWeekday = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const yearPageStart = viewYear - 5;

  const moveMonth = (step) => {
    const next = new Date(viewYear, viewMonth + step, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const moveView = (step) => {
    if (mode === 'days') moveMonth(step);
    else if (mode === 'months') setViewYear(year => year + step);
    else setViewYear(year => year + step * 12);
  };

  const selectDay = (day) => {
    onChange?.(formatIsoDate(viewYear, viewMonth, day));
    setOpen(false);
    setMode('days');
  };

  const displayValue = selectedDate
    ? isMonthMode
      ? `${MONTH_NAMES[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`
      : formatIsoDate(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate()
      ).split('-').reverse().join('/')
    : placeholder;

  return (
    <div className={`date-picker${className ? ` ${className}` : ''}`} ref={rootRef}>
      <button
        type="button"
        className={`date-picker__trigger${open ? ' date-picker__trigger--open' : ''}`}
        disabled={disabled}
        onClick={() => {
          setOpen(current => !current);
          setMode(isMonthMode ? 'months' : 'days');
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalendarDays size={16} />
        <span>{displayValue}</span>
      </button>

      {value && clearable && !disabled && (
        <button
          type="button"
          className="date-picker__clear"
          onClick={() => onChange?.('')}
          aria-label="Xóa ngày đã chọn"
        >
          <X size={14} />
        </button>
      )}

      {open && (
        <div
          className={`date-picker__popover${actualPlacement === 'top' ? ' date-picker__popover--top' : ''}`}
          role="dialog"
          aria-label={dialogLabel || (isMonthMode ? 'Chọn tháng' : placeholder)}
        >
          <div className="date-picker__header">
            <button type="button" onClick={() => moveView(-1)} aria-label="Trước">
              <ChevronLeft size={17} />
            </button>

            <div className="date-picker__title">
              {mode === 'days' && (
                <>
                  <button type="button" onClick={() => setMode('months')}>
                    {MONTH_NAMES[viewMonth]}
                  </button>
                  <button type="button" onClick={() => setMode('years')}>
                    {viewYear}
                  </button>
                </>
              )}
              {mode === 'months' && (
                <button type="button" onClick={() => setMode('years')}>{viewYear}</button>
              )}
              {mode === 'years' && (
                <span>{yearPageStart}–{yearPageStart + 11}</span>
              )}
            </div>

            <button type="button" onClick={() => moveView(1)} aria-label="Sau">
              <ChevronRight size={17} />
            </button>
          </div>

          {mode === 'days' && (
            <>
              <div className="date-picker__weekdays">
                {WEEKDAYS.map(day => <span key={day}>{day}</span>)}
              </div>
              <div className="date-picker__days">
                {Array.from({ length: firstWeekday }, (_, index) => (
                  <span key={`blank-${index}`} />
                ))}
                {Array.from({ length: daysInMonth }, (_, index) => {
                  const day = index + 1;
                  const date = new Date(viewYear, viewMonth, day);
                  const selected = isSameDay(date, selectedDate);
                  const current = isSameDay(date, today);
                  return (
                    <button
                      type="button"
                      key={day}
                      className={`${selected ? 'is-selected ' : ''}${current ? 'is-today' : ''}`.trim()}
                      onClick={() => selectDay(day)}
                      aria-pressed={selected}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {mode === 'months' && (
            <div className="date-picker__months">
              {MONTH_NAMES.map((name, index) => (
                <button
                  type="button"
                  key={name}
                  className={
                    selectedDate
                    && selectedDate.getFullYear() === viewYear
                    && selectedDate.getMonth() === index
                      ? 'is-selected'
                      : ''
                  }
                  onClick={() => {
                    setViewMonth(index);
                    if (isMonthMode) {
                      onChange?.(formatIsoMonth(viewYear, index));
                      setOpen(false);
                    } else {
                      setMode('days');
                    }
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          {mode === 'years' && (
            <div className="date-picker__years">
              {Array.from({ length: 12 }, (_, index) => yearPageStart + index).map(year => (
                <button
                  type="button"
                  key={year}
                  className={viewYear === year ? 'is-selected' : ''}
                  onClick={() => {
                    setViewYear(year);
                    setMode('months');
                  }}
                >
                  {year}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            className="date-picker__today"
            onClick={() => {
              setViewYear(today.getFullYear());
              setViewMonth(today.getMonth());
              onChange?.(
                isMonthMode
                  ? formatIsoMonth(today.getFullYear(), today.getMonth())
                  : formatIsoDate(today.getFullYear(), today.getMonth(), today.getDate())
              );
              setOpen(false);
            }}
          >
            {isMonthMode ? 'Tháng này' : 'Hôm nay'}
          </button>
        </div>
      )}
    </div>
  );
}
