// Client-side only SVG converter
let pdfjs: any = null;

const getPdfjs = async () => {
    if (typeof window === 'undefined') {
        throw new Error('SVGConverter can only be used on the client side');
    }

    if (!pdfjs) {
        try {
            // Import pdfjs-dist directly with error handling
            pdfjs = await import('pdfjs-dist');

            // Set worker source
            if (pdfjs.GlobalWorkerOptions) {
                pdfjs.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
            }
        } catch (importError) {
            console.error('Failed to import pdfjs-dist:', importError);
            throw new Error('PDF library could not be loaded');
        }
    }

    return pdfjs;
};

export class SVGConverter {
    public static async convertPageToSVGWithText(pdfUrl: string, pageNumber: number): Promise<string> {
        if (typeof window === 'undefined') {
            throw new Error('SVGConverter can only be used on the client side');
        }

        try {
            const pdfjsInstance = await getPdfjs();

            // Load the PDF document
            const loadingTask = pdfjsInstance.getDocument(pdfUrl);
            const pdf = await loadingTask.promise;

            // Get the specific page
            const pdfPage = await pdf.getPage(pageNumber);

            // Set viewport for rendering
            const viewport = pdfPage.getViewport({ scale: 1.0 });

            // Create canvas for rendering
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            if (!context) {
                throw new Error('Could not get canvas context');
            }

            // Render PDF page to canvas
            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };

            await pdfPage.render(renderContext).promise;

            // Extract text content
            let svgText = '';
            try {
                const textContent = await pdfPage.getTextContent();
                for (const item of textContent.items) {
                    const { str, transform, height } = item;
                    const [a, b, c, d, e, f] = transform;
                    const fontSize = Math.abs(height) || 12;

                    svgText += `
                        <text 
                            x="${e}" 
                            y="${f}" 
                            font-family="Arial, sans-serif" 
                            font-size="${fontSize}" 
                            fill="black"
                            transform="matrix(${a} ${b} ${c} ${d} 0 0)"
                        >${str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>
                    `;
                }
            } catch (error) {
                console.warn('Could not extract text content:', error);
            }

            // Create the final SVG
            const svg = `
                <svg 
                    width="${viewport.width}" 
                    height="${viewport.height}" 
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 ${viewport.width} ${viewport.height}"
                >
                    <defs>
                        <pattern id="imagePattern" patternUnits="userSpaceOnUse" width="${viewport.width}" height="${viewport.height}">
                            <image 
                                width="${viewport.width}" 
                                height="${viewport.height}" 
                                href="data:image/png;base64,${canvas.toDataURL('image/png').split(',')[1]}"
                            />
                        </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#imagePattern)"/>
                    ${svgText}
                </svg>
            `;

            return svg;

        } catch (error) {
            console.error('Error converting PDF page to SVG:', error);
            throw error;
        }
    }

    public static downloadSVG(svgContent: string, filename: string): void {
        if (typeof window === 'undefined') {
            throw new Error('downloadSVG can only be used on the client side');
        }

        try {
            const blob = new Blob([svgContent], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error downloading SVG:', error);
            const newWindow = window.open();
            if (newWindow) {
                newWindow.document.write(svgContent);
                newWindow.document.close();
            }
        }
    }
}