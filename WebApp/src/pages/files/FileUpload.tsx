import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './FileUpload.css';
import { uploadFileToS3, validateFile, pollFileStatus, getFileProducts } from '../../services/s3UploadService';
import { validateUploadForm } from '../../services/formValidationService';
import { 
  ProductCategory, 
  FileType,
  CatalogFormData,
  SalesDrawingFormData,
  PriceListFormData,
  ProcessingDetails,
  FileInfo,
  FileProductsResponse,
  FileValidationResult,
  FileUploadResponse
} from '../../types';

// Helper to map URL param to FileType enum
const getFileTypeFromParam = (param: string | null): FileType => {
  if (param === 'catalog') return FileType.Catalog;
  if (param === 'sales-drawing') return FileType.SalesDrawing;
  if (param === 'price-list') return FileType.PriceList;
  return FileType.Catalog;
};

// Helper to map FileType enum to URL param
const getParamFromFileType = (fileType: FileType): string => {
  if (fileType === FileType.Catalog) return 'catalog';
  if (fileType === FileType.SalesDrawing) return 'sales-drawing';
  if (fileType === FileType.PriceList) return 'price-list';
  return 'catalog';
};

const FileUpload = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fileTypeParam = searchParams.get('type');
  const fileType = useMemo(() => getFileTypeFromParam(fileTypeParam), [fileTypeParam]);

  // Initialize form data based on file type
  const getInitialFormData = (): CatalogFormData | SalesDrawingFormData | PriceListFormData => {
    const year = new Date().getFullYear().toString();
    
    switch (fileType) {
      case FileType.Catalog:
        return {
          fileType: FileType.Catalog,
          catalogName: '',
          productCategory: ProductCategory.VALVE,
          catalogSerialNumber: '',
          catalogDescription: '',
          onlineLink: '',
          year,
        };
      case FileType.SalesDrawing:
        return {
          fileType: FileType.SalesDrawing,
          drawingName: '',
          orderingNumber: '',
          manufacturer: '',
          swaglokLink: '',
          year,
          notes: '',
        };
      case FileType.PriceList:
        return {
          fileType: FileType.PriceList,
          fileName: '',
          year,
          description: '',
        };
      default:
        return {
          fileType: FileType.Catalog,
          catalogName: '',
          productCategory: ProductCategory.VALVE,
          catalogSerialNumber: '',
          catalogDescription: '',
          onlineLink: '',
          year,
        };
    }
  };

  const [formData, setFormData] = useState<CatalogFormData | SalesDrawingFormData | PriceListFormData>(() => {
    const year = new Date().getFullYear().toString();
    return {
      fileType: FileType.Catalog,
      catalogName: '',
      productCategory: ProductCategory.VALVE,
      catalogSerialNumber: '',
      catalogDescription: '',
      onlineLink: '',
      year,
    };
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
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
      // Step 1: Upload file to S3
      console.log('Uploading file to S3...');
      const uploadResponse: FileUploadResponse = await uploadFileToS3(
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
          
          // Update processing status message
          const statusMessages: Record<string, string> = {
            'textract_started': 'Starting document analysis...',
            'textract_processing': `Analyzing document. ${info.processingStage || ''}`,
            'textract_completed': 'Document analysis completed',
            'parsing_tables': `Extracting tables. ${info.processingStage || ''}`,
            'saving_products': `Saving products to database...`,
            'completed': 'Processing completed!'
          };
          
          setProcessingStatus(statusMessages[status] || info.processingStage || 'Processing...');
          
          // Update processing details
          if (info.pagesCount || info.tablesCount || info.productsCount) {
            setProcessingDetails({
              pages: info.pagesCount,
              tables: info.tablesCount,
              tablesWithProducts: info.tablesWithProducts,
              products: info.productsCount
            });
          }
        },
        60, // max attempts
        2000 // poll every 2 seconds
      );

      console.log('Processing completed:', fileInfo);
      setIsProcessing(false);

      // Step 3: Get the extracted products
      console.log('Fetching products...');
      const productsData: FileProductsResponse = await getFileProducts(fileId);
      console.log('Products fetched:', productsData);

      // Step 4: Navigate to review screen with products based on file type
      const paramType = getParamFromFileType(fileType);
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
      case FileType.Catalog:
        return 'Upload Catalog';
      case FileType.SalesDrawing:
        return 'Upload Sales Drawing';
      case FileType.PriceList:
        return 'Upload Price List';
      default:
        return 'File Upload';
    }
  };

  // Render different form fields based on file type
  const renderFormFields = (): React.ReactElement | null => {
    switch (fileType) {
      case FileType.Catalog:
        return (
          <>
            <div className="form-group">
              <label className="form-label">Catalog Name</label>
              <input
                type="text"
                name="catalogName"
                className="form-input"
                placeholder="Enter catalog name"
                value={(formData as CatalogFormData).catalogName}
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
                {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(year => (
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
                value={(formData as CatalogFormData).catalogDescription}
                onChange={handleInputChange}
                rows={4}
              />
            </div>
          </>
        );

      case FileType.SalesDrawing:
        return (
          <>
            <div className="form-group">
              <label className="form-label">Drawing Name</label>
              <input
                type="text"
                name="drawingName"
                className="form-input"
                placeholder="Enter drawing name"
                value={(formData as SalesDrawingFormData).drawingName}
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
              <label className="form-label">Manufacturer</label>
              <input
                type="text"
                name="manufacturer"
                className="form-input"
                placeholder="Enter manufacturer name"
                value={(formData as SalesDrawingFormData).manufacturer}
                onChange={handleInputChange}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Swaglok link</label>
              <input
                type="url"
                name="swaglokLink"
                className="form-input"
                placeholder="Enter swaglok link"
                value={(formData as SalesDrawingFormData).swaglokLink || ''}
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
                {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(year => (
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

      case FileType.PriceList:
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
                {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(year => (
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
                <li><strong>Ordering Number</strong> - Product ordering/part number</li>
                <li><strong>Description</strong> - Product description</li>
                <li><strong>Price</strong> - Product price (numeric value)</li>
              </ul>
              <p className="schema-note">
                Additional columns are allowed but these three are mandatory for processing.
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
                  { value: FileType.Catalog, param: 'catalog' },
                  { value: FileType.SalesDrawing, param: 'sales-drawing' },
                  { value: FileType.PriceList, param: 'price-list' }
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
                    accept={fileType === FileType.PriceList ? '.xlsx,.xls,.csv' : '.pdf'}
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
                    <div style={{ fontSize: '14px', fontWeight: '500', color: '#ef4444', wordBreak: 'break-word' }}>
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
                        {processingDetails.pages && `${processingDetails.pages} pages`}
                        {processingDetails.tables && ` • ${processingDetails.tables} tables`}
                        {processingDetails.products && ` • ${processingDetails.products} products`}
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

