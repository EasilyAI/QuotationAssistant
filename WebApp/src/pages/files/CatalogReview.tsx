import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBlocker, useBeforeUnload, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import CatalogPreviewDialog from '../../components/CatalogPreviewDialog';
import { CatalogProduct, CatalogProductStatus } from '../../types/catalogProduct';
import { getFileDownloadUrl, getFileProducts, updateFileProducts } from '../../services/fileInfoService';

import './CatalogReview.css';

type SpecItem = { key: string; value: string };

type ReviewProduct = CatalogProduct & {
  description: string;
  manualInput: string;
  specsList: SpecItem[];
  isReviewed: boolean;
  isSaved: boolean;
};

type PersistableProduct = Omit<ReviewProduct, 'specsList' | 'isSaved'>;
type PendingAction = 'cancel' | 'finish' | 'router' | null;
type RouterBlocker = ReturnType<typeof useBlocker>;

type CatalogReviewLocationState = {
  products?: CatalogProduct[];
  fileId?: string;
  fileKey?: string;
  fileUrl?: string;
  fileInfo?: { s3Key?: string } | null;
};

const PAGE_SIZE = 15;

const CatalogReview = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state ?? null) as CatalogReviewLocationState | null;
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const fileId = searchParams.get('fileId') || id || locationState?.fileId || undefined;

  const [products, setProducts] = useState<ReviewProduct[]>([]);
  const [expandedProduct, setExpandedProduct] = useState<number | null>(null);
  const [showUnreviewedOnly, setShowUnreviewedOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const [fileKey, setFileKey] = useState<string | null>(
    locationState?.fileKey ?? locationState?.fileInfo?.s3Key ?? null,
  );
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(locationState?.fileUrl ?? null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewProduct, setPreviewProduct] = useState<ReviewProduct | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewingProductId, setPreviewingProductId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState('');
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [blockedNavigation, setBlockedNavigation] = useState<RouterBlocker | null>(null);

  const loadSpecsList = useCallback((specs?: Record<string, string>): SpecItem[] => {
    if (!specs) {
      return [];
    }
    return Object.entries(specs).map(([key, value]) => ({
      key,
      value: String(value ?? ''),
    }));
  }, []);

  const reduceSpecsRecord = useCallback((specsList: SpecItem[]): Record<string, string> | undefined => {
    const record = specsList.reduce<Record<string, string>>((acc, spec) => {
      const trimmedKey = spec.key.trim();
      if (trimmedKey) {
        acc[trimmedKey] = spec.value;
      }
      return acc;
    }, {});

    return Object.keys(record).length ? record : undefined;
  }, []);

  const transformBackendProducts = useCallback(
    (backendProducts: CatalogProduct[]): ReviewProduct[] =>
      backendProducts.map((product, index) => {
        const specsList = loadSpecsList(product.specs);
        const safeId = Number(product.id ?? index + 1);

        return {
          ...product,
          id: safeId,
          orderingNumber: product.orderingNumber ?? '',
          description: product.description ?? '',
          manualInput: product.manualInput ?? '',
          specsList,
          specs: reduceSpecsRecord(specsList),
          isReviewed: product.status === CatalogProductStatus.Reviewed,
          isSaved: product.status === CatalogProductStatus.Reviewed,
        };
      }),
    [loadSpecsList, reduceSpecsRecord],
  );

  const buildPersistableProducts = useCallback(
    (items: ReviewProduct[]): PersistableProduct[] =>
      items.map((product) => {
        const normalizedSpecs = reduceSpecsRecord(product.specsList);
        const { specsList, isSaved, ...rest } = product;
        return {
          ...rest,
          specs: normalizedSpecs,
          status: product.isReviewed ? CatalogProductStatus.Reviewed : CatalogProductStatus.PendingReview,
        };
      }),
    [reduceSpecsRecord],
  );

  const applyLoadedProducts = useCallback(
    (backendProducts: CatalogProduct[]) => {
      const transformed = transformBackendProducts(backendProducts);
      setProducts(transformed);
      const snapshot = buildPersistableProducts(transformed);
      setLastSavedSnapshot(JSON.stringify(snapshot));
    },
    [buildPersistableProducts, transformBackendProducts],
  );

  const currentSnapshot = useMemo(
    () => JSON.stringify(buildPersistableProducts(products)),
    [buildPersistableProducts, products],
  );
  const hasUnsavedChanges = useMemo(
    () => currentSnapshot !== lastSavedSnapshot,
    [currentSnapshot, lastSavedSnapshot],
  );
  const routeBlocker = useBlocker(hasUnsavedChanges);

  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (!hasUnsavedChanges) {
          return;
        }
        event.preventDefault();
        event.returnValue = '';
      },
      [hasUnsavedChanges],
    ),
  );

  useEffect(() => {
    let isSubscribed = true;

    const loadProducts = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);

        if (locationState?.products?.length) {
          if (!isSubscribed) return;
          applyLoadedProducts(locationState.products);
          setIsLoading(false);
          return;
        }

        if (!fileId) {
          setLoadError('No file ID provided');
          setIsLoading(false);
          return;
        }

        const productsData = await getFileProducts(fileId);
        if (!isSubscribed) {
          return;
        }

        const backendProducts = (productsData.products ?? []) as CatalogProduct[];
        if (!backendProducts.length) {
          setLoadError('No products found for this file');
          setIsLoading(false);
          return;
        }

        applyLoadedProducts(backendProducts);
        if (productsData.sourceFile) {
          setFileKey((prev) => prev ?? productsData.sourceFile);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load products';
        if (isSubscribed) {
          setLoadError(message);
        }
      } finally {
        if (isSubscribed) {
          setIsLoading(false);
        }
      }
    };

    loadProducts();

    return () => {
      isSubscribed = false;
    };
  }, [applyLoadedProducts, fileId, locationState?.products]);

  useEffect(() => {
    setCurrentPage(1);
  }, [showUnreviewedOnly, products.length]);
  useEffect(() => {
    if (routeBlocker.state === 'blocked') {
      setBlockedNavigation(routeBlocker);
      setPendingAction('router');
      setShowUnsavedDialog(true);
    }
    if (routeBlocker.state === 'unblocked' && blockedNavigation) {
      setBlockedNavigation(null);
      if (pendingAction === 'router') {
        setPendingAction(null);
      }
    }
  }, [blockedNavigation, pendingAction, routeBlocker]);

  useEffect(() => {
    if (!saveSuccess) {
      return;
    }
    const timeoutId = window.setTimeout(() => setSaveSuccess(null), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [saveSuccess]);

  const updateProduct = useCallback((productId: number, updater: (product: ReviewProduct) => ReviewProduct) => {
    setProducts((prev) => prev.map((product) => (product.id === productId ? updater(product) : product)));
    setSaveSuccess(null);
  }, []);

  const handleSpecChange = (productId: number, specIndex: number, field: keyof SpecItem, value: string) => {
    updateProduct(productId, (product) => {
      const nextSpecs = product.specsList.map((spec, idx) =>
        idx === specIndex ? { ...spec, [field]: value } : spec,
      );
      return {
        ...product,
        specsList: nextSpecs,
        specs: reduceSpecsRecord(nextSpecs),
        isSaved: false,
      };
    });
  };

  const handleAddSpec = (productId: number) => {
    updateProduct(productId, (product) => {
      const nextSpecs = [...product.specsList, { key: '', value: '' }];
      return {
        ...product,
        specsList: nextSpecs,
        specs: reduceSpecsRecord(nextSpecs),
        isSaved: false,
      };
    });
  };

  const handleRemoveSpec = (productId: number, specIndex: number) => {
    updateProduct(productId, (product) => {
      const nextSpecs = product.specsList.filter((_, idx) => idx !== specIndex);
      return {
        ...product,
        specsList: nextSpecs,
        specs: reduceSpecsRecord(nextSpecs),
        isSaved: false,
      };
    });
  };

  const handleFieldChange = (productId: number, field: keyof ReviewProduct, value: string) => {
    updateProduct(productId, (product) => ({
      ...product,
      [field]: value,
      isSaved: false,
    }));
  };

  const handleSaveAll = useCallback(async (): Promise<boolean> => {
    if (!fileId) {
      setSaveError('Cannot save without a valid file ID.');
      return false;
    }
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      const payload = buildPersistableProducts(products);
      await updateFileProducts(fileId, payload);
      setLastSavedSnapshot(JSON.stringify(payload));
      setProducts((prev) =>
        prev.map((product) => ({
          ...product,
          isSaved: true,
          status: product.isReviewed ? CatalogProductStatus.Reviewed : product.status,
        })),
      );
      setSaveSuccess('All changes saved.');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save products';
      setSaveError(message);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [buildPersistableProducts, fileId, products]);

  const handleMarkAsReviewed = (productId: number) => {
    updateProduct(productId, (product) => ({
      ...product,
      isReviewed: true,
      isSaved: true,
      status: CatalogProductStatus.Reviewed,
    }));
    setTimeout(() => setExpandedProduct(null), 400);
  };

  const handleMarkAsUnreviewed = (productId: number) => {
    updateProduct(productId, (product) => ({
      ...product,
      isReviewed: false,
      isSaved: false,
      status: CatalogProductStatus.PendingReview,
    }));
  };

  const handleMarkAllAsReviewed = useCallback(() => {
    setProducts((prev) =>
      prev.map((product) => ({
        ...product,
        isReviewed: true,
        isSaved: true,
        status: CatalogProductStatus.Reviewed,
      })),
    );
    setSaveSuccess(null);
  }, []);

  const handleMarkAllAsUnreviewed = useCallback(() => {
    setProducts((prev) =>
      prev.map((product) => ({
        ...product,
        isReviewed: false,
        isSaved: false,
        status: CatalogProductStatus.PendingReview,
      })),
    );
    setSaveSuccess(null);
  }, []);

  const handleRemove = (productId: number) => {
    if (!window.confirm('Are you sure you want to remove this product?')) {
      return;
    }
    setProducts((prev) => prev.filter((product) => product.id !== productId));
    setSaveSuccess(null);
    if (expandedProduct === productId) {
      setExpandedProduct(null);
    }
  };

  const handleAddNewProduct = () => {
    const newProduct: ReviewProduct = {
      id: Date.now(),
      orderingNumber: '',
      description: '',
      manualInput: '',
      specsList: [{ key: '', value: '' }],
      specs: undefined,
      location: undefined,
      status: CatalogProductStatus.PendingReview,
      tindex: undefined,
      isReviewed: false,
      isSaved: false,
    };

    setProducts((prev) => {
      const updated = [...prev, newProduct];
      setCurrentPage(Math.ceil(updated.length / PAGE_SIZE));
      return updated;
    });
    setExpandedProduct(newProduct.id);
    setSaveSuccess(null);
  };

  const handleExpand = (productId: number) => {
    setExpandedProduct((prev) => (prev === productId ? null : productId));
  };

  const navigateBackToFiles = useCallback(() => {
    navigate('/files');
  }, [navigate]);

  const executeNavigationAction = useCallback(
    (action: PendingAction) => {
      if (!action || action === 'router') {
        return;
      }
      if (action === 'cancel') {
        navigateBackToFiles();
        return;
      }
      if (action === 'finish') {
        const unreviewedCount = products.filter((product) => !product.isReviewed).length;
        if (unreviewedCount > 0) {
          const shouldContinue = window.confirm(
            `${unreviewedCount} products are still unreviewed. Continue anyway?`,
          );
          if (!shouldContinue) {
            return;
          }
        }
        navigateBackToFiles();
      }
    },
    [navigateBackToFiles, products],
  );

  const continueBlockedNavigation = useCallback(
    (action: PendingAction) => {
      if (action === 'router') {
        if (blockedNavigation && blockedNavigation.state === 'blocked') {
          blockedNavigation.proceed();
          setBlockedNavigation(null);
        }
        return;
      }
      executeNavigationAction(action);
    },
    [blockedNavigation, executeNavigationAction],
  );

  const requestNavigation = useCallback(
    (action: PendingAction) => {
      if (!action) {
        return;
      }
      if (hasUnsavedChanges) {
        setPendingAction(action);
        setShowUnsavedDialog(true);
      } else {
        executeNavigationAction(action);
      }
    },
    [executeNavigationAction, hasUnsavedChanges],
  );

  const handleFinishReview = () => {
    requestNavigation('finish');
  };

  const handleCancel = () => {
    requestNavigation('cancel');
  };

  const handleDiscardChanges = () => {
    const action = pendingAction;
    setShowUnsavedDialog(false);
    setPendingAction(null);
    if (action) {
      continueBlockedNavigation(action);
    }
  };

  const handleSaveBeforeLeave = async () => {
    const success = await handleSaveAll();
    if (!success) {
      return;
    }
    const action = pendingAction;
    setShowUnsavedDialog(false);
    setPendingAction(null);
    if (action) {
      continueBlockedNavigation(action);
    }
  };

  const ensurePreviewUrl = useCallback(async (): Promise<string | null> => {
    if (filePreviewUrl) {
      return filePreviewUrl;
    }

    if (!fileKey) {
      setPreviewError('No source file available for preview.');
      return null;
    }

    setPreviewError(null);
    setIsPreviewLoading(true);
    try {
      const response = await getFileDownloadUrl(fileKey);
      if (!response?.url) {
        throw new Error('Missing download URL for this file.');
      }
      setFilePreviewUrl(response.url);
      return response.url;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to build preview URL. Please try again.';
      setPreviewError(message);
      return null;
    } finally {
      setIsPreviewLoading(false);
    }
  }, [fileKey, filePreviewUrl]);

  const handlePreview = useCallback(
    async (product: ReviewProduct) => {
      setPreviewingProductId(product.id);
      const url = await ensurePreviewUrl();
      if (url) {
        setPreviewProduct(product);
        setIsPreviewOpen(true);
      }
      setPreviewingProductId(null);
    },
    [ensurePreviewUrl],
  );

  const closePreview = () => {
    setIsPreviewOpen(false);
    setPreviewProduct(null);
  };

  const filteredProducts = useMemo(
    () => (showUnreviewedOnly ? products.filter((product) => !product.isReviewed) : products),
    [products, showUnreviewedOnly],
  );

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return filteredProducts.slice(startIndex, startIndex + PAGE_SIZE);
  }, [currentPage, filteredProducts]);

  const reviewedCount = useMemo(
    () => products.filter((product) => product.isReviewed).length,
    [products],
  );

  if (isLoading) {
    return (
      <div className="catalog-review-page">
        <div className="catalog-review-container">
          <div className="review-header">
            <div className="review-header-content">
              <h1 className="review-title">Catalog Product Review & Verification</h1>
              <p className="review-subtitle">Loading products...</p>
            </div>
          </div>
          <div className="table-loading-state">
            <svg
              className="spinner"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="#2188C9"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="32"
                strokeDashoffset="32"
              >
                <animate
                  attributeName="stroke-dasharray"
                  dur="2s"
                  values="0 32;16 16;0 32;0 32"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="stroke-dashoffset"
                  dur="2s"
                  values="0;-16;-32;-32"
                  repeatCount="indefinite"
                />
              </circle>
            </svg>
            <p>Loading products...</p>
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="catalog-review-page">
        <div className="catalog-review-container">
          <div className="review-header">
            <div className="review-header-content">
              <h1 className="review-title">Catalog Product Review & Verification</h1>
              <p className="review-subtitle">Error loading products</p>
            </div>
            <div className="review-header-actions">
              <button className="btn-secondary" onClick={() => navigate('/files')}>
                Back to Files
              </button>
            </div>
          </div>
          <div className="table-loading-state">
            <svg
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                stroke="#ef4444"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <h3>Failed to load products</h3>
            <p>{loadError}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="catalog-review-page">
      <div className="catalog-review-container">
        <div className="review-header">
          <div className="review-header-content">
            <h1 className="review-title">Catalog Product Review & Verification</h1>
            <p className="review-subtitle">Review and verify extracted product information</p>
          </div>
          <div className="review-header-actions">
            <button className="btn-secondary" onClick={handleCancel}>
              Cancel
            </button>
            <button
              className="btn-primary save-changes-btn"
              type="button"
              disabled={!hasUnsavedChanges || isSaving}
              onClick={() => {
                void handleSaveAll();
              }}
            >
              {isSaving ? 'Saving…' : 'Save Changes'}
            </button>
            <button className="btn-primary" onClick={handleFinishReview}>
              Finish Review
            </button>
          </div>
        </div>

        <div className="review-stats-bar">
          <div className="stats-info">
            <span className="stat-item">
              Total: <strong>{products.length}</strong>
            </span>
            <span className="stat-divider">|</span>
            <span className="stat-item">
              Reviewed: <strong>{reviewedCount}</strong>
            </span>
            <span className="stat-divider">|</span>
            <span className="stat-item">
              Pending: <strong>{products.length - reviewedCount}</strong>
            </span>
          </div>
          <div className="stats-right-section">
            <div className="stats-actions">
              <button
                className="stats-action-btn mark-all-reviewed-btn"
                type="button"
                onClick={handleMarkAllAsReviewed}
                title="Mark all products as reviewed"
              >
                Mark All Reviewed
              </button>
              <button
                className="stats-action-btn mark-all-unreviewed-btn"
                type="button"
                onClick={handleMarkAllAsUnreviewed}
                title="Mark all products as unreviewed"
              >
                Mark All Unreviewed
              </button>
            </div>
            <div className="filter-controls">
              <label className="filter-checkbox">
                <input
                  type="checkbox"
                  checked={showUnreviewedOnly}
                  onChange={(event) => setShowUnreviewedOnly(event.target.checked)}
                />
                <span>Show unreviewed only</span>
              </label>
            </div>
          </div>
        </div>

        {hasUnsavedChanges && (
          <div className="unsaved-changes-banner">
            <div className="unsaved-changes-content">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>You have unsaved changes</span>
            </div>
          </div>
        )}

        {(saveError || saveSuccess) && (
          <div className={`save-feedback ${saveError ? 'error' : 'success'}`}>
            {saveError || saveSuccess}
          </div>
        )}

        <div className="review-table-container">
          <div className="review-table">
            <div className="review-table-header">
              <div className="review-header-cell ordering-number">Ordering Number</div>
              <div className="review-header-cell description">Description</div>
              <div className="review-header-cell spec-summary">Specs</div>
              <div className="review-header-cell status-col">Status</div>
              <div className="review-header-cell actions">Actions</div>
            </div>

            <div className="review-table-body">
              {!paginatedProducts.length && (
                <div className="review-empty-state">
                  <p>No products to display.</p>
                </div>
              )}
              {paginatedProducts.map((product) => {
                const isExpanded = expandedProduct === product.id;
                const canPreview = Boolean(product.location?.page);

                return (
                  <div
                    key={product.id}
                    className={`review-table-row ${isExpanded ? 'expanded' : ''} ${
                      product.isSaved && product.isReviewed ? 'saved' : ''
                    }`}
                  >
                    <div className="row-collapsed" onClick={() => handleExpand(product.id)}>
                      <div className="review-cell ordering-number">
                        <span className="cell-value">{product.orderingNumber || '—'}</span>
                      </div>
                      <div className="review-cell description">
                        <span className="cell-value">{product.description || '—'}</span>
                      </div>
                      <div className="review-cell spec-summary">
                        <span className="spec-count">{product.specsList.length} specs</span>
                      </div>
                      <div className="review-cell status-col">
                        {product.isReviewed ? (
                          product.isSaved ? (
                            <span className="save-indicator">✓ Reviewed</span>
                          ) : (
                            <span className="reviewed-indicator">Reviewed</span>
                          )
                        ) : (
                          <span className="pending-indicator">Pending</span>
                        )}
                      </div>
                      <div className="review-cell actions" onClick={(event) => event.stopPropagation()}>
                        <button
                          className="action-btn-small preview-btn"
                          type="button"
                          disabled={!canPreview || isPreviewLoading || previewingProductId === product.id}
                          title={
                            canPreview
                              ? 'Open preview'
                              : 'Location data missing. Preview unavailable for this product.'
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            handlePreview(product);
                          }}
                        >
                          {previewingProductId === product.id ? 'Opening…' : 'Preview'}
                        </button>
                        <button
                          className="action-btn-small edit-btn"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleExpand(product.id);
                          }}
                        >
                          {isExpanded ? 'Collapse' : 'Edit'}
                        </button>
                        {product.isReviewed && product.isSaved ? (
                          <button
                            className="action-btn-small unreviewed-btn"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleMarkAsUnreviewed(product.id);
                            }}
                            title="Mark as unreviewed"
                          >
                            Unreviewed
                          </button>
                        ) : (
                          <button
                            className="action-btn-small reviewed-btn"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleMarkAsReviewed(product.id);
                            }}
                            title="Mark as reviewed"
                          >
                            Reviewed
                          </button>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="row-expanded">
                        <div className="expanded-content">
                          <div className="expanded-column-left">
                            <div className="expanded-field">
                              <label className="expanded-label">Ordering Number</label>
                              <input
                                type="text"
                                className="expanded-input"
                                value={product.orderingNumber}
                                onChange={(event) =>
                                  handleFieldChange(product.id, 'orderingNumber', event.target.value)
                                }
                              />
                            </div>

                            <div className="expanded-field">
                              <label className="expanded-label">Description</label>
                              <textarea
                                className="expanded-textarea"
                                rows={3}
                                value={product.description}
                                onChange={(event) =>
                                  handleFieldChange(product.id, 'description', event.target.value)
                                }
                              />
                            </div>

                            <div className="expanded-field">
                              <label className="expanded-label">Manual Input / Notes</label>
                              <textarea
                                className="expanded-textarea"
                                rows={8}
                                placeholder="Add notes or additional information..."
                                value={product.manualInput}
                                onChange={(event) =>
                                  handleFieldChange(product.id, 'manualInput', event.target.value)
                                }
                              />
                            </div>
                          </div>

                          <div className="expanded-column-right">
                            <div className="expanded-field">
                              <label className="expanded-label">Specifications</label>
                              <div className="spec-list">
                                {product.specsList.map((spec, idx) => (
                                  <div key={`${product.id}-spec-${idx}`} className="spec-item">
                                    <input
                                      type="text"
                                      className="spec-key-input"
                                      placeholder="Key"
                                      value={spec.key}
                                      onChange={(event) =>
                                        handleSpecChange(product.id, idx, 'key', event.target.value)
                                      }
                                    />
                                    <span className="spec-separator">:</span>
                                    <input
                                      type="text"
                                      className="spec-value-input"
                                      placeholder="Value"
                                      value={spec.value}
                                      onChange={(event) =>
                                        handleSpecChange(product.id, idx, 'value', event.target.value)
                                      }
                                    />
                                    <button
                                      className="remove-spec-btn"
                                      type="button"
                                      onClick={() => handleRemoveSpec(product.id, idx)}
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))}
                                <button className="add-spec-btn" type="button" onClick={() => handleAddSpec(product.id)}>
                                  + Add Spec
                                </button>
                              </div>
                            </div>

                            <div className="expanded-actions">
                              <button
                                className="btn-primary save-product-btn"
                                type="button"
                                onClick={() => handleMarkAsReviewed(product.id)}
                              >
                                Mark as Reviewed
                              </button>
                              <button
                                className="btn-secondary"
                                type="button"
                                onClick={() => handleRemove(product.id)}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {previewError && <div className="preview-error-banner">{previewError}</div>}

        <div className="review-pagination">
          <div className="pagination-info">
            Page {currentPage} of {totalPages}
          </div>
          <div className="review-pagination-controls">
            <button
              type="button"
              className="btn-secondary pagination-btn"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn-secondary pagination-btn"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Next
            </button>
          </div>
        </div>

        <div className="add-product-section">
          <button type="button" className="btn-secondary add-product-btn" onClick={handleAddNewProduct}>
            + Add New Product
          </button>
        </div>
      </div>
    </div>
    <CatalogPreviewDialog
      isOpen={isPreviewOpen}
      onClose={closePreview}
      catalogKey={fileKey ?? undefined}
      fileUrl={filePreviewUrl ?? undefined}
      product={previewProduct ?? undefined}
      highlightTerm={previewProduct?.orderingNumber}
      title="Original Document Preview"
    />
      {showUnsavedDialog && (
        <div className="unsaved-dialog-backdrop">
          <div className="unsaved-dialog">
            <h3>Unsaved Changes</h3>
            <p>You have unsaved changes. Save before leaving?</p>
            {saveError && <p className="dialog-error">{saveError}</p>}
            <div className="unsaved-dialog-actions">
              <button
                className="btn-secondary"
                type="button"
                onClick={handleDiscardChanges}
                disabled={isSaving}
              >
                Discard
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={() => {
                  void handleSaveBeforeLeave();
                }}
                disabled={isSaving}
              >
                {isSaving ? 'Saving…' : 'Save & Continue'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CatalogReview;
