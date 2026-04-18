'use client';

export interface ProcessingProgressProps {
  progress: number;
  fileName: string;
  processedCount: number;
}

export default function ProcessingProgress({
  progress,
  fileName,
  processedCount,
}: ProcessingProgressProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="text-5xl mb-4">⚙️</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Processing PDF...
        </h2>
        <p className="text-gray-600 mb-2">
          {fileName}
        </p>
        <p className="text-sm text-gray-500">
          Processed {processedCount} page(s)
        </p>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
        <div
          className="bg-gradient-to-r from-indigo-500 to-purple-600 h-full transition-all duration-300 ease-out rounded-full"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="text-center">
        <span className="text-xl font-semibold text-gray-900">{progress}%</span>
      </div>

      {/* Animated dots */}
      <div className="text-center">
        <span className="inline-block">
          <span className="inline-block animate-bounce">.</span>
          <span className="inline-block animate-bounce" style={{ animationDelay: '0.1s' }}>.</span>
          <span className="inline-block animate-bounce" style={{ animationDelay: '0.2s' }}>.</span>
        </span>
      </div>
    </div>
  );
}
