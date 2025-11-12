/**
 * Type definitions for Catalog Product data structure
 * 
 * This type represents a product extracted from a catalog table.
 * All fields except 'id' and 'orderingNumber' are optional and will have
 * default/empty values when instantiated if missing from the event data.
 */

export interface BoundingBox {
  /** Left position (0-1, relative to page width) */
  left: number;
  /** Top position (0-1, relative to page height) */
  top: number;
  /** Width (0-1, relative to page width) */
  width: number;
  /** Height (0-1, relative to page height) */
  height: number;
}

export interface ProductLocation {
  /** Page number in the PDF document (1-based) */
  page: number;
  /** Bounding box coordinates for PDF preview (optional) */
  boundingBox?: BoundingBox;
}

export interface CatalogProduct {
  /** Auto-generated unique identifier */
  id: number;
  /** Product ordering/part number (required) */
  orderingNumber: string;
  /** Product specifications as key-value pairs (optional) */
  specs?: Record<string, string>;
  /** Location information for PDF preview (optional) */
  location?: ProductLocation;
}

/**
 * Default/empty values for CatalogProduct
 * Use this when instantiating a product with missing fields
 */
export const defaultCatalogProduct: Omit<CatalogProduct, 'id' | 'orderingNumber'> = {
  specs: {},
  location: undefined,
};

/**
 * Helper function to create a CatalogProduct with defaults for missing fields
 */
export function createCatalogProduct(data: Partial<CatalogProduct> & { id: number; orderingNumber: string }): CatalogProduct {
  return {
    id: data.id,
    orderingNumber: data.orderingNumber,
    specs: data.specs ?? {},
    location: data.location,
  };
}

/**
 * Type for the products dictionary (keyed by ordering number)
 */
export type CatalogProducts = Record<string, CatalogProduct>;

