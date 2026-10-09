import { memo } from "react";
import {
  CORNER_MOUTH,
  HEAD_Y,
  LENGTH,
  POCKETS,
  R,
  SIDE_MOUTH,
  WIDTH,
} from "./physics";

/*
 * The table, drawn to look solid: blue cloth that darkens towards the cushions, the cushions, wooden
 * rails in a dark frame, chrome round the pockets, and glossy balls. 300 px to a table width; the
 * playing area sits inside RAIL px of cushion, wood and frame.
 */

export const S = 300;
export const RAIL = 26;
export const VW = WIDTH * S + RAIL * 2;
export const VH = LENGTH * S + RAIL * 2;
export const X = (x: number) => RAIL + x * S;
export const Y = (y: number) => RAIL + y * S;
const CUSHION = 7;
const FRAME = 5;

/** solids are the colour all over, stripes a band of it on white; the 8 black */
const COLOURS = [
  "#f4f1ea",
  "#f6c21a",
  "#1d4fc4",
  "#d42a2a",
  "#5b2d91",
  "#f07418",
  "#13874a",
  "#7a1c22",
  "#141318",
];
const colourOf = (n: number) => COLOURS[n > 8 ? n - 8 : n];

/** The defs every ball and the table share: the gloss, the shadows, the wood, the chrome. */
function Defs() {
  const r = R * S;
  return (
    <defs>
      <clipPath id="pool-ball">
        <circle r={r} />
      </clipPath>
      {/* light from the top left: a bright spot, then the colour, then a dark rim */}
      <radialGradient id="pool-gloss" cx="34%" cy="28%" r="78%">
        <stop offset="0" stopColor="#fff" stopOpacity=".85" />
        <stop offset=".16" stopColor="#fff" stopOpacity=".18" />
        <stop offset=".5" stopColor="#fff" stopOpacity="0" />
        <stop offset=".82" stopColor="#000" stopOpacity=".18" />
        <stop offset="1" stopColor="#000" stopOpacity=".5" />
      </radialGradient>
      <radialGradient id="pool-cloth" cx="50%" cy="45%" r="70%">
        <stop offset="0" stopColor="#2d7fd6" />
        <stop offset=".6" stopColor="#1f63b8" />
        <stop offset="1" stopColor="#123f82" />
      </radialGradient>
      <linearGradient id="pool-wood-v" x1="0" x2="1">
        <stop offset="0" stopColor="#4a1f0b" />
        <stop offset=".45" stopColor="#8f4a22" />
        <stop offset=".7" stopColor="#a65a2c" />
        <stop offset="1" stopColor="#5a2810" />
      </linearGradient>
      <linearGradient id="pool-wood-h" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#4a1f0b" />
        <stop offset=".45" stopColor="#8f4a22" />
        <stop offset=".7" stopColor="#a65a2c" />
        <stop offset="1" stopColor="#5a2810" />
      </linearGradient>
      <radialGradient id="pool-chrome" cx="40%" cy="35%" r="70%">
        <stop offset="0" stopColor="#f4f6f9" />
        <stop offset=".55" stopColor="#a9b0bb" />
        <stop offset="1" stopColor="#5c626d" />
      </radialGradient>
      {/* a hole lit from the top left: its near (top left) wall in shadow, deepest just off centre */}
      <radialGradient id="pool-hole" cx="44%" cy="42%" r="58%">
        <stop offset="0" stopColor="#000" />
        <stop offset=".7" stopColor="#060607" />
        <stop offset="1" stopColor="#2a2b31" />
      </radialGradient>
      {/* the cloth darkening into the cushions, one strip a side */}
      {(["t", "b", "l", "r"] as const).map((k) => (
        <linearGradient
          key={k}
          id={`pool-edge-${k}`}
          x1={k === "r" ? "1" : "0"}
          x2={k === "l" ? "1" : "0"}
          y1={k === "b" ? "1" : "0"}
          y2={k === "t" ? "1" : "0"}
        >
          <stop offset="0" stopColor="#000" stopOpacity=".38" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </linearGradient>
      ))}
      <linearGradient id="pool-cushion" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stopColor="#2563b4" />
        <stop offset="1" stopColor="#123f80" />
      </linearGradient>
      <radialGradient id="pool-throat" cx="50%" cy="50%" r="60%">
        <stop offset="0" stopColor="#050506" />
        <stop offset="1" stopColor="#1e1f24" />
      </radialGradient>
      <linearGradient id="pool-cue" x1="0" x2="1">
        <stop offset="0" stopColor="#f2d9a6" />
        <stop offset=".5" stopColor="#e4bf7c" />
        <stop offset="1" stopColor="#b98a46" />
      </linearGradient>
    </defs>
  );
}

