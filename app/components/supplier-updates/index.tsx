/**
 * Supplier Updates Components
 * React components using Shopify Polaris Web Components
 */

import { useCallback, type ChangeEvent } from "react";
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
  onFileLoad: (data: string[][]) => void;
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

        onFileLoad(rows);
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
  progress,
  isProcessing,
}: BatchProgressProps) {
  if (!isProcessing) return null;

  return (
    <s-box padding="base" border-radius="base" background="strong">
      <s-stack gap="base">
        <s-heading>Updating...</s-heading>
        <s-progress-bar progress={progress} />
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
    <s-inline-stack gap="100" align="center">
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
    </s-inline-stack>
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
  onToggleUpdate: (sku: string) => void;
  onPriceChange: (sku: string, price: number) => void;
}

export function ProductRow({
  product,
  onToggleUpdate,
  onPriceChange,
}: ProductRowProps) {
  const handlePriceChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value) || 0;
      onPriceChange(product.sku, value);
    },
    [onPriceChange, product.sku],
  );

  return (
    <s-table-row>
      <s-table-cell>
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
      </s-table-cell>
      <s-table-cell>
        <div>
          <strong>{product.name}</strong>
        </div>
        <div
          style={{
            backgroundColor: "rgba(0,0,0,0.1)",
            padding: "1px 5px",
            borderRadius: "5px",
            display: "inline-block",
            marginTop: "4px",
            fontSize: "12px",
          }}
        >
          {product.sku}
        </div>
      </s-table-cell>
      <s-table-cell>
        <CostCell currentCost={product.cost} newCost={product.costNew} />
      </s-table-cell>
      <s-table-cell>
        <MarginBadge margin={product.margin} status={product.marginStatus} />
      </s-table-cell>
      <s-table-cell>
        <input
          type="number"
          value={product.price.toFixed(2)}
          onChange={handlePriceChange}
          step="0.01"
          min="0"
          style={{
            padding: "6px",
            borderRadius: "4px",
            border: "1px solid #ccc",
            width: "100px",
          }}
        />
      </s-table-cell>
      <s-table-cell>
        <input
          type="checkbox"
          checked={product.update}
          onChange={() => onToggleUpdate(product.sku)}
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
  onToggleUpdate: (sku: string) => void;
  onPriceChange: (sku: string, price: number) => void;
}

export function ProductTable({
  products,
  onToggleUpdate,
  onPriceChange,
}: ProductTableProps) {
  if (products.length === 0) {
    return (
      <s-box padding="base">
        <s-text tone="neutral">No products found.</s-text>
      </s-box>
    );
  }

  return (
    <s-table>
      <s-table-header-row>
        <s-table-header>Image</s-table-header>
        <s-table-header>Product</s-table-header>
        <s-table-header>Cost Change</s-table-header>
        <s-table-header>New Margin</s-table-header>
        <s-table-header>Price</s-table-header>
        <s-table-header>Update?</s-table-header>
      </s-table-header-row>

      <s-table-body>
        {products.map((product) => (
          <ProductRow
            key={product.sku}
            product={product}
            onToggleUpdate={onToggleUpdate}
            onPriceChange={onPriceChange}
          />
        ))}
      </s-table-body>
    </s-table>
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
    <s-box padding="base" border-radius="base" background="subdued">
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
