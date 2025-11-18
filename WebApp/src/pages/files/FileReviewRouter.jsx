import React from 'react';
import { useParams, useSearchParams, Navigate } from 'react-router-dom';
import { getUploadById } from '../../data/mockUploads';
import CatalogReview from './CatalogReview';
import SalesDrawingReview from './SalesDrawingReview';
import PriceListReview from './PriceListReview';

const FileReviewRouter = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const fileType = searchParams.get('type');

  // If we have a file type from URL params, use it (this is the primary path after upload)
  if (fileType) {
    switch (fileType) {
      case 'catalog':
        return <CatalogReview />;
      case 'sales-drawing':
        return <SalesDrawingReview />;
      case 'price-list':
        return <PriceListReview />;
      default:
        return <CatalogReview />;
    }
  }

  // If we have an ID in the path but no type, try to get file type from mock data
  if (id) {
    const upload = getUploadById(parseInt(id));
    
    if (!upload) {
      // File not found in mock data, but don't redirect - let the review page handle it
      console.warn('[FileReviewRouter] File not found in mock data, defaulting to catalog review');
      return <CatalogReview />;
    }

    // Route based on file type from mock data
    switch (upload.fileType) {
      case 'catalog':
        return <CatalogReview />;
      case 'sales-drawing':
        return <SalesDrawingReview />;
      case 'price-list':
        return <PriceListReview />;
      default:
        return <CatalogReview />;
    }
  }

  // No file type or ID provided, redirect to files page
  console.warn('[FileReviewRouter] No file type or ID provided, redirecting to files');
  return <Navigate to="/files" replace />;
};

export default FileReviewRouter;

