import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { getFileProducts } from '../../services/s3UploadService';
import './CatalogReview.css';

const CatalogReview = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const fileId = searchParams.get('fileId') || id;

  const [expandedProduct, setExpandedProduct] = useState(null);
  const [showUnreviewedOnly, setShowUnreviewedOnly] = useState(false);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  
  // Load products from location state or fetch from API
  useEffect(() => {
    const loadProducts = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);
        
        // First try to get products from location state (passed from FileUpload)
        if (location.state?.products && location.state.products.length > 0) {
          console.log('[CatalogReview] Loading products from location state:', location.state.products);
          const transformedProducts = transformBackendProducts(location.state.products);
          setProducts(transformedProducts);
          setIsLoading(false);
          return;
        }
        
        // If no products in state, fetch from API using fileId
        if (fileId) {
          console.log('[CatalogReview] Fetching products from API for fileId:', fileId);
          const productsData = await getFileProducts(fileId);
          console.log('[CatalogReview] Products fetched from API:', productsData);
          
          if (productsData.products && productsData.products.length > 0) {
            const transformedProducts = transformBackendProducts(productsData.products);
            setProducts(transformedProducts);
          } else {
            setLoadError('No products found for this file');
          }
        } else {
          setLoadError('No file ID provided');
        }
        
        setIsLoading(false);
      } catch (error) {
        console.error('[CatalogReview] Error loading products:', error);
        setLoadError(error.message || 'Failed to load products');
        setIsLoading(false);
      }
    };
    
    loadProducts();
  }, [fileId, location.state]);
  
  // Transform backend products to UI format
  const transformBackendProducts = (backendProducts) => {
    return backendProducts.map((product, index) => {
      // Convert specs object to array of key-value pairs
      const specsArray = product.specs ? 
        Object.entries(product.specs).map(([key, value]) => ({ key, value: String(value) })) :
        [];
      
      return {
        id: product.id || `product-${index}`,
        orderingNumber: product.orderingNumber || '',
        description: '', // Backend doesn't have description, user will need to add it
        specs: specsArray,
        manualInput: '',
        isReviewed: product.status === 'approved' || product.status === 'reviewed',
        isSaved: product.status === 'approved',
        tableIndex: product.tableIndex,
        location: product.location,
      };
    });
  };

  const handleSpecChange = (productId, specIndex, field, value) => {
    setProducts(prev => prev.map(product => {
      if (product.id === productId) {
        const newSpecs = [...product.specs];
        newSpecs[specIndex] = { ...newSpecs[specIndex], [field]: value };
        return { ...product, specs: newSpecs, isSaved: false };
      }
      return product;
    }));
  };

  const handleAddSpec = (productId) => {
    setProducts(prev => prev.map(product => {
      if (product.id === productId) {
        return {
          ...product,
          specs: [...product.specs, { key: "", value: "" }],
          isSaved: false
        };
      }
      return product;
    }));
  };

  const handleRemoveSpec = (productId, specIndex) => {
    setProducts(prev => prev.map(product => {
      if (product.id === productId) {
        const newSpecs = product.specs.filter((_, idx) => idx !== specIndex);
        return { ...product, specs: newSpecs, isSaved: false };
      }
      return product;
    }));
  };

  const handleFieldChange = (productId, field, value) => {
    setProducts(prev => prev.map(product => {
      if (product.id === productId) {
        return { ...product, [field]: value, isSaved: false };
      }
      return product;
    }));
  };

  const handleSave = (productId) => {
    setProducts(prev => prev.map(product => {
      if (product.id === productId) {
        // Simulate save
        console.log('Saving product:', productId);
        return { ...product, isReviewed: true, isSaved: true };
      }
      return product;
    }));
    
    // Show saved indicator and collapse after a brief delay
    setTimeout(() => {
      setExpandedProduct(null);
    }, 500);
  };

  const handleRemove = (productId) => {
    if (window.confirm('Are you sure you want to remove this product?')) {
      setProducts(prev => prev.filter(p => p.id !== productId));
    }
  };

  const handleExpand = (productId) => {
    setExpandedProduct(expandedProduct === productId ? null : productId);
  };

  const handleFinishReview = () => {
    const unreviewedCount = products.filter(p => !p.isReviewed).length;
    if (unreviewedCount > 0) {
      if (!window.confirm(`${unreviewedCount} products are still unreviewed. Continue anyway?`)) {
        return;
      }
    }
    console.log('Finishing review, saving all products');
    navigate('/files');
  };

  const handleCancel = () => {
    navigate('/files');
  };

  const filteredProducts = showUnreviewedOnly 
    ? products.filter(p => !p.isReviewed)
    : products;

  const reviewedCount = products.filter(p => p.isReviewed).length;

  // Show loading state
  if (isLoading) {
    return (
      <div className="catalog-review-page">
        <div className="catalog-review-container">
          <div className="review-header">
            <div className="review-header-content">
              <h1 className="review-title">Catalog Product Review & Verification</h1>
              <p className="review-subtitle">Loading products...</p>
            </div>
          </div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            minHeight: '400px',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <svg className="spinner" width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="#2188C9" strokeWidth="2" strokeLinecap="round" strokeDasharray="32" strokeDashoffset="32">
                <animate attributeName="stroke-dasharray" dur="2s" values="0 32;16 16;0 32;0 32" repeatCount="indefinite"/>
                <animate attributeName="stroke-dashoffset" dur="2s" values="0;-16;-32;-32" repeatCount="indefinite"/>
              </circle>
            </svg>
            <p style={{ fontSize: '16px', color: '#637887' }}>Loading products...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show error state
  if (loadError) {
    return (
      <div className="catalog-review-page">
        <div className="catalog-review-container">
          <div className="review-header">
            <div className="review-header-content">
              <h1 className="review-title">Catalog Product Review & Verification</h1>
              <p className="review-subtitle">Error loading products</p>
            </div>
            <div className="review-header-actions">
              <button className="btn-secondary" onClick={() => navigate('/files')}>
                Back to Files
              </button>
            </div>
          </div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            minHeight: '400px',
            flexDirection: 'column',
            gap: '16px',
            padding: '40px'
          }}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#1a1a1a', margin: 0 }}>
              Failed to Load Products
            </h3>
            <p style={{ fontSize: '14px', color: '#637887', textAlign: 'center', maxWidth: '400px', margin: 0 }}>
              {loadError}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="catalog-review-page">
      <div className="catalog-review-container">
        {/* Header */}
        <div className="review-header">
          <div className="review-header-content">
            <h1 className="review-title">Catalog Product Review & Verification</h1>
            <p className="review-subtitle">Review and verify extracted product information</p>
          </div>
          <div className="review-header-actions">
            <button className="btn-secondary" onClick={handleCancel}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handleFinishReview}>
              Finish Review
            </button>
          </div>
        </div>

        {/* Stats and Filter Bar */}
        <div className="review-stats-bar">
          <div className="stats-info">
            <span className="stat-item">Total: <strong>{products.length}</strong></span>
            <span className="stat-divider">|</span>
            <span className="stat-item">Reviewed: <strong>{reviewedCount}</strong></span>
            <span className="stat-divider">|</span>
            <span className="stat-item">Pending: <strong>{products.length - reviewedCount}</strong></span>
          </div>
          <div className="filter-controls">
            <label className="filter-checkbox">
              <input
                type="checkbox"
                checked={showUnreviewedOnly}
                onChange={(e) => setShowUnreviewedOnly(e.target.checked)}
              />
              <span>Show unreviewed only</span>
            </label>
          </div>
        </div>

        {/* Products Table */}
        <div className="review-table-container">
          <div className="review-table">
            {/* Table Header */}
            <div className="review-table-header">
              <div className="review-header-cell ordering-number">Ordering Number</div>
              <div className="review-header-cell description">Description</div>
              <div className="review-header-cell spec-summary">Specs</div>
              <div className="review-header-cell status-col">Status</div>
              <div className="review-header-cell actions">Actions</div>
            </div>

            {/* Table Body */}
            <div className="review-table-body">
              {filteredProducts.map(product => (
                <div key={product.id} className={`review-table-row ${expandedProduct === product.id ? 'expanded' : ''} ${product.isSaved ? 'saved' : ''}`}>
                  {/* Collapsed View */}
                  <div className="row-collapsed" onClick={() => handleExpand(product.id)}>
                    <div className="review-cell ordering-number">
                      <span className="cell-value">{product.orderingNumber}</span>
                    </div>
                    <div className="review-cell description">
                      <span className="cell-value">{product.description}</span>
                    </div>
                    <div className="review-cell spec-summary">
                      <span className="spec-count">{product.specs.length} specs</span>
                    </div>
                    <div className="review-cell status-col">
                      {product.isSaved && <span className="save-indicator">✓ Saved</span>}
                      {product.isReviewed && !product.isSaved && <span className="reviewed-indicator">Reviewed</span>}
                      {!product.isReviewed && <span className="pending-indicator">Pending</span>}
                    </div>
                    <div className="review-cell actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="action-btn-small edit-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExpand(product.id);
                        }}
                      >
                        {expandedProduct === product.id ? 'Collapse' : 'Edit'}
                      </button>
                    </div>
                  </div>

                  {/* Expanded View */}
                  {expandedProduct === product.id && (
                    <div className="row-expanded">
                      <div className="expanded-content">
                        <div className="expanded-field">
                          <label className="expanded-label">Ordering Number</label>
                          <input
                            type="text"
                            className="expanded-input"
                            value={product.orderingNumber}
                            onChange={(e) => handleFieldChange(product.id, 'orderingNumber', e.target.value)}
                          />
                        </div>

                        <div className="expanded-field">
                          <label className="expanded-label">Description</label>
                          <textarea
                            className="expanded-textarea"
                            value={product.description}
                            onChange={(e) => handleFieldChange(product.id, 'description', e.target.value)}
                            rows="2"
                          />
                        </div>

                        <div className="expanded-field">
                          <label className="expanded-label">Specifications</label>
                          <div className="spec-list">
                            {product.specs.map((spec, idx) => (
                              <div key={idx} className="spec-item">
                                <input
                                  type="text"
                                  className="spec-key-input"
                                  placeholder="Key"
                                  value={spec.key}
                                  onChange={(e) => handleSpecChange(product.id, idx, 'key', e.target.value)}
                                />
                                <span className="spec-separator">:</span>
                                <input
                                  type="text"
                                  className="spec-value-input"
                                  placeholder="Value"
                                  value={spec.value}
                                  onChange={(e) => handleSpecChange(product.id, idx, 'value', e.target.value)}
                                />
                                <button
                                  className="remove-spec-btn"
                                  onClick={() => handleRemoveSpec(product.id, idx)}
                                  title="Remove spec"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                            <button
                              className="add-spec-btn"
                              onClick={() => handleAddSpec(product.id)}
                            >
                              + Add Spec
                            </button>
                          </div>
                        </div>

                        <div className="expanded-field">
                          <label className="expanded-label">Manual Input / Notes</label>
                          <textarea
                            className="expanded-textarea"
                            placeholder="Add notes or additional information..."
                            value={product.manualInput}
                            onChange={(e) => handleFieldChange(product.id, 'manualInput', e.target.value)}
                            rows="2"
                          />
                        </div>

                        <div className="expanded-actions">
                          <button
                            className="btn-primary save-product-btn"
                            onClick={() => handleSave(product.id)}
                          >
                            Save Product
                          </button>
                          <button
                            className="btn-secondary"
                            onClick={() => handleRemove(product.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Add New Product Button */}
        <div className="add-product-section">
          <button
            className="btn-secondary add-product-btn"
            onClick={() => {
              const newProduct = {
                id: Date.now(),
                orderingNumber: "",
                description: "",
                specs: [{ key: "", value: "" }],
                manualInput: "",
                isReviewed: false,
                isSaved: false
              };
              setProducts(prev => [...prev, newProduct]);
              setExpandedProduct(newProduct.id);
            }}
          >
            + Add New Product
          </button>
        </div>

        {/* PDF Preview Section */}
        <div className="pdf-preview-section">
          <div className="pdf-preview-header">
            <h3 className="pdf-preview-title">Original Document Preview</h3>
            <button className="btn-secondary">Open in New Tab</button>
          </div>
          <div className="pdf-preview-container">
            <div className="pdf-preview-placeholder">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M13 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V9L13 2Z" stroke="#637887" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M13 2V9H20" stroke="#637887" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <p>Document Preview Not Available</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CatalogReview;
