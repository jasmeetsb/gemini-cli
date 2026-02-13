/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolDefinition } from './types.js';
import * as os from 'node:os';

// Centralized tool names to avoid circular dependencies
export const GLOB_TOOL_NAME = 'glob';
export const GREP_TOOL_NAME = 'grep_search';
export const LS_TOOL_NAME = 'list_directory';
export const READ_FILE_TOOL_NAME = 'read_file';
export const SHELL_TOOL_NAME = 'run_shell_command';
export const WRITE_FILE_TOOL_NAME = 'write_file';
export const EDIT_TOOL_NAME = 'replace';
export const HASHLINE_EDIT_TOOL_NAME = 'hashline_edit';
export const WEB_SEARCH_TOOL_NAME = 'google_web_search';

// ============================================================================
// READ_FILE TOOL
// ============================================================================

export const READ_FILE_DEFINITION: ToolDefinition = {
  base: {
    name: READ_FILE_TOOL_NAME,
    description: `Reads and returns the content of a specified file. If the file is large, the content will be truncated. The tool's response will clearly indicate if truncation has occurred and will provide details on how to read more of the file using the 'offset' and 'limit' parameters. Handles text, images (PNG, JPG, GIF, WEBP, SVG, BMP), audio files (MP3, WAV, AIFF, AAC, OGG, FLAC), and PDF files. For text files, it can read specific line ranges.`,
    parametersJsonSchema: {
      type: 'object',
      properties: {
        file_path: {
          description: 'The path to the file to read.',
          type: 'string',
        },
        offset: {
          description:
            "Optional: For text files, the 0-based line number to start reading from. Requires 'limit' to be set. Use for paginating through large files.",
          type: 'number',
        },
        limit: {
          description:
            "Optional: For text files, maximum number of lines to read. Use with 'offset' to paginate through large files. If omitted, reads the entire file (if feasible, up to a default limit).",
          type: 'number',
        },
      },
      required: ['file_path'],
    },
  },
};

// ============================================================================
// WRITE_FILE TOOL
// ============================================================================

export const WRITE_FILE_DEFINITION: ToolDefinition = {
  base: {
    name: WRITE_FILE_TOOL_NAME,
    description: `Writes content to a specified file in the local filesystem.

      The user has the ability to modify \`content\`. If modified, this will be stated in the response.`,
    parametersJsonSchema: {
      type: 'object',
      properties: {
        file_path: {
          description: 'The path to the file to write to.',
          type: 'string',
        },
        content: {
          description: 'The content to write to the file.',
          type: 'string',
        },
      },
      required: ['file_path', 'content'],
    },
  },
};

// ============================================================================
// GREP TOOL
// ============================================================================

export const GREP_DEFINITION: ToolDefinition = {
  base: {
    name: GREP_TOOL_NAME,
    description:
      'Searches for a regular expression pattern within file contents. Max 100 matches.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        pattern: {
          description: `The regular expression (regex) pattern to search for within file contents (e.g., 'function\\s+myFunction', 'import\\s+\\{.*\\}\\s+from\\s+.*').`,
          type: 'string',
        },
        dir_path: {
          description:
            'Optional: The absolute path to the directory to search within. If omitted, searches the current working directory.',
          type: 'string',
        },
        include: {
          description: `Optional: A glob pattern to filter which files are searched (e.g., '*.js', '*.{ts,tsx}', 'src/**'). If omitted, searches all files (respecting potential global ignores).`,
          type: 'string',
        },
        exclude_pattern: {
          description:
            'Optional: A regular expression pattern to exclude from the search results. If a line matches both the pattern and the exclude_pattern, it will be omitted.',
          type: 'string',
        },
        names_only: {
          description:
            'Optional: If true, only the file paths of the matches will be returned, without the line content or line numbers. This is useful for gathering a list of files.',
          type: 'boolean',
        },
        max_matches_per_file: {
          description:
            'Optional: Maximum number of matches to return per file. Use this to prevent being overwhelmed by repetitive matches in large files.',
          type: 'integer',
          minimum: 1,
        },
        total_max_matches: {
          description:
            'Optional: Maximum number of total matches to return. Use this to limit the overall size of the response. Defaults to 100 if omitted.',
          type: 'integer',
          minimum: 1,
        },
      },
      required: ['pattern'],
    },
  },
};

