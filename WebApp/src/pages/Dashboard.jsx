import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getQuotations, deleteQuotation } from '../services/quotationService';
import { getFiles, deleteFile } from '../services/fileInfoService';
import { getCurrentUserInfo } from '../services/authService';
import { FileStatus, BusinessFileType } from '../types/files';
import './Dashboard.css';

const Dashboard = () => {
  const navigate = useNavigate();
  const [recentQuotations, setRecentQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [files, setFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [fileToDelete, setFileToDelete] = useState(null);
  const [isDeletingFile, setIsDeletingFile] = useState(false);
  const [userName, setUserName] = useState('User');

  // Fetch user info on mount
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const userInfo = await getCurrentUserInfo();
        if (userInfo && userInfo.name) {
          setUserName(userInfo.name);
        }
      } catch (err) {
        console.error('Error fetching user info:', err);
      }
    };
    fetchUserInfo();
  }, []);

  // Fetch quotations on mount - get last 4 sorted by updated_at
  useEffect(() => {
    const fetchQuotations = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Fetch all quotations (or recent ones)
        const result = await getQuotations({
          recent: true,
          limit: 100 // Get more to sort and take top 4
        });
        
        const allQuotations = result.quotations || [];
        
        // Sort by updated_at (most recent first) and take last 4
        const sortedQuotations = allQuotations
          .sort((a, b) => {
            const dateA = a.updatedAt || a.updated_at || a.createdDate || a.created_at || '';
            const dateB = b.updatedAt || b.updated_at || b.createdDate || b.created_at || '';
            // Sort descending (newest first)
            return new Date(dateB) - new Date(dateA);
          })
          .slice(0, 4); // Take last 4 (most recently updated)
        
        setRecentQuotations(sortedQuotations);
      } catch (err) {
        console.error('Error fetching quotations:', err);
        setError(err.message || 'Failed to load quotations');
        setRecentQuotations([]);
      } finally {
        setLoading(false);
      }
    };

    fetchQuotations();
  }, []);

  // Fetch files on mount
  useEffect(() => {
    const fetchFiles = async () => {
      setFilesLoading(true);
      try {
        const response = await getFiles();
        // Handle both array and object response formats
        const filesList = Array.isArray(response) ? response : (response?.files || []);
        
        // Normalize files: filter valid files and normalize status
        const normalizedFiles = filesList
          .filter((file) => file && file.fileId)
          .map((file) => ({
            ...file,
            // Normalize status to match FileStatus enum
            status: file.status && Object.values(FileStatus).includes(file.status)
              ? file.status
              : file.status?.toLowerCase() === 'completed'
                ? FileStatus.COMPLETED
                : file.status?.toLowerCase() === 'failed'
                  ? FileStatus.FAILED
                  : file.status,
          }));
        
        setFiles(normalizedFiles);
      } catch (err) {
        console.error('Error fetching files:', err);
      } finally {
        setFilesLoading(false);
      }
    };

    fetchFiles();
  }, []);

  // Filter in-progress uploads (not completed and not failed)
  const inProgressUploads = useMemo(() => {
    return files.filter(
      (file) => file.status !== FileStatus.COMPLETED && file.status !== FileStatus.FAILED
    );
  }, [files]);

  const handleNewQuotation = () => {
    navigate('/quotations/edit/new');
  };

  const handleSearchProduct = () => {
    navigate('/search');
  };

  const handleUploadFile = () => {
    navigate('/files/upload');
  };

  const handleEditQuotation = (id) => {
    navigate(`/quotations/edit/${id}`);
  };

  const handleDeleteQuotation = async (id) => {
    if (window.confirm('Are you sure you want to delete this quotation?')) {
      try {
        await deleteQuotation(id);
        // Remove from local state
        setRecentQuotations(prev => prev.filter(q => q.id !== id));
      } catch (err) {
        console.error('Error deleting quotation:', err);
        alert(err.message || 'Failed to delete quotation');
      }
    }
  };

  // Helper functions for file formatting (similar to Files.tsx)
  const formatFileName = (file) => {
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

  const formatDate = (isoDate, fallbackTimestamp) => {
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

  const formatStatusLabel = (status) => {
    if (!status) return '';
    return status.replace('_', ' ');
  };

  const getBusinessFileTypeLabel = (file) => {
    if (file.businessFileType) {
      return file.businessFileType;
    }
    return '—';
  };

  const handleEditFile = (file) => {
    if (file.businessFileType === BusinessFileType.Catalog) {
      navigate(`/files/review/catalog/${file.fileId}`);
    } else if (file.businessFileType === BusinessFileType.SalesDrawing) {
      navigate(`/files/review/sales-drawing/${file.fileId}`);
    } else if (file.businessFileType === BusinessFileType.PriceList) {
      navigate(`/files/review/price-list/${file.fileId}`);
    } else {
      alert('Invalid file type');
    }
  };

  const handleDeleteFile = (file) => {
    // Check if file is completed - prevent deletion
    if (file.status === FileStatus.COMPLETED) {
      alert('Cannot delete completed files.');
      return;
    }
    
    // Show confirmation dialog
    setFileToDelete(file);
  };

  const confirmDeleteFile = async () => {
    if (!fileToDelete) return;

    // Double-check status before deletion
    if (fileToDelete.status === FileStatus.COMPLETED) {
      alert('Cannot delete completed files.');
      setFileToDelete(null);
      return;
    }

    setIsDeletingFile(true);
    try {
      await deleteFile(fileToDelete.fileId);
      // Remove file from local state
      setFiles(prevFiles => prevFiles.filter(file => file.fileId !== fileToDelete.fileId));
      setFileToDelete(null);
    } catch (error) {
      console.error('Error deleting file:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete file. Please try again.');
    } finally {
      setIsDeletingFile(false);
    }
  };

  const cancelDeleteFile = () => {
    setFileToDelete(null);
  };

  return (
    <div className="dashboard">
      <div className="dashboard-content">
        {/* Welcome Section */}
        <div className="dashboard-section welcome-section">
          <h1 className="dashboard-title">Welcome back, {userName}</h1>
        </div>

        {/* Quick Actions Section */}
        <div className="dashboard-section quick-actions-header">
          <h2 className="section-title">Quick Actions</h2>
        </div>

        <div className="dashboard-section quick-actions">
          <div className="quick-actions-buttons">
            <button className="btn-primary" onClick={handleNewQuotation}>
              New Quotation
            </button>
            <button className="btn-secondary" onClick={handleSearchProduct}>
              Search Product
            </button>
            <button className="btn-secondary" onClick={handleUploadFile}>
              Upload file
            </button>
          </div>
        </div>

        {/* Quotations Section */}
        <div className="dashboard-section quotations-header">
          <h2 className="section-title">Continue Your Work</h2>
        </div>

        {/* Quotations Table */}
        <div className="dashboard-section table-section">
          <div className="table-wrapper">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th className="col-quotation-name">Quotation Name</th>
                  <th className="col-created-at">Created at</th>
                  <th className="col-customer">Customer</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '20px' }}>
                      Loading...
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '20px', color: 'red' }}>
                      Error: {error}
                    </td>
                  </tr>
                ) : recentQuotations.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '20px' }}>
                      No quotations found
                    </td>
                  </tr>
                ) : (
                  recentQuotations.map((quotation) => (
                  <tr key={quotation.id}>
                    <td className="col-quotation-name">
                      <div className="quotation-name-cell">
                        {quotation.name}
                      </div>
                    </td>
                    <td className="col-created-at text-secondary">{quotation.createdDate}</td>
                    <td className="col-customer text-secondary">{quotation.customer}</td>
                    <td className="col-actions">
                      <div className="action-links">
                        <button 
                          className="action-link primary-action"
                          onClick={() => handleEditQuotation(quotation.id)}
                        >
                          Edit
                        </button>
                        <button 
                          className="action-link danger"
                          onClick={() => handleDeleteQuotation(quotation.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* See All Link */}
        <div className="dashboard-section see-all-section">
          <button className="see-all-link" onClick={() => navigate('/quotations')}>
            See all quotations
          </button>
        </div>

        {/* Uploads Section */}
        <div className="dashboard-section uploads-header">
          <h2 className="section-title">Uploads - In progress</h2>
        </div>

        {/* Uploads Table */}
        <div className="dashboard-section table-section">
          <div className="table-wrapper">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th className="col-file-name">File Name</th>
                  <th className="col-product-type">Product Type</th>
                  <th className="col-created-at">Created at</th>
                  <th className="col-status">Status</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filesLoading ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '20px' }}>
                      Loading...
                    </td>
                  </tr>
                ) : inProgressUploads.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '20px' }}>
                      No uploads in progress
                    </td>
                  </tr>
                ) : (
                  inProgressUploads.map((upload) => (
                    <tr key={upload.fileId}>
                      <td className="col-file-name">{formatFileName(upload)}</td>
                      <td className="col-product-type text-secondary">
                        {upload.productCategory || getBusinessFileTypeLabel(upload) || '—'}
                      </td>
                      <td className="col-created-at text-secondary">
                        {formatDate(upload.createdAtIso, upload.createdAt)}
                      </td>
                      <td className="col-status">
                        <div className="status-badge info">
                          {formatStatusLabel(upload.status)}
                        </div>
                      </td>
                      <td className="col-actions">
                        <div className="action-links">
                          <button 
                            className="action-link"
                            onClick={() => handleEditFile(upload)}
                          >
                            Edit
                          </button>
                          <button 
                            className="action-link danger"
                            onClick={() => handleDeleteFile(upload)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* See All Link */}
        <div className="dashboard-section see-all-section">
          <button className="see-all-link" onClick={() => navigate('/files')}>
            See all catalogs
          </button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {fileToDelete && (
        <div className="delete-dialog-backdrop">
          <div className="delete-dialog">
            <h3>Delete File</h3>
            <p>Are you sure you want to delete "{formatFileName(fileToDelete)}"?</p>
            <p className="delete-warning">This action cannot be undone. The file and all associated data will be permanently deleted.</p>
            <div className="delete-dialog-actions">
              <button
                className="btn-secondary"
                type="button"
                onClick={cancelDeleteFile}
                disabled={isDeletingFile}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                type="button"
                onClick={confirmDeleteFile}
                disabled={isDeletingFile}
              >
                {isDeletingFile ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;

