import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchProducts } from '../services/productsService';
import { fetchProductByOrderingNumber } from '../services/productsService';
import { getFileDownloadUrl, getFileInfo } from '../services/fileInfoService';
import TypeDropdown from '../components/TypeDropdown';
import CatalogPreviewDialog from '../components/CatalogPreviewDialog';
import './Products.css';

const Products = () => {
  const navigate = useNavigate();
  const [productType, setProductType] = useState('All Types');
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [catalogProductsLoading, setCatalogProductsLoading] = useState(false);
  const [catalogProductsError, setCatalogProductsError] = useState('');
  const [catalogProductsCursor, setCatalogProductsCursor] = useState(null);
  const [catalogProductsHasMore, setCatalogProductsHasMore] = useState(false);
  const [activeFilter, setActiveFilter] = useState(null); // 'catalog', 'priceList', 'salesDrawing', 'missingCategory', 'missingPrice', 'missingSalesDrawing', 'missingCatalog', null
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewFileUrl, setPreviewFileUrl] = useState(null);
  const [previewFileKey, setPreviewFileKey] = useState(null);
  const [previewProduct, setPreviewProduct] = useState(null);
  const [previewType, setPreviewType] = useState(null);
  const selectedCategory = productType === 'All Types' ? undefined : productType;

  // Calculate metrics from loaded products only (fast, but approximate)
  const metrics = useMemo(() => {
    const total = catalogProducts.length;
    const withCatalog = catalogProducts.filter(p => (p.catalogProducts || []).length > 0).length;
    const withPriceList = catalogProducts.filter(p => (p.priceListPointers || []).length > 0).length;
    const withSalesDrawing = catalogProducts.filter(p => (p.salesDrawings || []).length > 0).length;
    const missingCategory = catalogProducts.filter(p => !p.productCategory).length;
    const missingPrice = catalogProducts.filter(p => !(p.priceListPointers || []).length).length;
    const missingSalesDrawing = catalogProducts.filter(p => !(p.salesDrawings || []).length).length;
    const missingCatalog = catalogProducts.filter(p => !(p.catalogProducts || []).length).length;
    
    return {
      total,
      withCatalog,
      withPriceList,
      withSalesDrawing,
      missingCategory,
      missingPrice,
      missingSalesDrawing,
      missingCatalog,
    };
  }, [catalogProducts]);

  // Filter products based on active filter
  const filteredProducts = useMemo(() => {
    if (!activeFilter) return catalogProducts;
    
    return catalogProducts.filter(product => {
      switch (activeFilter) {
        case 'catalog':
          return (product.catalogProducts || []).length > 0;
        case 'priceList':
          return (product.priceListPointers || []).length > 0;
        case 'salesDrawing':
          return (product.salesDrawings || []).length > 0;
        case 'missingCategory':
          return !product.productCategory;
        case 'missingPrice':
          return !(product.priceListPointers || []).length;
        case 'missingSalesDrawing':
          return !(product.salesDrawings || []).length;
        case 'missingCatalog':
          return !(product.catalogProducts || []).length;
        default:
          return true;
      }
    });
  }, [catalogProducts, activeFilter]);

  useEffect(() => {
    let isMounted = true;
    const loadCatalogProducts = async () => {
      setCatalogProductsLoading(true);
      setCatalogProductsError('');
      setCatalogProducts([]);
      setCatalogProductsCursor(null);
      setCatalogProductsHasMore(false);
      try {
        const response = await fetchProducts({
          productCategory: selectedCategory,
          limit: 50,
        });
        if (!isMounted) return;
        setCatalogProducts(response.products || []);
        setCatalogProductsCursor(response.cursor || null);
        setCatalogProductsHasMore(Boolean(response.hasMore && response.cursor));
      } catch (error) {
        if (!isMounted) return;
        setCatalogProducts([]);
        setCatalogProductsError(error.message || 'Failed to load catalog products');
      } finally {
        if (isMounted) {
          setCatalogProductsLoading(false);
        }
      }
    };

    loadCatalogProducts();

    return () => {
      isMounted = false;
    };
  }, [selectedCategory]);

  const handleLoadMoreCatalogProducts = async () => {
    if (!catalogProductsCursor || catalogProductsLoading) {
      return;
    }
    setCatalogProductsLoading(true);
    setCatalogProductsError('');
    try {
      const response = await fetchProducts({
        productCategory: selectedCategory,
        limit: 50,
        cursor: catalogProductsCursor,
      });
      setCatalogProducts((prev) => [...prev, ...(response.products || [])]);
      setCatalogProductsCursor(response.cursor || null);
      setCatalogProductsHasMore(Boolean(response.hasMore && response.cursor));
    } catch (error) {
      setCatalogProductsError(error.message || 'Failed to load additional products');
    } finally {
      setCatalogProductsLoading(false);
    }
  };

  const handleOpenPreview = useCallback(async (orderingNo, type = 'catalog') => {
    const trimmedOrderingNo = (orderingNo || '').trim();
    if (!trimmedOrderingNo || isPreviewLoading) {
      return;
    }

    try {
      setIsPreviewLoading(true);
      setPreviewError(null);
      setPreviewType(type);

      // Fetch full product details (including catalogProducts and salesDrawings)
      const productData = await fetchProductByOrderingNumber(trimmedOrderingNo);
      const catalogProducts = productData.catalogProducts || [];
      const salesDrawings = productData.salesDrawings || [];
      
      let fileId = null;
      let fileKey = null;
      let previewProductData = null;

      // First, try to get catalog preview (if type is catalog or auto)
      if (type === 'catalog' || type === 'auto') {
        const primaryCatalogProduct = catalogProducts[0];
        if (primaryCatalogProduct) {
          fileId = primaryCatalogProduct._fileId || primaryCatalogProduct.fileId;
          if (fileId) {
            const fileInfo = await getFileInfo(fileId);
            fileKey = fileInfo.s3Key || fileInfo.key;
            if (fileKey) {
              previewProductData = primaryCatalogProduct;
            }
          }
        }
      }

      // If no catalog or type is sales-drawing, try sales drawing
      if (!fileKey && (type === 'sales-drawing' || type === 'auto')) {
        if (salesDrawings.length > 0) {
          const primarySalesDrawing = salesDrawings[0];
          fileKey = primarySalesDrawing.fileKey;
        }
      }

      if (!fileKey) {
        throw new Error('No catalog or sales drawing available for preview');
      }

      // Request a presigned download URL
      const download = await getFileDownloadUrl(fileKey);
      if (!download || !download.url) {
        throw new Error('Missing preview URL');
      }

      setPreviewProduct(previewProductData);
      setPreviewFileKey(fileKey);
      setPreviewFileUrl(download.url);
      setIsPreviewOpen(true);
    } catch (error) {
      console.error('Failed to open preview', error);
      setPreviewError(error?.message || 'Unable to open preview. Please try again.');
    } finally {
      setIsPreviewLoading(false);
    }
  }, [isPreviewLoading]);

  const handleClosePreview = () => {
    setIsPreviewOpen(false);
    setPreviewProduct(null);
    setPreviewFileKey('');
    setPreviewFileUrl(null);
    setPreviewType(null);
    setPreviewError(null);
  };

  const handleProductClick = (orderingNo) => {
    navigate(`/product/${orderingNo}`);
  };

  return (
    <div className="products-page">
      <div className="products-content">
        {/* Breadcrumbs */}
        <div className="breadcrumbs">
          <button onClick={() => navigate('/dashboard')} className="breadcrumb-link">Home</button>
          <span className="breadcrumb-separator">›</span>
          <span className="breadcrumb-current">Products</span>
        </div>

        {/* Page Header */}
        <div className="products-header">
          <div className="products-header-text">
            <h1 className="products-title">Products Database</h1>
            <p className="products-subtitle">
              Explore products in your database. Showing first 50 products.
            </p>
          </div>
          <TypeDropdown
            value={productType}
            onChange={setProductType}
            variant="default"
          />
        </div>

        {/* Metrics Section */}
        <div className="metrics-section">
          <div 
            className={`metric-card ${activeFilter === null ? 'active' : ''}`}
            onClick={() => setActiveFilter(null)}
          >
            <div className="metric-value">{metrics.total}</div>
            <div className="metric-label">Total (Loaded)</div>
          </div>
          <div 
            className={`metric-card ${activeFilter === 'catalog' ? 'active' : ''}`}
            onClick={() => setActiveFilter('catalog')}
          >
            <div className="metric-value">{metrics.withCatalog}</div>
            <div className="metric-label">With Catalog</div>
          </div>
          <div 
            className={`metric-card ${activeFilter === 'priceList' ? 'active' : ''}`}
            onClick={() => setActiveFilter('priceList')}
          >
            <div className="metric-value">{metrics.withPriceList}</div>
            <div className="metric-label">With Price List</div>
          </div>
          <div 
            className={`metric-card ${activeFilter === 'salesDrawing' ? 'active' : ''}`}
            onClick={() => setActiveFilter('salesDrawing')}
          >
            <div className="metric-value">{metrics.withSalesDrawing}</div>
            <div className="metric-label">With Sales Drawing</div>
          </div>
          <div 
            className={`metric-card missing ${activeFilter === 'missingCategory' ? 'active' : ''}`}
            onClick={() => setActiveFilter('missingCategory')}
          >
            <div className="metric-value">{metrics.missingCategory}</div>
            <div className="metric-label">Missing Category</div>
          </div>
          <div 
            className={`metric-card missing ${activeFilter === 'missingPrice' ? 'active' : ''}`}
            onClick={() => setActiveFilter('missingPrice')}
          >
            <div className="metric-value">{metrics.missingPrice}</div>
            <div className="metric-label">Missing Price</div>
          </div>
          <div 
            className={`metric-card missing ${activeFilter === 'missingSalesDrawing' ? 'active' : ''}`}
            onClick={() => setActiveFilter('missingSalesDrawing')}
          >
            <div className="metric-value">{metrics.missingSalesDrawing}</div>
            <div className="metric-label">Missing Sales Drawing</div>
          </div>
          <div 
            className={`metric-card missing ${activeFilter === 'missingCatalog' ? 'active' : ''}`}
            onClick={() => setActiveFilter('missingCatalog')}
          >
            <div className="metric-value">{metrics.missingCatalog}</div>
            <div className="metric-label">Missing Catalog</div>
          </div>
        </div>

        {/* Products Table */}
        <div className="results-table-section">
          <div className="results-table-container">
            {catalogProductsError && (
              <div className="catalog-table-error">{catalogProductsError}</div>
            )}
            <table className="results-table">
              <thead>
                <tr>
                  <th className="col-ordering-no">Ordering No.</th>
                  <th className="col-type">Category</th>
                  <th className="col-indicators">Indicators</th>
                  <th className="col-updated">Updated</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {catalogProductsLoading && filteredProducts.length === 0 && (
                  <tr>
                    <td colSpan="5" className="catalog-table-empty">
                      Loading products...
                    </td>
                  </tr>
                )}
                {!catalogProductsLoading && filteredProducts.length === 0 && (
                  <tr>
                    <td colSpan="5" className="catalog-table-empty">
                      No products match the selected filter.
                    </td>
                  </tr>
                )}
                {filteredProducts.map((product) => {
                  const hasCatalog = (product.catalogProducts || []).length > 0;
                  const hasPriceList = (product.priceListPointers || []).length > 0;
                  const hasSalesDrawing = (product.salesDrawings || []).length > 0;
                  const updatedAt = product.updatedAtIso || product.createdAtIso;
                  
                  return (
                    <tr key={product.orderingNumber}>
                      <td className="col-ordering-no">
                        <button 
                          className="ordering-link"
                          onClick={() => handleProductClick(product.orderingNumber)}
                        >
                          {product.orderingNumber}
                        </button>
                      </td>
                      <td className="col-type">
                        <span className={`category-badge ${!product.productCategory ? 'missing-badge' : ''}`}>
                          {product.productCategory || 'Missing Category'}
                        </span>
                      </td>
                      <td className="col-indicators">
                        <div className="indicators-group">
                          {hasCatalog && (
                            <span className="indicator-badge catalog-indicator" title="Has Catalog Product">
                              📄 Catalog
                            </span>
                          )}
                          {hasPriceList && (
                            <span className="indicator-badge price-indicator" title="Has Price List">
                              💰 Price
                            </span>
                          )}
                          {hasSalesDrawing && (
                            <span className="indicator-badge drawing-indicator" title="Has Sales Drawing">
                              📐 Drawing
                            </span>
                          )}
                          {!hasCatalog && !hasPriceList && !hasSalesDrawing && (
                            <span className="indicator-badge no-data">No Data</span>
                          )}
                        </div>
                      </td>
                      <td className="col-updated text-secondary">
                        {updatedAt ? new Date(updatedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="col-actions">
                        <div className="action-buttons-compact">
                          <button
                            className={`icon-btn preview-btn ${hasSalesDrawing ? 'has-file' : 'no-file'}`}
                            onClick={() => hasSalesDrawing && handleOpenPreview(product.orderingNumber, 'sales-drawing')}
                            disabled={!hasSalesDrawing || isPreviewLoading}
                            title={hasSalesDrawing ? 'Click to view sales drawing' : 'No drawing available'}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                              <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                          <button
                            className={`icon-btn preview-btn ${hasCatalog ? 'has-file' : 'no-file'}`}
                            onClick={() => hasCatalog && handleOpenPreview(product.orderingNumber, 'catalog')}
                            disabled={!hasCatalog || isPreviewLoading}
                            title={hasCatalog ? 'Click to view catalog' : 'No catalog available'}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M6.5 2H20V22H6.5A2.5 2.5 0 0 1 4 19.5V4.5A2.5 2.5 0 0 1 6.5 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {catalogProductsHasMore && (
            <div className="catalog-table-footer">
              <button
                className="load-more-button"
                onClick={handleLoadMoreCatalogProducts}
                disabled={catalogProductsLoading}
              >
                {catalogProductsLoading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>

        {previewError && (
          <div className="product-alert error">
            <p>{previewError}</p>
          </div>
        )}
      </div>

      <CatalogPreviewDialog
        isOpen={isPreviewOpen}
        onClose={handleClosePreview}
        catalogKey={previewFileKey}
        fileUrl={previewFileUrl}
        product={previewProduct}
        highlightTerm={previewProduct?.orderingNumber || ''}
        title={previewType === 'sales-drawing' ? "Sales Drawing Preview" : "Catalog Preview"}
      />
    </div>
  );
};

export default Products;
