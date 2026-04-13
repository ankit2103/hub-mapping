import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Hub from "@/models/Hub";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { hubName, description, polygon } = body;

    if (!hubName || typeof hubName !== "string" || hubName.trim() === "") {
      return NextResponse.json(
        { success: false, message: "hubName is required" },
        { status: 400 }
      );
    }

    const update: Record<string, unknown> = { hubName: hubName.trim() };
    if (typeof description === "string") update.description = description.trim();
    if (Array.isArray(polygon) && polygon.length >= 3) {
      const isValid = polygon.every(
        (p: unknown) =>
          typeof p === "object" && p !== null &&
          typeof (p as Record<string, unknown>).lat === "number" &&
          typeof (p as Record<string, unknown>).lng === "number"
      );
      if (!isValid) {
        return NextResponse.json(
          { success: false, message: "Each polygon point must have numeric lat and lng" },
          { status: 400 }
        );
      }
      update.polygon = polygon;
    }

    await connectDB();
    const hub = await Hub.findByIdAndUpdate(
      id,
      update,
      { new: true }
    );

    if (!hub) {
      return NextResponse.json(
        { success: false, message: "Hub not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: hub });
  } catch (error) {
    console.error("PATCH /api/hubs/[id] error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update hub" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    await connectDB();
    const hub = await Hub.findByIdAndDelete(id);

    if (!hub) {
      return NextResponse.json(
        { success: false, message: "Hub not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/hubs/[id] error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete hub" },
      { status: 500 }
    );
  }
}
