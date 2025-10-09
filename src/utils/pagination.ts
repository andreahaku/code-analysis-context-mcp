/**
 * Pagination Utility
 *
 * Provides pagination support for large MCP responses.
 * Automatically handles response size management to prevent errors.
 */

// Internal constants (not exported - implementation detail)
const MCP_TOKEN_LIMIT = 25000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/**
 * Pagination parameters interface
 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

/**
 * Pagination metadata
 */
export interface PaginationInfo {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startIndex: number;
  endIndex: number;
}

/**
 * Paginated result wrapper
 */
export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationInfo;
}

/**
 * Estimate tokens from content (rough approximation: 1 token ≈ 4 characters)
 */
export function estimateTokens(content: string | object): number {
  const text = typeof content === "string" ? content : JSON.stringify(content);
  return Math.ceil(text.length / 4);
}

/**
 * Paginate an array of items
 */
export function paginate<T>(
  items: T[],
  params: PaginationParams = {}
): PaginatedResult<T> {
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, params.pageSize || DEFAULT_PAGE_SIZE)
  );

  const totalItems = items.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const currentPage = Math.min(page, Math.max(1, totalPages));

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  const paginatedItems = items.slice(startIndex, endIndex);

  return {
    items: paginatedItems,
    pagination: {
      currentPage,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: currentPage < totalPages,
      hasPreviousPage: currentPage > 1,
      startIndex,
      endIndex,
    },
  };
}

/**
 * Smart pagination that adjusts page size based on estimated token size
 * This ensures we don't exceed MCP token limits
 *
 * AUTO-PAGINATION: Automatically paginates when item count is high
 */
export function smartPaginate<T>(
  items: T[],
  params: PaginationParams = {},
  options: {
    estimateItemTokens?: (item: T) => number;
    maxTokens?: number;
    minPageSize?: number;
    autoPaginate?: boolean; // Auto-enable pagination for large collections
    autoThreshold?: number; // Auto-paginate if items > threshold (default: 100)
  } = {}
): PaginatedResult<T> {
  const {
    estimateItemTokens = (item) => estimateTokens(JSON.stringify(item)),
    maxTokens = MCP_TOKEN_LIMIT * 0.8, // 80% of limit for safety
    minPageSize = 5,
    autoPaginate = true, // Enable by default
    autoThreshold = 100, // Auto-paginate if > 100 items
  } = options;

  // AUTO-PAGINATION: If no pagination params AND many items, force page 1
  // This prevents building huge responses that exceed MCP limits
  if (autoPaginate && !params.page && !params.pageSize && items.length > autoThreshold) {
    params = { ...params, page: 1 };
  }

  let requestedPageSize = params.pageSize || DEFAULT_PAGE_SIZE;

  // If items are very large, adjust page size automatically
  if (items.length > 0) {
    const sampleSize = Math.min(3, items.length);
    const sampleTokens =
      items.slice(0, sampleSize).reduce((sum, item) => sum + estimateItemTokens(item), 0) /
      sampleSize;

    // Calculate safe page size based on average item size
    const safePageSize = Math.max(
      minPageSize,
      Math.floor(maxTokens / sampleTokens)
    );

    requestedPageSize = Math.min(requestedPageSize, safePageSize);
  }

  return paginate(items, { ...params, pageSize: requestedPageSize });
}

/**
 * Add pagination metadata to result object
 */
export function addPaginationMetadata<T extends Record<string, any>>(
  result: T,
  pagination: PaginationInfo,
  message?: string
): T {
  return {
    ...result,
    _pagination: {
      ...pagination,
      message:
        message ||
        (pagination.hasNextPage
          ? `Showing page ${pagination.currentPage}/${pagination.totalPages}. Use 'page: ${pagination.currentPage + 1}' to see more.`
          : `Showing page ${pagination.currentPage}/${pagination.totalPages} (last page).`),
    },
  };
}

/**
 * Create a paginated array field in a result object
 * Useful for when you have multiple arrays to paginate in a single result
 */
export function paginateField<T, K extends keyof T>(
  obj: T,
  fieldName: K,
  params: PaginationParams = {}
): T & { _pagination: Record<string, PaginationInfo> } {
  const items = obj[fieldName];

  if (!Array.isArray(items)) {
    throw new Error(`Field ${String(fieldName)} is not an array`);
  }

  const paginated = smartPaginate(items, params);

  return {
    ...obj,
    [fieldName]: paginated.items,
    _pagination: {
      [String(fieldName)]: paginated.pagination,
    },
  } as T & { _pagination: Record<string, PaginationInfo> };
}

/**
 * Helper to create pagination message for CLI output
 */
export function formatPaginationMessage(pagination: PaginationInfo, itemType: string): string {
  const { currentPage, totalPages, totalItems, pageSize, hasNextPage } = pagination;

  let message = `📄 Page ${currentPage}/${totalPages} • Showing ${pageSize} of ${totalItems} ${itemType}`;

  if (hasNextPage) {
    message += ` • Use 'page: ${currentPage + 1}' to see more`;
  }

  return message;
}

/**
 * Paginate multiple collections with a shared page parameter
 * Returns pagination info for each collection
 */
export function paginateMultiple<T extends Record<string, any[]>>(
  collections: T,
  params: PaginationParams = {}
): {
  data: { [K in keyof T]: T[K] };
  pagination: { [K in keyof T]: PaginationInfo };
} {
  const result: any = { data: {}, pagination: {} };

  for (const [key, items] of Object.entries(collections)) {
    const paginated = smartPaginate(items, params);
    result.data[key] = paginated.items;
    result.pagination[key] = paginated.pagination;
  }

  return result;
}

// Export only the public API
export const Pagination = {
  estimateTokens,
  paginate,
  smartPaginate,
  addPaginationMetadata,
  paginateField,
  formatPaginationMessage,
  paginateMultiple,
};
