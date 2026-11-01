import { Reveal } from './Reveal';

// Illustrative forgetting curve: no numbers, just the shape. Lines draw in
// when the card scrolls into view.
const REVISIONS = [
  { x: 78, y: 28, delay: 750 },
  { x: 140, y: 26, delay: 1150 },
  { x: 222, y: 24, delay: 1650 },
];

export function ForgettingCurve() {
  return (
    <Reveal>
      <svg
        viewBox="0 0 320 206"
        className="block h-auto w-full"
        role="img"
        aria-label="Illustration: without revision, what is remembered falls quickly and stays low. With spaced revision, each revision lifts it back up, and it falls more slowly each time."
      >
        <path d="M28 12 V174 H312" stroke="#DEDCD8" strokeWidth="2" fill="none" />
        <text x="-93" y="16" transform="rotate(-90)" textAnchor="middle" fontSize="15" fill="#65615D">
          Remembered
        </text>
        <text x="312" y="198" textAnchor="end" fontSize="15" fill="#65615D">
          Time
        </text>

        <path
          className="lp-draw"
          pathLength={1}
          d="M30 22 C 58 110, 110 150, 312 160"
          stroke="#8A8580"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        <path
          className="lp-draw"
          pathLength={1}
          style={{ animationDelay: '300ms', animationDuration: '2s' }}
          d="M30 22 C 44 60, 58 84, 78 92 L78 28 C 98 50, 118 66, 140 72 L140 26 C 166 44, 196 54, 222 58 L222 24 C 250 34, 284 40, 312 44"
          stroke="#000"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {REVISIONS.map((r) => (
          <circle
            key={r.x}
            className="lp-pop"
            style={{ animationDelay: `${r.delay}ms` }}
            cx={r.x}
            cy={r.y}
            r="6.5"
            fill="#F7CC46"
            stroke="#000"
            strokeWidth="2"
          />
        ))}
      </svg>

      <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-base text-black">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="h-1 w-6 rounded-full bg-black" />
          With spaced revision
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="h-1 w-6 rounded-full bg-[#8A8580]" />
          Without revision
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="h-3.5 w-3.5 rounded-full border-2 border-black bg-[#F7CC46]" />
          A revision
        </li>
      </ul>
    </Reveal>
  );
}
