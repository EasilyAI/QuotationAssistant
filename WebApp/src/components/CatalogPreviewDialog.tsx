import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

import { API_CONFIG } from '../config/apiConfig';
import { BoundingBox, CatalogProduct } from '../types/catalogProduct';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import './CatalogPreviewDialog.css';

// Configure PDF worker source
// Use local file from public folder - it's copied during build
// This avoids CDN issues and works reliably in both dev and production
// pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
// Use CDN-hosted worker to avoid any hosting rewrite issues
// pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
pdfjs.GlobalWorkerOptions.workerSrc =
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  type CatalogPreviewDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  catalogKey?: string;
  fileUrl?: string;
  product?: CatalogProduct;
  title?: string;
  highlightTerm?: string;
};

const DEFAULT_PAGE = 1;
const MIN_ZOOM = 0.75;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.25;

const buildS3Url = (key?: string): string => {
  if (!key) {
    return '';
  }

  if (/^https?:\/\//i.test(key)) {
    return key;
  }

  const sanitizedKey = key.replace(/^\/+/, '');
  const encodedKey = sanitizedKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `https://${API_CONFIG.S3_BUCKET}.s3.${API_CONFIG.S3_REGION}.amazonaws.com/${encodedKey}`;
};

const HIGHLIGHT_SPAN_SELECTOR = '.react-pdf__Page__textContent span';