// ============================================================================
// RIP_GREP TOOL
// ============================================================================

export const RIP_GREP_DEFINITION: ToolDefinition = {
  base: {
    name: GREP_TOOL_NAME,
    description:
      'Searches for a regular expression pattern within file contents.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        pattern: {
          description: `The pattern to search for. By default, treated as a Rust-flavored regular expression. Use '\\b' for precise symbol matching (e.g., '\\bMatchMe\\b').`,
          type: 'string',
        },
        dir_path: {
          description:
            "Directory or file to search. Directories are searched recursively. Relative paths are resolved against current working directory. Defaults to current working directory ('.') if omitted.",
          type: 'string',
        },
        include: {
          description:
            "Glob pattern to filter files (e.g., '*.ts', 'src/**'). Recommended for large repositories to reduce noise. Defaults to all files if omitted.",
          type: 'string',
        },
        exclude_pattern: {
          description:
            'Optional: A regular expression pattern to exclude from the search results. If a line matches both the pattern and the exclude_pattern, it will be omitted.',
          type: 'string',
        },
        names_only: {
          description:
            'Optional: If true, only the file paths of the matches will be returned, without the line content or line numbers. This is useful for gathering a list of files.',
          type: 'boolean',
        },
        case_sensitive: {
          description:
            'If true, search is case-sensitive. Defaults to false (ignore case) if omitted.',
          type: 'boolean',
        },
        fixed_strings: {
          description:
            'If true, treats the `pattern` as a literal string instead of a regular expression. Defaults to false (basic regex) if omitted.',
          type: 'boolean',
        },
        context: {
          description:
            'Show this many lines of context around each match (equivalent to grep -C). Defaults to 0 if omitted.',
          type: 'integer',
        },
        after: {
          description:
            'Show this many lines after each match (equivalent to grep -A). Defaults to 0 if omitted.',
          type: 'integer',
          minimum: 0,
        },
        before: {
          description:
            'Show this many lines before each match (equivalent to grep -B). Defaults to 0 if omitted.',
          type: 'integer',
          minimum: 0,
        },
        no_ignore: {
          description:
            'If true, searches all files including those usually ignored (like in .gitignore, build/, dist/, etc). Defaults to false if omitted.',
          type: 'boolean',
        },
        max_matches_per_file: {
          description:
            'Optional: Maximum number of matches to return per file. Use this to prevent being overwhelmed by repetitive matches in large files.',
          type: 'integer',
          minimum: 1,
        },
        total_max_matches: {
          description:
            'Optional: Maximum number of total matches to return. Use this to limit the overall size of the response. Defaults to 100 if omitted.',
          type: 'integer',
          minimum: 1,
        },
      },
      required: ['pattern'],
    },
  },
};

// ============================================================================
// WEB_SEARCH TOOL
// ============================================================================

export const WEB_SEARCH_DEFINITION: ToolDefinition = {
  base: {
    name: WEB_SEARCH_TOOL_NAME,
    description:
      'Performs a web search using Google Search (via the Gemini API) and returns the results. This tool is useful for finding information on the internet based on a query.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to find information on the web.',
        },
      },
      required: ['query'],
    },
  },
};

// ============================================================================
// EDIT TOOL
// ============================================================================

