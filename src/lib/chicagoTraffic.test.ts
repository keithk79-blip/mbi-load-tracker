import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchChicagoTraffic,
  fetchSigalertFeedViaHttp,
  isConstructionType,
  isHotCorridor,
  isTauriDesktop,
  parseSigalertTrafficData,
  primaryRoad,
  severityLabel,
  SIGALERT_PAGES_PATH,
  sigalertDataUrls,
  snapshotFromSigalertIncidents,
  totalAlerts,
  truncateTrafficError,
} from "./chicagoTraffic";

const MAP_HTML = `{
  "trafficData": [{"id":"Chicago","region":"Chicago","path":"Chicago/3~j","cacheBuster":31971508,"rootPath":"/Data","maxDataAgeMS":300000}]
}`;

describe("parseSigalertTrafficData", () => {
  it("reads rotating path and cacheBuster from Map.asp JSON", () => {
    const meta = parseSigalertTrafficData(MAP_HTML);
    expect(meta.path).toBe("Chicago/3~j");
    expect(meta.cacheBuster).toBe(31971508);
    expect(sigalertDataUrls(meta)[0]).toBe(
      "https://cdn-dynamic.sigalert.com/Data/Chicago/3~j/ChicagoData.json?cb=31971508",
    );
  });
});

describe("isHotCorridor", () => {
  it("matches named and numbered corridors on the primary road", () => {
    expect(isHotCorridor("I-57 North between Sibley Blvd and Dixie Hwy")).toBe(true);
    expect(isHotCorridor("Kennedy (I-90/94) Express Lanes East between Ohio St and the split")).toBe(
      true,
    );
    expect(isHotCorridor("Bishop Ford (I-94) East between Steel Bridge and US-6")).toBe(true);
    expect(isHotCorridor("Eisenhower (I-290) West at I-294/Exit 15A")).toBe(true);
    expect(isHotCorridor("I-90/Chicago Skwy")).toBe(true);
  });

  it("ignores cross-streets and lookalike names", () => {
    expect(primaryRoad("Hawley Rd at I-94")).toBe("Hawley Rd");
    expect(isHotCorridor("Hawley Rd at I-94")).toBe(false);
    expect(
      isHotCorridor("LW Besinger Dr between Ball Ave and IL-25/J F Kennedy Memorial Dr"),
    ).toBe(false);
    expect(isHotCorridor("Route 23 between Etna Rd and Stevenson Rd")).toBe(false);
    expect(isHotCorridor("Indianapolis Blvd between I-90/Chicago Skwy and US-41")).toBe(false);
  });
});

describe("snapshotFromSigalertIncidents", () => {
  const rows = [
    [275, 1001, "2:22 PM", "US 12 between IL-59 and N Main St", "Resurfacing work", 0, 0, 0, "2026-03-19T19:22:15", "2026-09-01T15:19:34"],
    [1, 2002, "6:01 PM", "I-57 North between Sibley Blvd and Dixie Hwy", "Closed for accident investigation", 100, 0, 0, "2026-09-07T23:01:00", "2026-09-07T23:05:00"],
    [2, 2002, "6:01 PM", "I-57 North at Dixie Hwy", "Closed for accident investigation", 100, 0, 0, "2026-09-07T23:01:00", "2026-09-07T23:05:00"],
    [3, 3003, "2:23 PM", "Bishop Ford (I-94) East between Steel Bridge and US-6", "Roadway reduced to two lanes", 0, 0, 0, "2026-09-07T19:23:00", "2026-09-07T19:23:00"],
    [4, 4004, "6:40 PM", "Bishop Ford (I-94) West at IL-83", "Exit ramp closed due to construction", 0, 0, 0, "2026-09-07T18:40:00", "2026-09-07T18:40:00"],
    [5, 5005, "1:51 PM", "I-80 East between I-180 and IL-89", "Resurfacing work. Road reduced to one lane", 50, 0, 0, "2026-09-07T18:51:00", "2026-09-07T18:51:00"],
  ];

  it("dedupes, sorts severe first, and splits construction-like types", () => {
    const snap = snapshotFromSigalertIncidents(rows, 12);
    expect(snap.errors).toEqual([]);
    expect(snap.incidents.map((a) => a.title)).toEqual([
      "I-57 North between Sibley Blvd and Dixie Hwy",
      "Bishop Ford (I-94) East between Steel Bridge and US-6",
    ]);
    expect(snap.incidents[0].severity).toBe("severe");
    expect(snap.incidents[0].detail).toMatch(/Severe/);
    expect(snap.construction.map((a) => a.id)).toEqual([
      "construction-5005",
      "construction-4004",
    ]);
    expect(isConstructionType("Exit ramp closed due to construction")).toBe(true);
    expect(totalAlerts(snap)).toBe(4);
  });

  it("caps combined alerts", () => {
    const many = Array.from({ length: 20 }, (_, i) => [
      i,
      9000 + i,
      "1:00 PM",
      `I-90 East at Exit ${i}`,
      "Road construction. Left lane closed",
      0,
      0,
      0,
      "2026-09-07T18:00:00",
      "2026-09-07T18:00:00",
    ]);
    const snap = snapshotFromSigalertIncidents(many, 10);
    expect(snap.incidents).toHaveLength(0);
    expect(snap.construction).toHaveLength(10);
  });
});

