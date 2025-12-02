/**
 * Database item types that mirror the Python types in extractCatalogInfo/utils/types.py
 * These enforce structure for items stored in DynamoDB tables.
 */

import { CatalogProduct } from './catalogProduct';
import { Product, CatalogProductPointer, PriceListPointer, SalesDrawingPointer } from './products';

// ============================================================================
// CATALOG PRODUCTS TABLE (hb-catalog-products)
// Temporary table for review before saving to Products table
// ============================================================================

/**
 * Document stored in catalog-products table.
 * One document per file, containing all products from that file.
 */
export interface CatalogProductsDocument {
  fileId: string; // Primary Key
  sourceFile: string;
  createdAt: number;
  updatedAt: number;
  products: CatalogProduct[];
  productsCount: number;
}

// ============================================================================
// PRICE LIST PRODUCTS TABLE (hb-price-list-products)
// Chunked storage of price list products
// ============================================================================

/**
 * Individual price list product.
 */
export interface PriceListProductItem {
  orderingNumber: string;
  description?: string;
  price?: number;
  SwagelokLink?: string; // Product URL
  rowNumber?: number;
  status?: 'valid' | 'invalid';
  errors?: string[];
  warnings?: string[];
}

/**
 * Chunk of price list products.
 * Products are split into chunks to stay within DynamoDB's 400KB item limit.
 */
export interface PriceListProductsChunk {
  fileId: string; // Partition Key
  chunkIndex: number; // Sort Key (0, 1, 2, ...)
  products: PriceListProductItem[];
  productsInChunk: number;
  updatedAt: number;
  updatedAtIso: string;
  
  // Metadata fields (only in chunk 0)
  sourceFile?: string;
  createdAt?: number;
  createdAtIso?: string;
  totalProductsCount?: number;
  totalChunks?: number;
}

// ============================================================================
// PRODUCTS TABLE (hb-products)
// Canonical product records with ONLY pointers to source tables
// Already defined in products.ts as Product interface
// ============================================================================

// Re-export Product and related types for convenience
export type { 
  Product, 
  CatalogProductPointer, 
  PriceListPointer, 
  SalesDrawingPointer 
} from './products';

// ============================================================================
// FILES TABLE (hb-files)
// ============================================================================

// Import FileStatus from files.ts to avoid duplicate exports
// We don't re-export these - they're already exported from files.ts via index.ts
import { FileStatus } from './files';

// Define FileType locally for database table
// (different from BusinessFileType in files.ts which is for forms)
export type DBFileType = 'Catalog' | 'Price List' | 'Sales Drawing';

/**
 * File metadata in files table (DynamoDB structure).
 * Note: FileStatus is imported from files.ts
 */
export interface FileItem {
  fileId: string; // Primary Key
  s3Key: string;
  fileName: string;
  fileType: DBFileType;
  status: FileStatus;
  uploadedAt: number;
  uploadedAtIso: string;
  updatedAt?: number;
  processingStage?: string;
  error?: string;
  
  // Catalog-specific fields
  pagesCount?: number;
  tablesCount?: number;
  tablesWithProducts?: number;
  productsCount?: number;
  textractJobId?: string;
  textractResultsKey?: string;
  
  // Price list-specific fields
  validProductsCount?: number;
  invalidProductsCount?: number;
  totalErrors?: number;
  totalWarnings?: number;
  year?: string;
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Type guard to check if an object is a valid Product.
 */
export function isProduct(obj: any): obj is Product {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.orderingNumber === 'string' &&
    obj.orderingNumber.length > 0 &&
    typeof obj.productCategory === 'string'
  );
}

/**
 * Type guard to check if an object is a valid CatalogProductPointer.
 */
export function isCatalogProductPointer(obj: any): obj is CatalogProductPointer {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.fileId === 'string'
  );
}

/**
 * Type guard to check if an object is a valid PriceListPointer.
 */
export function isPriceListPointer(obj: any): obj is PriceListPointer {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.fileId === 'string' &&
    typeof obj.chunkIndex === 'number'
  );
}

/**
 * Validate product structure before sending to backend.
 * Throws an error if the structure is invalid.
 */
export function validateProductForSave(product: any): asserts product is Product {
  if (!isProduct(product)) {
    throw new Error('Invalid product structure: missing required fields');
  }
  
  // Validate catalogProducts array if present
  if (product.catalogProducts) {
    if (!Array.isArray(product.catalogProducts)) {
      throw new Error('catalogProducts must be an array');
    }
    product.catalogProducts.forEach((pointer, index) => {
      if (!isCatalogProductPointer(pointer)) {
        throw new Error(`Invalid catalog product pointer at index ${index}`);
      }
    });
  }
  
  // Validate priceListPointers array if present
  if (product.priceListPointers) {
    if (!Array.isArray(product.priceListPointers)) {
      throw new Error('priceListPointers must be an array');
    }
    product.priceListPointers.forEach((pointer, index) => {
      if (!isPriceListPointer(pointer)) {
        throw new Error(`Invalid price list pointer at index ${index}`);
      }
    });
  }
  
  // Validate salesDrawings array if present
  if (product.salesDrawings) {
    if (!Array.isArray(product.salesDrawings)) {
      throw new Error('salesDrawings must be an array');
    }
    product.salesDrawings.forEach((pointer, index) => {
      if (typeof pointer.fileId !== 'string') {
        throw new Error(`Invalid sales drawing pointer at index ${index}`);
      }
    });
  }
}

/**
 * Create a properly structured Product object for saving to database.
 */
export function createProductItem(params: {
  orderingNumber: string;
  productCategory: string;
  catalogProducts?: CatalogProductPointer[];
  priceListPointers?: PriceListPointer[];
  salesDrawings?: SalesDrawingPointer[];
  createdAt?: number;
  updatedAt?: number;
  createdAtIso?: string;
  updatedAtIso?: string;
}): Product {
  const product: Product = {
    orderingNumber: params.orderingNumber,
    productCategory: params.productCategory as any, // Cast to ProductCategory enum
  };
  
  if (params.catalogProducts) {
    product.catalogProducts = params.catalogProducts;
  }
  
  if (params.priceListPointers) {
    product.priceListPointers = params.priceListPointers;
  }
  
  if (params.salesDrawings) {
    product.salesDrawings = params.salesDrawings;
  }
  
  if (params.createdAt) {
    product.createdAt = params.createdAt;
  }
  
  if (params.updatedAt) {
    product.updatedAt = params.updatedAt;
  }
  
  if (params.createdAtIso) {
    product.createdAtIso = params.createdAtIso;
  }
  
  if (params.updatedAtIso) {
    product.updatedAtIso = params.updatedAtIso;
  }
  
  // Validate before returning
  validateProductForSave(product);
  
  return product;
}

