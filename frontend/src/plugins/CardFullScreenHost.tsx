/**
 * Renders a `replace_field` card plugin's full-screen view (orthogonal to `phase`).
 */

import type { ReactNode } from "react";
import type { SessionSnapshot } from "@/sessionTypes";
import { modalProps, pickFullScreenKind, type CommonHostProps } from "./cardHostCommon";

export function resolveActiveCardFullScreen(snapshot: SessionSnapshot | null | undefined):
  | { kind: "card_full_screen"; cardKind: string }
  | { kind: "none" } {
  if (!snapshot?.activeCard) return { kind: "none" };
  const picked = pickFullScreenKind(snapshot.activeCard);
  if (!picked) return { kind: "none" };
  return { kind: "card_full_screen", cardKind: picked.cardKind };
}

export function CardFullScreenHost(host: CommonHostProps): ReactNode {
  const picked = pickFullScreenKind(host.activeCard);
  if (!picked) return null;
  const { cardKind, FullScreenView } = picked;
  return <FullScreenView {...modalProps(host, cardKind)} />;
}
