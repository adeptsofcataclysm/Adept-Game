export type GamePageHeaderProps = {
  badgeLabel: string;
  connected: boolean;
};

/** Same chrome as Node-Script `artifacts/game-client` adepts quiz `Home.tsx` header (title, badge row, online pill). */
export function GamePageHeader({ badgeLabel, connected }: GamePageHeaderProps) {
  const onlineColor = connected ? "#2ecc71" : "#e74c3c";
  const onlineLabel = connected ? "Онлайн" : "Подключение…";

  return (
    <header className="adepts-game-header">
      <h1 className="adepts-game-header__title">САМЫЙ ДУШНЫЙ 3.0</h1>
      <div className="adepts-game-header__mid">
        <span className="adepts-quiz-badge adepts-game-header__badge">{badgeLabel}</span>
      </div>
      <div className="adepts-game-header__actions">
        <div
          className="adepts-game-header__online"
          style={{ color: onlineColor }}
          title={connected ? "WebSocket connected" : "Connecting"}
        >
          <span
            className="adepts-game-header__online-dot"
            style={{
              background: onlineColor,
              boxShadow: connected ? "0 0 8px #2ecc71" : "0 0 8px #e74c3c",
            }}
          />
          {onlineLabel}
        </div>
      </div>
    </header>
  );
}
