import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Phase } from "@/sessionTypes";
import { useSessionWs } from "@/useSessionWs";
import { getDisplayName, getHostSecret, setHostSecret } from "@/storage";

const PHASE_PRESETS: { label: string; phase: Phase }[] = [
  { label: "lobby (incl. opening the show)", phase: { kind: "lobby" } },
  { label: "spectator_picks", phase: { kind: "spectator_picks" } },
  { label: "round 1", phase: { kind: "round", roundIndex: 1 } },
  { label: "round 2", phase: { kind: "round", roundIndex: 2 } },
  { label: "mini_wheel 1", phase: { kind: "mini_wheel", roundIndex: 1 } },
  { label: "mini_roulette 1", phase: { kind: "mini_roulette", roundIndex: 1 } },
  { label: "story_video", phase: { kind: "story_video" } },
  { label: "donations", phase: { kind: "donations" } },
  { label: "round 3", phase: { kind: "round", roundIndex: 3 } },
  { label: "between_final", phase: { kind: "between_final" } },
  { label: "final", phase: { kind: "final" } },
  { label: "game_over", phase: { kind: "game_over" } },
];

export function AdminPage() {
  const showId = useMemo(() => {
    const q = new URLSearchParams(window.location.search).get("showId");
    return q?.trim() || "default";
  }, []);

  const [secretInput, setSecretInput] = useState(() => getHostSecret());
  const [secretApplied, setSecretApplied] = useState(() => getHostSecret());
  const [presetIndex, setPresetIndex] = useState(0);

  const { snapshot, lastError, connected, send } = useSessionWs({
    showId,
    role: "host",
    hostSecret: secretApplied || undefined,
    enabled: true,
  });

  return (
    <div className="card">
      <h1 style={{ marginTop: 0 }}>Host /admin</h1>
      <p style={{ fontSize: "0.9rem", opacity: 0.9 }}>
        REQ-14.2: Host uses <code>/admin</code> after authentication. Set <code>ADEPT_HOST_SECRET</code> on the
        session service, then enter the same value here so the WebSocket accepts the Host role.
      </p>
      <div className="row" style={{ marginBottom: "0.75rem" }}>
        <label>
          Host secret{" "}
          <input
            type="password"
            value={secretInput}
            onChange={(e) => setSecretInput(e.target.value)}
            placeholder="matches ADEPT_HOST_SECRET"
            style={{ minWidth: 220 }}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setHostSecret(secretInput);
            setSecretApplied(secretInput.trim());
          }}
        >
          Save and connect
        </button>
        <Link to="/">Home</Link> · <Link to="/show">Show</Link>
      </div>

      <p>
        <span className="phase">{connected ? "Connected" : "Connecting…"}</span> —{" "}
        {snapshot ? (
          <>
            phase <code>{JSON.stringify(snapshot.phase)}</code> — v{snapshot.version}
          </>
        ) : (
          "no snapshot yet"
        )}
      </p>
      {lastError ? <p style={{ color: "#f88" }}>{lastError}</p> : null}

      {snapshot ? (
        <p style={{ fontSize: "0.85rem", opacity: 0.9 }}>
          <strong>Mini-game counts</strong> (Wheel / Roulette starts from quiz board, R1–R3):{" "}
          <code>W {snapshot.miniWheelPlaysByRound.join(",")}</code> ·{" "}
          <code>R {snapshot.miniRoulettePlaysByRound.join(",")}</code>
        </p>
      ) : null}

      {snapshot &&
      (snapshot.phase.kind === "between_final" || snapshot.phase.kind === "final") ? (
        <p style={{ fontSize: "0.9rem", opacity: 0.95 }}>
          <strong>Final segment</strong> uses <code>round-4.json</code> — themes:{" "}
          {snapshot.finalTransitionBoard.themes.join(", ")} ({snapshot.finalTransitionBoard.questions[0]?.length ?? 0}{" "}
          cells).
        </p>
      ) : null}

      <div className="row" style={{ marginTop: "1rem", flexWrap: "wrap" }}>
        <label>
          Transition to{" "}
          <select value={presetIndex} onChange={(e) => setPresetIndex(Number(e.target.value))}>
            {PHASE_PRESETS.map((p, i) => (
              <option key={p.label} value={i}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            const ph = PHASE_PRESETS[presetIndex]?.phase;
            if (!ph) return;
            send({ type: "host_transition", payload: ph });
          }}
        >
          Apply transition
        </button>
      </div>

      <h3>Score ±100 (REQ-4)</h3>
      <div className="row">
        {[0, 1, 2, 3, 4].map((seat) => (
          <div key={seat} className="row">
            <span>Seat {seat + 1}</span>
            <button type="button" onClick={() => send({ type: "host_score_step", payload: { seatIndex: seat, direction: "up" } })}>
              +100
            </button>
            <button type="button" onClick={() => send({ type: "host_score_step", payload: { seatIndex: seat, direction: "down" } })}>
              −100
            </button>
          </div>
        ))}
      </div>

      <h3>Opening the show (REQ-8, in lobby)</h3>
      <div className="row">
        <button type="button" onClick={() => send({ type: "opening_show_next_emoji", payload: {} })}>
          Next emoji
        </button>
        <label>
          Mark correct for key{" "}
          <input id="spectator-key" placeholder="spectator display name" style={{ minWidth: 160 }} />
        </label>
        <button
          type="button"
          onClick={() => {
            const el = document.getElementById("spectator-key") as HTMLInputElement | null;
            const spectatorKey = el?.value?.trim() ?? "";
            if (!spectatorKey) return;
            send({ type: "opening_show_mark_correct", payload: { spectatorKey } });
          }}
        >
          Mark correct
        </button>
      </div>

      <h3>Participants</h3>
      <ul>
        {(snapshot?.participants ?? []).map((p) => (
          <li key={p.id}>
            {p.displayName} — {p.role} — <code>{p.id}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
