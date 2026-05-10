import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { QuestionCell } from "@/sessionTypes";
import { getHttpBaseUrl } from "@/wsUrl";

type Stage = "question" | "answer";

/** Matches `BoardSelector` on ShowPage (no circular import). */
export type QuizBoardSelector =
  | { boardKind: "round"; roundIndex: 1 | 2 | 3 }
  | { boardKind: "finalTransition" };

function resolveQuizAssetUrl(url: string): string {
  const u = url.trim();
  if (!u) return u;
  if (u.startsWith("http") || u.startsWith("//")) return u;
  return `${getHttpBaseUrl()}${u.startsWith("/") ? u : `/${u}`}`;
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm|ogg)$/i.test(url);
}

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
}) {
  const [stage, setStage] = useState<Stage>("question");
  const [editing, setEditing] = useState(false);
  const [draftQ, setDraftQ] = useState("");
  const [draftA, setDraftA] = useState("");
  const [draftQuestionUrl, setDraftQuestionUrl] = useState("");
  const [draftAnswerUrl, setDraftAnswerUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<null | "question" | "answer">(null);
  const frozen = useRef<{ cell: QuestionCell; themeName: string; points: number } | null>(null);
  const saveFromVersionRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  if (isOpen && cell) {
    frozen.current = { cell, themeName, points };
  }

  useEffect(() => {
    if (isOpen) setStage("question");
  }, [isOpen, cell?.text, cell?.questionUrl, cell?.answerText]);

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
                  <div className="adepts-question-modal__media-edit-grid">
                    <label className="adepts-field">
                      <span className="adepts-field__label">Медиа вопроса (URL)</span>
                      <input
                        className="adepts-field__input"
                        value={draftQuestionUrl}
                        onChange={(e) => setDraftQuestionUrl(e.target.value)}
                        disabled={saving || uploading != null}
                        placeholder="/quiz_media/... или https://..."
                      />
                    </label>
                    <div className="adepts-question-modal__upload">
                      <label
                        className={`adepts-btn adepts-btn--file ${uploading === "question" ? "adepts-question-modal__upload--busy" : ""}`}
                        title={hostSecret ? "Upload image to backend" : "Host secret required for upload"}
                      >
                        {uploading === "question" ? "Загрузка…" : "Загрузить картинку"}
                        <input
                          type="file"
                          accept="image/*"
                          disabled={saving || uploading != null || !hostSecret}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            void uploadImage("question", f);
                            e.currentTarget.value = "";
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="adepts-btn"
                        disabled={saving || uploading != null}
                        onClick={() => setDraftQuestionUrl("")}
                        title="Очистить медиа"
                      >
                        Очистить
                      </button>
                    </div>
                  </div>

                  <div className="adepts-question-modal__media-edit-grid">
                    <label className="adepts-field">
                      <span className="adepts-field__label">Медиа ответа (URL)</span>
                      <input
                        className="adepts-field__input"
                        value={draftAnswerUrl}
                        onChange={(e) => setDraftAnswerUrl(e.target.value)}
                        disabled={saving || uploading != null}
                        placeholder="/quiz_media/... или https://..."
                      />
                    </label>
                    <div className="adepts-question-modal__upload">
                      <label
                        className={`adepts-btn adepts-btn--file ${uploading === "answer" ? "adepts-question-modal__upload--busy" : ""}`}
                        title={hostSecret ? "Upload image to backend" : "Host secret required for upload"}
                      >
                        {uploading === "answer" ? "Загрузка…" : "Загрузить картинку"}
                        <input
                          type="file"
                          accept="image/*"
                          disabled={saving || uploading != null || !hostSecret}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            void uploadImage("answer", f);
                            e.currentTarget.value = "";
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="adepts-btn"
                        disabled={saving || uploading != null}
                        onClick={() => setDraftAnswerUrl("")}
                        title="Очистить медиа"
                      >
                        Очистить
                      </button>
                    </div>
                  </div>

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
                        {qUrl ? (
                          <div className="adepts-question-modal__media-wrap">
                            {isVideoUrl(qUrl) ? (
                              <video
                                className="adepts-question-modal__media"
                                src={resolveQuizAssetUrl(qUrl)}
                                controls
                                autoPlay
                                playsInline
                                preload="auto"
                                onLoadedData={(e) => {
                                  (e.currentTarget as HTMLVideoElement).play().catch(() => {});
                                }}
                              />
                            ) : (
                              <img
                                className="adepts-question-modal__media adepts-question-modal__media--img"
                                src={resolveQuizAssetUrl(qUrl)}
                                alt=""
                                draggable={false}
                              />
                            )}
                          </div>
                        ) : null}
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
                        {aUrl ? (
                          <div className="adepts-question-modal__media-wrap">
                            {isVideoUrl(aUrl) ? (
                              <video
                                className="adepts-question-modal__media"
                                src={resolveQuizAssetUrl(aUrl)}
                                controls
                                autoPlay
                                playsInline
                                preload="auto"
                                onLoadedData={(e) => {
                                  (e.currentTarget as HTMLVideoElement).play().catch(() => {});
                                }}
                              />
                            ) : (
                              <img
                                className="adepts-question-modal__media adepts-question-modal__media--img"
                                src={resolveQuizAssetUrl(aUrl)}
                                alt=""
                                draggable={false}
                              />
                            )}
                          </div>
                        ) : null}
                        {aText ? (
                          <p className="adepts-question-modal__answer-text">{aText}</p>
                        ) : !aUrl ? (
                          <p className="adepts-question-modal__empty">Нет текста ответа</p>
                        ) : null}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
