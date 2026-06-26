export interface TabItem {
  value: string;
  label: React.ReactNode;
  /** Optional count shown in mono after the label. */
  count?: number;
}

export interface TabsProps {
  /** Tab definitions. A plain string is shorthand for `{value, label}`. */
  items: (TabItem | string)[];
  /** Active tab value. */
  value: string;
  /** Called with the next tab value. */
  onChange?: (next: string) => void;
  style?: React.CSSProperties;
}

/** Underline tab bar (controlled). */
export function Tabs(props: TabsProps): JSX.Element;
