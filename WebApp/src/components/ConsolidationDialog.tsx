import React from 'react';
import { Product } from '../types/products';
import { CatalogProduct } from '../types/catalogProduct';
import './ConsolidationDialog.css';

export type ConsolidationAction = 'replace' | 'keep';

export interface ConsolidationConflict {
  orderingNumber: string;
  existing: Product;
  new: CatalogProduct;
  action?: ConsolidationAction;
}

interface ConsolidationDialogProps {
  isOpen: boolean;
  conflicts: ConsolidationConflict[];
  onAction: (orderingNumber: string, action: ConsolidationAction) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConsolidationDialog: React.FC<ConsolidationDialogProps> = ({
  isOpen,
  conflicts,
  onAction,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const allActionsSelected = conflicts.every((c) => c.action);

  return (
    <div className="consolidation-dialog-backdrop">
      <div className="consolidation-dialog">
        <h2>Product Consolidation Required</h2>
        <p className="consolidation-dialog-description">
          The following products already exist in the system. Choose how to handle each conflict:
        </p>

        <div className="consolidation-conflicts-list">
          {conflicts.map((conflict) => (
            <div key={conflict.orderingNumber} className="consolidation-conflict-item">
              <div className="conflict-header">
                <h3>Ordering Number: {conflict.orderingNumber}</h3>
              </div>

              <div className="conflict-comparison">
                <div className="conflict-side existing">
                  <h4>Existing Product</h4>
                  <div className="product-preview">
                    <p>
                      <strong>Description:</strong>{' '}
                      {(() => {
                        const catalogProduct = conflict.existing.catalogProducts?.[0];
                        if (!catalogProduct) return '—';
                        // Check if it's a resolved product (has _fileId) or a pointer (has snapshot)
                        if ('_fileId' in catalogProduct) {
                          return catalogProduct.description || '—';
                        }
                        return (catalogProduct as any).snapshot?.description || '—';
                      })()}
                    </p>
                    <p>
                      <strong>Source:</strong>{' '}
                      {(() => {
                        const catalogProduct = conflict.existing.catalogProducts?.[0];
                        if (!catalogProduct) {
                          return conflict.existing.priceListPointers?.[0] 
                            ? `Price List (File: ${conflict.existing.priceListPointers[0].fileId})`
                            : '—';
                        }
                        // Check if it's a resolved product or a pointer
                        if ('_fileId' in catalogProduct) {
                          return catalogProduct._fileName || catalogProduct._fileId || '—';
                        }
                        return (catalogProduct as any).fileName || (catalogProduct as any).fileId || '—';
                      })()}
                    </p>
                    {(() => {
                      const catalogProduct = conflict.existing.catalogProducts?.[0];
                      if (!catalogProduct) return null;
                      
                      // Get specs from resolved product or pointer snapshot
                      const specs = ('_fileId' in catalogProduct)
                        ? catalogProduct.specs
                        : (catalogProduct as any).snapshot?.specs;
                      
                      if (!specs || Object.keys(specs).length === 0) return null;
                      
                      return (
                        <div className="specs-preview">
                          <strong>Specs:</strong>
                          <ul>
                            {Object.entries(specs)
                              .slice(0, 3)
                              .map(([key, value]) => (
                                <li key={key}>
                                  {String(key)}: {String(value)}
                                </li>
                              ))}
                            {Object.keys(specs).length > 3 && (
                              <li>
                                ... and{' '}
                                {Object.keys(specs).length - 3} more
                              </li>
                            )}
                          </ul>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div className="conflict-side new">
                  <h4>New Product</h4>
                  <div className="product-preview">
                    <p><strong>Description:</strong> {conflict.new.description || '—'}</p>
                    {conflict.new.specs && Object.keys(conflict.new.specs).length > 0 && (
                      <div className="specs-preview">
                        <strong>Specs:</strong>
                        <ul>
                          {Object.entries(conflict.new.specs).slice(0, 3).map(([key, value]) => (
                            <li key={key}>
                              {key}: {value}
                            </li>
                          ))}
                          {Object.keys(conflict.new.specs).length > 3 && (
                            <li>... and {Object.keys(conflict.new.specs).length - 3} more</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="conflict-actions">
                <button
                  className={`action-btn ${conflict.action === 'keep' ? 'selected' : ''}`}
                  onClick={() => onAction(conflict.orderingNumber, 'keep')}
                >
                  Keep Existing
                </button>
                <button
                  className={`action-btn ${conflict.action === 'replace' ? 'selected' : ''}`}
                  onClick={() => onAction(conflict.orderingNumber, 'replace')}
                >
                  Replace with New
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="consolidation-dialog-actions">
          <button className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={onConfirm}
            disabled={!allActionsSelected}
          >
            Confirm & Continue
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConsolidationDialog;

