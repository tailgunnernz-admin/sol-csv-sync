/**
 * Custom React hooks for Supplier Updates
 */

import { useState, useCallback, useMemo } from "react";
import type {
  CSVFieldMapping,
  NormalizedProduct,
  UpdateResponse,
  FilterType,
} from "../types/supplier-updates";

/**
 * Hook to manage CSV field mapping state
 */
export function useCSVFieldMapping() {
  const [fields, setFields] = useState<CSVFieldMapping>({
    sku: { label: "SKU Column", value: null },
    cost: { label: "Cost Column", value: null },
    soh: { label: "Stock on Hand Column", value: null },
  });

  const updateField = useCallback(
    (fieldKey: keyof CSVFieldMapping, value: number | "none" | null) => {
      setFields((prev) => ({
        ...prev,
        [fieldKey]: { ...prev[fieldKey], value },
      }));
    },
    [],
  );

  const resetFields = useCallback(() => {
    setFields({
      sku: { label: "SKU Column", value: null },
      cost: { label: "Cost Column", value: null },
      soh: { label: "Stock on Hand Column", value: null },
    });
  }, []);

  const allFieldsSelected = useMemo(() => {
    return (
      fields.sku.value !== null &&
      fields.cost.value !== null &&
      fields.soh.value !== null
    );
  }, [fields]);

  return {
    fields,
    updateField,
    resetFields,
    allFieldsSelected,
  };
}

/**
 * Hook to manage pricing products state with filtering
 */
export function usePricingProducts(marginThreshold: number = 5) {
  const [products, setProducts] = useState<NormalizedProduct[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [margin, setMargin] = useState(marginThreshold);

  const filteredProducts = useMemo(() => {
    if (filter === "all") return products;

    if (filter === "med") {
      return products.filter((p) => p.margin > 0 && p.margin < margin);
    }

    if (filter === "neg") {
      return products.filter((p) => p.margin < 0);
    }

    return products;
  }, [products, filter, margin]);

  const updateProduct = useCallback(
    (sku: string, updates: Partial<NormalizedProduct>) => {
      setProducts((prev) =>
        prev.map((p) => (p.sku === sku ? { ...p, ...updates } : p)),
      );
    },
    [],
  );

  const toggleProductUpdate = useCallback((sku: string) => {
    setProducts((prev) =>
      prev.map((p) => (p.sku === sku ? { ...p, update: !p.update } : p)),
    );
  }, []);

  const updateProductPrice = useCallback(
    (sku: string, newPrice: number) => {
      setProducts((prev) =>
        prev.map((p) => {
          if (p.sku !== sku) return p;
          const newMargin = (newPrice / p.costNew) * 100 - 100;
          return {
            ...p,
            price: newPrice,
            margin: newMargin,
            marginStatus:
              newMargin < 0
                ? "negative"
                : newMargin < margin
                  ? "medium"
                  : "good",
          };
        }),
      );
    },
    [margin],
  );

  const selectableProducts = useMemo(
    () => products.filter((p) => p.update),
    [products],
  );

  const stats = useMemo(() => {
    const good = products.filter((p) => p.marginStatus === "good").length;
    const medium = products.filter((p) => p.marginStatus === "medium").length;
    const negative = products.filter(
      (p) => p.marginStatus === "negative",
    ).length;
    const toUpdate = products.filter((p) => p.update).length;

    return { total: products.length, good, medium, negative, toUpdate };
  }, [products]);

  return {
    products,
    setProducts,
    filteredProducts,
    filter,
    setFilter,
    margin,
    setMargin,
    updateProduct,
    toggleProductUpdate,
    updateProductPrice,
    selectableProducts,
    stats,
  };
}

/**
 * Hook to manage batch processing state
 */
export function useBatchProcessor() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [results, setResults] = useState<UpdateResponse[]>([]);

  const progress = useMemo(() => {
    if (totalBatches === 0) return 0;
    return Math.round((currentBatch / totalBatches) * 100);
  }, [currentBatch, totalBatches]);

  const updatedCount = useMemo(
    () => results.filter((r) => r.updated).length,
    [results],
  );

  const notUpdatedCount = useMemo(
    () => results.filter((r) => !r.updated).length,
    [results],
  );

  const reset = useCallback(() => {
    setIsProcessing(false);
    setCurrentBatch(0);
    setTotalBatches(0);
    setResults([]);
  }, []);

  const addResults = useCallback((newResults: UpdateResponse[]) => {
    setResults((prev) => [...prev, ...newResults]);
  }, []);

  return {
    isProcessing,
    setIsProcessing,
    currentBatch,
    setCurrentBatch,
    totalBatches,
    setTotalBatches,
    results,
    setResults,
    progress,
    updatedCount,
    notUpdatedCount,
    reset,
    addResults,
  };
}

/**
 * Hook to manage editing timeout (debounce for price changes)
 */
export function useEditingState() {
  const [editingSku, setEditingSku] = useState<string | null>(null);
  const [timeout, setTimeoutRef] = useState<NodeJS.Timeout | null>(null);

  const startEditing = useCallback(
    (sku: string) => {
      // Clear existing timeout
      if (timeout) {
        clearTimeout(timeout);
      }

      setEditingSku(sku);

      // Auto-clear after 5 seconds
      const newTimeout = setTimeout(() => {
        setEditingSku(null);
      }, 5000);

      setTimeoutRef(newTimeout);
    },
    [timeout],
  );

  const stopEditing = useCallback(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
    setEditingSku(null);
  }, [timeout]);

  return {
    editingSku,
    startEditing,
    stopEditing,
    isEditing: (sku: string) => editingSku === sku,
  };
}
