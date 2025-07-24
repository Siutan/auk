# Changesets

This directory contains configuration and temporary files for [Changesets](https://github.com/changesets/changesets), a tool for managing versioning and changelogs.

## How to use

1. Make your changes to the codebase
2. Run `bun changeset` to create a new changeset
3. Follow the prompts to select which packages have changed and what type of version change is needed
4. Write a summary of the changes
5. Commit the generated changeset file along with your changes

When it's time to release:

1. Run `bun run version` to update package versions and changelogs
2. Run `bun run release` to build and publish the packages to npm

The CI pipeline will automatically handle versioning and publishing when changes are merged to the main branch.