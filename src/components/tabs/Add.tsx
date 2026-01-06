import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Upload, Plus, Download, Loader2, XCircle } from "lucide-react";

export default function Add() {
  const [file, setFile] = useState<File | null>(null);
  const [originalImg, setOriginalImg] = useState<string | null>(null);
  const [resultImg, setResultImg] = useState<string | null>(null);
  const [objectPrompt, setObjectPrompt] = useState<string>("");
  const [boundingBox, setBoundingBox] = useState<number[] | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  // Load and display image
  useEffect(() => {
    if (originalImg && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const img = new Image();
      img.onload = () => {
        imgRef.current = img;
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);

        // Draw existing bounding box if any
        if (boundingBox) {
          drawBox(ctx, boundingBox);
        }
      };
      img.src = originalImg;
    }
  }, [originalImg, boundingBox]);

  const drawBox = (ctx: CanvasRenderingContext2D, box: number[]) => {
    const [x1, y1, x2, y2] = box;

    // Semi-transparent fill
    ctx.fillStyle = "rgba(34, 197, 94, 0.1)";
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);

    // Green border
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    ctx.setLineDash([]);

    // Label
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(x1, y1 - 25, 150, 25);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px Arial";
    ctx.fillText("Draw object here", x1 + 5, y1 - 7);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    setFile(selected);
    setBoundingBox(null);
    setResultImg(null);
    setStatus("");

    if (selected) {
      setOriginalImg(URL.createObjectURL(selected));
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    setIsDrawing(true);
    setStartPoint({ x, y });
    setBoundingBox(null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPoint || !canvasRef.current || !imgRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Redraw image
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgRef.current, 0, 0);

    // Draw current box
    const x1 = Math.min(startPoint.x, x);
    const y1 = Math.min(startPoint.y, y);
    const x2 = Math.max(startPoint.x, x);
    const y2 = Math.max(startPoint.y, y);

    drawBox(ctx, [x1, y1, x2, y2]);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPoint || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const x1 = Math.min(startPoint.x, x);
    const y1 = Math.min(startPoint.y, y);
    const x2 = Math.max(startPoint.x, x);
    const y2 = Math.max(startPoint.y, y);

    // Minimum box size
    if (x2 - x1 > 20 && y2 - y1 > 20) {
      setBoundingBox([Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2)]);
      setStatus(`Box drawn: ${Math.round(x2-x1)}x${Math.round(y2-y1)}px`);
    } else {
      setStatus("Box too small, try again");
    }

    setIsDrawing(false);
    setStartPoint(null);
  };

  const handleClearBox = () => {
    setBoundingBox(null);
    setStatus("");

    // Redraw original image
    if (canvasRef.current && imgRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        ctx.drawImage(imgRef.current, 0, 0);
      }
    }
  };

  const handleAddObject = async () => {
    if (!file || !boundingBox || !objectPrompt.trim()) {
      alert("Please upload an image, draw a box, and describe what to add");
      return;
    }

    setLoading(true);
    setStatus("Generating object with Stable Diffusion...");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("prompt", objectPrompt.trim());
    formData.append("box", JSON.stringify(boundingBox));

    try {
      const res = await fetch(`${API_URL}/add/apply`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error(`Add error ${res.status}:`, errorText);
        setStatus(`Server error (${res.status})`);
        setLoading(false);
        return;
      }

      const data = await res.json();

      if (data.error) {
        setStatus(`Error: ${data.detail || data.error}`);
      } else if (data.image_base64) {
        setResultImg(`data:image/png;base64,${data.image_base64}`);
        setStatus(`Successfully added: ${objectPrompt}`);
      } else {
        setStatus("Unexpected response from server");
      }
    } catch (err: any) {
      console.error("Add error:", err);
      setStatus(`Error: ${err.message || 'Network error'}`);
    }

    setLoading(false);
  };

  const handleDownload = () => {
    if (!resultImg) return;
    const link = document.createElement("a");
    link.href = resultImg;
    link.download = `added-${objectPrompt.replace(/\s+/g, '-')}-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full space-y-6 animate-fade-in">
      <Card className="border border-gray-200 dark:border-gray-800 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <Plus className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <CardTitle className="text-xl">Add Object</CardTitle>
              <CardDescription>Draw a box and add objects using AI</CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* File Upload */}
          <div className="space-y-2">
            <Label>Upload Image</Label>
            <label className="flex cursor-pointer">
              <input type="file" className="hidden" onChange={handleFile} accept="image/*" />
              <div className="w-full h-24 flex items-center justify-center border-2 border-dashed rounded-xl hover:border-gray-400 transition-colors">
                <div className="text-center">
                  <Upload className="h-6 w-6 mx-auto mb-1 text-gray-400" />
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {file ? file.name : "Click to upload"}
                  </p>
                </div>
              </div>
            </label>
          </div>

          {/* Canvas */}
          {originalImg && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Draw bounding box where you want to add an object</Label>
                {boundingBox && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearBox}
                    className="text-red-600 hover:text-red-700"
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Clear Box
                  </Button>
                )}
              </div>
              <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                className="rounded-xl border shadow-sm w-full cursor-crosshair hover:shadow-md transition-shadow"
                style={{ maxWidth: "100%", height: "auto" }}
              />
            </div>
          )}

          {/* Object Prompt */}
          {boundingBox && (
            <div className="space-y-2">
              <Label htmlFor="object-prompt">What do you want to add?</Label>
              <Input
                id="object-prompt"
                type="text"
                value={objectPrompt}
                onChange={(e) => setObjectPrompt(e.target.value)}
                placeholder="e.g., red sports car, person walking, dog, tree..."
                className="w-full"
              />
            </div>
          )}

          {/* Add Button */}
          {boundingBox && (
            <Button
              onClick={handleAddObject}
              disabled={loading || !objectPrompt.trim()}
              className="w-full"
              variant="default"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin h-4 w-4 mr-2" />
                  Generating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Object
                </>
              )}
            </Button>
          )}

          {/* Status */}
          {status && (
            <p className="text-sm text-gray-600 dark:text-gray-300">{status}</p>
          )}

          {/* Result */}
          {resultImg && (
            <div className="space-y-3">
              <Label>Result</Label>
              <img
                src={resultImg}
                alt="result"
                className="rounded-xl border shadow-sm w-full"
              />
              <Button
                onClick={handleDownload}
                className="w-full"
                variant="outline"
              >
                <Download className="mr-2 h-4 w-4" />
                Download Image
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
