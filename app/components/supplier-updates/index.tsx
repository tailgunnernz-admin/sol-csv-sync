/**
 * Supplier Updates Components
 * React components using Shopify Polaris Web Components
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CSVFieldMapping,
  NormalizedProduct,
  FilterType,
} from "../../types/supplier-updates";
import { formatCurrency, formatMargin } from "../../lib/supplier-updates";

/**
 * CSV File Upload Component
 */
interface CSVUploaderProps {
  onFileLoad: (data: string[][], fileName: string) => void;
  onError: (error: string) => void;
  disabled?: boolean;
}

export function CSVUploader({
  onFileLoad,
  onError,
  disabled,
}: CSVUploaderProps) {
  const handleChange = useCallback(
    async (event: Event) => {
      const target = event.currentTarget as { files?: FileList } | null;
      const eventTarget = event.target as { files?: FileList } | null;
      const detailFiles = (event as CustomEvent).detail?.files as
        | FileList
        | File[]
        | undefined;
      const file =
        target?.files?.[0] || eventTarget?.files?.[0] || detailFiles?.[0];
      if (!file) return;

      try {
        const text = await file.text();

        // Simple CSV parser
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
                current += '"';
                i++;
              } else {
                inQuotes = !inQuotes;
              }
            } else if (char === "," && !inQuotes) {
              row.push(current.trim());
              current = "";
            } else {
              current += char;
            }
          }

          row.push(current.trim());
          rows.push(row);
        }

        onFileLoad(rows, file.name);
      } catch {
        onError("Error parsing CSV file. Please check the format.");
      }
    },
    [onFileLoad, onError],
  );

  return (
    <s-box>
      <s-stack gap="base">
        <s-heading>Upload CSV File</s-heading>
        <s-text tone="neutral">
          If your CSV file doesn&apos;t load correctly, try importing it to
          Google Sheets first, then download it as CSV again.
        </s-text>
        <s-drop-zone
          accessibilityLabel="Upload CSV file"
          accept=".csv"
          onChange={handleChange}
          disabled={disabled}
        />
      </s-stack>
    </s-box>
  );
}

/**
 * Field Mapping Component
 */
interface FieldMapperProps {
  headers: string[];
  fields: CSVFieldMapping;
  onFieldChange: (
    field: keyof CSVFieldMapping,
    value: number | "none" | null,
  ) => void;
}

export function FieldMapper({
  headers,
  fields,
  onFieldChange,
}: FieldMapperProps) {
  const handleChange = useCallback(
    (field: keyof CSVFieldMapping) => (event: Event) => {
      const customEvent = event as CustomEvent;
      const detailValue = customEvent.detail?.value as string | undefined;
      const currentTargetValue = (
        event.currentTarget as { value?: string } | null
      )?.value;
      const targetValue = (event.target as { value?: string } | null)?.value;
      const value = detailValue ?? currentTargetValue ?? targetValue ?? "";
      if (value === "") {
        onFieldChange(field, null);
      } else if (value === "none") {
        onFieldChange(field, "none");
      } else {
        onFieldChange(field, parseInt(value, 10));
      }
    },
    [onFieldChange],
  );

  return (
    <s-box>
      <s-stack gap="base">
        <s-heading>Map CSV Columns</s-heading>

        <s-stack gap="small-100" direction="inline">
          <s-select
            value={fields.sku.value !== null ? fields.sku.value.toString() : ""}
            onChange={handleChange("sku")}
            onInput={handleChange("sku")}
            label={fields.sku.label}
          >
            <s-option value="" disabled selected={fields.sku.value === null}>
              Please select...
            </s-option>
            {headers.map((header, i) => (
              <s-option key={i} value={i.toString()}>
                {header}
              </s-option>
            ))}
          </s-select>

          <s-select
            value={
              fields.cost.value !== null ? fields.cost.value.toString() : ""
            }
            onChange={handleChange("cost")}
            onInput={handleChange("cost")}
            label={fields.cost.label}
          >
            <s-option value="" disabled selected={fields.cost.value === null}>
              Please select...
            </s-option>
            {headers.map((header, i) => (
              <s-option key={i} value={i.toString()}>
                {header}
              </s-option>
            ))}
          </s-select>

          <s-select
            value={fields.soh.value !== null ? fields.soh.value.toString() : ""}
            onChange={handleChange("soh")}
            onInput={handleChange("soh")}
            label={fields.soh.label}
          >
            <s-option value="" disabled selected={fields.soh.value === null}>
              Please select...
            </s-option>
            <s-option value="none">N/A (No stock update)</s-option>
            {headers.map((header, i) => (
              <s-option key={i} value={i.toString()}>
                {header}
              </s-option>
            ))}
          </s-select>
        </s-stack>
      </s-stack>
    </s-box>
  );
}

