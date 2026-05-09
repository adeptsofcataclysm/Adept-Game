/**
 * Resolves and renders plugin segment UI into layout slots:
 * - full screen (overrides host page entirely)
 * - main column
 * - rail column
 */
import type { ComponentType, ReactNode } from "react";
import type { SessionSnapshot, Role } from "@/sessionTypes";
import type { SegmentViewProps } from "./types";
import { clientPluginRegistry } from "./registry";

export type PluginSegmentResolvedLayout =
  | {
      kind: "plugin_segment";
      pluginId: string;
      segmentId: string;
      MainView?: ComponentType<SegmentViewProps>;
      RailView?: ComponentType<SegmentViewProps>;
      FullScreenView?: ComponentType<SegmentViewProps>;
    }
  | { kind: "none" };

export function resolvePluginSegmentLayout(snapshot: SessionSnapshot | null | undefined): PluginSegmentResolvedLayout {
  if (!snapshot || snapshot.phase.kind !== "plugin_segment") return { kind: "none" };
  const { pluginId, id: segmentId } = snapshot.phase;
  return {
    kind: "plugin_segment",
    pluginId,
    segmentId,
    MainView: clientPluginRegistry.getSegmentView(pluginId, segmentId),
    RailView: clientPluginRegistry.getSegmentRailView(pluginId, segmentId),
    FullScreenView: clientPluginRegistry.getSegmentFullScreenView(pluginId, segmentId),
  };
}

type RenderProps = {
  snapshot: SessionSnapshot;
  role: Role;
  send(type: string, payload: unknown): void;
};

function MissingViewCard({ pluginId, segmentId, slot }: { pluginId: string; segmentId: string; slot: string }) {
  return (
    <div className="card">
      <p style={{ color: "#f88" }}>
        No client view registered for plugin <strong>{pluginId}</strong> segment <strong>{segmentId}</strong> slot{" "}
        <strong>{slot}</strong>.
      </p>
    </div>
  );
}

function renderView(
  View: ComponentType<SegmentViewProps> | undefined,
  { snapshot, role, send }: RenderProps,
  pluginId: string,
  segmentId: string,
  slot: "main" | "rail" | "fullScreen",
): ReactNode {
  if (!View) return <MissingViewCard pluginId={pluginId} segmentId={segmentId} slot={slot} />;
  return <View snapshot={snapshot} segmentId={segmentId} pluginId={pluginId} role={role} send={send} />;
}

export function PluginSegmentFullScreenHost(props: RenderProps): ReactNode {
  const resolved = resolvePluginSegmentLayout(props.snapshot);
  if (resolved.kind === "none") return null;
  if (!resolved.FullScreenView) return null;
  return renderView(resolved.FullScreenView, props, resolved.pluginId, resolved.segmentId, "fullScreen");
}

export function PluginSegmentMainHost(props: RenderProps): ReactNode {
  const resolved = resolvePluginSegmentLayout(props.snapshot);
  if (resolved.kind === "none") return null;
  return renderView(resolved.MainView, props, resolved.pluginId, resolved.segmentId, "main");
}

export function PluginSegmentRailHost(props: RenderProps): ReactNode {
  const resolved = resolvePluginSegmentLayout(props.snapshot);
  if (resolved.kind === "none") return null;
  if (!resolved.RailView) return null;
  return renderView(resolved.RailView, props, resolved.pluginId, resolved.segmentId, "rail");
}

