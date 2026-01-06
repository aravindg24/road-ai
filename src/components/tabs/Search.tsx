import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Upload, Search as SearchIcon, Download, Image as ImageIcon, Code } from "lucide-react";

interface Detection {
  label: string;
  score: number;
  box: number[];
}

interface ApiResponse {
  counts: Record<string, number>;
  detections: Detection[];
  image_base64: string;
}

export default function Search() {
  const [file, setFile] = useState<File | null>(null);
  const [originalImg, setOriginalImg] = useState<string | null>(null);
  const [resultImg, setResultImg] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [detections, setDetections] = useState<Detection[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Use Vite env var VITE_API_URL if set (e.g. "http://localhost:8000"),
  // otherwise default to local backend on port 8000.
  const baseApi = ((import.meta as unknown) as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL || "http://localhost:8000";
  const API_URL = `${baseApi}/search`;

  
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    setFile(selected);
    if (selected) {
      setOriginalImg(URL.createObjectURL(selected));
    }
  };

  const detectObjects = async () => {
    if (!file) {
      alert("Please select an image first");
      return;
    }

    setLoading(true);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch(API_URL, { method: "POST", body: form });
      const data: ApiResponse = await res.json();

      setCounts(data.counts);
      setDetections(data.detections);
      setResultImg("data:image/png;base64," + data.image_base64);
    } catch (err) {
      console.error("Detection Error:", err);
      alert("Error detecting objects.");
    }

    setLoading(false);
  };

  const downloadImage = () => {
    if (!resultImg) return;
    const a = document.createElement("a");
    a.href = resultImg;
    a.download = "detected.png";
    a.click();
  };

  return (
    <div className="w-full space-y-6 animate-fade-in">
      {/* UPLOAD CARD */}
      <Card className="border border-gray-200 dark:border-gray-800 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Upload className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-xl">Upload Image</CardTitle>
              <CardDescription>Select an image to detect objects</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <label className="flex-1 cursor-pointer">
              <input
                type="file"
                accept="image/*"
                onChange={handleFile}
                className="hidden"
              />
              <div className="flex items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl hover:border-blue-500 dark:hover:border-blue-400 transition-colors">
                <div className="text-center">
                  <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {file ? file.name : "Click to upload or drag and drop"}
                  </p>
                </div>
              </div>
            </label>
          </div>

          {originalImg && (
            <div className="relative group">
              <img
                src={originalImg}
                alt="Original"
                className="rounded-xl shadow-lg w-full max-w-2xl mx-auto border border-gray-200 dark:border-gray-700"
              />
              <div className="absolute top-2 right-2 p-2 bg-white/90 dark:bg-gray-800/90 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                <ImageIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              </div>
            </div>
          )}

          <Button
            onClick={detectObjects}
            disabled={loading || !file}
            size="lg"
            variant="primary"
            className="w-full sm:w-auto"
          >
            <SearchIcon className="mr-2 h-4 w-4" />
            {loading ? "Detecting Objects..." : "Detect Objects"}
          </Button>
        </CardContent>
      </Card>

      {/* RESULTS */}
      {counts && (
        <div className="w-full space-y-6">
          {/* BEFORE / AFTER SIDE BY SIDE */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* BEFORE */}
            <Card className="border border-gray-200 dark:border-gray-800">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ImageIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  Before Detection
                </CardTitle>
              </CardHeader>
              <CardContent>
                {originalImg ? (
                  <img
                    src={originalImg}
                    className="rounded-xl shadow w-full border border-gray-200 dark:border-gray-700"
                    alt="Before"
                  />
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 text-center py-8">No image uploaded</p>
                )}
              </CardContent>
            </Card>

            {/* AFTER */}
            <Card className="border border-gray-200 dark:border-gray-800">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ImageIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                  After Detection
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {resultImg ? (
                  <img
                    src={resultImg}
                    className="rounded-xl shadow w-full border border-gray-200 dark:border-gray-700"
                    alt="After"
                  />
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 text-center py-8">No detected image</p>
                )}

                {resultImg && (
                  <Button
                    onClick={downloadImage}
                    variant="success"
                    className="w-full"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download Processed Image
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          {/* COUNTS + DETECTIONS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* OBJECT COUNTS */}
            <Card className="border border-gray-200 dark:border-gray-800">
              <CardHeader>
                <CardTitle className="text-lg">Detected Objects</CardTitle>
                <CardDescription>Objects found in the image</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(counts).map(([label, count]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      <span className="font-medium capitalize text-gray-900 dark:text-gray-100">
                        {label}
                      </span>
                      <Badge variant="primary" className="text-base px-3 py-1">
                        {count}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* RAW DETECTION JSON */}
            <Card className="border border-gray-200 dark:border-gray-800">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Code className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                  Raw Detection Data
                </CardTitle>
                <CardDescription>JSON output from detection API</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                  <pre className="text-green-300 text-xs overflow-x-auto max-h-96 font-mono">
                    {detections ? JSON.stringify(detections, null, 2) : "No detections"}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
