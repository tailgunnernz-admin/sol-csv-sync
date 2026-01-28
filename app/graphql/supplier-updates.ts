/**
 * GraphQL queries and mutations for Supplier Updates
 * Based on Shopify Admin API
 */

// Query products by SKU - builds OR query for multiple SKUs
export const GET_PRODUCTS_BY_SKU = `#graphql
  query getProductsBySku($query: String!) {
    products(first: 100, query: $query) {
      nodes {
        id
        title
        featuredMedia {
          preview {
            image {
              url(transform: { maxWidth: 40, maxHeight: 40 })
            }
          }
        }
        variants(first: 100) {
          nodes {
            id
            sku
            price
            inventoryItem {
              id
              unitCost {
                amount
                currencyCode
              }
            }
            inventoryQuantity
          }
        }
      }
    }
  }
`;

// Get locations for inventory operations
export const GET_LOCATIONS = `#graphql
  query getLocations {
    locations(first: 10, includeLegacy: true, includeInactive: false) {
      nodes {
        id
        name
        isActive
      }
    }
  }
`;

// Adjust inventory quantities
// NOTE: Uses delta (difference), not absolute values
export const INVENTORY_ADJUST_QUANTITIES = `#graphql
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
`;

// Update variant prices and costs in bulk
// This is the recommended approach for updating both price and cost together
export const PRODUCT_VARIANTS_BULK_UPDATE = `#graphql
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
`;

// Update inventory item properties (cost only)
// Use when not updating price
export const INVENTORY_ITEM_UPDATE = `#graphql
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
`;

/**
 * Build SKU query string for GraphQL
 * Shopify query format: "sku:ABC OR sku:DEF OR sku:GHI"
 * @param skus Array of SKU strings
 * @returns Query string for products query
 */
export function buildSkuQuery(skus: string[]): string {
  return skus
    .map((sku) => sku.trim())
    .filter(Boolean)
    .map((sku) => `sku:"${escapeQueryValue(sku)}"`)
    .join(" OR ");
}

function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Chunk SKUs into batches for querying
 * Shopify has query string length limits
 * @param skus All SKUs to look up
 * @param batchSize Number of SKUs per batch (default 50)
 */
export function chunkSkusForQuery(
  skus: string[],
  batchSize: number = 50,
): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < skus.length; i += batchSize) {
    chunks.push(skus.slice(i, i + batchSize));
  }
  return chunks;
}
