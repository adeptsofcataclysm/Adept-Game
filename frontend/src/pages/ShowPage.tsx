import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MAX_CHAT_MESSAGES, type Phase, type Role, type RoundBoardRuntime } from "@/sessionTypes";
import { useSessionWs } from "@/useSessionWs";
import { getDisplayName } from "@/storage";
import { GamePageHeader } from "@/components/GamePageHeader";
import { ChatPanel } from "@/components/ChatPanel";
import { PlayersPanel } from "@/components/PlayersPanel";

function boardForPhase(snapshot: {
  phase: Phase;
  roundBoard: Record<1 | 2 | 3, RoundBoardRuntime>;
  finalTransitionBoard: RoundBoardRuntime;
}): { title: string; board: RoundBoardRuntime } {
  const { phase } = snapshot;
  if (phase.kind === "between_final" || phase.kind === "final") {
    return {
      title: "Transition to Final / Final (data/round-4.json)",
      board: snapshot.finalTransitionBoard,
    };
  }
  if (phase.kind === "round") {
    const ri = phase.roundIndex;
    return {
      title: `Round ${ri} board`,
      board: snapshot.roundBoard[ri],
    };
  }
  return {
    title: "Round 1 board (preview)",
    board: snapshot.roundBoard[1],
  };
}

/** Russian phase strip for the header badge (same role as Node-Script `BADGE_LABEL`). */
function phaseBadgeLabel(phase: Phase | undefined): string {
  if (!phase) return "…";
  switch (phase.kind) {
    case "lobby":
      return "Лобби";
    case "spectator_picks":
      return "Ставки зрителей";
    case "round":
      return `Квиз-доска ${phase.roundIndex}`;
    case "mini_wheel":
      return `Колесо · Р${phase.roundIndex}`;
    case "mini_roulette":
      return `Рулетка · Р${phase.roundIndex}`;
    case "story_video":
      return "Сюжет";
    case "donations":
      return "Донаты";
    case "between_final":
      return "Переход к финалу";
    case "final":
      return "Финал";
    case "game_over":
      return "Игра окончена";
  }
}

export function ShowPage() {
  const showId = useMemo(() => {
    const q = new URLSearchParams(window.location.search).get("showId");
    return q?.trim() || "default";
  }, []);

  const [role] = useState<Role>("spectator");
  const name = getDisplayName();
  const { snapshot, lastError, connected, send } = useSessionWs({
    showId,
    role,
    enabled: name.length > 0,
    hostSecret: undefined,
  });

  const [chatText, setChatText] = useState("");
  const [betSeat, setBetSeat] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [donSeat, setDonSeat] = useState(0);
  const [donAmount, setDonAmount] = useState(0);

  const boardPreview = useMemo(() => (snapshot ? boardForPhase(snapshot) : null), [snapshot]);

  if (!name) {
    return (
      <div className="card">
        <p>Set your name on the home page first.</p>
        <Link to="/">Back</Link>
      </div>
    );
  }

  return (
    <div className="adepts-show-shell">
      <GamePageHeader badgeLabel={phaseBadgeLabel(snapshot?.phase)} connected={connected} />
      <div className="adepts-show-body adepts-show-body--column">
        <div className="adepts-show-body--grid">
          <aside className="adepts-show-chat-col">
            <ChatPanel
              connected={connected}
              messages={(snapshot?.chat ?? []).slice(-MAX_CHAT_MESSAGES)}
              value={chatText}
              onChange={setChatText}
              onSendMessage={(text) => send({ type: "chat", payload: { text } })}
            />
          </aside>

          <section className="adepts-show-main-col">
        <div className="card">
          {lastError ? <p style={{ color: "#f88" }}>{lastError}</p> : null}
        </div>

        <div className="card adepts-show-board-card">
          {boardPreview ? (
            <>
              <h2 style={{ marginTop: 0, flexShrink: 0 }}>{boardPreview.title}</h2>
              <div className="adepts-show-board-scroll">
                <BoardPreview board={boardPreview.board} />
              </div>
            </>
          ) : (
            <>
              <h2 style={{ marginTop: 0, flexShrink: 0 }}>Quiz board</h2>
              <p style={{ flexShrink: 0 }}>Waiting for snapshot…</p>
            </>
          )}
        </div>

        {snapshot?.phase.kind === "spectator_picks" ? (
          <div className="card">
            <h3>Spectator picks (REQ-9)</h3>
            <p>Bet on a Player seat before Round 1.</p>
            <div className="row">
              <select value={betSeat} onChange={(e) => setBetSeat(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}>
                <option value={1}>Seat 1</option>
                <option value={2}>Seat 2</option>
                <option value={3}>Seat 3</option>
                <option value={4}>Seat 4</option>
                <option value={5}>Seat 5</option>
              </select>
              <button type="button" onClick={() => send({ type: "spectator_pick_bet", payload: { seat: betSeat } })}>
                Place bet
              </button>
            </div>
          </div>
        ) : null}

        {snapshot?.phase.kind === "donations" && role === "player" ? (
          <div className="card">
            <h3>Donations (REQ-12)</h3>
            <div className="row">
              <label>
                Seat index 0–4{" "}
                <input
                  type="number"
                  min={0}
                  max={4}
                  value={donSeat}
                  onChange={(e) => setDonSeat(Number(e.target.value))}
                />
              </label>
              <label>
                Amount{" "}
                <input
                  type="number"
                  min={0}
                  value={donAmount}
                  onChange={(e) => setDonAmount(Number(e.target.value))}
                />
              </label>
              <button type="button" onClick={() => send({ type: "player_donation", payload: { seatIndex: donSeat, amount: donAmount } })}>
                Submit donation
              </button>
            </div>
          </div>
        ) : null}
          </section>
        </div>

        <PlayersPanel />
      </div>
    </div>
  );
}

function BoardPreview({ board }: { board: RoundBoardRuntime }) {
  const cols = board.questions[0]?.length ?? 0;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.85rem" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: 4 }}>Theme</th>
            {Array.from({ length: cols }, (_, i) => (
              <th key={i} style={{ padding: 4 }}>
                {board.pointValues[0]?.[i] ?? i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {board.themes.map((theme, ri) => (
            <tr key={theme}>
              <td style={{ padding: 4, fontWeight: 600, maxWidth: 140 }}>{theme}</td>
              {board.questions[ri]?.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    padding: 4,
                    border: "1px solid #2a3142",
                    verticalAlign: "top",
                    background: board.revealed[ri][ci] ? "#2a3548" : "#141820",
                  }}
                >
                  <div style={{ opacity: 0.85 }}>
                    {cell.questionUrl ? <span title={cell.questionUrl}>media · </span> : null}
                    {cell.text ? `${cell.text.slice(0, 80)}${cell.text.length > 80 ? "…" : ""}` : "—"}
                  </div>
                  {board.revealed[ri][ci] ? <div style={{ fontSize: "0.75rem", marginTop: 4 }}>opened</div> : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
