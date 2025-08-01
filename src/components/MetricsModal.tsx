'use client';

import React from 'react';
import { X } from 'lucide-react';

interface Metric {
    id: string;
    type: 'circle' | 'rectangle' | 'polygon' | 'line';
    area: string;
    perimeter: string;
}

interface MetricsModalProps {
    isOpen: boolean;
    onClose: () => void;
    metrics: Metric[];
}

const MetricsModal: React.FC<MetricsModalProps> = ({ isOpen, onClose, metrics }) => {
    if (!isOpen) return null;

    const totalArea = metrics.reduce((sum, metric) => sum + parseFloat(metric.area), 0);
    const totalPerimeter = metrics.reduce((sum, metric) => sum + parseFloat(metric.perimeter), 0);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
                <div className="flex items-center justify-between p-6 border-b border-gray-200">
                    <h2 className="text-xl font-bold text-gray-800">Shape Measurements</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X className="h-6 w-6" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto max-h-[60vh]">
                    {metrics.length === 0 ? (
                        <div className="text-center py-8">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <p className="text-gray-500">No shapes drawn yet</p>
                            <p className="text-sm text-gray-400 mt-1">Draw some shapes to see their measurements</p>
                        </div>
                    ) : (
                        <>
                            {/* Summary */}
                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div className="bg-blue-50 p-4 rounded-lg">
                                    <h3 className="text-sm font-medium text-blue-800 mb-1">Total Area</h3>
                                    <p className="text-2xl font-bold text-blue-900">
                                        {totalArea.toFixed(2)} px²
                                    </p>
                                </div>
                                <div className="bg-green-50 p-4 rounded-lg">
                                    <h3 className="text-sm font-medium text-green-800 mb-1">Total Perimeter</h3>
                                    <p className="text-2xl font-bold text-green-900">
                                        {totalPerimeter.toFixed(2)} px
                                    </p>
                                </div>
                            </div>

                            {/* Individual Shapes */}
                            <div className="space-y-3">
                                <h3 className="text-lg font-semibold text-gray-800 mb-3">Individual Shapes</h3>
                                {metrics.map((metric, index) => (
                                    <div
                                        key={metric.id}
                                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border"
                                    >
                                        <div className="flex items-center space-x-3">
                                            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                                <span className="text-sm font-medium text-blue-600">
                                                    {index + 1}
                                                </span>
                                            </div>
                                            <div>
                                                <p className="font-medium text-gray-800 capitalize">
                                                    {metric.type} #{index + 1}
                                                </p>
                                                <p className="text-sm text-gray-500">ID: {metric.id.slice(0, 8)}...</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm text-gray-600">
                                                Area: <span className="font-medium text-blue-600">{metric.area} px²</span>
                                            </p>
                                            <p className="text-sm text-gray-600">
                                                Perimeter: <span className="font-medium text-green-600">{metric.perimeter} px</span>
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Shape Type Summary */}
                            <div className="mt-6">
                                <h3 className="text-lg font-semibold text-gray-800 mb-3">Shape Summary</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    {['circle', 'rectangle', 'polygon', 'line'].map((type) => {
                                        const typeMetrics = metrics.filter(m => m.type === type);
                                        if (typeMetrics.length === 0) return null;

                                        const typeArea = typeMetrics.reduce((sum, m) => sum + parseFloat(m.area), 0);
                                        const typePerimeter = typeMetrics.reduce((sum, m) => sum + parseFloat(m.perimeter), 0);

                                        return (
                                            <div key={type} className="bg-gray-50 p-3 rounded-lg">
                                                <h4 className="font-medium text-gray-800 capitalize mb-1">
                                                    {type}s ({typeMetrics.length})
                                                </h4>
                                                <p className="text-sm text-gray-600">
                                                    Area: {typeArea.toFixed(2)} px²
                                                </p>
                                                <p className="text-sm text-gray-600">
                                                    Perimeter: {typePerimeter.toFixed(2)} px
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="flex justify-end p-6 border-t border-gray-200">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MetricsModal; 