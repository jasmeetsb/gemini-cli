/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { gitAssistantCommand } from './gitAssistantCommand.js';
import { type CommandContext } from './types.js';
import { coreEvents } from '@google/gemini-cli-core';
import { simpleGit } from 'simple-git';

vi.mock('@google/gemini-cli-core', () => ({
  coreEvents: {
    emitFeedback: vi.fn(),
  },
  debugLogger: {
    debug: vi.fn(),
  },
}));

vi.mock('simple-git');

describe('gitAssistantCommand', () => {
  let mockContext: CommandContext;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockGit: any;

  beforeEach(() => {
    mockContext = {
      services: {
        agentContext: {},
      },
      ui: {
        addItem: vi.fn(),
      },
    } as unknown as CommandContext;

    mockGit = {
      diff: vi.fn(),
      branch: vi.fn(),
    };
    vi.mocked(simpleGit).mockReturnValue(mockGit);

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should have the correct name and description', () => {
    expect(gitAssistantCommand.name).toBe('git');
    expect(gitAssistantCommand.description).toBe(
      'Git assistant for generating commits and PRs',
    );
  });

  describe('commit subcommand', () => {
    it('should return submit_prompt when there are staged changes', async () => {
      mockGit.diff.mockResolvedValue('staged diff content');
      const commitCmd = gitAssistantCommand.subCommands?.find(
        (sc) => sc.name === 'commit',
      );
      if (!commitCmd?.action) throw new Error('Commit action missing');

      const result = await commitCmd.action(mockContext, '');

      expect(result).toEqual({
        type: 'submit_prompt',
        content: expect.stringContaining('staged diff content'),
      });
    });

    it('should emit feedback when no staged changes', async () => {
      mockGit.diff.mockResolvedValue('');
      const commitCmd = gitAssistantCommand.subCommands?.find(
        (sc) => sc.name === 'commit',
      );
      if (!commitCmd?.action) throw new Error('Commit action missing');

      const result = await commitCmd.action(mockContext, '');

      expect(result).toBeUndefined();
      expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('No staged changes'),
      );
    });

    it('should handle errors gracefully', async () => {
      mockGit.diff.mockRejectedValue(new Error('Git error'));
      const commitCmd = gitAssistantCommand.subCommands?.find(
        (sc) => sc.name === 'commit',
      );
      if (!commitCmd?.action) throw new Error('Commit action missing');

      const result = await commitCmd.action(mockContext, '');

      expect(result).toBeUndefined();
      expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('Failed to generate commit message'),
        expect.any(Error),
      );
    });
  });

  describe('pr subcommand', () => {
    it('should return submit_prompt when there are changes against base', async () => {
      mockGit.branch.mockResolvedValue({ current: 'feature-branch' });
      mockGit.diff.mockResolvedValue('branch diff content');
      const prCmd = gitAssistantCommand.subCommands?.find(
        (sc) => sc.name === 'pr',
      );
      if (!prCmd?.action) throw new Error('PR action missing');

      const result = await prCmd.action(mockContext, 'main');

      expect(result).toEqual({
        type: 'submit_prompt',
        content: expect.stringContaining('branch diff content'),
      });
    });
    it('should handle large diffs by including stat and truncated diff', async () => {
      mockGit.branch.mockResolvedValue({ current: 'feature-branch' });
      const largeDiff = 'a'.repeat(25000);
      mockGit.diff.mockImplementation(async (args) => {
        if (args.includes('--stat')) {
          return 'stat content';
        }
        return largeDiff;
      });

      const prCmd = gitAssistantCommand.subCommands?.find(
        (sc) => sc.name === 'pr',
      );
      if (!prCmd?.action) throw new Error('PR action missing');

      const result = await prCmd.action(mockContext, 'main');

      expect(result).toEqual({
        type: 'submit_prompt',
        content: expect.stringContaining('stat content'),
      });
      expect(result.content).toContain('... [truncated for size]');
    });

    it('should emit feedback when no changes against base', async () => {
      mockGit.branch.mockResolvedValue({ current: 'feature-branch' });
      mockGit.diff.mockResolvedValue('');
      const prCmd = gitAssistantCommand.subCommands?.find(
        (sc) => sc.name === 'pr',
      );
      if (!prCmd?.action) throw new Error('PR action missing');

      const result = await prCmd.action(mockContext, 'main');

      expect(result).toBeUndefined();
      expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
        'info',
        expect.stringContaining('No changes found'),
      );
    });

    it('should warn when current branch is same as base', async () => {
      mockGit.branch.mockResolvedValue({ current: 'main' });
      const prCmd = gitAssistantCommand.subCommands?.find(
        (sc) => sc.name === 'pr',
      );
      if (!prCmd?.action) throw new Error('PR action missing');

      const result = await prCmd.action(mockContext, 'main');

      expect(result).toBeUndefined();
      expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
        'warning',
        expect.stringContaining('Current branch is the same as base branch'),
      );
    });

    it('should handle errors gracefully', async () => {
      mockGit.branch.mockResolvedValue({ current: 'feature-branch' });
      mockGit.diff.mockRejectedValue(new Error('Git error'));
      const prCmd = gitAssistantCommand.subCommands?.find(
        (sc) => sc.name === 'pr',
      );
      if (!prCmd?.action) throw new Error('PR action missing');

      const result = await prCmd.action(mockContext, 'main');

      expect(result).toBeUndefined();
      expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('Failed to generate PR description'),
        expect.any(Error),
      );
    });
  });
});
