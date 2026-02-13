/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  EDIT_TOOL_NAMES,
  EDIT_TOOL_NAME,
  HASHLINE_EDIT_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
  ALL_BUILTIN_TOOL_NAMES,
  getToolAliases,
} from './tool-names.js';

describe('hashline tool-names regression', () => {
  it('EDIT_TOOL_NAMES includes hashline_edit', () => {
    expect(EDIT_TOOL_NAMES.has(HASHLINE_EDIT_TOOL_NAME)).toBe(true);
  });

  it('EDIT_TOOL_NAMES includes legacy replace', () => {
    expect(EDIT_TOOL_NAMES.has(EDIT_TOOL_NAME)).toBe(true);
  });

  it('EDIT_TOOL_NAMES includes write_file', () => {
    expect(EDIT_TOOL_NAMES.has(WRITE_FILE_TOOL_NAME)).toBe(true);
  });

  it('ALL_BUILTIN_TOOL_NAMES includes hashline_edit', () => {
    expect(
      (ALL_BUILTIN_TOOL_NAMES as readonly string[]).includes(
        HASHLINE_EDIT_TOOL_NAME,
      ),
    ).toBe(true);
  });

  it('getToolAliases resolves replace to hashline_edit', () => {
    const aliases = getToolAliases(EDIT_TOOL_NAME);
    expect(aliases).toContain(HASHLINE_EDIT_TOOL_NAME);
    expect(aliases).toContain(EDIT_TOOL_NAME);
  });

  it('getToolAliases resolves hashline_edit to replace', () => {
    const aliases = getToolAliases(HASHLINE_EDIT_TOOL_NAME);
    expect(aliases).toContain(EDIT_TOOL_NAME);
    expect(aliases).toContain(HASHLINE_EDIT_TOOL_NAME);
  });
});
