# SOL CSV Sync (Supplier Updates)

Shopify embedded app for bulk importing supplier CSVs to update inventory and pricing. It supports flexible column mapping, previews with margin analysis, and batched updates with progress/error reporting.

## Core Features

- Upload and parse supplier CSVs
- Map SKU, cost, and stock-on-hand columns (flexible headers)
- Stock-only or stock + pricing update modes
- Preview changes with margin calculations
- Batch processing with progress tracking and results summary

## Local Development

### Prerequisites

- Node.js 20+
- Shopify CLI
- A Shopify Partner account and dev store

### Setup

```sh
npm install
```

If you are linking to an existing Shopify app config:

```sh
npm run config:link
```

Initialize the database (Prisma):

```sh
npm run setup
```

### Run

```sh
npm run dev
```

The Shopify CLI will open a tunnel and provide a URL to install the app in your dev store (press `P` in the CLI to open).

## Useful Commands

```sh
npm run lint
npm run typecheck
npm run build
```
