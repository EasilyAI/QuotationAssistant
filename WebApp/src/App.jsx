import React from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ProtectedRoute from './components/ProtectedRoute';
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
import Products from './pages/Products';
import './styles/globals.css';

const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <MainLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'files', element: <Files /> },
      { path: 'files/upload', element: <FileUpload /> },
      { path: 'files/review', element: <FileReviewRouter /> },
      { path: 'files/review/:id', element: <FileReviewRouter /> },
      { path: 'files/review/catalog/:id', element: <CatalogReview /> },
      { path: 'files/review/sales-drawing/:id', element: <SalesDrawingReview /> },
      { path: 'files/review/price-list/:id', element: <PriceListReview /> },
      { path: 'search', element: <SingleSearch /> },
      { path: 'multi-search', element: <MultiItemSearch /> },
      { path: 'products', element: <Products /> },
      { path: 'quotations', element: <Quotations /> },
      { path: 'quotations/new', element: <NewQuotation /> },
      { path: 'quotations/metadata/:id', element: <NewQuotation /> },
      { path: 'quotations/edit/:id', element: <EditQuotation /> },
      { path: 'settings', element: <Settings /> },
      { path: 'product/:orderingNo', element: <ProductPage /> },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