/** points in table units to a polygon in the drawing */
const poly = (pts: [number, number][]) =>
  pts.map(([x, y]) => `${X(x)},${Y(y)}`).join(" ");

/** The table itself: drawn once, it never changes. */
export const TableArt = memo(function TableArt() {
  const L = X(0);
  const Rt = X(1);
  const T = Y(0);
  const c = CUSHION / S; // the cushion's depth, in table units
  const CM = CORNER_MOUTH;
  const SM = SIDE_MOUTH;
  // each cushion runs between two pockets and turns back along the jaws at its ends (45° at a corner, shallower by a side pocket)
  const cushions: [number, number][][] = [
    [
      [CM, 0],
      [1 - CM, 0],
      [1 - CM + c, -c],
      [CM - c, -c],
    ],
    [
      [CM, LENGTH],
      [1 - CM, LENGTH],
      [1 - CM + c, LENGTH + c],
      [CM - c, LENGTH + c],
    ],
    [
      [0, CM],
      [0, 1 - SM],
      [-c, 1 - SM + c * 0.35],
      [-c, CM - c],
    ],
    [
      [0, 1 + SM],
      [0, LENGTH - CM],
      [-c, LENGTH - CM + c],
      [-c, 1 + SM - c * 0.35],
    ],
    [
      [1, CM],
      [1, 1 - SM],
      [1 + c, 1 - SM + c * 0.35],
      [1 + c, CM - c],
    ],
    [
      [1, 1 + SM],
      [1, LENGTH - CM],
      [1 + c, LENGTH - CM + c],
      [1 + c, 1 + SM - c * 0.35],
    ],
  ];
  // the cushion's nose, where a ball meets it (a light edge)
  const noses: [number, number, number, number][] = [
    [CM, 0, 1 - CM, 0],
    [CM, LENGTH, 1 - CM, LENGTH],
    [0, CM, 0, 1 - SM],
    [0, 1 + SM, 0, LENGTH - CM],
    [1, CM, 1, 1 - SM],
    [1, 1 + SM, 1, LENGTH - CM],
  ];
  // the pockets' throats: from the jaws down into the hole, in dark leather
  const throats: [number, number][][] = [
    [
      [CM, 0],
      [CM - 0.045, -0.045],
      [-0.03, -0.03],
      [-0.045, CM - 0.045],
      [0, CM],
      [0, 0],
    ],
    [
      [1 - CM, 0],
      [1 - CM + 0.045, -0.045],
      [1.03, -0.03],
      [1.045, CM - 0.045],
      [1, CM],
      [1, 0],
    ],
    [
      [CM, LENGTH],
      [CM - 0.045, LENGTH + 0.045],
      [-0.03, LENGTH + 0.03],
      [-0.045, LENGTH - CM + 0.045],
      [0, LENGTH - CM],
      [0, LENGTH],
    ],
    [
      [1 - CM, LENGTH],
      [1 - CM + 0.045, LENGTH + 0.045],
      [1.03, LENGTH + 0.03],
      [1.045, LENGTH - CM + 0.045],
      [1, LENGTH - CM],
      [1, LENGTH],
    ],
    [
      [0, 1 - SM],
      [-0.04, 1 - SM + 0.014],
      [-0.06, 1],
      [-0.04, 1 + SM - 0.014],
      [0, 1 + SM],
    ],
    [
      [1, 1 - SM],
      [1.04, 1 - SM + 0.014],
      [1.06, 1],
      [1.04, 1 + SM - 0.014],
      [1, 1 + SM],
    ],
  ];
  const sights = [0.25, 0.5, 0.75];
  return (
    <>
      <Defs />
      {/* the frame, then the wooden rails, with a light edge along the inside */}
      <rect x="0" y="0" width={VW} height={VH} rx="16" fill="#15171c" />
      <rect
        x="1.5"
        y="1.5"
        width={VW - 3}
        height={VH - 3}
        rx="15"
        fill="none"
        stroke="#3a3e48"
        strokeWidth="1.5"
      />
      <rect
        x={FRAME}
        y={FRAME}
        width={VW - FRAME * 2}
        height={VH - FRAME * 2}
        rx="12"
        fill="url(#pool-wood-h)"
      />
      <rect
        x={FRAME}
        y={FRAME + 30}
        width={RAIL - FRAME}
        height={VH - FRAME * 2 - 60}
        fill="url(#pool-wood-v)"
      />
      <rect
        x={VW - RAIL}
        y={FRAME + 30}
        width={RAIL - FRAME}
        height={VH - FRAME * 2 - 60}
        fill="url(#pool-wood-v)"
      />
      <rect
        x={L - CUSHION - 1.5}
        y={T - CUSHION - 1.5}
        width={WIDTH * S + CUSHION * 2 + 3}
        height={LENGTH * S + CUSHION * 2 + 3}
        fill="none"
        stroke="#c9844c"
        strokeOpacity=".55"
        strokeWidth="1.2"
      />
      {/* the sights: mother-of-pearl diamonds along the rails */}
      <g fill="#efe4cc">
        {sights.map((d) => (
          <g key={d}>
            <circle cx={X(d)} cy={RAIL / 2 + 2} r="2" />
            <circle cx={X(d)} cy={VH - RAIL / 2 - 2} r="2" />
            <circle cx={RAIL / 2 + 2} cy={Y(d)} r="2" />
            <circle cx={RAIL / 2 + 2} cy={Y(1 + d)} r="2" />
            <circle cx={VW - RAIL / 2 - 2} cy={Y(d)} r="2" />
            <circle cx={VW - RAIL / 2 - 2} cy={Y(1 + d)} r="2" />
          </g>
        ))}
      </g>
      {/* chrome caps on the rail round each pocket, kept inside the frame */}
      <clipPath id="pool-frame">
        <rect x="1" y="1" width={VW - 2} height={VH - 2} rx="15" />
      </clipPath>
      <g clipPath="url(#pool-frame)">
        {POCKETS.map((q, i) => {
          const side = i === 2 || i === 3;
          const cx =
            X(q.x) + (side ? (q.x < 0.5 ? -4 : 4) : q.x < 0.5 ? -3 : 3);
          const cy = Y(q.y) + (side ? 0 : q.y < 1 ? -3 : 3);
          return side ? (
            <g key={i}>
              <ellipse
                cx={cx}
                cy={cy}
                rx="15"
                ry="24"
                fill="url(#pool-chrome)"
              />
              <ellipse
                cx={cx}
                cy={cy}
                rx="15"
                ry="24"
                fill="none"
                stroke="#2c3038"
                strokeWidth="1.2"
              />
            </g>
          ) : (
            <g key={i}>
              <circle cx={cx} cy={cy} r="27" fill="url(#pool-chrome)" />
              <circle
                cx={cx}
                cy={cy}
                r="27"
                fill="none"
                stroke="#2c3038"
                strokeWidth="1.2"
              />
            </g>
          );
        })}
      </g>
      {/* the cloth, darker under the cushions and along its edges */}
      <rect
        x={L - CUSHION}
        y={T - CUSHION}
        width={WIDTH * S + CUSHION * 2}
        height={LENGTH * S + CUSHION * 2}
        fill="#0e356d"
      />
      <rect
        x={L}
        y={T}
        width={WIDTH * S}
        height={LENGTH * S}
        fill="url(#pool-cloth)"
      />
      <rect
        x={L}
        y={T}
        width={WIDTH * S}
        height="12"
        fill="url(#pool-edge-t)"
      />
      <rect
        x={L}
        y={Y(LENGTH) - 12}
        width={WIDTH * S}
        height="12"
        fill="url(#pool-edge-b)"
      />
      <rect
        x={L}
        y={T}
        width="12"
        height={LENGTH * S}
        fill="url(#pool-edge-l)"
      />
      <rect
        x={Rt - 12}
        y={T}
        width="12"
        height={LENGTH * S}
        fill="url(#pool-edge-r)"
      />
      {/* the throats of the pockets */}
      {throats.map((t, i) => (
        <polygon key={i} points={poly(t)} fill="url(#pool-throat)" />
      ))}
      {/* the cushions, lit along the nose */}
      <g fill="url(#pool-cushion)">
        {cushions.map((p, i) => (
          <polygon key={i} points={poly(p)} />
        ))}
      </g>
      <g
        stroke="#5ea4f0"
        strokeOpacity=".8"
        strokeWidth="1.1"
        strokeLinecap="round"
      >
        {noses.map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={X(x1)} y1={Y(y1)} x2={X(x2)} y2={Y(y2)} />
        ))}
      </g>
      {/* the holes: a leather lip, a deep black, and the far wall catching a little light */}
      {POCKETS.map((q, i) => {
        const cx = X(q.x);
        const cy = Y(q.y);
        const r = q.r * S * 0.74;
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={r + 2.2} fill="#0c0c0f" />
            <circle cx={cx} cy={cy} r={r} fill="url(#pool-hole)" />
            <path
              d={`M${cx + r * 0.72 * Math.cos(-0.3)} ${cy + r * 0.72 * Math.sin(-0.3)} A${r * 0.72} ${r * 0.72} 0 0 1 ${cx + r * 0.72 * Math.cos(1.9)} ${cy + r * 0.72 * Math.sin(1.9)}`}
              fill="none"
              stroke="#fff"
              strokeOpacity=".09"
              strokeWidth={r * 0.3}
              strokeLinecap="round"
            />
            <circle
              cx={cx}
              cy={cy}
              r={r + 2.2}
              fill="none"
              stroke="#000"
              strokeOpacity=".6"
              strokeWidth="1"
            />
          </g>
        );
      })}
      {/* the head string and the foot spot, faint */}
      <line
        x1={L + 4}
        x2={Rt - 4}
        y1={Y(HEAD_Y)}
        y2={Y(HEAD_Y)}
        stroke="#cfe3ff"
        strokeOpacity=".22"
        strokeWidth="1.2"
      />
      <circle
        cx={X(0.5)}
        cy={Y(HEAD_Y)}
        r="1.8"
        fill="#cfe3ff"
        fillOpacity=".45"
      />
      <circle cx={X(0.5)} cy={Y(0.5)} r="1.8" fill="#cfe3ff" fillOpacity=".3" />
    </>
  );
});

