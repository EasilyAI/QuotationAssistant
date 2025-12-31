import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { QuotationStatus } from '../../types/index';
import CatalogPreviewDialog from '../../components/CatalogPreviewDialog';
import { fetchProductByOrderingNumber } from '../../services/productsService';
import { getFileDownloadUrl, getFileInfo } from '../../services/fileInfoService';
import { 
  getQuotation, 
  createQuotation, 
  updateQuotation,
  addLineItem,
  updateLineItem,
  deleteLineItem,
  batchAddLineItems,
  refreshPrices,
  exportStockCheck,
  exportPriorityImport,
  generateEmailDraft
} from '../../services/quotationService';
import './EditQuotation.css';

const EditQuotation = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isNewQuotation = id === 'new';
  
  // Prevent duplicate creation in StrictMode/double-mount
  const hasCreatedRef = useRef(false);
  const hasAddedNewItemRef = useRef(false);
  const hasLoadedRef = useRef(false);
  
  // Store initial values from location state in refs to prevent infinite loops
  // These are only read on initial mount
  const initialDataRef = useRef({
    items: location.state?.items || [],
    newItem: location.state?.newItem,
    metadata: location.state?.metadata || null,
    source: location.state?.source,
    batchSearchAvailable: location.state?.batchSearchAvailable || false
  });

  // Get current values (for display purposes)
  const initialItems = initialDataRef.current.items;
  const newItem = initialDataRef.current.newItem;
  const sourceInfo = initialDataRef.current.source;
  const batchSearchAvailable = initialDataRef.current.batchSearchAvailable;
  const metadata = initialDataRef.current.metadata;

  const [quotation, setQuotation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Catalog preview state
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewProduct, setPreviewProduct] = useState(null);
  const [previewFileKey, setPreviewFileKey] = useState('');
  const [previewFileUrl, setPreviewFileUrl] = useState(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewType, setPreviewType] = useState(null); // 'catalog' or 'sketch'

  // Load quotation on mount
  useEffect(() => {
    const loadQuotation = async () => {
      // Prevent double creation in StrictMode
      if (isNewQuotation && metadata && hasCreatedRef.current) {
        return;
      }
      
      // Prevent reloading if we've already loaded this quotation successfully
      if (!isNewQuotation && hasLoadedRef.current === id) {
        return;
      }
      
      setLoading(true);
      setError(null);
      
      try {
        if (isNewQuotation) {
          // Create new quotation if metadata provided
          if (metadata) {
            hasCreatedRef.current = true;
            const newQuotation = await createQuotation({
              quotationName: metadata.quotationName || 'Untitled Quotation',
              customer: metadata.customer || '',
              currency: metadata.currency || 'USD',
              defaultMargin: metadata.defaultMargin || 20,
              notes: metadata.notes || '',
              status: metadata.status || QuotationStatus.DRAFT,
              vatRate: metadata.vatRate
            });
            
            // Add initial items if provided
            if (initialItems.length > 0) {
              const transformedItems = initialItems.map(item => ({
                orderingNumber: item.orderingNumber || item.orderingNo,
                productName: item.productName || item.requestedItem || '',
                description: item.description || item.specs || item.requestedItem || '',
                quantity: item.quantity || 1,
                base_price: item.price,
                margin_pct: item.margin ? item.margin / 100 : undefined,
                drawing_link: item.sketchFile,
                catalog_link: item.catalogLink,
                notes: item.notes,
                source: 'search',
                original_request: item.requestedItem || item.originalRequest || ''
              }));
              
              try {
                await batchAddLineItems(newQuotation.id, transformedItems);
                // Reload to get updated quotation with items
                const updated = await getQuotation(newQuotation.id);
                setQuotation(updated);
              } catch (batchErr) {
                console.error('Error adding batch items:', batchErr);
                // Still set the quotation even if batch add fails
                setQuotation({
                  ...newQuotation,
                  items: []
                });
                setError(`Quotation created but failed to add items: ${batchErr.message}`);
              }
            } else {
              setQuotation({
                ...newQuotation,
                items: []
              });
            }
          } else {
            // No metadata - just initialize empty state
            setQuotation({
              id: null,
              quotationNumber: 'DRAFT',
              customer: '',
              quotationName: 'Untitled Quotation',
              status: QuotationStatus.DRAFT,
              currency: 'USD',
              defaultMargin: 20,
              notes: '',
              createdDate: new Date().toISOString().split('T')[0],
              items: initialItems.length > 0 ? initialItems : []
            });
          }
        } else {
          // Load existing quotation
          const loaded = await getQuotation(id);
          if (loaded) {
            setQuotation(loaded);
            // Mark as loaded only on success
            hasLoadedRef.current = id;
          } else {
            setError('Quotation not found');
          }
        }
      } catch (err) {
        console.error('Error loading quotation:', err);
        setError(err.message || 'Failed to load quotation');
        // Don't mark as loaded on error to allow retry, but prevent infinite loops
        // by checking if we already have an error state
        if (!error) {
          hasLoadedRef.current = id;
        }
      } finally {
        setLoading(false);
      }
    };

    loadQuotation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNewQuotation]); // Removed initialItems and metadata from dependencies to prevent infinite loops

  // Handle adding a new item to an existing quotation
  useEffect(() => {
    if (newItem && !isNewQuotation && quotation?.id && !hasAddedNewItemRef.current) {
      hasAddedNewItemRef.current = true;
      const addItem = async () => {
        try {
          const transformedItem = {
            orderingNumber: newItem.orderingNumber || newItem.orderingNo,
            productName: newItem.productName || newItem.requestedItem || '',
            description: newItem.description || newItem.specs || newItem.requestedItem || '',
            quantity: newItem.quantity || 1,
            base_price: newItem.price,
            margin_pct: newItem.margin ? newItem.margin / 100 : undefined,
            drawing_link: newItem.sketchFile,
            catalog_link: newItem.catalogLink,
            notes: newItem.notes,
            source: 'search',
            original_request: newItem.requestedItem || newItem.originalRequest || ''
          };
          
          const updatedItems = await addLineItem(quotation.id, transformedItem);
          setQuotation(prev => ({ ...prev, items: updatedItems }));
          setHasUnsavedChanges(true);
        } catch (err) {
          console.error('Error adding item:', err);
          alert(err.message || 'Failed to add item');
        }
      };
      
      addItem();
    }
  }, [newItem, isNewQuotation, quotation?.id]);

  const [globalMargin, setGlobalMargin] = useState(metadata?.defaultMargin || quotation?.defaultMargin || 20);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showOnlyIncomplete] = useState(false);
  const [filterType, setFilterType] = useState('all'); // 'all', 'incomplete', 'no-price', 'no-drawing'
  
  // Update globalMargin when quotation loads
  useEffect(() => {
    if (quotation?.defaultMargin) {
      setGlobalMargin(quotation.defaultMargin);
    }
  }, [quotation?.defaultMargin]);

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
    const price = item.price != null ? item.price : 0;
    const margin = item.margin != null ? item.margin : 0;
    return price * (1 + margin / 100);
  };

  const calculateFinancials = () => {
    const items = quotation.items || [];
    const subtotal = items.reduce((sum, item) => {
      const price = item.price != null ? item.price : 0;
      return sum + (price * (item.quantity || 1));
    }, 0);
    const total = items.reduce((sum, item) => {
      return sum + (calculateItemPrice(item) * (item.quantity || 1));
    }, 0);
    const marginTotal = total - subtotal;
    return { subtotal, marginTotal, total };
  };

  // Apply margin to LOCAL state only - will be saved when user clicks Save
  const handleApplyGlobalMargin = () => {
    setQuotation(prev => ({
      ...prev,
      defaultMargin: globalMargin,
      items: prev.items.map(item => ({
        ...item,
        margin: globalMargin
      }))
    }));
    setHasUnsavedChanges(true);
  };

  const handlePullPrices = async () => {
    if (!quotation?.id) {
      alert('Please save the quotation first before pulling prices');
      return;
    }
    
    try {
      const updatedItems = await refreshPrices(quotation.id);
      setQuotation(prev => ({ ...prev, items: updatedItems }));
      setHasUnsavedChanges(true);
      alert('Prices refreshed successfully');
    } catch (err) {
      console.error('Error refreshing prices:', err);
      alert(err.message || 'Failed to refresh prices');
    }
  };

  // Update item in LOCAL state only - save to backend when user clicks Save
  const handleItemChange = (index, field, value) => {
    setQuotation(prev => ({
      ...prev,
      items: prev.items.map((it, i) => 
        i === index ? { ...it, [field]: value } : it
      )
    }));
    setHasUnsavedChanges(true);
  };

  // Open catalog or sales drawing preview
  const handleOpenPreview = async (orderingNo, type = 'catalog') => {
    const trimmedOrderingNo = (orderingNo || '').trim();
    if (!trimmedOrderingNo || isPreviewLoading) {
      return;
    }

    try {
      setIsPreviewLoading(true);
      setPreviewType(type);

      // Fetch full product details (including catalogProducts and salesDrawings)
      const productData = await fetchProductByOrderingNumber(trimmedOrderingNo);
      const catalogProducts = productData.catalogProducts || [];
      const salesDrawings = productData.salesDrawings || [];
      
      let fileId = null;
      let fileKey = null;
      let previewProduct = null;

      // First, try to get catalog preview (if type is catalog or auto)
      if (type === 'catalog' || type === 'auto') {
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
      }

      // If no catalog or type is sales-drawing, try sales drawing
      if (!fileKey && (type === 'sales-drawing' || type === 'auto')) {
        if (salesDrawings.length > 0) {
          const primarySalesDrawing = salesDrawings[0];
          fileKey = primarySalesDrawing.fileKey;
        }
      }

      if (!fileKey) {
        throw new Error('No catalog or sales drawing available for preview');
      }

      // Request a presigned download URL
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
      window.alert(error?.message || 'Unable to open preview. Please try again.');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleClosePreview = () => {
    setIsPreviewOpen(false);
    setPreviewProduct(null);
    setPreviewFileKey('');
    setPreviewFileUrl(null);
    setPreviewType(null);
  };

  // Add item to LOCAL state only - will be saved when user clicks Save
  const handleAddItem = () => {
    const newItemData = {
      orderNo: (quotation.items?.length || 0) + 1,
      orderingNumber: '',
      requestedItem: '',
      productName: 'New Item',
      specs: '',
      quantity: 1,
      price: null,
      margin: globalMargin,
      sketchFile: null,
      catalogLink: '',
      notes: '',
      isIncomplete: true,
      originalRequest: '',
      _isNew: true // Mark as new for save logic
    };
    
    setQuotation(prev => ({
      ...prev,
      items: [...(prev.items || []), newItemData]
    }));
    setHasUnsavedChanges(true);
  };

  // Remove item from LOCAL state only - will be saved when user clicks Save
  const handleRemoveItem = (index) => {
    if (!window.confirm('Are you sure you want to remove this item?')) {
      return;
    }
    
    const item = quotation.items[index];
    
    setQuotation(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
      // Track deleted items for save logic (only if they have a line_id)
      _deletedLineIds: item.line_id 
        ? [...(prev._deletedLineIds || []), item.line_id]
        : (prev._deletedLineIds || [])
    }));
    setHasUnsavedChanges(true);
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

  const handleExportManufacturer = async () => {
    if (!quotation?.id) {
      alert('Please save the quotation first before exporting');
      return;
    }
    
    try {
      await exportStockCheck(quotation.id);
    } catch (err) {
      console.error('Error exporting stock check:', err);
      alert(err.message || 'Failed to export stock check');
    }
  };

  const handleExportERP = async () => {
    if (!quotation?.id) {
      alert('Please save the quotation first before exporting');
      return;
    }
    
    try {
      await exportPriorityImport(quotation.id);
    } catch (err) {
      console.error('Error exporting priority import:', err);
      alert(err.message || 'Failed to export priority import');
    }
  };

  const handleExportCustomerEmail = async () => {
    if (!quotation?.id) {
      alert('Please save the quotation first before generating email');
      return;
    }
    
    try {
      const emailDraft = await generateEmailDraft(quotation.id, quotation.customer?.email);
      
      // Open default email client with pre-filled content
      const mailtoLink = `mailto:${emailDraft.to || 'customer@example.com'}?subject=${encodeURIComponent(emailDraft.subject)}&body=${encodeURIComponent(emailDraft.body)}`;
      window.location.href = mailtoLink;
      
      // Note: Attachments (sketch drawings) will need to be handled by the email client
      // The presigned URLs are in emailDraft.attachments
      if (emailDraft.attachments && emailDraft.attachments.length > 0) {
        console.log('Email attachments available:', emailDraft.attachments);
        // Some email clients support attachments via data URIs, but this is limited
      }
    } catch (err) {
      console.error('Error generating email draft:', err);
      alert(err.message || 'Failed to generate email draft');
    }
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

  // Update status in LOCAL state only - will be saved when user clicks Save
  const handleStatusChange = (newStatus) => {
    setQuotation(prev => ({ ...prev, status: newStatus }));
    setHasUnsavedChanges(true);
  };

  const handleSave = async () => {
    try {
      // Transform items for backend
      const transformItems = (items) => items.map(item => ({
        orderingNumber: item.orderingNumber || '',
        productName: item.productName || item.requestedItem || 'Item',
        description: item.specs || item.description || '',
        quantity: item.quantity || 1,
        base_price: item.price,
        margin_pct: item.margin != null ? item.margin / 100 : undefined,
        drawing_link: item.sketchFile,
        catalog_link: item.catalogLink,
        notes: item.notes || '',
        source: item.source || 'manual',
        original_request: item.originalRequest || ''
      }));
      
      if (!quotation.id) {
        // Create new quotation
        const newQuotation = await createQuotation({
          quotationName: quotation.quotationName || quotation.name,
          customer: quotation.customer,
          currency: quotation.currency,
          defaultMargin: quotation.defaultMargin,
          notes: quotation.notes,
          status: quotation.status
        });
        
        // Add all items as a batch
        if (quotation.items && quotation.items.length > 0) {
          await batchAddLineItems(newQuotation.id, transformItems(quotation.items));
        }
        
        // Reload to get latest data
        const updated = await getQuotation(newQuotation.id);
        setQuotation({ ...updated, _deletedLineIds: [] });
        
        // Update URL to use new ID
        navigate(`/quotations/edit/${newQuotation.id}`, { replace: true });
      } else {
        // Update existing quotation header
        await updateQuotation(quotation.id, {
          quotationName: quotation.quotationName || quotation.name,
          customer: quotation.customer,
          currency: quotation.currency,
          defaultMargin: quotation.defaultMargin,
          notes: quotation.notes,
          status: quotation.status
        });
        
        // Delete removed items
        const deletedIds = quotation._deletedLineIds || [];
        for (const lineId of deletedIds) {
          await deleteLineItem(quotation.id, lineId);
        }
        
        // Separate new items from existing items
        const newItems = (quotation.items || []).filter(item => item._isNew || !item.line_id);
        const existingItems = (quotation.items || []).filter(item => item.line_id && !item._isNew);
        
        // Update existing items
        for (const item of existingItems) {
          await updateLineItem(quotation.id, item.line_id, transformItems([item])[0]);
        }
        
        // Add new items
        if (newItems.length > 0) {
          await batchAddLineItems(quotation.id, transformItems(newItems));
        }
        
        // Reload to get latest data
        const updated = await getQuotation(quotation.id);
        setQuotation({ ...updated, _deletedLineIds: [] });
      }
      
      setHasUnsavedChanges(false);
      alert('Quotation saved successfully!');
    } catch (err) {
      console.error('Error saving quotation:', err);
      alert(err.message || 'Failed to save quotation');
    }
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

  if (loading) {
    return (
      <div className="edit-quotation-page">
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <p>Loading quotation...</p>
        </div>
      </div>
    );
  }

  if (error || !quotation) {
    return (
      <div className="edit-quotation-page">
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <p style={{ color: 'red' }}>Error: {error || 'Quotation not found'}</p>
          <button onClick={() => navigate('/quotations')}>Back to Quotations</button>
        </div>
      </div>
    );
  }

  const financials = calculateFinancials();
  const incompleteCount = quotation.items?.filter(item => item.isIncomplete || !item.orderingNumber).length || 0;
  const noPriceCount = quotation.items?.filter(item => item.price == null).length || 0;
  const noDrawingCount = quotation.items?.filter(item => !item.sketchFile).length || 0;
  
  // Filter items based on filter type
  const getDisplayedItems = () => {
    const items = quotation.items || [];
    switch (filterType) {
      case 'incomplete':
        return items.filter(item => item.isIncomplete || !item.orderingNumber);
      case 'no-price':
        return items.filter(item => item.price == null);
      case 'no-drawing':
        return items.filter(item => !item.sketchFile);
      default:
        return items;
    }
  };
  
  const displayedItems = showOnlyIncomplete 
    ? (quotation.items || []).filter(item => item.isIncomplete || !item.orderingNumber)
    : getDisplayedItems();
  
  // Parse specifications from description
  const parseSpecs = (specs) => {
    if (!specs) return [];
    return specs.split(/\s*[|,]\s*/).filter(s => s.trim()).slice(0, 4);
  };

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

      {/* Metrics Section */}
      <div className="quotation-metrics-bar">
        <div className="metrics-group">
          <div 
            className={`metric-card ${filterType === 'all' ? 'active' : ''}`}
            onClick={() => setFilterType('all')}
          >
            <div className="metric-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>
            </div>
            <div className="metric-info">
              <span className="metric-value">{quotation.items?.length || 0}</span>
              <span className="metric-label">Total Items</span>
            </div>
          </div>
          <div 
            className={`metric-card warning ${filterType === 'no-price' ? 'active' : ''} ${noPriceCount > 0 ? 'has-issues' : ''}`}
            onClick={() => setFilterType(filterType === 'no-price' ? 'all' : 'no-price')}
          >
            <div className="metric-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
            </div>
            <div className="metric-info">
              <span className="metric-value">{noPriceCount}</span>
              <span className="metric-label">No Price</span>
            </div>
          </div>
          <div 
            className={`metric-card info ${filterType === 'no-drawing' ? 'active' : ''} ${noDrawingCount > 0 ? 'has-issues' : ''}`}
            onClick={() => setFilterType(filterType === 'no-drawing' ? 'all' : 'no-drawing')}
          >
            <div className="metric-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>
            </div>
            <div className="metric-info">
              <span className="metric-value">{noDrawingCount}</span>
              <span className="metric-label">No Drawings</span>
            </div>
          </div>
          <div 
            className={`metric-card danger ${filterType === 'incomplete' ? 'active' : ''} ${incompleteCount > 0 ? 'has-issues' : ''}`}
            onClick={() => setFilterType(filterType === 'incomplete' ? 'all' : 'incomplete')}
          >
            <div className="metric-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            </div>
            <div className="metric-info">
              <span className="metric-value">{incompleteCount}</span>
              <span className="metric-label">Incomplete</span>
            </div>
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
          {filterType !== 'all' && (
            <button 
              onClick={() => setFilterType('all')}
              className="btn-filter active"
            >
              Clear Filter
            </button>
          )}
        </div>
      </div>

      <div className="quotation-table-container">
        <div className="table-wrapper">
          <table className="quotation-table">
            <thead>
              <tr>
                <th className="col-num">#</th>
                <th className="col-ordering">Ordering Number</th>
                <th className="col-specs">Specifications</th>
                <th className="col-qty">Qty</th>
                <th className="col-price">Price</th>
                <th className="col-margin">Margin</th>
                <th className="col-final">Final Price</th>
                <th className="col-files">Files</th>
                <th className="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {displayedItems.length === 0 ? (
                <tr>
                  <td colSpan="9" className="empty-table">
                    <div className="empty-state-table">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                        <path d="M9 11L12 14L22 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M21 12V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <p>{filterType !== 'all' ? 'No items match the current filter' : 'No items yet. Add items to get started.'}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                displayedItems.map((item) => {
                  const originalIndex = quotation.items.findIndex(i => i.line_id === item.line_id || i.orderNo === item.orderNo);
                  const specItems = parseSpecs(item.specs || item.description || '');
                  const hasPriceIssue = item.price == null;
                  
                  return (
                <tr key={item.line_id || item.orderNo} className={`${item.isIncomplete ? 'incomplete-row' : ''} ${hasPriceIssue ? 'no-price-row' : ''}`}>
                  <td className="col-num text-center">{item.orderNo}</td>
                  <td className="col-ordering">
                    {item.isIncomplete || !item.orderingNumber ? (
                      <button 
                        onClick={() => handleSearchProduct(originalIndex)}
                        className="search-product-btn"
                      >
                        Search Product
                      </button>
                    ) : (
                      <button
                        className="ordering-link"
                        onClick={() => navigate(`/product/${item.orderingNumber}`)}
                      >
                        {item.orderingNumber}
                      </button>
                    )}
                    {item.originalRequest && (
                      <div className="original-request-hint">
                        <span className="hint-label">Request:</span> {item.originalRequest}
                      </div>
                    )}
                  </td>
                  <td className="col-specs">
                    {specItems.length > 0 ? (
                      <ul className="spec-list-compact">
                        {specItems.map((spec, idx) => (
                          <li key={idx} className="spec-item-compact">{spec}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="no-specs">No specifications</span>
                    )}
                  </td>
                  <td className="col-qty">
                    <input 
                      type="number" 
                      value={item.quantity}
                      onChange={(e) => handleItemChange(originalIndex, 'quantity', Number(e.target.value))}
                      className="table-input text-center"
                      min="1"
                    />
                  </td>
                  <td className="col-price">
                    {hasPriceIssue ? (
                      <div className="price-missing">
                        <span className="price-missing-icon">⚠️</span>
                        <input 
                          type="number" 
                          value=""
                          onChange={(e) => handleItemChange(originalIndex, 'price', Number(e.target.value))}
                          className="table-input price-input-missing"
                          step="0.01"
                          placeholder="Set price"
                        />
                      </div>
                    ) : (
                      <input 
                        type="number" 
                        value={item.price}
                        onChange={(e) => handleItemChange(originalIndex, 'price', Number(e.target.value))}
                        className="table-input text-right"
                        step="0.01"
                      />
                    )}
                  </td>
                  <td className="col-margin">
                    <div className="margin-input-wrapper">
                      <input 
                        type="number" 
                        value={item.margin}
                        onChange={(e) => handleItemChange(originalIndex, 'margin', Number(e.target.value))}
                        className="table-input text-center"
                        min="0"
                        max="100"
                      />
                      <span className="margin-suffix">%</span>
                    </div>
                  </td>
                  <td className="col-final final-price text-right">
                    {hasPriceIssue ? (
                      <span className="price-tbd">TBD</span>
                    ) : (
                      <span>{quotation.currency} {calculateItemPrice(item).toFixed(2)}</span>
                    )}
                  </td>
                  <td className="col-files">
                    <div className="file-buttons">
                      <button
                        className={`file-btn-labeled ${item.sketchFile ? 'has-file' : 'no-file'}`}
                        onClick={() => item.orderingNumber && handleOpenPreview(item.orderingNumber, 'sketch')}
                        disabled={!item.orderingNumber || isPreviewLoading}
                        title={item.sketchFile ? 'View Sales Drawing' : 'No drawing available'}
                      >
                        <span className="file-icon">📄</span>
                        <span className="file-label">Drawing</span>
                      </button>
                      <button
                        className={`file-btn-labeled ${item.orderingNumber ? 'has-file' : 'no-file'}`}
                        onClick={() => item.orderingNumber && handleOpenPreview(item.orderingNumber, 'catalog')}
                        disabled={!item.orderingNumber || isPreviewLoading}
                        title="View Catalog Source"
                      >
                        <span className="file-icon">📖</span>
                        <span className="file-label">Catalog</span>
                      </button>
                    </div>
                  </td>
                  <td className="col-actions text-center">
                    <button 
                      onClick={() => handleRemoveItem(originalIndex)}
                      className="delete-btn"
                      title="Remove item"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M3 6H5H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M8 6V4C8 3.44772 8.44772 3 9 3H15C15.5523 3 16 3.44772 16 4V6M19 6V20C19 20.5523 18.5523 21 18 21H6C5.44772 21 5 20.5523 5 20V6H19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '8px'}}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Export ▼
            </button>
            <div className="export-menu">
              <button onClick={handleExportManufacturer}>Manufacturer Order List</button>
              <button onClick={handleExportERP}>ERP Input File</button>
              <button onClick={handleExportCustomerEmail}>Customer Email Template</button>
            </div>
          </div>
          <button onClick={handleFinalizeQuotation} className="btn-finalize">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '8px'}}><polyline points="20 6 9 17 4 12"></polyline></svg>
            Finalize Quotation
          </button>
        </div>
      </div>

      {/* Catalog/Drawing Preview Dialog */}
      <CatalogPreviewDialog
        isOpen={isPreviewOpen}
        onClose={handleClosePreview}
        catalogKey={previewFileKey || undefined}
        fileUrl={previewFileUrl || undefined}
        product={previewProduct || undefined}
        highlightTerm={previewProduct?.orderingNumber}
        title={previewType === 'sketch' ? 'Sales Drawing Preview' : 'Catalog Preview'}
      />
    </div>
  );
};

export default EditQuotation;

