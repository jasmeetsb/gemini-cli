import { describe, it, expect } from 'vitest';
import {
  computeLineHash,
  formatHashline,
  parseLineRef,
  computeFileHashes,
  buildMismatchDiagnostic,
} from './hashline-utils.js';

describe('computeLineHash', () => {
  it('returns a 3-char hex string', () => {
    const hash = computeLineHash('function hello() {');
    expect(hash).toMatch(/^[0-9a-f]{3}$/);
  });

  it('is deterministic for same content', () => {
    const a = computeLineHash('return x + 1;');
    const b = computeLineHash('return x + 1;');
    expect(a).toBe(b);
  });

  it('is indentation-invariant (strips leading/trailing whitespace before hashing)', () => {
    const a = computeLineHash('  return x + 1;');
    const b = computeLineHash('    return x + 1;');
    const c = computeLineHash('return x + 1;');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('preserves interior whitespace in hash input', () => {
    // "return x+1;" vs "return x + 1;" should produce different hashes
    const a = computeLineHash('return x+1;');
    const b = computeLineHash('return x + 1;');
    expect(a).not.toBe(b);
  });

  it('strips trailing CR before hashing', () => {
    const a = computeLineHash('hello\r');
    const b = computeLineHash('hello');
    expect(a).toBe(b);
  });

  it('produces valid 3-hex-char format for various inputs', () => {
    // Verify format, not specific values — collision is possible by design
    const inputs = [
      'function foo() {',
      'function bar() {',
      '',
      '   ',
      'a'.repeat(1000),
    ];
    for (const input of inputs) {
      const hash = computeLineHash(input);
      expect(hash).toMatch(/^[0-9a-f]{3}$/);
    }
  });
});

describe('formatHashline', () => {
  it('formats a line with line number and hash', () => {
    const result = formatHashline(1, 'function hello() {');
    // Format: {linenum}:{hash}|{content}
    expect(result).toMatch(/^1:[0-9a-f]{3}\|function hello\(\) \{$/);
  });

  it('preserves original line content including leading whitespace', () => {
    const result = formatHashline(5, '    return x;');
    expect(result).toMatch(/^5:[0-9a-f]{3}\|    return x;$/);
  });
});

describe('parseLineRef', () => {
  it('parses a valid line reference', () => {
    const ref = parseLineRef('42:a3f');
    expect(ref).toEqual({ line: 42, hash: 'a3f' });
  });

  it('strips content after | (model may include line content)', () => {
    const ref = parseLineRef('42:a3f|function hello() {');
    expect(ref).toEqual({ line: 42, hash: 'a3f' });
  });

  it('strips content after double space', () => {
    const ref = parseLineRef('42:a3f  function hello() {');
    expect(ref).toEqual({ line: 42, hash: 'a3f' });
  });

  it('normalizes whitespace around colon', () => {
    const ref = parseLineRef('42 : a3f');
    expect(ref).toEqual({ line: 42, hash: 'a3f' });
  });

  it('normalizes uppercase hex to lowercase', () => {
    const ref = parseLineRef('42:A3F');
    expect(ref).toEqual({ line: 42, hash: 'a3f' });
  });

  it('strips grep match separator and trailing content', () => {
    // Grep match format: "42:a3f: return x + 1;"
    const ref = parseLineRef('42:a3f: return x + 1;');
    expect(ref).toEqual({ line: 42, hash: 'a3f' });
  });

  it('strips grep context separator and trailing content', () => {
    // Grep context format: "41:b2e- function foo() {"
    const ref = parseLineRef('41:b2e- function foo() {');
    expect(ref).toEqual({ line: 41, hash: 'b2e' });
  });

  it('handles grep format with space after separator', () => {
    const ref = parseLineRef('10:abc: some content');
    expect(ref).toEqual({ line: 10, hash: 'abc' });
  });

  it('returns null for invalid format', () => {
    expect(parseLineRef('invalid')).toBeNull();
    expect(parseLineRef('')).toBeNull();
    expect(parseLineRef('0:a3f')).toBeNull(); // line must be >= 1
    expect(parseLineRef('abc:a3f')).toBeNull();
    expect(parseLineRef('42:a3')).toBeNull(); // must be exactly 3 hex chars
    expect(parseLineRef('42:a3fg')).toBeNull(); // must be exactly 3 hex chars
  });
});

describe('computeFileHashes', () => {
  it('computes hashes for all lines in file content', () => {
    const content = 'line one\nline two\nline three';
    const hashes = computeFileHashes(content);
    expect(hashes).toHaveLength(3);
    expect(hashes[0]).toEqual({
      line: 1,
      hash: expect.stringMatching(/^[0-9a-f]{3}$/),
      content: 'line one',
    });
    expect(hashes[1].line).toBe(2);
    expect(hashes[2].line).toBe(3);
  });

  it('handles empty content', () => {
    const hashes = computeFileHashes('');
    expect(hashes).toHaveLength(1); // single empty line
  });
});

describe('buildMismatchDiagnostic', () => {
  it('builds diagnostic message with mismatch info', () => {
    const mismatches = [
      {
        anchor: '1:abc',
        expectedHash: 'abc',
        actualHash: 'def',
        actualLine: 1,
      },
    ];
    const msg = buildMismatchDiagnostic(mismatches, 1);
    expect(msg).toContain('1 anchor(s)');
    expect(msg).toContain('expected hash "abc"');
    expect(msg).toContain('found "def"');
    expect(msg).toContain('Re-read the file');
  });

  it('truncates to 5 entries when more mismatches exist', () => {
    const mismatches = Array.from({ length: 7 }, (_, i) => ({
      anchor: `${i + 1}:abc`,
      expectedHash: 'abc',
      actualHash: 'def',
      actualLine: i + 1,
    }));
    const msg = buildMismatchDiagnostic(mismatches, 7);
    expect(msg).toContain('7 anchor(s)');
    expect(msg).toContain('... and 2 more.');
  });
});
