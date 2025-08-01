# Architectural Plan Editor

A professional, client-side-only Next.js web application that allows users to upload architectural plans in PDF format, convert them to SVG, calculate areas, perimeters, and distances, color rooms with a smart flood fill tool, and draw customizable shapes with precision measurements.

## Features

### Core Functionality
- **PDF Upload & SVG Conversion**: Upload PDF architectural plans and convert them to SVG for vector-based manipulation
- **Shape Drawing**: Draw circles, rectangles, polygons, and lines with two-click interactions
- **Geometric Calculations**: Calculate areas, perimeters, and distances for all drawn shapes
- **Smart Flood Fill**: Color enclosed regions (rooms) with a color picker
- **Curved Shapes**: Add Bezier curves to rectangles, polygons, and lines (except circles)
- **Real-time Measurements**: Get instant calculations for all geometric properties

### Technical Features
- **Client-side Only**: All processing happens in the browser with no server-side dependencies
- **High Performance**: Optimized canvas rendering with Konva.js
- **Responsive Design**: Works on desktop and tablet devices
- **Modern UI**: Clean, intuitive interface built with Tailwind CSS
- **TypeScript**: Full type safety and better development experience

## Tech Stack

- **Framework**: Next.js 15.4.5 with App Router
- **Canvas Library**: Konva.js + React-Konva
- **Styling**: Tailwind CSS
- **Mathematics**: Math.js for geometric calculations
- **File Processing**: pdf2pic, Jimp, Potrace (for PDF-to-SVG conversion)
- **Utilities**: UUID for unique identifiers
- **Language**: TypeScript

## Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd check-area
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run the development server**
   ```bash
   npm run dev
   ```

4. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

### Building for Production

1. **Build the application**
   ```bash
   npm run build
   ```

2. **Start the production server**
   ```bash
   npm start
   ```

3. **Export for static hosting**
   ```bash
   npm run export
   ```

## Usage Guide

### Basic Workflow

1. **Upload PDF Plan**
   - Click "Choose PDF File" or drag and drop a PDF file
   - Maximum file size: 10MB
   - The app will convert the PDF to SVG and display it on the canvas

2. **Draw Shapes**
   - Select a drawing tool (Line, Circle, Rectangle, Polygon)
   - Click twice on the canvas to draw:
     - **Line**: First click = start point, second click = end point
     - **Circle**: First click = leftmost point, second click = rightmost point
     - **Rectangle**: First click = top-left corner, second click = bottom-right corner
     - **Polygon**: First click = first vertex, second click = second vertex (creates a triangle)

3. **Calculate Measurements**
   - Click "Calculate Metrics" button to see areas and perimeters
   - Results are displayed in a popup with detailed information

4. **Flood Fill Rooms**
   - Select a color from the color picker
   - Click on enclosed areas to fill them with color

5. **Adjust Curves**
   - Select a non-circular shape from the shapes list
   - Click "Curve" button to add Bezier curve control points
   - Drag control points to adjust the curve

### Advanced Features

#### Shape Management
- View all drawn shapes in the sidebar
- Delete individual shapes
- Clear all shapes or reset the entire canvas
- Each shape has a unique ID and color indicator

#### Geometric Calculations
- **Circles**: Area = πr², Perimeter = 2πr
- **Rectangles**: Area = width × height, Perimeter = 2(width + height)
- **Polygons**: Shoelace formula for area, sum of side lengths for perimeter
- **Lines**: Euclidean distance calculation

#### Performance Optimizations
- Canvas caching for smooth rendering
- Efficient shape storage and updates
- Optimized PDF processing pipeline

## Project Structure

```
check-area/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout with metadata
│   │   ├── page.tsx            # Main application page
│   │   └── globals.css         # Global styles
│   ├── components/
│   │   ├── Canvas.tsx          # Main canvas component with Konva.js
│   │   └── Controls.tsx        # Sidebar controls and UI
│   └── utils/
│       └── pdfConverter.ts     # PDF to SVG conversion utility
├── public/                     # Static assets
├── package.json               # Dependencies and scripts
├── next.config.ts             # Next.js configuration
├── tailwind.config.js         # Tailwind CSS configuration
└── tsconfig.json              # TypeScript configuration
```

## Development

### Key Components

#### Canvas Component (`src/components/Canvas.tsx`)
- Handles PDF-to-SVG conversion
- Manages Konva.js canvas rendering
- Implements shape drawing logic
- Calculates geometric measurements
- Manages flood fill functionality

#### Controls Component (`src/components/Controls.tsx`)
- File upload interface with drag-and-drop
- Drawing mode selection
- Color picker for flood fill
- Shape management and deletion
- Canvas actions (clear, reset)

#### PDF Converter (`src/utils/pdfConverter.ts`)
- Converts PDF files to SVG format
- Handles image processing pipeline
- Creates placeholder architectural plans for demonstration

### Adding New Features

#### New Shape Types
1. Add shape type to the `Shape` interface
2. Implement drawing logic in `handleCanvasClick`
3. Add rendering logic in the shapes mapping
4. Update geometric calculations
5. Add UI button in Controls component

#### Enhanced PDF Processing
1. Implement real PDF-to-SVG conversion using pdf2pic + Jimp + Potrace
2. Add Web Workers for heavy processing
3. Implement multi-page support
4. Add progress indicators

#### Additional Tools
1. Add measurement tools (ruler, protractor)
2. Implement undo/redo functionality
3. Add shape grouping and layers
4. Create export functionality (PNG, SVG, PDF)

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Performance Considerations

- **File Size**: PDF files are limited to 10MB for optimal performance
- **Canvas Size**: Default canvas size is 800x600 pixels
- **Shape Count**: Large numbers of shapes may impact performance
- **Memory Usage**: SVG conversion and canvas operations are memory-intensive

## Troubleshooting

### Common Issues

1. **PDF Upload Fails**
   - Ensure file is a valid PDF
   - Check file size (max 10MB)
   - Try refreshing the page

2. **Shapes Not Drawing**
   - Make sure a drawing mode is selected
   - Check browser console for errors
   - Ensure canvas is visible and not covered

3. **Calculations Not Working**
   - Verify shapes are properly drawn
   - Check for JavaScript errors in console
   - Ensure Math.js is properly loaded

4. **Performance Issues**
   - Reduce number of shapes
   - Use smaller PDF files
   - Close other browser tabs

### Debug Mode

Enable debug logging by adding `?debug=true` to the URL:
```
http://localhost:3000?debug=true
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Konva.js team for the excellent canvas library
- Next.js team for the amazing React framework
- Tailwind CSS for the utility-first CSS framework
- All contributors and users of this project

## Roadmap

### Phase 1 (Current)
- ✅ Basic PDF upload and SVG conversion
- ✅ Shape drawing (circle, rectangle, polygon, line)
- ✅ Geometric calculations
- ✅ Basic flood fill
- ✅ Responsive UI

### Phase 2 (Planned)
- 🔄 Real PDF-to-SVG conversion with pdf2pic + Jimp + Potrace
- 🔄 Advanced Bezier curve editing
- 🔄 Multi-page PDF support
- 🔄 Undo/redo functionality

### Phase 3 (Future)
- 📋 Measurement tools (ruler, protractor)
- 📋 Shape grouping and layers
- 📋 Export functionality (PNG, SVG, PDF)
- 📋 Collaboration features
- 📋 Cloud storage integration

---

**Note**: This is a demonstration application. For production use, implement proper error handling, security measures, and performance optimizations. 