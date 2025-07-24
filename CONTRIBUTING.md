# Contributing to Auk

Thank you for your interest in contributing to Auk! This document provides guidelines and instructions for contributing to this project.

## Development Workflow

1. Fork the repository and clone it to your local machine
2. Install dependencies with `bun install`
3. Create a new branch for your changes
4. Make your changes
5. Run tests with `bun test`
6. Create a changeset (see below)
7. Commit your changes and push to your fork
8. Open a pull request

## Changesets

This project uses [Changesets](https://github.com/changesets/changesets) for versioning and publishing. Changesets are a way to manage versioning and changelogs for monorepos.

### Creating a Changeset

After making changes to the codebase:

```bash
bun changeset
```

This will prompt you to:

1. Select which packages have changed
2. Choose what type of version change is needed for each package:
   - `patch`: for backwards-compatible bug fixes
   - `minor`: for backwards-compatible new features
   - `major`: for breaking changes
3. Write a summary of the changes

The command will generate a markdown file in the `.changeset` directory. Commit this file along with your changes.

### Versioning Rules

Follow [Semantic Versioning](https://semver.org/) principles:

- **Patch** (`0.0.x`): Bug fixes and minor changes that don't affect the API
- **Minor** (`0.x.0`): New features that don't break existing functionality
- **Major** (`x.0.0`): Breaking changes that require users to update their code

## Code Style

This project uses [Biome](https://biomejs.dev/) for code formatting and linting. Ensure your code follows the project's style guidelines by running:

```bash
bun biome check --apply .
```

## Pull Request Process

1. Update the README.md or documentation with details of changes if appropriate
2. Include a changeset describing your changes
3. The PR will be merged once it passes CI checks and receives approval from maintainers

## Release Process

Releases are handled automatically by the CI/CD pipeline:

1. When changes are merged to the main branch, a GitHub Action will either:
   - Create a PR to update package versions and changelogs (if there are unreleased changesets)
   - Publish the packages to npm (if the version PR was merged)

## Getting Help

If you have questions or need help, please open an issue on GitHub.