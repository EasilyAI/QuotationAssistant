import { buildQuotationApiUrl, getQuotationApiBaseUrl } from '../config/apiConfig';
import { authenticatedFetch } from '../utils/apiClient';

/**
 * Build quotations endpoint URL, handling cases where base URL already includes /quotations
 */
const buildQuotationsUrl = (endpoint = '') => {
  const baseUrl = getQuotationApiBaseUrl();
  if (baseUrl.endsWith('/quotations')) {
    // Base URL already has /quotations, so append endpoint directly
    return endpoint ? `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}` : baseUrl;
  } else {
    // Base URL doesn't have /quotations, so use buildQuotationApiUrl
    return buildQuotationApiUrl(`/quotations${endpoint}`);
  }
};

/**
 * Transform backend quotation format to frontend format
 */
const transformQuotationFromBackend = (backendQuotation) => {
  if (!backendQuotation) return null;

  const lines = backendQuotation.lines || [];
  const incompleteCount = lines.filter(
    line => !line.ordering_number || !line.ordering_number.trim()
  ).length;

  // Extract customer name (handle both string and object formats)
  let customerName = '';
  if (typeof backendQuotation.customer === 'string') {
    customerName = backendQuotation.customer;
  } else if (backendQuotation.customer && backendQuotation.customer.name) {
    customerName = backendQuotation.customer.name;
  }

  return {
    id: backendQuotation.quotation_id,
    quotationNumber: `#${backendQuotation.quotation_id.substring(0, 8)}`,
    name: backendQuotation.name,
    customer: customerName,
    status: backendQuotation.status,
    itemCount: lines.length,
    totalValue: typeof backendQuotation.totals?.total === 'number' 
      ? backendQuotation.totals.total 
      : parseFloat(backendQuotation.totals?.total) || 0,
    incompleteItems: incompleteCount,
    createdDate: backendQuotation.created_at ? backendQuotation.created_at.split('T')[0] : '',
    lastModified: backendQuotation.updated_at ? backendQuotation.updated_at.split('T')[0] : '',
    currency: backendQuotation.currency || 'ILS',
    defaultMargin: (backendQuotation.global_margin_pct || 0) * 100, // Convert to percentage
    notes: backendQuotation.notes || '',
    // Include full data for editing
    _fullData: backendQuotation
  };
};

/**
 * Transform frontend quotation format to backend format
 */
const transformQuotationToBackend = (frontendQuotation) => {
  return {
    name: frontendQuotation.quotationName || frontendQuotation.name,
    customer: typeof frontendQuotation.customer === 'string' 
      ? { name: frontendQuotation.customer }
      : frontendQuotation.customer,
    currency: frontendQuotation.currency || 'ILS',
    vat_rate: frontendQuotation.vatRate,
    global_margin_pct: frontendQuotation.defaultMargin 
      ? frontendQuotation.defaultMargin / 100 
      : undefined,
    notes: frontendQuotation.notes,
    status: frontendQuotation.status
  };
};

/**
 * Transform backend line item format to frontend format
 */
const transformLineFromBackend = (backendLine, index, defaultMargin = 20) => {
  // Handle base_price - null or undefined means price not found
  const basePrice = backendLine.base_price;
  const hasPrice = basePrice != null && basePrice !== '' && !isNaN(parseFloat(basePrice));
  
  // Handle margin - convert from decimal to percentage
  // If margin_pct is null/undefined, use the quotation's defaultMargin
  const marginPct = backendLine.margin_pct;
  const margin = marginPct != null ? parseFloat(marginPct) * 100 : defaultMargin;
  
  return {
    orderNo: index + 1,
    orderingNumber: backendLine.ordering_number || '',
    requestedItem: backendLine.product_name || '',
    productName: backendLine.product_name || '',
    specs: backendLine.description || '',
    quantity: backendLine.quantity || 1,
    price: hasPrice ? parseFloat(basePrice) : null, // null indicates price not found
    margin: margin,
    sketchFile: backendLine.drawing_link || null,
    catalogLink: backendLine.catalog_link || '',
    notes: backendLine.notes || '',
    isIncomplete: !backendLine.ordering_number || !backendLine.ordering_number.trim(),
    line_id: backendLine.line_id,
    originalRequest: backendLine.original_request || '',
    source: backendLine.source || 'manual'
  };
};

/**
 * Transform frontend line item format to backend format
 */
