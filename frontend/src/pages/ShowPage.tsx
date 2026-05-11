import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MAX_CHAT_MESSAGES, type Phase, type Role, type RoundBoardRuntime } from "@/sessionTypes";
import { useSessionWs } from "@/useSessionWs";
import { getDisplayName, getHostSecret, getOrCreateParticipantId } from "@/storage";
import { GamePageHeader } from "@/components/GamePageHeader";
import { ChatPanel } from "@/components/ChatPanel";
import { PlayersPanel } from "@/components/PlayersPanel";
import { QuizQuestionModal } from "@/components/QuizQuestionModal";
import {
  PluginSegmentFullScreenHost,
  PluginSegmentMainHost,
  PluginSegmentRailHost,
  resolvePluginSegmentLayout,
} from "@/plugins/PluginSegmentLayoutHost";
import { getHttpBaseUrl } from "@/wsUrl";
import { LobbySlideshow } from "@/components/LobbySlideshow";
// Ensure plugin client registrations run before any render
import "@/plugins/index";

type BoardSelector = { boardKind: "round"; roundIndex: 1 | 2 | 3 } | { boardKind: "finalTransition" };

function boardSelectorForPhase(phase: Phase | undefined): BoardSelector | null {
  if (!phase) return null;
  if (phase.kind === "round") return { boardKind: "round", roundIndex: phase.roundIndex };
  if (phase.kind === "final") return { boardKind: "finalTransition" };
  return null;
}

