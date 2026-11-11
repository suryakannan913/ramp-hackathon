import React from "react";
import { Evidence } from "../../lib/types";

/**
 * A3.11: Source-linked React components for findings.
 */

export const EvidenceCard: React.FC<{ evidence: Evidence }> = ({ evidence }) => {
  return (
    <div className="p-3 border rounded-lg shadow-sm bg-white mb-3 border-l-4 transition-all hover:shadow-md" 
         style={{ borderLeftColor: evidence.points > 10 ? "#ef4444" : evidence.points > 0 ? "#f59e0b" : "#3b82f6" }}>
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-base font-bold text-gray-900">{evidence.title}</h3>
          <p className="text-sm text-gray-600 font-medium uppercase tracking-wider mt-0.5">
            {evidence.category} · {evidence.source}
          </p>
        </div>
        <div className="flex flex-col items-end">
          <span className={`px-2 py-1 rounded text-sm font-bold ${
            evidence.points > 10 ? "bg-red-100 text-red-800" : 
            evidence.points > 0 ? "bg-yellow-100 text-yellow-800" : 
            "bg-blue-100 text-blue-800"
          }`}>
            {evidence.points} pts
          </span>
          <span className="text-xs text-gray-500 mt-1 italic">
            {evidence.confidence}
          </span>
        </div>
      </div>
      <div className="mt-3">
        <p className="text-base text-gray-700 leading-relaxed">{evidence.detail}</p>
        {evidence.quote && (
          <div className="mt-3 relative">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gray-200 rounded"></div>
            <blockquote className="pl-4 py-1 text-base italic text-gray-600 border-gray-200">
              "{evidence.quote}"
            </blockquote>
          </div>
        )}
      </div>
    </div>
  );
};

export const ConflictAlert: React.FC<{ fields: string[] }> = ({ fields }) => {
  if (fields.length === 0) return null;
  return (
    <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
      <div className="flex">
        <div className="ml-3">
          <h3 className="text-base font-medium text-red-800">Conflicting Evidence Detected</h3>
          <div className="mt-2 text-base text-red-700">
            <p>The following bank fields have conflicting values between the email body and attachments:</p>
            <ul className="list-disc pl-5 mt-1 space-y-1">
              {fields.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export const AnalysisStageBadge: React.FC<{ stage: string; status: string }> = ({ stage, status }) => {
  const getColors = (s: string) => {
    switch (s) {
      case "complete": return "bg-green-100 text-green-800 border-green-200";
      case "partial": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "failed":
      case "refused":
      case "invalid_result": return "bg-red-100 text-red-800 border-red-200";
      case "pending": return "bg-blue-100 text-blue-800 border-blue-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  return (
    <div className={`inline-flex items-center px-2 py-0.5 rounded text-sm font-medium border ${getColors(status)} mr-2 mb-2`}>
      <span className="capitalize">{stage}:</span>
      <span className="ml-1 font-bold">{status.replace("_", " ")}</span>
    </div>
  );
};
