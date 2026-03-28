import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { serializeTask, getTaskIds, getTasks, matchesQuery } from '../../src/lib/data-helpers.js';
import { createMockSyncData, createMockTask, createFullSyncData, createEmptySyncData } from '../fixtures.js';

const mockConsole = () => {
  const logs: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((s) => logs.push(s));
  return { logs, spy };
};

describe('task commands', () => {
  describe('task list', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('outputs --json format correctly', () => {
      const { logs, spy } = mockConsole();
      const data = createFullSyncData();
      const tasks = getTasks(data) as Record<string, Record<string, unknown>>;
      const taskIds = getTaskIds(data);

      const rows = taskIds
        .filter((id) => !tasks[id]?.parentId)
        .map((id) => tasks[id]);

      console.log(JSON.stringify(rows.map((t) => serializeTask(data, t)), null, 2));

      spy.mockRestore();
      const parsed = JSON.parse(logs.join('\n'));
      expect(parsed.length).toBe(3); // task-1, task-2, task-3 (not subtask)
      expect(parsed[0].id).toBe('task-1');
    });

    it('outputs --ndjson format', () => {
      const { logs, spy } = mockConsole();
      const data = createFullSyncData();
      const tasks = getTasks(data) as Record<string, Record<string, unknown>>;
      const taskIds = getTaskIds(data);

      taskIds
        .filter((id) => !tasks[id]?.parentId)
        .forEach((id) => {
          console.log(JSON.stringify(serializeTask(data, tasks[id])));
        });

      spy.mockRestore();
      expect(logs.length).toBe(3);
      expect(logs[0]).toContain('"id":"task-1"');
    });

    it('outputs --json --full with all fields', () => {
      const { logs, spy } = mockConsole();
      const data = createFullSyncData();
      const tasks = getTasks(data) as Record<string, Record<string, unknown>>;
      const task = tasks['task-1'];

      console.log(JSON.stringify(task, null, 2));

      spy.mockRestore();
      const parsed = JSON.parse(logs.join('\n'));
      expect(parsed.subTaskIds).toEqual(['task-1-sub']);
      expect(parsed.created).toBeTruthy();
    });

    it('handles empty tasks', () => {
      const { logs, spy } = mockConsole();
      const data = createEmptySyncData();

      const taskIds = getTaskIds(data);
      if (taskIds.length === 0) {
        console.log('No tasks found.');
      }

      spy.mockRestore();
      expect(logs[0]).toBe('No tasks found.');
    });
  });

  describe('task search', () => {
    it('matches simple query', () => {
      expect(matchesQuery('Active Task 1', 'active')).toBe(true);
      expect(matchesQuery('Active Task 1', 'task')).toBe(true);
      expect(matchesQuery('Active Task 1', 'done')).toBe(false);
    });

    it('matches wildcard query', () => {
      expect(matchesQuery('Active Task 1', 'Active*')).toBe(true);
      expect(matchesQuery('Active Task 1', '*Task*')).toBe(true);
      expect(matchesQuery('Done Task', '*done*')).toBe(true);
    });

    it('is case insensitive', () => {
      expect(matchesQuery('ACTIVE TASK', 'active')).toBe(true);
      expect(matchesQuery('active task', 'ACTIVE')).toBe(true);
    });

    it('searches and outputs matching tasks', () => {
      const { logs, spy } = mockConsole();
      const data = createFullSyncData();
      const tasks = getTasks(data) as Record<string, Record<string, unknown>>;
      const taskIds = getTaskIds(data);
      const query = 'Today';

      const matching = taskIds.filter((id) => matchesQuery(tasks[id]?.title as string || '', query));
      matching.forEach((id) => {
        console.log(JSON.stringify(serializeTask(data, tasks[id])));
      });

      spy.mockRestore();
      expect(logs.length).toBe(1);
      expect(logs[0]).toContain('Today Task');
    });
  });

  describe('serializeTask', () => {
    it('returns expected fields', () => {
      const data = createMockSyncData();
      const task = createMockTask({ id: 'test', title: 'Test', projectId: 'INBOX_PROJECT' });
      const serialized = serializeTask(data, task);

      expect(serialized.id).toBe('test');
      expect(serialized.title).toBe('Test');
      expect(serialized.projectId).toBe('INBOX_PROJECT');
      expect(serialized.timeEstimate).toBe(3600000);
    });
  });
});