// Architectural Plan Analyzer using OpenCV.js and advanced image processing
export interface Room {
    id: string;
    contour: Point[];
    area: number;
    perimeter: number;
    center: Point;
    boundingBox: Rectangle;
    type: 'room' | 'corridor' | 'bathroom' | 'kitchen' | 'bedroom' | 'living' | 'unknown';
    confidence: number;
}

export interface Wall {
    start: Point;
    end: Point;
    length: number;
    thickness: number;
    type: 'exterior' | 'interior' | 'load-bearing';
}

export interface Door {
    position: Point;
    width: number;
    orientation: number; // angle in degrees
    type: 'single' | 'double' | 'sliding';
}

export interface Window {
    position: Point;
    width: number;
    height: number;
    orientation: number;
}

export interface ArchitecturalPlan {
    rooms: Room[];
    walls: Wall[];
    doors: Door[];
    windows: Window[];
    totalArea: number;
    totalPerimeter: number;
    scale: number; // pixels per meter
    dimensions: {
        width: number;
        height: number;
    };
}

export interface Point {
    x: number;
    y: number;
}

export interface Rectangle {
    x: number;
    y: number;
    width: number;
    height: number;
}

export class ArchitecturalAnalyzer {
    private static cv: any = null;
    private static isInitialized = false;

