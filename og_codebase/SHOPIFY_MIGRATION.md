# OpenCart Supplier Updates → Shopify React App Migration Guide

> **Purpose**: Bulk import and update product data (stock and pricing) from supplier CSV files  
> **Target Stack**: Shopify App (React Router + Polaris Web Components + GraphQL)  
> **Source Stack**: OpenCart 3.x (PHP + Vue.js 3 + MySQL)

---

## Table of Contents

1. [Plugin Overview](#1-plugin-overview)
2. [Core Features](#2-core-features)
3. [User Workflow](#3-user-workflow)
4. [Data Models](#4-data-models)
5. [State Management](#5-state-management)
6. [API Mapping: OpenCart → Shopify GraphQL](#6-api-mapping-opencart--shopify-graphql)
7. [Component Mapping: Vue → React/Polaris](#7-component-mapping-vue--reactpolaris)
8. [Business Logic](#8-business-logic)
9. [Implementation Guide](#9-implementation-guide)
10. [File Structure](#10-file-structure)

---

## 1. Plugin Overview

### What It Does

The Supplier Updates plugin enables store administrators to:

1. **Upload a CSV file** from a supplier containing SKU, cost price, and stock on hand (SOH)
2. **Map CSV columns** to required fields (flexible column naming)
3. **Choose update action**: Stock only OR Stock + Pricing
4. **Preview changes** with profit margin analysis before applying
5. **Batch update** products with progress tracking

### Key Value Propositions

- **Flexible CSV mapping** – Works with any supplier format
- **Margin visualization** – Color-coded profit margins help identify pricing issues
- **Safe batch processing** – Preview before commit, progress tracking, error recovery
- **Performance optimized** – Virtual scrolling for large datasets, 100-item batches

---

## 2. Core Features

| Feature           | Description                                             | Priority |
| ----------------- | ------------------------------------------------------- | -------- |
| CSV Import        | Upload and parse CSV with flexible column mapping       | P0       |
| Field Mapping     | Map SKU, Cost, SOH columns from any CSV structure       | P0       |
| Product Lookup    | Query products by SKU, retrieve current data            | P0       |
| Stock Update      | Batch update inventory quantities                       | P0       |
| Pricing Update    | Batch update cost and retail price                      | P0       |
| Margin Analysis   | Calculate and display profit margins with color coding  | P1       |
| Price Editor      | Inline price adjustments before committing              | P1       |
| Batch Progress    | Visual progress during updates                          | P1       |
| Virtual Scrolling | Lazy-load large product tables                          | P2       |
| Filter by Margin  | Filter products by margin status (good/medium/negative) | P2       |

---

## 3. User Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SUPPLIER UPDATES WORKFLOW                          │
└─────────────────────────────────────────────────────────────────────────────┘

Step 1: CSV Upload
├── User uploads CSV file
├── Client-side parsing (no server upload needed)
└── Extract column headers for mapping

        ↓

Step 2: Field Mapping
├── Display dropdown for each required field:
│   ├── SKU Column (required)
│   ├── Cost Column (required)
│   └── SOH Column (optional - can mark N/A)
├── Show preview of first few rows
└── Validate all required fields mapped

        ↓

Step 3: Action Selection
├── Option A: "Stock Only" → Skip to batch stock update
└── Option B: "Stock & Pricing" → Fetch products, show pricing table

        ↓

Step 4a: Stock Update (if Stock Only)
├── Batch process in groups of 100
├── Compare current qty vs new qty
├── Skip unchanged items
├── Show progress: "Batch X of Y"
└── Display results: checked / found / updated counts

        ↓

Step 4b: Pricing Review (if Stock & Pricing)
├── Fetch all products by SKU from database
├── Display table with:
│   ├── Product image, name, SKU
│   ├── Current cost → New cost (with ↑/↓ indicator)
│   ├── Current price (editable)
│   ├── Calculated margin % (color-coded)
│   └── Update checkbox per row
├── Filter by margin status (All / Medium / Negative)
├── User can adjust prices inline
└── Click "Update Pricing" to commit

        ↓

Step 5: Results
├── Show success/failure counts
├── Display any errors
└── Option to start new import
```

---

## 4. Data Models

### 4.1 CSV Data Structure

```typescript
// After parsing CSV
interface CSVData {
  headers: string[] // First row - column names
  rows: string[][] // Remaining rows - data
}

// Field mapping configuration
interface CSVFieldMapping {
  sku: {
    label: string // "SKU"
    value: number | null // Column index, null if not mapped
  }
  cost: {
    label: string // "Cost"
    value: number | null
  }
  soh: {
    label: string // "SOH"
    value: number | 'none' // Column index, or 'none' if N/A
  }
}
```

### 4.2 Product Data (OpenCart → Shopify Mapping)

```typescript
// OpenCart Product (from oc_product table)
interface OpenCartProduct {
  product_id: number
  sku: string
  name: string // from oc_product_description
  image: string
  cost: number
  price: number
  quantity: number
}

// Shopify Product (from GraphQL - using nodes pattern)
interface ShopifyProduct {
  id: string // "gid://shopify/Product/123"
  title: string
  featuredImage: {
    url: string
  } | null
  variants: {
    nodes: Array<{
      id: string // "gid://shopify/ProductVariant/456"
      sku: string
      price: string
      inventoryItem: {
        id: string // "gid://shopify/InventoryItem/789"
        unitCost: {
          amount: string
          currencyCode: string
        } | null
      }
      inventoryQuantity: number
    }>
  }
}

// Normalized product for UI (works for both platforms)
interface NormalizedProduct {
  id: string
  variantId: string
  inventoryItemId: string
  sku: string
  name: string
  image: string

  // Current values (from database)
  cost: number
  price: number
  quantity: number

  // New values (from CSV)
  cost_new: number
  quantity_new: number

  // Calculated fields
  margin: number // Calculated: ((price / cost_new) * 100) - 100
  marginStatus: 'good' | 'medium' | 'negative'

  // UI state
  update: boolean // Should this product be updated?
  editing: {
    active: boolean
    timeout: NodeJS.Timeout | null
  }
}
```

### 4.3 Update State

```typescript
interface UpdateState {
  type: 'stock' | 'pricing' | null
  status: 'idle' | 'running' | 'complete'
}

interface BatchState {
  numberToUpdate: number // Items per batch (default: 100, Shopify: 15-20)
  page: number // Current batch number
  total: number // Total batches
}

interface UpdateResponse {
  sku: string
  updated: boolean
  message: string
  error?: string
}
```

---

## 5. State Management

### 5.1 Vue.js Original State (Reference)

The OpenCart plugin uses Vue 3's reactive `data()` function:

```javascript
// Original Vue state
data() {
  return {
    error: '',
    step: 'csv',                    // 'csv' | 'actions'
    csvData: [],                    // Parsed CSV rows
    csvFields: {
      sku:  { label: 'SKU',  value: null },
      soh:  { label: 'SOH',  value: null },
      cost: { label: 'Cost', value: null }
    },
    update: {
      type: null,                   // 'stock' | 'pricing'
      status: null                  // 'running' | 'complete'
    },
    updateResponses: [],            // Results from API calls
    batch: {
      numberToUpdate: 100,
      page: 1
    },
    pricing: {
      margin: 5,                    // Threshold percentage
      products: [],                 // Enriched product list
      filter: 'all'                 // 'all' | 'med' | 'neg'
    },
    editing: {}                     // Track editing state per product
  }
}
```

### 5.2 React Equivalent (useState)

```tsx
// React state - mirrors Vue structure exactly
function SupplierUpdates() {
  const [error, setError] = useState<string>('')
  const [step, setStep] = useState<'csv' | 'actions'>('csv')
  const [csvData, setCsvData] = useState<string[][]>([])

  const [csvFields, setCsvFields] = useState({
    sku: { label: 'SKU', value: null as number | null },
    soh: { label: 'SOH', value: null as number | 'none' | null },
    cost: { label: 'Cost', value: null as number | null }
  })

  const [update, setUpdate] = useState({
    type: null as 'stock' | 'pricing' | null,
    status: null as 'running' | 'complete' | null
  })

  const [updateResponses, setUpdateResponses] = useState<UpdateResponse[]>([])

  const [batch, setBatch] = useState({
    numberToUpdate: 20, // Lower for Shopify GraphQL limits
    page: 1
  })

  const [pricing, setPricing] = useState({
    margin: 5,
    products: [] as NormalizedProduct[],
    filter: 'all' as 'all' | 'med' | 'neg'
  })

  // ... component logic
}
```

### 5.3 Vue Computed → React useMemo

```tsx
// Vue computed properties → React useMemo equivalents

// Filter responses to only updated items
const updateResponsesUpdated = useMemo(
  () => updateResponses.filter((r) => r.updated),
  [updateResponses]
)

// Filter responses to non-updated items
const updateResponsesNotUpdated = useMemo(
  () => updateResponses.filter((r) => !r.updated),
  [updateResponses]
)

// Calculate total batches needed
const totalBatches = useMemo(
  () => Math.ceil(csvData.length / batch.numberToUpdate),
  [csvData.length, batch.numberToUpdate]
)

// Check if all required fields are mapped
const csvFieldsSelected = useMemo(
  () =>
    csvFields.sku.value !== null &&
    csvFields.cost.value !== null &&
    csvFields.soh.value !== null,
  [csvFields]
)

// Filter products by margin status
const pricingFilteredProducts = useMemo(() => {
  if (pricing.filter === 'all') return pricing.products
  if (pricing.filter === 'med') {
    return pricing.products.filter(
      (p) => p.margin > 0 && p.margin < pricing.margin
    )
  }
  if (pricing.filter === 'neg') {
    return pricing.products.filter((p) => p.margin < 0)
  }
  return pricing.products
}, [pricing.products, pricing.filter, pricing.margin])
```

---

## 6. API Mapping: OpenCart → Shopify GraphQL

### 6.1 Product Lookup by SKU

**OpenCart (PHP/MySQL):**

```php
// getProductsBySku()
$sql = "SELECT p.image, p.cost, p.price, p.product_id, p.quantity, p.sku, pd.name
        FROM " . DB_PREFIX . "product p
        LEFT JOIN " . DB_PREFIX . "product_description pd
          ON (p.product_id = pd.product_id)
        WHERE p.sku IN ('" . $skuList . "')";
```

**Shopify (GraphQL):**

```graphql
# Query products by SKU (batch of SKUs)
query getProductsBySku($query: String!) {
  products(first: 100, query: $query) {
    nodes {
      id
      title
      featuredImage {
        url(transform: { maxWidth: 40, maxHeight: 40 })
      }
      variants(first: 10) {
        nodes {
          id
          sku
          price
          inventoryQuantity
          inventoryItem {
            id
            unitCost {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
}

# Variables - build query string from SKU list
# { "query": "sku:SKU001 OR sku:SKU002 OR sku:SKU003" }
```

````

**Implementation Notes:**

- Shopify query string has character limits; batch SKU lookups in groups of ~50
- Cost is on `inventoryItem.unitCost`, not directly on variant
- Image URL can include transform parameters for resizing

### 6.2 Stock/Inventory Update

**OpenCart (PHP/MySQL):**

```php
// updatestock()
$sql = "UPDATE " . DB_PREFIX . "product
        SET quantity = '" . (int)$soh . "'
        WHERE sku = '" . $this->db->escape($sku) . "'";
````

**Shopify (GraphQL):**

```graphql
# Update inventory quantities
mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
  inventoryAdjustQuantities(input: $input) {
    inventoryAdjustmentGroup {
      createdAt
      reason
      changes {
        name
        delta
        quantityAfterChange
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

```json
// Variables
{
  "input": {
    "reason": "correction",
    "name": "available",
    "changes": [
      {
        "inventoryItemId": "gid://shopify/InventoryItem/123",
        "locationId": "gid://shopify/Location/456",
        "delta": 10
      },
      {
        "inventoryItemId": "gid://shopify/InventoryItem/124",
        "locationId": "gid://shopify/Location/456",
        "delta": -5
      }
    ]
  }
}
```

**Implementation Notes:**

- Shopify uses **delta** (difference), not absolute quantity
- Calculate: `delta = newQuantity - currentQuantity`
- Requires `locationId` - fetch default location first
- Can batch up to 100 inventory adjustments per mutation

### 6.3 Price Update

**OpenCart (PHP/MySQL):**

```php
// updatepricing()
$sql = "UPDATE " . DB_PREFIX . "product
        SET cost = '" . (float)$cost . "',
            price = '" . (float)$price . "'
        WHERE sku = '" . $this->db->escape($sku) . "'";
```

**Shopify (GraphQL):**

```graphql
# Update variant price AND cost together using productVariantsBulkUpdate
# This is the recommended approach for bulk pricing updates
mutation productVariantsBulkUpdate(
  $productId: ID!
  $variants: [ProductVariantsBulkInput!]!
) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    product {
      id
    }
    productVariants {
      id
      price
      inventoryItem {
        unitCost {
          amount
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

```json
// Variables - update price and cost for a variant
{
  "productId": "gid://shopify/Product/123",
  "variants": [
    {
      "id": "gid://shopify/ProductVariant/456",
      "price": "29.99",
      "inventoryItem": {
        "cost": 15.5
      }
    }
  ]
}
```

**Alternative: Update cost separately via inventoryItemUpdate:**

```graphql
# Update cost only (on inventory item)
mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
  inventoryItemUpdate(id: $id, input: $input) {
    inventoryItem {
      id
      unitCost {
        amount
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

```json
// Variables
{
  "id": "gid://shopify/InventoryItem/789",
  "input": {
    "cost": 15.5
  }
}
```

**Implementation Notes:**

- **Recommended**: Use `productVariantsBulkUpdate` to update price AND cost together
- The `inventoryItem.cost` field in `ProductVariantsBulkInput` updates the unit cost
- For cost-only updates, use `inventoryItemUpdate` mutation
- `productVariantsBulkUpdate` requires the parent `productId` - group variants by product

### 6.4 Get Default Location

```graphql
# Required for inventory adjustments
query getLocations {
  locations(first: 1) {
    nodes {
      id
      name
      isActive
    }
  }
}
```

---

## 7. Component Mapping: Vue → React/Polaris

### 7.1 Component Structure

| Vue Component         | React/Polaris Equivalent   | Notes                        |
| --------------------- | -------------------------- | ---------------------------- |
| `<div id="soUpload">` | `<Page>` + `<Card>`        | Main container               |
| `<input type="file">` | `<DropZone>`               | File upload                  |
| `<select>`            | `<Select>`                 | Column mapping dropdowns     |
| `<button>`            | `<Button>`                 | Action buttons               |
| `<table>`             | `<DataTable>`              | Product list with pagination |
| `<LazyList>`          | `<DataTable>` + pagination | Virtual scrolling equivalent |
| `<Loading>`           | `<Spinner>`                | Loading indicator            |
| Progress text         | `<ProgressBar>` + `<Text>` | Batch progress               |
| Margin colors         | `<Badge>`                  | Status indicators            |
| Error messages        | `<Banner critical>`        | Error display                |

### 7.2 Polaris Web Components Usage

Reference: https://shopify.dev/docs/api/app-home/polaris-web-components

```html
<!-- File Upload -->
<ui-drop-zone>
  <ui-text>Drop CSV file here or click to upload</ui-text>
</ui-drop-zone>

<!-- Column Mapping Select -->
<ui-select
  label="SKU Column"
  :options="columnOptions"
  @change="handleSkuSelect"
></ui-select>

<!-- Action Buttons -->
<ui-button-group>
  <ui-button @click="actionStock">Stock Only</ui-button>
  <ui-button
    variant="primary"
    @click="actionPricing"
    >Stock & Pricing</ui-button
  >
</ui-button-group>

<!-- Data Table -->
<ui-data-table
  :headings="['Image', 'Name', 'SKU', 'Cost', 'Price', 'Margin', 'Update']"
  :rows="tableRows"
></ui-data-table>

<!-- Progress -->
<ui-progress-bar :progress="progressPercent"></ui-progress-bar>

<!-- Status Badge -->
<ui-badge tone="success">Updated</ui-badge>
<ui-badge tone="warning">Medium Margin</ui-badge>
<ui-badge tone="critical">Negative Margin</ui-badge>

<!-- Loading -->
<ui-spinner></ui-spinner>

<!-- Error Banner -->
<ui-banner
  tone="critical"
  title="Error"
>
  {{ errorMessage }}
</ui-banner>
```

### 7.3 React Component with Polaris

```tsx
import {
  Page,
  Card,
  DropZone,
  Select,
  Button,
  ButtonGroup,
  DataTable,
  ProgressBar,
  Badge,
  Spinner,
  Banner,
  Text,
  TextField,
  Checkbox,
  InlineStack,
  BlockStack,
  Thumbnail
} from '@shopify/polaris'

function SupplierUpdates() {
  // ... state from section 5.2

  return (
    <Page title="Supplier Updates">
      {error && (
        <Banner
          tone="critical"
          onDismiss={() => setError('')}
        >
          {error}
        </Banner>
      )}

      {step === 'csv' && (
        <Card>
          <BlockStack gap="400">
            {/* File Upload */}
            <DropZone
              onDrop={handleFileDrop}
              accept=".csv"
            >
              <DropZone.FileUpload actionHint="or drop CSV file" />
            </DropZone>

            {/* Field Mapping */}
            {csvData.length > 0 && (
              <>
                <Select
                  label="SKU Column"
                  options={columnOptions}
                  value={csvFields.sku.value?.toString() ?? ''}
                  onChange={handleSkuChange}
                />
                <Select
                  label="Cost Column"
                  options={columnOptions}
                  value={csvFields.cost.value?.toString() ?? ''}
                  onChange={handleCostChange}
                />
                <Select
                  label="SOH Column"
                  options={[{ label: 'N/A', value: 'none' }, ...columnOptions]}
                  value={csvFields.soh.value?.toString() ?? ''}
                  onChange={handleSohChange}
                />

                {csvFieldsSelected && (
                  <ButtonGroup>
                    <Button onClick={actionStock}>Stock Only</Button>
                    <Button
                      variant="primary"
                      onClick={actionPricing}
                    >
                      Stock & Pricing
                    </Button>
                  </ButtonGroup>
                )}
              </>
            )}
          </BlockStack>
        </Card>
      )}

      {step === 'actions' && update.type === 'pricing' && (
        <Card>
          <BlockStack gap="400">
            {/* Margin Filter */}
            <InlineStack
              gap="200"
              align="space-between"
            >
              <TextField
                label="Margin Threshold %"
                type="number"
                value={pricing.margin.toString()}
                onChange={(val) =>
                  setPricing((p) => ({ ...p, margin: Number(val) }))
                }
              />
              <ButtonGroup segmented>
                <Button
                  pressed={pricing.filter === 'all'}
                  onClick={() => filterPricing('all')}
                >
                  All
                </Button>
                <Button
                  pressed={pricing.filter === 'med'}
                  onClick={() => filterPricing('med')}
                >
                  Medium
                </Button>
                <Button
                  pressed={pricing.filter === 'neg'}
                  onClick={() => filterPricing('neg')}
                >
                  Negative
                </Button>
              </ButtonGroup>
            </InlineStack>

            {/* Products Table */}
            <DataTable
              columnContentTypes={[
                'text',
                'text',
                'text',
                'text',
                'text',
                'numeric',
                'text'
              ]}
              headings={[
                '',
                'Name',
                'SKU',
                'Cost',
                'Price',
                'Margin',
                'Update'
              ]}
              rows={pricingFilteredProducts.map((product) => [
                <Thumbnail
                  source={product.image}
                  alt={product.name}
                  size="small"
                />,
                product.name,
                product.sku,
                <CostCell product={product} />,
                <TextField
                  type="number"
                  value={product.price.toString()}
                  onChange={(val) => updateProductPrice(product.id, val)}
                  autoComplete="off"
                />,
                <MarginBadge
                  margin={product.margin}
                  threshold={pricing.margin}
                />,
                <Checkbox
                  checked={product.update}
                  onChange={(val) => updateProductFlag(product.id, val)}
                />
              ])}
            />

            {/* Update Button */}
            {update.status === 'running' ? (
              <InlineStack
                gap="200"
                align="center"
              >
                <Spinner size="small" />
                <Text>
                  Processing batch {batch.page} of {totalBatches}
                </Text>
                <ProgressBar progress={(batch.page / totalBatches) * 100} />
              </InlineStack>
            ) : (
              <Button
                variant="primary"
                onClick={updatePricing}
              >
                Update Pricing
              </Button>
            )}
          </BlockStack>
        </Card>
      )}

      {/* Results */}
      {update.status === 'complete' && (
        <Card>
          <BlockStack gap="200">
            <Text variant="headingMd">Update Complete</Text>
            <Text>SKUs checked: {updateResponses.length}</Text>
            <Text>SKUs updated: {updateResponsesUpdated.length}</Text>
            <Text>SKUs skipped: {updateResponsesNotUpdated.length}</Text>
            <Button onClick={resetForm}>Start New Import</Button>
          </BlockStack>
        </Card>
      )}
    </Page>
  )
}

// Helper Components
function CostCell({ product }: { product: NormalizedProduct }) {
  const increased = product.cost_new > product.cost
  const decreased = product.cost_new < product.cost

  return (
    <InlineStack gap="100">
      <Text>${product.cost.toFixed(2)}</Text>
      <Text>→</Text>
      <Text>${product.cost_new.toFixed(2)}</Text>
      {increased && <Text tone="critical">↑</Text>}
      {decreased && <Text tone="success">↓</Text>}
    </InlineStack>
  )
}

function MarginBadge({
  margin,
  threshold
}: {
  margin: number
  threshold: number
}) {
  let tone: 'success' | 'warning' | 'critical' = 'success'
  if (margin < 0) tone = 'critical'
  else if (margin < threshold) tone = 'warning'

  return <Badge tone={tone}>{margin.toFixed(1)}%</Badge>
}
```

---

## 8. Business Logic

### 8.1 CSV Parsing

**Original Vue Implementation:**

```javascript
async csvToArray(e) {
  let file = e.target.files[0];
  const reader = new FileReader();
  let vm = this;
  reader.onload = async function (e) {
    try {
      vm.csvData = CSV.parse(e.target.result);
    } catch (error) {
      vm.error = 'Error parsing CSV file';
    }
  }
  reader.readAsText(file);
}
```

**React Implementation:**

```tsx
import { parse } from '@vanillaes/csv'

const handleFileDrop = useCallback(
  async (_dropFiles: File[], acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return

    const file = acceptedFiles[0]
    const text = await file.text()

    try {
      const parsed = parse(text)
      setCsvData(parsed)
      setError('')
    } catch (err) {
      setError('Error parsing CSV file. Please check the format.')
    }
  },
  []
)
```

### 8.2 Margin Calculation

**Original Vue Implementation:**

```javascript
calculateMargin(product) {
  let margin = ((product.price / product.cost_new) * 100) - 100;
  return margin;
}
```

**React Implementation:**

```tsx
const calculateMargin = (price: number, cost: number): number => {
  if (cost <= 0) return 0
  return (price / cost) * 100 - 100
}

const getMarginStatus = (
  margin: number,
  threshold: number
): 'good' | 'medium' | 'negative' => {
  if (margin < 0) return 'negative'
  if (margin < threshold) return 'medium'
  return 'good'
}
```

### 8.3 Cost Value Cleaning

**Original (strips non-numeric characters):**

```javascript
// In product processing
let cost = row[this.csvFields.cost.value].replace(/[^\d.-]/g, '')
```

**React Implementation:**

```tsx
const cleanCostValue = (value: string): number => {
  const cleaned = value.replace(/[^\d.-]/g, '')
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : parsed
}
```

### 8.4 Batch Processing

**Original Vue Implementation:**

```javascript
async updateStock() {
  this.update.status = 'running';

  // Process in batches of 100
  let start = (this.batch.page - 1) * this.batch.numberToUpdate;
  let end = start + this.batch.numberToUpdate;
  let batch = this.csvData.slice(start, end);

  // Build payload
  let products = batch.map(row => ({
    sku: row[this.csvFields.sku.value],
    soh: row[this.csvFields.soh.value]
  }));

  // API call
  let response = await fetch(apiUrl + 'updatestock', {
    method: 'POST',
    body: JSON.stringify(products)
  });

  let data = await response.json();
  this.updateResponses = [...this.updateResponses, ...data];

  // Continue to next batch or complete
  if (end < this.csvData.length) {
    this.batch.page++;
    await this.updateStock(); // Recursive
  } else {
    this.update.status = 'complete';
  }
}
```

**React Implementation with GraphQL:**

```tsx
const updateStock = useCallback(async () => {
  setUpdate((u) => ({ ...u, status: 'running' }))

  // Get default location first
  const locationId = await fetchDefaultLocation()

  const processBatch = async (pageNum: number) => {
    const start = (pageNum - 1) * batch.numberToUpdate
    const end = start + batch.numberToUpdate
    const batchData = csvData.slice(start, end)

    if (batchData.length === 0) {
      setUpdate((u) => ({ ...u, status: 'complete' }))
      return
    }

    // Build inventory adjustments
    const changes = batchData
      .map((row) => {
        const sku = row[csvFields.sku.value!]
        const newQty = parseInt(row[csvFields.soh.value as number], 10)
        const product = pricing.products.find((p) => p.sku === sku)

        if (!product) return null

        const delta = newQty - product.quantity
        if (delta === 0) return null // Skip unchanged

        return {
          inventoryItemId: product.inventoryItemId,
          locationId,
          delta
        }
      })
      .filter(Boolean)

    if (changes.length > 0) {
      const result = await graphqlClient.mutate({
        mutation: INVENTORY_ADJUST_QUANTITIES,
        variables: {
          input: {
            reason: 'correction',
            name: 'available',
            changes
          }
        }
      })

      // Track results
      const newResponses = batchData.map((row) => ({
        sku: row[csvFields.sku.value!],
        updated: !result.data.inventoryAdjustQuantities.userErrors.length,
        message:
          result.data.inventoryAdjustQuantities.userErrors[0]?.message ||
          'Updated'
      }))

      setUpdateResponses((prev) => [...prev, ...newResponses])
    }

    setBatch((b) => ({ ...b, page: pageNum + 1 }))

    // Continue to next batch
    if (end < csvData.length) {
      await processBatch(pageNum + 1)
    } else {
      setUpdate((u) => ({ ...u, status: 'complete' }))
    }
  }

  await processBatch(1)
}, [csvData, csvFields, batch.numberToUpdate, pricing.products])
```

### 8.5 Editing Timeout (Debounce)

**Original Vue Implementation:**

```javascript
editingProductRow(product) {
  // Clear existing timeout
  if (this.editing[product.sku]) {
    clearTimeout(this.editing[product.sku].timeout);
  }

  // Mark as editing
  this.editing[product.sku] = {
    active: true,
    timeout: setTimeout(() => {
      this.editing[product.sku].active = false;
    }, 2000) // 2 second debounce
  };
}
```

**React Implementation:**

```tsx
const [editing, setEditing] = useState<
  Record<
    string,
    {
      active: boolean
      timeout: NodeJS.Timeout | null
    }
  >
>({})

const editingProductRow = useCallback((sku: string) => {
  setEditing((prev) => {
    // Clear existing timeout
    if (prev[sku]?.timeout) {
      clearTimeout(prev[sku].timeout)
    }

    return {
      ...prev,
      [sku]: {
        active: true,
        timeout: setTimeout(() => {
          setEditing((p) => ({
            ...p,
            [sku]: { ...p[sku], active: false }
          }))
        }, 2000)
      }
    }
  })
}, [])
```

---

## 9. Implementation Guide

### 9.1 GraphQL Client Setup

```tsx
// lib/graphql.ts
import { createGraphqlClient } from '@shopify/admin-api-client'

export const graphqlClient = createGraphqlClient({
  shop: 'your-shop.myshopify.com',
  accessToken: process.env.SHOPIFY_ACCESS_TOKEN!,
  apiVersion: '2024-01'
})
```

### 9.2 GraphQL Queries & Mutations

```tsx
// graphql/queries.ts
export const GET_PRODUCTS_BY_SKU = `
  query getProductsBySku($query: String!) {
    products(first: 100, query: $query) {
      nodes {
        id
        title
        featuredImage {
          url(transform: { maxWidth: 40, maxHeight: 40 })
        }
        variants(first: 10) {
          nodes {
            id
            sku
            price
            inventoryQuantity
            inventoryItem {
              id
              unitCost {
                amount
                currencyCode
              }
            }
          }
        }
      }
    }
  }
`

export const GET_LOCATIONS = `
  query getLocations {
    locations(first: 1, includeLegacy: true, includeInactive: false) {
      nodes {
        id
        name
      }
    }
  }
`

// graphql/mutations.ts

/**
 * Adjust inventory quantities at a location.
 * NOTE: As of API version 2026-04, @idempotent directive is required.
 *
 * Input structure:
 * - reason: "correction" | "cycle_count_available" | "damaged" | etc.
 * - name: "available" (the inventory state to adjust)
 * - changes: array of { inventoryItemId, locationId, delta }
 */
export const INVENTORY_ADJUST_QUANTITIES = `
  mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
    inventoryAdjustQuantities(input: $input) {
      inventoryAdjustmentGroup {
        createdAt
        reason
        changes {
          name
          delta
          quantityAfterChange
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`

/**
 * Update multiple product variants at once (price, cost, etc.)
 * This is the recommended mutation for bulk variant updates.
 * Use inventoryItem.cost to update the unit cost.
 */
export const PRODUCT_VARIANTS_BULK_UPDATE = `
  mutation productVariantsBulkUpdate(
    $productId: ID!,
    $variants: [ProductVariantsBulkInput!]!
  ) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      product {
        id
      }
      productVariants {
        id
        price
        inventoryItem {
          id
          unitCost {
            amount
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`

/**
 * Update inventory item properties (cost, tracked status, etc.)
 * Use this for standalone cost updates when not updating price.
 */
export const INVENTORY_ITEM_UPDATE = `
  mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
    inventoryItemUpdate(id: $id, input: $input) {
      inventoryItem {
        id
        unitCost {
          amount
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`
```

### 9.3 Custom Hooks

```tsx
// hooks/useBatchProcessor.ts
import { useState, useCallback } from 'react'

interface BatchConfig<T> {
  items: T[]
  batchSize: number
  processor: (batch: T[]) => Promise<void>
  onProgress?: (current: number, total: number) => void
  onComplete?: () => void
}

export function useBatchProcessor<T>() {
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentBatch, setCurrentBatch] = useState(0)
  const [totalBatches, setTotalBatches] = useState(0)

  const process = useCallback(async (config: BatchConfig<T>) => {
    const { items, batchSize, processor, onProgress, onComplete } = config

    const batches = Math.ceil(items.length / batchSize)
    setTotalBatches(batches)
    setIsProcessing(true)

    for (let i = 0; i < batches; i++) {
      setCurrentBatch(i + 1)

      const start = i * batchSize
      const end = start + batchSize
      const batch = items.slice(start, end)

      await processor(batch)
      onProgress?.(i + 1, batches)
    }

    setIsProcessing(false)
    onComplete?.()
  }, [])

  return {
    process,
    isProcessing,
    currentBatch,
    totalBatches,
    progress: totalBatches > 0 ? (currentBatch / totalBatches) * 100 : 0
  }
}
```

```tsx
// hooks/useProductLookup.ts
import { useCallback, useState } from 'react'
import { graphqlClient } from '../lib/graphql'
import { GET_PRODUCTS_BY_SKU } from '../graphql/queries'

export function useProductLookup() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lookupProducts = useCallback(
    async (skus: string[]): Promise<NormalizedProduct[]> => {
      setLoading(true)
      setError(null)

      try {
        // Build query string: "sku:ABC OR sku:DEF OR sku:GHI"
        const queryString = skus.map((sku) => `sku:${sku}`).join(' OR ')

        const result = await graphqlClient.query({
          query: GET_PRODUCTS_BY_SKU,
          variables: { query: queryString }
        })

        // Normalize Shopify response to our product structure
        const products: NormalizedProduct[] = []

        for (const product of result.data.products.nodes) {
          for (const variant of product.variants.nodes) {
            products.push({
              id: product.id,
              variantId: variant.id,
              inventoryItemId: variant.inventoryItem.id,
              sku: variant.sku,
              name: product.title,
              image: product.featuredImage?.url || '',
              cost: parseFloat(variant.inventoryItem.unitCost?.amount || '0'),
              price: parseFloat(variant.price),
              quantity: variant.inventoryQuantity,
              cost_new: 0, // Will be set from CSV
              quantity_new: 0, // Will be set from CSV
              margin: 0, // Will be calculated
              marginStatus: 'good',
              update: true,
              editing: { active: false, timeout: null }
            })
          }
        }

        return products
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to lookup products'
        )
        return []
      } finally {
        setLoading(false)
      }
    },
    []
  )

  return { lookupProducts, loading, error }
}
```

---

## 10. File Structure

### Recommended Shopify App Structure (React Router)

```
app/
├── routes/
│   └── supplier-updates.tsx          # Main page route
├── components/
│   └── supplier-updates/
│       ├── SupplierUpdates.tsx       # Main component
│       ├── CSVUploader.tsx           # File upload + field mapping
│       ├── ProductTable.tsx          # Pricing review table
│       ├── CostCell.tsx              # Cost comparison display
│       ├── MarginBadge.tsx           # Margin status badge
│       └── BatchProgress.tsx         # Progress indicator
├── hooks/
│   ├── useBatchProcessor.ts          # Batch processing logic
│   ├── useProductLookup.ts           # GraphQL product queries
│   ├── useInventoryUpdate.ts         # Stock update mutations
│   └── usePricingUpdate.ts           # Price/cost update mutations
├── graphql/
│   ├── queries.ts                    # GraphQL query definitions
│   └── mutations.ts                  # GraphQL mutation definitions
├── lib/
│   ├── graphql.ts                    # GraphQL client setup
│   ├── csv.ts                        # CSV parsing utilities
│   └── margin.ts                     # Margin calculation utilities
└── types/
    └── supplier-updates.ts           # TypeScript interfaces
```

### Key Differences from OpenCart

| Aspect       | OpenCart             | Shopify                              |
| ------------ | -------------------- | ------------------------------------ |
| Backend      | PHP Controller       | React Router Route + Loader/Action   |
| Database     | Direct MySQL queries | GraphQL API                          |
| Auth         | OpenCart session     | Shopify OAuth                        |
| Cost field   | `oc_product.cost`    | `InventoryItem.unitCost`             |
| Inventory    | Direct UPDATE        | `inventoryAdjustQuantities` mutation |
| Batch size   | 100 items            | 15-20 items (2MB limit)              |
| Image resize | `model_tool_image`   | GraphQL transform params             |

---

## Appendix: Original Source Code Reference

### Controller Methods Summary

| Method               | Purpose               | Shopify Equivalent                             |
| -------------------- | --------------------- | ---------------------------------------------- |
| `index()`            | Render main page      | React Router loader + component                |
| `loadApp()`          | Generate Vue app HTML | React component                                |
| `getProductsBySku()` | Lookup products       | GraphQL query                                  |
| `updatestock()`      | Update quantities     | `inventoryAdjustQuantities`                    |
| `updatepricing()`    | Update cost/price     | `productVariantUpdate` + `inventoryItemUpdate` |

### Database Tables Used

| OpenCart Table           | Shopify Equivalent         |
| ------------------------ | -------------------------- |
| `oc_product`             | Product resource           |
| `oc_product_description` | Product.title, description |
| `oc_product.quantity`    | InventoryLevel.available   |
| `oc_product.cost`        | InventoryItem.unitCost     |
| `oc_product.price`       | ProductVariant.price       |
| `oc_product.sku`         | ProductVariant.sku         |

---

_Document generated for migration from OpenCart Supplier Updates plugin to Shopify React app_
