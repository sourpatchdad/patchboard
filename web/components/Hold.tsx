// Press and hold to confirm, for anything that takes something down. A fill
// sweeps across while you hold; let go early and nothing happens. A quick
// tap says to hold instead. Works with a mouse, a finger, Space or Enter.
// Screen readers, voice control and switch access send a plain click, which
// can't be held: that click arms the button, and a second within five
// seconds confirms.

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
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const started = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 5000);
    return () => window.clearTimeout(t);
  }, [armed]);
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
    if (disabled) {
      cancel();
      setArmed(false);
    }
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

  const name = label ?? (typeof children === 'string' ? children : undefined);
  return (
    <>
    <button
      type="button"
      className={`${className} hold ${holding ? 'is-holding' : ''} ${danger ? 'is-danger' : ''} ${hinted ? 'is-hinted' : ''}`}
      // aria-disabled keeps focus on the button while it's busy; a disabled button drops it.
      aria-disabled={disabled || undefined}
      data-hint={hint}
      aria-label={name ? (armed ? `${name}: press again to confirm` : `${name}: press and hold, or press twice`) : undefined}
      onClick={(e) => {
        // A pointer or key press is a hold, handled above; only a plain click arrives with detail 0.
        if (e.detail !== 0 || disabled || timer.current) return;
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
      onPointerDown={(e) => {
        if (e.button !== 0 || disabled) return;
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
      <span className="hold-label">{armed ? 'Press again to confirm' : hinted ? hint : children}</span>
    </button>
    <span className="sr-only" role="status">
      {armed && name ? `Press ${name} again to confirm.` : ''}
    </span>
    </>
  );
}
