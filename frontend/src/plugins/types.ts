/**
 * Prop types for plugin-provided React components.
 * Mirrors @adept/plugin-sdk types but typed against the local SessionSnapshot
 * so the frontend has no SDK runtime dependency.
 */

import type { ComponentType } from "react";
import type { ActiveCard, QuestionCell, Role, SessionSnapshot } from "@/sessionTypes";

export type SegmentViewProps = {
  snapshot: SessionSnapshot;
  segmentId: string;
  pluginId: string;
  role: Role;
  participantId: string;
  /** Send any WS message — allows spectator/player-initiated actions from within a segment view. */
  send(type: string, payload: unknown): void;
};

/**
 * Common props for plugin-provided components rendered while a card is open.
 * `cardParams` / `pluginState` are scoped to a single `cardKind`.
 */
export type CardActionProps = {
  snapshot: SessionSnapshot;
  activeCard: ActiveCard;
  cardKind: string;
  cardParams: unknown;
  pluginState: unknown;
  role: Role;
  participantId: string;
  /** Convenience: emits `plugin_card_event` for this cardKind. */
  send(event: string, payload: unknown): void;
};

export type CardModalProps = CardActionProps & {
  themeName: string;
  pointValue: number;
  cell: QuestionCell;
};

export type CardFullScreenProps = CardModalProps;

export type CardParamsEditorProps = {
  value: unknown;
  onChange(next: unknown): void;
  role: "host";
};

/**
 * Client-side metadata + components for a `cardKind`.
 *
 * The host's per-cell card-plugin picker reads `label` / `description` here;
 * `ParamsEditor` is rendered when the kind declares `hasParams` on the
 * server-side manifest. `Pre/PostRevealAction` / `ModalView` / `FullScreenView`
 * are rendered while a card with this kind is open.
 */
export type CardKindClientDef = {
  label: string;
  description?: string;
  defaultParams?: () => unknown;
  ParamsEditor?: ComponentType<CardParamsEditorProps>;
  PreRevealAction?: ComponentType<CardActionProps>;
  PostRevealAction?: ComponentType<CardActionProps>;
  ModalView?: ComponentType<CardModalProps>;
  FullScreenView?: ComponentType<CardFullScreenProps>;
  /** Host-only: extra actions in the modal footer row on the answer stage. */
  HostAnswerFooterAction?: ComponentType<CardActionProps>;
};

/** Edit-UI metadata derived from a client `CardKindClientDef` (used by the host picker). */
export type CardKindClientMetadata = {
  label: string;
  description?: string;
  hasDefaultParams: boolean;
  hasParamsEditor: boolean;
  hasPreRevealAction: boolean;
  hasPostRevealAction: boolean;
  hasModalView: boolean;
  hasFullScreenView: boolean;
  hasHostAnswerFooterAction: boolean;
};
