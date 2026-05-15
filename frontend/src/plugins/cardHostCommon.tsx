/**
 * Shared helpers for card-plugin host components (`Card*Host.tsx`).
 */

import type { ComponentType } from "react";
import type { ActiveCard, QuestionCell, Role, SessionSnapshot } from "@/sessionTypes";
import type { CardActionProps, CardFullScreenProps, CardModalProps } from "./types";
import { clientPluginRegistry } from "./registry";

const WHEEL_OVERLAY_SEGMENT_KEY = "wheel_of_adepts_overlay";
const WHEEL_CARD_KIND = "wheel_of_adepts";

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
      if (k === "wheel_of_adepts") continue;
      return { cardKind: k, FullScreenView: def.FullScreenView };
    }
  }
  return null;
}

/** Prefer wheel column from `segmentState` after the card was revealed & closed. */
export function pickFullScreenFromSnapshot(snapshot: SessionSnapshot):
  | { cardKind: string; FullScreenView: ComponentType<CardFullScreenProps> }
  | null {
  const raw = snapshot.segmentState[WHEEL_OVERLAY_SEGMENT_KEY];
  if (raw && typeof raw === "object" && "anchor" in raw) {
    const def = clientPluginRegistry.getCardKindClient(WHEEL_CARD_KIND);
    if (def?.FullScreenView) return { cardKind: WHEEL_CARD_KIND, FullScreenView: def.FullScreenView };
  }
  if (!snapshot.activeCard) return null;
  return pickFullScreenKind(snapshot.activeCard);
}

/**
 * When the wheel overlay is active, build `CommonHostProps` with a synthetic `activeCard`
 * so plugin views keep the same props shape.
 */
export function buildWheelOverlayCommonHost(
  snapshot: SessionSnapshot | null | undefined,
  role: Role,
  participantId: string,
  send: CommonHostProps["send"],
): CommonHostProps | null {
  if (!snapshot) return null;
  const raw = snapshot.segmentState[WHEEL_OVERLAY_SEGMENT_KEY];
  if (!raw || typeof raw !== "object" || !("anchor" in raw)) return null;
  const seg = raw as Record<string, unknown>;
  const anchor = seg.anchor as {
    board: "round" | "finalTransition";
    roundIndex?: 1 | 2 | 3;
    rowIndex: number;
    colIndex: number;
  };
  const board =
    anchor.board === "finalTransition"
      ? snapshot.finalTransitionBoard
      : anchor.roundIndex
        ? snapshot.roundBoard[anchor.roundIndex]
        : null;
  if (!board) return null;
  const cell = board.questions[anchor.rowIndex]?.[anchor.colIndex];
  if (!cell) return null;
  const rawTheme = board.themes[anchor.rowIndex] ?? "";
  const themeName = String(rawTheme).trim() ? String(rawTheme).trim() : `Тема ${anchor.rowIndex + 1}`;
  const points = board.pointValues?.[anchor.rowIndex]?.[anchor.colIndex] ?? (anchor.colIndex + 1) * 100;

  const bucket: Record<string, unknown> = { ...seg };
  delete bucket.anchor;

  const syntheticActive: ActiveCard = {
    board: anchor.board,
    roundIndex: anchor.board === "round" ? anchor.roundIndex : undefined,
    rowIndex: anchor.rowIndex,
    colIndex: anchor.colIndex,
    stage: "answer",
    cardKinds: [WHEEL_CARD_KIND],
    pluginState: { [WHEEL_CARD_KIND]: bucket },
  };

  return {
    snapshot,
    activeCard: syntheticActive,
    themeName,
    pointValue: points,
    cell,
    role,
    participantId,
    send,
  };
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
