import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import AddToQuotationDialog from '../../components/AddToQuotationDialog';
import AutocompleteResults from '../../components/AutocompleteResults';
import CatalogPreviewDialog from '../../components/CatalogPreviewDialog';
import TypeDropdown from '../../components/TypeDropdown';
import { ProductCategory } from '../../types/index';
import { fetchProductByOrderingNumber } from '../../services/productsService';
import { getFileDownloadUrl, getFileInfo } from '../../services/fileInfoService';
import { searchProducts, fetchAutocompleteSuggestions } from '../../services/searchService';
import './SingleSearch.css';

const SingleSearch = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const autocompleteRef = useRef(null);
  const countDropdownRef = useRef(null);
  const lastSelectedSuggestion = useRef(null); // Track last selected suggestion to prevent re-trigger
  
  // Restore search state from sessionStorage if available
  const restoreSearchState = () => {
    const savedState = sessionStorage.getItem('singleSearchState');
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        return parsed;
      } catch (e) {
        console.error('Failed to restore single search state:', e);
        sessionStorage.removeItem('singleSearchState');
      }
    }
    return null;
  };

  const restoredState = restoreSearchState();
  const [searchQuery, setSearchQuery] = useState(restoredState?.searchQuery || '');
  const [productType, setProductType] = useState(restoredState?.productType || 'All Types');
  const [resultsCount, setResultsCount] = useState(restoredState?.resultsCount || 5);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [hasSearched, setHasSearched] = useState(restoredState?.hasSearched || false);
  const [lastSearchQuery, setLastSearchQuery] = useState(restoredState?.lastSearchQuery || '');
  const [showCountDropdown, setShowCountDropdown] = useState(false);
  const [searchResults, setSearchResults] = useState(restoredState?.searchResults || []);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(restoredState?.searchError || '');
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState([]);
  const [autocompleteLoading, setAutocompleteLoading] = useState(false);
  const [autocompleteError, setAutocompleteError] = useState('');
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const [useAI, setUseAI] = useState(restoredState?.useAI !== undefined ? restoredState.useAI : true);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewProduct, setPreviewProduct] = useState(null);
  const [previewFileKey, setPreviewFileKey] = useState('');
  const [previewFileUrl, setPreviewFileUrl] = useState(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewOrderingNo, setPreviewOrderingNo] = useState(null);
  const selectedCategory = productType === 'All Types' ? undefined : productType;

  // Save search state to sessionStorage whenever it changes
  useEffect(() => {
    if (hasSearched && searchResults.length > 0) {
      const stateToSave = {
        searchQuery,
        productType,
        resultsCount,
        hasSearched,
        lastSearchQuery,
        searchResults,
        searchError,
        useAI,
        timestamp: new Date().toISOString()
      };
      sessionStorage.setItem('singleSearchState', JSON.stringify(stateToSave));
    }
  }, [hasSearched, searchResults, searchQuery, productType, resultsCount, lastSearchQuery, searchError, useAI]);

  // Fetch autocomplete suggestions whenever the query changes
  useEffect(() => {
    const trimmedQuery = searchQuery.trim();

    // Skip autocomplete if this query exactly matches the last selected suggestion
    // This prevents autocomplete from triggering after selecting a suggestion
    if (lastSelectedSuggestion.current && trimmedQuery === lastSelectedSuggestion.current) {
      lastSelectedSuggestion.current = null; // Reset after one check
      return;
    }

    if (!trimmedQuery) {
      setAutocompleteSuggestions([]);
      setIsAutocompleteOpen(false);
      setAutocompleteError('');
      return;
    }

    // Create AbortController for request cancellation
    const abortController = new AbortController();
    let isActive = true;
    setAutocompleteLoading(true);
    setAutocompleteError('');

    const fetchSuggestions = async () => {
      try {
        const response = await fetchAutocompleteSuggestions({
          query: trimmedQuery,
          category: selectedCategory,
          size: 10,
          signal: abortController.signal, // Pass abort signal for cancellation
        });
        if (!isActive) return;
        setAutocompleteSuggestions(response.suggestions || []);
        setIsAutocompleteOpen(true);
      } catch (error) {
        // Ignore abort errors (request was cancelled intentionally)
        if (error.name === 'AbortError') {
          return;
        }
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
      // Cancel in-flight request when component unmounts or query changes
      abortController.abort();
    };
  }, [searchQuery, selectedCategory]);

  // Handle ESC key and click outside to close autocomplete and dropdowns
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        if (isAutocompleteOpen) setIsAutocompleteOpen(false);
        if (showCountDropdown) setShowCountDropdown(false);
      }
    };

    const handleClickOutside = (e) => {
      // Close autocomplete
      if (
        isAutocompleteOpen &&
        autocompleteRef.current &&
        !autocompleteRef.current.contains(e.target)
      ) {
        setIsAutocompleteOpen(false);
      }

      // Close count dropdown
      if (
        showCountDropdown &&
        countDropdownRef.current &&
        !countDropdownRef.current.contains(e.target)
      ) {
        setShowCountDropdown(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isAutocompleteOpen, showCountDropdown]);

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

    // Close autocomplete immediately
    setIsAutocompleteOpen(false);
    setAutocompleteSuggestions([]);
    
    // Store the selected value to prevent autocomplete from re-triggering
    lastSelectedSuggestion.current = primary.trim();
    
    // Update the search query (autocomplete will be skipped due to the check above)
    handleSearchInputChange(primary);
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

  const handleClearResults = () => {
    setHasSearched(false);
    setSearchQuery('');
    setLastSearchQuery('');
    setProductType('All Types');
    setResultsCount(5);
    setSearchResults([]);
    setSearchError('');
    // Clear saved state from sessionStorage
    sessionStorage.removeItem('singleSearchState');
  };

  const handleAddToQuotation = (product) => {
    setSelectedProduct({
      name: product.productName,
      orderingNo: product.orderingNo
    });
    setDialogOpen(true);
  };

  /**
   * Build a quotation line item from the currently selected product,
   * enriching it with catalog / sales drawing S3 keys when available.
   */
  const buildQuotationItemFromSelectedProduct = async () => {
    const orderingNumber = selectedProduct?.orderingNo || '';
    const name = selectedProduct?.name || '';
    
    let sketchFile = null;
    let catalogLink = '';
    
    if (orderingNumber) {
      try {
        // Fetch full product record to access catalogProducts and salesDrawings
        const productData = await fetchProductByOrderingNumber(orderingNumber);
        const catalogProducts = productData.catalogProducts || [];
        const salesDrawings = productData.salesDrawings || [];

        // Catalog: prefer resolved file key directly from product data
        const primaryCatalogProduct = catalogProducts[0];
        if (primaryCatalogProduct && (primaryCatalogProduct._fileKey || primaryCatalogProduct.fileKey)) {
          catalogLink = primaryCatalogProduct._fileKey || primaryCatalogProduct.fileKey || '';
        }

        // Sales drawing: take first pointer's fileKey as sketch file reference
        if (salesDrawings.length > 0) {
          sketchFile = salesDrawings[0].fileKey || null;
        }
      } catch (err) {
        // If product fetch fails, fall back to basic item without links
        // eslint-disable-next-line no-console
        console.error('Error fetching product for quotation item:', err);
      }
    }

    return {
      orderNo: 1, // Will be adjusted in the quotation page
      orderingNumber,
      requestedItem: name,
      productName: name,
      productType: 'Valve', // Default, can be changed in quotation
      quantity: 1,
      price: 0, // Price to be filled in quotation
      margin: 20,
      sketchFile,
      catalogLink,
      notes: 'Added from single search',
      isIncomplete: false
    };
  };

  const handleSelectQuotation = async (quotationId) => {
    const quotationItem = await buildQuotationItemFromSelectedProduct();

    // Navigate to edit quotation with the new item
    navigate(`/quotations/edit/${quotationId}`, { 
      state: { 
        newItem: quotationItem,
        source: 'single-search'
      } 
    });
  };

  const handleCreateNew = async () => {
    const quotationItem = await buildQuotationItemFromSelectedProduct();

    // Navigate to metadata form first, then to items page
    navigate('/quotations/new', { 
      state: { 
        items: [quotationItem],
        source: 'single-search'
      } 
    });
  };

  const handleProductClick = (orderingNo) => {
    // Save current search state before navigating
    const stateToSave = {
      searchQuery,
      productType,
      resultsCount,
      hasSearched,
      lastSearchQuery,
      searchResults,
      searchError,
      useAI,
      timestamp: new Date().toISOString()
    };
    sessionStorage.setItem('singleSearchState', JSON.stringify(stateToSave));
    
    navigate(`/product/${orderingNo}`, {
      state: { fromSearch: true }
    });
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

      // Fetch full product details (including catalogProducts and salesDrawings)
      const productData = await fetchProductByOrderingNumber(trimmedOrderingNo);
      const catalogProducts = productData.catalogProducts || [];
      const salesDrawings = productData.salesDrawings || [];
      
      let fileId = null;
      let fileKey = null;
      let previewProduct = null;
      let previewType = 'catalog';

      // First, try to get catalog preview
      const primaryCatalogProduct = catalogProducts[0];
      if (primaryCatalogProduct) {
        fileId = primaryCatalogProduct._fileId || primaryCatalogProduct.fileId;
        if (fileId) {
          const fileInfo = await getFileInfo(fileId);
          fileKey = fileInfo.s3Key || fileInfo.key;
          if (fileKey) {
            previewProduct = primaryCatalogProduct;
            previewType = 'catalog';
          }
        }
      }

      // If no catalog, try sales drawing
      if (!fileKey && salesDrawings.length > 0) {
        const primarySalesDrawing = salesDrawings[0];
        fileKey = primarySalesDrawing.fileKey;
        if (fileKey) {
          previewType = 'sales-drawing';
        }
      }

      if (!fileKey) {
        throw new Error('No catalog or sales drawing available for preview');
      }

      // Request a presigned download URL for secure preview access
      const download = await getFileDownloadUrl(fileKey);
      if (!download || !download.url) {
        throw new Error('Missing preview URL');
      }

      setPreviewProduct(previewProduct);
      setPreviewFileKey(fileKey);
      setPreviewFileUrl(download.url);
      setIsPreviewOpen(true);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to open preview', error);
      const message =
        (error && error.message) ||
        'Unable to open preview. Please try again.';
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

  const parseSpecifications = (searchText) => {
    if (!searchText) return '';
    
    // Remove "Ordering Number: XXX | Category: YYY | " prefix
    let cleaned = searchText.replace(/^Ordering Number:[^|]*\|\s*Category:[^|]*\|\s*/, '');
    
    // Remove "Specifications: " prefix if present
    cleaned = cleaned.replace(/^Specifications:\s*/, '');
    
    return cleaned;
  };

  const handleQuickSearch = (query) => {
    setSearchQuery(query);
    handleSearchInputChange(query);
    // Trigger search after a brief delay to allow state update
    setTimeout(() => {
      runSearchWithQuery(query);
    }, 100);
  };

  const quickSearchSuggestions = [
    { label: '1/2" Valve', query: 'half inch valve' },
    { label: '3-Way Ball Valve', query: '3-way ball valve' },
    { label: 'Check Valve', query: 'check valve' },
    { label: '6L-LDE-2H1P', query: '6L-LDE-2H1P' },
  ];

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

        {/* Hero Search Section */}
        <div className="search-hero">
          <div className="search-hero-content">
            <h1 className="search-title">Find Your Products</h1>
            <p className="search-subtitle">
              Search using natural language, part numbers, or specifications
            </p>

            {/* Main Search Box */}
            <div className="search-main-container" ref={autocompleteRef}>
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
                  placeholder="Search for valves, fittings, or enter a part number..."
                  value={searchQuery}
                  onChange={(e) => handleSearchInputChange(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
                <button className="search-button-inline" onClick={handleSearch}>
                  Search
                </button>
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

            {/* Quick Search Suggestions */}
            {!hasSearched && (
              <div className="quick-search-section">
                <div className="quick-search-label">Popular searches:</div>
                <div className="quick-search-buttons">
                  {quickSearchSuggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="quick-search-btn"
                      onClick={() => handleQuickSearch(suggestion.query)}
                    >
                      {suggestion.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Filter Pills */}
            <div className="search-filters-pills">
              <TypeDropdown
                value={productType}
                onChange={setProductType}
                variant="pill"
              />

              <div className="filter-pill-wrapper" ref={countDropdownRef}>
                <button 
                  className="filter-pill"
                  onClick={() => setShowCountDropdown(!showCountDropdown)}
                >
                  <span className="filter-pill-label">Results:</span>
                  <span className="filter-pill-value">Top {resultsCount}</span>
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
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

              <button
                type="button"
                className={`filter-pill filter-pill-toggle ${useAI ? 'active' : ''}`}
                onClick={() => setUseAI((prev) => !prev)}
              >
                <span className="filter-pill-icon">{useAI ? '✨' : '⚡'}</span>
                <span className="filter-pill-value">{useAI ? 'AI Enhanced' : 'Standard'}</span>
              </button>
            </div>
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
                  {lastSearchQuery && !searchLoading && (
                    <p className="search-query-display">
                      Showing results for: <span className="query-text">"{lastSearchQuery}"</span>
                    </p>
                  )}
                  {searchError && !searchLoading && (
                    <p className="search-query-display error-text">
                      {searchError}
                    </p>
                  )}
                </div>
                {!searchLoading && (
                  <button className="clear-results-button" onClick={handleClearResults}>
                    Clear Results
                  </button>
                )}
              </div>
            </div>

            {/* Loading State */}
            {searchLoading && (
              <div className="search-loading-container">
                <div className="search-loading-spinner">
                  <div className="spinner-ring"></div>
                  <div className="spinner-ring"></div>
                  <div className="spinner-ring"></div>
                </div>
                <h3 className="search-loading-title">Searching products...</h3>
                <p className="search-loading-text">
                  {useAI ? 'Using AI to find the best matches' : 'Finding matching products'}
                </p>
              </div>
            )}

            {/* Search Results Table */}
            {!searchLoading && (
            <div className="results-table-section">
              <div className="results-table-container">
                <table className="results-table">
                  <thead>
                    <tr>
                      <th className="col-ordering-no">Ordering No.</th>
                      <th className="col-confidence">Match</th>
                      <th className="col-type">Category</th>
                      <th className="col-specifications">Specifications</th>
                      <th className="col-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!searchLoading && searchResults.length === 0 && (
                      <tr>
                        <td colSpan="5" className="catalog-table-empty">
                          No results found. Try different keywords or check spelling.
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

                      const relevance = result.relevance || '';
                      const relevanceLower = relevance.toLowerCase();

                      const orderingNo = result.orderingNumber || result.orderingNo || result.id;

                      const specifications = parseSpecifications(
                        result.searchText || result.specifications || result.description || ''
                      );

                      const type =
                        result.productCategory ||
                        result.category ||
                        result.type ||
                        '—';

                      // Split specifications by " | " or ", " for better formatting
                      const specItems = specifications
                        .split(/\s*[|,]\s*/)
                        .filter(s => s.trim());

                      return (
                        <tr key={orderingNo || index}>
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
                                <div className="confidence-details">
                                  <span className="confidence-value">
                                    {confidencePercent}%
                                  </span>
                                  {relevance && (
                                    <span className={`relevance-badge relevance-${relevanceLower}`}>
                                      {relevance}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="col-type">
                            <span className="category-badge">{type}</span>
                          </td>
                          <td className="col-specifications">
                            {specItems.length > 0 ? (
                              <ul className="spec-list">
                                {specItems.map((spec, idx) => (
                                  <li key={idx} className="spec-item">{spec}</li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-secondary">—</span>
                            )}
                          </td>
                          <td className="col-actions">
                            <div className="action-buttons-wrapper">
                              <button
                                className="action-btn-primary"
                                onClick={() =>
                                  handleAddToQuotation({
                                    productName: orderingNo,
                                    orderingNo,
                                  })
                                }
                              >
                                Add to Quotation
                              </button>
                              <div className="action-buttons-secondary">
                                <button
                                  className="action-btn-icon"
                                  title="Preview Catalog or Sales Drawing"
                                  type="button"
                                  onClick={() => handleOpenPreview(orderingNo)}
                                  disabled={
                                    !orderingNo ||
                                    (isPreviewLoading && previewOrderingNo === orderingNo)
                                  }
                                >
                                  {isPreviewLoading && previewOrderingNo === orderingNo ? '⋯' : '📄'}
                                </button>
                                <button 
                                  className="action-btn-icon" 
                                  title="View Details"
                                  onClick={() => handleProductClick(orderingNo)}
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
            </div>
            )}
          </>
        )}

        {!hasSearched && (
          <div className="search-empty-state">
            <div className="empty-state-icon">🔍</div>
            <h3 className="empty-state-title">Start Your Search</h3>
            <p className="empty-state-text">
              Enter a product name, ordering number, or description above to find products.
              <br />
              You can also try one of the quick searches to get started.
            </p>
          </div>
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

