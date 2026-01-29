/**
 * Type definitions for the Supplier Updates feature
 * Migrated from OpenCart Vue.js plugin to Shopify React app
 */

// CSV Data Structures
export interface CSVData {
  headers: string[];
  rows: string[][];
}

export interface CSVFieldMapping {
  sku: {
    label: string;
    value: number | null;
  };
  cost: {
    label: string;
    value: number | null;
  };
  soh: {
    label: string;
    value: number | "none" | null;
  };
}

// Product data from CSV row
export interface CSVProduct {
  sku: string;
  cost: number;
  soh?: number;
}

// Shopify GraphQL response types
export interface ShopifyVariant {
  id: string;
  sku: string;
  price: string;
  inventoryItem: {
    id: string;
    unitCost: {
      amount: string;
      currencyCode: string;
    } | null;
    inventoryLevel?: {
      location?: { id: string } | null;
      quantities?: Array<{ name: string; quantity: number }>;
    } | null;
  };
  inventoryQuantity: number;
}

export interface ShopifyProduct {
  id: string;
  title: string;
  featuredMedia: {
    preview: {
      image: {
        url: string;
      } | null;
    } | null;
  } | null;
  variants: {
    nodes: ShopifyVariant[];
  };
}

// Normalized product for UI (platform-agnostic)
export interface NormalizedProduct {
  id: string;
  variantId: string;
  inventoryItemId: string;
  sku: string;
  name: string;
  image: string;

  // Current values (from database)
  cost: number;
  price: number;
  quantity: number;

  // New values (from CSV)
  costNew: number;
  quantityNew: number;

  // Calculated fields
  margin: number;
  marginStatus: MarginStatus;

  // UI state
  update: boolean;
  editing?: {
    status: boolean;
    filter: FilterType | "";
  };
}

export type MarginStatus = "good" | "medium" | "negative";

// Update state management
export interface UpdateState {
  type: "stock" | "pricing" | null;
  status: "idle" | "running" | "complete";
}

export interface BatchState {
  numberToUpdate: number;
  page: number;
  total: number;
}

export interface UpdateResponse {
  sku: string;
  updated: boolean;
  message: string;
  error?: string;
}

// Pricing state
export interface PricingState {
  margin: number;
  products: NormalizedProduct[];
  filter: FilterType;
}

export type FilterType = "all" | "med" | "neg";

// Step in the workflow
export type WorkflowStep = "csv" | "mapping" | "actions";

// Action types for the form
export interface SupplierUpdatesFormData {
  intent: "lookupProducts" | "updateStock" | "updatePricing";
  csvProducts?: string; // JSON stringified CSVProduct[]
  products?: string; // JSON stringified NormalizedProduct[]
  locationId?: string;
}

// GraphQL mutation input types
export interface InventoryChange {
  inventoryItemId: string;
  locationId: string;
  delta: number;
}

export interface InventoryAdjustInput {
  reason: string;
  name: string;
  changes: InventoryChange[];
}

export interface VariantPriceUpdate {
  id: string;
  price: string;
  inventoryItem?: {
    cost: number;
  };
}

export interface ProductVariantsUpdateInput {
  productId: string;
  variants: VariantPriceUpdate[];
}

// API response types
export interface LookupProductsResponse {
  products: NormalizedProduct[];
  locationId: string;
  notFound: string[];
}

export interface UpdateStockResponse {
  results: UpdateResponse[];
}

export interface UpdatePricingResponse {
  results: UpdateResponse[];
}
