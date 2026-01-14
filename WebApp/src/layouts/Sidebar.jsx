import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { signOut } from '../services/authService';
import './Sidebar.css';

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = () => {
    signOut();
    navigate('/login');
  };

  const menuItems = [
    {
      name: 'Home',
      path: '/dashboard',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 9L12 2L21 9V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M9 22V12H15V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    },
    {
      name: 'Quotations',
      path: '/quotations',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M16 13H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M16 17H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M10 9H9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    },
    {
      name: 'Catalogs & Files',
      path: '/files',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M13 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V9L13 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M13 2V9H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    },
    {
      name: 'Single Search',
      path: '/search',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M21 21L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )
    },
    {
      name: 'Multi Search',
      path: '/multi-search',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 6L18.29 8.29L13.41 13.17L9.41 9.17L2 16.59L3.41 18L9.41 12L13.41 16L19.71 9.71L22 12V6H16Z" fill="currentColor"/>
        </svg>
      )
    },
  ];

  const isActive = (path) => {
    return location.pathname === path;
  };

  return (
    <div className="sidebar">
      <div className="sidebar-content">
        <div className="sidebar-top">
          <div className="sidebar-header">
            <img 
              src="/images/Hirshberg-logo.png"
              alt="Hirshberg Group Logo" 
              className="sidebar-logo"
              onError={(e) => {
                const attemptedPath = e.target.src;
                console.error('Failed to load sidebar logo. Attempted path:', attemptedPath);
                
                // Try alternative paths
                const alternatives = [
                  `${process.env.PUBLIC_URL || ''}/images/Hirshberg-logo.png`,
                  `${window.location.origin}/images/Hirshberg-logo.png`
                ];
                
                const currentAttempt = alternatives.find(alt => !attemptedPath.includes(alt.split('/').pop()));
                if (currentAttempt && e.target.dataset.attempts !== '3') {
                  e.target.dataset.attempts = (parseInt(e.target.dataset.attempts || '0') + 1).toString();
                  e.target.src = currentAttempt;
                } else {
                  console.error('All image paths failed. Image will be hidden.');
                  e.target.style.display = 'none';
                }
              }}
            />
            <h4 className="sidebar-title">Quotation Assistant</h4>
          </div>
          <nav className="sidebar-nav">
            {menuItems
              // Hide unfinished sections from client navigation while keeping routes available
              .filter((item) => !['/products', '/settings'].includes(item.path))
              .map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`sidebar-nav-item ${isActive(item.path) ? 'active' : ''}`}
              >
                <div className="sidebar-nav-icon">{item.icon}</div>
                <span className="sidebar-nav-text">{item.name}</span>
              </Link>
            ))}
          </nav>
        </div>
        <div className="sidebar-bottom">
          <button onClick={handleSignOut} className="sidebar-signout">
            <div className="sidebar-nav-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M16 17L21 12L16 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="sidebar-nav-text">Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;

