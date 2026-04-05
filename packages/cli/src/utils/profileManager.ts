/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { debugLogger } from '@google/gemini-cli-core';

export function getProfilesRootDir(): string {
  return path.join(os.homedir(), '.gemini-profiles');
}

export function getActiveProfileLinkPath(): string {
  return path.join(os.homedir(), '.gemini');
}

export function getActiveProfileName(): string {
  const linkPath = getActiveProfileLinkPath();
  try {
    if (fs.existsSync(linkPath) && fs.lstatSync(linkPath).isSymbolicLink()) {
      const target = fs.readlinkSync(linkPath);
      return path.basename(target);
    }
  } catch {
    // Fallback or ignore
  }
  return 'default';
}

export function listProfiles(): string[] {
  const rootDir = getProfilesRootDir();
  if (!fs.existsSync(rootDir)) {
    return ['default'];
  }
  return fs.readdirSync(rootDir).filter((file) => fs.statSync(path.join(rootDir, file)).isDirectory());
}

export function createProfile(name: string, from?: string): void {
  const rootDir = getProfilesRootDir();
  const newProfilePath = path.join(rootDir, name);

  if (fs.existsSync(newProfilePath)) {
    throw new Error(`Profile '${name}' already exists.`);
  }

  fs.mkdirSync(newProfilePath, { recursive: true });

  if (from) {
    const fromPath = path.join(rootDir, from);
    if (!fs.existsSync(fromPath)) {
      throw new Error(`Source profile '${from}' does not exist.`);
    }
    copyRecursiveSync(fromPath, newProfilePath);
  }
}

export function switchProfile(name: string): void {
  const rootDir = getProfilesRootDir();
  const profilePath = path.join(rootDir, name);
  const linkPath = getActiveProfileLinkPath();

  if (!fs.existsSync(profilePath)) {
    throw new Error(`Profile '${name}' does not exist.`);
  }

  if (fs.existsSync(linkPath)) {
    fs.unlinkSync(linkPath);
  }

  fs.symlinkSync(profilePath, linkPath, 'dir');
}

export function deleteProfile(name: string): void {
  if (name === 'default') {
    throw new Error("Cannot delete the 'default' profile.");
  }

  if (name === getActiveProfileName()) {
    throw new Error('Cannot delete the active profile.');
  }

  const rootDir = getProfilesRootDir();
  const profilePath = path.join(rootDir, name);

  if (fs.existsSync(profilePath)) {
    fs.rmSync(profilePath, { recursive: true, force: true });
  }
}

export function ensureMigrated(): void {
  const linkPath = getActiveProfileLinkPath();
  const rootDir = getProfilesRootDir();
  const defaultProfilePath = path.join(rootDir, 'default');

  if (!fs.existsSync(rootDir)) {
    fs.mkdirSync(rootDir, { recursive: true });
  }

  if (fs.existsSync(linkPath)) {
    const stats = fs.lstatSync(linkPath);
    if (!stats.isSymbolicLink()) {
      // It's a real directory, migrate it
      if (!fs.existsSync(defaultProfilePath)) {
        fs.renameSync(linkPath, defaultProfilePath);
      } else {
        // If default exists, we might need to move it to a backup name.
        const backupName = `backup-${Date.now()}`;
        fs.renameSync(linkPath, path.join(rootDir, backupName));
        debugLogger.warn(
          `[ProfileManager] Existing ~/.gemini moved to backup profile: ${backupName}`,
        );
      }
      fs.symlinkSync(defaultProfilePath, linkPath, 'dir');
    }
  } else {
    // Doesn't exist, create default and link
    if (!fs.existsSync(defaultProfilePath)) {
      fs.mkdirSync(defaultProfilePath, { recursive: true });
    }
    fs.symlinkSync(defaultProfilePath, linkPath, 'dir');
  }
}

function copyRecursiveSync(src: string, dest: string) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats && stats.isDirectory();
  if (isDirectory) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName),
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}
