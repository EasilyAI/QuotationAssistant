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

// Inline Editable Number Component with Fixed Size
const InlineEditableNumber = ({ value, onChange, placeholder, min, max, step = 1, suffix = '', className = '' }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => {
    setTempValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    onChange(tempValue);
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setTempValue(value);
      setIsEditing(false);
    }
  };

  const handleIncrement = () => {
    const newValue = (value || 0) + step;
    if (max === undefined || newValue <= max) {
      onChange(newValue);
    }
  };

  const handleDecrement = () => {
    const newValue = (value || 0) - step;
    if (min === undefined || newValue >= min) {
      onChange(newValue);
    }
  };

  return (
    <div className={`inline-number-with-stepper ${className}`}>
      <div 
        className={`number-value ${isEditing ? 'editing' : ''}`}
        onClick={() => !isEditing && setIsEditing(true)}
        title={!isEditing ? "Click to edit" : ""}
      >
        {isEditing ? (
          <input
            ref={inputRef}
            type="number"
            value={tempValue || ''}
            onChange={(e) => setTempValue(Number(e.target.value))}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            min={min}
            max={max}
            step={step}
            className="number-input-inline"
          />
        ) : (
          <span className="number-display">{value || value === 0 ? `${value}${suffix}` : placeholder}</span>
        )}
      </div>
      <div className="stepper-buttons-vertical">
        <button 
          className="stepper-btn-up" 
          onClick={handleIncrement}
          disabled={max !== undefined && value >= max}
          title="Increase"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
            <path d="M18 15L12 9L6 15" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button 
          className="stepper-btn-down" 
          onClick={handleDecrement}
          disabled={min !== undefined && value <= min}
          title="Decrease"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
            <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
};

// Inline Editable Price Component with better formatting
const InlineEditablePrice = ({ value, onChange, currency = 'USD', placeholder = 'Set price' }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  const inputRef = useRef(null);

  // Currency symbol mapping
  const getCurrencySymbol = (curr) => {
    const symbols = {
      'USD': '$',
      'EUR': '€',
      'GBP': '£',
      'ILS': '₪',
      'JPY': '¥'
    };
    return symbols[curr] || curr;
  };

  // Format price with proper decimals (only show if not .00)
  const formatPrice = (val) => {
    if (val == null || val === '') return null;
    const num = Number(val);
    // If it's a whole number, show no decimals, otherwise show up to 2
    if (Number.isInteger(num)) {
      return num.toString();
    }
    return num.toFixed(2).replace(/\.?0+$/, '');
  };

  useEffect(() => {
    setTempValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    onChange(tempValue);
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setTempValue(value);
      setIsEditing(false);
    }
  };

  const hasValue = value != null && value !== '';
  const isEmpty = !hasValue;
  const symbol = getCurrencySymbol(currency);
  const formattedPrice = formatPrice(value);

  if (isEditing) {
    return (
      <div className="inline-price-editing">
        <span className="price-currency">{symbol}</span>
        <input
          ref={inputRef}
          type="number"
          value={tempValue || ''}
          onChange={(e) => setTempValue(Number(e.target.value))}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          step="0.01"
          className="inline-price-input"
          placeholder="0.00"
        />
      </div>
    );
  }

  return (
    <div 
      className={`inline-price-display ${isEmpty ? 'empty' : ''}`}
      onClick={() => setIsEditing(true)}
      title={isEmpty ? 'Click to set price' : 'Click to edit price'}
    >
      {hasValue ? (
        <>
          <span className="currency-symbol">{symbol}</span>
          <span className="price-value">{formattedPrice}</span>
        </>
      ) : placeholder}
    </div>
  );
};