/**
 * Action Selector Component
 */
interface ActionSelectorProps {
  hasStock: boolean;
  onStockOnly: () => void;
  onStockAndPricing: () => void;
  disabled?: boolean;
}

export function ActionSelector({
  hasStock,
  onStockOnly,
  onStockAndPricing,
  disabled,
}: ActionSelectorProps) {
  return (
    <s-box>
      <s-stack gap="base">
        <s-heading>What would you like to update?</s-heading>

        <s-stack gap="base" direction="inline">
          {hasStock && (
            <s-button onClick={onStockOnly} disabled={disabled}>
              Stock Only
            </s-button>
          )}
          <s-button
            variant="primary"
            onClick={onStockAndPricing}
            disabled={disabled}
          >
            {hasStock ? "Stock & Pricing" : "Pricing Only"}
          </s-button>
        </s-stack>
      </s-stack>
    </s-box>
  );
}

/**
 * Batch Progress Component
 */
interface BatchProgressProps {
  current: number;
  total: number;
  progress: number;
  isProcessing: boolean;
}

export function BatchProgress({
  current,
  total,
  isProcessing,
}: BatchProgressProps) {
  if (!isProcessing) return null;

  return (
    <s-box padding="base" borderRadius="base" background="strong">
      <s-stack gap="base">
        <s-stack gap="small-200" direction="inline">
          <s-spinner size="base" />
          <s-heading>Updating...</s-heading>
        </s-stack>
        <s-text tone="neutral">
          Batch {current} of {total}
        </s-text>
      </s-stack>
    </s-box>
  );
}

/**
 * Update Results Component
 */
interface UpdateResultsProps {
  totalChecked: number;
  totalFound: number;
  updatedCount: number;
  notUpdatedCount: number;
  onStartAgain: () => void;
}

export function UpdateResults({
  totalChecked,
  totalFound,
  updatedCount,
  notUpdatedCount,
  onStartAgain,
}: UpdateResultsProps) {
  return (
    <s-box padding="base" border-radius="base" background="strong">
      <s-stack gap="base">
        <s-heading>Update Complete!</s-heading>

        <s-stack gap="small">
          <s-text>
            <strong>{totalChecked}</strong> SKUs checked
          </s-text>
          <s-text>
            <strong>{totalFound}</strong> SKUs found
          </s-text>
          <s-text>
            <strong>{updatedCount}</strong> SKUs updated
          </s-text>
          <s-text>
            <strong>{notUpdatedCount}</strong> SKUs not updated
          </s-text>
        </s-stack>

        <s-button variant="primary" onClick={onStartAgain}>
          Start Again
        </s-button>
      </s-stack>
    </s-box>
  );
}

/**
 * Cost Cell - Shows cost comparison with arrows
 */
interface CostCellProps {
  currentCost: number;
  newCost: number;
}

export function CostCell({ currentCost, newCost }: CostCellProps) {
  const increased = newCost > currentCost;
  const decreased = newCost < currentCost;

  return (
    <s-stack gap="small-300" direction="inline">
      <s-text>{formatCurrency(currentCost)}</s-text>
      <s-text>→</s-text>
      <s-text>{formatCurrency(newCost)}</s-text>
      {increased && (
        <span
          style={{
            backgroundColor: "#830e00",
            color: "#ffeae8",
            padding: "1px 4px",
            borderRadius: "3px",
            fontSize: "10px",
          }}
        >
          ↑
        </span>
      )}
      {decreased && (
        <span
          style={{
            backgroundColor: "#357a35",
            color: "#f0fff0",
            padding: "1px 4px",
            borderRadius: "3px",
            fontSize: "10px",
          }}
        >
          ↓
        </span>
      )}
    </s-stack>
  );
}

