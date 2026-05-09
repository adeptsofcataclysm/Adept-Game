import { useNavigate } from "react-router-dom";
import type { Phase, Role } from "@/sessionTypes";
import { clearAdeptLocalStorage } from "@/storage";

export type GamePageHeaderProps = {
  badgeLabel: string;
  connected: boolean;
  viewerName: string;
  viewerRole: Role;
  phase?: Phase;
  phaseNav?: Phase[];
  /** Host-only full session reset (clears state and reloads grids from disk). */
  onHostReset?: () => void;
  onHostTransition?: (to: Phase) => void;
};

function roleDisplayLabel(role: Role): string {
  switch (role) {
    case "host":
      return "Ведущий";
    case "player":
      return "Игрок";
    case "spectator":
      return "Зритель";
  }
}

function ChevronLeftIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M15 18l-6-6 6-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRightIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M9 6l6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function phaseKey(p: Phase): string {
  switch (p.kind) {
    case "lobby":
    case "final":
      return p.kind;
    case "round":
      return `round:${p.roundIndex}`;
    case "plugin_segment":
      return `plugin_segment:${p.pluginId}:${p.id}`;
  }
}

function HostPhaseNav({
  phase,
  phaseNav,
  onHostTransition,
}: {
  phase: Phase | undefined;
  phaseNav: Phase[] | undefined;
  onHostTransition: ((to: Phase) => void) | undefined;
}) {
  if (!phase || !phaseNav || !onHostTransition) return null;

  const curKey = phaseKey(phase);
  const idx = phaseNav.findIndex((p) => phaseKey(p) === curKey);
  const disabled = idx < 0;
  const prev = !disabled && idx > 0 ? phaseNav[idx - 1] : null;
  const next = !disabled && idx < phaseNav.length - 1 ? phaseNav[idx + 1] : null;
  const counter = !disabled ? `${idx + 1}/${phaseNav.length}` : `—/${phaseNav.length}`;

  return (
    <nav className="game-header__phase-nav" aria-label="Переход между фазами игры">
      {prev ? (
        <button
          type="button"
          className="game-header__phase-nav-btn"
          onClick={() => onHostTransition(prev)}
          title="Назад"
          aria-label="Предыдущая фаза"
        >
          <ChevronLeftIcon size={16} />
        </button>
      ) : (
        <span className="game-header__phase-nav-btn game-header__phase-nav-btn--disabled" aria-hidden="true">
          <ChevronLeftIcon size={16} />
        </span>
      )}

      <span className="game-header__phase-nav-count" aria-label={`Текущая фаза: ${counter}`}>
        {counter}
      </span>

      {next ? (
        <button
          type="button"
          className="game-header__phase-nav-btn"
          onClick={() => onHostTransition(next)}
          title="Вперёд"
          aria-label="Следующая фаза"
        >
          <ChevronRightIcon size={16} />
        </button>
      ) : (
        <span className="game-header__phase-nav-btn game-header__phase-nav-btn--disabled" aria-hidden="true">
          <ChevronRightIcon size={16} />
        </span>
      )}
    </nav>
  );
}

export function GamePageHeader({
  badgeLabel,
  connected,
  viewerName,
  viewerRole,
  phase,
  phaseNav,
  onHostReset,
  onHostTransition,
}: GamePageHeaderProps) {
  const navigate = useNavigate();
  const onlineColor = connected ? "#2ecc71" : "#e74c3c";
  const onlineLabel = connected ? "Онлайн" : "Подключение…";
  const connectionHint = connected ? "WebSocket connected" : "Connecting";

  function handleLogout() {
    clearAdeptLocalStorage();
    navigate("/", { replace: true });
  }

  function handleHostResetClick() {
    if (!onHostReset) return;
    if (
      !window.confirm(
        "Сбросить игру? Будут очищены очки, чат, состояние сегментов и открытые клетки; сетки вопросов перечитаются с диска. Участники останутся в комнате.",
      )
    )
      return;
    onHostReset();
  }

  return (
    <header className="game-header">
      <h1 className="game-header__title">САМЫЙ ДУШНЫЙ 3.0</h1>
      <div className="game-header__mid">
        <span className="adepts-quiz-badge adepts-game-header__badge">{badgeLabel}</span>
      </div>
      <div className="game-header__actions">
        {viewerRole === "host" && onHostReset ? (
          <button
            type="button"
            className="game-header__reset"
            onClick={handleHostResetClick}
            disabled={!connected}
            title={connected ? undefined : "Нет соединения с сервером"}
          >
            Reset
          </button>
        ) : null}
        {viewerRole === "host" ? (
          <HostPhaseNav phase={phase} phaseNav={phaseNav} onHostTransition={onHostTransition} />
        ) : null}
        <div
          className="game-header__online"
          style={{ color: onlineColor }}
          tabIndex={0}
          aria-label={`${connectionHint}. Name: ${viewerName}. Role: ${roleDisplayLabel(viewerRole)}.`}
        >
          <span
            className="game-header__online-dot"
            style={{
              background: onlineColor,
              boxShadow: connected ? "0 0 8px #2ecc71" : "0 0 8px #e74c3c",
            }}
          />
          {onlineLabel}
          <div className="game-header__online-tooltip" aria-hidden="true">
            <div className="game-header__online-tooltip-row">
              <span className="game-header__online-tooltip-key">Имя</span>
              <span className="game-header__online-tooltip-val">{viewerName}</span>
            </div>
            <div className="game-header__online-tooltip-row">
              <span className="game-header__online-tooltip-key">Роль</span>
              <span className="game-header__online-tooltip-val">{roleDisplayLabel(viewerRole)}</span>
            </div>
          </div>
        </div>
        <button type="button" className="game-header__logout" onClick={handleLogout}>
          →
        </button>
      </div>
    </header>
  );
}
