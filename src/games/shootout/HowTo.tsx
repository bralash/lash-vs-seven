import keeperOrange from './sprites/keeper.png'
import keeperBlue from './sprites/keeper-blue.png'

/*
 * How to play, acted out on a loop. Shooting: a thumb drags, the aim slides up to the top corner and
 * sways there, the thumb lets go and the ball flies in. Keeping (from behind your keeper): a thumb taps
 * the low left of the goal, that spot lights up, your keeper leans and then dives as the ball comes.
 */

/** the goal mouth in both scenes, in the 100 × 56 picture */
const G = { x0: 16, x1: 84, y0: 8, y1: 46 }

function Goal({ zones }: { zones?: boolean }) {
  const third = (G.x1 - G.x0) / 3
  const mid = (G.y0 + G.y1) / 2
  return (
    <g>
      {zones && (
        <g className="so-demo__zones">
          <line x1={G.x0 + third} y1={G.y0} x2={G.x0 + third} y2={G.y1} />
          <line x1={G.x0 + 2 * third} y1={G.y0} x2={G.x0 + 2 * third} y2={G.y1} />
          <line x1={G.x0} y1={mid} x2={G.x1} y2={mid} />
          <rect className="so-demo__pick" x={G.x0} y={mid} width={third} height={G.y1 - mid} />
        </g>
      )}
      <path className="so-demo__frame" d={`M${G.x0} ${G.y1}V${G.y0}H${G.x1}V${G.y1}`} />
    </g>
  )
}

export function ShootoutDemo() {
  return (
    <div className="so-demo" aria-hidden="true">
      <figure className="so-demo__scene">
        <div className="so-demo__box">
          <svg viewBox="0 0 100 56">
            <pattern id="so-demo-net" width="3" height="3" patternUnits="userSpaceOnUse">
              <path d="M0 0 L3 3 M3 0 L0 3" className="so-demo__mesh" />
            </pattern>
            <rect x={G.x0} y={G.y0} width={G.x1 - G.x0} height={G.y1 - G.y0} fill="url(#so-demo-net)" />
            <Goal />
          </svg>
          <span className="so-demo__keeper so-demo__keeper--theirs" style={{ backgroundImage: `url(${keeperBlue})` }} />
          <svg viewBox="0 0 100 56" className="so-demo__over">
            <g className="so-demo__aim">
              <circle r="3.2" />
              <line x1="-4.6" x2="4.6" />
              <line y1="-4.6" y2="4.6" />
            </g>
            <circle className="so-demo__ball so-demo__ball--shot" r="2.6" />
          </svg>
          <span className="so-demo__thumb so-demo__thumb--drag" />
        </div>
        <figcaption>Shooting: drag, let go</figcaption>
      </figure>
      <figure className="so-demo__scene">
        <div className="so-demo__box">
          <svg viewBox="0 0 100 56">
            <Goal zones />
          </svg>
          <span className="so-demo__keeper so-demo__keeper--yours" style={{ backgroundImage: `url(${keeperOrange})` }} />
          <svg viewBox="0 0 100 56" className="so-demo__over">
            <circle className="so-demo__ball so-demo__ball--save" r="1" />
          </svg>
          <span className="so-demo__thumb so-demo__thumb--tap" />
        </div>
        <figcaption>In goal: tap where you’ll dive</figcaption>
      </figure>
    </div>
  )
}

export function HowTo({ onDone }: { onDone: () => void }) {
  return (
    <div className="so-howto" role="dialog" aria-label="How to play" onPointerDown={(e) => e.stopPropagation()}>
      <div className="so-howto__card">
        <p className="label">How to play</p>
        <ShootoutDemo />
        <ol className="so-howto__steps">
          <li>
            <b>Shooting:</b> drag to move the aim on the goal, then let go. It sways more near the posts and the bar, so let go when it’s where you want it.
          </li>
          <li>
            <b>In goal:</b> tap where you’ll dive, left, middle or right, high or low. You can change it until the kick.
          </li>
          <li>
            <b>The right spot saves it.</b> The right side but the wrong height is fingertips. Five each, then sudden death.
          </li>
        </ol>
        <button type="button" className="btn btn--primary btn--block" onClick={onDone}>
          Got it
        </button>
      </div>
    </div>
  )
}
