/**
 * Shell only — outer chrome from Node-Script `lib/adepts-scoreboard/Scoreboard.tsx`
 * (footer strip: border-top, gradient, backdrop blur). Player slot cards come later.
 */
export function PlayersPanel() {
  return (
    <div className="adepts-players-panel" role="region" aria-label="Игроки">
      <div className="adepts-players-panel__reserve" aria-hidden />
    </div>
  );
}
