# Catalog and Files Management System

## Overview

The Catalog and Files Management System is a comprehensive solution for uploading, reviewing, and managing three types of industrial files:
1. **Catalogs** - Product catalogs with ordering numbers, descriptions, and specifications
2. **Sales Drawings** - Technical drawings with dimensions, materials, and specifications
3. **Price Lists** - Pricing information with part numbers, descriptions, and pricing details

## User Flow

### 1. Files Dashboard (`/files`)

The main files page displays:
- **Uploads in Progress**: Shows files currently being processed with progress bars
- **All Catalogs**: Displays all completed file uploads with search and filter capabilities

**Features:**
- Search files by name
- Filter by product category and year
- Sort files
- Quick actions: Keep, Edit, Delete (in-progress), View, Download (completed)

### 2. File Upload (`/files/upload`)

Three different upload forms based on file type:

#### Catalog Upload
- Product Name
- Product Category (dropdown: Valve, Cylinder, Tube, Seal, Fitting)
- Online link
- Year
- Description

#### Sales Drawing Upload
- Drawing Name
- Part Number
- Revision (e.g., Rev A)
- Manufacturer
- Year
- Notes

#### Price List Upload
- Price List Name
- Product Category
- Serial Number
- Year
- Online link
- Description

**Features:**
- Drag and drop file upload
- File type selector
- Browse files button
- File preview with size information
- Form validation

### 3. Review Screens

Different review interfaces for each file type:

#### Catalog Review (`/files/review/catalog/:id`)

**Table View:**
- Ordering Number (editable)
- Description (editable textarea)
- Specifications (key-value pairs, fully editable)
  - Add/remove specs dynamically
  - Each spec has a key and value field
- Manual Input (notes field)
- Actions: Save, Remove

**Additional Features:**
- Add new products
- Product count display
- PDF preview section
- Bulk save/finish review

#### Sales Drawing Review (`/files/review/sales-drawing/:id`)

**Split View:**
- Left: Form with sections
  - Basic Information (name, part number, revision, date, manufacturer)
  - Dimensions (key-value pairs)
  - Materials (key-value pairs)
  - Technical Specifications (key-value pairs)
  - Additional Notes
- Right: Drawing preview (sticky sidebar)

**Features:**
- Dynamic key-value field management
- Add/remove items in each section
- Drawing preview with full-size view option

#### Price List Review (`/files/review/price-list/:id`)

**Layout:**
- Price List Information section
  - Name, Serial Number, Category, Currency
  - Effective Date, Expiry Date
- Items table with columns:
  - Part Number
  - Description
  - Category
  - List Price
  - Discount Price
  - Min Quantity
  - Unit (dropdown: EA, BOX, SET, KG, M)
  - Actions (Remove)

**Features:**
- Add new items to price list
- Inline editing of all fields
- Currency selector
- Date range validation
- Item count display

## File Structure

```
webApp/src/
├── pages/
│   ├── Files.jsx                    # Main files dashboard
│   ├── Files.css                    # Files page styles
│   ├── FileUpload.jsx              # Universal upload form
│   ├── FileUpload.css              # Upload form styles
│   ├── FileReviewRouter.jsx        # Smart router for review pages
│   ├── CatalogReview.jsx           # Catalog review page
│   ├── CatalogReview.css           # Catalog review styles
│   ├── SalesDrawingReview.jsx      # Sales drawing review page
│   ├── SalesDrawingReview.css      # Sales drawing styles
│   ├── PriceListReview.jsx         # Price list review page
│   └── PriceListReview.css         # Price list styles
├── data/
│   └── mockUploads.js              # Mock data for file uploads
└── App.jsx                          # Updated routing
```

## Routes

```javascript
// Files Routes
/files                                    // Main files dashboard
/files/upload                             // File upload (with ?type= query param)
/files/upload?type=catalog                // Catalog upload
/files/upload?type=sales-drawing          // Sales drawing upload
/files/upload?type=price-list             // Price list upload
/files/review/:id                         // Smart router (determines type)
/files/review/catalog/:id                 // Catalog review
/files/review/sales-drawing/:id           // Sales drawing review
/files/review/price-list/:id              // Price list review
```

