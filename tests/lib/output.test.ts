import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { printMany, printOne, hasFormatOption, OutputOptions } from '../../src/lib/output.js';

describe('output', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  const items = [
    { id: 'a', title: 'Item A', count: 1 },
    { id: 'b', title: 'Item B', count: 2 },
  ];

  const serializer = (item: { id: string; title: string; count: number }, full: boolean) => {
    if (full) return item;
    return { id: item.id, title: item.title };
  };

  describe('hasFormatOption', () => {
    it('returns true when json is set', () => {
      expect(hasFormatOption({ json: true })).toBe(true);
    });

    it('returns true when ndjson is set', () => {
      expect(hasFormatOption({ ndjson: true })).toBe(true);
    });

    it('returns false when no format options', () => {
      expect(hasFormatOption({})).toBe(false);
      expect(hasFormatOption({ full: true })).toBe(false);
    });
  });

  describe('printMany', () => {
    it('outputs ndjson format', () => {
      printMany(items, { ndjson: true }, serializer);
      expect(consoleSpy).toHaveBeenCalledTimes(2);
      expect(consoleSpy).toHaveBeenNthCalledWith(1, '{"id":"a","title":"Item A"}');
      expect(consoleSpy).toHaveBeenNthCalledWith(2, '{"id":"b","title":"Item B"}');
    });

    it('outputs ndjson with full=true', () => {
      printMany(items, { ndjson: true, full: true }, serializer);
      expect(consoleSpy).toHaveBeenNthCalledWith(1, '{"id":"a","title":"Item A","count":1}');
    });

    it('outputs json format with pretty printing', () => {
      printMany(items, { json: true }, serializer);
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain('"id": "a"');
      expect(output).toContain('"title": "Item A"');
    });

    it('outputs json with full=true', () => {
      printMany(items, { json: true, full: true }, serializer);
      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain('"count": 1');
    });

    it('does nothing when no format options', () => {
      printMany(items, {}, serializer);
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('handles empty array', () => {
      printMany([], { json: true }, serializer);
      expect(consoleSpy).toHaveBeenCalledWith('[]');
    });
  });

  describe('printOne', () => {
    const singleItem = { id: 'a', title: 'Item A', count: 1 };

    it('outputs ndjson format for single item', () => {
      printOne(singleItem, { ndjson: true }, serializer);
      expect(consoleSpy).toHaveBeenCalledWith('{"id":"a","title":"Item A"}');
    });

    it('outputs json format for single item', () => {
      printOne(singleItem, { json: true }, serializer);
      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain('"id": "a"');
    });

    it('outputs full data with full=true', () => {
      printOne(singleItem, { json: true, full: true }, serializer);
      const output = consoleSpy.mock.calls[0][0];
      expect(output).toContain('"count": 1');
    });

    it('does nothing when no format options', () => {
      printOne(singleItem, {}, serializer);
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });
});