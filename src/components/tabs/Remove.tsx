import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Upload, Loader2, Trash2, Download } from "lucide-react";

interface DetectionItem {
  id: number;
  label: string;
  confidence: number;
  box: number[];
  detection_id?: string;
}

export default function Remove() {
  const [file, setFile] = useState<File | null>(null);
  const [detections, setDetections] = useState<DetectionItem[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [selectedBox, setSelectedBox] = useState<number[] | null>(null);
  const [selectedDetectionId, setSelectedDetectionId] = useState<string | null>(null);
  const [imageHash, setImageHash] = useState<string | null>(null);
  const [clickPoint, setClickPoint] = useState<{ x: number; y: number } | null>(null);
  const [beforeImg, setBeforeImg] = useState<string | null>(null);
  const [annotatedImg, setAnnotatedImg] = useState<string | null>(null);
  const [afterImg, setAfterImg] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);

  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  // Redraw boxes when selected object changes
  useEffect(() => {
    if (detections.length > 0 && beforeImg) {
      const img = new Image();
      img.onload = () => {
        drawBoundingBoxes(img, detections, selected);
      };
      img.src = beforeImg;
    }
  }, [selected, detections, beforeImg]);

  // Update display canvas when annotated image changes
  useEffect(() => {
    if (annotatedImg && displayCanvasRef.current) {
      const displayCanvas = displayCanvasRef.current;
      const ctx = displayCanvas.getContext("2d");
      if (!ctx) return;

      const img = new Image();
      img.onload = () => {
        displayCanvas.width = img.width;
        displayCanvas.height = img.height;
        ctx.drawImage(img, 0, 0);
      };
      img.src = annotatedImg;
    }
  }, [annotatedImg]);

  // Draw bounding boxes on image
  const drawBoundingBoxes = (imgElement: HTMLImageElement, dets: DetectionItem[], highlightId: number | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = imgElement.naturalWidth;
    canvas.height = imgElement.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw the original image
    ctx.drawImage(imgElement, 0, 0);

    // Draw each detection box with numbers
    dets.forEach((det, index) => {
      const [x1, y1, x2, y2] = det.box;
      const isSelected = det.id === highlightId;
      const objectNumber = index + 1; // 1-indexed for user display

      // Draw semi-transparent overlay for selected object
      if (isSelected) {
        ctx.fillStyle = "rgba(239, 68, 68, 0.1)"; // red with 0.1 opacity
        ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      }

      // Set box style based on selection
      ctx.strokeStyle = isSelected ? "#ef4444" : "#3b82f6"; // red if selected, blue otherwise
      ctx.lineWidth = isSelected ? 4 : 3;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

      // Draw label with number on top of bounding box
      const label = `#${objectNumber} - ${det.label}`;
      ctx.font = "bold 18px Arial";
      const textWidth = ctx.measureText(label).width;

      ctx.fillStyle = isSelected ? "#ef4444" : "#3b82f6";
      ctx.fillRect(x1, y1 - 30, textWidth + 12, 30);

      // Draw label text
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, x1 + 6, y1 - 8);
    });

    // Convert canvas to data URL
    setAnnotatedImg(canvas.toDataURL("image/png"));
  };

  // Handle canvas click to select object
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (detections.length === 0) return;

    const canvas = displayCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Check which box was clicked (check in reverse order to prioritize top boxes)
    for (let i = detections.length - 1; i >= 0; i--) {
      const det = detections[i];
      const [x1, y1, x2, y2] = det.box;

      if (x >= x1 && x <= x2 && y >= y1 && y <= y2) {
        setSelected(det.id);
        setSelectedBox(det.box);
        setSelectedDetectionId(det.detection_id || null);
        setClickPoint({ x, y });
        setStatus(`Selected: Object #${i + 1} - ${det.label}`);
        return;
      }
    }

    // If clicked outside any box, deselect
    setSelected(null);
    setSelectedDetectionId(null);
    setStatus(`${detections.length} objects detected. Click on any numbered object to select it.`);
  };

  // Handle File Upload
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    setFile(selected);

    if (selected) {
      setBeforeImg(URL.createObjectURL(selected));
      setAnnotatedImg(null);
      setAfterImg(null);
      setDetections([]);
      setSelected(null);
      setSelectedDetectionId(null);
      setImageHash(null);
      setStatus("");
    }
  };

  // Download the result image
  const handleDownload = () => {
    if (!afterImg) return;

    const link = document.createElement("a");
    link.href = afterImg;
    link.download = `removed-object-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // -------- DETECT OBJECTS --------
  const handleDetect = async () => {
    if (!file) {
      alert("Please upload an image");
      return;
    }

    setLoading(true);
    setStatus("Detecting objects...");
    setDetections([]);
    setSelected(null);
    setSelectedDetectionId(null);
    setImageHash(null);
    setAnnotatedImg(null);

    const form = new FormData();
    form.append("file", file);

    try {
      console.log(`Making detection request to: ${API_URL}/search`);
      const res = await fetch(`${API_URL}/search`, {
        method: "POST",
        body: form,
      });

      console.log(`Detection response status: ${res.status}`);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error(`Detection HTTP Error ${res.status}:`, errorText);
        setStatus(`Detection server error (${res.status})`);
        setLoading(false);
        return;
      }

      const data = await res.json();
      console.log("Detection response data:", data);

      if (!data.detections || data.detections.length === 0) {
        setStatus("No objects found.");
        setLoading(false);
        return;
      }

      const mappedDetections = data.detections.map((d: { label: string; confidence: number; box: number[]; detection_id?: string }, index: number) => ({
        id: index,
        label: d.label,
        confidence: d.confidence,
        box: d.box,
        detection_id: d.detection_id,
      }));

      setDetections(mappedDetections);
      setImageHash(data.image_hash || null);
      setStatus(`${data.detections.length} objects detected. Click on any numbered object to select it.`);

      // Draw bounding boxes on the image
      if (beforeImg) {
        const img = new Image();
        img.onload = () => {
          drawBoundingBoxes(img, mappedDetections, null);
        };
        img.src = beforeImg;
      }
    } catch (err) {
      console.error("Detection error:", err);
      setStatus(`Error detecting objects: ${err.message || 'Network error'}`);
    }

    setLoading(false);
  };

  // -------- REMOVE SELECTED OBJECT --------
  const handleRemove = async () => {
    if (selected === null) {
      alert("Select an object first");
      return;
    }
    if (!file) return;

    setLoading(true);
    setStatus("Removing object...");

    const form = new FormData();
    form.append("file", file);
    
    // Get the selected detection
    const sel = detections.find((d) => d.id === selected);
    if (!sel) {
      alert("Selected detection not found");
      setLoading(false);
      return;
    }
    
    // Send detection_id and image_hash for precise matching
    if (sel.detection_id) {
      form.append("detection_id", sel.detection_id);
    }
    if (imageHash) {
      form.append("image_hash", imageHash);
    }
    
    // Send index as fallback
    form.append("index", String(sel.id));
    
    // Send box coordinates as additional fallback
    if (selectedBox) {
      form.append("box", JSON.stringify(selectedBox));
    } else {
      form.append("box", JSON.stringify(sel.box));
    }

    // Send click coordinates for additional context
    if (clickPoint) {
      form.append("click_x", String(Math.round(clickPoint.x)));
      form.append("click_y", String(Math.round(clickPoint.y)));
      const imgW = (displayCanvasRef.current && displayCanvasRef.current.width) || 0;
      const imgH = (displayCanvasRef.current && displayCanvasRef.current.height) || 0;
      form.append("img_w", String(imgW));
      form.append("img_h", String(imgH));
    }
    
    // Use auto method - will use SD2 inpainting if HUGGINGFACE_TOKEN is set, otherwise OpenCV
    form.append("method", "auto");

    try {
      console.log(`Making request to: ${API_URL}/remove/apply`);
      const res = await fetch(`${API_URL}/remove/apply`, {
        method: "POST",
        body: form,
      });

      console.log(`Response status: ${res.status}`);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error(`HTTP Error ${res.status}:`, errorText);
        setStatus(`Server error (${res.status}): ${errorText}`);
        setLoading(false);
        return;
      }

      const data = await res.json();
      console.log("Response data:", data);

      if (data.error) {
        console.error("Backend error:", data);
        setStatus(`Backend error: ${data.detail || data.error}`);
      } else if (data.image_base64) {
        setAfterImg(`data:image/png;base64,${data.image_base64}`);
        const removedLabel = data.removed_label || "object";
        setStatus(`${removedLabel} removed successfully!`);
      } else {
        console.error("Unexpected response:", data);
        setStatus("Failed to remove object - unexpected response");
      }
    } catch (err) {
      console.error("Remove error:", err);
      setStatus(`Error removing object: ${err.message || 'Network error'}`);
    }

    setLoading(false);
  };

  return (
    <div className="w-full space-y-6 animate-fade-in">

      {/* MAIN CARD */}
      <Card className="border border-gray-200 dark:border-gray-800 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
              <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <CardTitle className="text-xl">Remove Object</CardTitle>
              <CardDescription>Detect & remove objects from an image</CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">

          {/* File Upload */}
          <Label className="font-medium">Upload Image</Label>
          <label className="flex cursor-pointer">
            <input type="file" className="hidden" onChange={handleFile} accept="image/*" />
            <div className="w-full h-24 flex items-center justify-center border-2 border-dashed rounded-xl hover:border-gray-400 transition-colors">
              <Upload className="h-6 w-6 text-gray-400" />
            </div>
          </label>

          {/* Hidden canvas for drawing bounding boxes */}
          <canvas ref={canvasRef} style={{ display: "none" }} />

          {/* Display clickable canvas if detections available, otherwise show original */}
          {annotatedImg && (
            <div className="space-y-2">
              <Label>Click on any numbered object to select it for removal</Label>
              <canvas
                ref={displayCanvasRef}
                onClick={handleCanvasClick}
                className="rounded-xl border shadow-sm w-full cursor-pointer hover:shadow-md transition-shadow"
                style={{
                  maxWidth: "100%",
                  height: "auto"
                }}
              />
            </div>
          )}

          {beforeImg && !annotatedImg && (
            <img
              src={beforeImg}
              alt="uploaded"
              className="rounded-xl border shadow-sm w-full"
            />
          )}

          {/* Detect Button */}
          <Button
            onClick={handleDetect}
            disabled={loading || !file}
            className="w-full"
          >
            {loading ? <Loader2 className="animate-spin h-4 w-4" /> : "Detect Objects for Removal"}
          </Button>

          {/* Remove Button */}
          {detections.length > 0 && (
            <Button
              variant="destructive"
              className="w-full"
              disabled={loading || selected === null}
              onClick={handleRemove}
            >
              {loading ? <Loader2 className="animate-spin h-4 w-4" /> : "Remove Selected Object"}
            </Button>
          )}

          {/* Status */}
          {status && (
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">{status}</p>
          )}

          {/* After Image with Download Button */}
          {afterImg && (
            <div className="space-y-3">
              <Label>After Removal</Label>
              <img
                src={afterImg}
                alt="after"
                className="rounded-xl border shadow-sm w-full"
              />
              <Button
                onClick={handleDownload}
                className="w-full"
                variant="outline"
              >
                <Download className="mr-2 h-4 w-4" />
                Download Updated Image
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}