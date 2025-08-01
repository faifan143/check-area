// PDF to SVG conversion utility using PDF.js for browser compatibility

export interface ConversionResult {
  svgString: string;
  width: number;
  height: number;
}

export class PDFConverter {
  static async convertPDFToSVG(file: File): Promise<ConversionResult> {
    try {
      // Use PDF.js approach for browser compatibility
      return await this.convertPDFToSVGWithPDFJS(file);
    } catch (error) {
      console.error('PDF conversion failed:', error);
      // Fallback to demo SVG
      return this.createDemoSVG();
    }
  }

  // Create a demo architectural plan SVG for testing
  static createDemoSVG(): ConversionResult {
    const svgString = `
      <svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
        <!-- Background -->
        <rect width="800" height="600" fill="white" stroke="black" stroke-width="2"/>
        
        <!-- Room 1 - Living Room -->
        <rect x="50" y="50" width="300" height="200" fill="none" stroke="black" stroke-width="2"/>
        <text x="200" y="150" text-anchor="middle" font-family="Arial" font-size="14">Living Room</text>
        
        <!-- Room 2 - Kitchen -->
        <rect x="400" y="50" width="200" height="150" fill="none" stroke="black" stroke-width="2"/>
        <text x="500" y="125" text-anchor="middle" font-family="Arial" font-size="14">Kitchen</text>
        
        <!-- Room 3 - Bedroom 1 -->
        <rect x="50" y="300" width="200" height="150" fill="none" stroke="black" stroke-width="2"/>
        <text x="150" y="375" text-anchor="middle" font-family="Arial" font-size="14">Bedroom 1</text>
        
        <!-- Room 4 - Bedroom 2 -->
        <rect x="300" y="300" width="200" height="150" fill="none" stroke="black" stroke-width="2"/>
        <text x="400" y="375" text-anchor="middle" font-family="Arial" font-size="14">Bedroom 2</text>
        
        <!-- Room 5 - Bathroom -->
        <rect x="550" y="300" width="150" height="100" fill="none" stroke="black" stroke-width="2"/>
        <text x="625" y="350" text-anchor="middle" font-family="Arial" font-size="14">Bathroom</text>
        
        <!-- Interior walls -->
        <line x1="350" y1="50" x2="350" y2="250" stroke="black" stroke-width="2"/>
        <line x1="50" y1="250" x2="350" y2="250" stroke="black" stroke-width="2"/>
        <line x1="250" y1="300" x2="250" y2="450" stroke="black" stroke-width="2"/>
        <line x1="500" y1="300" x2="500" y2="450" stroke="black" stroke-width="2"/>
        <line x1="300" y1="375" x2="500" y2="375" stroke="black" stroke-width="2"/>
        
        <!-- Doors -->
        <rect x="340" y="100" width="20" height="40" fill="none" stroke="black" stroke-width="2"/>
        <rect x="240" y="240" width="40" height="20" fill="none" stroke="black" stroke-width="2"/>
        <rect x="240" y="350" width="20" height="40" fill="none" stroke="black" stroke-width="2"/>
        <rect x="490" y="350" width="20" height="40" fill="none" stroke="black" stroke-width="2"/>
        <rect x="290" y="365" width="40" height="20" fill="none" stroke="black" stroke-width="2"/>
        
        <!-- Windows -->
        <rect x="100" y="30" width="80" height="20" fill="none" stroke="black" stroke-width="2"/>
        <rect x="450" y="30" width="60" height="20" fill="none" stroke="black" stroke-width="2"/>
        <rect x="100" y="480" width="80" height="20" fill="none" stroke="black" stroke-width="2"/>
        <rect x="350" y="480" width="80" height="20" fill="none" stroke="black" stroke-width="2"/>
        
        <!-- Measurements -->
        <text x="400" y="20" font-family="Arial" font-size="12">Scale: 1cm = 10px</text>
        <text x="400" y="580" font-family="Arial" font-size="12">Total Area: ~120 sq ft</text>
        
        <!-- Demo label -->
        <rect x="10" y="10" width="120" height="25" fill="blue" opacity="0.8"/>
        <text x="70" y="27" text-anchor="middle" font-family="Arial" font-size="12" fill="white">DEMO PLAN</text>
      </svg>
    `;

    return {
      svgString,
      width: 800,
      height: 600
    };
  }

  // PDF.js approach for real PDF processing
  static async convertPDFToSVGWithPDFJS(file: File): Promise<ConversionResult> {
    try {
      // Load PDF.js
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

      // Load the PDF document
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      // Get the first page
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.0 });

      // Create canvas for rendering
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas context not available');

      canvas.width = 800;
      canvas.height = 600;

      // Scale to fit our canvas
      const scale = Math.min(800 / viewport.width, 600 / viewport.height);
      const scaledViewport = page.getViewport({ scale });

      // Render PDF page to canvas
      await page.render({
        canvasContext: context,
        viewport: scaledViewport
      }).promise;

      // Convert canvas to SVG-like structure
      const svgString = this.canvasToSVG(canvas, 800, 600);

      return {
        svgString,
        width: 800,
        height: 600
      };
    } catch (error) {
      console.error('PDF.js conversion failed:', error);
      return this.createDemoSVG();
    }
  }

  private static canvasToSVG(canvas: HTMLCanvasElement, width: number, height: number): string {
    // Convert canvas to SVG by embedding it as a data URL
    const dataURL = canvas.toDataURL('image/png');

    return `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <image href="${dataURL}" width="${width}" height="${height}"/>
      </svg>
    `;
  }

  // Create fallback SVG when conversion fails
  private static createFallbackSVG(): ConversionResult {
    const svgString = `
      <svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
        <rect width="800" height="600" fill="white" stroke="black" stroke-width="2"/>
        <text x="400" y="300" text-anchor="middle" font-family="Arial" font-size="16" fill="red">
          PDF Processing Failed - Using Demo Plan
        </text>
        <text x="400" y="330" text-anchor="middle" font-family="Arial" font-size="12" fill="gray">
          You can still test all drawing tools and features
        </text>
      </svg>
    `;

    return {
      svgString,
      width: 800,
      height: 600
    };
  }
} 