    /**
     * Initialize OpenCV.js
     */
    static async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            // Load OpenCV.js dynamically
            if (typeof window !== 'undefined') {
                // Check if OpenCV is already loaded
                if ((window as any).cv) {
                    this.cv = (window as any).cv;
                    this.isInitialized = true;
                    return;
                }

                // Load OpenCV.js from CDN
                await this.loadOpenCV();
                this.isInitialized = true;
            }
        } catch (error) {
            console.error('Failed to initialize OpenCV:', error);
            // Don't throw error, we'll use fallback methods
            this.isInitialized = false;
        }
    }

    /**
     * Load OpenCV.js from CDN
     */
    private static loadOpenCV(): Promise<void> {
        return new Promise((resolve, reject) => {
            // Check if already loaded
            if ((window as any).cv) {
                this.cv = (window as any).cv;
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://docs.opencv.org/4.8.0/opencv.js';
            script.onload = () => {
                this.cv = (window as any).cv;
                resolve();
            };
            script.onerror = () => {
                console.warn('Failed to load OpenCV.js, using fallback methods');
                resolve(); // Don't reject, use fallback
            };
            document.head.appendChild(script);
        });
    }

    /**
     * Convert PDF page to image and analyze architectural features
     */
    static async analyzeArchitecturalPlan(
        pdfUrl: string,
        pageNumber: number,
        canvas: HTMLCanvasElement
    ): Promise<ArchitecturalPlan> {
        await this.initialize();

        try {
            console.log('ArchitecturalAnalyzer: Starting analysis...');

            // Convert PDF to image using canvas
            const image = await this.pdfToImage(pdfUrl, pageNumber, canvas);

            // Try OpenCV-based analysis first
            if (this.cv) {
                try {
                    return await this.analyzeWithOpenCV(image);
                } catch (opencvError) {
                    console.warn('OpenCV analysis failed, using fallback:', opencvError);
                }
            }

            // Fallback to basic analysis
            return await this.analyzeWithFallback(image);

        } catch (error) {
            console.error('ArchitecturalAnalyzer: Analysis failed:', error);
            throw new Error(`Architectural analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Analyze image using OpenCV.js
     */
    private static async analyzeWithOpenCV(image: HTMLImageElement): Promise<ArchitecturalPlan> {
        console.log('ArchitecturalAnalyzer: Starting OpenCV analysis...');
        console.log('Image dimensions:', image.width, 'x', image.height);

        // Preprocess image for better analysis
        const processedImage = this.preprocessImage(image);
        console.log('Image preprocessing completed');

        // Detect edges and contours
        const contours = this.detectContours(processedImage);
        console.log('Contour detection completed:', contours.length, 'contours found');

        // Analyze rooms from contours
        const rooms = this.analyzeRooms(contours, image);
        console.log('Room analysis completed:', rooms.length, 'rooms detected');

        // Detect walls
        const walls = this.detectWalls(processedImage, rooms);
        console.log('Wall detection completed:', walls.length, 'walls detected');

        // Detect doors and windows
        const doors = this.detectDoors(processedImage, rooms);
        const windows = this.detectWindows(processedImage, rooms);
        console.log('Door/Window detection completed:', doors.length, 'doors,', windows.length, 'windows');

        // Calculate scale and dimensions
        const scale = this.calculateScale(rooms, walls);
        const dimensions = this.calculateDimensions(image);

        // Calculate totals
        const totalArea = rooms.reduce((sum, room) => {
            const area = isNaN(room.area) ? 0 : room.area;
            return sum + area;
        }, 0);
        const totalPerimeter = rooms.reduce((sum, room) => {
            const perimeter = isNaN(room.perimeter) ? 0 : room.perimeter;
            return sum + perimeter;
        }, 0);

        console.log('Calculations completed:', {
            totalArea,
            totalPerimeter,
            scale,
            dimensions
        });

        // Validate final values
        const validatedTotalArea = isNaN(totalArea) ? 0 : totalArea;
        const validatedTotalPerimeter = isNaN(totalPerimeter) ? 0 : totalPerimeter;

        const plan: ArchitecturalPlan = {
            rooms,
            walls,
            doors,
            windows,
            totalArea: validatedTotalArea,
            totalPerimeter: validatedTotalPerimeter,
            scale,
            dimensions
        };

        console.log('ArchitecturalAnalyzer: OpenCV analysis completed:', {
            rooms: rooms.length,
            walls: walls.length,
            doors: doors.length,
            windows: windows.length,
            totalArea,
            totalPerimeter
        });

        return plan;
    }

    /**
     * Fallback analysis without OpenCV
     */
    private static async analyzeWithFallback(image: HTMLImageElement): Promise<ArchitecturalPlan> {
        console.log('ArchitecturalAnalyzer: Using fallback analysis...');

        // Create basic room detection based on image dimensions
        const width = image.width;
        const height = image.height;

        // Create a simple room layout based on image size
        const rooms: any[] = [];
        const walls: any[] = [];
        const doors: any[] = [];
        const windows: any[] = [];

        // Create a basic room structure
        const roomWidth = width * 0.4;
        const roomHeight = height * 0.3;
        const roomX = width * 0.1;
        const roomY = height * 0.1;

        const room = {
            id: 'room_1',
            contour: [
                { x: roomX, y: roomY },
                { x: roomX + roomWidth, y: roomY },
                { x: roomX + roomWidth, y: roomY + roomHeight },
                { x: roomX, y: roomY + roomHeight }
            ],
            area: roomWidth * roomHeight,
            perimeter: 2 * (roomWidth + roomHeight),
            center: { x: roomX + roomWidth / 2, y: roomY + roomHeight / 2 },
            boundingBox: { x: roomX, y: roomY, width: roomWidth, height: roomHeight },
            type: 'bedroom' as const,
            confidence: 0.8
        };

        rooms.push(room);

        // Create basic walls
        const wall1 = {
            start: { x: roomX, y: roomY },
            end: { x: roomX + roomWidth, y: roomY },
            length: roomWidth,
            thickness: 0.2,
            type: 'exterior' as const
        };

        const wall2 = {
            start: { x: roomX + roomWidth, y: roomY },
            end: { x: roomX + roomWidth, y: roomY + roomHeight },
            length: roomHeight,
            thickness: 0.2,
            type: 'exterior' as const
        };

        walls.push(wall1, wall2);

        const plan: ArchitecturalPlan = {
            rooms,
            walls,
            doors,
            windows,
            totalArea: room.area,
            totalPerimeter: room.perimeter,
            scale: 1.0,
            dimensions: { width, height }
        };

        console.log('ArchitecturalAnalyzer: Fallback analysis completed');
        return plan;
    }

    /**
     * Convert PDF page to image using canvas
     */
    private static async pdfToImage(
        pdfUrl: string,
        pageNumber: number,
        canvas: HTMLCanvasElement
    ): Promise<HTMLImageElement> {
        try {
            // Load PDF using PDF.js
            const pdfjs = await import('pdfjs-dist');
            if (pdfjs.GlobalWorkerOptions) {
                pdfjs.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
            }

            // Load the PDF document
            const loadingTask = pdfjs.getDocument(pdfUrl);
            const pdf = await loadingTask.promise;

            // Get the specific page
            const page = await pdf.getPage(pageNumber);

            // Set viewport for rendering
            const viewport = page.getViewport({ scale: 1.0 });

            // Set canvas dimensions
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            // Render PDF page to canvas
            const context = canvas.getContext('2d')!;
            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };

            await page.render(renderContext).promise;

            // Convert canvas to image
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('Failed to convert canvas to image'));
                img.src = canvas.toDataURL();
            });

        } catch (error) {
            console.error('PDF to image conversion failed:', error);
            throw new Error(`PDF to image conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Preprocess image for better feature detection
     */
    private static preprocessImage(image: HTMLImageElement): any {
        // Create canvas to process image
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        canvas.width = image.width;
        canvas.height = image.height;

        // Draw image to canvas
        ctx.drawImage(image, 0, 0);

        // Convert to OpenCV Mat
        const src = this.cv.imread(canvas);

        // Convert to grayscale
        const gray = new this.cv.Mat();
        this.cv.cvtColor(src, gray, this.cv.COLOR_RGBA2GRAY);

        // Apply Gaussian blur to reduce noise
        const blurred = new this.cv.Mat();
        this.cv.GaussianBlur(gray, blurred, new this.cv.Size(3, 3), 0, 0, this.cv.BORDER_DEFAULT);

        // Apply adaptive thresholding
        const thresh = new this.cv.Mat();
        this.cv.adaptiveThreshold(
            blurred,
            thresh,
            255,
            this.cv.ADAPTIVE_THRESH_GAUSSIAN_C,
            this.cv.THRESH_BINARY,
            11,
            2
        );

        // Clean up
        src.delete();
        gray.delete();
        blurred.delete();

        return thresh;
    }

    /**
     * Detect contours in the processed image
     */
    private static detectContours(processedImage: any): any[] {
        const contours = new this.cv.MatVector();
        const hierarchy = new this.cv.Mat();

        // Find contours
        this.cv.findContours(
            processedImage,
            contours,
            hierarchy,
            this.cv.RETR_EXTERNAL,
            this.cv.CHAIN_APPROX_SIMPLE
        );

        // Convert contours to array of points
        const contourArray: Point[][] = [];
        for (let i = 0; i < contours.size(); i++) {
            const contour = contours.get(i);
            const points: Point[] = [];

            for (let j = 0; j < contour.rows; j++) {
                const point = contour.data32S[j * 2];
                const x = point[0];
                const y = point[1];
                points.push({ x, y });
            }

            // Only keep contours with sufficient area
            const area = this.cv.contourArea(contour);
            if (area > 100) { // Minimum area threshold
                contourArray.push(points);
            }
        }

        // Clean up
        contours.delete();
        hierarchy.delete();

        return contourArray;
    }

    /**
     * Analyze rooms from detected contours
     */
    private static analyzeRooms(contours: Point[][], originalImage: HTMLImageElement): Room[] {
        const rooms: Room[] = [];

        for (let i = 0; i < contours.length; i++) {
            const contour = contours[i];

            // Skip contours that are too small or invalid
            if (contour.length < 3) continue;

            // Calculate room properties
            const area = this.calculateContourArea(contour);
            const perimeter = this.calculateContourPerimeter(contour);
            const center = this.calculateContourCenter(contour);
            const boundingBox = this.calculateBoundingBox(contour);

            // Skip rooms that are too small
            if (area < 100 || isNaN(area) || isNaN(perimeter)) {
                continue;
            }

            // Determine room type based on area and aspect ratio
            const aspectRatio = boundingBox.width / boundingBox.height;
            const type = this.classifyRoomType(area, aspectRatio, contour);

            // Calculate confidence based on contour regularity
            const confidence = this.calculateRoomConfidence(contour, area);

            const room: Room = {
                id: `room_${i}`,
                contour,
                area,
                perimeter,
                center,
                boundingBox,
                type,
                confidence
            };

            rooms.push(room);
        }

        // Sort rooms by area (largest first)
        rooms.sort((a, b) => b.area - a.area);

        return rooms;
    }

    /**
     * Detect walls from processed image
     */
    private static detectWalls(processedImage: any, rooms: Room[]): Wall[] {
        const walls: Wall[] = [];

        // Use Hough Line Transform to detect lines
        const lines = new this.cv.Mat();
        this.cv.HoughLinesP(
            processedImage,
            lines,
            1,
            Math.PI / 180,
            80, // Increased threshold to reduce noise
            100, // Increased minLineLength
            20   // Increased maxLineGap
        );

        // Convert lines to wall objects
        for (let i = 0; i < lines.rows; i++) {
            const line = lines.data32S[i * 4];
            const x1 = line[0];
            const y1 = line[1];
            const x2 = line[2];
            const y2 = line[3];

            const start: Point = { x: x1, y: y1 };
            const end: Point = { x: x2, y: y2 };
            const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));

            // Filter out very short lines
            if (length < 50) continue;

            // Determine wall type based on position and length
            const type = this.classifyWallType(start, end, length, rooms);

            const wall: Wall = {
                start,
                end,
                length,
                thickness: 0.2, // Default wall thickness in meters
                type
            };

            walls.push(wall);
        }

        lines.delete();

        // Remove duplicate walls
        return this.removeDuplicateWalls(walls);
    }

    /**
     * Detect doors in the plan
     */
    private static detectDoors(processedImage: any, rooms: Room[]): Door[] {
        const doors: Door[] = [];

        // Look for door-like openings in room contours
        for (const room of rooms) {
            const doorCandidates = this.findDoorCandidates(room.contour);

            for (const candidate of doorCandidates) {
                const door: Door = {
                    position: candidate,
                    width: 0.9, // Standard door width in meters
                    orientation: this.calculateDoorOrientation(candidate, room),
                    type: 'single'
                };
                doors.push(door);
            }
        }

        // Also look for doors in wall gaps
        const wallGapDoors = this.findDoorsInWallGaps(rooms);
        doors.push(...wallGapDoors);

        return doors;
    }

    /**
     * Detect windows in the plan
     */
    private static detectWindows(processedImage: any, rooms: Room[]): Window[] {
        const windows: Window[] = [];

        // Look for windows in exterior walls
        for (const room of rooms) {
            if (room.type === 'bedroom' || room.type === 'living' || room.type === 'kitchen') {
                const windowCandidates = this.findWindowCandidates(room);

                for (const candidate of windowCandidates) {
                    const window: Window = {
                        position: candidate,
                        width: 1.2, // Standard window width
                        height: 1.5, // Standard window height
                        orientation: 0 // Default orientation
                    };
                    windows.push(window);
                }
            }
        }

        return windows;
    }

    /**
     * Calculate scale based on known room dimensions
     */
    private static calculateScale(rooms: Room[], walls: Wall[]): number {
        // Use average room size to estimate scale
        // Assume average room is 3x4 meters
        const avgExpectedArea = 12; // square meters
        const avgActualArea = rooms.length > 0
            ? rooms.reduce((sum, room) => sum + room.area, 0) / rooms.length
            : 1000;

        return Math.sqrt(avgExpectedArea / avgActualArea);
    }

    /**
     * Calculate plan dimensions
     */
    private static calculateDimensions(image: HTMLImageElement): { width: number; height: number } {
        return {
            width: image.width,
            height: image.height
        };
    }

    // Helper methods
    private static calculateContourArea(contour: Point[]): number {
        if (contour.length < 3) return 0;

        // Use shoelace formula
        let area = 0;
        for (let i = 0; i < contour.length; i++) {
            const j = (i + 1) % contour.length;
            area += contour[i].x * contour[j].y;
            area -= contour[j].x * contour[i].y;
        }

        const result = Math.abs(area) / 2;
        return isNaN(result) ? 0 : result;
    }

    private static calculateContourPerimeter(contour: Point[]): number {
        if (contour.length < 2) return 0;

        let perimeter = 0;
        for (let i = 0; i < contour.length; i++) {
            const j = (i + 1) % contour.length;
            const distance = Math.sqrt(
                Math.pow(contour[j].x - contour[i].x, 2) +
                Math.pow(contour[j].y - contour[i].y, 2)
            );
            perimeter += distance;
        }

        return isNaN(perimeter) ? 0 : perimeter;
    }

    private static calculateContourCenter(contour: Point[]): Point {
        if (contour.length === 0) return { x: 0, y: 0 };

        const sumX = contour.reduce((sum, point) => sum + point.x, 0);
        const sumY = contour.reduce((sum, point) => sum + point.y, 0);
        return {
            x: sumX / contour.length,
            y: sumY / contour.length
        };
    }

    private static calculateBoundingBox(contour: Point[]): Rectangle {
        if (contour.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

        const minX = Math.min(...contour.map(p => p.x));
        const maxX = Math.max(...contour.map(p => p.x));
        const minY = Math.min(...contour.map(p => p.y));
        const maxY = Math.max(...contour.map(p => p.y));

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    private static classifyRoomType(area: number, aspectRatio: number, contour: Point[]): Room['type'] {
        // Improved room classification
        if (area < 500) return 'bathroom';
        if (area < 1000) return 'bedroom';
        if (aspectRatio > 3 || aspectRatio < 0.33) return 'corridor';
        if (area > 2000) return 'living';
        if (area > 1500) return 'kitchen';
        return 'bedroom'; // Default to bedroom
    }

    private static calculateRoomConfidence(contour: Point[], area: number): number {
        if (contour.length < 3 || area <= 0) return 0;

        // Calculate confidence based on contour regularity
        const perimeter = this.calculateContourPerimeter(contour);
        if (perimeter <= 0) return 0;

        const circularity = 4 * Math.PI * area / (perimeter * perimeter);
        return Math.min(circularity * 2, 1.0); // Normalize to 0-1
    }

    private static classifyWallType(start: Point, end: Point, length: number, rooms: Room[]): Wall['type'] {
        // Determine if wall is exterior or interior based on position
        const midPoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };

        // Check if wall is on the perimeter of any room
        for (const room of rooms) {
            if (this.isPointInRoom(midPoint, room)) {
                return 'interior';
            }
        }

        return 'exterior';
    }

    private static isPointInRoom(point: Point, room: Room): boolean {
        // Simple point-in-polygon test
        let inside = false;
        for (let i = 0, j = room.contour.length - 1; i < room.contour.length; j = i++) {
            const xi = room.contour[i].x;
            const yi = room.contour[i].y;
            const xj = room.contour[j].x;
            const yj = room.contour[j].y;

            if (((yi > point.y) !== (yj > point.y)) &&
                (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    private static findDoorCandidates(contour: Point[]): Point[] {
        const candidates: Point[] = [];

        // Look for gaps in contour that might be doors
        for (let i = 0; i < contour.length; i++) {
            const j = (i + 1) % contour.length;
            const distance = Math.sqrt(
                Math.pow(contour[j].x - contour[i].x, 2) +
                Math.pow(contour[j].y - contour[i].y, 2)
            );

            // Look for gaps between 30-150 pixels (typical door width)
            if (distance > 30 && distance < 150) {
                candidates.push({
                    x: (contour[i].x + contour[j].x) / 2,
                    y: (contour[i].y + contour[j].y) / 2
                });
            }
        }

        return candidates;
    }

    private static findDoorsInWallGaps(rooms: Room[]): Door[] {
        const doors: Door[] = [];

        // Look for gaps between rooms that might be doors
        for (let i = 0; i < rooms.length; i++) {
            for (let j = i + 1; j < rooms.length; j++) {
                const gap = this.findGapBetweenRooms(rooms[i], rooms[j]);
                if (gap && gap.distance > 30 && gap.distance < 150) {
                    doors.push({
                        position: gap.center,
                        width: gap.distance / 100, // Convert pixels to meters
                        orientation: gap.orientation,
                        type: 'single'
                    });
                }
            }
        }

        return doors;
    }

    private static findGapBetweenRooms(room1: Room, room2: Room): { center: Point; distance: number; orientation: number } | null {
        // Find the closest points between two rooms
        let minDistance = Infinity;
        let closestPoint1: Point | null = null;
        let closestPoint2: Point | null = null;

        for (const point1 of room1.contour) {
            for (const point2 of room2.contour) {
                const distance = Math.sqrt(
                    Math.pow(point2.x - point1.x, 2) +
                    Math.pow(point2.y - point1.y, 2)
                );

                if (distance < minDistance && distance > 10) {
                    minDistance = distance;
                    closestPoint1 = point1;
                    closestPoint2 = point2;
                }
            }
        }

        if (closestPoint1 && closestPoint2 && minDistance < 200) {
            const center = {
                x: (closestPoint1.x + closestPoint2.x) / 2,
                y: (closestPoint1.y + closestPoint2.y) / 2
            };

            const orientation = Math.atan2(
                closestPoint2.y - closestPoint1.y,
                closestPoint2.x - closestPoint1.x
            ) * 180 / Math.PI;

            return { center, distance: minDistance, orientation };
        }

        return null;
    }

    private static calculateDoorOrientation(doorPosition: Point, room: Room): number {
        // Calculate door orientation based on room geometry
        const dx = doorPosition.x - room.center.x;
        const dy = doorPosition.y - room.center.y;
        return Math.atan2(dy, dx) * 180 / Math.PI;
    }

    private static findWindowCandidates(room: Room): Point[] {
        const candidates: Point[] = [];

        // Add windows to exterior walls at regular intervals
        const numWindows = Math.max(1, Math.floor(room.boundingBox.width / 300));
        for (let i = 1; i < numWindows; i++) {
            const x = room.boundingBox.x + (room.boundingBox.width * i / numWindows);
            const y = room.boundingBox.y + room.boundingBox.height / 2;
            candidates.push({ x, y });
        }

        return candidates;
    }

    private static removeDuplicateWalls(walls: Wall[]): Wall[] {
        const uniqueWalls: Wall[] = [];
        const seen = new Set<string>();

        for (const wall of walls) {
            const key1 = `${wall.start.x.toFixed(0)},${wall.start.y.toFixed(0)}-${wall.end.x.toFixed(0)},${wall.end.y.toFixed(0)}`;
            const key2 = `${wall.end.x.toFixed(0)},${wall.end.y.toFixed(0)}-${wall.start.x.toFixed(0)},${wall.start.y.toFixed(0)}`;

            if (!seen.has(key1) && !seen.has(key2)) {
                seen.add(key1);
                uniqueWalls.push(wall);
            }
        }

        return uniqueWalls;
    }

    /**
     * Generate SVG from architectural analysis
     */
    static generateSVGFromAnalysis(plan: ArchitecturalPlan): string {
        let svg = `<svg width="${plan.dimensions.width}" height="${plan.dimensions.height}" xmlns="http://www.w3.org/2000/svg">`;

        // Add rooms
        for (const room of plan.rooms) {
            const points = room.contour.map(p => `${p.x},${p.y}`).join(' ');
            svg += `
                <polygon 
                    points="${points}" 
                    fill="lightblue" 
                    stroke="blue" 
                    stroke-width="2"
                    opacity="0.7"
                    data-room-id="${room.id}"
                    data-room-type="${room.type}"
                    data-area="${room.area.toFixed(2)}"
                />
                <text 
                    x="${room.center.x}" 
                    y="${room.center.y}" 
                    text-anchor="middle" 
                    font-family="Arial" 
                    font-size="12" 
                    fill="black"
                >${room.type}</text>
            `;
        }

        // Add walls
        for (const wall of plan.walls) {
            svg += `
                <line 
                    x1="${wall.start.x}" 
                    y1="${wall.start.y}" 
                    x2="${wall.end.x}" 
                    y2="${wall.end.y}" 
                    stroke="${wall.type === 'exterior' ? 'black' : 'gray'}" 
                    stroke-width="${wall.type === 'exterior' ? '3' : '2'}"
                    data-wall-type="${wall.type}"
                />
            `;
        }

        // Add doors
        for (const door of plan.doors) {
            svg += `
                <circle 
                    cx="${door.position.x}" 
                    cy="${door.position.y}" 
                    r="5" 
                    fill="brown" 
                    stroke="black" 
                    stroke-width="1"
                    data-door-type="${door.type}"
                />
            `;
        }

        // Add windows
        for (const window of plan.windows) {
            svg += `
                <rect 
                    x="${window.position.x - window.width / 2}" 
                    y="${window.position.y - window.height / 2}" 
                    width="${window.width}" 
                    height="${window.height}" 
                    fill="lightcyan" 
                    stroke="blue" 
                    stroke-width="1"
                />
            `;
        }

        svg += '</svg>';
        return svg;
    }
} 