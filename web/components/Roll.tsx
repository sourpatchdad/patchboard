// A number that rolls to its new value, each digit on its own reel, like an
// odometer. It moves only when the value changes, never on first paint, and
// not at all for anyone who asks for reduced motion. Decimals change in place,
// so a reading that wobbles every poll doesn't keep the page moving. Screen
// readers get the plain text.

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function Roll({ value, className }: { value: string; className?: string }) {
  // Keyed from the right, so "9%" to "10%" turns the ones reel and adds a tens.
  const chars = [...value];
  const dot = value.indexOf('.');
  return (
    <span className={`roll ${className ?? ''}`}>
      <span className="sr-only">{value}</span>
      {chars.map((ch, i) => {
        const key = chars.length - i;
        if (!/\d/.test(ch) || (dot >= 0 && i > dot)) {
          return (
            <span key={`c${key}`} className="roll-ch" aria-hidden>
              {ch}
            </span>
          );
        }
        return (
          <span key={`d${key}`} className="roll-digit" aria-hidden>
            <span className="roll-reel" style={{ transform: `translateY(${-Number(ch) * 10}%)` }}>
              {DIGITS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
