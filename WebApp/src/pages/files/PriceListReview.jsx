import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, useSearchParams, useParams } from 'react-router-dom';
import { getFileInfo, getPriceListProducts, updatePriceListProducts, completeFileReview } from '../../services/fileInfoService';
import { saveProductsFromPriceList } from '../../services/productsService';
import { ProductCategory } from '../../types/products';
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
  const [showMissingPrice, setShowMissingPrice] = useState(false);
  const [showMissingLink, setShowMissingLink] = useState(false);
  const [showModified, setShowModified] = useState(false);
  const [showCategoryReview, setShowCategoryReview] = useState(false);
  const [showExactMatch, setShowExactMatch] = useState(false);
  const [showSuggestedMatch, setShowSuggestedMatch] = useState(false);
  const [showNoMatch, setShowNoMatch] = useState(false);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [showBulkCategoryModal, setShowBulkCategoryModal] = useState(false);

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

  const hasMissingPrice = (product) => {
    return product.price === null || product.price === undefined || product.price === '';
  };

  const hasMissingLink = (product) => {
    const linkValue = product.SwagelokLink ?? product.swagelokLink ?? product.swaglokLink;
    return !linkValue || linkValue.trim() === '';
  };

  const isModified = (product) => {
    return product._modified === true;
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

  const handleRowSelect = (index) => {
    setSelectedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    // Calculate current page values using the same filtering logic
    let filtered = products;
    if (showMissingPrice) filtered = filtered.filter(hasMissingPrice);
    if (showMissingLink) filtered = filtered.filter(hasMissingLink);
    if (showModified) filtered = filtered.filter(isModified);
    if (showCategoryReview) filtered = filtered.filter(needsCategoryReview);
    if (showExactMatch) filtered = filtered.filter(hasExactMatch);
    if (showSuggestedMatch) filtered = filtered.filter(hasSuggestedMatch);
    if (showNoMatch) filtered = filtered.filter(hasNoMatch);
    
    const totalPagesCalc = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safeCurrentPageCalc = Math.min(currentPage, totalPagesCalc);
    const currentStartIndex = (safeCurrentPageCalc - 1) * PAGE_SIZE;
    const currentPaginated = filtered.slice(currentStartIndex, currentStartIndex + PAGE_SIZE);
    
    if (selectedRows.size === currentPaginated.length && currentPaginated.length > 0) {
      setSelectedRows(new Set());
    } else {
      const indices = currentPaginated.map((_, idx) => currentStartIndex + idx);
      setSelectedRows(new Set(indices));
    }
  };

  const handleBulkCategoryUpdate = (category) => {
    setProducts(prev => {
      const updated = [...prev];
      selectedRows.forEach(index => {
        if (updated[index]) {
          updated[index] = {
            ...updated[index],
            productCategory: category,
            _modified: true
          };
        }
      });
      const modifiedCount = updated.filter(p => p._modified).length;
      setStats(prevStats => ({ ...prevStats, modified: modifiedCount }));
      return updated;
    });
    setSelectedRows(new Set());
    setShowBulkCategoryModal(false);
    setSaveSuccess(false);
  };

  const getCategoryConfidenceIcon = (confidence) => {
    if (confidence === 'exact') {
      return <span className="confidence-icon exact" title="Exact match">✓</span>;
    } else if (confidence === 'suggested') {
      return <span className="confidence-icon suggested" title="Suggested match - review needed">?</span>;
    }
    return null;
  };

  const needsCategoryReview = (product) => {
    // Only products without a category set need review
    return !product.productCategory || product.productCategory.trim() === '';
  };

  const hasExactMatch = (product) => {
    return product.categoryMatchConfidence === 'exact';
  };

  const hasSuggestedMatch = (product) => {
    return product.categoryMatchConfidence === 'suggested';
  };

  const hasNoMatch = (product) => {
    return product.categoryMatchConfidence === 'none' || !product.categoryMatchConfidence;
  };

  const categoryReviewCount = products.filter(needsCategoryReview).length;
  const exactMatchCount = products.filter(hasExactMatch).length;
  const suggestedMatchCount = products.filter(hasSuggestedMatch).length;
  const noMatchCount = products.filter(hasNoMatch).length;
  const missingPriceProducts = products.filter(p => p.price === null || p.price === undefined || p.price === '');
  const missingLinkProducts = products.filter(p => {
    const linkValue = p.SwagelokLink ?? p.swagelokLink ?? p.swaglokLink;
    return !linkValue || linkValue.trim() === '';
  });

  const handleToggleReviewed = (index) => {
    setProducts(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        _reviewed: !updated[index]._reviewed,
        _modified: true
      };
      const modifiedCount = updated.filter(p => p._modified).length;
      setStats(prevStats => ({ ...prevStats, modified: modifiedCount }));
      return updated;
    });
    setSaveSuccess(false);
  };

  const handleToggleEdit = (index, field) => {
    setProducts(prev => {
      const updated = [...prev];
      const editKey = `_editing_${field}`;
      updated[index] = {
        ...updated[index],
        [editKey]: !updated[index][editKey]
      };
      return updated;
    });
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
            productCategory: priceListProduct.productCategory || '', // Include category if set
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

  const filteredProducts = (() => {
    let filtered = products;
    
    if (showMissingPrice) {
      filtered = filtered.filter(hasMissingPrice);
    }
    if (showMissingLink) {
      filtered = filtered.filter(hasMissingLink);
    }
    if (showModified) {
      filtered = filtered.filter(isModified);
    }
    if (showCategoryReview) {
      filtered = filtered.filter(needsCategoryReview);
    }
    if (showExactMatch) {
      filtered = filtered.filter(hasExactMatch);
    }
    if (showSuggestedMatch) {
      filtered = filtered.filter(hasSuggestedMatch);
    }
    if (showNoMatch) {
      filtered = filtered.filter(hasNoMatch);
    }
    
    return filtered;
  })();
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

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
          <div 
            className={`stat-item stat-warning ${showMissingPrice ? 'stat-active' : ''}`}
            onClick={() => {
              setShowMissingPrice(!showMissingPrice);
              setShowMissingLink(false);
              setShowModified(false);
              setShowCategoryReview(false);
              setShowExactMatch(false);
              setShowSuggestedMatch(false);
              setShowNoMatch(false);
              setCurrentPage(1);
            }}
            style={{ cursor: 'pointer' }}
          >
            <span className="stat-value">{missingPriceProducts.length}</span>
            <span className="stat-label">Products without price</span>
          </div>
          <div 
            className={`stat-item stat-warning ${showMissingLink ? 'stat-active' : ''}`}
            onClick={() => {
              setShowMissingLink(!showMissingLink);
              setShowMissingPrice(false);
              setShowModified(false);
              setShowCategoryReview(false);
              setShowExactMatch(false);
              setShowSuggestedMatch(false);
              setShowNoMatch(false);
              setCurrentPage(1);
            }}
            style={{ cursor: 'pointer' }}
          >
            <span className="stat-value">{missingLinkProducts.length}</span>
            <span className="stat-label">Products without SwagelokLink</span>
          </div>
          {stats.modified > 0 && (
            <div 
              className={`stat-item stat-modified ${showModified ? 'stat-active' : ''}`}
              onClick={() => {
                setShowModified(!showModified);
                setShowMissingPrice(false);
                setShowMissingLink(false);
                setShowCategoryReview(false);
                setShowExactMatch(false);
                setShowSuggestedMatch(false);
                setShowNoMatch(false);
                setCurrentPage(1);
              }}
              style={{ cursor: 'pointer' }}
            >
              <span className="stat-value">{stats.modified}</span>
              <span className="stat-label">Modified</span>
            </div>
          )}
          <div 
            className={`stat-item stat-valid ${showExactMatch ? 'stat-active' : ''}`}
            onClick={() => {
              setShowExactMatch(!showExactMatch);
              setShowMissingPrice(false);
              setShowMissingLink(false);
              setShowModified(false);
              setShowCategoryReview(false);
              setShowSuggestedMatch(false);
              setShowNoMatch(false);
              setCurrentPage(1);
            }}
            style={{ cursor: 'pointer' }}
          >
            <span className="stat-value">{exactMatchCount}</span>
            <span className="stat-label">Exact match</span>
          </div>
          <div 
            className={`stat-item stat-warning ${showSuggestedMatch ? 'stat-active' : ''}`}
            onClick={() => {
              setShowSuggestedMatch(!showSuggestedMatch);
              setShowMissingPrice(false);
              setShowMissingLink(false);
              setShowModified(false);
              setShowCategoryReview(false);
              setShowExactMatch(false);
              setShowNoMatch(false);
              setCurrentPage(1);
            }}
            style={{ cursor: 'pointer' }}
          >
            <span className="stat-value">{suggestedMatchCount}</span>
            <span className="stat-label">Suggested match</span>
          </div>
          <div 
            className={`stat-item stat-warning ${showNoMatch ? 'stat-active' : ''}`}
            onClick={() => {
              setShowNoMatch(!showNoMatch);
              setShowMissingPrice(false);
              setShowMissingLink(false);
              setShowModified(false);
              setShowCategoryReview(false);
              setShowExactMatch(false);
              setShowSuggestedMatch(false);
              setCurrentPage(1);
            }}
            style={{ cursor: 'pointer' }}
          >
            <span className="stat-value">{noMatchCount}</span>
            <span className="stat-label">No match</span>
          </div>
          <div 
            className={`stat-item stat-warning ${showCategoryReview ? 'stat-active' : ''}`}
            onClick={() => {
              setShowCategoryReview(!showCategoryReview);
              setShowMissingPrice(false);
              setShowMissingLink(false);
              setShowModified(false);
              setShowExactMatch(false);
              setShowSuggestedMatch(false);
              setShowNoMatch(false);
              setCurrentPage(1);
            }}
            style={{ cursor: 'pointer' }}
          >
            <span className="stat-value">{categoryReviewCount}</span>
            <span className="stat-label">Need category review</span>
          </div>
          {selectedRows.size > 0 && (
            <button
              className="btn-secondary"
              onClick={() => setShowBulkCategoryModal(true)}
              style={{ marginLeft: 'auto', alignSelf: 'center' }}
            >
              Bulk Update Category ({selectedRows.size} selected)
            </button>
          )}
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
              <div className="price-header-cell checkbox">
                <input
                  type="checkbox"
                  checked={selectedRows.size === paginatedProducts.length && paginatedProducts.length > 0}
                  onChange={handleSelectAll}
                />
              </div>
              <div className="price-header-cell row-num">#</div>
              <div className="price-header-cell ordering-number">Ordering Number</div>
              <div className="price-header-cell description">Description</div>
              <div className="price-header-cell category">Category</div>
              <div className="price-header-cell price">Price</div>
              <div className="price-header-cell swaglok-link">SwagelokLink</div>
              <div className="price-header-cell reviewed">Reviewed</div>
              <div className="price-header-cell status">Status</div>
              <div className="price-header-cell actions"></div>
            </div>

            {/* Table Body */}
            <div className="price-table-body">
              {paginatedProducts.map((product, index) => {
                const globalIndex = startIndex + index;
                const inferredCategory = product.inferredCategory || '';
                const confidence = product.categoryMatchConfidence;
                const currentCategory = product.productCategory || inferredCategory || '';
                const needsReview = needsCategoryReview(product);
                
                return (
                <div 
                  key={index} 
                    className={`price-table-row price-list-row ${product.status === 'invalid' ? 'row-invalid' : ''}`}
                >
                    <div className="price-cell checkbox">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(globalIndex)}
                        onChange={() => handleRowSelect(globalIndex)}
                      />
                    </div>
                  <div className="price-cell row-num">
                    <span className="row-number">{startIndex + index + 1}</span>
                  </div>
                    <div className="price-cell ordering-number">
                      {product._editing_orderingNumber ? (
                        <input
                          type="text"
                          className="cell-input"
                          value={product.orderingNumber || ''}
                          onChange={(e) => handleProductChange(globalIndex, 'orderingNumber', e.target.value)}
                          onBlur={() => handleToggleEdit(globalIndex, 'orderingNumber')}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleToggleEdit(globalIndex, 'orderingNumber');
                            }
                          }}
                          autoFocus
                          placeholder="Enter ordering number"
                        />
                      ) : (
                        <div 
                          className="cell-readonly"
                          onClick={() => handleToggleEdit(globalIndex, 'orderingNumber')}
                          title="Click to edit"
                        >
                          {product.orderingNumber || <span className="placeholder-text">Click to edit</span>}
                        </div>
                      )}
                    </div>
                    <div className="price-cell description">
                      {product._editing_description ? (
                        <input
                          type="text"
                          className="cell-input"
                          value={product.description || ''}
                          onChange={(e) => handleProductChange(globalIndex, 'description', e.target.value)}
                          onBlur={() => handleToggleEdit(globalIndex, 'description')}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleToggleEdit(globalIndex, 'description');
                            }
                          }}
                          autoFocus
                          placeholder="Enter description"
                        />
                      ) : (
                        <div 
                          className="cell-readonly"
                          onClick={() => handleToggleEdit(globalIndex, 'description')}
                          title="Click to edit"
                        >
                          {product.description || <span className="placeholder-text">Click to edit</span>}
                        </div>
                      )}
                    </div>
                    <div className="price-cell category">
                      <div className="category-select-wrapper">
                        <select
                          className="cell-input category-select"
                          value={currentCategory}
                          onChange={(e) => handleProductChange(globalIndex, 'productCategory', e.target.value)}
                        >
                          <option value="">Select category...</option>
                          {Object.values(ProductCategory)
                            .filter(cat => cat !== ProductCategory.UNCATEGORIZED)
                            .map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                        {confidence && getCategoryConfidenceIcon(confidence)}
                      </div>
                    </div>
                    <div className="price-cell price">
                      <input
                        type="number"
                        className="cell-input"
                        value={product.price ?? ''}
                        onChange={(e) => handleProductChange(globalIndex, 'price', e.target.value ? parseFloat(e.target.value) : null)}
                        placeholder="0.00"
                        step="0.01"
                      />
                    </div>
                    <div className="price-cell swaglok-link">
                      {product._editing_swagelokLink ? (
                        <input
                          type="url"
                          className="cell-input"
                          value={
                            (product.SwagelokLink ??
                              product.swagelokLink ??
                              product.swaglokLink) || ''
                          }
                          onChange={(e) => handleProductChange(globalIndex, 'SwagelokLink', e.target.value)}
                          onBlur={() => handleToggleEdit(globalIndex, 'swagelokLink')}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleToggleEdit(globalIndex, 'swagelokLink');
                            }
                          }}
                          autoFocus
                          placeholder="https://..."
                        />
                      ) : (
                        <div 
                          className="cell-readonly cell-readonly-link"
                          onClick={() => handleToggleEdit(globalIndex, 'swagelokLink')}
                          title="Click to edit"
                        >
                          <span className="link-text">
                            {(product.SwagelokLink ?? product.swagelokLink ?? product.swaglokLink) || 
                              <span className="placeholder-text">Click to edit</span>}
                          </span>
                          {(product.SwagelokLink ?? product.swagelokLink ?? product.swaglokLink) && (
                            <button
                              className="link-icon-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                const link = product.SwagelokLink ?? product.swagelokLink ?? product.swaglokLink;
                                if (link) {
                                  window.open(link, '_blank', 'noopener,noreferrer');
                                }
                              }}
                              title="Open link in new tab"
                            >
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M6 3H3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9M10 1h4m0 0v4m0-4L6 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="price-cell reviewed">
                      <input
                        type="checkbox"
                        checked={product._reviewed || false}
                        onChange={() => handleToggleReviewed(globalIndex)}
                        title="Mark as reviewed"
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
                        className="action-btn remove-btn-icon"
                        onClick={() => handleRemoveProduct(globalIndex)}
                        title="Remove product"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 0 1 1.334-1.334h2.666a1.333 1.333 0 0 1 1.334 1.334V4m2 0v9.333a1.333 1.333 0 0 1-1.334 1.334H4.667a1.333 1.333 0 0 1-1.334-1.334V4h9.334zM6.667 7.333v4M9.333 7.333v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
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

        {/* Bulk Category Update Modal */}
        {showBulkCategoryModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h2>Bulk Update Category</h2>
              <p>Update category for {selectedRows.size} selected product(s)</p>
              <select
                className="category-select-modal"
                onChange={(e) => {
                  if (e.target.value) {
                    handleBulkCategoryUpdate(e.target.value);
                  }
                }}
                defaultValue=""
              >
                <option value="">Select category...</option>
                {Object.values(ProductCategory)
                  .filter(cat => cat !== ProductCategory.UNCATEGORIZED)
                  .map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
              </select>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowBulkCategoryModal(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PriceListReview;
