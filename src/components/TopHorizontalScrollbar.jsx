import { useEffect, useRef, useState } from 'react'

const SCROLLABLE_OVERFLOW = new Set(['auto', 'scroll', 'overlay'])

function TopHorizontalScrollbar({ containerRef, position = 'top' }) {
  const trackRef = useRef(null)
  const spacerRef = useRef(null)
  const [hasScrollableContent, setHasScrollableContent] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    const track = trackRef.current
    const spacer = spacerRef.current
    if (!container || !track || !spacer) return undefined

    let activeTarget = null
    let candidates = []
    let syncing = false
    let refreshFrame = 0
    let viewportFrame = 0
    const targetListeners = new Map()

    const positionTopTrack = () => {
      if (position !== 'top') return
      const rect = container.getBoundingClientRect()
      const style = window.getComputedStyle(container)
      const left = Math.max(0, rect.left + parseFloat(style.paddingLeft || 0))
      const width = Math.max(0, Math.min(
        rect.width - parseFloat(style.paddingLeft || 0) - parseFloat(style.paddingRight || 0),
        window.innerWidth - left
      ))
      const header = document.querySelector('.app-shell .header')
      const quickNav = document.querySelector('.app-shell .mobile-priority-nav')
      const headerBottom = header && window.getComputedStyle(header).display !== 'none'
        ? header.getBoundingClientRect().bottom : 0
      const navBottom = quickNav && window.getComputedStyle(quickNav).display !== 'none'
        ? quickNav.getBoundingClientRect().bottom : 0
      track.style.left = `${left}px`
      track.style.width = `${width}px`
      track.style.top = `${Math.max(0, headerBottom, navBottom)}px`
    }

    const syncTrackMetrics = (target) => {
      if (!target || !target.isConnected) return
      const trackWidth = track.clientWidth || container.clientWidth
      const targetOverflow = Math.max(0, target.scrollWidth - target.clientWidth)
      spacer.style.width = `${trackWidth + targetOverflow}px`
      syncing = true
      track.scrollLeft = target.scrollLeft
      requestAnimationFrame(() => { syncing = false })
    }

    const activateTarget = (target) => {
      activeTarget = target
      setHasScrollableContent(Boolean(target))
      requestAnimationFrame(() => syncTrackMetrics(target))
    }

    const focusVisibleTarget = () => {
      if (position !== 'top' || !candidates.length) return
      const railBottom = (parseFloat(track.style.top) || 0) + track.offsetHeight
      const visible = candidates
        .map(target => ({ target, rect: target.getBoundingClientRect() }))
        .filter(({ rect }) => rect.bottom > railBottom && rect.top < window.innerHeight)
        .sort((left, right) =>
          Math.max(0, left.rect.top - railBottom) - Math.max(0, right.rect.top - railBottom))
      if (visible[0] && visible[0].target !== activeTarget) activateTarget(visible[0].target)
    }

    const handleViewportChange = () => {
      if (viewportFrame) cancelAnimationFrame(viewportFrame)
      viewportFrame = requestAnimationFrame(() => {
        viewportFrame = 0
        positionTopTrack()
        focusVisibleTarget()
        if (activeTarget) syncTrackMetrics(activeTarget)
      })
    }

    const handleTrackScroll = () => {
      if (!activeTarget || syncing) return
      syncing = true
      activeTarget.scrollLeft = track.scrollLeft
      requestAnimationFrame(() => { syncing = false })
    }

    const refreshTargets = () => {
      const nextCandidates = []
      const tables = container.querySelectorAll('table, .table-responsive, [class*="table-wrap"], [class*="-scroll"]')

      tables.forEach((table) => {
        if (table.closest('.top-horizontal-scrollbar')) return
        let element = table
        while (element && element !== container) {
          const overflowX = window.getComputedStyle(element).overflowX
          if (
            SCROLLABLE_OVERFLOW.has(overflowX)
            && element.scrollWidth > element.clientWidth + 1
          ) {
            if (!nextCandidates.includes(element)) nextCandidates.push(element)
            break
          }
          element = element.parentElement
        }
      })

      if (
        nextCandidates.length === 0
        && container.scrollWidth > container.clientWidth + 1
      ) {
        nextCandidates.push(container)
      }

      targetListeners.forEach((listeners, target) => {
        if (nextCandidates.includes(target)) return
        target.removeEventListener('scroll', listeners.onScroll)
        target.removeEventListener('pointerenter', listeners.onActivate)
        target.removeEventListener('focusin', listeners.onActivate)
        target.removeEventListener('pointerdown', listeners.onActivate)
        targetListeners.delete(target)
      })

      nextCandidates.forEach((target) => {
        if (targetListeners.has(target)) return
        const onScroll = () => activateTarget(target)
        const onActivate = () => activateTarget(target)
        target.addEventListener('scroll', onScroll, { passive: true })
        target.addEventListener('pointerenter', onActivate)
        target.addEventListener('focusin', onActivate)
        target.addEventListener('pointerdown', onActivate)
        targetListeners.set(target, { onScroll, onActivate })
      })

      candidates = nextCandidates
      positionTopTrack()
      if (!activeTarget || !candidates.includes(activeTarget)) {
        activateTarget(candidates[0] || null)
      } else {
        setHasScrollableContent(true)
        syncTrackMetrics(activeTarget)
      }
      focusVisibleTarget()

      resizeObserver.disconnect()
      resizeObserver.observe(container)
      candidates.forEach((target) => {
        resizeObserver.observe(target)
        const table = target.querySelector('table')
        if (table) resizeObserver.observe(table)
      })
    }

    const scheduleRefresh = () => {
      if (refreshFrame) cancelAnimationFrame(refreshFrame)
      refreshFrame = requestAnimationFrame(refreshTargets)
    }

    const resizeObserver = new ResizeObserver(() => {
      if (activeTarget) handleViewportChange()
      else scheduleRefresh()
    })
    const mutationObserver = new MutationObserver((records) => {
      if (records.some((record) => !record.target.closest?.('.top-horizontal-scrollbar'))) scheduleRefresh()
    })

    track.addEventListener('scroll', handleTrackScroll, { passive: true })
    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    })
    window.addEventListener('resize', scheduleRefresh)
    window.addEventListener('scroll', handleViewportChange, { passive: true })
    container.addEventListener('scroll', handleViewportChange, { passive: true })
    refreshTargets()

    return () => {
      track.removeEventListener('scroll', handleTrackScroll)
      mutationObserver.disconnect()
      resizeObserver.disconnect()
      window.removeEventListener('resize', scheduleRefresh)
      window.removeEventListener('scroll', handleViewportChange)
      container.removeEventListener('scroll', handleViewportChange)
      if (refreshFrame) cancelAnimationFrame(refreshFrame)
      if (viewportFrame) cancelAnimationFrame(viewportFrame)
      targetListeners.forEach((listeners, target) => {
        target.removeEventListener('scroll', listeners.onScroll)
        target.removeEventListener('pointerenter', listeners.onActivate)
        target.removeEventListener('focusin', listeners.onActivate)
        target.removeEventListener('pointerdown', listeners.onActivate)
      })
    }
  }, [containerRef, position])

  return (
    <div
      ref={trackRef}
      className={`top-horizontal-scrollbar top-horizontal-scrollbar--${position}`}
      data-visible={hasScrollableContent}
      role="region"
      aria-label={`Thanh cuộn ngang bảng phía ${position === 'bottom' ? 'dưới' : 'trên'}`}
      tabIndex={hasScrollableContent ? 0 : -1}
    >
      <div ref={spacerRef} className="top-horizontal-scrollbar__spacer" />
    </div>
  )
}

export default TopHorizontalScrollbar