const transformLineToBackend = (frontendLine) => {
  // Handle price - null means price not found, keep as null
  const price = frontendLine.price;
  const basePrice = price != null ? parseFloat(price) : null;
  
  // Handle margin - convert percentage to decimal
  const margin = frontendLine.margin;
  const marginPct = margin != null ? parseFloat(margin) / 100 : undefined;
  
  return {
    ordering_number: frontendLine.orderingNumber || '',
    product_name: frontendLine.productName || frontendLine.requestedItem || 'Item',
    description: frontendLine.specs || frontendLine.description || frontendLine.requestedItem || '',
    quantity: frontendLine.quantity || 1,
    base_price: basePrice,
    margin_pct: marginPct,
    drawing_link: frontendLine.sketchFile || null,
    catalog_link: frontendLine.catalogLink || '',
    notes: frontendLine.notes || '',
    source: frontendLine.source || 'manual',
    original_request: frontendLine.originalRequest || ''
  };
};

/**
 * Create a new quotation
 */
export const createQuotation = async (quotationData) => {
  const backendData = transformQuotationToBackend(quotationData);
  
  const response = await authenticatedFetch(
    buildQuotationsUrl(),
    {
      method: 'POST',
      body: JSON.stringify(backendData)
    },
    'quotation'
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to create quotation' }));
    throw new Error(error.message || `Failed to create quotation: ${response.statusText}`);
  }

  const backendQuotation = await response.json();
  return transformQuotationFromBackend(backendQuotation);
};

/**
 * Get list of quotations with optional filters
 */
