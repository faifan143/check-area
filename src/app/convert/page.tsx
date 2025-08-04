'use client';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import react-pdf components
const Document = dynamic(() => import('react-pdf').then(mod => ({ default: mod.Document })), {
    ssr: false,
    loading: () => <p>Loading PDF viewer...</p>
});

const Page = dynamic(() => import('react-pdf').then(mod => ({ default: mod.Page })), {
    ssr: false
});

const ConvertPage = () => {
    const [numPages, setNumPages] = useState(0);
    const [pageNumber, setPageNumber] = useState(1);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [isConverting, setIsConverting] = useState(false);

    // Initialize PDF.js worker
    useEffect(() => {
        if (typeof window !== 'undefined') {
            import('react-pdf').then(({ pdfjs }) => {
                pdfjs.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
            });
        }
    }, []);

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && file.type === 'application/pdf') {
            setPdfUrl(URL.createObjectURL(file));
            setPageNumber(1);
        }
    };

    const convertToSVG = async () => {
        if (!numPages || !pdfUrl) return;

        setIsConverting(true);
        try {
            const { SVGConverter } = await import('@/utils/svgConverter');
            const svgString = await SVGConverter.convertPageToSVGWithText(pdfUrl, pageNumber);
            SVGConverter.downloadSVG(svgString, `page-${pageNumber}.svg`);
        } catch (error) {
            console.error('Conversion failed:', error);
            alert('Conversion failed. Check console for details.');
        } finally {
            setIsConverting(false);
        }
    };

    const convertAllPages = async () => {
        if (!numPages || !pdfUrl) return;

        setIsConverting(true);
        try {
            const { SVGConverter } = await import('@/utils/svgConverter');
            for (let page = 1; page <= numPages; page++) {
                const svgString = await SVGConverter.convertPageToSVGWithText(pdfUrl, page);
                SVGConverter.downloadSVG(svgString, `page-${page}.svg`);
            }
            alert(`Converted ${numPages} pages to SVG`);
        } catch (error) {
            console.error('Conversion failed:', error);
            alert('Conversion failed. Check console for details.');
        } finally {
            setIsConverting(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-4">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-2xl font-bold text-center mb-6">PDF to SVG Converter</h1>

                {/* File Upload */}
                <div className="bg-white rounded-lg p-4 mb-4 shadow">
                    <input
                        type="file"
                        accept=".pdf"
                        onChange={handleFileUpload}
                        className="w-full p-2 border rounded"
                    />
                </div>

                {/* PDF Viewer */}
                {pdfUrl ? (
                    <div className="bg-white rounded-lg p-4 mb-4 shadow">
                        <Document
                            file={pdfUrl}
                            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                            error={<div className="text-red-500 text-center p-4">Error loading PDF</div>}
                            loading={<div className="text-center p-4">Loading PDF...</div>}
                        >
                            <div className="flex justify-center">
                                <Page
                                    pageNumber={pageNumber}
                                    className="border rounded"
                                    renderTextLayer={false}
                                    renderAnnotationLayer={false}
                                />
                            </div>
                        </Document>
                    </div>
                ) : (
                    <div className="bg-white rounded-lg p-8 mb-4 shadow text-center">
                        <p className="text-gray-500">Upload a PDF file to get started</p>
                    </div>
                )}

                {/* Controls */}
                {pdfUrl && (
                    <div className="bg-white rounded-lg p-4 shadow">
                        <div className="flex flex-wrap gap-2 justify-center mb-4">
                            <span className="text-sm text-gray-600">
                                Page {pageNumber} of {numPages}
                            </span>
                        </div>

                        <div className="flex flex-wrap gap-2 justify-center">
                            <button
                                onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
                                disabled={pageNumber <= 1}
                                className="px-4 py-2 bg-gray-500 text-white rounded disabled:opacity-50"
                            >
                                Previous
                            </button>

                            <button
                                onClick={() => setPageNumber(Math.min(numPages, pageNumber + 1))}
                                disabled={pageNumber >= numPages}
                                className="px-4 py-2 bg-gray-500 text-white rounded disabled:opacity-50"
                            >
                                Next
                            </button>

                            <button
                                onClick={convertToSVG}
                                disabled={isConverting || !numPages}
                                className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
                            >
                                {isConverting ? 'Converting...' : 'Convert Page'}
                            </button>

                            <button
                                onClick={convertAllPages}
                                disabled={isConverting || !numPages}
                                className="px-4 py-2 bg-green-500 text-white rounded disabled:opacity-50"
                            >
                                {isConverting ? 'Converting...' : 'Convert All'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ConvertPage;