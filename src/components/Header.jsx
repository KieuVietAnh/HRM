function Header({ menuOpen = false, onMenuToggle }) {
  return (
    <header className="header">
      <button
        type="button"
        className={`header-menu-btn${menuOpen ? ' is-open' : ''}`}
        onClick={onMenuToggle}
        aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'}
        aria-expanded={menuOpen}
      >
        <i className={`fas ${menuOpen ? 'fa-times' : 'fa-bars'}`}></i>
      </button>
    </header>
  )
}

export default Header
