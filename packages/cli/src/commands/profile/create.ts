/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CommandModule } from 'yargs';
import { createProfile } from '../../utils/profileManager.js';
import { debugLogger } from '@google/gemini-cli-core';
import chalk from 'chalk';
import { exitCli } from '../utils.js';

interface CreateArgs {
  name: string;
  from?: string;
}

export const createCommand: CommandModule<object, CreateArgs> = {
  command: 'create <name>',
  describe: 'Create a new profile',
  builder: (yargs) =>
    yargs
      .positional('name', {
        describe: 'Name of the profile to create',
        type: 'string',
        demandOption: true,
      })
      .option('from', {
        describe: 'Copy configuration from an existing profile',
        type: 'string',
      }),
  handler: async (argv) => {
    try {
      createProfile(argv.name, argv.from);
      debugLogger.log(
        chalk.green(`✓ Profile '${argv.name}' created successfully.`),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      debugLogger.error(chalk.red(`Error creating profile: ${message}`));
    }
    await exitCli();
  },
};
