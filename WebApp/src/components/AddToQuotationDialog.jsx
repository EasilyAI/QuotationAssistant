import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { getQuotations } from '../services/quotationService';
import './AddToQuotationDialog.css';

const AddToQuotationDialog = ({
  open,
  onOpenChange,
  productName,
  orderingNo,
  onSelectQuotation,
  onCreateNew,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchQuotations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getQuotations({ limit: 100 });
      setQuotations(result.quotations || []);
    } catch (err) {
      setError(err.message || 'Failed to load quotations');
      setQuotations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch quotations when dialog opens
  useEffect(() => {
    if (open) {
      fetchQuotations();
    }
  }, [open, fetchQuotations]);

  const filteredQuotations = useMemo(() => {
    if (!searchQuery.trim()) {
      return quotations;
    }
    
    const query = searchQuery.toLowerCase();
    return quotations.filter(
      (q) =>
        q.name?.toLowerCase().includes(query) ||
        q.quotationNumber?.toLowerCase().includes(query) ||
        q.customer?.toLowerCase().includes(query)
    );
  }, [searchQuery, quotations]);

  const handleSelectQuotation = (quotationId) => {
    onSelectQuotation?.(quotationId);
    onOpenChange(false);
    setSearchQuery('');
  };

  const handleCreateNew = () => {
    onCreateNew?.();
    onOpenChange(false);
    setSearchQuery('');
  };

  if (!open) return null;

  return (
    <div className="dialog-overlay" onClick={() => onOpenChange(false)}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2 className="dialog-title">Add to Quotation</h2>
          {(() => {
            // Determine what to display - avoid showing orderingNo twice
            const showProductName = productName;
            const showOrderingNo = orderingNo && (!productName || (productName !== orderingNo && !productName.includes(orderingNo)));
            const showSeparator = showProductName && showOrderingNo;
            
            if (!showProductName && !showOrderingNo) return null;
            
            return (
              <p className="dialog-subtitle">
                {showProductName && <span>{productName}</span>}
                {showSeparator && <span> • </span>}
                {showOrderingNo && <span>{orderingNo}</span>}
              </p>
            );
          })()}
          <button 
            className="dialog-close"
            onClick={() => onOpenChange(false)}
          >
            ×
          </button>
        </div>

        <div className="dialog-body">
          {/* Search Input */}
          <div className="search-container">
            <div className="search-icon">🔍</div>
            <input
              type="text"
              placeholder="Search quotations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
              style={{ marginLeft: '18px' }}
            />
          </div>

          {/* Quotation List */}
          <div className="quotation-list">
            {loading && (
              <div className="no-results">
                Loading quotations...
              </div>
            )}
            {error && (
              <div className="no-results" style={{ color: '#d32f2f' }}>
                {error}
              </div>
            )}
            {!loading && !error && filteredQuotations.map((quotation, index) => (
              <button
                key={quotation.id}
                onClick={() => handleSelectQuotation(quotation.id)}
                className={`quotation-item ${index !== 0 ? 'quotation-item-border' : ''}`}
              >
                <div className="quotation-header">
                  <span className="quotation-name">{quotation.name}</span>
                  <span className={`quotation-status status-${quotation.status.replace(/ /g, '-')}`}>
                    {quotation.status.replace(/-/g, ' ').toUpperCase()}
                  </span>
                </div>
                <div className="quotation-details">
                  <span>{quotation.quotationNumber}</span>
                  <span>•</span>
                  <span>{quotation.customer}</span>
                  <span>•</span>
                  <span>{quotation.itemCount} items</span>
                  <span>•</span>
                  <span>{quotation.createdDate}</span>
                </div>
              </button>
            ))}

            {/* No Results Message */}
            {!loading && !error && filteredQuotations.length === 0 && searchQuery && (
              <div className="no-results">
                No quotations found matching "{searchQuery}"
              </div>
            )}

            {/* New Quotation Option */}
            <button
              onClick={handleCreateNew}
              className="create-new-quotation"
            >
              <div className="create-new-icon">+</div>
              <span>Create New Quotation</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddToQuotationDialog;
