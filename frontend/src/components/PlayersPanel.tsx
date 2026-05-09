import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Role, SessionSnapshot } from "@/sessionTypes";
import {
  ADEPTS_SLOT_THEMES,
  hsl,
  PLAYER_CARD_OCTAGON_CLIP,
  slotCardShellFilter,
} from "@/lib/adeptsQuizSlotCardVisual";

function publicUrl(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function SlotPortrait({
  accentHsl,
  slotIndex,
  isTurn,
}: {
  accentHsl: string;
  slotIndex: number;
  isTurn?: boolean;
}) {
  const [iconFailed, setIconFailed] = useState(false);
  const filterId = `adeptGlow-players-${slotIndex}`;
  const iconSrc = publicUrl("/lor-adeptov-icon.png");

  return (
    <div className="adepts-slot-portrait">
      {isTurn ? (
        <span
          className="adepts-slot-portrait__turn-badge"
          style={{
            color: hsl(accentHsl, 0.95),
            background: `linear-gradient(135deg, hsl(270 40% 8% / 0.92), hsl(270 35% 4% / 0.88))`,
            border: `1px solid ${hsl(accentHsl, 0.45)}`,
            textShadow: `0 0 8px ${hsl(accentHsl, 0.55)}`,
            boxShadow: `0 0 12px ${hsl(accentHsl, 0.2)}`,
          }}
        >
          Ход
        </span>
      ) : null}
      <div
        className="adepts-slot-portrait__ambient"
        style={{
          background: `radial-gradient(ellipse at center 35%, ${hsl(accentHsl, 0.52)} 0%, ${hsl(accentHsl, 0.18)} 40%, transparent 70%)`,
        }}
      />
      {!iconFailed ? (
        <img
          src={iconSrc}
          alt=""
          className="adepts-slot-portrait__img"
          style={{
            filter: `brightness(1.08) saturate(1.35) drop-shadow(0 0 12px ${hsl(accentHsl, 0.82)}) drop-shadow(0 0 32px ${hsl(accentHsl, 0.38)})`,
          }}
          onError={() => setIconFailed(true)}
          draggable={false}
        />
      ) : (
        <svg viewBox="0 0 120 148" className="adepts-slot-portrait__fallback" aria-hidden>
          <defs>
            <filter id={filterId} x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <ellipse cx="60" cy="36" rx="26" ry="30" fill={hsl(accentHsl, 0.2)} />
          <path
            fill={hsl(accentHsl, 0.92)}
            filter={`url(#${filterId})`}
            d="M60 26c-20 6-33 34-34 62L4 146h232L94 88c2-37-14-61-34-62z"
          />
          <ellipse cx="60" cy="38" rx="17" ry="19" fill="hsl(270 50% 3%)" opacity={0.6} />
        </svg>
      )}
    </div>
  );
}

function SeatNameEditor({
  seatIndex,
  value,
  readonly,
  accentHsl,
  onCommit,
}: {
  seatIndex: number;
  value: string;
  readonly: boolean;
  accentHsl: string;
  onCommit: (seatIndex: number, next: string) => void;
}) {
  const [raw, setRaw] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setRaw(value), [value]);

  if (readonly) {
    return (
      <div
        className="adepts-slot-name adepts-slot-name--readonly truncate"
        style={{
          color: hsl(accentHsl, 0.88),
          textShadow: `0 0 10px ${hsl(accentHsl, 0.32)}`,
        }}
        title={value || `P${seatIndex + 1}`}
      >
        {value || `P${seatIndex + 1}`}
      </div>
    );
  }

  const commit = () => onCommit(seatIndex, raw.trim() || `P${seatIndex + 1}`);

  return (
    <input
      ref={inputRef}
      className="adepts-slot-name adepts-slot-name--input"
      value={raw}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          inputRef.current?.blur();
        }
        if (e.key === "Escape") setRaw(value);
      }}
      maxLength={32}
      aria-label={`Имя игрока ${seatIndex + 1}`}
      style={{
        borderColor: hsl(accentHsl, 0.55),
        color: hsl(accentHsl),
        boxShadow: `0 0 16px ${hsl(accentHsl, 0.28)} inset`,
      }}
    />
  );
}

