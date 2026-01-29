/**
 * Custom React hooks for Supplier Updates
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import type {
  CSVFieldMapping,
  NormalizedProduct,
  UpdateResponse,
  FilterType,
} from "../types/supplier-updates";
import { getMarginStatus } from "../lib/supplier-updates";

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
      return products.filter((p) => p.marginStatus === "medium");
    }

    if (filter === "neg") {
      return products.filter((p) => p.marginStatus === "negative");
    }

    return products;
  }, [products, filter]);

  const updateProduct = useCallback(
    (variantId: string, updates: Partial<NormalizedProduct>) => {
      setProducts((prev) =>
        prev.map((p) => (p.variantId === variantId ? { ...p, ...updates } : p)),
      );
    },
    [],
  );

  const toggleProductUpdate = useCallback((variantId: string) => {
    setProducts((prev) =>
      prev.map((p) =>
        p.variantId === variantId ? { ...p, update: !p.update } : p,
      ),
    );
  }, []);

  const updateProductPrice = useCallback(
    (variantId: string, newPrice: number) => {
      setProducts((prev) =>
        prev.map((p) => {
          if (p.variantId !== variantId) return p;
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

  const setUpdatesForVariants = useCallback((variantIds: string[]) => {
    const selected = new Set(variantIds);
    setProducts((prev) => {
      let changed = false;
      const next = prev.map((p) => {
        const shouldUpdate = selected.has(p.variantId);
        if (p.update === shouldUpdate) return p;
        changed = true;
        return { ...p, update: shouldUpdate };
      });
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => {
    setProducts((prev) => {
      let changed = false;
      const next = prev.map((p) => {
        const nextStatus = getMarginStatus(p.margin, margin);
        if (p.marginStatus === nextStatus) return p;
        changed = true;
        return { ...p, marginStatus: nextStatus };
      });

      return changed ? next : prev;
    });
  }, [margin]);

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
    setUpdatesForVariants,
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
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [timeout, setTimeoutRef] = useState<NodeJS.Timeout | null>(null);

  const startEditing = useCallback(
    (variantId: string) => {
      // Clear existing timeout
      if (timeout) {
        clearTimeout(timeout);
      }

      setEditingVariantId(variantId);

      // Auto-clear after 5 seconds
      const newTimeout = setTimeout(() => {
        setEditingVariantId(null);
      }, 5000);

      setTimeoutRef(newTimeout);
    },
    [timeout],
  );

  const stopEditing = useCallback(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
    setEditingVariantId(null);
  }, [timeout]);

  return {
    editingVariantId,
    startEditing,
    stopEditing,
    isEditing: (variantId: string) => editingVariantId === variantId,
  };
}
