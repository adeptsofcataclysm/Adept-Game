/**
 * Prop types for plugin-provided React components.
 * Mirrors @adept/plugin-sdk SegmentViewProps / CardExtensionProps but typed
 * against the local SessionSnapshot so the frontend has no SDK runtime dep.
 */

import type { SessionSnapshot } from "@/sessionTypes";

export type SegmentViewProps = {
  snapshot: SessionSnapshot;
  segmentId: string;
  pluginId: string;
  /** Send a `plugin_action` message over the existing show WebSocket. */
  sendAction(action: string, payload?: unknown): void;
};

export type CardExtensionProps = {
  snapshot: SessionSnapshot;
  cardKind: string;
  cardParams: unknown;
  revealed: boolean;
};