function resolveThemeIconSrc(url: string): string {
  // Uploaded icons are served by the backend (session service), not by the Vite dev server.
  if (url.startsWith("/theme_icons/")) return `${getHttpBaseUrl()}${url}`;
  return url;
}

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
        opening_show:    "Отборочный тур",
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
  const participantId = useMemo(() => getOrCreateParticipantId(), []);
  const { snapshot, lastError, connected, send } = useSessionWs({
    showId,
    role,
    enabled: name.length > 0,
    hostSecret: hostSecretStored || undefined,
  });

  const [chatText, setChatText] = useState("");
  const [editTheme, setEditTheme] = useState<{
    open: boolean;
    boardSel: BoardSelector | null;
    rowIndex: number;
    themeText: string;
    iconUrl: string | null;
    pendingUploadDataUrl: string | null;
    busy: boolean;
  }>({
    open: false,
    boardSel: null,
    rowIndex: 0,
    themeText: "",
    iconUrl: null,
    pendingUploadDataUrl: null,
    busy: false,
  });

  const [questionModalCell, setQuestionModalCell] = useState<{ rowIndex: number; colIndex: number } | null>(null);

  const boardPreview = useMemo(() => (snapshot ? boardForPhase(snapshot) : null), [snapshot]);
  const boardSel = useMemo(() => boardSelectorForPhase(snapshot?.phase), [snapshot?.phase]);

  /** Host or the viewer whose display name matches the active seat (`seatNames[currentTurnSeat]`). */
  const canOpenQuestionModal = useMemo(() => {
    if (!snapshot) return false;
    if (role === "host") return true;
    const seat = snapshot.currentTurnSeat;
    if (typeof seat !== "number" || seat < 0 || seat > 4) return false;
    const slotName = (snapshot.seatNames[seat] ?? "").trim().toLowerCase();
    const me = name.trim().toLowerCase();
    return me.length > 0 && slotName.length > 0 && me === slotName;
  }, [snapshot, role, name]);

  const questionModalPayload = useMemo(() => {
    if (!questionModalCell || !boardPreview) return null;
    const { rowIndex, colIndex } = questionModalCell;
    const cell = boardPreview.board.questions[rowIndex]?.[colIndex];
    if (!cell) return null;
    const rawTheme = boardPreview.board.themes[rowIndex] ?? "";
    const themeName = rawTheme.trim() ? rawTheme.trim() : `Тема ${rowIndex + 1}`;
    const points = boardPreview.board.pointValues?.[rowIndex]?.[colIndex] ?? (colIndex + 1) * 100;
    const cellRevealed = Boolean(boardPreview.board.revealed?.[rowIndex]?.[colIndex]);
    return { cell, themeName, points, cellRevealed };
  }, [questionModalCell, boardPreview]);

  const pluginLayout = useMemo(() => resolvePluginSegmentLayout(snapshot), [snapshot]);

  if (!name) {
    return (
      <div className="card">
        <p>Set your name on the home page first.</p>
        <Link to="/">Back</Link>
      </div>
    );
  }

  // Full-screen plugin segments override the entire page (no header, no chat/columns, no players panel).
  if (pluginLayout.kind === "plugin_segment" && pluginLayout.FullScreenView && snapshot) {
    return (
      <PluginSegmentFullScreenHost
        snapshot={snapshot}
        role={role}
        participantId={participantId}
        send={(type, payload) => send({ type, payload })}
      />
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
        onHostReset={role === "host" ? () => send({ type: "host_reset_session", payload: {} }) : undefined}
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

            {snapshot?.phase.kind === "lobby" ? <LobbySlideshow /> : null}

            {snapshot?.phase.kind !== "lobby" && snapshot?.phase.kind !== "plugin_segment" ? (
              <div className="card adepts-show-board-card adepts-quiz-theme">
                {boardPreview ? (
                  <>
                    <div className="adepts-show-board-scroll adepts-quiz-board-scroll">
                      <BoardPreview
                        board={boardPreview.board}
                        role={role}
                        boardSel={boardSel}
                        canOpenQuestionModal={canOpenQuestionModal}
                        onQuestionCellClick={(rowIndex, colIndex) => setQuestionModalCell({ rowIndex, colIndex })}
                        onEditTheme={(rowIndex) => {
                          if (role !== "host") return;
                          if (!boardSel) return;
                          const curText = boardPreview.board.themes[rowIndex] ?? "";
                          const curIcon = boardPreview.board.themeIcons?.[rowIndex] ?? null;
                          setEditTheme({
                            open: true,
                            boardSel,
                            rowIndex,
                            themeText: curText,
                            iconUrl: curIcon,
                            pendingUploadDataUrl: null,
                            busy: false,
                          });
                        }}
                      />
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
              <PluginSegmentMainHost
                snapshot={snapshot}
                role={role}
                participantId={participantId}
                send={(type, payload) => send({ type, payload })}
              />
            ) : null}
          </section>

          <aside className="adepts-show-rail-col" aria-hidden={snapshot?.phase.kind !== "plugin_segment"}>
            {snapshot?.phase.kind === "plugin_segment" ? (
              <PluginSegmentRailHost
                snapshot={snapshot}
                role={role}
                participantId={participantId}
                send={(type, payload) => send({ type, payload })}
              />
            ) : null}
          </aside>
        </div>

        <PlayersPanel
          snapshot={snapshot}
          role={role}
          send={(type: string, payload: unknown) => send({ type, payload })}
        />
      </div>

      {editTheme.open ? (
        <div
          className="adepts-modal-overlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditTheme((s) => ({ ...s, open: false }));
          }}
        >
          <div className="adepts-modal" role="dialog" aria-modal="true" aria-label="Edit quiz theme">
            <div className="adepts-modal__head">
              <div className="adepts-modal__title">Редактировать тему</div>
              <button className="adepts-modal__x" onClick={() => setEditTheme((s) => ({ ...s, open: false }))}>
                ✕
              </button>
            </div>

            <div className="adepts-modal__body">
              <label className="adepts-field">
                <span className="adepts-field__label">Текст темы</span>
                <input
                  className="adepts-field__input"
                  value={editTheme.themeText}
                  onChange={(e) => setEditTheme((s) => ({ ...s, themeText: e.target.value }))}
                  maxLength={64}
                />
              </label>

              <div className="adepts-field">
                <div className="adepts-field__label">Иконка</div>
                <div className="adepts-theme-icon-editor">
                  <div className="adepts-theme-icon-editor__preview">
                    {(() => {
                      const t = editTheme.themeText.trim();
                      const effective = editTheme.iconUrl;
                      return effective ? (
                        <img src={resolveThemeIconSrc(effective)} alt="" draggable={false} />
                      ) : (
                        <span aria-hidden="true">{t ? t.slice(0, 1).toUpperCase() : "Т"}</span>
                      );
                    })()}
                  </div>

                  <div className="adepts-theme-icon-editor__controls">
                    <div className="adepts-theme-icon-editor__row">
                      <button
                        className="adepts-btn"
                        onClick={() => setEditTheme((s) => ({ ...s, iconUrl: null }))}
                        disabled={editTheme.busy}
                        title="Use automatic icon by theme name"
                      >
                        Авто
                      </button>

                      <label className="adepts-btn adepts-btn--file" title="Upload new icon">
                        Загрузить…
                        <input
                          type="file"
                          accept="image/*"
                          disabled={editTheme.busy}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            const r = new FileReader();
                            r.onload = () => {
                              const res = typeof r.result === "string" ? r.result : null;
                              if (!res) return;
                              setEditTheme((s) => ({ ...s, pendingUploadDataUrl: res }));
                            };
                            r.readAsDataURL(f);
                            // allow re-uploading same file
                            e.currentTarget.value = "";
                          }}
                        />
                      </label>
                    </div>

                    <label className="adepts-field">
                      <span className="adepts-field__label">Иконка URL (опционально)</span>
                      <input
                        className="adepts-field__input"
                        placeholder="https://… или data:image/…"
                        value={editTheme.iconUrl ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setEditTheme((s) => ({ ...s, iconUrl: v.trim() ? v : null }));
                        }}
                        disabled={editTheme.busy}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="adepts-modal__foot">
              <button className="adepts-btn" onClick={() => setEditTheme((s) => ({ ...s, open: false }))}>
                Отмена
              </button>
              <button
                className="adepts-btn adepts-btn--primary"
                disabled={editTheme.busy || !editTheme.themeText.trim() || !editTheme.boardSel}
                onClick={() => {
                  void (async () => {
                    if (!editTheme.boardSel) return;
                    setEditTheme((s) => ({ ...s, busy: true }));

                    let iconUrlToSave: string | null = editTheme.iconUrl;
                    if (editTheme.pendingUploadDataUrl) {
                      try {
                        const r = await fetch(`${getHttpBaseUrl()}/api/upload-theme-icon`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            dataUrl: editTheme.pendingUploadDataUrl,
                            hostSecret: hostSecretStored || undefined,
                          }),
                        });
                        const j = (await r.json()) as { ok?: boolean; url?: string; error?: string };
                        if (!j.ok || !j.url) {
                          // keep modal open; show backend error in snapshot error area is too indirect
                          // (we don't have a toast system yet)
                          // eslint-disable-next-line no-alert
                          alert(j.error || "Upload failed");
                          setEditTheme((s) => ({ ...s, busy: false }));
                          return;
                        }
                        iconUrlToSave = j.url;
                      } catch {
                        // eslint-disable-next-line no-alert
                        alert("Upload failed");
                        setEditTheme((s) => ({ ...s, busy: false }));
                        return;
                      }
                    }

                    send({
                      type: "host_edit_quiz_theme",
                      payload: {
                        boardKind: editTheme.boardSel.boardKind,
                        roundIndex:
                          editTheme.boardSel.boardKind === "round" ? editTheme.boardSel.roundIndex : undefined,
                        rowIndex: editTheme.rowIndex,
                        themeText: editTheme.themeText,
                        iconUrl: iconUrlToSave,
                      },
                    });
                    setEditTheme((s) => ({ ...s, open: false, busy: false }));
                  })();
                }}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <QuizQuestionModal
        isOpen={questionModalPayload != null}
        themeName={questionModalPayload?.themeName ?? ""}
        points={questionModalPayload?.points ?? 0}
        cell={questionModalPayload?.cell ?? null}
        onClose={() => setQuestionModalCell(null)}
        isHost={role === "host"}
        boardSel={boardSel}
        cellCoords={questionModalCell}
        snapshotVersion={snapshot?.version ?? 0}
        send={send}
        hostSecret={hostSecretStored || undefined}
        seatNames={snapshot?.seatNames ?? ["P1", "P2", "P3", "P4", "P5"]}
        scores={snapshot?.scores ?? [0, 0, 0, 0, 0]}
        currentTurnSeat={snapshot?.currentTurnSeat ?? 0}
        cellRevealed={questionModalPayload?.cellRevealed ?? false}
      />
    </div>
  );
}

