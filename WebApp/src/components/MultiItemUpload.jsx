import React, { useState } from 'react';
import './MultiItemUpload.css';

const MultiItemUpload = ({ onNavigate }) => {
  const [activeTab, setActiveTab] = useState('all');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [items, setItems] = useState([]);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setUploadedFile(file);
      // Here you would process the Excel file
      console.log('File uploaded:', file.name);
    }
  };

  const toggleExpanded = (id) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, isExpanded: !item.isExpanded } : item
    ));
  };

  const filteredItems = activeTab === 'all' ? items : items.filter(item => item.status !== 'Match Found');

  const processedCount = items.filter(item => item.status === 'Match Found').length;
  const totalCount = items.length;
  const progressPercentage = (processedCount / totalCount) * 100;

  return (
    <div className="multi-upload-container">
      <header className="header">
        <div className="header-left">
          <div className="logo">
            <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <path clipRule="evenodd" d="M24 4H42V17.3333V30.6667H24V44H6V30.6667V17.3333H24V4Z" fill="currentColor" fillRule="evenodd"></path>
            </svg>
          </div>
          <h2 className="header-title">HB Quotation Assistant</h2>
        </div>
        <div className="header-right">
          <div className="nav-links">
            <button className="nav-link" onClick={() => onNavigate && onNavigate('dashboard')}>Dashboard</button>
            <button className="nav-link" onClick={() => onNavigate && onNavigate('single-search')}>Single Search</button>
            <button className="nav-link active">Multi Search</button>
            <button className="nav-link" onClick={() => onNavigate && onNavigate('quotations')}>Quotations</button>
            <button className="nav-link" onClick={() => onNavigate && onNavigate('settings')}>Settings</button>
          </div>
          <div className="user-avatar" style={{backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuCTQreYsU3eC_jogrII2Zlz73uQPrsl31U3mrjGsbox1MXP3zUPO1g1JH4OOYw8fu_U2zao0y_aUwLFlzQYjwp_x4xif8qdEe3sGvs_vs8t_f0O0NcRliUpgkHHb6PlFu9sAx_T-i-J04K3PXKk89BPSoB4VZ-ZG8Y732Qz5jnlBiBDqmh7ONCeyg8ikDBrq3AHxSXfiH90IXLi_sw8ghnBpRyzknpYbkm1tzxVm99tAsGCACMsLJb-JO0XQLh2uOcUYi0fcmKAACc")'}}></div>
        </div>
      </header>

      <div className="main-content">
        <div className="content-container">
          <div className="page-header">
            <div className="page-title-section">
              <h1 className="page-title">Batch Search & Verification</h1>
              <p className="page-description">
                Upload an Excel file with your product requests. Our system will search manufacturer catalogs and suggest matches.
              </p>
            </div>
          </div>

          <div className="upload-section">
            <input
              type="file"
              id="excel-upload"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            <label htmlFor="excel-upload" className="upload-button">
              <div className="upload-icon">
                <svg fill="currentColor" height="20px" viewBox="0 0 256 256" width="20px" xmlns="http://www.w3.org/2000/svg">
                  <path d="M240,136v64a16,16,0,0,1-16,16H32a16,16,0,0,1-16-16V136a16,16,0,0,1,16-16H80a8,8,0,0,1,0,16H32v64H224V136H176a8,8,0,0,1,0-16h48A16,16,0,0,1,240,136ZM85.66,77.66,120,43.31V128a8,8,0,0,0,16,0V43.31l34.34,34.35a8,8,0,0,0,11.32-11.32l-48-48a8,8,0,0,0-11.32,0l-48,48A8,8,0,0,0,85.66,77.66ZM200,168a12,12,0,1,0-12,12A12,12,0,0,0,200,168Z"></path>
                </svg>
              </div>
              <span>Upload Excel File</span>
            </label>
          </div>

          <div className="tabs-section">
            <div className="tabs">
              <button
                className={`tab ${activeTab === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTab('all')}
              >
                All Items
              </button>
              <button
                className={`tab ${activeTab === 'unmatched' ? 'active' : ''}`}
                onClick={() => setActiveTab('unmatched')}
              >
                Unmatched Items
              </button>
            </div>
          </div>

          <div className="table-section">
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="expand-column"></th>
                    <th>Item #</th>
                    <th>Product Type</th>
                    <th>Requested Item</th>
                    <th>Quantity</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id}>
                      <td className="expand-cell">
                        <button onClick={() => toggleExpanded(item.id)} className="expand-button">
                          <span className="material-symbols-outlined">
                            {item.isExpanded ? 'expand_less' : 'expand_more'}
                          </span>
                        </button>
                      </td>
                      <td>{item.itemNumber}</td>
                      <td>{item.productType}</td>
                      <td>{item.requestedItem}</td>
                      <td>{item.quantity}</td>
                      <td>
                        <div className="status-cell">
                          <span className="material-symbols-outlined">check_circle</span>
                          <span>{item.status}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="progress-section">
            <div className="progress-header">
              <p className="progress-title">Batch Progress</p>
            </div>
            <div className="progress-bar-container">
              <div 
                className="progress-bar" 
                style={{ width: `${progressPercentage}%` }}
              ></div>
            </div>
            <p className="progress-text">
              <span className="progress-number">{processedCount}/{totalCount}</span> Items Processed Correctly ({Math.round(progressPercentage)}% Complete)
            </p>
          </div>

          <p className="autosave-text">Autosaving...</p>

          <div className="action-buttons">
            <button className="discard-button">Discard</button>
            <button className="save-button">Save to Quotation</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiItemUpload;
