// Shared mock quotations data
import { QuotationStatus } from '../types/index';
export const mockQuotations = [
  {
    id: '12345',
    quotationNumber: '#12345',
    name: 'Leon levi 10 valves',
    customer: 'Leon levi',
    status: QuotationStatus.DRAFT,
    itemCount: 5,
    totalValue: 1025.00,
    incompleteItems: 2,
    createdDate: '2024-01-20',
    lastModified: '2024-10-27',
    currency: 'USD',
    defaultMargin: 20,
    notes: 'Standard valve order for Leon Levi. Client requested urgent delivery.'
  },
  {
    id: '12344',
    quotationNumber: '#12344',
    name: 'Intel December 2025',
    customer: 'Intel',
    status: QuotationStatus.IN_PROGRESS,
    itemCount: 8,
    totalValue: 3250.00,
    incompleteItems: 0,
    createdDate: '2024-01-20',
    lastModified: '2024-10-26',
    currency: 'USD',
    defaultMargin: 18,
    notes: 'Large order for Intel. Special pricing agreed with purchasing department.'
  },
  {
    id: '12343',
    quotationNumber: '#12343',
    name: 'Quotation 2',
    customer: 'Customer B',
    status: QuotationStatus.AWAITING_APPROVAL,
    itemCount: 12,
    totalValue: 5780.00,
    incompleteItems: 0,
    createdDate: '2024-01-18',
    lastModified: '2024-10-25',
    currency: 'EUR',
    defaultMargin: 25,
    notes: 'European customer, all prices in EUR.'
  },
  {
    id: '12342',
    quotationNumber: '#12342',
    name: 'Industrial Parts Co Order',
    customer: 'Industrial Parts Co',
    status: QuotationStatus.APPROVED,
    itemCount: 6,
    totalValue: 2100.00,
    incompleteItems: 0,
    createdDate: '2024-01-10',
    lastModified: '2024-01-20',
    currency: 'USD',
    defaultMargin: 22,
    notes: 'Completed and shipped.'
  },
  {
    id: '12341',
    quotationNumber: '#12341',
    name: 'Global Manufacturing Q4',
    customer: 'Global Manufacturing',
    status: QuotationStatus.ORDER,
    itemCount: 15,
    totalValue: 8900.00,
    incompleteItems: 0,
    createdDate: '2024-01-05',
    lastModified: '2024-01-15',
    currency: 'USD',
    defaultMargin: 20,
    notes: 'Q4 quarterly order. Client very satisfied with delivery time.'
  }
];

export const getQuotationsByStatus = (status) => {
  return mockQuotations.filter(q => q.status === status);
};

export const getDraftQuotations = () => {
  return mockQuotations.filter(q => 
    q.status === QuotationStatus.DRAFT || q.incompleteItems > 0
  );
};

export const getRecentQuotations = (limit = 10) => {
  return [...mockQuotations]
    .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified))
    .slice(0, limit);
};

