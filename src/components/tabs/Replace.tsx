import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Replace as ReplaceIcon, Upload, Loader2, Download, Search, Palette, Cloud } from "lucide-react";

type EditMode = "replace" | "color" | "transform";

interface DetectionItem {
  index: number;
  label: string;
  confidence: number;
  box: number[];
  detection_id?: string;
}

const WEATHER_OPTIONS = ["snowy", "rainy", "foggy", "sunny", "cloudy"];

const LIGHTING_FILTERS = ["red", "green", "blue", "black_and_white"];

const COLORS = ["black", "white", "red", "blue", "green", "yellow", "gray", "silver"];

export default function Replace() {
  const [file, setFile] = useState<File | null>(null);
  const [beforeImg, setBeforeImg] = useState<string | null>(null);
  const [annotatedImg, setAnnotatedImg] = useState<string | null>(null);
  const [afterImg, setAfterImg] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("");

  // Edit mode
  const [editMode, setEditMode] = useState<EditMode>("replace");

  // Object replacement state
  const [replacement, setReplacement] = useState<string>("");
  const [detections, setDetections] = useState<DetectionItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [imageHash, setImageHash] = useState<string | null>(null);

  // Color change state
  const [targetColor, setTargetColor] = useState<string>("black");
  const [newColor, setNewColor] = useState<string>("red");
  const [tolerance, setTolerance] = useState<number>(30);
  const [colorPreviewImg, setColorPreviewImg] = useState<string | null>(null);
  const [colorMatches, setColorMatches] = useState<number>(0);
  const [colorDetected, setColorDetected] = useState<boolean>(false);

  // Transform state
  const [transformation, setTransformation] = useState<string>("sunset");
  const [intensity, setIntensity] = useState<number>(0.8);
  const [lightingFilter, setLightingFilter] = useState<string>("red");
  const [transformType, setTransformType] = useState<"weather" | "lighting">("weather");

  // Canvas refs for drawing
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);

  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  // Draw bounding boxes on canvas
  const drawBoundingBoxes = (imgElement: HTMLImageElement, dets: DetectionItem[], highlightIndex: number | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = imgElement.naturalWidth;
    canvas.height = imgElement.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(imgElement, 0, 0);

    dets.forEach((det, idx) => {
      const [x1, y1, x2, y2] = det.box;
      const isSelected = idx === highlightIndex;

      if (isSelected) {
        ctx.fillStyle = "rgba(147, 51, 234, 0.2)";
        ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      }

      ctx.strokeStyle = isSelected ? "#9333ea" : "#3b82f6";
      ctx.lineWidth = isSelected ? 4 : 3;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

      const label = `#${idx + 1} - ${det.label}`;
      ctx.font = "bold 16px Arial";
      const textWidth = ctx.measureText(label).width;

      ctx.fillStyle = isSelected ? "#9333ea" : "#3b82f6";
      ctx.fillRect(x1, y1 - 26, textWidth + 10, 26);

      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, x1 + 5, y1 - 7);
    });

    setAnnotatedImg(canvas.toDataURL("image/png"));
  };

  // Update canvas when selection changes
  useEffect(() => {
    if (detections.length > 0 && beforeImg) {
      const img = new Image();
      img.onload = () => drawBoundingBoxes(img, detections, selectedIndex);
      img.src = beforeImg;
    }
  }, [selectedIndex, detections, beforeImg]);

  // Update display canvas
  useEffect(() => {
    if (annotatedImg && displayCanvasRef.current) {
      const ctx = displayCanvasRef.current.getContext("2d");
      if (!ctx) return;

      const img = new Image();
      img.onload = () => {
        displayCanvasRef.current!.width = img.width;
        displayCanvasRef.current!.height = img.height;
        ctx.drawImage(img, 0, 0);
      };
      img.src = annotatedImg;
    }
  }, [annotatedImg]);

  // Handle canvas click
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (detections.length === 0 || editMode !== "replace") return;

    const canvas = displayCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    for (let i = detections.length - 1; i >= 0; i--) {
      const [x1, y1, x2, y2] = detections[i].box;
      if (x >= x1 && x <= x2 && y >= y1 && y <= y2) {
        setSelectedIndex(i);
        setStatus(`Selected: #${i + 1} - ${detections[i].label}. Enter what to replace it with.`);
        return;
      }
    }

    setSelectedIndex(null);
    setStatus("Click on an object to select it for replacement.");
  };

  // Handle file upload
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    setFile(selected);

    if (selected) {
      setBeforeImg(URL.createObjectURL(selected));
      setAnnotatedImg(null);
      setAfterImg(null);
      setDetections([]);
      setSelectedIndex(null);
      setImageHash(null);
      setStatus("");
    }
  };

  // Detect objects
  const handleDetect = async () => {
    if (!file) {
      alert("Please upload an image first");
      return;
    }

    setLoading(true);
    setStatus("Detecting objects...");
    setDetections([]);
    setSelectedIndex(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch(`${API_URL}/replace/detect`, {
        method: "POST",
        body: form,
      });

      const data = await res.json();

      if (data.error) {
        setStatus(`Error: ${data.detail || data.error}`);
      } else if (data.detections) {
        setDetections(data.detections);
        setImageHash(data.image_hash);
        setStatus(`Found ${data.detections.length} objects. Click on one to replace it.`);

        if (beforeImg) {
          const img = new Image();
          img.onload = () => drawBoundingBoxes(img, data.detections, null);
          img.src = beforeImg;
        }
      }
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : "Network error"}`);
    }

    setLoading(false);
  };

  // Handle download
  const handleDownload = () => {
    if (!afterImg) return;
    const link = document.createElement("a");
    link.href = afterImg;
    link.download = `edited-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle object replacement
  const handleReplace = async () => {
    if (!file) {
      alert("Please upload an image first");
      return;
    }
    if (selectedIndex === null) {
      alert("Please detect objects and select one to replace");
      return;
    }
    if (!replacement.trim()) {
      alert("Please enter what to replace the object with");
      return;
    }

    setLoading(true);
    setStatus(`Replacing ${detections[selectedIndex]?.label || "object"} #${selectedIndex + 1} with "${replacement}"...`);
    setAfterImg(null);

    const form = new FormData();
    form.append("file", file);
    form.append("index", String(selectedIndex));
    form.append("replacement", replacement);

    if (imageHash) {
      form.append("image_hash", imageHash);
    }
    if (detections[selectedIndex]?.detection_id) {
      form.append("detection_id", detections[selectedIndex].detection_id!);
    }

    try {
      const res = await fetch(`${API_URL}/replace/apply`, {
        method: "POST",
        body: form,
      });

      const data = await res.json();

      if (data.error) {
        setStatus(`Error: ${data.detail || data.error}`);
      } else if (data.image_base64) {
        setAfterImg(`data:image/png;base64,${data.image_base64}`);
        setStatus(`Success! Replaced "${data.original}" with "${data.replacement}"`);
      }
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : "Network error"}`);
    }

    setLoading(false);
  };

  // Detect colors (preview)
  const handleColorDetect = async () => {
    if (!file) {
      alert("Please upload an image first");
      return;
    }

    setLoading(true);
    setStatus(`Detecting ${targetColor} objects...`);
    setColorPreviewImg(null);
    setColorDetected(false);
    setAfterImg(null);

    const form = new FormData();
    form.append("file", file);
    form.append("target_color", targetColor);
    form.append("tolerance", String(tolerance));

    try {
      const res = await fetch(`${API_URL}/edit/color-detect`, {
        method: "POST",
        body: form,
      });

      const data = await res.json();

      if (data.error) {
        setStatus(`Error: ${data.detail || data.error}`);
      } else {
        setColorPreviewImg(`data:image/png;base64,${data.preview_image}`);
        setColorMatches(data.matches_count);
        setColorDetected(true);
        if (data.matches_count > 0) {
          setStatus(`Found ${data.matches_count} ${targetColor} object(s) out of ${data.total_objects} total. Green = match, Red = no match.`);
        } else {
          setStatus(`No ${targetColor} objects found. Try adjusting tolerance or selecting a different color.`);
        }
      }
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : "Network error"}`);
    }

    setLoading(false);
  };

  // Handle color change
  const handleColorChange = async () => {
    if (!file) {
      alert("Please upload an image first");
      return;
    }
    if (colorMatches === 0) {
      alert("No matching objects found. Please detect colors first.");
      return;
    }

    setLoading(true);
    setStatus(`Changing ${colorMatches} ${targetColor} objects to ${newColor}...`);
    setAfterImg(null);

    const form = new FormData();
    form.append("file", file);
    form.append("target_color", targetColor);
    form.append("new_color", newColor);
    form.append("tolerance", String(tolerance));

    try {
      const res = await fetch(`${API_URL}/edit/color-change`, {
        method: "POST",
        body: form,
      });

      const data = await res.json();

      if (data.error) {
        setStatus(`Error: ${data.detail || data.error}`);
      } else if (data.image_base64) {
        setAfterImg(`data:image/png;base64,${data.image_base64}`);
        setStatus(`Success! Changed ${data.objects_changed} ${targetColor} objects to ${newColor}`);
      }
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : "Network error"}`);
    }

    setLoading(false);
  };

  // Handle scene transform
  const handleTransform = async () => {
    if (!file) {
      alert("Please upload an image first");
      return;
    }

    setLoading(true);
    const filterName = transformType === "weather" ? transformation : lightingFilter;
    setStatus(`Applying "${filterName}" ${transformType === "weather" ? "transformation" : "lighting filter"}...`);
    setAfterImg(null);

    const form = new FormData();
    form.append("file", file);

    if (transformType === "weather") {
      form.append("transformation", transformation);
      form.append("intensity", String(intensity));
    } else {
      form.append("lighting_filter", lightingFilter);
    }

    const endpoint = transformType === "weather" ? "/edit/transform" : "/edit/lighting-filter";

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        body: form,
      });

      const data = await res.json();

      if (data.error) {
        if (data.available) {
          setStatus(`Error: Invalid ${transformType}. Available: ${data.available.join(", ")}`);
        } else {
          setStatus(`Error: ${data.detail || data.error}`);
        }
      } else if (data.image_base64) {
        setAfterImg(`data:image/png;base64,${data.image_base64}`);
        setStatus(`Success! Applied "${filterName}" ${transformType === "weather" ? "transformation" : "lighting filter"}`);
      }
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : "Network error"}`);
    }

    setLoading(false);
  };

  // Reset state when mode changes
  const handleModeChange = (mode: EditMode) => {
    setEditMode(mode);
    setAfterImg(null);
    setStatus("");
    if (mode !== "replace") {
      setAnnotatedImg(null);
      setDetections([]);
      setSelectedIndex(null);
    }
    if (mode !== "color") {
      setColorPreviewImg(null);
      setColorMatches(0);
      setColorDetected(false);
    }
  };

  return (
    <div className="w-full space-y-6 animate-fade-in">
      <Card className="border border-gray-200 dark:border-gray-800 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <ReplaceIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <CardTitle className="text-xl">Replace & Edit</CardTitle>
              <CardDescription>
                Replace objects, change colors, or transform scenes
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* File Upload */}
          <div className="space-y-2">
            <Label className="font-medium">Upload Image</Label>
            <label className="flex cursor-pointer">
              <input type="file" className="hidden" onChange={handleFile} accept="image/*" />
              <div className="w-full h-24 flex items-center justify-center border-2 border-dashed rounded-xl hover:border-gray-400 transition-colors">
                <Upload className="h-6 w-6 text-gray-400" />
              </div>
            </label>
          </div>

          {/* Hidden canvas for drawing */}
          <canvas ref={canvasRef} style={{ display: "none" }} />

          {/* Image display */}
          {editMode === "replace" && annotatedImg ? (
            <div className="space-y-2">
              <Label>Click on an object to select it for replacement</Label>
              <canvas
                ref={displayCanvasRef}
                onClick={handleCanvasClick}
                className="rounded-xl border shadow-sm w-full cursor-pointer hover:shadow-md transition-shadow"
                style={{ maxWidth: "100%", height: "auto" }}
              />
            </div>
          ) : beforeImg ? (
            <img src={beforeImg} alt="Original" className="rounded-xl border shadow-sm w-full" />
          ) : null}

          {/* Mode Selection */}
          <div className="flex gap-2">
            <Button
              variant={editMode === "replace" ? "default" : "outline"}
              onClick={() => handleModeChange("replace")}
              className={`flex-1 ${editMode === "replace" ? "bg-purple-600 hover:bg-purple-700" : ""}`}
              size="sm"
            >
              <ReplaceIcon className="mr-2 h-4 w-4" />
              Replace
            </Button>
            <Button
              variant={editMode === "color" ? "default" : "outline"}
              onClick={() => handleModeChange("color")}
              className={`flex-1 ${editMode === "color" ? "bg-purple-600 hover:bg-purple-700" : ""}`}
              size="sm"
            >
              <Palette className="mr-2 h-4 w-4" />
              Color
            </Button>
            <Button
              variant={editMode === "transform" ? "default" : "outline"}
              onClick={() => handleModeChange("transform")}
              className={`flex-1 ${editMode === "transform" ? "bg-purple-600 hover:bg-purple-700" : ""}`}
              size="sm"
            >
              <Cloud className="mr-2 h-4 w-4" />
              Transform
            </Button>
          </div>

          {/* REPLACE MODE */}
          {editMode === "replace" && (
            <div className="space-y-4">
              {/* Detect Objects Button */}
              {beforeImg && detections.length === 0 && (
                <Button onClick={handleDetect} disabled={loading} className="w-full" variant="outline">
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  Detect Objects
                </Button>
              )}

              {/* Selection info */}
              {selectedIndex !== null && detections[selectedIndex] && (
                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                  <p className="text-sm font-medium text-purple-700 dark:text-purple-300">
                    Selected: #{selectedIndex + 1} - {detections[selectedIndex].label}
                  </p>
                </div>
              )}

              {/* Replacement Input */}
              <div className="space-y-2">
                <Label htmlFor="replacement">Replace with:</Label>
                <Input
                  id="replacement"
                  type="text"
                  value={replacement}
                  onChange={(e) => setReplacement(e.target.value)}
                  placeholder="e.g., a red sports car, a bicycle, a tree"
                  disabled={selectedIndex === null}
                />
              </div>

              {/* Replace Button */}
              <Button
                onClick={handleReplace}
                disabled={loading || !file || selectedIndex === null || !replacement.trim()}
                className="w-full bg-purple-600 hover:bg-purple-700"
              >
                {loading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Replacing...</>
                ) : (
                  <><ReplaceIcon className="mr-2 h-4 w-4" />Replace Selected Object</>
                )}
              </Button>

              {/* Clear selection */}
              {selectedIndex !== null && (
                <Button variant="ghost" onClick={() => setSelectedIndex(null)} className="w-full" size="sm">
                  Clear Selection
                </Button>
              )}
            </div>
          )}

          {/* COLOR CHANGE MODE */}
          {editMode === "color" && (
            <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border">
              {/* Step 1: Select color and detect */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-600 text-white text-xs font-bold">1</span>
                  <Label className="font-medium">Select target color & detect</Label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm">Find Color</Label>
                    <select
                      value={targetColor}
                      onChange={(e) => {
                        setTargetColor(e.target.value);
                        setColorDetected(false);
                        setColorPreviewImg(null);
                        setColorMatches(0);
                      }}
                      className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-900 dark:border-gray-700 text-sm"
                    >
                      {COLORS.map((color) => (
                        <option key={color} value={color}>
                          {color.charAt(0).toUpperCase() + color.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Tolerance: {tolerance}</Label>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      step="5"
                      value={tolerance}
                      onChange={(e) => {
                        setTolerance(parseInt(e.target.value));
                        setColorDetected(false);
                        setColorPreviewImg(null);
                        setColorMatches(0);
                      }}
                      className="w-full"
                    />
                  </div>
                </div>

                <Button
                  onClick={handleColorDetect}
                  disabled={loading || !file}
                  variant="outline"
                  className="w-full"
                >
                  {loading && !colorDetected ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Detecting...</>
                  ) : (
                    <><Search className="mr-2 h-4 w-4" />Detect {targetColor} Objects</>
                  )}
                </Button>
              </div>

              {/* Preview Image */}
              {colorPreviewImg && (
                <div className="space-y-2">
                  <Label className="text-sm">Preview (Green = match, Red = no match)</Label>
                  <img src={colorPreviewImg} alt="Color Preview" className="rounded-xl border shadow-sm w-full" />
                  {colorMatches > 0 ? (
                    <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                      Found {colorMatches} {targetColor} object(s)
                    </p>
                  ) : (
                    <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                      No {targetColor} objects found. Try increasing tolerance.
                    </p>
                  )}
                </div>
              )}

              {/* Step 2: Select new color and apply */}
              {colorDetected && colorMatches > 0 && (
                <div className="space-y-3 pt-3 border-t">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-600 text-white text-xs font-bold">2</span>
                    <Label className="font-medium">Select new color & apply</Label>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm">Change to</Label>
                    <select
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-900 dark:border-gray-700 text-sm"
                    >
                      {COLORS.map((color) => (
                        <option key={color} value={color}>
                          {color.charAt(0).toUpperCase() + color.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <Button
                    onClick={handleColorChange}
                    disabled={loading || !file || colorMatches === 0}
                    className="w-full bg-purple-600 hover:bg-purple-700"
                  >
                    {loading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Changing Colors...</>
                    ) : (
                      <><Palette className="mr-2 h-4 w-4" />Change {colorMatches} {targetColor} → {newColor}</>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* TRANSFORM MODE - Weather and Lighting */}
          {editMode === "transform" && (
            <div className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border">
              {/* Transform Type Selection */}
              <div className="flex gap-2">
                <Button
                  variant={transformType === "weather" ? "default" : "outline"}
                  onClick={() => setTransformType("weather")}
                  className={`flex-1 ${transformType === "weather" ? "bg-purple-600 hover:bg-purple-700" : ""}`}
                  size="sm"
                >
                  <Cloud className="mr-2 h-4 w-4" />
                  Weather
                </Button>
                <Button
                  variant={transformType === "lighting" ? "default" : "outline"}
                  onClick={() => setTransformType("lighting")}
                  className={`flex-1 ${transformType === "lighting" ? "bg-purple-600 hover:bg-purple-700" : ""}`}
                  size="sm"
                >
                  <Palette className="mr-2 h-4 w-4" />
                  Lighting
                </Button>
              </div>

              {/* Weather Options */}
              {transformType === "weather" && (
                <>
                  <div className="space-y-2">
                    <Label className="text-sm">Weather Effect</Label>
                    <div className="flex flex-wrap gap-2">
                      {WEATHER_OPTIONS.map((option) => (
                        <Button
                          key={option}
                          variant={transformation === option ? "default" : "outline"}
                          size="sm"
                          onClick={() => setTransformation(option)}
                          className={`capitalize ${transformation === option ? "bg-purple-600 hover:bg-purple-700" : ""}`}
                        >
                          {option}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm">Intensity: {(intensity * 100).toFixed(0)}%</Label>
                    <input
                      type="range"
                      min="0.3"
                      max="1.0"
                      step="0.1"
                      value={intensity}
                      onChange={(e) => setIntensity(parseFloat(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </>
              )}

              {/* Lighting Filter Options */}
              {transformType === "lighting" && (
                <div className="space-y-2">
                  <Label className="text-sm">Lighting Filter</Label>
                  <div className="flex flex-wrap gap-2">
                    {LIGHTING_FILTERS.map((filter) => (
                      <Button
                        key={filter}
                        variant={lightingFilter === filter ? "default" : "outline"}
                        size="sm"
                        onClick={() => setLightingFilter(filter)}
                        className={`capitalize ${lightingFilter === filter ? "bg-purple-600 hover:bg-purple-700" : ""}`}
                      >
                        {filter === "black_and_white" ? "B&W" : filter}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <Button
                onClick={handleTransform}
                disabled={loading || !file}
                className="w-full bg-purple-600 hover:bg-purple-700"
              >
                {loading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Applying...</>
                ) : (
                  <>
                    {transformType === "weather" ? <Cloud className="mr-2 h-4 w-4" /> : <Palette className="mr-2 h-4 w-4" />}
                    Apply {transformType === "weather" ? `"${transformation}" Weather` : `${lightingFilter === "black_and_white" ? "B&W" : lightingFilter} Filter`}
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Status */}
          {status && <p className="text-sm text-gray-600 dark:text-gray-300">{status}</p>}

          {/* Result */}
          {afterImg && (
            <div className="space-y-3">
              <Label>Result</Label>
              <img src={afterImg} alt="Result" className="rounded-xl border shadow-sm w-full" />
              <Button onClick={handleDownload} className="w-full" variant="outline">
                <Download className="mr-2 h-4 w-4" />Download Result
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="border border-gray-200 dark:border-gray-800">
        <CardHeader>
          <CardTitle className="text-lg">Edit Modes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">Replace</p>
            <p>Detect objects, select one, and replace it with something new (e.g., car → bus).</p>
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">Color</p>
            <p>Change all objects of a similar color using smart detection (e.g., black cars to red).</p>
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-gray-100">Transform</p>
            <p>Apply weather effects (snowy, rainy, foggy, sunny, cloudy) or lighting filters (red, green, blue, black & white).</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