/**
 * Margin Badge Component
 */
interface MarginBadgeProps {
  margin: number;
  status: "good" | "medium" | "negative";
}

export function MarginBadge({ margin, status }: MarginBadgeProps) {
  const tone =
    status === "good"
      ? "success"
      : status === "medium"
        ? "warning"
        : "critical";

  return <s-badge tone={tone}>{formatMargin(margin)}</s-badge>;
}

/**
 * Filter Buttons Component
 */
interface FilterButtonsProps {
  filter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  stats: {
    total: number;
    good: number;
    medium: number;
    negative: number;
  };
}

export function FilterButtons({
  filter,
  onFilterChange,
  stats,
}: FilterButtonsProps) {
  return (
    <s-stack gap="base" direction="inline">
      <s-button
        variant={filter === "all" ? "primary" : "secondary"}
        onClick={() => onFilterChange("all")}
      >
        All Products ({stats.total})
      </s-button>
      <s-button
        variant={filter === "med" ? "primary" : "secondary"}
        onClick={() => onFilterChange("med")}
      >
        Medium Margins ({stats.medium})
      </s-button>
      <s-button
        variant={filter === "neg" ? "primary" : "secondary"}
        onClick={() => onFilterChange("neg")}
      >
        Negative Margins ({stats.negative})
      </s-button>
    </s-stack>
  );
}

/**
 * Product Table Row Component
 */
interface ProductRowProps {
  product: NormalizedProduct;
  onToggleUpdate: (variantId: string) => void;
  onPriceChange: (variantId: string, price: number) => void;
  shopDomain?: string | null;
}

export function ProductRow({
  product,
  onToggleUpdate,
  onPriceChange,
  shopDomain,
}: ProductRowProps) {
  const handlePriceChange = useCallback(
    (e: Event) => {
      const target = e.currentTarget as HTMLInputElement | null;
      const value = target?.value ? parseFloat(target.value) : 0;
      onPriceChange(product.variantId, value);
    },
    [onPriceChange, product.variantId],
  );
  const productId = product.id.split("/").pop();
  const shopHost = shopDomain
    ? shopDomain.replace(/^https?:\/\//, "").replace(/\/$/, "")
    : null;
  const adminUrl =
    productId && shopHost
      ? `https://${shopHost}/admin/products/${productId}`
      : null;

  return (
    <s-table-row>
      <s-table-cell>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div>
            {product.image ? (
              <s-box inlineSize="40px">
                <s-image
                  src={product.image}
                  alt={product.name}
                  objectFit="cover"
                  aspectRatio="1/1"
                  borderRadius="base"
                  inlineSize="fill"
                />
              </s-box>
            ) : (
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  backgroundColor: "#e0e0e0",
                  borderRadius: "4px",
                }}
              />
            )}
          </div>
          <s-box inlineSize="85%">
            <div>
              <strong>{product.name}</strong>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                marginTop: "4px",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  backgroundColor: "rgba(0,0,0,0.1)",
                  padding: "1px 5px",
                  borderRadius: "5px",
                  display: "inline-block",
                  fontSize: "12px",
                }}
              >
                {product.sku}
              </div>
              {adminUrl && (
                <s-link href={adminUrl} target="_blank">
                  Edit &gt;
                </s-link>
              )}
            </div>
          </s-box>
        </div>
      </s-table-cell>
      <s-table-cell>
        <CostCell currentCost={product.cost} newCost={product.costNew} />
      </s-table-cell>
      <s-table-cell>
        <MarginBadge margin={product.margin} status={product.marginStatus} />
      </s-table-cell>
      <s-table-cell>
        <s-box inlineSize="100px">
          <s-number-field
            label="Price"
            labelAccessibilityVisibility="exclusive"
            step={0.01}
            min={0}
            value={product.price.toString()}
            onChange={handlePriceChange}
          />
        </s-box>
      </s-table-cell>
      <s-table-cell>
        <s-checkbox
          accessibilityLabel="Update Product?"
          checked={product.update}
          onChange={() => onToggleUpdate(product.variantId)}
        />
      </s-table-cell>
    </s-table-row>
  );
}

