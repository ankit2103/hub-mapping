"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  GoogleMap,
  DrawingManager,
  Polygon,
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
  description?: string;
  polygon: LatLng[];
  createdAt: string;
}

function computeAreaKm2(polygon: LatLng[]): string {
  try {
    const path = polygon.map((p) => new google.maps.LatLng(p.lat, p.lng));
    const sqM = google.maps.geometry.spherical.computeArea(path);
    return (sqM / 1_000_000).toFixed(1);
  } catch {
    return "–";
  }
}

function computePerimeterKm(polygon: LatLng[]): string {
  try {
    const path = polygon.map((p) => new google.maps.LatLng(p.lat, p.lng));
    const closed = [...path, path[0]];
    const m = google.maps.geometry.spherical.computeLength(closed);
    return (m / 1000).toFixed(1);
  } catch {
    return "–";
  }
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
  const [editDescription, setEditDescription] = useState("");
  const editPolygonRef = useRef<google.maps.Polygon | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteWorking, setDeleteWorking] = useState(false);

  // Info modal delete confirm
  const [infoModalDeleteConfirm, setInfoModalDeleteConfirm] = useState(false);

  // Mobile panel
  const [panelOpen, setPanelOpen] = useState(false);

  // Create mode
  const [mode, setMode] = useState<"view" | "create">("view");
  const [hubName, setHubName] = useState("");
  const [hubDescription, setHubDescription] = useState("");
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
        body: JSON.stringify({ hubName: hubName.trim(), polygon, description: hubDescription.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message ?? "Unknown error");
      setMessage({ type: "success", text: `"${hubName.trim()}" saved!` });
      setHubName("");
      setHubDescription("");
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
    setPanelOpen(true);
  };

  const exitCreateMode = () => {
    setMode("view");
    setMessage(null);
    handleClear();
    setHubName("");
    setHubDescription("");
    setPanelOpen(false);
  };

  const focusHub = (hub: Hub) => {
    setSelectedHub(hub);
    setInfoModalDeleteConfirm(false);
    if (!mapRef.current || !isLoaded) return;
    const bounds = new google.maps.LatLngBounds();
    hub.polygon.forEach((p) => bounds.extend(new google.maps.LatLng(p.lat, p.lng)));
    const map = mapRef.current;
    const center = bounds.getCenter();
    // Step 1: pan smoothly to center
    map.panTo(center);
    // Step 2: once pan settles, zoom in to fit the polygon tightly
    google.maps.event.addListenerOnce(map, "idle", () => {
      map.fitBounds(bounds, 80);
      // Step 3: enforce a minimum zoom so small polygons stay close
      google.maps.event.addListenerOnce(map, "idle", () => {
        if ((map.getZoom() ?? 0) > 15) map.setZoom(15);
      });
    });
  };

  const startEdit = (hub: Hub, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(hub._id);
    setEditName(hub.hubName);
    setEditDescription(hub.description ?? "");
    setDeletingId(null);
    if (mapRef.current && isLoaded) {
      const bounds = new google.maps.LatLngBounds();
      hub.polygon.forEach((p) => bounds.extend(new google.maps.LatLng(p.lat, p.lng)));
      const map = mapRef.current;
      const center = bounds.getCenter();
      map.panTo(center);
      google.maps.event.addListenerOnce(map, "idle", () => {
        map.fitBounds(bounds, 80);
      });
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditDescription("");
    editPolygonRef.current = null;
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    setEditSaving(true);
    try {
      let updatedPolygon: LatLng[] | undefined;
      if (editPolygonRef.current) {
        const path = editPolygonRef.current.getPath();
        updatedPolygon = [];
        for (let i = 0; i < path.getLength(); i++) {
          const pt = path.getAt(i);
          updatedPolygon.push({ lat: pt.lat(), lng: pt.lng() });
        }
      }
      const res = await fetch(`/api/hubs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hubName: editName.trim(),
          description: editDescription.trim(),
          ...(updatedPolygon ? { polygon: updatedPolygon } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message ?? "Unknown error");
      setHubs((prev) =>
        prev.map((h) => (h._id === id ? {
          ...h,
          hubName: editName.trim(),
          description: editDescription.trim(),
          ...(updatedPolygon ? { polygon: updatedPolygon } : {}),
        } : h))
      );
      if (selectedHub?._id === id) setSelectedHub((prev) => prev && {
        ...prev,
        hubName: editName.trim(),
        description: editDescription.trim(),
        ...(updatedPolygon ? { polygon: updatedPolygon } : {}),
      });
      setEditingId(null);
      setEditDescription("");
      editPolygonRef.current = null;
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

  const hubSuffix = hubs.length === 1 ? "" : "s";
  const hubLabel = hubsLoading ? "Loading…" : `${hubs.length} Hub${hubSuffix}`;
  const filteredHubs = hubFilter.trim()
    ? hubs.filter((h) => h.hubName.toLowerCase().includes(hubFilter.toLowerCase()))
    : hubs;

  if (loadError) {
    return <div className="flex items-center justify-center h-screen text-red-500 text-sm">Failed to load Google Maps.</div>;
  }

  return (
    <div className="relative flex flex-col md:flex-row h-screen overflow-hidden bg-gray-100">

      {/* ── Mobile backdrop ── */}
      {panelOpen && (
        <button
          type="button"
          aria-label="Close panel"
          className="fixed inset-0 bg-black/25 z-20 md:hidden w-full h-full"
          onClick={() => setPanelOpen(false)}
        />
      )}

      {/* ── Sidebar / Bottom Sheet ── */}
      <aside
        className={`
          fixed bottom-0 left-0 right-0 z-30 flex flex-col bg-white shadow-2xl
          transition-transform duration-300 ease-in-out
          md:relative md:translate-y-0 md:w-80 md:shrink-0 md:shadow-lg md:z-10
          ${panelOpen ? "translate-y-0" : "translate-y-[calc(100%-60px)]"}
        `}
        style={{ maxHeight: panelOpen ? "80vh" : undefined }}
      >
        {/* ── Mobile handle bar ── */}
        <button
          type="button"
          aria-label={panelOpen ? "Collapse panel" : "Expand panel"}
          className="md:hidden flex items-center justify-between w-full px-4 py-3.5 border-b border-gray-100 select-none shrink-0"
          onClick={() => setPanelOpen((o) => !o)}
        >
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">H</div>
            <span className="text-sm font-semibold text-gray-800">Hub Mapping</span>
            <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{hubLabel}</span>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${panelOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>

        {/* ── Desktop header ── */}
        <div className="hidden md:flex px-4 py-4 border-b border-gray-100 items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">H</div>
          <span className="text-base font-semibold text-gray-800">Hub Mapping</span>
        </div>

        {/* ── Search / Filter ── */}
        <div className="px-4 pt-3 pb-2 border-b border-gray-100 shrink-0">
          {isLoaded && mode !== "view" ? (
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

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {mode === "view" ? (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{hubLabel}</span>
              </div>
              {!hubsLoading && hubs.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">No hubs yet. Create your first hub!</p>
              )}
              {!hubsLoading && hubs.length > 0 && filteredHubs.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">No hubs match &ldquo;{hubFilter}&rdquo;.</p>
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
                    onClick={() => !isEditing && !isConfirmingDelete && focusHub(hub)}
                    className={`rounded-2xl border overflow-hidden transition-all duration-150 ${!isEditing && !isConfirmingDelete ? "cursor-pointer" : ""} ${isSelected ? "border-blue-400 shadow-md" : "border-gray-200 hover:border-gray-300 hover:shadow-sm"}`}
                  >
                    <div className="h-1 w-full" style={{ backgroundColor: color }} />
                    <div className={`px-4 pt-3 pb-3 ${isSelected ? "bg-blue-50" : "bg-white"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: color }} />
                          <span className="text-sm font-semibold text-gray-800 truncate leading-tight">{hub.hubName}</span>
                        </div>
                        {!isEditing && !isConfirmingDelete && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={(e) => startEdit(hub, e)} title="Rename hub" className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition">
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                            </button>
                            <button onClick={(e) => confirmDelete(hub._id, e)} title="Delete hub" className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition">
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                            </button>
                          </div>
                        )}
                      </div>
                      {!isEditing && !isConfirmingDelete && (
                        <div className="flex items-center gap-3 mt-2 pl-4">
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            {hub.polygon.length} points
                          </span>
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            {new Date(hub.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      {!isEditing && !isConfirmingDelete && hub.description && (
                        <p className="text-xs text-gray-500 mt-1.5 pl-4 leading-relaxed line-clamp-2">{hub.description}</p>
                      )}
                      {isEditing && (
                        <div className="mt-2 space-y-2">
                          <input autoFocus type="text" value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") cancelEdit(); }} className="w-full border border-blue-400 rounded-lg px-3 py-1.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Hub name" />
                          <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} placeholder="Description (optional)" className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
                          <p className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1.5">Drag polygon vertices on the map to reshape the boundary.</p>
                          <div className="flex gap-2">
                            <button onClick={() => handleRename(hub._id)} disabled={editSaving || !editName.trim()} className="flex-1 bg-blue-600 text-white text-xs font-medium py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">{editSaving ? "Saving…" : "Save"}</button>
                            <button onClick={cancelEdit} className="flex-1 border border-gray-200 text-gray-500 text-xs font-medium py-1.5 rounded-lg hover:bg-gray-50 transition">Cancel</button>
                          </div>
                        </div>
                      )}
                      {isConfirmingDelete && (
                        <div className="mt-2 space-y-2">
                          <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-red-500 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                            <p className="text-xs text-red-700 font-medium">Delete &ldquo;{hub.hubName}&rdquo;?</p>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleDelete(hub._id)} disabled={deleteWorking} className="flex-1 bg-red-500 text-white text-xs font-medium py-1.5 rounded-lg hover:bg-red-600 disabled:opacity-50 transition">{deleteWorking ? "Deleting…" : "Yes, delete"}</button>
                            <button onClick={cancelDelete} className="flex-1 border border-gray-200 text-gray-500 text-xs font-medium py-1.5 rounded-lg hover:bg-gray-50 transition">Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-4 space-y-3">
              <p className="text-xs text-blue-600 font-medium bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                Use the polygon tool on the map to draw your hub area, then fill in the name below.
              </p>
              <div>
                <label htmlFor="hub-name" className="block text-xs font-semibold text-gray-600 mb-1">Hub Name <span className="text-red-500">*</span></label>
                <input id="hub-name" type="text" placeholder="e.g. Mumbai North Hub" value={hubName} onChange={(e) => setHubName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label htmlFor="hub-desc" className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
                <textarea id="hub-desc" rows={3} placeholder="Optional notes…" value={hubDescription} onChange={(e) => setHubDescription(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              {polygon.length > 0 && (
                <div className="flex items-center justify-between text-xs bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-green-700">
                  <span>&#10003; {polygon.length} points drawn</span>
                  <button onClick={handleClear} className="text-red-500 underline ml-2">Clear</button>
                </div>
              )}
              {message && (
                <div className={`text-xs rounded-lg px-3 py-2 font-medium ${message.type === "success" ? "bg-green-100 text-green-800 border border-green-200" : "bg-red-100 text-red-800 border border-red-200"}`}>
                  {message.text}
                </div>
              )}
              <button onClick={handleSave} disabled={saving} className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition">
                {saving ? "Saving…" : "Save Hub"}
              </button>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="p-4 border-t border-gray-100 shrink-0">
          {mode === "view" ? (
            <button onClick={enterCreateMode} className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition">+ Create New Hub</button>
          ) : (
            <button onClick={exitCreateMode} className="w-full border border-gray-300 text-gray-600 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition">&#8592; Back to List</button>
          )}
        </div>
      </aside>

      {/* ── Map ── */}
      <div className="flex-1 relative">
        {isLoaded ? (
          <GoogleMap mapContainerStyle={MAP_CONTAINER_STYLE} center={DEFAULT_CENTER} zoom={5} onLoad={onMapLoad} options={{ streetViewControl: false, mapTypeControlOptions: { position: 3 } }}>
            {hubs.map((hub, idx) => {
              const isCurrentlyEditing = editingId === hub._id;
              return (
                <Polygon
                  key={isCurrentlyEditing ? `${hub._id}-edit` : hub._id}
                  paths={hub.polygon}
                  options={{
                    fillColor: isCurrentlyEditing ? "#F59E0B" : COLORS[idx % COLORS.length],
                    fillOpacity: isCurrentlyEditing ? 0.35 : selectedHub?._id === hub._id ? 0.5 : 0.25,
                    strokeColor: isCurrentlyEditing ? "#D97706" : COLORS[idx % COLORS.length],
                    strokeWeight: isCurrentlyEditing ? 3 : selectedHub?._id === hub._id ? 3 : 2,
                    strokeOpacity: isCurrentlyEditing ? 1 : 0.8,
                    editable: isCurrentlyEditing,
                  }}
                  onLoad={isCurrentlyEditing ? (poly) => { editPolygonRef.current = poly; } : undefined}
                  onClick={() => !isCurrentlyEditing && focusHub(hub)}
                />
              );
            })}

            <DrawingManager
              onLoad={(dm) => { drawingManagerRef.current = dm; }}
              onPolygonComplete={onPolygonComplete}
              options={{ drawingControl: mode === "create", drawingControlOptions: { position: google.maps.ControlPosition.TOP_CENTER, drawingModes: [google.maps.drawing.OverlayType.POLYGON] }, polygonOptions: { fillColor: "#3B82F6", fillOpacity: 0.3, strokeColor: "#1D4ED8", strokeWeight: 2, editable: true } }}
            />
          </GoogleMap>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">Loading map…</div>
        )}
        {/* ── Info Modal ── */}
        {selectedHub && !editingId && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 w-72 bg-white rounded-2xl shadow-2xl overflow-visible">
            {infoModalDeleteConfirm ? (
              <div className="px-5 py-5 space-y-3">
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-red-500 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                  <p className="text-sm font-semibold text-red-700">Delete &ldquo;{selectedHub.hubName}&rdquo;?</p>
                </div>
                <p className="text-xs text-gray-500">This action cannot be undone.</p>
                <div className="flex gap-2">
                  <button
                    disabled={deleteWorking}
                    onClick={async () => { await handleDelete(selectedHub._id); setInfoModalDeleteConfirm(false); setSelectedHub(null); }}
                    className="flex-1 bg-red-500 text-white text-sm font-medium py-2 rounded-xl hover:bg-red-600 disabled:opacity-50 transition"
                  >
                    {deleteWorking ? "Deleting…" : "Yes, delete"}
                  </button>
                  <button onClick={() => setInfoModalDeleteConfirm(false)} className="flex-1 border border-gray-200 text-gray-500 text-sm font-medium py-2 rounded-xl hover:bg-gray-50 transition">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-4 pb-3">
                  <h3 className="text-base font-bold text-gray-900 truncate pr-2">{selectedHub.hubName}</h3>
                  <button onClick={() => { setSelectedHub(null); setInfoModalDeleteConfirm(false); }} className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition text-lg leading-none">&times;</button>
                </div>

                {/* Divider */}
                <div className="border-t border-gray-100" />

                {/* Description body */}
                <div className="px-5 py-3 min-h-14">
                  {selectedHub.description ? (
                    <p className="text-sm text-gray-600 leading-relaxed">{selectedHub.description}</p>
                  ) : (
                    <p className="text-sm text-gray-300 italic">No description</p>
                  )}
                </div>

                {/* Divider */}
                <div className="border-t border-gray-100" />

                {/* Footer: stats + actions */}
                <div className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      {/* area icon */}
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h16v16H4z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4l4 4m8 0l4-4M4 20l4-4m8 0l4 4" />
                      </svg>
                      {computeAreaKm2(selectedHub.polygon)} km²
                    </span>
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      {/* perimeter icon */}
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <rect x="3" y="3" width="18" height="18" rx="1" />
                      </svg>
                      {computePerimeterKm(selectedHub.polygon)} km
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      title="Edit hub"
                      onClick={(e) => { startEdit(selectedHub, e); }}
                      className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                    </button>
                    <button
                      title="Delete hub"
                      onClick={() => setInfoModalDeleteConfirm(true)}
                      className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                    </button>
                  </div>
                </div>
              </>
            )}
            {/* Triangle pointer */}
            <div
              className="absolute -bottom-2.75 left-1/2 -translate-x-1/2"
              style={{ width: 0, height: 0, borderLeft: "12px solid transparent", borderRight: "12px solid transparent", borderTop: "12px solid white" }}
            />
          </div>
        )}

        {!panelOpen && mode === "view" && (
          <button onClick={enterCreateMode} className="md:hidden fixed bottom-20 right-4 z-30 bg-blue-600 text-white text-sm font-semibold px-5 py-3 rounded-full shadow-lg flex items-center gap-2 active:scale-95 transition-transform">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            New Hub
          </button>
        )}
      </div>
    </div>
  );
}
