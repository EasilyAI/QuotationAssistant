export enum FileType {
  Catalog = 'Catalog',
  PriceList = 'Price List',
  SalesDrawing = 'Sales Drawing'
}

// Catalog-specific form data
export interface CatalogFormData {
  fileType: FileType.Catalog;
  fileName: string;
  productCategory: string; // ProductCategory enum value
  catalogSerialNumber: string;
  description: string;
  onlineLink: string;
  year: string;
}

// Sales Drawing-specific form data
export interface SalesDrawingFormData {
  fileType: FileType.SalesDrawing;
  fileName: string;
  orderingNumber: string;
  manufacturer: string;
  swaglokLink?: string;
  year: string;
  notes: string;
}

// Price List-specific form data
export interface PriceListFormData {
  fileType: FileType.PriceList;
  fileName: string;
  year: string;
  description: string;
}

// File metadata (from the selected file)
export interface FileMetadata {
  fileName: string;
  fileSize: number;
  fileType: string; // MIME type
}

// Upload response from S3 upload
export interface FileUploadResponse {
  fileKey: string;
  fileUrl: string;
  fileId: string;
}

// Complete upload information combining form data with file and upload info
export interface CatalogUploadData extends CatalogFormData {
  file: FileMetadata;
  upload?: FileUploadResponse;
}

export interface SalesDrawingUploadData extends SalesDrawingFormData {
  file: FileMetadata;
  upload?: FileUploadResponse;
}

export interface PriceListUploadData extends PriceListFormData {
  file: FileMetadata;
  upload?: FileUploadResponse;
}

// Processing details shown during file processing
export interface ProcessingDetails {
  pages?: number;
  tables?: number;
  tablesWithProducts?: number;
  products?: number;
}

// File status values
export type FileStatus = 
  | 'textract_started'
  | 'textract_processing'
  | 'textract_completed'
  | 'parsing_tables'
  | 'saving_products'
  | 'completed'
  | 'failed';

// File information from backend
export interface FileInfo {
  fileId: string;
  status: FileStatus;
  processingStage?: string;
  pagesCount?: number;
  tablesCount?: number;
  tablesWithProducts?: number;
  productsCount?: number;
  error?: string;
  
  // File name fields
  uploadedFileName?: string;  // Actual file name from S3 upload
  displayName?: string;       // User-chosen display name from form
  
  // Common form fields
  businessFileType?: FileType;
  year?: string;
  
  // Catalog-specific fields
  productCategory?: string;
  catalogSerialNumber?: string;
  onlineLink?: string;
  
  // SalesDrawing-specific fields
  orderingNumber?: string;
  manufacturer?: string;
  swaglokLink?: string;
  notes?: string;
  
  // PriceList-specific fields (description is common)
  description?: string;
  
  // Processing metadata
  s3Key?: string;
  textractJobId?: string;
  textractResultsKey?: string;
  
  [key: string]: any; // Allow additional properties from backend
}

// Products response from backend
export interface FileProductsResponse {
  fileId: string;
  products: any[]; // Product type can be defined elsewhere
  count: number;
}

// File validation result
export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

// Status update callback parameters
export interface StatusUpdateInfo {
  status: FileStatus;
  processingStage?: string;
  pagesCount?: number;
  tablesCount?: number;
  tablesWithProducts?: number;
  productsCount?: number;
  [key: string]: any;
}
