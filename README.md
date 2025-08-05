# PDF to SVG Converter with Architectural Analysis

A powerful web application that converts PDF architectural plans to SVG format with intelligent room, wall, door, and window detection using advanced computer vision techniques.

## 🏗️ Features

### Core Functionality

- **PDF to SVG Conversion**: Convert PDF architectural plans to scalable vector graphics
- **Architectural Feature Detection**: Automatically detect and classify:
  - **Rooms**: Bedrooms, living rooms, bathrooms, kitchens, corridors
  - **Walls**: Exterior and interior walls with thickness detection
  - **Doors**: Single, double, and sliding doors with orientation
  - **Windows**: Standard windows with dimensions and placement

### Advanced Analysis

- **Computer Vision Processing**: Uses OpenCV.js for image processing and feature detection
- **Contour Analysis**: Detects room boundaries and shapes
- **Line Detection**: Identifies walls using Hough Line Transform
- **Geometric Calculations**: Automatic area, perimeter, and scale calculations
- **Room Classification**: AI-powered room type classification based on size and shape

### User Interface

- **Real-time Preview**: Live PDF viewer with page navigation
- **Interactive Analysis**: Detailed breakdown of detected features
- **SVG Export**: Download high-quality SVG files
- **Batch Processing**: Convert multiple pages at once

## 🚀 Technology Stack

### Frontend

- **Next.js 14**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Modern styling and responsive design
- **React PDF**: PDF viewing and rendering

### Computer Vision

- **OpenCV.js**: Advanced image processing and feature detection
- **Contour Detection**: Room boundary identification
- **Hough Line Transform**: Wall and line detection
- **Adaptive Thresholding**: Image preprocessing for better analysis

### PDF Processing

- **PDF.js**: PDF parsing and rendering
- **Canvas API**: Image processing and conversion

## 📁 Project Structure

```
src/
├── app/
│   └── convert/
│       └── page.tsx          # Main conversion interface
├── utils/
│   ├── architecturalAnalyzer.ts  # Core architectural analysis
│   ├── geometricAnalyzer.ts      # Geometric calculations
│   └── svgConverter.ts           # PDF to SVG conversion
└── components/               # Reusable UI components
```

## 🔧 Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd pdf-to-svg-converter
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
   Navigate to `http://localhost:3000/convert`

## 🎯 How It Works

### 1. PDF Processing

- PDF files are loaded using PDF.js
- Pages are rendered to canvas for image processing
- High-resolution rendering ensures accurate analysis

### 2. Image Preprocessing

- **Grayscale Conversion**: Reduces complexity for analysis
- **Gaussian Blur**: Removes noise while preserving edges
- **Adaptive Thresholding**: Creates binary image for feature detection

### 3. Feature Detection

#### Room Detection

- **Contour Analysis**: Finds closed shapes in the plan
- **Area Calculation**: Uses shoelace formula for accurate area measurement
- **Shape Classification**: Determines room type based on size and aspect ratio
- **Confidence Scoring**: Evaluates detection quality

#### Wall Detection

- **Hough Line Transform**: Detects straight lines in the image
- **Line Filtering**: Removes noise and short segments
- **Wall Classification**: Distinguishes between exterior and interior walls
- **Thickness Estimation**: Calculates wall thickness based on line width

#### Door & Window Detection

- **Template Matching**: Identifies door and window patterns
- **Gap Analysis**: Finds openings in room contours
- **Orientation Calculation**: Determines door swing direction
- **Standard Sizing**: Applies typical architectural dimensions

### 4. SVG Generation

- **Vector Graphics**: Creates scalable SVG output
- **Color Coding**: Different colors for rooms, walls, doors, and windows
- **Interactive Elements**: Hover effects and data attributes
- **Export Options**: High-quality SVG files for further use

## 🎨 Analysis Results

The application provides detailed analysis including:

### Geometric Measurements

