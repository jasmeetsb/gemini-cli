/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { validateContent } from './syntaxValidator.js';
import { spawnAsync } from './shell-utils.js';

vi.mock('./shell-utils.js');

describe('syntaxValidator', () => {
  let mockSpawnAsync: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawnAsync = vi.mocked(spawnAsync);
  });

  describe('validateTypeScript', () => {
    it('should return valid for correct TypeScript', async () => {
      const code = 'const x: number = 1;';
      const result = await validateContent('test.ts', code);
      expect(result.valid).toBe(true);
    });

    it('should return invalid for incorrect TypeScript', async () => {
      const code = 'const x: number = ;';
      const result = await validateContent('test.ts', code);
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe('validatePython', () => {
    it('should return valid when python compilation succeeds', async () => {
      mockSpawnAsync.mockResolvedValue({ stdout: '', stderr: '' });
      
      const code = 'def foo(): pass';
      const result = await validateContent('test.py', code);
      
      expect(result.valid).toBe(true);
      expect(mockSpawnAsync).toHaveBeenCalledWith('python3', ['-c', 'import sys; compile(sys.stdin.read(), "<stdin>", "exec")'], { stdin: code });
    });

    it('should return invalid when python compilation fails', async () => {
      mockSpawnAsync.mockRejectedValue(new Error('SyntaxError: invalid syntax'));
      
      const code = 'def foo():';
      const result = await validateContent('test.py', code);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('SyntaxError');
    });
  });

  describe('validateContent', () => {
    it('should return valid for unsupported languages without checking', async () => {
      const result = await validateContent('test.txt', 'some text');
      expect(result.valid).toBe(true);
      expect(mockSpawnAsync).not.toHaveBeenCalled();
    });
  });
});
