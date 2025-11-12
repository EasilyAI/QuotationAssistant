import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mockBatchItems } from '../data/mockBatchItems';
import './MultiItemSearch.css';

const MultiItemSearch = () => {
  const navigate = useNavigate();
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

  // Initialize with restored state if available, otherwise use centralized mock data
  const restoredState = restoreBatchSearchState();
  const [items, setItems] = useState(restoredState?.items || mockBatchItems.map(item => ({ ...item })));

  // Set uploaded file if restoring state
  React.useEffect(() => {
    if (restoredState?.uploadedFileName) {
      setUploadedFile({ name: restoredState.uploadedFileName });
    }
  }, [restoredState?.uploadedFileName]);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setUploadedFile(file);
      console.log('File uploaded:', file.name);
    }
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

  const filteredItems = activeTab === 'all' 
    ? items 
    : activeTab === 'unmatched' 
    ? items.filter(item => item.matches.length === 0)
    : activeTab === 'not-chosen'
    ? items.filter(item => item.matches.length > 0 && !item.selectedMatch && !item.manualOrderingNo)
    : items;

  // Pagination
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedItems = filteredItems.slice(startIndex, startIndex + itemsPerPage);

  // Calculate stats
  const totalCount = items.length;
  const matchedCount = items.filter(item => item.selectedMatch).length;
  const manualCount = items.filter(item => item.manualOrderingNo).length;
  const notChosenCount = items.filter(item => item.matches.length > 0 && !item.selectedMatch && !item.manualOrderingNo).length;
  const noMatchesCount = items.filter(item => item.matches.length === 0 && !item.manualOrderingNo).length;
  const processedCount = matchedCount + manualCount;
  const progressPercentage = (processedCount / totalCount) * 100;

  const handleSaveToQuotation = () => {
    // Convert all items to quotation format (both complete and incomplete)
    const quotationItems = items.map(item => {
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
      setUploadedFile(null);
      setItems([]);
      navigate('/dashboard');
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

        {/* Show table only after file upload */}
        {uploadedFile && (
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
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="expand-column"></th>
                      <th>Item #</th>
                      <th>Product Type</th>
                      <th>Requested Item</th>
                      <th>Quantity</th>
                      <th>Ordering Number</th>
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
                        <tr className={`${rowClassName} ${item.isExpanded ? 'row-expanded' : ''}`}>
                          <td className="expand-cell">
                            {item.matches.length > 0 && (
                              <button onClick={() => toggleExpanded(item.id)} className="expand-button">
                                <span className="expand-icon">
                                  {item.isExpanded ? '−' : '+'}
                                </span>
                              </button>
                            )}
                          </td>
                          <td>{item.itemNumber}</td>
                          <td>{item.productType}</td>
                          <td>{item.requestedItem}</td>
                          <td>{item.quantity}</td>
                          <td>
                            <div className="ordering-number-cell">
                              {selectedMatchData ? (
                                <div className="ordering-number-wrapper">
                                  <svg className="check-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
                                    <path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                  <button 
                                    className="ordering-number-link"
                                    onClick={() => navigate(`/product/${selectedMatchData.orderingNo}`)}
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
                                    className="ordering-number-link manual-entry-link"
                                    onClick={() => navigate(`/product/${item.manualOrderingNo}`)}
                                  >
                                    {item.manualOrderingNo}
                                  </button>
                                  <span className="manual-badge">Manual</span>
                                </div>
                              ) : item.matches.length > 0 ? (
                                <span className="ordering-number-pending">{orderingNumberDisplay}</span>
                              ) : (
                                <div className="manual-entry-wrapper">
                                  <input
                                    type="text"
                                    className="manual-ordering-input"
                                    placeholder="Enter ordering number manually"
                                    defaultValue=""
                                    onBlur={(e) => {
                                      const value = e.target.value.trim();
                                      if (value) {
                                        setItems(items.map(itm => 
                                          itm.id === item.id 
                                            ? { ...itm, manualOrderingNo: value, status: 'Match Found' }
                                            : itm
                                        ));
                                      }
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                        {item.isExpanded && (
                          <tr className="expanded-row">
                            <td colSpan="6">
                              <div className="expanded-content">
                                <h4 className="expanded-title">Search Results for Item #{item.itemNumber}</h4>
                                <div className="expanded-table-container">
                                  <table className="expanded-results-table">
                                    <thead>
                                      <tr>
                                        <th>Product Name</th>
                                        <th>Ordering No.</th>
                                        <th>Confidence</th>
                                        <th>Type</th>
                                        <th>Specifications</th>
                                        <th>Actions</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {item.matches.map((match) => (
                                        <tr key={match.id}>
                                          <td>{match.productName}</td>
                                          <td>
                                            <span className="ordering-number">{match.orderingNo}</span>
                                          </td>
                                          <td>
                                            <div className="confidence-wrapper">
                                              <div className="confidence-bar-bg">
                                                <div 
                                                  className="confidence-bar-fill" 
                                                  style={{ width: `${match.confidence}%` }}
                                                ></div>
                                              </div>
                                              <span className="confidence-value">{match.confidence}</span>
                                            </div>
                                          </td>
                                          <td className="text-secondary">{match.type}</td>
                                          <td className="text-secondary">{match.specifications}</td>
                                          <td>
                                            <div className="match-actions">
                                              <button 
                                                className={`choose-match-btn ${item.selectedMatch === match.id ? 'selected' : ''}`}
                                                onClick={() => handleChooseMatch(item.id, match.id)}
                                              >
                                                {item.selectedMatch === match.id ? 'Selected ✓' : 'Choose This'}
                                              </button>
                                              <div className="action-buttons-icon-group">
                                                <button className="action-btn-icon" title="Open Catalog">
                                                  📄
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
                                      ))}
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
              <button className="discard-button" onClick={handleDiscard}>Discard</button>
              <button className="save-button" onClick={handleSaveToQuotation}>Save to Quotation</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MultiItemSearch;

