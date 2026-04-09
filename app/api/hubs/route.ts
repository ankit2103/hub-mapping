import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Hub from "@/models/Hub";

export async function GET() {
  try {
    await connectDB();
    const hubs = await Hub.find({}).lean();
    return NextResponse.json({ success: true, data: hubs });
  } catch (error) {
    console.error("GET /api/hubs error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch hubs" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { hubName, polygon } = body;

    if (!hubName || typeof hubName !== "string" || hubName.trim() === "") {
      return NextResponse.json(
        { success: false, message: "hubName is required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(polygon) || polygon.length < 3) {
      return NextResponse.json(
        { success: false, message: "polygon must have at least 3 points" },
        { status: 400 }
      );
    }

    const isValidPolygon = polygon.every(
      (p) =>
        typeof p === "object" &&
        typeof p.lat === "number" &&
        typeof p.lng === "number"
    );

    if (!isValidPolygon) {
      return NextResponse.json(
        { success: false, message: "Each polygon point must have numeric lat and lng" },
        { status: 400 }
      );
    }

    await connectDB();
    const hub = await Hub.create({ hubName: hubName.trim(), polygon });
    return NextResponse.json({ success: true, data: hub }, { status: 201 });
  } catch (error) {
    console.error("POST /api/hubs error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to save hub" },
      { status: 500 }
    );
  }
}
