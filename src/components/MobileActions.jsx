import { useEffect, useId, useState } from 'react'

// Presentation wrapper only; desktop receives the original buttons unchanged.
export default function MobileActions({ children, label = 'Thao tác khác' }) {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches)
  const [open, setOpen] = useState(false)
  const id = useId()
  useEffect(() => {
    const query = window.matchMedia('(max-width: 768px)')
    const update = () => { setMobile(query.matches); setOpen(false) }
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  if (!mobile) return children
  return <div className="mobile-actions" onKeyDown={event => {
    if (event.key === 'Escape') { setOpen(false); event.currentTarget.querySelector('button')?.focus() }
  }}>
    <button type="button" className="mobile-actions__toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <i className="fas fa-ellipsis-h" aria-hidden="true" /> {label}
    </button>
    {open && <div id={id} className="mobile-actions__panel" onClick={event => {
      if (event.target.closest('button')) setOpen(false)
    }}>{children}</div>}
  </div>
}
