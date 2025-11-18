import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { mockQuotationItems } from '../../data/mockQuotationItems';
import { QuotationStatus } from '../../types/index';
import './EditQuotation.css';

const EditQuotation = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isNewQuotation = id === 'new';

  // Get initial items from location state (from MultiSearch or SingleSearch)
  const initialItems = location.state?.items || [];
  const newItem = location.state?.newItem;
  const sourceInfo = location.state?.source;
  const batchSearchAvailable = location.state?.batchSearchAvailable || false;
  const metadata = location.state?.metadata || null;

  // Use centralized mock items for demonstration
  const defaultMockItems = mockQuotationItems.map(item => ({ ...item }));

  // Determine initial items based on source
  const determineInitialItems = () => {
    if (isNewQuotation) {
      // New quotation - use items from state if available, otherwise use default mock
      return initialItems.length > 0 ? initialItems : defaultMockItems;
    } else {
      // Editing existing quotation - use default mock items
      // In a real app, this would fetch from an API
      return defaultMockItems;
    }
  };

  const [quotation, setQuotation] = useState({
    id: isNewQuotation ? null : id,
    quotationNumber: isNewQuotation ? 'DRAFT' : `#${id}`,
    customer: metadata?.customer || location.state?.customer || 'Acme Corp',
    quotationName: metadata?.quotationName || 'Untitled Quotation',
    status: metadata?.status || QuotationStatus.DRAFT,
    currency: metadata?.currency || 'USD',
    defaultMargin: metadata?.defaultMargin || 20,
    notes: metadata?.notes || '',
    createdDate: metadata?.createdDate || new Date().toISOString().split('T')[0],
    items: determineInitialItems()
  });

  // Handle adding a new item to an existing quotation
  useEffect(() => {
    if (newItem && !isNewQuotation) {
      setQuotation(prev => {
        const maxOrderNo = Math.max(...prev.items.map(item => item.orderNo), 0);
        const itemWithCorrectOrderNo = { ...newItem, orderNo: maxOrderNo + 1 };
        return {
          ...prev,
          items: [...prev.items, itemWithCorrectOrderNo]
        };
      });
      setHasUnsavedChanges(true);
    }
  }, [newItem, isNewQuotation]);

  const [globalMargin, setGlobalMargin] = useState(metadata?.defaultMargin || 20);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showOnlyIncomplete, setShowOnlyIncomplete] = useState(false);

  // Warn user about unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const calculateItemPrice = (item) => {
    return item.price * (1 + item.margin / 100);
  };

  const calculateFinancials = () => {
    const subtotal = quotation.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const total = quotation.items.reduce((sum, item) => sum + (calculateItemPrice(item) * item.quantity), 0);
    const marginTotal = total - subtotal;
    return { subtotal, marginTotal, total };
  };

  const handleApplyGlobalMargin = () => {
    setQuotation(prev => ({
      ...prev,
      items: prev.items.map(item => ({
        ...item,
        margin: globalMargin
      }))
    }));
    setHasUnsavedChanges(true);
  };

  const handlePullPrices = async () => {
    // TODO: Implement API call to pull latest prices
    alert('Pulling latest prices from database...');
  };

  const handleItemChange = (index, field, value) => {
    setQuotation(prev => ({
      ...prev,
      items: prev.items.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }));
    setHasUnsavedChanges(true);
  };

  const handleAddItem = () => {
    setQuotation(prev => ({
      ...prev,
      items: [...prev.items, {
        orderNo: prev.items.length + 1,
        orderingNumber: '',
        requestedItem: '',
        productName: '',
        productType: 'Valve',
        quantity: 1,
        price: 0,
        margin: globalMargin,
        sketchFile: null,
        catalogLink: '',
        notes: '',
        isIncomplete: true
      }]
    }));
    setHasUnsavedChanges(true);
  };

  const handleRemoveItem = (index) => {
    if (window.confirm('Are you sure you want to remove this item?')) {
      setQuotation(prev => ({
        ...prev,
        items: prev.items.filter((_, i) => i !== index)
      }));
      setHasUnsavedChanges(true);
    }
  };

  const handleSearchProduct = (index) => {
    // Navigate to single search with callback
    navigate('/search', { 
      state: { 
        returnTo: `/quotations/edit/${id}`,
        quotationIndex: index 
      } 
    });
  };

  const handleExportManufacturer = () => {
    // Create CSV for manufacturer with ordering numbers and quantities
    const csvContent = [
      ['Ordering Number', 'Quantity'],
      ...quotation.items
        .filter(item => !item.isIncomplete && item.orderingNumber)
        .map(item => [item.orderingNumber, item.quantity])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quotation_${quotation.quotationNumber}_manufacturer.csv`;
    a.click();
  };

  const handleExportERP = () => {
    // Create CSV for ERP system
    const csvContent = [
      ['Order No', 'Ordering Number', 'Requested Item', 'Product Name', 'Quantity', 'Price', 'Margin %', 'Final Price', 'Notes'],
      ...quotation.items.map(item => [
        item.orderNo,
        item.orderingNumber || '',
        item.requestedItem,
        item.productName,
        item.quantity,
        item.price.toFixed(2),
        item.margin,
        calculateItemPrice(item).toFixed(2),
        item.notes
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quotation_${quotation.quotationNumber}_erp.csv`;
    a.click();
  };

  const handleExportCustomerEmail = () => {
    // Generate email template with sketches
    const emailBody = `Dear ${quotation.customer},

Please find below the quotation details for your review:

Quotation Number: ${quotation.quotationNumber}
Total Items: ${quotation.items.length}
Grand Total: $${calculateFinancials().total.toFixed(2)}

Items:
${quotation.items.map(item => `
${item.orderNo}. ${item.productName}
   - Quantity: ${item.quantity}
   - Unit Price: $${calculateItemPrice(item).toFixed(2)}
   - Subtotal: $${(calculateItemPrice(item) * item.quantity).toFixed(2)}
   ${item.sketchFile ? `- Sketch: ${item.sketchFile}` : ''}
   - Notes: ${item.notes}
`).join('\n')}

Grand Total: $${calculateFinancials().total.toFixed(2)}

Please review and let us know if you have any questions.

Best regards,
Your Sales Team`;

    // Open default email client with pre-filled content
    window.location.href = `mailto:customer@example.com?subject=Quotation ${quotation.quotationNumber}&body=${encodeURIComponent(emailBody)}`;
  };

  const handleFinalizeQuotation = () => {
    const incompleteItems = quotation.items.filter(item => item.isIncomplete || !item.orderingNumber);
    if (incompleteItems.length > 0) {
      alert(`Please complete ${incompleteItems.length} incomplete item(s) before finalizing.`);
      return;
    }
    
    setQuotation(prev => ({ ...prev, status: 'sent for confirmation' }));
    alert('Quotation finalized and sent for confirmation!');
    navigate('/quotations');
  };

  const handleStatusChange = (newStatus) => {
    setQuotation(prev => ({ ...prev, status: newStatus }));
    setHasUnsavedChanges(true);
  };

  const handleSave = () => {
    // TODO: Implement API call to save quotation
    console.log('Saving quotation:', quotation);
    setHasUnsavedChanges(false);
    alert('Quotation saved successfully!');
  };

  const handleBack = () => {
    if (hasUnsavedChanges) {
      if (window.confirm('You have unsaved changes. Are you sure you want to leave?')) {
        navigate('/quotations');
      }
    } else {
      navigate('/quotations');
    }
  };

  const handleEditMetadata = () => {
    navigate(`/quotations/metadata/${id}`, {
      state: {
        metadata: {
          quotationName: quotation.quotationName,
          customer: quotation.customer,
          currency: quotation.currency,
          defaultMargin: quotation.defaultMargin,
          notes: quotation.notes,
          createdDate: quotation.createdDate,
          status: quotation.status
        }
      }
    });
  };

  const handleReturnToBatchSearch = () => {
    const message = hasUnsavedChanges 
      ? 'You have unsaved changes. Return to batch search anyway?'
      : 'Return to batch search to complete remaining items?';
    
    if (window.confirm(message)) {
      navigate('/multi-search');
    }
  };

  const financials = calculateFinancials();
  const incompleteCount = quotation.items.filter(item => item.isIncomplete || !item.orderingNumber).length;
  
  // Filter items based on incomplete filter
  const displayedItems = showOnlyIncomplete 
    ? quotation.items.filter(item => item.isIncomplete || !item.orderingNumber)
    : quotation.items;

  return (
    <div className="edit-quotation-page">
      {/* Breadcrumbs */}
      <div className="breadcrumbs" style={{padding: '16px 24px 0'}}>
        <button onClick={() => navigate('/dashboard')} className="breadcrumb-link">Home</button>
        <span className="breadcrumb-separator">›</span>
        <button onClick={() => navigate('/quotations')} className="breadcrumb-link">Quotations</button>
        <span className="breadcrumb-separator">›</span>
        <span className="breadcrumb-current">
          {isNewQuotation ? 'New Quotation' : `Edit ${quotation.quotationNumber}`}
        </span>
        {sourceInfo && (
          <>
            <span className="breadcrumb-separator">•</span>
            <span className="breadcrumb-source">From {sourceInfo.replace('-', ' ')}</span>
          </>
        )}
      </div>

      <div className="quotation-header">
        <div className="quotation-title-section">
          <div className="header-left">
            <button onClick={handleBack} className="back-button">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <div className="title-info">
              <h1 className="quotation-title">{quotation.quotationName}</h1>
              <div className="header-meta">
                <span className="quotation-number">{quotation.quotationNumber}</span>
                <span className="separator">•</span>
                <span className="quotation-customer">{quotation.customer}</span>
                <span className="separator">•</span>
                <span className="item-count">{quotation.items.length} items</span>
                <span className="separator">•</span>
                <span className="total-value">{quotation.currency} {financials.total.toFixed(2)}</span>
                {incompleteCount > 0 && (
                  <>
                    <span className="separator">•</span>
                    <span className="incomplete-badge">{incompleteCount} incomplete</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="header-right">
            <button onClick={handleEditMetadata} className="btn-edit-metadata">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M11 4H4C3.46957 4 2.96086 4.21071 2.58579 4.58579C2.21071 4.96086 2 5.46957 2 6V20C2 20.5304 2.21071 21.0391 2.58579 21.4142C2.96086 21.7893 3.46957 22 4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M18.5 2.50001C18.8978 2.10219 19.4374 1.87869 20 1.87869C20.5626 1.87869 21.1022 2.10219 21.5 2.50001C21.8978 2.89784 22.1213 3.4374 22.1213 4.00001C22.1213 4.56262 21.8978 5.10219 21.5 5.50001L12 15L8 16L9 12L18.5 2.50001Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Edit Info
            </button>
            <select 
              value={quotation.status} 
              onChange={(e) => handleStatusChange(e.target.value)}
              className={`status-select`}
            >
            {Object.values(QuotationStatus).map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
            </select>
            {hasUnsavedChanges && <span className="unsaved-indicator">Unsaved changes</span>}
            <button onClick={handleSave} className="btn-save">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H16L21 8V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M17 21V13H7V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M7 3V8H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Save
            </button>
          </div>
        </div>
      </div>

      <div className="quotation-controls-bar">
        <div className="controls-left">
          <div className="control-group">
            <label>Margin:</label>
            <input 
              type="number" 
              value={globalMargin} 
              onChange={(e) => setGlobalMargin(Number(e.target.value))}
              className="margin-input-small"
              placeholder="20"
            />
            <span>%</span>
            <button onClick={handleApplyGlobalMargin} className="btn-control">
              Apply to All
            </button>
          </div>
          <button onClick={handlePullPrices} className="btn-control">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M21 12C21 16.9706 16.9706 21 12 21M21 12C21 7.02944 16.9706 3 12 3M21 12H3M12 21C7.02944 21 3 16.9706 3 12M12 21C13.6569 21 15 16.9706 15 12C15 7.02944 13.6569 3 12 3M12 21C10.3431 21 9 16.9706 9 12C9 7.02944 10.3431 3 12 3M3 12C3 7.02944 7.02944 3 12 3" stroke="currentColor" strokeWidth="2"/>
            </svg>
            Pull Prices
          </button>
          {batchSearchAvailable && incompleteCount > 0 && (
            <button onClick={handleReturnToBatchSearch} className="btn-control btn-return-batch">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Return to Batch Search ({incompleteCount} incomplete)
            </button>
          )}
        </div>
        <div className="controls-right">
          <button 
            onClick={() => setShowOnlyIncomplete(!showOnlyIncomplete)}
            className={`btn-filter ${showOnlyIncomplete ? 'active' : ''}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M22 3H2L10 12.46V19L14 21V12.46L22 3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {showOnlyIncomplete ? `Incomplete Only (${incompleteCount})` : 'Show Incomplete Only'}
          </button>
        </div>
      </div>

      <div className="quotation-table-container">
        <div className="table-wrapper">
          <table className="quotation-table">
            <thead>
              <tr>
                <th style={{width: '50px'}}>#</th>
                <th style={{width: '120px'}}>Ordering #</th>
                <th style={{width: '200px'}}>Requested Item</th>
                <th style={{width: '200px'}}>Product Name</th>
                <th style={{width: '100px'}}>Type</th>
                <th style={{width: '80px'}}>Qty</th>
                <th style={{width: '100px'}}>Price</th>
                <th style={{width: '80px'}}>Margin %</th>
                <th style={{width: '80px'}}>Sketch</th>
                <th style={{width: '80px'}}>Catalog</th>
                <th style={{width: '250px'}}>Notes</th>
                <th style={{width: '100px'}}>Final Price</th>
                <th style={{width: '60px'}}></th>
              </tr>
            </thead>
            <tbody>
              {displayedItems.length === 0 ? (
                <tr>
                  <td colSpan="13" className="empty-table">
                    <div className="empty-state-table">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                        <path d="M9 11L12 14L22 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M21 12V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <p>All items are complete!</p>
                    </div>
                  </td>
                </tr>
              ) : (
                displayedItems.map((item) => {
                  // Get original index from full items array
                  const originalIndex = quotation.items.findIndex(i => i.orderNo === item.orderNo);
                  return (
                <tr key={item.orderNo} className={item.isIncomplete ? 'incomplete-row' : ''}>
                  <td className="text-center">{item.orderNo}</td>
                  <td>
                    {item.isIncomplete || !item.orderingNumber ? (
                      <button 
                        onClick={() => handleSearchProduct(originalIndex)}
                        className="search-product-btn"
                      >
                        Search
                      </button>
                    ) : (
                      <a 
                        href={`/product/${item.orderingNumber}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ordering-number-link"
                      >
                        {item.orderingNumber}
                      </a>
                    )}
                  </td>
                  <td>
                    <input 
                      type="text" 
                      value={item.requestedItem}
                      onChange={(e) => handleItemChange(originalIndex, 'requestedItem', e.target.value)}
                      className="table-input"
                      placeholder="Original request"
                    />
                  </td>
                  <td>
                    <input 
                      type="text" 
                      value={item.productName}
                      onChange={(e) => handleItemChange(originalIndex, 'productName', e.target.value)}
                      className="table-input"
                      placeholder="Product name"
                    />
                  </td>
                  <td>
                    <select 
                      value={item.productType}
                      onChange={(e) => handleItemChange(originalIndex, 'productType', e.target.value)}
                      className="table-select"
                    >
                      <option>Valve</option>
                      <option>Tube</option>
                      <option>Cylinder</option>
                      <option>Fitting</option>
                      <option>Seal</option>
                      <option>Gasket</option>
                      <option>Regulator</option>
                      <option>Coupling</option>
                      <option>Hose</option>
                      <option>Other</option>
                    </select>
                  </td>
                  <td>
                    <input 
                      type="number" 
                      value={item.quantity}
                      onChange={(e) => handleItemChange(originalIndex, 'quantity', Number(e.target.value))}
                      className="table-input text-center"
                    />
                  </td>
                  <td>
                    <input 
                      type="number" 
                      value={item.price}
                      onChange={(e) => handleItemChange(originalIndex, 'price', Number(e.target.value))}
                      className="table-input text-right"
                      step="0.01"
                      placeholder="0.00"
                    />
                  </td>
                  <td>
                    <input 
                      type="number" 
                      value={item.margin}
                      onChange={(e) => handleItemChange(originalIndex, 'margin', Number(e.target.value))}
                      className="table-input text-center"
                      placeholder="20"
                    />
                  </td>
                  <td className="text-center">
                    {item.sketchFile ? (
                      <a href={item.sketchFile} target="_blank" rel="noopener noreferrer" className="link-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2"/>
                          <path d="M14 2V8H20M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="2"/>
                        </svg>
                      </a>
                    ) : (
                      <span className="no-link">-</span>
                    )}
                  </td>
                  <td className="text-center">
                    {item.catalogLink ? (
                      <a href={item.catalogLink} target="_blank" rel="noopener noreferrer" className="link-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M18 13V19C18 19.5304 17.7893 20.0391 17.4142 20.4142C17.0391 20.7893 16.5304 21 16 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V8C3 7.46957 3.21071 6.96086 3.58579 6.58579C3.96086 6.21071 4.46957 6 5 6H11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                          <path d="M15 3H21V9M10 14L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </a>
                    ) : (
                      <span className="no-link">-</span>
                    )}
                  </td>
                  <td>
                    <input 
                      type="text" 
                      value={item.notes}
                      onChange={(e) => handleItemChange(originalIndex, 'notes', e.target.value)}
                      className="table-input"
                      placeholder="Notes"
                    />
                  </td>
                  <td className="final-price text-right">
                    ${calculateItemPrice(item).toFixed(2)}
                  </td>
                  <td className="text-center">
                    <button 
                      onClick={() => handleRemoveItem(originalIndex)}
                      className="delete-btn"
                      title="Remove item"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </td>
                </tr>
              );
              }))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <button onClick={handleAddItem} className="btn-add-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Add Item
          </button>
        </div>
      </div>

      <div className="quotation-footer">
        <div className="financials-compact">
          <span className="financial-item">Subtotal: <strong>${financials.subtotal.toFixed(2)}</strong></span>
          <span className="separator">|</span>
          <span className="financial-item">Margin: <strong>${financials.marginTotal.toFixed(2)}</strong></span>
          <span className="separator">|</span>
          <span className="financial-item grand">Total: <strong>${financials.total.toFixed(2)}</strong></span>
        </div>

        <div className="action-buttons">
          <div className="export-dropdown">
            <button className="btn-export">
              Export ▼
            </button>
            <div className="export-menu">
              <button onClick={handleExportManufacturer}>Manufacturer Order List</button>
              <button onClick={handleExportERP}>ERP Input File</button>
              <button onClick={handleExportCustomerEmail}>Customer Email Template</button>
            </div>
          </div>
          <button onClick={handleFinalizeQuotation} className="btn-finalize">
            Finalize Quotation
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditQuotation;

