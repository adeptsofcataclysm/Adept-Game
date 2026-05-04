import type { Role } from "@/sessionTypes";

export type GamePageHeaderProps = {
  badgeLabel: string;
  connected: boolean;
  viewerName: string;
  viewerRole: Role;
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

export function GamePageHeader({ badgeLabel, connected, viewerName, viewerRole }: GamePageHeaderProps) {
  const onlineColor = connected ? "#2ecc71" : "#e74c3c";
  const onlineLabel = connected ? "Онлайн" : "Подключение…";
  const connectionHint = connected ? "WebSocket connected" : "Connecting";

  return (
    <header className="game-header">
      <h1 className="game-header__title">САМЫЙ ДУШНЫЙ 3.0</h1>
      <div className="game-header__mid">
        <span className="adepts-quiz-badge adepts-game-header__badge">{badgeLabel}</span>
      </div>
      <div className="game-header__actions">
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
      </div>
    </header>
  );
}
