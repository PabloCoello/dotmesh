import React from "react";

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
}

/** Keyboard key cap, set in mono. */
export function Kbd(props: KbdProps): JSX.Element;
