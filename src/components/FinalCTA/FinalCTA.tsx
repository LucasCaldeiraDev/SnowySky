import { FINAL_CTA, SCENES } from '../../data/scenes'
import './FinalCTA.css'

interface Props {
  onRestart(): void
}

const def = SCENES.find((s) => s.variant === 'final')!

export function FinalCTA({ onRestart }: Props) {
  return (
    <div className="scene scene--final" data-scene={def.id} inert>
      <h2 className="final-title">
        {def.lines?.map((line) => (
          <span className="line" data-line key={line}>
            <span>{line}</span>
          </span>
        ))}
      </h2>

      <p className="final-sub" data-line>
        <span>
          {def.sub?.split('\n').map((part, i) => (
            <span className="final-sub-line" key={i}>
              {part}
            </span>
          ))}
        </span>
      </p>

      <div className="final-actions" data-line>
        <span className="final-actions-row">
          <a className="final-primary" href={FINAL_CTA.primaryHref} data-hover>
            {FINAL_CTA.primaryLabel}
            <span className="final-primary-arrow" aria-hidden="true">
              →
            </span>
          </a>
          <button
            className="final-secondary"
            type="button"
            onClick={onRestart}
            data-hover
          >
            {FINAL_CTA.secondaryLabel}
          </button>
        </span>
      </div>

      <p className="final-foot" data-line>
        <span>{FINAL_CTA.footer}</span>
      </p>
    </div>
  )
}
