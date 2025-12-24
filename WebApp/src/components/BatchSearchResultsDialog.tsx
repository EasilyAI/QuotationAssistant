import React from 'react';
import './BatchSearchResultsDialog.css';

type BatchSearchResultsDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onReviewResults: () => void;
  summary: {
    total: number;
    found: number;
    notFound: number;
  };
  results?: Array<{
    itemIndex: number;
    query: string;
    matches: Array<any>;
  }>;
};

const BatchSearchResultsDialog: React.FC<BatchSearchResultsDialogProps> = ({
  isOpen,
  onClose,
  onReviewResults,
  summary,
  results = [],
}) => {
  if (!isOpen) {
    return null;
  }

  const successRate = summary.total > 0 
    ? Math.round((summary.found / summary.total) * 100) 
    : 0;

  // Get preview of first few results
  const previewResults = results.slice(0, 5);

  return (
    <div className="batch-search-dialog-overlay" role="dialog" aria-modal="true">
      <div className="batch-search-dialog-modal">
        <header className="batch-search-dialog-header">
          <div>
            <h2 className="batch-search-dialog-title">Batch Search Complete</h2>
            <p className="batch-search-dialog-subtitle">
              Processed {summary.total} item{summary.total !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            type="button"
            className="batch-search-dialog-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        </header>

        <div className="batch-search-dialog-body">
          {/* Summary Statistics */}
          <div className="batch-search-summary-stats">
            <div className="batch-search-stat-card success">
              <div className="batch-search-stat-icon">
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
              <div className="batch-search-stat-content">
                <div className="batch-search-stat-value">{summary.found}</div>
                <div className="batch-search-stat-label">Items with Matches</div>
              </div>
            </div>

            <div className="batch-search-stat-card warning">
              <div className="batch-search-stat-icon">
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
              <div className="batch-search-stat-content">
                <div className="batch-search-stat-value">{summary.notFound}</div>
                <div className="batch-search-stat-label">No Matches Found</div>
              </div>
            </div>

            <div className="batch-search-stat-card info">
              <div className="batch-search-stat-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M9 19C9 19.5304 9.21071 20.0391 9.58579 20.4142C9.96086 20.7893 10.4696 21 11 21H13C13.5304 21 14.0391 20.7893 14.4142 20.4142C14.7893 20.0391 15 19.5304 15 19V7H9V19ZM16 5V4C16 3.46957 15.7893 2.96086 15.4142 2.58579C15.0391 2.21071 14.5304 2 14 2H10C9.46957 2 8.96086 2.21071 8.58579 2.58579C8.21071 2.96086 8 3.46957 8 4V5H5V7H7V19C7 20.0304 7.46957 20.9609 8.21071 21.5858C8.95186 22.2107 9.97826 22.5 11 22.5H13C14.0217 22.5 15.0481 22.2107 15.7893 21.5858C16.5304 20.9609 17 20.0304 17 19V7H19V5H16Z"
                    fill="currentColor"
                  />
                </svg>
              </div>
              <div className="batch-search-stat-content">
                <div className="batch-search-stat-value">{successRate}%</div>
                <div className="batch-search-stat-label">Success Rate</div>
              </div>
            </div>
          </div>

          {/* Preview of Results */}
          {previewResults.length > 0 && (
            <div className="batch-search-preview">
              <h3 className="batch-search-preview-title">Preview of Results</h3>
              <div className="batch-search-preview-list">
                {previewResults.map((result) => (
                  <div key={result.itemIndex} className="batch-search-preview-item">
                    <div className="batch-search-preview-query">
                      <strong>Item {result.itemIndex + 1}:</strong> {result.query}
                    </div>
                    <div className="batch-search-preview-matches">
                      {result.matches && result.matches.length > 0 ? (
                        <span className="batch-search-preview-match-count">
                          {result.matches.length} match{result.matches.length !== 1 ? 'es' : ''} found
                        </span>
                      ) : (
                        <span className="batch-search-preview-no-matches">No matches</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {results.length > 5 && (
                <p className="batch-search-preview-more">
                  ... and {results.length - 5} more item{results.length - 5 !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="batch-search-dialog-footer">
          <button
            type="button"
            className="batch-search-dialog-button secondary"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="batch-search-dialog-button primary"
            onClick={onReviewResults}
          >
            Review Results
          </button>
        </footer>
      </div>
    </div>
  );
};

export default BatchSearchResultsDialog;

