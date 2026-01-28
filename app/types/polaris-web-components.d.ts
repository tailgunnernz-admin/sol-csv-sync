/**
 * Global TypeScript declarations for Shopify Polaris Web Components
 * These are custom elements that work at runtime but need JSX declarations
 */

declare namespace JSX {
  interface IntrinsicElements {
    // Layout components
    "s-page": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        heading?: string;
      },
      HTMLElement
    >;
    "s-layout": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    >;
    "s-layout-section": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        variant?: "oneThird" | "oneHalf" | "fullWidth";
      },
      HTMLElement
    >;
    "s-card": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        title?: string;
      },
      HTMLElement
    >;
    "s-box": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        padding?: string;
        background?: string;
        "border-radius"?: string;
      },
      HTMLElement
    >;

    // Stack components
    "s-block-stack": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        gap?: string;
        align?: string;
      },
      HTMLElement
    >;
    "s-inline-stack": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        gap?: string;
        align?: string;
        wrap?: boolean;
      },
      HTMLElement
    >;

    // Text components
    "s-text": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        variant?: string;
        tone?: string;
        fontWeight?: string;
      },
      HTMLElement
    >;

    // Interactive components
    "s-button": React.DetailedHTMLProps<
      React.ButtonHTMLAttributes<HTMLButtonElement> & {
        variant?:
          | "primary"
          | "secondary"
          | "tertiary"
          | "plain"
          | "destructive";
        size?: "slim" | "medium" | "large";
        fullWidth?: boolean;
      },
      HTMLButtonElement
    >;
    "s-button-group": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        gap?: string;
      },
      HTMLElement
    >;

    // Form components
    "s-text-field": React.DetailedHTMLProps<
      React.InputHTMLAttributes<HTMLInputElement> & {
        label?: string;
        error?: string;
        helpText?: string;
      },
      HTMLInputElement
    >;
    "s-select": React.DetailedHTMLProps<
      React.SelectHTMLAttributes<HTMLSelectElement> & {
        label?: string;
        options?: Array<{ label: string; value: string }>;
      },
      HTMLSelectElement
    >;
    "s-checkbox": React.DetailedHTMLProps<
      React.InputHTMLAttributes<HTMLInputElement> & {
        label?: string;
      },
      HTMLInputElement
    >;

    // Feedback components
    "s-banner": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        tone?: "info" | "success" | "warning" | "critical";
        title?: string;
        onDismiss?: () => void;
      },
      HTMLElement
    >;
    "s-badge": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        tone?:
          | "success"
          | "info"
          | "attention"
          | "warning"
          | "critical"
          | "new";
      },
      HTMLElement
    >;
    "s-spinner": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        size?: "small" | "large";
      },
      HTMLElement
    >;
    "s-progress-bar": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        progress?: number;
        size?: "small" | "medium" | "large";
      },
      HTMLElement
    >;

    // Navigation components
    "s-app-nav": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    >;
    "s-link": React.DetailedHTMLProps<
      React.AnchorHTMLAttributes<HTMLAnchorElement> & {
        href?: string;
        target?: string;
      },
      HTMLAnchorElement
    >;

    // List components
    "s-unordered-list": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    >;
    "s-list-item": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    >;

    // Content components
    "s-section": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & {
        heading?: string;
        slot?: string;
      },
      HTMLElement
    >;
    "s-paragraph": React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement>,
      HTMLElement
    >;
  }
}
