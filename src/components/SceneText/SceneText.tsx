import { SCENES } from '../../data/scenes'
import type { SceneDef } from '../../data/scenes'
import './SceneText.css'

/**
 * Renders every text scene declared in scenes.ts (except the final CTA).
 * All animation is driven imperatively from Experience — components here
 * never re-render during scroll.
 */
export function SceneText() {
  return (
    <>
      {SCENES.filter((s) => s.variant !== 'final').map((def) => (
        <Scene key={def.id} def={def} />
      ))}
    </>
  )
}

function Scene({ def }: { def: SceneDef }) {
  if (def.variant === 'hero') {
    return (
      <div className="scene scene--hero" data-scene={def.id}>
        <h1 className="hero-title" data-hero-title>
          {def.lines?.map((line) => (
            <span className="line" data-line key={line}>
              <span>{line}</span>
            </span>
          ))}
        </h1>
        <p className="hero-sub" data-line>
          <span>{def.sub}</span>
        </p>
        <p className="hero-hint" data-line>
          <span>
            {def.label}
            <i className="hero-hint-line" aria-hidden="true" />
          </span>
        </p>
      </div>
    )
  }

  if (def.variant === 'marker') {
    return (
      <div className="scene scene--marker" data-scene={def.id}>
        <span className="marker-rule" aria-hidden="true" />
        <p className="marker-value" data-line>
          <span>{def.label}</span>
        </p>
      </div>
    )
  }

  if (def.variant === 'meta') {
    return (
      <div className="scene scene--meta" data-scene={def.id}>
        <p className="meta-label" data-line>
          <span>{def.label}</span>
        </p>
        <p className="meta-rule" data-line>
          <span />
        </p>
        <p className="meta-index" data-line>
          <span>{def.sub}</span>
        </p>
      </div>
    )
  }

  // statement / statement-xl / reveal
  return (
    <div className={`scene scene--${def.variant}`} data-scene={def.id}>
      <p className="statement">
        {def.lines?.map((line) => (
          <span className="line" data-line key={line}>
            <span>{line}</span>
          </span>
        ))}
      </p>
    </div>
  )
}
