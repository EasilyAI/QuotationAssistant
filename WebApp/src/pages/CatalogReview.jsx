import React, { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import './CatalogReview.css';

const CatalogReview = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const fileType = searchParams.get('type') || 'catalog';

  const [expandedProduct, setExpandedProduct] = useState(null);
  const [showUnreviewedOnly, setShowUnreviewedOnly] = useState(false);
  const [products, setProducts] = useState([
    {
      id: 1,
      orderingNumber: "PN-12345",
      description: "High-Pressure Valve, Stainless Steel",
      specs: [
        { key: "Pressure", value: "1000psi" },
        { key: "Material", value: "316SS" },
        { key: "Thread", value: "1/2in NPT" }
      ],
      manualInput: "",
      isReviewed: false,
      isSaved: false
    },
    {
      id: 2,
      orderingNumber: "ORD-67890",
      description: "Standard Copper Tube, 1/2 inch",
      specs: [
        { key: "Diameter", value: "0.5in" },
        { key: "Material", value: "Copper" },
        { key: "Wall Thickness", value: "0.035in" }
      ],
      manualInput: "",
      isReviewed: false,
      isSaved: false
    },
    {
      id: 3,
      orderingNumber: "PN-98765",
      description: "Industrial Grade Sealant",
      specs: [
        { key: "Temp Range", value: "-40C to 200C" },
        { key: "Type", value: "Silicone" }
      ],
      manualInput: "",
      isReviewed: true,
      isSaved: true
    },
    // Add more mock products to demonstrate 20-30 items
    ...Array.from({ length: 17 }, (_, i) => ({
      id: i + 4,
      orderingNumber: `PN-${10000 + i}`,
      description: `Sample Product ${i + 4}`,
      specs: [
        { key: "Type", value: `Type ${i + 1}` },
        { key: "Size", value: `${i + 1}mm` }
      ],
      manualInput: "",
      isReviewed: i % 3 === 0,
      isSaved: i % 3 === 0
    }))
  ]);

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
