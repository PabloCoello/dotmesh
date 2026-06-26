import React from "react";

export type CardPadding = "sm" | "md" | "lg";
export type CardElevation = "none" | "sm" | "md" | "lg";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Inner padding. @default "md" */
  padding?: CardPadding;
  /** Resting shadow. @default "none" */
  elevation?: CardElevation;
  /** Hover affordance for clickable cards. @default false */
  interactive?: boolean;
  children?: React.ReactNode;
}

/** Surface container with hairline border and optional elevation. */
export function Card(props: CardProps): JSX.Element;
