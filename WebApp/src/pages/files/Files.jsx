import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Files.css';
import { mockUploads } from '../../data/mockUploads';

const Files = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);

  // Separate uploads into in-progress and completed
  const inProgressUploads = mockUploads.filter(u => u.status === 'In Progress' || u.status === 'Pending');
  const completedUploads = mockUploads.filter(u => u.status === 'Completed');

  // Filter function
  const filterUploads = (uploads) => {
    return uploads.filter(upload => {
      const matchesSearch = upload.fileName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = !selectedCategory || upload.productType === selectedCategory;
      const matchesYear = !selectedYear || new Date(upload.createdAt).getFullYear().toString() === selectedYear;
      return matchesSearch && matchesCategory && matchesYear;
    });
  };

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

  const handleView = (id) => {
    navigate(`/files/view/${id}`);
  };

  const handleDownload = (id) => {
    console.log('Download file:', id);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toISOString().split('T')[0];
  };

  const getProgress = (upload) => {
    if (!upload.totalItems) return 0;
    return Math.round((upload.processedItems / upload.totalItems) * 100);
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
              <div className="files-table-header-cell product-type">Product Type</div>
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
                inProgressUploads.map(upload => (
                  <div key={upload.id} className="files-table-row">
                    <div className="files-table-cell file-name">
                      {upload.fileName}
                    </div>
                    <div className="files-table-cell product-type">
                      {upload.productType.charAt(0).toUpperCase() + upload.productType.slice(1)}
                    </div>
                    <div className="files-table-cell created-at">
                      {formatDate(upload.createdAt)}
                    </div>
                    <div className="files-table-cell status">
                      <div className="status-tag">{upload.status}</div>
                    </div>
                    <div className="files-table-cell progress">
                      {upload.status === 'In Progress' && (
                        <div className="progress-container">
                          <div className="progress-bar">
                            <div 
                              className="progress-fill" 
                              style={{ width: `${getProgress(upload)}%` }}
                            />
                          </div>
                          <span className="progress-text">
                            {upload.processedItems} / {upload.totalItems} ({getProgress(upload)}%)
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="files-table-cell actions">
                      <div className="action-links-inline">
                        <button className="action-link" onClick={() => handleKeep(upload.id)}>Keep</button>
                        <span className="action-separator">|</span>
                        <button className="action-link" onClick={() => handleEdit(upload.id)}>Edit</button>
                        <span className="action-separator">|</span>
                        <button className="action-link" onClick={() => handleDelete(upload.id)}>Delete</button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

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
              <div className="files-table-header-cell product-type">Product Type</div>
              <div className="files-table-header-cell created-at">Created at</div>
              <div className="files-table-header-cell status">Status</div>
              <div className="files-table-header-cell actions">Actions</div>
            </div>

            {/* Table Body */}
            <div className="files-table-body">
              {filterUploads(completedUploads).length === 0 ? (
                <div className="empty-state">
                  <p className="empty-state-text">No catalogs found</p>
                </div>
              ) : (
                filterUploads(completedUploads).map(upload => (
                  <div key={upload.id} className="files-table-row">
                    <div className="files-table-cell file-name">{upload.fileName}</div>
                    <div className="files-table-cell product-type">
                      {upload.productType.charAt(0).toUpperCase() + upload.productType.slice(1)}
                    </div>
                    <div className="files-table-cell created-at">
                      {formatDate(upload.createdAt)}
                    </div>
                    <div className="files-table-cell status">
                      <div className="status-tag">{upload.status}</div>
                    </div>
                    <div className="files-table-cell actions">
                      <div className="action-links-inline">
                        <button className="action-link" onClick={() => handleView(upload.id)}>View</button>
                        <span className="action-separator">|</span>
                        <button className="action-link" onClick={() => handleDownload(upload.id)}>Download</button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Files;

