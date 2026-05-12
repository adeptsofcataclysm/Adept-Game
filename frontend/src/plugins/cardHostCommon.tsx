/**
 * Shared helpers for card-plugin host components (`Card*Host.tsx`).
 */

import type { ComponentType } from "react";
import type { ActiveCard, QuestionCell, Role, SessionSnapshot } from "@/sessionTypes";
import type { CardActionProps, CardFullScreenProps, CardModalProps } from "./types";
import { clientPluginRegistry } from "./registry";

export type CommonHostProps = {
  snapshot: SessionSnapshot;
  activeCard: ActiveCard;
  themeName: string;
  pointValue: number;
  cell: QuestionCell;
  role: Role;
  participantId: string;
  send(type: string, payload: unknown): void;
};

export function emitCardEvent(
  send: CommonHostProps["send"],
  cardKind: string,
): (event: string, payload: unknown) => void {
  return (event, payload) =>
    send("plugin_card_event", { cardKind, event, payload });
}

export function commonProps(host: CommonHostProps, cardKind: string): CardActionProps {
  return {
    snapshot: host.snapshot,
    activeCard: host.activeCard,
    cardKind,
    cardParams: host.cell.cardParams?.[cardKind],
    pluginState: host.activeCard.pluginState[cardKind],
    role: host.role,
    participantId: host.participantId,
    send: emitCardEvent(host.send, cardKind),
  };
}

export function modalProps(host: CommonHostProps, cardKind: string): CardModalProps {
  return {
    ...commonProps(host, cardKind),
    themeName: host.themeName,
    pointValue: host.pointValue,
    cell: host.cell,
  };
}

export function pickFullScreenKind(activeCard: ActiveCard):
  | { cardKind: string; FullScreenView: ComponentType<CardFullScreenProps> }
  | null {
  for (const k of activeCard.cardKinds) {
    const def = clientPluginRegistry.getCardKindClient(k);
    if (def?.FullScreenView) {
      return { cardKind: k, FullScreenView: def.FullScreenView };
    }
  }
  return null;
}

export function pickModalViewKind(activeCard: ActiveCard):
  | { cardKind: string; ModalView: ComponentType<CardModalProps> }
  | null {
  for (const k of activeCard.cardKinds) {
    const def = clientPluginRegistry.getCardKindClient(k);
    if (def?.ModalView) return { cardKind: k, ModalView: def.ModalView };
  }
  return null;
}
