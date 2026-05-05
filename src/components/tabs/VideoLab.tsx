import { useMemo, useState } from "react";
import {
  Clapperboard,
  Download,
  Film,
  Loader2,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";
import { useApiConfig } from "../../contexts/ApiConfigContext";

type VideoMethod = "frame_stitch" | "keyframe_propagation";
type VideoOperation = "weather" | "lighting";
type LightingFilter = "red" | "green" | "blue" | "black_and_white";
type WeatherEffect = "snowy" | "rainy" | "foggy" | "sunny" | "cloudy";

interface VideoMetadata {
  fps: number;
  frame_count: number;
  width: number;
  height: number;
  duration_seconds: number;
  anchor_count?: number;
  method?: string;
  operation?: string;
}

interface AnchorPreview {
  index: number;
  time_seconds: number;
  change_score: number;
  image_base64: string;
}

interface AnalyzeResponse {
  metadata: VideoMetadata;
  anchors: AnchorPreview[];
  recommendations: {
    recommended_method: VideoMethod;
    anchor_count: number;
    notes: string[];
  };
}

const WEATHER_OPTIONS: WeatherEffect[] = ["snowy", "rainy", "foggy", "sunny", "cloudy"];
const LIGHTING_OPTIONS: LightingFilter[] = ["red", "green", "blue", "black_and_white"];

export default function VideoLab() {
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [editedVideoUrl, setEditedVideoUrl] = useState<string | null>(null);
  const [method, setMethod] = useState<VideoMethod>("keyframe_propagation");
  const [operation, setOperation] = useState<VideoOperation>("weather");
  const [weatherEffect, setWeatherEffect] = useState<WeatherEffect>("sunny");
  const [lightingFilter, setLightingFilter] = useState<LightingFilter>("red");
  const [intensity, setIntensity] = useState(0.8);
  const [anchorCount, setAnchorCount] = useState(6);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [outputMetadata, setOutputMetadata] = useState<VideoMetadata | null>(null);
  const [status, setStatus] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [processing, setProcessing] = useState(false);

  const { apiUrl: API_URL } = useApiConfig();

  const activeOperationLabel = useMemo(() => {
    return operation === "weather" ? weatherEffect : lightingFilter;
  }, [lightingFilter, operation, weatherEffect]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] || null;
    setFile(selected);
    setEditedVideoUrl(null);
    setAnalysis(null);
    setOutputMetadata(null);
    setStatus("");

    if (selected) {
      setVideoUrl(URL.createObjectURL(selected));
    } else {
      setVideoUrl(null);
    }
  };

  const handleAnalyze = async () => {
    if (!file) {
      alert("Please upload a video first");
      return;
    }

    setAnalyzing(true);
    setStatus("Analyzing video, extracting representative frames, and scoring scene changes...");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("anchor_count", String(anchorCount));

    try {
      const response = await fetch(`${API_URL}/video/analyze`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (data.error) {
        setStatus(`Analysis failed: ${data.detail || data.error}`);
      } else {
        const parsed = data as AnalyzeResponse;
        setAnalysis(parsed);
        setMethod(parsed.recommendations.recommended_method);
        setStatus(
          `Analysis complete. Recommended method: ${parsed.recommendations.recommended_method.replace("_", " ")}.`
        );
      }
    } catch (error) {
      setStatus(`Analysis failed: ${error instanceof Error ? error.message : "Network error"}`);
    }

    setAnalyzing(false);
  };

  const handleProcess = async () => {
    if (!file) {
      alert("Please upload a video first");
      return;
    }

    setProcessing(true);
    setStatus(`Processing video with ${method.replace("_", " ")} and ${activeOperationLabel} scene editing...`);
    setEditedVideoUrl(null);
    setOutputMetadata(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("method", method);
    formData.append("operation", operation);
    formData.append("anchor_count", String(anchorCount));
    if (operation === "weather") {
      formData.append("transformation", weatherEffect);
      formData.append("intensity", String(intensity));
    } else {
      formData.append("lighting_filter", lightingFilter);
    }

    try {
      const response = await fetch(`${API_URL}/video/edit`, {
        method: "POST",
        body: formData,
      });

      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !contentType.includes("video/mp4")) {
        const data = await response.json();
        setStatus(`Video processing failed: ${data.detail || data.error || response.statusText}`);
        setProcessing(false);
        return;
      }

      const metadataHeader = response.headers.get("X-Video-Metadata");
      if (metadataHeader) {
        setOutputMetadata(JSON.parse(metadataHeader) as VideoMetadata);
      }

      const blob = await response.blob();
      setEditedVideoUrl(URL.createObjectURL(blob));
      setStatus("Video edit complete. Review the output and download it if it looks good.");
    } catch (error) {
      setStatus(`Video processing failed: ${error instanceof Error ? error.message : "Network error"}`);
    }

    setProcessing(false);
  };

  const handleDownload = () => {
    if (!editedVideoUrl) return;
    const link = document.createElement("a");
    link.href = editedVideoUrl;
    link.download = `video-edit-${operation}-${method}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full space-y-6 animate-fade-in">
      <Card className="border border-gray-200 dark:border-gray-800 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
              <Film className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <CardTitle className="text-xl">Video Scene Lab</CardTitle>
              <CardDescription>
                Prototype a video-aware pipeline with anchor-frame analysis, temporal smoothing, and scene-level edits.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Upload Video</Label>
            <label className="flex cursor-pointer">
              <input type="file" className="hidden" accept="video/*" onChange={handleFileChange} />
              <div className="flex h-28 w-full items-center justify-center rounded-xl border-2 border-dashed border-gray-300 transition-colors hover:border-indigo-400 dark:border-gray-600 dark:hover:border-indigo-500">
                <div className="text-center">
                  <Clapperboard className="mx-auto mb-2 h-7 w-7 text-gray-400" />
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {file ? file.name : "Click to upload a video clip"}
                  </p>
                </div>
              </div>
            </label>
          </div>

          {videoUrl && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-2">
                <Label>Original Video</Label>
                <video src={videoUrl} controls className="w-full rounded-xl border border-gray-200 shadow-sm dark:border-gray-700" />
              </div>

              {editedVideoUrl ? (
                <div className="space-y-2">
                  <Label>Edited Video</Label>
                  <video
                    src={editedVideoUrl}
                    controls
                    className="w-full rounded-xl border border-gray-200 shadow-sm dark:border-gray-700"
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-400">
                  Edited output will appear here after processing. The current prototype focuses on scene-level video transforms and temporal smoothing rather than object-level replacement.
                </div>
              )}
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-700 dark:bg-gray-900/20">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Pipeline Controls</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Method</Label>
                  <select
                    value={method}
                    onChange={(event) => setMethod(event.target.value as VideoMethod)}
                    className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 text-sm dark:border-gray-600 dark:bg-[#292929]"
                  >
                    <option value="frame_stitch">Frame Stitch Baseline</option>
                    <option value="keyframe_propagation">Keyframe + Flow Smoothing</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>Operation</Label>
                  <select
                    value={operation}
                    onChange={(event) => setOperation(event.target.value as VideoOperation)}
                    className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 text-sm dark:border-gray-600 dark:bg-[#292929]"
                  >
                    <option value="weather">Weather Transform</option>
                    <option value="lighting">Lighting Filter</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>Anchor Frames: {anchorCount}</Label>
                  <input
                    type="range"
                    min="3"
                    max="12"
                    step="1"
                    value={anchorCount}
                    onChange={(event) => setAnchorCount(Number(event.target.value))}
                    className="w-full"
                  />
                </div>

                {operation === "weather" ? (
                  <div className="space-y-2">
                    <Label>Weather Effect</Label>
                    <select
                      value={weatherEffect}
                      onChange={(event) => setWeatherEffect(event.target.value as WeatherEffect)}
                      className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 text-sm capitalize dark:border-gray-600 dark:bg-[#292929]"
                    >
                      {WEATHER_OPTIONS.map((option) => (
                        <option key={option} value={option} className="capitalize">
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Lighting Filter</Label>
                    <select
                      value={lightingFilter}
                      onChange={(event) => setLightingFilter(event.target.value as LightingFilter)}
                      className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 text-sm dark:border-gray-600 dark:bg-[#292929]"
                    >
                      {LIGHTING_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option === "black_and_white" ? "Black & White" : option}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {operation === "weather" && (
                <div className="space-y-2">
                  <Label>Effect Intensity: {Math.round(intensity * 100)}%</Label>
                  <input
                    type="range"
                    min="0.3"
                    max="1"
                    step="0.1"
                    value={intensity}
                    onChange={(event) => setIntensity(Number(event.target.value))}
                    className="w-full"
                  />
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button onClick={handleAnalyze} disabled={!file || analyzing || processing} variant="outline" className="flex-1">
                  {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />}
                  Analyze Video
                </Button>
                <Button onClick={handleProcess} disabled={!file || processing || analyzing} variant="primary" className="flex-1">
                  {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                  Run Video Pipeline
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-[#292929]">
              <p className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Research Notes</p>
              <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
                <p>
                  `Frame Stitch Baseline` edits each frame independently. It is useful for benchmarking but most exposed to flicker in generative pipelines.
                </p>
                <p>
                  `Keyframe + Flow Smoothing` refreshes on anchor frames and blends in motion-warped history between them. It is the practical bridge toward a fuller TokenFlow or AnyV2V-style research system.
                </p>
                <p>
                  This prototype currently implements scene-level transforms end to end. Object-level video editing should build on the same analysis stage with masks, tracking, and feature propagation.
                </p>
              </div>
            </div>
          </div>

          {status && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200">
              {status}
            </div>
          )}

          {(analysis || outputMetadata) && (
            <div className="grid gap-6 lg:grid-cols-2">
              {analysis && (
                <Card className="border border-gray-200 dark:border-gray-800">
                  <CardHeader>
                    <CardTitle className="text-lg">Video Analysis</CardTitle>
                    <CardDescription>Representative anchor frames and clip metadata.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
                        <p className="text-gray-500 dark:text-gray-400">Resolution</p>
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {analysis.metadata.width} x {analysis.metadata.height}
                        </p>
                      </div>
                      <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
                        <p className="text-gray-500 dark:text-gray-400">Duration</p>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{analysis.metadata.duration_seconds}s</p>
                      </div>
                      <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
                        <p className="text-gray-500 dark:text-gray-400">Frames</p>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{analysis.metadata.frame_count}</p>
                      </div>
                      <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
                        <p className="text-gray-500 dark:text-gray-400">FPS</p>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{analysis.metadata.fps.toFixed(2)}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Recommended notes</p>
                      {analysis.recommendations.notes.map((note) => (
                        <p key={note} className="text-sm text-gray-600 dark:text-gray-400">
                          {note}
                        </p>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {outputMetadata && (
                <Card className="border border-gray-200 dark:border-gray-800">
                  <CardHeader>
                    <CardTitle className="text-lg">Output Summary</CardTitle>
                    <CardDescription>Metadata returned by the video editor.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
                        <p className="text-gray-500 dark:text-gray-400">Method</p>
                        <p className="font-medium capitalize text-gray-900 dark:text-gray-100">
                          {outputMetadata.method?.replace("_", " ")}
                        </p>
                      </div>
                      <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
                        <p className="text-gray-500 dark:text-gray-400">Operation</p>
                        <p className="font-medium capitalize text-gray-900 dark:text-gray-100">{outputMetadata.operation}</p>
                      </div>
                      <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
                        <p className="text-gray-500 dark:text-gray-400">Anchor Frames</p>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{outputMetadata.anchor_count ?? "-"}</p>
                      </div>
                      <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
                        <p className="text-gray-500 dark:text-gray-400">Duration</p>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{outputMetadata.duration_seconds}s</p>
                      </div>
                    </div>

                    {editedVideoUrl && (
                      <Button onClick={handleDownload} variant="success" className="w-full">
                        <Download className="mr-2 h-4 w-4" />
                        Download Edited Video
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {analysis && analysis.anchors.length > 0 && (
            <Card className="border border-gray-200 dark:border-gray-800">
              <CardHeader>
                <CardTitle className="text-lg">Anchor Frames</CardTitle>
                <CardDescription>
                  These representative frames are useful for keyframe editing, temporal propagation, and evaluation.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {analysis.anchors.map((anchor) => (
                    <div key={anchor.index} className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                      <img
                        src={`data:image/png;base64,${anchor.image_base64}`}
                        alt={`Anchor ${anchor.index}`}
                        className="mb-3 rounded-lg border border-gray-200 dark:border-gray-700"
                      />
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Frame {anchor.index}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Time: {anchor.time_seconds}s</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Change score: {anchor.change_score}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