export const EDIT_DEFINITION: ToolDefinition = {
  base: {
    name: EDIT_TOOL_NAME,
    description: `Replaces text within a file. By default, replaces a single occurrence, but can replace multiple occurrences when \`expected_replacements\` is specified. This tool requires providing significant context around the change to ensure precise targeting. Always use the ${READ_FILE_TOOL_NAME} tool to examine the file's current content before attempting a text replacement.
      
      The user has the ability to modify the \`new_string\` content. If modified, this will be stated in the response.
      
      Expectation for required parameters:
      1. \`old_string\` MUST be the exact literal text to replace (including all whitespace, indentation, newlines, and surrounding code etc.).
      2. \`new_string\` MUST be the exact literal text to replace \`old_string\` with (also including all whitespace, indentation, newlines, and surrounding code etc.). Ensure the resulting code is correct and idiomatic and that \`old_string\` and \`new_string\` are different.
      3. \`instruction\` is the detailed instruction of what needs to be changed. It is important to Make it specific and detailed so developers or large language models can understand what needs to be changed and perform the changes on their own if necessary. 
      4. NEVER escape \`old_string\` or \`new_string\`, that would break the exact literal text requirement.
      **Important:** If ANY of the above are not satisfied, the tool will fail. CRITICAL for \`old_string\`: Must uniquely identify the single instance to change. Include at least 3 lines of context BEFORE and AFTER the target text, matching whitespace and indentation precisely. If this string matches multiple locations, or does not match exactly, the tool will fail.
      5. Prefer to break down complex and long changes into multiple smaller atomic calls to this tool. Always check the content of the file after changes or not finding a string to match.
      **Multiple replacements:** Set \`expected_replacements\` to the number of occurrences you want to replace. The tool will replace ALL occurrences that match \`old_string\` exactly. Ensure the number of replacements matches your expectation.`,
    parametersJsonSchema: {
      type: 'object',
      properties: {
        file_path: {
          description: 'The path to the file to modify.',
          type: 'string',
        },
        instruction: {
          description: `A clear, semantic instruction for the code change, acting as a high-quality prompt for an expert LLM assistant. It must be self-contained and explain the goal of the change.

A good instruction should concisely answer:
1.  WHY is the change needed? (e.g., "To fix a bug where users can be null...")
2.  WHERE should the change happen? (e.g., "...in the 'renderUserProfile' function...")
3.  WHAT is the high-level change? (e.g., "...add a null check for the 'user' object...")
4.  WHAT is the desired outcome? (e.g., "...so that it displays a loading spinner instead of crashing.")

**GOOD Example:** "In the 'calculateTotal' function, correct the sales tax calculation by updating the 'taxRate' constant from 0.05 to 0.075 to reflect the new regional tax laws."

**BAD Examples:**
- "Change the text." (Too vague)
- "Fix the bug." (Doesn't explain the bug or the fix)
- "Replace the line with this new line." (Brittle, just repeats the other parameters)
`,
          type: 'string',
        },
        old_string: {
          description:
            'The exact literal text to replace, preferably unescaped. For single replacements (default), include at least 3 lines of context BEFORE and AFTER the target text, matching whitespace and indentation precisely. If this string is not the exact literal text (i.e. you escaped it) or does not match exactly, the tool will fail.',
          type: 'string',
        },
        new_string: {
          description:
            'The exact literal text to replace `old_string` with, preferably unescaped. Provide the EXACT text. Ensure the resulting code is correct and idiomatic.',
          type: 'string',
        },
        expected_replacements: {
          type: 'number',
          description:
            'Number of replacements expected. Defaults to 1 if not specified. Use when you want to replace multiple occurrences.',
          minimum: 1,
        },
      },
      required: ['file_path', 'instruction', 'old_string', 'new_string'],
    },
  },
};

// ============================================================================
// HASHLINE_EDIT TOOL
// ============================================================================

