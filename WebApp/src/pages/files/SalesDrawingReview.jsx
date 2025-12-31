import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getFileInfo, getFileDownloadUrl, completeFileReview, deleteFile } from '../../services/fileInfoService';
import { saveSalesDrawingToProduct, fetchProductByOrderingNumber, unlinkSalesDrawingFromProduct } from '../../services/productsService';
import { fetchAutocompleteSuggestions } from '../../services/searchService';
import CatalogPreviewDialog from '../../components/CatalogPreviewDialog';
import './SalesDrawingReview.css';

const SalesDrawingReview = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const fileId = searchParams.get('fileId') || id;

  const [fileInfo, setFileInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isLinking, setIsLinking] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [linkError, setLinkError] = useState(null);
  const [linkSuccess, setLinkSuccess] = useState(false);
  const [isProductLinked, setIsProductLinked] = useState(false);
  const [linkedProductOrderingNumber, setLinkedProductOrderingNumber] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Load file info on mount
  useEffect(() => {
    const loadFileInfo = async () => {
      if (!fileId) {
        setError('No file ID provided');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const fileData = await getFileInfo(fileId);
        setFileInfo(fileData);

        // Check if product exists (exact match by ordering number) and is linked
        const orderingNum = fileData.orderingNumber;
        if (orderingNum) {
          try {
            // Try to fetch the product (exact match)
            const product = await fetchProductByOrderingNumber(orderingNum);
            const salesDrawings = product?.salesDrawings || [];
            const isLinked = salesDrawings.some(sd => sd.fileId === fileId);
            if (isLinked) {
              setIsProductLinked(true);
              setLinkedProductOrderingNumber(orderingNum);
            } else {
              // Product exists but not linked
              setIsProductLinked(false);
              setLinkedProductOrderingNumber(null);
            }
          } catch (err) {
            // Product doesn't exist - not linked
            console.log('[SalesDrawingReview] Product not found:', err.message);
            setIsProductLinked(false);
            setLinkedProductOrderingNumber(null);
          }
        } else {
          // No ordering number in file - not linked
          setIsProductLinked(false);
          setLinkedProductOrderingNumber(null);
        }
      } catch (err) {
        console.error('[SalesDrawingReview] Error loading file info:', err);
        setError(err.message || 'Failed to load file information');
      } finally {
        setIsLoading(false);
      }
    };

    loadFileInfo();
  }, [fileId]);

  const orderingNumber = fileInfo?.orderingNumber || '';

  const handleSearchProduct = async (query) => {
    if (!query || !query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setLinkError(null);
    try {
      const response = await fetchAutocompleteSuggestions({
        query: query.trim(),
        size: 10 // Get more results for selection
      });
      
      setSearchResults(response.suggestions || []);
    } catch (err) {
      console.error('[SalesDrawingReview] Error searching products:', err);
      setSearchResults([]);
      setLinkError('Failed to search products. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleLinkToProduct = async (selectedOrderingNumber) => {
    if (!selectedOrderingNumber) {
      setLinkError('Ordering number is required');
      return;
    }

    try {
      setIsLinking(true);
      setLinkError(null);
      setLinkSuccess(false);

      // Link sales drawing to product
      await saveSalesDrawingToProduct(fileId, selectedOrderingNumber);
      
      // Update fileInfo ordering number
      if (fileInfo) {
        setFileInfo({ ...fileInfo, orderingNumber: selectedOrderingNumber });
      }
      
      setLinkSuccess(true);
      setIsProductLinked(true);
      setLinkedProductOrderingNumber(selectedOrderingNumber);
      setLinkError(null);
      setShowSearchDialog(false);
      setSearchResults([]);
      setSearchQuery('');
    } catch (err) {
      console.error('[SalesDrawingReview] Error linking to product:', err);
      setLinkError(err.message || 'Failed to link sales drawing to product');
      setLinkSuccess(false);
    } finally {
      setIsLinking(false);
    }
  };

  const handleCompleteReview = async () => {
    if (!isProductLinked) {
      setLinkError('Please link the sales drawing to a product first');
      return;
    }

    try {
      setIsCompleting(true);
      setError(null);

      await completeFileReview(fileId);
      
      // Navigate back to files list
      navigate('/files');
    } catch (err) {
      console.error('[SalesDrawingReview] Error completing review:', err);
      setError(err.message || 'Failed to complete review');
    } finally {
      setIsCompleting(false);
    }
  };

  const handleDeleteFile = async () => {
    try {
      setIsDeleting(true);
      setError(null);

      await deleteFile(fileId);
      
      // Navigate back to files list
      navigate('/files');
    } catch (err) {
      console.error('[SalesDrawingReview] Error deleting file:', err);
      setError(err.message || 'Failed to delete file');
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancel = () => {
    navigate('/files');
  };

  const handleSaveForLater = () => {
    // Just navigate back - file is already saved in DB
    navigate('/files');
  };

  const handleOpenPreview = async () => {
    // Regenerate preview URL to avoid expiration
    const s3Key = fileInfo?.key || fileInfo?.s3Key;
    if (s3Key) {
      setIsPreviewLoading(true);
      try {
        const downloadResponse = await getFileDownloadUrl(s3Key);
        setPreviewUrl(downloadResponse.url);
        setIsPreviewOpen(true);
      } catch (err) {
        console.error('[SalesDrawingReview] Failed to get preview URL:', err);
        setError('Failed to load preview. Please try again.');
      } finally {
        setIsPreviewLoading(false);
      }
    } else {
      setError('File key not found. Cannot generate preview.');
    }
  };

  const handleClosePreview = () => {
    setIsPreviewOpen(false);
  };

  if (isLoading) {
    return (
      <div className="sales-drawing-review-page">
        <div className="sales-drawing-review-container">
          <div className="loading-message">Loading file information...</div>
        </div>
      </div>
    );
  }

  if (error && !fileInfo) {
    return (
      <div className="sales-drawing-review-page">
        <div className="sales-drawing-review-container">
          <div className="error-message">{error}</div>
          <button className="btn-secondary" onClick={handleCancel}>
            Back to Files
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sales-drawing-review-page">
      <div className="sales-drawing-review-container">
        {/* Header */}
        <div className="review-header">
          <div className="review-header-content">
            <h1 className="review-title">Sales Drawing Review</h1>
            <p className="review-subtitle">Link sales drawing to product and complete review</p>
          </div>
          <div className="review-header-actions">
            <button 
              className="btn-danger" 
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete File'}
            </button>
            <button className="btn-secondary" onClick={handleSaveForLater}>
              Save for Later
            </button>
            <button 
              className="btn-primary" 
              onClick={handleCompleteReview}
              disabled={!isProductLinked || isCompleting}
            >
              {isCompleting ? 'Completing...' : 'Complete Review'}
            </button>
          </div>
        </div>

        {error && (
          <div className="error-banner">
            {error}
          </div>
        )}

        {linkError && (
          <div className="error-banner">
            {linkError}
          </div>
        )}


        <div className="drawing-review-layout">
          {/* Left Side - File Information */}
          <div className="drawing-form-section">
            <div className="form-section">
              <h3 className="section-title">File Information</h3>
              <div className="form-group">
                <label className="form-label">File Name</label>
                <div className="form-value">{fileInfo?.displayName || fileInfo?.uploadedFileName || 'N/A'}</div>
              </div>
              <div className="form-group">
                <label className="form-label">Ordering Number</label>
                <div className="form-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{orderingNumber || 'Not specified'}</span>
                  {isProductLinked && linkedProductOrderingNumber ? (
                    <span className="status-badge status-linked" style={{ 
                      backgroundColor: '#10b981', 
                      color: 'white', 
                      padding: '4px 8px', 
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '500'
                    }}>
                      ✓ Linked
                    </span>
                  ) : orderingNumber ? (
                    <span className="status-badge" style={{ 
                      backgroundColor: '#f59e0b', 
                      color: 'white', 
                      padding: '4px 8px', 
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '500'
                    }}>
                      Not Linked
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Year</label>
                <div className="form-value">{fileInfo?.year || 'Not specified'}</div>
              </div>
              {fileInfo?.notes && (
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <div className="form-value">{fileInfo.notes}</div>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Status</label>
                <div className="form-value">
                  <span className={`status-badge status-${fileInfo?.status || 'unknown'}`}>
                    {fileInfo?.status || 'Unknown'}
                  </span>
                  {isProductLinked && (
                    <span className="status-badge status-linked">Linked to Product</span>
                  )}
                </div>
              </div>
            </div>

            <div className="form-section">
              <h3 className="section-title">Actions</h3>
              {isProductLinked ? (
                <>
                  <button 
                    className="btn-secondary btn-block" 
                    onClick={async () => {
                      if (!linkedProductOrderingNumber) return;
                      try {
                        await unlinkSalesDrawingFromProduct(fileId, linkedProductOrderingNumber);
                        setIsProductLinked(false);
                        setLinkedProductOrderingNumber(null);
                        setLinkSuccess(false);
                        setLinkError(null);
                        // Update fileInfo
                        if (fileInfo) {
                          setFileInfo({ ...fileInfo, orderingNumber: '' });
                        }
                      } catch (err) {
                        console.error('[SalesDrawingReview] Error unlinking:', err);
                        setLinkError(err.message || 'Failed to unlink sales drawing');
                      }
                    }}
                    disabled={isLinking}
                  >
                    Unlink Product
                  </button>
                  <button 
                    className="btn-primary btn-block" 
                    onClick={() => {
                      setSearchQuery('');
                      setSearchResults([]);
                      setShowSearchDialog(true);
                    }}
                    disabled={isLinking}
                    style={{ marginTop: '8px' }}
                  >
                    Link to Different Product
                  </button>
                  <p className="help-text">
                    Currently linked to product: <strong>{linkedProductOrderingNumber}</strong>
                  </p>
                </>
              ) : (
                <>
                  <button 
                    className="btn-primary btn-block" 
                    onClick={() => {
                      setSearchQuery(orderingNumber || '');
                      setSearchResults([]);
                      setShowSearchDialog(true);
                    }}
                    disabled={isLinking}
                  >
                    Search & Link Product
                  </button>
                  <p className="help-text">
                    Search for a product to link this sales drawing to.
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Right Side - Drawing Preview */}
          <div className="drawing-preview-section">
            <div className="drawing-preview-header">
              <h3 className="section-title">Drawing Preview</h3>
              {fileInfo?.key || fileInfo?.s3Key ? (
                <button className="btn-primary" onClick={handleOpenPreview} disabled={isPreviewLoading}>
                  {isPreviewLoading ? 'Loading...' : 'Open Preview'}
                </button>
              ) : null}
            </div>
            <div className="drawing-preview-container">
              <div className="drawing-preview-placeholder">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="#637887" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 17L12 22L22 17" stroke="#637887" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 12L12 17L22 12" stroke="#637887" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <p>Technical Drawing Preview</p>
                <p className="preview-subtitle">Click "Open Preview" to view the drawing</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Search Product Dialog */}
      {showSearchDialog && (
        <div className="modal-overlay" onClick={() => {
          setShowSearchDialog(false);
          setSearchQuery('');
          setSearchResults([]);
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <h2 style={{ marginBottom: '16px' }}>Search & Link Product</h2>
            <p style={{ marginBottom: '20px', color: '#637887', fontSize: '14px' }}>
              Search for a product to link this sales drawing to. Type at least 3 characters to search.
            </p>
            
            <div style={{ marginBottom: '20px' }}>
              <label className="form-label" style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                Search for Product:
              </label>
              <input
                type="text"
                className="form-input"
                value={searchQuery}
                onChange={(e) => {
                  const value = e.target.value;
                  setSearchQuery(value);
                  if (value.trim().length >= 3) {
                    handleSearchProduct(value);
                  } else {
                    setSearchResults([]);
                  }
                }}
                placeholder="e.g. 6L-LDE-2H1P-A or product name"
                style={{ width: '100%', marginBottom: '12px' }}
                autoFocus
              />
              
              {isSearching && (
                <div style={{ marginBottom: '12px', color: '#637887', fontSize: '14px' }}>
                  Searching...
                </div>
              )}
              
              {searchResults.length > 0 && (
                <div style={{ marginBottom: '12px', maxHeight: '300px', overflowY: 'auto', border: '1px solid #e1e8ed', borderRadius: '4px' }}>
                  {searchResults.map((result, idx) => (
                    <div
                      key={idx}
                      onClick={(e) => {
                        e.preventDefault();
                        handleLinkToProduct(result.orderingNumber);
                      }}
                      style={{
                        padding: '12px',
                        cursor: 'pointer',
                        borderBottom: idx < searchResults.length - 1 ? '1px solid #e1e8ed' : 'none',
                        backgroundColor: '#fff',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f7f9fa'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff'}
                    >
                      <div style={{ fontWeight: '500', marginBottom: '4px' }}>
                        {result.orderingNumber}
                      </div>
                      {result.searchText && (
                        <div style={{ fontSize: '13px', color: '#637887' }}>
                          {result.searchText}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              {searchResults.length === 0 && searchQuery.trim().length >= 3 && !isSearching && (
                <div style={{ marginBottom: '12px', color: '#637887', fontSize: '14px' }}>
                  No products found. Try a different search term.
                </div>
              )}
              
              {searchQuery.trim().length < 3 && (
                <div style={{ marginBottom: '12px', color: '#637887', fontSize: '14px' }}>
                  Type at least 3 characters to search
                </div>
              )}
            </div>
            
            <div className="modal-actions" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button 
                className="btn-secondary" 
                onClick={() => {
                  setShowSearchDialog(false);
                  setSearchQuery('');
                  setSearchResults([]);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Delete File</h2>
            <p>Are you sure you want to delete this sales drawing file? This action cannot be undone.</p>
            {isProductLinked && (
              <p className="warning-text">
                <strong>Warning:</strong> This file is linked to a product. Deleting it will remove the link.
              </p>
            )}
            <div className="modal-actions">
              <button 
                className="btn-secondary" 
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button 
                className="btn-danger" 
                onClick={handleDeleteFile}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Dialog */}
      {isPreviewOpen && previewUrl && (
        <CatalogPreviewDialog
          isOpen={isPreviewOpen}
          onClose={handleClosePreview}
          fileUrl={previewUrl}
          title={fileInfo?.displayName || 'Sales Drawing Preview'}
        />
      )}
    </div>
  );
};

export default SalesDrawingReview;
