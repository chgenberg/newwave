"use client";

import { createPortal } from "react-dom";
import { IFKLoader } from "@/components/IFKLoader";

export function ClubLoader(props: React.ComponentProps<typeof IFKLoader>) {
  if (!props.state.open || typeof document === "undefined") return null;
  return createPortal(<IFKLoader {...props} />, document.querySelector(".nw-club") ?? document.body);
}
