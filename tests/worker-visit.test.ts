import { describe, expect, it } from "vitest";
import {
  addressFor,
  cityLine,
  coordinatePair,
  formatCoordinate,
  haversineM,
  mapLinks,
  sortVisits,
  statusLabel,
  workerStatus,
} from "../packages/domain/src/worker-visit";

describe("status wording", () => {
  it("maps every stored status to one of three worker labels", () => {
    expect(workerStatus("assigned")).toBe("to_visit");
    expect(workerStatus("server_received")).toBe("submitted");
    expect(workerStatus("approved")).toBe("submitted");
    expect(workerStatus("resurvey_requested")).toBe("needs_revisit");
    expect(workerStatus("rejected")).toBe("needs_revisit");
  });
  it("never shows a raw code, even for an unknown status", () => {
    expect(statusLabel("some_new_status", "en")).toBe("To visit");
    expect(statusLabel("assigned", "en")).toBe("To visit");
    expect(statusLabel("resurvey_requested", "en")).toBe("Needs revisit");
    expect(statusLabel("server_received", "ar")).toBe("أُرسلت");
  });
});

describe("city and address lines", () => {
  it("has no dangling separator when the area is missing", () => {
    expect(cityLine("Hit", "")).toBe("Hit");
    expect(cityLine("Hit", null)).toBe("Hit");
    expect(cityLine("Baghdad", "Karrada")).toBe("Baghdad · Karrada");
  });
  it("prefers the worker's address, then the imported one, then reports missing", () => {
    expect(addressFor("Street 5, near the school", "Imported text")).toEqual({ text: "Street 5, near the school", source: "worker" });
    expect(addressFor("", "Al Hariri School")).toEqual({ text: "Al Hariri School", source: "import" });
    expect(addressFor(null, "  ")).toEqual({ text: null, source: "missing" });
  });
});

describe("coordinates and maps", () => {
  it("formats hemisphere and copyable pairs", () => {
    expect(formatCoordinate(33.3152, "N", "S")).toBe("33.315200° N");
    expect(formatCoordinate(-12.5, "N", "S")).toBe("12.500000° S");
    expect(formatCoordinate(null, "N", "S")).toBeNull();
    expect(coordinatePair(33.3152, 44.3661)).toBe("33.315200, 44.366100");
  });
  it("offers Google Maps everywhere, Apple Maps on iPhone, and the device chooser on Android", () => {
    expect(mapLinks(33, 44, "ios").map((l) => l.id)).toEqual(["google", "apple"]);
    expect(mapLinks(33, 44, "android").map((l) => l.id)).toEqual(["google", "device"]);
    expect(mapLinks(33, 44, "android").find((l) => l.id === "device")!.href).toBe("geo:33,44?q=33,44");
    expect(mapLinks(33, 44, "other").map((l) => l.id)).toEqual(["google"]);
  });
  it("measures distance between two points", () => {
    expect(haversineM({ latitude: 33, longitude: 44 }, { latitude: 33, longitude: 44 })).toBe(0);
    const km = haversineM({ latitude: 33.3152, longitude: 44.3661 }, { latitude: 33.4, longitude: 44.5 }) / 1000;
    expect(km).toBeGreaterThan(15);
    expect(km).toBeLessThan(16);
  });
});

describe("sorting", () => {
  const visits = [
    { code: "B", due_date: "2026-12-31", latitude: 33.4, longitude: 44.5 },
    { code: "A", due_date: "2026-12-10", latitude: 33.3153, longitude: 44.3662 },
    { code: "C", due_date: "2026-12-01", latitude: null, longitude: null },
  ];
  it("sorts by due date, then code", () => {
    expect(sortVisits(visits, "due", null).map((v) => v.code)).toEqual(["C", "A", "B"]);
  });
  it("sorts nearest first and puts visits without coordinates last", () => {
    const near = sortVisits(visits, "nearest", { latitude: 33.3152, longitude: 44.3661 }).map((v) => v.code);
    expect(near).toEqual(["A", "B", "C"]);
  });
  it("falls back to due date when there is no position", () => {
    expect(sortVisits(visits, "nearest", null).map((v) => v.code)).toEqual(["C", "A", "B"]);
  });
});
