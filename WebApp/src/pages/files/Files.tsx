import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import './Files.css';
import { getFiles, getFileDownloadUrl } from '../../services/fileInfoService';
import {
  DBFile,
  FileStatus,
  BusinessFileType,
} from '../../types/files';
import CatalogPreviewDialog from '../../components/CatalogPreviewDialog';

const IN_PROGRESS_PAGE_SIZE = 5;
const COMPLETED_PAGE_SIZE = 10;

type FilesApiResponse = {
  files?: DBFile[];
} | DBFile[];

const coerceTimestamp = (value?: number | string): number | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'number') {
    return value;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const normalizeStatus = (status?: FileStatus | string | null): FileStatus | null => {
  if (!status) {
    return null;
  }
  if (Object.values(FileStatus).includes(status as FileStatus)) {
    return status as FileStatus;
  }
  const normalized = status.toString().toLowerCase();
  const match = (Object.values(FileStatus) as string[]).find(
    (value) => value.toLowerCase() === normalized
  );
  return (match as FileStatus) ?? null;
};

const normalizeBusinessFileType = (value?: string): BusinessFileType | undefined => {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  const match = (Object.values(BusinessFileType) as string[]).find(
    (option) => option.toLowerCase() === normalized
  );
  return match as BusinessFileType | undefined;
};

const extractApiFiles = (payload: FilesApiResponse): DBFile[] => {
  const list = Array.isArray(payload) ? payload : payload?.files ?? [];
  return list
    .filter((file): file is DBFile => Boolean(file && (file as DBFile).fileId))
    .map((file) => ({
      ...file,
      businessFileType: normalizeBusinessFileType(
        (file as DBFile & { businessFileType?: string }).businessFileType
      ),
      status: normalizeStatus((file as DBFile).status),
      createdAt: coerceTimestamp((file as DBFile).createdAt),
      updatedAt: coerceTimestamp((file as DBFile).updatedAt),
      createdAtIso: typeof (file as DBFile).createdAtIso === 'string'
        ? (file as DBFile).createdAtIso
        : undefined,
      updatedAtIso: typeof (file as DBFile).updatedAtIso === 'string'
        ? (file as DBFile).updatedAtIso
        : undefined,
    }));
};

const formatDate = (isoDate?: string, fallbackTimestamp?: number): string => {
  if (isoDate) {
    const parsed = new Date(isoDate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString();
    }
  }
  if (fallbackTimestamp) {
    const parsed = new Date(fallbackTimestamp);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString();
    }
  }
  return '—';
};

const formatStatusLabel = (status?: FileStatus | null): string => status.replace('_'," ") ?? '';

const getProgress = (file: DBFile): number => {
  const productsCount = typeof file.productsCount === 'number' ? file.productsCount : undefined;
  const reviewedProductsCount = typeof file.reviewedProductsCount === 'number' ? file.reviewedProductsCount : undefined;

  if (productsCount && reviewedProductsCount) {
    return Math.round((reviewedProductsCount / productsCount) * 100);
  }
  if (file.status === FileStatus.COMPLETED) {
    return 100;
  }
  if (file.status === FileStatus.FAILED) {
    return 0;
  }
  return 0;
};

const formatFileName = (file: DBFile): string => {
  const rawName =
    file.displayName ||
    file.fileName ||
    file.metadata?.originalFileName ||
    file.uploadedFileName;
  if (!rawName) {
    return 'Untitled file';
  }
  return rawName;
};

const getBusinessFileTypeLabel = (file: DBFile): string => {
  if (file.businessFileType) {
    return file.businessFileType;
  }
  const possible = (file as DBFile & { businessFileType?: string }).businessFileType;
  return possible || '—';
};

const getProductCategoryLabel = (file: DBFile): string => {
  if (file.productCategory) {
    return file.productCategory;
  }
  const derived = (file as DBFile & { productCategory?: string }).productCategory;
  return derived || '—';
};

