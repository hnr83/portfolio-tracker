import { useEffect, useRef, useState } from "react";
import PlannerLegacy from "./PlannerLegacy";
import PlanVsRealPanel from "./PlanVsRealPanel";

function isScenarioSelect(select) {
  return Array.from(select?.options || []).some(
    (option) => option.textContent?.trim() === "Escenario actual"
  );
}

export default function PlannerView(props) {
  const legacyRef = useRef(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState("");

  useEffect(() => {
    function syncScenarioSelection() {
      const selects = legacyRef.current?.querySelectorAll("select") || [];
      const scenarioSelect = Array.from(selects).find(isScenarioSelect);
      const nextId = scenarioSelect?.value || "";
      setSelectedScenarioId((current) => (current === nextId ? current : nextId));
    }

    syncScenarioSelection();
    const timer = window.setInterval(syncScenarioSelection, 500);
    return () => window.clearInterval(timer);
  }, []);

  function handleChangeCapture(event) {
    if (event.target?.tagName === "SELECT" && isScenarioSelect(event.target)) {
      setSelectedScenarioId(event.target.value || "");
    }
  }

  return (
    <div className="space-y-6">
      <div ref={legacyRef} onChangeCapture={handleChangeCapture}>
        <PlannerLegacy {...props} />
      </div>
      <PlanVsRealPanel scenarioId={selectedScenarioId} />
    </div>
  );
}
