import { describe, it, expect } from 'vitest';
import {
  getTasks,
  getTaskIds,
  getProjects,
  getTags,
  getTagIds,
  getCounters,
  getCounterIds,
  getNotes,
  getNoteIds,
  serializeCounter,
  serializeTag,
  serializeNote,
  todayStr,
} from '../../src/lib/data-helpers.js';
import { createMockSyncData, createMockCounter, createMockTag, createMockNote, createEmptySyncData } from '../fixtures.js';

describe('data-helpers', () => {
  describe('getTasks/getTaskIds', () => {
    it('returns empty when no tasks', () => {
      const data = createEmptySyncData();
      expect(getTasks(data)).toEqual({});
      expect(getTaskIds(data)).toEqual([]);
    });

    it('returns task entities and ids', () => {
      const data = createMockSyncData({
        state: {
          task: {
            ids: ['t1', 't2'],
            entities: {
              t1: { id: 't1', title: 'Task 1' },
              t2: { id: 't2', title: 'Task 2' },
            },
          },
        },
      } as any);
      expect(getTaskIds(data)).toEqual(['t1', 't2']);
      expect(getTasks(data)['t1']).toBeTruthy();
    });
  });

  describe('getProjects', () => {
    it('returns empty when no projects', () => {
      const data = createEmptySyncData();
      expect(getProjects(data)).toEqual({});
    });

    it('returns project entities', () => {
      const data = createMockSyncData();
      const projects = getProjects(data);
      expect(projects['INBOX_PROJECT']).toBeTruthy();
    });
  });

  describe('getTags/getTagIds', () => {
    it('returns empty when no tags', () => {
      const data = createEmptySyncData();
      expect(getTags(data)).toEqual({});
      expect(getTagIds(data)).toEqual([]);
    });

    it('returns tag entities and ids', () => {
      const data = createMockSyncData();
      expect(getTagIds(data)).toContain('TODAY');
    });
  });

  describe('getCounters/getCounterIds', () => {
    it('returns empty when no counters', () => {
      const data = createEmptySyncData();
      expect(getCounters(data)).toEqual({});
      expect(getCounterIds(data)).toEqual([]);
    });

    it('returns counter entities', () => {
      const data = createMockSyncData({
        state: {
          simpleCounter: {
            ids: ['c1'],
            entities: { c1: createMockCounter({ id: 'c1' }) },
          },
        },
      } as any);
      expect(getCounterIds(data)).toEqual(['c1']);
      expect(getCounters(data)['c1']).toBeTruthy();
    });
  });

  describe('getNotes/getNoteIds', () => {
    it('returns empty when no notes', () => {
      const data = createEmptySyncData();
      expect(getNotes(data)).toEqual({});
      expect(getNoteIds(data)).toEqual([]);
    });

    it('returns note entities', () => {
      const data = createMockSyncData({
        state: {
          note: {
            ids: ['n1'],
            entities: { n1: createMockNote({ id: 'n1' }) },
          },
        },
      } as any);
      expect(getNoteIds(data)).toEqual(['n1']);
      expect(getNotes(data)['n1']).toBeTruthy();
    });
  });

  describe('serializeCounter', () => {
    const today = todayStr();

    it('returns summary format by default', () => {
      const counter = createMockCounter({ countOnDay: { [today]: 5 } });
      const result = serializeCounter(counter, false);
      expect(result.id).toBe('counter-1');
      expect(result.title).toBe('Reading');
      expect(result.todayValue).toBe(5);
      expect(result.countOnDay).toBeUndefined();
    });

    it('returns full format with full=true', () => {
      const counter = createMockCounter({ countOnDay: { [today]: 5, '2024-11-30': 3 } });
      const result = serializeCounter(counter, true);
      expect(result.countOnDay).toEqual({ [today]: 5, '2024-11-30': 3 });
      expect(result.created).toBeTruthy();
    });

    it('calculates todayValue from countOnDay', () => {
      const counter = createMockCounter({ countOnDay: {} });
      const result = serializeCounter(counter, false);
      expect(result.todayValue).toBe(0);
    });
  });

  describe('serializeTag', () => {
    it('returns summary format by default', () => {
      const tag = createMockTag({ taskIds: ['t1', 't2', 't3'] });
      const result = serializeTag(tag, false);
      expect(result.id).toBe('tag-1');
      expect(result.title).toBe('Test Tag');
      expect(result.taskCount).toBe(3);
      expect(result.created).toBeUndefined();
    });

    it('returns full format with full=true', () => {
      const tag = createMockTag({ created: 1234567890 });
      const result = serializeTag(tag, true);
      expect(result.created).toBe(1234567890);
    });
  });

  describe('serializeNote', () => {
    it('returns summary format by default', () => {
      const note = createMockNote({ content: 'Long content that should be truncated...' });
      const result = serializeNote(note, false);
      expect(result.id).toBe('note-1');
      expect(result.content?.length).toBeLessThanOrEqual(80);
      expect(result.created).toBeUndefined();
    });

    it('returns full format with full=true', () => {
      const note = createMockNote({ content: 'Full content here', created: 1234567890 });
      const result = serializeNote(note, true);
      expect(result.content).toBe('Full content here');
      expect(result.created).toBe(1234567890);
    });

    it('handles empty content', () => {
      const note = createMockNote({ content: '' });
      const result = serializeNote(note, false);
      expect(result.content).toBe('');
    });
  });
});