export const QUESTION_TIMER_SECONDS = 30;

const TIMER_RING_RADIUS = 31;
const TIMER_RING_CIRC = 2 * Math.PI * TIMER_RING_RADIUS;

/** Circular countdown — same geometry/colors as Node-Script `QuestionModal` `CountdownTimer`. */
export function QuestionHeaderCountdown({ seconds }: { seconds: number }) {
  const fraction = seconds / QUESTION_TIMER_SECONDS;
  const dashOffset = TIMER_RING_CIRC * (1 - fraction);

  const color =
    seconds > 15 ? "hsl(45, 93%, 62%)" : seconds > 7 ? "hsl(35, 95%, 55%)" : "hsl(0, 75%, 55%)";

  const glowColor =
    seconds > 15 ? "hsla(45, 93%, 47%, 0.45)" : seconds > 7 ? "hsla(35, 95%, 55%, 0.45)" : "hsla(0, 75%, 55%, 0.55)";

  return (
    <div
      className="adepts-question-modal__header-timer"
      style={{ filter: `drop-shadow(0 0 8px ${glowColor})` }}
      role="img"
      aria-label={`Осталось ${seconds} сек.`}
    >
      <svg width="75" height="75" viewBox="0 0 75 75">
        <circle
          cx="37.5"
          cy="37.5"
          r={TIMER_RING_RADIUS}
          fill="none"
          stroke="hsla(280, 30%, 30%, 0.4)"
          strokeWidth="5"
        />
        <circle
          cx="37.5"
          cy="37.5"
          r={TIMER_RING_RADIUS}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={TIMER_RING_CIRC}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 37.5 37.5)"
          style={{ transition: "stroke-dashoffset 0.95s linear, stroke 0.4s ease" }}
        />
        <text
          x="37.5"
          y="37.5"
          dominantBaseline="central"
          textAnchor="middle"
          fontSize="20"
          fontWeight="bold"
          fontFamily="inherit"
          fill={color}
          style={{ transition: "fill 0.4s ease" }}
        >
          {seconds}
        </text>
      </svg>
    </div>
  );
}
