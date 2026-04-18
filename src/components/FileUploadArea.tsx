'use client';

import React from 'react';

interface FileUploadAreaProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileSelect: (file: File) => void;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function FileUploadArea({
  fileInputRef,
  onFileSelect,
  onInputChange,
}: FileUploadAreaProps) {
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) {
      onFileSelect(file);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="border-2 border-dashed border-indigo-300 rounded-lg p-8 text-center hover:border-indigo-500 hover:bg-indigo-50 transition duration-200 cursor-pointer bg-indigo-50/50"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={onInputChange}
        className="hidden"
      />

      <div className="space-y-4">
        <div className="text-5xl">📄</div>
        <div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Upload PDF File
          </h3>
          <p className="text-gray-600 mb-4">
            Drag and drop your PDF here, or click to browse
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-6 rounded-lg transition duration-200 shadow-md"
          >
            Choose File
          </button>
        </div>
      </div>
    </div>
  );
}
