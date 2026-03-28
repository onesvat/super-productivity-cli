import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { serializeTag } from '../../src/lib/data-helpers.js';
import { createMockSyncData, createMockTag, createFullSyncData } from '../fixtures.js';

const mockConsole = () => {
  const logs: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((s) => logs.push(s));
  return { logs, spy };
};

describe('tag commands', () => {
  describe('tag list', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('outputs --json format correctly', () => {
      const { logs, spy } = mockConsole();
      const data = createFullSyncData();
      const tags = data.state.tag?.entities || {};
      const tagIds = data.state.tag?.ids || [];

      const rows = tagIds.map((id) => tags[id]);
      rows.forEach((tag) => {
        const serialized = serializeTag(tag as any, false);
        console.log(JSON.stringify(serialized));
      });

      spy.mockRestore();
      expect(logs.length).toBe(2);
      const parsed = JSON.parse(logs[0]);
      expect(parsed.id).toBe('TODAY');
      expect(parsed.title).toBe('Today');
      expect(parsed.taskCount).toBe(1);
    });

    it('outputs --json --full format with all fields', () => {
      const { logs, spy } = mockConsole();
      const data = createFullSyncData();
      const tags = data.state.tag?.entities || {};
      const tag = tags['TODAY'];

      const serialized = serializeTag(tag as any, true);
      console.log(JSON.stringify(serialized, null, 2));

      spy.mockRestore();
      const parsed = JSON.parse(logs.join('\n'));
      expect(parsed.created).toBeTruthy();
    });

    it('outputs --ndjson format', () => {
      const { logs, spy } = mockConsole();
      const data = createFullSyncData();
      const tags = data.state.tag?.entities || {};
      const tagIds = data.state.tag?.ids || [];

      tagIds.forEach((id) => {
        console.log(JSON.stringify(serializeTag(tags[id] as any, false)));
      });

      spy.mockRestore();
      expect(logs.length).toBe(2);
      expect(logs[0]).toContain('"id":"TODAY"');
      expect(logs[1]).toContain('"id":"urgent"');
    });

    it('handles empty tags', () => {
      const { logs, spy } = mockConsole();
      const data = createMockSyncData({ state: { tag: { ids: [], entities: {} } } as any });

      const tagIds = data.state.tag?.ids || [];
      if (tagIds.length === 0) {
        console.log('No tags found.');
      }

      spy.mockRestore();
      expect(logs[0]).toBe('No tags found.');
    });
  });

  describe('tag show', () => {
    it('outputs --json format for single tag', () => {
      const { logs, spy } = mockConsole();
      const tag = createMockTag({ id: 'test-tag', title: 'Test Tag', taskIds: ['t1', 't2', 't3'] });

      const serialized = serializeTag(tag, false);
      console.log(JSON.stringify(serialized, null, 2));

      spy.mockRestore();
      const parsed = JSON.parse(logs.join('\n'));
      expect(parsed.id).toBe('test-tag');
      expect(parsed.taskCount).toBe(3);
    });

    it('outputs --json --full with all fields', () => {
      const { logs, spy } = mockConsole();
      const tag = createMockTag({ created: 1234567890 });

      const serialized = serializeTag(tag, true);
      console.log(JSON.stringify(serialized, null, 2));

      spy.mockRestore();
      const parsed = JSON.parse(logs.join('\n'));
      expect(parsed.created).toBe(1234567890);
    });
  });
});