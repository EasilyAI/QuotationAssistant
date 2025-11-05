import React from 'react';
import { useParams, useSearchParams, Navigate } from 'react-router-dom';
import { getUploadById } from '../data/mockUploads';
import CatalogReview from './CatalogReview';
import SalesDrawingReview from './SalesDrawingReview';
import PriceListReview from './PriceListReview';

const FileReviewRouter = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const fileType = searchParams.get('type');

  // If we have a file type from URL params, use it
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

  // Otherwise, try to get file type from mock data
  const upload = getUploadById(parseInt(id));
  
  if (!upload) {
    // File not found, redirect to files page
    return <Navigate to="/files" replace />;
  }

  // Route based on file type
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
};

export default FileReviewRouter;

