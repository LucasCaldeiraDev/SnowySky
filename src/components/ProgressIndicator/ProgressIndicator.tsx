import './ProgressIndicator.css'

/**
 * Thin 0 → 100% line, bottom-right. On small screens a compact altitude
 * readout appears bottom-left (the header hides its own).
 */
export function ProgressIndicator() {
  return (
    <>
      <p className="progress-alt" data-chrome>
        <span data-alt-value>ALT. 3,840 M</span>
      </p>
      <div className="progress" data-chrome aria-hidden="true">
        <span className="progress-track">
          <span className="progress-fill" data-progress-fill />
        </span>
      </div>
    </>
  )
}
