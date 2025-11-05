import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './FileUpload.css';

const FileUpload = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fileType = searchParams.get('type') || 'catalog';

  const [formData, setFormData] = useState({
    fileType: fileType,
    catalogName: '',
    productCategory: 'Valve',
    catalogSerialNumber: '',
    catalogDescription: '',
    onlineLink: '',
    year: '2024',
    serialNumber: '',
    description: '',
    manufacturer: '',
    orderingNumber: '',
    notes: ''
  });

  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleCancel = () => {
    navigate('/files');
  };

  const handleUpload = () => {
    console.log('Uploading:', formData, selectedFile);
    // Navigate to review screen after upload
    navigate(`/files/review/new?type=${fileType}`);
  };

  // Get page title based on file type
  const getPageTitle = () => {
    switch (fileType) {
      case 'catalog':
        return 'Upload Catalog';
      case 'sales-drawing':
        return 'Upload Sales Drawing';
      case 'price-list':
        return 'Upload Price List';
      default:
        return 'File Upload';
    }
  };

  // Render different form fields based on file type
  const renderFormFields = () => {
    switch (fileType) {
      case 'catalog':
        return (
          <>
            <div className="form-group">
              <label className="form-label">Catalog Name</label>
              <input
                type="text"
                name="catalogName"
                className="form-input"
                placeholder="Enter catalog name"
                value={formData.catalogName}
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
                value={formData.catalogSerialNumber}
                onChange={handleInputChange}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Product Category</label>
              <select
                name="productCategory"
                className="form-select"
                value={formData.productCategory}
                onChange={handleInputChange}
              >
                <option value="Valve">Valve</option>
                <option value="Cylinder">Cylinder</option>
                <option value="Tube">Tube</option>
                <option value="Seal">Seal</option>
                <option value="Fitting">Fitting</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Online link</label>
              <input
                type="url"
                name="onlineLink"
                className="form-input"
                placeholder="https://..."
                value={formData.onlineLink}
                onChange={handleInputChange}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Year</label>
              <select
                name="year"
                className="form-select"
                value={formData.year}
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
                value={formData.catalogDescription}
                onChange={handleInputChange}
                rows="4"
              />
            </div>
          </>
        );

      case 'sales-drawing':
        return (
          <>
            <div className="form-group">
              <label className="form-label">Drawing Name</label>
              <input
                type="text"
                name="catalogName"
                className="form-input"
                placeholder="Enter drawing name"
                value={formData.catalogName}
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
                value={formData.orderingNumber}
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
                value={formData.manufacturer}
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
                value={formData.swaglokLink}
                onChange={(e) => setFormData({ ...formData, swaglokLink: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Year</label>
              <select
                name="year"
                className="form-select"
                value={formData.year}
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
                value={formData.notes}
                onChange={handleInputChange}
                rows="4"
              />
            </div>
          </>
        );

      case 'price-list':
        return (
          <>
            <div className="form-group">
              <label className="form-label">File Name</label>
              <input
                type="text"
                name="catalogName"
                className="form-input"
                placeholder="Enter file name"
                value={formData.catalogName}
                onChange={handleInputChange}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Year</label>
              <select
                name="year"
                className="form-select"
                value={formData.year}
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
                value={formData.description}
                onChange={handleInputChange}
                rows="3"
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
                value={formData.fileType}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, fileType: e.target.value }));
                  navigate(`/files/upload?type=${e.target.value}`);
                }}
              >
                <option value="catalog">Catalog</option>
                <option value="sales-drawing">Sales Drawing</option>
                <option value="price-list">Price List</option>
              </select>
            </div>

            {renderFormFields()}
          </div>

          {/* Right Side - File Drop Zone */}
          <div className="file-upload-dropzone-container">
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
                  <button 
                    className="remove-file-btn"
                    onClick={() => setSelectedFile(null)}
                  >
                    Remove File
                  </button>
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
                    accept=".pdf,.xlsx,.xls,.doc,.docx"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                </>
              )}
            </div>
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
            disabled={!selectedFile}
          >
            Upload
          </button>
        </div>
      </div>
    </div>
  );
};

export default FileUpload;

