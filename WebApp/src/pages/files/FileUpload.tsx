import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './FileUpload.css';
import { uploadFileToS3, validateFile } from '../../services/s3UploadService';
import { pollFileStatus, getFileProducts, validateFileDoesNotExist } from '../../services/fileInfoService';
import { validateUploadForm } from '../../services/formValidationService';
import { 
  ProductCategory, 
  BusinessFileType,
  CatalogFormData,
  SalesDrawingFormData,
  PriceListFormData,
  ProcessingDetails,
  FileInfo,
  FileProductsResponse,
  FileValidationResult,
  FileUploadResponse
} from '../../types';

// Helper to map URL param to BusinessFileType enum
const getFileTypeFromParam = (param: string | null): BusinessFileType => {
  if (param === 'catalog') return BusinessFileType.Catalog;
  if (param === 'sales-drawing') return BusinessFileType.SalesDrawing;
  if (param === 'price-list') return BusinessFileType.PriceList;
  return BusinessFileType.Catalog;
};

// Helper to map BusinessFileType enum to URL param
const getParamFromFileType = (fileType: BusinessFileType): string => {
  if (fileType === BusinessFileType.Catalog) return 'catalog';
  if (fileType === BusinessFileType.SalesDrawing) return 'sales-drawing';
  if (fileType === BusinessFileType.PriceList) return 'price-list';
  return 'catalog';
};

