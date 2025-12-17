import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AddToQuotationDialog from '../../components/AddToQuotationDialog';
import AutocompleteResults from '../../components/AutocompleteResults';
import CatalogPreviewDialog from '../../components/CatalogPreviewDialog';
import { ProductCategory } from '../../types/index';
import { fetchProducts, fetchProductByOrderingNumber } from '../../services/productsService';
import { getFileDownloadUrl, getFileInfo } from '../../services/fileInfoService';
import { searchProducts, fetchAutocompleteSuggestions } from '../../services/searchService';
import './SingleSearch.css';

const SingleSearch = () => {
  const navigate = useNavigate();
  const autocompleteRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [productType, setProductType] = useState('All Types');
  const [resultsCount, setResultsCount] = useState(5);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [lastSearchQuery, setLastSearchQuery] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [showCountDropdown, setShowCountDropdown] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [catalogProductsLoading, setCatalogProductsLoading] = useState(false);
  const [catalogProductsError, setCatalogProductsError] = useState('');
  const [catalogProductsCursor, setCatalogProductsCursor] = useState(null);
  const [catalogProductsHasMore, setCatalogProductsHasMore] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState([]);
  const [autocompleteLoading, setAutocompleteLoading] = useState(false);
  const [autocompleteError, setAutocompleteError] = useState('');
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const [useAI, setUseAI] = useState(true);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewProduct, setPreviewProduct] = useState(null);
  const [previewFileKey, setPreviewFileKey] = useState('');
  const [previewFileUrl, setPreviewFileUrl] = useState(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewOrderingNo, setPreviewOrderingNo] = useState(null);
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

  // Fetch autocomplete suggestions whenever the query changes
  useEffect(() => {
    const trimmedQuery = searchQuery.trim();

    if (!trimmedQuery) {
      setAutocompleteSuggestions([]);
      setIsAutocompleteOpen(false);
      setAutocompleteError('');
      return;
    }

    let isActive = true;
    setAutocompleteLoading(true);
    setAutocompleteError('');

    const fetchSuggestions = async () => {
      try {
        const response = await fetchAutocompleteSuggestions({
          query: trimmedQuery,
          category: selectedCategory,
          size: 10,
        });
        if (!isActive) return;
        setAutocompleteSuggestions(response.suggestions || []);
        setIsAutocompleteOpen(true);
      } catch (error) {
        if (!isActive) return;
        setAutocompleteSuggestions([]);
        setAutocompleteError(error.message || 'Failed to load suggestions');
        setIsAutocompleteOpen(false);
      } finally {
        if (isActive) {
          setAutocompleteLoading(false);
        }
      }
    };

    // Small debounce to avoid firing on every keystroke too aggressively
    const timeoutId = setTimeout(fetchSuggestions, 250);

    return () => {
      isActive = false;
      clearTimeout(timeoutId);
    };
  }, [searchQuery, selectedCategory]);

  // Handle ESC key and click outside to close autocomplete
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isAutocompleteOpen) {
        setIsAutocompleteOpen(false);
      }
    };

    const handleClickOutside = (e) => {
      if (
        isAutocompleteOpen &&
        autocompleteRef.current &&
        !autocompleteRef.current.contains(e.target)
      ) {
        setIsAutocompleteOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isAutocompleteOpen]);

  const handleSearch = async () => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      return;
    }

    setHasSearched(true);
    setLastSearchQuery(trimmedQuery);
    setSearchLoading(true);
    setSearchError('');
    setSearchResults([]);
    setIsAutocompleteOpen(false);

    try {
      const response = await searchProducts({
        query: trimmedQuery,
        category: selectedCategory,
        size: 30,
        resultSize: resultsCount,
        useAI,
      });
      setSearchResults(response.results || []);
    } catch (error) {
      setSearchResults([]);
      setSearchError(error.message || 'Failed to search products');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSearchInputChange = (value) => {
    setSearchQuery(value);
    setHasSearched(false);
    setLastSearchQuery('');
    setSearchError('');
    setSearchResults([]);
  };

  const handleSelectSuggestion = (suggestion) => {
    // Try to derive a reasonable primary text from the suggestion
    let primary =
      typeof suggestion === 'string'
        ? suggestion
        : suggestion.displayText ||
          suggestion.productName ||
          suggestion.orderingNumber ||
          suggestion.text ||
          '';

    if (!primary && typeof suggestion === 'object') {
      primary = JSON.stringify(suggestion);
    }

    handleSearchInputChange(primary);
    setIsAutocompleteOpen(false);
    setAutocompleteSuggestions([]);
  };

  const runSearchWithQuery = async (value) => {
    const trimmed = (value || '').trim();
    if (!trimmed) return;

    setSearchQuery(trimmed);
    setHasSearched(true);
    setLastSearchQuery(trimmed);
    setSearchLoading(true);
    setSearchError('');
    setSearchResults([]);
    setIsAutocompleteOpen(false);

    try {
      const response = await searchProducts({
        query: trimmed,
        category: selectedCategory,
        size: 30,
        resultSize: resultsCount,
        useAI,
      });
      setSearchResults(response.results || []);
    } catch (error) {
      setSearchResults([]);
      setSearchError(error.message || 'Failed to search products');
    } finally {
      setSearchLoading(false);
    }
  };

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

  const handleClearResults = () => {
    setHasSearched(false);
    setSearchQuery('');
    setLastSearchQuery('');
    setProductType('All Types');
    setResultsCount(5);
     setSearchResults([]);
    setSearchError('');
  };

  const handleAddToQuotation = (product) => {
    setSelectedProduct({
      name: product.productName,
      orderingNo: product.orderingNo
    });
    setDialogOpen(true);
  };

  const handleSelectQuotation = (quotationId) => {
    // Create quotation item from selected product
    const quotationItem = {
      orderNo: 1, // Will be adjusted in the quotation page
      orderingNumber: selectedProduct?.orderingNo || '',
      requestedItem: selectedProduct?.name || '',
      productName: selectedProduct?.name || '',
      productType: 'Valve', // Default, can be changed in quotation
      quantity: 1,
      price: 0, // Price to be filled in quotation
      margin: 20,
      sketchFile: null,
      catalogLink: '',
      notes: 'Added from single search',
      isIncomplete: false
    };

    // Navigate to edit quotation with the new item
    navigate(`/quotations/edit/${quotationId}`, { 
      state: { 
        newItem: quotationItem,
        source: 'single-search'
      } 
    });
  };

  const handleCreateNew = () => {
    // Create quotation item from selected product
    const quotationItem = {
      orderNo: 1,
      orderingNumber: selectedProduct?.orderingNo || '',
      requestedItem: selectedProduct?.name || '',
      productName: selectedProduct?.name || '',
      productType: 'Valve',
      quantity: 1,
      price: 0,
      margin: 20,
      sketchFile: null,
      catalogLink: '',
      notes: 'Added from single search',
      isIncomplete: false
    };

    // Navigate to metadata form first, then to items page
    navigate('/quotations/new', { 
      state: { 
        items: [quotationItem],
        source: 'single-search'
      } 
    });
  };

  const handleProductClick = (orderingNo) => {
    navigate(`/product/${orderingNo}`);
  };

  const handleAutocompleteOrderingClick = async (orderingNo) => {
    await runSearchWithQuery(orderingNo);
  };

  const handleOpenPreview = async (orderingNo) => {
    const trimmedOrderingNo = (orderingNo || '').trim();
    if (!trimmedOrderingNo || isPreviewLoading) {
      return;
    }

    try {
      setIsPreviewLoading(true);
      setPreviewOrderingNo(trimmedOrderingNo);

      // Fetch full product details (including catalogProducts with file references)
      const productData = await fetchProductByOrderingNumber(trimmedOrderingNo);
      const catalogProducts = productData.catalogProducts || [];
      const primaryCatalogProduct = catalogProducts[0];

      const fileId =
        primaryCatalogProduct &&
        (primaryCatalogProduct._fileId ||
          primaryCatalogProduct.fileId);

      if (!primaryCatalogProduct || !fileId) {
        throw new Error('No catalog source available for preview');
      }

      // Resolve the file info to get the S3 key for the original catalog
      const fileInfo = await getFileInfo(fileId);
      const key = fileInfo.s3Key || fileInfo.key;

      if (!key) {
        throw new Error('No file key available for preview');
      }

      // Request a presigned download URL for secure preview access
      const download = await getFileDownloadUrl(key);
      if (!download || !download.url) {
        throw new Error('Missing preview URL');
      }

      setPreviewProduct(primaryCatalogProduct);
      setPreviewFileKey(key);
      setPreviewFileUrl(download.url);
      setIsPreviewOpen(true);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to open catalog preview', error);
      const message =
        (error && error.message) ||
        'Unable to open catalog preview. Please try again.';
      // eslint-disable-next-line no-alert
      window.alert(message);
    } finally {
      setIsPreviewLoading(false);
      setPreviewOrderingNo(null);
    }
  };

  const handleClosePreview = () => {
    setIsPreviewOpen(false);
    setPreviewProduct(null);
    setPreviewFileKey('');
    setPreviewFileUrl(null);
  };

  const renderHighlightedText = (text) => {
    if (!text) return null;
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) return text;

    const lowerText = String(text);
    const lowerQuery = trimmedQuery.toLowerCase();
    const index = lowerText.toLowerCase().indexOf(lowerQuery);

    if (index === -1) {
      return lowerText;
    }

    const before = lowerText.slice(0, index);
    const match = lowerText.slice(index, index + trimmedQuery.length);
    const after = lowerText.slice(index + trimmedQuery.length);

    return (
      <>
        {before}
        <span className="match-highlight">{match}</span>
        {after}
      </>
    );
  };

  return (
    <div className="single-search-page">
      <div className="single-search-content">
        {/* Breadcrumbs */}
        <div className="breadcrumbs">
          <button onClick={() => navigate('/dashboard')} className="breadcrumb-link">Home</button>
          <span className="breadcrumb-separator">›</span>
          <span className="breadcrumb-current">Single Search</span>
          <span className="breadcrumb-separator">›</span>
          <span className="breadcrumb-next">Add to Quotation</span>
        </div>

        {/* Page Header */}
        <div className="search-header">
          <div className="search-header-text">
            <h1 className="search-title">Single Product Search & Verification</h1>
            <p className="search-subtitle">
              Locate and verify a single product using a free-text query or ordering number.
            </p>
          </div>
        </div>

        {/* Search Bar Section */}
        <div className="search-bar-section">
          <div className="search-input-container" ref={autocompleteRef}>
            <div className="search-input-wrapper">
              <div className="search-icon-container">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
                  <path d="M21 21L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <input
                type="text"
                className="search-input"
                placeholder="Search by free-text query or ordering number"
                value={searchQuery}
                onChange={(e) => handleSearchInputChange(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>

            {/* Autocomplete suggestions */}
            {isAutocompleteOpen && (
              <AutocompleteResults
                suggestions={autocompleteSuggestions}
                loading={autocompleteLoading}
                error={autocompleteError}
                query={searchQuery}
                onSelectSuggestion={handleSelectSuggestion}
                onOrderingNumberClick={handleAutocompleteOrderingClick}
              />
            )}
          </div>

          <div className="search-filters">
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

            {/* AI Re-ranking toggle */}
            <button
              type="button"
              className={`filter-dropdown ai-toggle-button ${useAI ? 'ai-on' : 'ai-off'}`}
              onClick={() => setUseAI((prev) => !prev)}
            >
              {useAI ? 'AI Re-ranking: On' : 'AI Re-ranking: Off'}
            </button>
            
            <div className="dropdown-wrapper">
              <button 
                className="filter-dropdown"
                onClick={() => setShowCountDropdown(!showCountDropdown)}
              >
                <span>Top {resultsCount}</span>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {showCountDropdown && (
                <div className="dropdown-menu">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(count => (
                    <div 
                      key={count}
                      className="dropdown-item"
                      onClick={() => {
                        setResultsCount(count);
                        setShowCountDropdown(false);
                      }}
                    >
                      Top {count}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button className="search-button" onClick={handleSearch}>
              Search
            </button>
          </div>
        </div>

        {/* Search Results Section - Only shown after search */}
        {hasSearched && (
          <>
            {/* Search Results Header */}
            <div className="results-header">
              <div className="results-header-content">
                <div>
                  <h2 className="results-title">Search Results</h2>
                  {lastSearchQuery && (
                    <p className="search-query-display">
                      Showing results for: <span className="query-text">"{lastSearchQuery}"</span>
                    </p>
                  )}
                  {searchLoading && (
                    <p className="search-query-display">Searching products...</p>
                  )}
                  {searchError && (
                    <p className="search-query-display error-text">
                      {searchError}
                    </p>
                  )}
                </div>
                <button className="clear-results-button" onClick={handleClearResults}>
                  Clear Results
                </button>
              </div>
            </div>

            {/* Search Results Table */}
            <div className="results-table-section">
              <div className="results-table-container">
                <table className="results-table">
                  <thead>
                    <tr>
                      <th className="col-product-name">Product Name</th>
                      <th className="col-ordering-no">Ordering No.</th>
                      <th className="col-confidence">Confidence</th>
                      <th className="col-type">Type</th>
                      <th className="col-specifications">Specifications</th>
                      <th className="col-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!searchLoading && searchResults.length === 0 && (
                      <tr>
                        <td colSpan="6" className="catalog-table-empty">
                          No results found.
                        </td>
                      </tr>
                    )}
                    {searchResults.map((result, index) => {
                      const confidencePercent =
                        typeof result.score === 'number'
                          ? Math.round(result.score * 100)
                          : typeof result.confidence === 'number'
                          ? result.confidence
                          : null;

                      const productName =
                        result.productName ||
                        result.name ||
                        result.summary ||
                        result.orderingNumber ||
                        result.orderingNo ||
                        `Result ${index + 1}`;

                      const orderingNo = result.orderingNumber || result.orderingNo || result.id;

                      const specifications =
                        result.specifications ||
                        result.description ||
                        result.details ||
                        '';

                      const type =
                        result.productCategory ||
                        result.category ||
                        result.type ||
                        '—';

                      return (
                        <tr key={orderingNo || index}>
                          <td className="col-product-name">{productName}</td>
                          <td className="col-ordering-no">
                            {orderingNo ? (
                              <button
                                className="ordering-link"
                                onClick={() => handleProductClick(orderingNo)}
                              >
                                {orderingNo}
                              </button>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="col-confidence">
                            {confidencePercent != null ? (
                              <div className="confidence-wrapper">
                                <div className="confidence-bar-bg">
                                  <div
                                    className="confidence-bar-fill"
                                    style={{ width: `${confidencePercent}%` }}
                                  ></div>
                                </div>
                                <span className="confidence-value">
                                  {confidencePercent}%
                                </span>
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="col-type text-secondary">{type}</td>
                          <td className="col-specifications text-secondary">
                            {specifications}
                          </td>
                          <td className="col-actions">
                            <div className="action-buttons-wrapper">
                              <button
                                className="action-btn-primary"
                                onClick={() =>
                                  handleAddToQuotation({
                                    productName,
                                    orderingNo,
                                  })
                                }
                              >
                                Add To Quotation
                              </button>
                              <div className="action-buttons-secondary">
                                <button
                                  className="action-btn-icon"
                                  title="Preview Catalog"
                                  type="button"
                                  onClick={() => handleOpenPreview(orderingNo)}
                                  disabled={
                                    !orderingNo ||
                                    (isPreviewLoading && previewOrderingNo === orderingNo)
                                  }
                                >
                                  {isPreviewLoading && previewOrderingNo === orderingNo ? '…' : '📄'}
                                </button>
                                <button className="action-btn-icon" title="Swagelok Site">
                                  🌐
                                </button>
                                <button className="action-btn-icon" title="Open Sketch">
                                  📐
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {!hasSearched && (
          <>
            <div className="results-header">
              <div className="results-header-content">
                <div>
                  <h2 className="results-title">Catalog Products</h2>
                  <p className="search-query-display">
                    {catalogProductsLoading && catalogProducts.length === 0
                      ? 'Loading products...'
                      : `Showing ${catalogProducts.length} product${catalogProducts.length === 1 ? '' : 's'}${
                          selectedCategory ? ` in ${selectedCategory}` : ''
                        }`}
                  </p>
                </div>
                {catalogProductsHasMore && (
                  <span className="table-status">More products available</span>
                )}
              </div>
            </div>

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
                          <td className="col-type text-secondary">{product.productCategory || '—'}</td>
                          <td className="col-source text-secondary">
                            {product.metadata?.sourceFileName || '—'}
                          </td>
                          <td className="col-updated text-secondary">
                            {updatedAt ? new Date(updatedAt).toLocaleDateString() : '—'}
                          </td>
                          <td className="col-actions">
                            <div className="action-buttons-wrapper">
                              <button 
                                className="action-btn-primary"
                                onClick={() =>
                                  handleAddToQuotation({
                                    productName: displayName,
                                    orderingNo: product.orderingNumber
                                  })
                                }
                              >
                                Add To Quotation
                              </button>
                              <div className="action-buttons-secondary">
                                <button
                                  className="action-btn-icon"
                                  title="Open Product"
                                  onClick={() => handleProductClick(product.orderingNumber)}
                                >
                                  🔍
                                </button>
                              </div>
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
          </>
        )}
      </div>

      {/* Add to Quotation Dialog */}
      <AddToQuotationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        productName={selectedProduct?.name}
        orderingNo={selectedProduct?.orderingNo}
        onSelectQuotation={handleSelectQuotation}
        onCreateNew={handleCreateNew}
      />
      <CatalogPreviewDialog
        isOpen={isPreviewOpen}
        onClose={handleClosePreview}
        catalogKey={previewFileKey || undefined}
        fileUrl={previewFileUrl || undefined}
        product={previewProduct || undefined}
        highlightTerm={previewProduct?.orderingNumber}
        title="Original Document Preview"
      />
    </div>
  );
};

export default SingleSearch;
