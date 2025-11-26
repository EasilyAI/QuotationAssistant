import { CatalogProduct } from './catalogProduct';

export enum ProductCategory {
  HOSE = 'Hose',
  REGULATOR = 'Regulator',
  VALVE = 'Valve',
  FITTING = 'Fitting',
  DPG = 'DPG',
  TUBING = 'Tubing',
  FILTER = 'Filter',
  QUICK_CONNECT = 'Quick-Connect',
}

/** Pointer to a catalog product source */
export interface CatalogProductPointer {
  fileId: string;
  fileKey?: string;
  fileName?: string;
  productId?: number;
  tableIndex?: number;
  snapshot?: CatalogProduct;
}

/**
 * Pointer to a price list entry
 * Actual price data is stored in the price-list-products table and resolved on fetch
 */
export interface PriceListPointer {
  fileId: string;
  chunkIndex: number; // Which chunk in the price-list-products table
  year?: string; // For sorting by year
  addedAt?: number;
  addedAtIso?: string;
}

/**
 * Sales drawing reference
 */
export interface SalesDrawingPointer {
  fileId: string;
  fileKey: string;
  fileName?: string;
  manufacturer?: string;
  notes?: string;
  link?: string; // SwagelokLink
}

/**
 * Metadata containing pointers to all product information sources
 * All data is referenced by pointers and resolved on fetch
 */
export interface ProductMetadata {
  // Catalog product sources
  catalogProducts?: CatalogProductPointer[];
  
  // Price list sources (sorted by year, latest first)
  priceListPointers?: PriceListPointer[];
  
  // Sales drawing sources
  salesDrawings?: SalesDrawingPointer[];
}

/**
 * Final product stored in the Products table
 * Canonical product record with pointers to all related information
 */
export interface Product {
  orderingNumber: string; // Primary key (SKU)
  productCategory: ProductCategory;
  metadata: ProductMetadata;
  text_description: string;
  
  // Denormalized fields for quick access and listing (updated when pointers change)
  // These are cached values - actual data lives in source tables
  currentPrice?: number;
  currentPriceYear?: string;
  currentPriceFileId?: string; // Which file has the current price
  currentLink?: string;

  // Timestamps
  createdAt?: number;
  updatedAt?: number;
  createdAtIso?: string;
  updatedAtIso?: string;
}

/**
 * Resolved product with all pointer data fetched
 * This is what getProduct returns after resolving all pointers
 */
export interface ResolvedProduct extends Product {
  resolvedPriceListEntries?: ResolvedPriceListEntry[];
}

/**
 * Resolved price list entry with actual data from price-list-products table
 */
export interface ResolvedPriceListEntry {
  fileId: string;
  fileName?: string;
  year?: string;
  price: number;
  description?: string;
  link?: string;
  orderingNumber: string;
  // Indicates if the source file still exists
  sourceAvailable: boolean;
}

