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

export interface ProductMetadata {
  sourceFileId: string;
  sourceFileKey?: string;
  sourceFileName?: string;
  catalogProductId?: number;
  catalogProductTableIndex?: number;
  catalogProductSnapshot?: CatalogProduct;
  alternateCatalogProductSnapshots?: CatalogProduct[];
}

/**
 * Final product stored in the Products table
 * Canonical product record with metadata pointing to original catalog product
 */
export interface Product {
  orderingNumber: string; // Primary key
  productCategory: ProductCategory;
  metadata: ProductMetadata;
  text_description: string;
  productPriceKey?: string;

  // Timestamps
  createdAt?: number;
  updatedAt?: number;
  createdAtIso?: string;
  updatedAtIso?: string;
}