/** A ball, lit from the top left, with its number on a white disc and a shadow on the cloth. */
export function Ball({ n }: { n: number }) {
  const r = R * S;
  return (
    <>
      <ellipse
        cx={r * 0.28}
        cy={r * 0.38}
        rx={r * 1.02}
        ry={r * 0.9}
        fill="#000"
        opacity=".32"
      />
      {n > 8 ? (
        <g clipPath="url(#pool-ball)">
          <circle r={r} fill="#f4f1ea" />
          <rect
            x={-r}
            y={-r * 0.52}
            width={r * 2}
            height={r * 1.04}
            fill={colourOf(n)}
          />
        </g>
      ) : (
        <circle r={r} fill={colourOf(n)} />
      )}
      {n > 0 && (
        <>
          <circle r={r * 0.46} fill="#f8f6f0" />
          <text y={r * 0.2} textAnchor="middle" className="pool-num">
            {n}
          </text>
        </>
      )}
      <circle r={r} fill="url(#pool-gloss)" />
      <circle
        r={r - 0.3}
        fill="none"
        stroke="#000"
        strokeOpacity=".35"
        strokeWidth=".6"
      />
    </>
  );
}

/** The cue, from just behind the ball back along `dir`: tip, ferrule, maple shaft, a red wrapped butt. */
export function Cue({
  x,
  y,
  dx,
  dy,
  back,
  len,
}: {
  x: number;
  y: number;
  dx: number;
  dy: number;
  back: number;
  len: number;
}) {
  const at = (d: number) => ({ x: X(x - dx * d), y: Y(y - dy * d) });
  const a = at(back);
  const b = at(back + len);
  const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  return (
    <g transform={`translate(${a.x} ${a.y}) rotate(${ang})`}>
      {/* its shadow on the cloth */}
      <rect
        x="6"
        y="7"
        width={L}
        height="7"
        rx="3.5"
        fill="#000"
        opacity=".28"
      />
      <rect x="0" y="-2.2" width="4" height="4.4" rx="1.2" fill="#5b8fd8" />
      <rect x="4" y="-2.4" width="5" height="4.8" fill="#f7f4ec" />
      <path
        d={`M9 -2.6 L${L * 0.62} -3.6 L${L * 0.62} 3.6 L9 2.6 Z`}
        fill="url(#pool-cue)"
      />
      <path
        d={`M${L * 0.62} -3.6 L${L} -5 L${L} 5 L${L * 0.62} 3.6 Z`}
        fill="#b3202a"
      />
      {[0.7, 0.78, 0.86].map((k) => (
        <rect
          key={k}
          x={L * k}
          y={-4.6}
          width={L * 0.03}
          height={9.2}
          fill="#f2ede2"
        />
      ))}
      <rect x={L - 8} y="-5" width="8" height="10" rx="2" fill="#2a1a12" />
      <path
        d={`M9 -2.2 L${L} -4.2`}
        stroke="#fff"
        strokeOpacity=".35"
        strokeWidth="1"
      />
    </g>
  );
}
