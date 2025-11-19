import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

import { API_CONFIG } from '../config/apiConfig';
import { BoundingBox, CatalogProduct } from '../types/catalogProduct';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import './CatalogPreviewDialog.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

type CatalogPreviewDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  catalogKey?: string;
  fileUrl?: string;
  product?: CatalogProduct;
  title?: string;
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

const CatalogPreviewDialog = ({
  isOpen,
  onClose,
  catalogKey,
  fileUrl,
  product,
  title,
}: CatalogPreviewDialogProps) => {
  const [numPages, setNumPages] = useState<number>();
  const [currentPage, setCurrentPage] = useState<number>(DEFAULT_PAGE);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string>();
  const [viewMode, setViewMode] = useState<'single' | 'continuous'>('single');
  const [pageWidth, setPageWidth] = useState<number>();
  const contentRef = useRef<HTMLDivElement>(null);

  const previewUrl = useMemo(() => fileUrl ?? buildS3Url(catalogKey), [catalogKey, fileUrl]);
  const hasProductLocation = Boolean(product?.location?.page);
  const boundingBox = product?.location?.boundingBox;
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

  const handleDocumentLoadError = useCallback((err: Error) => {
    setError(err.message || 'Failed to load catalog preview');
  }, []);

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
                    {viewMode === 'single' && renderPage(currentPage, pageWidth, zoom, boundingBox, product)}
                    {viewMode === 'continuous' &&
                      continuousPages.map((pageNumber) =>
                        renderPage(pageNumber, pageWidth, zoom, boundingBox, product),
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
          {...pageSizeProps}
        />
        {highlight && (
          <div
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

