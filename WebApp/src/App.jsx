import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Files from './pages/Files';
import FileUpload from './pages/FileUpload';
import FileReviewRouter from './pages/FileReviewRouter';
import CatalogReview from './pages/CatalogReview';
import SalesDrawingReview from './pages/SalesDrawingReview';
import PriceListReview from './pages/PriceListReview';
import SingleSearch from './pages/SingleSearch';
import MultiItemSearch from './pages/MultiItemSearch';
import Quotations from './pages/Quotations';
import NewQuotation from './pages/NewQuotation';
import EditQuotation from './pages/EditQuotation';
import Settings from './pages/Settings';
import ProductPage from './pages/ProductPage';
import './styles/globals.css';

function App() {
  return (
    <Router>
      <Routes>
        {/* Login Route (no layout) */}
        <Route path="/login" element={<Login />} />
        
        {/* Main App Routes (with sidebar layout) */}
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          
          {/* Files Routes */}
          <Route path="files" element={<Files />} />
          <Route path="files/upload" element={<FileUpload />} />
          <Route path="files/review" element={<FileReviewRouter />} />
          <Route path="files/review/:id" element={<FileReviewRouter />} />
          <Route path="files/review/catalog/:id" element={<CatalogReview />} />
          <Route path="files/review/sales-drawing/:id" element={<SalesDrawingReview />} />
          <Route path="files/review/price-list/:id" element={<PriceListReview />} />
          
          <Route path="search" element={<SingleSearch />} />
          <Route path="multi-search" element={<MultiItemSearch />} />
          <Route path="quotations" element={<Quotations />} />
          <Route path="quotations/new" element={<NewQuotation />} />
          <Route path="quotations/metadata/:id" element={<NewQuotation />} />
          <Route path="quotations/edit/:id" element={<EditQuotation />} />
          <Route path="settings" element={<Settings />} />
          <Route path="product/:orderingNo" element={<ProductPage />} />
        </Route>
        
        {/* Catch all - redirect to dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
