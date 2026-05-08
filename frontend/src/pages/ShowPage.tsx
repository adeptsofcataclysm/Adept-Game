import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MAX_CHAT_MESSAGES, type Phase, type Role, type RoundBoardRuntime } from "@/sessionTypes";
import { useSessionWs } from "@/useSessionWs";
import { getDisplayName, getHostSecret } from "@/storage";
import { GamePageHeader } from "@/components/GamePageHeader";
import { ChatPanel } from "@/components/ChatPanel";
import { PlayersPanel } from "@/components/PlayersPanel";
import { PluginSegmentHost } from "@/plugins/PluginSegmentHost";
import { getQuizThemeIconUrl } from "@/lib/quizThemeIcons";
// Ensure plugin client registrations run before any render
import "@/plugins/index";

function boardForPhase(snapshot: {
  phase: Phase;
  roundBoard: Record<1 | 2 | 3, RoundBoardRuntime>;
  finalTransitionBoard: RoundBoardRuntime;
}): { board: RoundBoardRuntime } | null {
  const { phase } = snapshot;
  if (phase.kind === "lobby") return null;
  if (phase.kind === "final") {
    return {
      board: snapshot.finalTransitionBoard,
    };
  }
  if (phase.kind === "round") {
    const ri = phase.roundIndex;
    return {
      board: snapshot.roundBoard[ri],
    };
  }
  return null;
}

/** Phase name for the header badge. */
function phaseBadgeLabel(phase: Phase | undefined): string {
  if (!phase) return "…";
  switch (phase.kind) {
    case "lobby":
      return "Лобби";
    case "round":
      return `Квиз-доска ${phase.roundIndex}`;
    case "final":
      return "Финал";
    case "plugin_segment": {
      const labels: Record<string, string> = {
        spectator_bet: "Ставки зрителей",
        story_video:     "Сюжет",
        donations:       "Донаты",
        between_final:   "Переход к финалу",
      };
      return labels[phase.id] ?? `Сегмент: ${phase.id}`;
    }
  }
}

export function ShowPage() {
  const showId = useMemo(() => {
    const q = new URLSearchParams(window.location.search).get("showId");
    return q?.trim() || "default";
  }, []);

  const hostSecretStored = getHostSecret();
  let role: Role = "spectator";
  if (hostSecretStored) role = "host";
  const name = getDisplayName();
  const { snapshot, lastError, connected, send } = useSessionWs({
    showId,
    role,
    enabled: name.length > 0,
    hostSecret: hostSecretStored || undefined,
  });

  const [chatText, setChatText] = useState("");

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
      <GamePageHeader
        badgeLabel={phaseBadgeLabel(snapshot?.phase)}
        connected={connected}
        viewerName={name}
        viewerRole={role}
        phase={snapshot?.phase}
        phaseNav={snapshot?.phaseNav}
        onHostTransition={(to) => send({ type: "host_transition", payload: to })}
      />

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
            
            {lastError  ? ((
              <div className="card">
              <p style={{ color: "#f88" }}>{lastError}</p>
            </div>
            )) : null}
            

            {snapshot?.phase.kind !== "lobby" && snapshot?.phase.kind !== "plugin_segment" ? (
              <div className="card adepts-show-board-card adepts-quiz-theme">
                {boardPreview ? (
                  <>
                    <div className="adepts-show-board-scroll adepts-quiz-board-scroll">
                      <BoardPreview board={boardPreview.board} />
                    </div>
                  </>
                ) : (
                  <>
                    <p style={{ flexShrink: 0 }}>Waiting for snapshot…</p>
                  </>
                )}
              </div>
            ) : null}

            {snapshot?.phase.kind === "plugin_segment" ? (
              <PluginSegmentHost
                snapshot={snapshot}
                role={role}
                send={(type, payload) => send({ type, payload })}
              />
            ) : null}
          </section>

          <aside className="adepts-show-rail-col" aria-hidden="true" />
        </div>

        <PlayersPanel />
      </div>
    </div>
  );
}

function BoardPreview({ board }: { board: RoundBoardRuntime }) {
  return (
    <div className="adepts-quiz-board-preview">
      {board.themes.map((theme, ri) => (
        <div key={`${theme}-${ri}`} className="adepts-quiz-board-preview__row">
          <div className="adepts-quiz-board-preview__theme">
            {(() => {
              const iconUrl = theme ? getQuizThemeIconUrl(theme) : undefined;
              return (
                <>
                  <span className="adepts-quiz-board-preview__theme-text">
                    {theme || `Тема ${ri + 1}`}
                  </span>
                  {iconUrl ? (
                    <img
                      className="adepts-quiz-board-preview__theme-icon"
                      src={iconUrl}
                      alt=""
                      draggable={false}
                    />
                  ) : (
                    <span className="adepts-quiz-board-preview__theme-icon-fallback" aria-hidden="true">
                      {String(theme || "Т").trim().slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </>
              );
            })()}
          </div>

          <div className="adepts-quiz-board-preview__cells">
            {board.questions[ri]?.map((cell, ci) => {
              const opened = Boolean(board.revealed?.[ri]?.[ci]);
              const points = board.pointValues?.[ri]?.[ci] ?? (ci + 1) * 100;
              return (
                <div
                  key={ci}
                  className={[
                    "adepts-quiz-board-preview__cell",
                    opened ? "adepts-quiz-board-preview__cell--opened" : "adepts-quiz-board-preview__cell--closed",
                  ].join(" ")}
                  title={opened ? (cell.text || "") : `${points}`}
                >
                  {opened ? (
                    <div className="adepts-quiz-board-preview__opened">
                      <div className="adepts-quiz-board-preview__opened-text">
                        {cell.questionUrl ? <span>media · </span> : null}
                        {cell.text ? `${cell.text.slice(0, 80)}${cell.text.length > 80 ? "…" : ""}` : "—"}
                      </div>
                      <div className="adepts-quiz-board-preview__opened-sub">opened</div>
                    </div>
                  ) : (
                    <div className="adepts-quiz-board-preview__closed">
                      <div className="glow-text adepts-quiz-board-preview__points">{points}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
