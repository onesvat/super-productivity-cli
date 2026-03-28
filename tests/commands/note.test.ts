import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { serializeNote } from '../../src/lib/data-helpers.js';
import { createMockSyncData, createMockNote, createFullSyncData } from '../fixtures.js';

const mockConsole = () => {
  const logs: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((s) => logs.push(s));
  return { logs, spy };
};

describe('note commands', () => {
  describe('note list', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('outputs --json format correctly', () => {
      const { logs, spy } = mockConsole();
      const data = createFullSyncData();
      const notes = data.state.note?.entities || {};
      const noteIds = data.state.note?.ids || [];

      const rows = noteIds.map((id) => notes[id]);
      rows.forEach((note) => {
        const serialized = serializeNote(note as any, false);
        console.log(JSON.stringify(serialized));
      });

      spy.mockRestore();
      expect(logs.length).toBe(2);
      const parsed = JSON.parse(logs[0]);
      expect(parsed.id).toBe('note-meeting');
      expect(parsed.content?.length).toBeLessThanOrEqual(80);
    });

    it('outputs --json --full format with all fields', () => {
      const { logs, spy } = mockConsole();
      const data = createFullSyncData();
      const notes = data.state.note?.entities || {};
      const note = notes['note-meeting'];

      const serialized = serializeNote(note as any, true);
      console.log(JSON.stringify(serialized, null, 2));

      spy.mockRestore();
      const parsed = JSON.parse(logs.join('\n'));
      expect(parsed.content).toContain('Meeting notes from yesterday');
      expect(parsed.created).toBeTruthy();
    });

    it('outputs --ndjson format', () => {
      const { logs, spy } = mockConsole();
      const data = createFullSyncData();
      const notes = data.state.note?.entities || {};
      const noteIds = data.state.note?.ids || [];

      noteIds.forEach((id) => {
        console.log(JSON.stringify(serializeNote(notes[id] as any, false)));
      });

      spy.mockRestore();
      expect(logs.length).toBe(2);
      expect(logs[0]).toContain('"id":"note-meeting"');
      expect(logs[1]).toContain('"id":"note-project"');
    });

    it('handles empty notes', () => {
      const { logs, spy } = mockConsole();
      const data = createMockSyncData({ state: { note: { ids: [], entities: {} } } as any });

      const noteIds = data.state.note?.ids || [];
      if (noteIds.length === 0) {
        console.log('No notes found.');
      }

      spy.mockRestore();
      expect(logs[0]).toBe('No notes found.');
    });
  });

  describe('note show', () => {
    it('outputs --json format for single note', () => {
      const { logs, spy } = mockConsole();
      const note = createMockNote({ id: 'test-note', content: 'Test note content here' });

      const serialized = serializeNote(note, false);
      console.log(JSON.stringify(serialized, null, 2));

      spy.mockRestore();
      const parsed = JSON.parse(logs.join('\n'));
      expect(parsed.id).toBe('test-note');
    });

    it('outputs --json --full with all fields', () => {
      const { logs, spy } = mockConsole();
      const note = createMockNote({
        content: 'Full note content that should not be truncated',
        created: 1234567890,
        projectId: 'project-1',
      });

      const serialized = serializeNote(note, true);
      console.log(JSON.stringify(serialized, null, 2));

      spy.mockRestore();
      const parsed = JSON.parse(logs.join('\n'));
      expect(parsed.content).toBe('Full note content that should not be truncated');
      expect(parsed.projectId).toBe('project-1');
      expect(parsed.created).toBe(1234567890);
    });

    it('truncates long content in summary mode', () => {
      const { logs, spy } = mockConsole();
      const longContent = 'A'.repeat(100);
      const note = createMockNote({ content: longContent });

      const serialized = serializeNote(note, false);
      console.log(JSON.stringify(serialized, null, 2));

      spy.mockRestore();
      const parsed = JSON.parse(logs.join('\n'));
      expect(parsed.content?.length).toBe(80);
    });
  });
});