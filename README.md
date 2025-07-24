# Auk

A monorepo containing the Auk core library and addons.

## Packages

- [@auk/core](./core) - The core Auk library
- [@auk/addons](./addons) - Additional functionality for Auk

You can find relevant documentation for each package in its respective README.

## Development

### Setup

```bash
# Install dependencies
bun install
```

### Building

```bash
# Build all packages
bun run build

# Build specific package
bun run build:core
bun run build:addons
```

### Testing

```bash
bun test
```

## Versioning and Publishing

This project uses [Changesets](https://github.com/changesets/changesets) for versioning and publishing.

### Creating a changeset

After making changes to the codebase:

```bash
bun changeset
```

Follow the prompts to select which packages have changed and what type of version change is needed (patch, minor, major). Write a summary of the changes and commit the generated changeset file along with your changes.

### Publishing

When it's time to release:

```bash
# Update package versions and changelogs
bun run version

# Build and publish packages to npm
bun run release
```

## CI/CD

The project includes GitHub Actions workflows for:

- CI: Runs on pull requests to validate builds and tests
- Release: Automatically creates release PRs or publishes to npm when changes are merged to main

## NPM Packages

The packages are published to npm as:

- [@auk/core](https://www.npmjs.com/package/@auk/core)
- [@auk/addons](https://www.npmjs.com/package/@auk/addons)

## Installation

```bash
# Install core package
bun add @auk/core

# Install addons package
bun add @auk/addons
```