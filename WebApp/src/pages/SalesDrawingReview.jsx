import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import './SalesDrawingReview.css';

const SalesDrawingReview = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  const [drawingData, setDrawingData] = useState({
    drawingName: "Hydraulic Cylinder Assembly",
    partNumber: "HC-2500-A",
    revision: "Rev C",
    manufacturer: "HydroTech Industries",
    date: "2024-01-15",
    notes: "",
    dimensions: [
      { key: "Overall Length", value: "2500mm" },
      { key: "Bore Diameter", value: "100mm" },
      { key: "Rod Diameter", value: "56mm" },
      { key: "Stroke", value: "1200mm" }
    ],
    materials: [
      { key: "Cylinder Body", value: "SAE 1045 Steel" },
      { key: "Piston Rod", value: "Chrome Plated CK45" },
      { key: "Seals", value: "NBR/Polyurethane" }
    ],
    specifications: [
      { key: "Working Pressure", value: "250 bar" },
      { key: "Test Pressure", value: "375 bar" },
      { key: "Operating Temperature", value: "-20°C to +80°C" }
    ]
  });

  const handleInputChange = (field, value) => {
    setDrawingData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleArrayChange = (arrayName, index, field, value) => {
    setDrawingData(prev => ({
      ...prev,
      [arrayName]: prev[arrayName].map((item, idx) =>
        idx === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const handleAddItem = (arrayName) => {
    setDrawingData(prev => ({
      ...prev,
      [arrayName]: [...prev[arrayName], { key: "", value: "" }]
    }));
  };

  const handleRemoveItem = (arrayName, index) => {
    setDrawingData(prev => ({
      ...prev,
      [arrayName]: prev[arrayName].filter((_, idx) => idx !== index)
    }));
  };

  const handleSave = () => {
    console.log('Saving drawing data:', drawingData);
    navigate('/files');
  };

  const handleCancel = () => {
    navigate('/files');
  };

  return (
    <div className="sales-drawing-review-page">
      <div className="sales-drawing-review-container">
        {/* Header */}
        <div className="review-header">
          <div className="review-header-content">
            <h1 className="review-title">Sales Drawing Review & Verification</h1>
            <p className="review-subtitle">Review and verify technical drawing information</p>
          </div>
          <div className="review-header-actions">
            <button className="btn-secondary" onClick={handleCancel}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handleSave}>
              Save Drawing
            </button>
          </div>
        </div>

        <div className="drawing-review-layout">
          {/* Left Side - Form */}
          <div className="drawing-form-section">
            {/* Basic Information */}
            <div className="form-section">
              <h3 className="section-title">Basic Information</h3>
              <div className="form-group">
                <label className="form-label">Drawing Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={drawingData.drawingName}
                  onChange={(e) => handleInputChange('drawingName', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Part Number</label>
                <input
                  type="text"
                  className="form-input"
                  value={drawingData.partNumber}
                  onChange={(e) => handleInputChange('partNumber', e.target.value)}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Revision</label>
                  <input
                    type="text"
                    className="form-input"
                    value={drawingData.revision}
                    onChange={(e) => handleInputChange('revision', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={drawingData.date}
                    onChange={(e) => handleInputChange('date', e.target.value)}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Manufacturer</label>
                <input
                  type="text"
                  className="form-input"
                  value={drawingData.manufacturer}
                  onChange={(e) => handleInputChange('manufacturer', e.target.value)}
                />
              </div>
            </div>

            {/* Dimensions */}
            <div className="form-section">
              <h3 className="section-title">Dimensions</h3>
              <div className="key-value-list">
                {drawingData.dimensions.map((dim, idx) => (
                  <div key={idx} className="key-value-item">
                    <input
                      type="text"
                      className="key-input"
                      placeholder="Dimension"
                      value={dim.key}
                      onChange={(e) => handleArrayChange('dimensions', idx, 'key', e.target.value)}
                    />
                    <span className="separator">:</span>
                    <input
                      type="text"
                      className="value-input"
                      placeholder="Value"
                      value={dim.value}
                      onChange={(e) => handleArrayChange('dimensions', idx, 'value', e.target.value)}
                    />
                    <button
                      className="remove-item-btn"
                      onClick={() => handleRemoveItem('dimensions', idx)}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  className="add-item-btn"
                  onClick={() => handleAddItem('dimensions')}
                >
                  + Add Dimension
                </button>
              </div>
            </div>

            {/* Materials */}
            <div className="form-section">
              <h3 className="section-title">Materials</h3>
              <div className="key-value-list">
                {drawingData.materials.map((mat, idx) => (
                  <div key={idx} className="key-value-item">
                    <input
                      type="text"
                      className="key-input"
                      placeholder="Component"
                      value={mat.key}
                      onChange={(e) => handleArrayChange('materials', idx, 'key', e.target.value)}
                    />
                    <span className="separator">:</span>
                    <input
                      type="text"
                      className="value-input"
                      placeholder="Material"
                      value={mat.value}
                      onChange={(e) => handleArrayChange('materials', idx, 'value', e.target.value)}
                    />
                    <button
                      className="remove-item-btn"
                      onClick={() => handleRemoveItem('materials', idx)}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  className="add-item-btn"
                  onClick={() => handleAddItem('materials')}
                >
                  + Add Material
                </button>
              </div>
            </div>

            {/* Specifications */}
            <div className="form-section">
              <h3 className="section-title">Technical Specifications</h3>
              <div className="key-value-list">
                {drawingData.specifications.map((spec, idx) => (
                  <div key={idx} className="key-value-item">
                    <input
                      type="text"
                      className="key-input"
                      placeholder="Specification"
                      value={spec.key}
                      onChange={(e) => handleArrayChange('specifications', idx, 'key', e.target.value)}
                    />
                    <span className="separator">:</span>
                    <input
                      type="text"
                      className="value-input"
                      placeholder="Value"
                      value={spec.value}
                      onChange={(e) => handleArrayChange('specifications', idx, 'value', e.target.value)}
                    />
                    <button
                      className="remove-item-btn"
                      onClick={() => handleRemoveItem('specifications', idx)}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  className="add-item-btn"
                  onClick={() => handleAddItem('specifications')}
                >
                  + Add Specification
                </button>
              </div>
            </div>

            {/* Notes */}
            <div className="form-section">
              <h3 className="section-title">Additional Notes</h3>
              <div className="form-group">
                <textarea
                  className="form-textarea"
                  placeholder="Enter any additional notes or comments..."
                  value={drawingData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  rows="5"
                />
              </div>
            </div>
          </div>

          {/* Right Side - Drawing Preview */}
          <div className="drawing-preview-section">
            <div className="drawing-preview-header">
              <h3 className="section-title">Drawing Preview</h3>
              <button className="btn-secondary">Open Full Size</button>
            </div>
            <div className="drawing-preview-container">
              <div className="drawing-preview-placeholder">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="#637887" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 17L12 22L22 17" stroke="#637887" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 12L12 17L22 12" stroke="#637887" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <p>Technical Drawing Preview</p>
                <p className="preview-subtitle">The uploaded drawing will be displayed here</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalesDrawingReview;

