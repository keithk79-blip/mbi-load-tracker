import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BrandMark } from "./components/BrandMark";
import { SessionBar } from "./components/SessionBar";
import { TabBar } from "./components/TabBar";
import { chicagoToday } from "./lib/chicagoDate";
import { useDesktopLayout } from "./lib/layout";
import { replaceRetiredTotalsLocation, replaceTabLocation, tabFromLocation } from "./lib/tabRoute";
import { CallOffsScreen } from "./screens/CallOffsScreen";
import { CustomersScreen } from "./screens/CustomersScreen";
import { DriverScreen } from "./screens/DriverScreen";
import { EditLoadScreen } from "./screens/EditLoadScreen";
import { LogLoadScreen } from "./screens/LogLoadScreen";
import { LoginScreen } from "./screens/LoginScreen";
import { AnalyticsScreen } from "./screens/AnalyticsScreen";
import { SearchScreen } from "./screens/SearchScreen";
import { TodayScreen } from "./screens/TodayScreen";
import { TotalsScreen } from "./screens/TotalsScreen";
import { VacationScreen } from "./screens/VacationScreen";
import { AuthProvider, useAuth } from "./store/AuthContext";
import { CallOffLogProvider } from "./store/CallOffLogContext";
import { CustomerLanesProvider } from "./store/CustomerLanesContext";
import { DailyEodProvider } from "./store/DailyEodContext";
import { DispatchTalliesProvider } from "./store/DispatchTalliesContext";
import { DriverGoneProvider } from "./store/DriverGoneContext";
import { DriverRosterProvider } from "./store/DriverRosterContext";
import { DriversProvider } from "./store/DriversContext";
import { SpecialtyProvider } from "./store/SpecialtyContext";
import { VacationProvider } from "./store/VacationContext";
import { LoadsProvider, useLoads } from "./store/LoadsContext";
import type { TabId } from "./types";

type Overlay =
  | { kind: "log"; truck?: string; date?: string }
  | { kind: "edit"; loadId: string }
  | null;

