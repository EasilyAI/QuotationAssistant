import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getProductByOrderingNo } from '../data/mockProducts';
import { fetchProductByOrderingNumber } from '../services/productsService';
import { getFileDownloadUrl, getFileInfo } from '../services/fileInfoService';
import CatalogPreviewDialog from '../components/CatalogPreviewDialog';
import AddToQuotationDialog from '../components/AddToQuotationDialog';
import './ProductPage.css';

const formatLabel = (key = '') => {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (str) => str.toUpperCase());
};

const buildSourcesFromPointers = (record = {}) => {
  const sources = [];

  // Build sources from RESOLVED catalog products (fetched from catalog-products table)
  const catalogProducts = record.catalogProducts || [];
  catalogProducts.forEach(product => {
    // Resolved products have _fileId, _fileName from the resolver
    const fileName = product._fileName || 'Catalog';
    const fileId = product._fileId || product.fileId;
    const page = product.location?.page;
    
    sources.push({
      type: fileName,
      year: page ? `Page ${page}` : fileId || 'Catalog Source',
      pages: page ? `Page ${page}` : undefined,
      hasPrice: false,
      fileId: fileId,
    });
  });

  // Build sources from price list pointers (resolved with metadata)
  const priceListPointers = record.priceListPointers || [];
  priceListPointers.forEach(pointer => {
    sources.push({
      type: 'Price List',
      year: pointer.year || 'Unknown',
      pages: pointer.sourceFile || pointer.fileId,
      hasPrice: true,
      fileId: pointer.fileId,
      link: pointer.SwagelokLink,
    });
  });

  // Build sources from sales drawing pointers
  const salesDrawings = record.salesDrawings || [];
  salesDrawings.forEach(drawing => {
    sources.push({
      type: 'Sales Drawing',
      year: drawing.fileName || 'Drawing',
      pages: drawing.manufacturer || 'Unknown Manufacturer',
      hasPrice: false,
      fileId: drawing.fileId,
      fileKey: drawing.fileKey,
    });
  });

  return sources;
};

const buildProductDetailsFromRecord = (record, specs) => {
  // Get first RESOLVED catalog product (fetched from catalog-products table, NOT snapshot!)
  const catalogProducts = record.catalogProducts || [];
  const firstCatalogProduct = catalogProducts[0] || {};
  
  // Use current specs from user's editing or fall back to resolved catalog product specs
  const derivedSpecs = Object.keys(specs || {}).length > 0 ? specs : firstCatalogProduct.specs || {};

  // Get current price from resolved price data (most recent)
  const currentPrice = record.currentPrice || {};
  const price = currentPrice.price ?? null;
  const priceYear = currentPrice.year || null;
  const swagelokLink = currentPrice.SwagelokLink || null;

  // Extract review status from catalog product
  const isReviewed = firstCatalogProduct.status === 'reviewed' || firstCatalogProduct.isReviewed === true;

  // Separate descriptions
  const catalogDescription = firstCatalogProduct.description || null;
  const priceListDescription = currentPrice.description || null;
  const manualInput = firstCatalogProduct.manualInput || null;

  return {
    orderingNo: record.orderingNumber || '',
    productName:
      manualInput ||
      catalogDescription ||
      priceListDescription ||
      record.orderingNumber ||
      'Product',
    type: record.productCategory || 'Unknown',
    manufacturer: firstCatalogProduct._fileName || 'Unknown Source',
    catalogDescription: catalogDescription,
    priceListDescription: priceListDescription,
    manualInput: manualInput,
    isReviewed: isReviewed,
    specifications: derivedSpecs,
    price: price,
    priceYear: priceYear,
    swagelokLink: swagelokLink,
    catalogPage: firstCatalogProduct.location?.page ? `Page ${firstCatalogProduct.location.page}` : 'N/A',
    image: firstCatalogProduct.image || null,
    sources: buildSourcesFromPointers(record),
    sourceFileName: firstCatalogProduct._fileName || '—',
    sourceFileId: firstCatalogProduct._fileId || '—',
    lastUpdated: record.updatedAtIso || record.createdAtIso || null,
  };
};

