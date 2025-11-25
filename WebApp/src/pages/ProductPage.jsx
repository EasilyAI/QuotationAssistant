import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getProductByOrderingNo } from '../data/mockProducts';
import { fetchProductByOrderingNumber } from '../services/productsService';
import './ProductPage.css';

const formatLabel = (key = '') => {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (str) => str.toUpperCase());
};

const buildSourcesFromMetadata = (metadata = {}, snapshot = {}) => {
  const sources = [];

  if (metadata.sourceFileName) {
    sources.push({
      type: metadata.sourceFileName,
      year: metadata.catalogProductSnapshot?.location?.page
        ? `Page ${metadata.catalogProductSnapshot.location.page}`
        : metadata.sourceFileId || 'Source file',
      pages: snapshot?.location?.page ? `Page ${snapshot.location.page}` : undefined,
      hasPrice: false,
    });
  }

  if (snapshot?.location?.page) {
    sources.push({
      type: 'Catalog Location',
      year: snapshot.location.page,
      pages: `Page ${snapshot.location.page}`,
      hasPrice: false,
    });
  }

  return sources;
};

const buildProductDetailsFromRecord = (record, specs) => {
  const metadata = record.metadata || {};
  const snapshot = metadata.catalogProductSnapshot || {};
  const derivedSpecs = Object.keys(specs || {}).length > 0 ? specs : snapshot.specs || {};

  return {
    orderingNo: record.orderingNumber || '',
    productName:
      snapshot.manualInput ||
      snapshot.description ||
      record.text_description ||
      record.orderingNumber ||
      'Product',
    type: record.productCategory || 'Unknown',
    manufacturer: metadata.sourceFileName || 'Unknown Source',
    description: record.text_description || snapshot.description || 'Product details not available.',
    specifications: derivedSpecs,
    price: snapshot.price ?? record.price ?? null,
    catalogPage: snapshot.location?.page ? `Page ${snapshot.location.page}` : 'N/A',
    image: snapshot.image || null,
    sources: buildSourcesFromMetadata(metadata, snapshot),
    sourceFileName: metadata.sourceFileName || '—',
    sourceFileId: metadata.sourceFileId || '—',
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
    description: mock.description,
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
  description: 'Product details not available.',
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
  const fallbackProduct = getProductByOrderingNo(orderingNo);

  const [productRecord, setProductRecord] = useState(null);
  const [specifications, setSpecifications] = useState(fallbackProduct?.specifications || {});
  const [isEditingSpecs, setIsEditingSpecs] = useState(false);
  const [newSpecKey, setNewSpecKey] = useState('');
  const [newSpecValue, setNewSpecValue] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [imageError, setImageError] = useState(false);

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
        const snapshotSpecs = product?.metadata?.catalogProductSnapshot?.specs || {};
        setSpecifications({ ...snapshotSpecs });
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

  const priceSource = productDetails.sources.find((source) => source.hasPrice);
  const priceDisplay =
    typeof productDetails.price === 'number'
      ? `$${productDetails.price.toFixed(2)}`
      : 'Price not available';
  const priceSourceText = priceSource
    ? `Source: ${priceSource.type}${priceSource.year ? ` (${priceSource.year})` : ''}`
    : 'No pricing source available';
  const hasSpecifications = Object.keys(specifications || {}).length > 0;

  return (
    <div className="product-page">
      <div className="product-content">
        {/* Back Button */}
        <button className="back-button" onClick={() => navigate(-1)}>
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
            <h1 className="product-title">{productDetails.productName}</h1>
            <p className="product-ordering-no">Ordering No: <span>{productDetails.orderingNo}</span></p>
            <div className="product-badges">
              <span className="product-badge type-badge">{productDetails.type}</span>
            </div>
          </div>
          <div className="product-price-section">
            <p className="product-price-label">Manufacturer's Price</p>
            <p className="product-price">{priceDisplay}</p>
            <p className="product-price-source">{priceSourceText}</p>
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
              ) : (
                <div className="image-placeholder">
                  <span role="img" aria-label="placeholder">📦</span>
                  <p>Product Image</p>
                </div>
              )}
            </div>
            
            <div className="info-card">
              <h3 className="info-card-title">Description</h3>
              <p className="product-description">{productDetails.description}</p>
            </div>
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
                      const Wrapper = source.link ? 'a' : 'div';
                      return (
                        <Wrapper
                          key={`${source.type}-${index}`}
                          className={`source-item ${source.link ? '' : 'source-item-static'}`}
                          {...(source.link ? { href: source.link, target: '_blank', rel: 'noreferrer' } : {})}
                        >
                          <div className="source-info">
                            <span className="source-type">{source.type} ({source.year})</span>
                            {source.pages && <span className="source-pages">{source.pages}</span>}
                            {source.hasPrice && <span className="source-badge">Current Price</span>}
                          </div>
                          {source.link && (
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
          <button className="btn-primary-large">
            Add to Quotation
          </button>
          <button className="btn-secondary-large">
            View in Catalog
          </button>
          <button className="btn-secondary-large">
            Download Specifications
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductPage;
