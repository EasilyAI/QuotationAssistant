export interface BoundingBox {
  left: number; // (0-1, relative to page width)
  top: number; // (0-1, relative to page height)
  width: number; // (0-1, relative to page width)
  height: number; // (0-1, relative to page height)
}

export interface ProductLocation {
  page: number; // 1-based page index
  boundingBox?: BoundingBox;
}

export enum CatalogProductStatus {
  PendingReview = 'pending_review',
  Reviewed = 'reviewed',
}

export interface CatalogProduct {
  id: number;
  orderingNumber: string;
  specs?: Record<string, string>;
  location?: ProductLocation;
  status?: CatalogProductStatus;
  /**
   * Index of the table that produced this product within the source file.
   * Useful when mapping back to original extraction data.
   */
  tindex?: number;
}

export const defaultCatalogProduct: Omit<CatalogProduct, 'id' | 'orderingNumber'> = {
  specs: {},
  location: undefined,
  status: CatalogProductStatus.PendingReview,
  tindex: undefined,
};

export function createCatalogProduct(
  data: Partial<CatalogProduct> & { id: number; orderingNumber: string },
): CatalogProduct {
  return {
    id: data.id,
    orderingNumber: data.orderingNumber,
    specs: data.specs ?? {},
    location: data.location,
    status: data.status ?? CatalogProductStatus.PendingReview,
    tindex: data.tindex,
  };
}

export type CatalogProducts = Record<string, CatalogProduct>;

