/**
 * Renders a `replace_field` card plugin's full-screen view (orthogonal to `phase`).
 */

import type { ReactNode } from "react";
import type { SessionSnapshot } from "@/sessionTypes";
import { modalProps, pickFullScreenFromSnapshot, type CommonHostProps } from "./cardHostCommon";

export function resolveActiveCardFullScreen(snapshot: SessionSnapshot | null | undefined):
  | { kind: "card_full_screen"; cardKind: string }
  | { kind: "none" } {
  if (!snapshot) return { kind: "none" };
  const picked = pickFullScreenFromSnapshot(snapshot);
  if (!picked) return { kind: "none" };
  return { kind: "card_full_screen", cardKind: picked.cardKind };
}

export function CardFullScreenHost(host: CommonHostProps): ReactNode {
  const picked = pickFullScreenFromSnapshot(host.snapshot);
  if (!picked) return null;
  const { cardKind, FullScreenView } = picked;
  return <FullScreenView {...modalProps(host, cardKind)} />;
}
