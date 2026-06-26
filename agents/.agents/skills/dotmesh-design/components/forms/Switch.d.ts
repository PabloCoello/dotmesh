export interface SwitchProps {
  /** On/off state. @default false */
  checked?: boolean;
  /** Called with the next boolean. */
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  /** Text to the right of the track. */
  label?: React.ReactNode;
  style?: React.CSSProperties;
}

/** Binary on/off switch (controlled). */
export function Switch(props: SwitchProps): JSX.Element;
