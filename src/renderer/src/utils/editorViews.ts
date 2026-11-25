/**
 * Two-view (Notepad++ main/sub) bookkeeping for the editor store. Pure — no
 * React, Monaco or zustand — so the rules are unit-tested on their own.
 *
 * A buffer lives in the main view, the sub view, or both (a clone: one buffer,
 * one model, two editors). `activeId` stays the single "buffer you are working
 * in" for every consumer: it is always the focused view's active buffer.
 */

export type ViewName = 'main' | 'sub'
export type ViewMembership = 'main' | 'sub' | 'both'

export interface ViewBuffer {
  id: string
  kind: string
  view: ViewMembership
}

export interface ViewFields {
  activeId: string | null
  mainActiveId: string | null
  subActiveId: string | null
  focusedView: ViewName
}

export type ViewState<B extends ViewBuffer> = ViewFields & { buffers: B[] }

export const otherView = (v: ViewName): ViewName => (v === 'main' ? 'sub' : 'main')

export const inView = (b: ViewBuffer, v: ViewName): boolean => b.view === 'both' || b.view === v

export const idsInView = (buffers: ViewBuffer[], v: ViewName): string[] =>
  buffers.filter((b) => inView(b, v)).map((b) => b.id)

/** Only real file buffers (with a Monaco model) can go to the sub view. */
export const canUseSubView = (b: ViewBuffer): boolean => b.kind === 'file'

const activeKey = (v: ViewName): 'mainActiveId' | 'subActiveId' =>
  v === 'main' ? 'mainActiveId' : 'subActiveId'

/** Pick a replacement for a view's active id that left the view: nearest tab to the left, else the first. */
function fallback(prevIds: string[], ids: string[], lost: string | null): string | null {
  const at = lost ? prevIds.indexOf(lost) : -1
  for (let i = at - 1; i >= 0; i--) if (ids.includes(prevIds[i])) return prevIds[i]
  return ids[0] ?? null
}

/**
 * Bring a store update back to a consistent two-view state. `prev` is the state
 * before the update, `next` the state the action produced.
 *
 * - An explicit `activeId` change activates that buffer in its view and moves
 *   focus there (for a clone: in the focused view).
 * - Each view's active id stays inside the view (left-neighbour fallback).
 * - An empty main view pulls everything back into main; focus never sits on an
 *   empty view.
 * - `activeId` is recomputed as the focused view's active buffer.
 */
export function normalizeViews<B extends ViewBuffer>(prev: ViewState<B>, next: ViewState<B>): ViewState<B> {
  let buffers = next.buffers
  if (buffers.length > 0 && !buffers.some((b) => inView(b, 'main'))) {
    buffers = buffers.map((b) => (b.view === 'main' ? b : { ...b, view: 'main' as const }))
  }

  const out: ViewFields = {
    activeId: next.activeId,
    mainActiveId: next.mainActiveId,
    subActiveId: next.subActiveId,
    focusedView: next.focusedView
  }

  if (next.activeId && next.activeId !== prev.activeId) {
    const b = buffers.find((x) => x.id === next.activeId)
    if (b) {
      const v: ViewName = b.view === 'both' ? out.focusedView : b.view
      out[activeKey(v)] = b.id
      out.focusedView = v
    }
  }

  for (const v of ['main', 'sub'] as const) {
    const ids = idsInView(buffers, v)
    const key = activeKey(v)
    if (!out[key] || !ids.includes(out[key] as string)) {
      out[key] = fallback(idsInView(prev.buffers, v), ids, out[key])
    }
  }

  if (!out[activeKey(out.focusedView)]) out.focusedView = otherView(out.focusedView)
  if (!out[activeKey(out.focusedView)]) out.focusedView = 'main'
  out.activeId = out[activeKey(out.focusedView)]

  return { ...next, buffers, ...out }
}

const setView = <B extends ViewBuffer>(buffers: B[], id: string, view: ViewMembership): B[] =>
  buffers.map((b) => (b.id === id ? { ...b, view } : b))

/** Show `id` in the other view as well (clone) and focus it there. */
export function cloneToOtherView<B extends ViewBuffer>(s: ViewState<B>, id: string, from: ViewName): Partial<ViewState<B>> {
  const b = s.buffers.find((x) => x.id === id)
  if (!b || !canUseSubView(b)) return {}
  const to = otherView(from)
  return { buffers: setView(s.buffers, id, 'both'), [activeKey(to)]: id, focusedView: to }
}

/** Move `id` out of `from` into the other view and focus it there. */
export function moveToOtherView<B extends ViewBuffer>(s: ViewState<B>, id: string, from: ViewName): Partial<ViewState<B>> {
  const b = s.buffers.find((x) => x.id === id)
  if (!b || !canUseSubView(b)) return {}
  const to = otherView(from)
  return { buffers: setView(s.buffers, id, to), [activeKey(to)]: id, focusedView: to }
}

/** Close a clone in one view only. Returns null when `id` is not a clone (caller closes the buffer). */
export function closeCloneInView<B extends ViewBuffer>(s: ViewState<B>, id: string, view: ViewName): Partial<ViewState<B>> | null {
  const b = s.buffers.find((x) => x.id === id)
  if (!b || b.view !== 'both') return null
  return { buffers: setView(s.buffers, id, otherView(view)), focusedView: view }
}

/** Put every buffer back in the main view. */
export function collapseSubView<B extends ViewBuffer>(s: ViewState<B>): Partial<ViewState<B>> {
  return {
    buffers: s.buffers.map((b) => (b.view === 'main' ? b : { ...b, view: 'main' as const })),
    focusedView: 'main'
  }
}