export const getQuotations = async ({ status, search, recent, incomplete, limit = 50 } = {}) => {
  const params = new URLSearchParams();
  
  if (status && status !== 'all') {
    params.set('status', status);
  }
  if (search) {
    params.set('search', search);
  }
  if (recent) {
    params.set('recent', 'true');
  }
  if (incomplete) {
    params.set('incomplete', 'true');
  }
  if (limit) {
    params.set('limit', String(limit));
  }

  const url = `${buildQuotationsUrl()}?${params.toString()}`;

  const response = await authenticatedFetch(url, { method: 'GET' }, 'quotation');

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to fetch quotations' }));
    throw new Error(error.message || `Failed to fetch quotations: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    quotations: (data.quotations || []).map(transformQuotationFromBackend),
    count: data.count || 0
  };
};

/**
 * Get a single quotation by ID
 */
export const getQuotation = async (quotationId) => {
  const response = await authenticatedFetch(
    buildQuotationsUrl(`/${quotationId}`),
    { method: 'GET' },
    'quotation'
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Quotation not found' }));
    throw new Error(error.message || `Failed to fetch quotation: ${response.statusText}`);
  }

  const backendQuotation = await response.json();
  const frontendQuotation = transformQuotationFromBackend(backendQuotation);
  
  // Transform lines - use quotation's defaultMargin for items without margin
  const defaultMargin = frontendQuotation.defaultMargin || 20;
  const lines = (backendQuotation.lines || []).map((line, index) => 
    transformLineFromBackend(line, index, defaultMargin)
  );

  return {
    ...frontendQuotation,
    items: lines,
    // Include full backend data for reference
    _backendData: backendQuotation
  };
};

/**
 * Update quotation header/metadata
 */
export const updateQuotation = async (quotationId, quotationData) => {
  const backendData = transformQuotationToBackend(quotationData);
  
  const response = await authenticatedFetch(
    buildQuotationsUrl(`/${quotationId}`),
    {
      method: 'PUT',
      body: JSON.stringify(backendData)
    },
    'quotation'
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to update quotation' }));
    throw new Error(error.message || `Failed to update quotation: ${response.statusText}`);
  }

  const backendQuotation = await response.json();
  return transformQuotationFromBackend(backendQuotation);
};

/**
 * Update quotation status
 */
export const updateQuotationStatus = async (quotationId, status) => {
  const response = await authenticatedFetch(
    buildQuotationsUrl(`/${quotationId}/status`),
    {
      method: 'PATCH',
      body: JSON.stringify({ status })
    },
    'quotation'
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to update status' }));
    throw new Error(error.message || `Failed to update status: ${response.statusText}`);
  }

  const backendQuotation = await response.json();
  return transformQuotationFromBackend(backendQuotation);
};

/**
 * Delete quotation
 */
export const deleteQuotation = async (quotationId) => {
  const response = await authenticatedFetch(
    buildQuotationsUrl(`/${quotationId}`),
    { method: 'DELETE' },
    'quotation'
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to delete quotation' }));
    throw new Error(error.message || `Failed to delete quotation: ${response.statusText}`);
  }

  return true;
};

/**
 * Add line item to quotation
 * 
 * NOTE: For bulk operations, consider using saveQuotationFullState() instead.
 * This single-item endpoint is kept for backward compatibility and incremental updates.
 */
export const addLineItem = async (quotationId, lineData) => {
  const backendLine = transformLineToBackend(lineData);
  
  const response = await authenticatedFetch(
    buildQuotationsUrl(`/${quotationId}/lines`),
    {
      method: 'POST',
      body: JSON.stringify(backendLine)
    },
    'quotation'
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to add line item' }));
    throw new Error(error.message || `Failed to add line item: ${response.statusText}`);
  }

  const backendQuotation = await response.json();
  // Extract defaultMargin from backend (global_margin_pct is 0-1, convert to percentage)
  const defaultMargin = (backendQuotation.global_margin_pct || 0) * 100 || 20;
  const lines = (backendQuotation.lines || []).map((line, index) => 
    transformLineFromBackend(line, index, defaultMargin)
  );

  return lines;
};

/**
 * Batch add line items (for product-search-api integration)
 */
export const batchAddLineItems = async (quotationId, linesData) => {
  const backendLines = linesData.map(transformLineToBackend);
  
  const response = await authenticatedFetch(
    buildQuotationsUrl(`/${quotationId}/lines/batch`),
    {
      method: 'POST',
      body: JSON.stringify({ lines: backendLines })
    },
    'quotation'
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to add line items' }));
    throw new Error(error.message || `Failed to add line items: ${response.statusText}`);
  }

  const backendQuotation = await response.json();
  // Extract defaultMargin from backend (global_margin_pct is 0-1, convert to percentage)
  const defaultMargin = (backendQuotation.global_margin_pct || 0) * 100 || 20;
  const lines = (backendQuotation.lines || []).map((line, index) => 
    transformLineFromBackend(line, index, defaultMargin)
  );

  return lines;
};

/**
 * Update line item
 * 
 * NOTE: For bulk operations, consider using saveQuotationFullState() instead.
 * This single-item endpoint is kept for backward compatibility and incremental updates.
 */
export const updateLineItem = async (quotationId, lineId, lineData) => {
  const backendLine = transformLineToBackend(lineData);
  
  const response = await authenticatedFetch(
    buildQuotationsUrl(`/${quotationId}/lines/${lineId}`),
    {
      method: 'PUT',
      body: JSON.stringify(backendLine)
    },
    'quotation'
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to update line item' }));
    throw new Error(error.message || `Failed to update line item: ${response.statusText}`);
  }

  const backendQuotation = await response.json();
  // Extract defaultMargin from backend (global_margin_pct is 0-1, convert to percentage)
  const defaultMargin = (backendQuotation.global_margin_pct || 0) * 100 || 20;
  const lines = (backendQuotation.lines || []).map((line, index) => 
    transformLineFromBackend(line, index, defaultMargin)
  );

  return lines;
};

/**
 * Delete line item
 * 
 * NOTE: For bulk operations, consider using saveQuotationFullState() instead.
 * This single-item endpoint is kept for backward compatibility and incremental updates.
 */
export const deleteLineItem = async (quotationId, lineId) => {
  const response = await authenticatedFetch(
    buildQuotationsUrl(`/${quotationId}/lines/${lineId}`),
    { method: 'DELETE' },
    'quotation'
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to delete line item' }));
    throw new Error(error.message || `Failed to delete line item: ${response.statusText}`);
  }

  const backendQuotation = await response.json();
  // Extract defaultMargin from backend (global_margin_pct is 0-1, convert to percentage)
  const defaultMargin = (backendQuotation.global_margin_pct || 0) * 100 || 20;
  const lines = (backendQuotation.lines || []).map((line, index) => 
    transformLineFromBackend(line, index, defaultMargin)
  );

  return lines;
};

/**
 * Apply global margin to all lines
 */
export const applyGlobalMargin = async (quotationId, marginPercent) => {
  const marginDecimal = marginPercent / 100;
  
  const response = await authenticatedFetch(
    buildQuotationsUrl(`/${quotationId}/lines/apply-margin`),
    {
      method: 'PATCH',
      body: JSON.stringify({ global_margin_pct: marginDecimal })
    },
    'quotation'
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to apply margin' }));
    throw new Error(error.message || `Failed to apply margin: ${response.statusText}`);
  }

  const backendQuotation = await response.json();
  // Extract defaultMargin from backend (global_margin_pct is 0-1, convert to percentage)
  const defaultMargin = (backendQuotation.global_margin_pct || 0) * 100 || 20;
  const lines = (backendQuotation.lines || []).map((line, index) => 
    transformLineFromBackend(line, index, defaultMargin)
  );

  return lines;
};

/**
 * Refresh prices from price list
 */
export const refreshPrices = async (quotationId) => {
  const response = await authenticatedFetch(
    buildQuotationsUrl(`/${quotationId}/lines/refresh-prices`),
    { method: 'POST' },
    'quotation'
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to refresh prices' }));
    throw new Error(error.message || `Failed to refresh prices: ${response.statusText}`);
  }

  const backendQuotation = await response.json();
  // Extract defaultMargin from backend (global_margin_pct is 0-1, convert to percentage)
  const defaultMargin = (backendQuotation.global_margin_pct || 0) * 100 || 20;
  const lines = (backendQuotation.lines || []).map((line, index) => 
    transformLineFromBackend(line, index, defaultMargin)
  );

  return lines;
};

/**
 * Export stock check Excel - returns file data for direct download
 */
export const exportStockCheck = async (quotationId) => {
  const response = await authenticatedFetch(
    buildQuotationsUrl(`/${quotationId}/exports/stock-check`),
    { method: 'POST' },
    'quotation'
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to export stock check' }));
    throw new Error(error.message || `Failed to export stock check: ${response.statusText}`);
  }

  const data = await response.json();
  
  // Convert base64 to blob and trigger download
  const byteCharacters = atob(data.data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: data.content_type });
  
  // Create download link and trigger
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = data.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
  
  return { filename: data.filename, success: true };
};

/**
 * Export priority import Excel - returns file data for direct download
 */
export const exportPriorityImport = async (quotationId) => {
  const response = await authenticatedFetch(
    buildQuotationsUrl(`/${quotationId}/exports/priority-import`),
    { method: 'POST' },
    'quotation'
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to export priority import' }));
    throw new Error(error.message || `Failed to export priority import: ${response.statusText}`);
  }

  const data = await response.json();
  
  // Convert base64 to blob and trigger download
  const byteCharacters = atob(data.data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: data.content_type });
  
  // Create download link and trigger
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = data.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
  
  return { filename: data.filename, success: true };
};

/**
 * Generate email draft
 */
export const generateEmailDraft = async (quotationId, customerEmail) => {
  const response = await authenticatedFetch(
    buildQuotationsUrl(`/${quotationId}/email-draft`),
    {
      method: 'POST',
      body: JSON.stringify({ customer_email: customerEmail })
    },
    'quotation'
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to generate email draft' }));
    throw new Error(error.message || `Failed to generate email draft: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
};

/**
 * Save complete quotation state (replaces everything atomically)
 * 
 * This is the new simplified approach that replaces the entire quotation state
 * instead of tracking individual changes. Much simpler and more reliable.
 */
export const saveQuotationFullState = async (quotationId, quotationState) => {
  const payload = {
    metadata: {
      name: quotationState.quotationName || quotationState.name,
      customer: typeof quotationState.customer === 'string' 
        ? { name: quotationState.customer }
        : quotationState.customer,
      currency: quotationState.currency || 'ILS',
      status: quotationState.status || 'Draft',
      global_margin_pct: quotationState.defaultMargin 
        ? quotationState.defaultMargin / 100 
        : 0.0,
      notes: quotationState.notes || ''
    },
    lines: (quotationState.items || []).map(item => {
      const lineData = {
        ordering_number: item.orderingNumber || '',
        product_name: item.productName || item.requestedItem || 'Item',
        description: item.specs || item.description || '',
        quantity: item.quantity || 1,
        base_price: item.price != null ? parseFloat(item.price) : null,
        margin_pct: item.margin != null ? parseFloat(item.margin) / 100 : null,
        drawing_link: item.sketchFile || null,
        catalog_link: item.catalogLink || '',
        notes: item.notes || '',
        source: item.source || 'manual',
        original_request: item.originalRequest || ''
      };
      
      // Only include line_id if it exists (for existing items)
      if (item.line_id) {
        lineData.line_id = item.line_id;
      }
      
      return lineData;
    })
  };
  
  const response = await authenticatedFetch(
    buildQuotationsUrl(`/${quotationId}/full-state`),
    {
      method: 'PUT',
      body: JSON.stringify(payload)
    },
    'quotation'
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ 
      message: 'Failed to save quotation' 
    }));
    throw new Error(error.message || `Failed to save: ${response.statusText}`);
  }

  const backendQuotation = await response.json();
  
  // Transform backend response to frontend format
  const frontendQuotation = transformQuotationFromBackend(backendQuotation);
  
  // Transform lines - use quotation's defaultMargin for items without margin
  const defaultMargin = frontendQuotation.defaultMargin || 20;
  const lines = (backendQuotation.lines || []).map((line, index) => 
    transformLineFromBackend(line, index, defaultMargin)
  );

  return {
    ...frontendQuotation,
    items: lines
  };
};

