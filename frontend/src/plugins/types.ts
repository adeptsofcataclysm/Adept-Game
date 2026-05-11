/**
 * Prop types for plugin-provided React components.
 * Mirrors @adept/plugin-sdk SegmentViewProps / CardExtensionProps but typed
 * against the local SessionSnapshot so the frontend has no SDK runtime dep.
 */

import type { SessionSnapshot, Role } from "@/sessionTypes";

export type SegmentViewProps = {
  snapshot: SessionSnapshot;
  segmentId: string;
  pluginId: string;
  role: Role;
  participantId: string;
  /** Send any WS message — allows spectator/player-initiated actions from within a segment view. */
  send(type: string, payload: unknown): void;
};

export type CardExtensionProps = {
  snapshot: SessionSnapshot;
  cardKind: string;
  cardParams: unknown;
  revealed: boolean;
};
