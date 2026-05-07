/**
 * Renders the React component registered for the current plugin_segment phase.
 * Mounted by ShowPage when `snapshot.phase.kind === "plugin_segment"`.
 */

import type { SessionSnapshot } from "@/sessionTypes";
import { clientPluginRegistry } from "./registry";

type Props = {
  snapshot: SessionSnapshot;
  sendAction(action: string, payload?: unknown): void;
};

export function PluginSegmentHost({ snapshot, sendAction }: Props) {
  if (snapshot.phase.kind !== "plugin_segment") return null;

  const { pluginId, id: segmentId } = snapshot.phase;
  const View = clientPluginRegistry.getSegmentView(pluginId, segmentId);

  if (!View) {
    return (
      <div className="card">
        <p style={{ color: "#f88" }}>
          No client view registered for plugin <strong>{pluginId}</strong> segment{" "}
          <strong>{segmentId}</strong>.
        </p>
      </div>
    );
  }

  return <View snapshot={snapshot} segmentId={segmentId} pluginId={pluginId} sendAction={sendAction} />;
}
