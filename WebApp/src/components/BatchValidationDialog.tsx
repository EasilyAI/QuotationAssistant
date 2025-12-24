import React from 'react';
import './BatchValidationDialog.css';

type BatchValidationDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
  onCancel: () => void;
  validItems: Array<any>;
  invalidItems: Array<any>;
  fileName: string;
};

const BatchValidationDialog: React.FC<BatchValidationDialogProps> = ({
  isOpen,
  onClose,
  onContinue,
  onCancel,
  validItems,
  invalidItems,
  fileName,
}) => {
  if (!isOpen) {
    return null;
  }

  const totalItems = validItems.length + invalidItems.length;

  return (
    <div className="batch-validation-dialog-overlay" role="dialog" aria-modal="true">
      <div className="batch-validation-dialog-modal">
        <header className="batch-validation-dialog-header">
          <div>
            <h2 className="batch-validation-dialog-title">Excel File Validation</h2>
            <p className="batch-validation-dialog-subtitle">
              {fileName}
            </p>
          </div>
          <button
            type="button"
            className="batch-validation-dialog-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        </header>

        <div className="batch-validation-dialog-body">
          {/* Summary */}
          <div className="batch-validation-summary">
            <div className="batch-validation-summary-item success">
              <div className="batch-validation-summary-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="batch-validation-summary-content">
                <div className="batch-validation-summary-value">{validItems.length}</div>
                <div className="batch-validation-summary-label">Valid Rows</div>
              </div>
            </div>

            {invalidItems.length > 0 && (
              <div className="batch-validation-summary-item error">
                <div className="batch-validation-summary-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="batch-validation-summary-content">
                  <div className="batch-validation-summary-value">{invalidItems.length}</div>
                  <div className="batch-validation-summary-label">Invalid Rows</div>
                </div>
              </div>
            )}
          </div>

          {/* Invalid Items List with Row Representation */}
          {invalidItems.length > 0 && (
            <div className="batch-validation-errors">
              <h3 className="batch-validation-errors-title">Invalid Rows ({invalidItems.length})</h3>
              <div className="batch-validation-errors-list">
                {invalidItems.map((item, idx) => (
                  <div key={idx} className="batch-validation-error-item">
                    <div className="batch-validation-error-header">
                      <strong>Row {item.rowNumber}</strong>
                      <span className="batch-validation-row-preview">
                        {item.orderingNumber && `Ordering: ${item.orderingNumber}`}
                        {item.orderingNumber && item.description && ' • '}
                        {item.description && `Desc: ${item.description.substring(0, 40)}${item.description.length > 40 ? '...' : ''}`}
                        {!item.orderingNumber && !item.description && 'Empty row'}
                      </span>
                    </div>
                    <div className="batch-validation-error-details">
                      {item.errors && item.errors.map((error, errorIdx) => (
                        <div key={errorIdx} className="batch-validation-error-text">
                          • {error}
                        </div>
                      ))}
                      {item.warnings && item.warnings.map((warning, warnIdx) => (
                        <div key={warnIdx} className="batch-validation-warning-details">
                          <div>⚠ {warning}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warning Message */}
          {invalidItems.length > 0 && (
            <div className="batch-validation-warning">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <p>
                {validItems.length > 0
                  ? `Only ${validItems.length} of ${totalItems} rows are valid and will be searched. Invalid rows will be displayed but cannot be searched.`
                  : `No valid rows found. Please fix the errors and try again.`}
              </p>
            </div>
          )}
        </div>

        <footer className="batch-validation-dialog-footer">
          <button
            type="button"
            className="batch-validation-dialog-button secondary"
            onClick={onCancel}
          >
            Fix File & Try Again
          </button>
          {validItems.length > 0 && (
            <button
              type="button"
              className="batch-validation-dialog-button primary"
              onClick={onContinue}
            >
              Continue with {validItems.length} Valid Row{validItems.length !== 1 ? 's' : ''}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};

export default BatchValidationDialog;

