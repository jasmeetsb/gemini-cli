/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type CommandContext,
  CommandKind,
  type SlashCommand,
} from './types.js';
import { coreEvents, debugLogger } from '@google/gemini-cli-core';
import { simpleGit } from 'simple-git';

export const gitAssistantCommand: SlashCommand = {
  name: 'git',
  description: 'Git assistant for generating commits and PRs',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  subCommands: [
    {
      name: 'commit',
      description: 'Generate a conventional commit message for staged changes',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      takesArgs: false,
      action: async (_context: CommandContext) => {
        try {
          const git = simpleGit();
          const diff = await git.diff(['--cached']);

          if (!diff) {
            coreEvents.emitFeedback(
              'info',
              'No staged changes found. Please stage your changes first using `git add`.',
            );
            return;
          }

          const prompt = `Generate a high-quality conventional commit message for the following diff. Follow the Conventional Commits specification. Provide a concise summary line and a body if the changes are complex.\n\n\`\`\`diff\n${diff}\n\`\`\``;

          return {
            type: 'submit_prompt',
            content: prompt,
          };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          coreEvents.emitFeedback(
            'error',
            `Failed to generate commit message: ${errorMessage}`,
            error,
          );
          return;
        }
      },
    },
    {
      name: 'pr',
      description: 'Generate a PR description against a base branch',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      takesArgs: true,
      action: async (context: CommandContext, args: string) => {
        try {
          const git = simpleGit();
          const baseBranch = args.trim() || 'main';

          const branchSummary = await git.branch();
          const currentBranch = branchSummary.current;

          if (!currentBranch) {
            coreEvents.emitFeedback(
              'error',
              'Could not determine current branch.',
            );
            return;
          }

          if (currentBranch === baseBranch) {
            coreEvents.emitFeedback(
              'warning',
              `Current branch is the same as base branch (${baseBranch}). Please specify a different base branch or switch branches.`,
            );
            return;
          }

          const diff = await git.diff([`${baseBranch}..${currentBranch}`]);

          if (!diff) {
            coreEvents.emitFeedback(
              'info',
              `No changes found between ${baseBranch} and ${currentBranch}.`,
            );
            return;
          }

          let promptContent = `Generate a full Pull Request description for the changes in branch '${currentBranch}' relative to '${baseBranch}'.\n\nPlease include:\n1. A clear Summary of the changes.\n2. A detailed list of Changes.\n3. Testing Notes describing how these changes were verified.\n\n`;

          const MAX_DIFF_LENGTH = 20000;
          if (diff.length > MAX_DIFF_LENGTH) {
            const stat = await git.diff([
              `${baseBranch}..${currentBranch}`,
              '--stat',
            ]);
            promptContent += `The diff is too large to include in full (${diff.length} bytes). Here is the diff stat and a truncated version of the diff:\n\nDiff Stat:\n\`\`\`\n${stat}\n\`\`\`\n\nTruncated Diff:\n\`\`\`diff\n${diff.slice(0, MAX_DIFF_LENGTH)}\n... [truncated for size] \`\`\``;
          } else {
            promptContent += `Here is the diff:\n\n\`\`\`diff\n${diff}\n\`\`\``;
          }

          return {
            type: 'submit_prompt',
            content: promptContent,
          };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          coreEvents.emitFeedback(
            'error',
            `Failed to generate PR description: ${errorMessage}`,
            error,
          );
          return;
        }
      },
      completion: async (context: CommandContext, partialArg: string) => {
        try {
          const git = simpleGit();
          const branchSummary = await git.branch(['--list', '--all']);
          const branches = branchSummary.all.map((b) =>
            b.replace(/^remotes\/[^/]+\//, ''),
          ); // Strip remote prefix
          const uniqueBranches = Array.from(new Set(branches));
          return uniqueBranches.filter((b) => b.startsWith(partialArg));
        } catch (error) {
          debugLogger.debug(`Failed to get branches for completion: ${error}`);
          return [];
        }
      },
    },
  ],
};