## Data Structure

### Upload Object
```javascript
{
  id: 1,
  fileName: 'ValvesCatalog_2025',
  fileType: 'catalog' | 'sales-drawing' | 'price-list',
  productType: 'valve' | 'cylinder' | 'tube' | 'seal' | 'fitting',
  createdAt: '2024-01-22',
  status: 'In Progress' | 'Pending' | 'Completed',
  totalItems: 156,
  processedItems: 89
}
```

### Catalog Product
```javascript
{
  id: 1,
  orderingNumber: "PN-12345",
  description: "High-Pressure Valve",
  specs: [
    { key: "Pressure", value: "1000psi" },
    { key: "Material", value: "316SS" }
  ],
  manualInput: "Additional notes"
}
```

### Sales Drawing
```javascript
{
  drawingName: "Hydraulic Cylinder Assembly",
  partNumber: "HC-2500-A",
  revision: "Rev C",
  manufacturer: "HydroTech Industries",
  date: "2024-01-15",
  dimensions: [{ key: "Overall Length", value: "2500mm" }],
  materials: [{ key: "Cylinder Body", value: "SAE 1045 Steel" }],
  specifications: [{ key: "Working Pressure", value: "250 bar" }],
  notes: ""
}
```

### Price List Item
```javascript
{
  id: 1,
  partNumber: "V-1000-SS",
  description: "Stainless Steel Ball Valve 1\"",
  category: "Ball Valve",
  listPrice: "125.00",
  discountPrice: "100.00",
  minQuantity: "10",
  unit: "EA"
}
```

## Styling

All pages follow the global design system defined in `/src/styles/globals.css`:

**Color Variables:**
- `--color-primary`: #2188C9
- `--color-background`: #FFFFFF
- `--color-background-gray`: #F0F2F5
- `--color-text-primary`: #121417
- `--color-text-secondary`: #637887
- `--color-border`: #DBE0E6

**Components:**
- `.btn-primary`: Primary action buttons
- `.btn-secondary`: Secondary action buttons
- `.form-input`, `.form-select`, `.form-textarea`: Form elements
- `.status-tag`: Status badges

## Responsive Design

All pages are responsive with breakpoints at:
- Desktop: > 1200px
- Tablet: 768px - 1200px
- Mobile: < 768px

Key responsive features:
- Grid layouts collapse to single column
- Tables show on mobile with adjusted layouts
- Forms stack vertically on smaller screens
- Sticky sidebars disabled on mobile

## Future Enhancements

1. **Backend Integration**
   - Connect to actual file processing API
   - Real-time upload progress tracking
   - File storage integration

2. **Advanced Features**
   - Batch operations (bulk delete, bulk download)
   - Export to various formats (Excel, PDF, CSV)
   - Version control for updated files
   - File comparison tools

3. **Collaboration**
   - Comments on products/items
   - Approval workflows
   - User assignments

4. **AI Features**
   - Auto-fill suggestions based on uploaded content
   - Smart field mapping
   - Duplicate detection

## Development Notes

- All mock data is in `/src/data/mockUploads.js`
- The `FileReviewRouter` component automatically routes to the correct review page based on file type
- Each review page is self-contained with its own state management
- CSS files use BEM-like naming conventions for maintainability
- All forms include validation (to be implemented with actual submission)

## Testing Checklist

- [ ] Upload flow for all three file types
- [ ] File type switching in upload form
- [ ] Drag and drop functionality
- [ ] File preview and removal
- [ ] Navigation between pages
- [ ] Edit/Delete actions for in-progress files
- [ ] View/Download actions for completed files
- [ ] Search and filter functionality
- [ ] Spec/dimension/material field management (add/remove)
- [ ] Form validation
- [ ] Responsive layout on various screen sizes
- [ ] Browser compatibility (Chrome, Firefox, Safari, Edge)

