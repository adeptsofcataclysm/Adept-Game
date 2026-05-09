/**
 * Client-side plugin registry.
 *
 * Plugins call `registerSegmentView` / `registerCardExtension` at bundle time.
 * The host renders `<PluginSegmentHost>` and `<CardExtensionHost>` which look
 * up components here by (pluginId, segmentId) or cardKind.
 *
 * A Vite prebuild script (scripts/gen-plugin-barrel.ts, forthcoming) generates
 * `frontend/src/plugins/index.ts` by globbing node_modules/@adept-plugins/* and
 * importing each plugin's `./client` entry which calls `registerClient(registry)`.
 */

import type { ComponentType } from "react";
import type { SegmentViewProps, CardExtensionProps } from "./types";

type SegmentKey = `${string}:${string}`; // `${pluginId}:${segmentId}`

class ClientPluginRegistryImpl {
  private readonly _segmentViews = new Map<SegmentKey, ComponentType<SegmentViewProps>>();
  private readonly _segmentRailViews = new Map<SegmentKey, ComponentType<SegmentViewProps>>();
  private readonly _segmentFullScreenViews = new Map<SegmentKey, ComponentType<SegmentViewProps>>();
  private readonly _cardExtensions = new Map<string, ComponentType<CardExtensionProps>>();

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

  registerCardExtension(cardKind: string, component: ComponentType<CardExtensionProps>): void {
    this._cardExtensions.set(cardKind, component);
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

  getCardExtension(cardKind: string): ComponentType<CardExtensionProps> | undefined {
    return this._cardExtensions.get(cardKind);
  }
}

export const clientPluginRegistry = new ClientPluginRegistryImpl();
