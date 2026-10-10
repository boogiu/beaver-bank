import { useSyncExternalStore } from 'react'

const preference = window.matchMedia('(prefers-reduced-motion: reduce)')

export function getReducedMotion(): boolean {
  return preference.matches
}

function subscribe(onChange: () => void): () => void {
  preference.addEventListener('change', onChange)
  return () => preference.removeEventListener('change', onChange)
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getReducedMotion)
}
