import React, { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { parseExcelFile } from '../../utils/excelParser';
import { batchSearchProducts } from '../../services/batchSearchService';
import { fetchAutocompleteSuggestions } from '../../services/searchService';
import BatchSearchResultsDialog from '../../components/BatchSearchResultsDialog';
import BatchValidationDialog from '../../components/BatchValidationDialog';
import CatalogPreviewDialog from '../../components/CatalogPreviewDialog';
import AddToQuotationDialog from '../../components/AddToQuotationDialog';
import { fetchProductByOrderingNumber } from '../../services/productsService';
import { getFileDownloadUrl, getFileInfo } from '../../services/fileInfoService';
import { batchAddLineItems } from '../../services/quotationService';
import { ProductCategory } from '../../types';
import './MultiItemSearch.css';

const MultiItemSearch = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Check if we came from a quotation
  const cameFromQuotation = location.state?.fromQuotation || false;
  const quotationId = location.state?.quotationId || null;
  const [activeTab, setActiveTab] = useState('all');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Check if we should restore previous batch search state
  const restoreBatchSearchState = () => {
    const savedState = sessionStorage.getItem('batchSearchState');
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        return parsed;
      } catch (e) {
        console.error('Failed to restore batch search state:', e);
      }
    }
    return null;
  };

  // Initialize with restored state if available, otherwise empty
  // Only restore if we came from a quotation (to continue previous work)
  // Otherwise, start fresh
  const shouldRestoreState = cameFromQuotation;
  const restoredState = shouldRestoreState ? restoreBatchSearchState() : null;
  const [items, setItems] = useState(restoredState?.items || []);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [validationErrors, setValidationErrors] = useState([]);
  const [showResultsDialog, setShowResultsDialog] = useState(false);
  const [batchSearchResults, setBatchSearchResults] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewProduct, setPreviewProduct] = useState(null);
  const [previewFileKey, setPreviewFileKey] = useState('');
  const [previewFileUrl, setPreviewFileUrl] = useState(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewOrderingNo, setPreviewOrderingNo] = useState(null);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [parsedExcelData, setParsedExcelData] = useState(null);
  const [validationErrorsMinimized, setValidationErrorsMinimized] = useState(true); // Start minimized
  const [autocompleteData, setAutocompleteData] = useState({}); // { itemId: { suggestions: [], loading: false, show: false } }
  const autocompleteInputRefs = useRef({});
  const [showAddToQuotationDialog, setShowAddToQuotationDialog] = useState(false);

  // Set uploaded file if restoring state (only when coming from quotation)
  React.useEffect(() => {
    if (shouldRestoreState && restoredState?.uploadedFileName) {
      setUploadedFile({ name: restoredState.uploadedFileName });
    }
  }, [shouldRestoreState, restoredState?.uploadedFileName]);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    // Validate file type
    const validExtensions = ['.xlsx', '.xls'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    if (!validExtensions.includes(fileExtension)) {
      setSearchError('Invalid file type. Please upload an Excel file (.xlsx or .xls)');
      return;
    }

    // Clear previous state when uploading a new file
    sessionStorage.removeItem('batchSearchState');
    setItems([]);
    setBatchSearchResults(null);
    setCurrentPage(1);
    setActiveTab('all');

    setIsLoading(true);
    setSearchError('');
    setValidationErrors([]);
    setUploadedFile(file);

    try {
      // Parse Excel file
      const { items: parsedItems, errors: parseErrors } = await parseExcelFile(file);
      
      // Store parsed data for later use
      setParsedExcelData(parsedItems);
      
      // Separate valid and invalid items
      const validItems = parsedItems.filter(item => item.isValid);
      const invalidItems = parsedItems.filter(item => !item.isValid);

      // Show validation dialog if there are any errors or warnings
      if (parseErrors.length > 0 || invalidItems.length > 0) {
        setValidationErrors(parseErrors);
        setShowValidationDialog(true);
        setIsLoading(false);
        return; // Wait for user to confirm
      }

      // If all items are valid, proceed directly to search
      await executeBatchSearch(validItems, parsedItems);
    } catch (error) {
      console.error('Error processing file:', error);
      setSearchError(error.message || 'Failed to process Excel file. Please check the file format and try again.');
      setIsLoading(false);
    }
  };

  // Execute batch search with valid items
  const executeBatchSearch = async (validItems, allParsedItems) => {
    if (validItems.length === 0) {
      setSearchError('No valid items to search.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setSearchError('');

    try {
      // Execute batch search
      const searchResponse = await batchSearchProducts({
        items: validItems.map(item => ({
          orderingNumber: item.orderingNumber || null,
          description: item.description || null,
          quantity: item.quantity,
          productType: item.productType,
        })),
        size: 30,
        resultSize: 5,
        useAI: true,
      });

      // Transform API results to match component's expected format
      // Map results back to original parsed items to preserve all Excel columns
      // The API returns results with itemIndex corresponding to the position in the validItems array sent
      const validItemsList = allParsedItems.filter(item => item.isValid);
      const resultMap = new Map();
      searchResponse.results.forEach((result) => {
        // result.itemIndex corresponds to index in validItems array that was sent to API
        resultMap.set(result.itemIndex, result);
      });

      const transformedItems = validItemsList.map((originalItem, validIndex) => {
        const result = resultMap.get(validIndex);
        if (!result) {
        return {
          id: Date.now() + validIndex,
          ...originalItem, // Preserve all original Excel data
          isValid: true, // Ensure valid items are marked
          status: 'No Matches',
          isExpanded: false,
          selectedMatch: null,
          matches: [],
        };
        }

        // Map matches and find exact ordering number match
        const matches = (result.matches || []).map((match, matchIdx) => ({
          id: `M${validIndex}-${matchIdx + 1}`,
          productName: match.productName || match.searchText || '',
          orderingNo: match.orderingNo || match.orderingNumber || '',
          orderingNumber: match.orderingNo || match.orderingNumber || '',
          confidence: match.confidence || 0,
          type: match.type || originalItem.productType,
          category: match.type || originalItem.productType,
          specifications: match.specifications || match.searchText || '',
          searchText: match.specifications || match.searchText || '',
          score: match.score || 0,
          relevance: match.relevance || 'low',
        }));

        // Auto-select exact match if orderingNumber matches exactly
        const requestedOrderingNo = (originalItem.orderingNumber || '').trim();
        let autoSelectedMatchId = null;
        if (requestedOrderingNo && matches.length > 0) {
          const exactMatch = matches.find(m => 
            (m.orderingNo || '').trim().toLowerCase() === requestedOrderingNo.toLowerCase()
          );
          if (exactMatch) {
            autoSelectedMatchId = exactMatch.id;
          }
        }

        return {
          id: Date.now() + validIndex,
          ...originalItem, // Preserve all original Excel data
          isValid: true, // Ensure valid items are marked
          status: matches.length > 0 ? 'Match Found' : 'No Matches',
          isExpanded: false,
          selectedMatch: autoSelectedMatchId,
          matches: matches,
        };
      });

      // Don't include invalid items in the searchable items list
      // Invalid items are only shown in the validation dialog
      setItems(transformedItems);
      setBatchSearchResults(searchResponse);
      setShowResultsDialog(true);
      setValidationErrorsMinimized(true); // Minimize errors after search
    } catch (error) {
      console.error('Error executing batch search:', error);
      setSearchError(error.message || 'Failed to execute batch search. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle validation dialog continue
  const handleValidationContinue = () => {
    setShowValidationDialog(false);
    if (parsedExcelData) {
      const validItems = parsedExcelData.filter(item => item.isValid);
      executeBatchSearch(validItems, parsedExcelData);
    }
  };

  // Handle validation dialog cancel
  const handleValidationCancel = () => {
    setShowValidationDialog(false);
    setUploadedFile(null);
    setParsedExcelData(null);
    setValidationErrors([]);
    setIsLoading(false);
  };

  const toggleExpanded = (id) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, isExpanded: !item.isExpanded } : item
    ));
  };

  const handleChooseMatch = (itemId, matchId) => {
    setItems(items.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          selectedMatch: matchId,
          status: 'Match Found',
          isExpanded: false
        };
      }
      return item;
    }));
  };

  // Filter out invalid items from display (they shouldn't be searchable)
  const validItemsOnly = items.filter(item => item.isValid !== false);
  
  const filteredItems = activeTab === 'all' 
    ? validItemsOnly
    : activeTab === 'unmatched' 
    ? validItemsOnly.filter(item => item.matches.length === 0 && !item.manualOrderingNo)
    : activeTab === 'not-chosen'
    ? validItemsOnly.filter(item => item.matches.length > 0 && !item.selectedMatch && !item.manualOrderingNo)
    : validItemsOnly;

  // Pagination
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedItems = filteredItems.slice(startIndex, startIndex + itemsPerPage);

  // Calculate stats (only for valid items)
  const validItemsForStats = items.filter(item => item.isValid !== false);
  const totalCount = validItemsForStats.length;
  const matchedCount = validItemsForStats.filter(item => item.selectedMatch).length;
  const manualCount = validItemsForStats.filter(item => item.manualOrderingNo).length;
  const notChosenCount = validItemsForStats.filter(item => item.matches.length > 0 && !item.selectedMatch && !item.manualOrderingNo).length;
  const noMatchesCount = validItemsForStats.filter(item => item.matches.length === 0 && !item.manualOrderingNo).length;
  const processedCount = matchedCount + manualCount;
  const progressPercentage = totalCount > 0 ? (processedCount / totalCount) * 100 : 0;

  // Convert items to quotation format
  const convertItemsToQuotationFormat = () => {
    return items.map(item => {
      const selectedMatchData = item.selectedMatch 
        ? item.matches.find(m => m.id === item.selectedMatch)
        : null;
      
      // Check if manually entered or matched
      const hasOrderingNumber = selectedMatchData || item.manualOrderingNo;
      const isIncomplete = !hasOrderingNumber;
      
      return {
        orderNo: item.itemNumber,
        orderingNumber: selectedMatchData?.orderingNo || item.manualOrderingNo || '',
        requestedItem: item.requestedItem,
        productName: selectedMatchData?.productName || item.requestedItem,
        productType: item.productType,
        quantity: item.quantity,
        price: 0, // Price to be filled in quotation
        margin: 20,
        sketchFile: null,
        catalogLink: '',
        notes: selectedMatchData 
          ? `Confidence: ${selectedMatchData.confidence}%` 
          : item.manualOrderingNo 
          ? 'Manually entered'
          : 'Needs ordering number - return to batch search',
        isIncomplete: isIncomplete
      };
    });
  };

  const handleSaveToQuotation = () => {
    const quotationItems = convertItemsToQuotationFormat();

    if (quotationItems.length === 0) {
      alert('No items to save to quotation.');
      return;
    }

    const incompleteCount = quotationItems.filter(item => item.isIncomplete).length;
    const confirmMessage = incompleteCount > 0
      ? `You have ${incompleteCount} item(s) without ordering numbers. You can complete them later from the quotation. Continue?`
      : 'Save all items to quotation?';

    if (!window.confirm(confirmMessage)) {
      return;
    }

    // Open the dialog to choose existing quotation or create new
    setShowAddToQuotationDialog(true);
  };

  // Handle selecting an existing quotation
  const handleSelectQuotation = async (quotationId) => {
    const quotationItems = convertItemsToQuotationFormat();
    
    // Save batch search state to sessionStorage for later return
    sessionStorage.setItem('batchSearchState', JSON.stringify({
      uploadedFileName: uploadedFile?.name,
      items: items,
      timestamp: new Date().toISOString()
    }));

    try {
      // Transform items for batch add
      const transformedItems = quotationItems.map(item => ({
        orderingNumber: item.orderingNumber || item.orderingNo || '',
        productName: item.productName || item.requestedItem || '',
        description: item.description || item.specs || item.requestedItem || '',
        quantity: item.quantity || 1,
        base_price: item.price,
        margin_pct: item.margin ? item.margin / 100 : undefined,
        drawing_link: item.sketchFile,
        catalog_link: item.catalogLink,
        notes: item.notes,
        source: 'search', // Valid values: 'search', 'manual', 'import'
        original_request: item.requestedItem || item.originalRequest || ''
      }));

      // Add items to existing quotation
      await batchAddLineItems(quotationId, transformedItems);

      // Navigate to the quotation edit page
      navigate(`/quotations/edit/${quotationId}`, { 
        state: { 
          source: 'batch-search',
          batchSearchAvailable: true
        } 
      });
    } catch (error) {
      console.error('Error adding items to quotation:', error);
      alert(`Failed to add items to quotation: ${error.message || 'Unknown error'}`);
    }
  };

  // Handle creating a new quotation
  const handleCreateNew = () => {
    const quotationItems = convertItemsToQuotationFormat();

    // Save batch search state to sessionStorage for later return
    sessionStorage.setItem('batchSearchState', JSON.stringify({
      uploadedFileName: uploadedFile?.name,
      items: items,
      timestamp: new Date().toISOString()
    }));

    // Navigate to metadata form first, then to items page
    navigate('/quotations/new', { 
      state: { 
        items: quotationItems,
        source: 'batch-search',
        batchSearchAvailable: true
      } 
    });
  };

  const handleDiscard = () => {
    if (window.confirm('Are you sure you want to discard all changes?')) {
      // Clear sessionStorage to prevent restoring old state
      sessionStorage.removeItem('batchSearchState');
      // Clear all state
      setUploadedFile(null);
      setItems([]);
      setParsedExcelData(null);
      setValidationErrors([]);
      setBatchSearchResults(null);
      setSearchError('');
      setCurrentPage(1);
      setActiveTab('all');
      navigate('/dashboard');
    }
  };

  // Handle opening catalog or sales drawing preview
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

      // First, try to get catalog preview
      const primaryCatalogProduct = catalogProducts[0];
      if (primaryCatalogProduct) {
        fileId = primaryCatalogProduct._fileId || primaryCatalogProduct.fileId;
        if (fileId) {
          const fileInfo = await getFileInfo(fileId);
          fileKey = fileInfo.s3Key || fileInfo.key;
          if (fileKey) {
            previewProduct = primaryCatalogProduct;
          }
        }
      }

      // If no catalog, try sales drawing
      if (!fileKey && salesDrawings.length > 0) {
        const primarySalesDrawing = salesDrawings[0];
        fileKey = primarySalesDrawing.fileKey;
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
      console.error('Failed to open preview', error);
      const message =
        (error && error.message) ||
        'Unable to open preview. Please try again.';
      window.alert(message);
    } finally {
      setIsPreviewLoading(false);
      setPreviewOrderingNo(null);
    }
  };

  return (
    <div className="multi-item-search-page">
      <div className="multi-item-search-content">
        {/* Breadcrumbs */}
        <div className="breadcrumbs">
          <button onClick={() => navigate('/dashboard')} className="breadcrumb-link">Home</button>
          <span className="breadcrumb-separator">›</span>
          <span className="breadcrumb-current">Batch Search & Verification</span>
          <span className="breadcrumb-separator">›</span>
          <span className="breadcrumb-next">Add to Quotation</span>
        </div>

        {/* Restored State Banner */}
        {restoredState && (
          <div className="restored-state-banner">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 8V12L15 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Continuing previous batch search • {restoredState.uploadedFileName}</span>
            <button 
              className="banner-close"
              onClick={() => sessionStorage.removeItem('batchSearchState')}
            >
              ✕
            </button>
          </div>
        )}

        {/* Page Header */}
        <div className="search-header">
          <div className="search-header-text">
            <h1 className="search-title">Batch Search & Verification</h1>
            <p className="search-subtitle">
              Upload an Excel file with your product requests. Our system will search manufacturer catalogs and suggest matches.
            </p>
          </div>
        </div>

        {/* Upload Section */}
        <div className="upload-section-wrapper">
          <div className="upload-section-main">
            <input
              type="file"
              id="excel-upload"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            <label htmlFor="excel-upload" className="upload-button">
              <div className="upload-icon">
                <svg fill="currentColor" height="20px" viewBox="0 0 256 256" width="20px" xmlns="http://www.w3.org/2000/svg">
                  <path d="M240,136v64a16,16,0,0,1-16,16H32a16,16,0,0,1-16-16V136a16,16,0,0,1,16-16H80a8,8,0,0,1,0,16H32v64H224V136H176a8,8,0,0,1,0-16h48A16,16,0,0,1,240,136ZM85.66,77.66,120,43.31V128a8,8,0,0,0,16,0V43.31l34.34,34.35a8,8,0,0,0,11.32-11.32l-48-48a8,8,0,0,0-11.32,0l-48,48A8,8,0,0,0,85.66,77.66ZM200,168a12,12,0,1,0-12,12A12,12,0,0,0,200,168Z"></path>
                </svg>
              </div>
              <span>Upload Excel File</span>
            </label>
            {uploadedFile && (
              <div className="uploaded-file-marker">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 1L3 6H6V11H10V6H13L8 1Z" fill="currentColor"/>
                  <path d="M2 13H14V15H2V13Z" fill="currentColor"/>
                </svg>
                <span>{uploadedFile.name}</span>
              </div>
            )}
          </div>
          
          {/* Validation Errors Display - Minimizable, positioned on the right */}
          {validationErrors.length > 0 && (
            <div className={`validation-errors-sidebar ${validationErrorsMinimized ? 'minimized' : ''}`}>
              <div className="validation-errors-sidebar-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>{validationErrors.length} error{validationErrors.length !== 1 ? 's' : ''}</span>
                <button
                  className="validation-errors-toggle"
                  onClick={() => setValidationErrorsMinimized(!validationErrorsMinimized)}
                >
                  {validationErrorsMinimized ? '▼' : '▲'}
                </button>
              </div>
              {validationErrorsMinimized === false && (
                <div className="validation-errors-sidebar-list">
                  {validationErrors.map((error, idx) => (
                    <div key={idx} className="validation-error-sidebar-item">
                      <strong>Row {error.rowNumber}:</strong>
                      {error.errors && error.errors.length > 0 && (
                        <div className="validation-error-details">
                          {error.errors.map((err, errIdx) => (
                            <div key={errIdx}>• {err}</div>
                          ))}
                        </div>
                      )}
                      {error.warnings && error.warnings.length > 0 && (
                        <div className="validation-warning-details">
                          {error.warnings.map((warn, warnIdx) => (
                            <div key={warnIdx}>⚠ {warn}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Empty State - Show instructions when no file uploaded */}
        {!uploadedFile && !isLoading && (
          <div className="empty-state-container">
            <div className="empty-state-content">
              <div className="empty-state-icon">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h2 className="empty-state-title">Upload Excel File to Start Batch Search</h2>
              <p className="empty-state-description">
                Upload an Excel file (.xlsx or .xls) containing your product requests. 
                The system will search manufacturer catalogs and suggest matches for each item.
              </p>
              
              <div className="empty-state-instructions">
                <h3 className="empty-state-instructions-title">Required Excel Columns:</h3>
                <ul className="empty-state-instructions-list">
                  <li>
                    <strong>orderingNumber</strong> (optional) - Product SKU or part number
                    <br />
                    <span className="instruction-note">If provided, search will prioritize exact matches by ordering number</span>
                  </li>
                  <li>
                    <strong>description</strong> (required if no orderingNumber) - Product description or technical specifications
                    <br />
                    <span className="instruction-note">Used for vector search when ordering number is not available</span>
                  </li>
                  <li>
                    <strong>quantity</strong> (required) - Number of units needed
                  </li>
                  <li>
                    <strong>productType</strong> (optional) - Product category
                    <br />
                    <span className="instruction-note">Recommended: {Object.values(ProductCategory).join(', ')}. Missing product type may affect search accuracy.</span>
                  </li>
                </ul>
              </div>

              <div className="empty-state-note">
                <p>
                  <strong>Note:</strong> Each row must have either an ordering number or description. 
                  Rows missing both will be marked as invalid and excluded from search.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="loading-state-container">
            <div className="loading-spinner">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="#2188C9" strokeWidth="2" strokeLinecap="round" strokeDasharray="32" strokeDashoffset="32">
                  <animate attributeName="stroke-dasharray" dur="2s" values="0 32;16 16;0 32;0 32" repeatCount="indefinite"/>
                  <animate attributeName="stroke-dashoffset" dur="2s" values="0;-16;-32;-32" repeatCount="indefinite"/>
                </circle>
              </svg>
            </div>
            <p className="loading-text">Processing Excel file and searching products...</p>
          </div>
        )}

        {/* Error Display */}
        {searchError && (
          <div className="error-banner">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>{searchError}</span>
          </div>
        )}


        {/* Show table only after file upload */}
        {uploadedFile && !isLoading && items.length > 0 && (
          <>
            {/* Summary Stats */}
            <div className="batch-summary">
              <div className="summary-card">
                <span className="summary-label">Total Items</span>
                <span className="summary-value">{totalCount}</span>
              </div>
              <div className="summary-card success">
                <span className="summary-label">Matched</span>
                <span className="summary-value">{matchedCount}</span>
              </div>
              <div className="summary-card info">
                <span className="summary-label">Manual Entry</span>
                <span className="summary-value">{manualCount}</span>
              </div>
              <div className="summary-card warning">
                <span className="summary-label">Not Chosen</span>
                <span className="summary-value">{notChosenCount}</span>
              </div>
              <div className="summary-card error">
                <span className="summary-label">No Matches</span>
                <span className="summary-value">{noMatchesCount}</span>
              </div>
            </div>

            <div className="tabs-section">
              <div className="tabs">
                <button
                  className={`tab ${activeTab === 'all' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('all');
                    setCurrentPage(1);
                  }}
                >
                  All Items ({totalCount})
                </button>
                <button
                  className={`tab ${activeTab === 'not-chosen' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('not-chosen');
                    setCurrentPage(1);
                  }}
                >
                  Not Chosen ({notChosenCount})
                </button>
                <button
                  className={`tab ${activeTab === 'unmatched' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('unmatched');
                    setCurrentPage(1);
                  }}
                >
                  No Matches ({noMatchesCount})
                </button>
              </div>
            </div>

            <div className="table-section">
              <div className="table-container">
                <table className="data-table results-table">
                  <thead>
                    <tr>
                      <th className="expand-column"></th>
                      <th>Item #</th>
                      <th>Ordering Number</th>
                      <th>Description</th>
                      <th>Product Type</th>
                      <th>Quantity</th>
                      <th>Selected Ordering Number</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedItems.map((item) => {
                      const selectedMatchData = item.selectedMatch 
                        ? item.matches.find(m => m.id === item.selectedMatch)
                        : null;
                      
                      const orderingNumberDisplay = selectedMatchData
                        ? selectedMatchData.orderingNo
                        : item.matches.length > 0
                        ? '− Not yet chosen'
                        : '✗ No matches found';
                      
                      // Row coloring: green if has ordering number (matched or manual), yellow if pending, red if needs input
                      const rowClassName = (selectedMatchData || item.manualOrderingNo)
                        ? 'row-completed'
                        : item.matches.length > 0 
                        ? 'row-pending'
                        : 'row-no-matches';
                      
                      return (
                      <React.Fragment key={item.id}>
                        <tr 
                          className={`${rowClassName} ${item.isExpanded ? 'row-expanded' : ''} ${item.matches.length > 0 ? 'row-clickable' : ''}`}
                          onClick={item.matches.length > 0 ? () => toggleExpanded(item.id) : undefined}
                        >
                          <td className="expand-cell">
                            {item.matches.length > 0 && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleExpanded(item.id);
                                }} 
                                className="expand-button"
                              >
                                <span className="expand-icon">
                                  {item.isExpanded ? '−' : '+'}
                                </span>
                              </button>
                            )}
                          </td>
                          <td>{item.itemNumber}</td>
                          <td>{item.orderingNumber || '—'}</td>
                          <td>{item.description || '—'}</td>
                          <td>
                            {item.productType || '—'}
                            {!item.productType && item.warnings && item.warnings.includes('Product type is missing') && (
                              <span className="warning-badge" title="Product type missing - may affect search results">⚠</span>
                            )}
                          </td>
                          <td>{item.quantity || '—'}</td>
                          <td>
                            <div className="ordering-number-cell">
                              {selectedMatchData ? (
                                <div className="ordering-number-wrapper">
                                  <svg className="check-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
                                    <path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                  <button 
                                    className="ordering-link"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      window.open(`/product/${selectedMatchData.orderingNo}`, '_blank');
                                    }}
                                  >
                                    {selectedMatchData.orderingNo}
                                  </button>
                                </div>
                              ) : item.manualOrderingNo ? (
                                <div className="ordering-number-wrapper">
                                  <svg className="check-icon manual-check" width="16" height="16" viewBox="0 0 16 16" fill="none">
                                    <path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                  <button 
                                    className="ordering-link manual-entry-link"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      window.open(`/product/${item.manualOrderingNo}`, '_blank');
                                    }}
                                  >
                                    {item.manualOrderingNo}
                                  </button>
                                  <span className="manual-badge">Manual</span>
                                </div>
                              ) : item.matches.length > 0 ? (
                                <div className="ordering-number-pending-wrapper">
                                  <span className="ordering-number-pending">{item.matches.length} option{item.matches.length !== 1 ? 's' : ''} available</span>
                                  <div className="manual-entry-wrapper" style={{ position: 'relative', marginTop: '8px' }}>
                                    <input
                                      ref={(el) => {
                                        if (el) autocompleteInputRefs.current[`${item.id}-manual`] = el;
                                      }}
                                      type="text"
                                      className="manual-ordering-input"
                                      placeholder="Or search another product..."
                                      defaultValue=""
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={async (e) => {
                                        const value = e.target.value.trim();
                                        if (value.length >= 2) {
                                          try {
                                            setAutocompleteData(prev => ({
                                              ...prev,
                                              [`${item.id}-manual`]: { ...prev[`${item.id}-manual`], loading: true, show: false }
                                            }));
                                            const suggestions = await fetchAutocompleteSuggestions({
                                              query: value,
                                              size: 5,
                                            });
                                            setAutocompleteData(prev => ({
                                              ...prev,
                                              [`${item.id}-manual`]: {
                                                suggestions: suggestions.suggestions || [],
                                                loading: false,
                                                show: true
                                              }
                                            }));
                                          } catch (error) {
                                            console.error('Autocomplete error:', error);
                                            setAutocompleteData(prev => ({
                                              ...prev,
                                              [`${item.id}-manual`]: { ...prev[`${item.id}-manual`], loading: false, show: false }
                                            }));
                                          }
                                        } else {
                                          setAutocompleteData(prev => ({
                                            ...prev,
                                            [`${item.id}-manual`]: { suggestions: [], loading: false, show: false }
                                          }));
                                        }
                                      }}
                                      onBlur={(e) => {
                                        // Delay to allow click on suggestion
                                        setTimeout(() => {
                                          const value = e.target.value.trim();
                                          if (value) {
                                            setItems(items.map(itm => 
                                              itm.id === item.id 
                                                ? { ...itm, manualOrderingNo: value, status: 'Match Found' }
                                                : itm
                                            ));
                                          }
                                          setAutocompleteData(prev => ({
                                            ...prev,
                                            [`${item.id}-manual`]: { ...prev[`${item.id}-manual`], show: false }
                                          }));
                                        }, 200);
                                      }}
                                      onFocus={(e) => {
                                        const value = e.target.value.trim();
                                        if (value.length >= 2) {
                                          // Trigger autocomplete if there's already text
                                          e.target.dispatchEvent(new Event('change', { bubbles: true }));
                                        }
                                      }}
                                    />
                                    {autocompleteData[`${item.id}-manual`]?.show && autocompleteData[`${item.id}-manual`]?.suggestions?.length > 0 && (
                                      <div 
                                        className="autocomplete-dropdown"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {autocompleteData[`${item.id}-manual`].suggestions.map((suggestion, idx) => {
                                          const orderingNo = suggestion.orderingNumber || suggestion.orderingNo || '';
                                          const displayText = suggestion.searchText || suggestion.text || orderingNo;
                                          return (
                                            <div
                                              key={idx}
                                              className="autocomplete-item"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setItems(items.map(itm => 
                                                  itm.id === item.id 
                                                    ? { ...itm, manualOrderingNo: orderingNo, status: 'Match Found' }
                                                    : itm
                                                ));
                                                setAutocompleteData(prev => ({
                                                  ...prev,
                                                  [`${item.id}-manual`]: { suggestions: [], loading: false, show: false }
                                                }));
                                                if (autocompleteInputRefs.current[`${item.id}-manual`]) {
                                                  autocompleteInputRefs.current[`${item.id}-manual`].value = orderingNo;
                                                }
                                              }}
                                            >
                                              <div className="autocomplete-ordering">{orderingNo}</div>
                                              <div className="autocomplete-text">{displayText}</div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="manual-entry-wrapper" style={{ position: 'relative' }}>
                                  <input
                                    ref={(el) => {
                                      if (el) autocompleteInputRefs.current[item.id] = el;
                                    }}
                                    type="text"
                                    className="manual-ordering-input"
                                    placeholder="Enter ordering number manually"
                                    defaultValue=""
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={async (e) => {
                                      const value = e.target.value.trim();
                                      if (value.length >= 2) {
                                        try {
                                          setAutocompleteData(prev => ({
                                            ...prev,
                                            [item.id]: { ...prev[item.id], loading: true, show: false }
                                          }));
                                          const suggestions = await fetchAutocompleteSuggestions({
                                            query: value,
                                            size: 5,
                                          });
                                          setAutocompleteData(prev => ({
                                            ...prev,
                                            [item.id]: {
                                              suggestions: suggestions.suggestions || [],
                                              loading: false,
                                              show: true
                                            }
                                          }));
                                        } catch (error) {
                                          console.error('Autocomplete error:', error);
                                          setAutocompleteData(prev => ({
                                            ...prev,
                                            [item.id]: { ...prev[item.id], loading: false, show: false }
                                          }));
                                        }
                                      } else {
                                        setAutocompleteData(prev => ({
                                          ...prev,
                                          [item.id]: { suggestions: [], loading: false, show: false }
                                        }));
                                      }
                                    }}
                                    onBlur={(e) => {
                                      // Delay to allow click on suggestion
                                      setTimeout(() => {
                                        const value = e.target.value.trim();
                                        if (value) {
                                          setItems(items.map(itm => 
                                            itm.id === item.id 
                                              ? { ...itm, manualOrderingNo: value, status: 'Match Found' }
                                              : itm
                                          ));
                                        }
                                        setAutocompleteData(prev => ({
                                          ...prev,
                                          [item.id]: { ...prev[item.id], show: false }
                                        }));
                                      }, 200);
                                    }}
                                    onFocus={(e) => {
                                      const value = e.target.value.trim();
                                      if (value.length >= 2) {
                                        // Trigger autocomplete if there's already text
                                        e.target.dispatchEvent(new Event('change', { bubbles: true }));
                                      }
                                    }}
                                  />
                                  {autocompleteData[item.id]?.show && autocompleteData[item.id]?.suggestions?.length > 0 && (
                                    <div 
                                      className="autocomplete-dropdown"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {autocompleteData[item.id].suggestions.map((suggestion, idx) => {
                                        const orderingNo = suggestion.orderingNumber || suggestion.orderingNo || '';
                                        const displayText = suggestion.searchText || suggestion.text || orderingNo;
                                        return (
                                          <div
                                            key={idx}
                                            className="autocomplete-item"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setItems(items.map(itm => 
                                                itm.id === item.id 
                                                  ? { ...itm, manualOrderingNo: orderingNo, status: 'Match Found' }
                                                  : itm
                                              ));
                                              setAutocompleteData(prev => ({
                                                ...prev,
                                                [item.id]: { suggestions: [], loading: false, show: false }
                                              }));
                                              if (autocompleteInputRefs.current[item.id]) {
                                                autocompleteInputRefs.current[item.id].value = orderingNo;
                                              }
                                            }}
                                          >
                                            <div className="autocomplete-ordering">{orderingNo}</div>
                                            <div className="autocomplete-text">{displayText}</div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                        {item.isExpanded && (
                          <tr className="expanded-row">
                            <td colSpan="7">
                              <div className="expanded-content">
                                <div className="expanded-table-container">
                                  <table className="expanded-results-table results-table">
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
                                      {item.matches.length === 0 ? (
                                        <tr>
                                          <td colSpan="5" className="catalog-table-empty">
                                            No results found.
                                          </td>
                                        </tr>
                                      ) : (
                                        item.matches.map((match) => {
                                          const confidencePercent = match.confidence || (match.score ? Math.round(match.score * 100) : 0);
                                          const relevance = match.relevance || 'low';
                                          const relevanceLower = relevance.toLowerCase();
                                          const orderingNo = match.orderingNo || match.orderingNumber || '';
                                          const specifications = match.specifications || match.searchText || '';
                                          // Filter out lines that contain "Ordering Number:" or "Category:"
                                          const specItems = specifications
                                            .split(/\s*[|,]\s*/)
                                            .filter(s => {
                                              const trimmed = s.trim();
                                              return trimmed && 
                                                     !trimmed.toLowerCase().startsWith('ordering number:') && 
                                                     !trimmed.toLowerCase().startsWith('category:');
                                            });
                                          const type = match.type || match.category || item.productType || '—';

                                          return (
                                            <tr key={match.id}>
                                              <td className="col-ordering-no">
                                                {orderingNo ? (
                                                  <button
                                                    className="ordering-link"
                                                    onClick={(e) => {
                                                      e.preventDefault();
                                                      e.stopPropagation();
                                                      window.open(`/product/${orderingNo}`, '_blank');
                                                    }}
                                                  >
                                                    {orderingNo}
                                                  </button>
                                                ) : (
                                                  '—'
                                                )}
                                              </td>
                                              <td className="col-confidence">
                                                {confidencePercent > 0 ? (
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
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleChooseMatch(item.id, match.id);
                                                    }}
                                                  >
                                                    {item.selectedMatch === match.id ? 'Selected ✓' : 'Choose This'}
                                                  </button>
                                                  <button
                                                    className="action-btn-secondary"
                                                    onClick={async (e) => {
                                                      e.stopPropagation();
                                                      if (orderingNo) {
                                                        await handleOpenPreview(orderingNo);
                                                      }
                                                    }}
                                                    disabled={isPreviewLoading || !orderingNo}
                                                    title="Open Catalog Preview"
                                                  >
                                                    Preview
                                                  </button>
                                                </div>
                                              </td>
                                            </tr>
                                          );
                                        })
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination-section">
                <button 
                  className="pagination-btn"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </button>
                <div className="pagination-info">
                  Page {currentPage} of {totalPages} ({filteredItems.length} items)
                </div>
                <button 
                  className="pagination-btn"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </button>
              </div>
            )}

            <div className="progress-section">
              <div className="progress-header">
                <p className="progress-title">Batch Progress</p>
              </div>
              <div className="progress-bar-container">
                <div 
                  className="progress-bar" 
                  style={{ width: `${progressPercentage}%` }}
                ></div>
              </div>
              <p className="progress-text">
                <span className="progress-number">{processedCount}/{totalCount}</span> Items have ordering numbers ({Math.round(progressPercentage)}% Complete)
              </p>
            </div>

            <p className="autosave-text">Autosaving...</p>

            <div className="action-buttons">
              {cameFromQuotation && quotationId ? (
                <>
                  <button className="discard-button" onClick={handleDiscard}>Discard</button>
                  <button 
                    className="back-button" 
                    onClick={() => navigate(`/quotations/edit/${quotationId}`)}
                  >
                    Back to Quotation
                  </button>
                </>
              ) : (
                <>
                  <button className="discard-button" onClick={handleDiscard}>Discard</button>
                  <button className="save-button" onClick={handleSaveToQuotation}>Save to Quotation</button>
                </>
              )}
            </div>
          </>
        )}

        {/* Validation Dialog */}
        {showValidationDialog && parsedExcelData && (
          <BatchValidationDialog
            isOpen={showValidationDialog}
            onClose={() => setShowValidationDialog(false)}
            onContinue={handleValidationContinue}
            onCancel={handleValidationCancel}
            validItems={parsedExcelData.filter(item => item.isValid)}
            invalidItems={parsedExcelData.filter(item => !item.isValid)}
            fileName={uploadedFile?.name || 'Excel file'}
          />
        )}

        {/* Batch Search Results Dialog */}
        {showResultsDialog && batchSearchResults && (
          <BatchSearchResultsDialog
            isOpen={showResultsDialog}
            onClose={() => setShowResultsDialog(false)}
            onReviewResults={() => setShowResultsDialog(false)}
            summary={batchSearchResults.summary}
            results={batchSearchResults.results}
          />
        )}

        {/* Catalog Preview Dialog */}
        <CatalogPreviewDialog
          isOpen={isPreviewOpen}
          onClose={() => {
            setIsPreviewOpen(false);
            setPreviewProduct(null);
            setPreviewFileKey('');
            setPreviewFileUrl(null);
          }}
          catalogKey={previewFileKey}
          fileUrl={previewFileUrl}
          product={previewProduct}
          highlightTerm={previewOrderingNo}
          title="Catalog Preview"
        />

        {/* Add to Quotation Dialog */}
        <AddToQuotationDialog
          open={showAddToQuotationDialog}
          onOpenChange={setShowAddToQuotationDialog}
          productName={`${items.length} item${items.length !== 1 ? 's' : ''} from batch search`}
          orderingNo=""
          onSelectQuotation={handleSelectQuotation}
          onCreateNew={handleCreateNew}
        />
      </div>
    </div>
  );
};

export default MultiItemSearch;

