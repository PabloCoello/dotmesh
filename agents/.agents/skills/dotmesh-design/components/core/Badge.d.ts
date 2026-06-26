import React from "react";

export type BadgeTone =
  | "neutral" | "success" | "warning" | "danger" | "info"
  | "peach" | "lilac" | "teal" | "blue" | "sage" | "gold" | "rose";
export type BadgeVariant = "soft" | "solid" | "outline";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Colour role. @default "neutral" */
  tone?: BadgeTone;
  /** @default "soft" */
  variant?: BadgeVariant;
  /** Leading status dot. @default false */
  dot?: boolean;
  children?: React.ReactNode;
}

/** Compact status / metadata label. */
export function Badge(props: BadgeProps): JSX.Element;
