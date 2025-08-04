# PDF to SVG Converter

A Next.js application that allows you to view PDF files and convert them to SVG format using modern web technologies.

## Features

- **PDF Viewer**: View PDF files with page navigation
- **SVG Conversion**: Convert PDF pages to SVG format
- **File Upload**: Upload your own PDF files
- **Multiple Conversion Modes**:
  - Simple conversion (image-based)
  - Advanced conversion (with text extraction)
- **Batch Conversion**: Convert all pages at once
- **Automatic Download**: Generated SVG files are automatically downloaded

## Libraries Used

### Primary PDF Libraries

- **react-pdf**: ^7.6.0 - React component for PDF viewing
- **pdfjs-dist**: ^3.11.174 - PDF.js library for PDF processing
- **@react-pdf/renderer**: ^4.3.0 - PDF generation library

### Supporting Libraries

- **html2canvas**: ^1.4.1 - Screenshot capture functionality
- **jspdf**: ^3.0.1 - PDF generation with pins
- **jspdf-autotable**: ^5.0.2 - Table support in PDFs
- **canvas**: ^3.1.0 - Canvas operations

## Worker Configuration

The application uses the following worker source for PDF.js:

```javascript
pdfjs.GlobalWorkerOptions.workerSrc =
  "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
```

## Getting Started

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Run the development server**:

   ```bash
   npm run dev
   ```

3. **Open your browser** and navigate to `http://localhost:3000/convert`

## Usage

1. **Upload a PDF**: Use the file upload button to select a PDF file, or use the sample PDF provided
2. **Navigate Pages**: Use the Previous/Next buttons to navigate through PDF pages
3. **Choose Conversion Type**:
   - **Simple**: Converts the page to an image-based SVG
   - **Advanced**: Extracts text and creates a more detailed SVG
4. **Convert**: Click "Convert Current Page" to convert the current page, or "Convert All Pages" for batch conversion
5. **Download**: SVG files are automatically downloaded to your device

## File Structure

```
src/
├── app/
│   └── convert/
│       └── page.tsx          # Main PDF converter page
├── components/               # React components
├── utils/
│   ├── pdfConverter.ts       # PDF processing utilities
│   └── svgConverter.ts       # SVG conversion utilities
└── types/                    # TypeScript type definitions
```

## Technical Details

### SVG Conversion Process

1. **PDF Loading**: Uses PDF.js to load and parse PDF files
2. **Page Rendering**: Renders PDF pages to HTML5 canvas
3. **Text Extraction**: Extracts text content with positioning information
4. **SVG Generation**: Creates SVG with embedded images and text elements
5. **File Download**: Generates and downloads SVG files

### Conversion Modes

- **Simple Mode**: Creates SVG with embedded canvas image
- **Advanced Mode**: Extracts text content and creates text elements in SVG

## Browser Compatibility

This application works in modern browsers that support:

- ES6+ JavaScript
- HTML5 Canvas API
- File API
- Blob API

## Development

- **TypeScript**: Full TypeScript support
- **Tailwind CSS**: Styling framework
- **Next.js 15**: React framework with App Router
- **ESLint**: Code linting

## License

This project is open source and available under the MIT License.
