/**
 * Renders `in_card` plugin action rows (`PreRevealAction` / `PostRevealAction`) for the open card.
 */

import type { ComponentType, ReactNode } from "react";
import type { CardActionProps } from "./types";
import { commonProps, type CommonHostProps } from "./cardHostCommon";
import { clientPluginRegistry } from "./registry";

export function CardPreRevealActions(host: CommonHostProps): ReactNode {
  const slots = host.activeCard.cardKinds
    .map((k) => {
      const def = clientPluginRegistry.getCardKindClient(k);
      return def?.PreRevealAction ? { cardKind: k, Action: def.PreRevealAction } : null;
    })
    .filter((x): x is { cardKind: string; Action: ComponentType<CardActionProps> } => x != null);
  if (slots.length === 0) return null;
  return (
    <div className="adepts-question-modal__plugin-slots adepts-question-modal__plugin-slots--pre">
      {slots.map(({ cardKind, Action }) => (
        <Action key={cardKind} {...commonProps(host, cardKind)} />
      ))}
    </div>
  );
}

export function CardPostRevealActions(host: CommonHostProps): ReactNode {
  const slots = host.activeCard.cardKinds
    .map((k) => {
      const def = clientPluginRegistry.getCardKindClient(k);
      return def?.PostRevealAction ? { cardKind: k, Action: def.PostRevealAction } : null;
    })
    .filter((x): x is { cardKind: string; Action: ComponentType<CardActionProps> } => x != null);
  if (slots.length === 0) return null;
  return (
    <div className="adepts-question-modal__plugin-slots adepts-question-modal__plugin-slots--post">
      {slots.map(({ cardKind, Action }) => (
        <Action key={cardKind} {...commonProps(host, cardKind)} />
      ))}
    </div>
  );
}

/** Convenience wrapper — renders pre-reveal slots only, post-reveal only, or both. */
export function CardActionSlots(
  host: CommonHostProps & { slot: "pre" | "post" | "both" },
): ReactNode {
  const { slot, ...rest } = host;
  if (slot === "pre") return <CardPreRevealActions {...rest} />;
  if (slot === "post") return <CardPostRevealActions {...rest} />;
  return (
    <>
      <CardPreRevealActions {...rest} />
      <CardPostRevealActions {...rest} />
    </>
  );
}
