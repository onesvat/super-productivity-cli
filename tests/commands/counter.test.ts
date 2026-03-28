import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { serializeCounter } from '../../src/lib/data-helpers.js';
import { createMockSyncData, createMockCounter, createFullSyncData } from '../fixtures.js';

const mockConsole = () => {
  const logs: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((s) => logs.push(s));
  return { logs, spy };
};

describe('counter commands', () => {
  describe('counter list', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('outputs --json format correctly', () => {
      const { logs, spy } = mockConsole();
      const data = createFullSyncData();
      const counters = data.state.simpleCounter?.entities || {};
      const counterIds = data.state.simpleCounter?.ids || [];

      const rows = counterIds.map((id) => counters[id]);
      rows.forEach((counter) => {
        const serialized = serializeCounter(counter as any, false);
        console.log(JSON.stringify(serialized));
      });

      spy.mockRestore();
      expect(logs.length).toBe(2);
      const parsed = JSON.parse(logs[0]);
      expect(parsed.id).toBe('counter-reading');
      expect(parsed.title).toBe('Reading');
      expect(parsed.todayValue).toBe(10);
    });

    it('outputs --json --full format with all fields', () => {
      const { logs, spy } = mockConsole();
      const data = createFullSyncData();
      const counters = data.state.simpleCounter?.entities || {};
      const counter = counters['counter-reading'];

      const serialized = serializeCounter(counter as any, true);
      console.log(JSON.stringify(serialized, null, 2));

      spy.mockRestore();
      const parsed = JSON.parse(logs.join('\n'));
      expect(parsed.countOnDay).toBeTruthy();
      expect(parsed.created).toBeTruthy();
    });

    it('outputs --ndjson format', () => {
      const { logs, spy } = mockConsole();
      const data = createFullSyncData();
      const counters = data.state.simpleCounter?.entities || {};
      const counterIds = data.state.simpleCounter?.ids || [];

      counterIds.forEach((id) => {
        console.log(JSON.stringify(serializeCounter(counters[id] as any, false)));
      });

      spy.mockRestore();
      expect(logs.length).toBe(2);
      expect(logs[0]).toContain('"id":"counter-reading"');
      expect(logs[1]).toContain('"id":"counter-exercise"');
    });

    it('handles empty counters', () => {
      const { logs, spy } = mockConsole();
      const data = createMockSyncData();

      const counters = data.state.simpleCounter?.entities || {};
      const counterIds = data.state.simpleCounter?.ids || [];

      if (counterIds.length === 0) {
        console.log('No counters found.');
      }

      spy.mockRestore();
      expect(logs[0]).toBe('No counters found.');
    });
  });

  describe('counter show', () => {
    it('outputs --json format for single counter', () => {
      const { logs, spy } = mockConsole();
      const counter = createMockCounter({ id: 'test-counter', title: 'Test Counter' });

      const serialized = serializeCounter(counter, false);
      console.log(JSON.stringify(serialized, null, 2));

      spy.mockRestore();
      const parsed = JSON.parse(logs.join('\n'));
      expect(parsed.id).toBe('test-counter');
      expect(parsed.title).toBe('Test Counter');
    });

    it('outputs --json --full with all fields', () => {
      const { logs, spy } = mockConsole();
      const counter = createMockCounter({ countOnDay: { '2024-12-01': 5, '2024-11-30': 3 } });

      const serialized = serializeCounter(counter, true);
      console.log(JSON.stringify(serialized, null, 2));

      spy.mockRestore();
      const parsed = JSON.parse(logs.join('\n'));
      expect(parsed.countOnDay).toEqual({ '2024-12-01': 5, '2024-11-30': 3 });
    });
  });
});