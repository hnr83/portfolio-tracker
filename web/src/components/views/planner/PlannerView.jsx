import PlannerLegacy from "./PlannerLegacy";
import PlanVsRealPanel from "./PlanVsRealPanel";

export default function PlannerView(props) {
  return (
    <div className="space-y-6">
      <PlannerLegacy {...props} />
      <PlanVsRealPanel />
    </div>
  );
}
