// Mock upload/file processing data for Dashboard
export const mockUploads = [
  {
    id: 1,
    fileName: 'ValvesCatalog_2025',
    fileType: 'catalog',
    productType: 'valve',
    createdAt: '2024-01-22',
    status: 'In Progress',
    totalItems: 156,
    processedItems: 89
  },
  {
    id: 2,
    fileName: 'CylindersAndActuators',
    fileType: 'catalog',
    productType: 'cylinder',
    createdAt: '2024-01-21',
    status: 'Pending',
    totalItems: 78,
    processedItems: 0
  },
  {
    id: 3,
    fileName: 'TubingAndFittings_Q1',
    fileType: 'catalog',
    productType: 'tube',
    createdAt: '2024-01-20',
    status: 'Completed',
    totalItems: 234,
    processedItems: 234
  },
  {
    id: 4,
    fileName: 'SealsAndGaskets_Master',
    fileType: 'catalog',
    productType: 'seal',
    createdAt: '2024-01-18',
    status: 'Completed',
    totalItems: 412,
    processedItems: 412
  },
  {
    id: 5,
    fileName: 'HydraulicCylinder_Technical',
    fileType: 'sales-drawing',
    productType: 'cylinder',
    createdAt: '2024-01-15',
    status: 'Completed',
    totalItems: 1,
    processedItems: 1
  },
  {
    id: 6,
    fileName: 'PneumaticValve_Assembly',
    fileType: 'sales-drawing',
    productType: 'valve',
    createdAt: '2024-01-12',
    status: 'Completed',
    totalItems: 1,
    processedItems: 1
  },
  {
    id: 7,
    fileName: 'Q1_2024_PriceList',
    fileType: 'price-list',
    productType: 'valve',
    createdAt: '2024-01-10',
    status: 'Completed',
    totalItems: 145,
    processedItems: 145
  },
  {
    id: 8,
    fileName: 'FittingsAndConnectors_Prices',
    fileType: 'price-list',
    productType: 'fitting',
    createdAt: '2024-01-08',
    status: 'Completed',
    totalItems: 89,
    processedItems: 89
  },
  {
    id: 9,
    fileName: 'IndustrialValves_2023',
    fileType: 'catalog',
    productType: 'valve',
    createdAt: '2023-11-15',
    status: 'Completed',
    totalItems: 325,
    processedItems: 325
  },
  {
    id: 10,
    fileName: 'ORings_Comprehensive',
    fileType: 'catalog',
    productType: 'seal',
    createdAt: '2023-10-20',
    status: 'Completed',
    totalItems: 567,
    processedItems: 567
  }
];

// Helper functions
export const getUploadById = (id) => {
  return mockUploads.find(upload => upload.id === id);
};

export const getInProgressUploads = () => {
  return mockUploads.filter(upload => upload.status === 'In Progress');
};

export const getCompletedUploads = () => {
  return mockUploads.filter(upload => upload.status === 'Completed');
};

export const getUploadProgress = (upload) => {
  if (!upload.totalItems) return 0;
  return Math.round((upload.processedItems / upload.totalItems) * 100);
};

