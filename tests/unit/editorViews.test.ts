import { describe, it, expect } from 'vitest'
import {
  normalizeViews, cloneToOtherView, moveToOtherView, closeCloneInView, collapseSubView,
  idsInView, type ViewBuffer, type ViewState
} from '../../src/renderer/src/utils/editorViews'

const buf = (id: string, view: ViewBuffer['view'] = 'main', kind = 'file'): ViewBuffer => ({ id, view, kind })

function state(buffers: ViewBuffer[], over: Partial<ViewState<ViewBuffer>> = {}): ViewState<ViewBuffer> {
  return normalizeViews(
    { buffers: [], activeId: null, mainActiveId: null, subActiveId: null, focusedView: 'main' },
    { buffers, activeId: null, mainActiveId: null, subActiveId: null, focusedView: 'main', ...over }
  )
}
const apply = (s: ViewState<ViewBuffer>, patch: Partial<ViewState<ViewBuffer>>) => normalizeViews(s, { ...s, ...patch })

describe('normalizeViews', () => {
  it('with one view behaves like a single tab bar', () => {
    let s = state([buf('a'), buf('b'), buf('c')], { activeId: 'b' })
    expect(s).toMatchObject({ activeId: 'b', mainActiveId: 'b', subActiveId: null, focusedView: 'main' })
    // Removing the active tab falls back to its left neighbour, then to the first.
    s = apply(s, { buffers: s.buffers.filter((b) => b.id !== 'b') })
    expect(s.activeId).toBe('a')
    s = apply(s, { buffers: s.buffers.filter((b) => b.id !== 'a') })
    expect(s.activeId).toBe('c')
  })

  it('activating a buffer focuses the view it lives in', () => {
    let s = state([buf('a'), buf('b', 'sub')], { activeId: 'a' })
    expect(s.subActiveId).toBe('b')
    s = apply(s, { activeId: 'b' })
    expect(s).toMatchObject({ focusedView: 'sub', activeId: 'b', mainActiveId: 'a' })
  })

  it('activating a clone keeps the focused view', () => {
    let s = state([buf('a'), buf('c', 'both'), buf('b', 'sub')], { activeId: 'b' })
    s = apply(s, { focusedView: 'sub', subActiveId: 'b' })
    s = apply(s, { activeId: 'c' })
    expect(s).toMatchObject({ focusedView: 'sub', subActiveId: 'c', mainActiveId: 'a' })
  })

  it('closing the last sub tab moves focus to main', () => {
    let s = state([buf('a'), buf('b', 'sub')], { activeId: 'b' })
    expect(s.focusedView).toBe('sub')
    s = apply(s, { buffers: [s.buffers[0]] })
    expect(s).toMatchObject({ focusedView: 'main', activeId: 'a', subActiveId: null })
  })

  it('an empty main view pulls the sub view back into main', () => {
    let s = state([buf('a'), buf('b', 'sub')], { activeId: 'a' })
    s = apply(s, { buffers: [s.buffers[1]] })
    expect(s.buffers[0].view).toBe('main')
    expect(s).toMatchObject({ activeId: 'b', mainActiveId: 'b', subActiveId: null, focusedView: 'main' })
  })
})

describe('view actions', () => {
  it('clone shows the buffer in both views and focuses the other one', () => {
    let s = state([buf('a'), buf('b')], { activeId: 'a' })
    s = apply(s, cloneToOtherView(s, 'a', 'main'))
    expect(idsInView(s.buffers, 'main')).toEqual(['a', 'b'])
    expect(idsInView(s.buffers, 'sub')).toEqual(['a'])
    expect(s).toMatchObject({ focusedView: 'sub', activeId: 'a', mainActiveId: 'a', subActiveId: 'a' })
  })

  it('move takes the buffer out of its view', () => {
    let s = state([buf('a'), buf('b')], { activeId: 'b' })
    s = apply(s, moveToOtherView(s, 'b', 'main'))
    expect(idsInView(s.buffers, 'main')).toEqual(['a'])
    expect(idsInView(s.buffers, 'sub')).toEqual(['b'])
    expect(s).toMatchObject({ focusedView: 'sub', activeId: 'b', mainActiveId: 'a' })
    // ...and back again; the sub view is then empty.
    s = apply(s, moveToOtherView(s, 'b', 'sub'))
    expect(idsInView(s.buffers, 'sub')).toEqual([])
    expect(s).toMatchObject({ focusedView: 'main', activeId: 'b' })
  })

  it('moving a clone leaves it only in the other view', () => {
    let s = state([buf('a'), buf('b', 'both')], { activeId: 'a' })
    s = apply(s, moveToOtherView(s, 'b', 'main'))
    expect(s.buffers.find((b) => b.id === 'b')?.view).toBe('sub')
  })

  it('virtual tabs never go to the sub view', () => {
    const s = state([buf('a'), buf('set', 'main', 'settings')], { activeId: 'set' })
    expect(cloneToOtherView(s, 'set', 'main')).toEqual({})
    expect(moveToOtherView(s, 'set', 'main')).toEqual({})
  })

  it('closing a clone in one view keeps it in the other', () => {
    let s = state([buf('a'), buf('b', 'both')], { activeId: 'b' })
    s = apply(s, { focusedView: 'sub', subActiveId: 'b' })
    expect(closeCloneInView(s, 'a', 'main')).toBeNull() // not a clone: caller closes the buffer
    s = apply(s, closeCloneInView(s, 'b', 'sub')!)
    expect(s.buffers.find((b) => b.id === 'b')?.view).toBe('main')
    expect(s).toMatchObject({ focusedView: 'main', activeId: 'b' })
  })

  it('collapse puts everything back in main', () => {
    let s = state([buf('a'), buf('b', 'sub'), buf('c', 'both')], { activeId: 'b' })
    s = apply(s, collapseSubView(s))
    expect(s.buffers.every((b) => b.view === 'main')).toBe(true)
    expect(s).toMatchObject({ focusedView: 'main', subActiveId: null })
  })
})
