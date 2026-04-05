/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CommandModule } from 'yargs';
import {
  listProfiles,
  getActiveProfileName,
} from '../../utils/profileManager.js';
import { debugLogger } from '@google/gemini-cli-core';
import chalk from 'chalk';
import { exitCli } from '../utils.js';

export const listCommand: CommandModule = {
  command: 'list',
  describe: 'List all available profiles',
  handler: async () => {
    const profiles = listProfiles();
    const activeProfile = getActiveProfileName();

    debugLogger.log('Available profiles:\n');

    for (const profile of profiles) {
      if (profile === activeProfile) {
        debugLogger.log(`${chalk.green('*')} ${chalk.bold(profile)} (active)`);
      } else {
        debugLogger.log(`  ${profile}`);
      }
    }

    await exitCli();
  },
};
