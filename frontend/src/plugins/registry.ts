/**
 * Client-side plugin registry.
 *
 * Plugins call `registerSegmentView` / `registerCardKindClient` at bundle time.
 * The host renders `<PluginSegmentLayoutHost>` (segments) and card hosts from
 * `CardFullScreenHost` / `CardModalBodyHost` / `CardActionSlots` (re-exported
 * from `CardLayoutHost.tsx` for convenience).
 *
 * A Vite prebuild script (scripts/gen-plugin-barrel.ts, forthcoming) generates
 * `frontend/src/plugins/index.ts` by globbing node_modules/@adept-plugins/* and
 * importing each plugin's `./client` entry which calls `registerClient(registry)`.
 */

import type { ComponentType } from "react";
import type { CardKindClientDef, CardKindClientMetadata, SegmentViewProps } from "./types";

type SegmentKey = `${string}:${string}`; // `${pluginId}:${segmentId}`

class ClientPluginRegistryImpl {
  private readonly _segmentViews = new Map<SegmentKey, ComponentType<SegmentViewProps>>();
  private readonly _segmentRailViews = new Map<SegmentKey, ComponentType<SegmentViewProps>>();
  private readonly _segmentFullScreenViews = new Map<SegmentKey, ComponentType<SegmentViewProps>>();
  private readonly _cardKinds = new Map<string, CardKindClientDef>();

  registerSegmentView(
    pluginId: string,
    segmentId: string,
    component: ComponentType<SegmentViewProps>,
  ): void {
    this._segmentViews.set(`${pluginId}:${segmentId}`, component);
  }

  registerSegmentRailView(
    pluginId: string,
    segmentId: string,
    component: ComponentType<SegmentViewProps>,
  ): void {
    this._segmentRailViews.set(`${pluginId}:${segmentId}`, component);
  }

  registerSegmentFullScreenView(
    pluginId: string,
    segmentId: string,
    component: ComponentType<SegmentViewProps>,
  ): void {
    this._segmentFullScreenViews.set(`${pluginId}:${segmentId}`, component);
  }

  /**
   * Register a card-plugin kind on the client side. `cardKind` strings are a
   * global namespace shared with the server registry — collisions silently
   * keep the first registration.
   */
  registerCardKindClient(cardKind: string, def: CardKindClientDef): void {
    if (!this._cardKinds.has(cardKind)) {
      this._cardKinds.set(cardKind, def);
    }
  }

  getSegmentView(pluginId: string, segmentId: string): ComponentType<SegmentViewProps> | undefined {
    return this._segmentViews.get(`${pluginId}:${segmentId}`);
  }

  getSegmentRailView(pluginId: string, segmentId: string): ComponentType<SegmentViewProps> | undefined {
    return this._segmentRailViews.get(`${pluginId}:${segmentId}`);
  }

  getSegmentFullScreenView(pluginId: string, segmentId: string): ComponentType<SegmentViewProps> | undefined {
    return this._segmentFullScreenViews.get(`${pluginId}:${segmentId}`);
  }

  getCardKindClient(cardKind: string): CardKindClientDef | undefined {
    return this._cardKinds.get(cardKind);
  }

  /**
   * Metadata for the host card-plugin editor (labels, capability flags).
   * When no client registration exists for a server-registered kind, returns `undefined`.
   */
  getCardKindClientMetadata(cardKind: string): CardKindClientMetadata | undefined {
    const def = this._cardKinds.get(cardKind);
    if (!def) return undefined;
    return {
      label: def.label,
      description: def.description,
      hasDefaultParams: typeof def.defaultParams === "function",
      hasParamsEditor: def.ParamsEditor != null,
      hasPreRevealAction: def.PreRevealAction != null,
      hasPostRevealAction: def.PostRevealAction != null,
      hasModalView: def.ModalView != null,
      hasFullScreenView: def.FullScreenView != null,
      hasHostAnswerFooterAction: def.HostAnswerFooterAction != null,
    };
  }
}

export const clientPluginRegistry = new ClientPluginRegistryImpl();