describe("helpers", () => {
  it("maps SigAlert severity scores", () => {
    expect(severityLabel(100)).toBe("severe");
    expect(severityLabel(50)).toBe("moderate");
    expect(severityLabel(0)).toBe("minor");
  });

  it("truncates fetch errors for the card", () => {
    const long = "x".repeat(200);
    expect(truncateTrafficError(long).endsWith("…")).toBe(true);
    expect(truncateTrafficError(long).length).toBeLessThanOrEqual(180);
  });
});

describe("web /api/sigalert path", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads the Pages proxy and does not invoke Tauri", async () => {
    expect(isTauriDesktop()).toBe(false);
    const invoke = vi.fn();
    vi.stubGlobal("__TAURI_INTERNALS__", undefined);
    const incidents = [
      [1, 2002, "6:01 PM", "I-57 North between Sibley Blvd and Dixie Hwy", "Closed for accident investigation", 100, 0, 0, "", ""],
      [2, 9999, "1:00 PM", "Hawley Rd at I-94", "Accident", 80, 0, 0, "", ""],
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toBe(SIGALERT_PAGES_PATH);
      expect(url.startsWith("https://")).toBe(false);
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            region: "Chicago",
            path: "Chicago/3~j",
            cacheBuster: 31971508,
            incidents,
          }),
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    const snap = await fetchChicagoTraffic();
    expect(invoke).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(SIGALERT_PAGES_PATH);
    expect(snap.errors).toEqual([]);
    expect(snap.incidents.map((a) => a.title)).toEqual([
      "I-57 North between Sibley Blvd and Dixie Hwy",
    ]);
    expect(isHotCorridor(snap.incidents[0]!.title)).toBe(true);
  });
});

describe("live SigAlert Chicago feed", () => {
  it("returns filtered hot-corridor incidents from the rotating path", async () => {
    const feed = await fetchSigalertFeedViaHttp();
    expect(feed.region).toBe("Chicago");
    expect(feed.path).toMatch(/^Chicago\//);
    expect(Array.isArray(feed.incidents)).toBe(true);
    const snap = snapshotFromSigalertIncidents(feed.incidents);
    expect(snap.errors).toEqual([]);
    // Night can be quiet; parser must still produce a valid snapshot.
    expect(totalAlerts(snap)).toBeGreaterThanOrEqual(0);
    expect(totalAlerts(snap)).toBeLessThanOrEqual(12);
    if (totalAlerts(snap) === 0) {
      console.warn("SigAlert Chicago hot-corridor list is empty (quiet period).");
    } else {
      console.log(
        `SigAlert live: ${snap.incidents.length} incidents, ${snap.construction.length} construction (path ${feed.path})`,
      );
      for (const row of [...snap.incidents, ...snap.construction]) {
        expect(isHotCorridor(row.title)).toBe(true);
      }
    }
  }, 30_000);
});
