import { useEffect, useState } from 'react'

type ScrollFadeOptions = {
  axis?: 'x' | 'y'
  fadeStart?: boolean
}

// Pair with the `scroll-fade-x` / `scroll-fade-y` utilities. Edges only fade while more content
// lies in that direction. Attributes are set directly so scrolling never re-renders.
export function useScrollFade<TElement extends HTMLElement>({ axis = 'y', fadeStart = true }: ScrollFadeOptions = {}) {
  const [element, setElement] = useState<TElement | null>(null)

  useEffect(() => {
    if (!element) return

    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const position = axis === 'y' ? element.scrollTop : element.scrollLeft
        const maxPosition =
          axis === 'y' ? element.scrollHeight - element.clientHeight : element.scrollWidth - element.clientWidth
        element.toggleAttribute('data-fade-start', fadeStart && position > 1)
        element.toggleAttribute('data-fade-end', position < maxPosition - 1)
      })
    }

    const resizeObserver = new ResizeObserver(update)
    const observeChildren = () => {
      resizeObserver.disconnect()
      resizeObserver.observe(element)
      for (const child of element.children) resizeObserver.observe(child)
      update()
    }
    const mutationObserver = new MutationObserver(observeChildren)

    observeChildren()
    mutationObserver.observe(element, { childList: true })
    element.addEventListener('scroll', update, { passive: true })

    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      element.removeEventListener('scroll', update)
    }
  }, [element, axis, fadeStart])

  return setElement
}
