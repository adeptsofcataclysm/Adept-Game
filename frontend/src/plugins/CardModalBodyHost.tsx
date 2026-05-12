/**
 * Renders a `replace_card` plugin's modal body (replaces the standard question/answer pane).
 */

import type { ReactNode } from "react";
import { modalProps, pickModalViewKind, type CommonHostProps } from "./cardHostCommon";

export function CardModalBodyHost(host: CommonHostProps): ReactNode {
  const picked = pickModalViewKind(host.activeCard);
  if (!picked) return null;
  const { cardKind, ModalView } = picked;
  return <ModalView {...modalProps(host, cardKind)} />;
}
