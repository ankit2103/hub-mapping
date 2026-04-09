import mongoose, { Schema, Document, Model } from "mongoose";

export interface ILatLng {
  lat: number;
  lng: number;
}

export interface IHub extends Document {
  hubName: string;
  polygon: ILatLng[];
  createdAt: Date;
  updatedAt: Date;
}

const LatLngSchema = new Schema<ILatLng>(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  { _id: false }
);

const HubSchema = new Schema<IHub>(
  {
    hubName: { type: String, required: true, trim: true },
    polygon: { type: [LatLngSchema], required: true, validate: [(arr: ILatLng[]) => arr.length >= 3, "A polygon must have at least 3 points"] },
  },
  { timestamps: true }
);

const Hub: Model<IHub> =
  mongoose.models.Hub ?? mongoose.model<IHub>("Hub", HubSchema);

export default Hub;