export const HASHLINE_EDIT_DEFINITION: ToolDefinition = {
  base: {
    name: HASHLINE_EDIT_TOOL_NAME,
    description: `Edits a file using hashline anchors. Each line in files read by ${READ_FILE_TOOL_NAME} is tagged with a format \`{line}:{hash}|\` prefix. Use these anchors to precisely identify lines to edit without reproducing exact text.

Operations (provide as an array):
- **set_line**: Replace a single line. Params: \`{ op: "set_line", anchor: "LINE:HASH", new_text: "replacement text" }\`
- **replace_lines**: Replace a range of lines (inclusive). Params: \`{ op: "replace_lines", start_anchor: "LINE:HASH", end_anchor: "LINE:HASH", new_text: "replacement" }\`. Omit \`end_anchor\` to replace just the start line. Omit \`new_text\` to delete the range.
- **insert_after**: Insert text after an anchor line. Params: \`{ op: "insert_after", anchor: "LINE:HASH", text: "new text to insert" }\`
- **replace**: Fallback exact string replacement (no anchors needed). Params: \`{ op: "replace", old_text: "exact old", new_text: "exact new", all: true }\`. Set \`all: true\` to replace all occurrences; default replaces only the first.

Anchor format is \`LINE:HASH\` as shown when you read the file (e.g., \`42:a3f\`). If the file has changed since you read it, anchors may not match and you will receive updated references to retry with.

**Important:**
- Operations must target lines in ascending order (earliest line first). For example, if editing lines 10, 25, and 40, list the operations in that order.
- Do NOT mix anchor-based operations (set_line, replace_lines, insert_after) with fallback replace in a single call. Use separate calls for each type.

The user has the ability to modify edit content. If modified, this will be stated in the response.`,
    parametersJsonSchema: {
      type: 'object',
      properties: {
        file_path: {
          description:
            'Path to the file to modify (absolute or relative to project root).',
          type: 'string',
        },
        instruction: {
          description: `A clear, semantic instruction for the code change. Explain WHY, WHERE, WHAT, and the desired OUTCOME.`,
          type: 'string',
        },
        operations: {
          description:
            'Array of edit operations to apply sequentially. Maximum 50 operations per call.',
          type: 'array',
          maxItems: 50,
          items: {
            type: 'object',
            properties: {
              op: {
                type: 'string',
                enum: ['set_line', 'replace_lines', 'insert_after', 'replace'],
                description: 'The operation type.',
              },
              anchor: {
                type: 'string',
                description:
                  'Line anchor (LINE:HASH) for set_line and insert_after.',
              },
              start_anchor: {
                type: 'string',
                description: 'Start line anchor for replace_lines.',
              },
              end_anchor: {
                type: 'string',
                description:
                  'End line anchor for replace_lines (inclusive). Omit to target only start line.',
              },
              new_text: {
                type: 'string',
                description:
                  'Replacement text for set_line and replace_lines.',
              },
              text: {
                type: 'string',
                description: 'Text to insert for insert_after.',
              },
              old_text: {
                type: 'string',
                description: 'Exact text to find for replace operation.',
              },
              all: {
                type: 'boolean',
                description:
                  'If true, replace all occurrences. Default: false (first only).',
              },
            },
            required: ['op'],
          },
        },
      },
      required: ['file_path', 'instruction', 'operations'],
    },
  },
};

// NOTE: The operation items schema uses a flat `required: ['op']` rather than
// discriminated `oneOf` per operation type. This is intentional — simpler schemas
// produce fewer model-side tool-calling failures. Per-op required fields (e.g.,
// `anchor` for `set_line`) are validated at runtime with clear error messages.

// ============================================================================
// GLOB TOOL
// ============================================================================

export const GLOB_DEFINITION: ToolDefinition = {
  base: {
    name: GLOB_TOOL_NAME,
    description:
      'Efficiently finds files matching specific glob patterns (e.g., `src/**/*.ts`, `**/*.md`), returning absolute paths sorted by modification time (newest first). Ideal for quickly locating files based on their name or path structure, especially in large codebases.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        pattern: {
          description:
            "The glob pattern to match against (e.g., '**/*.py', 'docs/*.md').",
          type: 'string',
        },
        dir_path: {
          description:
            'Optional: The absolute path to the directory to search within. If omitted, searches the root directory.',
          type: 'string',
        },
        case_sensitive: {
          description:
            'Optional: Whether the search should be case-sensitive. Defaults to false.',
          type: 'boolean',
        },
        respect_git_ignore: {
          description:
            'Optional: Whether to respect .gitignore patterns when finding files. Only available in git repositories. Defaults to true.',
          type: 'boolean',
        },
        respect_gemini_ignore: {
          description:
            'Optional: Whether to respect .geminiignore patterns when finding files. Defaults to true.',
          type: 'boolean',
        },
      },
      required: ['pattern'],
    },
  },
};

// ============================================================================
// LS TOOL
// ============================================================================

