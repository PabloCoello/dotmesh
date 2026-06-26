import React from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual weight. Monochrome unless `danger`. @default "primary" */
  variant?: ButtonVariant;
  /** @default "md" */
  size?: ButtonSize;
  disabled?: boolean;
  /** Stretch to container width. @default false */
  fullWidth?: boolean;
  /** Icon node rendered before the label. */
  leadingIcon?: React.ReactNode;
  /** Icon node rendered after the label. */
  trailingIcon?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * Primary action control for dotmesh surfaces.
 * @startingPoint section="Core" subtitle="Monochrome button — primary, secondary, ghost, danger" viewport="700x150"
 */
export function Button(props: ButtonProps): JSX.Element;
