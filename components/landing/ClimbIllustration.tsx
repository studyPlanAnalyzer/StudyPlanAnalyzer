// Hero visual: a child steps up four steps, one per benefit, on page load.
// Pure SVG + CSS (LandingStyles); the resting state is the child at the top.
const STEPS = [
  { x: 10, y: 270, label: 'Remember more', fill: '#9DDFC2' },
  { x: 55, y: 200, label: 'Feel confident', fill: '#A5A9F0' },
  { x: 100, y: 130, label: 'Keep going', fill: '#F2A99F' },
  { x: 145, y: 60, label: 'Do better in exams', fill: '#F7CC46' },
];

export function ClimbIllustration() {
  return (
    <svg
      viewBox="0 0 400 342"
      className="block h-auto w-full"
      role="img"
      aria-label="A child climbing four steps, from bottom to top: Remember more, Feel confident, Keep going, Do better in exams."
    >
      <defs>
        <filter id="lp-step-shadow" x="-10%" y="-20%" width="120%" height="160%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#000" floodOpacity="0.12" />
        </filter>
      </defs>

      {STEPS.map((s, i) => (
        <g key={s.label} className="lp-step" style={{ animationDelay: `${i * 140}ms` }}>
          <rect
            x={s.x}
            y={s.y}
            width="245"
            height="52"
            rx="18"
            fill={s.fill}
            stroke="#fff"
            strokeWidth="5"
            filter="url(#lp-step-shadow)"
          />
          <text x={s.x + 20} y={s.y + 33} fontSize="20" fontWeight="700" fill="#000">
            {s.label}
          </text>
        </g>
      ))}

      {/* Star at the top step */}
      <path
        className="lp-star"
        d="M362 14 l5.3 10.7 11.7 1.7 -8.5 8.3 2 11.7 -10.5 -5.5 -10.5 5.5 2 -11.7 -8.5 -8.3 11.7 -1.7z"
        fill="#F7CC46"
        stroke="#000"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* The child, drawn with feet at (0, 0) */}
      <g className="lp-climber" transform="translate(167 60)">
        <path
          d="M-5 -16 L-7 -1 M5 -16 L8 -1"
          stroke="#1A1A1A"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        <rect x="-15" y="-34" width="9" height="16" rx="3.5" fill="#F7CC46" stroke="#000" strokeWidth="2" />
        <path
          d="M7 -30 L15 -41 M-6 -29 L-11 -19"
          stroke="#A86B4A"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <rect x="-9" y="-36" width="18" height="22" rx="8" fill="#000" />
        <circle cx="0" cy="-45" r="9.5" fill="#A86B4A" />
        <path d="M-9.5 -46 a9.5 9.5 0 0 1 19 0 q-5 -4 -10 -3 q-5 1 -9 3z" fill="#1A1A1A" />
        <circle cx="4" cy="-45" r="1.4" fill="#000" />
        <path d="M2 -41 q3 2 6 -1" stroke="#000" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}
