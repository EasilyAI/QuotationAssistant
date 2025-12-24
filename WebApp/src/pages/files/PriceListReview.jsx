import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams, useParams } from 'react-router-dom';
import { getFileInfo, getPriceListProducts, updatePriceListProducts, completeFileReview } from '../../services/fileInfoService';
import { saveProductsFromPriceList } from '../../services/productsService';
import './PriceListReview.css';

const PriceListReview = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { id } = useParams();
  const PAGE_SIZE = 50;
  
  // Get fileId from URL params or location state
  const fileIdFromQuery = searchParams.get('fileId');
  const fileIdFromState = location.state?.fileId;
  const fileId = fileIdFromQuery || id || fileIdFromState;

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [error, setError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [fileInfo, setFileInfo] = useState(null);
  const [products, setProducts] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    valid: 0,
    invalid: 0,
    modified: 0
  });

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      if (!fileId) {
        setError('No file ID provided');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        // Check if we have data from location state (from FileUpload flow)
        if (location.state?.products && location.state?.fileInfo) {
          console.log('[PriceListReview] Using data from location state');
          setFileInfo(location.state.fileInfo);
          setProducts(location.state.products);
          updateStats(location.state.products);
        } else {
          // Load from backend
          console.log('[PriceListReview] Loading data from backend for fileId:', fileId);
          
          const [fileInfoData, productsData] = await Promise.all([
            getFileInfo(fileId),
            getPriceListProducts(fileId)
          ]);

          console.log(
            '[PriceListReview] Backend products sample:',
            (productsData.products || []).slice(0, 5).map((p) => ({
              orderingNumber: p.orderingNumber,
              SwagelokLink: p.SwagelokLink,
              swagelokLink: p.swagelokLink,
              swaglokLink: p.swaglokLink,
            })),
          );

          setFileInfo(fileInfoData);
          setProducts(productsData.products || []);
          updateStats(productsData.products || []);
        }
      } catch (err) {
        console.error('[PriceListReview] Error loading data:', err);
        setError(err.message || 'Failed to load price list data');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [fileId, location.state]);

  const updateStats = (productList) => {
    const valid = productList.filter(p => p.status === 'valid').length;
    const invalid = productList.filter(p => p.status === 'invalid').length;
    setStats({
      total: productList.length,
      valid,
      invalid,
      modified: 0
    });
  };

  const handleProductChange = (index, field, value) => {
    setProducts(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: value,
        _modified: true
      };
      
      // Update modified count
      const modifiedCount = updated.filter(p => p._modified).length;
      setStats(prevStats => ({ ...prevStats, modified: modifiedCount }));
      
      return updated;
    });
    setSaveSuccess(false);
  };

  const isErrorRow = (product) => {
    const missingPrice = product.price === null || product.price === undefined || product.price === '';
    // Support multiple legacy property names and normalize later on save
    const linkValue = product.SwagelokLink ?? product.swagelokLink ?? product.swaglokLink;
    const missingLink = !linkValue || linkValue.trim() === '';
    return missingPrice || missingLink;
  };

  const handleRemoveProduct = (index) => {
    if (window.confirm('Are you sure you want to remove this product?')) {
      setProducts(prev => {
        const updated = prev.filter((_, i) => i !== index);
        updateStats(updated);
        return updated;
      });
      setSaveSuccess(false);
    }
  };

  const handleAddProduct = () => {
    const newProduct = {
      orderingNumber: '',
      description: '',
      price: null,
      SwagelokLink: '',
      status: 'valid',
      rowNumber: products.length + 2,
      _new: true,
      _modified: true
    };
    setProducts(prev => [...prev, newProduct]);
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      
      // Remove internal tracking fields & normalize SwagelokLink field before saving
      const productsToSave = products.map(p => {
        const { _modified, _new, ...productData } = p;

        // Normalize any legacy link field names to the canonical SwagelokLink
        const normalizedLink =
          productData.SwagelokLink ??
          productData.swagelokLink ??
          productData.swaglokLink ??
          '';

        const {
          swagelokLink, // legacy (lowercase s, correct spelling)
          swaglokLink,  // legacy typo (missing 'e')
          ...rest
        } = productData;

        const result = {
          ...rest,
          SwagelokLink: normalizedLink,
        };

        return result;
      });

      console.log(
        '[PriceListReview] ProductsToSave sample:',
        productsToSave.slice(0, 5).map((p) => ({
          orderingNumber: p.orderingNumber,
          SwagelokLink: p.SwagelokLink,
        })),
      );

      await updatePriceListProducts(fileId, productsToSave);
      
      // Update products to match saved state
      setProducts(productsToSave);
      setStats(prev => ({ ...prev, modified: 0 }));
      setSaveSuccess(true);
      
      console.log('[PriceListReview] Products saved successfully');
    } catch (err) {
      console.error('[PriceListReview] Error saving products:', err);
      setError(err.message || 'Failed to save products');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCompleteClick = () => {
    // Show confirmation dialog
    setShowCompleteConfirm(true);
  };

  const handleConfirmComplete = async () => {
    setShowCompleteConfirm(false);
    
    try {
      setIsCompleting(true);
      setError(null);

      // First save any changes to the file's price list products, normalizing SwagelokLink field
      const productsToSave = products.map(p => {
        const { _modified, _new, ...productData } = p;

        const normalizedLink =
          productData.SwagelokLink ??
          productData.swagelokLink ??
          productData.swaglokLink ??
          '';

        const {
          swagelokLink,
          swaglokLink,
          ...rest
        } = productData;

        return {
          ...rest,
          SwagelokLink: normalizedLink,
        };
      });
      
      // Only update if there were changes
      if (stats.modified > 0) {
        await updatePriceListProducts(fileId, productsToSave);
      }

      // Transform price list products to Products table format
      // Send minimal data - backend will find chunks and resolve actual data
      const productsForProductsTable = productsToSave
        .filter(p => p.orderingNumber && p.orderingNumber.trim()) // Only products with ordering numbers
        .map(priceListProduct => {
          const year = fileInfo?.year || new Date().getFullYear().toString();
          
          return {
            orderingNumber: priceListProduct.orderingNumber.trim(),
            priceListPointerData: {
              fileId: fileId,
              year: year,
              addedAt: Date.now(),
              addedAtIso: new Date().toISOString(),
            },
          };
        });

      console.log(`[PriceListReview] Saving ${productsForProductsTable.length} products to Products table`);
      
      // Save to Products table (will upsert with price list pointers)
      await saveProductsFromPriceList(productsForProductsTable);

      // Then mark file as complete
      await completeFileReview(fileId);
      
      console.log('[PriceListReview] Review completed successfully');
      navigate('/files');
    } catch (err) {
      console.error('[PriceListReview] Error completing review:', err);
      setError(err.message || 'Failed to complete review');
    } finally {
      setIsCompleting(false);
    }
  };

  const handleCancelComplete = () => {
    setShowCompleteConfirm(false);
  };

  const handleCancel = () => {
    if (stats.modified > 0) {
      if (window.confirm('You have unsaved changes. Are you sure you want to leave?')) {
        navigate('/files');
      }
    } else {
      navigate('/files');
    }
  };

  const getStatusBadge = (product) => {
    if (product.status === 'invalid') {
      return <span className="status-badge status-invalid">Invalid</span>;
    }
    if (product._modified) {
      return <span className="status-badge status-modified">Modified</span>;
    }
    return <span className="status-badge status-valid">Valid</span>;
  };

  const filteredProducts = showErrorsOnly ? products.filter(isErrorRow) : products;
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);
  const missingPriceCount = products.filter(
    (p) => p.price === null || p.price === undefined || p.price === ''
  ).length;
  const missingLinkCount = products.filter((p) => {
    const linkValue = p.SwagelokLink ?? p.swagelokLink ?? p.swaglokLink;
    return !linkValue || linkValue.trim() === '';
  }).length;

  if (isLoading) {
    return (
      <div className="price-list-review-page">
        <div className="price-list-review-container">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading price list data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && !products.length) {
    return (
      <div className="price-list-review-page">
        <div className="price-list-review-container">
          <div className="error-state">
            <h2>Error Loading Price List</h2>
            <p>{error}</p>
            <button className="btn-primary" onClick={() => navigate('/files')}>
              Back to Files
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="price-list-review-page">
      <div className="price-list-review-container">
        {/* Header */}
        <div className="review-header">
          <div className="review-header-content">
            <h1 className="review-title">Price List Review</h1>
            <p className="review-subtitle">
              {fileInfo?.displayName || fileInfo?.fileName || 'Review and verify pricing information'}
            </p>
          </div>
          <div className="review-header-actions">
            <button className="btn-secondary" onClick={handleCancel} disabled={isSaving}>
              Cancel
            </button>
            <button 
              className="btn-secondary" 
              onClick={handleSave} 
              disabled={isSaving || stats.modified === 0}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
            <button 
              className="btn-primary" 
              onClick={handleCompleteClick}
              disabled={isSaving || isCompleting || stats.invalid > 0}
            >
              Complete Review
            </button>
          </div>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="message-banner error-banner">
            <span>{error}</span>
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}
        {saveSuccess && (
          <div className="message-banner success-banner">
            <span>Changes saved successfully!</span>
            <button onClick={() => setSaveSuccess(false)}>×</button>
          </div>
        )}

        {/* Stats Summary */}
        <div className="stats-summary">
          <div className="stat-item">
            <span className="stat-value">{stats.total}</span>
            <span className="stat-label">Total Products</span>
          </div>
          <div className="stat-item stat-valid">
            <span className="stat-value">{stats.valid}</span>
            <span className="stat-label">Valid</span>
          </div>
          {stats.invalid > 0 && (
            <div className="stat-item stat-invalid">
              <span className="stat-value">{stats.invalid}</span>
              <span className="stat-label">Invalid</span>
            </div>
          )}
          {stats.modified > 0 && (
            <div className="stat-item stat-modified">
              <span className="stat-value">{stats.modified}</span>
              <span className="stat-label">Modified</span>
            </div>
          )}
          <div className="stat-item stat-warning">
            <span className="stat-value">{missingPriceCount}</span>
            <span className="stat-label">Products without price</span>
          </div>
          <div className="stat-item stat-warning">
            <span className="stat-value">{missingLinkCount}</span>
            <span className="stat-label">Products without SwagelokLink</span>
          </div>
        </div>

        {/* Filters */}
        <div className="price-list-filters">
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={showErrorsOnly}
              onChange={(e) => {
                setShowErrorsOnly(e.target.checked);
                setCurrentPage(1);
              }}
            />
            <span>Show only rows with missing price or SwagelokLink</span>
          </label>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="files-pagination">
            <button
              className="pagination-button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={safeCurrentPage === 1}
            >
              Previous
            </button>
            <span className="pagination-info">
              Page {safeCurrentPage} of {totalPages}
            </span>
            <button
              className="pagination-button"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={safeCurrentPage === totalPages}
            >
              Next
            </button>
          </div>
        )}

        {/* Products Table */}
        <div className="price-table-container">
          <div className="price-table">
            {/* Table Header */}
            <div className="price-table-header price-list-header">
              <div className="price-header-cell row-num">#</div>
              <div className="price-header-cell ordering-number">Ordering Number</div>
              <div className="price-header-cell description">Description</div>
              <div className="price-header-cell price">Price</div>
              <div className="price-header-cell swaglok-link">SwagelokLink</div>
              <div className="price-header-cell status">Status</div>
              <div className="price-header-cell actions">Actions</div>
            </div>

            {/* Table Body */}
            <div className="price-table-body">
              {paginatedProducts.map((product, index) => (
                <div 
                  key={index} 
                  className={`price-table-row price-list-row ${product.status === 'invalid' ? 'row-invalid' : ''} ${product._modified ? 'row-modified' : ''}`}
                >
                  <div className="price-cell row-num">
                    <span className="row-number">{product.rowNumber || index + 1}</span>
                  </div>
                  <div className="price-cell ordering-number">
                    <input
                      type="text"
                      className="cell-input"
                      value={product.orderingNumber || ''}
                      onChange={(e) => handleProductChange(startIndex + index, 'orderingNumber', e.target.value)}
                      placeholder="Enter ordering number"
                    />
                  </div>
                  <div className="price-cell description">
                    <input
                      type="text"
                      className="cell-input"
                      value={product.description || ''}
                      onChange={(e) => handleProductChange(startIndex + index, 'description', e.target.value)}
                      placeholder="Enter description"
                    />
                  </div>
                  <div className="price-cell price">
                    <input
                      type="number"
                      className="cell-input"
                      value={product.price ?? ''}
                      onChange={(e) => handleProductChange(startIndex + index, 'price', e.target.value ? parseFloat(e.target.value) : null)}
                      placeholder="0.00"
                      step="0.01"
                    />
                  </div>
                  <div className="price-cell swaglok-link">
                    <input
                      type="url"
                      className="cell-input"
                      value={
                        (product.SwagelokLink ??
                          product.swagelokLink ??
                          product.swaglokLink) || ''
                      }
                      onChange={(e) => handleProductChange(startIndex + index, 'SwagelokLink', e.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                  <div className="price-cell status">
                    {getStatusBadge(product)}
                    {product.errors && product.errors.length > 0 && (
                      <div className="error-tooltip">
                        {product.errors.map((err, i) => (
                          <div key={i} className="error-text">{err}</div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="price-cell actions">
                    <button
                      className="action-btn remove-btn"
                      onClick={() => handleRemoveProduct(startIndex + index)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Add Item Button */}
        <div className="add-item-section">
          <button className="btn-secondary add-item-btn-large" onClick={handleAddProduct}>
            + Add New Product
          </button>
        </div>

        {/* Confirmation Modal */}
        {showCompleteConfirm && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h2>Complete Review?</h2>
              <p>
                This will save {products.filter(p => p.orderingNumber && p.orderingNumber.trim()).length} products 
                to the Products table. This process may take a few minutes.
              </p>
              <p>Are you sure you want to continue?</p>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={handleCancelComplete}>
                  Cancel
                </button>
                <button className="btn-primary" onClick={handleConfirmComplete}>
                  Yes, Complete Review
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Loading Overlay */}
        {isCompleting && (
          <div className="modal-overlay">
            <div className="modal-content loading-modal">
              <div className="loading-spinner"></div>
              <h2>Processing Review...</h2>
              <p>Saving products to the database. This may take a few minutes.</p>
              <p className="loading-detail">Please do not close this window.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PriceListReview;