- **Total Area**: Combined area of all detected rooms
- **Total Perimeter**: Sum of all room perimeters
- **Room Count**: Number of detected rooms
- **Shape Distribution**: Breakdown of rectangles, circles, and polygons

### Architectural Features

- **Rooms**: Count and types (bedroom, living, bathroom, etc.)
- **Walls**: Number of exterior and interior walls
- **Doors**: Count and types (single, double, sliding)
- **Windows**: Number and placement

### Quality Metrics

- **Detection Confidence**: Reliability scores for each feature
- **Scale Estimation**: Automatic scale calculation
- **Error Handling**: Graceful fallback for complex plans

## 🔍 Use Cases

### Architecture & Design

- **Floor Plan Analysis**: Extract room dimensions and layouts
- **Space Planning**: Calculate areas for furniture placement
- **Renovation Planning**: Identify structural elements
- **Code Compliance**: Verify room sizes and accessibility

### Real Estate

- **Property Evaluation**: Accurate area calculations
- **Virtual Tours**: Generate interactive floor plans
- **Marketing Materials**: Create professional visualizations
- **Documentation**: Convert legacy plans to digital format

### Construction

- **Quantity Takeoff**: Calculate materials needed
- **Project Planning**: Analyze space utilization
- **Quality Control**: Verify plan accuracy
- **As-Built Documentation**: Record completed work

## 🛠️ Advanced Features

### Fallback Mechanisms

- **OpenCV.js Loading**: Graceful degradation if computer vision library fails
- **Basic Analysis**: Simple geometric analysis when advanced features unavailable
- **Error Recovery**: Continues processing even with partial failures

### Performance Optimization

- **Lazy Loading**: Loads OpenCV.js only when needed
- **Canvas Processing**: Efficient image manipulation
- **Memory Management**: Proper cleanup of large objects
- **Background Processing**: Non-blocking analysis operations

### Export Options

- **SVG Format**: Scalable vector graphics for any size
- **High Resolution**: Maintains quality at any scale
- **Interactive Elements**: Hover effects and data attributes
- **Batch Export**: Process multiple pages efficiently

## 🔧 Configuration

### Analysis Parameters

```typescript
// Room detection thresholds
const MIN_ROOM_AREA = 100; // Minimum room area in pixels
const MIN_WALL_LENGTH = 50; // Minimum wall length
const DOOR_WIDTH = 0.9; // Standard door width in meters
const WINDOW_WIDTH = 1.2; // Standard window width

// Image processing
const GAUSSIAN_BLUR_SIZE = 3; // Blur kernel size
const ADAPTIVE_THRESHOLD_BLOCK = 11; // Threshold block size
const HOUGH_LINE_THRESHOLD = 50; // Line detection threshold
```

### Customization

- **Room Types**: Add custom room classifications
- **Wall Types**: Define additional wall categories
- **Door Styles**: Support for custom door types
- **Window Types**: Add specialized window detection

## 🚀 Future Enhancements

### Planned Features

- **3D Visualization**: Convert 2D plans to 3D models
- **AI Enhancement**: Machine learning for better feature detection
- **Mobile Support**: Responsive design for mobile devices
- **Cloud Processing**: Server-side analysis for large files
- **API Integration**: REST API for programmatic access

### Advanced Analysis

- **Furniture Detection**: Identify and classify furniture
- **Electrical Layout**: Detect outlets and switches
- **Plumbing Systems**: Identify pipes and fixtures
- **HVAC Systems**: Detect vents and ductwork

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Development Setup

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **OpenCV.js**: Computer vision library for image processing
- **PDF.js**: PDF rendering and manipulation
- **React PDF**: PDF viewing components
- **Tailwind CSS**: Utility-first CSS framework

## 📞 Support

For support and questions:

- **Issues**: Create an issue on GitHub
- **Documentation**: Check the wiki for detailed guides
- **Community**: Join our Discord server

---

**Built with ❤️ for architects, designers, and construction professionals**
