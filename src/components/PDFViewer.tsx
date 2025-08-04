'use client';
import { useEffect, useRef, useState } from 'react';

interface PDFViewerProps {
    url: string;
    pageNumber: number;
    onLoadSuccess?: (numPages: number) => void;
}

const PDFViewer: React.FC<PDFViewerProps> = ({ url, pageNumber, onLoadSuccess }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let pdfDoc: any = null;

        const loadAndRenderPDF = async () => {
            try {
                setIsLoading(true);
                setError(null);

                // Import pdfjs-dist with error handling
                let pdfjsLib;
                try {
                    pdfjsLib = await import('pdfjs-dist');
                } catch (importError) {
                    console.error('Failed to import pdfjs-dist:', importError);
                    throw new Error('PDF library could not be loaded');
                }

                // Set worker source
                if (pdfjsLib.GlobalWorkerOptions) {
                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
                }

                // Load PDF
                const loadingTask = pdfjsLib.getDocument(url);
                pdfDoc = await loadingTask.promise;

                onLoadSuccess?.(pdfDoc.numPages);

                // Render current page
                const page = await pdfDoc.getPage(pageNumber);
                const viewport = page.getViewport({ scale: 1.0 });

                const canvas = canvasRef.current;
                if (!canvas) return;

                const context = canvas.getContext('2d');
                if (!context) return;

                canvas.height = viewport.height;
                canvas.width = viewport.width;

                await page.render({
                    canvasContext: context,
                    viewport: viewport
                }).promise;

            } catch (err) {
                console.error('Error loading PDF:', err);
                setError('Failed to load PDF');
            } finally {
                setIsLoading(false);
            }
        };

        if (url) {
            loadAndRenderPDF();
        }

        return () => {
            if (pdfDoc) {
                pdfDoc.destroy();
            }
        };
    }, [url, pageNumber, onLoadSuccess]);

    if (isLoading) {
        return (
            <div className="flex justify-center items-center p-8">
                <p>Loading PDF...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex justify-center items-center p-8">
                <p className="text-red-500">{error}</p>
            </div>
        );
    }

    return (
        <div className="flex justify-center">
            <canvas
                ref={canvasRef}
                className="border rounded max-w-full"
                style={{ maxHeight: '70vh' }}
            />
        </div>
    );
};

export default PDFViewer; 