const CatalogPreviewDialog = ({
  isOpen,
  onClose,
  catalogKey,
  fileUrl,
  product,
  title,
  highlightTerm,
}: CatalogPreviewDialogProps) => {
  const [numPages, setNumPages] = useState<number>();
  const [currentPage, setCurrentPage] = useState<number>(DEFAULT_PAGE);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string>();
  const [viewMode, setViewMode] = useState<'single' | 'continuous'>('single');
  const [pageWidth, setPageWidth] = useState<number>();
  const contentRef = useRef<HTMLDivElement>(null);
  const highlightAnchorRef = useRef<HTMLDivElement | null>(null);
  const hasCenteredRef = useRef(false);
  const highlightTimeoutRef = useRef<number | null>(null);
  const hasAutoScrolledRef = useRef(false);

  const previewUrl = useMemo(() => fileUrl ?? buildS3Url(catalogKey), [catalogKey, fileUrl]);
  const hasProductLocation = Boolean(product?.location?.page);
  const boundingBox = product?.location?.boundingBox;
  const normalizedHighlightTerm = highlightTerm?.trim().toLowerCase();
  const highlightBox = boundingBox;
  const highlightBoxKey = highlightBox
    ? `${highlightBox.left}-${highlightBox.top}-${highlightBox.width}-${highlightBox.height}`
    : 'none';
  const continuousPages = useMemo(
    () => (numPages ? Array.from({ length: numPages }, (_, index) => index + 1) : []),
    [numPages],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setCurrentPage(product?.location?.page ?? DEFAULT_PAGE);
    setZoom(1);
    setError(undefined);
    setViewMode('single');
  }, [isOpen, product?.location?.page]);

  useEffect(() => {
    if (!isOpen) {
      setNumPages(undefined);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const updateWidth = () => {
      if (!contentRef.current) {
        return;
      }
      const availableWidth = Math.max(contentRef.current.clientWidth - 32, 320);
      setPageWidth(Math.min(availableWidth, 1100));
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [isOpen]);

  const handleDocumentLoadSuccess = useCallback(
    ({ numPages: totalPages }: { numPages: number }) => {
      setNumPages(totalPages);

      if (hasProductLocation && product?.location?.page) {
        const clampedPage = Math.min(Math.max(product.location.page, DEFAULT_PAGE), totalPages);
        setCurrentPage(clampedPage);
      }
    },
    [hasProductLocation, product?.location?.page],
  );

  const formatErrorMessage = useCallback((error: Error | string): string => {
    let errorMessage = typeof error === 'string' ? error : error.message || '';
    
    // Strip out URLs from the error message to avoid showing technical details
    // Matches URLs like https://... or http://... with query parameters
    errorMessage = errorMessage.replace(/https?:\/\/[^\s"]+/gi, '');
    
    // Also remove common patterns like "while retrieving PDF" that come before URLs
    errorMessage = errorMessage.replace(/\s*while\s+retrieving\s+[^"]*"/gi, '');
    errorMessage = errorMessage.replace(/^["']|["']$/g, ''); // Remove leading/trailing quotes
    
    const lowerMessage = errorMessage.toLowerCase().trim();

    // Check for HTTP status codes first (most specific)
    if (lowerMessage.includes('(403)') || lowerMessage.includes('403') || /\(403\)/.test(errorMessage)) {
      return 'Access denied. The file preview link has expired. Please try again.';
    }
    
    if (lowerMessage.includes('(404)') || lowerMessage.includes('404') || /\(404\)/.test(errorMessage)) {
      return 'File not found. The file may have been moved or deleted.';
    }
    
    if (lowerMessage.includes('(500)') || lowerMessage.includes('500') || /\(500\)/.test(errorMessage)) {
      return 'Server error. Please try again later.';
    }

    // Check for access denied errors
    if (
      lowerMessage.includes('access denied') ||
      lowerMessage.includes('forbidden') ||
      lowerMessage.includes('accessdenied')
    ) {
      return 'Access denied. The file preview link has expired. Please try again.';
    }

    // Check for file not found errors
    if (
      lowerMessage.includes('not found') ||
      lowerMessage.includes('no such key') ||
      lowerMessage.includes('nosuchkey') ||
      lowerMessage.includes('key not found')
    ) {
      return 'File not found. The file may have been moved or deleted.';
    }

    // Check for "unexpected server response" errors
    if (lowerMessage.includes('unexpected server response')) {
      // Extract status code if present
      const statusMatch = errorMessage.match(/\((\d+)\)/);
      if (statusMatch) {
        const statusCode = statusMatch[1];
        if (statusCode === '403') {
          return 'Access denied. The file preview link has expired. Please try again.';
        }
        if (statusCode === '404') {
          return 'File not found. The file may have been moved or deleted.';
        }
        return `Server error (${statusCode}). Please try again.`;
      }
      return 'Server error. Please try again.';
    }

    // Check for network errors
    if (
      lowerMessage.includes('network') ||
      lowerMessage.includes('failed to fetch') ||
      lowerMessage.includes('networkerror')
    ) {
      return 'Network error. Please check your connection and try again.';
    }

    // Check for CORS errors
    if (lowerMessage.includes('cors') || lowerMessage.includes('cross-origin')) {
      return 'Unable to load preview due to security restrictions.';
    }

    // Check for invalid PDF errors
    if (
      lowerMessage.includes('invalid pdf') ||
      lowerMessage.includes('corrupted') ||
      lowerMessage.includes('damaged')
    ) {
      return 'The file appears to be corrupted or invalid.';
    }

    // Generic fallback - return a simple message without technical details
    return 'Unable to load preview. Please try again or contact support if the problem persists.';
  }, []);

  const handleDocumentLoadError = useCallback(
    (err: Error) => {
      // Log raw pdf.js error for debugging (network/CORS/HTTP details)
      // eslint-disable-next-line no-console
      console.error('PDF load error (raw):', err);
      const friendlyMessage = formatErrorMessage(err);
      setError(friendlyMessage);
    },
    [formatErrorMessage],
  );

  const goToPage = useCallback(
    (page: number) => {
      if (!numPages) return;
      const nextPage = Math.min(Math.max(page, DEFAULT_PAGE), numPages);
      setCurrentPage(nextPage);
    },
    [numPages],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!isOpen) return;

      if (viewMode === 'single') {
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          goToPage(currentPage + 1);
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          goToPage(currentPage - 1);
        }
      } else if (event.key === 'Escape') {
        onClose();
      }
    },
    [currentPage, goToPage, isOpen, onClose, viewMode],
  );

  useEffect(() => {
    if (!isOpen) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  const setHighlightAnchor = useCallback((node: HTMLDivElement | null) => {
    highlightAnchorRef.current = node;
  }, []);

  const highlightMatches = useCallback(() => {
    if (!contentRef.current) {
      return;
    }

    const spans = contentRef.current.querySelectorAll<HTMLSpanElement>(HIGHLIGHT_SPAN_SELECTOR);
    if (!spans.length) {
      return;
    }

    if (!normalizedHighlightTerm) {
      spans.forEach((span) => span.classList.remove('catalog-preview-text-highlight'));
      return;
    }

    let firstMatch: HTMLElement | null = null;
    spans.forEach((span) => {
      const text = span.textContent?.toLowerCase() ?? '';
      if (text.includes(normalizedHighlightTerm)) {
        span.classList.add('catalog-preview-text-highlight');
        if (!firstMatch) {
          firstMatch = span;
        }
      } else {
        span.classList.remove('catalog-preview-text-highlight');
      }
    });

    if (firstMatch && !hasAutoScrolledRef.current) {
      firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      hasAutoScrolledRef.current = true;
    }
  }, [normalizedHighlightTerm]);

  const scheduleHighlight = useCallback(() => {
    if (!isOpen) {
      return;
    }
    if (highlightTimeoutRef.current) {
      window.clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = window.setTimeout(() => {
      highlightMatches();
    }, 60);
  }, [highlightMatches, isOpen]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    hasCenteredRef.current = false;
    highlightAnchorRef.current = null;
    hasAutoScrolledRef.current = false;
  }, [product?.id, product?.location?.page, highlightBoxKey, normalizedHighlightTerm, isOpen]);

  useEffect(() => {
    if (!isOpen || normalizedHighlightTerm) {
      return;
    }
    const anchor = highlightAnchorRef.current;
    if (!anchor || hasCenteredRef.current) {
      return;
    }
    anchor.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    hasCenteredRef.current = true;
  }, [isOpen, currentPage, viewMode, zoom, previewUrl, highlightBoxKey, normalizedHighlightTerm]);

  useEffect(() => {
    if (!isOpen) {
      highlightMatches();
      return;
    }
    scheduleHighlight();
  }, [highlightMatches, scheduleHighlight, isOpen, normalizedHighlightTerm, currentPage, viewMode, zoom, previewUrl]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="catalog-preview-overlay" role="dialog" aria-modal="true">
      <div className="catalog-preview-modal">
        <header className="catalog-preview-header">
          <div>
            <p className="catalog-preview-eyebrow">{title || 'Catalog Preview'}</p>
            <h2 className="catalog-preview-title">{product?.orderingNumber || 'Document'}</h2>
            {product?.tindex !== undefined && (
              <p className="catalog-preview-meta">Table #{product.tindex + 1}</p>
            )}
          </div>
          <button type="button" className="catalog-preview-close" onClick={onClose} aria-label="Close preview">
            ×
          </button>
        </header>

        <div className="catalog-preview-toolbar">
          {viewMode === 'single' && (
            <div className="catalog-preview-controls">
              <button type="button" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}>
                Prev
              </button>
              <span>
                Page {currentPage}
                {numPages ? ` / ${numPages}` : ''}
              </span>
              <button
                type="button"
                onClick={() => goToPage(currentPage + 1)}
                disabled={Boolean(numPages) && currentPage >= (numPages ?? 0)}
              >
                Next
              </button>
            </div>
          )}

          <div className="catalog-preview-controls">
            <button type="button" onClick={() => setZoom((prev) => Math.max(prev - ZOOM_STEP, MIN_ZOOM))}>
              -
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((prev) => Math.min(prev + ZOOM_STEP, MAX_ZOOM))}>
              +
            </button>
          </div>

          <div className="catalog-preview-view-toggle">
            <button
              type="button"
              className={viewMode === 'single' ? 'active' : ''}
              onClick={() => setViewMode('single')}
              disabled={viewMode === 'single'}
            >
              Single Page
            </button>
            <button
              type="button"
              className={viewMode === 'continuous' ? 'active' : ''}
              onClick={() => setViewMode('continuous')}
              disabled={viewMode === 'continuous'}
            >
              Continuous
            </button>
          </div>
        </div>

        <div className="catalog-preview-body">
          {!catalogKey && !previewUrl && (
            <p className="catalog-preview-message">No catalog key provided.</p>
          )}
          {!previewUrl && catalogKey && (
            <p className="catalog-preview-message">Unable to build S3 URL for the given key.</p>
          )}
          {error && <p className="catalog-preview-message error">{error}</p>}

          {previewUrl && !error && (
            <>
              <div className="catalog-preview-message subtle">
                Preview only – the catalog stays in S3.
              </div>
              <div ref={contentRef} className="catalog-preview-content">
                <Document
                  file={previewUrl}
                  onLoadSuccess={handleDocumentLoadSuccess}
                  onLoadError={handleDocumentLoadError}
                  loading={<p className="catalog-preview-message">Loading catalog…</p>}
                >
                  <div className={`catalog-preview-document catalog-preview-document--${viewMode}`}>
                    {viewMode === 'single' &&
                      renderPage(
                        currentPage,
                        pageWidth,
                        zoom,
                        highlightBox,
                        product,
                        setHighlightAnchor,
                        scheduleHighlight,
                      )}
                    {viewMode === 'continuous' &&
                      continuousPages.map((pageNumber) =>
                        renderPage(
                          pageNumber,
                          pageWidth,
                          zoom,
                          highlightBox,
                          product,
                          setHighlightAnchor,
                          scheduleHighlight,
                        ),
                      )}
                  </div>
                </Document>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

function renderPage(
  pageNumber: number,
  pageWidth: number | undefined,
  zoom: number,
  boundingBox: BoundingBox | undefined,
  product?: CatalogProduct,
  highlightRefSetter?: (node: HTMLDivElement | null) => void,
  onTextLayerRender?: () => void,
) {
  const highlight = product?.location?.page === pageNumber ? boundingBox : undefined;
  const pageSizeProps: { width?: number; scale?: number } = pageWidth
    ? { width: Math.round(pageWidth * zoom) }
    : { scale: zoom };

  return (
    <div key={pageNumber} className="catalog-preview-page">
      <div className="catalog-preview-canvas">
        <Page
          pageNumber={pageNumber}
          renderTextLayer
          renderAnnotationLayer
          onRenderTextLayerSuccess={onTextLayerRender}
          {...pageSizeProps}
        />
        {highlight && (
          <div
            ref={highlightRefSetter}
            className="catalog-preview-highlight"
            style={{
              left: `${highlight.left * 100}%`,
              top: `${highlight.top * 100}%`,
              width: `${highlight.width * 100}%`,
              height: `${highlight.height * 100}%`,
            }}
          />
        )}
      </div>
    </div>
  );
}

export default CatalogPreviewDialog;