export const LS_DEFINITION: ToolDefinition = {
  base: {
    name: LS_TOOL_NAME,
    description:
      'Lists the names of files and subdirectories directly within a specified directory path. Can optionally ignore entries matching provided glob patterns.',
    parametersJsonSchema: {
      type: 'object',
      properties: {
        dir_path: {
          description: 'The path to the directory to list',
          type: 'string',
        },
        ignore: {
          description: 'List of glob patterns to ignore',
          items: {
            type: 'string',
          },
          type: 'array',
        },
        file_filtering_options: {
          description:
            'Optional: Whether to respect ignore patterns from .gitignore or .geminiignore',
          type: 'object',
          properties: {
            respect_git_ignore: {
              description:
                'Optional: Whether to respect .gitignore patterns when listing files. Only available in git repositories. Defaults to true.',
              type: 'boolean',
            },
            respect_gemini_ignore: {
              description:
                'Optional: Whether to respect .geminiignore patterns when listing files. Defaults to true.',
              type: 'boolean',
            },
          },
        },
      },
      required: ['dir_path'],
    },
  },
};

// ============================================================================
// SHELL TOOL
// ============================================================================

/**
 * Generates the platform-specific description for the shell tool.
 */
export function getShellToolDescription(
  enableInteractiveShell: boolean,
  enableEfficiency: boolean,
): string {
  const efficiencyGuidelines = enableEfficiency
    ? `

      Efficiency Guidelines:
      - Quiet Flags: Always prefer silent or quiet flags (e.g., \`npm install --silent\`, \`git --no-pager\`) to reduce output volume while still capturing necessary information.
      - Pagination: Always disable terminal pagination to ensure commands terminate (e.g., use \`git --no-pager\`, \`systemctl --no-pager\`, or set \`PAGER=cat\`).`
    : '';

  const returnedInfo = `

      The following information is returned:

      Output: Combined stdout/stderr. Can be \`(empty)\` or partial on error and for any unwaited background processes.
      Exit Code: Only included if non-zero (command failed).
      Error: Only included if a process-level error occurred (e.g., spawn failure).
      Signal: Only included if process was terminated by a signal.
      Background PIDs: Only included if background processes were started.
      Process Group PGID: Only included if available.`;

  if (os.platform() === 'win32') {
    const backgroundInstructions = enableInteractiveShell
      ? 'To run a command in the background, set the `is_background` parameter to true. Do NOT use PowerShell background constructs.'
      : 'Command can start background processes using PowerShell constructs such as `Start-Process -NoNewWindow` or `Start-Job`.';
    return `This tool executes a given shell command as \`powershell.exe -NoProfile -Command <command>\`. ${backgroundInstructions}${efficiencyGuidelines}${returnedInfo}`;
  } else {
    const backgroundInstructions = enableInteractiveShell
      ? 'To run a command in the background, set the `is_background` parameter to true. Do NOT use `&` to background commands.'
      : 'Command can start background processes using `&`.';
    return `This tool executes a given shell command as \`bash -c <command>\`. ${backgroundInstructions} Command is executed as a subprocess that leads its own process group. Command process group can be terminated as \`kill -- -PGID\` or signaled as \`kill -s SIGNAL -- -PGID\`.${efficiencyGuidelines}${returnedInfo}`;
  }
}

/**
 * Returns the platform-specific description for the 'command' parameter.
 */
export function getCommandDescription(): string {
  if (os.platform() === 'win32') {
    return 'Exact command to execute as `powershell.exe -NoProfile -Command <command>`';
  }
  return 'Exact bash command to execute as `bash -c <command>`';
}

/**
 * Returns the tool definition for the shell tool, customized for the platform.
 */
export function getShellDefinition(
  enableInteractiveShell: boolean,
  enableEfficiency: boolean,
): ToolDefinition {
  return {
    base: {
      name: SHELL_TOOL_NAME,
      description: getShellToolDescription(
        enableInteractiveShell,
        enableEfficiency,
      ),
      parametersJsonSchema: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: getCommandDescription(),
          },
          description: {
            type: 'string',
            description:
              'Brief description of the command for the user. Be specific and concise. Ideally a single sentence. Can be up to 3 sentences for clarity. No line breaks.',
          },
          dir_path: {
            type: 'string',
            description:
              '(OPTIONAL) The path of the directory to run the command in. If not provided, the project root directory is used. Must be a directory within the workspace and must already exist.',
          },
          is_background: {
            type: 'boolean',
            description:
              'Set to true if this command should be run in the background (e.g. for long-running servers or watchers). The command will be started, allowed to run for a brief moment to check for immediate errors, and then moved to the background.',
          },
        },
        required: ['command'],
      },
    },
  };
}
