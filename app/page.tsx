"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  GoogleMap,
  DrawingManager,
  Polygon,
  InfoWindow,
  StandaloneSearchBox,
} from "@react-google-maps/api";
import { useMaps } from "@/components/GoogleMapsProvider";

const MAP_CONTAINER_STYLE = { width: "100%", height: "100%" };
const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 };

const COLORS = [
  "#EF4444", "#F97316", "#EAB308", "#22C55E",
  "#3B82F6", "#8B5CF6", "#EC4899", "#14B8A6",
];

interface LatLng {
  lat: number;
  lng: number;
}

interface Hub {
  _id: string;
  hubName: string;
  polygon: LatLng[];
  createdAt: string;
}

function polygonCenter(polygon: LatLng[]): LatLng {
  const lat = polygon.reduce((s, p) => s + p.lat, 0) / polygon.length;
  const lng = polygon.reduce((s, p) => s + p.lng, 0) / polygon.length;
  return { lat, lng };
}

export default function HubMappingPage() {
  // Map
  const mapRef = useRef<google.maps.Map | null>(null);
  const { isLoaded, loadError } = useMaps();

  // Map search (Google Places)
  const searchBoxRef = useRef<google.maps.places.SearchBox | null>(null);
  const [searchValue, setSearchValue] = useState("");

  // Hubs list
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [hubsLoading, setHubsLoading] = useState(true);
  const [selectedHub, setSelectedHub] = useState<Hub | null>(null);

  // Hub filter
  const [hubFilter, setHubFilter] = useState("");

  // Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteWorking, setDeleteWorking] = useState(false);

  // Create mode
  const [mode, setMode] = useState<"view" | "create">("view");
  const [hubName, setHubName] = useState("");
  const [polygon, setPolygon] = useState<LatLng[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);
  const polygonRef = useRef<google.maps.Polygon | null>(null);

  // Fetch hubs
  const fetchHubs = useCallback(() => {
    setHubsLoading(true);
    fetch("/api/hubs")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setHubs(data.data);
      })
      .catch(() => { })
      .finally(() => setHubsLoading(false));
  }, []);

  useEffect(() => {
    fetchHubs();
  }, [fetchHubs]);

  // Fit bounds when hubs load
  useEffect(() => {
    if (!mapRef.current || hubs.length === 0 || !isLoaded) return;
    const bounds = new google.maps.LatLngBounds();
    hubs.forEach((hub) =>
      hub.polygon.forEach((p) => bounds.extend(new google.maps.LatLng(p.lat, p.lng)))
    );
    mapRef.current.fitBounds(bounds);
  }, [hubs, isLoaded]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  // Search
  const onSearchBoxLoad = useCallback((ref: google.maps.places.SearchBox) => {
    searchBoxRef.current = ref;
  }, []);

  const onPlacesChanged = useCallback(() => {
    if (!searchBoxRef.current || !mapRef.current) return;
    const places = searchBoxRef.current.getPlaces();
    if (!places || places.length === 0) return;
    const place = places[0];
    if (!place.geometry?.location) return;
    if (place.geometry.viewport) {
      mapRef.current.fitBounds(place.geometry.viewport);
    } else {
      mapRef.current.setCenter(place.geometry.location);
      mapRef.current.setZoom(14);
    }
  }, []);

  // Drawing
  const onPolygonComplete = useCallback((poly: google.maps.Polygon) => {
    if (polygonRef.current) polygonRef.current.setMap(null);
    polygonRef.current = poly;
    const path = poly.getPath();
    const coords: LatLng[] = [];
    for (let i = 0; i < path.getLength(); i++) {
      const pt = path.getAt(i);
      coords.push({ lat: pt.lat(), lng: pt.lng() });
    }
    setPolygon(coords);
    setMessage(null);
    if (drawingManagerRef.current) drawingManagerRef.current.setDrawingMode(null);
  }, []);

  const handleClear = () => {
    if (polygonRef.current) {
      polygonRef.current.setMap(null);
      polygonRef.current = null;
    }
    setPolygon([]);
    setMessage(null);
  };

  const handleSave = async () => {
    if (!hubName.trim()) {
      setMessage({ type: "error", text: "Please enter a hub name." });
      return;
    }
    if (polygon.length < 3) {
      setMessage({ type: "error", text: "Draw a polygon on the map first (at least 3 points)." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/hubs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hubName: hubName.trim(), polygon }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message ?? "Unknown error");
      setMessage({ type: "success", text: `"${hubName.trim()}" saved!` });
      setHubName("");
      handleClear();
      fetchHubs();
      setMode("view");
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save hub." });
    } finally {
      setSaving(false);
    }
  };

  const enterCreateMode = () => {
    setMode("create");
    setMessage(null);
    setSelectedHub(null);
  };

  const exitCreateMode = () => {
    setMode("view");
    setMessage(null);
    handleClear();
    setHubName("");
  };

  const focusHub = (hub: Hub) => {
    setSelectedHub(hub);
    if (!mapRef.current || !isLoaded) return;
    const bounds = new google.maps.LatLngBounds();
    hub.polygon.forEach((p) => bounds.extend(new google.maps.LatLng(p.lat, p.lng)));
    mapRef.current.fitBounds(bounds);
  };

  const startEdit = (hub: Hub, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(hub._id);
    setEditName(hub.hubName);
    setDeletingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/hubs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hubName: editName.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message ?? "Unknown error");
      setHubs((prev) =>
        prev.map((h) => (h._id === id ? { ...h, hubName: editName.trim() } : h))
      );
      if (selectedHub?._id === id) setSelectedHub((prev) => prev && { ...prev, hubName: editName.trim() });
      setEditingId(null);
    } catch {
      // silently keep editing open so user can retry
    } finally {
      setEditSaving(false);
    }
  };

  const confirmDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(id);
    setEditingId(null);
  };

  const cancelDelete = () => setDeletingId(null);

  const handleDelete = async (id: string) => {
    setDeleteWorking(true);
    try {
      const res = await fetch(`/api/hubs/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message ?? "Unknown error");
      setHubs((prev) => prev.filter((h) => h._id !== id));
      if (selectedHub?._id === id) setSelectedHub(null);
      setDeletingId(null);
    } catch {
      // keep confirm open so user can retry
    } finally {
      setDeleteWorking(false);
    }
  };

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-screen text-red-500 text-sm">
        Failed to load Google Maps. Check your API key.
      </div>
    );
  }

  const hubSuffix = hubs.length === 1 ? "" : "s";
  const hubLabel = hubsLoading ? "Loading…" : `${hubs.length} Hub${hubSuffix}`;
  const filteredHubs = hubFilter.trim()
    ? hubs.filter((h) => h.hubName.toLowerCase().includes(hubFilter.toLowerCase()))
    : hubs;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* ── Sidebar ── */}
      <aside className="w-80 shrink-0 flex flex-col bg-white shadow-lg z-10 overflow-hidden">
        {/* Logo / Title */}
        <div className="px-4 py-4 border-b border-gray-100 flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">H</div>
          <span className="text-base font-semibold text-gray-800">Hub Mapping</span>
        </div>

        {/* Map place search */}
        <div className="px-4 pt-3 pb-2 border-b border-gray-100">
          {isLoaded && mode !== 'view' ? (
            <StandaloneSearchBox onLoad={onSearchBoxLoad} onPlacesChanged={onPlacesChanged}>
              <input
                type="text"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="Search a place on map…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </StandaloneSearchBox>
          ) : null}

          {/* Hub filter */}
          {mode === "view" ? (

            <input
              type="text"
              value={hubFilter}
              onChange={(e) => setHubFilter(e.target.value)}
              placeholder="Filter hubs by name…"
              className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : null}
        </div>

        {/* Body: scrollable */}
        <div className="flex-1 overflow-y-auto">
          {mode === "view" ? (
            <div className="p-4 space-y-3">
              {/* Hub count */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {hubLabel}
                </span>
              </div>

              {/* Hub list */}
              {!hubsLoading && hubs.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">
                  No hubs yet. Create your first hub!
                </p>
              )}
              {!hubsLoading && hubs.length > 0 && filteredHubs.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">
                  No hubs match &ldquo;{hubFilter}&rdquo;.
                </p>
              )}
              {filteredHubs.map((hub) => {
                const idx = hubs.findIndex((h) => h._id === hub._id);
                const color = COLORS[idx % COLORS.length];
                const isSelected = selectedHub?._id === hub._id;
                const isEditing = editingId === hub._id;
                const isConfirmingDelete = deletingId === hub._id;

                return (
                  <div
                    key={hub._id}
                    className={`rounded-2xl border overflow-hidden transition-all duration-150 ${
                      isSelected
                        ? "border-blue-400 shadow-md"
                        : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
                    }`}
                  >
                    {/* Color accent bar */}
                    <div className="h-1 w-full" style={{ backgroundColor: color }} />

                    {/* Card body */}
                    <div className={`px-4 pt-3 pb-3 ${isSelected ? "bg-blue-50" : "bg-white"}`}>

                      {/* Top row: name + action buttons */}
                      <div className="flex items-start justify-between gap-2">
                        <button
                          onClick={() => focusHub(hub)}
                          className="flex items-center gap-2 min-w-0"
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5"
                            style={{ backgroundColor: color }}
                          />
                          <span className="text-sm font-semibold text-gray-800 truncate leading-tight">
                            {hub.hubName}
                          </span>
                        </button>

                        {/* Icon action buttons — only in default state */}
                        {!isEditing && !isConfirmingDelete && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={(e) => startEdit(hub, e)}
                              title="Rename hub"
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                              </svg>
                            </button>
                            <button
                              onClick={(e) => confirmDelete(hub._id, e)}
                              title="Delete hub"
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Meta — date + points */}
                      {!isEditing && !isConfirmingDelete && (
                        <div className="flex items-center gap-3 mt-2 pl-4">
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {hub.polygon.length} points
                          </span>
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {new Date(hub.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      )}

                      {/* Inline rename form */}
                      {isEditing && (
                        <div className="mt-2 space-y-2">
                          <input
                            autoFocus
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRename(hub._id);
                              if (e.key === "Escape") cancelEdit();
                            }}
                            className="w-full border border-blue-400 rounded-lg px-3 py-1.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleRename(hub._id)}
                              disabled={editSaving || !editName.trim()}
                              className="flex-1 bg-blue-600 text-white text-xs font-medium py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                            >
                              {editSaving ? "Saving…" : "Save"}
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="flex-1 border border-gray-200 text-gray-500 text-xs font-medium py-1.5 rounded-lg hover:bg-gray-50 transition"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Inline delete confirm */}
                      {isConfirmingDelete && (
                        <div className="mt-2 space-y-2">
                          <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-red-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            <p className="text-xs text-red-700 font-medium">Delete &ldquo;{hub.hubName}&rdquo;?</p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleDelete(hub._id)}
                              disabled={deleteWorking}
                              className="flex-1 bg-red-500 text-white text-xs font-medium py-1.5 rounded-lg hover:bg-red-600 disabled:opacity-50 transition"
                            >
                              {deleteWorking ? "Deleting…" : "Yes, delete"}
                            </button>
                            <button
                              onClick={cancelDelete}
                              className="flex-1 border border-gray-200 text-gray-500 text-xs font-medium py-1.5 rounded-lg hover:bg-gray-50 transition"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Create form */
            <div className="p-4 space-y-3">
              <p className="text-xs text-blue-600 font-medium bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                Use the polygon tool on the map to draw your hub area, then fill in the name below.
              </p>

              <div>
                <label htmlFor="hub-name" className="block text-xs font-semibold text-gray-600 mb-1">
                  Hub Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="hub-name"
                  type="text"
                  placeholder="e.g. Mumbai North Hub"
                  value={hubName}
                  onChange={(e) => setHubName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {polygon.length > 0 && (
                <div className="flex items-center justify-between text-xs bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-green-700">
                  <span>✓ {polygon.length} points drawn</span>
                  <button onClick={handleClear} className="text-red-500 underline ml-2">
                    Clear
                  </button>
                </div>
              )}

              {message && (
                <div
                  className={`text-xs rounded-lg px-3 py-2 font-medium ${message.type === "success"
                      ? "bg-green-100 text-green-800 border border-green-200"
                      : "bg-red-100 text-red-800 border border-red-200"
                    }`}
                >
                  {message.text}
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {saving ? "Saving…" : "Save Hub"}
              </button>
            </div>
          )}
        </div>

        {/* Footer action button */}
        <div className="p-4 border-t border-gray-100">
          {mode === "view" ? (
            <button
              onClick={enterCreateMode}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition"
            >
              + Create New Hub
            </button>
          ) : (
            <button
              onClick={exitCreateMode}
              className="w-full border border-gray-300 text-gray-600 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
            >
              ← Back to List
            </button>
          )}
        </div>
      </aside>

      {/* ── Map (full remaining space) ── */}
      <div className="flex-1 relative">
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={MAP_CONTAINER_STYLE}
            center={DEFAULT_CENTER}
            zoom={5}
            onLoad={onMapLoad}
            options={{ streetViewControl: false, mapTypeControlOptions: { position: 3 } }}
          >
            {/* Existing hubs */}
            {hubs.map((hub, idx) => (
              <Polygon
                key={hub._id}
                paths={hub.polygon}
                options={{
                  fillColor: COLORS[idx % COLORS.length],
                  fillOpacity: selectedHub?._id === hub._id ? 0.5 : 0.25,
                  strokeColor: COLORS[idx % COLORS.length],
                  strokeWeight: selectedHub?._id === hub._id ? 3 : 2,
                }}
                onClick={() => focusHub(hub)}
              />
            ))}

            {/* Info window */}
            {selectedHub && (
              <InfoWindow
                position={polygonCenter(selectedHub.polygon)}
                onCloseClick={() => setSelectedHub(null)}
              >
                <div className="text-sm min-w-35">
                  <p className="font-bold text-gray-800 mb-0.5">{selectedHub.hubName}</p>
                  <p className="text-gray-500 text-xs">{selectedHub.polygon.length} points</p>
                  <p className="text-gray-500 text-xs">
                    {new Date(selectedHub.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </InfoWindow>
            )}

            {/* Drawing manager — always mounted, controls hidden outside create mode */}
            <DrawingManager
              onLoad={(dm) => { drawingManagerRef.current = dm; }}
              onPolygonComplete={onPolygonComplete}
              options={{
                drawingControl: mode === "create",
                drawingControlOptions: {
                  position: google.maps.ControlPosition.TOP_CENTER,
                  drawingModes: [google.maps.drawing.OverlayType.POLYGON],
                },
                polygonOptions: {
                  fillColor: "#3B82F6",
                  fillOpacity: 0.3,
                  strokeColor: "#1D4ED8",
                  strokeWeight: 2,
                  editable: true,
                },
              }}
            />
          </GoogleMap>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Loading map…
          </div>
        )}
      </div>
    </div>
  );
}

