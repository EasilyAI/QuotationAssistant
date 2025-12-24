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
  BALL_VALVE = 'Ball Valve',
  PLUG_VALVE = 'Plug Valve',
  CHECK_VALVE = 'Check Valve',
  NEEDLE_VALVE = 'Needle Valve',
  DIAPHRAGM_SEALED_VALVE = 'Diaphragm Sealed Valve',
  QUICK_CONNECT_ALT = 'Quick Connect',
  WELDING_SYSTEM = 'Welding System',
  BELLOWS_SEALED_VALVE = 'Bellows Sealed Valve',
  UNCATEGORIZED = 'UNCATEGORIZED',
}

/**
 * Catalog product pointer (as stored in DynamoDB Products table)
 * This is for reference only - the API resolves these to fetch live data
 */
export interface CatalogProductPointer {
  fileId: string;
  fileKey?: string;
  fileName?: string;
  orderingNumber: string; // Primary key for matching in catalog-products table
  productId?: number; // Legacy field, less reliable
  tableIndex?: number; // Fallback identifier
  snapshot?: CatalogProduct; // Snapshot for reference, but API fetches live data
}

/**
 * Resolved catalog product with metadata from pointer resolution
 * This is the LIVE data fetched from catalog-products table, not a snapshot!
 * Users can edit specs and other fields, so we always fetch current data.
 */
export interface ResolvedCatalogProduct extends CatalogProduct {
  _fileId?: string;        // Metadata: source file ID
  _fileName?: string;      // Metadata: source file name
  _fileKey?: string;       // Metadata: S3 key
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
  // Resolved fields (populated when fetched via getProduct)
  sourceFile?: string;
  createdAt?: number;
  createdAtIso?: string;
  SwagelokLink?: string;
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
 * Current price information fetched from the most recent price list
 */
export interface CurrentPrice {
  price?: number;
  description?: string;
  SwagelokLink?: string;
  year?: string;
  fileId?: string;
  sourceFile?: string;
  addedAt?: number;
  addedAtIso?: string;
}

/**
 * Product type - handles both creating and fetching products
 * 
 * When SAVING new products:
 *   - catalogProducts is CatalogProductPointer[] (with snapshots)
 * 
 * When FETCHING from API:
 *   - catalogProducts is ResolvedCatalogProduct[] (live data from catalog-products table)
 *   - currentPrice is populated
 * 
 * IMPORTANT: When displaying products from API, use ResolvedCatalogProduct fields directly,
 * NOT snapshots! Users can edit specs after initial save.
 */
export interface Product {
  orderingNumber: string; // Primary key (SKU)
  productCategory: ProductCategory; // GSI
  
  // Catalog products - pointers when saving, resolved when fetching
  catalogProducts?: (CatalogProductPointer | ResolvedCatalogProduct)[];
  
  // Price list sources (resolved with metadata when fetching, sorted by year latest first)
  priceListPointers?: PriceListPointer[];
  
  // Sales drawing sources
  salesDrawings?: SalesDrawingPointer[];

  // Current price (only populated when fetched via getProduct API)
  currentPrice?: CurrentPrice;

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

