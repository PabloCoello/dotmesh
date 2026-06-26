import React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Field label above the control. */
  label?: React.ReactNode;
  /** Static node before the value (e.g. "~/"). */
  prefix?: React.ReactNode;
  /** Static node after the value (e.g. ".zsh"). */
  suffix?: React.ReactNode;
  /** Helper / error text below. */
  hint?: React.ReactNode;
  /** Error styling. @default false */
  invalid?: boolean;
}

/** Single-line text field. */
export function Input(props: InputProps): JSX.Element;