const buildProductDetailsFromMock = (mock, specs) => {
  const derivedSpecs = Object.keys(specs || {}).length > 0 ? specs : mock.specifications || {};
  return {
    orderingNo: mock.orderingNo,
    productName: mock.productName,
    type: mock.type,
    manufacturer: mock.manufacturer,
    catalogDescription: mock.description || null,
    priceListDescription: null,
    manualInput: null,
    isReviewed: false,
    specifications: derivedSpecs,
    price: mock.price,
    catalogPage: mock.catalogPage,
    image: mock.image,
    sources: mock.sources || [],
    sourceFileName: 'Sample Dataset',
    sourceFileId: 'mock',
    lastUpdated: null,
  };
};

const buildDefaultProductDetails = (orderingNo, specs) => ({
  orderingNo: orderingNo,
  productName: 'Product Not Found',
  type: 'Unknown',
  manufacturer: 'Unknown',
  catalogDescription: null,
  priceListDescription: null,
  manualInput: null,
  isReviewed: false,
  specifications: specs || {},
  price: null,
  catalogPage: 'N/A',
  image: null,
  sources: [],
  sourceFileName: '—',
  sourceFileId: '—',
  lastUpdated: null,
});

const ProductPage = () => {
  const { orderingNo } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const fallbackProduct = getProductByOrderingNo(orderingNo);
  
  // Check if we came from search page
  const fromSearch = location.state?.fromSearch || false;

  const [productRecord, setProductRecord] = useState(null);
  const [specifications, setSpecifications] = useState(fallbackProduct?.specifications || {});
  const [isEditingSpecs, setIsEditingSpecs] = useState(false);
  const [newSpecKey, setNewSpecKey] = useState('');
  const [newSpecValue, setNewSpecValue] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [imageError, setImageError] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [filePreviewUrl, setFilePreviewUrl] = useState(null);
  const [cachedPreviewUrlKey, setCachedPreviewUrlKey] = useState(null);
  const [cachedPreviewUrlTimestamp, setCachedPreviewUrlTimestamp] = useState(null);
  const [salesDrawingPreviewUrl, setSalesDrawingPreviewUrl] = useState(null);
  const [salesDrawingPreviewKey, setSalesDrawingPreviewKey] = useState(null);
  const [showAddToQuotationDialog, setShowAddToQuotationDialog] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setProductRecord(null);
    setSpecifications(fallbackProduct?.specifications ? { ...fallbackProduct.specifications } : {});
    setIsEditingSpecs(false);
    setErrorMessage('');
    setImageError(false);

    const loadProduct = async () => {
      if (!orderingNo) {
        setIsLoading(false);
        setErrorMessage('Ordering number missing.');
        return;
      }

      setIsLoading(true);
      try {
        const product = await fetchProductByOrderingNumber(orderingNo);
        if (!isMounted) return;
        setProductRecord(product);
        // Get specs from first RESOLVED catalog product (live data from catalog-products table)
        const catalogProducts = product?.catalogProducts || [];
        const catalogProductSpecs = catalogProducts[0]?.specs || {};
        setSpecifications({ ...catalogProductSpecs });
      } catch (error) {
        console.error('[ProductPage] Failed to fetch product', error);
        if (!isMounted) return;
        setProductRecord(null);
        setSpecifications(fallbackProduct?.specifications ? { ...fallbackProduct.specifications } : {});
        setErrorMessage(error.message || 'Failed to load product details');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadProduct();

    return () => {
      isMounted = false;
    };
  }, [orderingNo, fallbackProduct]);

  const productDetails = useMemo(() => {
    if (productRecord) {
      return buildProductDetailsFromRecord(productRecord, specifications);
    }
    if (fallbackProduct) {
      return buildProductDetailsFromMock(fallbackProduct, specifications);
    }
    return buildDefaultProductDetails(orderingNo, specifications);
  }, [productRecord, fallbackProduct, specifications, orderingNo]);

  /**
   * Build a quotation line item from the current product,
   * enriching it with catalog / sales drawing S3 keys when available.
   */
  const buildQuotationItemForQuotation = useCallback(() => {
    // Base identity/price information comes from derived productDetails
    const orderingNumber = productDetails.orderingNo || '';
    
    // Avoid "Product Not Found" - use orderingNumber if productName is that
    let name = productDetails.productName;
    if (!name || name === 'Product Not Found') {
      name = productDetails.orderingNo || orderingNumber || 'Product';
    }

    // Default values
    let sketchFile = null;
    let catalogLink = null;

    // If we have a live product record from the API, use its resolved pointers
    if (productRecord) {
      const catalogProducts = productRecord.catalogProducts || [];
      const salesDrawings = productRecord.salesDrawings || [];

      // Catalog: prefer resolved file key (_fileKey) but fall back to fileKey
      const primaryCatalogProduct = catalogProducts[0];
      if (primaryCatalogProduct) {
        const fileKey = primaryCatalogProduct._fileKey || primaryCatalogProduct.fileKey;
        if (fileKey) {
          catalogLink = fileKey;
        }
      }

      // Sales drawing: take first drawing's fileKey as sketch reference
      if (salesDrawings && salesDrawings.length > 0) {
        const firstDrawing = salesDrawings[0];
        if (firstDrawing && firstDrawing.fileKey) {
          sketchFile = firstDrawing.fileKey;
        }
      }
    }

    return {
      orderNo: 1, // Will be adjusted in the quotation page
      orderingNumber,
      requestedItem: name,
      productName: name,
      productType: productDetails.type || 'Valve',
      quantity: 1,
      price: productDetails.price || 0,
      margin: 20,
      sketchFile,
      catalogLink,
      notes: 'Added from product page',
      isIncomplete: false,
    };
  }, [productRecord, productDetails]);

  const handleSpecChange = (key, value) => {
    setSpecifications((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleRemoveSpec = (key) => {
    setSpecifications((prev) => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
  };

  const handleAddSpec = () => {
    const trimmedKey = newSpecKey.trim();
    const trimmedValue = newSpecValue.trim();

    if (trimmedKey && trimmedValue) {
      setSpecifications((prev) => ({
        ...prev,
        [trimmedKey]: trimmedValue,
      }));
      setNewSpecKey('');
      setNewSpecValue('');
    }
  };

  const ensurePreviewUrl = useCallback(async (fileKey) => {
    if (!fileKey) {
      setPreviewError('No source file available for preview.');
      return null;
    }

    // Check if we have a valid cached URL for this file key
    const PRESIGNED_URL_TTL_MS = 50 * 60 * 1000; // 50 minutes
    const now = Date.now();
    const isCachedUrlValid =
      filePreviewUrl &&
      cachedPreviewUrlKey === fileKey &&
      cachedPreviewUrlTimestamp &&
      now - cachedPreviewUrlTimestamp < PRESIGNED_URL_TTL_MS;

    if (isCachedUrlValid) {
      return filePreviewUrl;
    }

    // Cache is invalid or missing - fetch a fresh URL
    setPreviewError(null);
    setIsPreviewLoading(true);
    try {
      const response = await getFileDownloadUrl(fileKey);
      if (!response?.url) {
        throw new Error('Missing download URL for this file.');
      }
      setFilePreviewUrl(response.url);
      setCachedPreviewUrlKey(fileKey);
      setCachedPreviewUrlTimestamp(now);
      return response.url;
    } catch (error) {
      setPreviewError('Unable to generate preview link. Please try again.');
      return null;
    } finally {
      setIsPreviewLoading(false);
    }
  }, [filePreviewUrl, cachedPreviewUrlKey, cachedPreviewUrlTimestamp]);

  const handleViewSalesDrawing = useCallback(async (salesDrawing) => {
    const fileKey = salesDrawing.fileKey;
    if (!fileKey) {
      alert('No sales drawing file reference available.');
      return;
    }

    setIsPreviewLoading(true);
    setPreviewError(null);
    try {
      const url = await ensurePreviewUrl(fileKey);
      if (url) {
        setSalesDrawingPreviewUrl(url);
        setSalesDrawingPreviewKey(fileKey);
        setIsPreviewOpen(true);
      }
    } catch (error) {
      setPreviewError('Unable to open sales drawing preview.');
    } finally {
      setIsPreviewLoading(false);
    }
  }, [ensurePreviewUrl]);

  const handleViewInCatalog = useCallback(async () => {
    const catalogProducts = productRecord?.catalogProducts || [];
    const firstCatalogProduct = catalogProducts[0];
    
    if (!firstCatalogProduct) {
      alert('No catalog information available for this product.');
      return;
    }

    // Get fileId from the catalog product
    const fileId = firstCatalogProduct._fileId || firstCatalogProduct.fileId;
    if (!fileId) {
      alert('No catalog file reference available for this product.');
      return;
    }

    try {
      // Resolve fileId to fileKey using getFileInfo
      const fileInfo = await getFileInfo(fileId);
      const fileKey = fileInfo.s3Key || fileInfo.key;
      
      if (!fileKey) {
        alert('No catalog file reference available for this product.');
        return;
      }

      const url = await ensurePreviewUrl(fileKey);
      if (url) {
        setIsPreviewOpen(true);
      }
    } catch (error) {
      console.error('[ProductPage] Failed to get file info', error);
      alert('Unable to load catalog preview. Please try again.');
    }
  }, [productRecord, ensurePreviewUrl]);

  const closePreview = () => {
    setIsPreviewOpen(false);
    setSalesDrawingPreviewUrl(null);
    setSalesDrawingPreviewKey(null);
  };

  const handleAddToQuotation = () => {
    setShowAddToQuotationDialog(true);
  };

  const handleSelectQuotation = (quotationId) => {
    // Create quotation item from product details + resolved file pointers
    const quotationItem = buildQuotationItemForQuotation();

    // Navigate to edit quotation with the new item
    navigate(`/quotations/edit/${quotationId}`, { 
      state: { 
        newItem: quotationItem,
        source: 'product-page'
      } 
    });
  };

  const handleCreateNew = () => {
    // Create quotation item from product details + resolved file pointers
    const quotationItem = buildQuotationItemForQuotation();

    // Navigate to metadata form first, then to items page
    navigate('/quotations/new', { 
      state: { 
        items: [quotationItem],
        source: 'product-page'
      } 
    });
  };

  const priceSource = productDetails.sources.find((source) => source.hasPrice);
  const priceDisplay =
    typeof productDetails.price === 'number'
      ? `$${productDetails.price.toFixed(2)}`
      : 'Price not available';
  const priceSourceText = priceSource
    ? `Source: ${priceSource.type}${productDetails.priceYear ? ` (${productDetails.priceYear})` : ''}`
    : 'No pricing source available';
  const hasSpecifications = Object.keys(specifications || {}).length > 0;

  return (
    <div className="product-page">
      <div className="product-content">
        {/* Back Button */}
        <button 
          className="back-button" 
          onClick={() => {
            // If we came from search, navigate back to search page
            // The search state will be restored from sessionStorage
            if (fromSearch) {
              navigate('/search');
            } else {
              navigate(-1);
            }
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back to Results
        </button>

        {(isLoading || errorMessage) && (
          <div className={`product-alert ${isLoading ? 'info' : 'error'}`}>
            <p>{isLoading ? 'Loading product details...' : errorMessage}</p>
            {!isLoading && fallbackProduct && (
              <p className="product-alert-subtext">Showing demo data while the API is unavailable.</p>
            )}
          </div>
        )}

        {/* Product Header */}
        <div className="product-header">
          <div className="product-title-section">
            <h1 className="product-title">{productDetails.orderingNo}</h1>
            <p className="product-ordering-no">{productDetails.productName}</p>
            <div className="product-badges">
              <span className="product-badge type-badge">{productDetails.type}</span>
              {productDetails.isReviewed ? (
                <span className="product-badge reviewed-badge" style={{ backgroundColor: '#10b981', color: 'white' }}>
                  ✓ Reviewed
                </span>
              ) : (
                <span className="product-badge pending-badge" style={{ backgroundColor: '#f59e0b', color: 'white' }}>
                  Pending Review
                </span>
              )}
            </div>
          </div>
          <div className="product-price-section">
            <p className="product-price-label">Manufacturer's Price</p>
            <p className="product-price">{priceDisplay}</p>
            <p className="product-price-source">{priceSourceText}</p>
            {productDetails.swagelokLink && (
              <a 
                href={productDetails.swagelokLink} 
                target="_blank" 
                rel="noopener noreferrer"
                className="product-price-link"
                style={{ fontSize: '0.85rem', color: '#2563eb', marginTop: '4px', display: 'inline-block' }}
              >
                View on Swagelok →
              </a>
            )}
          </div>
        </div>

        {/* Product Details */}
        <div className="product-details-grid">
          {/* Product Image and Description */}
          <div className="product-image-section">
            <div className="product-image-wrapper">
              {productDetails.image && !imageError ? (
                <img
                  src={productDetails.image}
                  alt={productDetails.productName}
                  onError={() => setImageError(true)}
                />
              ) : productRecord?.salesDrawings && productRecord.salesDrawings.length > 0 ? (
                <div className="image-placeholder" style={{ cursor: 'pointer' }} onClick={() => handleViewSalesDrawing(productRecord.salesDrawings[0])}>
                  <span role="img" aria-label="placeholder">📄</span>
                  <p>Sales Drawing Available</p>
                  <p style={{ fontSize: '12px', color: '#637887', marginTop: '4px' }}>Click to view</p>
                </div>
              ) : (
                <div className="image-placeholder">
                  <span role="img" aria-label="placeholder">📦</span>
                  <p>Product Image</p>
                </div>
              )}
            </div>
            
            {productDetails.catalogDescription && (
              <div className="info-card">
                <h3 className="info-card-title">Catalog Description</h3>
                <p className="product-description">{productDetails.catalogDescription}</p>
              </div>
            )}

            {productDetails.priceListDescription && (
              <div className="info-card">
                <h3 className="info-card-title">Price List Description</h3>
                <p className="product-description">{productDetails.priceListDescription}</p>
              </div>
            )}

            {productDetails.manualInput && (
              <div className="info-card">
                <h3 className="info-card-title">User Notes & Additional Information</h3>
                <p className="product-description" style={{ fontStyle: 'italic', color: '#4b5563' }}>
                  {productDetails.manualInput}
                </p>
              </div>
            )}

            {!productDetails.catalogDescription && !productDetails.priceListDescription && !productDetails.manualInput && (
              <div className="info-card">
                <h3 className="info-card-title">Description</h3>
                <p className="product-description">Product details not available.</p>
              </div>
            )}
          </div>

          {/* Product Info */}
          <div className="product-info-section">
            <div className="info-card">
              <h3 className="info-card-title">Product Information & Sources</h3>
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">Source File:</span>
                  <span className="info-value">{productDetails.sourceFileName}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Product Category:</span>
                  <span className="info-value">{productDetails.type}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Catalog Reference:</span>
                  <span className="info-value">{productDetails.catalogPage}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Last Updated:</span>
                  <span className="info-value">
                    {productDetails.lastUpdated
                      ? new Date(productDetails.lastUpdated).toLocaleString()
                      : '—'}
                  </span>
                </div>
              </div>
              
              <div className="sources-section">
                <h4 className="sources-title">Sources of Information</h4>
                {productDetails.sources.length > 0 ? (
                  <div className="sources-list">
                    {productDetails.sources.map((source, index) => {
                      const isSalesDrawing = source.type === 'Sales Drawing';
                      const Wrapper = source.link ? 'a' : 'div';
                      const handleClick = isSalesDrawing && source.fileKey ? () => {
                        handleViewSalesDrawing({ fileKey: source.fileKey });
                      } : undefined;
                      
                      return (
                        <Wrapper
                          key={`${source.type}-${index}`}
                          className={`source-item ${source.link ? '' : 'source-item-static'} ${isSalesDrawing ? 'source-item-clickable' : ''}`}
                          {...(source.link ? { href: source.link, target: '_blank', rel: 'noreferrer' } : {})}
                          {...(handleClick ? { onClick: handleClick, style: { cursor: 'pointer' } } : {})}
                        >
                          <div className="source-info">
                            <span className="source-type">{source.type} ({source.year})</span>
                            {source.pages && <span className="source-pages">{source.pages}</span>}
                            {source.hasPrice && <span className="source-badge">Current Price</span>}
                            {isSalesDrawing && <span className="source-badge" style={{ backgroundColor: '#2563eb', color: 'white' }}>View Drawing</span>}
                          </div>
                          {(source.link || isSalesDrawing) && (
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </Wrapper>
                      );
                    })}
                  </div>
                ) : (
                  <p className="no-sources-text">No source references available yet.</p>
                )}
              </div>
            </div>

            <div className="info-card">
              <div className="specs-header">
                <h3 className="info-card-title">Technical Specifications</h3>
                <button 
                  className="edit-specs-button"
                  onClick={() => setIsEditingSpecs(!isEditingSpecs)}
                >
                  {isEditingSpecs ? 'Done Editing' : 'Edit Specifications'}
                </button>
              </div>
              <div className="specs-grid-dense">
                {hasSpecifications ? (
                  Object.entries(specifications).map(([key, value]) => (
                    <div key={key} className="spec-item-dense">
                      <span className="spec-label-dense">{formatLabel(key)}:</span>
                      {isEditingSpecs ? (
                        <div className="spec-edit-controls">
                          <input 
                            type="text"
                            className="spec-input"
                            value={value}
                            onChange={(e) => handleSpecChange(key, e.target.value)}
                          />
                          <button 
                            className="remove-spec-button"
                            onClick={() => handleRemoveSpec(key)}
                            title="Remove specification"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <span className="spec-value-dense">{value}</span>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="no-specs-placeholder">No specifications captured yet.</div>
                )}
              </div>
              {isEditingSpecs && (
                <div className="add-spec-section">
                  <input
                    type="text"
                    placeholder="Field name"
                    className="spec-input"
                    value={newSpecKey}
                    onChange={(e) => setNewSpecKey(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Value"
                    className="spec-input"
                    value={newSpecValue}
                    onChange={(e) => setNewSpecValue(e.target.value)}
                  />
                  <button 
                    className="add-spec-button"
                    onClick={handleAddSpec}
                  >
                    + Add Field
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="product-actions">
          <button 
            className="btn-primary-large"
            onClick={handleAddToQuotation}
          >
            Add to Quotation
          </button>
          <button 
            className="btn-secondary-large"
            onClick={handleViewInCatalog}
            disabled={isPreviewLoading}
          >
            {isPreviewLoading ? 'Loading Preview...' : 'View in Catalog'}
          </button>
        </div>

        {previewError && (
          <div className="product-alert error">
            <p>{previewError}</p>
          </div>
        )}
      </div>

      <CatalogPreviewDialog
        isOpen={isPreviewOpen}
        onClose={closePreview}
        catalogKey={salesDrawingPreviewKey || (productRecord?.catalogProducts?.[0]?.fileKey || productRecord?.catalogProducts?.[0]?._fileKey)}
        fileUrl={salesDrawingPreviewUrl || filePreviewUrl}
        product={productRecord?.catalogProducts?.[0]}
        highlightTerm={productDetails.orderingNo}
        title={salesDrawingPreviewKey ? "Sales Drawing Preview" : "Catalog Preview"}
      />

      <AddToQuotationDialog
        open={showAddToQuotationDialog}
        onOpenChange={setShowAddToQuotationDialog}
        productName={productDetails.productName}
        orderingNo={productDetails.orderingNo}
        onSelectQuotation={handleSelectQuotation}
        onCreateNew={handleCreateNew}
      />
    </div>
  );
};

export default ProductPage;
