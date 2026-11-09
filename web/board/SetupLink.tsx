// The way into an empty widget's settings, right where it says what's missing.

import { useWidget } from './widget-context.ts';

export function SetupLink({ children }: { children: string }) {
  const { configure } = useWidget();
  return configure ? (
    <button type="button" className="text-button" onClick={configure}>
      {children}
    </button>
  ) : (
    <>{children} in this widget's settings</>
  );
}
