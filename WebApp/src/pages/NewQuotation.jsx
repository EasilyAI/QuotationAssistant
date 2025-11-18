import React, { useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { mockQuotations } from '../data/mockQuotations';
import { QuotationStatus } from '../types/index';
import './NewQuotation.css';

const NewQuotation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const isEditMode = id !== undefined;
  
  // Get items passed from single/multi search if any
  const initialItems = location.state?.items || [];
  const sourceInfo = location.state?.source;
  const batchSearchAvailable = location.state?.batchSearchAvailable || false;
  const existingMetadata = location.state?.metadata;

  // If editing, try to get existing quotation data
  const existingQuotation = isEditMode ? mockQuotations.find(q => q.id === id) : null;

  // Initialize form data based on mode
  const getInitialFormData = () => {
    if (existingMetadata) {
      // Data passed from EditQuotation
      return existingMetadata;
    } else if (existingQuotation) {
      // Data from mock quotations
      return {
        quotationName: existingQuotation.name,
        customer: existingQuotation.customer,
        currency: existingQuotation.currency,
        defaultMargin: existingQuotation.defaultMargin,
        notes: existingQuotation.notes,
        createdDate: existingQuotation.createdDate,
        status: existingQuotation.status
      };
    } else {
      // New quotation
      return {
        quotationName: '',
        customer: '',
        currency: 'USD',
        defaultMargin: 20,
        notes: '',
        createdDate: new Date().toISOString().split('T')[0],
        status: QuotationStatus.DRAFT
      };
    }
  };

  const [formData, setFormData] = useState(getInitialFormData());

  const [errors, setErrors] = useState({});

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: null
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.quotationName.trim()) {
      newErrors.quotationName = 'Quotation name is required';
    }
    
    if (!formData.customer.trim()) {
      newErrors.customer = 'Customer name is required';
    }
    
    if (formData.defaultMargin < 0 || formData.defaultMargin > 100) {
      newErrors.defaultMargin = 'Margin must be between 0 and 100';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    if (isEditMode) {
      // Editing existing quotation metadata - go back to edit page
      navigate(`/quotations/edit/${id}`, {
        state: {
          metadata: formData
        }
      });
    } else {
      // Creating new quotation - continue to items page
      navigate('/quotations/edit/new', {
        state: {
          metadata: formData,
          items: initialItems,
          source: sourceInfo,
          batchSearchAvailable: batchSearchAvailable
        }
      });
    }
  };

  const handleCancel = () => {
    if (isEditMode) {
      // If editing, go back to edit quotation page
      navigate(`/quotations/edit/${id}`);
    } else {
      // If creating new, confirm and go back to quotations list
      if (window.confirm('Are you sure you want to cancel? All entered data will be lost.')) {
        navigate('/quotations');
      }
    }
  };

  return (
    <div className="new-quotation-page">
      {/* Breadcrumbs */}
      <div className="breadcrumbs">
        <button onClick={() => navigate('/dashboard')} className="breadcrumb-link">Home</button>
        <span className="breadcrumb-separator">›</span>
        <button onClick={() => navigate('/quotations')} className="breadcrumb-link">Quotations</button>
        <span className="breadcrumb-separator">›</span>
        <span className="breadcrumb-current">{isEditMode ? 'Edit Information' : 'New Quotation'}</span>
        {sourceInfo && (
          <>
            <span className="breadcrumb-separator">•</span>
            <span className="breadcrumb-source">From {sourceInfo.replace('-', ' ')}</span>
          </>
        )}
      </div>

      <div className="new-quotation-content">
        <div className="form-header">
          <div className="header-left">
            <h1 className="page-title">{isEditMode ? 'Edit Quotation Information' : 'Create New Quotation'}</h1>
            <p className="page-subtitle">{isEditMode ? 'Update quotation details' : 'Enter quotation details to get started'}</p>
          </div>
          {!isEditMode && initialItems.length > 0 && (
            <div className="items-badge">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M9 11L12 14L22 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M21 12V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {initialItems.length} items ready to add
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="quotation-form">
          <div className="form-section">
            <h2 className="section-title">Basic Information</h2>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="quotationName" className="form-label required">
                  Quotation Name
                </label>
                <input
                  id="quotationName"
                  type="text"
                  value={formData.quotationName}
                  onChange={(e) => handleChange('quotationName', e.target.value)}
                  className={`form-input ${errors.quotationName ? 'error' : ''}`}
                  autoFocus
                />
                {errors.quotationName && (
                  <span className="error-message">{errors.quotationName}</span>
                )}
                <span className="form-hint">A descriptive name to identify this quotation</span>
              </div>

              <div className="form-group">
                <label htmlFor="customer" className="form-label required">
                  Customer Name
                </label>
                <input
                  id="customer"
                  type="text"
                  value={formData.customer}
                  onChange={(e) => handleChange('customer', e.target.value)}
                  className={`form-input ${errors.customer ? 'error' : ''}`}
                  placeholder="e.g., Acme Corp, John Smith"
                />
                {errors.customer && (
                  <span className="error-message">{errors.customer}</span>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="createdDate" className="form-label">
                  Date Created
                </label>
                <input
                  id="createdDate"
                  type="date"
                  value={formData.createdDate}
                  onChange={(e) => handleChange('createdDate', e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="status" className="form-label">
                  Initial Status
                </label>
                <select
                  id="status"
                  value={formData.status}
                  onChange={(e) => handleChange('status', e.target.value)}
                  className="form-select"
                >
                  {Object.values(QuotationStatus).map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h2 className="section-title">Pricing Settings</h2>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="currency" className="form-label">
                  Currency
                </label>
                <select
                  id="currency"
                  value={formData.currency}
                  onChange={(e) => handleChange('currency', e.target.value)}
                  className="form-select"
                >
                  <option value="USD">USD - US Dollar ($)</option>
                  <option value="EUR">EUR - Euro (€)</option>
                  <option value="GBP">GBP - British Pound (£)</option>
                  <option value="ILS">ILS - Israeli Shekel (₪)</option>
                  <option value="JPY">JPY - Japanese Yen (¥)</option>
                  <option value="CNY">CNY - Chinese Yuan (¥)</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="defaultMargin" className="form-label">
                  Default Margin (%)
                </label>
                <div className="input-with-suffix">
                  <input
                    id="defaultMargin"
                    type="number"
                    value={formData.defaultMargin}
                    onChange={(e) => handleChange('defaultMargin', Number(e.target.value))}
                    className={`form-input ${errors.defaultMargin ? 'error' : ''}`}
                    min="0"
                    max="100"
                    step="0.1"
                  />
                  <span className="input-suffix">%</span>
                </div>
                {errors.defaultMargin && (
                  <span className="error-message">{errors.defaultMargin}</span>
                )}
                <span className="form-hint">This margin will be applied to all items by default</span>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h2 className="section-title">Additional Information</h2>
            
            <div className="form-group full-width">
              <label htmlFor="notes" className="form-label">
                Notes
              </label>
              <textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                className="form-textarea"
                placeholder="Add any relevant notes about this quotation..."
                rows="4"
              />
            </div>
          </div>

          <div className="form-actions">
            <button type="button" onClick={handleCancel} className="btn-cancel">
              {isEditMode ? 'Cancel' : 'Cancel'}
            </button>
            <button type="submit" className="btn-submit">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                {isEditMode ? (
                  <>
                    <path d="M19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H16L21 8V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M17 21V13H7V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M7 3V8H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </>
                ) : (
                  <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                )}
              </svg>
              {isEditMode ? 'Save & Return' : 'Continue to Items'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewQuotation;

