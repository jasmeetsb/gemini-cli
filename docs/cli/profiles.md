# Profile Management

Gemini CLI supports managing multiple profiles, allowing you to switch between
different configurations, models, and project contexts easily.

## Overview

Profiles are useful when you work on different projects that require different
settings, or when you want to switch between different model configurations
(e.g., a "fast" profile using Gemini Flash and a "heavy" profile using Gemini
Pro).

## CLI Commands

Manage profiles using the `gemini profile` command from your terminal.

| Command                                        | Description                           | Example                                         |
| ---------------------------------------------- | ------------------------------------- | ----------------------------------------------- |
| `gemini profile create <name>`                 | Create a new profile                  | `gemini profile create work`                    |
| `gemini profile create <name> --from <source>` | Create a profile copying from another | `gemini profile create personal --from default` |
| `gemini profile list`                          | List all available profiles           | `gemini profile list`                           |
| `gemini profile use <name>`                    | Switch to a specific profile          | `gemini profile use work`                       |
| `gemini profile delete <name>`                 | Delete a profile                      | `gemini profile delete personal`                |

## Quickstart Examples

### 1. Create and use a new profile

To create a new profile named `research`:

```shell
gemini profile create research
```

To switch to this profile:

```shell
gemini profile use research
```

### 2. Copy an existing profile

If you have a well-configured `default` profile and want to create a `coding`
profile based on it:

```shell
gemini profile create coding --from default
```

### 3. List profiles

To see all your profiles and find out which one is currently active:

```shell
gemini profile list
```

The active profile will be highlighted or marked in the output.
