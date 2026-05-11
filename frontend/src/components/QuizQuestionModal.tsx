import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { QuestionCell, Scores } from "@/sessionTypes";
import { ADEPTS_SLOT_THEMES, hsl } from "@/lib/adeptsQuizSlotCardVisual";
import { resolveQuizAssetUrl } from "@/lib/quizMedia";
import { getHttpBaseUrl } from "@/wsUrl";
import { QuestionHeaderCountdown, QUESTION_TIMER_SECONDS } from "@/components/QuestionHeaderCountdown";
import { QuizMediaView } from "@/components/QuizMediaView";
import { QuizMediaUrlEditRow } from "@/components/QuizMediaUrlEditRow";

type Stage = "question" | "answer";

/** Matches `BoardSelector` on ShowPage (no circular import). */
export type QuizBoardSelector =
  | { boardKind: "round"; roundIndex: 1 | 2 | 3 }
  | { boardKind: "finalTransition" };

export function QuizQuestionModal({
  isOpen,
  themeName,
  points,
  cell,
  onClose,
  isHost,
  boardSel,
  cellCoords,
  snapshotVersion,
  send,
  hostSecret,
  seatNames,
  scores,
  currentTurnSeat,
  cellRevealed,
}: {
  isOpen: boolean;
  themeName: string;
  points: number;
  cell: QuestionCell | null;
  onClose: () => void;
  isHost: boolean;
  boardSel: QuizBoardSelector | null;
  cellCoords: { rowIndex: number; colIndex: number } | null;
  snapshotVersion: number;
  send: (msg: unknown) => void;
  hostSecret?: string;
  seatNames: [string, string, string, string, string];
  scores: Scores;
  currentTurnSeat: number;
  /** Server `revealed` flag for this cell (opened / played on the board). */
  cellRevealed: boolean;
}) {
  const [stage, setStage] = useState<Stage>("question");
  const [editing, setEditing] = useState(false);
  const [draftQ, setDraftQ] = useState("");
  const [draftA, setDraftA] = useState("");
  const [draftQuestionUrl, setDraftQuestionUrl] = useState("");
  const [draftAnswerUrl, setDraftAnswerUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<null | "question" | "answer">(null);
  const [countdown, setCountdown] = useState(QUESTION_TIMER_SECONDS);
  const [awardedSeat, setAwardedSeat] = useState<number | null>(null);
  const frozen = useRef<{ cell: QuestionCell; themeName: string; points: number } | null>(null);
  const saveFromVersionRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const stopQuestionTimer = () => {
    if (timerIntervalRef.current != null) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  const startQuestionTimer = () => {
    stopQuestionTimer();
    setCountdown(QUESTION_TIMER_SECONDS);
    timerIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          stopQuestionTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  if (isOpen && cell) {
    frozen.current = { cell, themeName, points };
  }

  useEffect(() => {
    if (isOpen) setStage("question");
  }, [isOpen, cell?.text, cell?.questionUrl, cell?.answerText]);

  useEffect(() => {
    setAwardedSeat(null);
  }, [isOpen, cellCoords?.rowIndex, cellCoords?.colIndex]);

  useEffect(() => {
    if (!isOpen) {
      stopQuestionTimer();
      setCountdown(QUESTION_TIMER_SECONDS);
    }
    return stopQuestionTimer;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !cell) return;
    const splash = Boolean(cell.splashUrl?.trim());
    if (editing || stage !== "question" || splash) {
      stopQuestionTimer();
      if (stage !== "question" || editing) setCountdown(QUESTION_TIMER_SECONDS);
      return stopQuestionTimer;
    }
    startQuestionTimer();
    return stopQuestionTimer;
  }, [isOpen, stage, editing, cellCoords?.rowIndex, cellCoords?.colIndex, cell?.splashUrl]);

  useEffect(() => {
    if (!isOpen) {
      setEditing(false);
      setSaving(false);
      saveFromVersionRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (!editing) return;
    const p = frozen.current;
    if (p) {
      setDraftQ(p.cell.text ?? "");
      setDraftA(p.cell.answerText ?? "");
      setDraftQuestionUrl(p.cell.questionUrl ?? "");
      setDraftAnswerUrl(p.cell.answerUrl ?? "");
    }
  }, [editing]);

  useEffect(() => {
    if (!saving || saveFromVersionRef.current === null) return;
    if (snapshotVersion > saveFromVersionRef.current) {
      setSaving(false);
      setEditing(false);
      saveFromVersionRef.current = null;
    }
  }, [snapshotVersion, saving]);

  useEffect(() => {
    if (!saving) return;
    const t = window.setTimeout(() => {
      setSaving(false);
      saveFromVersionRef.current = null;
    }, 12000);
    return () => window.clearTimeout(t);
  }, [saving]);

  const pack = frozen.current;

  const buildEditPayload = () => {
    if (!boardSel || !cellCoords) return null;
    const base = {
      rowIndex: cellCoords.rowIndex,
      colIndex: cellCoords.colIndex,
      questionText: draftQ,
      answerText: draftA,
      questionUrl: draftQuestionUrl,
      answerUrl: draftAnswerUrl,
    };
    if (boardSel.boardKind === "finalTransition") {
      return { type: "host_edit_quiz_question" as const, payload: { boardKind: "finalTransition" as const, ...base } };
    }
    return {
      type: "host_edit_quiz_question" as const,
      payload: { boardKind: "round" as const, roundIndex: boardSel.roundIndex, ...base },
    };
  };

  const buildRevealPayload = () => {
    if (!boardSel || !cellCoords) return null;
    const { rowIndex, colIndex } = cellCoords;
    if (boardSel.boardKind === "finalTransition") {
      return { type: "host_reveal_quiz_cell" as const, payload: { boardKind: "finalTransition" as const, rowIndex, colIndex } };
    }
    return {
      type: "host_reveal_quiz_cell" as const,
      payload: { boardKind: "round" as const, roundIndex: boardSel.roundIndex, rowIndex, colIndex },
    };
  };

  const handleSave = () => {
    const msg = buildEditPayload();
    if (!msg) return;
    saveFromVersionRef.current = snapshotVersion;
    setSaving(true);
    send(msg);
  };

  const uploadImage = async (target: "question" | "answer", file: File) => {
    if (!hostSecret) return;
    setUploading(target);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onerror = () => reject(new Error("read failed"));
        r.onload = () => resolve(typeof r.result === "string" ? r.result : "");
        r.readAsDataURL(file);
      });
      if (!dataUrl) throw new Error("Bad data URL");
      const res = await fetch(`${getHttpBaseUrl()}/api/upload-quiz-media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, hostSecret }),
      });
      const j = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (!j.ok || !j.url) throw new Error(j.error || "Upload failed");
      if (target === "question") setDraftQuestionUrl(j.url);
      else setDraftAnswerUrl(j.url);
    } catch {
      // eslint-disable-next-line no-alert
      alert("Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    const p = frozen.current;
    if (p) {
      setDraftQ(p.cell.text ?? "");
      setDraftA(p.cell.answerText ?? "");
      setDraftQuestionUrl(p.cell.questionUrl ?? "");
      setDraftAnswerUrl(p.cell.answerUrl ?? "");
    }
  };

  const canEdit = isHost && boardSel != null && cellCoords != null;
  const editBlocked = !canEdit || saving || uploading != null;

  const activeTurnSeatNorm =
    typeof currentTurnSeat === "number" && Number.isInteger(currentTurnSeat)
      ? ((currentTurnSeat % 5) + 5) % 5
      : -1;

  const handleAwardSeat = (seatIndex: number) => {
    if (!isHost || awardedSeat !== null) return;
    const p = frozen.current;
    if (!p) return;
    const cur = scores[seatIndex] ?? 0;
    const delta = Math.trunc(p.points);
    const next = Math.max(-999_999, Math.min(999_999, cur + delta));
    send({ type: "host_set_score", payload: { seatIndex, score: next } });
    const revealMsg = buildRevealPayload();
    if (revealMsg) send(revealMsg);
    setAwardedSeat(seatIndex);
    onClose();
  };

  const handleHostWrongAnswer = () => {
    if (!isHost || awardedSeat !== null || cellRevealed) return;
    const p = frozen.current;
    if (!p || activeTurnSeatNorm < 0) return;
    const cur = scores[activeTurnSeatNorm] ?? 0;
    const delta = Math.trunc(p.points);
    const next = Math.max(-999_999, Math.min(999_999, cur - delta));
    send({ type: "host_set_score", payload: { seatIndex: activeTurnSeatNorm, score: next } });
    const revealMsg = buildRevealPayload();
    if (revealMsg) send(revealMsg);
    send({ type: "host_advance_turn", payload: {} });
    onClose();
  };

  const handleHostPassTurnNext = () => {
    if (!isHost || awardedSeat !== null) return;
    send({ type: "host_advance_turn", payload: {} });
    onClose();
  };

  const handleHostCloseCellOnly = () => {
    if (!isHost || awardedSeat !== null || cellRevealed) return;
    const msg = buildRevealPayload();
    if (!msg) return;
    send(msg);
    onClose();
  };

  const showHeaderTimer =
    !editing &&
    stage === "question" &&
    !(pack?.cell?.splashUrl ?? "").trim() &&
    countdown > 0;
  const headerTimerExpired =
    !editing && stage === "question" && !(pack?.cell?.splashUrl ?? "").trim() && countdown === 0;

  return (
    <AnimatePresence>
      {isOpen && pack ? (
        <motion.div
          key="quiz-q-modal"
          className="adepts-question-modal-overlay"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Вопрос квиза"
            className="adepts-question-modal adepts-quiz-theme"
            initial={{ scale: 0.92, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 24 }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="adepts-question-modal__header">
              <div className="adepts-question-modal__header-main">
                <div className="adepts-question-modal__title-block">
                  <div className="adepts-question-modal__theme-label">{pack.themeName}</div>
                  <div className="adepts-question-modal__points glow-text">{pack.points}</div>
                </div>
                {pack.cell.headerUrl?.trim() ? (
                  <>
                    <span className="adepts-question-modal__plus glow-text">+</span>
                    <div className="adepts-question-modal__header-bonus">
                      <img src={resolveQuizAssetUrl(pack.cell.headerUrl)} alt="" draggable={false} />
                      <span className="adepts-question-modal__header-bonus-cap">1 крутка</span>
                    </div>
                  </>
                ) : null}
                {(pack.cell.headerCornerUrl || pack.cell.splashUrl || "").trim() ? (
                  <img
                    className="adepts-question-modal__corner"
                    src={resolveQuizAssetUrl((pack.cell.headerCornerUrl || pack.cell.splashUrl || "").trim())}
                    alt=""
                    draggable={false}
                  />
                ) : null}
                {!editing ? (
                  <div className="adepts-question-modal__stage-pills" role="tablist" aria-label="Этап">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={stage === "question"}
                      className={`adepts-question-modal__pill${stage === "question" ? " adepts-question-modal__pill--on" : ""}`}
                      onClick={() => setStage("question")}
                    >
                      Вопрос
                    </button>
                    <span className="adepts-question-modal__chev" aria-hidden>
                      ›
                    </span>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={stage === "answer"}
                      className={`adepts-question-modal__pill${stage === "answer" ? " adepts-question-modal__pill--on" : ""}`}
                      onClick={() => setStage("answer")}
                    >
                      Ответ
                    </button>
                  </div>
                ) : (
                  <span className="adepts-question-modal__edit-badge">Редактирование</span>
                )}
              </div>
              <div className="adepts-question-modal__header-center">
                {showHeaderTimer ? <QuestionHeaderCountdown seconds={countdown} /> : null}
                {headerTimerExpired ? (
                  <span
                    className="adepts-question-modal__header-timer-expired"
                    role="status"
                    aria-live="polite"
                  >
                    Время истекло!
                  </span>
                ) : null}
              </div>
              <div className="adepts-question-modal__header-actions">
                {canEdit ? (
                  <button
                    type="button"
                    className={`adepts-question-modal__icon-btn${editing ? " adepts-question-modal__icon-btn--on" : ""}`}
                    onClick={() => (editing ? cancelEdit() : setEditing(true))}
                    title={editing ? "Закончить редактирование" : "Редактировать текст"}
                    aria-pressed={editing}
                  >
                    ✎
                  </button>
                ) : null}
                <button type="button" className="adepts-question-modal__close-x" onClick={onClose} aria-label="Закрыть">
                  ✕
                </button>
              </div>
            </div>

            <div className="adepts-question-modal__body">
              {editing ? (
                <div className="adepts-question-modal__editor">
                  <QuizMediaUrlEditRow
                    label="Медиа вопроса (URL)"
                    value={draftQuestionUrl}
                    onValueChange={setDraftQuestionUrl}
                    isRowUploading={uploading === "question"}
                    inputsDisabled={saving || uploading != null}
                    fileInputDisabled={saving || uploading != null || !hostSecret}
                    hasHostSecret={Boolean(hostSecret)}
                    onFile={(f) => void uploadImage("question", f)}
                    onClear={() => setDraftQuestionUrl("")}
                  />
                  <QuizMediaUrlEditRow
                    label="Медиа ответа (URL)"
                    value={draftAnswerUrl}
                    onValueChange={setDraftAnswerUrl}
                    isRowUploading={uploading === "answer"}
                    inputsDisabled={saving || uploading != null}
                    fileInputDisabled={saving || uploading != null || !hostSecret}
                    hasHostSecret={Boolean(hostSecret)}
                    onFile={(f) => void uploadImage("answer", f)}
                    onClear={() => setDraftAnswerUrl("")}
                  />

                  <label className="adepts-field">
                    <span className="adepts-field__label">Текст вопроса</span>
                    <textarea
                      className="adepts-question-modal__textarea"
                      value={draftQ}
                      onChange={(e) => setDraftQ(e.target.value)}
                      rows={6}
                      disabled={saving}
                      maxLength={16384}
                    />
                  </label>
                  <label className="adepts-field">
                    <span className="adepts-field__label">Текст ответа</span>
                    <textarea
                      className="adepts-question-modal__textarea"
                      value={draftA}
                      onChange={(e) => setDraftA(e.target.value)}
                      rows={6}
                      disabled={saving}
                      maxLength={16384}
                    />
                  </label>
                  <div className="adepts-question-modal__editor-foot">
                    <button type="button" className="adepts-btn" onClick={cancelEdit} disabled={saving}>
                      Отмена
                    </button>
                    <button type="button" className="adepts-btn adepts-btn--primary" onClick={handleSave} disabled={editBlocked}>
                      {saving ? "Сохранение…" : "Сохранить"}
                    </button>
                  </div>
                </div>
              ) : stage === "question" ? (
                <div className="adepts-question-modal__pane">
                  {(() => {
                    const qText = pack.cell.text?.trim() ?? "";
                    const qUrl = pack.cell.questionUrl?.trim() ?? "";
                    return (
                      <>
                        {qUrl ? <QuizMediaView url={qUrl} /> : null}
                        {qText ? (
                          <p className="adepts-question-modal__question-text">{qText}</p>
                        ) : !qUrl ? (
                          <p className="adepts-question-modal__empty">Нет текста вопроса</p>
                        ) : null}
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div className="adepts-question-modal__pane">
                  {(() => {
                    const aText = pack.cell.answerText?.trim() ?? "";
                    const aUrl = pack.cell.answerUrl?.trim() ?? "";
                    return (
                      <>
                        {aUrl ? <QuizMediaView url={aUrl} /> : null}
                        {aText ? (
                          <p className="adepts-question-modal__answer-text">{aText}</p>
                        ) : !aUrl ? (
                          <p className="adepts-question-modal__empty">Нет текста ответа</p>
                        ) : null}
                      </>
                    );
                  })()}
                  {isHost && !editing ? (
                    <div className="adepts-question-modal__award">
                      <div className="adepts-question-modal__award-head">
                        <span className="adepts-question-modal__award-trophy" aria-hidden>
                          🏆
                        </span>
                        <span className="adepts-question-modal__award-title">Начислить очки игроку</span>
                      </div>
                      {activeTurnSeatNorm >= 0 ? (
                        <p className="adepts-question-modal__award-turn">
                          Сейчас ход:{" "}
                          <span className="adepts-question-modal__award-turn-name">
                            {(seatNames[activeTurnSeatNorm] ?? "").trim()
                              ? seatNames[activeTurnSeatNorm]
                              : `Игрок ${activeTurnSeatNorm + 1}`}
                          </span>
                        </p>
                      ) : null}
                      <div className="adepts-question-modal__award-grid">
                        {([0, 1, 2, 3, 4] as const).map((seatIndex) => {
                          const accent = ADEPTS_SLOT_THEMES[seatIndex]?.hsl ?? "280 92% 62%";
                          const isAwarded = awardedSeat === seatIndex;
                          const isTurn = activeTurnSeatNorm >= 0 && seatIndex === activeTurnSeatNorm;
                          const label = (seatNames[seatIndex] ?? "").trim()
                            ? seatNames[seatIndex]
                            : `Игрок ${seatIndex + 1}`;
                          const disabled = awardedSeat !== null;
                          return (
                            <motion.button
                              key={seatIndex}
                              type="button"
                              whileHover={disabled ? undefined : { scale: 1.04 }}
                              whileTap={disabled ? undefined : { scale: 0.97 }}
                              disabled={disabled}
                              title={isTurn ? "Сейчас ход этого игрока" : `Начислить ${pack.points} очков`}
                              aria-current={isTurn && awardedSeat === null ? "true" : undefined}
                              className={[
                                "adepts-question-modal__award-seat",
                                isAwarded ? "adepts-question-modal__award-seat--awarded" : "",
                                isTurn && awardedSeat === null ? "adepts-question-modal__award-seat--turn" : "",
                                disabled && !isAwarded ? "adepts-question-modal__award-seat--dim" : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              style={
                                {
                                  "--award-accent": hsl(accent, 0.85),
                                  "--award-accent-soft": hsl(accent, 0.35),
                                  "--award-accent-glow": hsl(accent, 0.28),
                                } as CSSProperties
                              }
                              onClick={() => handleAwardSeat(seatIndex)}
                            >
                              {isAwarded ? (
                                <span className="adepts-question-modal__award-seat-trophy" aria-hidden>
                                  🏆
                                </span>
                              ) : (
                                <span className="adepts-question-modal__award-seat-delta glow-text">
                                  +{pack.points}
                                </span>
                              )}
                              <span className="adepts-question-modal__award-seat-name">{label}</span>
                              <span className="adepts-question-modal__award-seat-score">{scores[seatIndex] ?? 0}</span>
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {isHost && !editing && stage === "answer" && awardedSeat === null ? (
              <div className="adepts-question-modal__host-foot">
                <div className="adepts-question-modal__host-foot-inner">
                  <button
                    type="button"
                    className="adepts-btn adepts-question-modal__host-foot-btn adepts-question-modal__host-foot-btn--muted"
                    disabled={
                      activeTurnSeatNorm < 0 ||
                      cellRevealed ||
                      boardSel == null ||
                      cellCoords == null
                    }
                    title={
                      cellRevealed
                        ? "Карточка уже сыграна"
                        : activeTurnSeatNorm < 0
                          ? "Нет активного хода"
                          : `Снять ${pack.points} очков у игрока на ходу, пометить карточку сыгранной и передать ход`
                    }
                    onClick={handleHostWrongAnswer}
                  >
                    Неверный ответ
                  </button>
                  <button
                    type="button"
                    className="adepts-btn adepts-question-modal__host-foot-btn adepts-question-modal__host-foot-btn--muted adepts-question-modal__host-foot-btn--mono"
                    title="Передать ход следующему игроку без снятия очков"
                    onClick={handleHostPassTurnNext}
                  >
                    {"=>"}
                  </button>
                  <button
                    type="button"
                    className="adepts-btn adepts-question-modal__host-foot-btn adepts-question-modal__host-foot-btn--secondary"
                    disabled={cellRevealed || !boardSel || !cellCoords}
                    title={
                      cellRevealed
                        ? "Карточка уже закрыта на доске"
                        : "Закрыть карточку на доске без смены хода и очков"
                    }
                    onClick={handleHostCloseCellOnly}
                  >
                    Никто не ответил — закрыть
                  </button>
                </div>
              </div>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