/**
 * Product Table Component
 */
interface ProductTableProps {
  products: NormalizedProduct[];
  onToggleUpdate: (variantId: string) => void;
  onPriceChange: (variantId: string, price: number) => void;
  onSelectCurrentPage?: (variantIds: string[]) => void;
  shopDomain?: string | null;
  filter: FilterType;
}

export function ProductTable({
  products,
  onToggleUpdate,
  onPriceChange,
  onSelectCurrentPage,
  shopDomain,
  filter,
}: ProductTableProps) {
  const showDevSelectCurrentPage = import.meta.env.DEV;
  const itemsPerPage = 50;
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.ceil(products.length / itemsPerPage);
  const paginate = totalPages > 1;

  const hasNextPage = currentPage < totalPages;
  const hasPreviousPage = currentPage > 1;

  useEffect(() => {
    if (totalPages === 0 && currentPage !== 1) {
      setCurrentPage(1);
      return;
    }
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter]);

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProducts = useMemo(
    () => products.slice(startIndex, endIndex),
    [products, startIndex, endIndex],
  );

  const handleSelectCurrentPage = useCallback(() => {
    if (!onSelectCurrentPage) return;
    onSelectCurrentPage(paginatedProducts.map((product) => product.variantId));
  }, [onSelectCurrentPage, paginatedProducts]);

  console.log("Rendering ProductTable:", {
    currentPage,
    totalPages,
    hasNextPage,
    hasPreviousPage,
    paginatedProducts,
  });

  if (products.length === 0) {
    return (
      <s-box padding="base">
        <s-text tone="neutral">No products found.</s-text>
      </s-box>
    );
  }

  return (
    <>
      {(paginate || (onSelectCurrentPage && showDevSelectCurrentPage)) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "8px",
          }}
        >
          {paginate ? (
            <s-text tone="neutral">
              Page {currentPage} of {totalPages}
            </s-text>
          ) : (
            <span />
          )}
          {onSelectCurrentPage && showDevSelectCurrentPage && (
            <s-button variant="secondary" onClick={handleSelectCurrentPage}>
              Dev: Select current page
            </s-button>
          )}
        </div>
      )}
      <s-table
        paginate={paginate}
        hasPreviousPage={hasPreviousPage}
        hasNextPage={hasNextPage}
        onPreviousPage={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
        onNextPage={() =>
          setCurrentPage((prev) => Math.min(prev + 1, totalPages))
        }
      >
        <s-table-header-row>
          <s-table-header listSlot="primary">Product</s-table-header>
          <s-table-header>Cost Change</s-table-header>
          <s-table-header>New Margin</s-table-header>
          <s-table-header>Price</s-table-header>
          <s-table-header>Update?</s-table-header>
        </s-table-header-row>

        <s-table-body>
          {paginatedProducts.map((product) => (
            <ProductRow
              key={product.variantId}
              product={product}
              onToggleUpdate={onToggleUpdate}
              onPriceChange={onPriceChange}
              shopDomain={shopDomain}
            />
          ))}
        </s-table-body>
      </s-table>
    </>
  );
}

/**
 * Margin Settings Component
 */
interface MarginSettingsProps {
  margin: number;
  onMarginChange: (margin: number) => void;
}

export function MarginSettings({
  margin,
  onMarginChange,
}: MarginSettingsProps) {
  const handleChange = useCallback(
    (event: Event) => {
      const target = event.currentTarget as HTMLInputElement | null;
      const value = target?.value ?? "";
      onMarginChange(parseFloat(value) || 0);
    },
    [onMarginChange],
  );

  return (
    <s-box padding="base" borderRadius="base" background="subdued">
      <s-stack gap="base">
        <s-number-field
          label="Target Margin Threshold (%):"
          value={margin.toString()}
          onChange={handleChange}
          min={0}
          step={1}
        />
        <s-text>
          Margins at or above this threshold show as green. Margins below but
          still positive show as orange. Negative margins show as red.
        </s-text>
      </s-stack>
    </s-box>
  );
}