// Actions Menu Component
const ActionsMenu = ({ 
  onEditMetadata, 
  onPullPrices, 
  onApplyMargin, 
  onReturnToBatchSearch,
  onExportManufacturer,
  onExportERP,
  onExportCustomerEmail,
  globalMargin,
  setGlobalMargin,
  quotationId,
  incompleteCount
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleAction = (action) => {
    action();
    setIsOpen(false);
  };

  return (
    <div className="actions-menu-container" ref={menuRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className="btn-actions-menu"
        title="More actions"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="1" fill="currentColor"/>
          <circle cx="12" cy="5" r="1" fill="currentColor"/>
          <circle cx="12" cy="19" r="1" fill="currentColor"/>
        </svg>
      </button>
      
      {isOpen && (
        <div className="actions-menu-dropdown">
          <button onClick={() => handleAction(onEditMetadata)} className="menu-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M11 4H4C3.46957 4 2.96086 4.21071 2.58579 4.58579C2.21071 4.96086 2 5.46957 2 6V20C2 20.5304 2.21071 21.0391 2.58579 21.4142C2.96086 21.7893 3.46957 22 4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M18.5 2.50001C18.8978 2.10219 19.4374 1.87869 20 1.87869C20.5626 1.87869 21.1022 2.10219 21.5 2.50001C21.8978 2.89784 22.1213 3.4374 22.1213 4.00001C22.1213 4.56262 21.8978 5.10219 21.5 5.50001L12 15L8 16L9 12L18.5 2.50001Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Edit Quotation Info
          </button>
          
          <button 
            onClick={() => handleAction(onPullPrices)} 
            className="menu-item"
            disabled={!quotationId}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M21 12C21 16.9706 16.9706 21 12 21M21 12C21 7.02944 16.9706 3 12 3M21 12H3M12 21C7.02944 21 3 16.9706 3 12M12 21C13.6569 21 15 16.9706 15 12C15 7.02944 13.6569 3 12 3M12 21C10.3431 21 9 16.9706 9 12C9 7.02944 10.3431 3 12 3M3 12C3 7.02944 7.02944 3 12 3" stroke="currentColor" strokeWidth="2"/>
            </svg>
            Pull Prices from Catalog
          </button>

          <div className="menu-divider"></div>
          
          <div className="menu-item-with-input">
            <label>Apply Margin to All:</label>
            <div className="margin-input-group">
              <input 
                type="number" 
                value={globalMargin} 
                onChange={(e) => setGlobalMargin(Number(e.target.value))}
                className="margin-input-inline"
                placeholder="20"
                onClick={(e) => e.stopPropagation()}
              />
              <span>%</span>
              <button onClick={() => handleAction(onApplyMargin)} className="btn-apply-inline">
                Apply
              </button>
            </div>
          </div>

          {onReturnToBatchSearch && (
            <>
              <div className="menu-divider"></div>
              <button onClick={() => handleAction(onReturnToBatchSearch)} className="menu-item warning">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Return to Batch Search ({incompleteCount})
              </button>
            </>
          )}

          <div className="menu-divider"></div>
          <div className="menu-label">Export</div>
          
          <button 
            onClick={() => handleAction(onExportManufacturer)} 
            className="menu-item"
            disabled={!quotationId}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Manufacturer Order List
          </button>
          
          <button 
            onClick={() => handleAction(onExportERP)} 
            className="menu-item"
            disabled={!quotationId}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            ERP Input File
          </button>
          
          <button 
            onClick={() => handleAction(onExportCustomerEmail)} 
            className="menu-item"
            disabled={!quotationId}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Customer Email Template
          </button>
        </div>
      )}
    </div>
  );
};

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

  const [searchingIndex, setSearchingIndex] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearchProduct = (index) => {
    setSearchingIndex(index);
    setSearchQuery('');
  };

  const handleSearchSubmit = (index) => {
    if (!searchQuery.trim()) return;
    
    // Navigate to search with pre-filled query
    navigate('/search', { 
      state: { 
        returnTo: `/quotations/edit/${id}`,
        quotationIndex: index,
        initialQuery: searchQuery.trim()
      } 
    });
  };

  const handleSearchKeyDown = (e, index) => {
    if (e.key === 'Enter') {
      handleSearchSubmit(index);
    } else if (e.key === 'Escape') {
      setSearchingIndex(null);
      setSearchQuery('');
    }
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
      {/* Compact Header */}
      <div className="quotation-header-compact">
        <div className="header-left-section">
          <button onClick={handleBack} className="back-button-icon" title="Back to quotations">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div className="title-section">
            <h1 className="quotation-name">{quotation.quotationName || quotation.name}</h1>
            <div className="quotation-meta-compact">
              <span className="meta-item customer-name">
                {quotation.customer?.name || quotation.customer || 'No customer'}
              </span>
              {sourceInfo && (
                <>
                  <span className="meta-separator">•</span>
                  <span className="meta-item source-info">from {sourceInfo.replace('-', ' ')}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="header-right-section">
          <select 
            value={quotation.status} 
            onChange={(e) => handleStatusChange(e.target.value)}
            className="status-dropdown-compact"
            title="Change quotation status"
          >
          {Object.values(QuotationStatus).map(status => (
            <option key={status} value={status}>{status}</option>
          ))}
          </select>
          {hasUnsavedChanges && <span className="unsaved-dot" title="Unsaved changes">•</span>}
          <button onClick={handleSave} className="btn-save-compact" title="Save quotation">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H16L21 8V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M17 21V13H7V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M7 3V8H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Save
          </button>
          <ActionsMenu 
            onEditMetadata={handleEditMetadata}
            onPullPrices={handlePullPrices}
            onApplyMargin={handleApplyGlobalMargin}
            onReturnToBatchSearch={batchSearchAvailable && incompleteCount > 0 ? handleReturnToBatchSearch : null}
            onExportManufacturer={handleExportManufacturer}
            onExportERP={handleExportERP}
            onExportCustomerEmail={handleExportCustomerEmail}
            globalMargin={globalMargin}
            setGlobalMargin={setGlobalMargin}
            quotationId={quotation?.id}
            incompleteCount={incompleteCount}
          />
        </div>
      </div>

      {/* Compact Metrics Bar */}
      <div className="quotation-metrics-bar-compact">
        <button 
          className={`metric-inline ${filterType === 'all' ? 'active' : ''}`}
          onClick={() => setFilterType('all')}
        >
          <span className="metric-icon-inline">📋</span>
          <span className="metric-text">{quotation.items?.length || 0} items</span>
        </button>
        
        {noPriceCount > 0 && (
          <>
            <span className="metric-separator">|</span>
            <button 
              className={`metric-inline warning ${filterType === 'no-price' ? 'active' : ''}`}
              onClick={() => setFilterType(filterType === 'no-price' ? 'all' : 'no-price')}
            >
              <span className="metric-icon-inline">⚠️</span>
              <span className="metric-text">{noPriceCount} no price</span>
            </button>
          </>
        )}
        
        {noDrawingCount > 0 && (
          <>
            <span className="metric-separator">|</span>
            <button 
              className={`metric-inline info ${filterType === 'no-drawing' ? 'active' : ''}`}
              onClick={() => setFilterType(filterType === 'no-drawing' ? 'all' : 'no-drawing')}
            >
              <span className="metric-icon-inline">📄</span>
              <span className="metric-text">{noDrawingCount} no drawing</span>
            </button>
          </>
        )}
        
        {incompleteCount > 0 && (
          <>
            <span className="metric-separator">|</span>
            <button 
              className={`metric-inline danger ${filterType === 'incomplete' ? 'active' : ''}`}
              onClick={() => setFilterType(filterType === 'incomplete' ? 'all' : 'incomplete')}
            >
              <span className="metric-icon-inline">❌</span>
              <span className="metric-text">{incompleteCount} incomplete</span>
            </button>
          </>
        )}
        
        {filterType !== 'all' && (
          <>
            <span className="metric-separator">|</span>
            <button 
              onClick={() => setFilterType('all')}
              className="btn-clear-filter"
            >
              Clear Filter
            </button>
          </>
        )}
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
                <th className="col-price">Base Price</th>
                <th className="col-margin">Margin</th>
                <th className="col-unit-price">Unit Price</th>
                <th className="col-row-total">Row Total</th>
                <th className="col-actions-group">Actions</th>
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
                  const hasDrawingIssue = !item.sketchFile;
                  const isIncomplete = item.isIncomplete || !item.orderingNumber;
                  
                  // Determine row class based on issues (use left border instead of background)
                  let rowClass = '';
                  const issues = [];
                  if (hasPriceIssue) issues.push('no-price');
                  if (hasDrawingIssue) issues.push('no-drawing');
                  if (isIncomplete) issues.push('incomplete');
                  
                  if (issues.length > 0) {
                    rowClass = `row-with-issues ${issues.join(' ')}`;
                  }
                  
                  return (
                <tr key={item.line_id || item.orderNo} className={rowClass}>
                  <td className="col-num text-center">{item.orderNo}</td>
                  <td className="col-ordering">
                    {isIncomplete ? (
                      searchingIndex === originalIndex ? (
                        <div className="search-input-inline-wrapper">
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => handleSearchKeyDown(e, originalIndex)}
                            onBlur={() => {
                              if (!searchQuery.trim()) {
                                setSearchingIndex(null);
                              }
                            }}
                            placeholder="Type to search..."
                            className="search-input-inline"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSearchSubmit(originalIndex)}
                            className="search-submit-btn"
                            disabled={!searchQuery.trim()}
                            title="Search"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                              <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => handleSearchProduct(originalIndex)}
                          className="search-product-btn"
                          title="Click to search for a product"
                        >
                          Search Product
                        </button>
                      )
                    ) : (
                      <button
                        className="ordering-link"
                        onClick={() => navigate(`/product/${item.orderingNumber}`)}
                        title="View product details"
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
                    <InlineEditableNumber
                      value={item.quantity}
                      onChange={(val) => handleItemChange(originalIndex, 'quantity', val)}
                      min={1}
                      placeholder="1"
                      className="qty-editable"
                    />
                  </td>
                  <td className="col-price">
                    <InlineEditablePrice
                      value={item.price}
                      onChange={(val) => handleItemChange(originalIndex, 'price', val)}
                      currency={quotation.currency}
                      placeholder="Set price"
                    />
                  </td>
                  <td className="col-margin">
                    <InlineEditableNumber
                      value={item.margin}
                      onChange={(val) => handleItemChange(originalIndex, 'margin', val)}
                      min={0}
                      max={100}
                      suffix="%"
                      placeholder="0%"
                      className="margin-editable"
                    />
                  </td>
                  <td className="col-unit-price text-right">
                    {hasPriceIssue ? (
                      <span className="price-tbd">TBD</span>
                    ) : (
                      <span className="unit-price-display">
                        <span className="currency-symbol">{quotation.currency === 'USD' ? '$' : quotation.currency === 'EUR' ? '€' : quotation.currency === 'ILS' ? '₪' : quotation.currency}</span>
                        {' '}
                        <span className="price-value">{Number.isInteger(calculateItemPrice(item)) ? calculateItemPrice(item) : calculateItemPrice(item).toFixed(2).replace(/\.?0+$/, '')}</span>
                      </span>
                    )}
                  </td>
                  <td className="col-row-total text-right">
                    {hasPriceIssue ? (
                      <span className="price-tbd">TBD</span>
                    ) : (
                      <span className="row-total-display">
                        <span className="currency-symbol">{quotation.currency === 'USD' ? '$' : quotation.currency === 'EUR' ? '€' : quotation.currency === 'ILS' ? '₪' : quotation.currency}</span>
                        {' '}
                        <span className="price-value">{Number.isInteger(calculateItemPrice(item) * item.quantity) ? (calculateItemPrice(item) * item.quantity) : (calculateItemPrice(item) * item.quantity).toFixed(2).replace(/\.?0+$/, '')}</span>
                      </span>
                    )}
                  </td>
                  <td className="col-actions-group">
                    <div className="action-buttons-compact">
                      <button
                        className={`icon-btn preview-btn ${item.sketchFile ? 'has-file' : 'no-file'}`}
                        onClick={() => item.orderingNumber && handleOpenPreview(item.orderingNumber, 'sketch')}
                        disabled={!item.orderingNumber || isPreviewLoading}
                        title={item.sketchFile ? 'Click to view sales drawing' : 'No drawing available'}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <button
                        className={`icon-btn preview-btn ${item.orderingNumber ? 'has-file' : 'no-file'}`}
                        onClick={() => item.orderingNumber && handleOpenPreview(item.orderingNumber, 'catalog')}
                        disabled={!item.orderingNumber || isPreviewLoading}
                        title={item.orderingNumber ? 'Click to view catalog' : 'No catalog available'}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M6.5 2H20V22H6.5A2.5 2.5 0 0 1 4 19.5V4.5A2.5 2.5 0 0 1 6.5 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <button 
                        onClick={() => handleRemoveItem(originalIndex)}
                        className="icon-btn delete-btn-compact"
                        title="Delete this item"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <path d="M3 6H5H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M8 6V4C8 3.44772 8.44772 3 9 3H15C15.5523 3 16 3.44772 16 4V6M19 6V20C19 20.5523 18.5523 21 18 21H6C5.44772 21 5 20.5523 5 20V6H19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
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

      <div className="quotation-footer-slim">
        <div className="footer-financials">
          <span className="financial-mini">Subtotal: <strong>${Number.isInteger(financials.subtotal) ? financials.subtotal : financials.subtotal.toFixed(2).replace(/\.?0+$/, '')}</strong></span>
          <span className="financial-mini">Margin: <strong>${Number.isInteger(financials.marginTotal) ? financials.marginTotal : financials.marginTotal.toFixed(2).replace(/\.?0+$/, '')}</strong></span>
          <span className="financial-total">Total: <strong>${Number.isInteger(financials.total) ? financials.total : financials.total.toFixed(2).replace(/\.?0+$/, '')}</strong></span>
        </div>

        <div className="footer-actions">
          <button onClick={handleFinalizeQuotation} className="btn-finalize-slim" title="Finalize and send quotation">
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

