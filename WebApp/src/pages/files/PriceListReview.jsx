import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './PriceListReview.css';

const PriceListReview = () => {
  const navigate = useNavigate();

  const [priceListData, setpriceListData] = useState({
    name: "Industrial Valves Price List Q1 2024",
    category: "Valve",
    serialNumber: "PL-2024-Q1-001",
    effectiveDate: "2024-01-01",
    expiryDate: "2024-03-31",
    currency: "USD",
    notes: ""
  });

  const [items, setItems] = useState([
    {
      id: 1,
      partNumber: "V-1000-SS",
      description: "Stainless Steel Ball Valve 1\"",
      category: "Ball Valve",
      listPrice: "125.00",
      discountPrice: "100.00",
      minQuantity: "10",
      unit: "EA"
    },
    {
      id: 2,
      partNumber: "V-2000-BR",
      description: "Brass Gate Valve 2\"",
      category: "Gate Valve",
      listPrice: "245.00",
      discountPrice: "196.00",
      minQuantity: "5",
      unit: "EA"
    },
    {
      id: 3,
      partNumber: "V-3000-CI",
      description: "Cast Iron Check Valve 3\"",
      category: "Check Valve",
      listPrice: "385.00",
      discountPrice: "308.00",
      minQuantity: "3",
      unit: "EA"
    }
  ]);

  const handleDataChange = (field, value) => {
    setpriceListData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleItemChange = (itemId, field, value) => {
    setItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, [field]: value } : item
    ));
  };

  const handleAddItem = () => {
    const newItem = {
      id: Date.now(),
      partNumber: "",
      description: "",
      category: "",
      listPrice: "",
      discountPrice: "",
      minQuantity: "",
      unit: "EA"
    };
    setItems(prev => [...prev, newItem]);
  };

  const handleRemoveItem = (itemId) => {
    if (window.confirm('Are you sure you want to remove this item?')) {
      setItems(prev => prev.filter(item => item.id !== itemId));
    }
  };

  const handleSave = () => {
    console.log('Saving price list:', priceListData, items);
    navigate('/files');
  };

  const handleCancel = () => {
    navigate('/files');
  };

  return (
    <div className="price-list-review-page">
      <div className="price-list-review-container">
        {/* Header */}
        <div className="review-header">
          <div className="review-header-content">
            <h1 className="review-title">Price List Review & Verification</h1>
            <p className="review-subtitle">Review and verify pricing information</p>
          </div>
          <div className="review-header-actions">
            <button className="btn-secondary" onClick={handleCancel}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handleSave}>
              Save Price List
            </button>
          </div>
        </div>

        {/* Price List Info */}
        <div className="price-list-info-section">
          <h3 className="section-title">Price List Information</h3>
          <div className="info-grid">
            <div className="form-group">
              <label className="form-label">Price List Name</label>
              <input
                type="text"
                className="form-input"
                value={priceListData.name}
                onChange={(e) => handleDataChange('name', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Serial Number</label>
              <input
                type="text"
                className="form-input"
                value={priceListData.serialNumber}
                onChange={(e) => handleDataChange('serialNumber', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select
                className="form-select"
                value={priceListData.category}
                onChange={(e) => handleDataChange('category', e.target.value)}
              >
                <option value="Valve">Valve</option>
                <option value="Cylinder">Cylinder</option>
                <option value="Tube">Tube</option>
                <option value="Seal">Seal</option>
                <option value="Fitting">Fitting</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Currency</label>
              <select
                className="form-select"
                value={priceListData.currency}
                onChange={(e) => handleDataChange('currency', e.target.value)}
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="ILS">ILS</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Effective Date</label>
              <input
                type="date"
                className="form-input"
                value={priceListData.effectiveDate}
                onChange={(e) => handleDataChange('effectiveDate', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Expiry Date</label>
              <input
                type="date"
                className="form-input"
                value={priceListData.expiryDate}
                onChange={(e) => handleDataChange('expiryDate', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Items Count */}
        <div className="items-count">
          <span className="count-text">Total Items: <strong>{items.length}</strong></span>
        </div>

        {/* Items Table */}
        <div className="price-table-container">
          <div className="price-table">
            {/* Table Header */}
            <div className="price-table-header">
              <div className="price-header-cell part-number">Part Number</div>
              <div className="price-header-cell description">Description</div>
              <div className="price-header-cell category">Category</div>
              <div className="price-header-cell list-price">List Price</div>
              <div className="price-header-cell discount-price">Discount Price</div>
              <div className="price-header-cell min-qty">Min Qty</div>
              <div className="price-header-cell unit">Unit</div>
              <div className="price-header-cell actions">Actions</div>
            </div>

            {/* Table Body */}
            <div className="price-table-body">
              {items.map(item => (
                <div key={item.id} className="price-table-row">
                  <div className="price-cell part-number">
                    <input
                      type="text"
                      className="cell-input"
                      value={item.partNumber}
                      onChange={(e) => handleItemChange(item.id, 'partNumber', e.target.value)}
                    />
                  </div>
                  <div className="price-cell description">
                    <input
                      type="text"
                      className="cell-input"
                      value={item.description}
                      onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                    />
                  </div>
                  <div className="price-cell category">
                    <input
                      type="text"
                      className="cell-input"
                      value={item.category}
                      onChange={(e) => handleItemChange(item.id, 'category', e.target.value)}
                    />
                  </div>
                  <div className="price-cell list-price">
                    <input
                      type="number"
                      className="cell-input"
                      value={item.listPrice}
                      onChange={(e) => handleItemChange(item.id, 'listPrice', e.target.value)}
                      step="0.01"
                    />
                  </div>
                  <div className="price-cell discount-price">
                    <input
                      type="number"
                      className="cell-input"
                      value={item.discountPrice}
                      onChange={(e) => handleItemChange(item.id, 'discountPrice', e.target.value)}
                      step="0.01"
                    />
                  </div>
                  <div className="price-cell min-qty">
                    <input
                      type="number"
                      className="cell-input"
                      value={item.minQuantity}
                      onChange={(e) => handleItemChange(item.id, 'minQuantity', e.target.value)}
                    />
                  </div>
                  <div className="price-cell unit">
                    <select
                      className="cell-select"
                      value={item.unit}
                      onChange={(e) => handleItemChange(item.id, 'unit', e.target.value)}
                    >
                      <option value="EA">EA</option>
                      <option value="BOX">BOX</option>
                      <option value="SET">SET</option>
                      <option value="KG">KG</option>
                      <option value="M">M</option>
                    </select>
                  </div>
                  <div className="price-cell actions">
                    <button
                      className="action-btn remove-btn"
                      onClick={() => handleRemoveItem(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Add Item Button */}
        <div className="add-item-section">
          <button className="btn-secondary add-item-btn-large" onClick={handleAddItem}>
            + Add New Item
          </button>
        </div>

        {/* Notes Section */}
        <div className="notes-section">
          <h3 className="section-title">Additional Notes</h3>
          <textarea
            className="form-textarea"
            placeholder="Enter any additional notes about this price list..."
            value={priceListData.notes}
            onChange={(e) => handleDataChange('notes', e.target.value)}
            rows="4"
          />
        </div>
      </div>
    </div>
  );
};

export default PriceListReview;

