/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawnAsync } from './shell-utils.js';
import ts from 'typescript';
import { getLanguageFromFilePath } from './language-detection.js';

/**
 * Validates Python syntax using `python3 -m py_compile`.
 */
async function validatePython(content: string): Promise<{ valid: boolean; error?: string }> {
  try {
    await spawnAsync('python3', ['-c', 'import sys; compile(sys.stdin.read(), "<stdin>", "exec")'], { stdin: content });
    return { valid: true };
  } catch (error: unknown) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown Python syntax error',
    };
  }
}

/**
 * Validates TypeScript syntax using `typescript` API.
 */
async function validateTypeScript(content: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const sourceFile = ts.createSourceFile(
      'temp.ts',
      content,
      ts.ScriptTarget.Latest,
      true // SetParentNodes
    );
    
    // Check for diagnostics using parseDiagnostics directly to be quick.

    // Wait, getPreEmitDiagnostics might be too heavy as it needs a program.
    // Let's see if we can just check syntactic diagnostics from the source file.
    // sourceFile has parseDiagnostics.
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parseDiagnostics = (sourceFile as any).parseDiagnostics;
    if (parseDiagnostics && parseDiagnostics.length > 0) {
      const messages = parseDiagnostics.map((d) => {
        const message = ts.flattenDiagnosticMessageText(d.messageText, '\n');
        if (d.file) {
          const { line, character } = ts.getLineAndCharacterOfPosition(d.file, d.start!);
          return `(${line + 1}:${character + 1}): ${message}`;
        }
        return message;
      });
      return {
        valid: false,
        error: messages.join('\n'),
      };
    }
    
    return { valid: true };
  } catch (error: unknown) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown TypeScript syntax error',
    };
  }
}

/**
 * Validates content based on file path.
 */
export async function validateContent(filePath: string, content: string): Promise<{ valid: boolean; error?: string }> {
  const language = getLanguageFromFilePath(filePath);
  
  if (language === 'python') {
    return validatePython(content);
  } else if (language === 'typescript') {
    return validateTypeScript(content);
  }
  
  // Default to valid for unsupported languages
  return { valid: true };
}
