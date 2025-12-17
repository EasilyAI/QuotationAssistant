import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProductCategory } from '../types/index';
import { fetchProducts } from '../services/productsService';
import './Products.css';

const Products = () => {
  const navigate = useNavigate();
  const [productType, setProductType] = useState('All Types');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [catalogProductsLoading, setCatalogProductsLoading] = useState(false);
  const [catalogProductsError, setCatalogProductsError] = useState('');
  const [catalogProductsCursor, setCatalogProductsCursor] = useState(null);
  const [catalogProductsHasMore, setCatalogProductsHasMore] = useState(false);
  const selectedCategory = productType === 'All Types' ? undefined : productType;

  const productTypes = ['All Types', ...Object.values(ProductCategory)];

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
            <h1 className="products-title">Product Catalog</h1>
            <p className="products-subtitle">
              Browse all products from imported catalogs and price lists.
            </p>
          </div>
          <div className="dropdown-wrapper">
            <button 
              className="filter-dropdown"
              onClick={() => setShowProductDropdown(!showProductDropdown)}
            >
              <span>{productType}</span>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {showProductDropdown && (
              <div className="dropdown-menu">
                {productTypes.map(type => (
                  <div 
                    key={type}
                    className="dropdown-item"
                    onClick={() => {
                      setProductType(type);
                      setShowProductDropdown(false);
                    }}
                  >
                    {type}
                  </div>
                ))}
              </div>
            )}
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
                  <th className="col-product-name">Product Summary</th>
                  <th className="col-ordering-no">Ordering No.</th>
                  <th className="col-type">Category</th>
                  <th className="col-source">Source File</th>
                  <th className="col-updated">Updated</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {catalogProductsLoading && catalogProducts.length === 0 && (
                  <tr>
                    <td colSpan="6" className="catalog-table-empty">
                      Loading products...
                    </td>
                  </tr>
                )}
                {!catalogProductsLoading && catalogProducts.length === 0 && (
                  <tr>
                    <td colSpan="6" className="catalog-table-empty">
                      No products available yet.
                    </td>
                  </tr>
                )}
                {catalogProducts.map((product) => {
                  const snapshot = product.catalogProducts?.[0]?.snapshot;
                  const displayName =
                    snapshot?.description ||
                    snapshot?.manualInput ||
                    product.orderingNumber;
                  const secondaryText =
                    snapshot?.manualInput && snapshot.manualInput !== displayName
                        ? snapshot.manualInput
                        : '';
                  const truncatedSecondary =
                    secondaryText && secondaryText.length > 120
                      ? `${secondaryText.slice(0, 117)}...`
                      : secondaryText;
                  const updatedAt = product.updatedAtIso || product.createdAtIso;
                  return (
                    <tr key={product.orderingNumber}>
                      <td className="col-product-name">
                        <div className="catalog-description">
                          <div className="catalog-description-title">{displayName}</div>
                          {truncatedSecondary && (
                            <div className="catalog-description-text">{truncatedSecondary}</div>
                          )}
                        </div>
                      </td>
                      <td className="col-ordering-no">
                        <button 
                          className="ordering-link"
                          onClick={() => handleProductClick(product.orderingNumber)}
                        >
                          {product.orderingNumber}
                        </button>
                      </td>
                      <td className="col-type">
                        <span className="category-badge">{product.productCategory || '—'}</span>
                      </td>
                      <td className="col-source text-secondary">
                        {product.metadata?.sourceFileName || '—'}
                      </td>
                      <td className="col-updated text-secondary">
                        {updatedAt ? new Date(updatedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="col-actions">
                        <div className="action-buttons-wrapper">
                          <button
                            className="action-btn-icon"
                            title="View Details"
                            onClick={() => handleProductClick(product.orderingNumber)}
                          >
                            🔍
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
      </div>
    </div>
  );
};

export default Products;

