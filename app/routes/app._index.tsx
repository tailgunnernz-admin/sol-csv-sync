/**
 * Supplier Updates Route
 * Main page for CSV import and bulk product updates
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

import {
  CSVUploader,
  FieldMapper,
  ActionSelector,
  BatchProgress,
  UpdateResults,
  ProductTable,
  FilterButtons,
  MarginSettings,
} from "../components/supplier-updates";

import {
  useCSVFieldMapping,
  usePricingProducts,
  useBatchProcessor,
} from "../hooks/supplier-updates";

import {
  extractProductsFromCSV,
  normalizeShopifyProduct,
  chunkArray,
  groupProductsByParent,
} from "../lib/supplier-updates";

import {
  GET_PRODUCTS_BY_SKU,
  GET_LOCATIONS,
  INVENTORY_ADJUST_QUANTITIES,
  PRODUCT_VARIANTS_BULK_UPDATE,
  INVENTORY_ITEM_UPDATE,
  buildSkuQuery,
} from "../graphql/supplier-updates";

import type {
  CSVProduct,
  NormalizedProduct,
  ShopifyProduct,
  WorkflowStep,
  UpdateResponse,
} from "../types/supplier-updates";

// Type for GraphQL response
interface ProductsQueryResponse {
  data?: {
    products: {
      nodes: ShopifyProduct[];
    };
  };
}

interface LocationsQueryResponse {
  data?: {
    locations: {
      nodes: Array<{ id: string; name: string; isActive: boolean }>;
    };
  };
}

interface InventoryAdjustResponse {
  data?: {
    inventoryAdjustQuantities: {
      inventoryAdjustmentGroup: {
        createdAt: string;
        reason: string;
        changes: Array<{
          name: string;
          delta: number;
          quantityAfterChange: number;
        }>;
      };
      userErrors: Array<{ field: string; message: string }>;
    };
  };
}

interface VariantUpdateResponse {
  data?: {
    productVariantsBulkUpdate: {
      product: { id: string };
      productVariants: Array<{
        id: string;
        price: string;
        inventoryItem: { id: string; unitCost: { amount: string } };
      }>;
      userErrors: Array<{ field?: string[]; message: string }>;
    };
  };
}

interface InventoryItemUpdateResponse {
  data?: {
    inventoryItemUpdate: {
      inventoryItem: {
        id: string;
        unitCost: { amount: string } | null;
      } | null;
      userErrors: Array<{ field?: string[]; message: string }>;
    };
  };
}

/**
 * Loader - Get initial data (location ID)
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // Get default location for inventory operations
  const locationsResponse = await admin.graphql(GET_LOCATIONS);
  const locationsData =
    (await locationsResponse.json()) as LocationsQueryResponse;

  const locations = locationsData.data?.locations.nodes || [];
  const defaultLocation = locations.find((l) => l.isActive) || locations[0];

  return {
    locationId: defaultLocation?.id || null,
    locationName: defaultLocation?.name || "Unknown",
    locations: locations.map((location) => ({
      id: location.id,
      name: location.name,
      isActive: location.isActive,
    })),
    shopDomain: session.shop,
  };
};

/**
 * Action - Handle form submissions
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  // Get location ID
  const locationId = formData.get("locationId") as string;

  if (intent === "lookupProducts") {
    // Parse CSV products from form data
    const csvProductsJson = formData.get("csvProducts") as string;
    const csvProducts: CSVProduct[] = JSON.parse(csvProductsJson || "[]");
    const marginThreshold = parseFloat(
      (formData.get("marginThreshold") as string) || "5",
    );

    if (csvProducts.length === 0) {
      return { error: "No products to look up", products: [], notFound: [] };
    }

    // Look up products in batches of 50 (query string limit)
    const skuBatches = chunkArray(
      csvProducts.map((p) => p.sku),
      50,
    );
    const allProducts: NormalizedProduct[] = [];
    const foundSkus = new Set<string>();

    for (const skuBatch of skuBatches) {
      const query = buildSkuQuery(skuBatch);
      if (!query) continue;
      const response = await admin.graphql(GET_PRODUCTS_BY_SKU, {
        variables: {
          query,
          locationId: locationId || "",
        },
      });
      const data = (await response.json()) as ProductsQueryResponse;

      const shopifyProducts = data.data?.products.nodes || [];

      // Match and normalize products
      for (const shopifyProduct of shopifyProducts) {
        for (const variant of shopifyProduct.variants.nodes) {
          const csvProduct = csvProducts.find(
            (p) => p.sku.toLowerCase() === variant.sku?.toLowerCase(),
          );

          if (csvProduct) {
            const normalized = normalizeShopifyProduct(
              shopifyProduct,
              csvProduct,
              marginThreshold,
              locationId,
            );
            if (normalized) {
              allProducts.push(normalized);
              foundSkus.add(csvProduct.sku.toLowerCase());
            }
          }
        }
      }
    }

    // Find SKUs not found
    const notFound = csvProducts
      .filter((p) => !foundSkus.has(p.sku.toLowerCase()))
      .map((p) => p.sku);

    return { products: allProducts, notFound, error: null };
  }

  if (intent === "updateStock") {
    const productsJson = formData.get("products") as string;
    const products: NormalizedProduct[] = JSON.parse(productsJson || "[]");

    if (products.length === 0) {
      return { results: [], error: "No products to update" };
    }

    const results: UpdateResponse[] = [];

    // Build inventory changes
    const changes = products
      .filter((p) => p.update)
      .map((p) => ({
        inventoryItemId: p.inventoryItemId,
        locationId,
        delta: p.quantityNew - p.quantity,
      }))
      .filter((c) => c.delta !== 0);

    if (changes.length === 0) {
      return {
        results: products.map((p) => ({
          sku: p.sku,
          updated: false,
          message: "No quantity change needed",
        })),
        error: null,
      };
    }

    // Batch updates (max 100 per call)
    const changeBatches = chunkArray(changes, 100);

    for (const batch of changeBatches) {
      try {
        const response = await admin.graphql(INVENTORY_ADJUST_QUANTITIES, {
          variables: {
            input: {
              reason: "correction",
              name: "available",
              changes: batch,
            },
          },
        });

        const data = (await response.json()) as InventoryAdjustResponse;
        const userErrors =
          data.data?.inventoryAdjustQuantities.userErrors || [];

        // Map results
        for (const change of batch) {
          const product = products.find(
            (p) => p.inventoryItemId === change.inventoryItemId,
          );
          if (product) {
            const hasError = userErrors.length > 0;
            results.push({
              sku: product.sku,
              updated: !hasError,
              message: hasError ? userErrors[0].message : "Stock updated",
              error: hasError ? userErrors[0].message : undefined,
            });
          }
        }
      } catch (err) {
        // Mark all in batch as failed
        for (const change of batch) {
          const product = products.find(
            (p) => p.inventoryItemId === change.inventoryItemId,
          );
          if (product) {
            results.push({
              sku: product.sku,
              updated: false,
              message: "API error",
              error: err instanceof Error ? err.message : "Unknown error",
            });
          }
        }
      }
    }

    return { results, error: null };
  }

  if (intent === "updatePricing") {
    const productsJson = formData.get("products") as string;
    const products: NormalizedProduct[] = JSON.parse(productsJson || "[]");
    const updateStock = formData.get("updateStock") === "true";

    // console.log("updatestock:", JSON.stringify(updateStock));

    if (products.length === 0) {
      return { results: [], error: "No products to update" };
    }

    const results: UpdateResponse[] = [];
    const productsToUpdate = products.filter((p) => p.update);

    // Group by parent product for bulk update
    const grouped = groupProductsByParent(productsToUpdate);

    const variantBatchSize = 100;
    for (const [productId, variants] of grouped) {
      try {
        const variantBatches = chunkArray(variants, variantBatchSize);
        for (const variantBatch of variantBatches) {
          const variantInputs = variantBatch.map((v) => ({
            id: v.variantId,
            price: v.price.toFixed(2),
            inventoryItem: {
              cost: v.costNew,
            },
          }));

          const response = await admin.graphql(PRODUCT_VARIANTS_BULK_UPDATE, {
            variables: {
              productId,
              variants: variantInputs,
            },
          });

          const data = (await response.json()) as VariantUpdateResponse;
          const userErrors =
            data.data?.productVariantsBulkUpdate.userErrors || [];
          const hasCostError = userErrors.some((error) => {
            const field = (error.field || []).join(".");
            return (
              /inventoryItem|cost|unitCost/i.test(error.message) ||
              /inventoryItem|cost|unitCost/i.test(field)
            );
          });

          if (userErrors.length > 0 && hasCostError) {
            const priceInputs = variantBatch.map((v) => ({
              id: v.variantId,
              price: v.price.toFixed(2),
            }));

            const priceResponse = await admin.graphql(
              PRODUCT_VARIANTS_BULK_UPDATE,
              {
                variables: {
                  productId,
                  variants: priceInputs,
                },
              },
            );
            const priceData =
              (await priceResponse.json()) as VariantUpdateResponse;
            const priceErrors =
              priceData.data?.productVariantsBulkUpdate.userErrors || [];
            const hasPriceData = Boolean(
              priceData.data?.productVariantsBulkUpdate,
            );
            const effectivePriceErrors = hasPriceData
              ? priceErrors
              : [{ message: "Price update failed" }];

            const costErrors = new Map<string, string>();
            for (const variant of variantBatch) {
              try {
                const costResponse = await admin.graphql(INVENTORY_ITEM_UPDATE, {
                  variables: {
                    id: variant.inventoryItemId,
                    input: {
                      cost: variant.costNew,
                    },
                  },
                });
                const costData =
                  (await costResponse.json()) as InventoryItemUpdateResponse;
                const inventoryUpdate = costData.data?.inventoryItemUpdate;
                if (!inventoryUpdate) {
                  costErrors.set(variant.sku, "Cost update failed");
                  continue;
                }
                if (inventoryUpdate.userErrors.length > 0) {
                  costErrors.set(
                    variant.sku,
                    inventoryUpdate.userErrors[0].message,
                  );
                }
              } catch (err) {
                costErrors.set(
                  variant.sku,
                  err instanceof Error ? err.message : "Unknown error",
                );
              }
            }

            for (const variant of variantBatch) {
              const hasPriceError = effectivePriceErrors.length > 0;
              const costError = costErrors.get(variant.sku);
              const hasError = hasPriceError || Boolean(costError);
              const message = hasError
                ? costError || effectivePriceErrors[0].message
                : "Pricing updated";

              results.push({
                sku: variant.sku,
                updated: !hasError,
                message,
                error: hasError ? message : undefined,
              });
            }
          } else {
            for (const variant of variantBatch) {
              const hasError = userErrors.length > 0;
              results.push({
                sku: variant.sku,
                updated: !hasError,
                message: hasError ? userErrors[0].message : "Pricing updated",
                error: hasError ? userErrors[0].message : undefined,
              });
            }
          }
        }
      } catch (err) {
        for (const variant of variants) {
          results.push({
            sku: variant.sku,
            updated: false,
            message: "API error",
            error: err instanceof Error ? err.message : "Unknown error",
          });
        }
      }
    }

    // Also update stock if requested
    if (updateStock) {
      const stockChanges = productsToUpdate
        .map((p) => ({
          inventoryItemId: p.inventoryItemId,
          locationId,
          delta: p.quantityNew - p.quantity,
        }))
        .filter((c) => c.delta !== 0);

      // console.log("Stock changes to apply:", JSON.stringify(stockChanges));

      if (stockChanges.length > 0) {
        const changeBatches = chunkArray(stockChanges, 100);
        for (const batch of changeBatches) {
          try {
            const response = await admin.graphql(INVENTORY_ADJUST_QUANTITIES, {
              variables: {
                input: {
                  reason: "correction",
                  name: "available",
                  changes: batch,
                },
              },
            });
            const data = (await response.json()) as InventoryAdjustResponse;
            // console.log(
            //   "Inventory adjust response:",
            //   JSON.stringify(data.data),
            // );
            const userErrors =
              data.data?.inventoryAdjustQuantities.userErrors || [];
            for (const change of batch) {
              const result = results.find(
                (r) =>
                  r.sku ===
                  productsToUpdate.find(
                    (p) => p.inventoryItemId === change.inventoryItemId,
                  )?.sku,
              );
              if (result) {
                const hasError = userErrors.length > 0;
                result.updated = !hasError;
                result.message = hasError
                  ? userErrors[0].message
                  : "Stock updated";
                result.error = hasError ? userErrors[0].message : undefined;
              }
            }
          } catch {
            // Stock update errors are secondary, don't fail the whole operation
            console.error("Stock update error", batch);
          }
        }
      }
    }

    return { results, error: null };
  }

  return { error: "Unknown action" };
};

/**
 * Supplier Updates Page Component
 */