function BoardPreview({
  board,
  role,
  boardSel,
  canOpenQuestionModal,
  onQuestionCellClick,
  onEditTheme,
}: {
  board: RoundBoardRuntime;
  role: Role;
  boardSel: BoardSelector | null;
  canOpenQuestionModal: boolean;
  onQuestionCellClick: (rowIndex: number, colIndex: number) => void;
  onEditTheme: (rowIndex: number) => void;
}) {
  return (
    <div className="adepts-quiz-board-preview">
      {board.themes.map((theme, ri) => (
        <div key={`${theme}-${ri}`} className="adepts-quiz-board-preview__row">
          <div className="adepts-quiz-board-preview__theme">
            {(() => {
              const custom = board.themeIcons?.[ri] ?? null;
              const iconUrl = custom || undefined;
              return (
                <>
                  <span className="adepts-quiz-board-preview__theme-text">
                    {theme || `Тема ${ri + 1}`}
                  </span>
                  {iconUrl ? (
                    <img
                      className="adepts-quiz-board-preview__theme-icon"
                      src={resolveThemeIconSrc(iconUrl)}
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

            {role === "host" && boardSel ? (
              <button
                className="adepts-quiz-board-preview__theme-edit"
                onClick={() => onEditTheme(ri)}
                title="Редактировать тему"
              >
                ✎
              </button>
            ) : null}
          </div>

          <div className="adepts-quiz-board-preview__cells">
            {board.questions[ri]?.map((cell, ci) => {
              const opened = Boolean(board.revealed?.[ri]?.[ci]);
              const points = board.pointValues?.[ri]?.[ci] ?? (ci + 1) * 100;
              const cellClass = [
                "adepts-quiz-board-preview__cell",
                opened ? "adepts-quiz-board-preview__cell--opened" : "adepts-quiz-board-preview__cell--closed",
                canOpenQuestionModal && !opened ? "adepts-quiz-board-preview__cell--clickable" : "",
              ]
                .filter(Boolean)
                .join(" ");
              const title = opened ? "Сыграно" : `${points} — открыть вопрос`;

              const body = opened ? (
                <div className="adepts-quiz-board-preview__played" aria-hidden>
                  <div className="adepts-quiz-board-preview__played-line" />
                </div>
              ) : (
                <div className="adepts-quiz-board-preview__closed">
                  <div className="glow-text adepts-quiz-board-preview__points">{points}</div>
                </div>
              );

              return canOpenQuestionModal ? (
                <button
                  key={ci}
                  type="button"
                  className={cellClass}
                  title={title}
                  aria-label={opened ? "Сыграно" : `Вопрос ${points} баллов`}
                  disabled={opened}
                  onClick={() => {
                    if (!opened) onQuestionCellClick(ri, ci);
                  }}
                >
                  {body}
                </button>
              ) : (
                <div key={ci} className={cellClass} title={opened ? "Сыграно" : `${points}`}>
                  {body}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
