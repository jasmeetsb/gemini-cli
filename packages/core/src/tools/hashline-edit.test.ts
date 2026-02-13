/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { HashlineEditTool } from './hashline-edit.js';
import { computeFileHashes } from './hashline-utils.js';
import { ToolErrorType } from './tool-error.js';
import type { Config } from '../config/config.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import { ApprovalMode } from '../policy/types.js';
import { StandardFileSystemService } from '../services/fileSystemService.js';

describe('HashlineEditTool', () => {
  let tempDir: string;
  let tool: HashlineEditTool;
  let mockConfig: Config;
  const signal = new AbortController().signal;

  async function createFileWithContent(
    fileName: string,
    content: string,
  ): Promise<{ filePath: string; hashes: { line: number; hash: string; content: string }[] }> {
    const filePath = path.join(tempDir, fileName);
    await fs.promises.writeFile(filePath, content, 'utf-8');
    const hashes = computeFileHashes(content);
    return { filePath, hashes };
  }

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'hashline-edit-test-'),
    );

    mockConfig = {
      getTargetDir: () => tempDir,
      getExperimentalHashline: () => true,
      getApprovalMode: () => ApprovalMode.AUTO_EDIT,
      getIdeMode: () => false,
      getDisableLLMCorrection: () => true,
      validatePathAccess: () => null,
      isPathAllowed: () => true,
      getFileSystemService: () => new StandardFileSystemService(),
      getBaseLlmClient: () => null,
      setApprovalMode: vi.fn(),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/tmp/project'),
      },
    } as unknown as Config;

    tool = new HashlineEditTool(mockConfig, createMockMessageBus());
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  describe('set_line operation', () => {
    it('replaces a single line by anchor', async () => {
      const { filePath, hashes } = await createFileWithContent(
        'test.ts',
        'hello world\nfoo bar',
      );

      const invocation = tool.build({
        file_path: filePath,
        instruction: 'Replace first line',
        operations: [
          {
            op: 'set_line',
            anchor: `${hashes[0].line}:${hashes[0].hash}`,
            new_text: 'goodbye world',
          },
        ],
      });
      const result = await invocation.execute(signal);

      expect(result.error).toBeUndefined();
      const content = await fs.promises.readFile(filePath, 'utf-8');
      expect(content).toBe('goodbye world\nfoo bar');
    });

    it('expands a single line into multiple lines', async () => {
      const { filePath, hashes } = await createFileWithContent(
        'test.ts',
        'line one\nline two\nline three',
      );

      const invocation = tool.build({
        file_path: filePath,
        instruction: 'Expand line 2',
        operations: [
          {
            op: 'set_line',
            anchor: `${hashes[1].line}:${hashes[1].hash}`,
            new_text: 'line two A\nline two B',
          },
        ],
      });
      const result = await invocation.execute(signal);

      expect(result.error).toBeUndefined();
      const content = await fs.promises.readFile(filePath, 'utf-8');
      expect(content).toBe('line one\nline two A\nline two B\nline three');
    });
  });

  describe('replace_lines operation', () => {
    it('replaces a range of lines', async () => {
      const { filePath, hashes } = await createFileWithContent(
        'test.ts',
        'a\nb\nc\nd',
      );

      const invocation = tool.build({
        file_path: filePath,
        instruction: 'Replace lines 2-3',
        operations: [
          {
            op: 'replace_lines',
            start_anchor: `${hashes[1].line}:${hashes[1].hash}`,
            end_anchor: `${hashes[2].line}:${hashes[2].hash}`,
            new_text: 'B\nC',
          },
        ],
      });
      const result = await invocation.execute(signal);

      expect(result.error).toBeUndefined();
      const content = await fs.promises.readFile(filePath, 'utf-8');
      expect(content).toBe('a\nB\nC\nd');
    });

    it('deletes a range when new_text is omitted', async () => {
      const { filePath, hashes } = await createFileWithContent(
        'test.ts',
        'a\nb\nc\nd',
      );

      const invocation = tool.build({
        file_path: filePath,
        instruction: 'Delete lines 2-3',
        operations: [
          {
            op: 'replace_lines',
            start_anchor: `${hashes[1].line}:${hashes[1].hash}`,
            end_anchor: `${hashes[2].line}:${hashes[2].hash}`,
          },
        ],
      });
      const result = await invocation.execute(signal);

      expect(result.error).toBeUndefined();
      const content = await fs.promises.readFile(filePath, 'utf-8');
      expect(content).toBe('a\nd');
    });
  });

  describe('insert_after operation', () => {
    it('inserts text after an anchor line', async () => {
      const { filePath, hashes } = await createFileWithContent(
        'test.ts',
        'a\nb\nc',
      );

      const invocation = tool.build({
        file_path: filePath,
        instruction: 'Insert after line 1',
        operations: [
          {
            op: 'insert_after',
            anchor: `${hashes[0].line}:${hashes[0].hash}`,
            text: 'inserted line',
          },
        ],
      });
      const result = await invocation.execute(signal);

      expect(result.error).toBeUndefined();
      const content = await fs.promises.readFile(filePath, 'utf-8');
      expect(content).toBe('a\ninserted line\nb\nc');
    });

    it('allows inserting an empty line', async () => {
      const { filePath, hashes } = await createFileWithContent(
        'test.ts',
        'a\nb',
      );

      const invocation = tool.build({
        file_path: filePath,
        instruction: 'Insert blank line',
        operations: [
          {
            op: 'insert_after',
            anchor: `${hashes[0].line}:${hashes[0].hash}`,
            text: '',
          },
        ],
      });
      const result = await invocation.execute(signal);

      expect(result.error).toBeUndefined();
      const content = await fs.promises.readFile(filePath, 'utf-8');
      expect(content).toBe('a\n\nb');
    });
  });

  describe('replace (fallback) operation', () => {
    it('replaces first occurrence by default', async () => {
      const { filePath } = await createFileWithContent(
        'test.ts',
        'hello world\nhello foo',
      );

      const invocation = tool.build({
        file_path: filePath,
        instruction: 'Replace hello',
        operations: [
          {
            op: 'replace',
            old_text: 'hello',
            new_text: 'goodbye',
          },
        ],
      });
      const result = await invocation.execute(signal);

      expect(result.error).toBeUndefined();
      const content = await fs.promises.readFile(filePath, 'utf-8');
      expect(content).toBe('goodbye world\nhello foo');
    });

    it('replaces all occurrences when all=true', async () => {
      const { filePath } = await createFileWithContent(
        'test.ts',
        'hello world\nhello foo',
      );

      const invocation = tool.build({
        file_path: filePath,
        instruction: 'Replace all hello',
        operations: [
          {
            op: 'replace',
            old_text: 'hello',
            new_text: 'goodbye',
            all: true,
          },
        ],
      });
      const result = await invocation.execute(signal);

      expect(result.error).toBeUndefined();
      const content = await fs.promises.readFile(filePath, 'utf-8');
      expect(content).toBe('goodbye world\ngoodbye foo');
    });

    it('rejects when old_text equals new_text', async () => {
      const { filePath } = await createFileWithContent('test.ts', 'hello');

      const invocation = tool.build({
        file_path: filePath,
        instruction: 'No-op',
        operations: [{ op: 'replace', old_text: 'hello', new_text: 'hello' }],
      });
      const result = await invocation.execute(signal);

      expect(result.error).toBeDefined();
    });
  });

  describe('hash mismatch handling', () => {
    it('returns mismatch diagnostic when anchor hash does not match', async () => {
      const { filePath } = await createFileWithContent(
        'test.ts',
        'line one\nline two',
      );

      const invocation = tool.build({
        file_path: filePath,
        instruction: 'Edit with wrong hash',
        operations: [{ op: 'set_line', anchor: '1:fff', new_text: 'replaced' }],
      });
      const result = await invocation.execute(signal);

      expect(result.error).toBeDefined();
      expect(result.error!.type).toBe(ToolErrorType.HASHLINE_MISMATCH);
      expect(result.llmContent).toContain('expected hash');
      expect(result.llmContent).toContain('Re-read the file');
    });
  });

  describe('multiple operations', () => {
    it('applies multiple operations sequentially with offset tracking', async () => {
      const { filePath, hashes } = await createFileWithContent(
        'test.ts',
        'a\nb\nc\nd',
      );

      const invocation = tool.build({
        file_path: filePath,
        instruction: 'Multiple edits',
        operations: [
          { op: 'set_line', anchor: `${hashes[0].line}:${hashes[0].hash}`, new_text: 'A' },
          { op: 'set_line', anchor: `${hashes[3].line}:${hashes[3].hash}`, new_text: 'D' },
        ],
      });
      const result = await invocation.execute(signal);

      expect(result.error).toBeUndefined();
      const content = await fs.promises.readFile(filePath, 'utf-8');
      expect(content).toBe('A\nb\nc\nD');
    });

    it('correctly tracks offset when first operation adds lines', async () => {
      const { filePath, hashes } = await createFileWithContent(
        'test.ts',
        'a\nb\nc',
      );

      const invocation = tool.build({
        file_path: filePath,
        instruction: 'Insert then modify',
        operations: [
          { op: 'insert_after', anchor: `${hashes[0].line}:${hashes[0].hash}`, text: 'x\ny' },
          { op: 'set_line', anchor: `${hashes[2].line}:${hashes[2].hash}`, new_text: 'C' },
        ],
      });
      const result = await invocation.execute(signal);

      expect(result.error).toBeUndefined();
      const content = await fs.promises.readFile(filePath, 'utf-8');
      expect(content).toBe('a\nx\ny\nb\nC');
    });
  });

  describe('validation', () => {
    it('rejects mixed anchor and replace operations', async () => {
      const { filePath, hashes } = await createFileWithContent(
        'test.ts',
        'hello\nworld',
      );

      const invocation = tool.build({
        file_path: filePath,
        instruction: 'Mixed ops',
        operations: [
          { op: 'set_line', anchor: `${hashes[0].line}:${hashes[0].hash}`, new_text: 'hi' },
          { op: 'replace', old_text: 'world', new_text: 'earth' },
        ],
      });
      const result = await invocation.execute(signal);

      expect(result.error).toBeDefined();
      expect(result.llmContent).toContain('Cannot mix');
    });

    it('rejects non-ascending anchor order', async () => {
      const { filePath, hashes } = await createFileWithContent(
        'test.ts',
        'a\nb\nc',
      );

      const invocation = tool.build({
        file_path: filePath,
        instruction: 'Out of order',
        operations: [
          { op: 'set_line', anchor: `${hashes[2].line}:${hashes[2].hash}`, new_text: 'C' },
          { op: 'set_line', anchor: `${hashes[0].line}:${hashes[0].hash}`, new_text: 'A' },
        ],
      });
      const result = await invocation.execute(signal);

      expect(result.error).toBeDefined();
      expect(result.llmContent).toContain('ascending order');
    });

    it('rejects duplicate line targets', async () => {
      const { filePath, hashes } = await createFileWithContent(
        'test.ts',
        'a\nb\nc',
      );

      const invocation = tool.build({
        file_path: filePath,
        instruction: 'Same line twice',
        operations: [
          { op: 'set_line', anchor: `${hashes[0].line}:${hashes[0].hash}`, new_text: 'X' },
          { op: 'set_line', anchor: `${hashes[0].line}:${hashes[0].hash}`, new_text: 'Y' },
        ],
      });
      const result = await invocation.execute(signal);

      expect(result.error).toBeDefined();
      expect(result.llmContent).toContain('ascending order');
    });

    it('rejects anchor out of range', async () => {
      const { filePath } = await createFileWithContent('test.ts', 'one line');

      const invocation = tool.build({
        file_path: filePath,
        instruction: 'Out of range',
        operations: [{ op: 'set_line', anchor: '99:abc', new_text: 'X' }],
      });
      const result = await invocation.execute(signal);

      expect(result.error).toBeDefined();
      expect(result.error!.type).toBe(ToolErrorType.HASHLINE_ANCHOR_OUT_OF_RANGE);
    });

    it('rejects path outside workspace', () => {
      const restrictiveConfig = {
        ...mockConfig,
        validatePathAccess: () => 'Path not in workspace',
      } as unknown as Config;
      const restrictiveTool = new HashlineEditTool(restrictiveConfig, createMockMessageBus());

      expect(() =>
        restrictiveTool.build({
          file_path: '/etc/passwd',
          instruction: 'bad',
          operations: [{ op: 'set_line', anchor: '1:abc', new_text: 'X' }],
        }),
      ).toThrow('Path not in workspace');
    });
  });
});