function wrapOverlay(desktop: boolean, child: ReactNode) {
  if (!desktop) return child;
  return createPortal(
    <div className="modal-backdrop">
      <div className="modal-card">{child}</div>
    </div>,
    document.body,
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { configured, loading, session } = useAuth();
  useLayoutEffect(() => {
    document.body.classList.add("app-ready");
  }, []);
  if (configured && loading) {
    return (
      <div className="screen overlay-screen login-screen">
        <BrandMark size="lg" />
        <p className="field-hint">Signing in…</p>
      </div>
    );
  }
  if (configured && !session) return <LoginScreen />;
  return children;
}

function Shell() {
  const desktop = useDesktopLayout();
  const { findById } = useLoads();
  const [tab, setTab] = useState<TabId>(
    () => tabFromLocation(window.location) ?? "today",
  );
  const [feedDate, setFeedDate] = useState(chicagoToday);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [justEditedId, setJustEditedId] = useState<string | null>(null);

  const editingLoad =
    overlay?.kind === "edit" ? findById(overlay.loadId) : undefined;
  const view: Overlay =
    overlay?.kind === "edit" && !editingLoad ? null : overlay;

  const afterSave = (id: string, date?: string) => {
    setJustEditedId(id);
    setOverlay(null);
    if (date) setFeedDate(date);
    if (tab === "analytics" || tab === "vacation" || tab === "driver" || tab === "calloffs" || tab === "customers") return;
    setTab("today");
  };

  useEffect(() => {
    const apply = () => {
      if (replaceRetiredTotalsLocation(window.location)) {
        setTab("today");
        return;
      }
      const fromUrl = tabFromLocation(window.location);
      if (fromUrl) setTab(fromUrl);
    };
    apply();
    window.addEventListener("popstate", apply);
    window.addEventListener("hashchange", apply);
    return () => {
      window.removeEventListener("popstate", apply);
      window.removeEventListener("hashchange", apply);
    };
  }, []);

  function onTabChange(next: TabId) {
    setTab(next);
    replaceTabLocation(next);
  }

  const main = (
    <>
      {desktop ? (
        <header className="desk-topbar">
          <div className="desk-topbar-brand">
            <BrandMark size="lg" />
            <div>
              <p className="eyebrow">Keith's Load Tracker</p>
              <h1 className="desk-brand">Load Tracker</h1>
            </div>
          </div>
          <p className="desk-sub">Shared crew log · America/Chicago</p>
        </header>
      ) : null}

      <SessionBar />

      <div className={desktop ? "desk-main" : "phone-stack"}>
        {desktop ? (
          <TabBar vertical tab={tab} onChange={onTabChange} />
        ) : null}

        <div className="phone-body">
          {tab === "today" && desktop ? (
            <div className="desktop-split">
              <TodayScreen
                date={feedDate}
                onDateChange={setFeedDate}
                justEditedId={justEditedId}
                onLog={(date) => setOverlay({ kind: "log", date })}
                onEdit={(loadId) => setOverlay({ kind: "edit", loadId })}
                showDayPicker={false}
              />
              <TotalsScreen
                embedded
                date={feedDate}
                onDateChange={setFeedDate}
                onEdit={(loadId) => setOverlay({ kind: "edit", loadId })}
                onLog={(date) => setOverlay({ kind: "log", date })}
              />
            </div>
          ) : null}

          {tab === "today" && !desktop ? (
            <TodayScreen
              date={feedDate}
              onDateChange={setFeedDate}
              justEditedId={justEditedId}
              onLog={(date) => setOverlay({ kind: "log", date })}
              onEdit={(loadId) => setOverlay({ kind: "edit", loadId })}
              showDayPicker
            />
          ) : null}

          {tab === "trucks" ? (
            <SearchScreen
              editingId={view?.kind === "edit" ? view.loadId : null}
              onEdit={(loadId) => setOverlay({ kind: "edit", loadId })}
              onLogForTruck={(truck, date) =>
                setOverlay({ kind: "log", truck, date })
              }
            />
          ) : null}

          {tab === "analytics" ? <AnalyticsScreen /> : null}

          {tab === "driver" ? <DriverScreen /> : null}

          {tab === "customers" ? <CustomersScreen /> : null}

          {tab === "calloffs" ? <CallOffsScreen /> : null}

          {tab === "vacation" ? <VacationScreen /> : null}
        </div>
      </div>

      {!desktop ? <TabBar tab={tab} onChange={onTabChange} /> : null}
    </>
  );

  return (
    <div className={desktop ? "app-shell is-desktop" : "app-shell"}>
      <div className="phone">
        {desktop || !view ? main : null}

        {view?.kind === "log"
          ? wrapOverlay(
              desktop,
              <LogLoadScreen
                initialTruck={view.truck}
                date={view.date}
                onCancel={() => setOverlay(null)}
                onSaved={afterSave}
              />,
            )
          : null}

        {view?.kind === "edit" && editingLoad
          ? wrapOverlay(
              desktop,
              <EditLoadScreen
                load={editingLoad}
                onCancel={() => setOverlay(null)}
                onSaved={afterSave}
                onDeleted={() => {
                  setJustEditedId(null);
                  setOverlay(null);
                }}
              />,
            )
          : null}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <LoadsProvider>
        <SpecialtyProvider>
          <VacationProvider>
            <DriverRosterProvider>
              <DriverGoneProvider>
                <CallOffLogProvider>
                  <DriversProvider>
                    <CustomerLanesProvider>
                    <DailyEodProvider>
                    <DispatchTalliesProvider>
                      <Gate>
                        <Shell />
                      </Gate>
                    </DispatchTalliesProvider>
                    </DailyEodProvider>
                    </CustomerLanesProvider>
                  </DriversProvider>
                </CallOffLogProvider>
              </DriverGoneProvider>
            </DriverRosterProvider>
          </VacationProvider>
        </SpecialtyProvider>
      </LoadsProvider>
    </AuthProvider>
  );
}
