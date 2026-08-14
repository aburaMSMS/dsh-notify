import { describe, expect, it } from 'vitest'
import type { SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import { diffSessions, rowsOf, type WatchedRow } from '../src/client/watcher.ts'

const row = (over: Partial<WatchedRow>): WatchedRow => ({
  id: 's1', label: 'demo', running: false, pending: undefined, completed: false, current: false, ...over,
})

describe('rowsOf', () => {
  it('projects list rows into normalized watch rows', () => {
    const state = {
      ids: ['s1', 's2'],
      byId: {
        s1: { id: 's1', displayTitle: 'demo', running: true, completed: false, blank: false, updatedAt: 1 },
        s2: { id: 's2', title: 'named', displayTitle: 'named', running: false, pendingInteraction: 'question', blank: false, updatedAt: 2 },
      },
      current: 's2',
    } as unknown as SessionListState
    expect(rowsOf(state)).toEqual([
      { id: 's1', label: 'demo', running: true, pending: undefined, completed: false, current: false },
      { id: 's2', label: 'named', running: false, pending: 'question', completed: false, current: true },
    ])
  })
})

describe('diffSessions', () => {
  it('stays silent for sessions it has never seen (initial baseline)', () => {
    expect(diffSessions(new Map(), [row({})], true, false)).toEqual([])
  })

  it('emits completion when the completed flag flips', () => {
    const prev = new Map([['s1', row({})]])
    expect(diffSessions(prev, [row({ completed: true })], true, false)).toEqual([
      { kind: 'completion', sessionId: 's1', label: 'demo' },
    ])
  })

  it('emits completion for the current session stopping while the page is inactive', () => {
    const prev = new Map([['s1', row({ running: true, current: true })]])
    expect(diffSessions(prev, [row({ current: true })], false, false)).toEqual([
      { kind: 'completion', sessionId: 's1', label: 'demo' },
    ])
  })

  it('stays silent for the current session stopping while the page is active (user is watching)', () => {
    const prev = new Map([['s1', row({ running: true, current: true })]])
    expect(diffSessions(prev, [row({ current: true })], true, false)).toEqual([])
  })

  it('emits a single completion when completed and running flip together', () => {
    const prev = new Map([['s1', row({ running: true, current: true })]])
    expect(diffSessions(prev, [row({ completed: true, current: true })], false, false)).toEqual([
      { kind: 'completion', sessionId: 's1', label: 'demo' },
    ])
  })

  it('emits start events only when enabled', () => {
    const prev = new Map([['s1', row({})]])
    expect(diffSessions(prev, [row({ running: true })], true, false)).toEqual([])
    expect(diffSessions(prev, [row({ running: true })], true, true)).toEqual([
      { kind: 'start', sessionId: 's1', label: 'demo' },
    ])
  })

  it('emits pending interactions on appearance and on kind switches', () => {
    const prev = new Map([['s1', row({})]])
    expect(diffSessions(prev, [row({ pending: 'approval' })], true, false)).toEqual([
      { kind: 'approval', sessionId: 's1', label: 'demo' },
    ])
    const prevApproval = new Map([['s1', row({ pending: 'approval' })]])
    expect(diffSessions(prevApproval, [row({ pending: 'question' })], true, false)).toEqual([
      { kind: 'question', sessionId: 's1', label: 'demo' },
    ])
    expect(diffSessions(prevApproval, [row({ pending: 'plan-review' })], true, false)).toEqual([
      { kind: 'planReview', sessionId: 's1', label: 'demo' },
    ])
  })

  it('stays silent while a pending interaction persists or resolves', () => {
    const prev = new Map([['s1', row({ pending: 'question' })]])
    expect(diffSessions(prev, [row({ pending: 'question' })], true, false)).toEqual([])
    expect(diffSessions(prev, [row({})], true, false)).toEqual([])
  })
})
