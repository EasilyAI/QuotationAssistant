import * as XLSX from 'xlsx';
import { ProductCategory } from '../types/products';

/**
 * Parse Excel file and extract batch search items
 * @param {File} file - Excel file (.xlsx or .xls)
 * @returns {Promise<{items: Array, errors: Array}>} Parsed items and validation errors
 */
export const parseExcelFile = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Get first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: '', // Default value for empty cells
          raw: false, // Convert all values to strings
        });

        if (jsonData.length < 2) {
          reject(new Error('Excel file must have at least a header row and one data row'));
          return;
        }

        // Extract headers (first row)
        const headers = jsonData[0].map(h => String(h).trim().toLowerCase());
        
        // Find column indices
        const orderingNumberIdx = findColumnIndex(headers, ['orderingNumber', 'orderingnumber', 'ordering number','ordering_number', 'order number', 'sku', 'part number']);
        const descriptionIdx = findColumnIndex(headers, ['description', 'desc', 'product description', 'item description']);
        const quantityIdx = findColumnIndex(headers, ['quantity', 'qty', 'qty.', 'amount']);
        const productTypeIdx = findColumnIndex(headers, ['producttype', 'product type', 'category', 'product category','productCategory', 'type']);

        // Validate required columns
        const missingColumns = [];
        if (orderingNumberIdx === -1 && descriptionIdx === -1) {
          missingColumns.push('Either "orderingNumber" or "description" column is required');
        }
        if (quantityIdx === -1) {
          missingColumns.push('"quantity" column is required');
        }
        // productType is optional - will show warning if missing

        if (missingColumns.length > 0) {
          reject(new Error(`Missing required columns: ${missingColumns.join(', ')}`));
          return;
        }

        // Parse data rows
        const items = [];
        const errors = [];
        const validProductCategories = Object.values(ProductCategory);

        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          const rowNumber = i + 1; // Excel row number (1-indexed, accounting for header)
          
          const orderingNumber = orderingNumberIdx >= 0 ? String(row[orderingNumberIdx] || '').trim() : '';
          const description = descriptionIdx >= 0 ? String(row[descriptionIdx] || '').trim() : '';
          const quantityStr = quantityIdx >= 0 ? String(row[quantityIdx] || '').trim() : '';
          const productType = productTypeIdx >= 0 ? String(row[productTypeIdx] || '').trim() : '';

          // Validate row
          const rowErrors = [];
          const rowWarnings = [];

          // Check if both orderingNumber and description are empty
          if (!orderingNumber && !description) {
            rowErrors.push('Either ordering number or description must be provided');
          }

          // Validate product type (optional but show warning if missing)
          if (!productType) {
            rowWarnings.push('Product type is missing - this may affect search results');
          } else if (!validProductCategories.includes(productType)) {
            rowErrors.push(`Invalid product type "${productType}". Must be one of: ${validProductCategories.join(', ')}`);
          }

          // Validate quantity
          let quantity = 1; // Default quantity
          if (quantityStr) {
            const parsedQty = parseFloat(quantityStr);
            if (isNaN(parsedQty) || parsedQty < 0) {
              rowErrors.push(`Invalid quantity: "${quantityStr}". Must be a positive number`);
            } else {
              quantity = Math.max(1, Math.floor(parsedQty)); // Ensure integer >= 1
            }
          }

          const isValid = rowErrors.length === 0;

          items.push({
            itemNumber: i, // 1-indexed item number
            orderingNumber,
            description,
            quantity,
            productType: productType || null,
            isValid,
            errors: rowErrors.length > 0 ? rowErrors : undefined,
            warnings: rowWarnings.length > 0 ? rowWarnings : undefined,
            rowNumber,
          });

          if (rowErrors.length > 0 || rowWarnings.length > 0) {
            errors.push({
              rowNumber,
              orderingNumber,
              description,
              errors: rowErrors,
              warnings: rowWarnings,
            });
          }
        }

        resolve({ items, errors });
      } catch (error) {
        reject(new Error(`Failed to parse Excel file: ${error.message}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsArrayBuffer(file);
  });
};

/**
 * Find column index by matching header names
 * @param {Array<string>} headers - Array of header strings
 * @param {Array<string>} possibleNames - Possible column names to match
 * @returns {number} Column index or -1 if not found
 */
const findColumnIndex = (headers, possibleNames) => {
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    for (const name of possibleNames) {
      if (header === name.toLowerCase()) {
        return i;
      }
    }
  }
  return -1;
};

/**
 * Get valid product categories for validation
 * @returns {Array<string>} List of valid product categories
 */
export const getValidProductCategories = () => {
  return Object.values(ProductCategory);
};