const paginate = <T,>(items: T[], page: number, pageSize: number) => {
  const totalItems = items.length;
  const totalPages = totalItems === 0 ? 1 : Math.ceil(totalItems / pageSize);
  const safePage = totalPages === 0 ? 1 : Math.min(Math.max(page, 1), totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  return {
    data: items.slice(startIndex, endIndex),
    totalItems,
    totalPages: totalPages === 0 ? 1 : totalPages,
    currentPage: safePage,
  };
};

const Files = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [files, setFiles] = useState<DBFile[]>([]);
  const [inProgressPage, setInProgressPage] = useState(1);
  const [completedPage, setCompletedPage] = useState(1);
  const [previewFile, setPreviewFile] = useState<DBFile | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const response = await getFiles();
        const normalizedFiles = extractApiFiles(response as FilesApiResponse);
        console.log('Files fetched:', normalizedFiles);
        setFiles(normalizedFiles);
      } catch (error: unknown) {
        console.error('Error fetching files:', error);
      }
    };
    fetchFiles(); 
  }, []);

  const inProgressUploads = useMemo(
    () =>
      files.filter(
        (file) => file.status !== FileStatus.COMPLETED && file.status !== FileStatus.FAILED
      ),
    [files]
  );

  const completedUploads = useMemo(
    () =>
      files.filter(
        (file) => file.status === FileStatus.COMPLETED || file.status === FileStatus.FAILED
      ),
    [files]
  );

  const filterUploads = (uploads: DBFile[]) => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return uploads.filter(upload => {
      const fileName = formatFileName(upload);
      const matchesSearch = !normalizedQuery || fileName.toLowerCase().includes(normalizedQuery);
      const categoryLabel = getProductCategoryLabel(upload).toLowerCase();
      const matchesCategory = !selectedCategory || categoryLabel === selectedCategory.toLowerCase();
      const createdAtYear = upload.createdAtIso
        ? new Date(upload.createdAtIso).getFullYear().toString()
        : upload.createdAt
          ? new Date(upload.createdAt).getFullYear().toString()
          : null;
      const matchesYear = !selectedYear || createdAtYear === selectedYear;
      return matchesSearch && matchesCategory && matchesYear;
    });
  };

  const filteredCompletedUploads = useMemo(
    () => filterUploads(completedUploads),
    [completedUploads, searchQuery, selectedCategory, selectedYear]
  );

  const paginatedInProgress = useMemo(
    () => paginate(inProgressUploads, inProgressPage, IN_PROGRESS_PAGE_SIZE),
    [inProgressUploads, inProgressPage]
  );

  const paginatedCompleted = useMemo(
    () => paginate(filteredCompletedUploads, completedPage, COMPLETED_PAGE_SIZE),
    [filteredCompletedUploads, completedPage]
  );

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(inProgressUploads.length / IN_PROGRESS_PAGE_SIZE));
    if (inProgressPage > maxPage) {
      setInProgressPage(maxPage);
    }
  }, [inProgressUploads.length, inProgressPage]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredCompletedUploads.length / COMPLETED_PAGE_SIZE));
    if (completedPage > maxPage) {
      setCompletedPage(maxPage);
    }
  }, [filteredCompletedUploads.length, completedPage]);

  useEffect(() => {
    setCompletedPage(1);
  }, [searchQuery, selectedCategory, selectedYear]);

  const handleUploadNew = () => {
    navigate('/files/upload');
  };

  const handleKeep = (id) => {
    console.log('Keep upload:', id);
  };

  const handleEdit = (id) => {
    navigate(`/files/review/${id}`);
  };

  const handleDelete = (id) => {
    console.log('Delete upload:', id);
  };

  const previewCatalogKey = useMemo(
    () => previewFile?.s3Key || previewFile?.key || '',
    [previewFile],
  );

  const closePreview = () => {
    setIsPreviewOpen(false);
    setPreviewFile(null);
    setPreviewUrl(null);
  };

  const handleView = async (file: DBFile) => {
    const key = file.s3Key || file.key;
    if (!key) {
      alert('This file does not have an S3 key yet.');
      return;
    }

    try {
      setIsLoadingPreview(true);
      const response = await getFileDownloadUrl(key);
      if (!response?.url) {
        throw new Error('Missing presigned URL');
      }
      setPreviewUrl(response.url);
      setPreviewFile(file);
      setIsPreviewOpen(true);
    } catch (error) {
      console.error('Failed to get preview URL', error);
      alert('Unable to open the preview right now. Please try again later.');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleDownload = (id) => {
    console.log('Download file:', id);
  };

  return (
    <div className="files-page">
      {/* Header */}
      <div className="files-header">
        <h1 className="files-title">Catalogs and Files</h1>
      </div>

      {/* Upload Button */}
      <div className="upload-section">
        <button className="btn-primary" onClick={handleUploadNew}>
          Upload new file
        </button>
      </div>

      {/* Uploads in Progress Section */}
      <div className="section-header">
        <h2 className="section-title">Uploads in progress</h2>
      </div>

      <div className="files-table-container">
        <div className="files-table">
          <div className="files-table-inner">
            {/* Table Header */}
            <div className="files-table-header">
              <div className="files-table-header-cell file-name">File Name</div>
              <div className="files-table-header-cell business-type">Business File Type</div>
              <div className="files-table-header-cell product-category">Product Category</div>
              <div className="files-table-header-cell created-at">Created at</div>
              <div className="files-table-header-cell status">Status</div>
              <div className="files-table-header-cell progress">Progress</div>
              <div className="files-table-header-cell actions">Actions</div>
            </div>

            {/* Table Body */}
            <div className="files-table-body">
              {inProgressUploads.length === 0 ? (
                <div className="empty-state">
                  <p className="empty-state-text">No uploads in progress</p>
                </div>
              ) : (
                paginatedInProgress.data.map(upload => (
                  <div key={upload.fileId} className="files-table-row">
                    <div className="files-table-cell file-name">
                      {formatFileName(upload)}
                    </div>
                    <div className="files-table-cell business-type">
                      {getBusinessFileTypeLabel(upload)}
                    </div>
                    <div className="files-table-cell product-category">
                      {getProductCategoryLabel(upload)}
                    </div>
                    <div className="files-table-cell created-at">
                      {formatDate(upload.createdAtIso, upload.createdAt)}
                    </div>
                    <div className="files-table-cell status">
                      <div className="status-tag">
                        {formatStatusLabel(upload.status)}
                      </div>
                    </div>
                    <div className="files-table-cell progress">
                      {upload.status !== FileStatus.COMPLETED && upload.status !== FileStatus.FAILED && (
                        <div className="progress-container">
                          <div className="progress-bar">
                            <div 
                              className="progress-fill" 
                              style={{ width: `${getProgress(upload)}%` }}
                            />
                          </div>
                          <span className="progress-text">
                            {getProgress(upload)}%
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="files-table-cell actions">
                      <div className="action-links-inline">
                        <button className="action-link" onClick={() => handleKeep(upload.fileId)}>Keep</button>
                        <span className="action-separator">|</span>
                        <button className="action-link" onClick={() => handleEdit(upload.fileId)}>Edit</button>
                        <span className="action-separator">|</span>
                        <button className="action-link" onClick={() => handleDelete(upload.fileId)}>Delete</button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      {paginatedInProgress.totalPages > 1 && (
        <div className="files-pagination">
          <button
            className="pagination-button"
            onClick={() => setInProgressPage(prev => Math.max(1, prev - 1))}
            disabled={paginatedInProgress.currentPage === 1}
          >
            Previous
          </button>
          <span className="pagination-info">
            Page {paginatedInProgress.currentPage} of {paginatedInProgress.totalPages}
          </span>
          <button
            className="pagination-button"
            onClick={() =>
              setInProgressPage(prev =>
                Math.min(paginatedInProgress.totalPages, prev + 1)
              )
            }
            disabled={paginatedInProgress.currentPage === paginatedInProgress.totalPages}
          >
            Next
          </button>
        </div>
      )}

      {/* All Catalogs Section */}
      <div className="section-header">
        <h2 className="section-title">All Catalogs</h2>
      </div>

      {/* Search Bar */}
      <div className="search-section">
        <div className="search-container">
          <div className="search-bar">
            <div className="search-icon-container">
              <svg className="search-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="#637887" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="search-input-container">
              <input 
                type="text" 
                className="search-input" 
                placeholder="Search by name"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-section">
        <button className="filter-tag" onClick={() => setSelectedCategory(selectedCategory ? null : 'valve')}>
          <span>Product Category</span>
          <svg className="filter-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 7.5L10 12.5L15 7.5" stroke="#121417" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button className="filter-tag" onClick={() => setSelectedYear(selectedYear ? null : '2024')}>
          <span>Year</span>
          <svg className="filter-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 7.5L10 12.5L15 7.5" stroke="#121417" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button className="filter-tag">
          <span>Sort by</span>
          <svg className="filter-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 7.5L10 12.5L15 7.5" stroke="#121417" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* All Catalogs Table */}
      <div className="files-table-container">
        <div className="files-table">
          <div className="files-table-inner">
            {/* Table Header */}
            <div className="files-table-header">
              <div className="files-table-header-cell file-name">File Name</div>
              <div className="files-table-header-cell business-type">Business File Type</div>
              <div className="files-table-header-cell product-category">Product Category</div>
              <div className="files-table-header-cell created-at">Created at</div>
              <div className="files-table-header-cell status">Status</div>
              <div className="files-table-header-cell actions">Actions</div>
            </div>

            {/* Table Body */}
            <div className="files-table-body">
              {filteredCompletedUploads.length === 0 ? (
                <div className="empty-state">
                  <p className="empty-state-text">No catalogs found</p>
                </div>
              ) : (
                paginatedCompleted.data.map(upload => (
                  <div key={upload.fileId} className="files-table-row">
                    <div className="files-table-cell file-name">{formatFileName(upload)}</div>
                    <div className="files-table-cell business-type">
                      {getBusinessFileTypeLabel(upload)}
                    </div>
                    <div className="files-table-cell product-category">
                      {getProductCategoryLabel(upload)}
                    </div>
                    <div className="files-table-cell created-at">
                      {formatDate(upload.createdAtIso, upload.createdAt)}
                    </div>
                    <div className="files-table-cell status">
                      <div className="status-tag">
                        {formatStatusLabel(upload.status)}
                      </div>
                    </div>
                    <div className="files-table-cell actions">
                      <div className="action-links-inline">
                        <button className="action-link" onClick={() => handleView(upload)}>View</button>
                        <span className="action-separator">|</span>
                        <button className="action-link" onClick={() => handleDownload(upload.fileId)}>Download</button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      {paginatedCompleted.totalPages > 1 && (
        <div className="files-pagination">
          <button
            className="pagination-button"
            onClick={() => setCompletedPage(prev => Math.max(1, prev - 1))}
            disabled={paginatedCompleted.currentPage === 1}
          >
            Previous
          </button>
          <span className="pagination-info">
            Page {paginatedCompleted.currentPage} of {paginatedCompleted.totalPages}
          </span>
          <button
            className="pagination-button"
            onClick={() =>
              setCompletedPage(prev =>
                Math.min(paginatedCompleted.totalPages, prev + 1)
              )
            }
            disabled={paginatedCompleted.currentPage === paginatedCompleted.totalPages}
          >
            Next
          </button>
        </div>
      )}
      <CatalogPreviewDialog
        isOpen={isPreviewOpen}
        onClose={closePreview}
        catalogKey={previewCatalogKey}
        fileUrl={previewUrl ?? undefined}
        title={previewFile ? formatFileName(previewFile) : undefined}
      />
    </div>
  );
};

export default Files;

