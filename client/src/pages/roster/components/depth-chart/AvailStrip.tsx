import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { availOutsToIpStr, availRestNeeded, DAY_LABEL } from "../../lib/helpers";
import type { PitcherAvailRow, PitcherSlot } from "../../types";

function AvailTooltipContent({ row, day, slot }: { row: PitcherAvailRow; day: string; slot: PitcherSlot }) {
  if (slot.daysOfRest === 99 || !row.lastPitchedDay) {
    return (
      <div className="text-[10px] space-y-0.5">
        <div className="font-semibold text-green-400">{day}: Fresh</div>
        <div className="text-muted-foreground">No recent appearances</div>
        <div>Full strength — up to <span className="text-green-400 font-bold">{slot.suggestedMaxIP} IP</span></div>
      </div>
    );
  }
  const ip = availOutsToIpStr(row.lastPitchedOuts);
  const restNeeded = availRestNeeded(row.lastPitchedOuts);
  const restHad = slot.daysOfRest;
  const lastDay = DAY_LABEL[row.lastPitchedDay] ?? row.lastPitchedDay;
  if (!slot.available) {
    return (
      <div className="text-[10px] space-y-0.5">
        <div className="font-semibold text-red-400">{day}: Unavailable</div>
        <div>Pitched <span className="font-bold">{ip} IP</span> on {lastDay} ({row.lastPitchedOuts} outs)</div>
        <div>Needs <span className="font-bold">{restNeeded}d</span> rest — only <span className="text-red-400 font-bold">{restHad}d</span> available</div>
      </div>
    );
  }
  if (slot.limited) {
    return (
      <div className="text-[10px] space-y-0.5">
        <div className="font-semibold text-yellow-400">{day}: Limited</div>
        <div>Pitched <span className="font-bold">{ip} IP</span> on {lastDay} ({row.lastPitchedOuts} outs)</div>
        <div>{restHad}d rest received, {restNeeded}d required — capped at <span className="text-yellow-400 font-bold">{slot.suggestedMaxIP} IP</span></div>
      </div>
    );
  }
  return (
    <div className="text-[10px] space-y-0.5">
      <div className="font-semibold text-green-400">{day}: Full strength</div>
      <div>Pitched <span className="font-bold">{ip} IP</span> on {lastDay} ({row.lastPitchedOuts} outs)</div>
      <div>{restHad}d rest received — up to <span className="text-green-400 font-bold">{slot.suggestedMaxIP} IP</span></div>
    </div>
  );
}

export function AvailStrip({ playerId, availMap }: { playerId: string; availMap: Map<string, PitcherAvailRow> }) {
  const row = availMap.get(playerId);
  if (!row) return null;
  const days = ["WED", "FRI", "SAT", "SUN"] as const;
  return (
    <div className="flex gap-1 items-center flex-shrink-0">
      {days.map(d => {
        const s = row.slots[d];
        const avail = s?.available ?? false;
        const limited = s?.limited ?? false;
        const ip = s?.suggestedMaxIP ?? 0;
        const cls = !avail
          ? "border-red-500/50 bg-red-500/10 text-red-400"
          : limited
          ? "border-yellow-400/50 bg-yellow-500/10 text-yellow-300"
          : "border-green-500/50 bg-green-500/10 text-green-400";
        return (
          <Tooltip key={d}>
            <TooltipTrigger asChild>
              <div
                className={`flex flex-col items-center border rounded px-1 py-0.5 cursor-default ${cls}`}
                style={{ minWidth: 34 }}
                data-testid={`avail-strip-${playerId}-${d}`}
              >
                <span className="text-[7px] font-pixel leading-none">{d}</span>
                <span className="text-[8px] font-bold leading-none mt-0.5">
                  {!avail ? "✕" : `${ip}IP`}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[220px]">
              {s ? <AvailTooltipContent row={row} day={d} slot={s} /> : <span className="text-[10px]">No data</span>}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
