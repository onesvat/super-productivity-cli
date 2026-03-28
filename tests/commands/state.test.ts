import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getTaskIds,
  getProjects,
  getCounterIds,
  getTagIds,
  getNoteIds,
} from '../../src/lib/data-helpers.js';
import { createMockSyncData, createFullSyncData, createEmptySyncData } from '../fixtures.js';

const mockConsole = () => {
  const logs: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((s) => logs.push(s));
  return { logs, spy };
};

describe('state commands', () => {
  describe('state summary', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('outputs --json format correctly', () => {
      const { logs, spy } = mockConsole();
      const data = createFullSyncData();

      const taskCount = getTaskIds(data).length;
      const projectCount = Object.keys(getProjects(data)).length;
      const counterCount = getCounterIds(data).length;
      const tagCount = getTagIds(data).length;
      const noteCount = getNoteIds(data).length;
      const plannerDays = data.state?.planner?.days ? Object.keys(data.state.planner.days).length : 0;

      const summary = {
        tasks: taskCount,
        projects: projectCount,
        counters: counterCount,
        tags: tagCount,
        notes: noteCount,
        plannerDays,
      };

      console.log(JSON.stringify(summary, null, 2));

      spy.mockRestore();
      const parsed = JSON.parse(logs.join('\n'));
      expect(parsed.tasks).toBe(4);
      expect(parsed.projects).toBe(2);
      expect(parsed.counters).toBe(2);
      expect(parsed.tags).toBe(2);
      expect(parsed.notes).toBe(2);
      expect(parsed.plannerDays).toBe(1);
    });

    it('handles empty state', () => {
      const { logs, spy } = mockConsole();
      const data = createEmptySyncData();

      const summary = {
        tasks: getTaskIds(data).length,
        projects: Object.keys(getProjects(data)).length,
        counters: getCounterIds(data).length,
        tags: getTagIds(data).length,
        notes: getNoteIds(data).length,
        plannerDays: data.state?.planner?.days ? Object.keys(data.state.planner.days).length : 0,
      };

      console.log(JSON.stringify(summary, null, 2));

      spy.mockRestore();
      const parsed = JSON.parse(logs.join('\n'));
      expect(parsed.tasks).toBe(0);
      expect(parsed.projects).toBe(0);
      expect(parsed.counters).toBe(0);
      expect(parsed.tags).toBe(0);
      expect(parsed.notes).toBe(0);
      expect(parsed.plannerDays).toBe(0);
    });

    it('counts entities correctly', () => {
      const data = createMockSyncData({
        state: {
          task: { ids: ['t1', 't2', 't3'], entities: {} },
          project: { ids: ['p1'], entities: { p1: { id: 'p1', title: 'Project 1' } } },
          tag: { ids: ['tag1', 'tag2'], entities: {} },
          simpleCounter: { ids: ['c1'], entities: {} },
          note: { ids: [], entities: {} },
          planner: { days: { '2024-12-01': [] } },
        },
      } as any);

      expect(getTaskIds(data).length).toBe(3);
      expect(getTagIds(data).length).toBe(2);
      expect(getCounterIds(data).length).toBe(1);
      expect(getNoteIds(data).length).toBe(0);
      expect(Object.keys(data.state.planner?.days || {}).length).toBe(1);
    });
  });
});