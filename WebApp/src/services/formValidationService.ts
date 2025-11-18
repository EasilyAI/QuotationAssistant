import {
  FileType,
  CatalogFormData,
  SalesDrawingFormData,
  PriceListFormData,
  FileValidationResult
} from '../types';

/**
 * Validate form data before upload
 * @param {CatalogFormData | SalesDrawingFormData | PriceListFormData} formData - Form data to validate
 * @param {FileType} fileType - Type of file being uploaded
 * @returns {FileValidationResult} Validation result with error message if invalid
 */
export const validateUploadForm = (
  formData: CatalogFormData | SalesDrawingFormData | PriceListFormData,
  fileType: FileType
): FileValidationResult => {
  switch (fileType) {
    case FileType.Catalog:
      const catalogData = formData as CatalogFormData;
      if (!catalogData.catalogName?.trim()) {
        return { valid: false, error: 'Catalog Name is required' };
      }
      if (!catalogData.productCategory?.trim()) {
        return { valid: false, error: 'Product Category is required' };
      }
      if (!catalogData.catalogSerialNumber?.trim()) {
        return { valid: false, error: 'Catalog Serial Number is required' };
      }
      if (!catalogData.year?.trim()) {
        return { valid: false, error: 'Year is required' };
      }
      // catalogDescription and onlineLink are optional based on form design
      break;

    case FileType.SalesDrawing:
      const salesDrawingData = formData as SalesDrawingFormData;
      if (!salesDrawingData.drawingName?.trim()) {
        return { valid: false, error: 'Drawing Name is required' };
      }
      if (!salesDrawingData.orderingNumber?.trim()) {
        return { valid: false, error: 'Ordering Number is required' };
      }
      if (!salesDrawingData.manufacturer?.trim()) {
        return { valid: false, error: 'Manufacturer is required' };
      }
      if (!salesDrawingData.year?.trim()) {
        return { valid: false, error: 'Year is required' };
      }
      // swaglokLink and notes are optional (swaglokLink is explicitly optional in type)
      break;

    case FileType.PriceList:
      const priceListData = formData as PriceListFormData;
      if (!priceListData.fileName?.trim()) {
        return { valid: false, error: 'File Name is required' };
      }
      if (!priceListData.year?.trim()) {
        return { valid: false, error: 'Year is required' };
      }
      // description is optional
      break;

    default:
      return { valid: false, error: 'Invalid file type' };
  }

  return { valid: true };
};

