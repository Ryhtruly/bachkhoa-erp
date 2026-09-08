import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

function normalizeOptions(options = []) {
  return options.map((option, index) => {
    if (typeof option === 'object' && option !== null) {
      const optionValue = option.value !== undefined ? option.value : option.id;
      return {
        value: optionValue,
        label: option.label !== undefined
          ? option.label
          : (option.name !== undefined ? option.name : optionValue),
        disabled: Boolean(option.disabled),
        key: String(optionValue ?? index),
      };
    }

    return {
      value: option,
      label: option,
      disabled: false,
      key: String(option ?? index),
    };
  });
}

function findEnabledIndex(options, start, direction) {
  if (!options.length) return -1;

  let index = start;
  for (let count = 0; count < options.length; count += 1) {
    if (!options[index]?.disabled) return index;
    index = (index + direction + options.length) % options.length;
  }

  return -1;
}

export function Select({
  id,
  label,
  options = [],
  value = '',
  onChange,
  placeholder = 'Chọn một giá trị',
  disabled = false,
  required = false,
  className = '',
  ariaLabel,
}) {
  const generatedId = useId().replace(/:/g, '');
  const selectId = id || `ui-select-${generatedId}`;
  const labelId = `${selectId}-label`;
  const listboxId = `${selectId}-listbox`;
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState('bottom');
  const [menuStyle, setMenuStyle] = useState(null);
  const normalizedOptions = useMemo(() => normalizeOptions(options), [options]);
  const selectedIndex = normalizedOptions.findIndex(
    (option) => String(option.value ?? '') === String(value ?? '')
  );
  const [activeIndex, setActiveIndex] = useState(() => (
    findEnabledIndex(normalizedOptions, Math.max(selectedIndex, 0), 1)
  ));
  const selectedOption = selectedIndex >= 0 ? normalizedOptions[selectedIndex] : null;

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 6;
    const estimatedMenuHeight = Math.min(260, Math.max(120, normalizedOptions.length * 40));
    const menuHeight = menuRef.current?.getBoundingClientRect().height || estimatedMenuHeight;
    const hasRoomBelow = rect.bottom + gap + menuHeight <= window.innerHeight - viewportPadding;
    const hasRoomAbove = rect.top - gap - menuHeight >= viewportPadding;
    const nextPlacement = !hasRoomBelow && hasRoomAbove ? 'top' : 'bottom';
    const width = Math.min(rect.width, Math.max(0, window.innerWidth - viewportPadding * 2));
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      Math.max(viewportPadding, window.innerWidth - width - viewportPadding)
    );
    const idealTop = nextPlacement === 'top'
      ? rect.top - menuHeight - gap
      : rect.bottom + gap;
    const top = Math.max(
      viewportPadding,
      Math.min(idealTop, window.innerHeight - menuHeight - viewportPadding)
    );

    setPlacement(nextPlacement);
    setMenuStyle({
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      right: 'auto',
      width: `${width}px`,
    });
  }, [normalizedOptions.length]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      const insideTrigger = wrapperRef.current?.contains(event.target);
      const insideMenu = menuRef.current?.contains(event.target);
      if (!insideTrigger && !insideMenu) {
        setOpen(false);
        setMenuStyle(null);
      }
    };
    const handleViewportChange = () => updateMenuPosition();

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    updateMenuPosition();

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) {
      setActiveIndex(findEnabledIndex(
        normalizedOptions,
        selectedIndex >= 0 ? selectedIndex : 0,
        1
      ));
    }
  }, [open, selectedIndex, normalizedOptions]);

  const selectOption = (option) => {
    if (!option || option.disabled) return;
      onChange?.(String(option.value ?? ''));
      setOpen(false);
      setMenuStyle(null);
      triggerRef.current?.focus();
  };

  const moveActive = (direction) => {
    if (!normalizedOptions.length) return;
    const current = activeIndex >= 0 ? activeIndex : (direction > 0 ? 0 : normalizedOptions.length - 1);
    const next = findEnabledIndex(
      normalizedOptions,
      (current + direction + normalizedOptions.length) % normalizedOptions.length,
      direction
    );
    if (next >= 0) setActiveIndex(next);
  };

  const handleKeyDown = (event) => {
    if (disabled) return;

    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        setOpen(false);
        setMenuStyle(null);
      }
      return;
    }

    if (event.key === 'Tab') {
      setOpen(false);
      setMenuStyle(null);
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        updateMenuPosition();
        setOpen(true);
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        const startIndex = selectedIndex >= 0
          ? (selectedIndex + direction + normalizedOptions.length) % normalizedOptions.length
          : (direction > 0 ? 0 : normalizedOptions.length - 1);
        const nextIndex = findEnabledIndex(normalizedOptions, startIndex, direction);
        setActiveIndex(nextIndex >= 0 ? nextIndex : Math.max(selectedIndex, 0));
      } else {
        moveActive(event.key === 'ArrowDown' ? 1 : -1);
      }
      return;
    }

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActiveIndex(findEnabledIndex(
        normalizedOptions,
        event.key === 'Home' ? 0 : normalizedOptions.length - 1,
        event.key === 'Home' ? 1 : -1
      ));
      if (!open) {
        updateMenuPosition();
        setOpen(true);
      }
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) {
        updateMenuPosition();
        setOpen(true);
      } else {
        selectOption(normalizedOptions[activeIndex]);
      }
    }
  };

  return (
    <div
      ref={wrapperRef}
      className={`ui-select ${open ? 'ui-select--open' : ''} ui-select--${placement} ${className}`.trim()}
    >
      {label && (
        <label id={labelId} className="ui-select__label" htmlFor={selectId}>
          {label}
        </label>
      )}
      <button
        ref={triggerRef}
        id={selectId}
        type="button"
        className="ui-select__trigger"
        aria-label={ariaLabel}
        aria-labelledby={label ? labelId : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-option-${normalizedOptions[activeIndex].key}` : undefined}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => {
          if (open) {
            setOpen(false);
            setMenuStyle(null);
          } else {
            updateMenuPosition();
            setOpen(true);
          }
        }}
        onKeyDown={handleKeyDown}
      >
        <span className={`ui-select__value ${selectedOption ? '' : 'ui-select__value--placeholder'}`.trim()}>
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown aria-hidden="true" className="ui-select__chevron" size={16} />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          id={listboxId}
          role="listbox"
          className="ui-select__menu"
          style={menuStyle || undefined}
          aria-labelledby={label ? labelId : undefined}
        >
          {normalizedOptions.length ? normalizedOptions.map((option, index) => (
            <div
              id={`${listboxId}-option-${option.key}`}
              key={option.key}
              role="option"
              tabIndex={-1}
              aria-selected={index === selectedIndex}
              aria-disabled={option.disabled || undefined}
              className={`ui-select__option ${index === activeIndex ? 'is-active' : ''} ${index === selectedIndex ? 'is-selected' : ''}`.trim()}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption(option)}
            >
              <span className="ui-select__option-label">{option.label}</span>
              {index === selectedIndex && <Check aria-hidden="true" size={16} className="ui-select__check" />}
            </div>
          )) : (
            <div className="ui-select__empty">Không có lựa chọn</div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

export default Select;
