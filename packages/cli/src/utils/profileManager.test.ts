/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  ensureMigrated,
  listProfiles,
  createProfile,
  switchProfile,
  deleteProfile,
} from './profileManager.js';

vi.mock('node:fs');
vi.mock('node:os');

const mockedFs = vi.mocked(fs);
const mockedOs = vi.mocked(os);

describe('profileManager', () => {
  const mockHome = '/user/home';
  const profilesDir = path.join(mockHome, '.gemini-profiles');
  const linkPath = path.join(mockHome, '.gemini');

  beforeEach(() => {
    vi.resetAllMocks();
    mockedOs.homedir.mockReturnValue(mockHome);
  });

  describe('ensureMigrated', () => {
    it('should migrate old directory to default profile', () => {
      mockedFs.existsSync.mockImplementation((p) => {
        if (p === profilesDir) return false;
        if (p === linkPath) return true;
        return false;
      });
      mockedFs.lstatSync.mockReturnValue({
        isSymbolicLink: () => false,
      } as unknown as fs.Stats);

      ensureMigrated();

      expect(mockedFs.mkdirSync).toHaveBeenCalledWith(profilesDir, {
        recursive: true,
      });
      expect(mockedFs.renameSync).toHaveBeenCalledWith(
        linkPath,
        path.join(profilesDir, 'default'),
      );
      expect(mockedFs.symlinkSync).toHaveBeenCalledWith(
        path.join(profilesDir, 'default'),
        linkPath,
        'dir',
      );
    });

    it('should backup old directory if default profile already exists', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.lstatSync.mockReturnValue({
        isSymbolicLink: () => false,
      } as unknown as fs.Stats);

      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      ensureMigrated();

      expect(mockedFs.renameSync).toHaveBeenCalledWith(
        linkPath,
        expect.stringContaining('backup-'),
      );
      expect(mockedFs.symlinkSync).toHaveBeenCalledWith(
        path.join(profilesDir, 'default'),
        linkPath,
        'dir',
      );
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should do nothing if already migrated', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.lstatSync.mockReturnValue({
        isSymbolicLink: () => true,
      } as unknown as fs.Stats);

      ensureMigrated();

      expect(mockedFs.renameSync).not.toHaveBeenCalled();
      expect(mockedFs.symlinkSync).not.toHaveBeenCalled();
    });

    it('should create default profile if nothing exists', () => {
      mockedFs.existsSync.mockReturnValue(false);

      ensureMigrated();

      expect(mockedFs.mkdirSync).toHaveBeenCalledWith(
        path.join(profilesDir, 'default'),
        { recursive: true },
      );
      expect(mockedFs.symlinkSync).toHaveBeenCalledWith(
        path.join(profilesDir, 'default'),
        linkPath,
        'dir',
      );
    });
  });

  describe('listProfiles', () => {
    it('should return default if root dir does not exist', () => {
      mockedFs.existsSync.mockReturnValue(false);
      expect(listProfiles()).toEqual(['default']);
    });

    it('should list directories in profiles root', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readdirSync.mockReturnValue([
        'default',
        'work',
        'file.txt',
      ] as unknown as string[]);
      mockedFs.statSync.mockImplementation(
        (p) =>
          ({
            isDirectory: () => !p.toString().endsWith('file.txt'),
          }) as unknown as fs.Stats,
      );

      expect(listProfiles()).toEqual(['default', 'work']);
    });
  });

  describe('createProfile', () => {
    it('should create a new directory', () => {
      mockedFs.existsSync.mockReturnValue(false);

      createProfile('work');

      expect(mockedFs.mkdirSync).toHaveBeenCalledWith(
        path.join(profilesDir, 'work'),
        { recursive: true },
      );
    });

    it('should throw if profile exists', () => {
      mockedFs.existsSync.mockReturnValue(true);

      expect(() => createProfile('work')).toThrow(
        "Profile 'work' already exists.",
      );
    });

    it('should copy from source profile if requested', () => {
      mockedFs.existsSync.mockImplementation((p) => {
        if (p === path.join(profilesDir, 'work')) return false;
        if (p === path.join(profilesDir, 'default')) return true;
        return false;
      });

      mockedFs.readdirSync.mockReturnValue([
        'settings.json',
      ] as unknown as string[]);
      mockedFs.statSync.mockImplementation(
        (p) =>
          ({
            isDirectory: () =>
              p.toString() === path.join(profilesDir, 'default'),
          }) as unknown as fs.Stats,
      );

      createProfile('work', 'default');

      expect(mockedFs.mkdirSync).toHaveBeenCalledWith(
        path.join(profilesDir, 'work'),
        { recursive: true },
      );
      expect(mockedFs.copyFileSync).toHaveBeenCalledWith(
        path.join(profilesDir, 'default', 'settings.json'),
        path.join(profilesDir, 'work', 'settings.json'),
      );
    });
  });

  describe('switchProfile', () => {
    it('should update symlink', () => {
      mockedFs.existsSync.mockReturnValue(true);

      switchProfile('work');

      expect(mockedFs.unlinkSync).toHaveBeenCalledWith(linkPath);
      expect(mockedFs.symlinkSync).toHaveBeenCalledWith(
        path.join(profilesDir, 'work'),
        linkPath,
        'dir',
      );
    });

    it('should throw if profile does not exist', () => {
      mockedFs.existsSync.mockReturnValue(false);

      expect(() => switchProfile('work')).toThrow(
        "Profile 'work' does not exist.",
      );
    });
  });

  describe('deleteProfile', () => {
    it('should delete directory', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readlinkSync.mockReturnValue(path.join(profilesDir, 'default'));

      deleteProfile('work');

      expect(mockedFs.rmSync).toHaveBeenCalledWith(
        path.join(profilesDir, 'work'),
        { recursive: true, force: true },
      );
    });

    it('should throw if deleting default', () => {
      expect(() => deleteProfile('default')).toThrow(
        "Cannot delete the 'default' profile.",
      );
    });

    it('should throw if deleting active profile', () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.lstatSync.mockReturnValue({
        isSymbolicLink: () => true,
      } as unknown as fs.Stats);
      mockedFs.readlinkSync.mockReturnValue(path.join(profilesDir, 'work'));

      expect(() => deleteProfile('work')).toThrow(
        'Cannot delete the active profile.',
      );
    });
  });
});
