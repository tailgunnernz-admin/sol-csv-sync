/**
 * Utility functions for Supplier Updates
 * CSV parsing, margin calculations, and data transformations
 */

import type {
  CSVProduct,
  CSVFieldMapping,
  MarginStatus,
  NormalizedProduct,
  ShopifyProduct,
} from "../types/supplier-updates";

/**
 * Parse CSV text into a 2D array
 * Uses a simple parser that handles quoted fields
 * @param text Raw CSV file content
 * @returns Array of rows, each row is array of cell values
 */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    if (line.trim() === "") continue;

    const row: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i++;
        } else {
          // Toggle quote mode
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        row.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    // Don't forget the last field
    row.push(current.trim());
    rows.push(row);
  }

  return rows;
}

/**
 * Extract products from parsed CSV data using field mapping
 * @param csvData Parsed CSV rows (including header)
 * @param fields Field mapping configuration
 * @returns Array of CSVProduct objects
 */
export function extractProductsFromCSV(
  csvData: string[][],
  fields: CSVFieldMapping,
): CSVProduct[] {
  if (csvData.length < 2) return [];
  if (fields.sku.value === null || fields.cost.value === null) return [];

  const products: CSVProduct[] = [];

  // Skip header row (index 0)
  for (let i = 1; i < csvData.length; i++) {
    const row = csvData[i];
    if (!row || row.length === 0) continue;

    const sku = row[fields.sku.value]?.trim();
    if (!sku) continue;

    const cost = cleanCostValue(row[fields.cost.value] || "0");

    const product: CSVProduct = { sku, cost };

    // Only add SOH if field is mapped (not "none")
    if (fields.soh.value !== null && fields.soh.value !== "none") {
      const soh = parseInt(row[fields.soh.value] || "0", 10);
      product.soh = isNaN(soh) ? 0 : soh;
    }

    products.push(product);
  }

  return products;
}

/**
 * Clean cost value from CSV (remove currency symbols, spaces, etc.)
 * @param value Raw cost string from CSV
 * @returns Cleaned numeric value
 */
export function cleanCostValue(value: string): number {
  const cleaned = value.replace(/[^\d.-]/g, "");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Calculate profit margin percentage
 * Formula: ((price / cost) * 100) - 100
 * @param price Selling price
 * @param cost Cost price
 * @returns Margin percentage
 */
export function calculateMargin(price: number, cost: number): number {
  if (cost <= 0) return 0;
  return (price / cost) * 100 - 100;
}

/**
 * Determine margin status based on threshold
 * @param margin Margin percentage
 * @param threshold Minimum "good" margin threshold
 * @returns Status: good, medium, or negative
 */
export function getMarginStatus(
  margin: number,
  threshold: number,
): MarginStatus {
  if (margin < 0) return "negative";
  if (margin < threshold) return "medium";
  return "good";
}

/**
 * Normalize Shopify product to our internal format
 * @param shopifyProduct Product from GraphQL response
 * @param csvProduct Matching CSV product data
 * @param marginThreshold Threshold for margin status calculation
 * @returns Normalized product for UI
 */
export function normalizeShopifyProduct(
  shopifyProduct: ShopifyProduct,
  csvProduct: CSVProduct,
  marginThreshold: number = 5,
  locationId?: string | null,
): NormalizedProduct | null {
  // Find the variant with matching SKU
  const variant = shopifyProduct.variants.nodes.find(
    (v) => v.sku?.toLowerCase() === csvProduct.sku.toLowerCase(),
  );

  if (!variant) return null;

  const currentCost = variant.inventoryItem?.unitCost
    ? parseFloat(variant.inventoryItem.unitCost.amount)
    : 0;

  const currentPrice = parseFloat(variant.price) || 0;
  const newCost = csvProduct.cost;
  const locationAvailable = locationId
    ? variant.inventoryItem.inventoryLevel?.location?.id === locationId
      ? variant.inventoryItem.inventoryLevel?.quantities?.find(
          (qty) => qty.name === "available",
        )?.quantity
      : undefined
    : variant.inventoryItem.inventoryLevel?.quantities?.find(
        (qty) => qty.name === "available",
      )?.quantity;
  const currentQuantity =
    typeof locationAvailable === "number"
      ? locationAvailable
      : variant.inventoryQuantity;
  const newQuantity = csvProduct.soh ?? currentQuantity;

  const margin = calculateMargin(currentPrice, newCost);

  return {
    id: shopifyProduct.id,
    variantId: variant.id,
    inventoryItemId: variant.inventoryItem.id,
    sku: variant.sku,
    name: shopifyProduct.title,
    image: shopifyProduct.featuredMedia?.preview?.image?.url || "",

    // Current values
    cost: currentCost,
    price: currentPrice,
    quantity: currentQuantity,

    // New values from CSV
    costNew: newCost,
    quantityNew: newQuantity,

    // Calculated
    margin,
    marginStatus: getMarginStatus(margin, marginThreshold),

    // UI state
    update: true,
  };
}

/**
 * Chunk array into smaller arrays
 * @param arr Array to chunk
 * @param size Chunk size
 * @returns Array of chunks
 */
export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Format currency for display
 * @param value Numeric value
 * @param currency Currency code (default AUD)
 * @returns Formatted currency string
 */
export function formatCurrency(
  value: number,
  currency: string = "AUD",
): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format margin percentage for display
 * @param margin Margin value
 * @returns Formatted percentage string
 */
export function formatMargin(margin: number): string {
  return `${margin.toFixed(1)}%`;
}

/**
 * Group products by their parent product ID
 * Needed for productVariantsBulkUpdate which requires productId
 * @param products Normalized products
 * @returns Map of productId to variants
 */
export function groupProductsByParent(
  products: NormalizedProduct[],
): Map<string, NormalizedProduct[]> {
  const groups = new Map<string, NormalizedProduct[]>();

  for (const product of products) {
    const existing = groups.get(product.id) || [];
    existing.push(product);
    groups.set(product.id, existing);
  }

  return groups;
}
