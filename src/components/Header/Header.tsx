import './Header.css'

interface Props {
  onExplore(): void
}

export function Header({ onExplore }: Props) {
  return (
    <header className="header" data-header>
      <a className="header-brand" href="/" data-hover aria-label="Immersive — back to start">
        <svg className="header-mark" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4 17 L11 6.5 L15 12 L18.2 8.2 L20 17"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </svg>
        <span className="header-word">IMMERSIVE</span>
      </a>

      <p className="header-alt">
        <span data-alt-value>ALT. 3,840 M</span>
        <span className="header-alt-sep" aria-hidden="true">
          —
        </span>
        <span data-alt-label>THE PEAKS</span>
      </p>

      <button className="header-cta" type="button" onClick={onExplore} data-hover>
        EXPLORE
      </button>
    </header>
  )
}