export default function SupplierUpdatesPage() {
  const { locationId, shopDomain, locations } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const batchResolver = useRef<((data: typeof fetcher.data) => void) | null>(
    null,
  );
  const updateBatchSize = 50;

  // Workflow state
  const [step, setStep] = useState<WorkflowStep>("csv");
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [csvFileName, setCsvFileName] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [updateType, setUpdateType] = useState<"stock" | "pricing" | null>(
    null,
  );
  const [selectedLocationId, setSelectedLocationId] = useState(
    locationId || "",
  );

  // CSV field mapping
  const { fields, updateField, allFieldsSelected, resetFields } =
    useCSVFieldMapping();

  // Pricing products
  const {
    products,
    setProducts,
    filteredProducts,
    filter,
    setFilter,
    margin,
    setMargin,
    toggleProductUpdate,
    updateProductPrice,
    confirmProductEdit,
    setUpdatesForVariants,
    stats,
  } = usePricingProducts(5);

  // Batch processing
  const batchProcessor = useBatchProcessor();

  // Check if fetcher is loading
  const isLoading = fetcher.state !== "idle";

  // CSV headers (first row)
  const csvHeaders = useMemo(() => csvData[0] || [], [csvData]);

  // Has stock field mapped
  const hasStockField =
    fields.soh.value !== null && fields.soh.value !== "none";

  // Handle file load
  const handleFileLoad = useCallback((data: string[][], fileName: string) => {
    setCsvData(data);
    setCsvFileName(fileName);
    setError("");
  }, []);

  // Handle file error
  const handleFileError = useCallback((err: string) => {
    setError(err);
  }, []);

  useEffect(() => {
    if (fetcher.state !== "idle" || !batchResolver.current) return;
    batchResolver.current(fetcher.data);
    batchResolver.current = null;
  }, [fetcher.state, fetcher.data]);

  const submitBatch = useCallback(
    (payload: Record<string, string>) =>
      new Promise<typeof fetcher.data>((resolve) => {
        batchResolver.current = resolve;
        fetcher.submit(payload, { method: "post" });
      }),
    [fetcher],
  );

  const handleLocationChange = useCallback((event: Event) => {
    const customEvent = event as CustomEvent;
    const detailValue = customEvent.detail?.value as string | undefined;
    const currentTargetValue = (
      event.currentTarget as { value?: string } | null
    )?.value;
    const targetValue = (event.target as { value?: string } | null)?.value;
    const value = detailValue ?? currentTargetValue ?? targetValue ?? "";
    setSelectedLocationId(value);
  }, []);

  // Go to next step
  const goToActions = useCallback(() => {
    if (allFieldsSelected) {
      setStep("actions");
    }
  }, [allFieldsSelected]);

  // Go back to CSV step
  const goToCSV = useCallback(() => {
    setStep("csv");
    setUpdateType(null);
    setProducts([]);
    batchProcessor.reset();
  }, [setProducts, batchProcessor]);

  // Start stock only update
  const handleStockOnly = useCallback(() => {
    if (!selectedLocationId) {
      setError("Please select a location to update.");
      return;
    }
    setUpdateType("stock");

    // Extract products and submit for lookup
    const csvProducts = extractProductsFromCSV(csvData, fields);

    fetcher.submit(
      {
        intent: "lookupProducts",
        csvProducts: JSON.stringify(csvProducts),
        locationId: selectedLocationId,
        marginThreshold: margin.toString(),
      },
      { method: "post" },
    );
  }, [csvData, fields, fetcher, margin, selectedLocationId]);

  // Start pricing update
  const handleStockAndPricing = useCallback(() => {
    if (!selectedLocationId) {
      setError("Please select a location to update.");
      return;
    }
    setUpdateType("pricing");

    // Extract products and submit for lookup
    const csvProducts = extractProductsFromCSV(csvData, fields);

    fetcher.submit(
      {
        intent: "lookupProducts",
        csvProducts: JSON.stringify(csvProducts),
        locationId: selectedLocationId,
        marginThreshold: margin.toString(),
      },
      { method: "post" },
    );
  }, [csvData, fields, fetcher, margin, selectedLocationId]);

  // Effect to handle lookup response
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!fetcher.data || !("products" in fetcher.data)) return;
    if (!fetcher.data.products || isLoading) return;
    if (products.length > 0) return;

    setProducts(fetcher.data.products);

    if (fetcher.data.notFound && fetcher.data.notFound.length > 0) {
      shopify?.toast?.show(
        `${fetcher.data.notFound.length} SKUs not found in store`,
      );
    }
  }, [fetcher.data, isLoading, products.length, setProducts, shopify]);

  // Handle update now (pricing)
  const handleUpdatePricing = useCallback(() => {
    const productsToUpdate = products.filter((p) => p.update);

    if (productsToUpdate.length === 0) {
      setError("No products selected for update");
      return;
    }

    void (async () => {
      batchProcessor.reset();
      batchProcessor.setIsProcessing(true);

      const batches = chunkArray(productsToUpdate, updateBatchSize);
      batchProcessor.setTotalBatches(batches.length);

      for (let index = 0; index < batches.length; index += 1) {
        batchProcessor.setCurrentBatch(index + 1);
        const data = await submitBatch({
          intent: "updatePricing",
          products: JSON.stringify(batches[index]),
          locationId: selectedLocationId,
          updateStock: hasStockField ? "true" : "false",
        });

        if (data && "results" in data && Array.isArray(data.results)) {
          batchProcessor.addResults(data.results);
        }
        if (data && "error" in data && data.error) {
          setError(data.error);
          break;
        }
      }

      batchProcessor.setIsProcessing(false);
    })();
  }, [
    products,
    hasStockField,
    batchProcessor,
    selectedLocationId,
    updateBatchSize,
    submitBatch,
  ]);

  // Handle update stock only
  const handleUpdateStock = useCallback(() => {
    const productsToUpdate = products.filter((p) => p.update);

    if (productsToUpdate.length === 0) {
      setError("No products selected for update");
      return;
    }

    void (async () => {
      batchProcessor.reset();
      batchProcessor.setIsProcessing(true);

      const batches = chunkArray(productsToUpdate, updateBatchSize);
      batchProcessor.setTotalBatches(batches.length);

      for (let index = 0; index < batches.length; index += 1) {
        batchProcessor.setCurrentBatch(index + 1);
        const data = await submitBatch({
          intent: "updateStock",
          products: JSON.stringify(batches[index]),
          locationId: selectedLocationId,
        });

        if (data && "results" in data && Array.isArray(data.results)) {
          batchProcessor.addResults(data.results);
        }
        if (data && "error" in data && data.error) {
          setError(data.error);
          break;
        }
      }

      batchProcessor.setIsProcessing(false);
    })();
  }, [
    products,
    batchProcessor,
    selectedLocationId,
    updateBatchSize,
    submitBatch,
  ]);

  // Handle update results
  const updateComplete =
    updateType !== null &&
    !batchProcessor.isProcessing &&
    batchProcessor.results.length > 0;
  const lookupComplete =
    fetcher.data &&
    "products" in fetcher.data &&
    Array.isArray(fetcher.data.products) &&
    !isLoading;
  const lookupEmpty =
    lookupComplete &&
    fetcher.data?.products &&
    fetcher.data.products.length === 0;

  // Start again
  const handleStartAgain = useCallback(() => {
    setCsvData([]);
    setCsvFileName("");
    setStep("csv");
    setUpdateType(null);
    setProducts([]);
    setError("");
    resetFields();
    batchProcessor.reset();
  }, [resetFields, setProducts, batchProcessor]);

  return (
    <s-page heading="Supplier Updates">
      {error && (
        <s-banner tone="critical" dismissible onDismiss={() => setError("")}>
          {error}
        </s-banner>
      )}

      <s-section heading="How To Use">
        <s-stack gap="base">
          <s-text tone="neutral">
            1. Upload a CSV file from your supplier containing SKU, cost, and
            optionally stock on hand.
          </s-text>
          <s-text tone="neutral">
            2. Map the CSV columns to the required fields.
          </s-text>
          <s-text tone="neutral">
            3. Choose whether to update stock only, or stock and pricing.
          </s-text>
          <s-text tone="neutral">
            4. Review changes and adjust prices if needed before committing.
          </s-text>
        </s-stack>
      </s-section>
      <s-section>
        {/* Step 1: CSV Upload */}
        {step === "csv" && (
          <s-card>
            <s-stack gap="base">
              <CSVUploader
                onFileLoad={handleFileLoad}
                onError={handleFileError}
              />

              {csvData.length > 1 && (
                <s-text tone="critical">
                  {csvData.length - 1} rows loaded from
                  {csvFileName ? ` "${csvFileName}"` : " CSV"}
                </s-text>
              )}

              {csvHeaders.length > 0 && (
                <FieldMapper
                  headers={csvHeaders}
                  fields={fields}
                  onFieldChange={updateField}
                />
              )}

              {allFieldsSelected && (
                <s-button variant="primary" onClick={goToActions}>
                  Next
                </s-button>
              )}
            </s-stack>
          </s-card>
        )}

        {/* Step 2: Actions */}
        {step === "actions" && !updateType && (
          <s-card>
            <s-stack gap="base">
              <s-box>
                <s-stack gap="small-200">
                  <s-heading>Stock Location (in Shopify)</s-heading>
                  <s-select
                    value={selectedLocationId}
                    onChange={handleLocationChange}
                    onInput={handleLocationChange}
                    label="Stock Location (in Shopify)"
                    labelAccessibilityVisibility="exclusive"
                  >
                    {locations.map((location) => (
                      <s-option key={location.id} value={location.id}>
                        {location.name}
                      </s-option>
                    ))}
                  </s-select>
                </s-stack>
              </s-box>
              <ActionSelector
                hasStock={hasStockField}
                onStockOnly={handleStockOnly}
                onStockAndPricing={handleStockAndPricing}
                disabled={isLoading}
              />

              <s-button onClick={goToCSV}>Back to CSV Options</s-button>
            </s-stack>
          </s-card>
        )}

        {/* Stock Update Flow */}
        {step === "actions" && updateType === "stock" && !updateComplete && (
          <s-card>
            <s-stack gap="base">
              <s-heading>Update Stock</s-heading>

              {isLoading && products.length === 0 && (
                <s-box>
                  <s-spinner size="large" />
                  <s-text>
                    Looking up products... This can take a minute!
                  </s-text>
                </s-box>
              )}

              {lookupEmpty && (
                <s-box>
                  <s-text tone="neutral">
                    No matching products were found for those SKUs.
                  </s-text>
                  <s-button onClick={goToCSV}>Start Again</s-button>
                </s-box>
              )}

              {products.length > 0 &&
                (batchProcessor.isProcessing ? (
                  <BatchProgress
                    current={batchProcessor.currentBatch}
                    total={batchProcessor.totalBatches}
                    progress={batchProcessor.progress}
                    isProcessing={batchProcessor.isProcessing}
                  />
                ) : (
                  <>
                    <s-text>
                      Found <strong>{products.length}</strong> products to
                      update.
                    </s-text>

                    <s-stack gap="base" direction="inline">
                      <s-button
                        variant="primary"
                        onClick={handleUpdateStock}
                        disabled={isLoading}
                      >
                        Update Stock Now
                      </s-button>
                      <s-button onClick={goToCSV}>Cancel</s-button>
                    </s-stack>
                  </>
                ))}
            </s-stack>
          </s-card>
        )}

        {/* Pricing Update Flow */}
        {step === "actions" && updateType === "pricing" && !updateComplete && (
          <s-card>
            <s-stack gap="base">
              <s-heading>
                {hasStockField ? "Stock & Pricing" : "Pricing"} Updates
              </s-heading>

              {isLoading && products.length === 0 && (
                <s-box>
                  <s-spinner size="large" />
                  <s-text>
                    Looking up products... This can take a minute!
                  </s-text>
                </s-box>
              )}

              {lookupEmpty && (
                <s-box>
                  <s-text tone="neutral">
                    No matching products were found for those SKUs.
                  </s-text>
                  <s-button onClick={goToCSV}>Start Again</s-button>
                </s-box>
              )}

              {products.length > 0 &&
                (batchProcessor.isProcessing ? (
                  <BatchProgress
                    current={batchProcessor.currentBatch}
                    total={batchProcessor.totalBatches}
                    progress={batchProcessor.progress}
                    isProcessing={batchProcessor.isProcessing}
                  />
                ) : (
                  <>
                    <MarginSettings
                      margin={margin}
                      onMarginChange={setMargin}
                    />

                    <FilterButtons
                      filter={filter}
                      onFilterChange={setFilter}
                      stats={stats}
                    />

                    <ProductTable
                      products={filteredProducts}
                      onToggleUpdate={toggleProductUpdate}
                    onPriceChange={updateProductPrice}
                    onConfirmEdit={confirmProductEdit}
                    onSelectCurrentPage={setUpdatesForVariants}
                    shopDomain={shopDomain}
                    filter={filter}
                  />

                    <div
                      style={{
                        position: "sticky",
                        bottom: "16px",
                      }}
                    >
                      <s-stack gap="base" direction="inline">
                        <s-button
                          variant="primary"
                          onClick={handleUpdatePricing}
                          disabled={isLoading}
                        >
                          Update Now ({stats.toUpdate} products)
                        </s-button>
                        <s-button onClick={goToCSV}>Cancel</s-button>
                      </s-stack>
                    </div>
                  </>
                ))}
            </s-stack>
          </s-card>
        )}

        {/* Results */}
        {updateComplete && (
          <s-card>
            <UpdateResults
              totalChecked={csvData.length - 1}
              totalFound={products.length}
              updatedCount={batchProcessor.updatedCount}
              notUpdatedCount={batchProcessor.notUpdatedCount}
              onStartAgain={handleStartAgain}
            />
          </s-card>
        )}
      </s-section>
    </s-page>
  );
}
