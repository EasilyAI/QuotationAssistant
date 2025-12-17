import React from 'react';
import './AutocompleteResults.css';

const AutocompleteResults = ({
  suggestions,
  loading,
  error,
  query,
  onSelectSuggestion,
  onOrderingNumberClick,
}) => {
  const renderHighlighted = (text) => {
    if (!text) return null;
    const trimmedQuery = (query || '').trim();
    if (!trimmedQuery) return text;

    const str = String(text);
    const lower = str.toLowerCase();
    const q = trimmedQuery.toLowerCase();
    const index = lower.indexOf(q);

    if (index === -1) return str;

    const before = str.slice(0, index);
    const match = str.slice(index, index + trimmedQuery.length);
    const after = str.slice(index + trimmedQuery.length);

    return (
      <>
        {before}
        <span className="match-highlight">{match}</span>
        {after}
      </>
    );
  };

  return (
    <div className="autocomplete-panel">
      {loading && <div className="autocomplete-status">Loading suggestions...</div>}
      {error && !loading && <div className="autocomplete-error">{error}</div>}
      {!loading && !error && (!suggestions || suggestions.length === 0) && (
        <div className="autocomplete-status">No suggestions</div>
      )}
      {!loading && !error && suggestions && suggestions.length > 0 && (
        <ul className="autocomplete-list">
          {suggestions.map((raw, index) => {
            const suggestion =
              typeof raw === 'object' && raw !== null ? raw : { searchText: String(raw) };

            const orderingNumber =
              suggestion.orderingNumber || suggestion.orderingNo || null;

            const category =
              suggestion.productCategory || suggestion.category || '—';

            const searchText =
              suggestion.displayText ||
              suggestion.productName ||
              suggestion.searchText ||
              suggestion.text ||
              orderingNumber ||
              '';

            return (
              <li
                key={orderingNumber || index}
                className="autocomplete-item"
                onClick={() => onSelectSuggestion(suggestion)}
              >
                <div className="autocomplete-row">
                  <div className="autocomplete-ordering">
                    {orderingNumber ? (
                      <button
                        type="button"
                        className="ordering-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOrderingNumberClick(orderingNumber);
                        }}
                      >
                        {orderingNumber}
                      </button>
                    ) : (
                      <span className="ordering-placeholder">—</span>
                    )}
                  </div>
                  <div className="autocomplete-category text-secondary">
                    {category}
                  </div>
                  <div
                    className="autocomplete-text"
                    title={searchText}
                  >
                    {renderHighlighted(searchText)}
                  </div>
                </div>
                {index < suggestions.length - 1 && (
                  <div className="autocomplete-divider" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default AutocompleteResults;


