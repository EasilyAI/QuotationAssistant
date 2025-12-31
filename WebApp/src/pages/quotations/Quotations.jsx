import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { QuotationStatus } from '../../types/index';
import { getQuotations, deleteQuotation } from '../../services/quotationService';
import './Quotations.css';

const Quotations = () => {
  const navigate = useNavigate();
  
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Prevent duplicate fetch in StrictMode
  const abortControllerRef = useRef(null);

  const statusLabels = Object.values(QuotationStatus).map(status => status);

  // Fetch quotations on mount and when filters change
  useEffect(() => {
    // Abort any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    const fetchQuotations = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await getQuotations({
          status: filterStatus === 'all' ? undefined : filterStatus,
          search: searchQuery || undefined,
          limit: 100
        });
        setQuotations(result.quotations || []);
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('Error fetching quotations:', err);
        setError(err.message || 'Failed to load quotations');
        setQuotations([]);
      } finally {
        setLoading(false);
      }
    };

    fetchQuotations();
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [filterStatus, searchQuery]);

  const filteredQuotations = quotations.filter(q => {
    const matchesSearch = !searchQuery || 
      q.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (q.customer && q.customer.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (q.quotationNumber && q.quotationNumber.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesSearch;
  });
  
  const statusCounts = { 
    all: quotations.length, 
    ...Object.values(QuotationStatus).reduce((acc, status) => ({ 
      ...acc, 
      [status]: quotations.filter(q => q.status === status).length 
    }), {}) 
  };

  const handleCreateNew = () => {
    navigate('/quotations/new');
  };

  const handleEditQuotation = (id) => {
    navigate(`/quotations/edit/${id}`);
  };

  const handleEditMetadata = (id) => {
    navigate(`/quotations/metadata/${id}`);
  };

  const handleDeleteQuotation = async (id) => {
    if (window.confirm('Are you sure you want to delete this quotation?')) {
      try {
        await deleteQuotation(id);
        // Remove from local state
        setQuotations(prev => prev.filter(q => q.id !== id));
      } catch (err) {
        console.error('Error deleting quotation:', err);
        alert(err.message || 'Failed to delete quotation');
      }
    }
  };

  return (
    <div className="quotations-page">
      <div className="quotations-content">
        {/* Header Section */}
        <div className="quotations-section header-section">
          <div className="header-content">
            <h1 className="page-title">Quotations</h1>
            <button onClick={handleCreateNew} className="btn-primary">
              New Quotation
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="quotations-section filters-section">
          <div className="search-box">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <input 
              type="text" 
              placeholder="Search quotations..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="quotations-section tabs-section">
          <div className="tabs-container">
            <button
              className={`tab ${filterStatus === 'all' ? 'active' : ''}`}
              onClick={() => setFilterStatus('all')}
            >
              All ({statusCounts.all})
            </button>
            <button
              className={`tab ${filterStatus === QuotationStatus.DRAFT ? 'active' : ''}`}
              onClick={() => setFilterStatus(QuotationStatus.DRAFT)}
            >
              Draft ({statusCounts[QuotationStatus.DRAFT]})
            </button>
            <button
              className={`tab ${filterStatus === QuotationStatus.IN_PROGRESS ? 'active' : ''}`}
              onClick={() => setFilterStatus(QuotationStatus.IN_PROGRESS)}
            >
              In Progress ({statusCounts[QuotationStatus.IN_PROGRESS]})
            </button>
            <button
              className={`tab ${filterStatus === QuotationStatus.AWAITING_APPROVAL ? 'active' : ''}`}
              onClick={() => setFilterStatus(QuotationStatus.AWAITING_APPROVAL)}
            >
              Awaiting Approval ({statusCounts[QuotationStatus.AWAITING_APPROVAL]})
            </button>
            <button
              className={`tab ${filterStatus === QuotationStatus.APPROVED ? 'active' : ''}`}
              onClick={() => setFilterStatus(QuotationStatus.APPROVED)}
            >
              Approved ({statusCounts[QuotationStatus.APPROVED]})
            </button>
            <button
              className={`tab ${filterStatus === QuotationStatus.ORDER ? 'active' : ''}`}
              onClick={() => setFilterStatus(QuotationStatus.ORDER)}
            >
              Order ({statusCounts[QuotationStatus.ORDER]})
            </button>
          </div>
        </div>

        {/* Quotations Table */}
        <div className="quotations-section table-section">
          <div className="table-wrapper">
            <table className="quotations-table">
              <thead>
                <tr>
                  <th className="col-quotation-name">Quotation Name</th>
                  <th className="col-customer">Customer</th>
                  <th className="col-items">Items</th>
                  <th className="col-value">Total Value</th>
                  <th className="col-status">Status</th>
                  <th className="col-created">Created</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" className="empty-cell">
                      <div className="empty-state">
                        <p>Loading quotations...</p>
                      </div>
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan="7" className="empty-cell">
                      <div className="empty-state">
                        <p style={{ color: 'red' }}>Error: {error}</p>
                      </div>
                    </td>
                  </tr>
                ) : filteredQuotations.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="empty-cell">
                      <div className="empty-state">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                          <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <p>No quotations found</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredQuotations.map((quotation) => (
                    <tr 
                      key={quotation.id} 
                      onClick={() => handleEditQuotation(quotation.id)}
                      className="clickable-row"
                    >
                      <td className="col-quotation-name">
                        <div className="quotation-name-cell">
                          <span className="quotation-name">{quotation.name}</span>
                        </div>
                      </td>
                      <td className="col-customer text-secondary">{quotation.customer}</td>
                      <td className="col-items text-secondary">{quotation.itemCount}</td>
                      <td className="col-value">{quotation.currency || 'USD'} {typeof quotation.totalValue === 'number' ? quotation.totalValue.toFixed(2) : (parseFloat(quotation.totalValue) || 0).toFixed(2)}</td>
                      <td className="col-status">
                        <div className={`status-badge status-${quotation.status.replace(/ /g, '-').toLowerCase()}`}>
                          {statusLabels[quotation.status] || quotation.status}
                        </div>
                      </td>
                      <td className="col-created text-secondary">{quotation.createdDate}</td>
                      <td className="col-actions">
                        <div className="action-links">
                          <button 
                            className="action-link"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditQuotation(quotation.id);
                            }}
                            data-tooltip="Update the quotation items"
                          >
                            Edit Items
                          </button>
                          <button 
                            className="action-link"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditMetadata(quotation.id);
                            }}
                            data-tooltip="Update the quotation info"
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                          </button>
                          <button 
                            className="action-link danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteQuotation(quotation.id);
                            }}
                            data-tooltip="Delete quotation"
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Quotations;
