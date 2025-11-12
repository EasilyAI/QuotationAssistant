/**
 * JSDoc type definitions for Catalog Product data structure
 * 
 * This can be used in JavaScript files with JSDoc comments.
 * For TypeScript, use catalogProduct.ts instead.
 * 
 * @typedef {Object} BoundingBox
 * @property {number} left - Left position (0-1, relative to page width)
 * @property {number} top - Top position (0-1, relative to page height)
 * @property {number} width - Width (0-1, relative to page width)
 * @property {number} height - Height (0-1, relative to page height)
 * 
 * @typedef {Object} ProductLocation
 * @property {number} page - Page number in the PDF document (1-based)
 * @property {BoundingBox} [boundingBox] - Bounding box coordinates for PDF preview (optional)
 * 
 * @typedef {Object} CatalogProduct
 * @property {number} id - Auto-generated unique identifier
 * @property {string} orderingNumber - Product ordering/part number (required)
 * @property {Record<string, string>} [specs] - Product specifications as key-value pairs (optional)
 * @property {ProductLocation} [location] - Location information for PDF preview (optional)
 * 
 * @typedef {Record<string, CatalogProduct>} CatalogProducts
 */

/**
 * Default/empty values for CatalogProduct
 * Use this when instantiating a product with missing fields
 * 
 * @type {Omit<CatalogProduct, 'id' | 'orderingNumber'>}
 */
export const defaultCatalogProduct = {
  specs: {},
  location: undefined,
};

/**
 * Helper function to create a CatalogProduct with defaults for missing fields
 * 
 * @param {Partial<CatalogProduct> & { id: number; orderingNumber: string }} data
 * @returns {CatalogProduct}
 */
export function createCatalogProduct(data) {
  return {
    id: data.id,
    orderingNumber: data.orderingNumber,
    specs: data.specs ?? {},
    location: data.location,
  };
}