function SeatScoreEditor({
  seatIndex,
  value,
  readonly,
  accentHsl,
  onCommitExact,
  onStep,
}: {
  seatIndex: number;
  value: number;
  readonly: boolean;
  accentHsl: string;
  onCommitExact: (seatIndex: number, score: number) => void;
  onStep: (seatIndex: number, direction: "up" | "down") => void;
}) {
  const [raw, setRaw] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setRaw(String(value)), [value]);

  if (readonly) {
    return (
      <div
        className="adepts-slot-score adepts-slot-score--readonly"
        style={{
          color: hsl(accentHsl),
          textShadow: `0 0 18px ${hsl(accentHsl, 0.72)}, 0 0 44px ${hsl(accentHsl, 0.26)}`,
        }}
      >
        {value}
      </div>
    );
  }

  const commit = () => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setRaw(String(value));
      return;
    }
    onCommitExact(seatIndex, Math.trunc(parsed));
  };

  return (
    <div className="adepts-slot-score-row">
      <button
        type="button"
        className="adepts-slot-score-step adepts-slot-score-step--minus"
        onClick={() => onStep(seatIndex, "down")}
        aria-label="Минус 100"
        title="Минус 100"
      >
        −
      </button>
      <input
        ref={inputRef}
        className="adepts-slot-score adepts-slot-score--input"
        type="number"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            inputRef.current?.blur();
          }
          if (e.key === "Escape") setRaw(String(value));
        }}
        aria-label={`Очки игрока ${seatIndex + 1}`}
        style={{
          borderColor: hsl(accentHsl, 0.55),
          color: hsl(accentHsl),
          boxShadow: `0 0 24px ${hsl(accentHsl, 0.35)}`,
        }}
      />
      <button
        type="button"
        className="adepts-slot-score-step"
        onClick={() => onStep(seatIndex, "up")}
        aria-label="Плюс 100"
        title="Плюс 100"
        style={{ color: hsl(accentHsl) }}
      >
        +
      </button>
    </div>
  );
}

export function PlayersPanel({
  snapshot,
  role,
  send,
}: {
  snapshot: SessionSnapshot | null;
  role: Role;
  send: (type: string, payload: unknown) => void;
}) {
  const seatNames = snapshot?.seatNames ?? ["P1", "P2", "P3", "P4", "P5"];
  const scores = snapshot?.scores ?? [0, 0, 0, 0, 0];
  const currentTurnSeat = snapshot?.currentTurnSeat ?? -1;
  const readonly = role !== "host";

  const normalizedTurn =
    Number.isInteger(currentTurnSeat) && currentTurnSeat >= 0 && currentTurnSeat <= 4
      ? currentTurnSeat
      : undefined;

  return (
    <div className="adepts-players-panel" role="region" aria-label="Игроки">
      <div className="adepts-players-panel__strip adepts-players-panel__strip--slots">
        {Array.from({ length: 5 }, (_, seatIndex) => {
          const theme = ADEPTS_SLOT_THEMES[seatIndex] ?? ADEPTS_SLOT_THEMES[0]!;
          const accent = theme.hsl;
          const isTurn = normalizedTurn === seatIndex;

          const clipStyle = {
            ["--oct" as string]: "clamp(9px, 2.2vw, 15px)",
            clipPath: PLAYER_CARD_OCTAGON_CLIP,
            WebkitClipPath: PLAYER_CARD_OCTAGON_CLIP,
            background: `linear-gradient(175deg, hsl(270 35% 8% / 0.94) 0%, hsl(270 28% 5% / 0.97) 50%, hsl(270 43% 3% / 1) 100%)`,
            boxShadow: isTurn
              ? `inset 0 0 0 1px ${hsl(accent, 0.42)}, inset 0 -8px 40px ${hsl(accent, 0.069)}`
              : `inset 0 0 0 1px ${hsl(accent, 0.12)}, inset 0 0 34px ${hsl(accent, 0.06)}`,
          } satisfies CSSProperties;

          return (
            <div
              key={seatIndex}
              className="adepts-slot-card-shell"
              style={{ filter: slotCardShellFilter(accent, isTurn) }}
              aria-current={isTurn ? "true" : undefined}
              title={isTurn ? "Сейчас ход этого игрока" : undefined}
            >
              <div className={`adepts-slot-card ${isTurn ? "adepts-slot-card--turn" : ""}`} style={clipStyle}>
                <div
                  aria-hidden
                  className={`adepts-slot-card__glow-top ${isTurn ? "" : "adepts-slot-card__glow-top--off"}`}
                  style={{
                    background: `radial-gradient(ellipse 118% 90% at 50% -8%, ${hsl(accent, 0.207)}, transparent 58%)`,
                  }}
                />
                <div
                  className="adepts-slot-card__glow-mid"
                  style={{
                    background: `radial-gradient(ellipse 130% 90% at 50% -5%, ${hsl(accent, 0.5)}, transparent 58%)`,
                  }}
                  aria-hidden
                />

                <div
                  className="adepts-slot-card__name-zone"
                  style={{ borderBottomColor: hsl(accent, 0.22) }}
                >
                  <SeatNameEditor
                    seatIndex={seatIndex}
                    value={seatNames[seatIndex] || `P${seatIndex + 1}`}
                    readonly={readonly}
                    accentHsl={accent}
                    onCommit={(i, next) => send("host_set_seat_name", { seatIndex: i, name: next })}
                  />
                </div>

                <SlotPortrait accentHsl={accent} slotIndex={seatIndex} isTurn={isTurn} />

                <div
                  className="adepts-slot-card__score-zone"
                  style={{ borderTopColor: hsl(accent, 0.25) }}
                >
                  <SeatScoreEditor
                    seatIndex={seatIndex}
                    value={scores[seatIndex] ?? 0}
                    readonly={readonly}
                    accentHsl={accent}
                    onCommitExact={(i, score) => send("host_set_score", { seatIndex: i, score })}
                    onStep={(i, direction) => send("host_score_step", { seatIndex: i, direction })}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
