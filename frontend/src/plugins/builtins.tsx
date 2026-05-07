/**
 * Client-side views for built-in plugin segments (pluginId "builtin").
 * Registered in index.ts at bundle time via clientPluginRegistry.
 *
 * Segments:
 *   story_video   — Host advances to donations; no player input.
 *   donations     — Players submit donation amounts.
 *   between_final — Host advances to final; no player input.
 */

import { useState } from "react";
import type { SegmentViewProps } from "./types";
import type { DonationsState } from "@/sessionTypes";

// ---------------------------------------------------------------------------
// story_video
// ---------------------------------------------------------------------------

export function StoryVideoSegmentView(_props: SegmentViewProps) {
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Сюжет (story_video)</h3>
      <p style={{ color: "#aaa" }}>Воспроизводится сюжетный ролик…</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// donations
// ---------------------------------------------------------------------------

export function DonationsSegmentView({ snapshot, role, send }: SegmentViewProps) {
  const [donSeat, setDonSeat] = useState(0);
  const [donAmount, setDonAmount] = useState(0);

  const state = (snapshot.segmentState["donations"] ?? { bySeat: [null, null, null, null, null] }) as DonationsState;

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Донаты (REQ-12)</h3>
      <div style={{ marginBottom: 12, fontSize: "0.85rem", color: "#aaa" }}>
        {state.bySeat.map((v, i) => (
          <span key={i} style={{ marginRight: 12 }}>
            Игрок {i + 1}: {v ?? "—"}
          </span>
        ))}
      </div>
      {role === "player" ? (
        <div className="row">
          <label>
            Место 0–4{" "}
            <input
              type="number"
              min={0}
              max={4}
              value={donSeat}
              onChange={(e) => setDonSeat(Number(e.target.value))}
            />
          </label>
          <label>
            Сумма{" "}
            <input
              type="number"
              min={0}
              value={donAmount}
              onChange={(e) => setDonAmount(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            onClick={() =>
              send("player_donation", { seatIndex: donSeat, amount: donAmount })
            }
          >
            Отправить донат
          </button>
        </div>
      ) : (
        <p style={{ color: "#aaa", fontSize: "0.85rem" }}>Ожидание донатов от игроков…</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// between_final
// ---------------------------------------------------------------------------

export function BetweenFinalSegmentView(_props: SegmentViewProps) {
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Переход к финалу</h3>
      <p style={{ color: "#aaa" }}>Подготовка к финальному раунду…</p>
    </div>
  );
}
