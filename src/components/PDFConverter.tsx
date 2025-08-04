'use client';

import React, { useState, useCallback } from 'react';
import { Upload, Download, FileText, Image, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { PDFConverter, ConversionResult } from '../utils/pdfConverter';

const PDFConverterComponent: React.FC = () => {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      if (file.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        return;
      }
      setPdfFile(file);
      setError(null);
      setConversionResult(null);
    } else {
      setError('Please select a valid PDF file');
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);

    const file = event.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      if (file.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        return;
      }
      setPdfFile(file);
      setError(null);
      setConversionResult(null);
    } else {
      setError('Please drop a valid PDF file');
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
  };

  const convertPdfToSvg = useCallback(async () => {
    if (!pdfFile) return;

    setIsConverting(true);
    setError(null);
    setConversionResult(null);

    try {
      const result = await PDFConverter.convertPDFToSVG(pdfFile);
      setConversionResult(result);
    } catch (err) {
      console.error('Conversion failed:', err);
      setError(err instanceof Error ? err.message : 'Conversion failed');
    } finally {
      setIsConverting(false);
    }
  }, [pdfFile]);

  const downloadSvg = () => {
    if (!conversionResult) return;

    const blob = new Blob([conversionResult.svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pdfFile?.name?.replace('.pdf', '') || 'converted'}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const clearAll = () => {
    setPdfFile(null);
    setConversionResult(null);
    setError(null);
    setIsConverting(false);
    setDragOver(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            PDF to SVG Converter
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Upload your PDF file and convert it to SVG format. Perfect for architectural plans, 
            diagrams, and vector graphics that need to be scalable.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Upload Section */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
              <Upload className="w-5 h-5 mr-2" />
              Upload PDF
            </h2>

            {/* File Upload Area */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragOver
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="hidden"
                id="pdf-upload"
              />
              <label htmlFor="pdf-upload" className="cursor-pointer">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-lg font-medium text-gray-700 mb-2">
                  {pdfFile ? 'File selected' : 'Drop PDF here or click to browse'}
                </p>
                <p className="text-sm text-gray-500">
                  Maximum file size: 10MB
                </p>
              </label>
            </div>

            {/* File Info */}
            {pdfFile && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <FileText className="w-5 h-5 text-green-600 mr-2" />
                    <div>
                      <p className="font-medium text-green-800">{pdfFile.name}</p>
                      <p className="text-sm text-green-600">
                        {(pdfFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={clearAll}
                    className="text-red-600 hover:text-red-800 text-sm font-medium"
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center">
                  <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
                  <p className="text-red-800">{error}</p>
                </div>
              </div>
            )}

            {/* Convert Button */}
            {pdfFile && !conversionResult && (
              <button
                onClick={convertPdfToSvg}
                disabled={isConverting}
                className="mt-6 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center"
              >
                {isConverting ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Converting...
                  </>
                ) : (
                  <>
                    <Image className="w-5 h-5 mr-2" />
                    Convert to SVG
                  </>
                )}
              </button>
            )}
          </div>

          {/* Result Section */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
              <Image className="w-5 h-5 mr-2" />
              SVG Result
            </h2>

            {isConverting && (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
                  <p className="text-gray-600">Converting PDF to SVG...</p>
                  <p className="text-sm text-gray-500 mt-2">This may take a few moments</p>
                </div>
              </div>
            )}

            {conversionResult && (
              <div className="space-y-4">
                {/* Success Message */}
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                    <p className="text-green-800 font-medium">Conversion successful!</p>
                  </div>
                </div>

                {/* SVG Preview */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-100 p-2 border-b border-gray-200">
                    <p className="text-sm text-gray-600">Preview</p>
                  </div>
                  <div className="p-4 bg-white">
                    <div 
                      className="border border-gray-200 rounded overflow-auto"
                      style={{ 
                        maxHeight: '400px',
                        maxWidth: '100%'
                      }}
                    >
                      <div
                        dangerouslySetInnerHTML={{ __html: conversionResult.svgString }}
                        style={{
                          width: '100%',
                          height: 'auto',
                          minHeight: '200px'
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Download Button */}
                <button
                  onClick={downloadSvg}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center"
                >
                  <Download className="w-5 h-5 mr-2" />
                  Download SVG
                </button>

                {/* File Info */}
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-medium text-gray-800 mb-2">File Information</h3>
                  <div className="space-y-1 text-sm text-gray-600">
                    <p>Dimensions: {conversionResult.width} × {conversionResult.height} pixels</p>
                    <p>Format: SVG (Scalable Vector Graphics)</p>
                    <p>Size: {(conversionResult.svgString.length / 1024).toFixed(2)} KB</p>
                  </div>
                </div>
              </div>
            )}

            {!isConverting && !conversionResult && (
              <div className="text-center py-12 text-gray-500">
                <Image className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p>Upload a PDF file to see the converted SVG here</p>
              </div>
            )}
          </div>
        </div>

        {/* Features Section */}
        <div className="mt-12 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                <Upload className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="font-medium text-gray-800 mb-2">Easy Upload</h3>
              <p className="text-sm text-gray-600">
                Drag and drop or click to upload PDF files up to 10MB
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                <Image className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="font-medium text-gray-800 mb-2">High Quality</h3>
              <p className="text-sm text-gray-600">
                Convert PDFs to scalable SVG format with preserved quality
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                <Download className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="font-medium text-gray-800 mb-2">Instant Download</h3>
              <p className="text-sm text-gray-600">
                Download your converted SVG file immediately after conversion
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PDFConverterComponent;