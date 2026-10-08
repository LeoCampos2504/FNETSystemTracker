/** FNET mark: the "f" of the logo in white over the company blue, with the green orbit of the original ellipse behind it. */
export function BrandMark({ size = 32 }: { size?: number }) {
  return <svg className="brand-mark" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
    <rect width="40" height="40" rx="11" fill="#1E4FC2" />
    <ellipse cx="20" cy="22" rx="15.5" ry="6.2" transform="rotate(-16 20 22)" fill="none" stroke="#5CCB6F" strokeWidth="2" />
    <g transform="translate(2.4 0) skewX(-8)" fill="none" strokeLinecap="round">
      <g stroke="#1E4FC2" strokeWidth="7.4"><path d="M18.6 31V16.4c0-4.2 2.2-6.6 6.4-6.6" /><path d="M13.6 17.8h10.6" /></g>
      <g stroke="#fff" strokeWidth="4"><path d="M18.6 31V16.4c0-4.2 2.2-6.6 6.4-6.6" /><path d="M13.6 17.8h10.6" /></g>
    </g>
  </svg>;
}

/** Mark plus the "fnet tracker" wordmark; `large` is the login version. */
export function BrandLockup({ large = false, collapsible = false }: { large?: boolean; collapsible?: boolean }) {
  return <div className={"brand-lockup" + (large ? " large" : "")} aria-label="FNET Tracker">
    <BrandMark size={large ? 42 : 32} />
    <span className={collapsible ? "brand-name" : undefined}><strong>fnet</strong> <span>tracker</span></span>
  </div>;
}
