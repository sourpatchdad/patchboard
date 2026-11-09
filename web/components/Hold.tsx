// Press and hold to confirm, for anything that takes something down. A fill
// sweeps across while you hold; let go early and nothing happens. A quick
// tap says to hold instead. Works with a mouse, a finger, Space or Enter.

import { type ReactNode, useEffect, useRef, useState } from 'react';

export const HOLD_MS = 900;

export function HoldButton({
  onConfirm,
  children,
  hint,
  label,
  danger,
  disabled,
  className = 'button button-quiet',
}: {
  onConfirm: () => void;
  children: ReactNode;
  /** Shown after a tap that was too short, e.g. "Hold to stop". */
  hint: string;
  /** The accessible name, when the visible word alone is ambiguous: "Remove The.Bear...". */
  label?: string;
  danger?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [holding, setHolding] = useState(false);
  const [hinted, setHinted] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const started = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!hinted) return;
    const t = window.setTimeout(() => setHinted(false), 2500);
    return () => window.clearTimeout(t);
  }, [hinted]);

  const start = () => {
    if (disabled || timer.current) return;
    started.current = Date.now();
    setHolding(true);
    setHinted(false);
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      setHolding(false);
      onConfirm();
    }, HOLD_MS);
  };
  const stop = () => {
    if (!timer.current) return;
    window.clearTimeout(timer.current);
    timer.current = undefined;
    setHolding(false);
    if (Date.now() - started.current < HOLD_MS * 0.6) setHinted(true);
  };
  /** Let go without a hint: focus moved, the window lost focus, or the button was disabled. */
  const cancel = () => {
    if (!timer.current) return;
    window.clearTimeout(timer.current);
    timer.current = undefined;
    setHolding(false);
  };
  useEffect(() => {
    if (disabled) cancel();
  }, [disabled]);
  useEffect(() => {
    if (!holding) return;
    const off = () => cancel();
    window.addEventListener('blur', off);
    document.addEventListener('visibilitychange', off);
    return () => {
      window.removeEventListener('blur', off);
      document.removeEventListener('visibilitychange', off);
    };
  }, [holding]);

  return (
    <button
      type="button"
      className={`${className} hold ${holding ? 'is-holding' : ''} ${danger ? 'is-danger' : ''} ${hinted ? 'is-hinted' : ''}`}
      disabled={disabled}
      data-hint={hint}
      aria-label={label ? `${label}: press and hold` : typeof children === 'string' ? `${children}: press and hold` : undefined}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        // Captured, the hold survives the label changing under the finger
        // (the hint is wider than "Remove"); letting go anywhere ends it.
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* an old browser: pointerleave still ends it */
        }
        start();
      }}
      onPointerUp={stop}
      onPointerLeave={(e) => {
        if (!e.currentTarget.hasPointerCapture?.(e.pointerId)) stop();
      }}
      onPointerCancel={stop}
      onBlur={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') stop();
      }}
      style={{ ['--hold-ms' as string]: `${HOLD_MS}ms` }}
    >
      <span className="hold-fill" aria-hidden />
      <span className="hold-label">{hinted ? hint : children}</span>
    </button>
  );
}
