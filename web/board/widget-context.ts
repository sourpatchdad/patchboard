// What a widget's own settings ask of the components inside it: a header
// name, how many items, a style. Section reads the title, so every widget
// can be renamed without each one threading a prop through.

import { createContext, useContext } from 'react';

export interface WidgetSettings {
  title?: string;
  limit?: number;
  style?: string;
  days?: number;
}

export const WidgetCtx = createContext<WidgetSettings | null>(null);

export function useWidget(): WidgetSettings {
  return useContext(WidgetCtx) ?? {};
}
