import React, { useState, useRef, useEffect } from 'react';
import { ProductCategory } from '../types/index';
import './TypeDropdown.css';

const TypeDropdown = ({ value, onChange, className = '', variant = 'default' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const productTypes = ['All Types', ...Object.values(ProductCategory)];

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelect = (type) => {
    onChange(type);
    setIsOpen(false);
  };

  const buttonClass = variant === 'pill' ? 'type-dropdown-pill' : 'type-dropdown-button';
  const containerClass = variant === 'pill' ? 'type-dropdown-pill-wrapper' : 'type-dropdown-wrapper';

  return (
    <div className={`${containerClass} ${className}`} ref={dropdownRef}>
      <button 
        className={buttonClass}
        onClick={() => setIsOpen(!isOpen)}
      >
        {variant === 'pill' ? (
          <>
            <span className="filter-pill-label">Category:</span>
            <span className="filter-pill-value">{value}</span>
          </>
        ) : (
          <span>{value}</span>
        )}
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {isOpen && (
        <div className="dropdown-menu">
          {productTypes.map(type => (
            <div 
              key={type}
              className="dropdown-item"
              onClick={() => handleSelect(type)}
            >
              {type}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TypeDropdown;

