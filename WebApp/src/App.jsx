import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Files from './pages/files/Files';
import FileUpload from './pages/files/FileUpload';
import FileReviewRouter from './pages/files/FileReviewRouter';
import CatalogReview from './pages/files/CatalogReview';
import SalesDrawingReview from './pages/files/SalesDrawingReview';
import PriceListReview from './pages/files/PriceListReview';
import SingleSearch from './pages/search/SingleSearch';
import MultiItemSearch from './pages/search/MultiItemSearch';
import Quotations from './pages/quotations/Quotations';
import NewQuotation from './pages/quotations/NewQuotation';
import EditQuotation from './pages/quotations/EditQuotation';
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