const FileUpload = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fileTypeParam = searchParams.get('type');
  const fileType = useMemo(() => getFileTypeFromParam(fileTypeParam), [fileTypeParam]);

  // Helper to build a year list from current year down to 2000
  const getYearOptions = (): string[] => {
    const current = new Date().getFullYear();
    const start = 2000;
    const years: string[] = [];
    for (let y = current; y >= start; y -= 1) {
      years.push(y.toString());
    }
    return years;
  };

  // Initialize form data based on file type
  const getInitialFormData = (): CatalogFormData | SalesDrawingFormData | PriceListFormData => {
    const year = new Date().getFullYear().toString();
    
    switch (fileType) {
      case BusinessFileType.Catalog:
        return {
          fileType: BusinessFileType.Catalog,
          fileName: '',
          productCategory: ProductCategory.VALVE,
          catalogSerialNumber: '',
          description: '',
          onlineLink: '',
          year,
        };
      case BusinessFileType.SalesDrawing:
        return {
          fileType: BusinessFileType.SalesDrawing,
          fileName: '',
          orderingNumber: '',
          SwagelokLink: '',
          year,
          notes: '',
        };
      case BusinessFileType.PriceList:
        return {
          fileType: BusinessFileType.PriceList,
          fileName: '',
          year,
          description: '',
        };
      default:
        return {
          fileType: BusinessFileType.Catalog,
          fileName: '',
          productCategory: ProductCategory.VALVE,
          catalogSerialNumber: '',
          description: '',
          onlineLink: '',
          year,
        };
    }
  };

  const [formData, setFormData] = useState<CatalogFormData | SalesDrawingFormData | PriceListFormData>(() => {
    return getInitialFormData();
  });
  
  // Reset form data when file type changes
  useEffect(() => {
    setFormData(getInitialFormData());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileType]);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<boolean>(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [processingDetails, setProcessingDetails] = useState<ProcessingDetails | null>(null);
  const [showCompletionModal, setShowCompletionModal] = useState<boolean>(false);
  const [completionData, setCompletionData] = useState<{
    fileInfo: FileInfo;
    productsData: FileProductsResponse;
    fileId: string;
    fileKey: string;
    fileUrl: string;
    paramType: string;
  } | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    // Map field names to formData field names and normalize filename to lowercase
    let fieldName = name;
    let fieldValue = value;
    
    // Map catalogName and drawingName to fileName
    if (name === 'catalogName' || name === 'drawingName') {
      fieldName = 'fileName';
    }

    // Map catalogDescription textarea to the shared description field
    if (name === 'catalogDescription') {
      fieldName = 'description';
    }
    
    // Normalize filename to lowercase
    if (fieldName === 'fileName') {
      fieldValue = value.toLowerCase();
    }
    
    setFormData(prev => ({
      ...prev,
      [fieldName]: fieldValue
    }));
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file before setting
      const validation = validateFile(file, fileType);
      if (!validation.valid) {
        setUploadError(validation.error || 'Invalid file');
        return;
      }
      setSelectedFile(file);
      setUploadError(null);
      setUploadSuccess(false);
      
      // Auto-populate file name and catalog serial number if not already set
      setFormData(prev => {
        const updates: any = {};
        
        // Auto-populate file name if not already set (normalize to lowercase)
        if (!prev.fileName) {
          updates.fileName = file.name.toLowerCase();
        }
        
        // Auto-populate catalog serial number if file type is Catalog and field is empty
        if (fileType === BusinessFileType.Catalog && 
            (prev as CatalogFormData).catalogSerialNumber === '') {
          // Extract filename without extension and convert to uppercase
          const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
          updates.catalogSerialNumber = fileNameWithoutExt.toUpperCase();
        }
        
        if (Object.keys(updates).length > 0) {
          return {
            ...prev,
            ...updates
          };
        }
        return prev;
      });
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      // Validate file before setting
      const validation: FileValidationResult = validateFile(file, fileType);
      if (!validation.valid) {
        setUploadError(validation.error || 'Invalid file');
        return;
      }
      setSelectedFile(file);
      setUploadError(null);
      setUploadSuccess(false);
      
      // Auto-populate file name and catalog serial number if not already set
      setFormData(prev => {
        const updates: any = {};
        
        // Auto-populate file name if not already set (normalize to lowercase)
        if (!prev.fileName) {
          updates.fileName = file.name.toLowerCase();
        }
        
        // Auto-populate catalog serial number if file type is Catalog and field is empty
        if (fileType === BusinessFileType.Catalog && 
            (prev as CatalogFormData).catalogSerialNumber === '') {
          // Extract filename without extension and convert to uppercase
          const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
          updates.catalogSerialNumber = fileNameWithoutExt.toUpperCase();
        }
        
        if (Object.keys(updates).length > 0) {
          return {
            ...prev,
            ...updates
          };
        }
        return prev;
      });
    }
  };

  const handleCancel = () => {
    navigate('/files');
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadError('Please select a file to upload');
      return;
    }

    // Validate file again before upload
    const fileValidation: FileValidationResult = validateFile(selectedFile, fileType);
    if (!fileValidation.valid) {
      setUploadError(fileValidation.error || 'Invalid file');
      return;
    }

    // Validate form data
    const formValidation: FileValidationResult = validateUploadForm(formData, fileType);
    if (!formValidation.valid) {
      setUploadError(formValidation.error || 'Please fill in all required fields');
      return;
    }

    // TODO: Validate with backend ordering number / file name already exists.
    // const backEndValidation: FileValidationResult = await validateWithBackend(formData, fileType);
    // if (!backEndValidation.valid) {
    //   setUploadError(backEndValidation.error || 'Ordering number / file name already exists');
    //   return;
    // }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    setUploadSuccess(false);
    setProcessingStatus('');
    setProcessingDetails(null);

    try {
      // Normalize filename to lowercase before validation and upload
      const normalizedFormData = {
        ...formData,
        fileName: formData.fileName.toLowerCase()
      };
      setFormData(normalizedFormData);

      // Step 0: Check if file already exists in S3
      const fileValidation = await validateFileDoesNotExist(normalizedFormData, fileType);
      if (!fileValidation.valid) {
        console.warn('[FileUpload] Upload blocked because file already exists or backend validation failed', {
          fileType,
          error: fileValidation.error,
        });
        setUploadError(fileValidation.error || 'File already exists');
        setIsUploading(false);
        return;
      }

      // Step 1: Upload file to S3
      console.log('Uploading file to S3...');
      const uploadResponse: FileUploadResponse = await uploadFileToS3(
        normalizedFormData,
        selectedFile,
        fileType,
        (progress: number) => {
          setUploadProgress(progress);
        }
      );

      const { fileKey, fileUrl, fileId } = uploadResponse;

      setUploadProgress(100);
      setUploadSuccess(true);
      setIsUploading(false);
      
      // Step 2: Poll for processing status
      console.log('File uploaded successfully, polling for processing status...');
      setIsProcessing(true);
      setProcessingStatus('File uploaded, starting processing...');
      
      const fileInfo: FileInfo = await pollFileStatus(
        fileId,
        (status: string, info: any) => {
          console.log('Status update:', status, info);
          
          // Update processing status message based on file type
          const catalogStatusMessages: Record<string, string> = {
            'textract_started': 'Starting document analysis...',
            'textract_processing': `Analyzing document. ${info.processingStage || ''}`,
            'textract_completed': 'Document analysis completed',
            'parsing_tables': `Extracting tables. ${info.processingStage || ''}`,
            'saving_products': `Saving products to database...`,
            'pending_review': 'Processing completed!',
            'completed': 'Processing completed!'
          };
          
          const priceListStatusMessages: Record<string, string> = {
            'processing': 'Starting price list processing...',
            'validating_schema': 'Validating file schema...',
            'processing_rows': `Processing rows. ${info.processingStage || ''}`,
            'saving_products': `Saving products to database...`,
            'pending_review': 'Processing completed!',
            'pending_review_with_errors': 'Processing completed with some validation errors',
            'completed': 'Processing completed!'
          };
          
          const salesDrawingStatusMessages: Record<string, string> = {
            'pending_upload': 'Preparing upload...',
            'pending_review': 'Upload completed! Ready for review.',
            'completed': 'Upload completed!'
          };
          
          const statusMessages = fileType === BusinessFileType.PriceList 
            ? priceListStatusMessages 
            : fileType === BusinessFileType.SalesDrawing
            ? salesDrawingStatusMessages
            : catalogStatusMessages;
          
          setProcessingStatus(statusMessages[status] || info.processingStage || 'Processing...');
          
          // Update processing details based on file type
          if (fileType === BusinessFileType.PriceList) {
            if (info.productsCount || info.validProductsCount !== undefined) {
              setProcessingDetails({
                products: info.productsCount,
                validProducts: info.validProductsCount,
                invalidProducts: info.invalidProductsCount,
                totalErrors: info.totalErrors,
                totalWarnings: info.totalWarnings
              });
            }
          } else {
            if (info.pagesCount || info.tablesCount || info.productsCount) {
              setProcessingDetails({
                pages: info.pagesCount,
                tables: info.tablesCount,
                tablesWithProducts: info.tablesWithProducts,
                products: info.productsCount
              });
            }
          }
        },
        60, // max attempts
        2000 // poll every 2 seconds
      );

      console.log('Processing completed:', fileInfo);
      setIsProcessing(false);

      // Step 3: Get the extracted products based on file type (skip for Sales Drawings)
      let productsData: FileProductsResponse;
      if (fileType === BusinessFileType.SalesDrawing) {
        // Sales Drawings don't have products - create empty response
        productsData = { fileId, products: [], count: 0 };
      } else {
        console.log('Fetching products...');
        try {
          productsData = await getFileProducts(fileId, fileType);
          console.log('Products fetched:', productsData);
        } catch (error) {
          console.error('Failed to fetch products:', error);
          // For other types, create empty response but still show modal
          productsData = { fileId, products: [], count: 0 };
          // Don't throw - allow user to see completion modal even if products fetch failed
        }
      }

      // Step 4: Show completion modal instead of navigating immediately
      const paramType = getParamFromFileType(fileType);
      setCompletionData({
        fileInfo,
        productsData,
        fileId,
        fileKey,
        fileUrl,
        paramType,
      });
      setShowCompletionModal(true);
      
    } catch (error: any) {
      console.error('Upload/Processing error:', error);
      setUploadError(error.message || 'Failed to upload or process file. Please try again.');
      setIsUploading(false);
      setIsProcessing(false);
    }
  };

  // Get page title based on file type
  const getPageTitle = (): string => {
    switch (fileType) {
      case BusinessFileType.Catalog:
        return 'Upload Catalog';
      case BusinessFileType.SalesDrawing:
        return 'Upload Sales Drawing';
      case BusinessFileType.PriceList:
        return 'Upload Price List';
      default:
        return 'File Upload';
    }
  };

  // Handle review now - navigate to review page
  const handleReviewNow = () => {
    if (!completionData) return;
    
    const { fileInfo, productsData, fileId, fileKey, fileUrl, paramType } = completionData;
    const reviewPath = `/files/review?fileId=${fileId}&type=${paramType}`;
    
    navigate(reviewPath, {
      state: {
        fileInfo,
        products: productsData.products,
        fileId,
        fileKey,
        fileUrl,
        fileType: paramType,
      }
    });
  };

  // Handle save for later - close modal and reset
  const handleSaveForLater = () => {
    setShowCompletionModal(false);
    setCompletionData(null);
    // Reset form and file selection
    setSelectedFile(null);
    setUploadError(null);
    setUploadSuccess(false);
    setUploadProgress(0);
    setProcessingStatus('');
    setProcessingDetails(null);
    // Reset form data
    setFormData(getInitialFormData());
  };

  // Render completion modal
  const renderCompletionModal = (): React.ReactElement | null => {
    if (!showCompletionModal || !completionData) return null;

    const { fileInfo, productsData } = completionData;
    const productsCount = productsData.count || fileInfo.productsCount || 0;
    
    // Catalog-specific stats
    const pagesCount = fileInfo.pagesCount || processingDetails?.pages || 0;
    const tablesCount = fileInfo.tablesCount || processingDetails?.tables || 0;
    const tablesWithProducts = fileInfo.tablesWithProducts || processingDetails?.tablesWithProducts || 0;
    
    // Price list-specific stats
    const validProductsCount = fileInfo.validProductsCount || processingDetails?.validProducts || 0;
    const invalidProductsCount = fileInfo.invalidProductsCount || processingDetails?.invalidProducts || 0;
    const totalErrors = fileInfo.totalErrors || processingDetails?.totalErrors || 0;
    const totalWarnings = fileInfo.totalWarnings || processingDetails?.totalWarnings || 0;
    
    const isPriceList = fileType === BusinessFileType.PriceList;
    const isSalesDrawing = fileType === BusinessFileType.SalesDrawing;
    const hasErrors = invalidProductsCount > 0 || totalErrors > 0;

    return (
      <div className="completion-modal-overlay" onClick={handleSaveForLater}>
        <div className="completion-modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="completion-modal-header">
            <div className="completion-modal-icon">
              {hasErrors ? (
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="10" stroke="#f59e0b" strokeWidth="2" fill="none"/>
                  <path d="M12 8V12M12 16H12.01" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="10" stroke="#22c55e" strokeWidth="2" fill="none"/>
                  <path d="M8 12L11 15L16 9" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <h2 className="completion-modal-title">
              {hasErrors ? 'Processing Complete with Warnings' : 'Processing Complete!'}
            </h2>
            <p className="completion-modal-subtitle">
              {isSalesDrawing
                ? 'Your sales drawing has been uploaded successfully. You can now link it to a product.'
                : isPriceList 
                  ? (hasErrors 
                      ? 'Your price list has been processed. Some rows have validation issues that need review.'
                      : 'Your price list has been successfully processed and all products are valid.')
                  : 'Your file has been successfully processed and products have been saved.'}
            </p>
          </div>

          <div className="completion-modal-body">
            {isSalesDrawing ? (
              // Sales Drawing - simple text format, no cards
              <div className="completion-info" style={{ textAlign: 'left', padding: '20px 0' }}>
                <p style={{ marginBottom: '12px', fontSize: '15px', color: '#1a1a1a', paddingLeft: '10px' }}>
                  <strong>File Name:</strong> {fileInfo.displayName || fileInfo.uploadedFileName || 'Drawing'}
                </p>
                {fileInfo.orderingNumber && (
                  <p style={{ marginBottom: '12px', fontSize: '15px', color: '#1a1a1a', paddingLeft: '10px' }}>
                    <strong>Ordering Number:</strong> {fileInfo.orderingNumber}
                  </p>
                )}
              </div>
            ) : (
              <div className="completion-stats">
                {isPriceList ? (
                // Price list stats
                <>
                  <div className="completion-stat-item highlight">
                    <div className="completion-stat-value">{productsCount}</div>
                    <div className="completion-stat-label">Total Products</div>
                  </div>
                  <div className="completion-stat-item" style={{ borderColor: '#22c55e' }}>
                    <div className="completion-stat-value" style={{ color: '#22c55e' }}>{validProductsCount}</div>
                    <div className="completion-stat-label">Valid Products</div>
                  </div>
                  {invalidProductsCount > 0 && (
                    <div className="completion-stat-item" style={{ borderColor: '#ef4444' }}>
                      <div className="completion-stat-value" style={{ color: '#ef4444' }}>{invalidProductsCount}</div>
                      <div className="completion-stat-label">Invalid Products</div>
                    </div>
                  )}
                  {totalWarnings > 0 && (
                    <div className="completion-stat-item" style={{ borderColor: '#f59e0b' }}>
                      <div className="completion-stat-value" style={{ color: '#f59e0b' }}>{totalWarnings}</div>
                      <div className="completion-stat-label">Warnings</div>
                    </div>
                  )}
                </>
              ) : (
                // Catalog stats
                <>
                  <div className="completion-stat-item highlight">
                    <div className="completion-stat-value">{productsCount}</div>
                    <div className="completion-stat-label">Products Found</div>
                  </div>
                  {pagesCount > 0 && (
                    <div className="completion-stat-item">
                      <div className="completion-stat-value">{pagesCount}</div>
                      <div className="completion-stat-label">Pages Processed</div>
                    </div>
                  )}
                  {tablesCount > 0 && (
                    <div className="completion-stat-item">
                      <div className="completion-stat-value">{tablesCount}</div>
                      <div className="completion-stat-label">Tables Extracted</div>
                    </div>
                  )}
                  {tablesWithProducts > 0 && (
                    <div className="completion-stat-item">
                      <div className="completion-stat-value">{tablesWithProducts}</div>
                      <div className="completion-stat-label">Tables with Products</div>
                    </div>
                  )}
                </>
                )}
              </div>
            )}

            {!isSalesDrawing && (
              <div className="completion-info">
                <p className="completion-info-text">
                  {isPriceList 
                    ? (hasErrors 
                        ? 'Please review the products and fix any validation errors before finalizing.'
                        : 'All products have been saved. You can review them now or continue later.')
                    : 'All products have been saved to the catalog. You can review them now or continue later.'}
                </p>
              </div>
            )}
          </div>

          <div className="completion-modal-actions">
            <button 
              className="btn-secondary completion-modal-btn"
              onClick={handleSaveForLater}
            >
              Save for Later
            </button>
            <button 
              className="btn-primary completion-modal-btn"
              onClick={handleReviewNow}
            >
              Review Now
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Render different form fields based on file type
  const renderFormFields = (): React.ReactElement | null => {
    switch (fileType) {
      case BusinessFileType.Catalog:
        return (
          <>
            <div className="form-group">
              <label className="form-label">Catalog Name</label>
              <input
                type="text"
                name="catalogName"
                className="form-input"
                placeholder="Enter catalog name"
                value={(formData as CatalogFormData).fileName}
                onChange={handleInputChange}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Catalog Serial Number</label>
              <input
                type="text"
                name="catalogSerialNumber"
                className="form-input"
                placeholder="Enter catalog serial number"
                value={(formData as CatalogFormData).catalogSerialNumber}
                onChange={handleInputChange}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Product Category</label>
              <select
                name="productCategory"
                className="form-select"
                value={(formData as CatalogFormData).productCategory}
                onChange={handleInputChange}
              >
                {Object.values(ProductCategory).map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Online link</label>
              <input
                type="url"
                name="onlineLink"
                className="form-input"
                placeholder="https://..."
                value={(formData as CatalogFormData).onlineLink}
                onChange={handleInputChange}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Year</label>
              <select
                name="year"
                className="form-select"
                value={(formData as CatalogFormData).year}
                onChange={handleInputChange}
              >
                {getYearOptions().map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Catalog Description</label>
              <textarea
                name="catalogDescription"
                className="form-textarea"
                placeholder="Enter catalog description"
                value={(formData as CatalogFormData).description}
                onChange={handleInputChange}
                rows={4}
              />
            </div>
          </>
        );

      case BusinessFileType.SalesDrawing:
        return (
          <>
            <div className="form-group">
              <label className="form-label">Drawing Name</label>
              <input
                type="text"
                name="drawingName"
                className="form-input"
                placeholder="Enter drawing name"
                value={(formData as SalesDrawingFormData).fileName}
                onChange={handleInputChange}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Ordering Number</label>
              <input
                type="text"
                name="orderingNumber"
                className="form-input"
                placeholder="Enter ordering number"
                value={(formData as SalesDrawingFormData).orderingNumber}
                onChange={handleInputChange}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Swaglok link</label>
              <input
                type="url"
                name="SwagelokLink"
                className="form-input"
                placeholder="Enter swaglok link"
                value={(formData as SalesDrawingFormData).SwagelokLink || ''}
                onChange={handleInputChange}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Year</label>
              <select
                name="year"
                className="form-select"
                value={(formData as SalesDrawingFormData).year}
                onChange={handleInputChange}
              >
                {getYearOptions().map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea
                name="notes"
                className="form-textarea"
                placeholder="Enter any additional notes"
                value={(formData as SalesDrawingFormData).notes}
                onChange={handleInputChange}
                rows={4}
              />
            </div>
          </>
        );

      case BusinessFileType.PriceList:
        return (
          <>
            <div className="form-group">
              <label className="form-label">File Name</label>
              <input
                type="text"
                name="fileName"
                className="form-input"
                placeholder="Enter file name"
                value={(formData as PriceListFormData).fileName}
                onChange={handleInputChange}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Year</label>
              <select
                name="year"
                className="form-select"
                value={(formData as PriceListFormData).year}
                onChange={handleInputChange}
              >
                {getYearOptions().map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                name="description"
                className="form-textarea"
                placeholder="Enter any additional notes about this price list"
                value={(formData as PriceListFormData).description}
                onChange={handleInputChange}
                rows={3}
              />
            </div>

            <div className="price-list-schema-info">
              <h4 className="schema-title">Required File Format</h4>
              <p className="schema-description">
                The uploaded file must be an Excel (.xlsx, .xls) or CSV file with the following columns:
              </p>
              <ul className="schema-list">
                <li><strong>OrderingNumber</strong> - Product ordering/part number</li>
                <li><strong>Description</strong> - Product description</li>
                <li><strong>Price</strong> - Product price (numeric value)</li>
                <li><strong>SwagelokLink</strong> - Product URL link (optional)</li>
              </ul>
              <p className="schema-note">
                Additional columns are allowed but the first three are mandatory for processing. The SwagelokLink is optional.
              </p>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="file-upload-page">
      {renderCompletionModal()}
      <div className="file-upload-container">
        {/* Header */}
        <div className="file-upload-header">
          <h1 className="file-upload-title">{getPageTitle()}</h1>
        </div>

        <div className="file-upload-content">
          {/* Left Side - Form */}
          <div className="file-upload-form">
            <div className="form-group">
              <label className="form-label">File Type</label>
              <select
                name="fileType"
                className="form-select"
                value={getParamFromFileType(fileType)}
                onChange={(e) => {
                  const paramType = e.target.value;
                  navigate(`/files/upload?type=${paramType}`);
                }}
              >
                {[
                  { value: BusinessFileType.Catalog, param: 'catalog' },
                  { value: BusinessFileType.SalesDrawing, param: 'sales-drawing' },
                  { value: BusinessFileType.PriceList, param: 'price-list' }
                ].map(({ value: typeValue, param }) => (
                  <option key={typeValue} value={param}>{typeValue}</option>
                ))}
              </select>
            </div>

            {renderFormFields()}
          </div>

          {/* Right Side - File Drop Zone */}
          <div className="file-upload-dropzone-container" style={{ alignSelf: 'flex-start', marginTop: '30px' }}>
            <div
              className={`file-upload-dropzone ${isDragging ? 'dragging' : ''} ${selectedFile ? 'has-file' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {selectedFile ? (
                <div className="file-preview">
                  <svg className="file-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M13 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V9L13 2Z" stroke="#2188C9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M13 2V9H20" stroke="#2188C9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <p className="file-name">{selectedFile.name}</p>
                  <p className="file-size">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                  
                  {/* Upload Progress */}
                  {isUploading && (
                    <div className="upload-progress-container">
                      <div className="upload-progress-bar">
                        <div 
                          className="upload-progress-fill" 
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                      <p className="upload-progress-text">{Math.round(uploadProgress)}%</p>
                    </div>
                  )}

                  {/* Success Message */}
                  {uploadSuccess && !isProcessing && !isUploading && (
                    <div className="upload-success-message">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M20 6L9 17L4 12" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Upload successful!
                    </div>
                  )}

                  {!isUploading && !isProcessing && (
                    <button 
                      className="remove-file-btn"
                      onClick={() => {
                        setSelectedFile(null);
                        setUploadError(null);
                        setUploadSuccess(false);
                        setUploadProgress(0);
                        setIsProcessing(false);
                        setProcessingStatus('');
                        setProcessingDetails(null);
                      }}
                    >
                      Remove File
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="dropzone-content">
                    <svg className="upload-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="#637887" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M17 8L12 3L7 8" stroke="#637887" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M12 3V15" stroke="#637887" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <h3 className="dropzone-title">Drag and drop files here</h3>
                    <p className="dropzone-subtitle">Or click to browse</p>
                  </div>
                  <button className="browse-btn btn-secondary" onClick={() => document.getElementById('file-input').click()}>
                    Browse Files
                  </button>
                  <input
                    id="file-input"
                    type="file"
                    accept={fileType === BusinessFileType.PriceList ? '.xlsx,.xls,.csv' : '.pdf'}
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                </>
              )}
            </div>

            {/* Error Message - Below Upload Area */}
            {uploadError && !isProcessing && (
              <div className="processing-status-container" style={{ 
                marginTop: '20px',
                padding: '16px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderRadius: '8px',
                border: '1px solid rgba(239, 68, 68, 0.3)'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, marginTop: '2px' }}>
                    <path d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: '#ef4444', wordBreak: 'break-word', whiteSpace: 'pre-line' }}>
                      {uploadError}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Processing Status - Below Upload Area */}
            {isProcessing && (
              <div className="processing-status-container" style={{ 
                marginTop: '20px',
                padding: '16px',
                backgroundColor: '#f7f9fa',
                borderRadius: '8px',
                border: '1px solid #e1e8ed'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <svg className="spinner" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, marginTop: '2px' }}>
                    <circle cx="12" cy="12" r="10" stroke="#2188C9" strokeWidth="2" strokeLinecap="round" strokeDasharray="32" strokeDashoffset="32">
                      <animate attributeName="stroke-dasharray" dur="2s" values="0 32;16 16;0 32;0 32" repeatCount="indefinite"/>
                      <animate attributeName="stroke-dashoffset" dur="2s" values="0;-16;-32;-32" repeatCount="indefinite"/>
                    </circle>
                  </svg>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: '#1a1a1a', marginBottom: '4px' }}>
                      {processingStatus}
                    </div>
                    {processingDetails && (
                      <div style={{ fontSize: '13px', color: '#637887' }}>
                        {fileType === BusinessFileType.PriceList ? (
                          // Price list processing details
                          <>
                            {processingDetails.products !== undefined && `${processingDetails.products} products`}
                            {processingDetails.validProducts !== undefined && ` • ${processingDetails.validProducts} valid`}
                            {processingDetails.invalidProducts !== undefined && processingDetails.invalidProducts > 0 && (
                              <span style={{ color: '#ef4444' }}> • {processingDetails.invalidProducts} invalid</span>
                            )}
                          </>
                        ) : (
                          // Catalog processing details
                          <>
                            {processingDetails.pages && `${processingDetails.pages} pages`}
                            {processingDetails.tables && ` • ${processingDetails.tables} tables`}
                            {processingDetails.products && ` • ${processingDetails.products} products`}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="file-upload-actions">
          <button className="btn-secondary" onClick={handleCancel}>
            Cancel
          </button>
          <button 
            className="btn-primary" 
            onClick={handleUpload}
            disabled={!selectedFile || isUploading || isProcessing}
          >
            {isProcessing ? 'Processing...' : isUploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FileUpload;

